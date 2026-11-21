import React, { useState, useMemo, useEffect } from 'react';
import { CatchHistoryItem, CatchLessonSubject, StudentRegistrant } from '../types';
import { getRetryStatus } from '../utils/retryLimit';
import {
  X,
  Target,
  BookOpen,
  ChevronLeft,
  Eye,
  EyeOff,
  RotateCcw,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { getQuestionPlainText } from '../utils/matchingMedia';
import {
  SupportedLang,
  TranslationItem,
  getTranslatedCatchSubject,
  getTranslatedCatchQuestionText,
} from '../utils/translations';
import { extractPercentageFromMatchingText } from '../utils/googleSheets';

interface CatchLessonsModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: CatchLessonSubject[];
  activeSubjectId?: string;
  activeExerciseIndex?: number;
  onSelectSubjectExercise: (subjectId: string, exerciseIndex: number, isRetry?: boolean) => void;
  onOpenAdminCatch?: () => void;
  catchHistory?: CatchHistoryItem[];
  currentStudent?: StudentRegistrant | null;
  currentLang?: SupportedLang;
  translations?: TranslationItem[];
  isScheduleRestricted?: boolean;
  t?: (id: string, fallback?: string) => string;
}

export const CatchLessonsModal: React.FC<CatchLessonsModalProps> = ({
  isOpen,
  onClose,
  subjects,
  activeSubjectId,
  activeExerciseIndex = 0,
  onSelectSubjectExercise,
  onOpenAdminCatch,
  catchHistory = [],
  currentStudent,
  currentLang = 'ar',
  translations = [],
  isScheduleRestricted = false,
  t,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    activeSubjectId || subjects[0]?.id || ''
  );
  const [showCompleted, setShowCompleted] = useState<boolean>(false);

  useEffect(() => {
    if (activeSubjectId) {
      setSelectedSubjectId(activeSubjectId);
    } else if (subjects.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [activeSubjectId, subjects]);

  const currentSubject = useMemo(() => {
    return subjects.find((s) => s.id === selectedSubjectId) || subjects[0] || null;
  }, [subjects, selectedSubjectId]);

  const subjectScoresMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (!currentSubject || !catchHistory.length) return map;
    const cleanSubj = (currentSubject.subjectName || '').trim();
    const record = catchHistory.find((h) => (h.lessonSubject || '').trim() === cleanSubj);
    if (record && Array.isArray(record.exercises)) {
      record.exercises.forEach((ex) => {
        map[ex.exerciseNumber] = extractPercentageFromMatchingText(
          ex.formulaString,
          ex.percentage
        );
      });
    }
    return map;
  }, [currentSubject, catchHistory]);

  const indexedExercises = useMemo(() => {
    if (!currentSubject) return [];
    return currentSubject.exercises
      .map((ex, exIdx) => ({ ex, exIdx }))
      .filter(({ ex }) => showCompleted || subjectScoresMap[ex.exerciseNumber] === undefined);
  }, [currentSubject, showCompleted, subjectScoresMap]);

  const hasHiddenCompleted =
    !showCompleted &&
    Boolean(currentSubject) &&
    currentSubject!.exercises.length > 0 &&
    indexedExercises.length === 0;

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-2.5 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-100 relative max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 pb-3.5 sm:pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-linear-to-tr from-sky-600 to-cyan-600 text-white flex items-center justify-center font-bold shadow-md shadow-sky-600/20 shrink-0">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 text-sky-100" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-2xl font-black text-slate-900 font-amiri tracking-wide truncate">
                {tr('nav_catch_exercise', 'تحدي الصيد (AR)')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {tr('catch_modal_subtitle', 'اختر موضوع الدرس ثم التقط الحروف والكلمات في الهواء بالكاميرا أو اللمس')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer border border-slate-200 shrink-0"
            title={tr('btn_close', 'إغلاق')}
            aria-label={tr('btn_close', 'إغلاق')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dropdown Subject Selector + Eye Toggle */}
        <div className="my-4 bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200 space-y-2">
          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-sky-600" />
            <span>{tr('matching_modal_choose_subject', 'اختر موضوع الدرس من القائمة:')}</span>
          </label>
          <div className="flex items-center gap-2">
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="flex-1 min-w-0 px-4 py-2.5 bg-white border border-slate-300 focus:border-sky-600 rounded-xl text-xs sm:text-sm font-bold text-slate-800 cursor-pointer focus:outline-hidden transition-all shadow-2xs"
            >
              {subjects.map((subj) => (
                <option key={subj.id} value={subj.id}>
                  {getTranslatedCatchSubject(subj.subjectName, currentLang, translations)} ({subj.exercises.length} {tr('matching_modal_exercises_word', 'تمارين')})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowCompleted((prev) => !prev)}
              title={
                showCompleted
                  ? tr('matching_hide_completed_eye', 'إخفاء التمارين التي تم تسجيل إجابتها')
                  : tr('matching_show_completed_eye', 'إظهار التمارين التي تم تسجيل إجابتها')
              }
              aria-label={
                showCompleted
                  ? tr('matching_hide_completed_eye', 'إخفاء التمارين التي تم تسجيل إجابتها')
                  : tr('matching_show_completed_eye', 'إظهار التمارين التي تم تسجيل إجابتها')
              }
              className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs ${
                showCompleted
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              {showCompleted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Exercises List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {currentSubject && indexedExercises.length > 0 ? (
            indexedExercises.map(({ ex, exIdx }) => {
              const isCurrent =
                currentSubject.id === activeSubjectId && exIdx === activeExerciseIndex;
              const rawPlainQ = getQuestionPlainText(ex.questionText).trim();
              const translatedQ = rawPlainQ
                ? getTranslatedCatchQuestionText(
                    currentSubject.subjectName,
                    ex.exerciseNumber,
                    rawPlainQ,
                    currentLang,
                    translations
                  )
                : '';
              const plainQ =
                translatedQ ||
                `${tr('matching_modal_exercise_word', 'تمرين')} ${ex.exerciseNumber}`;
              const score = subjectScoresMap[ex.exerciseNumber];
              const isCompleted = score !== undefined;
              const retryKey = `${(currentSubject.subjectName || '').trim()}::ex-${ex.exerciseNumber}`;
              const retryStatus = getRetryStatus('catch', currentStudent, retryKey, ex);
              const canRetry = retryStatus.canRetry;

              return (
                <div
                  key={ex.id || exIdx}
                  className={`w-full p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 ${
                    isCompleted
                      ? isCurrent
                        ? 'bg-emerald-100/80 border-emerald-500 ring-2 ring-emerald-300/70 shadow-sm'
                        : 'bg-emerald-50/75 hover:bg-emerald-100/60 border-emerald-300 shadow-2xs'
                      : isCurrent
                      ? 'bg-sky-50/90 border-sky-400 ring-2 ring-sky-300/60 shadow-sm'
                      : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-sky-300 shadow-2xs'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSubjectExercise(currentSubject.id, exIdx, false);
                      onClose();
                    }}
                    className="flex items-start sm:items-center gap-3 min-w-0 flex-1 text-right cursor-pointer"
                  >
                    <span
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                        isCompleted
                          ? 'bg-emerald-200/80 text-emerald-900'
                          : 'bg-sky-100 text-sky-900'
                      }`}
                    >
                      {ex.exerciseNumber}
                    </span>
                    <h4 className="flex-1 min-w-0 text-base sm:text-lg font-bold text-slate-900 font-amiri leading-relaxed">
                      {plainQ}
                    </h4>
                  </button>

                  <div className="flex items-center justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t border-slate-200/60 sm:border-t-0">
                    {isCompleted ? (
                      <>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            score >= 85
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : score >= 70
                              ? 'bg-sky-100 text-sky-800 border border-sky-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {score}%
                        </span>
                        {!retryStatus.isUnlimited && retryStatus.maxRetries > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded-lg text-[10px] font-mono font-bold border ${
                              canRetry
                                ? 'bg-slate-50 text-slate-600 border-slate-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {canRetry
                              ? `${retryStatus.remainingRetries}/${retryStatus.maxRetries}`
                              : `${retryStatus.usedRetries}/${retryStatus.maxRetries}`}
                          </span>
                        )}
                        {canRetry ? (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSubjectExercise(currentSubject.id, exIdx, true);
                              onClose();
                            }}
                            title={tr('matching_retry_short', 'إعادة التمرين')}
                            aria-label={tr('matching_retry_short', 'إعادة التمرين')}
                            className="w-8 h-8 rounded-xl bg-white hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-300 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <span
                            title={tr('lessons_retry_locked', 'الإعادة مغلقة')}
                            aria-label={tr('lessons_retry_locked', 'الإعادة مغلقة')}
                            className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center"
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSubjectExercise(currentSubject.id, exIdx, false);
                          onClose();
                        }}
                        className="p-1.5 text-slate-400 hover:text-sky-600 cursor-pointer"
                        aria-label={plainQ}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : hasHiddenCompleted ? (
            <div className="text-center py-10 px-4">
              <div className="inline-flex flex-col items-center gap-2 max-w-md mx-auto p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-900">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <p className="text-xs sm:text-sm font-bold leading-relaxed">
                  {tr(
                    'matching_all_completed_hint',
                    'أتممت جميع تمارين هذا الموضوع! اضغط على أيقونة العين أعلاه لإظهارها أو إعادتها.'
                  )}
                </p>
              </div>
            </div>
          ) : isScheduleRestricted && subjects.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="inline-flex flex-col items-center gap-2 max-w-md mx-auto p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900">
                <Lock className="w-6 h-6 text-amber-600" />
                <p className="text-xs sm:text-sm font-bold leading-relaxed">
                  {tr(
                    'schedule_no_unlocked_lessons_desc',
                    'لا توجد دروس مفتوحة حالياً في هذا القسم — تفتح الدروس تلقائياً حسب جدول الدورة اليومي'
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              {tr('matching_modal_empty', 'لا توجد تمارين مضافة في هذا الموضوع حالياً.')}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 mt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          {onOpenAdminCatch && (
            <button
              onClick={() => {
                onClose();
                onOpenAdminCatch();
              }}
              className="text-xs text-sky-700 hover:text-sky-900 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Target className="w-3.5 h-3.5" />
              <span>{tr('catch_admin_manage_link', 'إدارة وإضافة تمارين الصيد في لوحة التحكم')}</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer mr-auto"
          >
            {tr('btn_close', 'إغلاق')}
          </button>
        </div>
      </div>
    </div>
  );
};
