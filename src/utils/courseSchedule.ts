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
} from '../types';
import { DrawingTemplate } from '../arWriting/types/drawing';
import {
  VideoLesson,
  VideoStudentProgress,
  evaluateVideoLessonCompletion,
} from '../video/videoSheets';

export type ScheduleExerciseType =
  | 'pronunciation'
  | 'matching'
  | 'dictation'
  | 'writing'
  | 'catch'
  | 'video';

export interface ScheduleLessonRef {
  /** Unique identifier across all 6 exercise types: `${exerciseType}::${topicName}` or `video::${lessonId}` */
  key: string;
  exerciseType: ScheduleExerciseType;
  topicName: string;
  lessonId?: string; // Used primarily for video lessons to open exact lesson
}

export interface CourseGroup {
  id: string;
  name: string;
  description?: string;
  lessons: ScheduleLessonRef[];
  createdAt?: string;
}

export type ScheduleDayType = 'lesson' | 'review' | 'exam';

export interface CourseScheduleDay {
  id: string;
  date: string; // YYYY-MM-DD
  dayType: ScheduleDayType;
  groupIds: string[]; // Supports 0, 1, or multiple groups per day
  groupId?: string; // Legacy backwards-compatibility mirror of groupIds[0] || ''
  customTitle?: string;
  notes?: string;
}

export interface CourseScheduleSettings {
  lockFutureDays: boolean;
  courseTitle: string;
}

export interface CourseScheduleData {
  groups: CourseGroup[];
  days: CourseScheduleDay[];
  settings: CourseScheduleSettings;
}

export const COURSE_SCHEDULE_SHEETS = {
  GROUPS: 'مجموعات_الجدول',
  DAYS: 'الجدول_اليومي',
};

export const STORAGE_KEY_COURSE_SCHEDULE = 'faseeh_course_schedule_v1';

export const SCHEDULE_DAY_TYPE_META: Record<
  ScheduleDayType,
  {
    labelAr: string;
    cardBg: string;
    cardBorder: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    dotBg: string;
    calBg: string;
    selectCls: string;
  }
> = {
  lesson: {
    labelAr: 'درس عادي',
    cardBg: 'bg-emerald-50/70',
    cardBorder: 'border-emerald-300',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-900',
    badgeBorder: 'border-emerald-300',
    dotBg: 'bg-emerald-500',
    calBg: 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:bg-emerald-100',
    selectCls: 'bg-emerald-100 border-emerald-400 text-emerald-950',
  },
  review: {
    labelAr: 'مراجعة',
    cardBg: 'bg-sky-50/80',
    cardBorder: 'border-sky-300',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-900',
    badgeBorder: 'border-sky-300',
    dotBg: 'bg-sky-500',
    calBg: 'bg-sky-50 border-sky-300 text-sky-950 hover:bg-sky-100',
    selectCls: 'bg-sky-100 border-sky-400 text-sky-950',
  },
  exam: {
    labelAr: 'امتحان',
    cardBg: 'bg-rose-50/80',
    cardBorder: 'border-rose-300',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-900',
    badgeBorder: 'border-rose-300',
    dotBg: 'bg-rose-500',
    calBg: 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100',
    selectCls: 'bg-rose-100 border-rose-400 text-rose-950',
  },
};

export const SCHEDULE_EXERCISE_META: Record<
  ScheduleExerciseType,
  {
    labelAr: string;
    shortAr: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  }
> = {
  pronunciation: {
    labelAr: 'تدريب النطق',
    shortAr: 'نطق',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-200',
  },
  matching: {
    labelAr: 'تمارين الوصل',
    shortAr: 'وصل',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-200',
  },
  dictation: {
    labelAr: 'تمرين الإملاء',
    shortAr: 'إملاء',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-800',
    badgeBorder: 'border-teal-200',
  },
  writing: {
    labelAr: 'تمرين الكتابة',
    shortAr: 'كتابة',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-900',
    badgeBorder: 'border-amber-200',
  },
  catch: {
    labelAr: 'تحدي الصيد (AR)',
    shortAr: 'صيد',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-800',
    badgeBorder: 'border-sky-200',
  },
  video: {
    labelAr: 'الفيديو التفاعلي',
    shortAr: 'فيديو',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-200',
  },
};

export function buildScheduleLessonKey(
  exerciseType: ScheduleExerciseType,
  topicName: string,
  lessonId?: string
): string {
  if (exerciseType === 'video' && lessonId) {
    return `video::${lessonId.trim()}`;
  }
  return `${exerciseType}::${topicName.trim()}`;
}

