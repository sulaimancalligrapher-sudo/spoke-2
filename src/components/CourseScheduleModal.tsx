import React, { useMemo, useState } from 'react';
import {
  X,
  Calendar,
  Lock,
  CheckCircle2,
  Sparkles,
  Play,
  BookOpen,
  Clock,
} from 'lucide-react';
import {
  WordItem,
  PracticeHistoryItem,
  MatchingLessonSubject,
  MatchingHistoryItem,
  DictationLessonSubject,
  DictationHistoryItem,
  CatchLessonSubject,
  CatchHistoryItem,
  WritingHistoryItem,
  StudentRegistrant,
} from '../types';
import { DrawingTemplate } from '../arWriting/types/drawing';
import { VideoLesson, VideoStudentProgress } from '../video/videoSheets';
import {
  SupportedLang,
  TranslationItem,
  getTranslatedMatchingSubject,
  getTranslatedDictationSubject,
  getTranslatedCatchSubject,
  getTranslatedWritingTopic,
} from '../utils/translations';
import {
  CourseScheduleData,
  CourseScheduleDay,
  SCHEDULE_EXERCISE_META,
  ScheduleLessonRef,
  evaluateScheduledLessonStatus,
  formatScheduleDateLabel,
  getTodayLocalISO,
} from '../utils/courseSchedule';

interface CourseScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: CourseScheduleData;
  currentStudent: StudentRegistrant | null;
  currentLang: SupportedLang;
  translations: TranslationItem[];
  t: (id: string, fallback?: string) => string;
  curriculum: WordItem[];
  studentHistory: PracticeHistoryItem[];
  matchingSubjects: MatchingLessonSubject[];
  matchingHistory: MatchingHistoryItem[];
  dictationSubjects: DictationLessonSubject[];
  dictationHistory: DictationHistoryItem[];
  writingTemplates: DrawingTemplate[];
  writingHistory: WritingHistoryItem[];
  catchSubjects: CatchLessonSubject[];
  catchHistory: CatchHistoryItem[];
  videoLessons: VideoLesson[];
  videoProgressMap: Record<string, VideoStudentProgress>;
  onOpenScheduledLesson: (ref: ScheduleLessonRef) => void;
}

