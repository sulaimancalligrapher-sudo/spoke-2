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
  PdfReleaseControlMode,
  PdfFontFamily,
  PdfTextAlign,
  PdfSignatureConfig,
  PdfStampConfig,
  PdfProgramReleaseOverride,
} from '../types';
import { DrawingTemplate } from '../arWriting/types/drawing';
import {
  VideoLesson,
  VideoStudentProgress,
  evaluateVideoLessonCompletion,
} from '../video/videoSheets';
import { getDirectImageUrl } from './mediaUrl';

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

export const DEFAULT_PROGRAM_ID = 'prog_default';
export const DEFAULT_CLASSROOM_ID = 'cls_default';

export function getDefaultClassroomIdForProgram(programId?: string): string {
  const clean = String(programId || '').trim() || DEFAULT_PROGRAM_ID;
  return clean === DEFAULT_PROGRAM_ID ? DEFAULT_CLASSROOM_ID : `cls_${clean}_default`;
}

export type ProgramColorKey = 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'purple';

export const PROGRAM_COLOR_META: Record<
  ProgramColorKey,
  {
    labelAr: string;
    pillBg: string;
    pillText: string;
    pillBorder: string;
    activeBtn: string;
    dotBg: string;
  }
> = {
  emerald: {
    labelAr: 'أخضر زمردي',
    pillBg: 'bg-emerald-50',
    pillText: 'text-emerald-800',
    pillBorder: 'border-emerald-300',
    activeBtn: 'bg-emerald-600 text-white border-emerald-600',
    dotBg: 'bg-emerald-500',
  },
  indigo: {
    labelAr: 'أزرق نيلي',
    pillBg: 'bg-indigo-50',
    pillText: 'text-indigo-800',
    pillBorder: 'border-indigo-300',
    activeBtn: 'bg-indigo-600 text-white border-indigo-600',
    dotBg: 'bg-indigo-500',
  },
  amber: {
    labelAr: 'ذهبي كهرماني',
    pillBg: 'bg-amber-50',
    pillText: 'text-amber-900',
    pillBorder: 'border-amber-300',
    activeBtn: 'bg-amber-600 text-white border-amber-600',
    dotBg: 'bg-amber-500',
  },
  rose: {
    labelAr: 'وردي قرمزي',
    pillBg: 'bg-rose-50',
    pillText: 'text-rose-800',
    pillBorder: 'border-rose-300',
    activeBtn: 'bg-rose-600 text-white border-rose-600',
    dotBg: 'bg-rose-500',
  },
  sky: {
    labelAr: 'سماوي',
    pillBg: 'bg-sky-50',
    pillText: 'text-sky-800',
    pillBorder: 'border-sky-300',
    activeBtn: 'bg-sky-600 text-white border-sky-600',
    dotBg: 'bg-sky-500',
  },
  purple: {
    labelAr: 'بنفسجي',
    pillBg: 'bg-purple-50',
    pillText: 'text-purple-800',
    pillBorder: 'border-purple-300',
    activeBtn: 'bg-purple-600 text-white border-purple-600',
    dotBg: 'bg-purple-500',
  },
};

export interface CourseGroup {
  id: string;
  name: string;
  description?: string;
  lessons: ScheduleLessonRef[];
  createdAt?: string;
  programId?: string;
}

export type ScheduleDayType = 'lesson' | 'review' | 'exam' | 'attendance';

export type AttendanceSessionMode = 'live' | 'in_person';

export type AttendanceStatus = 'early' | 'on_time' | 'late' | 'absent';

export interface CourseScheduleDay {
  id: string;
  date: string; // YYYY-MM-DD
  dayType: ScheduleDayType;
  groupIds: string[]; // Supports 0, 1, or multiple groups per day
  groupId?: string; // Legacy backwards-compatibility mirror of groupIds[0] || ''
  customTitle?: string;
  notes?: string;
  programId?: string;
  classroomId?: string;
  startTime?: string; // HH:mm optional per-day override
  durationMinutes?: number; // optional per-day duration override
  attendanceMode?: AttendanceSessionMode;
  liveUrl?: string;
  classroomLocation?: string;
}

export interface CourseScheduleSettings {
  lockFutureDays: boolean;
  courseTitle: string;
  defaultStartTime?: string; // HH:mm
  durationMinutes?: number;
  timezone?: string; // e.g. 'Asia/Bangkok'
  graceMinutes?: number; // minutes after startTime still counted on_time
  reminderMinutesBefore?: number; // minutes before startTime to notify
  absenceGraceMinutes?: number; // minutes after session end to auto-mark absent
  autoSendReminders?: boolean;
  autoMarkAbsent?: boolean;
  programStartDate?: string; // YYYY-MM-DD
  programEndDate?: string; // YYYY-MM-DD
  archiveDate?: string; // YYYY-MM-DD — hide schedule & lock all lessons/review once reached
  genWeekdays?: number[];
  genDayType?: ScheduleDayType;
  genGroupsPerDay?: string;
  genMode?: 'replace' | 'append';
  defaultAttendanceMode?: AttendanceSessionMode;
  defaultLiveUrl?: string;
  defaultClassroomLocation?: string;
}

export interface CourseClassroom {
  id: string;
  programId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  settings: CourseScheduleSettings;
  createdAt?: string;
}

export interface CourseProgram {
  id: string;
  name: string;
  description?: string;
  welcomeTitle?: string;
  welcomeMessage?: string;
  color?: ProgramColorKey;
  isDefault?: boolean;
  settings: CourseScheduleSettings;
  createdAt?: string;
}

export interface CourseScheduleData {
  programs?: CourseProgram[];
  classrooms?: CourseClassroom[];
  groups: CourseGroup[];
  days: CourseScheduleDay[];
  settings: CourseScheduleSettings;
}

export const COURSE_SCHEDULE_SHEETS = {
  GROUPS: 'مجموعات_الجدول',
  DAYS: 'الجدول_اليومي',
  ATTENDANCE: 'سجل_الحضور',
};

export const STORAGE_KEY_COURSE_SCHEDULE = 'faseeh_course_schedule_v1';
export const STORAGE_KEY_ATTENDANCE = 'faseeh_attendance_records_v1';

export interface AttendanceRecord {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  studentId: string;
  studentName: string;
  sessionTitle: string;
  dayType?: string;
  location?: string;
  deviceId?: string;
  createdAt?: string;
  syncedToSheets?: boolean;
  status?: AttendanceStatus;
  minutesDelta?: number; // negative = early, positive = late
  scheduledTime?: string; // HH:mm
  programId?: string;
  programName?: string;
  classroomId?: string;
  classroomName?: string;
  timezone?: string;
}

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
  attendance: {
    labelAr: 'حصة حضور',
    cardBg: 'bg-purple-50/80',
    cardBorder: 'border-purple-300',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-900',
    badgeBorder: 'border-purple-300',
    dotBg: 'bg-purple-500',
    calBg: 'bg-purple-50 border-purple-300 text-purple-950 hover:bg-purple-100',
    selectCls: 'bg-purple-100 border-purple-400 text-purple-950',
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

export function getLocalDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.trim()) return tz.trim();
  } catch {}
  return 'Asia/Bangkok';
}

