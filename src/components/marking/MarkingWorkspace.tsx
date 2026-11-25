import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  RefreshCw,
  Search,
  Layers,
  Users,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Home,
  Sliders,
  Copy,
  Check,
  PenTool,
  Mic,
  Video,
  FileText,
  RotateCcw,
  Sparkles,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import {
  AdminUserRecord,
  MarkingConfig,
  MarkingExerciseType,
  MarkingStatus,
  TeacherCorrectionRecord,
  UnifiedMarkingSubmission,
  WordItem,
} from '../../types';
import { DrawingTemplate } from '../../arWriting/types/drawing';
import { VideoLesson } from '../../video/videoSheets';
import { CourseScheduleData, normalizeCourseScheduleData } from '../../utils/courseSchedule';
import {
  buildMarkingShareUrl,
  DEFAULT_MARKING_CONFIG,
  fetchMarkingWorkspaceData,
  getLocalMarkingConfig,
  saveMarkingCorrectionToSheets,
} from '../../utils/markingSheets';
import { getDirectImageUrl } from '../../utils/mediaUrl';
import { MarkingBlackboard, MarkingBlackboardHandle } from './MarkingBlackboard';
import { MarkingAudioStudio } from './MarkingAudioStudio';
import { MarkingVideoRecorder } from './MarkingVideoRecorder';
import { BatchCorrectionModal } from './BatchCorrectionModal';

interface MarkingWorkspaceProps {
  webhookUrl: string;
  curriculum: WordItem[];
  writingTemplates: DrawingTemplate[];
  videoLessons: VideoLesson[];
  courseSchedule: CourseScheduleData;
  adminUsers?: AdminUserRecord[];
  platformTitle?: string;
  homeLogoUrl?: string;
  isStandalonePage?: boolean;
  initialSubmissionKey?: string;
  onBackToHome?: () => void;
  onOpenAdminMarkingSettings?: () => void;
}

const EXERCISE_TYPE_LABELS: Record<'all' | MarkingExerciseType, string> = {
  all: 'كل التمارين',
  writing: 'الكتابة',
  pronunciation: 'النطق',
  video: 'فيديو تفاعلي',
  dictation: 'الإملاء',
};

const STATUS_FILTER_LABELS: Record<'all' | MarkingStatus, string> = {
  all: 'الكل',
  pending: 'بانتظار التصحيح',
  corrected: 'مصحّح',
  retry: 'مطلوب إعادة',
};

const QUICK_FEEDBACK_PRESETS = [
  'أحسنت! كتابة متقنة وتنفيذ رائع.',
  'نطق واضح ومخارج سليمة، بارك الله فيك.',
  'يرجى الانتباه لرسم الحرف على السطر وإعادة المحاولة.',
  'عمل ممتاز، استمر على هذا المستوى.',
];

const RATING_LABELS = ['ممتاز', 'جيد جداً', 'جيد', 'يحتاج تحسين', 'إعادة المحاولة'];

