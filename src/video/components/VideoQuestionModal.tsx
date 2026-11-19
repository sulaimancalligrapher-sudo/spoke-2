import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Volume2,
  RotateCcw,
  Send,
  ArrowLeft,
  ZoomIn,
  X,
  HelpCircle,
  Clock,
} from 'lucide-react';
import { VideoTimestampQuestion } from '../types';
import { resolveVideoAudioAlternatives, resolveVideoQuestionImage } from '../videoSheets';
import { SupportedLang } from '../../utils/translations';

interface VideoQuestionModalProps {
  question: VideoTimestampQuestion;
  showResult: 'نعم' | 'لا';
  onSubmit: (selectedAnswer: string, isCorrect: boolean | null) => void;
  onRewatch?: () => void;
  onClose: () => void;
  t?: (id: string, fallback?: string) => string;
  currentLang?: SupportedLang;
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export const VideoQuestionModal: React.FC<VideoQuestionModalProps> = ({
  question,
  showResult,
  onSubmit,
  onRewatch,
  onClose,
  t,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);

  const [selectedOption, setSelectedOption] = useState<string>('');
  const [textAnswer, setTextAnswer] = useState<string>('');
  const [submittedState, setSubmittedState] = useState<{
    answer: string;
    isCorrect: boolean | null;
  } | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const imageUrl = resolveVideoQuestionImage(question.image);
  const audioCandidates = resolveVideoAudioAlternatives(question.audio);

  useEffect(() => {
    setSelectedOption('');
    setTextAnswer('');
    setSubmittedState(null);
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [question.id]);

  const handlePlayAudio = () => {
    if (audioCandidates.length === 0) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      if (isPlayingAudio) {
        setIsPlayingAudio(false);
        return;
      }
    }

    let idx = 0;
    const tryPlay = () => {
      if (idx >= audioCandidates.length) {
        setIsPlayingAudio(false);
        return;
      }
      const audio = new Audio(audioCandidates[idx]);
      audioRef.current = audio;
      setIsPlayingAudio(true);

      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => {
        idx += 1;
        tryPlay();
      };
      audio.play().catch(() => {
        idx += 1;
        tryPlay();
      });
    };

    tryPlay();
  };

  const handleSubmit = () => {
    const hasOptions = question.options && question.options.length > 0;
    const answer = (hasOptions ? selectedOption : textAnswer).trim();
    if (!answer) return;

    let isCorrect: boolean | null = null;
    const expected = (question.correctAnswer || '').trim();
    if (expected) {
      const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      isCorrect = norm(answer) === norm(expected);
    }

    onSubmit(answer, isCorrect);

    if (showResult === 'نعم') {
      setSubmittedState({ answer, isCorrect });
    } else {
      onClose();
    }
  };

  const hasOptions = question.options && question.options.length > 0;
  const canSubmit = hasOptions ? Boolean(selectedOption.trim()) : Boolean(textAnswer.trim());

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs font-cairo animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92dvh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#0c3868] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <HelpCircle className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                سؤال تفاعلي أثناء الدرس
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] text-blue-100 mt-0.5">
                <Clock className="w-3 h-3 shrink-0" />
                <span className="font-mono font-bold">{formatSec(question.time)}</span>
              </div>
            </div>
          </div>

          {submittedState && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Question text */}
          {question.question && (
            <div className="text-base sm:text-lg font-extrabold text-slate-900 leading-relaxed text-right">
              {question.question}
            </div>
          )}

          {/* Optional Audio */}
          {audioCandidates.length > 0 && (
            <button
              type="button"
              onClick={handlePlayAudio}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all cursor-pointer ${
                isPlayingAudio
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                  : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              <Volume2 className="w-4 h-4 shrink-0" />
              <span>{isPlayingAudio ? 'جاري تشغيل الصوت...' : 'استماع لصوت السؤال'}</span>
            </button>
          )}

          {/* Optional Image */}
          {imageUrl && (
            <div className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
              <img
                src={imageUrl}
                alt="صورة السؤال"
                onClick={() => setZoomedImg(imageUrl)}
                className="w-full max-h-56 object-contain cursor-zoom-in mx-auto"
              />
              <button
                type="button"
                onClick={() => setZoomedImg(imageUrl)}
                className="absolute bottom-2 left-2 p-2 rounded-xl bg-slate-900/75 text-white hover:bg-slate-900 transition-colors cursor-pointer"
                title="تكبير الصورة"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Options or Input vs Result */}
          {!submittedState ? (
            <div className="space-y-2.5">
              {hasOptions ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {question.options.map((opt, idx) => {
                    const isSelected = selectedOption === opt;
                    return (
                      <button
                        key={`${idx}-${opt}`}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        className={`w-full text-right px-4 py-3 rounded-2xl border-2 text-sm sm:text-base font-bold transition-all cursor-pointer flex items-center justify-between gap-3 min-h-[48px] ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-950 shadow-xs'
                            : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="flex-1 leading-snug">{opt}</span>
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">اكتب إجابتك هنا:</label>
                  <input
                    type="text"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    placeholder="اكتب الإجابة..."
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 focus:outline-none text-sm sm:text-base font-bold text-slate-900"
                    autoFocus
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              className={`p-4 rounded-2xl border space-y-2 ${
                submittedState.isCorrect === true
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : submittedState.isCorrect === false
                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                  : 'bg-blue-50 border-blue-200 text-blue-950'
              }`}
            >
              <div className="flex items-center gap-2 font-extrabold text-base">
                {submittedState.isCorrect === true ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>أحسنت! إجابة صحيحة</span>
                  </>
                ) : submittedState.isCorrect === false ? (
                  <>
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>إجابة غير مطابقة</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                    <span>تم تسجيل إجابتك بنجاح</span>
                  </>
                )}
              </div>

              <div className="text-xs sm:text-sm space-y-1">
                <div>
                  <span className="text-slate-500 font-semibold">إجابتك: </span>
                  <span className="font-bold">{submittedState.answer}</span>
                </div>
                {submittedState.isCorrect === false && question.correctAnswer && (
                  <div>
                    <span className="text-slate-500 font-semibold">الإجابة الصحيحة: </span>
                    <span className="font-extrabold text-emerald-700">{question.correctAnswer}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {!submittedState ? (
            <>
              {onRewatch ? (
                <button
                  type="button"
                  onClick={onRewatch}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer min-h-[42px]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{tr('video_rewatch_clip', 'إعادة مشاهدة المقطع')}</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed min-h-[42px]"
              >
                <Send className="w-4 h-4" />
                <span>{tr('video_submit_answer', 'تأكيد الإجابة')}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer min-h-[44px]"
            >
              <span>{tr('video_continue_watching', 'متابعة الفيديو')}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {zoomedImg && (
        <div
          onClick={() => setZoomedImg(null)}
          className="fixed inset-0 z-[120] bg-slate-950/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={zoomedImg}
            alt="صورة مكبرة"
            className="max-w-full max-h-[90dvh] rounded-2xl object-contain shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setZoomedImg(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