export function normalizeHHmm(raw?: string): string {
  if (!raw) return '';
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseHHmmToMinutes(raw?: string): number | null {
  const clean = normalizeHHmm(raw);
  if (!clean) return null;
  const [h, m] = clean.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
}

export function evaluateAttendanceTiming(
  checkInHHmm: string,
  scheduledHHmm?: string,
  graceMinutes = 10
): { status: 'early' | 'on_time' | 'late'; minutesDelta: number } {
  const checkMins = parseHHmmToMinutes(checkInHHmm);
  const schedMins = parseHHmmToMinutes(scheduledHHmm);
  if (checkMins === null || schedMins === null) {
    return { status: 'on_time', minutesDelta: 0 };
  }
  const delta = checkMins - schedMins;
  const safeGrace = Math.max(0, Number.isFinite(graceMinutes) ? graceMinutes : 10);
  if (delta < 0) {
    return { status: 'early', minutesDelta: delta };
  }
  if (delta <= safeGrace) {
    return { status: 'on_time', minutesDelta: delta };
  }
  return { status: 'late', minutesDelta: delta };
}

export function getAttendanceStatusMeta(
  status?: AttendanceStatus | string,
  minutesDelta?: number
): {
  status: AttendanceStatus;
  labelAr: string;
  shortAr: string;
  badgeCls: string;
} {
  const absDelta = Math.abs(Math.round(Number(minutesDelta) || 0));
  switch (status) {
    case 'early':
      return {
        status: 'early',
        labelAr: absDelta > 0 ? `حاضر مبكراً (${absDelta} د)` : 'حاضر مبكراً',
        shortAr: 'مبكر',
        badgeCls: 'bg-sky-50 text-sky-800 border-sky-200',
      };
    case 'late':
      return {
        status: 'late',
        labelAr: absDelta > 0 ? `متأخر (+${absDelta} د)` : 'متأخر',
        shortAr: 'متأخر',
        badgeCls: 'bg-amber-50 text-amber-900 border-amber-300',
      };
    case 'absent':
      return {
        status: 'absent',
        labelAr: 'غائب',
        shortAr: 'غائب',
        badgeCls: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    case 'on_time':
    default:
      return {
        status: 'on_time',
        labelAr: 'حاضر في الموعد',
        shortAr: 'بالموعد',
        badgeCls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
  }
}

export function getEffectiveDayTiming(
  day?: CourseScheduleDay | null,
  settings?: Partial<CourseScheduleSettings> | null
): {
  startTime: string;
  durationMinutes: number;
  timezone: string;
  graceMinutes: number;
  reminderMinutesBefore: number;
  absenceGraceMinutes: number;
} {
  const startTime = normalizeHHmm(day?.startTime) || normalizeHHmm(settings?.defaultStartTime) || '';
  const durationMinutes =
    day?.durationMinutes && day.durationMinutes > 0
      ? Number(day.durationMinutes)
      : settings?.durationMinutes && settings.durationMinutes > 0
      ? Number(settings.durationMinutes)
      : 60;
  return {
    startTime,
    durationMinutes,
    timezone: (settings?.timezone || '').trim() || getLocalDeviceTimezone(),
    graceMinutes: settings?.graceMinutes !== undefined ? Math.max(0, Number(settings.graceMinutes) || 0) : 10,
    reminderMinutesBefore:
      settings?.reminderMinutesBefore !== undefined
        ? Math.max(0, Number(settings.reminderMinutesBefore) || 0)
        : 15,
    absenceGraceMinutes:
      settings?.absenceGraceMinutes !== undefined
        ? Math.max(0, Number(settings.absenceGraceMinutes) || 0)
        : 30,
  };
}

export function createDefaultCourseProgram(
  settings?: Partial<CourseScheduleSettings>
): CourseProgram {
  return {
    id: DEFAULT_PROGRAM_ID,
    name: 'البرنامج العام (الافتراضي)',
    description: 'البرنامج الأساسي للطلاب غير المخصصين لبرنامج محدد',
    color: 'emerald',
    isDefault: true,
    settings: {
      lockFutureDays: settings?.lockFutureDays !== undefined ? Boolean(settings.lockFutureDays) : true,
      courseTitle:
        settings?.courseTitle !== undefined && String(settings.courseTitle).trim()
          ? String(settings.courseTitle).trim()
          : 'جدول الدورة اليومي',
      defaultStartTime: normalizeHHmm(settings?.defaultStartTime) || '',
      durationMinutes: settings?.durationMinutes ? Number(settings.durationMinutes) : 60,
      timezone: (settings?.timezone || '').trim() || getLocalDeviceTimezone(),
      graceMinutes: settings?.graceMinutes !== undefined ? Number(settings.graceMinutes) : 10,
      reminderMinutesBefore:
        settings?.reminderMinutesBefore !== undefined ? Number(settings.reminderMinutesBefore) : 15,
      absenceGraceMinutes:
        settings?.absenceGraceMinutes !== undefined ? Number(settings.absenceGraceMinutes) : 30,
      autoSendReminders: Boolean(settings?.autoSendReminders),
      autoMarkAbsent: Boolean(settings?.autoMarkAbsent),
      programStartDate: normalizeDateISO(settings?.programStartDate || '') || '',
      programEndDate: normalizeDateISO(settings?.programEndDate || '') || '',
      archiveDate: normalizeDateISO(settings?.archiveDate || '') || '',
      genWeekdays: Array.isArray(settings?.genWeekdays)
        ? settings.genWeekdays
        : [0, 1, 2, 3, 4],
      genDayType: settings?.genDayType || 'lesson',
      genGroupsPerDay:
        settings?.genGroupsPerDay !== undefined ? String(settings.genGroupsPerDay) : '',
      genMode: settings?.genMode === 'append' ? 'append' : 'replace',
      defaultAttendanceMode:
        settings?.defaultAttendanceMode === 'in_person' ? 'in_person' : 'live',
      defaultLiveUrl: settings?.defaultLiveUrl ? String(settings.defaultLiveUrl) : '',
      defaultClassroomLocation: settings?.defaultClassroomLocation
        ? String(settings.defaultClassroomLocation)
        : '',
    },
  };
}

export function createDefaultCourseClassroomForProgram(
  program: Pick<CourseProgram, 'id' | 'name' | 'settings'>
): CourseClassroom {
  return {
    id: getDefaultClassroomIdForProgram(program.id),
    programId: program.id,
    name: 'الفصل الأساسي (الافتراضي)',
    description: '',
    isDefault: true,
    settings: { ...program.settings },
  };
}

export function createEmptyCourseSchedule(): CourseScheduleData {
  const defaultProg = createDefaultCourseProgram();
  const defaultCls = createDefaultCourseClassroomForProgram(defaultProg);
  return {
    programs: [defaultProg],
    classrooms: [defaultCls],
    groups: [],
    days: [],
    settings: { ...defaultProg.settings },
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

export function getTodayLocalISO(timezone?: string): string {
  const now = new Date();
  if (timezone && timezone.trim()) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone.trim(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
    } catch {}
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getNowLocalHHmm(timezone?: string): string {
  const now = new Date();
  if (timezone && timezone.trim()) {
    try {
      const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone.trim(),
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);
      const m = formatted.match(/^(\d{2}):(\d{2})/);
      if (m) return `${m[1]}:${m[2]}`;
    } catch {}
  }
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
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

const VALID_PROGRAM_COLORS = new Set<ProgramColorKey>([
  'emerald',
  'indigo',
  'amber',
  'rose',
  'sky',
  'purple',
]);

const VALID_DAY_TYPES = new Set<ScheduleDayType>(['lesson', 'review', 'exam', 'attendance']);

function parseScheduleDayType(rawTypeVal: unknown): ScheduleDayType {
  const s = String(rawTypeVal || 'lesson').trim();
  if (s === 'review' || s === 'مراجعة') return 'review';
  if (s === 'exam' || s === 'امتحان') return 'exam';
  if (s === 'attendance' || s === 'حصة حضور' || s === 'حضور') return 'attendance';
  return VALID_DAY_TYPES.has(s as ScheduleDayType) ? (s as ScheduleDayType) : 'lesson';
}

function normalizeWeekdaysList(raw: unknown, fallback: number[] = [0, 1, 2, 3, 4]): number[] {
  if (!Array.isArray(raw)) return fallback;
  const nums = raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return Array.from(new Set(nums));
}

function normalizeSettingsBlock(
  rawSet: any,
  fallback: CourseScheduleSettings,
  fallbackCourseTitle?: string
): CourseScheduleSettings {
  const s = rawSet && typeof rawSet === 'object' ? rawSet : {};
  return {
    lockFutureDays:
      s.lockFutureDays !== undefined ? Boolean(s.lockFutureDays) : fallback.lockFutureDays,
    courseTitle:
      s.courseTitle !== undefined
        ? String(s.courseTitle)
        : fallbackCourseTitle || fallback.courseTitle,
    defaultStartTime:
      s.defaultStartTime !== undefined
        ? normalizeHHmm(s.defaultStartTime) || ''
        : fallback.defaultStartTime || '',
    durationMinutes:
      s.durationMinutes !== undefined
        ? Math.max(5, Number(s.durationMinutes) || 60)
        : fallback.durationMinutes || 60,
    timezone: (s.timezone || '').trim() || fallback.timezone || getLocalDeviceTimezone(),
    graceMinutes:
      s.graceMinutes !== undefined
        ? Math.max(0, Number(s.graceMinutes) || 0)
        : fallback.graceMinutes ?? 10,
    reminderMinutesBefore:
      s.reminderMinutesBefore !== undefined
        ? Math.max(0, Number(s.reminderMinutesBefore) || 0)
        : fallback.reminderMinutesBefore ?? 15,
    absenceGraceMinutes:
      s.absenceGraceMinutes !== undefined
        ? Math.max(0, Number(s.absenceGraceMinutes) || 0)
        : fallback.absenceGraceMinutes ?? 30,
    autoSendReminders:
      s.autoSendReminders !== undefined
        ? Boolean(s.autoSendReminders)
        : Boolean(fallback.autoSendReminders),
    autoMarkAbsent:
      s.autoMarkAbsent !== undefined
        ? Boolean(s.autoMarkAbsent)
        : Boolean(fallback.autoMarkAbsent),
    programStartDate:
      s.programStartDate !== undefined
        ? normalizeDateISO(s.programStartDate) || ''
        : fallback.programStartDate || '',
    programEndDate:
      s.programEndDate !== undefined
        ? normalizeDateISO(s.programEndDate) || ''
        : fallback.programEndDate || '',
    archiveDate:
      s.archiveDate !== undefined
        ? normalizeDateISO(s.archiveDate) || ''
        : fallback.archiveDate || '',
    genWeekdays: normalizeWeekdaysList(
      s.genWeekdays,
      fallback.genWeekdays || [0, 1, 2, 3, 4]
    ),
    genDayType:
      s.genDayType !== undefined
        ? parseScheduleDayType(s.genDayType)
        : fallback.genDayType || 'lesson',
    genGroupsPerDay:
      s.genGroupsPerDay !== undefined
        ? String(s.genGroupsPerDay)
        : fallback.genGroupsPerDay || '',
    genMode:
      s.genMode !== undefined
        ? s.genMode === 'append'
          ? 'append'
          : 'replace'
        : fallback.genMode || 'replace',
    defaultAttendanceMode:
      s.defaultAttendanceMode !== undefined
        ? s.defaultAttendanceMode === 'in_person'
          ? 'in_person'
          : 'live'
        : fallback.defaultAttendanceMode || 'live',
    defaultLiveUrl:
      s.defaultLiveUrl !== undefined
        ? String(s.defaultLiveUrl)
        : fallback.defaultLiveUrl || '',
    defaultClassroomLocation:
      s.defaultClassroomLocation !== undefined
        ? String(s.defaultClassroomLocation)
        : fallback.defaultClassroomLocation || '',
  };
}

export function normalizeCourseScheduleData(raw: any): CourseScheduleData {
  const empty = createEmptyCourseSchedule();
  if (!raw || typeof raw !== 'object') return empty;

  const rootSettings: CourseScheduleSettings = {
    lockFutureDays:
      raw.settings?.lockFutureDays !== undefined
        ? Boolean(raw.settings.lockFutureDays)
        : true,
    courseTitle:
      raw.settings?.courseTitle !== undefined
        ? String(raw.settings.courseTitle)
        : empty.settings.courseTitle,
    defaultStartTime: normalizeHHmm(raw.settings?.defaultStartTime) || '',
    durationMinutes: raw.settings?.durationMinutes ? Math.max(5, Number(raw.settings.durationMinutes) || 60) : 60,
    timezone: (raw.settings?.timezone || '').trim() || getLocalDeviceTimezone(),
    graceMinutes:
      raw.settings?.graceMinutes !== undefined ? Math.max(0, Number(raw.settings.graceMinutes) || 0) : 10,
    reminderMinutesBefore:
      raw.settings?.reminderMinutesBefore !== undefined
        ? Math.max(0, Number(raw.settings.reminderMinutesBefore) || 0)
        : 15,
    absenceGraceMinutes:
      raw.settings?.absenceGraceMinutes !== undefined
        ? Math.max(0, Number(raw.settings.absenceGraceMinutes) || 0)
        : 30,
    autoSendReminders: Boolean(raw.settings?.autoSendReminders),
    autoMarkAbsent: Boolean(raw.settings?.autoMarkAbsent),
    programStartDate: normalizeDateISO(raw.settings?.programStartDate || '') || '',
    programEndDate: normalizeDateISO(raw.settings?.programEndDate || '') || '',
    archiveDate: normalizeDateISO(raw.settings?.archiveDate || '') || '',
    genWeekdays: normalizeWeekdaysList(raw.settings?.genWeekdays, [0, 1, 2, 3, 4]),
    genDayType: parseScheduleDayType(raw.settings?.genDayType || 'lesson'),
    genGroupsPerDay:
      raw.settings?.genGroupsPerDay !== undefined ? String(raw.settings.genGroupsPerDay) : '',
    genMode: raw.settings?.genMode === 'append' ? 'append' : 'replace',
    defaultAttendanceMode:
      raw.settings?.defaultAttendanceMode === 'in_person' ? 'in_person' : 'live',
    defaultLiveUrl: raw.settings?.defaultLiveUrl ? String(raw.settings.defaultLiveUrl) : '',
    defaultClassroomLocation: raw.settings?.defaultClassroomLocation
      ? String(raw.settings.defaultClassroomLocation)
      : '',
  };

  const rawProgramsList: any[] = Array.isArray(raw.programs)
    ? raw.programs
    : Array.isArray(raw.settings?.programs)
    ? raw.settings.programs
    : [];

  const seenProgramIds = new Set<string>();
  let programs: CourseProgram[] = rawProgramsList
    .filter((p: any) => p && (p.id || p.name !== undefined))
    .map((p: any, idx: number) => {
      const pid = String(p.id || `prog_${idx + 1}`).trim() || `prog_${idx + 1}`;
      if (seenProgramIds.has(pid)) return null;
      seenProgramIds.add(pid);
      const rawColor = String(p.color || 'emerald').trim() as ProgramColorKey;
      const color: ProgramColorKey = VALID_PROGRAM_COLORS.has(rawColor) ? rawColor : 'emerald';
      const pName =
        p.name !== undefined && p.name !== null ? String(p.name) : `برنامج ${idx + 1}`;
      return {
        id: pid,
        name: pName,
        description: p.description !== undefined && p.description !== null ? String(p.description) : '',
        welcomeTitle: p.welcomeTitle !== undefined && p.welcomeTitle !== null ? String(p.welcomeTitle) : '',
        welcomeMessage: p.welcomeMessage !== undefined && p.welcomeMessage !== null ? String(p.welcomeMessage) : '',
        color,
        isDefault: Boolean(p.isDefault),
        settings: {
          lockFutureDays:
            p.settings?.lockFutureDays !== undefined
              ? Boolean(p.settings.lockFutureDays)
              : rootSettings.lockFutureDays,
          courseTitle:
            p.settings?.courseTitle !== undefined
              ? String(p.settings.courseTitle)
              : pName || rootSettings.courseTitle,
          defaultStartTime:
            normalizeHHmm(p.settings?.defaultStartTime) || rootSettings.defaultStartTime || '',
          durationMinutes:
            p.settings?.durationMinutes !== undefined
              ? Math.max(5, Number(p.settings.durationMinutes) || 60)
              : rootSettings.durationMinutes || 60,
          timezone: (p.settings?.timezone || '').trim() || rootSettings.timezone || getLocalDeviceTimezone(),
          graceMinutes:
            p.settings?.graceMinutes !== undefined
              ? Math.max(0, Number(p.settings.graceMinutes) || 0)
              : rootSettings.graceMinutes ?? 10,
          reminderMinutesBefore:
            p.settings?.reminderMinutesBefore !== undefined
              ? Math.max(0, Number(p.settings.reminderMinutesBefore) || 0)
              : rootSettings.reminderMinutesBefore ?? 15,
          absenceGraceMinutes:
            p.settings?.absenceGraceMinutes !== undefined
              ? Math.max(0, Number(p.settings.absenceGraceMinutes) || 0)
              : rootSettings.absenceGraceMinutes ?? 30,
          autoSendReminders:
            p.settings?.autoSendReminders !== undefined
              ? Boolean(p.settings.autoSendReminders)
              : Boolean(rootSettings.autoSendReminders),
          autoMarkAbsent:
            p.settings?.autoMarkAbsent !== undefined
              ? Boolean(p.settings.autoMarkAbsent)
              : Boolean(rootSettings.autoMarkAbsent),
          programStartDate:
            p.settings?.programStartDate !== undefined
              ? normalizeDateISO(p.settings.programStartDate) || ''
              : rootSettings.programStartDate || '',
          programEndDate:
            p.settings?.programEndDate !== undefined
              ? normalizeDateISO(p.settings.programEndDate) || ''
              : rootSettings.programEndDate || '',
          archiveDate:
            p.settings?.archiveDate !== undefined
              ? normalizeDateISO(p.settings.archiveDate) || ''
              : rootSettings.archiveDate || '',
          genWeekdays: normalizeWeekdaysList(
            p.settings?.genWeekdays,
            rootSettings.genWeekdays || [0, 1, 2, 3, 4]
          ),
          genDayType:
            p.settings?.genDayType !== undefined
              ? parseScheduleDayType(p.settings.genDayType)
              : rootSettings.genDayType || 'lesson',
          genGroupsPerDay:
            p.settings?.genGroupsPerDay !== undefined
              ? String(p.settings.genGroupsPerDay)
              : rootSettings.genGroupsPerDay || '',
          genMode:
            p.settings?.genMode !== undefined
              ? p.settings.genMode === 'append'
                ? 'append'
                : 'replace'
              : rootSettings.genMode || 'replace',
          defaultAttendanceMode:
            p.settings?.defaultAttendanceMode !== undefined
              ? p.settings.defaultAttendanceMode === 'in_person'
                ? 'in_person'
                : 'live'
              : rootSettings.defaultAttendanceMode || 'live',
          defaultLiveUrl:
            p.settings?.defaultLiveUrl !== undefined
              ? String(p.settings.defaultLiveUrl)
              : rootSettings.defaultLiveUrl || '',
          defaultClassroomLocation:
            p.settings?.defaultClassroomLocation !== undefined
              ? String(p.settings.defaultClassroomLocation)
              : rootSettings.defaultClassroomLocation || '',
        },
        createdAt: p.createdAt ? String(p.createdAt) : undefined,
      } as CourseProgram;
    })
    .filter((p: CourseProgram | null): p is CourseProgram => Boolean(p));

  if (programs.length === 0) {
    programs = [createDefaultCourseProgram(rootSettings)];
  }

  let hasDefault = programs.some((p) => p.isDefault);
  if (!hasDefault) {
    const defIdx = programs.findIndex((p) => p.id === DEFAULT_PROGRAM_ID);
    const pickIdx = defIdx >= 0 ? defIdx : 0;
    programs = programs.map((p, idx) => ({ ...p, isDefault: idx === pickIdx }));
  } else {
    let foundFirst = false;
    programs = programs.map((p) => {
      if (p.isDefault && !foundFirst) {
        foundFirst = true;
        return { ...p, isDefault: true };
      }
      return { ...p, isDefault: false };
    });
  }

  const programIdSet = new Set(programs.map((p) => p.id));
  const programMap = new Map<string, CourseProgram>(programs.map((p) => [p.id, p]));
  const defaultProgram = programs.find((p) => p.isDefault) || programs[0];
  const defaultProgId = defaultProgram.id;

  const rawClassroomsList: any[] = Array.isArray(raw.classrooms)
    ? raw.classrooms
    : Array.isArray(raw.settings?.classrooms)
    ? raw.settings.classrooms
    : [];

  const seenClassroomIds = new Set<string>();
  let classrooms: CourseClassroom[] = rawClassroomsList
    .filter((c: any) => c && (c.id || c.name !== undefined))
    .map((c: any, idx: number) => {
      const rawPid = String(c.programId || '').trim();
      const programId = rawPid && programIdSet.has(rawPid) ? rawPid : defaultProgId;
      const cid =
        String(c.id || `cls_${programId}_${idx + 1}`).trim() ||
        `cls_${programId}_${idx + 1}`;
      if (seenClassroomIds.has(cid)) return null;
      seenClassroomIds.add(cid);
      const parentProg = programMap.get(programId) || defaultProgram;
      const cName =
        c.name !== undefined && c.name !== null
          ? String(c.name)
          : `الفصل ${idx + 1}`;
      return {
        id: cid,
        programId,
        name: cName,
        description: c.description !== undefined && c.description !== null ? String(c.description) : '',
        isDefault: Boolean(c.isDefault),
        settings: normalizeSettingsBlock(c.settings, parentProg.settings, parentProg.settings.courseTitle || parentProg.name),
        createdAt: c.createdAt ? String(c.createdAt) : undefined,
      } as CourseClassroom;
    })
    .filter((c: CourseClassroom | null): c is CourseClassroom => Boolean(c));

  // Ensure every program has at least one default classroom
  for (const prog of programs) {
    const progCls = classrooms.filter((c) => c.programId === prog.id);
    if (progCls.length === 0) {
      const defCls = createDefaultCourseClassroomForProgram(prog);
      if (!seenClassroomIds.has(defCls.id)) {
        seenClassroomIds.add(defCls.id);
        classrooms.push(defCls);
      }
    } else if (!progCls.some((c) => c.isDefault)) {
      const firstId = progCls[0].id;
      classrooms = classrooms.map((c) =>
        c.id === firstId ? { ...c, isDefault: true } : c
      );
    } else {
      let picked = false;
      classrooms = classrooms.map((c) => {
        if (c.programId !== prog.id) return c;
        if (c.isDefault && !picked) {
          picked = true;
          return { ...c, isDefault: true };
        }
        return { ...c, isDefault: false };
      });
    }
  }

  const classroomById = new Map<string, CourseClassroom>(classrooms.map((c) => [c.id, c]));
  const defaultClassroomByProgram = new Map<string, string>();
  for (const prog of programs) {
    const defC =
      classrooms.find((c) => c.programId === prog.id && c.isDefault) ||
      classrooms.find((c) => c.programId === prog.id);
    if (defC) defaultClassroomByProgram.set(prog.id, defC.id);
  }

  const groups: CourseGroup[] = Array.isArray(raw.groups)
    ? raw.groups
        .filter((g: any) => g && (g.id || g.name !== undefined))
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
          const rawProgId = String(g.programId || '').trim();
          const programId = rawProgId && programIdSet.has(rawProgId) ? rawProgId : defaultProgId;
          return {
            id: String(g.id || `grp_${idx + 1}`).trim(),
            name:
              g.name !== undefined && g.name !== null ? String(g.name) : `مجموعة ${idx + 1}`,
            description:
              g.description !== undefined && g.description !== null ? String(g.description) : '',
            lessons,
            createdAt: g.createdAt ? String(g.createdAt) : undefined,
            programId,
          };
        })
    : [];

  const days: CourseScheduleDay[] = Array.isArray(raw.days)
    ? raw.days
        .map((d: any, idx: number) => {
          const iso = normalizeDateISO(d?.date);
          if (!iso) return null;
          const dayType = parseScheduleDayType(d?.dayType);
          const groupIds = parseScheduleGroupIds(d?.groupIds, d?.groupId);
          const rawProgId = String(d?.programId || '').trim();
          const programId = rawProgId && programIdSet.has(rawProgId) ? rawProgId : defaultProgId;
          const rawClsId = String(d?.classroomId || '').trim();
          const matchedCls = rawClsId ? classroomById.get(rawClsId) : undefined;
          const classroomId =
            matchedCls && matchedCls.programId === programId
              ? matchedCls.id
              : defaultClassroomByProgram.get(programId) || getDefaultClassroomIdForProgram(programId);
          const attModeRaw = String(d?.attendanceMode || '').trim();
          const attendanceMode: AttendanceSessionMode | undefined =
            dayType === 'attendance'
              ? attModeRaw === 'in_person'
                ? 'in_person'
                : 'live'
              : attModeRaw === 'in_person' || attModeRaw === 'live'
              ? (attModeRaw as AttendanceSessionMode)
              : undefined;
          return {
            id: String(d?.id || `day_${iso}_${idx}`).trim(),
            date: iso,
            dayType,
            groupIds,
            groupId: groupIds[0] || '',
            customTitle: d?.customTitle !== undefined && d?.customTitle !== null ? String(d.customTitle) : '',
            notes: d?.notes !== undefined && d?.notes !== null ? String(d.notes) : '',
            programId,
            classroomId,
            startTime: normalizeHHmm(d?.startTime) || undefined,
            durationMinutes:
              d?.durationMinutes !== undefined && Number(d.durationMinutes) > 0
                ? Number(d.durationMinutes)
                : undefined,
            attendanceMode,
            liveUrl: d?.liveUrl !== undefined && d?.liveUrl !== null ? String(d.liveUrl) : undefined,
            classroomLocation:
              d?.classroomLocation !== undefined && d?.classroomLocation !== null
                ? String(d.classroomLocation)
                : undefined,
          } as CourseScheduleDay;
        })
        .filter((d: CourseScheduleDay | null): d is CourseScheduleDay => Boolean(d))
        .sort((a: CourseScheduleDay, b: CourseScheduleDay) => a.date.localeCompare(b.date))
    : [];

  return {
    programs,
    classrooms,
    groups,
    days,
    settings: { ...defaultProgram.settings },
  };
}

export function resolveCourseProgram(
  schedule: CourseScheduleData,
  requestedProgramId?: string
): {
  programs: CourseProgram[];
  activeProgram: CourseProgram;
  defaultProgramId: string;
} {
  const normalized =
    Array.isArray(schedule?.programs) && schedule.programs.length > 0 && Array.isArray(schedule?.classrooms)
      ? schedule
      : normalizeCourseScheduleData(schedule);
  const programs = normalized.programs!;
  const defaultProgram = programs.find((p) => p.isDefault) || programs[0];
  const req = String(requestedProgramId || '').trim();
  const activeProgram =
    (req && programs.find((p) => p.id === req)) || defaultProgram;
  return {
    programs,
    activeProgram,
    defaultProgramId: defaultProgram.id,
  };
}

export function resolveCourseClassroom(
  schedule: CourseScheduleData,
  requestedProgramId?: string,
  requestedClassroomId?: string
): {
  classrooms: CourseClassroom[];
  activeClassroom: CourseClassroom;
  defaultClassroomId: string;
} {
  const normalized =
    Array.isArray(schedule?.programs) && schedule.programs.length > 0 && Array.isArray(schedule?.classrooms)
      ? schedule
      : normalizeCourseScheduleData(schedule);
  const { activeProgram } = resolveCourseProgram(normalized, requestedProgramId);
  const programClassrooms = (normalized.classrooms || []).filter(
    (c) => c.programId === activeProgram.id
  );
  const safeList =
    programClassrooms.length > 0
      ? programClassrooms
      : [createDefaultCourseClassroomForProgram(activeProgram)];
  const defaultClassroom = safeList.find((c) => c.isDefault) || safeList[0];
  const reqCls = String(requestedClassroomId || '').trim();
  const activeClassroom =
    (reqCls && safeList.find((c) => c.id === reqCls)) || defaultClassroom;
  return {
    classrooms: safeList,
    activeClassroom,
    defaultClassroomId: defaultClassroom.id,
  };
}

export function getScheduleForProgram(
  schedule: CourseScheduleData,
  requestedProgramId?: string,
  requestedClassroomId?: string
): {
  programs: CourseProgram[];
  activeProgram: CourseProgram;
  defaultProgramId: string;
  classrooms: CourseClassroom[];
  activeClassroom: CourseClassroom;
  defaultClassroomId: string;
  scopedSchedule: CourseScheduleData;
} {
  const normalized =
    Array.isArray(schedule?.programs) && schedule.programs.length > 0 && Array.isArray(schedule?.classrooms)
      ? schedule
      : normalizeCourseScheduleData(schedule);
  const { programs, activeProgram, defaultProgramId } = resolveCourseProgram(
    normalized,
    requestedProgramId
  );
  const { classrooms, activeClassroom, defaultClassroomId } = resolveCourseClassroom(
    normalized,
    activeProgram.id,
    requestedClassroomId
  );
  const groups = (normalized.groups || []).filter(
    (g) => (String(g.programId || '').trim() || defaultProgramId) === activeProgram.id
  );
  const days = (normalized.days || [])
    .filter((d) => {
      const dPid = String(d.programId || '').trim() || defaultProgramId;
      if (dPid !== activeProgram.id) return false;
      const dCid = String(d.classroomId || '').trim() || defaultClassroomId;
      return dCid === activeClassroom.id;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    programs,
    activeProgram,
    defaultProgramId,
    classrooms,
    activeClassroom,
    defaultClassroomId,
    scopedSchedule: {
      programs,
      classrooms,
      groups,
      days,
      settings: activeClassroom.settings || activeProgram.settings,
    },
  };
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
    if (
      json &&
      json.success &&
      (Array.isArray(json.groups) ||
        Array.isArray(json.days) ||
        Array.isArray(json.programs) ||
        Array.isArray(json.classrooms))
    ) {
      const normalized = normalizeCourseScheduleData({
        programs: json.programs || json.settings?.programs || [],
        classrooms: json.classrooms || json.settings?.classrooms || [],
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
  const normalized = normalizeCourseScheduleData(schedule);
  saveLocalCourseSchedule(normalized);
  if (!webhookUrl) {
    return {
      success: true,
      cloudSaved: false,
      message: 'تم الحفظ محلياً فقط (لم يتم ضبط رابط Google Sheets Webhook).',
    };
  }

  try {
    const defaultProgId =
      normalized.programs?.find((p) => p.isDefault)?.id ||
      normalized.programs?.[0]?.id ||
      DEFAULT_PROGRAM_ID;

    const groupsPayload = normalized.groups.map((g) => ({
      ...g,
      programId: g.programId || defaultProgId,
    }));
    const daysPayload = normalized.days.map((d) => ({
      ...d,
      groupIds: d.groupIds || [],
      groupId: d.groupIds?.[0] || d.groupId || '',
      programId: d.programId || defaultProgId,
      classroomId: d.classroomId || getDefaultClassroomIdForProgram(d.programId || defaultProgId),
    }));
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_course_schedule',
        programs: normalized.programs,
        classrooms: normalized.classrooms,
        groups: groupsPayload,
        days: daysPayload,
        settings: {
          ...normalized.settings,
          programs: normalized.programs,
          classrooms: normalized.classrooms,
        },
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
  groupsPerDay: number = 0,
  options?: {
    programId?: string;
    classroomId?: string;
    startGroupIndex?: number;
    attendanceMode?: AttendanceSessionMode;
    liveUrl?: string;
    classroomLocation?: string;
  }
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
  let groupCursor = Math.max(0, Math.floor(options?.startGroupIndex ?? 0));
  const programId = (options?.programId || '').trim() || DEFAULT_PROGRAM_ID;
  const classroomId = (options?.classroomId || '').trim() || getDefaultClassroomIdForProgram(programId);
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
        programId,
        classroomId,
        ...(defaultDayType === 'attendance'
          ? {
              attendanceMode: options?.attendanceMode || 'live',
              liveUrl: options?.liveUrl || '',
              classroomLocation: options?.classroomLocation || '',
            }
          : {}),
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

// =========================================================================
// دوال التصفية الصارمة لقائمة الدروس حسب الجدول والتاريخ (أسلوب الإخفاء التام)
// =========================================================================

export interface UnlockedScheduleIndex {
  enforceStrictHide: boolean;
  pronunciationTopics: Set<string>;
  matchingTopics: Set<string>;
  dictationTopics: Set<string>;
  writingTopics: Set<string>;
  catchTopics: Set<string>;
  videoLessonIds: Set<string>;
  videoFallbackTitles: Set<string>;
}

export function isProgramEndedForStudent(
  settings?: Partial<CourseScheduleSettings> | null,
  isAdminAuthenticated = false,
  targetDateISO?: string
): boolean {
  if (isAdminAuthenticated) return false;
  const archiveDate = normalizeDateISO(settings?.archiveDate || '');
  if (!archiveDate) return false;
  const tz = (settings?.timezone || '').trim() || getLocalDeviceTimezone();
  const today = normalizeDateISO(targetDateISO) || getTodayLocalISO(tz);
  return Boolean(today && today >= archiveDate);
}

/**
 * Builds an index of lessons unlocked up to today (date <= todayISO).
 * Future lessons (date > todayISO) and unscheduled lessons are excluded when Strict Hide is active.
 * Also locks and hides ALL lessons & review when archiveDate is reached for students.
 */
export function getUnlockedScheduleIndex(
  schedule: CourseScheduleData,
  isAdminAuthenticated: boolean,
  targetDateISO?: string,
  programId?: string,
  classroomId?: string
): UnlockedScheduleIndex {
  const { scopedSchedule } = getScheduleForProgram(schedule, programId, classroomId);
  const programEnded = isProgramEndedForStudent(
    scopedSchedule?.settings,
    isAdminAuthenticated,
    targetDateISO
  );
  const enforceStrictHide = Boolean(
    !isAdminAuthenticated &&
      (programEnded ||
        (scopedSchedule &&
          Array.isArray(scopedSchedule.days) &&
          scopedSchedule.days.length > 0 &&
          scopedSchedule.settings?.lockFutureDays !== false))
  );

  const index: UnlockedScheduleIndex = {
    enforceStrictHide,
    pronunciationTopics: new Set<string>(),
    matchingTopics: new Set<string>(),
    dictationTopics: new Set<string>(),
    writingTopics: new Set<string>(),
    catchTopics: new Set<string>(),
    videoLessonIds: new Set<string>(),
    videoFallbackTitles: new Set<string>(),
  };

  if (!enforceStrictHide || programEnded) {
    return index;
  }

  const todayISO =
    normalizeDateISO(targetDateISO) ||
    getTodayLocalISO((scopedSchedule.settings?.timezone || '').trim() || undefined);
  const groupMap = new Map<string, CourseGroup>();
  for (const grp of scopedSchedule.groups || []) {
    if (grp?.id) groupMap.set(grp.id, grp);
  }

  for (const day of scopedSchedule.days) {
    if (!day?.date || day.date > todayISO) continue;
    const gIds = day.groupIds?.length
      ? day.groupIds
      : day.groupId
      ? [day.groupId]
      : [];

    for (const gid of gIds) {
      const grp = groupMap.get(gid);
      if (!grp || !Array.isArray(grp.lessons)) continue;

      for (const ref of grp.lessons) {
        if (!ref) continue;
        const cleanTopic = (ref.topicName || '').trim();
        switch (ref.exerciseType) {
          case 'pronunciation':
            if (cleanTopic) index.pronunciationTopics.add(cleanTopic);
            break;
          case 'matching':
            if (cleanTopic) index.matchingTopics.add(cleanTopic);
            break;
          case 'dictation':
            if (cleanTopic) index.dictationTopics.add(cleanTopic);
            break;
          case 'writing':
            if (cleanTopic) index.writingTopics.add(cleanTopic);
            break;
          case 'catch':
            if (cleanTopic) index.catchTopics.add(cleanTopic);
            break;
          case 'video': {
            const cleanId = (ref.lessonId || '').trim();
            if (cleanId) {
              index.videoLessonIds.add(cleanId);
            } else if (cleanTopic) {
              index.videoFallbackTitles.add(cleanTopic);
            }
            break;
          }
        }
      }
    }
  }

  return index;
}

export interface ScheduleFilteredContent {
  enforceStrictHide: boolean;
  unlockedIndex: UnlockedScheduleIndex;
  curriculum: WordItem[];
  subjects: string[];
  matchingSubjects: MatchingLessonSubject[];
  dictationSubjects: DictationLessonSubject[];
  writingTemplates: DrawingTemplate[];
  catchSubjects: CatchLessonSubject[];
  videoLessons: VideoLesson[];
}

export function filterLessonsBySchedule(params: {
  schedule: CourseScheduleData;
  isAdminAuthenticated: boolean;
  curriculum: WordItem[];
  subjects: string[];
  matchingSubjects: MatchingLessonSubject[];
  dictationSubjects: DictationLessonSubject[];
  writingTemplates: DrawingTemplate[];
  catchSubjects: CatchLessonSubject[];
  videoLessons: VideoLesson[];
  targetDateISO?: string;
  programId?: string;
  classroomId?: string;
}): ScheduleFilteredContent {
  const unlockedIndex = getUnlockedScheduleIndex(
    params.schedule,
    params.isAdminAuthenticated,
    params.targetDateISO,
    params.programId,
    params.classroomId
  );

  if (!unlockedIndex.enforceStrictHide) {
    return {
      enforceStrictHide: false,
      unlockedIndex,
      curriculum: params.curriculum,
      subjects: params.subjects,
      matchingSubjects: params.matchingSubjects,
      dictationSubjects: params.dictationSubjects,
      writingTemplates: params.writingTemplates,
      catchSubjects: params.catchSubjects,
      videoLessons: params.videoLessons,
    };
  }

  const filteredCurriculum = params.curriculum.filter((w) =>
    unlockedIndex.pronunciationTopics.has((w.lessonSubject || 'دروس عامة').trim())
  );

  const unlockedSubjectsSet = new Set(
    filteredCurriculum.map((w) => (w.lessonSubject || 'دروس عامة').trim())
  );
  const filteredSubjects = params.subjects.filter((s) => {
    const clean = (s || '').trim();
    return unlockedIndex.pronunciationTopics.has(clean) && unlockedSubjectsSet.has(clean);
  });

  const filteredMatchingSubjects = params.matchingSubjects.filter((s) =>
    unlockedIndex.matchingTopics.has((s.subjectName || '').trim())
  );

  const filteredDictationSubjects = params.dictationSubjects.filter((s) =>
    unlockedIndex.dictationTopics.has((s.subjectName || '').trim())
  );

  const filteredWritingTemplates = params.writingTemplates.filter((tpl) =>
    unlockedIndex.writingTopics.has((tpl.topic || 'خط النسخ (الأساسيات)').trim())
  );

  const filteredCatchSubjects = params.catchSubjects.filter((s) =>
    unlockedIndex.catchTopics.has((s.subjectName || '').trim())
  );

  const filteredVideoLessons = params.videoLessons.filter((v) => {
    const vId = (v.id || '').trim();
    if (vId && unlockedIndex.videoLessonIds.has(vId)) return true;
    const vTitle = (v.title || '').trim();
    const vTopic = (v.topic || '').trim();
    return (
      (vTitle && unlockedIndex.videoFallbackTitles.has(vTitle)) ||
      (vTopic && unlockedIndex.videoFallbackTitles.has(vTopic))
    );
  });

  return {
    enforceStrictHide: true,
    unlockedIndex,
    curriculum: filteredCurriculum,
    subjects: filteredSubjects,
    matchingSubjects: filteredMatchingSubjects,
    dictationSubjects: filteredDictationSubjects,
    writingTemplates: filteredWritingTemplates,
    catchSubjects: filteredCatchSubjects,
    videoLessons: filteredVideoLessons,
  };
}

// =========================================================================
// دوال تأكيد حضور الحصة اليومية وسجل الحضور (سجل_الحضور)
// =========================================================================

function normalizeAttDigits(raw: unknown): string {
  return String(raw || '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export interface TodayScheduleSummary {
  todayISO: string;
  programId: string;
  programName: string;
  classroomId: string;
  classroomName: string;
  day: CourseScheduleDay | null;
  groups: CourseGroup[];
  allLessonRefs: ScheduleLessonRef[];
  totalLessons: number;
  sessionTitle: string;
  dayType: ScheduleDayType;
  startTime: string;
  durationMinutes: number;
  timezone: string;
  graceMinutes: number;
  attendanceMode?: AttendanceSessionMode;
  liveUrl?: string;
  classroomLocation?: string;
  archiveDate?: string;
  isProgramEnded: boolean;
}

export function getTodayScheduleSummary(
  schedule: CourseScheduleData,
  targetDateISO?: string,
  programId?: string,
  isAdminAuthenticated = false,
  classroomId?: string
): TodayScheduleSummary {
  const { activeProgram, activeClassroom, scopedSchedule } = getScheduleForProgram(
    schedule,
    programId,
    classroomId
  );
  const effSettings = scopedSchedule.settings || activeClassroom.settings || activeProgram.settings;
  const timing = getEffectiveDayTiming(null, effSettings);
  const todayISO = normalizeDateISO(targetDateISO) || getTodayLocalISO(timing.timezone);
  const isProgramEnded = isProgramEndedForStudent(
    effSettings,
    isAdminAuthenticated,
    todayISO
  );
  const day = isProgramEnded
    ? null
    : scopedSchedule.days.find((d) => d.date === todayISO) || null;
  const effectiveTiming = getEffectiveDayTiming(day, effSettings);
  const gIds = day
    ? day.groupIds?.length
      ? day.groupIds
      : day.groupId
      ? [day.groupId]
      : []
    : [];
  const groups = gIds
    .map((id) => scopedSchedule.groups.find((g) => g.id === id))
    .filter((g): g is CourseGroup => Boolean(g));

  const seenKeys = new Set<string>();
  const allLessonRefs: ScheduleLessonRef[] = [];
  for (const grp of groups) {
    for (const ref of grp.lessons) {
      if (!seenKeys.has(ref.key)) {
        seenKeys.add(ref.key);
        allLessonRefs.push(ref);
      }
    }
  }

  const dayType: ScheduleDayType = day?.dayType || 'lesson';
  const sessionTitle =
    (day?.customTitle || '').trim() ||
    (groups.length > 0
      ? groups.map((g) => g.name).join(' + ')
      : day
      ? SCHEDULE_DAY_TYPE_META[dayType].labelAr
      : 'التدريب اليومي المفتوح');

  return {
    todayISO,
    programId: activeProgram.id,
    programName: activeProgram.name,
    classroomId: activeClassroom.id,
    classroomName: activeClassroom.name,
    day,
    groups,
    allLessonRefs,
    totalLessons: allLessonRefs.length,
    sessionTitle,
    dayType,
    startTime: effectiveTiming.startTime,
    durationMinutes: effectiveTiming.durationMinutes,
    timezone: effectiveTiming.timezone,
    graceMinutes: effectiveTiming.graceMinutes,
    attendanceMode:
      day?.attendanceMode ||
      (dayType === 'attendance' ? effSettings.defaultAttendanceMode || 'live' : undefined),
    liveUrl: (day?.liveUrl ?? effSettings.defaultLiveUrl ?? '').trim() || undefined,
    classroomLocation:
      (day?.classroomLocation ?? effSettings.defaultClassroomLocation ?? '').trim() ||
      undefined,
    archiveDate: normalizeDateISO(effSettings.archiveDate || '') || undefined,
    isProgramEnded,
  };
}

export function getLocalAttendanceRecords(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ATTENDANCE);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r) => r && r.date && r.studentId)
      .map((r) => ({
        date: normalizeDateISO(r.date) || String(r.date),
        time: String(r.time || ''),
        studentId: normalizeAttDigits(r.studentId),
        studentName: String(r.studentName || ''),
        sessionTitle: String(r.sessionTitle || ''),
        dayType: r.dayType ? String(r.dayType) : 'lesson',
        location: r.location ? String(r.location) : undefined,
        deviceId: r.deviceId ? String(r.deviceId) : undefined,
        createdAt: r.createdAt ? String(r.createdAt) : undefined,
        syncedToSheets: Boolean(r.syncedToSheets),
        status: r.status ? (String(r.status) as AttendanceStatus) : 'on_time',
        minutesDelta: r.minutesDelta !== undefined && r.minutesDelta !== '' ? Number(r.minutesDelta) : 0,
        scheduledTime: r.scheduledTime ? String(r.scheduledTime) : undefined,
        programId: r.programId ? String(r.programId) : undefined,
        programName: r.programName ? String(r.programName) : undefined,
        classroomId: r.classroomId ? String(r.classroomId) : undefined,
        classroomName: r.classroomName ? String(r.classroomName) : undefined,
        timezone: r.timezone ? String(r.timezone) : undefined,
      }));
  } catch {
    return [];
  }
}

export function saveLocalAttendanceRecords(records: AttendanceRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_ATTENDANCE, JSON.stringify(records));
  } catch {}
}

export function mergeAttendanceRecords(
  localList: AttendanceRecord[],
  cloudList: AttendanceRecord[]
): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  const keyOf = (r: AttendanceRecord) =>
    `${normalizeDateISO(r.date) || r.date}::${normalizeAttDigits(r.studentId)}`;

  for (const r of localList) {
    map.set(keyOf(r), r);
  }
  for (const r of cloudList) {
    map.set(keyOf(r), { ...r, syncedToSheets: true });
  }
  return Array.from(map.values()).sort((a, b) => {
    const cmpDate = b.date.localeCompare(a.date);
    if (cmpDate !== 0) return cmpDate;
    return (b.time || '').localeCompare(a.time || '');
  });
}

export async function fetchAttendanceRecordsFromSheets(
  webhookUrl: string,
  filter?: { studentId?: string; date?: string }
): Promise<{ records: AttendanceRecord[]; scriptSupported: boolean }> {
  const local = getLocalAttendanceRecords();
  if (!webhookUrl) {
    const filtered = local.filter((r) => {
      if (filter?.studentId && normalizeAttDigits(r.studentId) !== normalizeAttDigits(filter.studentId)) {
        return false;
      }
      if (filter?.date && r.date !== normalizeDateISO(filter.date)) {
        return false;
      }
      return true;
    });
    return { records: filtered, scriptSupported: true };
  }

  try {
    const sep = webhookUrl.includes('?') ? '&' : '?';
    const params = new URLSearchParams({ action: 'get_attendance_records', t: String(Date.now()) });
    if (filter?.studentId) params.set('studentId', normalizeAttDigits(filter.studentId));
    if (filter?.date) params.set('date', normalizeDateISO(filter.date));
    const res = await fetch(`${webhookUrl}${sep}${params.toString()}`, { method: 'GET' });
    const json = await res.json();
    if (json && json.attendanceHandled && Array.isArray(json.records)) {
      const normalizedCloud: AttendanceRecord[] = json.records.map((r: any) => ({
        date: normalizeDateISO(r.date) || String(r.date || ''),
        time: String(r.time || ''),
        studentId: normalizeAttDigits(r.studentId),
        studentName: String(r.studentName || ''),
        sessionTitle: String(r.sessionTitle || ''),
        dayType: String(r.dayType || 'lesson'),
        location: r.location ? String(r.location) : undefined,
        deviceId: r.deviceId ? String(r.deviceId) : undefined,
        createdAt: r.createdAt ? String(r.createdAt) : undefined,
        syncedToSheets: true,
        status: r.status ? (String(r.status) as AttendanceStatus) : 'on_time',
        minutesDelta: r.minutesDelta !== undefined && r.minutesDelta !== '' ? Number(r.minutesDelta) : 0,
        scheduledTime: r.scheduledTime ? String(r.scheduledTime) : undefined,
        programId: r.programId ? String(r.programId) : undefined,
        classroomId: r.classroomId ? String(r.classroomId) : undefined,
      }));
      const merged =
        !filter?.studentId && !filter?.date
          ? normalizedCloud
          : mergeAttendanceRecords(local, normalizedCloud);
      saveLocalAttendanceRecords(merged);
      return {
        records: filter?.studentId || filter?.date ? normalizedCloud : merged,
        scriptSupported: true,
      };
    }
    return { records: local, scriptSupported: false };
  } catch {
    return { records: local, scriptSupported: true };
  }
}

export async function checkInAttendance(
  webhookUrl: string,
  payload: {
    date?: string;
    studentId: string;
    studentName: string;
    sessionTitle: string;
    dayType?: string;
    deviceId?: string;
    lat?: number;
    lng?: number;
    location?: string;
    scheduledTime?: string;
    graceMinutes?: number;
    timezone?: string;
    programId?: string;
    programName?: string;
    classroomId?: string;
    classroomName?: string;
  }
): Promise<{
  success: boolean;
  alreadyCheckedIn?: boolean;
  cloudSaved: boolean;
  needsScriptUpdate?: boolean;
  record: AttendanceRecord;
  message: string;
}> {
  const tz = (payload.timezone || '').trim() || getLocalDeviceTimezone();
  const dateISO = normalizeDateISO(payload.date) || getTodayLocalISO(tz);
  const timeStr = getNowLocalHHmm(tz);
  const cleanId = normalizeAttDigits(payload.studentId);
  const cleanSchedTime = normalizeHHmm(payload.scheduledTime);
  const evalTiming = evaluateAttendanceTiming(timeStr, cleanSchedTime, payload.graceMinutes ?? 10);

  const fallbackRecord: AttendanceRecord = {
    date: dateISO,
    time: timeStr,
    studentId: cleanId,
    studentName: payload.studentName.trim(),
    sessionTitle: payload.sessionTitle.trim() || 'حصة اليوم',
    dayType: payload.dayType || 'lesson',
    location: payload.location || undefined,
    deviceId: payload.deviceId || undefined,
    createdAt: `${dateISO} ${timeStr}`,
    syncedToSheets: false,
    status: evalTiming.status,
    minutesDelta: evalTiming.minutesDelta,
    scheduledTime: cleanSchedTime || undefined,
    programId: payload.programId || undefined,
    programName: payload.programName || undefined,
    classroomId: payload.classroomId || undefined,
    classroomName: payload.classroomName || undefined,
    timezone: tz,
  };

  const localNow = getLocalAttendanceRecords();
  const existingLocal = localNow.find(
    (r) => r.date === dateISO && normalizeAttDigits(r.studentId) === cleanId
  );
  // Note: If the previous automatic record was 'absent', allow the student to check in on the same day and upgrade to 'late' / computed status.
  if (existingLocal && existingLocal.status !== 'absent' && !webhookUrl) {
    return {
      success: true,
      alreadyCheckedIn: true,
      cloudSaved: false,
      record: existingLocal,
      message: 'تم تسجيل حضورك لهذا اليوم مسبقاً.',
    };
  }

  if (!webhookUrl) {
    const nextLocal = mergeAttendanceRecords(localNow, [fallbackRecord]);
    saveLocalAttendanceRecords(nextLocal);
    const meta = getAttendanceStatusMeta(fallbackRecord.status, fallbackRecord.minutesDelta);
    return {
      success: true,
      alreadyCheckedIn: false,
      cloudSaved: false,
      record: fallbackRecord,
      message: `تم تأكيد حضورك (${meta.labelAr}) محلياً في المتصفح.`,
    };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'check_in_attendance',
        date: dateISO,
        time: timeStr,
        studentId: cleanId,
        studentName: payload.studentName.trim(),
        sessionTitle: payload.sessionTitle.trim() || 'حصة اليوم',
        dayType: payload.dayType || 'lesson',
        deviceId: payload.deviceId || '',
        lat: payload.lat,
        lng: payload.lng,
        location: payload.location || '',
        scheduledTime: cleanSchedTime,
        graceMinutes: payload.graceMinutes ?? 10,
        timezone: tz,
        programId: payload.programId || '',
        programName: payload.programName || '',
        classroomId: payload.classroomId || '',
        classroomName: payload.classroomName || '',
        status: evalTiming.status,
        minutesDelta: evalTiming.minutesDelta,
      }),
    });
    const json = await res.json();
    if (json && json.attendanceHandled) {
      if (!json.success) {
        return {
          success: false,
          cloudSaved: false,
          record: fallbackRecord,
          message: json.error || 'تعذر تأكيد الحضور.',
        };
      }
      const cloudRec: AttendanceRecord = {
        date: normalizeDateISO(json.record?.date) || dateISO,
        time: String(json.record?.time || timeStr),
        studentId: normalizeAttDigits(json.record?.studentId || cleanId),
        studentName: String(json.record?.studentName || payload.studentName),
        sessionTitle: String(json.record?.sessionTitle || payload.sessionTitle),
        dayType: String(json.record?.dayType || payload.dayType || 'lesson'),
        location: json.record?.location ? String(json.record.location) : undefined,
        deviceId: json.record?.deviceId ? String(json.record.deviceId) : payload.deviceId,
        createdAt: json.record?.createdAt ? String(json.record.createdAt) : fallbackRecord.createdAt,
        syncedToSheets: true,
        status: (json.record?.status as AttendanceStatus) || evalTiming.status,
        minutesDelta:
          json.record?.minutesDelta !== undefined ? Number(json.record.minutesDelta) : evalTiming.minutesDelta,
        scheduledTime: json.record?.scheduledTime ? String(json.record.scheduledTime) : cleanSchedTime || undefined,
        programId: json.record?.programId ? String(json.record.programId) : payload.programId,
        classroomId: json.record?.classroomId ? String(json.record.classroomId) : payload.classroomId,
      };
      const nextLocal = mergeAttendanceRecords(localNow, [cloudRec]);
      saveLocalAttendanceRecords(nextLocal);
      return {
        success: true,
        alreadyCheckedIn: Boolean(json.alreadyCheckedIn),
        cloudSaved: true,
        record: cloudRec,
        message: json.message || 'تم تأكيد حضورك في حصة اليوم وحفظه في الشيت بنجاح!',
      };
    }

    // Script not redeployed yet: save locally and inform
    const nextLocal = mergeAttendanceRecords(localNow, [fallbackRecord]);
    saveLocalAttendanceRecords(nextLocal);
    return {
      success: true,
      alreadyCheckedIn: Boolean(existingLocal && existingLocal.status !== 'absent'),
      cloudSaved: false,
      needsScriptUpdate: true,
      record: existingLocal && existingLocal.status !== 'absent' ? existingLocal : fallbackRecord,
      message: 'تم تأكيد حضورك محلياً، يلزم تحديث ونشر كود Google Apps Script الجديد لحفظه في ورقة سجل_الحضور.',
    };
  } catch {
    const nextLocal = mergeAttendanceRecords(localNow, [fallbackRecord]);
    saveLocalAttendanceRecords(nextLocal);
    return {
      success: true,
      alreadyCheckedIn: Boolean(existingLocal && existingLocal.status !== 'absent'),
      cloudSaved: false,
      record: existingLocal && existingLocal.status !== 'absent' ? existingLocal : fallbackRecord,
      message: 'تم تسجيل حضورك محلياً مؤقتاً (تعذر الاتصال بالسحابة الآن).',
    };
  }
}

