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
  RotateCcw,
  Sparkles,
  ExternalLink,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  Image as ImageIcon,
  Plus,
  Trash2,
  Square,
  Sticker,
} from 'lucide-react';
import {
  AdminUserRecord,
  MarkingConfig,
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
  DEFAULT_MARKING_PRESETS,
  DEFAULT_MARKING_STICKERS,
  fetchMarkingWorkspaceData,
  getLocalMarkingConfig,
  saveMarkingCorrectionToSheets,
} from '../../utils/markingSheets';
import { getDirectImageUrl } from '../../utils/mediaUrl';
import { MarkingBlackboard, MarkingBlackboardHandle } from './MarkingBlackboard';
import { MarkingAudioStudio } from './MarkingAudioStudio';
import { MarkingVideoRecorder } from './MarkingVideoRecorder';
import { BatchCorrectionModal } from './BatchCorrectionModal';
import { StudentAchievementModal } from './StudentAchievementModal';

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

const STATUS_FILTER_LABELS: Record<'all' | MarkingStatus, string> = {
  all: 'الكل',
  pending: 'بانتظار التصحيح',
  corrected: 'مصحّح',
  retry: 'مطلوب إعادة',
};

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

  // Interactive Video Focused Filters (No Programs / Classrooms bars)
  const [filterLesson, setFilterLesson] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | MarkingStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Floating Collapsible Submissions Dropdown
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);

  // Active Submission & Studio State
  const [selectedKey, setSelectedKey] = useState<string>('');
  const blackboardRef = useRef<MarkingBlackboardHandle | null>(null);
  const [forceShowBlackboard, setForceShowBlackboard] = useState<boolean>(false);

  const [fStatus, setFStatus] = useState<MarkingStatus>('corrected');
  const [fScore, setFScore] = useState<string>('95');
  const [fRating, setFRating] = useState<string>('ممتاز');
  const [fNotes, setFNotes] = useState<string>('');
  const [fStickerSymbol, setFStickerSymbol] = useState<string>('');
  const [fStickerLabel, setFStickerLabel] = useState<string>('');

  // Multi-media studio states
  const [fTeacherAudioB64, setFTeacherAudioB64] = useState<string | null>(null);
  const [fExtraAudioClips, setFExtraAudioClips] = useState<Array<{ id: string; blobUrl: string; base64: string }>>([]);
  const [extraAudRecording, setExtraAudRecording] = useState(false);
  const extraAudRecorderRef = useRef<MediaRecorder | null>(null);
  const extraAudChunksRef = useRef<Blob[]>([]);

  const [fExtraImagesB64, setFExtraImagesB64] = useState<string[]>([]);
  const [fTeacherVideoUrl, setFTeacherVideoUrl] = useState<string>('');
  const [fExtraVideoUrls, setFExtraVideoUrls] = useState<string[]>([]);

  const [fAllowRetry, setFAllowRetry] = useState<boolean>(false);
  const [fSendTelegram, setFSendTelegram] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modals & Share Link
  const [batchModalState, setBatchModalState] = useState<{
    open: boolean;
    mode: 'queue' | 'bulk';
  }>({ open: false, mode: 'bulk' });
  const [achievementModalOpen, setAchievementModalOpen] = useState(false);
  const [copiedPortalUrl, setCopiedPortalUrl] = useState(false);

  const normalizedSchedule = useMemo(
    () => normalizeCourseScheduleData(courseSchedule),
    [courseSchedule]
  );

  // Close floating dropdown on outside click or Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

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
        const videoOnly = res.submissions.filter((s) => s.exerciseType === 'video');
        const effectiveList = videoOnly.length > 0 ? videoOnly : res.submissions;
        setSubmissions(effectiveList);
        if (initialSubmissionKey) {
          const match = res.submissions.find((s) => s.submissionKey === initialSubmissionKey);
          if (match) setSelectedKey(match.submissionKey);
        } else if (effectiveList.length > 0) {
          setSelectedKey((prev) =>
            prev && effectiveList.some((s) => s.submissionKey === prev)
              ? prev
              : effectiveList[0].submissionKey
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

  // Unique Interactive Video lessons
  const lessonOptions = useMemo(() => {
    const set = new Set<string>();
    submissions.forEach((s) => {
      if (s.itemTitle) set.add(s.itemTitle);
    });
    return Array.from(set);
  }, [submissions]);

  // Filtered submissions list
  const filteredSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return submissions.filter((s) => {
      if (filterLesson !== 'all' && s.itemTitle !== filterLesson) return false;
      const effectiveStatus: MarkingStatus = s.correction?.status || 'pending';
      if (filterStatus !== 'all' && effectiveStatus !== filterStatus) return false;
      if (q) {
        const hay = `${s.studentName} ${s.studentId} ${s.lessonSubject} ${s.itemTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, filterLesson, filterStatus, searchQuery]);

  const activeIndex = useMemo(() => {
    if (filteredSubmissions.length === 0) return -1;
    const idx = filteredSubmissions.findIndex((s) => s.submissionKey === selectedKey);
    return idx >= 0 ? idx : 0;
  }, [filteredSubmissions, selectedKey]);

  const activeSubmission = activeIndex >= 0 ? filteredSubmissions[activeIndex] : null;

  const hasStudentImage = Boolean(activeSubmission?.studentImageUrl?.trim());
  const shouldShowBlackboard = hasStudentImage || forceShowBlackboard;

  const presetTexts = useMemo(
    () =>
      markingConfig.presetTexts && markingConfig.presetTexts.length > 0
        ? markingConfig.presetTexts
        : DEFAULT_MARKING_PRESETS,
    [markingConfig.presetTexts]
  );

  const stickersList = useMemo(
    () =>
      markingConfig.stickers && markingConfig.stickers.length > 0
        ? markingConfig.stickers
        : DEFAULT_MARKING_STICKERS,
    [markingConfig.stickers]
  );

  // Sync studio inputs whenever active submission changes
  useEffect(() => {
    if (!activeSubmission) return;
    const c = activeSubmission.correction;
    setForceShowBlackboard(false);
    setFStatus(c?.status || 'corrected');
    setFScore(
      c?.score !== undefined
        ? String(c.score)
        : activeSubmission.videoScore !== undefined
        ? String(activeSubmission.videoScore)
        : activeSubmission.studentScore !== undefined
        ? String(activeSubmission.studentScore)
        : '95'
    );
    setFRating(c?.ratingLabel || 'ممتاز');
    setFNotes(c?.notes || '');
    setFStickerSymbol(c?.stickerSymbol || '');
    setFStickerLabel(c?.stickerLabel || '');
    setFTeacherAudioB64(null);
    setFExtraAudioClips([]);
    setFExtraImagesB64([]);
    setFTeacherVideoUrl(c?.teacherVideoUrl || '');
    setFExtraVideoUrls(
      Array.isArray(c?.teacherVideos)
        ? c.teacherVideos.filter((v) => v && v !== c.teacherVideoUrl)
        : []
    );
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

  const handleAddExtraImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setFExtraImagesB64((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const startExtraAudioRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      extraAudChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) extraAudChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(extraAudChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setFExtraAudioClips((prev) => [
              ...prev,
              { id: `aud-${Date.now()}`, blobUrl, base64: reader.result as string },
            ]);
          }
        };
        reader.readAsDataURL(blob);
      };
      extraAudRecorderRef.current = mr;
      mr.start();
      setExtraAudRecording(true);
    } catch {
      setSaveFeedback({ type: 'err', text: 'تعذر الوصول للميكروفون لإضافة مقطع صوتي إضافي.' });
    }
  };

  const stopExtraAudioRecord = () => {
    if (extraAudRecorderRef.current && extraAudRecorderRef.current.state !== 'inactive') {
      extraAudRecorderRef.current.stop();
    }
    setExtraAudRecording(false);
  };

  const handleSaveSingleCorrection = async () => {
    if (!activeSubmission || saving) return;
    setSaving(true);
    setSaveFeedback(null);
    try {
      let annotatedBase64: string | undefined;
      if (shouldShowBlackboard && blackboardRef.current?.hasAnnotations()) {
        const exported = blackboardRef.current.exportCompositeDataUrl();
        if (exported && exported.startsWith('data:image/')) {
          annotatedBase64 = exported;
        }
      }

      const allVideos = [fTeacherVideoUrl.trim(), ...fExtraVideoUrls.map((v) => v.trim())].filter(
        Boolean
      );
      const uniqueVideos = Array.from(new Set(allVideos));

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
        additionalImages: activeSubmission.correction?.additionalImages,
        additionalImagesBase64: fExtraImagesB64.length > 0 ? fExtraImagesB64 : undefined,
        teacherAudioUrl: !fTeacherAudioB64
          ? activeSubmission.correction?.teacherAudioUrl
          : undefined,
        teacherAudioBase64: fTeacherAudioB64 || undefined,
        teacherAudios: activeSubmission.correction?.teacherAudios,
        teacherAudiosBase64:
          fExtraAudioClips.length > 0 ? fExtraAudioClips.map((c) => c.base64) : undefined,
        teacherVideoUrl: uniqueVideos[0] || undefined,
        teacherVideos: uniqueVideos.length > 0 ? uniqueVideos : undefined,
        stickerSymbol: fStickerSymbol || undefined,
        stickerLabel: fStickerLabel || undefined,
        allowRetry: fAllowRetry || fStatus === 'retry',
        sendTelegram: fSendTelegram,
        teacherName,
      });

      if (res.success && res.correction) {
        applyUpdatedCorrections([res.correction]);
        setFExtraAudioClips([]);
        setFExtraImagesB64([]);
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
              <h1 className="text-lg font-extrabold text-slate-900">بوابة تصحيح المعلم</h1>
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
                  بوابة تصحيح واجبات الفيديو التفاعلي
                </h1>
                <div className="text-[11px] text-slate-400 truncate">
                  المعلم: {teacherName} · استوديو السبورة والصوت وكاميرا OBS
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onOpenAdminMarkingSettings && (
                <button
                  type="button"
                  onClick={onOpenAdminMarkingSettings}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">الإعدادات</span>
                </button>
              )}

              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
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
              استوديو تصحيح الفيديو التفاعلي (الصورة والصوت)
            </div>
            <div className="text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-2">
              <span>إجمالي التسليمات: {stats.total}</span>
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
              onClick={() => setBatchModalState({ open: true, mode: 'bulk' })}
              disabled={submissions.length === 0}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Users className="w-4 h-4" />
              <span>التصحيح الجماعي للدرس</span>
            </button>

            <button
              type="button"
              onClick={() => setBatchModalState({ open: true, mode: 'queue' })}
              disabled={filteredSubmissions.length === 0}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>طابور التصحيح السريع</span>
            </button>

            <button
              type="button"
              onClick={handleCopyShareUrl}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
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
              className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Clean Filters + Floating Submissions Dropdown Bar */}
        <div
          ref={dropdownContainerRef}
          className="relative bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
            {/* Floating Collapsible Queue Trigger */}
            <div className="lg:col-span-5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className={`flex-1 min-w-0 px-3.5 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                  dropdownOpen
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                }`}
              >
                <span className="truncate flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    {activeSubmission
                      ? `${activeSubmission.studentName} · ${activeSubmission.itemTitle}`
                      : `قائمة واجبات الطلاب (${filteredSubmissions.length})`}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-white/15 font-mono text-[10px] tabular-nums">
                    {filteredSubmissions.length}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>

              <button
                type="button"
                disabled={activeIndex <= 0}
                onClick={() => {
                  if (activeIndex > 0) {
                    setSelectedKey(filteredSubmissions[activeIndex - 1].submissionKey);
                    setDropdownOpen(false);
                  }
                }}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer shrink-0"
                title="الطالب السابق"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={activeIndex < 0 || activeIndex >= filteredSubmissions.length - 1}
                onClick={() => {
                  if (activeIndex >= 0 && activeIndex + 1 < filteredSubmissions.length) {
                    setSelectedKey(filteredSubmissions[activeIndex + 1].submissionKey);
                    setDropdownOpen(false);
                  }
                }}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 cursor-pointer shrink-0"
                title="الطالب التالي"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="lg:col-span-3 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث باسم الطالب أو رقمه..."
                className="w-full pr-8 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Interactive Video Lesson Filter */}
            <div className="lg:col-span-2">
              <select
                value={filterLesson}
                onChange={(e) => setFilterLesson(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
              >
                <option value="all">كل دروس الفيديو</option>
                {lessonOptions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="lg:col-span-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | MarkingStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
              >
                {(Object.keys(STATUS_FILTER_LABELS) as Array<'all' | MarkingStatus>).map((k) => (
                  <option key={k} value={k}>
                    {STATUS_FILTER_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Floating Overlay Submissions Menu (Auto-closes on student selection) */}
          {dropdownOpen && (
            <div className="absolute right-0 left-0 sm:left-auto sm:w-[480px] top-full mt-2 z-40 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-extrabold text-slate-800">
                <span>اختر واجب الطالب للتصحيح ({filteredSubmissions.length})</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  تُغلق القائمة تلقائياً بعد الاختيار
                </span>
              </div>

              {filteredSubmissions.length === 0 ? (
                <div className="p-6 text-center text-xs font-bold text-slate-500">
                  لا توجد تسليمات مطابقة للفلاتر الحالية.
                </div>
              ) : (
                <div className="max-h-[62vh] overflow-y-auto divide-y divide-slate-100">
                  {filteredSubmissions.map((sub) => {
                    const isActive = activeSubmission?.submissionKey === sub.submissionKey;
                    const st = sub.correction?.status || 'pending';
                    return (
                      <button
                        key={sub.submissionKey}
                        type="button"
                        onClick={() => {
                          setSelectedKey(sub.submissionKey);
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-right px-4 py-3 transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                          isActive ? 'bg-emerald-50 border-r-4 border-emerald-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="text-xs font-extrabold text-slate-900 truncate">
                            {sub.studentName || sub.studentId}
                            {sub.studentId ? ` · #${sub.studentId}` : ''}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-600 truncate">
                            {sub.itemTitle}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold">
                            {sub.studentImageUrl && (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <ImageIcon className="w-3 h-3" />
                                <span>صورة</span>
                              </span>
                            )}
                            {sub.studentAudioUrl && (
                              <span className="inline-flex items-center gap-1 text-indigo-700">
                                <Mic className="w-3 h-3" />
                                <span>صوت</span>
                              </span>
                            )}
                            {!sub.studentImageUrl && sub.studentAudioUrl && (
                              <span className="text-slate-400">· صوتي فقط</span>
                            )}
                          </div>
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
                          {sub.videoScore !== undefined && (
                            <div className="text-[10px] font-mono font-bold text-slate-500 tabular-nums">
                              الاختبار: {sub.videoScore}%
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Full-Width Single Workspace */}
        {loading && submissions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 flex flex-col items-center justify-center gap-2 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
            <span className="text-xs font-bold">جاري تحميل تسليمات الفيديو التفاعلي من Google Sheets...</span>
          </div>
        ) : !activeSubmission ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="text-sm font-extrabold text-slate-800">
              لا توجد تسليمات مطابقة للفلاتر الحالية
            </div>
            <p className="text-xs text-slate-500">
              جرّب تغيير الفلتر أو اضغط «تحديث» لجلب أحدث واجبات الفيديو التفاعلي (الصورة والصوت).
            </p>
          </div>
        ) : (
          <section className="space-y-4">
            {/* Active Student Summary Header */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm sm:text-base font-extrabold text-slate-900">
                    {activeSubmission.studentName}
                  </span>
                  {activeSubmission.studentId && (
                    <span className="text-xs font-mono font-bold text-slate-500">
                      #{activeSubmission.studentId}
                    </span>
                  )}
                  <span
                    className={`text-xs font-extrabold ${
                      activeSubmission.correction?.status === 'corrected'
                        ? 'text-emerald-700'
                        : activeSubmission.correction?.status === 'retry'
                        ? 'text-amber-700'
                        : 'text-slate-400'
                    }`}
                  >
                    ·{' '}
                    {activeSubmission.correction?.status === 'corrected'
                      ? 'مصحّح ✓'
                      : activeSubmission.correction?.status === 'retry'
                      ? 'مطلوب إعادة'
                      : 'بانتظار التصحيح'}
                  </span>
                </div>

                <div className="text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-2">
                  <span className="text-slate-900 font-bold">{activeSubmission.itemTitle}</span>
                  {activeSubmission.videoScore !== undefined && (
                    <>
                      <span>·</span>
                      <span className="text-indigo-700 font-extrabold tabular-nums">
                        نتيجة أسئلة الفيديو: {activeSubmission.videoScore}%
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span>
                    {activeSubmission.studentImageUrl && activeSubmission.studentAudioUrl
                      ? 'واجب صورة + صوت'
                      : activeSubmission.studentImageUrl
                      ? 'واجب صورة'
                      : activeSubmission.studentAudioUrl
                      ? 'واجب صوتي فقط'
                      : 'مشاركة درس'}
                  </span>
                  {activeSubmission.timestamp && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{activeSubmission.timestamp}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAchievementModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>تقرير إنجاز الطالب</span>
                </button>

                {activeSubmission.studentImageUrl && (
                  <a
                    href={activeSubmission.studentImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
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
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <span>النموذج الأصلي</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Smart Blackboard: Full-width & LARGE when image exists; automatically hidden on audio-only */}
            {shouldShowBlackboard ? (
              <div className="space-y-2">
                {!hasStudentImage && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setForceShowBlackboard(false)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      إخفاء السبورة والتركيز على أدوات الصوت
                    </button>
                  </div>
                )}
                <MarkingBlackboard
                  ref={blackboardRef}
                  studentImageUrl={activeSubmission.studentImageUrl}
                  referenceImageUrl={activeSubmission.referenceImageUrl}
                  lessonTitle={activeSubmission.itemTitle}
                  stickers={stickersList}
                />
              </div>
            ) : (
              <div className="px-4 py-3 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>هذا التسليم واجب صوتي فقط (بدون صورة مرفقة) — تم إخفاء السبورة تلقائياً للتركيز على التصحيح الصوتي.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForceShowBlackboard(true)}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-900 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  إظهار السبورة للرسم الاختياري
                </button>
              </div>
            )}

            {/* Audio Correction Studio */}
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

            {/* Optional Extra Media Strip (Multiple Images & Extra Voice Clips) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-slate-900">
                  مرفقات إضافية اختيارية للطالب (صور توضيحية أو تسجيلات صوتية إضافية)
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>+ إرفاق صور ({fExtraImagesB64.length})</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleAddExtraImages(e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {!extraAudRecording ? (
                    <button
                      type="button"
                      onClick={startExtraAudioRecord}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 text-rose-600" />
                      <span>+ تسجيل صوت إضافي ({fExtraAudioClips.length})</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopExtraAudioRecord}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Square className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
                      <span>إيقاف وحفظ المقطع الإضافي</span>
                    </button>
                  )}
                </div>
              </div>

              {fExtraImagesB64.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fExtraImagesB64.map((src, idx) => (
                    <div
                      key={idx}
                      className="relative w-20 h-20 rounded-xl border border-slate-200 overflow-hidden bg-slate-50"
                    >
                      <img src={src} alt={`صورة ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setFExtraImagesB64((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute top-1 left-1 p-1 rounded-lg bg-rose-600 text-white cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {fExtraAudioClips.length > 0 && (
                <div className="space-y-1.5">
                  {fExtraAudioClips.map((clip, idx) => (
                    <div
                      key={clip.id}
                      className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200"
                    >
                      <span className="text-[11px] font-bold text-slate-600 shrink-0">
                        صوت إضافي {idx + 1}:
                      </span>
                      <audio controls src={clip.blobUrl} className="flex-1 h-8" />
                      <button
                        type="button"
                        onClick={() =>
                          setFExtraAudioClips((prev) => prev.filter((c) => c.id !== clip.id))
                        }
                        className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Direct OBS / Device Camera Recorder -> Cloudinary MP4 */}
            <div className="space-y-2">
              <MarkingVideoRecorder
                markingConfig={markingConfig}
                webhookUrl={webhookUrl}
                existingVideoUrl={fTeacherVideoUrl}
                onVideoUploaded={(url) => {
                  if (!fTeacherVideoUrl) {
                    setFTeacherVideoUrl(url);
                  } else if (url && url !== fTeacherVideoUrl) {
                    setFExtraVideoUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
                  }
                }}
              />

              {fExtraVideoUrls.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                  <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-indigo-600" />
                    <span>فيديوهات إضافية مرفقة ({fExtraVideoUrls.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {fExtraVideoUrls.map((vUrl, idx) => (
                      <div
                        key={`${vUrl}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                      >
                        <a
                          href={vUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-indigo-700 underline truncate"
                        >
                          {vUrl}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setFExtraVideoUrls((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Evaluation Rubric, Big Stickers, Custom Preset Texts & Telegram Send */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">التقدير:</label>
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

              {/* Big Sticker / Badge Selector for Student Card (especially great for Audio-only!) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Sticker className="w-4 h-4 text-amber-600" />
                    <span>ملصق تشجيعي أو علامة تنبيه تظهر للطالب مع النتيجة:</span>
                  </div>
                  {fStickerSymbol && (
                    <button
                      type="button"
                      onClick={() => {
                        setFStickerSymbol('');
                        setFStickerLabel('');
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                    >
                      إزالة الملصق
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {stickersList.map((st) => {
                    const isSelected = fStickerSymbol === st.symbol;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setFStickerSymbol('');
                            setFStickerLabel('');
                          } else {
                            setFStickerSymbol(st.symbol);
                            setFStickerLabel(st.label);
                          }
                        }}
                        className={`px-3 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-800 border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        <span className="text-lg leading-none">{st.symbol}</span>
                        <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>

                {fStickerSymbol && (
                  <div className="p-3 rounded-xl bg-white border border-amber-200 flex items-center gap-3">
                    <span className="text-3xl leading-none">{fStickerSymbol}</span>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">
                        الملصق المختار: {fStickerLabel}
                      </div>
                      <div className="text-[11px] text-slate-500 font-semibold">
                        سيظهر بحجم واضح للطالب داخل بطاقة النتيجة وإشعار تيليغرام.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Custom Preset Texts & Notes */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">
                  النصوص الجاهزة من الإعدادات (اضغط لإضافة العبارة):
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {presetTexts.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setFNotes((prev) => (prev ? `${prev}\n${preset.text}` : preset.text))
                      }
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 border border-slate-200 text-[11px] font-bold text-slate-800 cursor-pointer"
                    >
                      + {preset.text}
                    </button>
                  ))}
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
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
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

      {/* Student Achievement Report Modal */}
      {activeSubmission && (
        <StudentAchievementModal
          isOpen={achievementModalOpen}
          onClose={() => setAchievementModalOpen(false)}
          webhookUrl={webhookUrl}
          studentId={activeSubmission.studentId}
          studentName={activeSubmission.studentName}
          activeVideoAnswers={activeSubmission.answeredQuestions}
          activeVideoLessonTitle={activeSubmission.itemTitle}
        />
      )}

      {/* Dedicated Batch Correction Window */}
      <BatchCorrectionModal
        isOpen={batchModalState.open}
        onClose={() => setBatchModalState((p) => ({ ...p, open: false }))}
        submissions={submissions}
        markingConfig={markingConfig}
        webhookUrl={webhookUrl}
        teacherName={teacherName}
        initialMode={batchModalState.mode}
        onCorrectionsUpdated={applyUpdatedCorrections}
      />
    </div>
  );
};