export function createEmptyCourseSchedule(): CourseScheduleData {
  return {
    groups: [],
    days: [],
    settings: {
      lockFutureDays: true,
      courseTitle: 'جدول الدورة اليومي',
    },
  };
}

export function normalizeDateISO(raw: unknown): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str) return '';
  const direct = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const slash = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

export function getTodayLocalISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseScheduleGroupIds(rawIds: unknown, legacySingleId?: unknown): string[] {
  const seen = new Set<string>();
  const addId = (val: unknown) => {
    const clean = String(val || '').trim();
    if (clean && !seen.has(clean)) seen.add(clean);
  };

  if (Array.isArray(rawIds)) {
    rawIds.forEach(addId);
  } else if (typeof rawIds === 'string' && rawIds.trim()) {
    const s = rawIds.trim();
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) parsed.forEach(addId);
      } catch {
        addId(s);
      }
    } else {
      s.split(',').forEach(addId);
    }
  }

  if (legacySingleId !== undefined && legacySingleId !== null) {
    const leg = String(legacySingleId).trim();
    if (leg.startsWith('[')) {
      try {
        const parsed = JSON.parse(leg);
        if (Array.isArray(parsed)) parsed.forEach(addId);
      } catch {
        addId(leg);
      }
    } else if (leg) {
      leg.split(',').forEach(addId);
    }
  }

  return Array.from(seen);
}

export function normalizeCourseScheduleData(raw: any): CourseScheduleData {
  const empty = createEmptyCourseSchedule();
  if (!raw || typeof raw !== 'object') return empty;

  const groups: CourseGroup[] = Array.isArray(raw.groups)
    ? raw.groups
        .filter((g: any) => g && (g.id || g.name))
        .map((g: any, idx: number) => {
          const lessons: ScheduleLessonRef[] = Array.isArray(g.lessons)
            ? g.lessons
                .filter((l: any) => l && l.exerciseType && l.topicName)
                .map((l: any) => ({
                  key:
                    l.key ||
                    buildScheduleLessonKey(l.exerciseType, l.topicName, l.lessonId),
                  exerciseType: l.exerciseType as ScheduleExerciseType,
                  topicName: String(l.topicName).trim(),
                  lessonId: l.lessonId ? String(l.lessonId).trim() : undefined,
                }))
            : [];
          return {
            id: String(g.id || `grp_${idx + 1}`).trim(),
            name: String(g.name || `مجموعة ${idx + 1}`).trim(),
            description: g.description ? String(g.description) : '',
            lessons,
            createdAt: g.createdAt ? String(g.createdAt) : undefined,
          };
        })
    : [];

  const days: CourseScheduleDay[] = Array.isArray(raw.days)
    ? raw.days
        .map((d: any, idx: number) => {
          const iso = normalizeDateISO(d?.date);
          if (!iso) return null;
          const rawType = String(d?.dayType || 'lesson').trim();
          const dayType: ScheduleDayType =
            rawType === 'review' || rawType === 'مراجعة'
              ? 'review'
              : rawType === 'exam' || rawType === 'امتحان'
              ? 'exam'
              : 'lesson';
          const groupIds = parseScheduleGroupIds(d?.groupIds, d?.groupId);
          return {
            id: String(d?.id || `day_${iso}_${idx}`).trim(),
            date: iso,
            dayType,
            groupIds,
            groupId: groupIds[0] || '',
            customTitle: d?.customTitle ? String(d.customTitle) : '',
            notes: d?.notes ? String(d.notes) : '',
          } as CourseScheduleDay;
        })
        .filter((d: CourseScheduleDay | null): d is CourseScheduleDay => Boolean(d))
        .sort((a: CourseScheduleDay, b: CourseScheduleDay) => a.date.localeCompare(b.date))
    : [];

  const settings: CourseScheduleSettings = {
    lockFutureDays:
      raw.settings?.lockFutureDays !== undefined
        ? Boolean(raw.settings.lockFutureDays)
        : true,
    courseTitle:
      raw.settings?.courseTitle !== undefined
        ? String(raw.settings.courseTitle)
        : empty.settings.courseTitle,
  };

  return { groups, days, settings };
}

export function getLocalCourseSchedule(): CourseScheduleData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COURSE_SCHEDULE);
    if (!raw) return createEmptyCourseSchedule();
    return normalizeCourseScheduleData(JSON.parse(raw));
  } catch {
    return createEmptyCourseSchedule();
  }
}

export function saveLocalCourseSchedule(data: CourseScheduleData): void {
  try {
    localStorage.setItem(STORAGE_KEY_COURSE_SCHEDULE, JSON.stringify(data));
  } catch {}
}

