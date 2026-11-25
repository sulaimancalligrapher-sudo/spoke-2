import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  RotateCcw,
  Mic,
  Square,
  Trash2,
  ExternalLink,
  Repeat,
  CheckCircle2,
} from 'lucide-react';
import { playUniversalArabicStream, stopAllAudio } from '../../utils/arabicAudio';
import { getAlternativeAudioUrls } from '../../utils/mediaUrl';

interface MarkingAudioStudioProps {
  studentAudioUrl?: string;
  studentName?: string;
  referenceAudioUrl?: string;
  referenceAutoReadText?: string;
  existingTeacherAudioUrl?: string;
  onTeacherAudioRecorded?: (base64Data: string | null) => void;
}

const SingleAudioDeck: React.FC<{
  title: string;
  url?: string;
  fallbackText?: string;
  accent?: 'emerald' | 'indigo';
}> = ({ title, url, fallbackText, accent = 'emerald' }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const candidates = useMemo(() => (url ? getAlternativeAudioUrls(url) : []), [url]);
  const [candIdx, setCandIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [loop, setLoop] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setCandIdx(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadFailed(false);
  }, [url]);

  const activeSrc = candidates[candIdx] || url || '';

  const togglePlay = () => {
    if (!activeSrc && fallbackText) {
      stopAllAudio();
      setIsPlaying(true);
      playUniversalArabicStream(
        fallbackText,
        speed,
        () => setIsPlaying(true),
        () => setIsPlaying(false),
        () => setIsPlaying(false)
      );
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.playbackRate = speed;
      el.play().catch(() => setLoadFailed(true));
    } else {
      el.pause();
    }
  };

  const handleSpeedChange = (nextSpeed: number) => {
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  const fmt = (sec: number) => {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (!activeSrc && !fallbackText) {
    return (
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-400 font-semibold">
        {title}: لا يوجد تسجيل صوتي مرفق.
      </div>
    );
  }

  return (
    <div
      className={`p-3 rounded-xl border space-y-2 ${
        accent === 'indigo'
          ? 'bg-indigo-50/50 border-indigo-200'
          : 'bg-emerald-50/50 border-emerald-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
          <Volume2
            className={`w-4 h-4 ${
              accent === 'indigo' ? 'text-indigo-700' : 'text-emerald-700'
            }`}
          />
          <span>{title}</span>
        </div>

        <div className="flex items-center gap-1">
          {[0.75, 1, 1.25].map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => handleSpeedChange(sp)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer ${
                speed === sp
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {sp}x
            </button>
          ))}
          {activeSrc && (
            <button
              type="button"
              onClick={() => {
                setLoop((prev) => {
                  const next = !prev;
                  if (audioRef.current) audioRef.current.loop = next;
                  return next;
                });
              }}
              className={`p-1 rounded border cursor-pointer ${
                loop
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
              title="تكرار تلقائي"
            >
              <Repeat className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {activeSrc && !loadFailed ? (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={togglePlay}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 cursor-pointer transition-colors ${
              accent === 'indigo'
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {});
              }
            }}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
            title="إعادة من البداية"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="flex-1 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={Math.min(currentTime, duration || 100)}
              onChange={(e) => {
                const val = Number(e.target.value);
                setCurrentTime(val);
                if (audioRef.current) audioRef.current.currentTime = val;
              }}
              className="flex-1 accent-slate-900 cursor-pointer"
            />
            <span className="text-[11px] font-mono tabular-nums text-slate-600 shrink-0">
              {fmt(currentTime)} / {fmt(duration)}
            </span>
          </div>

          <audio
            ref={audioRef}
            src={activeSrc}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
            onError={() => {
              if (candIdx + 1 < candidates.length) {
                setCandIdx((p) => p + 1);
              } else {
                setLoadFailed(true);
                setIsPlaying(false);
              }
            }}
          />
        </div>
      ) : activeSrc && loadFailed ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-amber-800 font-semibold">تعذر البث المباشر داخل المتصفح.</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-800 font-bold inline-flex items-center gap-1"
          >
            <span>تشغيل الملف</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={togglePlay}
          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Volume2 className="w-4 h-4" />
          <span>نطق الكلمة آلياً: {fallbackText}</span>
        </button>
      )}
    </div>
  );
};

export const MarkingAudioStudio: React.FC<MarkingAudioStudioProps> = ({
  studentAudioUrl,
  studentName,
  referenceAudioUrl,
  referenceAutoReadText,
  existingTeacherAudioUrl,
  onTeacherAudioRecorded,
}) => {
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setRecordedBlobUrl(null);
    setRecordSeconds(0);
    setMicError(null);
  }, [studentAudioUrl, studentName, existingTeacherAudioUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    };
  }, [recordedBlobUrl]);

  const startRecordingVoice = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedBlobUrl(url);
        const reader = new FileReader();
        reader.onloadend = () => {
          onTeacherAudioRecorded?.(typeof reader.result === 'string' ? reader.result : null);
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setMicError('تعذر الوصول إلى الميكروفون. يرجى منح الإذن من المتصفح.');
    }
  };

  const stopRecordingVoice = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const clearRecordedVoice = () => {
    if (recordedBlobUrl) URL.revokeObjectURL(recordedBlobUrl);
    setRecordedBlobUrl(null);
    setRecordSeconds(0);
    onTeacherAudioRecorded?.(null);
  };

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <SingleAudioDeck
          title={`تسجيل الطالب${studentName ? ` (${studentName})` : ''}`}
          url={studentAudioUrl}
          accent="emerald"
        />
        <SingleAudioDeck
          title="النموذج المرجعي للمعلم"
          url={referenceAudioUrl}
          fallbackText={referenceAutoReadText}
          accent="indigo"
        />
      </div>

      {/* Teacher Voice Note Recorder */}
      <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
            <Mic className="w-4 h-4 text-rose-600" />
            <span>تسجيل ملاحظة صوتية من المعلم (يُحفظ في Google Drive ويُرسل لتيليغرام)</span>
          </div>

          <div className="flex items-center gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecordingVoice}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>{recordedBlobUrl ? 'إعادة التسجيل' : 'تسجيل صوت المعلم'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecordingVoice}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                <span>إيقاف ({recordSeconds} ث)</span>
              </button>
            )}

            {recordedBlobUrl && (
              <button
                type="button"
                onClick={clearRecordedVoice}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 cursor-pointer"
                title="حذف التسجيل"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {micError && <div className="text-xs text-rose-600 font-bold">{micError}</div>}

        {recordedBlobUrl && (
          <div className="flex items-center gap-2 pt-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <audio controls src={recordedBlobUrl} className="w-full h-9" />
          </div>
        )}

        {!recordedBlobUrl && existingTeacherAudioUrl && (
          <SingleAudioDeck
            title="الملاحظة الصوتية المحفوظة سابقاً"
            url={existingTeacherAudioUrl}
            accent="indigo"
          />
        )}
      </div>
    </div>
  );
};
