import React, { useMemo, useState } from 'react';
import {
  X,
  Film,
  CheckCircle2,
  Clock,
  RotateCcw,
  Award,
  RefreshCw,
  Eye,
  EyeOff,
  Lock,
  Play,
  Image as ImageIcon,
  Mic,
} from 'lucide-react';
import { StudentRegistrant } from '../../types';
import { SupportedLang } from '../../utils/translations';
import {
  VideoLesson,
  VideoStudentProgress,
  consumeVideoRetryAttempt,
  evaluateVideoLessonCompletion,
  getVideoLessonScheduleStatus,
  getVideoRemainingRetries,
} from '../videoSheets';

interface VideoLessonsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessons: VideoLesson[];
  activeLessonId: string;
  progressMap: Record<string, VideoStudentProgress>;
  currentStudent?: StudentRegistrant | null;
  webhookUrl: string;
  onSelectLesson: (lessonId: string, isRetry?: boolean) => void;
  onOpenCorrections: () => void;
  onOpenLessonCorrection?: (lessonTitle: string) => void;
  onRefreshLessons: () => void;
  onUpdateProgress: (lessonId: string, nextProgress: VideoStudentProgress) => void;
  t?: (id: string, fallback?: string) => string;
  currentLang?: SupportedLang;
  isScheduleRestricted?: boolean;
}

