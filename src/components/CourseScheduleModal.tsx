import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Calendar,
  Lock,
  CheckCircle2,
  Sparkles,
  Play,
  BookOpen,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  ListChecks,
  AlertCircle,
  FileText,
  Award,
  Printer,
  Download,
  Loader2,
  Star,
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
  PdfReportSettings,
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
  AttendanceRecord,
  CourseGroup,
  CourseScheduleData,
  CourseScheduleDay,
  DEFAULT_PDF_REPORT_SETTINGS,
  PROGRAM_COLOR_META,
  SCHEDULE_DAY_TYPE_META,
  SCHEDULE_EXERCISE_META,
  ScheduleLessonRef,
  ScheduledLessonProgressStatus,
  buildCertificateHtml,
  buildFullReportHtml,
  buildStudentFullReportSummary,
  evaluateScheduledLessonStatus,
  evaluateStudentPdfAccess,
  formatScheduleDateLabel,
  getScheduleForProgram,
  getTodayLocalISO,
  normalizeCourseScheduleData,
  printHtmlViaIframe,
} from '../utils/courseSchedule';

export interface PdfPreviewModalProps {
  isOpen: boolean;
  title: string;
  html: string;
  orientation?: 'portrait' | 'landscape';
  onClose: () => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  isOpen,
  title,
  html,
  orientation = 'portrait',
  onClose,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen) return null;

  const handlePrintPdf = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      await printHtmlViaIframe(html);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadHtml = () => {
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(title || 'report').replace(/[^\w\u0600-\u06FF-]+/g, '_')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div className="bg-slate-100 rounded-3xl max-w-5xl w-full h-[92dvh] shadow-2xl border border-slate-300 flex flex-col overflow-hidden font-cairo">
        <div className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold truncate">{title}</h3>
              <p className="text-[11px] text-slate-300">
                معاينة A4 ({orientation === 'landscape' ? 'أفقي Landscape' : 'عمودي Portrait'}) · اختر «حفظ بتنسيق PDF» من نافذة الطباعة
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تنزيل HTML</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              disabled={isPrinting}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>{isPrinting ? 'جاري التحضير...' : 'طباعة / حفظ كـ PDF'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-2 sm:p-4 overflow-hidden bg-slate-200/80">
          <iframe
            title={title}
            srcDoc={html}
            className="w-full h-full bg-white rounded-2xl shadow-lg border border-slate-300"
          />
        </div>
      </div>
    </div>
  );
};

interface CourseScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: CourseScheduleData;
  currentStudent: StudentRegistrant | null;
  isAdminAuthenticated?: boolean;
  initialProgramId?: string;
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
  pdfSettings?: PdfReportSettings;
  attendanceRecords?: AttendanceRecord[];
  homeLogoUrl?: string;
  platformTitle?: string;
}

type ScheduleTab = 'calendar' | 'days' | 'report';

interface EnrichedGroupLessons {
  group: CourseGroup;
  lessons: {
    ref: ScheduleLessonRef;
    status: ScheduledLessonProgressStatus;
  }[];
}

interface EnrichedDayItem {
  day: CourseScheduleDay;
  groups: CourseGroup[];
  groupedLessons: EnrichedGroupLessons[];
  lessonsWithStatus: {
    ref: ScheduleLessonRef;
    status: ScheduledLessonProgressStatus;
  }[];
  totalLessons: number;
  completedLessons: number;
  isDayCompleted: boolean;
  isDayPartial: boolean;
  isLocked: boolean;
  isToday: boolean;
}

const ARABIC_MONTH_NAMES = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const CALENDAR_WEEK_HEADERS: Record<SupportedLang, string[]> = {
  ar: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
  th: ['ส.', 'อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.'],
  en: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
};