export async function fetchCourseScheduleFromSheets(
  webhookUrl: string
): Promise<CourseScheduleData | null> {
  if (!webhookUrl) return null;
  try {
    const sep = webhookUrl.includes('?') ? '&' : '?';
    const res = await fetch(
      `${webhookUrl}${sep}action=get_course_schedule&t=${Date.now()}`,
      { method: 'GET' }
    );
    const json = await res.json();
    if (json && json.success && (Array.isArray(json.groups) || Array.isArray(json.days))) {
      const normalized = normalizeCourseScheduleData({
        groups: json.groups || [],
        days: json.days || [],
        settings: json.settings || {},
      });
      saveLocalCourseSchedule(normalized);
      return normalized;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveCourseScheduleToSheets(
  webhookUrl: string,
  schedule: CourseScheduleData
): Promise<{
  success: boolean;
  cloudSaved: boolean;
  needsScriptUpdate?: boolean;
  message?: string;
}> {
  saveLocalCourseSchedule(schedule);
  if (!webhookUrl) {
    return {
      success: true,
      cloudSaved: false,
      message: 'تم الحفظ محلياً فقط (لم يتم ضبط رابط Google Sheets Webhook).',
    };
  }

  try {
    const daysPayload = schedule.days.map((d) => ({
      ...d,
      groupIds: d.groupIds || [],
      groupId: d.groupIds?.[0] || d.groupId || '',
    }));
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_course_schedule',
        groups: schedule.groups,
        days: daysPayload,
        settings: schedule.settings,
      }),
    });
    const json = await res.json();
    if (json && json.success && json.scheduleSaved) {
      return {
        success: true,
        cloudSaved: true,
        message: json.message || 'تم حفظ ومزامنة المجموعات والجدول اليومي إلى Google Sheets بنجاح!',
      };
    }
    if (json && json.success && !json.scheduleSaved) {
      return {
        success: true,
        cloudSaved: false,
        needsScriptUpdate: true,
        message:
          'تم الحفظ محلياً، لكن كود Google Apps Script المنشور قديم ولا يدعم الجدول بعد. يرجى تحديث ونشر الكود الجديد (New Version) من تبويب إعدادات Google Sheets.',
      };
    }
    return {
      success: false,
      cloudSaved: false,
      message: json?.error || 'تعذر حفظ الجدول في Google Sheets.',
    };
  } catch (err: any) {
    return {
      success: false,
      cloudSaved: false,
      message: err?.message || 'حدث خطأ أثناء الاتصال بـ Google Sheets.',
    };
  }
}

/**
 * Generates chronological schedule slots between startDate and endDate matching selected weekdays,
 * optionally distributing groups sequentially with `groupsPerDay` groups assigned to each day.
 * Weekday index follows JS Date.getDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat.
 */
