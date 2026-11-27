import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, CheckCircle2, RotateCcw, X, AlertTriangle, Volume2 } from 'lucide-react';

interface AudioRecorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onAttachAudio: (clip: { blobUrl: string; base64: string; name?: string }) => void;
}

function createSafeAudioRecorder(stream: MediaStream): MediaRecorder {
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  const supported =
    typeof MediaRecorder.isTypeSupported === 'function'
      ? candidates.find((m) => MediaRecorder.isTypeSupported(m))
      : undefined;

  if (supported) {
    try {
      return new MediaRecorder(stream, { mimeType: supported });
    } catch {
      // Fallback to browser default
    }
  }
  return new MediaRecorder(stream);
}

export const AudioRecorderModal: React.FC<AudioRecorderModalProps> = ({
  isOpen,
  onClose,
  title = 'تسجيل شرح صوتي توضيحي للطالب',
  onAttachAudio,
}) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const cleanupRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      try {
        mrRef.current.stop();
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  };

  useEffect(() => {
    if (!isOpen) {
      cleanupRecording();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setRecordedBase64(null);
      setSeconds(0);
      setErrorMsg(null);
    }
    return () => {
      cleanupRecording();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleStart = async () => {
    setErrorMsg(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRecordedBase64(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg('المتصفح الحالي لا يدعم التسجيل المباشر. يمكنك استخدام خيار «رفع ملف صوتي».');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = createSafeAudioRecorder(stream);
      chunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size === 0) {
          setErrorMsg('لم يتم التقاط أي صوت. تأكد من عمل الميكروفون وأعد المحاولة.');
          return;
        }
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setRecordedBase64(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      };

      mrRef.current = mr;
      mr.start(500);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErrorMsg('تعذر الوصول للميكروفون. يرجى منح إذن الميكروفون من المتصفح.');
    }
  };

  const handleStop = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mrRef.current && mrRef.current.state !== 'inactive') {
      mrRef.current.stop();
    }
    setRecording(false);
  };

  const handleAttach = () => {
    if (!previewUrl || !recordedBase64) return;
    onAttachAudio({
      blobUrl: previewUrl,
      base64: recordedBase64,
      name: `تسجيل المعلم (${fmtTime(seconds)})`,
    });
    // Don't revoke previewUrl here because parent renders <audio src={blobUrl}>
    setPreviewUrl(null);
    setRecordedBase64(null);
    setSeconds(0);
    onClose();
  };

  const handleCancel = () => {
    cleanupRecording();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBase64(null);
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !recording) handleCancel();
      }}
      className="fixed inset-0 z-[115] bg-slate-950/75 backdrop-blur-xs overflow-y-auto flex items-start sm:items-center justify-center p-3 sm:p-4 font-cairo text-right"
    >
      <div className="my-auto bg-white rounded-3xl max-w-md w-full max-h-[calc(100dvh-20px)] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
        <header className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 truncate">{title}</h3>
          </div>

          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-xl bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 cursor-pointer shrink-0"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {/* Live Recorder Status Box */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center gap-3 text-center">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                recording
                  ? 'bg-rose-600 text-white animate-mic-pulse'
                  : previewUrl
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {previewUrl && !recording ? (
                <Volume2 className="w-7 h-7" />
              ) : (
                <Mic className="w-7 h-7" />
              )}
            </div>

            <div className="font-mono text-2xl font-extrabold text-slate-900 tabular-nums">
              {fmtTime(seconds)}
            </div>

            <div className="text-xs font-bold text-slate-600">
              {recording
                ? 'جاري تسجيل صوت المعلم الآن...'
                : previewUrl
                ? 'اكتمل التسجيل — استمع للمعاينة ثم اضغط اعتماد وإرفاق'
                : 'اضغط زر بدء التسجيل للتحدث عبر الميكروفون'}
            </div>

            {!recording ? (
              <button
                type="button"
                onClick={handleStart}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {previewUrl ? <RotateCcw className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>{previewUrl ? 'إعادة التسجيل' : 'بدء التسجيل الصوتي'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-rose-500 text-rose-500" />
                <span>إيقاف التسجيل</span>
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Recorded Preview */}
          {previewUrl && !recording && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
              <div className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>معاينة التسجيل الصوتي:</span>
              </div>
              <audio controls src={previewUrl} className="w-full h-10" />
            </div>
          )}
        </div>

        <footer className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            disabled={!previewUrl || !recordedBase64 || recording}
            onClick={handleAttach}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>اعتماد وإرفاق الصوت</span>
          </button>
        </footer>
      </div>
    </div>
  );
};