export const CourseScheduleModal: React.FC<CourseScheduleModalProps> = ({
  isOpen,
  onClose,
  schedule,
  currentStudent,
  isAdminAuthenticated = false,
  initialProgramId,
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
  pdfSettings = DEFAULT_PDF_REPORT_SETTINGS,
  attendanceRecords = [],
  homeLogoUrl,
  platformTitle,
}) => {
  const [activeTab, setActiveTab] = useState<ScheduleTab>('calendar');
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);
  const [adminSelectedProgramId, setAdminSelectedProgramId] = useState<string>(
    initialProgramId || ''
  );
  const [pdfPreview, setPdfPreview] = useState<{
    title: string;
    html: string;
    orientation: 'portrait' | 'landscape';
  } | null>(null);
  const todayISO = getTodayLocalISO();

  useEffect(() => {
    if (isOpen && isAdminAuthenticated) {
      setAdminSelectedProgramId(initialProgramId || '');
    }
  }, [isOpen, isAdminAuthenticated, initialProgramId]);

  const normalizedSchedule = useMemo(
    () => normalizeCourseScheduleData(schedule),
    [schedule]
  );

  const effectiveProgramId = isAdminAuthenticated
    ? adminSelectedProgramId || initialProgramId
    : currentStudent?.programId;

  const { programs, activeProgram, scopedSchedule } = useMemo(
    () => getScheduleForProgram(normalizedSchedule, effectiveProgramId),
    [normalizedSchedule, effectiveProgramId]
  );

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

  const enrichedDays: EnrichedDayItem[] = useMemo(() => {
    return scopedSchedule.days.map((day) => {
      const gIds = day.groupIds?.length
        ? day.groupIds
        : day.groupId
        ? [day.groupId]
        : [];
      const groups = gIds
        .map((gid) => scopedSchedule.groups.find((g) => g.id === gid))
        .filter((g): g is CourseGroup => Boolean(g));

      const groupedLessons: EnrichedGroupLessons[] = groups.map((group) => ({
        group,
        lessons: (group.lessons || []).map((ref) => ({
          ref,
          status: evaluateScheduledLessonStatus(ref, evalCtx),
        })),
      }));

      const lessonsWithStatus = groupedLessons.flatMap((gl) => gl.lessons);
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
        !isAdminAuthenticated && scopedSchedule.settings.lockFutureDays && day.date > todayISO
      );

      return {
        day,
        groups,
        groupedLessons,
        lessonsWithStatus,
        totalLessons,
        completedLessons,
        isDayCompleted,
        isDayPartial,
        isLocked,
        isToday: day.date === todayISO,
      };
    });
  }, [scopedSchedule, evalCtx, todayISO, isAdminAuthenticated]);

  const enrichedByDate = useMemo(() => {
    const map = new Map<string, EnrichedDayItem>();
    for (const item of enrichedDays) {
      map.set(item.day.date, item);
    }
    return map;
  }, [enrichedDays]);

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

  // Calendar Month State + Selected Day State
  const initialCalendarDate = useMemo(() => {
    const todayEntry = enrichedDays.find((d) => d.isToday);
    if (todayEntry) return todayEntry.day.date;
    const upcoming = enrichedDays.find((d) => d.day.date >= todayISO);
    if (upcoming) return upcoming.day.date;
    return enrichedDays[0]?.day.date || todayISO;
  }, [enrichedDays, todayISO]);

  const [calMonth, setCalMonth] = useState<{ year: number; month: number }>(() => {
    const [y, m] = initialCalendarDate.split('-').map(Number);
    return { year: y || new Date().getFullYear(), month: (m || 1) - 1 };
  });
  const [selectedCalDate, setSelectedCalDate] = useState<string>(initialCalendarDate);

  useEffect(() => {
    if (isOpen) {
      setExpandedDayId(null);
      if (initialCalendarDate) {
        const [y, m] = initialCalendarDate.split('-').map(Number);
        setCalMonth({ year: y, month: m - 1 });
        setSelectedCalDate(initialCalendarDate);
      }
    }
  }, [isOpen, initialCalendarDate]);

  // Past + Today items for Report Tab
  const reportDays = useMemo(() => {
    return enrichedDays
      .filter((d) => d.day.date <= todayISO)
      .slice()
      .reverse();
  }, [enrichedDays, todayISO]);

  const reportSummary = useMemo(() => {
    let completedLessons = 0;
    let partialLessons = 0;
    let notStartedLessons = 0;
    for (const item of reportDays) {
      for (const l of item.lessonsWithStatus) {
        if (l.status.completed) completedLessons++;
        else if (l.status.partial) partialLessons++;
        else notStartedLessons++;
      }
    }
    return {
      pastDaysCount: reportDays.length,
      completedLessons,
      partialLessons,
      notStartedLessons,
    };
  }, [reportDays]);

  const studentFullSummary = useMemo(
    () =>
      buildStudentFullReportSummary({
        student: {
          id: currentStudent?.id || (isAdminAuthenticated ? 'معاينة' : '—'),
          name: currentStudent?.name || (isAdminAuthenticated ? 'طالب (معاينة المعلم)' : 'طالب'),
          programId: activeProgram.id,
        },
        schedule: normalizedSchedule,
        attendanceRecords,
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
      currentStudent,
      isAdminAuthenticated,
      activeProgram.id,
      normalizedSchedule,
      attendanceRecords,
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

  const studentPdfAccess = useMemo(
    () =>
      evaluateStudentPdfAccess({
        pdfSettings,
        student: currentStudent,
        isAdmin: isAdminAuthenticated,
        scheduleCompletionPct: overallStats.pct,
        todayISO,
      }),
    [pdfSettings, currentStudent, isAdminAuthenticated, overallStats.pct, todayISO]
  );

  // Build calendar cells for current month (Saturday-first grid: 6,0,1,2,3,4,5)
  const calendarGridCells = useMemo(() => {
    const firstDay = new Date(calMonth.year, calMonth.month, 1, 12, 0, 0);
    const daysInMonth = new Date(calMonth.year, calMonth.month + 1, 0).getDate();
    // Convert JS getDay() (0=Sun..6=Sat) to Saturday-first index (0=Sat,1=Sun..6=Fri)
    const startOffset = (firstDay.getDay() + 1) % 7;

    const cells: { iso: string | null; dayNum: number | null }[] = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ iso: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${calMonth.year}-${String(calMonth.month + 1).padStart(
        2,
        '0'
      )}-${String(d).padStart(2, '0')}`;
      cells.push({ iso, dayNum: d });
    }
    return cells;
  }, [calMonth]);

  if (!isOpen) return null;

  const getDayTypeBadge = (dayType: CourseScheduleDay['dayType']) => {
    const meta = SCHEDULE_DAY_TYPE_META[dayType];
    if (dayType === 'review') {
      return {
        label: tr('schedule_type_review', 'مراجعة'),
        cls: `${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`,
        meta,
      };
    }
    if (dayType === 'exam') {
      return {
        label: tr('schedule_type_exam', 'امتحان'),
        cls: `${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`,
        meta,
      };
    }
    return {
      label: tr('schedule_type_lesson', 'درس عادي'),
      cls: `${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`,
      meta,
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

  /**
   * Renders full day content:
   * - If future-locked: shows lock notice banner PLUS visible read-only preview of all groups and topics!
   * - If unlocked: shows clickable exercise buttons grouped cleanly by CourseGroup.
   */
  const renderDayLessonsContent = (item: EnrichedDayItem) => {
    const dLabel = formatScheduleDateLabel(item.day.date, currentLang);

    return (
      <div className="space-y-3">
        {item.day.customTitle && (
          <div className="text-xs sm:text-sm font-extrabold text-slate-900">
            {item.day.customTitle}
          </div>
        )}

        {item.day.notes && (
          <div className="text-xs text-slate-700 bg-white/80 border border-slate-200 rounded-xl p-2.5">
            {item.day.notes}
          </div>
        )}

        {item.isLocked && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 flex items-center gap-2 text-xs font-extrabold text-amber-950">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              {tr(
                'schedule_locked_msg',
                'لا يمكن الدخول إلى التمارين حتى يأتي يوم الدرس المحدد'
              )}{' '}
              ({dLabel.formattedDate})
            </span>
          </div>
        )}

        {item.groupedLessons.length === 0 ? (
          <div className="text-xs text-slate-400 font-semibold italic py-2">
            لا توجد مجموعات مضافة لهذا اليوم.
          </div>
        ) : (
          <div className="space-y-3">
            {item.groupedLessons.map(({ group, lessons }) => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{group.name}</span>
                  </div>
                  {group.description && (
                    <span className="text-[11px] text-slate-500 truncate">
                      {group.description}
                    </span>
                  )}
                </div>

                {lessons.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic">—</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {lessons.map(({ ref, status }) => {
                      const meta = SCHEDULE_EXERCISE_META[ref.exerciseType];
                      const displayTitle = resolveDisplayTopic(ref);

                      if (item.isLocked) {
                        return (
                          <div
                            key={`${group.id}_${ref.key}`}
                            aria-disabled="true"
                            className="p-3 rounded-2xl border border-slate-200 bg-slate-100/80 text-right flex items-center justify-between gap-2 opacity-85 cursor-not-allowed select-none"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold shrink-0 ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                              >
                                {meta.shortAr}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-extrabold text-slate-700 truncate">
                                  {displayTitle}
                                </div>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-200 text-slate-600 text-[10px] font-extrabold shrink-0">
                              <Lock className="w-3 h-3" />
                            </span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={`${group.id}_${ref.key}`}
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenScheduledLesson(ref);
                          }}
                          className={`p-3 rounded-2xl border text-right flex items-center justify-between gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                            status.completed
                              ? 'bg-emerald-50/90 border-emerald-300'
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
                              <span>{tr('schedule_start_btn', 'فتح التمرين')}</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const selectedCalendarItem = enrichedByDate.get(selectedCalDate) || null;
  const calMonthTitle =
    currentLang === 'ar'
      ? `${ARABIC_MONTH_NAMES[calMonth.month]} ${calMonth.year}`
      : new Intl.DateTimeFormat(currentLang === 'th' ? 'th-TH' : 'en-US', {
          month: 'long',
          year: 'numeric',
        }).format(new Date(calMonth.year, calMonth.month, 1));

  const handleShiftMonth = (delta: number) => {
    const dt = new Date(calMonth.year, calMonth.month + delta, 1, 12, 0, 0);
    setCalMonth({ year: dt.getFullYear(), month: dt.getMonth() });
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
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold truncate">
                  {scopedSchedule.settings.courseTitle ||
                    tr('schedule_modal_title', 'جدول الدروس اليومي')}
                </h2>
                {programs.length > 1 && (
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${
                      PROGRAM_COLOR_META[activeProgram.color || 'emerald'].pillBg
                    } ${PROGRAM_COLOR_META[activeProgram.color || 'emerald'].pillText} ${
                      PROGRAM_COLOR_META[activeProgram.color || 'emerald'].pillBorder
                    }`}
                  >
                    {activeProgram.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                {currentStudent
                  ? `${currentStudent.name} · ${tr(
                      'schedule_modal_subtitle',
                      'تابع خطة الدورة حسب التاريخ وافتح تمارين كل يوم مباشرة'
                    )}`
                  : tr(
                      'schedule_modal_subtitle',
                      'تابع خطة الدورة حسب التاريخ وافتح تمارين كل يوم مباشرة'
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

        {/* Admin Preview Program Switcher when > 1 program exists */}
        {isAdminAuthenticated && programs.length > 1 && (
          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-[11px] font-extrabold text-slate-600">
              معاينة برنامج:
            </span>
            {programs.map((prog) => {
              const isAct = prog.id === activeProgram.id;
              const pCol = PROGRAM_COLOR_META[prog.color || 'emerald'];
              return (
                <button
                  key={prog.id}
                  type="button"
                  onClick={() => setAdminSelectedProgramId(prog.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer ${
                    isAct
                      ? pCol.activeBtn
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {prog.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Overall Progress & 3 Main Tabs */}
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

          {/* 3 Main Tabs: التقويم | أيام الدروس | تقرير */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{tr('schedule_tab_calendar', 'التقويم')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('days')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'days'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span>
                {tr('schedule_tab_days', 'أيام الدروس')} ({enrichedDays.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'report'
                  ? 'bg-white text-amber-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{tr('schedule_tab_report', 'تقرير')}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {enrichedDays.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-2">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-500">
                {tr('schedule_no_days', 'لم يتم إضافة أيام في جدول الدروس بعد.')}
              </p>
            </div>
          ) : (
            <>
              {/* ==================================================
                  TAB 1: CALENDAR GRID + SELECTED DAY DETAILS
                 ================================================== */}
              {activeTab === 'calendar' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-2xs space-y-3">
                    {/* Month Nav */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleShiftMonth(-1)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="الشهر السابق"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <div className="text-sm sm:text-base font-extrabold text-slate-900">
                        {calMonthTitle}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleShiftMonth(1)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="الشهر التالي"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {(CALENDAR_WEEK_HEADERS[currentLang] || CALENDAR_WEEK_HEADERS.ar).map(
                        (wd) => (
                          <div
                            key={wd}
                            className="py-1 text-[10px] sm:text-xs font-extrabold text-slate-500"
                          >
                            {wd}
                          </div>
                        )
                      )}
                    </div>

                    {/* Calendar Cells */}
                    <div className="grid grid-cols-7 gap-1.5">
                      {calendarGridCells.map((cell, idx) => {
                        if (!cell.iso || !cell.dayNum) {
                          return <div key={`empty_${idx}`} className="h-12 sm:h-14" />;
                        }
                        const schedItem = enrichedByDate.get(cell.iso);
                        const isTodayCell = cell.iso === todayISO;
                        const isSelected = cell.iso === selectedCalDate;

                        if (!schedItem) {
                          return (
                            <div
                              key={cell.iso}
                              className={`h-12 sm:h-14 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col items-center justify-center text-xs font-mono text-slate-400 ${
                                isTodayCell ? 'ring-2 ring-emerald-400 font-extrabold text-emerald-700' : ''
                              }`}
                            >
                              {cell.dayNum}
                            </div>
                          );
                        }

                        const typeMeta = SCHEDULE_DAY_TYPE_META[schedItem.day.dayType];
                        return (
                          <button
                            key={cell.iso}
                            type="button"
                            onClick={() => setSelectedCalDate(cell.iso!)}
                            className={`h-12 sm:h-14 rounded-xl border-2 p-1 flex flex-col items-center justify-between transition-all cursor-pointer ${typeMeta.calBg} ${
                              isSelected
                                ? 'ring-2 ring-slate-900 scale-[1.03] shadow-sm'
                                : isTodayCell
                                ? 'ring-2 ring-emerald-600'
                                : ''
                            }`}
                          >
                            <div className="w-full flex items-center justify-between px-0.5">
                              <span className="text-xs font-mono font-extrabold">
                                {cell.dayNum}
                              </span>
                              {schedItem.isDayCompleted ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : schedItem.isLocked ? (
                                <Lock className="w-3 h-3 text-amber-700 shrink-0" />
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1">
                              <span
                                className={`w-2 h-2 rounded-full ${typeMeta.dotBg}`}
                              />
                              {schedItem.groups.length > 0 && (
                                <span className="text-[9px] font-extrabold leading-none">
                                  {schedItem.groups.length > 1
                                    ? `${schedItem.groups.length}م`
                                    : `${schedItem.totalLessons}`}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Day Type Legend */}
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2 border-t border-slate-100 text-[11px] font-bold">
                      <span className="inline-flex items-center gap-1.5 text-emerald-900">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        {tr('schedule_type_lesson', 'درس عادي')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sky-900">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                        {tr('schedule_type_review', 'مراجعة')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-rose-900">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        {tr('schedule_type_exam', 'امتحان')}
                      </span>
                    </div>
                  </div>

                  {/* Selected Day Details Card */}
                  {selectedCalendarItem ? (
                    (() => {
                      const dLabel = formatScheduleDateLabel(
                        selectedCalendarItem.day.date,
                        currentLang
                      );
                      const typeBadge = getDayTypeBadge(
                        selectedCalendarItem.day.dayType
                      );
                      return (
                        <div
                          className={`p-4 rounded-3xl border-2 space-y-3 ${typeBadge.meta.cardBg} ${typeBadge.meta.cardBorder}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-3 py-1 rounded-xl bg-slate-900 text-white text-xs font-extrabold">
                                {dLabel.weekday}
                              </span>
                              <span className="text-xs font-mono font-extrabold text-slate-700">
                                {dLabel.formattedDate}
                              </span>
                              {selectedCalendarItem.isToday && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold">
                                  <Sparkles className="w-3 h-3" />
                                  {tr('schedule_today_badge', 'درس اليوم')}
                                </span>
                              )}
                              <span
                                className={`px-2.5 py-0.5 rounded-lg border text-[11px] font-extrabold ${typeBadge.cls}`}
                              >
                                {typeBadge.label}
                              </span>
                            </div>

                            {selectedCalendarItem.isDayCompleted && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-extrabold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{tr('schedule_completed_badge', 'مكتمل ✓')}</span>
                              </span>
                            )}
                          </div>

                          {renderDayLessonsContent(selectedCalendarItem)}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="p-4 rounded-2xl bg-white border border-slate-200 text-center text-xs font-bold text-slate-500">
                      {tr(
                        'schedule_select_day_hint',
                        'اضغط على أي يوم ملوّن في التقويم لعرض تفاصيله ومجموعاته.'
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ==================================================
                  TAB 2: SINGLE-OPEN ACCORDION LESSON DAYS
                 ================================================== */}
              {activeTab === 'days' && (
                <div className="space-y-2.5">
                  {enrichedDays.map((item) => {
                    const dateLabel = formatScheduleDateLabel(
                      item.day.date,
                      currentLang
                    );
                    const typeBadge = getDayTypeBadge(item.day.dayType);
                    const isOpenAccordion = expandedDayId === item.day.id;

                    return (
                      <div
                        key={item.day.id}
                        className={`rounded-2xl border-2 overflow-hidden transition-all ${typeBadge.meta.cardBg} ${typeBadge.meta.cardBorder} ${
                          item.isToday ? 'ring-2 ring-emerald-500' : ''
                        }`}
                      >
                        {/* Accordion Summary Header (Day + Date + Type + Status) */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDayId((prev) =>
                              prev === item.day.id ? null : item.day.id
                            )
                          }
                          className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-2 text-right cursor-pointer hover:bg-white/40 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-extrabold shrink-0">
                              {dateLabel.weekday}
                            </span>
                            <span className="text-xs font-mono font-extrabold text-slate-800 shrink-0">
                              {dateLabel.formattedDate}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold shrink-0 ${typeBadge.cls}`}
                            >
                              {typeBadge.label}
                            </span>
                            {item.isToday && (
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold shrink-0">
                                {tr('schedule_today_badge', 'درس اليوم')}
                              </span>
                            )}
                            {item.groups.length > 0 && (
                              <span className="text-[11px] font-bold text-slate-600 truncate">
                                · {item.groups.map((g) => g.name).join(' + ')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.isDayCompleted ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : item.isLocked ? (
                              <Lock className="w-4 h-4 text-amber-700" />
                            ) : item.isDayPartial ? (
                              <Clock className="w-4 h-4 text-amber-600" />
                            ) : null}

                            <div className="w-7 h-7 rounded-lg bg-white/80 border border-slate-200 flex items-center justify-center text-slate-700">
                              {isOpenAccordion ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </div>
                          </div>
                        </button>

                        {/* Expanded Body (only 1 open at a time) */}
                        {isOpenAccordion && (
                          <div className="px-3.5 sm:px-4 pb-4 pt-2 border-t border-slate-200/70">
                            {renderDayLessonsContent(item)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ==================================================
                  TAB 3: PAST & TODAY ACHIEVEMENT REPORT + PDF EXPORT
                 ================================================== */}
              {activeTab === 'report' && (
                <div className="space-y-4">
                  {/* End-of-Program 10-Star Summary & PDF Report / Certificate Card */}
                  <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 text-white rounded-3xl p-4 sm:p-5 shadow-md space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-white/15 text-[11px] font-extrabold text-emerald-100">
                          <FileText className="w-3.5 h-3.5" />
                          <span>تقرير نهاية البرنامج الشامل والشهادة</span>
                        </div>
                        <h3 className="text-base sm:text-lg font-extrabold">
                          {studentFullSummary.encouragementTitle}
                        </h3>
                        <p className="text-xs text-emerald-100/90 leading-relaxed">
                          {studentFullSummary.encouragementMessage}
                        </p>
                      </div>

                      <div className="px-4 py-2.5 rounded-2xl bg-white/10 border border-white/20 text-center shrink-0">
                        <div className="text-2xl font-extrabold font-mono">
                          {studentFullSummary.overallPct}%
                        </div>
                        <div className="text-[11px] font-bold text-amber-300">
                          {studentFullSummary.gradeLabelAr}
                        </div>
                      </div>
                    </div>

                    {/* 10-Star Rating Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-black/20 rounded-2xl px-3.5 py-2">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 10 }, (_, idx) => (
                          <Star
                            key={idx}
                            className={`w-4 h-4 ${
                              idx < studentFullSummary.starsOutOf10
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-500'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[11px] font-bold text-emerald-100">
                        التقييم العام: {studentFullSummary.starsOutOf10} / 10 نجوم · الحضور:{' '}
                        {studentFullSummary.attendanceList.length} يوماً
                      </span>
                    </div>

                    {/* PDF Buttons or Lock Banner */}
                    {!studentPdfAccess.canViewReport && !studentPdfAccess.canViewCertificate ? (
                      <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-300/40 flex items-center gap-2 text-xs font-bold text-amber-100">
                        <Lock className="w-4 h-4 text-amber-300 shrink-0" />
                        <span>{studentPdfAccess.lockReasonAr}</span>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {studentPdfAccess.canViewReport && (
                          <button
                            type="button"
                            onClick={() =>
                              setPdfPreview({
                                title: `التقرير الشامل - ${studentFullSummary.studentName}`,
                                orientation: 'portrait',
                                html: buildFullReportHtml({
                                  summary: studentFullSummary,
                                  pdfSettings,
                                  platformTitle,
                                  homeLogoUrl,
                                }),
                              })
                            }
                            className="flex-1 min-w-[180px] py-2.5 px-4 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                          >
                            <FileText className="w-4 h-4 text-emerald-700" />
                            <span>معاينة وتصدير التقرير الشامل (PDF)</span>
                          </button>
                        )}

                        {studentPdfAccess.canViewCertificate && (
                          <button
                            type="button"
                            onClick={() =>
                              setPdfPreview({
                                title: `شهادة إتمام البرنامج - ${studentFullSummary.studentName}`,
                                orientation: pdfSettings.certificate.orientation,
                                html: buildCertificateHtml({
                                  summary: studentFullSummary,
                                  pdfSettings,
                                  platformTitle,
                                  homeLogoUrl,
                                }),
                              })
                            }
                            className="flex-1 min-w-[180px] py-2.5 px-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                          >
                            <Award className="w-4 h-4 text-slate-900" />
                            <span>معاينة وتصدير الشهادة (PDF)</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {reportDays.length === 0 ? (
                    <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-2">
                      <BarChart3 className="w-10 h-10 text-slate-300 mx-auto" />
                      <p className="text-sm font-bold text-slate-500">
                        {tr(
                          'schedule_report_empty',
                          'لا توجد أيام سابقة لعرض التقرير حتى الآن.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="p-3 rounded-2xl bg-white border border-slate-200 text-center">
                          <div className="text-lg font-extrabold text-slate-900 font-mono">
                            {reportSummary.pastDaysCount}
                          </div>
                          <div className="text-[11px] font-bold text-slate-500">
                            أيام حتى اليوم
                          </div>
                        </div>
                        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                          <div className="text-lg font-extrabold text-emerald-700 font-mono">
                            {reportSummary.completedLessons}
                          </div>
                          <div className="text-[11px] font-bold text-emerald-800">
                            دروس مكتملة
                          </div>
                        </div>
                        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                          <div className="text-lg font-extrabold text-amber-700 font-mono">
                            {reportSummary.partialLessons}
                          </div>
                          <div className="text-[11px] font-bold text-amber-800">
                            قيد الإنجاز
                          </div>
                        </div>
                        <div className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-center">
                          <div className="text-lg font-extrabold text-slate-700 font-mono">
                            {reportSummary.notStartedLessons}
                          </div>
                          <div className="text-[11px] font-bold text-slate-600">
                            لم يبدأ
                          </div>
                        </div>
                      </div>

                      {/* Day-by-Day Report Cards */}
                      <div className="space-y-3">
                        {reportDays.map((item) => {
                          const dateLabel = formatScheduleDateLabel(
                            item.day.date,
                            currentLang
                          );
                          const typeBadge = getDayTypeBadge(item.day.dayType);

                          return (
                            <div
                              key={item.day.id}
                              className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-2xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-extrabold">
                                    {dateLabel.weekday}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-slate-600">
                                    {dateLabel.formattedDate}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold ${typeBadge.cls}`}
                                  >
                                    {typeBadge.label}
                                  </span>
                                  {item.isToday && (
                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold">
                                      اليوم
                                    </span>
                                  )}
                                </div>

                                {item.totalLessons === 0 ? (
                                  <span className="text-[11px] font-bold text-slate-400">
                                    يوم حر
                                  </span>
                                ) : item.isDayCompleted ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-extrabold">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>مكتمل ({item.completedLessons}/{item.totalLessons})</span>
                                  </span>
                                ) : item.isDayPartial ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-extrabold">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>جزئي ({item.completedLessons}/{item.totalLessons})</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-300 text-[11px] font-extrabold">
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span>لم يبدأ (0/{item.totalLessons})</span>
                                  </span>
                                )}
                              </div>

                              {item.groupedLessons.length > 0 && (
                                <div className="space-y-2.5">
                                  {item.groupedLessons.map(({ group, lessons }) => (
                                    <div key={group.id} className="space-y-1.5">
                                      <div className="text-[11px] font-extrabold text-indigo-800">
                                        {group.name}
                                      </div>
                                      <div className="space-y-1.5">
                                        {lessons.map(({ ref, status }) => {
                                          const meta =
                                            SCHEDULE_EXERCISE_META[
                                              ref.exerciseType
                                            ];
                                          const displayTitle =
                                            resolveDisplayTopic(ref);
                                          return (
                                            <div
                                              key={`${group.id}_${ref.key}`}
                                              className={`p-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${
                                                status.completed
                                                  ? 'bg-emerald-50/70 border-emerald-200'
                                                  : status.partial
                                                  ? 'bg-amber-50/70 border-amber-200'
                                                  : 'bg-slate-50 border-slate-200'
                                              }`}
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span
                                                  className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold shrink-0 ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                                                >
                                                  {meta.shortAr}
                                                </span>
                                                <span className="text-xs font-extrabold text-slate-900 truncate">
                                                  {displayTitle}
                                                </span>
                                              </div>

                                              <div className="flex items-center gap-2 text-[11px] font-bold">
                                                <span className="text-slate-600">
                                                  {status.detailTextAr}
                                                </span>
                                                {status.completed ? (
                                                  <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold">
                                                    ✓
                                                  </span>
                                                ) : status.partial ? (
                                                  <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-extrabold">
                                                    جزئي
                                                  </span>
                                                ) : (
                                                  <span className="px-2 py-0.5 rounded-md bg-slate-400 text-white text-[10px] font-extrabold">
                                                    ✗
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <PdfPreviewModal
        isOpen={Boolean(pdfPreview)}
        title={pdfPreview?.title || ''}
        html={pdfPreview?.html || ''}
        orientation={pdfPreview?.orientation || 'portrait'}
        onClose={() => setPdfPreview(null)}
      />
    </div>
  );
};