export async function runAttendanceSchedulerNow(
  webhookUrl: string,
  timezone?: string
): Promise<{
  success: boolean;
  remindersSent?: number;
  absentsMarked?: number;
  summarySent?: boolean;
  needsScriptUpdate?: boolean;
  message: string;
}> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'يرجى ضبط رابط Google Sheets Webhook أولاً.' };
  }
  try {
    const tz = (timezone || '').trim() || getLocalDeviceTimezone();
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'run_attendance_scheduler_now',
        date: getTodayLocalISO(tz),
        time: getNowLocalHHmm(tz),
        timezone: tz,
      }),
    });
    const json = await res.json();
    if (json && json.schedulerHandled) {
      return {
        success: Boolean(json.success),
        remindersSent: Number(json.remindersSent || 0),
        absentsMarked: Number(json.absentsMarked || 0),
        summarySent: Boolean(json.summarySent),
        message:
          json.message ||
          `تم الفحص: إرسال ${json.remindersSent || 0} تذكير، ورصد ${json.absentsMarked || 0} غياب.`,
      };
    }
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'يلزم تحديث ونشر كود Google Apps Script الجديد لتشغيل فحص التذكيرات والغياب.',
    };
  } catch {
    return { success: false, message: 'تعذر الاتصال بالسيرفر لتشغيل الفحص.' };
  }
}