export const MarkingWorkspace: React.FC<MarkingWorkspaceProps> = ({
  webhookUrl,
  curriculum,
  writingTemplates,
  videoLessons,
  courseSchedule,
  adminUsers = [],
  platformTitle,
  homeLogoUrl,
  isStandalonePage = false,
  initialSubmissionKey,
  onBackToHome,
  onOpenAdminMarkingSettings,
}) => {
  // Teacher Auth State (Synced with Sheet "الرئيسية" D2:F31 via sessionStorage)
  const [isTeacherAuthed, setIsTeacherAuthed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('faseeh_admin_auth') === 'true';
    } catch {
      return false;
    }
  });
  const [teacherName, setTeacherName] = useState<string>(() => {
    try {
      return sessionStorage.getItem('faseeh_admin_name') || 'المعلم';
    } catch {
      return 'المعلم';
    }
  });

  // Login Gate Form State
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  // Workspace Data State
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markingConfig, setMarkingConfig] = useState<MarkingConfig>(() => getLocalMarkingConfig());
  const [submissions, setSubmissions] = useState<UnifiedMarkingSubmission[]>([]);

  // Filters
  const [filterProgramId, setFilterProgramId] = useState<string>('all');
  const [filterClassroomId, setFilterClassroomId] = useState<string>('all');
  const [filterLesson, setFilterLesson] = useState<string>('all');
  const [filterType, setFilterType] = useState<'all' | MarkingExerciseType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | MarkingStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active Submission & Studio State
  const [selectedKey, setSelectedKey] = useState<string>('');
  const blackboardRef = useRef<MarkingBlackboardHandle | null>(null);
  const [fStatus, setFStatus] = useState<MarkingStatus>('corrected');
  const [fScore, setFScore] = useState<string>('95');
  const [fRating, setFRating] = useState<string>('ممتاز');
  const [fNotes, setFNotes] = useState<string>('');
  const [fTeacherAudioB64, setFTeacherAudioB64] = useState<string | null>(null);
  const [fTeacherVideoUrl, setFTeacherVideoUrl] = useState<string>('');
  const [fAllowRetry, setFAllowRetry] = useState<boolean>(false);
  const [fSendTelegram, setFSendTelegram] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Batch Modal & Share Link
  const [batchModalState, setBatchModalState] = useState<{
    open: boolean;
    mode: 'queue' | 'bulk';
  }>({ open: false, mode: 'queue' });
  const [copiedPortalUrl, setCopiedPortalUrl] = useState(false);

  const normalizedSchedule = useMemo(
    () => normalizeCourseScheduleData(courseSchedule),
    [courseSchedule]
  );

  // Check if a logged-in teacher was blocked in Sheet "الرئيسية"
  useEffect(() => {
    if (!isTeacherAuthed || !adminUsers || adminUsers.length === 0) return;
    const blocked = adminUsers.find(
      (u) =>
        (u.name.toLowerCase() === teacherName.toLowerCase() ||
          teacherName.includes(u.name)) &&
        u.blocked
    );
    if (blocked) {
      try {
        sessionStorage.removeItem('faseeh_admin_auth');
        sessionStorage.removeItem('faseeh_admin_name');
      } catch {}
      setIsTeacherAuthed(false);
      setLoginError('يوجد خطا في التسجيل .. يرجى التواصل مع الادارة');
    }
  }, [adminUsers, isTeacherAuthed, teacherName]);

  const loadWorkspaceData = useCallback(async () => {
    if (!isTeacherAuthed) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchMarkingWorkspaceData(webhookUrl, {
        curriculum,
        writingTemplates,
        videoLessons,
        programs: normalizedSchedule.programs,
        classrooms: normalizedSchedule.classrooms,
      });
      setMarkingConfig(res.config || DEFAULT_MARKING_CONFIG);
      if (res.success) {
        setSubmissions(res.submissions);
        if (initialSubmissionKey) {
          const match = res.submissions.find((s) => s.submissionKey === initialSubmissionKey);
          if (match) setSelectedKey(match.submissionKey);
        } else if (res.submissions.length > 0) {
          setSelectedKey((prev) =>
            prev && res.submissions.some((s) => s.submissionKey === prev)
              ? prev
              : res.submissions[0].submissionKey
          );
        }
      } else {
        setLoadError(res.error || 'تعذر تحميل تسليمات الطلاب.');
      }
    } finally {
      setLoading(false);
    }
  }, [
    isTeacherAuthed,
    webhookUrl,
    curriculum,
    writingTemplates,
    videoLessons,
    normalizedSchedule.programs,
    normalizedSchedule.classrooms,
    initialSubmissionKey,
  ]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Available Classrooms scoped by selected program
  const availableClassrooms = useMemo(() => {
    const all = normalizedSchedule.classrooms || [];
    if (filterProgramId === 'all') return all;
    return all.filter((c) => c.programId === filterProgramId);
  }, [normalizedSchedule.classrooms, filterProgramId]);

  useEffect(() => {
    if (
      filterClassroomId !== 'all' &&
      !availableClassrooms.some((c) => c.id === filterClassroomId)
    ) {
      setFilterClassroomId('all');
    }
  }, [availableClassrooms, filterClassroomId]);

  // Unique lesson subjects from submissions
  const lessonOptions = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      if (s.lessonSubject) set.add(s.lessonSubject);
    });
    return Array.from(set);
  }, [submissions]);

  // Filtered submissions list
  const filteredSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return submissions.filter((s) => {
      if (filterProgramId !== 'all' && s.programId !== filterProgramId) return false;
      if (filterClassroomId !== 'all' && s.classroomId !== filterClassroomId) return false;
      if (filterLesson !== 'all' && s.lessonSubject !== filterLesson) return false;
      if (filterType !== 'all' && s.exerciseType !== filterType) return false;
      const effectiveStatus: MarkingStatus = s.correction?.status || 'pending';
      if (filterStatus !== 'all' && effectiveStatus !== filterStatus) return false;
      if (q) {
        const hay = `${s.studentName} ${s.studentId} ${s.lessonSubject} ${s.itemTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    submissions,
    filterProgramId,
    filterClassroomId,
    filterLesson,
    filterType,
    filterStatus,
    searchQuery,
  ]);

  const activeSubmission = useMemo(() => {
    if (filteredSubmissions.length === 0) return null;
    return (
      filteredSubmissions.find((s) => s.submissionKey === selectedKey) ||
      filteredSubmissions[0]
    );
  }, [filteredSubmissions, selectedKey]);

  // Sync studio inputs whenever active submission changes
  useEffect(() => {
    if (!activeSubmission) return;
    const c = activeSubmission.correction;
    setFStatus(c?.status || 'corrected');
    setFScore(
      c?.score !== undefined
        ? String(c.score)
        : activeSubmission.studentScore !== undefined
        ? String(activeSubmission.studentScore)
        : '95'
    );
    setFRating(c?.ratingLabel || 'ممتاز');
    setFNotes(c?.notes || '');
    setFTeacherAudioB64(null);
    setFTeacherVideoUrl(c?.teacherVideoUrl || '');
    setFAllowRetry(Boolean(c?.allowRetry));
    setFSendTelegram(markingConfig.notifyStudentOnCorrection !== false);
    setSaveFeedback(null);
  }, [activeSubmission?.submissionKey]);

  // Stats summary
  const stats = useMemo(() => {
    let pending = 0;
    let corrected = 0;
    let retry = 0;
    submissions.forEach((s) => {
      const st = s.correction?.status || 'pending';
      if (st === 'corrected') corrected++;
      else if (st === 'retry') retry++;
      else pending++;
    });
    return { total: submissions.length, pending, corrected, retry };
  }, [submissions]);

  const handleTeacherLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const cleanName = loginName.trim();
    const cleanPin = loginPin.trim();
    if (!cleanName) {
      setLoginError('يرجى إدخال اسم المعلم المسجل في ورقة الرئيسية.');
      return;
    }
    if (!cleanPin) {
      setLoginError('يرجى إدخال رمز الدخول الإداري.');
      return;
    }

    setLoginBusy(true);
    window.setTimeout(() => {
      setLoginBusy(false);

      if (adminUsers && adminUsers.length > 0) {
        const matched =
          adminUsers.find((u) => {
            const nameMatches =
              u.name.toLowerCase() === cleanName.toLowerCase() ||
              u.name.replace(/\s+/g, '') === cleanName.replace(/\s+/g, '');
            return nameMatches && u.pin === cleanPin;
          }) || adminUsers.find((u) => u.pin === cleanPin);

        if (matched) {
          if (matched.blocked) {
            setLoginError('يوجد خطا في التسجيل .. يرجى التواصل مع الادارة');
            return;
          }
          try {
            sessionStorage.setItem('faseeh_admin_auth', 'true');
            sessionStorage.setItem('faseeh_admin_name', matched.name);
          } catch {}
          setTeacherName(matched.name);
          setIsTeacherAuthed(true);
          return;
        }
      }

      const isDefaultAdmin =
        (cleanName === 'عزام' && cleanPin === '2026115') || cleanPin === '2026115';
      if (isDefaultAdmin) {
        const finalName = cleanName || 'عزام';
        try {
          sessionStorage.setItem('faseeh_admin_auth', 'true');
          sessionStorage.setItem('faseeh_admin_name', finalName);
        } catch {}
        setTeacherName(finalName);
        setIsTeacherAuthed(true);
        return;
      }

      setLoginError('بيانات الدخول غير صحيح .. راجع الادارة');
    }, 250);
  };

  const handleTeacherLogout = () => {
    try {
      sessionStorage.removeItem('faseeh_admin_auth');
      sessionStorage.removeItem('faseeh_admin_name');
    } catch {}
    setIsTeacherAuthed(false);
    setLoginPin('');
  };

  const applyUpdatedCorrections = (updated: TeacherCorrectionRecord[]) => {
    if (!updated || updated.length === 0) return;
    const map = new Map<string, TeacherCorrectionRecord>();
    updated.forEach((c) => map.set(c.submissionKey, c));
    setSubmissions((prev) =>
      prev.map((sub) => {
        const match = map.get(sub.submissionKey);
        return match ? { ...sub, correction: match } : sub;
      })
    );
  };

  const handleSaveSingleCorrection = async () => {
    if (!activeSubmission || saving) return;
    setSaving(true);
    setSaveFeedback(null);
    try {
      let annotatedBase64: string | undefined;
      if (blackboardRef.current?.hasAnnotations()) {
        const exported = blackboardRef.current.exportCompositeDataUrl();
        if (exported && exported.startsWith('data:image/')) {
          annotatedBase64 = exported;
        }
      }

      const res = await saveMarkingCorrectionToSheets(webhookUrl, {
        submissionKey: activeSubmission.submissionKey,
        exerciseType: activeSubmission.exerciseType,
        studentId: activeSubmission.studentId,
        studentName: activeSubmission.studentName,
        lessonSubject: activeSubmission.lessonSubject,
        itemTitle: activeSubmission.itemTitle,
        status: fStatus,
        score: fScore.trim() !== '' ? Number(fScore) : undefined,
        ratingLabel: fRating,
        notes: fNotes.trim(),
        correctedImageUrl: !annotatedBase64
          ? activeSubmission.correction?.correctedImageUrl
          : undefined,
        correctedImageBase64: annotatedBase64,
        teacherAudioUrl: !fTeacherAudioB64
          ? activeSubmission.correction?.teacherAudioUrl
          : undefined,
        teacherAudioBase64: fTeacherAudioB64 || undefined,
        teacherVideoUrl: fTeacherVideoUrl.trim() || undefined,
        allowRetry: fAllowRetry || fStatus === 'retry',
        sendTelegram: fSendTelegram,
        teacherName,
      });

      if (res.success && res.correction) {
        applyUpdatedCorrections([res.correction]);
        setSaveFeedback({
          type: 'ok',
          text: res.telegramNotified
            ? `تم حفظ التصحيح لـ ${activeSubmission.studentName} وإرسال إشعار تيليغرام للطالب بنجاح.`
            : `تم حفظ التصحيح لـ ${activeSubmission.studentName} في الشيت بنجاح.`,
        });
      } else {
        setSaveFeedback({
          type: 'err',
          text: res.error || 'تعذر حفظ التصحيح.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopyShareUrl = () => {
    const url = buildMarkingShareUrl();
    navigator.clipboard.writeText(url);
    setCopiedPortalUrl(true);
    window.setTimeout(() => setCopiedPortalUrl(false), 2500);
  };

  // ==========================================================
  // TEACHER LOGIN GATE (Sheet "الرئيسية" D2:F31)
  // ==========================================================
  if (!isTeacherAuthed) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-cairo text-right">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-slate-200 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            {homeLogoUrl ? (
              <img
                src={getDirectImageUrl(homeLogoUrl)}
                alt={platformTitle || 'الشعار'}
                className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">
                بوابة تصحيح المعلم
              </h1>
              <p className="text-xs text-slate-500">
                {platformTitle || 'منصة التعليم'} · الدخول بصلاحية المعلم من ورقة «الرئيسية»
              </p>
            </div>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleTeacherLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span>اسم المعلم / المشرف (العمود D):</span>
              </label>
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="أدخل اسم المعلم..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>رمز الدخول السري (العمود E):</span>
              </label>
              <input
                type="password"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)}
                placeholder="أدخل رمز الدخول..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={loginBusy}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
            >
              {loginBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
              <span>دخول استوديو التصحيح</span>
            </button>
          </form>

          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>العودة إلى الصفحة الرئيسية</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        isStandalonePage ? 'min-h-screen bg-slate-50' : ''
      } font-cairo text-right text-slate-800 flex flex-col gap-4`}
    >
      {/* Standalone Top Header */}
      {isStandalonePage && (
        <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {homeLogoUrl ? (
                <img
                  src={getDirectImageUrl(homeLogoUrl)}
                  alt={platformTitle || 'الشعار'}
                  className="w-10 h-10 rounded-xl object-cover border border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-extrabold shrink-0">
                  <PenTool className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-extrabold truncate">
                  بوابة التصحيح والمتابعة المستقلة
                </h1>
                <div className="text-[11px] text-slate-400 truncate">
                  المعلم: {teacherName} · رابط مباشر مستقل
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onOpenAdminMarkingSettings && (
                <button
                  type="button"
                  onClick={onOpenAdminMarkingSettings}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">الإعدادات</span>
                </button>
              )}

              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">الصفحة العامة</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleTeacherLogout}
                className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 cursor-pointer"
                title="تسجيل خروج المعلم"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>
      )}

      <div
        className={
          isStandalonePage
            ? 'max-w-7xl w-full mx-auto px-4 sm:px-6 pb-10 space-y-4'
            : 'space-y-4'
        }
      >
        {/* Top Action & Stats Bar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-extrabold text-slate-900">
              استوديو تصحيح واجبات الطلاب
            </div>
            <div className="text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-2">
              <span>الإجمالي: {stats.total}</span>
              <span>·</span>
              <span className="text-amber-700 font-bold">بانتظار التصحيح: {stats.pending}</span>
              <span>·</span>
              <span className="text-emerald-700 font-bold">مصحّح: {stats.corrected}</span>
              <span>·</span>
              <span className="text-rose-700 font-bold">مطلوب إعادة: {stats.retry}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBatchModalState({ open: true, mode: 'queue' })}
              disabled={filteredSubmissions.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>نافذة التصحيح الجماعي (طابور + إرسال جماعي)</span>
            </button>

            <button
              type="button"
              onClick={() => setBatchModalState({ open: true, mode: 'bulk' })}
              disabled={filteredSubmissions.length === 0}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Users className="w-4 h-4 text-emerald-400" />
              <span>تصحيح جماعي متعدد</span>
            </button>

            <button
              type="button"
              onClick={handleCopyShareUrl}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              title="نسخ الرابط المستقل لبوابة المعلم"
            >
              {copiedPortalUrl ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedPortalUrl ? 'تم النسخ' : 'نسخ رابط الصفحة'}</span>
            </button>

            <button
              type="button"
              onClick={loadWorkspaceData}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم الطالب أو رقمه..."
              className="w-full pr-8 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <select
            value={filterProgramId}
            onChange={(e) => setFilterProgramId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
          >
            <option value="all">كل البرامج</option>
            {(normalizedSchedule.programs || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={filterClassroomId}
            onChange={(e) => setFilterClassroomId(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
          >
            <option value="all">كل الفصول</option>
            {availableClassrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={filterLesson}
            onChange={(e) => setFilterLesson(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
          >
            <option value="all">كل الدروس والموضوعات</option>
            {lessonOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | MarkingExerciseType)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
          >
            {(Object.keys(EXERCISE_TYPE_LABELS) as Array<'all' | MarkingExerciseType>).map(
              (k) => (
                <option key={k} value={k}>
                  {EXERCISE_TYPE_LABELS[k]}
                </option>
              )
            )}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | MarkingStatus)}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
          >
            {(Object.keys(STATUS_FILTER_LABELS) as Array<'all' | MarkingStatus>).map((k) => (
              <option key={k} value={k}>
                {STATUS_FILTER_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Main Split Studio */}
        {loading && submissions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
            <span className="text-xs font-bold">جاري تحميل تسليمات الطلاب من Google Sheets...</span>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-sm font-extrabold text-slate-800">
              لا توجد تسليمات مطابقة للفلاتر الحالية
            </div>
            <p className="text-xs text-slate-500">
              جرّب تغيير الفلتر أو اضغط «تحديث» لجلب أحدث إجابات الكتابة والنطق والإملاء والفيديو.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Submissions Queue List (Right Column in RTL) */}
            <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden lg:sticky lg:top-20">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-extrabold text-slate-800">
                <span>قائمة التسليمات ({filteredSubmissions.length})</span>
                <span className="text-[11px] font-semibold text-slate-500">اختر واجباً للتصحيح</span>
              </div>
              <div className="max-h-[68vh] overflow-y-auto divide-y divide-slate-100">
                {filteredSubmissions.map((sub) => {
                  const isActive = activeSubmission?.submissionKey === sub.submissionKey;
                  const st = sub.correction?.status || 'pending';
                  return (
                    <button
                      key={sub.submissionKey}
                      type="button"
                      onClick={() => setSelectedKey(sub.submissionKey)}
                      className={`w-full text-right px-4 py-3 transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                        isActive ? 'bg-emerald-50 border-r-4 border-emerald-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {sub.studentName || sub.studentId}
                          {sub.studentId ? ` · #${sub.studentId}` : ''}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-600 truncate flex items-center gap-1.5">
                          {sub.exerciseType === 'writing' && <PenTool className="w-3 h-3 text-amber-600 shrink-0" />}
                          {sub.exerciseType === 'pronunciation' && <Mic className="w-3 h-3 text-emerald-600 shrink-0" />}
                          {sub.exerciseType === 'video' && <Video className="w-3 h-3 text-indigo-600 shrink-0" />}
                          {sub.exerciseType === 'dictation' && <FileText className="w-3 h-3 text-teal-600 shrink-0" />}
                          <span className="truncate">
                            {EXERCISE_TYPE_LABELS[sub.exerciseType]} · {sub.lessonSubject} · {sub.itemTitle}
                          </span>
                        </div>
                        {(sub.programName || sub.classroomName) && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {[sub.programName, sub.classroomName].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-left space-y-0.5">
                        <div
                          className={`text-[11px] font-extrabold ${
                            st === 'corrected'
                              ? 'text-emerald-700'
                              : st === 'retry'
                              ? 'text-amber-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {st === 'corrected'
                            ? 'مصحّح ✓'
                            : st === 'retry'
                            ? 'إعادة'
                            : 'جديد'}
                        </div>
                        {sub.studentScore !== undefined && (
                          <div className="text-[10px] font-mono font-bold text-slate-500 tabular-nums">
                            {sub.studentScore}%
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Active Correction Studio (Left Column in RTL) */}
            {activeSubmission && (
              <section className="lg:col-span-8 space-y-4">
                {/* Student & Reference Summary Card */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm sm:text-base font-extrabold text-slate-900">
                      {activeSubmission.studentName}
                      {activeSubmission.studentId ? ` (#${activeSubmission.studentId})` : ''}
                    </div>
                    <div className="text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-2">
                      <span>{EXERCISE_TYPE_LABELS[activeSubmission.exerciseType]}</span>
                      <span>·</span>
                      <span>{activeSubmission.lessonSubject}</span>
                      <span>·</span>
                      <span className="text-slate-800 font-bold">{activeSubmission.itemTitle}</span>
                      {activeSubmission.timestamp && (
                        <>
                          <span>·</span>
                          <span className="font-mono">{activeSubmission.timestamp}</span>
                        </>
                      )}
                    </div>
                    {activeSubmission.studentDetails && (
                      <div className="text-xs text-slate-600 pt-0.5">
                        {activeSubmission.studentDetails}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeSubmission.studentImageUrl && (
                      <a
                        href={activeSubmission.studentImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <span>صورة الطالب</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {activeSubmission.referenceImageUrl && (
                      <a
                        href={getDirectImageUrl(activeSubmission.referenceImageUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <span>النموذج الأصلي</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Interactive Correction Blackboard */}
                <MarkingBlackboard
                  ref={blackboardRef}
                  studentImageUrl={activeSubmission.studentImageUrl}
                  referenceImageUrl={activeSubmission.referenceImageUrl}
                  lessonTitle={`${activeSubmission.lessonSubject} — ${activeSubmission.itemTitle}`}
                />

                {/* Dual Audio Studio (Student Audio + Reference + Teacher Voice Recorder) */}
                <MarkingAudioStudio
                  studentAudioUrl={activeSubmission.studentAudioUrl}
                  studentName={activeSubmission.studentName}
                  referenceAudioUrl={activeSubmission.referenceAudioUrl}
                  referenceAutoReadText={
                    activeSubmission.referenceAutoReadText || activeSubmission.itemTitle
                  }
                  existingTeacherAudioUrl={activeSubmission.correction?.teacherAudioUrl}
                  onTeacherAudioRecorded={setFTeacherAudioB64}
                />

                {/* Screen / Blackboard + Mic + Webcam Video Recorder -> Cloudinary MP4 */}
                <MarkingVideoRecorder
                  blackboardRef={blackboardRef}
                  markingConfig={markingConfig}
                  webhookUrl={webhookUrl}
                  existingVideoUrl={fTeacherVideoUrl}
                  onVideoUploaded={setFTeacherVideoUrl}
                />

                {/* Rubric, Notes, Retry Unlock & Telegram Send */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        حالة التصحيح:
                      </label>
                      <select
                        value={fStatus}
                        onChange={(e) => setFStatus(e.target.value as MarkingStatus)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                      >
                        <option value="corrected">مصحّح ومعتمد</option>
                        <option value="retry">مطلوب إعادة المحاولة</option>
                        <option value="pending">قيد الانتظار</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        الدرجة النهائية (من 100):
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={fScore}
                        onChange={(e) => setFScore(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        التقدير:
                      </label>
                      <select
                        value={fRating}
                        onChange={(e) => setFRating(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                      >
                        {RATING_LABELS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-bold text-slate-700">ملاحظة المعلم للطالب:</label>
                      <div className="flex flex-wrap items-center gap-1">
                        {QUICK_FEEDBACK_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setFNotes((prev) => (prev ? `${prev}\n${preset}` : preset))
                            }
                            className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-[10px] font-bold text-slate-700 cursor-pointer"
                          >
                            + {preset.slice(0, 24)}...
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      rows={3}
                      value={fNotes}
                      onChange={(e) => setFNotes(e.target.value)}
                      placeholder="اكتب ملاحظتك التفصيلية للطالب..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
                    />
                  </div>

                  {activeSubmission.correction?.correctedImageUrl && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">صورة تصحيح محفوظة سابقاً:</span>
                      <a
                        href={activeSubmission.correction.correctedImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 font-extrabold underline inline-flex items-center gap-1"
                      >
                        <span>عرض الصورة المصحّحة</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fAllowRetry}
                          onChange={(e) => setFAllowRetry(e.target.checked)}
                          className="accent-amber-600"
                        />
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>فتح محاولة جديدة للطالب</span>
                      </label>

                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fSendTelegram}
                          onChange={(e) => setFSendTelegram(e.target.checked)}
                          className="accent-sky-600"
                        />
                        <Send className="w-3.5 h-3.5 text-sky-600" />
                        <span>إشعار الطالب عبر تيليغرام</span>
                      </label>
                    </div>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleSaveSingleCorrection}
                      className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>حفظ التصحيح وإرسال تيليغرام</span>
                    </button>
                  </div>

                  {saveFeedback && (
                    <div
                      className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        saveFeedback.type === 'ok'
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-rose-50 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {saveFeedback.type === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>{saveFeedback.text}</span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Dedicated Batch Correction Window */}
      <BatchCorrectionModal
        isOpen={batchModalState.open}
        onClose={() => setBatchModalState((p) => ({ ...p, open: false }))}
        submissions={filteredSubmissions}
        markingConfig={markingConfig}
        webhookUrl={webhookUrl}
        teacherName={teacherName}
        initialMode={batchModalState.mode}
        onCorrectionsUpdated={applyUpdatedCorrections}
      />
    </div>
  );
};
