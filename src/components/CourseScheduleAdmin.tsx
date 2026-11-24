import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  Eye,
  FolderPlus,
  Layers,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  X,
  Eraser,
  BookOpen,
  Sparkles,
  UserCheck,
  Search,
  Download,
  MapPin,
  Clock,
  Undo2,
  Edit3,
  Star,
  Shuffle,
  Bell,
  Globe,
  Play,
  Loader2,
  Video,
  Building2,
  Archive,
} from 'lucide-react';
import {
  WordItem,
  MatchingLessonSubject,
  DictationLessonSubject,
  CatchLessonSubject,
} from '../types';
import { DrawingTemplate } from '../arWriting/types/drawing';
import { VideoLesson } from '../video/videoSheets';
import {
  AttendanceRecord,
  AttendanceSessionMode,
  AttendanceStatus,
  CourseProgram,
  CourseScheduleData,
  CourseGroup,
  CourseScheduleDay,
  DEFAULT_PROGRAM_ID,
  PROGRAM_COLOR_META,
  ProgramColorKey,
  ScheduleDayType,
  ScheduleExerciseType,
  ScheduleLessonRef,
  SCHEDULE_DAY_TYPE_META,
  SCHEDULE_EXERCISE_META,
  buildScheduleLessonKey,
  deleteAttendanceRecordFromSheets,
  extractAllExerciseTopics,
  fetchAttendanceRecordsFromSheets,
  fetchCourseScheduleFromSheets,
  formatScheduleDateLabel,
  generateCalendarDays,
  getAttendanceStatusMeta,
  getLocalAttendanceRecords,
  getLocalDeviceTimezone,
  getTodayLocalISO,
  normalizeCourseScheduleData,
  normalizeDateISO,
  normalizeHHmm,
  runAttendanceSchedulerNow,
  saveCourseScheduleToSheets,
} from '../utils/courseSchedule';

interface CourseScheduleAdminProps {
  schedule: CourseScheduleData;
  onUpdateSchedule: (next: CourseScheduleData) => void;
  webhookUrl: string;
  curriculum: WordItem[];
  subjects: string[];
  matchingSubjects: MatchingLessonSubject[];
  dictationSubjects: DictationLessonSubject[];
  writingTemplates: DrawingTemplate[];
  catchSubjects: CatchLessonSubject[];
  videoLessons: VideoLesson[];
  onOpenStudentPreview: (programId?: string) => void;
}

const WEEKDAY_BUTTONS: { day: number; label: string }[] = [
  { day: 6, label: 'السبت' },
  { day: 0, label: 'الأحد' },
  { day: 1, label: 'الإثنين' },
  { day: 2, label: 'الثلاثاء' },
  { day: 3, label: 'الأربعاء' },
  { day: 4, label: 'الخميس' },
  { day: 5, label: 'الجمعة' },
];

const EXERCISE_TYPES_ORDER: ScheduleExerciseType[] = [
  'pronunciation',
  'matching',
  'dictation',
  'writing',
  'catch',
  'video',
];

const PROGRAM_COLORS_LIST: ProgramColorKey[] = [
  'emerald',
  'indigo',
  'amber',
  'rose',
  'sky',
  'purple',
];