export async function deleteAttendanceRecordFromSheets(
  webhookUrl: string,
  date: string,
  studentId: string
): Promise<{
  success: boolean;
  cloudDeleted: boolean;
  needsScriptUpdate?: boolean;
  message?: string;
}> {
  const cleanDate = normalizeDateISO(date) || date;
  const cleanId = normalizeAttDigits(studentId);
  const nextLocal = getLocalAttendanceRecords().filter(
    (r) => !(r.date === cleanDate && normalizeAttDigits(r.studentId) === cleanId)
  );
  saveLocalAttendanceRecords(nextLocal);

  if (!webhookUrl) {
    return { success: true, cloudDeleted: false, message: 'تم الحذف من الذاكرة المحلية.' };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete_attendance_record',
        date: cleanDate,
        studentId: cleanId,
      }),
    });
    const json = await res.json();
    if (json && json.attendanceHandled) {
      return {
        success: Boolean(json.success),
        cloudDeleted: Boolean(json.success),
        message: json.message || 'تم حذف سجل الحضور بنجاح.',
      };
    }
    return {
      success: true,
      cloudDeleted: false,
      needsScriptUpdate: true,
      message: 'تم الحذف محلياً، يلزم تحديث كود Apps Script لحذفه من الشيت.',
    };
  } catch (err: any) {
    return {
      success: false,
      cloudDeleted: false,
      message: err?.message || 'تعذر الاتصال بالخادم.',
    };
  }
}

