import React, { useEffect, useRef, useState } from 'react';
import {
  Video,
  Camera,
  CameraOff,
  Monitor,
  Square,
  UploadCloud,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { MarkingConfig } from '../../types';
import { MarkingBlackboardHandle } from './MarkingBlackboard';
import {
  toCloudinaryMp4Url,
  uploadMarkingMediaToDrive,
  uploadVideoToCloudinary,
} from '../../utils/markingSheets';

interface MarkingVideoRecorderProps {
  blackboardRef: React.RefObject<MarkingBlackboardHandle | null>;
  markingConfig: MarkingConfig;
  webhookUrl: string;
  existingVideoUrl?: string;
  onVideoUploaded: (url: string) => void;
}

export const MarkingVideoRecorder: React.FC<MarkingVideoRecorderProps> = ({
  blackboardRef,
  markingConfig,
  webhookUrl,
  existingVideoUrl,
  onVideoUploaded,
}) => {
  const [mode, setMode] = useState<'board' | 'screen'>('board');
  const [useCameraPip, setUseCameraPip] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string>(existingVideoUrl || '');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsToStopRef = useRef<MediaStream[]>([]);
  const camVideoElRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setUploadedUrl(existingVideoUrl || '');
    setRecordedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setErrorMsg(null);
  }, [existingVideoUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamsToStopRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      blackboardRef.current?.setWebcamVideo(null);
    };
  }, [blackboardRef]);

  const stopAllStreams = () => {
    streamsToStopRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsToStopRef.current = [];
    blackboardRef.current?.setWebcamVideo(null);
    if (camVideoElRef.current) {
      camVideoElRef.current.srcObject = null;
    }
  };

  const startRecording = async () => {
    setErrorMsg(null);
    setRecordedBlob(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    try {
      const tracks: MediaStreamTrack[] = [];
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamsToStopRef.current.push(micStream);
        micStream.getAudioTracks().forEach((t) => tracks.push(t));
      } catch {
        setErrorMsg('تعذر تشغيل الميكروفون؛ سيتم التسجيل بدون صوت ما لم يتم منحه.');
      }

      if (mode === 'screen') {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 24 },
          audio: false,
        });
        streamsToStopRef.current.push(displayStream);
        displayStream.getVideoTracks().forEach((t) => {
          t.onended = () => stopRecording();
          tracks.push(t);
        });
      } else {
        const canvas = blackboardRef.current?.getCompositeCanvas();
        if (!canvas || typeof canvas.captureStream !== 'function') {
          setErrorMsg('تعذر الوصول إلى لوحة السبورة للتسجيل.');
          stopAllStreams();
          return;
        }
        if (useCameraPip) {
          try {
            const camStream = await navigator.mediaDevices.getUserMedia({
              video: { width: 320, height: 240, facingMode: 'user' },
              audio: false,
            });
            streamsToStopRef.current.push(camStream);
            const vid = document.createElement('video');
            vid.muted = true;
            vid.playsInline = true;
            vid.srcObject = camStream;
            await vid.play();
            camVideoElRef.current = vid;
            blackboardRef.current?.setWebcamVideo(vid);
          } catch {
            // Continue without camera PiP if denied
          }
        }
        const canvasStream = canvas.captureStream(24);
        streamsToStopRef.current.push(canvasStream);
        canvasStream.getVideoTracks().forEach((t) => tracks.push(t));
      }

      const combined = new MediaStream(tracks);
      const preferredMime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      const mr = new MediaRecorder(combined, { mimeType: preferredMime, videoBitsPerSecond: 1_200_000 });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stopAllStreams();
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
      stopAllStreams();
      setIsRecording(false);
      setErrorMsg(err?.message || 'تعذر بدء تسجيل الفيديو.');
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
          setUploadedUrl(finalUrl);
          onVideoUploaded(finalUrl);
          setUploading(false);
          return;
        }
        setErrorMsg(res.error || 'تعذر الرفع إلى Cloudinary.');
        setUploading(false);
        return;
      }

      // Fallback to Google Drive if Cloudinary is not configured yet (size guard 10MB)
      if (recordedBlob.size > 10 * 1024 * 1024) {
        setErrorMsg(
          'حجم الفيديو كبير للرفع المباشر إلى Google Drive. يرجى إضافة بيانات Cloudinary في تبويب «التصحيح والمعلمين» لرفع الفيديوهات بسرعة.'
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
        fileName: `correction_video_${Date.now()}`,
      });
      if (driveRes.success && driveRes.url) {
        setUploadProgress(100);
        setUploadedUrl(driveRes.url);
        onVideoUploaded(driveRes.url);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
            <Video className="w-4 h-4 text-indigo-600" />
            <span>تسجيل فيديو التصحيح المباشر (السبورة + الصوت + الكاميرا)</span>
          </div>
          <div className="text-[11px] text-slate-500 font-semibold">
            {hasCloudinary
              ? `التخزين: Cloudinary (${markingConfig.cloudinaryCloudName}) — جاهز للبث وإرسال تيليغرام`
              : 'تنبيه: Cloudinary غير مضبوط بعد (سيتم الحفظ عبر Google Drive للمقاطع الصغيرة)'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={isRecording}
            onClick={() => setMode('board')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer disabled:opacity-50 ${
              mode === 'board'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            تسجيل السبورة
          </button>

          <button
            type="button"
            disabled={isRecording}
            onClick={() => setMode('screen')}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
              mode === 'screen'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>مشاركة الشاشة</span>
          </button>

          {mode === 'board' && (
            <button
              type="button"
              disabled={isRecording}
              onClick={() => setUseCameraPip((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                useCameraPip
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {useCameraPip ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
              <span>كاميرا المعلم</span>
            </button>
          )}

          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              <span>{recordedBlob ? 'تسجيل فيديو جديد' : 'بدء تسجيل التصحيح'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="px-3.5 py-1.5 rounded-xl bg-slate-950 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
              <span className="font-mono tabular-nums">إيقاف ({fmtTime(seconds)})</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

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
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري الرفع ({uploadProgress}%)</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>{hasCloudinary ? 'رفع الفيديو إلى Cloudinary' : 'رفع الفيديو إلى Drive'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {uploadedUrl && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-emerald-900">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>تم تجهيز رابط فيديو التصحيح وإرفاقه بالواجب</span>
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
