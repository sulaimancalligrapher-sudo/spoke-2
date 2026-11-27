import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Video,
  Camera,
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
  X,
  Upload,
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
  /** Incrementing this counter opens the Camera Preview & Record modal immediately */
  openTrigger?: number;
  /** When true, hides the inline box and only renders the modal when triggered */
  hideInlineTrigger?: boolean;
}

const MAX_VIDEO_SECONDS = 240; // 4 Minutes max per clip
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB safety cap

function createSafeVideoRecorder(stream: MediaStream): MediaRecorder {
  const candidates = [
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  const isSupported =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? (m: string) => {
          try {
            return MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        }
      : () => false;

  const preferred = candidates.find(isSupported);

  if (preferred) {
    try {
      return new MediaRecorder(stream, {
        mimeType: preferred,
        videoBitsPerSecond: 2_500_000,
      });
    } catch {
      try {
        return new MediaRecorder(stream, { mimeType: preferred });
      } catch {
        // fallback without mimeType options
      }
    }
  }

  return new MediaRecorder(stream);
}

export const MarkingVideoRecorder: React.FC<MarkingVideoRecorderProps> = ({
  markingConfig,
  webhookUrl,
  existingVideoUrl,
  onVideoUploaded,
  onRemoveExistingVideo,
  title = 'تسجيل فيديو بالكاميرا أو OBS',
  autoClearAfterUpload = false,
  openTrigger,
  hideInlineTrigger = false,
}) => {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const [streamReady, setStreamReady] = useState<boolean>(false);
  const [startingCamera, setStartingCamera] = useState<boolean>(false);
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
  const nativeVideoInputRef = useRef<HTMLInputElement | null>(null);
  const fileVideoInputRef = useRef<HTMLInputElement | null>(null);

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
      activeStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      activeStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setStreamReady(false);
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
        return obsCam?.deviceId || '';
      });
      setSelectedMicId((prev) => {
        if (prev && auds.some((a) => a.deviceId === prev)) return prev;
        return '';
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

  const openCameraPreview = useCallback(
    async (
      overrideCamId?: string,
      overrideMicId?: string,
      overrideOrientation?: 'horizontal' | 'vertical',
      overrideFacing?: 'user' | 'environment'
    ): Promise<MediaStream | null> => {
      setErrorMsg(null);
      setStartingCamera(true);
      stopCameraStream();

      if (!navigator.mediaDevices?.getUserMedia) {
        setStartingCamera(false);
        setErrorMsg(
          'المتصفح الحالي لا يدعم البث المباشر (WebRTC). استخدم زر «كاميرا الجوال المباشرة» بالأسفل.'
        );
        return null;
      }

      const camId = overrideCamId !== undefined ? overrideCamId : selectedCameraId;
      const micId = overrideMicId !== undefined ? overrideMicId : selectedMicId;
      const targetOrient = overrideOrientation ?? orientation;
      const targetFacing = overrideFacing ?? facingMode;
      const isVert = targetOrient === 'vertical';

      const attempts: MediaStreamConstraints[] = [];

      if (camId) {
        attempts.push({
          video: {
            deviceId: { exact: camId },
            width: { ideal: isVert ? 1080 : 1280 },
            height: { ideal: isVert ? 1920 : 720 },
          },
          audio: micId ? { deviceId: { exact: micId } } : true,
        });
        attempts.push({
          video: { deviceId: { exact: camId } },
          audio: true,
        });
      }

      attempts.push(
        {
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: isVert ? 720 : 1280 },
            height: { ideal: isVert ? 1280 : 720 },
          },
          audio: micId ? { deviceId: { exact: micId } } : true,
        },
        {
          video: { facingMode: { ideal: targetFacing } },
          audio: true,
        },
        { video: true, audio: true },
        { video: true, audio: false }
      );

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

      setStartingCamera(false);

      if (!stream) {
        setErrorMsg(
          lastErr?.name === 'NotAllowedError'
            ? 'تم رفض صلاحية الكاميرا أو الميكروفون. فعّل الإذن أو استخدم زر «كاميرا الجوال المباشرة».'
            : 'تعذر فتح الكاميرا بالبث المباشر على هذا المتصفح. يمكنك التصوير فوراً عبر زر «كاميرا الجوال المباشرة» أو «رفع فيديو».'
        );
        return null;
      }

      activeStreamRef.current = stream;
      setStreamReady(true);
      await refreshDevices();

      window.setTimeout(() => {
        const videoEl = liveVideoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.muted = true;
          videoEl.play().catch(() => {});
        }
      }, 60);

      return stream;
    },
    [facingMode, orientation, refreshDevices, selectedCameraId, selectedMicId, stopCameraStream]
  );

  const openVideoModal = useCallback(() => {
    setModalOpen(true);
    setErrorMsg(null);
    openCameraPreview();
  }, [openCameraPreview]);

  // Trigger modal open from external button (e.g., Blackboard "توضيح إضافي -> تصوير فيديو")
  const prevTriggerRef = useRef<number | undefined>(openTrigger);
  useEffect(() => {
    if (
      openTrigger !== undefined &&
      openTrigger > 0 &&
      openTrigger !== prevTriggerRef.current
    ) {
      prevTriggerRef.current = openTrigger;
      openVideoModal();
    }
  }, [openTrigger, openVideoModal]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
  }, []);

  const handleCloseModal = () => {
    if (isRecording) stopRecording();
    stopCameraStream();
    setModalOpen(false);
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setRecordedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (typeof MediaRecorder === 'undefined') {
      setErrorMsg(
        'متصفح الجهاز لا يدعم تسجيل الفيديو المباشر داخل المتصفح. اضغط «كاميرا الجوال المباشرة» بالأسفل للتصوير الفوري.'
      );
      return;
    }

    let stream = activeStreamRef.current;
    if (!stream || stream.getVideoTracks().every((t) => t.readyState !== 'live')) {
      stream = await openCameraPreview();
    }
    if (!stream) return;

    // Wait briefly for camera pipeline warmup (important on Android/iOS mobile sensors)
    await new Promise((r) => window.setTimeout(r, 250));

    try {
      const mr = createSafeVideoRecorder(stream);

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

      mr.onerror = () => {
        setIsRecording(false);
        setErrorMsg(
          'حدث خطأ أثناء التسجيل المباشر على هذا الجهاز. يمكنك استخدام زر «كاميرا الجوال المباشرة» بالأسفل.'
        );
      };

      mr.onstop = () => {
        const mime = mr.mimeType || chunksRef.current[0]?.type || 'video/mp4';
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size === 0) {
          setErrorMsg(
            'لم يُحفظ فيديو من الكاميرا المباشرة. جرّب التصوير عبر زر «كاميرا الجوال المباشرة».'
          );
          return;
        }
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      };

      mediaRecorderRef.current = mr;

      try {
        mr.start(1000);
      } catch {
        mr.start();
      }

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
    } catch {
      setIsRecording(false);
      setErrorMsg(
        'تعذر تشغيل مسجل المتصفح على هذا الهاتف. اضغط «كاميرا الجوال المباشرة» لتسجيل الفيديو وإرفاقه مباشرة.'
      );
    }
  };

  const handleNativeVideoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setErrorMsg('حجم الفيديو المختار يتجاوز 80 MB. يرجى اختيار مقطع أقصر.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setRecordedBlob(file);
    setPreviewUrl(URL.createObjectURL(file));
    if (!modalOpen) setModalOpen(true);
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
          handleCloseModal();
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
        handleCloseModal();
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
    <>
      {/* Hidden Native Mobile Video Camera + Gallery Video Inputs */}
      <input
        ref={nativeVideoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={handleNativeVideoPicked}
      />
      <input
        ref={fileVideoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleNativeVideoPicked}
      />

      {/* Inline Trigger Box (shown in Batch Modal or standalone usage) */}
      {!hideInlineTrigger && (
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <Video className="w-4 h-4 text-indigo-600" />
                <span>{title}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">
                {hasCloudinary
                  ? `Cloudinary (${markingConfig.cloudinaryCloudName}) · متوافق مع الجوال وكاميرا OBS`
                  : 'سيُحفظ المقطع عبر Google Drive (أو Cloudinary بعد تفعيله في الإعدادات)'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={openVideoModal}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>فتح كاميرا الفيديو والتسجيل</span>
              </button>

              <button
                type="button"
                onClick={() => nativeVideoInputRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>كاميرا الجوال المباشرة</span>
              </button>

              <button
                type="button"
                onClick={() => fileVideoInputRef.current?.click()}
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-indigo-600" />
                <span>رفع فيديو</span>
              </button>
            </div>
          </div>

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
              <video
                src={toCloudinaryMp4Url(uploadedUrl)}
                controls
                playsInline
                className="w-full max-h-52 rounded-xl bg-slate-950"
              />
            </div>
          )}
        </div>
      )}

      {/* Dedicated Live Camera Preview & Recording Modal */}
      {modalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRecording && !uploading) handleCloseModal();
          }}
          className="fixed inset-0 z-[115] bg-slate-950/80 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-2.5 sm:p-4 font-cairo text-right"
        >
          <div className="my-auto bg-white rounded-3xl max-w-2xl w-full max-h-[calc(100dvh-20px)] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            {/* Header */}
            <header className="px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-1.5 truncate">
                  <Video className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="truncate">{title}</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold truncate">
                  {hasCloudinary
                    ? `Cloudinary (${markingConfig.cloudinaryCloudName}) · حد أقصى 4 دقائق`
                    : 'رفع عبر Google Drive (حد 10 MB) أو ضبط Cloudinary للملفات الكبيرة'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={uploading}
                className="p-2 rounded-xl bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer shrink-0"
                title="إغلاق"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
              {/* Orientation + Flip + Device Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={isRecording}
                    onClick={() => {
                      setOrientation('horizontal');
                      if (streamReady) openCameraPreview(selectedCameraId, selectedMicId, 'horizontal');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                      orientation === 'horizontal'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
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
                      if (streamReady) openCameraPreview(selectedCameraId, selectedMicId, 'vertical');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                      orientation === 'vertical'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
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
                    openCameraPreview('', selectedMicId, orientation, nextF);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCw className="w-3 h-3 text-indigo-600" />
                  <span>{facingMode === 'user' ? 'الكاميرا الخلفية' : 'الكاميرا الأمامية'}</span>
                </button>
              </div>

              {/* Camera & Mic Selectors */}
              {cameras.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <select
                      disabled={isRecording}
                      value={selectedCameraId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedCameraId(nextId);
                        openCameraPreview(nextId, selectedMicId);
                      }}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-bold text-slate-800"
                    >
                      <option value="">الكاميرا التلقائية</option>
                      {cameras.map((cam, idx) => (
                        <option key={cam.deviceId || idx} value={cam.deviceId}>
                          {cam.label || `كاميرا ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isRecording}
                      onClick={() => {
                        refreshDevices();
                        openCameraPreview();
                      }}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
                      title="تحديث الكاميرات"
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
                        openCameraPreview(selectedCameraId, nextMic);
                      }}
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-bold text-slate-800"
                    >
                      <option value="">الميكروفون الافتراضي</option>
                      {mics.map((m, idx) => (
                        <option key={m.deviceId || idx} value={m.deviceId}>
                          {m.label || `ميكروفون ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Live Camera Preview Feed */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex justify-center min-h-[210px]">
                {startingCamera ? (
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-300 py-14 text-xs font-bold">
                    <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                    <span>جاري تشغيل معاينة الكاميرا...</span>
                  </div>
                ) : (
                  <div
                    className={
                      orientation === 'horizontal'
                        ? 'w-full aspect-video max-h-72'
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
                )}

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

              {/* Start / Stop Recording & Native Mobile Fallbacks */}
              <div className="flex flex-wrap items-center gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    disabled={startingCamera || uploading}
                    onClick={startRecording}
                    className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>{recordedBlob ? 'تسجيل فيديو جديد' : 'بدء تسجيل الفيديو'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-slate-950 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-rose-500 text-rose-500" />
                    <span className="font-mono tabular-nums">
                      إيقاف التسجيل (متبقي {fmtTime(countdown)})
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isRecording || uploading}
                  onClick={() => nativeVideoInputRef.current?.click()}
                  className="py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>كاميرا الجوال المباشرة</span>
                </button>

                <button
                  type="button"
                  disabled={isRecording || uploading}
                  onClick={() => fileVideoInputRef.current?.click()}
                  className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>رفع فيديو</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Recorded Clip Preview & Upload Button */}
              {previewUrl && recordedBlob && (
                <div className="p-3 rounded-2xl bg-emerald-50/50 border border-emerald-200 space-y-2.5">
                  <div className="text-xs font-extrabold text-emerald-950">معاينة الفيديو المسجل:</div>
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
                        disabled={uploading}
                        onClick={() => {
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(null);
                          setRecordedBlob(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>

                      <button
                        type="button"
                        disabled={uploading}
                        onClick={handleUploadRecordedVideo}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span className="tabular-nums">جاري الرفع ({uploadProgress}%)</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud className="w-4 h-4" />
                            <span>
                              {hasCloudinary ? 'رفع وإرفاق الفيديو (Cloudinary)' : 'رفع الفيديو إلى Drive'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
