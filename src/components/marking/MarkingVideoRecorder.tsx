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
  title?: string;
  autoClearAfterUpload?: boolean;
}

export const MarkingVideoRecorder: React.FC<MarkingVideoRecorderProps> = ({
  markingConfig,
  webhookUrl,
  existingVideoUrl,
  onVideoUploaded,
  title = 'تسجيل فيديو بالكاميرا أو OBS Virtual Camera',
  autoClearAfterUpload = false,
}) => {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [seconds, setSeconds] = useState<number>(0);

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
        // Prefer OBS Virtual Camera automatically if detected
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

  const openCameraPreview = async (overrideCamId?: string, overrideMicId?: string) => {
    setErrorMsg(null);
    stopCameraStream();
    try {
      const camId = overrideCamId !== undefined ? overrideCamId : selectedCameraId;
      const micId = overrideMicId !== undefined ? overrideMicId : selectedMicId;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: camId
          ? { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: micId ? { deviceId: { exact: micId } } : true,
      });

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
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'تعذر تشغيل الكاميرا أو الميكروفون. تأكد من تشغيل كاميرا OBS أو منح صلاحية الكاميرا للمتصفح.'
      );
      return null;
    }
  };

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
      const preferredMime = MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const mr = new MediaRecorder(stream, {
        mimeType: preferredMime,
        videoBitsPerSecond: 1_800_000,
      });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'video/webm' });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      };
      mediaRecorderRef.current = mr;
      mr.start(1000);
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      setIsRecording(false);
      setErrorMsg(err?.message || 'تعذر بدء تسجيل الفيديو من الكاميرا.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
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
              ? `التخزين المباشر: Cloudinary (${markingConfig.cloudinaryCloudName}) — مناسب لـ OBS وكاميرا الجوال`
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
              <span>{recordedBlob ? 'تسجيل جديد' : 'بدء تسجيل الكاميرا'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="px-3.5 py-1.5 rounded-xl bg-slate-950 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
              <span className="font-mono tabular-nums">إيقاف ({fmtTime(seconds)})</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera & Microphone Selector (OBS Virtual Camera / Webcam / Mobile Camera) */}
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
        <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
          <video
            ref={liveVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full max-h-64 object-contain mx-auto"
          />
          {isRecording && (
            <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-mono font-extrabold">
              REC · {fmtTime(seconds)}
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
                    <span>جاري الرفع ({uploadProgress}%)</span>
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
            <a
              href={toCloudinaryMp4Url(uploadedUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-800 underline"
            >
              <span>معاينة</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
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