export const CourseScheduleAdmin: React.FC<CourseScheduleAdminProps> = ({
  schedule,
  onUpdateSchedule,
  webhookUrl,
  curriculum,
  subjects,
  matchingSubjects,
  dictationSubjects,
  writingTemplates,
  catchSubjects,
  videoLessons,
  onOpenStudentPreview,
}) => {
  const normalizedSchedule = useMemo(
    () => normalizeCourseScheduleData(schedule),
    [schedule]
  );
  const programs = normalizedSchedule.programs || [];
  const defaultProgram =
    programs.find((p) => p.isDefault) || programs[0];
  const defaultProgramId = defaultProgram?.id || DEFAULT_PROGRAM_ID;

  const [activeProgramId, setActiveProgramId] = useState<string>(defaultProgramId);
  const activeProgram: CourseProgram = useMemo(
    () =>
      programs.find((p) => p.id === activeProgramId) ||
      defaultProgram,
    [programs, activeProgramId, defaultProgram]
  );

  // Program creation / editing UI state
  const [showNewProgramForm, setShowNewProgramForm] = useState(false);
  const [newProgName, setNewProgName] = useState('');
  const [newProgDesc, setNewProgDesc] = useState('');
  const [newProgColor, setNewProgColor] = useState<ProgramColorKey>('indigo');
  const [cloneFromProgramId, setCloneFromProgramId] = useState<string>('');
  const [confirmDeleteProgramId, setConfirmDeleteProgramId] = useState<string | null>(null);
  const [editingProgramMeta, setEditingProgramMeta] = useState(false);

  const [subTab, setSubTab] = useState<'groups' | 'days' | 'attendance'>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  // Calendar generator defaults & undo state (actual generator inputs persist per program in activeProgram.settings)
  const todayISO = getTodayLocalISO();
  const defaultTwoWeeksEndISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  }, []);

  const genStartDate = activeProgram.settings.programStartDate || todayISO;
  const genEndDate = activeProgram.settings.programEndDate || defaultTwoWeeksEndISO;
  const archiveDate = activeProgram.settings.archiveDate || '';
  const genWeekdays = activeProgram.settings.genWeekdays ?? [0, 1, 2, 3, 4];
  const genDayType: ScheduleDayType = activeProgram.settings.genDayType || 'lesson';
  const genGroupsPerDay = activeProgram.settings.genGroupsPerDay ?? '';
  const genMode: 'replace' | 'append' = activeProgram.settings.genMode || 'replace';
  const genAttendanceMode: AttendanceSessionMode =
    activeProgram.settings.defaultAttendanceMode || 'live';
  const genLiveUrl = activeProgram.settings.defaultLiveUrl || '';
  const genClassroomLocation = activeProgram.settings.defaultClassroomLocation || '';

  const [singleDayDate, setSingleDayDate] = useState<string>(todayISO);
  const [daysUndoSnapshot, setDaysUndoSnapshot] = useState<CourseScheduleDay[] | null>(null);
  const [confirmDeleteAllDays, setConfirmDeleteAllDays] = useState(false);

  // Cloud sync status
  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warn' | 'error';
    message: string;
  } | null>(null);

  // Attendance log states (سجل_الحضور)
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() =>
    getLocalAttendanceRecords()
  );
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [attendanceScriptSupported, setAttendanceScriptSupported] = useState(true);
  const [attDateFilter, setAttDateFilter] = useState<string>('');
  const [attStatusFilter, setAttStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [attSearch, setAttSearch] = useState<string>('');
  const [confirmDeleteAttKey, setConfirmDeleteAttKey] = useState<string | null>(null);
  const [isRunningScheduler, setIsRunningScheduler] = useState(false);

  const loadAttendanceLog = async () => {
    setIsLoadingAttendance(true);
    try {
      const res = await fetchAttendanceRecordsFromSheets(webhookUrl);
      setAttendanceRecords(res.records);
      setAttendanceScriptSupported(res.scriptSupported);
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  useEffect(() => {
    if (subTab === 'attendance') {
      loadAttendanceLog();
    }
  }, [subTab, webhookUrl]);

  const handleRunSchedulerNow = async () => {
    setIsRunningScheduler(true);
    setStatusBanner(null);
    try {
      const tz = activeProgram.settings.timezone || getLocalDeviceTimezone();
      const res = await runAttendanceSchedulerNow(webhookUrl, tz);
      setStatusBanner({
        type: res.success ? 'success' : 'warn',
        message: res.message,
      });
      if (res.success) {
        await loadAttendanceLog();
      }
    } finally {
      setIsRunningScheduler(false);
    }
  };

  const filteredAttendance = useMemo(() => {
    const q = attSearch.trim().toLowerCase();
    return attendanceRecords.filter((rec) => {
      if (attDateFilter && rec.date !== attDateFilter) return false;
      const recStatus: AttendanceStatus = rec.status || 'on_time';
      if (attStatusFilter !== 'all' && recStatus !== attStatusFilter) return false;
      if (!q) return true;
      return (
        rec.studentId.toLowerCase().includes(q) ||
        rec.studentName.toLowerCase().includes(q) ||
        rec.sessionTitle.toLowerCase().includes(q) ||
        (rec.location || '').toLowerCase().includes(q)
      );
    });
  }, [attendanceRecords, attDateFilter, attStatusFilter, attSearch]);

  const attendanceStats = useMemo(() => {
    const todayRows = attendanceRecords.filter((r) => r.date === todayISO);
    const todayPresentCount = todayRows.filter((r) => r.status !== 'absent').length;
    const todayLateCount = todayRows.filter((r) => r.status === 'late').length;
    const todayAbsentCount = todayRows.filter((r) => r.status === 'absent').length;
    const uniqueStudents = new Set(attendanceRecords.map((r) => r.studentId)).size;
    return {
      todayCount: todayPresentCount,
      todayLateCount,
      todayAbsentCount,
      totalCount: attendanceRecords.length,
      uniqueStudents,
    };
  }, [attendanceRecords, todayISO]);

  const handleDeleteAttendanceRow = async (date: string, studentId: string) => {
    const res = await deleteAttendanceRecordFromSheets(webhookUrl, date, studentId);
    setAttendanceRecords(getLocalAttendanceRecords());
    setConfirmDeleteAttKey(null);
    if (res.needsScriptUpdate) {
      setAttendanceScriptSupported(false);
    }
    setStatusBanner({
      type: res.cloudDeleted ? 'success' : res.needsScriptUpdate ? 'warn' : 'error',
      message: res.message || 'تمت العملية.',
    });
  };

  const handleExportAttendanceCsv = () => {
    if (filteredAttendance.length === 0) return;
    const headers = [
      'التاريخ',
      'وقت الدخول',
      'موعد الحصة',
      'الحالة',
      'ID المشترك',
      'اسم المشترك',
      'الحصة / المجموعات',
      'نوع اليوم',
      'الموقع',
    ];
    const esc = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const rows = filteredAttendance.map((r) => {
      const sMeta = getAttendanceStatusMeta(r.status, r.minutesDelta);
      return [
        esc(r.date),
        esc(r.time),
        esc(r.scheduledTime || '—'),
        esc(sMeta.labelAr),
        esc(r.studentId),
        esc(r.studentName),
        esc(r.sessionTitle),
        esc(
          r.dayType === 'review'
            ? 'مراجعة'
            : r.dayType === 'exam'
            ? 'امتحان'
            : r.dayType === 'attendance'
            ? 'حصة حضور'
            : 'درس عادي'
        ),
        esc(r.location || 'غير متاح'),
      ];
    });
    const csv = '\uFEFF' + [headers.map(esc).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${attDateFilter || todayISO}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const catalog = useMemo(
    () =>
      extractAllExerciseTopics({
        curriculum,
        subjects,
        matchingSubjects,
        dictationSubjects,
        writingTemplates,
        catchSubjects,
        videoLessons,
      }),
    [
      curriculum,
      subjects,
      matchingSubjects,
      dictationSubjects,
      writingTemplates,
      catchSubjects,
      videoLessons,
    ]
  );

  // Scoped groups & days for the currently selected program
  const activeProgramGroups = useMemo(
    () =>
      normalizedSchedule.groups.filter(
        (g) => (g.programId || defaultProgramId) === activeProgram.id
      ),
    [normalizedSchedule.groups, defaultProgramId, activeProgram.id]
  );

  const activeProgramDays = useMemo(
    () =>
      normalizedSchedule.days
        .filter((d) => (d.programId || defaultProgramId) === activeProgram.id)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [normalizedSchedule.days, defaultProgramId, activeProgram.id]
  );

  // Sync selectedGroupId when switching programs
  useEffect(() => {
    if (
      activeProgramGroups.length > 0 &&
      !activeProgramGroups.some((g) => g.id === selectedGroupId)
    ) {
      setSelectedGroupId(activeProgramGroups[0].id);
    } else if (activeProgramGroups.length === 0 && selectedGroupId) {
      setSelectedGroupId('');
    }
  }, [activeProgram.id, activeProgramGroups, selectedGroupId]);

  const activeGroup = useMemo(
    () =>
      activeProgramGroups.find((g) => g.id === selectedGroupId) ||
      activeProgramGroups[0] ||
      null,
    [activeProgramGroups, selectedGroupId]
  );

  // Per-program duplicate check: same topic cannot repeat across groups in the SAME program,
  // but CAN be used in different programs (e.g., Beginner vs Advanced).
  const topicAssignmentMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const grp of activeProgramGroups) {
      for (const l of grp.lessons) {
        const list = map.get(l.key) || [];
        if (!list.includes(grp.name)) {
          list.push(grp.name);
        }
        map.set(l.key, list);
      }
    }
    return map;
  }, [activeProgramGroups]);

  // Count how many days each group is assigned to within the active program
  const groupDayUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of activeProgramDays) {
      const ids = d.groupIds?.length ? d.groupIds : d.groupId ? [d.groupId] : [];
      for (const gid of ids) {
        counts.set(gid, (counts.get(gid) || 0) + 1);
      }
    }
    return counts;
  }, [activeProgramDays]);

  // Helper to commit updated schedule preserving normalized structure
  const commitScheduleUpdate = (next: CourseScheduleData) => {
    onUpdateSchedule(normalizeCourseScheduleData(next));
  };

  // Program Management Handlers
  const handleUpdateActiveProgram = (
    patch: Partial<CourseProgram> & { settingsPatch?: Partial<CourseProgram['settings']> }
  ) => {
    const nextPrograms = programs.map((p) => {
      if (p.id !== activeProgram.id) return p;
      const nextSettings = patch.settingsPatch
        ? { ...p.settings, ...patch.settingsPatch }
        : patch.settings || p.settings;
      return {
        ...p,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.welcomeTitle !== undefined ? { welcomeTitle: patch.welcomeTitle } : {}),
        ...(patch.welcomeMessage !== undefined ? { welcomeMessage: patch.welcomeMessage } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        settings: nextSettings,
      };
    });
    const updatedDefault =
      nextPrograms.find((p) => p.isDefault) || nextPrograms[0];
    commitScheduleUpdate({
      ...normalizedSchedule,
      programs: nextPrograms,
      settings: updatedDefault?.settings || normalizedSchedule.settings,
    });
  };

  const handleSetDefaultProgram = (progId: string) => {
    const nextPrograms = programs.map((p) => ({
      ...p,
      isDefault: p.id === progId,
    }));
    const nextDef = nextPrograms.find((p) => p.isDefault) || nextPrograms[0];
    commitScheduleUpdate({
      ...normalizedSchedule,
      programs: nextPrograms,
      settings: nextDef?.settings || normalizedSchedule.settings,
    });
    setStatusBanner({
      type: 'success',
      message: `تم تعيين «${nextDef?.name}» كبرنامج افتراضي للمنصة.`,
    });
  };

  const handleCreateProgram = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newProgName.trim() || `برنامج تدريبي ${programs.length + 1}`;
    const newId = `prog_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newProg: CourseProgram = {
      id: newId,
      name: cleanName,
      description: newProgDesc.trim(),
      color: newProgColor,
      isDefault: false,
      settings: {
        lockFutureDays: true,
        courseTitle: cleanName,
      },
      createdAt: todayISO,
    };

    let clonedGroups: CourseGroup[] = [];
    if (cloneFromProgramId) {
      const srcGroups = normalizedSchedule.groups.filter(
        (g) => (g.programId || defaultProgramId) === cloneFromProgramId
      );
      clonedGroups = srcGroups.map((g, idx) => ({
        ...g,
        id: `grp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        programId: newId,
        lessons: g.lessons.map((l) => ({ ...l })),
        createdAt: todayISO,
      }));
    }

    commitScheduleUpdate({
      ...normalizedSchedule,
      programs: [...programs, newProg],
      groups: [...normalizedSchedule.groups, ...clonedGroups],
    });
    setActiveProgramId(newId);
    setSelectedGroupId(clonedGroups[0]?.id || '');
    setNewProgName('');
    setNewProgDesc('');
    setCloneFromProgramId('');
    setShowNewProgramForm(false);
    setStatusBanner({
      type: 'success',
      message: clonedGroups.length > 0
        ? `تم إنشاء برنامج «${cleanName}» مع نسخ ${clonedGroups.length} مجموعة بنجاح.`
        : `تم إنشاء برنامج «${cleanName}» بنجاح. يمكنك الآن إضافة مجموعاته وتوليد جدوله.`,
    });
  };

  const handleDeleteProgram = (progId: string) => {
    if (programs.length <= 1) return;
    const target = programs.find((p) => p.id === progId);
    let nextPrograms = programs.filter((p) => p.id !== progId);
    if (!nextPrograms.some((p) => p.isDefault) && nextPrograms[0]) {
      nextPrograms = nextPrograms.map((p, idx) => ({ ...p, isDefault: idx === 0 }));
    }
    const nextGroups = normalizedSchedule.groups.filter(
      (g) => (g.programId || defaultProgramId) !== progId
    );
    const nextDays = normalizedSchedule.days.filter(
      (d) => (d.programId || defaultProgramId) !== progId
    );
    const nextDefault = nextPrograms.find((p) => p.isDefault) || nextPrograms[0];

    commitScheduleUpdate({
      ...normalizedSchedule,
      programs: nextPrograms,
      groups: nextGroups,
      days: nextDays,
      settings: nextDefault.settings,
    });
    setConfirmDeleteProgramId(null);
    setActiveProgramId(nextDefault.id);
    setStatusBanner({
      type: 'warn',
      message: `تم حذف برنامج «${target?.name || ''}» ومجموعاته وأيامه. اضغط «حفظ ومزامنة إلى الشيت» لتثبيت التغيير.`,
    });
  };

  // Create a new group inside the active program
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName =
      newGroupName.trim() || `مجموعة ${activeProgramGroups.length + 1}`;
    const newGrp: CourseGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      description: newGroupDesc.trim(),
      lessons: [],
      createdAt: new Date().toISOString().slice(0, 10),
      programId: activeProgram.id,
    };
    const nextGroups = [...normalizedSchedule.groups, newGrp];
    commitScheduleUpdate({ ...normalizedSchedule, groups: nextGroups });
    setSelectedGroupId(newGrp.id);
    setNewGroupName('');
    setNewGroupDesc('');
  };

  const handleUpdateGroupField = (
    groupId: string,
    patch: Partial<CourseGroup>
  ) => {
    commitScheduleUpdate({
      ...normalizedSchedule,
      groups: normalizedSchedule.groups.map((g) =>
        g.id === groupId ? { ...g, ...patch } : g
      ),
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const nextGroups = normalizedSchedule.groups.filter((g) => g.id !== groupId);
    const nextDays = normalizedSchedule.days.map((d) => {
      const filtered = (d.groupIds || (d.groupId ? [d.groupId] : [])).filter(
        (id) => id !== groupId
      );
      return {
        ...d,
        groupIds: filtered,
        groupId: filtered[0] || '',
      };
    });
    commitScheduleUpdate({ ...normalizedSchedule, groups: nextGroups, days: nextDays });
    setConfirmDeleteGroupId(null);
    if (selectedGroupId === groupId) {
      const remainingInProg = nextGroups.filter(
        (g) => (g.programId || defaultProgramId) === activeProgram.id
      );
      setSelectedGroupId(remainingInProg[0]?.id || '');
    }
  };

  const handleToggleLessonInGroup = (
    groupId: string,
    ref: ScheduleLessonRef
  ) => {
    const grp = activeProgramGroups.find((g) => g.id === groupId);
    if (!grp) return;
    const exists = grp.lessons.some((l) => l.key === ref.key);
    if (!exists) {
      const otherOwner = activeProgramGroups.find(
        (g) => g.id !== groupId && g.lessons.some((l) => l.key === ref.key)
      );
      if (otherOwner) {
        setStatusBanner({
          type: 'warn',
          message: `الموضوع "${ref.topicName}" مختار مسبقاً في «${otherOwner.name}» ضمن برنامج «${activeProgram.name}».`,
        });
        return;
      }
    }
    const nextLessons = exists
      ? grp.lessons.filter((l) => l.key !== ref.key)
      : [...grp.lessons, ref];
    handleUpdateGroupField(groupId, { lessons: nextLessons });
  };

  const handleRemoveLessonFromGroup = (groupId: string, lessonKey: string) => {
    const grp = activeProgramGroups.find((g) => g.id === groupId);
    if (!grp) return;
    handleUpdateGroupField(groupId, {
      lessons: grp.lessons.filter((l) => l.key !== lessonKey),
    });
  };

  // Calendar Generator (persists per activeProgram.settings)
  const handleToggleWeekday = (dayIdx: number) => {
    const next = genWeekdays.includes(dayIdx)
      ? genWeekdays.filter((d) => d !== dayIdx)
      : [...genWeekdays, dayIdx];
    handleUpdateActiveProgram({ settingsPatch: { genWeekdays: next } });
  };

  const handleGenerateDays = () => {
    if (!genStartDate || !genEndDate || genStartDate > genEndDate) {
      setStatusBanner({
        type: 'error',
        message: 'يرجى تحديد تاريخ بداية ونهاية صحيحين.',
      });
      return;
    }
    if (genWeekdays.length === 0) {
      setStatusBanner({
        type: 'error',
        message: 'يرجى اختيار يوم واحد على الأقل من أيام الأسبوع.',
      });
      return;
    }

    const perDay =
      genGroupsPerDay.trim() === ''
        ? 0
        : Math.max(0, Math.min(99, Math.floor(Number(genGroupsPerDay) || 0)));
    const otherProgramsDays = normalizedSchedule.days.filter(
      (d) => (d.programId || defaultProgramId) !== activeProgram.id
    );

    // Save undo snapshot of all days before mutating
    setDaysUndoSnapshot(normalizedSchedule.days);

    const updatedPrograms = programs.map((p) =>
      p.id === activeProgram.id
        ? {
            ...p,
            settings: {
              ...p.settings,
              programStartDate: genStartDate,
              programEndDate: genEndDate,
            },
          }
        : p
    );

    const genOptions = {
      programId: activeProgram.id,
      attendanceMode: genDayType === 'attendance' ? genAttendanceMode : undefined,
      liveUrl: genDayType === 'attendance' ? genLiveUrl : undefined,
      classroomLocation: genDayType === 'attendance' ? genClassroomLocation : undefined,
    };

    if (genMode === 'replace') {
      const generated = generateCalendarDays(
        genStartDate,
        genEndDate,
        genWeekdays,
        genDayType,
        activeProgramGroups,
        perDay,
        genOptions
      );
      const nextDays = [...otherProgramsDays, ...generated].sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      commitScheduleUpdate({ ...normalizedSchedule, programs: updatedPrograms, days: nextDays });
      const withGroupsCount = generated.filter((d) => d.groupIds.length > 0).length;
      setStatusBanner({
        type: 'success',
        message:
          perDay === 0
            ? `تم استبدال وتوليد ${generated.length} يوماً لبرنامج «${activeProgram.name}» بدون توزيع تلقائي للمجموعات (يمكنك إضافتها يدوياً).`
            : `تم استبدال وتوليد ${generated.length} يوماً لبرنامج «${activeProgram.name}» وفق الأيام المختارة (توزيع ${withGroupsCount} يوماً بالمجموعات).`,
      });
    } else {
      // Append mode: only new dates, distributing unassigned groups so nothing duplicates!
      const usedGroupIds = new Set<string>();
      for (const d of activeProgramDays) {
        const ids = d.groupIds?.length ? d.groupIds : d.groupId ? [d.groupId] : [];
        ids.forEach((id) => usedGroupIds.add(id));
      }
      const unassignedGroups = activeProgramGroups.filter(
        (g) => !usedGroupIds.has(g.id)
      );

      const generated = generateCalendarDays(
        genStartDate,
        genEndDate,
        genWeekdays,
        genDayType,
        unassignedGroups,
        perDay,
        genOptions
      );
      const existingDates = new Set(activeProgramDays.map((d) => d.date));
      const additions = generated.filter((d) => !existingDates.has(d.date));
      const nextDays = [
        ...otherProgramsDays,
        ...activeProgramDays,
        ...additions,
      ].sort((a, b) => a.date.localeCompare(b.date));
      commitScheduleUpdate({ ...normalizedSchedule, programs: updatedPrograms, days: nextDays });
      const withGroupsCount = additions.filter((d) => d.groupIds.length > 0).length;
      setStatusBanner({
        type: 'success',
        message:
          perDay === 0
            ? `تمت إضافة ${additions.length} يوماً جديداً لبرنامج «${activeProgram.name}» (بدون توزيع تلقائي).`
            : `تمت إضافة ${additions.length} يوماً جديداً لبرنامج «${activeProgram.name}» (استكمال توزيع ${withGroupsCount} يوماً من المجموعات المتبقية).`,
      });
    }
  };

  const handleRedistributeGroupsOnCurrentDays = () => {
    if (activeProgramDays.length === 0) {
      setStatusBanner({
        type: 'warn',
        message: 'لا توجد أيام حالية في هذا البرنامج لإعادة توزيع المجموعات عليها.',
      });
      return;
    }
    const perDay =
      genGroupsPerDay.trim() === '' || Number(genGroupsPerDay) <= 0
        ? 1
        : Math.max(1, Math.min(99, Math.floor(Number(genGroupsPerDay) || 1)));
    setDaysUndoSnapshot(normalizedSchedule.days);

    let cursor = 0;
    const sortedProgramDays = [...activeProgramDays].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const updatedProgramDaysMap = new Map<string, CourseScheduleDay>();
    for (const day of sortedProgramDays) {
      const assignedIds =
        cursor < activeProgramGroups.length
          ? activeProgramGroups.slice(cursor, cursor + perDay).map((g) => g.id)
          : [];
      cursor += perDay;
      updatedProgramDaysMap.set(day.id, {
        ...day,
        groupIds: assignedIds,
        groupId: assignedIds[0] || '',
      });
    }

    const nextDays = normalizedSchedule.days.map(
      (d) => updatedProgramDaysMap.get(d.id) || d
    );
    commitScheduleUpdate({ ...normalizedSchedule, days: nextDays });
    setStatusBanner({
      type: 'success',
      message: `تمت إعادة توزيع ${activeProgramGroups.length} مجموعة بانتظام على ${sortedProgramDays.length} يوماً بمعدل ${perDay} مجموعة/يوم.`,
    });
  };

  const handleUndoDaysChange = () => {
    if (!daysUndoSnapshot) return;
    commitScheduleUpdate({ ...normalizedSchedule, days: daysUndoSnapshot });
    setDaysUndoSnapshot(null);
    setStatusBanner({
      type: 'success',
      message: 'تم التراجع واستعادة الأيام السابقة بنجاح.',
    });
  };

  const handleAddSingleDay = () => {
    if (!singleDayDate) return;
    if (activeProgramDays.some((d) => d.date === singleDayDate)) {
      setStatusBanner({
        type: 'warn',
        message: `التاريخ ${singleDayDate} موجود مسبقاً في برنامج «${activeProgram.name}».`,
      });
      return;
    }
    const nextDay: CourseScheduleDay = {
      id: `day_${singleDayDate}_${Date.now()}`,
      date: singleDayDate,
      dayType: 'lesson',
      groupIds: [],
      groupId: '',
      customTitle: '',
      notes: '',
      programId: activeProgram.id,
    };
    const merged = [...normalizedSchedule.days, nextDay].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    commitScheduleUpdate({ ...normalizedSchedule, days: merged });
    setStatusBanner(null);
  };

  const handleChangeDayDate = (dayId: string, rawNextDate: string) => {
    const cleanISO = normalizeDateISO(rawNextDate);
    if (!cleanISO) return;
    const duplicate = activeProgramDays.find(
      (d) => d.id !== dayId && d.date === cleanISO
    );
    if (duplicate) {
      setStatusBanner({
        type: 'warn',
        message: `التاريخ ${cleanISO} مستخدم بالفعل في يوم آخر ضمن برنامج «${activeProgram.name}».`,
      });
      return;
    }
    const nextDays = normalizedSchedule.days
      .map((d) => (d.id === dayId ? { ...d, date: cleanISO } : d))
      .sort((a, b) => a.date.localeCompare(b.date));
    commitScheduleUpdate({ ...normalizedSchedule, days: nextDays });
    setStatusBanner(null);
  };

  const handleUpdateDay = (
    dayId: string,
    patch: Partial<CourseScheduleDay>
  ) => {
    commitScheduleUpdate({
      ...normalizedSchedule,
      days: normalizedSchedule.days.map((d) =>
        d.id === dayId ? { ...d, ...patch } : d
      ),
    });
  };

  const handleAddGroupToDay = (dayId: string, groupId: string) => {
    if (!groupId) return;
    const day = activeProgramDays.find((d) => d.id === dayId);
    if (!day) return;
    const current = day.groupIds?.length ? day.groupIds : day.groupId ? [day.groupId] : [];
    if (current.includes(groupId)) return;
    const nextIds = [...current, groupId];
    handleUpdateDay(dayId, { groupIds: nextIds, groupId: nextIds[0] || '' });
  };

  const handleRemoveGroupFromDay = (dayId: string, groupId: string) => {
    const day = activeProgramDays.find((d) => d.id === dayId);
    if (!day) return;
    const current = day.groupIds?.length ? day.groupIds : day.groupId ? [day.groupId] : [];
    const nextIds = current.filter((id) => id !== groupId);
    handleUpdateDay(dayId, { groupIds: nextIds, groupId: nextIds[0] || '' });
  };

  const handleClearDay = (dayId: string) => {
    handleUpdateDay(dayId, {
      groupIds: [],
      groupId: '',
      customTitle: '',
      notes: '',
    });
  };

  const handleDeleteDay = (dayId: string) => {
    commitScheduleUpdate({
      ...normalizedSchedule,
      days: normalizedSchedule.days.filter((d) => d.id !== dayId),
    });
  };

  const handleDeleteAllDays = () => {
    if (activeProgramDays.length === 0) return;
    setDaysUndoSnapshot(normalizedSchedule.days);
    const remainingOtherProgramDays = normalizedSchedule.days.filter(
      (d) => (d.programId || defaultProgramId) !== activeProgram.id
    );
    commitScheduleUpdate({
      ...normalizedSchedule,
      days: remainingOtherProgramDays,
    });
    setConfirmDeleteAllDays(false);
    setStatusBanner({
      type: 'warn',
      message: `تم حذف جميع أيام برنامج «${activeProgram.name}» (${activeProgramDays.length} يوم). يمكنك التراجع الآن أو الضغط على «حفظ ومزامنة إلى الشيت».`,
    });
  };

  const handleSaveToCloud = async () => {
    setIsSaving(true);
    setStatusBanner(null);
    try {
      const res = await saveCourseScheduleToSheets(webhookUrl, normalizedSchedule);
      if (res.cloudSaved) {
        setStatusBanner({
          type: 'success',
          message:
            res.message ||
            'تم حفظ البرامج والمجموعات والجدول اليومي في Google Sheets بنجاح!',
        });
      } else if (res.needsScriptUpdate) {
        setStatusBanner({
          type: 'warn',
          message:
            res.message ||
            'تم الحفظ محلياً، يرجى تحديث كود Google Apps Script وإعادة نشره.',
        });
      } else {
        setStatusBanner({
          type: res.success ? 'warn' : 'error',
          message: res.message || 'تعذر الحفظ في الشيت.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handlePullFromCloud = async () => {
    if (!webhookUrl) {
      setStatusBanner({
        type: 'error',
        message: 'يرجى ضبط رابط Google Sheets Webhook أولاً.',
      });
      return;
    }
    setIsPulling(true);
    setStatusBanner(null);
    try {
      const fetched = await fetchCourseScheduleFromSheets(webhookUrl);
      if (fetched) {
        onUpdateSchedule(fetched);
        const fetchedPrograms = fetched.programs || [];
        if (
          fetchedPrograms.length > 0 &&
          !fetchedPrograms.some((p) => p.id === activeProgramId)
        ) {
          setActiveProgramId(fetchedPrograms[0].id);
        }
        setStatusBanner({
          type: 'success',
          message: `تم جلب ${fetchedPrograms.length} برنامج، ${fetched.groups.length} مجموعة و ${fetched.days.length} يوماً من الشيت بنجاح!`,
        });
      } else {
        setStatusBanner({
          type: 'warn',
          message:
            'لا توجد بيانات جدول محفوظة في الشيت بعد (أو لم يُحدّث Apps Script).',
        });
      }
    } finally {
      setIsPulling(false);
    }
  };

  return (
    <div className="space-y-5 font-cairo">
      {/* Top Control & Sync Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                المجموعات والجدول اليومي للدورة
              </h2>
              <p className="text-xs text-slate-500">
                جمّع دروسك من التمارين الستة في مجموعات مسمّاة، ثم وزّعها على تقويم الدورة اليومي.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenStudentPreview(activeProgram.id)}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-indigo-600" />
              <span>معاينة جدول: {activeProgram.name}</span>
            </button>

            <button
              type="button"
              onClick={handlePullFromCloud}
              disabled={isPulling}
              className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 ${isPulling ? 'animate-spin' : ''}`}
              />
              <span>جلب من الشيت</span>
            </button>

            <button
              type="button"
              onClick={handleSaveToCloud}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSaving ? 'جاري الحفظ...' : 'حفظ ومزامنة إلى الشيت'}
              </span>
            </button>
          </div>
        </div>

        {/* Programs Switcher & Management Bar */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-800">
                البرامج التدريبية ({programs.length}):
              </span>
              <span className="text-[11px] text-slate-500 font-semibold">
                اختر برنامجاً لتعديل مجموعاته وجدوله الخاص، وخصص لكل طالب برنامجه من قسم «المشتركون».
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowNewProgramForm((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة برنامج جديد</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {programs.map((prog) => {
              const isActive = prog.id === activeProgram.id;
              const pColor = PROGRAM_COLOR_META[prog.color || 'emerald'];
              const progGroupsCount = normalizedSchedule.groups.filter(
                (g) => (g.programId || defaultProgramId) === prog.id
              ).length;
              const progDaysCount = normalizedSchedule.days.filter(
                (d) => (d.programId || defaultProgramId) === prog.id
              ).length;
              return (
                <button
                  key={prog.id}
                  type="button"
                  onClick={() => {
                    setActiveProgramId(prog.id);
                    setConfirmDeleteProgramId(null);
                    setConfirmDeleteGroupId(null);
                    setConfirmDeleteAllDays(false);
                    setDaysUndoSnapshot(null);
                  }}
                  className={`px-3.5 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                    isActive
                      ? `${pColor.activeBtn} shadow-sm`
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      isActive ? 'bg-white' : pColor.dotBg
                    }`}
                  />
                  <span>{prog.name}</span>
                  {prog.isDefault && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      افتراضي
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-mono ${
                      isActive ? 'text-white/90' : 'text-slate-400'
                    }`}
                  >
                    ({progGroupsCount}م / {progDaysCount}ي)
                  </span>
                </button>
              );
            })}
          </div>

          {/* Inline Create New Program Form */}
          {showNewProgramForm && (
            <form
              onSubmit={handleCreateProgram}
              className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-indigo-900">
                  إنشاء برنامج تدريبي جديد (مثل: مبتدئ / متوسط / متقدم)
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewProgramForm(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  value={newProgName}
                  onChange={(e) => setNewProgName(e.target.value)}
                  placeholder="اسم البرنامج (مثال: المستوى المتقدم)"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
                <input
                  type="text"
                  value={newProgDesc}
                  onChange={(e) => setNewProgDesc(e.target.value)}
                  placeholder="وصف مختصر (اختياري)"
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
                <select
                  value={cloneFromProgramId}
                  onChange={(e) => setCloneFromProgramId(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold"
                >
                  <option value="">بدء البرنامج فارغاً (بدون نسخ)</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      نسخ مجموعات من: {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600">اللون:</span>
                  {PROGRAM_COLORS_LIST.map((ck) => (
                    <button
                      key={ck}
                      type="button"
                      onClick={() => setNewProgColor(ck)}
                      className={`w-6 h-6 rounded-lg border-2 cursor-pointer transition-transform ${
                        PROGRAM_COLOR_META[ck].dotBg
                      } ${
                        newProgColor === ck
                          ? 'border-slate-900 scale-110'
                          : 'border-white opacity-70 hover:opacity-100'
                      }`}
                      title={PROGRAM_COLOR_META[ck].labelAr}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إنشاء البرنامج</span>
                </button>
              </div>
            </form>
          )}

          {/* Active Program Metadata & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingProgramMeta((v) => !v)}
                className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3 h-3" />
                <span>{editingProgramMeta ? 'إخفاء تعديل البرنامج' : 'تعديل اسم ولون البرنامج'}</span>
              </button>

              {!activeProgram.isDefault && (
                <button
                  type="button"
                  onClick={() => handleSetDefaultProgram(activeProgram.id)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Star className="w-3 h-3" />
                  <span>تعيين كافتراضي</span>
                </button>
              )}
            </div>

            {programs.length > 1 && (
              <div>
                {confirmDeleteProgramId === activeProgram.id ? (
                  <div className="flex items-center gap-1.5 bg-rose-100 px-2.5 py-1 rounded-xl border border-rose-300">
                    <span className="text-[11px] font-extrabold text-rose-900">
                      حذف «{activeProgram.name}» ومجموعاته؟
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteProgram(activeProgram.id)}
                      className="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold cursor-pointer"
                    >
                      تأكيد
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProgramId(null)}
                      className="px-2 py-0.5 rounded-lg bg-white text-slate-700 text-[10px] font-bold cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteProgramId(activeProgram.id)}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>حذف هذا البرنامج</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {editingProgramMeta && (
            <div className="p-3 rounded-2xl bg-white border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-600 block">
                  اسم البرنامج
                </label>
                <input
                  type="text"
                  value={activeProgram.name}
                  onChange={(e) =>
                    handleUpdateActiveProgram({ name: e.target.value })
                  }
                  placeholder="اسم البرنامج"
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-extrabold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 block">
                  ملاحظة داخلية للإدارة (لا تظهر للطالب)
                </label>
                <input
                  type="text"
                  value={activeProgram.description || ''}
                  onChange={(e) =>
                    handleUpdateActiveProgram({ description: e.target.value })
                  }
                  placeholder="ملاحظة إدارية داخلية (اختياري)"
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 pb-1">
                <span className="text-[11px] font-bold text-slate-600">اللون:</span>
                {PROGRAM_COLORS_LIST.map((ck) => (
                  <button
                    key={ck}
                    type="button"
                    onClick={() => handleUpdateActiveProgram({ color: ck })}
                    className={`w-5 h-5 rounded-lg border-2 cursor-pointer ${
                      PROGRAM_COLOR_META[ck].dotBg
                    } ${
                      (activeProgram.color || 'emerald') === ck
                        ? 'border-slate-900 scale-110'
                        : 'border-white opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Active Program Settings Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">
              عنوان الجدول لبرنامج «{activeProgram.name}» (يظهر للطالب):
            </label>
            <input
              type="text"
              value={activeProgram.settings.courseTitle}
              onChange={(e) =>
                handleUpdateActiveProgram({
                  settingsPatch: { courseTitle: e.target.value },
                })
              }
              placeholder="جدول الدورة اليومي"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm font-bold text-slate-900"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl border border-amber-200 bg-amber-50/70">
            <div className="flex items-center gap-2.5">
              {activeProgram.settings.lockFutureDays ? (
                <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              ) : (
                <Unlock className="w-4 h-4 text-emerald-700 shrink-0" />
              )}
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  قفل دخول التمارين المستقبلية في هذا البرنامج
                </div>
                <div className="text-[11px] text-slate-600">
                  عند التفعيل: لا تظهر في «قائمة الدروس» لطلاب هذا البرنامج إلا الدروس التي حلّ تاريخها، وتُخفى المستقبلية وغير المدرجة.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={activeProgram.settings.lockFutureDays}
              onChange={(e) =>
                handleUpdateActiveProgram({
                  settingsPatch: { lockFutureDays: e.target.checked },
                })
              }
              className="w-5 h-5 text-amber-600 rounded cursor-pointer shrink-0"
            />
          </div>
        </div>

        {/* Program Home Page Welcome Message & Guidelines */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-extrabold text-indigo-950">
              رسالة ونبذة الترحيب الخاصة ببرنامج «{activeProgram.name}» في الصفحة الرئيسية
            </div>
            <span className="text-[10px] font-bold text-indigo-700">
              تظهر تلقائياً لطلاب هذا البرنامج أعلى الصفحة الرئيسية عند الدخول
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={activeProgram.welcomeTitle || ''}
              onChange={(e) =>
                handleUpdateActiveProgram({ welcomeTitle: e.target.value })
              }
              placeholder="عنوان ترحيبي للبرنامج (مثال: أهلاً بك في مسار المبتدئين)"
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-bold text-slate-900"
            />
            <textarea
              rows={2}
              value={activeProgram.welcomeMessage || ''}
              onChange={(e) =>
                handleUpdateActiveProgram({ welcomeMessage: e.target.value })
              }
              placeholder="تفصيل البرنامج، أهدافه، وإرشادات المتابعة الخاصة بطلاب هذا البرنامج..."
              className="md:col-span-2 px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs font-semibold text-slate-800 resize-y"
            />
          </div>
        </div>

        {/* Program Timing, Timezone & Auto Absence / Reminder Settings */}
        <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-extrabold text-emerald-950 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-700" />
              <span>توقيت الحصص والحضور الآلي والتنبيهات — «{activeProgram.name}»</span>
            </div>
            <button
              type="button"
              onClick={() =>
                handleUpdateActiveProgram({
                  settingsPatch: { timezone: getLocalDeviceTimezone() },
                })
              }
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>كشف منطقة الجهاز ({getLocalDeviceTimezone()})</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">وقت بداية الحصة:</label>
              <input
                type="time"
                dir="ltr"
                value={activeProgram.settings.defaultStartTime || ''}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: { defaultStartTime: normalizeHHmm(e.target.value) },
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">مدة الحصة (دقيقة):</label>
              <input
                type="number"
                min={5}
                max={480}
                value={activeProgram.settings.durationMinutes ?? 60}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: {
                      durationMinutes: Math.max(5, Number(e.target.value) || 60),
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">سماح التأخير (دقيقة):</label>
              <input
                type="number"
                min={0}
                max={120}
                value={activeProgram.settings.graceMinutes ?? 10}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: {
                      graceMinutes: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">تذكير قبل البدء (د):</label>
              <input
                type="number"
                min={0}
                max={240}
                value={activeProgram.settings.reminderMinutesBefore ?? 15}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: {
                      reminderMinutesBefore: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">مهلة الغياب بعد الانتهاء:</label>
              <input
                type="number"
                min={0}
                max={360}
                value={activeProgram.settings.absenceGraceMinutes ?? 30}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: {
                      absenceGraceMinutes: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700">المنطقة الزمنية:</label>
              <input
                type="text"
                dir="ltr"
                value={activeProgram.settings.timezone || ''}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: { timezone: e.target.value },
                  })
                }
                placeholder="Asia/Bangkok"
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 pt-1 text-xs font-bold text-slate-800">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(activeProgram.settings.autoSendReminders)}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: { autoSendReminders: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <span>إرسال تذكير تلقائي عبر تيليغرام قبل الحصة</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(activeProgram.settings.autoMarkAbsent)}
                onChange={(e) =>
                  handleUpdateActiveProgram({
                    settingsPatch: { autoMarkAbsent: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <span>تسجيل الغياب تلقائياً وإبلاغ الطالب والإدارة عند انتهاء الحصة</span>
            </label>
          </div>
        </div>

        {statusBanner && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusBanner.type === 'warn'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setSubTab('groups')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'groups'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>1. مجموعات البرنامج ({activeProgramGroups.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('days')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'days'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>2. التقويم والجدول اليومي ({activeProgramDays.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('attendance')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'attendance'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>3. سجل الحضور اليومي ({attendanceStats.todayCount})</span>
          </button>
        </div>
      </div>

      {/* ============================================================
          SUB-TAB 1: GROUPS BUILDER
         ============================================================ */}
      {subTab === 'groups' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Groups Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <form
              onSubmit={handleCreateGroup}
              className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-3"
            >
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <FolderPlus className="w-4 h-4 text-emerald-600" />
                <span>إنشاء مجموعة في «{activeProgram.name}»</span>
              </h3>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={`اسم المجموعة (مثال: مجموعة ${
                  activeProgramGroups.length + 1
                })`}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
              <input
                type="text"
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="وصف مختصر (اختياري)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مجموعة</span>
              </button>
            </form>

            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm space-y-2">
              <h4 className="text-xs font-extrabold text-slate-700 mb-2">
                مجموعات البرنامج ({activeProgramGroups.length})
              </h4>
              {activeProgramGroups.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold">
                  لا توجد مجموعات في هذا البرنامج بعد. أضف أول مجموعة من الأعلى.
                </div>
              ) : (
                activeProgramGroups.map((grp) => {
                  const isActive = activeGroup?.id === grp.id;
                  const isConfirmingDel = confirmDeleteGroupId === grp.id;
                  return (
                    <div
                      key={grp.id}
                      onClick={() => setSelectedGroupId(grp.id)}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                        isActive
                          ? 'bg-emerald-50 border-emerald-400 shadow-2xs'
                          : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                          {grp.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {grp.lessons.length} دروس مضافة
                        </div>
                      </div>
                      {isConfirmingDel ? (
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleDeleteGroup(grp.id)}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold cursor-pointer"
                          >
                            حذف؟
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGroupId(null)}
                            className="px-1.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                          >
                            لا
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteGroupId(grp.id);
                          }}
                          className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 cursor-pointer shrink-0"
                          title="حذف المجموعة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Group Editor */}
          <div className="lg:col-span-8">
            {!activeGroup ? (
              <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center space-y-2">
                <Sparkles className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">
                  أنشئ مجموعة أو اختر مجموعة من القائمة لبدء إضافة الدروس إليها.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">
                      اسم المجموعة
                    </label>
                    <input
                      type="text"
                      value={activeGroup.name}
                      onChange={(e) =>
                        handleUpdateGroupField(activeGroup.id, {
                          name: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-extrabold text-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600">
                      وصف المجموعة (اختياري)
                    </label>
                    <input
                      type="text"
                      value={activeGroup.description || ''}
                      onChange={(e) =>
                        handleUpdateGroupField(activeGroup.id, {
                          description: e.target.value,
                        })
                      }
                      placeholder="مثال: مراجعة الحروف الأساسية والكتابة"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Selected Lessons Chips inside this Group */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                    <span>
                      الدروس المضافة في «{activeGroup.name}» ({activeGroup.lessons.length})
                    </span>
                  </div>
                  {activeGroup.lessons.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500 text-center font-semibold">
                      اختر المواضيع من القوائم المنسدلة بالأسفل لإضافتها إلى هذه المجموعة.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {activeGroup.lessons.map((ref) => {
                        const meta = SCHEDULE_EXERCISE_META[ref.exerciseType];
                        return (
                          <span
                            key={ref.key}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder}`}
                          >
                            <span className="px-1.5 py-0.5 rounded-md bg-white/80 text-[10px] font-extrabold">
                              {meta.shortAr}
                            </span>
                            <span>{ref.topicName}</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveLessonFromGroup(
                                  activeGroup.id,
                                  ref.key
                                )
                              }
                              className="p-0.5 rounded-full hover:bg-black/10 cursor-pointer"
                              title="إزالة من المجموعة"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 6 Exercise Dropdowns */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-slate-800">
                    <span>
                      إضافة أو إزالة مواضيع من التمارين الستة:
                    </span>
                    <div className="flex items-center gap-2 text-[10px] font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                        ✓ مضاف لهذه المجموعة
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                        🔒 مضاف لمجموعة أخرى (غير متاح للتكرار)
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {EXERCISE_TYPES_ORDER.map((exType) => {
                      const meta = SCHEDULE_EXERCISE_META[exType];
                      const selectedKeys = new Set(
                        activeGroup.lessons.map((l) => l.key)
                      );

                      if (exType === 'video') {
                        return (
                          <div
                            key={exType}
                            className={`p-3 rounded-2xl border ${meta.badgeBg} ${meta.badgeBorder} space-y-1.5`}
                          >
                            <label
                              className={`text-xs font-extrabold block ${meta.badgeText}`}
                            >
                              {meta.labelAr} ({catalog.video.length})
                            </label>
                            <select
                              value=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                const found = catalog.video.find(
                                  (v) => v.lessonId === val
                                );
                                if (!found) return;
                                handleToggleLessonInGroup(activeGroup.id, {
                                  key: buildScheduleLessonKey(
                                    'video',
                                    found.topicName,
                                    found.lessonId
                                  ),
                                  exerciseType: 'video',
                                  topicName: found.topicName,
                                  lessonId: found.lessonId,
                                });
                              }}
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 cursor-pointer"
                            >
                              <option value="">
                                + اختر درس فيديو للإضافة / الإزالة...
                              </option>
                              {catalog.video.map((v) => {
                                const k = buildScheduleLessonKey(
                                  'video',
                                  v.topicName,
                                  v.lessonId
                                );
                                const isSel = selectedKeys.has(k);
                                const assignedGroups = topicAssignmentMap.get(k) || [];
                                const inOtherGroup = !isSel && assignedGroups.length > 0;
                                const labelBase = v.videoTopic
                                  ? `${v.videoTopic} — ${v.topicName}`
                                  : v.topicName;
                                return (
                                  <option
                                    key={v.lessonId}
                                    value={v.lessonId}
                                    disabled={inOtherGroup}
                                    style={
                                      isSel
                                        ? {
                                            backgroundColor: '#d1fae5',
                                            color: '#065f46',
                                            fontWeight: 'bold',
                                          }
                                        : inOtherGroup
                                        ? {
                                            backgroundColor: '#f1f5f9',
                                            color: '#94a3b8',
                                          }
                                        : undefined
                                    }
                                  >
                                    {isSel
                                      ? `✓ [${assignedGroups.join('، ')}] `
                                      : inOtherGroup
                                      ? `🔒 [${assignedGroups.join('، ')}] `
                                      : ''}
                                    {labelBase}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        );
                      }

                      const items = catalog[exType];
                      return (
                        <div
                          key={exType}
                          className={`p-3 rounded-2xl border ${meta.badgeBg} ${meta.badgeBorder} space-y-1.5`}
                        >
                          <label
                            className={`text-xs font-extrabold block ${meta.badgeText}`}
                          >
                            {meta.labelAr} ({items.length})
                          </label>
                          <select
                            value=""
                            onChange={(e) => {
                              const topicName = e.target.value;
                              if (!topicName) return;
                              handleToggleLessonInGroup(activeGroup.id, {
                                key: buildScheduleLessonKey(exType, topicName),
                                exerciseType: exType,
                                topicName,
                              });
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 cursor-pointer"
                          >
                            <option value="">
                              + اختر موضوعاً للإضافة / الإزالة...
                            </option>
                            {items.map((item) => {
                              const k = buildScheduleLessonKey(
                                exType,
                                item.topicName
                              );
                              const isSel = selectedKeys.has(k);
                              const assignedGroups = topicAssignmentMap.get(k) || [];
                              const inOtherGroup = !isSel && assignedGroups.length > 0;
                              return (
                                <option
                                  key={item.topicName}
                                  value={item.topicName}
                                  disabled={inOtherGroup}
                                  style={
                                    isSel
                                      ? {
                                          backgroundColor: '#d1fae5',
                                          color: '#065f46',
                                          fontWeight: 'bold',
                                        }
                                      : inOtherGroup
                                      ? {
                                          backgroundColor: '#f1f5f9',
                                          color: '#94a3b8',
                                        }
                                      : undefined
                                  }
                                >
                                  {isSel
                                    ? `✓ [${assignedGroups.join('، ')}] `
                                    : inOtherGroup
                                    ? `🔒 [${assignedGroups.join('، ')}] `
                                    : ''}
                                  {item.topicName} ({item.count})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 2: CALENDAR GENERATOR & DAILY SCHEDULE
         ============================================================ */}
      {subTab === 'days' && (
        <div className="space-y-5">
          {/* Calendar Auto-Generator */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>مولّد أيام وتواريخ الدورة التلقائي</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">
                  1. تاريخ البداية
                </label>
                <input
                  type="date"
                  value={genStartDate}
                  onChange={(e) =>
                    handleUpdateActiveProgram({
                      settingsPatch: { programStartDate: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">
                  2. تاريخ النهاية
                </label>
                <input
                  type="date"
                  value={genEndDate}
                  onChange={(e) =>
                    handleUpdateActiveProgram({
                      settingsPatch: { programEndDate: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                  <Archive className="w-3.5 h-3.5 shrink-0" />
                  <span>3. تاريخ إخفاء الجدول والدروس (إنهاء البرنامج)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={archiveDate}
                    onChange={(e) =>
                      handleUpdateActiveProgram({
                        settingsPatch: { archiveDate: e.target.value },
                      })
                    }
                    title="عند وصول هذا التاريخ يتم إخفاء الجدول وإغلاق جميع الدروس والمراجعة تلقائياً لطلاب هذا البرنامج"
                    className="w-full px-3 py-2 rounded-xl border border-rose-300 bg-rose-50/40 text-xs font-mono font-bold text-rose-950"
                  />
                  {archiveDate && (
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateActiveProgram({
                          settingsPatch: { archiveDate: '' },
                        })
                      }
                      className="p-2 rounded-xl border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                      title="إلغاء تاريخ الإخفاء"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">
                  نوع الأيام المولدة افتراضياً
                </label>
                <select
                  value={genDayType}
                  onChange={(e) =>
                    handleUpdateActiveProgram({
                      settingsPatch: { genDayType: e.target.value as ScheduleDayType },
                    })
                  }
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-extrabold ${
                    SCHEDULE_DAY_TYPE_META[genDayType].selectCls
                  }`}
                >
                  <option value="lesson">درس عادي</option>
                  <option value="review">مراجعة</option>
                  <option value="exam">امتحان</option>
                  <option value="attendance">حصة حضور</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block whitespace-nowrap">
                  عدد المجموعات في اليوم
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={genGroupsPerDay}
                  onChange={(e) => {
                    const ascii = e.target.value
                      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
                      .replace(/\D/g, '')
                      .slice(0, 2);
                    handleUpdateActiveProgram({
                      settingsPatch: { genGroupsPerDay: ascii },
                    });
                  }}
                  placeholder="0"
                  title="عدد المجموعات في اليوم الواحد (فارغ أو 0 = إضافة المجموعات يدوياً)"
                  className="w-16 px-2 py-2 rounded-xl border border-slate-300 text-xs font-mono font-extrabold text-center bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {archiveDate && (
              <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-900 flex items-center gap-2">
                <Archive className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>
                  بدءاً من تاريخ <span className="font-mono">{archiveDate}</span> سيتم إخفاء الجدول اليومي وإغلاق جميع الدروس والمراجعة لطلاب برنامج «{activeProgram.name}» تلقائياً.
                </span>
              </div>
            )}

            {genDayType === 'attendance' && (
              <div className="p-3 rounded-2xl bg-purple-50/70 border border-purple-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-purple-900 block">
                    نمط حصة الحضور الافتراضي:
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateActiveProgram({
                          settingsPatch: { defaultAttendanceMode: 'live' },
                        })
                      }
                      className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-extrabold border flex items-center justify-center gap-1 cursor-pointer ${
                        genAttendanceMode === 'live'
                          ? 'bg-purple-700 text-white border-purple-700'
                          : 'bg-white text-purple-900 border-purple-200'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>بث مباشر</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateActiveProgram({
                          settingsPatch: { defaultAttendanceMode: 'in_person' },
                        })
                      }
                      className={`flex-1 py-1.5 px-2.5 rounded-xl text-[11px] font-extrabold border flex items-center justify-center gap-1 cursor-pointer ${
                        genAttendanceMode === 'in_person'
                          ? 'bg-purple-700 text-white border-purple-700'
                          : 'bg-white text-purple-900 border-purple-200'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>حضوري في الفصل</span>
                    </button>
                  </div>
                </div>

                {genAttendanceMode === 'live' ? (
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-purple-900 block">
                      رابط البث المباشر (Zoom / Google Meet / YouTube):
                    </label>
                    <input
                      type="url"
                      dir="ltr"
                      value={genLiveUrl}
                      onChange={(e) =>
                        handleUpdateActiveProgram({
                          settingsPatch: { defaultLiveUrl: e.target.value },
                        })
                      }
                      placeholder="https://meet.google.com/... أو https://zoom.us/..."
                      className="w-full px-3 py-1.5 rounded-xl border border-purple-200 bg-white text-xs font-mono"
                    />
                  </div>
                ) : (
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-purple-900 block">
                      مكان / قاعة الفصل الحضوري:
                    </label>
                    <input
                      type="text"
                      value={genClassroomLocation}
                      onChange={(e) =>
                        handleUpdateActiveProgram({
                          settingsPatch: { defaultClassroomLocation: e.target.value },
                        })
                      }
                      placeholder="مثال: قاعة رقم 2 — الدور الأرضي / مبنى المركز"
                      className="w-full px-3 py-1.5 rounded-xl border border-purple-200 bg-white text-xs font-bold"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-600 block">
                أيام الدراسة المتكررة في الأسبوع:
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_BUTTONS.map((w) => {
                  const active = genWeekdays.includes(w.day);
                  return (
                    <button
                      key={w.day}
                      type="button"
                      onClick={() => handleToggleWeekday(w.day)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="text-[11px] font-bold text-slate-600 block">
                طريقة التوليد وتوزيع المجموعات:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateActiveProgram({ settingsPatch: { genMode: 'replace' } })
                  }
                  className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                    genMode === 'replace'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-extrabold">
                    استبدال وإعادة توليد جدول «{activeProgram.name}»
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      genMode === 'replace' ? 'text-indigo-100' : 'text-slate-500'
                    }`}
                  >
                    يحذف الأيام السابقة غير المختارة ويعيد ترتيب المجموعات على الأيام الجديدة فقط (مثالي عند تعديل أيام الأسبوع)
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateActiveProgram({ settingsPatch: { genMode: 'append' } })
                  }
                  className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                    genMode === 'append'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-extrabold">
                    إضافة الأيام الجديدة فقط دون حذف السابق
                  </div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      genMode === 'append' ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    يُبقي الأيام الحالية كما هي، ويستكمل توزيع المجموعات المتبقية على التواريخ الجديدة فقط
                  </div>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGenerateDays}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {genMode === 'replace'
                      ? 'توليد (استبدال وإعادة توزيع الجدول)'
                      : 'إضافة التواريخ الجديدة وتوزيع المتبقي'}
                  </span>
                </button>

                {activeProgramDays.length > 0 && activeProgramGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRedistributeGroupsOnCurrentDays}
                    className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    title="إعادة توزيع المجموعات بالترتيب على الأيام الموجودة دون تغيير التواريخ"
                  >
                    <Shuffle className="w-4 h-4" />
                    <span>إعادة توزيع المجموعات على الأيام الحالية</span>
                  </button>
                )}

                {daysUndoSnapshot && (
                  <button
                    type="button"
                    onClick={handleUndoDaysChange}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Undo2 className="w-4 h-4" />
                    <span>تراجع عن آخر تعديل</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={singleDayDate}
                  onChange={(e) => setSingleDayDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
                <button
                  type="button"
                  onClick={handleAddSingleDay}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة يوم مفرد</span>
                </button>
              </div>
            </div>
          </div>

          {/* Days List */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-sm font-extrabold text-slate-900">
                  أيام برنامج «{activeProgram.name}» ({activeProgramDays.length})
                </h3>
                {/* Distinct Color Legend */}
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-extrabold">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300">
                    درس عادي
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 border border-sky-300">
                    مراجعة
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300">
                    امتحان
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300">
                    حصة حضور
                  </span>
                </div>
              </div>

              {activeProgramDays.length > 0 && (
                <div>
                  {confirmDeleteAllDays ? (
                    <div className="flex items-center gap-1.5 bg-rose-100 px-3 py-1.5 rounded-xl border border-rose-300">
                      <span className="text-[11px] font-extrabold text-rose-900">
                        تأكيد حذف ({activeProgramDays.length} يوم)؟
                      </span>
                      <button
                        type="button"
                        onClick={handleDeleteAllDays}
                        className="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold cursor-pointer"
                      >
                        نعم، احذف
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteAllDays(false)}
                        className="px-2 py-0.5 rounded-lg bg-white text-slate-700 text-[10px] font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAllDays(true)}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الكل</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {activeProgramDays.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400 font-bold bg-slate-50 rounded-2xl border border-slate-200">
                لا توجد أيام في جدول «{activeProgram.name}» حالياً. استخدم المولّد بالأعلى أو أضف يوماً مفرداً.
              </div>
            ) : (
              <div className="space-y-3">
                {activeProgramDays.map((day) => {
                  const dateInfo = formatScheduleDateLabel(day.date, 'ar');
                  const isToday = day.date === todayISO;
                  const typeMeta = SCHEDULE_DAY_TYPE_META[day.dayType];
                  const dayGroupIds = day.groupIds?.length
                    ? day.groupIds
                    : day.groupId
                    ? [day.groupId]
                    : [];
                  const dayGroups = dayGroupIds
                    .map((gid) => activeProgramGroups.find((g) => g.id === gid))
                    .filter((g): g is CourseGroup => Boolean(g));

                  return (
                    <div
                      key={day.id}
                      className={`p-4 rounded-2xl border-2 space-y-3 transition-all ${typeMeta.cardBg} ${typeMeta.cardBorder} ${
                        isToday ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                      }`}
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
                        {/* Editable Date & Live Weekday */}
                        <div className="lg:col-span-3 flex flex-wrap items-center gap-2">
                          <div className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 shadow-2xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-extrabold text-indigo-700">
                                {dateInfo.weekday}
                              </span>
                              {isToday && (
                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[9px] font-extrabold">
                                  اليوم
                                </span>
                              )}
                            </div>
                            <input
                              type="date"
                              value={day.date}
                              onChange={(e) =>
                                handleChangeDayDate(day.id, e.target.value)
                              }
                              className="text-xs font-mono font-bold text-slate-900 bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                              title="انقر لتعديل تاريخ هذا اليوم"
                            />
                          </div>
                        </div>

                        {/* Day Type with Distinct Color */}
                        <div className="lg:col-span-2">
                          <select
                            value={day.dayType}
                            onChange={(e) => {
                              const nextType = e.target.value as ScheduleDayType;
                              handleUpdateDay(day.id, {
                                dayType: nextType,
                                ...(nextType === 'attendance' && !day.attendanceMode
                                  ? {
                                      attendanceMode: genAttendanceMode,
                                      liveUrl: day.liveUrl ?? genLiveUrl,
                                      classroomLocation:
                                        day.classroomLocation ?? genClassroomLocation,
                                    }
                                  : {}),
                              });
                            }}
                            className={`w-full px-2.5 py-2 rounded-xl border text-xs font-extrabold cursor-pointer ${typeMeta.selectCls}`}
                          >
                            <option value="lesson">درس عادي</option>
                            <option value="review">مراجعة</option>
                            <option value="exam">امتحان</option>
                            <option value="attendance">حصة حضور</option>
                          </select>
                        </div>

                        {/* Multiple Assigned Groups + Add Group Dropdown */}
                        <div className="lg:col-span-5 space-y-2">
                          {dayGroups.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {dayGroups.map((grp) => (
                                <span
                                  key={grp.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-300 text-xs font-extrabold text-slate-900 shadow-2xs"
                                >
                                  <span>{grp.name}</span>
                                  <span className="text-[10px] text-slate-500 font-semibold">
                                    ({grp.lessons.length})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveGroupFromDay(day.id, grp.id)
                                    }
                                    className="p-0.5 rounded-full hover:bg-rose-100 text-rose-600 cursor-pointer"
                                    title="إزالة هذه المجموعة من اليوم"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          <select
                            value=""
                            onChange={(e) => {
                              const gid = e.target.value;
                              if (gid) handleAddGroupToDay(day.id, gid);
                            }}
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold text-slate-700 cursor-pointer"
                          >
                            <option value="">
                              {dayGroups.length === 0
                                ? '+ إضافة مجموعة لهذا اليوم (أو يترك يوماً حراً)...'
                                : '+ إضافة مجموعة إضافية لهذا اليوم...'}
                            </option>
                            {activeProgramGroups.map((grp) => {
                              const alreadyOnThisDay = dayGroupIds.includes(grp.id);
                              const usedCount = groupDayUsageCount.get(grp.id) || 0;
                              const usedElsewhere =
                                !alreadyOnThisDay && usedCount > 0;
                              return (
                                <option
                                  key={grp.id}
                                  value={grp.id}
                                  disabled={alreadyOnThisDay}
                                  style={
                                    alreadyOnThisDay
                                      ? {
                                          backgroundColor: '#e2e8f0',
                                          color: '#64748b',
                                          fontWeight: 'bold',
                                        }
                                      : usedElsewhere
                                      ? {
                                          backgroundColor: '#fef3c7',
                                          color: '#92400e',
                                        }
                                      : undefined
                                  }
                                >
                                  {alreadyOnThisDay
                                    ? `✓ ${grp.name} (مختارة في هذا اليوم)`
                                    : usedElsewhere
                                    ? `● ${grp.name} (${grp.lessons.length} دروس) — مستخدمة في الجدول`
                                    : `${grp.name} (${grp.lessons.length} دروس)`}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Day Row Actions */}
                        <div className="lg:col-span-2 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleClearDay(day.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="تفريغ اليوم"
                          >
                            <Eraser className="w-3.5 h-3.5" />
                            <span>تفريغ اليوم</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDay(day.id)}
                            className="p-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 cursor-pointer"
                            title="حذف اليوم"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Optional Custom Title, Per-Day Start Time, Duration & Notes */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <input
                          type="text"
                          value={day.customTitle || ''}
                          onChange={(e) =>
                            handleUpdateDay(day.id, {
                              customTitle: e.target.value,
                            })
                          }
                          placeholder="عنوان مخصص لليوم (اختياري)..."
                          className="sm:col-span-4 w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                        />
                        <div className="sm:col-span-2 flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <input
                            type="time"
                            dir="ltr"
                            value={day.startTime || ''}
                            onChange={(e) =>
                              handleUpdateDay(day.id, {
                                startTime: normalizeHHmm(e.target.value) || undefined,
                              })
                            }
                            title="تخصيص وقت هذه الحصة (اتركه فارغاً لاستخدام وقت البرنامج الافتراضي)"
                            className="w-full text-[11px] font-mono font-bold text-slate-800 bg-transparent focus:outline-none"
                          />
                        </div>
                        <div className="sm:col-span-2 flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1">
                          <input
                            type="number"
                            min={5}
                            max={480}
                            value={day.durationMinutes ?? ''}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              handleUpdateDay(day.id, {
                                durationMinutes: v > 0 ? v : undefined,
                              });
                            }}
                            placeholder={`${activeProgram.settings.durationMinutes || 60} د`}
                            title="مدة الحصة بالدقائق"
                            className="w-full text-[11px] font-mono font-bold text-slate-800 bg-transparent focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400 font-bold shrink-0">د</span>
                        </div>
                        <input
                          type="text"
                          value={day.notes || ''}
                          onChange={(e) =>
                            handleUpdateDay(day.id, { notes: e.target.value })
                          }
                          placeholder="ملاحظات أو توجيهات للطالب لهذا اليوم (اختياري)..."
                          className="sm:col-span-4 w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                        />
                      </div>

                      {day.dayType === 'attendance' && (
                        <div className="p-2.5 rounded-xl bg-white/90 border border-purple-200 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateDay(day.id, { attendanceMode: 'live' })
                              }
                              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-extrabold border flex items-center justify-center gap-1 cursor-pointer ${
                                (day.attendanceMode || 'live') === 'live'
                                  ? 'bg-purple-700 text-white border-purple-700'
                                  : 'bg-slate-50 text-purple-900 border-purple-200'
                              }`}
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>بث مباشر</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateDay(day.id, { attendanceMode: 'in_person' })
                              }
                              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-extrabold border flex items-center justify-center gap-1 cursor-pointer ${
                                day.attendanceMode === 'in_person'
                                  ? 'bg-purple-700 text-white border-purple-700'
                                  : 'bg-slate-50 text-purple-900 border-purple-200'
                              }`}
                            >
                              <Building2 className="w-3.5 h-3.5" />
                              <span>حضوري في الفصل</span>
                            </button>
                          </div>
                          {(day.attendanceMode || 'live') === 'live' ? (
                            <input
                              type="url"
                              dir="ltr"
                              value={day.liveUrl || ''}
                              onChange={(e) =>
                                handleUpdateDay(day.id, { liveUrl: e.target.value })
                              }
                              placeholder="رابط البث المباشر للحصة (Zoom / Meet)..."
                              className="sm:col-span-2 w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-xs font-mono"
                            />
                          ) : (
                            <input
                              type="text"
                              value={day.classroomLocation || ''}
                              onChange={(e) =>
                                handleUpdateDay(day.id, {
                                  classroomLocation: e.target.value,
                                })
                              }
                              placeholder="مكان / قاعة الفصل الحضوري..."
                              className="sm:col-span-2 w-full px-3 py-1.5 rounded-lg border border-purple-200 bg-white text-xs font-bold"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          SUB-TAB 3: DAILY ATTENDANCE LOG (سجل_الحضور)
         ============================================================ */}
      {subTab === 'attendance' && (
        <div className="space-y-5">
          {!attendanceScriptSupported && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                كود Google Apps Script المنشور حالياً لم يُحدَّث بعد لدعم ورقة «سجل_الحضور». انسخ الكود المحدّث من تبويب إعدادات Google Sheets ثم انشر إصداراً جديداً (New version).
              </div>
            </div>
          )}

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500">حضور اليوم ({todayISO})</div>
                <div className="text-2xl font-extrabold text-emerald-700 mt-0.5 tabular-nums">
                  {attendanceStats.todayCount}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500">تأخر / غياب اليوم</div>
                <div className="text-2xl font-extrabold text-amber-700 mt-0.5 tabular-nums">
                  {attendanceStats.todayLateCount} / {attendanceStats.todayAbsentCount}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-indigo-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500">إجمالي سجلات الحضور</div>
                <div className="text-2xl font-extrabold text-indigo-700 mt-0.5 tabular-nums">
                  {attendanceStats.totalCount}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-teal-200 shadow-2xs flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-slate-500">طلاب مسجلون بالحضور</div>
                <div className="text-2xl font-extrabold text-teal-700 mt-0.5 tabular-nums">
                  {attendanceStats.uniqueStudents}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Scheduler 24/7 Trigger Info + Manual Trigger */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 text-xs">
              <div className="font-extrabold text-indigo-950 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-indigo-700" />
                <span>المجدول الآلي لتذكيرات الحصص والغياب التلقائي</span>
              </div>
              <p className="text-[11px] text-indigo-900/80 leading-relaxed">
                للتشغيل الآلي على مدار الساعة حتى عند إغلاق المتصفح: شغّل دالة{' '}
                <code className="font-mono bg-white px-1 rounded">setupAttendanceTriggersGS</code> مرة واحدة من{' '}
                <strong>Extensions → Apps Script</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunSchedulerNow}
              disabled={isRunningScheduler}
              className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {isRunningScheduler ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>فحص التذكيرات والغياب الآن</span>
            </button>
          </div>

          {/* Filter & Actions Bar */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAttDateFilter('')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer ${
                    attDateFilter === ''
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  كل التواريخ
                </button>
                <button
                  type="button"
                  onClick={() => setAttDateFilter(todayISO)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border cursor-pointer ${
                    attDateFilter === todayISO
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  حضور اليوم فقط
                </button>
                <input
                  type="date"
                  value={attDateFilter}
                  onChange={(e) => setAttDateFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportAttendanceCsv}
                  disabled={filteredAttendance.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير CSV</span>
                </button>
                <button
                  type="button"
                  onClick={loadAttendanceLog}
                  disabled={isLoadingAttendance}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAttendance ? 'animate-spin' : ''}`} />
                  <span>تحديث السجل</span>
                </button>
              </div>
            </div>

            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'كل الحالات' },
                  { id: 'early', label: 'حاضر مبكراً' },
                  { id: 'on_time', label: 'بالموعد' },
                  { id: 'late', label: 'متأخر' },
                  { id: 'absent', label: 'غائب' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setAttStatusFilter(st.id)}
                  className={`px-3 py-1 rounded-xl text-[11px] font-extrabold border cursor-pointer transition-colors ${
                    attStatusFilter === st.id
                      ? 'bg-indigo-700 text-white border-indigo-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={attSearch}
                onChange={(e) => setAttSearch(e.target.value)}
                placeholder="ابحث باسم الطالب، رقم ID، اسم الحصة، أو المدينة..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900"
              />
            </div>

            {isLoadingAttendance && attendanceRecords.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400">
                جاري تحميل سجل الحضور من ورقة سجل_الحضور...
              </div>
            ) : filteredAttendance.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                لا توجد سجلات حضور مطابقة للبحث أو التاريخ المحدد.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white font-extrabold">
                      <th className="py-3 px-3 whitespace-nowrap">التاريخ</th>
                      <th className="py-3 px-3 whitespace-nowrap">الوقت / الموعد</th>
                      <th className="py-3 px-3 whitespace-nowrap">الحالة</th>
                      <th className="py-3 px-3 whitespace-nowrap">ID المشترك</th>
                      <th className="py-3 px-3 whitespace-nowrap">اسم الطالب</th>
                      <th className="py-3 px-3">الحصة / المجموعات</th>
                      <th className="py-3 px-3 whitespace-nowrap">نوع اليوم</th>
                      <th className="py-3 px-3 whitespace-nowrap">الموقع</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAttendance.map((rec) => {
                      const rowKey = `${rec.date}::${rec.studentId}`;
                      const isConfirming = confirmDeleteAttKey === rowKey;
                      const dMeta =
                        SCHEDULE_DAY_TYPE_META[
                          (rec.dayType === 'review' ||
                          rec.dayType === 'exam' ||
                          rec.dayType === 'attendance'
                            ? rec.dayType
                            : 'lesson') as ScheduleDayType
                        ];
                      const statusMeta = getAttendanceStatusMeta(rec.status, rec.minutesDelta);
                      return (
                        <tr key={rowKey} className="hover:bg-slate-50/90 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap tabular-nums">
                            {rec.date}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                            <div className="inline-flex items-center gap-1 font-bold">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {rec.time || '—'}
                            </div>
                            {rec.scheduledTime && (
                              <div className="text-[10px] text-slate-400">
                                الموعد: {rec.scheduledTime}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${statusMeta.badgeCls}`}
                            >
                              {statusMeta.labelAr}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-extrabold text-indigo-700 whitespace-nowrap">
                            {rec.studentId}
                          </td>
                          <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">
                            {rec.studentName}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-700">
                            {rec.sessionTitle || 'حصة اليوم'}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${dMeta.badgeBg} ${dMeta.badgeText} ${dMeta.badgeBorder}`}
                            >
                              {dMeta.labelAr}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {rec.location && rec.location !== 'غير متاح' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                                <MapPin className="w-3 h-3 text-emerald-600" />
                                {rec.location}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {isConfirming ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteAttendanceRow(rec.date, rec.studentId)
                                  }
                                  className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold cursor-pointer"
                                >
                                  تأكيد الحذف
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteAttKey(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAttKey(rowKey)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                title="حذف سجل الحضور"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
