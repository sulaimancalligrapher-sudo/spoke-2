import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Video,
  Camera,
  CameraOff,
  Square,
  UploadCloud,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Mic,
  Smartphone,
  Monitor,
  RotateCw,
} from 'lucide-react';
import { MarkingConfig } from '../../types';
import {
  toCloudinaryMp4Url,
  uploadMarkingMediaToDrive,
  uploadVideoToCloudinary,
} from '../../utils/markingSheets';

interface MarkingVideoRecorderProps {
  markingConfig: MarkingConfig;
  webhookUrl: string;
  existingVideoUrl?: string;
  onVideoUploaded: (url: string) => void;
  onRemoveExistingVideo?: () => void;
  title?: string;
  autoClearAfterUpload?: boolean;
}

const MAX_VIDEO_SECONDS = 240; // 4 Minutes max per clip
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB safety cap

export const MarkingVideoRecorder: React.FC<MarkingVideoRecorderProps> = ({
  markingConfig,
  webhookUrl,
  existingVideoUrl,
  onVideoUploaded,
  onRemoveExistingVideo,
  title = 'تسجيل فيديو بالكاميرا أو OBS Virtual Camera',
  autoClearAfterUpload = false,
}) => {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(MAX_VIDEO_SECONDS);

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string>(existingVideoUrl || '');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setUploadedUrl(existingVideoUrl || '');
  }, [existingVideoUrl]);

  const playTimerBeep = (freq = 800, duration = 0.14, count = 1) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      for (let i = 0; i < count; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const startAt = ctx.currentTime + i * (duration + 0.08);
        osc.frequency.setValueAtTime(freq, startAt);
        gain.gain.setValueAtTime(0.18, startAt);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + duration);
      }
    } catch {}
  };

  const stopCameraStream = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((t) => t.stop());
      activeStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setPreviewOpen(false);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter((d) => d.kind === 'videoinput');
      const auds = all.filter((d) => d.kind === 'audioinput');
      setCameras(cams);
      setMics(auds);

      setSelectedCameraId((prev) => {
        if (prev && cams.some((c) => c.deviceId === prev)) return prev;
        const obsCam = cams.find((c) => /obs/i.test(c.label));
        return obsCam?.deviceId || cams[0]?.deviceId || '';
      });
      setSelectedMicId((prev) => {
        if (prev && auds.some((a) => a.deviceId === prev)) return prev;
        return auds[0]?.deviceId || '';
      });
    } catch {}
  }, []);

  useEffect(() => {
    refreshDevices();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopCameraStream();
    };
  }, [refreshDevices, stopCameraStream]);

  const openCameraPreview = async (
    overrideCamId?: string,
    overrideMicId?: string,
    overrideOrientation?: 'horizontal' | 'vertical',
    overrideFacing?: 'user' | 'environment'
  ) => {
    setErrorMsg(null);
    stopCameraStream();

    const camId = overrideCamId !== undefined ? overrideCamId : selectedCameraId;
    const micId = overrideMicId !== undefined ? overrideMicId : selectedMicId;
    const targetOrient = overrideOrientation ?? orientation;
    const targetFacing = overrideFacing ?? facingMode;
    const isVert = targetOrient === 'vertical';

    const videoConstraintPrimary: MediaTrackConstraints = camId
      ? {
          deviceId: { exact: camId },
          width: { ideal: isVert ? 1080 : 1920 },
          height: { ideal: isVert ? 1920 : 1080 },
          aspectRatio: { ideal: isVert ? 9 / 16 : 16 / 9 },
        }
      : {
          facingMode: { ideal: targetFacing },
          width: { ideal: isVert ? 1080 : 1920 },
          height: { ideal: isVert ? 1920 : 1080 },
          aspectRatio: { ideal: isVert ? 9 / 16 : 16 / 9 },
        };

    const attempts: MediaStreamConstraints[] = [
      { video: videoConstraintPrimary, audio: micId ? { deviceId: { exact: micId } } : true },
      {
        video: camId
          ? { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      },
      { video: true, audio: true },
    ];

    let stream: MediaStream | null = null;
    let lastErr: any = null;
    for (const constraint of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        if (stream) break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!stream) {
      setErrorMsg(
        lastErr?.message ||
          'تعذر تشغيل الكاميرا أو الميكروفون. تأكد من تشغيل كاميرا OBS أو منح صلاحية الكاميرا للمتصفح.'
      );
      return null;
    }

    activeStreamRef.current = stream;
    setPreviewOpen(true);
    await refreshDevices();

    window.setTimeout(() => {
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play().catch(() => {});
      }
    }, 40);

    return stream;
  };

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = async () => {
    setErrorMsg(null);
    setRecordedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    let stream = activeStreamRef.current;
    if (!stream || stream.getVideoTracks().every((t) => t.readyState !== 'live')) {
      stream = await openCameraPreview();
    }
    if (!stream) return;

    try {
      const preferredMime = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a')
        ? 'video/mp4;codecs=avc1,mp4a'
        : MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const mr = new MediaRecorder(stream, {
        mimeType: preferredMime,
        videoBitsPerSecond: 2_500_000,
      });

      chunksRef.current = [];
      let totalBytes = 0;

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          totalBytes += ev.data.size;
          if (totalBytes >= MAX_VIDEO_BYTES && mr.state === 'recording') {
            playTimerBeep(1100, 0.35, 2);
            stopRecording();
            setErrorMsg('تم إيقاف التسجيل تلقائياً عند الحد الأقصى الحجمي (80 MB) لضمان سرعة الرفع.');
          }
        }
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/mp4' });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      };

      mediaRecorderRef.current = mr;
      mr.start(350);
      setIsRecording(true);
      setCountdown(MAX_VIDEO_SECONDS);

      if (timerRef.current) window.clearInterval(timerRef.current);
      let rem = MAX_VIDEO_SECONDS;
      timerRef.current = window.setInterval(() => {
        rem -= 1;
        setCountdown(rem);

        if (rem === 30) playTimerBeep(650, 0.22, 1);
        else if (rem === 20) playTimerBeep(750, 0.18, 2);
        else if (rem === 10) playTimerBeep(900, 0.16, 2);
        else if (rem <= 5 && rem > 0) playTimerBeep(1050, 0.12, 1);

        if (rem <= 0) {
          playTimerBeep(1200, 0.35, 1);
          stopRecording();
        }
      }, 1000);
    } catch (err: any) {
      setIsRecording(false);
      setErrorMsg(err?.message || 'تعذر بدء تسجيل الفيديو من الكاميرا.');
    }
  };

  const handleUploadRecordedVideo = async () => {
    if (!recordedBlob) return;
    setErrorMsg(null);
    setUploading(true);
    setUploadProgress(5);

    const hasCloudinary =
      Boolean(markingConfig.cloudinaryCloudName?.trim()) &&
      Boolean(markingConfig.cloudinaryUploadPreset?.trim());

    try {
      if (hasCloudinary) {
        const res = await uploadVideoToCloudinary(recordedBlob, markingConfig, (pct) =>
          setUploadProgress(pct)
        );
        if (res.success && (res.mp4Url || res.url)) {
          const finalUrl = res.mp4Url || res.url || '';
          onVideoUploaded(finalUrl);
          if (autoClearAfterUpload) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setRecordedBlob(null);
            setUploadedUrl('');
          } else {
            setUploadedUrl(finalUrl);
          }
          setUploading(false);
          return;
        }
        setErrorMsg(res.error || 'تعذر الرفع إلى Cloudinary.');
        setUploading(false);
        return;
      }

      if (recordedBlob.size > 10 * 1024 * 1024) {
        setErrorMsg(
          'حجم الفيديو كبير للرفع المباشر إلى Drive. يرجى ضبط حساب Cloudinary في إعدادات التصحيح لرفع الفيديو بسرعة وبصيغة MP4.'
        );
        setUploading(false);
        return;
      }

      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsDataURL(recordedBlob);
      });
      setUploadProgress(55);
      const driveRes = await uploadMarkingMediaToDrive(webhookUrl, {
        mediaType: 'video',
        base64Data: b64,
        fileName: `camera_correction_${Date.now()}`,
      });
      if (driveRes.success && driveRes.url) {
        setUploadProgress(100);
        onVideoUploaded(driveRes.url);
        if (autoClearAfterUpload) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
          setRecordedBlob(null);
          setUploadedUrl('');
        } else {
          setUploadedUrl(driveRes.url);
        }
      } else {
        setErrorMsg(driveRes.error || 'تعذر رفع الفيديو إلى Google Drive.');
      }
    } finally {
      setUploading(false);
    }
  };

  const hasCloudinary =
    Boolean(markingConfig.cloudinaryCloudName?.trim()) &&
    Boolean(markingConfig.cloudinaryUploadPreset?.trim());

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      {/* Header + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-indigo-600" />
            <span>{title}</span>
          </div>
          <div className="text-[11px] text-slate-500 font-semibold">
            {hasCloudinary
              ? `Cloudinary (${markingConfig.cloudinaryCloudName}) · حد أقصى 4 دقائق / 80 MB مع تنبيهات صوتية`
              : 'ملاحظة: Cloudinary غير مضبوط (سيتم حفظ المقاطع الصغيرة عبر Google Drive)'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!previewOpen ? (
            <button
              type="button"
              disabled={isRecording}
              onClick={() => openCameraPreview()}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-emerald-600" />
              <span>تشغيل الكاميرا / OBS</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isRecording}
              onClick={stopCameraStream}
              className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <CameraOff className="w-3.5 h-3.5 text-rose-600" />
              <span>إغلاق الكاميرا</span>
            </button>
          )}

          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              <span>{recordedBlob ? 'تسجيل جديد' : 'بدء تسجيل الفيديو'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="px-3.5 py-1.5 rounded-xl bg-slate-950 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
              <span className="font-mono tabular-nums">إيقاف (متبقي {fmtTime(countdown)})</span>
            </button>
          )}
        </div>
      </div>

      {/* Orientation Switcher (16:9 / 9:16) + Flip + Device Selectors */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isRecording}
            onClick={() => {
              setOrientation('horizontal');
              if (previewOpen) openCameraPreview(selectedCameraId, selectedMicId, 'horizontal');
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
              orientation === 'horizontal'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>أفقي 16:9</span>
          </button>
          <button
            type="button"
            disabled={isRecording}
            onClick={() => {
              setOrientation('vertical');
              if (previewOpen) openCameraPreview(selectedCameraId, selectedMicId, 'vertical');
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
              orientation === 'vertical'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>عمودي 9:16</span>
          </button>
        </div>

        <button
          type="button"
          disabled={isRecording}
          onClick={() => {
            const nextF = facingMode === 'user' ? 'environment' : 'user';
            setFacingMode(nextF);
            setSelectedCameraId('');
            if (previewOpen) openCameraPreview('', selectedMicId, orientation, nextF);
          }}
          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          <RotateCw className="w-3 h-3 text-indigo-600" />
          <span>{facingMode === 'user' ? 'تبديل للخلفية' : 'تبديل للأمامية'}</span>
        </button>
      </div>

      {/* Camera & Microphone Device Dropdowns (OBS Virtual Camera / Webcam) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <select
            disabled={isRecording}
            value={selectedCameraId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedCameraId(nextId);
              if (previewOpen) openCameraPreview(nextId, selectedMicId);
            }}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-bold text-slate-800"
          >
            {cameras.length === 0 ? (
              <option value="">الكاميرا الافتراضية / OBS</option>
            ) : (
              cameras.map((cam, idx) => (
                <option key={cam.deviceId || idx} value={cam.deviceId}>
                  {cam.label || `كاميرا ${idx + 1}`}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            disabled={isRecording}
            onClick={refreshDevices}
            className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
            title="تحديث قائمة الكاميرات (لاكتشاف كاميرا OBS)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <Mic className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <select
            disabled={isRecording}
            value={selectedMicId}
            onChange={(e) => {
              const nextMic = e.target.value;
              setSelectedMicId(nextMic);
              if (previewOpen) openCameraPreview(selectedCameraId, nextMic);
            }}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-bold text-slate-800"
          >
            {mics.length === 0 ? (
              <option value="">الميكروفون الافتراضي</option>
            ) : (
              mics.map((m, idx) => (
                <option key={m.deviceId || idx} value={m.deviceId}>
                  {m.label || `ميكروفون ${idx + 1}`}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Live Camera Preview Feed */}
      {previewOpen && (
        <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex justify-center">
          <div
            className={
              orientation === 'horizontal'
                ? 'w-full aspect-video max-h-64'
                : 'w-44 aspect-[9/16] max-h-72'
            }
          >
            <video
              ref={liveVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
          {isRecording && (
            <div
              className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-white text-[11px] font-mono font-extrabold tabular-nums ${
                countdown <= 10 ? 'bg-amber-600' : 'bg-rose-600'
              }`}
            >
              REC · {fmtTime(countdown)}
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Recorded Clip Preview & Upload Button */}
      {previewUrl && recordedBlob && (
        <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
          <video
            src={previewUrl}
            controls
            playsInline
            className="w-full max-h-60 rounded-xl bg-slate-950"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-600 tabular-nums">
              الحجم: {(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setRecordedBlob(null);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف</span>
              </button>

              <button
                type="button"
                disabled={uploading}
                onClick={handleUploadRecordedVideo}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="tabular-nums">جاري الرفع ({uploadProgress}%)</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>{hasCloudinary ? 'رفع وإرفاق الفيديو (Cloudinary)' : 'رفع الفيديو إلى Drive'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadedUrl && !autoClearAfterUpload && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-emerald-900">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>تم رفع فيديو الكاميرا وإرفاقه</span>
            </span>
            <div className="flex items-center gap-2">
              <a
                href={toCloudinaryMp4Url(uploadedUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-800 underline"
              >
                <span>معاينة</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {onRemoveExistingVideo && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadedUrl('');
                    onRemoveExistingVideo();
                  }}
                  className="text-rose-700 hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>إزالة</span>
                </button>
              )}
            </div>
          </div>
          {!previewUrl && (
            <video
              src={toCloudinaryMp4Url(uploadedUrl)}
              controls
              playsInline
              className="w-full max-h-52 rounded-xl bg-slate-950"
            />
          )}
        </div>
      )}
    </div>
  );
};