export const CourseScheduleModal: React.FC<CourseScheduleModalProps> = ({
  isOpen,
  onClose,
  schedule,
  currentStudent,
  currentLang,
  translations,
  t,
  curriculum,
  studentHistory,
  matchingSubjects,
  matchingHistory,
  dictationSubjects,
  dictationHistory,
  writingTemplates,
  writingHistory,
  catchSubjects,
  catchHistory,
  videoLessons,
  videoProgressMap,
  onOpenScheduledLesson,
}) => {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const todayISO = getTodayLocalISO();

  const tr = (id: string, fallback: string) => t(id, fallback) || fallback;

  const evalCtx = useMemo(
    () => ({
      curriculum,
      studentHistory,
      matchingSubjects,
      matchingHistory,
      dictationSubjects,
      dictationHistory,
      writingTemplates,
      writingHistory,
      catchSubjects,
      catchHistory,
      videoLessons,
      videoProgressMap,
    }),
    [
      curriculum,
      studentHistory,
      matchingSubjects,
      matchingHistory,
      dictationSubjects,
      dictationHistory,
      writingTemplates,
      writingHistory,
      catchSubjects,
      catchHistory,
      videoLessons,
      videoProgressMap,
    ]
  );

  const enrichedDays = useMemo(() => {
    return schedule.days.map((day) => {
      const group = schedule.groups.find((g) => g.id === day.groupId) || null;
      const lessonsWithStatus = (group?.lessons || []).map((ref) => ({
        ref,
        status: evaluateScheduledLessonStatus(ref, evalCtx),
      }));
      const totalLessons = lessonsWithStatus.length;
      const completedLessons = lessonsWithStatus.filter(
        (l) => l.status.completed
      ).length;
      const isDayCompleted =
        totalLessons > 0 && completedLessons >= totalLessons;
      const isDayPartial =
        !isDayCompleted &&
        lessonsWithStatus.some(
          (l) => l.status.completed || l.status.partial
        );
      const isLocked = Boolean(
        schedule.settings.lockFutureDays && day.date > todayISO
      );

      return {
        day,
        group,
        lessonsWithStatus,
        totalLessons,
        completedLessons,
        isDayCompleted,
        isDayPartial,
        isLocked,
        isToday: day.date === todayISO,
      };
    });
  }, [schedule, evalCtx, todayISO]);

  // Overall progress across all scheduled lessons
  const overallStats = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const item of enrichedDays) {
      total += item.totalLessons;
      done += item.completedLessons;
    }
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [enrichedDays]);

  const todayEntry = useMemo(
    () => enrichedDays.find((d) => d.isToday) || null,
    [enrichedDays]
  );

  const visibleDays = useMemo(() => {
    if (filter === 'upcoming') {
      return enrichedDays.filter((d) => d.day.date >= todayISO);
    }
    if (filter === 'completed') {
      return enrichedDays.filter((d) => d.isDayCompleted);
    }
    return enrichedDays;
  }, [enrichedDays, filter, todayISO]);

  if (!isOpen) return null;

  const getDayTypeBadge = (dayType: CourseScheduleDay['dayType']) => {
    if (dayType === 'review') {
      return {
        label: tr('schedule_type_review', 'مراجعة'),
        cls: 'bg-sky-100 text-sky-900 border-sky-200',
      };
    }
    if (dayType === 'exam') {
      return {
        label: tr('schedule_type_exam', 'امتحان'),
        cls: 'bg-rose-100 text-rose-900 border-rose-200',
      };
    }
    return {
      label: tr('schedule_type_lesson', 'درس عادي'),
      cls: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    };
  };

  const resolveDisplayTopic = (ref: ScheduleLessonRef) => {
    if (ref.exerciseType === 'matching') {
      return getTranslatedMatchingSubject(
        ref.topicName,
        currentLang,
        translations
      );
    }
    if (ref.exerciseType === 'dictation') {
      return getTranslatedDictationSubject(
        ref.topicName,
        currentLang,
        translations
      );
    }
    if (ref.exerciseType === 'catch') {
      return getTranslatedCatchSubject(
        ref.topicName,
        currentLang,
        translations
      );
    }
    if (ref.exerciseType === 'writing') {
      return getTranslatedWritingTopic(
        ref.topicName,
        currentLang,
        translations
      );
    }
    if (ref.exerciseType === 'video' && ref.lessonId) {
      const vl = videoLessons.find((v) => v.id === ref.lessonId);
      if (vl) {
        return tr(`video_lesson_title_${vl.id}`, vl.title);
      }
    }
    return ref.topicName;
  };

  const renderLessonChips = (
    item: (typeof enrichedDays)[number],
    compact = false
  ) => {
    if (item.isLocked) {
      const dLabel = formatScheduleDateLabel(item.day.date, currentLang);
      return (
        <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 flex items-center gap-2 text-xs font-bold text-slate-600">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            {tr('schedule_locked_until', 'مقفل حتى تاريخ')}:{' '}
            {dLabel.formattedDate}
          </span>
        </div>
      );
    }

    if (item.lessonsWithStatus.length === 0) {
      return (
        <div className="text-xs text-slate-400 font-semibold italic">
          —
        </div>
      );
    }

    return (
      <div className={`grid gap-2 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {item.lessonsWithStatus.map(({ ref, status }) => {
          const meta = SCHEDULE_EXERCISE_META[ref.exerciseType];
          const displayTitle = resolveDisplayTopic(ref);
          return (
            <button
              key={ref.key}
              type="button"
              onClick={() => {
                onClose();
                onOpenScheduledLesson(ref);
              }}
              className={`p-3 rounded-2xl border text-right flex items-center justify-between gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                status.completed
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-white border-slate-200 hover:border-indigo-300 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold shrink-0 ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                >
                  {meta.shortAr}
                </span>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                    {displayTitle}
                  </div>
                  {status.totalCount > 1 && (
                    <div className="text-[10px] text-slate-500 font-mono">
                      {status.doneCount} / {status.totalCount}
                    </div>
                  )}
                </div>
              </div>

              {status.completed ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>✓</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-indigo-600 text-white text-[10px] font-extrabold shrink-0">
                  <Play className="w-3 h-3 fill-white" />
                  <span>{tr('schedule_start_btn', 'ابدأ الدرس')}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="bg-slate-50 rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90dvh] overflow-hidden font-cairo">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold truncate">
                {schedule.settings.courseTitle ||
                  tr('schedule_modal_title', 'جدول الدروس اليومي')}
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                {currentStudent
                  ? `${currentStudent.name} · ${tr(
                      'schedule_modal_subtitle',
                      'خطة الدروس والتمارين اليومية مرتبة حسب التاريخ'
                    )}`
                  : tr(
                      'schedule_modal_subtitle',
                      'خطة الدروس والتمارين اليومية مرتبة حسب التاريخ'
                    )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overall Progress & Filter Bar */}
        <div className="p-4 bg-white border-b border-slate-200 space-y-3 shrink-0">
          {overallStats.total > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                <span>
                  {overallStats.done} / {overallStats.total}
                </span>
                <span className="text-emerald-700 font-mono">
                  {overallStats.pct}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${overallStats.pct}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              {tr('schedule_filter_all', 'الكل')} ({enrichedDays.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('upcoming')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                filter === 'upcoming'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              {tr('schedule_filter_upcoming', 'اليوم والقادم')}
            </button>
            <button
              type="button"
              onClick={() => setFilter('completed')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                filter === 'completed'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              {tr('schedule_filter_completed', 'المكتملة')}
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Today Spotlight Card */}
          {todayEntry && filter !== 'completed' && (
            <div className="p-4 rounded-3xl bg-linear-to-br from-emerald-600 to-teal-700 text-white shadow-md space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  <span className="text-sm sm:text-base font-extrabold">
                    {tr('schedule_today_badge', 'درس اليوم')}
                  </span>
                  <span className="text-xs bg-white/20 px-2.5 py-0.5 rounded-lg font-mono">
                    {formatScheduleDateLabel(todayEntry.day.date, currentLang).weekday}{' '}
                    · {formatScheduleDateLabel(todayEntry.day.date, currentLang).formattedDate}
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-lg bg-white text-emerald-900 text-[11px] font-extrabold">
                  {getDayTypeBadge(todayEntry.day.dayType).label}
                </span>
              </div>

              {(todayEntry.day.customTitle || todayEntry.group?.name) && (
                <div className="text-xs sm:text-sm font-bold text-emerald-50">
                  {todayEntry.day.customTitle || todayEntry.group?.name}
                </div>
              )}

              {todayEntry.day.notes && (
                <p className="text-xs bg-black/15 rounded-xl p-2.5 text-emerald-50">
                  {todayEntry.day.notes}
                </p>
              )}

              {renderLessonChips(todayEntry, true)}
            </div>
          )}

          {/* Chronological Day Cards */}
          {visibleDays.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-2">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-500">
                {tr('schedule_no_days', 'لا توجد أيام مجدولة في هذا القسم حالياً')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleDays.map((item) => {
                const dateLabel = formatScheduleDateLabel(
                  item.day.date,
                  currentLang
                );
                const typeBadge = getDayTypeBadge(item.day.dayType);

                return (
                  <div
                    key={item.day.id}
                    className={`p-4 rounded-3xl border space-y-3 transition-all ${
                      item.isToday
                        ? 'bg-emerald-50/50 border-emerald-300 shadow-xs'
                        : item.isLocked
                        ? 'bg-slate-100/70 border-slate-200 opacity-85'
                        : 'bg-white border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-extrabold">
                          {dateLabel.weekday}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-600">
                          {dateLabel.formattedDate}
                        </span>
                        {item.isToday && (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold">
                            {tr('schedule_today_badge', 'درس اليوم')}
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-extrabold ${typeBadge.cls}`}
                        >
                          {typeBadge.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {item.isDayCompleted && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-extrabold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{tr('schedule_completed_badge', 'مكتمل')}</span>
                          </span>
                        )}
                        {item.isDayPartial && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-extrabold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {tr('schedule_partial_badge', 'قيد التقدم')}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {(item.day.customTitle || item.group?.name) && (
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                        {item.day.customTitle || item.group?.name}
                      </div>
                    )}

                    {item.day.notes && (
                      <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        {item.day.notes}
                      </div>
                    )}

                    {renderLessonChips(item)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