// =========================================================================
// نظام تقارير نهاية البرنامج والشهادات التفاعلية (تصدير PDF من المتصفح)
// =========================================================================

export const STORAGE_KEY_PDF_SETTINGS = 'faseeh_pdf_report_settings_v1';

export const DEFAULT_PDF_REPORT_SETTINGS: PdfReportSettings = {
  allowStudentFullReport: true,
  allowStudentCertificate: true,
  showReportButtonWhenEnded: true,
  showCertificateButtonWhenEnded: true,
  releaseMode: 'always_on',
  releaseDate: '',
  programReleaseOverrides: {},
  studentAllowOverrides: {},
  backgroundUrl: '',
  logoUrl: '',
  headerTitle: 'تقرير الأداء الشامل لنهاية البرنامج التدريبي',
  headerSubtitle: 'خلاصة التقييمات عبر التمارين الستة وسجل الحضور والخطة اليومية',
  footerNote: 'تم إصدار هذا التقرير آلياً من منصة التعليم والتقييم الذكي.',
  coverImageBeforeUrl: '',
  closingImageAfterUrl: '',
  accentColor: 'emerald',
  includeSections: {
    overallSummary: true,
    encouragement: true,
    attendance: true,
    scheduleProgress: true,
    pronunciation: true,
    matching: true,
    dictation: true,
    writing: true,
    catchAr: true,
    video: true,
  },
  certificate: {
    enabled: true,
    orientation: 'landscape',
    backgroundUrl: '',
    frameUrl: '',
    footerImageUrl: '',
    footerImageHeight: 46,
    subjectText: 'شهادة إتمام وإنجاز البرنامج التدريبي',
    subjectFontSize: 34,
    subjectAlign: 'center',
    subjectFontFamily: 'Amiri',
    subjectColor: '#065f46',
    bodyText:
      'تشهد إدارة البرنامج التدريبي بأن الطالب/ة ({{اسم_الطالب}}) رقم المشترك ({{رقم_الطالب}})\nقد أتمّ متطلبات ({{اسم_البرنامج}}) بتقدير ({{التقدير}}) وبنسبة إجمالية ({{النسبة_العامة}})،\nوأنجز {{عدد_الدروس_المكتملة}} درساً بمعدل حضور {{ايام_الحضور}} يوماً.\nسائلين الله له/لها دوام التوفيق والتميّز.\nصدر بتاريخ: {{تاريخ_الاصدار}}',
    bodyFontSize: 19,
    bodyAlign: 'center',
    bodyFontFamily: 'Cairo',
    bodyColor: '#1e293b',
    marginTop: 54,
    marginSide: 60,
    marginBottom: 42,
    signatures: [
      { id: 'sig_1', title: 'مدير البرنامج / المعلم المشرف', url: '', width: 120 },
    ],
    stamps: [{ id: 'stp_1', title: 'الختم الرسمي', url: '', width: 95 }],
  },
};

const VALID_RELEASE_MODES = new Set<PdfReleaseControlMode>([
  'always_on',
  'always_off',
  'after_date',
  'on_completion',
]);
const VALID_PDF_FONTS = new Set<PdfFontFamily>(['Cairo', 'Amiri', 'Aref Ruqaa']);
const VALID_PDF_ALIGNS = new Set<PdfTextAlign>(['right', 'center', 'left']);

export function normalizePdfReportSettings(raw: any): PdfReportSettings {
  const def = DEFAULT_PDF_REPORT_SETTINGS;
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(def));
  }

  const releaseMode: PdfReleaseControlMode = VALID_RELEASE_MODES.has(raw.releaseMode)
    ? raw.releaseMode
    : def.releaseMode;

  const programReleaseOverrides: Record<string, PdfProgramReleaseOverride> = {};
  if (raw.programReleaseOverrides && typeof raw.programReleaseOverrides === 'object') {
    for (const [pid, val] of Object.entries(raw.programReleaseOverrides)) {
      if (!pid || !val || typeof val !== 'object') continue;
      const vObj = val as any;
      if (VALID_RELEASE_MODES.has(vObj.releaseMode)) {
        programReleaseOverrides[pid] = {
          releaseMode: vObj.releaseMode,
          releaseDate: normalizeDateISO(vObj.releaseDate || '') || '',
        };
      }
    }
  }

  const studentAllowOverrides: Record<string, 'allow' | 'deny'> = {};
  if (raw.studentAllowOverrides && typeof raw.studentAllowOverrides === 'object') {
    for (const [sid, val] of Object.entries(raw.studentAllowOverrides)) {
      const cleanId = normalizeAttDigits(sid);
      if (cleanId && (val === 'allow' || val === 'deny')) {
        studentAllowOverrides[cleanId] = val;
      }
    }
  }

  const rawSec = raw.includeSections || {};
  const defSec = def.includeSections;
  const rawCert = raw.certificate || {};
  const defCert = def.certificate;

  const signatures: PdfSignatureConfig[] = Array.isArray(rawCert.signatures)
    ? rawCert.signatures
        .filter((s: any) => s && typeof s === 'object')
        .map((s: any, idx: number) => ({
          id: String(s.id || `sig_${idx + 1}`),
          title: String(s.title || ''),
          url: String(s.url || ''),
          width: Math.max(40, Math.min(320, Number(s.width) || 120)),
        }))
    : defCert.signatures.map((s) => ({ ...s }));

  const stamps: PdfStampConfig[] = Array.isArray(rawCert.stamps)
    ? rawCert.stamps
        .filter((s: any) => s && typeof s === 'object')
        .map((s: any, idx: number) => ({
          id: String(s.id || `stp_${idx + 1}`),
          title: String(s.title || ''),
          url: String(s.url || ''),
          width: Math.max(40, Math.min(300, Number(s.width) || 95)),
        }))
    : defCert.stamps.map((s) => ({ ...s }));

  const accentRaw = String(raw.accentColor || def.accentColor);
  const accentColor: PdfReportSettings['accentColor'] =
    accentRaw === 'indigo' || accentRaw === 'amber' || accentRaw === 'slate'
      ? accentRaw
      : 'emerald';

  return {
    allowStudentFullReport:
      raw.allowStudentFullReport !== undefined
        ? Boolean(raw.allowStudentFullReport)
        : def.allowStudentFullReport,
    allowStudentCertificate:
      raw.allowStudentCertificate !== undefined
        ? Boolean(raw.allowStudentCertificate)
        : def.allowStudentCertificate,
    showReportButtonWhenEnded:
      raw.showReportButtonWhenEnded !== undefined
        ? Boolean(raw.showReportButtonWhenEnded)
        : true,
    showCertificateButtonWhenEnded:
      raw.showCertificateButtonWhenEnded !== undefined
        ? Boolean(raw.showCertificateButtonWhenEnded)
        : true,
    releaseMode,
    releaseDate: normalizeDateISO(raw.releaseDate || '') || '',
    programReleaseOverrides,
    studentAllowOverrides,
    backgroundUrl: String(raw.backgroundUrl || ''),
    logoUrl: String(raw.logoUrl || ''),
    headerTitle:
      raw.headerTitle !== undefined ? String(raw.headerTitle) : def.headerTitle,
    headerSubtitle:
      raw.headerSubtitle !== undefined
        ? String(raw.headerSubtitle)
        : def.headerSubtitle,
    footerNote:
      raw.footerNote !== undefined ? String(raw.footerNote) : def.footerNote,
    coverImageBeforeUrl: String(raw.coverImageBeforeUrl || ''),
    closingImageAfterUrl: String(raw.closingImageAfterUrl || ''),
    accentColor,
    includeSections: {
      overallSummary:
        rawSec.overallSummary !== undefined
          ? Boolean(rawSec.overallSummary)
          : defSec.overallSummary,
      encouragement:
        rawSec.encouragement !== undefined
          ? Boolean(rawSec.encouragement)
          : defSec.encouragement,
      attendance:
        rawSec.attendance !== undefined
          ? Boolean(rawSec.attendance)
          : defSec.attendance,
      scheduleProgress:
        rawSec.scheduleProgress !== undefined
          ? Boolean(rawSec.scheduleProgress)
          : defSec.scheduleProgress,
      pronunciation:
        rawSec.pronunciation !== undefined
          ? Boolean(rawSec.pronunciation)
          : defSec.pronunciation,
      matching:
        rawSec.matching !== undefined ? Boolean(rawSec.matching) : defSec.matching,
      dictation:
        rawSec.dictation !== undefined
          ? Boolean(rawSec.dictation)
          : defSec.dictation,
      writing:
        rawSec.writing !== undefined ? Boolean(rawSec.writing) : defSec.writing,
      catchAr:
        rawSec.catchAr !== undefined ? Boolean(rawSec.catchAr) : defSec.catchAr,
      video: rawSec.video !== undefined ? Boolean(rawSec.video) : defSec.video,
    },
    certificate: {
      enabled:
        rawCert.enabled !== undefined ? Boolean(rawCert.enabled) : defCert.enabled,
      orientation: rawCert.orientation === 'portrait' ? 'portrait' : 'landscape',
      backgroundUrl: String(rawCert.backgroundUrl || ''),
      frameUrl: String(rawCert.frameUrl || ''),
      footerImageUrl: String(rawCert.footerImageUrl || ''),
      footerImageHeight: Math.max(
        20,
        Math.min(180, Number(rawCert.footerImageHeight) || defCert.footerImageHeight)
      ),
      subjectText:
        rawCert.subjectText !== undefined
          ? String(rawCert.subjectText)
          : defCert.subjectText,
      subjectFontSize: Math.max(
        16,
        Math.min(72, Number(rawCert.subjectFontSize) || defCert.subjectFontSize)
      ),
      subjectAlign: VALID_PDF_ALIGNS.has(rawCert.subjectAlign)
        ? rawCert.subjectAlign
        : defCert.subjectAlign,
      subjectFontFamily: VALID_PDF_FONTS.has(rawCert.subjectFontFamily)
        ? rawCert.subjectFontFamily
        : defCert.subjectFontFamily,
      subjectColor: String(rawCert.subjectColor || defCert.subjectColor),
      bodyText:
        rawCert.bodyText !== undefined ? String(rawCert.bodyText) : defCert.bodyText,
      bodyFontSize: Math.max(
        11,
        Math.min(42, Number(rawCert.bodyFontSize) || defCert.bodyFontSize)
      ),
      bodyAlign: VALID_PDF_ALIGNS.has(rawCert.bodyAlign)
        ? rawCert.bodyAlign
        : defCert.bodyAlign,
      bodyFontFamily: VALID_PDF_FONTS.has(rawCert.bodyFontFamily)
        ? rawCert.bodyFontFamily
        : defCert.bodyFontFamily,
      bodyColor: String(rawCert.bodyColor || defCert.bodyColor),
      marginTop: Math.max(
        10,
        Math.min(200, Number(rawCert.marginTop) || defCert.marginTop)
      ),
      marginSide: Math.max(
        10,
        Math.min(200, Number(rawCert.marginSide) || defCert.marginSide)
      ),
      marginBottom: Math.max(
        10,
        Math.min(200, Number(rawCert.marginBottom) || defCert.marginBottom)
      ),
      signatures,
      stamps,
    },
  };
}