export function generateCalendarDays(
  startDateISO: string,
  endDateISO: string,
  weekdays: number[],
  defaultDayType: ScheduleDayType = 'lesson',
  groups: CourseGroup[] = [],
  groupsPerDay: number = 1
): CourseScheduleDay[] {
  const sISO = normalizeDateISO(startDateISO);
  const eISO = normalizeDateISO(endDateISO);
  if (!sISO || !eISO || sISO > eISO || weekdays.length === 0) return [];

  const [sy, sm, sd] = sISO.split('-').map(Number);
  const [ey, em, ed] = eISO.split('-').map(Number);
  const cursor = new Date(sy, sm - 1, sd, 12, 0, 0);
  const end = new Date(ey, em - 1, ed, 12, 0, 0);

  const daySet = new Set(weekdays);
  const result: CourseScheduleDay[] = [];
  const perDay = Math.max(0, Math.floor(groupsPerDay));
  let groupCursor = 0;
  let guard = 0;

  while (cursor <= end && guard < 400) {
    guard++;
    if (daySet.has(cursor.getDay())) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${d}`;

      let assignedIds: string[] = [];
      if (perDay > 0 && groupCursor < groups.length) {
        assignedIds = groups.slice(groupCursor, groupCursor + perDay).map((g) => g.id);
        groupCursor += perDay;
      }

      result.push({
        id: `day_${iso}_${Math.random().toString(36).slice(2, 6)}`,
        date: iso,
        dayType: defaultDayType,
        groupIds: assignedIds,
        groupId: assignedIds[0] || '',
        customTitle: '',
        notes: '',
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

const WEEKDAY_LABELS: Record<'ar' | 'th' | 'en', string[]> = {
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  th: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

export function formatScheduleDateLabel(
  isoDate: string,
  lang: 'ar' | 'th' | 'en' = 'ar'
): { weekday: string; formattedDate: string } {
  const clean = normalizeDateISO(isoDate);
  if (!clean) return { weekday: '', formattedDate: isoDate };
  const [y, m, d] = clean.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const weekday = WEEKDAY_LABELS[lang]?.[dt.getDay()] || WEEKDAY_LABELS.ar[dt.getDay()];
  return {
    weekday,
    formattedDate: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
  };
}

export interface AvailableTopicsCatalog {
  pronunciation: { topicName: string; count: number }[];
  matching: { topicName: string; count: number }[];
  dictation: { topicName: string; count: number }[];
  writing: { topicName: string; count: number }[];
  catch: { topicName: string; count: number }[];
  video: { lessonId: string; topicName: string; videoTopic: string }[];
}

export function extractAllExerciseTopics(params: {
  curriculum: WordItem[];
  subjects: string[];
  matchingSubjects: MatchingLessonSubject[];
  dictationSubjects: DictationLessonSubject[];
  writingTemplates: DrawingTemplate[];
  catchSubjects: CatchLessonSubject[];
  videoLessons: VideoLesson[];
}): AvailableTopicsCatalog {
  const pronCounts = new Map<string, number>();
  for (const s of params.subjects) {
    const clean = (s || '').trim();
    if (clean && !pronCounts.has(clean)) pronCounts.set(clean, 0);
  }
  for (const w of params.curriculum) {
    const clean = (w.lessonSubject || 'دروس عامة').trim();
    pronCounts.set(clean, (pronCounts.get(clean) || 0) + 1);
  }
  const pronunciation = Array.from(pronCounts.entries())
    .filter(([, count]) => count > 0)
    .map(([topicName, count]) => ({ topicName, count }));

  const matching = params.matchingSubjects.map((s) => ({
    topicName: (s.subjectName || '').trim(),
    count: s.exercises?.length || 0,
  }));

  const dictation = params.dictationSubjects.map((s) => ({
    topicName: (s.subjectName || '').trim(),
    count: s.exercises?.length || 0,
  }));

  const writingMap = new Map<string, number>();
  for (const tpl of params.writingTemplates) {
    const tName = (tpl.topic || 'خط النسخ (الأساسيات)').trim();
    writingMap.set(tName, (writingMap.get(tName) || 0) + 1);
  }
  const writing = Array.from(writingMap.entries()).map(([topicName, count]) => ({
    topicName,
    count,
  }));

  const catchList = params.catchSubjects.map((s) => ({
    topicName: (s.subjectName || '').trim(),
    count: s.exercises?.length || 0,
  }));

  const video = params.videoLessons.map((v) => ({
    lessonId: v.id,
    topicName: (v.title || v.topic || v.id).trim(),
    videoTopic: (v.topic || '').trim(),
  }));

  return {
    pronunciation,
    matching,
    dictation,
    writing,
    catch: catchList,
    video,
  };
}

export interface ScheduledLessonProgressStatus {
  completed: boolean;
  partial: boolean;
  doneCount: number;
  totalCount: number;
  detailTextAr: string;
}

const stripDiacritics = (s: string) =>
  (s || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').trim();

export function evaluateScheduledLessonStatus(
  ref: ScheduleLessonRef,
  ctx: {
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
  }
): ScheduledLessonProgressStatus {
  const cleanTopic = (ref.topicName || '').trim();

  if (ref.exerciseType === 'pronunciation') {
    const words = ctx.curriculum.filter(
      (w) => (w.lessonSubject || '').trim() === cleanTopic
    );
    if (words.length === 0) {
      return {
        completed: false,
        partial: false,
        doneCount: 0,
        totalCount: 0,
        detailTextAr: 'لا توجد كلمات مسجلة',
      };
    }
    let done = 0;
    for (const w of words) {
      const cleanW = stripDiacritics(w.word);
      const found = ctx.studentHistory.some(
        (h) => h.wordId === w.id || stripDiacritics(h.word) === cleanW
      );
      if (found) done++;
    }
    return {
      completed: done >= words.length,
      partial: done > 0 && done < words.length,
      doneCount: done,
      totalCount: words.length,
      detailTextAr:
        done === 0
          ? `لم يبدأ النطق بعد (0 / ${words.length})`
          : `تم نطق ${done} من ${words.length} كلمة`,
    };
  }

  if (ref.exerciseType === 'matching') {
    const subj = ctx.matchingSubjects.find((s) => (s.subjectName || '').trim() === cleanTopic);
    const total = subj?.exercises?.length || 0;
    const hist = ctx.matchingHistory.find((h) => (h.lessonSubject || '').trim() === cleanTopic);
    const done = hist?.exercises?.length || 0;
    const isCompleted =
      Boolean(hist?.completionStatus?.includes('مكتمل')) || (total > 0 && done >= total);
    return {
      completed: isCompleted,
      partial: !isCompleted && done > 0,
      doneCount: done,
      totalCount: total,
      detailTextAr:
        done === 0
          ? 'لم يحل تمرين الوصل بعد'
          : `أنجز ${done}${total > 0 ? ` / ${total}` : ''} تدريب`,
    };
  }

  if (ref.exerciseType === 'dictation') {
    const subj = ctx.dictationSubjects.find((s) => (s.subjectName || '').trim() === cleanTopic);
    const total = subj?.exercises?.length || 0;
    const hist = ctx.dictationHistory.find((h) => (h.lessonSubject || '').trim() === cleanTopic);
    const done = hist?.exercises?.length || 0;
    const isCompleted =
      Boolean(hist?.completionStatus?.includes('مكتمل')) || (total > 0 && done >= total);
    return {
      completed: isCompleted,
      partial: !isCompleted && done > 0,
      doneCount: done,
      totalCount: total,
      detailTextAr:
        done === 0
          ? 'لم يحل الإملاء بعد'
          : `أنجز ${done}${total > 0 ? ` / ${total}` : ''} كلمة إملاء`,
    };
  }

  if (ref.exerciseType === 'writing') {
    const tpls = ctx.writingTemplates.filter(
      (t) => (t.topic || 'خط النسخ (الأساسيات)').trim() === cleanTopic
    );
    const total = tpls.length;
    const hist = ctx.writingHistory.find((h) => (h.topic || '').trim() === cleanTopic);
    const done = hist?.exercises?.length || 0;
    const isCompleted =
      Boolean(hist?.completionStatus?.includes('مكتمل')) || (total > 0 && done >= total);
    return {
      completed: isCompleted,
      partial: !isCompleted && done > 0,
      doneCount: done,
      totalCount: total,
      detailTextAr:
        done === 0
          ? 'لم يكتب التمرين بعد'
          : `كتب ${done}${total > 0 ? ` / ${total}` : ''} لوحة`,
    };
  }

  if (ref.exerciseType === 'catch') {
    const subj = ctx.catchSubjects.find((s) => (s.subjectName || '').trim() === cleanTopic);
    const total = subj?.exercises?.length || 0;
    const hist = ctx.catchHistory.find((h) => (h.lessonSubject || '').trim() === cleanTopic);
    const done = hist?.exercises?.length || 0;
    const isCompleted =
      Boolean(hist?.completionStatus?.includes('مكتمل')) || (total > 0 && done >= total);
    return {
      completed: isCompleted,
      partial: !isCompleted && done > 0,
      doneCount: done,
      totalCount: total,
      detailTextAr:
        done === 0
          ? 'لم يلعب تحدي الصيد بعد'
          : `أتم ${done}${total > 0 ? ` / ${total}` : ''} جولة صيد`,
    };
  }

  // Video lesson
  const vLesson =
    (ref.lessonId && ctx.videoLessons.find((v) => v.id === ref.lessonId)) ||
    ctx.videoLessons.find(
      (v) => (v.title || '').trim() === cleanTopic || (v.topic || '').trim() === cleanTopic
    );
  if (!vLesson) {
    return {
      completed: false,
      partial: false,
      doneCount: 0,
      totalCount: 1,
      detailTextAr: 'لم يُشاهد الفيديو بعد',
    };
  }
  const prog = ctx.videoProgressMap[vLesson.id];
  const ev = evaluateVideoLessonCompletion(vLesson, prog);
  const doneParts =
    (ev.videoDone ? 1 : 0) +
    (ev.imageRequired && ev.imageDone ? 1 : 0) +
    (ev.audioRequired && ev.audioDone ? 1 : 0);
  const totalParts = 1 + (ev.imageRequired ? 1 : 0) + (ev.audioRequired ? 1 : 0);

  const partsText: string[] = [
    ev.videoDone ? 'الفيديو والأسئلة ✓' : 'الفيديو ✗',
  ];
  if (ev.imageRequired) {
    partsText.push(ev.imageDone ? 'واجب الصورة ✓' : 'واجب الصورة ✗');
  }
  if (ev.audioRequired) {
    partsText.push(ev.audioDone ? 'الواجب الصوتي ✓' : 'الواجب الصوتي ✗');
  }

  return {
    completed: ev.isFullyCompleted,
    partial: !ev.isFullyCompleted && doneParts > 0,
    doneCount: doneParts,
    totalCount: totalParts,
    detailTextAr: partsText.join(' · '),
  };
}
