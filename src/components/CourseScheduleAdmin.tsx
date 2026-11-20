import React, { useMemo, useState } from 'react';
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
  CourseScheduleData,
  CourseGroup,
  CourseScheduleDay,
  ScheduleDayType,
  ScheduleExerciseType,
  ScheduleLessonRef,
  SCHEDULE_EXERCISE_META,
  buildScheduleLessonKey,
  extractAllExerciseTopics,
  fetchCourseScheduleFromSheets,
  formatScheduleDateLabel,
  generateCalendarDays,
  getTodayLocalISO,
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
  onOpenStudentPreview: () => void;
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
  const [subTab, setSubTab] = useState<'groups' | 'days'>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    schedule.groups[0]?.id || ''
  );
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');

  // Calendar generator states
  const todayISO = getTodayLocalISO();
  const [genStartDate, setGenStartDate] = useState<string>(todayISO);
  const [genEndDate, setGenEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  });
  const [genWeekdays, setGenWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [genDayType, setGenDayType] = useState<ScheduleDayType>('lesson');
  const [singleDayDate, setSingleDayDate] = useState<string>(todayISO);

  // Cloud sync status
  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warn' | 'error';
    message: string;
  } | null>(null);

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

  const activeGroup = useMemo(
    () =>
      schedule.groups.find((g) => g.id === selectedGroupId) ||
      schedule.groups[0] ||
      null,
    [schedule.groups, selectedGroupId]
  );

  // Create a new group
  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName =
      newGroupName.trim() || `مجموعة ${schedule.groups.length + 1}`;
    const newGrp: CourseGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      description: newGroupDesc.trim(),
      lessons: [],
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const nextGroups = [...schedule.groups, newGrp];
    onUpdateSchedule({ ...schedule, groups: nextGroups });
    setSelectedGroupId(newGrp.id);
    setNewGroupName('');
    setNewGroupDesc('');
  };

  const handleUpdateGroupField = (
    groupId: string,
    patch: Partial<CourseGroup>
  ) => {
    onUpdateSchedule({
      ...schedule,
      groups: schedule.groups.map((g) =>
        g.id === groupId ? { ...g, ...patch } : g
      ),
    });
  };

  const handleDeleteGroup = (groupId: string) => {
    const grp = schedule.groups.find((g) => g.id === groupId);
    if (
      !confirm(
        `هل تريد حذف "${grp?.name || 'المجموعة'}"؟ سيتم تفريغ ارتباطها من الأيام المجدولة.`
      )
    ) {
      return;
    }
    const nextGroups = schedule.groups.filter((g) => g.id !== groupId);
    const nextDays = schedule.days.map((d) =>
      d.groupId === groupId ? { ...d, groupId: '' } : d
    );
    onUpdateSchedule({ ...schedule, groups: nextGroups, days: nextDays });
    if (selectedGroupId === groupId) {
      setSelectedGroupId(nextGroups[0]?.id || '');
    }
  };

  const handleToggleLessonInGroup = (
    groupId: string,
    ref: ScheduleLessonRef
  ) => {
    const grp = schedule.groups.find((g) => g.id === groupId);
    if (!grp) return;
    const exists = grp.lessons.some((l) => l.key === ref.key);
    const nextLessons = exists
      ? grp.lessons.filter((l) => l.key !== ref.key)
      : [...grp.lessons, ref];
    handleUpdateGroupField(groupId, { lessons: nextLessons });
  };

  const handleRemoveLessonFromGroup = (groupId: string, lessonKey: string) => {
    const grp = schedule.groups.find((g) => g.id === groupId);
    if (!grp) return;
    handleUpdateGroupField(groupId, {
      lessons: grp.lessons.filter((l) => l.key !== lessonKey),
    });
  };

  // Calendar Generator
  const handleToggleWeekday = (dayIdx: number) => {
    setGenWeekdays((prev) =>
      prev.includes(dayIdx)
        ? prev.filter((d) => d !== dayIdx)
        : [...prev, dayIdx]
    );
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
    const generated = generateCalendarDays(
      genStartDate,
      genEndDate,
      genWeekdays,
      genDayType
    );
    const existingDates = new Set(schedule.days.map((d) => d.date));
    const additions = generated.filter((d) => !existingDates.has(d.date));
    const merged = [...schedule.days, ...additions].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    onUpdateSchedule({ ...schedule, days: merged });
    setStatusBanner({
      type: 'success',
      message: `تمت إضافة ${additions.length} يوماً جديداً إلى الجدول (إجمالي الأيام: ${merged.length}).`,
    });
  };

  const handleAddSingleDay = () => {
    if (!singleDayDate) return;
    if (schedule.days.some((d) => d.date === singleDayDate)) {
      setStatusBanner({
        type: 'warn',
        message: `التاريخ ${singleDayDate} موجود مسبقاً في الجدول.`,
      });
      return;
    }
    const nextDay: CourseScheduleDay = {
      id: `day_${singleDayDate}_${Date.now()}`,
      date: singleDayDate,
      dayType: 'lesson',
      groupId: '',
      customTitle: '',
      notes: '',
    };
    const merged = [...schedule.days, nextDay].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    onUpdateSchedule({ ...schedule, days: merged });
    setStatusBanner(null);
  };

  const handleUpdateDay = (
    dayId: string,
    patch: Partial<CourseScheduleDay>
  ) => {
    onUpdateSchedule({
      ...schedule,
      days: schedule.days.map((d) => (d.id === dayId ? { ...d, ...patch } : d)),
    });
  };

  const handleClearDay = (dayId: string) => {
    handleUpdateDay(dayId, { groupId: '', customTitle: '', notes: '' });
  };

  const handleDeleteDay = (dayId: string) => {
    onUpdateSchedule({
      ...schedule,
      days: schedule.days.filter((d) => d.id !== dayId),
    });
  };

  const handleSaveToCloud = async () => {
    setIsSaving(true);
    setStatusBanner(null);
    try {
      const res = await saveCourseScheduleToSheets(webhookUrl, schedule);
      if (res.cloudSaved) {
        setStatusBanner({
          type: 'success',
          message:
            res.message ||
            'تم حفظ المجموعات والجدول اليومي في Google Sheets بنجاح!',
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
        if (
          fetched.groups.length > 0 &&
          !fetched.groups.some((g) => g.id === selectedGroupId)
        ) {
          setSelectedGroupId(fetched.groups[0].id);
        }
        setStatusBanner({
          type: 'success',
          message: `تم جلب ${fetched.groups.length} مجموعة و ${fetched.days.length} يوماً من الشيت بنجاح!`,
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
              onClick={onOpenStudentPreview}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-indigo-600" />
              <span>معاينة جدول الطالب</span>
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

        {/* Course Settings Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">
              عنوان جدول الدورة (يظهر للطالب):
            </label>
            <input
              type="text"
              value={schedule.settings.courseTitle}
              onChange={(e) =>
                onUpdateSchedule({
                  ...schedule,
                  settings: {
                    ...schedule.settings,
                    courseTitle: e.target.value,
                  },
                })
              }
              placeholder="جدول الدورة اليومي"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs sm:text-sm font-bold text-slate-900"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl border border-amber-200 bg-amber-50/70">
            <div className="flex items-center gap-2.5">
              {schedule.settings.lockFutureDays ? (
                <Lock className="w-4 h-4 text-amber-700 shrink-0" />
              ) : (
                <Unlock className="w-4 h-4 text-emerald-700 shrink-0" />
              )}
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  قفل الدروس المستقبلية حتى يحين تاريخها
                </div>
                <div className="text-[11px] text-slate-600">
                  عند التفعيل لا يمكن للطالب فتح أيام الغد وما بعدها قبل تاريخها.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={schedule.settings.lockFutureDays}
              onChange={(e) =>
                onUpdateSchedule({
                  ...schedule,
                  settings: {
                    ...schedule.settings,
                    lockFutureDays: e.target.checked,
                  },
                })
              }
              className="w-5 h-5 text-amber-600 rounded cursor-pointer shrink-0"
            />
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
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl">
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
            <span>1. إدارة المجموعات ({schedule.groups.length})</span>
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
            <span>2. التقويم والجدول اليومي ({schedule.days.length})</span>
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
                <span>إنشاء مجموعة جديدة</span>
              </h3>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={`اسم المجموعة (مثال: مجموعة ${
                  schedule.groups.length + 1
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
                قائمة المجموعات ({schedule.groups.length})
              </h4>
              {schedule.groups.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 font-semibold">
                  لا توجد مجموعات بعد. أضف أول مجموعة من الأعلى.
                </div>
              ) : (
                schedule.groups.map((grp) => {
                  const isActive = activeGroup?.id === grp.id;
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(grp.id);
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 cursor-pointer shrink-0"
                        title="حذف المجموعة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
                  <div className="text-xs font-extrabold text-slate-800">
                    إضافة أو إزالة مواضيع من جميع التمارين الستة (يظهر ✓ بجانب المختار):
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
                                return (
                                  <option key={v.lessonId} value={v.lessonId}>
                                    {isSel ? '✓ ' : ''}
                                    {v.videoTopic
                                      ? `${v.videoTopic} — ${v.topicName}`
                                      : v.topicName}
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
                              return (
                                <option
                                  key={item.topicName}
                                  value={item.topicName}
                                >
                                  {isSel ? '✓ ' : ''}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">
                  تاريخ البداية
                </label>
                <input
                  type="date"
                  value={genStartDate}
                  onChange={(e) => setGenStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">
                  تاريخ النهاية
                </label>
                <input
                  type="date"
                  value={genEndDate}
                  onChange={(e) => setGenEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">
                  نوع الأيام المولدة افتراضياً
                </label>
                <select
                  value={genDayType}
                  onChange={(e) =>
                    setGenDayType(e.target.value as ScheduleDayType)
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  <option value="lesson">درس عادي</option>
                  <option value="review">مراجعة</option>
                  <option value="exam">امتحان</option>
                </select>
              </div>
            </div>

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

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleGenerateDays}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                <span>توليد وتجهيز أيام الجدول</span>
              </button>

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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">
                أيام الجدول اليومي ({schedule.days.length})
              </h3>
              {schedule.days.length > 0 && (
                <span className="text-[11px] font-semibold text-slate-500">
                  رتّب المجموعات على كل يوم ولا تنسَ الضغط على «حفظ ومزامنة إلى الشيت»
                </span>
              )}
            </div>

            {schedule.days.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400 font-bold bg-slate-50 rounded-2xl border border-slate-200">
                لا توجد أيام في الجدول حالياً. استخدم المولّد بالأعلى أو أضف يوماً مفرداً.
              </div>
            ) : (
              <div className="space-y-2.5">
                {schedule.days.map((day) => {
                  const dateInfo = formatScheduleDateLabel(day.date, 'ar');
                  const isToday = day.date === todayISO;
                  const assignedGroup = schedule.groups.find(
                    (g) => g.id === day.groupId
                  );

                  return (
                    <div
                      key={day.id}
                      className={`p-3.5 rounded-2xl border space-y-2.5 ${
                        isToday
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-slate-50/70 border-slate-200'
                      }`}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                        {/* Date & Weekday */}
                        <div className="md:col-span-3 flex items-center gap-2">
                          <div className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-center min-w-[92px]">
                            <div className="text-[11px] font-extrabold text-indigo-700">
                              {dateInfo.weekday}
                            </div>
                            <div className="text-xs font-mono font-bold text-slate-800">
                              {dateInfo.formattedDate}
                            </div>
                          </div>
                          {isToday && (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-extrabold">
                              اليوم
                            </span>
                          )}
                        </div>

                        {/* Day Type */}
                        <div className="md:col-span-2">
                          <select
                            value={day.dayType}
                            onChange={(e) =>
                              handleUpdateDay(day.id, {
                                dayType: e.target.value as ScheduleDayType,
                              })
                            }
                            className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                          >
                            <option value="lesson">درس عادي</option>
                            <option value="review">مراجعة</option>
                            <option value="exam">امتحان</option>
                          </select>
                        </div>

                        {/* Assigned Group */}
                        <div className="md:col-span-4">
                          <select
                            value={day.groupId}
                            onChange={(e) =>
                              handleUpdateDay(day.id, {
                                groupId: e.target.value,
                              })
                            }
                            className={`w-full px-2.5 py-2 rounded-xl border text-xs font-extrabold ${
                              assignedGroup
                                ? 'border-emerald-300 bg-white text-emerald-950'
                                : 'border-slate-300 bg-white text-slate-500'
                            }`}
                          >
                            <option value="">— يوم حر بدون مجموعة —</option>
                            {schedule.groups.map((grp) => (
                              <option key={grp.id} value={grp.id}>
                                {grp.name} ({grp.lessons.length} دروس)
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Day Row Actions */}
                        <div className="md:col-span-3 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleClearDay(day.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            title="تفريغ اليوم"
                          >
                            <Eraser className="w-3.5 h-3.5" />
                            <span>تفريغ اليوم</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDay(day.id)}
                            className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                            title="حذف اليوم"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Optional Custom Title & Notes */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={day.customTitle || ''}
                          onChange={(e) =>
                            handleUpdateDay(day.id, {
                              customTitle: e.target.value,
                            })
                          }
                          placeholder="عنوان مخصص لليوم (اختياري)..."
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                        />
                        <input
                          type="text"
                          value={day.notes || ''}
                          onChange={(e) =>
                            handleUpdateDay(day.id, { notes: e.target.value })
                          }
                          placeholder="ملاحظات أو توجيهات للطالب لهذا اليوم (اختياري)..."
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