export function getLocalPdfReportSettings(): PdfReportSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PDF_SETTINGS);
    if (!raw) return normalizePdfReportSettings(null);
    return normalizePdfReportSettings(JSON.parse(raw));
  } catch {
    return normalizePdfReportSettings(null);
  }
}

export function saveLocalPdfReportSettings(settings: PdfReportSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_PDF_SETTINGS,
      JSON.stringify(normalizePdfReportSettings(settings))
    );
  } catch {}
}

export async function fetchPdfSettingsFromSheets(
  webhookUrl: string
): Promise<{ settings: PdfReportSettings | null; scriptSupported: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { settings: getLocalPdfReportSettings(), scriptSupported: true };
  }
  try {
    const cleanUrl = webhookUrl.trim();
    const sep = cleanUrl.includes('?') ? '&' : '?';
    const res = await fetch(
      `${cleanUrl}${sep}action=get_pdf_settings&_t=${Date.now()}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    const json = await res.json();
    if (json && json.pdfSettingsHandled) {
      if (json.settings && typeof json.settings === 'object') {
        const normalized = normalizePdfReportSettings(json.settings);
        saveLocalPdfReportSettings(normalized);
        return { settings: normalized, scriptSupported: true };
      }
      return { settings: null, scriptSupported: true };
    }
    return { settings: null, scriptSupported: false };
  } catch {
    return { settings: null, scriptSupported: true };
  }
}

export async function savePdfSettingsToSheets(
  webhookUrl: string,
  settings: PdfReportSettings
): Promise<{
  success: boolean;
  cloudSaved: boolean;
  needsScriptUpdate?: boolean;
  message: string;
}> {
  const normalized = normalizePdfReportSettings(settings);
  saveLocalPdfReportSettings(normalized);

  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: true,
      cloudSaved: false,
      message: 'تم حفظ إعدادات PDF محلياً في المتصفح فقط.',
    };
  }

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_pdf_settings',
        settings: normalized,
      }),
    });
    const json = await res.json();
    if (json && json.pdfSettingsSaved) {
      return {
        success: true,
        cloudSaved: true,
        message:
          json.message ||
          'تم حفظ ومزامنة إعدادات تقارير PDF والشهادات إلى Google Sheets بنجاح!',
      };
    }
    return {
      success: true,
      cloudSaved: false,
      needsScriptUpdate: true,
      message:
        'تم الحفظ محلياً، لكن كود Google Apps Script المنشور قديم. حدّث الكود وانشر إصداراً جديداً لحفظ ورقة إعدادات_PDF.',
    };
  } catch (err: any) {
    return {
      success: false,
      cloudSaved: false,
      message: err?.message || 'حدث خطأ أثناء الاتصال بـ Google Sheets.',
    };
  }
}

export interface StudentPdfAccessEvaluation {
  canViewReport: boolean;
  canViewCertificate: boolean;
  releaseLabelAr: string;
  lockReasonAr: string;
}

export function evaluateStudentPdfAccess(params: {
  pdfSettings: PdfReportSettings;
  student?: StudentRegistrant | null;
  isAdmin?: boolean;
  scheduleCompletionPct?: number;
  todayISO?: string;
}): StudentPdfAccessEvaluation {
  const { pdfSettings, student, isAdmin = false } = params;
  if (isAdmin) {
    return {
      canViewReport: true,
      canViewCertificate: true,
      releaseLabelAr: 'معاينة الإدارة مفتوحة دائماً',
      lockReasonAr: '',
    };
  }

  const today = normalizeDateISO(params.todayISO) || getTodayLocalISO();
  const cleanId = normalizeAttDigits(student?.id || '');
  const override = cleanId ? pdfSettings.studentAllowOverrides?.[cleanId] : undefined;

  if (override === 'deny') {
    return {
      canViewReport: false,
      canViewCertificate: false,
      releaseLabelAr: 'مغلق لهذا الحساب',
      lockReasonAr: 'تم إغلاق إتاحة التقرير والشهادة لهذا الحساب من قِبل المعلم.',
    };
  }

  if (override === 'allow') {
    return {
      canViewReport: true,
      canViewCertificate: Boolean(pdfSettings.certificate?.enabled),
      releaseLabelAr: 'استثناء مفتوح للطالب',
      lockReasonAr: '',
    };
  }

  const progId = (student?.programId || '').trim();
  const progRule =
    (progId && pdfSettings.programReleaseOverrides?.[progId]) || null;
  const effectiveMode: PdfReleaseControlMode =
    progRule?.releaseMode || pdfSettings.releaseMode || 'always_on';
  const effectiveDate =
    normalizeDateISO(progRule?.releaseDate || pdfSettings.releaseDate || '') || '';

  let ruleOpen = true;
  let releaseLabelAr = 'مفتوح دائماً';
  let lockReasonAr = '';

  if (effectiveMode === 'always_off') {
    ruleOpen = false;
    releaseLabelAr = 'مغلق حالياً';
    lockReasonAr = 'التقرير الشامل والشهادة غير متاحين حالياً بناءً على إعدادات المعلم.';
  } else if (effectiveMode === 'after_date') {
    releaseLabelAr = effectiveDate
      ? `يُفتح من تاريخ ${effectiveDate}`
      : 'معلق لحين تحديد التاريخ';
    if (!effectiveDate || today < effectiveDate) {
      ruleOpen = false;
      lockReasonAr = effectiveDate
        ? `سيُتاح التقرير والشهادة تلقائياً بدءاً من تاريخ (${effectiveDate}).`
        : 'بانتظار تحديد تاريخ فتح التقرير من قِبل المعلم.';
    }
  } else if (effectiveMode === 'on_completion') {
    releaseLabelAr = 'عند إتمام 100% من خطة البرنامج';
    const pct = Number(params.scheduleCompletionPct ?? 0);
    if (pct < 100) {
      ruleOpen = false;
      lockReasonAr = `يُفتح التقرير والشهادة تلقائياً عند إتمام 100% من خطة البرنامج (إنجازك الحالي: ${pct}%).`;
    }
  }

  const canReport = ruleOpen && Boolean(pdfSettings.allowStudentFullReport);
  const canCert =
    ruleOpen &&
    Boolean(pdfSettings.allowStudentCertificate) &&
    Boolean(pdfSettings.certificate?.enabled);

  if (ruleOpen && !canReport && !canCert) {
    lockReasonAr = 'قام المعلم بإخفاء التقرير والشهادة مؤقتاً عن حسابات الطلاب.';
  }

  return {
    canViewReport: canReport,
    canViewCertificate: canCert,
    releaseLabelAr,
    lockReasonAr,
  };
}

function safeExtractPct(text?: string, fallback?: unknown): number {
  const num = Number(fallback);
  if (text) {
    const eqMatch = String(text).match(/=\s*(\d+(?:\.\d+)?)\s*%/);
    if (eqMatch) return Math.round(Number(eqMatch[1]));
    const pctMatch = String(text).match(/(\d+(?:\.\d+)?)\s*%/);
    if (pctMatch) return Math.round(Number(pctMatch[1]));
  }
  return Number.isFinite(num) ? Math.round(num) : 0;
}

export interface StudentReportScheduleDayRow {
  date: string;
  formattedDate: string;
  weekday: string;
  dayTypeLabelAr: string;
  groupNames: string;
  completedCount: number;
  totalCount: number;
}

export interface StudentFullReportSummary {
  studentId: string;
  studentName: string;
  programId: string;
  programName: string;
  issuedDateFormatted: string;
  overallPct: number;
  starsOutOf10: number;
  gradeLabelAr: string;
  encouragementTitle: string;
  encouragementMessage: string;
  totalScheduleDays: number;
  totalScheduledLessons: number;
  completedScheduledLessons: number;
  scheduleCompletionPct: number;
  scheduleDayRows: StudentReportScheduleDayRow[];
  attendanceList: AttendanceRecord[];
  pronunciationAvg: number;
  pronunciationRows: {
    word: string;
    spokenText: string;
    score: number;
    grade: string;
  }[];
  matchingAvg: number;
  matchingRows: {
    subject: string;
    exercisesCount: number;
    avgPct: number;
    status: string;
  }[];
  dictationAvg: number;
  dictationRows: {
    subject: string;
    exercisesCount: number;
    avgPct: number;
    status: string;
  }[];
  writingAvg: number;
  writingRows: {
    topic: string;
    boardsCount: number;
    avgScore: number;
    status: string;
  }[];
  catchAvg: number;
  catchRows: {
    subject: string;
    exercisesCount: number;
    avgPct: number;
    status: string;
  }[];
  videoCompletedCount: number;
  videoRows: {
    title: string;
    videoDone: boolean;
    imageStatus: string;
    audioStatus: string;
    completed: boolean;
    pct: number;
  }[];
}

export function buildStudentFullReportSummary(params: {
  student: { id: string; name: string; programId?: string; classroomId?: string };
  schedule: CourseScheduleData;
  attendanceRecords: AttendanceRecord[];
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
}): StudentFullReportSummary {
  const cleanId = normalizeAttDigits(params.student.id || '');
  const cleanName = (params.student.name || 'طالب').trim();
  const { activeProgram, scopedSchedule } = getScheduleForProgram(
    params.schedule,
    params.student.programId,
    params.student.classroomId
  );

  // 1. Attendance for this student
  const attendanceList = (params.attendanceRecords || [])
    .filter((r) => !cleanId || normalizeAttDigits(r.studentId) === cleanId)
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // 2. Schedule days progress
  const evalCtx = {
    curriculum: params.curriculum,
    studentHistory: params.studentHistory,
    matchingSubjects: params.matchingSubjects,
    matchingHistory: params.matchingHistory,
    dictationSubjects: params.dictationSubjects,
    dictationHistory: params.dictationHistory,
    writingTemplates: params.writingTemplates,
    writingHistory: params.writingHistory,
    catchSubjects: params.catchSubjects,
    catchHistory: params.catchHistory,
    videoLessons: params.videoLessons,
    videoProgressMap: params.videoProgressMap,
  };

  let totalScheduledLessons = 0;
  let completedScheduledLessons = 0;

  const scheduleDayRows: StudentReportScheduleDayRow[] = scopedSchedule.days.map(
    (day) => {
      const gIds = day.groupIds?.length
        ? day.groupIds
        : day.groupId
        ? [day.groupId]
        : [];
      const grps = gIds
        .map((gid) => scopedSchedule.groups.find((g) => g.id === gid))
        .filter((g): g is CourseGroup => Boolean(g));
      const refs = grps.flatMap((g) => g.lessons || []);
      let done = 0;
      for (const ref of refs) {
        if (evaluateScheduledLessonStatus(ref, evalCtx).completed) done++;
      }
      totalScheduledLessons += refs.length;
      completedScheduledLessons += done;
      const dLbl = formatScheduleDateLabel(day.date, 'ar');
      return {
        date: day.date,
        formattedDate: dLbl.formattedDate,
        weekday: dLbl.weekday,
        dayTypeLabelAr:
          SCHEDULE_DAY_TYPE_META[day.dayType]?.labelAr || 'درس عادي',
        groupNames:
          grps.map((g) => g.name).join(' + ') || day.customTitle || '—',
        completedCount: done,
        totalCount: refs.length,
      };
    }
  );

  const scheduleCompletionPct =
    totalScheduledLessons > 0
      ? Math.round((completedScheduledLessons / totalScheduledLessons) * 100)
      : 0;

  // 3. Pronunciation (answers 1)
  const pronunciationRows = (params.studentHistory || []).map((h) => ({
    word: h.word || '',
    spokenText: h.spokenText || '—',
    score: Math.round(Number(h.score) || 0),
    grade: h.grade || '',
  }));
  const pronunciationAvg =
    pronunciationRows.length > 0
      ? Math.round(
          pronunciationRows.reduce((acc, r) => acc + r.score, 0) /
            pronunciationRows.length
        )
      : 0;

  // 4. Matching (answers 2)
  const matchingRows = (params.matchingHistory || []).map((m) => {
    const exs = m.exercises || [];
    const avgPct =
      exs.length > 0
        ? Math.round(
            exs.reduce(
              (acc, ex) => acc + safeExtractPct(ex.formulaString, ex.percentage),
              0
            ) / exs.length
          )
        : safeExtractPct(m.completionStatus, 0);
    return {
      subject: m.lessonSubject || '',
      exercisesCount: exs.length,
      avgPct,
      status: m.completionStatus || '',
    };
  });
  const matchingAvg =
    matchingRows.length > 0
      ? Math.round(
          matchingRows.reduce((acc, r) => acc + r.avgPct, 0) / matchingRows.length
        )
      : 0;

  // 5. Dictation (answers 3)
  const dictationRows = (params.dictationHistory || []).map((d) => {
    const exs = d.exercises || [];
    const avgPct =
      exs.length > 0
        ? Math.round(
            exs.reduce(
              (acc, ex) => acc + safeExtractPct(ex.formulaString, ex.percentage),
              0
            ) / exs.length
          )
        : safeExtractPct(d.completionStatus, 0);
    return {
      subject: d.lessonSubject || '',
      exercisesCount: exs.length,
      avgPct,
      status: d.completionStatus || '',
    };
  });
  const dictationAvg =
    dictationRows.length > 0
      ? Math.round(
          dictationRows.reduce((acc, r) => acc + r.avgPct, 0) / dictationRows.length
        )
      : 0;

  // 6. Writing (answers 4)
  const writingRows = (params.writingHistory || []).map((w) => {
    const exs = w.exercises || [];
    const avgScore =
      exs.length > 0
        ? Math.round(
            exs.reduce((acc, ex) => acc + (Number(ex.score) || 0), 0) / exs.length
          )
        : safeExtractPct(w.completionStatus, 0);
    return {
      topic: w.topic || '',
      boardsCount: exs.length,
      avgScore,
      status: w.completionStatus || '',
    };
  });
  const writingAvg =
    writingRows.length > 0
      ? Math.round(
          writingRows.reduce((acc, r) => acc + r.avgScore, 0) / writingRows.length
        )
      : 0;

  // 7. AR Catch (اجابات صيد)
  const catchRows = (params.catchHistory || []).map((c) => {
    const exs = c.exercises || [];
    const avgPct =
      exs.length > 0
        ? Math.round(
            exs.reduce(
              (acc, ex) => acc + safeExtractPct(ex.formulaString, ex.percentage),
              0
            ) / exs.length
          )
        : safeExtractPct(c.completionStatus, 0);
    return {
      subject: c.lessonSubject || '',
      exercisesCount: exs.length,
      avgPct,
      status: c.completionStatus || '',
    };
  });
  const catchAvg =
    catchRows.length > 0
      ? Math.round(
          catchRows.reduce((acc, r) => acc + r.avgPct, 0) / catchRows.length
        )
      : 0;

  // 8. Video lessons
  const videoRows = (params.videoLessons || []).map((vl) => {
    const prog = params.videoProgressMap?.[vl.id];
    const ev = evaluateVideoLessonCompletion(vl, prog);
    const totalParts = 1 + (ev.imageRequired ? 1 : 0) + (ev.audioRequired ? 1 : 0);
    const doneParts =
      (ev.videoDone ? 1 : 0) +
      (ev.imageRequired && ev.imageDone ? 1 : 0) +
      (ev.audioRequired && ev.audioDone ? 1 : 0);
    const pct = totalParts > 0 ? Math.round((doneParts / totalParts) * 100) : 0;
    return {
      title: vl.title || vl.topic || vl.id,
      videoDone: ev.videoDone,
      imageStatus: ev.imageRequired
        ? ev.imageDone
          ? 'تم الإرسال ✓'
          : 'مطلوب'
        : 'غير مطلوب',
      audioStatus: ev.audioRequired
        ? ev.audioDone
          ? prog?.explainAudioScore
            ? `تم (${prog.explainAudioScore}%)`
            : 'تم الإرسال ✓'
          : 'مطلوب'
        : 'غير مطلوب',
      completed: ev.isFullyCompleted,
      pct,
    };
  });
  const videoCompletedCount = videoRows.filter((v) => v.completed).length;
  const activeVideoRows = videoRows.filter((v) => v.pct > 0);
  const videoAvg =
    activeVideoRows.length > 0
      ? Math.round(
          activeVideoRows.reduce((acc, v) => acc + v.pct, 0) /
            activeVideoRows.length
        )
      : 0;

  // Overall average across categories where student has recorded progress
  const activeScores: number[] = [];
  if (pronunciationRows.length > 0) activeScores.push(pronunciationAvg);
  if (matchingRows.length > 0) activeScores.push(matchingAvg);
  if (dictationRows.length > 0) activeScores.push(dictationAvg);
  if (writingRows.length > 0) activeScores.push(writingAvg);
  if (catchRows.length > 0) activeScores.push(catchAvg);
  if (activeVideoRows.length > 0) activeScores.push(videoAvg);
  if (activeScores.length === 0 && scheduleCompletionPct > 0) {
    activeScores.push(scheduleCompletionPct);
  }

  const overallPct =
    activeScores.length > 0
      ? Math.round(
          activeScores.reduce((acc, s) => acc + s, 0) / activeScores.length
        )
      : 0;
  const starsOutOf10 =
    activeScores.length > 0
      ? Math.max(1, Math.min(10, Math.round(overallPct / 10)))
      : 0;

  let gradeLabelAr = 'مشارك نشيط';
  let encouragementTitle = 'انطلاقة موفّقة نحو الإتقان';
  let encouragementMessage =
    'استمر في التدريب اليومي المنتظم عبر التمارين الصوتية والكتابية لتحقيق أعلى مستويات الفصاحة والإتقان.';

  if (overallPct >= 90) {
    gradeLabelAr = 'ممتاز مع مرتبة الشرف';
    encouragementTitle = 'أداء استثنائي ومستوى رفيع!';
    encouragementMessage =
      'ما شاء الله! حققت نتائج باهرة ومتميزة في مختلف مهارات النطق والكتابة والاستيعاب. نفخر بتفانيك وانضباطك طوال البرنامج.';
  } else if (overallPct >= 80) {
    gradeLabelAr = 'ممتاز';
    encouragementTitle = 'تقدّم رائع وإتقان واضح!';
    encouragementMessage =
      'أحسنت! أظهرت التزاماً عالياً وجودة لافتة في النطق والإملاء والخط العربي. واصل بهذا الحماس نحو القمة.';
  } else if (overallPct >= 70) {
    gradeLabelAr = 'جيد جداً';
    encouragementTitle = 'إنجاز طيّب وخطى ثابتة!';
    encouragementMessage =
      'جهد مشكور وتطور ملحوظ في إتمام المهام المطلوبة. بمزيد من المراجعة والتكرار ستصل إلى الدرجات الكاملة بإذن الله.';
  } else if (overallPct >= 50) {
    gradeLabelAr = 'جيد';
    encouragementTitle = 'خطوة جميلة على طريق التعلّم!';
    encouragementMessage =
      'بداية إيجابية ومثابرة تستحق التشجيع. ننصح بمراجعة الدروس السابقة وإعادة التمارين التي لم تكتمل بعد.';
  }

  return {
    studentId: params.student.id || '—',
    studentName: cleanName,
    programId: activeProgram.id,
    programName: activeProgram.name,
    issuedDateFormatted: formatScheduleDateLabel(getTodayLocalISO(), 'ar')
      .formattedDate,
    overallPct,
    starsOutOf10,
    gradeLabelAr,
    encouragementTitle,
    encouragementMessage,
    totalScheduleDays: scopedSchedule.days.length,
    totalScheduledLessons,
    completedScheduledLessons,
    scheduleCompletionPct,
    scheduleDayRows,
    attendanceList,
    pronunciationAvg,
    pronunciationRows,
    matchingAvg,
    matchingRows,
    dictationAvg,
    dictationRows,
    writingAvg,
    writingRows,
    catchAvg,
    catchRows,
    videoCompletedCount,
    videoRows,
  };
}

function escapePdfHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolvePdfImageSrc(url?: string): string {
  const clean = (url || '').trim();
  if (!clean) return '';
  return getDirectImageUrl(clean);
}

const PDF_THEME_PALETTE: Record<
  PdfReportSettings['accentColor'],
  { primary: string; primaryDark: string; softBg: string; border: string }
> = {
  emerald: {
    primary: '#059669',
    primaryDark: '#064e3b',
    softBg: '#ecfdf5',
    border: '#a7f3d0',
  },
  indigo: {
    primary: '#4f46e5',
    primaryDark: '#312e81',
    softBg: '#eef2ff',
    border: '#c7d2fe',
  },
  amber: {
    primary: '#d97706',
    primaryDark: '#78350f',
    softBg: '#fffbeb',
    border: '#fde68a',
  },
  slate: {
    primary: '#334155',
    primaryDark: '#0f172a',
    softBg: '#f8fafc',
    border: '#cbd5e1',
  },
};

export function buildFullReportHtml(params: {
  summary: StudentFullReportSummary;
  pdfSettings: PdfReportSettings;
  platformTitle?: string;
  homeLogoUrl?: string;
}): string {
  const { summary, pdfSettings } = params;
  const palette = PDF_THEME_PALETTE[pdfSettings.accentColor] || PDF_THEME_PALETTE.emerald;
  const sec = pdfSettings.includeSections;

  const logoSrc = resolvePdfImageSrc(pdfSettings.logoUrl || params.homeLogoUrl);
  const bgSrc = resolvePdfImageSrc(pdfSettings.backgroundUrl);
  const coverBeforeSrc = resolvePdfImageSrc(pdfSettings.coverImageBeforeUrl);
  const closingAfterSrc = resolvePdfImageSrc(pdfSettings.closingImageAfterUrl);

  const starsHtml = Array.from({ length: 10 }, (_, idx) => {
    const filled = idx < summary.starsOutOf10;
    return `<span style="font-size:20px;color:${filled ? '#f59e0b' : '#cbd5e1'};margin:0 1px;">★</span>`;
  }).join('');

  const sectionTable = (
    title: string,
    headers: string[],
    rowsHtml: string,
    emptyText: string,
    badge?: string
  ) => `
    <section class="card">
      <div class="section-head">
        <h3>${escapePdfHtml(title)}</h3>
        ${badge ? `<span class="badge">${escapePdfHtml(badge)}</span>` : ''}
      </div>
      ${
        rowsHtml
          ? `<table>
              <thead><tr>${headers
                .map((h) => `<th>${escapePdfHtml(h)}</th>`)
                .join('')}</tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>`
          : `<div class="empty">${escapePdfHtml(emptyText)}</div>`
      }
    </section>
  `;

  const attendanceRowsHtml = summary.attendanceList
    .map(
      (a, idx) => `<tr>
        <td>${idx + 1}</td>
        <td class="mono">${escapePdfHtml(a.date)}</td>
        <td class="mono">${escapePdfHtml(a.time || '—')}</td>
        <td>${escapePdfHtml(a.sessionTitle || 'حصة')}</td>
      </tr>`
    )
    .join('');

  const scheduleRowsHtml = summary.scheduleDayRows
    .map(
      (d) => `<tr>
        <td class="mono">${escapePdfHtml(d.formattedDate)}</td>
        <td>${escapePdfHtml(d.weekday)}</td>
        <td>${escapePdfHtml(d.dayTypeLabelAr)}</td>
        <td>${escapePdfHtml(d.groupNames)}</td>
        <td class="mono">${d.completedCount} / ${d.totalCount}</td>
      </tr>`
    )
    .join('');

  const pronRowsHtml = summary.pronunciationRows
    .map(
      (p, idx) => `<tr>
        <td>${idx + 1}</td>
        <td class="amiri bold">${escapePdfHtml(p.word)}</td>
        <td class="amiri">${escapePdfHtml(p.spokenText)}</td>
        <td class="mono bold">${p.score}%</td>
        <td>${escapePdfHtml(p.grade || '—')}</td>
      </tr>`
    )
    .join('');

  const matchingRowsHtml = summary.matchingRows
    .map(
      (m, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${escapePdfHtml(m.subject)}</td>
        <td class="mono">${m.exercisesCount}</td>
        <td class="mono bold">${m.avgPct}%</td>
        <td>${escapePdfHtml(m.status || '—')}</td>
      </tr>`
    )
    .join('');

  const dictationRowsHtml = summary.dictationRows
    .map(
      (d, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${escapePdfHtml(d.subject)}</td>
        <td class="mono">${d.exercisesCount}</td>
        <td class="mono bold">${d.avgPct}%</td>
        <td>${escapePdfHtml(d.status || '—')}</td>
      </tr>`
    )
    .join('');

  const writingRowsHtml = summary.writingRows
    .map(
      (w, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${escapePdfHtml(w.topic)}</td>
        <td class="mono">${w.boardsCount}</td>
        <td class="mono bold">${w.avgScore}%</td>
        <td>${escapePdfHtml(w.status || '—')}</td>
      </tr>`
    )
    .join('');

  const catchRowsHtml = summary.catchRows
    .map(
      (c, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${escapePdfHtml(c.subject)}</td>
        <td class="mono">${c.exercisesCount}</td>
        <td class="mono bold">${c.avgPct}%</td>
        <td>${escapePdfHtml(c.status || '—')}</td>
      </tr>`
    )
    .join('');

  const videoRowsHtml = summary.videoRows
    .map(
      (v, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${escapePdfHtml(v.title)}</td>
        <td>${v.videoDone ? 'مكتمل ✓' : 'لم يُنجز'}</td>
        <td>${escapePdfHtml(v.imageStatus)}</td>
        <td>${escapePdfHtml(v.audioStatus)}</td>
        <td class="mono bold">${v.pct}%</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapePdfHtml(pdfSettings.headerTitle)} - ${escapePdfHtml(summary.studentName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Cairo', sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page-bg {
      position: fixed;
      inset: 0;
      z-index: -1;
      opacity: 0.1;
      pointer-events: none;
      ${bgSrc ? `background-image: url('${escapePdfHtml(bgSrc)}'); background-size: cover; background-position: center;` : ''}
    }
    .cover-img-page {
      page-break-after: always;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 265mm;
    }
    .closing-img-page {
      page-break-before: always;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 265mm;
    }
    .full-img {
      max-width: 100%;
      max-height: 265mm;
      border-radius: 12px;
      object-fit: contain;
    }
    .container { padding: 4px; }
    .header {
      background: linear-gradient(135deg, ${palette.primaryDark}, ${palette.primary});
      color: #ffffff;
      border-radius: 16px;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }
    .header-brand { display: flex; align-items: center; gap: 14px; }
    .header-logo {
      width: 60px;
      height: 60px;
      border-radius: 12px;
      object-fit: contain;
      background: #ffffff;
      padding: 4px;
    }
    .header h1 { margin: 0; font-size: 19px; font-weight: 800; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.92; }
    .score-pill {
      background: rgba(255,255,255,0.16);
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 14px;
      padding: 10px 16px;
      text-align: center;
      min-width: 110px;
    }
    .score-pill .num { font-size: 24px; font-weight: 800; line-height: 1.1; }
    .score-pill .lbl { font-size: 11px; opacity: 0.95; }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .info-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 9px 11px;
    }
    .info-box .k { font-size: 10px; color: #64748b; font-weight: 700; }
    .info-box .v { font-size: 13px; color: #0f172a; font-weight: 800; margin-top: 2px; }
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 12px 14px;
      margin-bottom: 12px;
      break-inside: avoid;
    }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 9px;
      padding-bottom: 6px;
      border-bottom: 1px solid #f1f5f9;
    }
    .section-head h3 { margin: 0; font-size: 14px; font-weight: 800; color: ${palette.primaryDark}; }
    .badge {
      background: ${palette.softBg};
      color: ${palette.primaryDark};
      border: 1px solid ${palette.border};
      border-radius: 999px;
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 800;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    .kpi-item {
      background: ${palette.softBg};
      border: 1px solid ${palette.border};
      border-radius: 10px;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .kpi-item .name { font-size: 11px; font-weight: 700; color: #334155; }
    .kpi-item .val { font-size: 14px; font-weight: 800; color: ${palette.primaryDark}; font-family: monospace; }
    .stars-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 12px;
      padding: 9px 14px;
      margin-bottom: 10px;
    }
    .encourage {
      background: ${palette.softBg};
      border-right: 4px solid ${palette.primary};
      border-radius: 12px;
      padding: 11px 14px;
      margin-bottom: 12px;
      break-inside: avoid;
    }
    .encourage h4 { margin: 0 0 4px; font-size: 13px; font-weight: 800; color: ${palette.primaryDark}; }
    .encourage p { margin: 0; font-size: 12px; color: #334155; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: right; }
    th { background: #f1f5f9; font-weight: 800; color: #334155; }
    tr:nth-child(even) td { background: #fafcff; }
    .mono { font-family: monospace; direction: ltr; text-align: center; }
    .amiri { font-family: 'Amiri', serif; font-size: 14px; }
    .bold { font-weight: 800; }
    .empty { font-size: 11px; color: #94a3b8; padding: 6px 0; }
    .footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #64748b;
    }
  </style>
</head>
<body>
  ${bgSrc ? '<div class="page-bg"></div>' : ''}
  ${coverBeforeSrc ? `<div class="cover-img-page"><img src="${escapePdfHtml(coverBeforeSrc)}" class="full-img" alt="غلاف" /></div>` : ''}
  <div class="container">
    <header class="header">
      <div class="header-brand">
        ${logoSrc ? `<img src="${escapePdfHtml(logoSrc)}" class="header-logo" alt="شعار" />` : ''}
        <div>
          <h1>${escapePdfHtml(pdfSettings.headerTitle || 'تقرير الأداء الشامل')}</h1>
          <p>${escapePdfHtml(pdfSettings.headerSubtitle || params.platformTitle || '')}</p>
        </div>
      </div>
      <div class="score-pill">
        <div class="num">${summary.overallPct}%</div>
        <div class="lbl">${escapePdfHtml(summary.gradeLabelAr)}</div>
      </div>
    </header>

    <div class="info-grid">
      <div class="info-box"><div class="k">اسم المشترك</div><div class="v">${escapePdfHtml(summary.studentName)}</div></div>
      <div class="info-box"><div class="k">رقم المشترك (ID)</div><div class="v">${escapePdfHtml(summary.studentId)}</div></div>
      <div class="info-box"><div class="k">البرنامج التدريبي</div><div class="v">${escapePdfHtml(summary.programName)}</div></div>
      <div class="info-box"><div class="k">تاريخ التقرير</div><div class="v">${escapePdfHtml(summary.issuedDateFormatted)}</div></div>
    </div>

    ${
      sec.overallSummary
        ? `<section class="card">
            <div class="section-head">
              <h3>الملخص العام والتقييم بالنجوم</h3>
              <span class="badge">${summary.starsOutOf10} / 10 نجوم</span>
            </div>
            <div class="stars-box">
              <div>${starsHtml}</div>
              <div style="font-size:12px;font-weight:800;color:#92400e;">إنجاز الخطة: ${summary.completedScheduledLessons} / ${summary.totalScheduledLessons} (${summary.scheduleCompletionPct}%)</div>
            </div>
            <div class="kpi-grid">
              <div class="kpi-item"><span class="name">تدريب النطق</span><span class="val">${summary.pronunciationAvg}%</span></div>
              <div class="kpi-item"><span class="name">تمارين الوصل</span><span class="val">${summary.matchingAvg}%</span></div>
              <div class="kpi-item"><span class="name">تمرين الإملاء</span><span class="val">${summary.dictationAvg}%</span></div>
              <div class="kpi-item"><span class="name">تمرين الكتابة</span><span class="val">${summary.writingAvg}%</span></div>
              <div class="kpi-item"><span class="name">تحدي الصيد AR</span><span class="val">${summary.catchAvg}%</span></div>
              <div class="kpi-item"><span class="name">الفيديو التفاعلي</span><span class="val">${summary.videoCompletedCount}/${summary.videoRows.length}</span></div>
            </div>
          </section>`
        : ''
    }

    ${
      sec.encouragement
        ? `<div class="encourage">
            <h4>${escapePdfHtml(summary.encouragementTitle)}</h4>
            <p>${escapePdfHtml(summary.encouragementMessage)}</p>
          </div>`
        : ''
    }

    ${
      sec.attendance
        ? sectionTable(
            'سجل حضور الحصص اليومية',
            ['#', 'التاريخ', 'الوقت', 'عنوان الحصة'],
            attendanceRowsHtml,
            'لم تُسجل أيام حضور بعد.',
            `${summary.attendanceList.length} حضور`
          )
        : ''
    }

    ${
      sec.scheduleProgress
        ? sectionTable(
            'التقدم حسب أيام الجدول الدراسي',
            ['التاريخ', 'اليوم', 'النوع', 'المجموعة', 'الإنجاز'],
            scheduleRowsHtml,
            'لا توجد أيام مجدولة في هذا البرنامج.',
            `${summary.scheduleCompletionPct}%`
          )
        : ''
    }

    ${
      sec.pronunciation
        ? sectionTable(
            'نتائج تدريب النطق (answers 1)',
            ['#', 'الكلمة المستهدفة', 'النطق المرصود', 'الدرجة', 'التقدير'],
            pronRowsHtml,
            'لا توجد محاولات نطق مسجلة حتى الآن.',
            `المتوسط: ${summary.pronunciationAvg}%`
          )
        : ''
    }

    ${
      sec.matching
        ? sectionTable(
            'نتائج تمارين الوصل (answers 2)',
            ['#', 'موضوع الدرس', 'عدد التمارين', 'النسبة', 'الحالة'],
            matchingRowsHtml,
            'لا توجد نتائج في تمارين الوصل.',
            `المتوسط: ${summary.matchingAvg}%`
          )
        : ''
    }

    ${
      sec.dictation
        ? sectionTable(
            'نتائج تمارين الإملاء (answers 3)',
            ['#', 'موضوع الدرس', 'عدد الكلمات', 'النسبة', 'الحالة'],
            dictationRowsHtml,
            'لا توجد نتائج في تمارين الإملاء.',
            `المتوسط: ${summary.dictationAvg}%`
          )
        : ''
    }

    ${
      sec.writing
        ? sectionTable(
            'نتائج تمارين الخط والكتابة (answers 4)',
            ['#', 'الموضوع', 'عدد اللوحات', 'المتوسط', 'الحالة'],
            writingRowsHtml,
            'لا توجد نتائج في تمارين الكتابة.',
            `المتوسط: ${summary.writingAvg}%`
          )
        : ''
    }

    ${
      sec.catchAr
        ? sectionTable(
            'نتائج تحدي صيد الكلمات AR (اجابات صيد)',
            ['#', 'موضوع الدرس', 'عدد الجولات', 'النسبة', 'الحالة'],
            catchRowsHtml,
            'لا توجد نتائج في تحدي الصيد AR.',
            `المتوسط: ${summary.catchAvg}%`
          )
        : ''
    }

    ${
      sec.video
        ? sectionTable(
            'نتائج دروس الفيديو التفاعلي والواجبات',
            ['#', 'الدرس', 'الفيديو', 'واجب الصورة', 'الواجب الصوتي', 'الإنجاز'],
            videoRowsHtml,
            'لا توجد دروس فيديو مسجلة.',
            `${summary.videoCompletedCount} / ${summary.videoRows.length}`
          )
        : ''
    }

    <footer class="footer">
      <span>${escapePdfHtml(pdfSettings.footerNote || '')}</span>
      <span>${escapePdfHtml(params.platformTitle || '')} · ${escapePdfHtml(summary.issuedDateFormatted)}</span>
    </footer>
  </div>
  ${closingAfterSrc ? `<div class="closing-img-page"><img src="${escapePdfHtml(closingAfterSrc)}" class="full-img" alt="خاتمة" /></div>` : ''}
</body>
</html>`;
}

function interpolateCertificatePlaceholders(
  template: string,
  summary: StudentFullReportSummary
): string {
  return String(template || '')
    .replace(/\{\{اسم_الطالب\}\}/g, summary.studentName)
    .replace(/\{\{رقم_الطالب\}\}/g, summary.studentId)
    .replace(/\{\{اسم_البرنامج\}\}/g, summary.programName)
    .replace(/\{\{النسبة_العامة\}\}/g, `${summary.overallPct}%`)
    .replace(/\{\{التقدير\}\}/g, summary.gradeLabelAr)
    .replace(/\{\{تاريخ_الاصدار\}\}/g, summary.issuedDateFormatted)
    .replace(/\{\{ايام_الحضور\}\}/g, String(summary.attendanceList.length))
    .replace(/\{\{عدد_الدروس_المكتملة\}\}/g, String(summary.completedScheduledLessons));
}

export function buildCertificateHtml(params: {
  summary: StudentFullReportSummary;
  pdfSettings: PdfReportSettings;
  platformTitle?: string;
  homeLogoUrl?: string;
}): string {
  const { summary, pdfSettings } = params;
  const cert = pdfSettings.certificate;
  const isLandscape = cert.orientation !== 'portrait';
  const pageW = isLandscape ? '297mm' : '210mm';
  const pageH = isLandscape ? '210mm' : '297mm';

  const bgSrc = resolvePdfImageSrc(cert.backgroundUrl);
  const frameSrc = resolvePdfImageSrc(cert.frameUrl);
  const footerSrc = resolvePdfImageSrc(cert.footerImageUrl);
  const logoSrc = resolvePdfImageSrc(pdfSettings.logoUrl || params.homeLogoUrl);

  const subjectText = interpolateCertificatePlaceholders(cert.subjectText, summary);
  const bodyText = interpolateCertificatePlaceholders(cert.bodyText, summary);

  const sigsHtml = (cert.signatures || [])
    .map((sig) => {
      const sSrc = resolvePdfImageSrc(sig.url);
      return `<div class="sig-item">
        ${sSrc ? `<img src="${escapePdfHtml(sSrc)}" style="width:${sig.width}px;max-height:70px;object-fit:contain;" alt="${escapePdfHtml(sig.title)}" />` : '<div class="sig-line"></div>'}
        <div class="sig-title">${escapePdfHtml(sig.title)}</div>
      </div>`;
    })
    .join('');

  const stampsHtml = (cert.stamps || [])
    .map((stp) => {
      const stSrc = resolvePdfImageSrc(stp.url);
      if (!stSrc) return '';
      return `<div class="stamp-item">
        <img src="${escapePdfHtml(stSrc)}" style="width:${stp.width}px;max-height:95px;object-fit:contain;" alt="${escapePdfHtml(stp.title)}" />
        ${stp.title ? `<div class="sig-title">${escapePdfHtml(stp.title)}</div>` : ''}
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapePdfHtml(subjectText)} - ${escapePdfHtml(summary.studentName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .sheet {
      position: relative;
      width: ${pageW};
      height: ${pageH};
      overflow: hidden;
      background: #fffdf8;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: ${cert.marginTop}px ${cert.marginSide}px ${cert.marginBottom}px;
      ${!frameSrc ? 'border: 14px double #b45309; outline: 3px solid #065f46; outline-offset: -22px;' : ''}
    }
    .layer-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }
    .layer-frame {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: fill;
      z-index: 1;
      pointer-events: none;
    }
    .content {
      position: relative;
      z-index: 2;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 14px;
    }
    .top-brand {
      text-align: center;
      min-height: 44px;
    }
    .top-brand img {
      max-height: 62px;
      max-width: 160px;
      object-fit: contain;
    }
    .subject {
      font-family: '${cert.subjectFontFamily}', serif;
      font-size: ${cert.subjectFontSize}px;
      text-align: ${cert.subjectAlign};
      color: ${escapePdfHtml(cert.subjectColor)};
      font-weight: 700;
      margin: 4px 0;
      line-height: 1.35;
    }
    .body-text {
      font-family: '${cert.bodyFontFamily}', sans-serif;
      font-size: ${cert.bodyFontSize}px;
      text-align: ${cert.bodyAlign};
      color: ${escapePdfHtml(cert.bodyColor)};
      white-space: pre-line;
      line-height: 1.85;
      font-weight: 600;
      margin: auto 0;
    }
    .bottom-row {
      display: flex;
      align-items: flex-end;
      justify-content: space-around;
      gap: 24px;
      margin-top: 12px;
    }
    .sig-item, .stamp-item {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }
    .sig-line {
      width: 130px;
      height: 26px;
      border-bottom: 1.5px dashed #64748b;
    }
    .sig-title {
      font-family: 'Cairo', sans-serif;
      font-size: 12px;
      font-weight: 800;
      color: #334155;
    }
    .footer-img-wrap {
      position: relative;
      z-index: 2;
      text-align: center;
      margin-top: 8px;
    }
    .footer-img-wrap img {
      max-width: 100%;
      height: ${cert.footerImageHeight}px;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${bgSrc ? `<img src="${escapePdfHtml(bgSrc)}" class="layer-bg" alt="" />` : ''}
    ${frameSrc ? `<img src="${escapePdfHtml(frameSrc)}" class="layer-frame" alt="" />` : ''}
    <div class="content">
      <div class="top-brand">
        ${logoSrc ? `<img src="${escapePdfHtml(logoSrc)}" alt="الشعار" />` : ''}
      </div>
      <h1 class="subject">${escapePdfHtml(subjectText)}</h1>
      <div class="body-text">${escapePdfHtml(bodyText)}</div>
      ${
        sigsHtml || stampsHtml
          ? `<div class="bottom-row">${sigsHtml}${stampsHtml}</div>`
          : ''
      }
    </div>
    ${footerSrc ? `<div class="footer-img-wrap"><img src="${escapePdfHtml(footerSrc)}" alt="" /></div>` : ''}
  </div>
</body>
</html>`;
}

export async function printHtmlViaIframe(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      setTimeout(() => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch {}
        resolve();
      }, 600);
    };

    const triggerPrint = async () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.fonts?.ready) {
          await Promise.race([
            doc.fonts.ready,
            new Promise((r) => setTimeout(r, 1100)),
          ]);
        }
        const imgs = Array.from(doc?.images || []);
        if (imgs.length > 0) {
          await Promise.race([
            Promise.all(
              imgs.map((img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise<void>((r) => {
                      img.addEventListener('load', () => r(), { once: true });
                      img.addEventListener('error', () => r(), { once: true });
                    })
              )
            ),
            new Promise((r) => setTimeout(r, 1500)),
          ]);
        }
        const win = iframe.contentWindow;
        if (win) {
          win.addEventListener('afterprint', cleanup, { once: true });
          win.focus();
          win.print();
          setTimeout(cleanup, 2500);
        } else {
          cleanup();
        }
      } catch {
        cleanup();
      }
    };

    iframe.onload = () => {
      void triggerPrint();
    };
    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