export const VideoLessonsModal: React.FC<VideoLessonsModalProps> = ({
  isOpen,
  onClose,
  lessons,
  activeLessonId,
  progressMap,
  currentStudent,
  webhookUrl,
  onSelectLesson,
  onOpenCorrections,
  onOpenLessonCorrection,
  onRefreshLessons,
  onUpdateProgress,
  t,
  isScheduleRestricted = false,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);

  const [selectedTopic, setSelectedTopic] = useState<string>('ALL');
  const [hideCompleted, setHideCompleted] = useState<boolean>(true);
  const [confirmRetryLessonId, setConfirmRetryLessonId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const completedCount = useMemo(() => {
    return lessons.filter((l) => evaluateVideoLessonCompletion(l, progressMap[l.id]).isFullyCompleted).length;
  }, [lessons, progressMap]);

  const topics = useMemo(() => {
    const set = new Set<string>();
    lessons.forEach((l) => {
      if (l.topic) set.add(l.topic);
    });
    return Array.from(set);
  }, [lessons]);

  const filteredLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (selectedTopic !== 'ALL' && l.topic !== selectedTopic) return false;
      const prog = progressMap[l.id];
      if (hideCompleted && evaluateVideoLessonCompletion(l, prog).isFullyCompleted) return false;
      return true;
    });
  }, [lessons, selectedTopic, hideCompleted, progressMap]);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshLessons();
    } finally {
      setTimeout(() => setRefreshing(false), 350);
    }
  };

  const handleConfirmRetry = async (lesson: VideoLesson) => {
    const existing: VideoStudentProgress = progressMap[lesson.id] || {
      lessonId: lesson.id,
      topic: lesson.topic,
      title: lesson.title,
      completed: 'تم',
      videoScore: 0,
      explainAudioScore: 0,
      answeredQuestions: {},
      retryResetCount: lesson.retryCount,
    };

    const res = await consumeVideoRetryAttempt(webhookUrl, {
      studentId: currentStudent?.id || '',
      studentName: currentStudent?.name || '',
      lesson,
      currentProgress: existing,
    });

    onUpdateProgress(lesson.id, res.updatedProgress);
    setConfirmRetryLessonId(null);
    onSelectLesson(lesson.id, true);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs font-cairo animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90dvh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#0c3868] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Film className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                {tr('video_modal_title', 'دروس الفيديو التفاعلي')}
              </h3>
              <p className="hidden sm:block text-xs text-blue-100 truncate">
                {tr(
                  'video_modal_subtitle',
                  'شاهد الدرس وأجب على الأسئلة الزمنية وسلم واجبك المصور أو الصوتي'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title={tr('video_refresh_list', 'تحديث القائمة')}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title={tr('video_close', 'إغلاق')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="w-auto max-w-[165px] sm:max-w-[230px] px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[36px] sm:min-h-[38px] truncate"
            >
              <option value="ALL">{tr('video_all_topics', 'جميع المواضيع')}</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {tr(`video_topic_${topic}`, topic)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setHideCompleted((prev) => !prev)}
              title={
                hideCompleted
                  ? `${tr('video_show_completed', 'إظهار المكتملة')} (${completedCount})`
                  : `${tr('video_hide_completed', 'إخفاء المكتملة')} (${completedCount})`
              }
              aria-label={
                hideCompleted
                  ? `${tr('video_show_completed', 'إظهار المكتملة')} (${completedCount})`
                  : `${tr('video_hide_completed', 'إخفاء المكتملة')} (${completedCount})`
              }
              className={`px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[36px] sm:min-h-[38px] shrink-0 ${
                !hideCompleted
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {hideCompleted ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="hidden sm:inline">
                {hideCompleted
                  ? `${tr('video_show_completed', 'إظهار المكتملة')} (${completedCount})`
                  : `${tr('video_hide_completed', 'إخفاء المكتملة')} (${completedCount})`}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCorrections();
            }}
            title={tr('video_teacher_corrections_btn', 'تصحيح المعلم')}
            aria-label={tr('video_teacher_corrections_btn', 'تصحيح المعلم')}
            className="px-2.5 sm:px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[36px] sm:min-h-[38px] shrink-0"
          >
            <Award className="w-4 h-4 text-amber-600" />
            <span className="hidden sm:inline">{tr('video_teacher_corrections_btn', 'تصحيح المعلم')}</span>
          </button>
        </div>

        {/* Lessons List */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-2.5 sm:space-y-3">
          {filteredLessons.length === 0 ? (
            <div className="text-center py-12 px-4 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div>
                {hideCompleted && completedCount > 0
                  ? tr('video_all_completed_hidden', 'أحسنت! تم إكمال جميع الدروس المتاحة حالياً وإخفاؤها من القائمة.')
                  : isScheduleRestricted && lessons.length === 0
                  ? tr(
                      'schedule_no_unlocked_lessons_desc',
                      'لا توجد دروس مفتوحة حالياً في هذا القسم — تفتح الدروس تلقائياً حسب جدول الدورة اليومي'
                    )
                  : tr('video_no_matching_lessons', 'لا توجد دروس فيديو مطابقة للتصفية الحالية.')}
              </div>
              {hideCompleted && completedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setHideCompleted(false)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{tr('video_show_completed_btn', 'عرض الدروس المكتملة')} ({completedCount})</span>
                </button>
              )}
            </div>
          ) : (
            filteredLessons.map((lesson) => {
              const prog = progressMap[lesson.id];
              const evalRes = evaluateVideoLessonCompletion(lesson, prog);
              const isCompleted = evalRes.isFullyCompleted;
              const isPartial = !isCompleted && evalRes.hasAnyProgress;
              const schedule = getVideoLessonScheduleStatus(lesson);
              const isActive = activeLessonId === lesson.id;
              const remainingRetries = getVideoRemainingRetries(lesson, currentStudent, prog);
              const isConfirmingRetry = confirmRetryLessonId === lesson.id;
              const totalQs = lesson.questions.length + lesson.audioQuestions.length;

              const missingTextParts: string[] = [];
              if (isPartial) {
                if (!evalRes.videoDone) missingTextParts.push(tr('video_part_video_qs', 'الفيديو والأسئلة'));
                if (evalRes.imageRequired && !evalRes.imageDone) missingTextParts.push(tr('video_tab_image_hw', 'واجب الصورة'));
                if (evalRes.audioRequired && !evalRes.audioDone) missingTextParts.push(tr('video_tab_audio_hw', 'الواجب الصوتي'));
              }

              return (
                <div
                  key={lesson.id}
                  className={`rounded-2xl border p-3.5 sm:p-4 transition-all ${
                    !schedule.isAvailable
                      ? 'bg-slate-50 border-slate-200 opacity-75'
                      : isActive
                      ? 'bg-indigo-50/70 border-indigo-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                        <span className="text-indigo-700">
                          {tr(`video_topic_${lesson.topic}`, lesson.topic)}
                        </span>
                        {schedule.effectiveEndDate && (
                          <span className="hidden sm:inline text-slate-400">
                            • {tr('video_ends_on', 'ينتهي:')} {schedule.effectiveEndDate}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug">
                        {tr(`video_title_${lesson.id}`, lesson.title)}
                      </h4>

                      {isPartial && missingTextParts.length > 0 && (
                        <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-block">
                          {tr('video_remaining_label', 'متبقي:')} {missingTextParts.join(' • ')}
                        </div>
                      )}

                      <div className="hidden sm:flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-0.5">
                        {totalQs > 0 && (
                          <span className="flex items-center gap-1 font-semibold">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{totalQs} {tr('video_interactive_qs_label', 'أسئلة تفاعلية')}</span>
                          </span>
                        )}
                        {lesson.allowUpload !== 'لا' && (
                          <span className="flex items-center gap-1 font-semibold">
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{tr('video_photo_hw_label', 'واجب صورة')}</span>
                          </span>
                        )}
                        {lesson.allowRecording !== 'لا' && (
                          <span className="flex items-center gap-1 font-semibold">
                            <Mic className="w-3.5 h-3.5 text-amber-600" />
                            <span>{tr('video_audio_hw_label', 'تسجيل صوتي')}</span>
                          </span>
                        )}
                        {prog && prog.videoScore > 0 && (
                          <span className="font-extrabold text-indigo-700">
                            {tr('video_score_label', 'الدرجة:')} {prog.videoScore}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {!schedule.isAvailable ? (
                        <span className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          <span>
                            {schedule.reason === 'expired'
                              ? tr('video_status_expired', 'منتهي الصلاحية')
                              : tr('video_status_not_started', 'لم يبدأ بعد')}
                          </span>
                        </span>
                      ) : isCompleted ? (
                        <>
                          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-extrabold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{tr('video_status_completed', 'مكتمل')}</span>
                          </span>

                          {remainingRetries > 0 && !isConfirmingRetry && (
                            <button
                              type="button"
                              onClick={() => setConfirmRetryLessonId(lesson.id)}
                              className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>
                                {tr('video_retry_btn', 'إعادة')} ({remainingRetries})
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              if (onOpenLessonCorrection) {
                                onOpenLessonCorrection(lesson.title);
                              } else {
                                onOpenCorrections();
                              }
                            }}
                            className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer min-h-[38px] whitespace-nowrap shrink-0"
                          >
                            <Award className="w-3.5 h-3.5 text-amber-600" />
                            <span>{tr('video_teacher_corrections_btn', 'تصحيح المعلم')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onSelectLesson(lesson.id, false)}
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer min-h-[38px]"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>{tr('video_view_lesson', 'عرض الدرس')}</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${
                              isPartial
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {isPartial ? tr('video_status_incomplete', 'غير مكتمل') : tr('video_status_new', 'جديد')}
                          </span>
                          <button
                            type="button"
                            onClick={() => onSelectLesson(lesson.id, false)}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer min-h-[38px] sm:min-h-[40px]"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>
                              {isPartial
                                ? tr('video_continue_lesson', 'أكمل الدرس')
                                : tr('video_start_lesson', 'ابدأ الدرس')}
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isConfirmingRetry && (
                    <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-amber-950">
                        {tr('video_retry_confirm_msg', 'هل تريد إعادة حل هذا الدرس؟ سيتم خصم محاولة من رصيد الإعادة')} ({remainingRetries}).
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmRetryLessonId(null)}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold cursor-pointer"
                        >
                          {tr('video_cancel', 'إلغاء')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConfirmRetry(lesson)}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold cursor-pointer"
                        >
                          {tr('video_confirm_retry', 'تأكيد الإعادة')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
