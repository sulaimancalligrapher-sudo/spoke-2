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
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  Image as ImageIcon,
  Plus,
  Trash2,
  Square,
  Sticker,
  ClipboardList,
  Eye,
  EyeOff,
  Camera,
  Upload,
  X,
  MessageSquare,
  ExternalLink,
  Link2,
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
import {
  applyWatermarkToImageDataUrl,
  combineImagesToSingleBase64,
} from '../../utils/markingCanvasUtils';
import { dedupeMediaUrls, getAlternativeAudioUrls, getDirectImageUrl } from '../../utils/mediaUrl';
import { MarkingBlackboard, MarkingBlackboardHandle } from './MarkingBlackboard';
import { MarkingAudioStudio } from './MarkingAudioStudio';
import { MarkingPhotoCapture } from './MarkingPhotoCapture';
import { MarkingVideoRecorder, MarkingVideoRecorderHandle } from './MarkingVideoRecorder';
import { CorrectionVideoPlayer } from './CorrectionVideoPlayer';
import { BatchCorrectionModal } from './BatchCorrectionModal';
import { StudentAchievementModal } from './StudentAchievementModal';
import { AudioRecorderModal } from './AudioRecorderModal';
import { StarRatingInput, parseStarCount, formatStarValue } from './StarRatingInput';

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

  // Collapsible Top Cards State
  const [adminCardOpen, setAdminCardOpen] = useState<boolean>(false);
  const [submissionsCardOpen, setSubmissionsCardOpen] = useState<boolean>(false);
  const [hideCorrected, setHideCorrected] = useState<boolean>(true);
  const [videoModalTrigger, setVideoModalTrigger] = useState<number>(0);
  const [photoModalTrigger, setPhotoModalTrigger] = useState<number>(0);
  const [audioRecorderOpen, setAudioRecorderOpen] = useState<boolean>(false);

  // Audio card expandable drawers
  const [audioExplainOpen, setAudioExplainOpen] = useState<boolean>(false);
  const [audioNotesOpen, setAudioNotesOpen] = useState<boolean>(false);
  const [audioStickersOpen, setAudioStickersOpen] = useState<boolean>(false);

  // Filters + Floating Dropdown
  const [filterLesson, setFilterLesson] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | MarkingStatus>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownContainerRef = useRef<HTMLDivElement | null>(null);
  const extraImageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const audioUploadInputRef = useRef<HTMLInputElement | null>(null);

  // Blank Blackboard on launch (empty until teacher explicitly selects or uses initialSubmissionKey)
  const [selectedKey, setSelectedKey] = useState<string>('');
  const blackboardRef = useRef<MarkingBlackboardHandle | null>(null);
  const videoRecorderRef = useRef<MarkingVideoRecorderHandle | null>(null);
  const [forceShowBlackboard, setForceShowBlackboard] = useState<boolean>(false);
  const [boardOverrideImageUrl, setBoardOverrideImageUrl] = useState<string>('');

  // Independent Image Correction State
  const [fImgStatus, setFImgStatus] = useState<MarkingStatus>('corrected');
  const [fImgScore, setFImgScore] = useState<string>('0');
  const [fImgRating, setFImgRating] = useState<string>('');
  const [fImgNotes, setFImgNotes] = useState<string>('');
  const [fImgSaving, setFImgSaving] = useState(false);
  const [fImgFeedback, setFImgFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Independent Audio Correction State
  const [fAudioStatus, setFAudioStatus] = useState<MarkingStatus>('corrected');
  const [fAudioScore, setFAudioScore] = useState<string>('0');
  const [fAudioRating, setFAudioRating] = useState<string>('');
  const [fAudioNotes, setFAudioNotes] = useState<string>('');
  const [fAudioStickerSymbol, setFAudioStickerSymbol] = useState<string>('');
  const [fAudioStickerLabel, setFAudioStickerLabel] = useState<string>('');
  const [fAudioSaving, setFAudioSaving] = useState(false);
  const [fAudioFeedback, setFAudioFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Multi-media attachments
  const [fExtraAudioClips, setFExtraAudioClips] = useState<
    Array<{ id: string; blobUrl: string; base64: string; name?: string }>
  >([]);

  const [fExtraImagesB64, setFExtraImagesB64] = useState<string[]>([]);
  const [fSavedAddImages, setFSavedAddImages] = useState<string[]>([]);
  const [fSavedImageLinks, setFSavedImageLinks] = useState<string[]>([]);
  const [fSavedTeacherAudios, setFSavedTeacherAudios] = useState<string[]>([]);
  const [fSavedAudioLinks, setFSavedAudioLinks] = useState<string[]>([]);
  const [stitchExtraImages, setStitchExtraImages] = useState<boolean>(false);
  const [fTeacherVideoUrl, setFTeacherVideoUrl] = useState<string>('');
  const [fExtraVideoUrls, setFExtraVideoUrls] = useState<string[]>([]);

  const [fAllowRetry, setFAllowRetry] = useState<boolean>(false);
  const [fSendTelegram, setFSendTelegram] = useState<boolean>(true);

  // Modals & Share Link
  const [batchModalState, setBatchModalState] = useState<{
    open: boolean;
    mode: 'bulk' | 'sheet';
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
        (u.name.toLowerCase() === teacherName.toLowerCase() || teacherName.includes(u.name)) &&
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
        setSubmissions(videoOnly);
        if (initialSubmissionKey) {
          const match = videoOnly.find((s) => s.submissionKey === initialSubmissionKey);
          if (match) setSelectedKey(match.submissionKey);
        } else {
          // Keep current selection if still valid, otherwise stay blank so teacher picks manually
          setSelectedKey((prev) =>
            prev && videoOnly.some((s) => s.submissionKey === prev) ? prev : ''
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

  // Filtered submissions list (respects hideCorrected by default!)
  const filteredSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return submissions.filter((s) => {
      if (filterLesson !== 'all' && s.itemTitle !== filterLesson) return false;
      const effectiveStatus: MarkingStatus = s.correction?.status || 'pending';
      if (filterStatus !== 'all' && effectiveStatus !== filterStatus) return false;
      if (hideCorrected && filterStatus !== 'corrected' && effectiveStatus === 'corrected') {
        if (s.submissionKey !== selectedKey) return false;
      }
      if (q) {
        const hay = `${s.studentName} ${s.studentId} ${s.lessonSubject} ${s.itemTitle}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [submissions, filterLesson, filterStatus, hideCorrected, selectedKey, searchQuery]);

  const activeIndex = useMemo(() => {
    if (!selectedKey || filteredSubmissions.length === 0) return -1;
    return filteredSubmissions.findIndex((s) => s.submissionKey === selectedKey);
  }, [filteredSubmissions, selectedKey]);

  const activeSubmission = activeIndex >= 0 ? filteredSubmissions[activeIndex] : null;

  const hasStudentImage =
    Boolean(activeSubmission?.studentImageUrl?.trim()) || Boolean(boardOverrideImageUrl);
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

  // Scoped presets & stickers for Audio section
  const audioPresetTexts = useMemo(() => {
    const filtered = presetTexts.filter((p) => p.scope === 'audio' || p.scope === 'both');
    return filtered.length > 0 ? filtered : presetTexts;
  }, [presetTexts]);

  const audioStickersList = useMemo(() => {
    const filtered = stickersList.filter((s) => s.scope === 'audio' || s.scope === 'both');
    return filtered.length > 0 ? filtered : stickersList;
  }, [stickersList]);

  // Sync studio inputs whenever active submission changes
  useEffect(() => {
    if (!activeSubmission) return;
    const c = activeSubmission.correction;
    setForceShowBlackboard(false);
    setBoardOverrideImageUrl('');

    // Image defaults (default to 0 unless teacher already saved a score)
    setFImgStatus(c?.imageStatus || c?.status || 'corrected');
    const hasImgScore =
      c?.imageScore !== undefined && String(c.imageScore).trim() !== '';
    const hasLegacyImgScore =
      !hasImgScore &&
      (Boolean(c?.imageStatus) || Boolean(c?.correctedImageUrl)) &&
      c?.score !== undefined &&
      String(c.score).trim() !== '';
    setFImgScore(
      hasImgScore
        ? String(c!.imageScore)
        : hasLegacyImgScore
        ? String(c!.score)
        : '0'
    );
    const imgStars = parseStarCount(c?.imageRatingLabel || c?.ratingLabel);
    setFImgRating(imgStars > 0 ? formatStarValue(imgStars) : '');
    setFImgNotes(c?.imageNotes !== undefined ? c.imageNotes : c?.notes || '');
    setFImgFeedback(null);

    // Audio defaults (default to 0 unless teacher already saved a score)
    setFAudioStatus(c?.audioStatus || c?.status || 'corrected');
    const hasAudScore =
      c?.audioScore !== undefined && String(c.audioScore).trim() !== '';
    const hasLegacyAudScore =
      !hasAudScore &&
      (Boolean(c?.audioStatus) || Boolean(c?.teacherAudioUrl)) &&
      c?.score !== undefined &&
      String(c.score).trim() !== '';
    setFAudioScore(
      hasAudScore
        ? String(c!.audioScore)
        : hasLegacyAudScore
        ? String(c!.score)
        : '0'
    );
    const audStars = parseStarCount(c?.audioRatingLabel || c?.ratingLabel);
    setFAudioRating(audStars > 0 ? formatStarValue(audStars) : '');
    setFAudioNotes(c?.audioNotes !== undefined ? c.audioNotes : c?.notes || '');
    setFAudioStickerSymbol(c?.audioStickerSymbol || c?.stickerSymbol || '');
    setFAudioStickerLabel(c?.audioStickerLabel || c?.stickerLabel || '');
    setFAudioFeedback(null);

    setFExtraAudioClips([]);
    setFExtraImagesB64([]);
    const corrImgUrl = (c?.correctedImageUrl || '').trim();
    setFSavedAddImages(
      dedupeMediaUrls([
        corrImgUrl,
        ...(Array.isArray(c?.additionalImages) ? c.additionalImages : []),
      ]).slice(corrImgUrl ? 1 : 0)
    );
    setFSavedImageLinks(
      Array.isArray(c?.imageLinks) ? Array.from(new Set(c.imageLinks.filter(Boolean))) : []
    );
    const mergedSavedAuds = Array.from(
      new Set([c?.teacherAudioUrl || '', ...(c?.teacherAudios || [])].map((u) => u.trim()).filter(Boolean))
    );
    setFSavedTeacherAudios(mergedSavedAuds);
    setFSavedAudioLinks(
      Array.isArray(c?.audioLinks) ? Array.from(new Set(c.audioLinks.filter(Boolean))) : []
    );
    const dedupedVids = dedupeMediaUrls([c?.teacherVideoUrl, ...(c?.teacherVideos || [])]);
    setFTeacherVideoUrl(dedupedVids[0] || '');
    setFExtraVideoUrls(dedupedVids.slice(1));
    setFAllowRetry(Boolean(c?.allowRetry));
    setFSendTelegram(markingConfig.notifyStudentOnCorrection !== false);
    videoRecorderRef.current?.resetPending();
  }, [activeSubmission?.submissionKey]);

  const correctionSyncKey = useMemo(() => {
    const c = activeSubmission?.correction;
    if (!c) return '';
    return [
      activeSubmission?.submissionKey || '',
      c.updatedAt || '',
      c.correctedImageUrl || '',
      (c.additionalImages || []).join('|'),
      (c.imageLinks || []).join('|'),
      c.teacherAudioUrl || '',
      (c.teacherAudios || []).join('|'),
      (c.audioLinks || []).join('|'),
      c.teacherVideoUrl || '',
      (c.teacherVideos || []).join('|'),
    ].join('::');
  }, [activeSubmission]);

  // Keep saved attachments synced whenever correction payload updates (same-minute saves or Batch Correction Modal)
  useEffect(() => {
    if (!activeSubmission?.correction) return;
    const c = activeSubmission.correction;
    const corrImgUrl = (c.correctedImageUrl || '').trim();
    setFSavedAddImages(
      dedupeMediaUrls([
        corrImgUrl,
        ...(Array.isArray(c.additionalImages) ? c.additionalImages : []),
      ]).slice(corrImgUrl ? 1 : 0)
    );
    setFSavedImageLinks(
      Array.isArray(c.imageLinks) ? Array.from(new Set(c.imageLinks.filter(Boolean))) : []
    );
    setFSavedTeacherAudios(
      Array.from(
        new Set([c.teacherAudioUrl || '', ...(c.teacherAudios || [])].map((u) => u.trim()).filter(Boolean))
      )
    );
    setFSavedAudioLinks(
      Array.isArray(c.audioLinks) ? Array.from(new Set(c.audioLinks.filter(Boolean))) : []
    );
    const dedupedVids = dedupeMediaUrls([c.teacherVideoUrl, ...(c.teacherVideos || [])]);
    setFTeacherVideoUrl(dedupedVids[0] || '');
    setFExtraVideoUrls(dedupedVids.slice(1));
  }, [correctionSyncKey]);

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

  const applyClearedCorrections = (keys: string[]) => {
    if (!keys || keys.length === 0) return;
    const keySet = new Set(keys);
    setSubmissions((prev) =>
      prev.map((sub) => (keySet.has(sub.submissionKey) ? { ...sub, correction: null } : sub))
    );
  };

  const handleUploadExtraImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const processed: string[] = [];
    for (const file of files) {
      const rawDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsDataURL(file);
      });
      if (!rawDataUrl || !rawDataUrl.startsWith('data:image/')) continue;
      const optimized = await applyWatermarkToImageDataUrl(
        rawDataUrl,
        markingConfig.watermark,
        {
          studentId: activeSubmission?.studentId,
          studentName: activeSubmission?.studentName,
          lessonTitle: activeSubmission?.itemTitle || 'التصحيح التفاعلي',
        },
        homeLogoUrl,
        1600,
        0.86
      );
      processed.push(optimized);
    }
    if (processed.length > 0) {
      setFExtraImagesB64((prev) => [...prev, ...processed]);
    }
  };

  const handleUploadAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const blobUrl = URL.createObjectURL(file);
          setFExtraAudioClips((prev) => [
            ...prev,
            {
              id: `aud-file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              blobUrl,
              base64: reader.result as string,
              name: file.name,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Independent Save: Image Correction Only (never overwrites Audio section)
  const handleSaveImageCorrection = async () => {
    if (!activeSubmission || fImgSaving) return;
    setFImgSaving(true);
    setFImgFeedback(null);
    try {
      let annotatedBase64: string | undefined;
      if (
        shouldShowBlackboard &&
        (blackboardRef.current?.hasAnnotations() || Boolean(boardOverrideImageUrl))
      ) {
        const exported = await blackboardRef.current?.exportWatermarkedDataUrl(
          markingConfig.watermark,
          {
            studentId: activeSubmission.studentId,
            studentName: activeSubmission.studentName,
            lessonTitle: activeSubmission.itemTitle,
          },
          homeLogoUrl
        );
        if (exported && exported.startsWith('data:image/')) {
          annotatedBase64 = exported;
        }
      }

      let preparedExtraImages: string[] | undefined;
      if (fExtraImagesB64.length > 1 && stitchExtraImages) {
        const stitched = await combineImagesToSingleBase64(fExtraImagesB64);
        preparedExtraImages = stitched ? [stitched] : fExtraImagesB64;
      } else if (fExtraImagesB64.length > 0) {
        preparedExtraImages = fExtraImagesB64;
      }

      let pendingVidUrl: string | null = null;
      if (videoRecorderRef.current?.hasPendingRecording()) {
        pendingVidUrl = await videoRecorderRef.current.uploadPendingVideo();
      }

      const uniqueVideos = dedupeMediaUrls([
        fTeacherVideoUrl,
        ...fExtraVideoUrls,
        pendingVidUrl,
      ]);
      const parsedScore = fImgScore.trim() !== '' ? Number(fImgScore) : undefined;

      const res = await saveMarkingCorrectionToSheets(webhookUrl, {
        submissionKey: activeSubmission.submissionKey,
        exerciseType: activeSubmission.exerciseType,
        studentId: activeSubmission.studentId,
        studentName: activeSubmission.studentName,
        lessonSubject: activeSubmission.lessonSubject,
        itemTitle: activeSubmission.itemTitle,
        saveMode: 'image_only',
        status: fImgStatus,
        score: parsedScore,
        ratingLabel: fImgRating,
        notes: fImgNotes.trim(),
        imageStatus: fImgStatus,
        imageScore: parsedScore,
        imageRatingLabel: fImgRating,
        imageNotes: fImgNotes.trim(),
        correctedImageUrl: !annotatedBase64
          ? activeSubmission.correction?.correctedImageUrl
          : undefined,
        correctedImageBase64: annotatedBase64,
        additionalImages: fSavedAddImages,
        additionalImagesBase64: preparedExtraImages,
        imageLinks: fSavedImageLinks,
        teacherVideoUrl: uniqueVideos[0] || '',
        teacherVideos: uniqueVideos,
        allowRetry: fAllowRetry || fImgStatus === 'retry',
        sendTelegram: fSendTelegram,
        teacherName,
      });

      if (res.success && res.correction) {
        const saved = res.correction;
        applyUpdatedCorrections([saved]);
        const savedCorrImg = (saved.correctedImageUrl || '').trim();
        setFSavedAddImages(
          dedupeMediaUrls([
            savedCorrImg,
            ...(Array.isArray(saved.additionalImages) ? saved.additionalImages : []),
          ]).slice(savedCorrImg ? 1 : 0)
        );
        setFSavedImageLinks(
          Array.isArray(saved.imageLinks) ? Array.from(new Set(saved.imageLinks.filter(Boolean))) : []
        );
        const syncedVids = dedupeMediaUrls([
          saved.teacherVideoUrl,
          ...(Array.isArray(saved.teacherVideos) ? saved.teacherVideos : []),
        ]);
        setFTeacherVideoUrl(syncedVids[0] || '');
        setFExtraVideoUrls(syncedVids.slice(1));
        setFExtraImagesB64([]);
        setBoardOverrideImageUrl('');
        setFImgFeedback({
          type: 'ok',
          text: res.telegramNotified
            ? `تم حفظ تصحيح الصورة لـ ${activeSubmission.studentName} وإرسال إشعار تيليغرام.`
            : `تم حفظ تصحيح الصورة لـ ${activeSubmission.studentName} في الشيت بنجاح.`,
        });
      } else {
        setFImgFeedback({
          type: 'err',
          text: res.error || 'تعذر حفظ تصحيح الصورة.',
        });
      }
    } finally {
      setFImgSaving(false);
    }
  };

  // Independent Save: Audio Correction Only (never overwrites Image section or explanation videos)
  const handleSaveAudioCorrection = async () => {
    if (!activeSubmission || fAudioSaving) return;
    setFAudioSaving(true);
    setFAudioFeedback(null);
    try {
      const parsedScore = fAudioScore.trim() !== '' ? Number(fAudioScore) : undefined;
      const existingAudUrl = fSavedTeacherAudios[0] || '';
      const primaryAudioB64 =
        !existingAudUrl && fExtraAudioClips.length > 0 ? fExtraAudioClips[0].base64 : undefined;
      const extraAudioB64s = !existingAudUrl
        ? fExtraAudioClips.slice(1).map((c) => c.base64)
        : fExtraAudioClips.map((c) => c.base64);

      const res = await saveMarkingCorrectionToSheets(webhookUrl, {
        submissionKey: activeSubmission.submissionKey,
        exerciseType: activeSubmission.exerciseType,
        studentId: activeSubmission.studentId,
        studentName: activeSubmission.studentName,
        lessonSubject: activeSubmission.lessonSubject,
        itemTitle: activeSubmission.itemTitle,
        saveMode: 'audio_only',
        status: fAudioStatus,
        score: parsedScore,
        ratingLabel: fAudioRating,
        notes: fAudioNotes.trim(),
        audioStatus: fAudioStatus,
        audioScore: parsedScore,
        audioRatingLabel: fAudioRating,
        audioNotes: fAudioNotes.trim(),
        audioStickerSymbol: fAudioStickerSymbol || undefined,
        audioStickerLabel: fAudioStickerLabel || undefined,
        stickerSymbol: fAudioStickerSymbol || undefined,
        stickerLabel: fAudioStickerLabel || undefined,
        teacherAudioUrl: existingAudUrl,
        teacherAudioBase64: primaryAudioB64,
        teacherAudios: fSavedTeacherAudios,
        teacherAudiosBase64: extraAudioB64s.length > 0 ? extraAudioB64s : undefined,
        audioLinks: fSavedAudioLinks,
        allowRetry: fAllowRetry || fAudioStatus === 'retry',
        sendTelegram: fSendTelegram,
        teacherName,
      });

      if (res.success && res.correction) {
        const saved = res.correction;
        applyUpdatedCorrections([saved]);
        setFSavedTeacherAudios(
          Array.from(
            new Set(
              [saved.teacherAudioUrl || '', ...(Array.isArray(saved.teacherAudios) ? saved.teacherAudios : [])]
                .map((u) => u.trim())
                .filter(Boolean)
            )
          )
        );
        setFSavedAudioLinks(
          Array.isArray(saved.audioLinks) ? Array.from(new Set(saved.audioLinks.filter(Boolean))) : []
        );
        setFExtraAudioClips([]);
        setFAudioFeedback({
          type: 'ok',
          text: res.telegramNotified
            ? `تم حفظ تصحيح الصوت لـ ${activeSubmission.studentName} وإرسال إشعار تيليغرام.`
            : `تم حفظ تصحيح الصوت لـ ${activeSubmission.studentName} في الشيت بنجاح.`,
        });
      } else {
        setFAudioFeedback({
          type: 'err',
          text: res.error || 'تعذر حفظ تصحيح الصوت.',
        });
      }
    } finally {
      setFAudioSaving(false);
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
      } font-cairo text-right text-slate-800 flex flex-col gap-3`}
    >
      {/* Hidden File Inputs for Extra Image Upload & Audio File Upload */}
      <input
        ref={extraImageUploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUploadExtraImages}
      />
      <input
        ref={audioUploadInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={handleUploadAudioFile}
      />

      {/* Standalone Top Header */}
      {isStandalonePage && (
        <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {homeLogoUrl ? (
                <img
                  src={getDirectImageUrl(homeLogoUrl)}
                  alt={platformTitle || 'الشعار'}
                  className="w-9 h-9 rounded-xl object-cover border border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-extrabold shrink-0">
                  <PenTool className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-sm font-extrabold truncate">
                  بوابة تصحيح واجبات الفيديو التفاعلي
                </h1>
                <div className="text-[11px] text-slate-400 truncate">
                  المعلم: {teacherName}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isStandalonePage && onOpenAdminMarkingSettings && (
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
                aria-label="تسجيل خروج المعلم"
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
            ? 'max-w-7xl w-full mx-auto px-4 sm:px-6 pb-10 space-y-3'
            : 'space-y-3'
        }
      >
        {/* Compact Top Collapsible Triggers Bar (Card 1 Button + Card 2 Button) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Card 1 Toggle Button */}
            <button
              type="button"
              onClick={() => setAdminCardOpen((o) => !o)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                adminCardOpen
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-500" />
              <span>أدوات الإدارة</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${adminCardOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Card 2 Toggle Button (Eye moved inside Student Lessons dropdown!) */}
            <button
              type="button"
              onClick={() => setSubmissionsCardOpen((o) => !o)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                submissionsCardOpen
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                واجب الطلاب ({filteredSubmissions.length})
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  submissionsCardOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {loading && (
            <span className="text-xs font-bold text-slate-500 inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              <span>جاري التحميل...</span>
            </span>
          )}
        </div>

        {/* COLLAPSIBLE CARD 1: Admin Tools & Bulk Actions */}
        {adminCardOpen && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 font-semibold flex flex-wrap items-center gap-2 tabular-nums">
              <span>إجمالي التسليمات: {stats.total}</span>
              <span>·</span>
              <span className="text-amber-700 font-bold">بانتظار التصحيح: {stats.pending}</span>
              <span>·</span>
              <span className="text-emerald-700 font-bold">مصحّح: {stats.corrected}</span>
              <span>·</span>
              <span className="text-rose-700 font-bold">مطلوب إعادة: {stats.retry}</span>
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
                onClick={() => setBatchModalState({ open: true, mode: 'sheet' })}
                disabled={submissions.length === 0}
                className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-900 border border-indigo-200 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-indigo-600" />
                <span>جدول التصحيحات</span>
              </button>

              {!isStandalonePage && (
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
              )}

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
        )}

        {/* COLLAPSIBLE CARD 2: Student Submissions Dropdown + Filters + Quick Capture Tools */}
        {submissionsCardOpen && (
          <div
            ref={dropdownContainerRef}
            className="relative bg-white rounded-2xl border border-slate-200 p-3.5 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
              {/* Floating Queue Dropdown Trigger + Prev/Next */}
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
                      className={`w-4 h-4 transition-transform ${
                        dropdownOpen ? 'rotate-180' : ''
                      }`}
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
                  aria-label="الطالب السابق"
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
                  aria-label="الطالب التالي"
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

              {/* Lesson Filter */}
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
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  {(Object.keys(STATUS_FILTER_LABELS) as Array<'all' | MarkingStatus>).map((k) => (
                    <option key={k} value={k}>
                      {STATUS_FILTER_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Floating Overlay Submissions Menu (Eye show/hide corrected lives inside header) */}
            {dropdownOpen && (
              <div className="absolute right-0 left-0 sm:left-auto sm:w-[490px] top-full mt-2 z-40 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800">
                  <span>اختر واجب الطالب للتصحيح ({filteredSubmissions.length})</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHideCorrected((h) => !h)}
                      title={
                        hideCorrected
                          ? `إظهار الدروس المصحّحة (${stats.corrected})`
                          : `إخفاء الدروس المصحّحة (${stats.corrected})`
                      }
                      aria-label={hideCorrected ? 'إظهار الدروس المصحّحة' : 'إخفاء الدروس المصحّحة'}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        !hideCorrected
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {hideCorrected ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{hideCorrected ? `إظهار المصحّحة (${stats.corrected})` : 'إخفاء المصحّحة'}</span>
                    </button>
                  </div>
                </div>

                {filteredSubmissions.length === 0 ? (
                  <div className="p-6 text-center text-xs font-bold text-slate-500">
                    {hideCorrected
                      ? 'لا توجد واجبات غير مصحّحة حالياً — اضغط أيقونة العين لإظهار الدروس المصحّحة.'
                      : 'لا توجد تسليمات مطابقة للفلاتر الحالية.'}
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
                            isActive
                              ? 'bg-emerald-50 border-r-4 border-emerald-600'
                              : 'hover:bg-slate-50'
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
        )}

        {/* Headless Modal Capture Helpers (triggered from Blackboard -> "توضيح إضافي") */}
        <MarkingPhotoCapture
          hideInlineBar
          openCameraTrigger={photoModalTrigger}
          images={fExtraImagesB64}
          onChangeImages={setFExtraImagesB64}
          watermarkSettings={markingConfig.watermark}
          studentInfo={{
            studentId: activeSubmission?.studentId,
            studentName: activeSubmission?.studentName,
            lessonTitle: activeSubmission?.itemTitle || 'التصحيح التفاعلي',
          }}
          fallbackLogoUrl={homeLogoUrl}
          stitchOnSave={stitchExtraImages}
          onChangeStitchOnSave={setStitchExtraImages}
        />

        <MarkingVideoRecorder
          ref={videoRecorderRef}
          autoClearAfterUpload
          autoUploadOnStop
          hideInlineTrigger
          openTrigger={videoModalTrigger}
          markingConfig={markingConfig}
          webhookUrl={webhookUrl}
          existingVideoUrl={fTeacherVideoUrl}
          onRemoveExistingVideo={() => setFTeacherVideoUrl('')}
          onVideoUploaded={(url) => {
            const cleanUrl = (url || '').trim();
            if (!cleanUrl) return;
            setFTeacherVideoUrl((prevPrimary) => {
              if (!prevPrimary) return cleanUrl;
              const merged = dedupeMediaUrls([prevPrimary, cleanUrl]);
              if (merged.length > 1) {
                setFExtraVideoUrls((prevExtras) =>
                  dedupeMediaUrls([...prevExtras, cleanUrl]).filter((u) => u !== prevPrimary)
                );
              }
              return prevPrimary;
            });
          }}
        />

        {loadError && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {!loading && !loadError && submissions.length === 0 && (
          <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-950 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-sky-600 shrink-0" />
            <span>
              لا توجد تسليمات مسجلة في قسم الفيديو التفاعلي (ورقة «فيديو_الإجابات») حتى الآن.
            </span>
          </div>
        )}

        {/* Streamlined Card 3 (Active Student Summary: Strictly Name + ID + Lesson + Achievement Report Button) */}
        {activeSubmission && (
          <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
              <span className="text-sm sm:text-base font-extrabold text-slate-900">
                {activeSubmission.studentName}
              </span>
              {activeSubmission.studentId && (
                <span className="text-xs font-mono font-bold text-slate-500">
                  #{activeSubmission.studentId}
                </span>
              )}
              <span className="text-slate-300">|</span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                {activeSubmission.itemTitle}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setAchievementModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
              <span>تقرير الإنجاز</span>
            </button>
          </div>
        )}

        {/* LARGE BLACKBOARD: Opens Blank on initial load; shows integrated Image Grading when active student is chosen */}
        {!activeSubmission ? (
          <MarkingBlackboard
            ref={blackboardRef}
            studentImageUrl={boardOverrideImageUrl || undefined}
            lessonTitle={
              boardOverrideImageUrl
                ? 'صورة مرفوعة على السبورة'
                : 'السبورة جاهزة — افتح «واجب الطلاب» لاختيار طالب للتصحيح'
            }
            stickers={stickersList}
            presetTexts={presetTexts}
            imageGrading={{
              visible: false,
              score: fImgScore,
              onChangeScore: setFImgScore,
              status: fImgStatus,
              onChangeStatus: setFImgStatus,
              ratingLabel: fImgRating,
              onChangeRatingLabel: setFImgRating,
              notes: fImgNotes,
              onChangeNotes: setFImgNotes,
              saving: fImgSaving,
              feedback: fImgFeedback,
              onSubmit: handleSaveImageCorrection,
            }}
          />
        ) : (
          <section className="space-y-4">
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
                  studentImageUrl={boardOverrideImageUrl || activeSubmission.studentImageUrl}
                  previousCorrectedImageUrl={
                    !boardOverrideImageUrl
                      ? activeSubmission.correction?.correctedImageUrl
                      : undefined
                  }
                  studentAudioUrl={activeSubmission.studentAudioUrl}
                  studentName={activeSubmission.studentName}
                  lessonTitle={activeSubmission.itemTitle}
                  stickers={stickersList}
                  presetTexts={presetTexts}
                  imageGrading={{
                    visible: true,
                    score: fImgScore,
                    onChangeScore: setFImgScore,
                    status: fImgStatus,
                    onChangeStatus: setFImgStatus,
                    ratingLabel: fImgRating,
                    onChangeRatingLabel: setFImgRating,
                    notes: fImgNotes,
                    onChangeNotes: setFImgNotes,
                    saving: fImgSaving,
                    feedback: fImgFeedback,
                    onSubmit: handleSaveImageCorrection,
                    onTriggerVideo: () => setVideoModalTrigger((c) => c + 1),
                    onTriggerPhoto: () => setPhotoModalTrigger((c) => c + 1),
                    onTriggerUploadImage: () => extraImageUploadInputRef.current?.click(),
                    extraPhotosCount:
                      fSavedAddImages.length + fSavedImageLinks.length + fExtraImagesB64.length,
                    extraVideosCount:
                      (fTeacherVideoUrl ? 1 : 0) + fExtraVideoUrls.length,
                    extraAttachmentsPreview: (
                      fSavedAddImages.length > 0 ||
                      fSavedImageLinks.length > 0 ||
                      fExtraImagesB64.length > 0 ||
                      fTeacherVideoUrl ||
                      fExtraVideoUrls.length > 0
                    ) ? (
                      <div className="space-y-3 pt-2 border-t border-slate-100">
                        {fSavedAddImages.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-bold text-emerald-800">
                              صور وملفات التصحيح المحفوظة ({fSavedAddImages.length}):
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {fSavedAddImages.map((imgUrl, idx) => (
                                <div
                                  key={`${imgUrl}-${idx}`}
                                  className="relative group rounded-xl overflow-hidden border border-emerald-200 bg-slate-50 aspect-square"
                                >
                                  <img
                                    src={getDirectImageUrl(imgUrl)}
                                    alt={`محفوظ ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <a
                                    href={imgUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute bottom-1 right-1 p-1 rounded-lg bg-slate-900/80 text-white"
                                    title="فتح الصورة"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFSavedAddImages((p) => p.filter((_, i) => i !== idx))
                                    }
                                    className="absolute top-1 left-1 p-1 rounded-lg bg-rose-600 text-white cursor-pointer"
                                    title="إزالة الصورة المحفوظة (اضغط إرسال لتأكيد الحفظ)"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {fSavedImageLinks.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[11px] font-bold text-slate-700">
                              روابط وملفات مرفقة مع الصورة ({fSavedImageLinks.length}):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {fSavedImageLinks.map((lnk, idx) => (
                                <div
                                  key={`${lnk}-${idx}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                                >
                                  <Link2 className="w-3 h-3 text-emerald-700 shrink-0" />
                                  <a
                                    href={lnk}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-indigo-700 hover:underline max-w-[200px] truncate"
                                  >
                                    {lnk}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFSavedImageLinks((p) => p.filter((_, i) => i !== idx))
                                    }
                                    className="text-rose-600 hover:text-rose-800 cursor-pointer"
                                    title="إزالة الرابط"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {fExtraImagesB64.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-700">
                              <span>صور جديدة بانتظار الإرسال ({fExtraImagesB64.length}):</span>
                              {fExtraImagesB64.length > 1 && (
                                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={stitchExtraImages}
                                    onChange={(e) => setStitchExtraImages(e.target.checked)}
                                    className="accent-emerald-600"
                                  />
                                  <span>دمج الصور الإضافية في صورة واحدة</span>
                                </label>
                              )}
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {fExtraImagesB64.map((src, idx) => (
                                <div
                                  key={idx}
                                  className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square"
                                >
                                  <img
                                    src={src}
                                    alt={`مرفق ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFExtraImagesB64((p) => p.filter((_, i) => i !== idx))
                                    }
                                    className="absolute top-1 left-1 p-1 rounded-lg bg-rose-600 text-white cursor-pointer"
                                    title="حذف الصورة"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(fTeacherVideoUrl || fExtraVideoUrls.length > 0) && (
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-bold text-slate-700">
                              فيديوهات التوضيح المرفقة:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {dedupeMediaUrls([fTeacherVideoUrl, ...fExtraVideoUrls])
                                .map((vUrl, idx) => (
                                  <CorrectionVideoPlayer
                                    key={`${vUrl}-${idx}`}
                                    url={vUrl}
                                    label={`فيديو #${idx + 1}`}
                                    compact
                                    onRemove={() => {
                                      if (vUrl === fTeacherVideoUrl) {
                                        setFTeacherVideoUrl(fExtraVideoUrls[0] || '');
                                        setFExtraVideoUrls((p) => p.slice(1));
                                      } else {
                                        setFExtraVideoUrls((p) => p.filter((u) => u !== vUrl));
                                      }
                                    }}
                                  />
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null,
                  }}
                />
              </div>
            ) : (
              <div className="px-4 py-3 rounded-2xl bg-indigo-50/70 border border-indigo-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    هذا التسليم واجب صوتي فقط (بدون صورة مرفقة) — يمكنك التركيز على بطاقة الصوت أدناه.
                  </span>
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

            {/* Inline video block shown ONLY when blackboard is hidden to prevent duplication */}
            {!shouldShowBlackboard && (fTeacherVideoUrl || fExtraVideoUrls.length > 0) && (
              <div className="bg-white rounded-2xl border border-indigo-200 p-4 space-y-2.5">
                <div className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-indigo-600" />
                  <span>فيديوهات الشرح والتصحيح المرفقة في هذا الدرس</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dedupeMediaUrls([fTeacherVideoUrl, ...fExtraVideoUrls])
                    .map((vUrl, idx) => (
                      <CorrectionVideoPlayer
                        key={`inline-vid-${vUrl}-${idx}`}
                        url={vUrl}
                        label={`فيديو التصحيح #${idx + 1}`}
                        compact
                        onRemove={() => {
                          if (vUrl === fTeacherVideoUrl) {
                            setFTeacherVideoUrl(fExtraVideoUrls[0] || '');
                            setFExtraVideoUrls((p) => p.slice(1));
                          } else {
                            setFExtraVideoUrls((p) => p.filter((u) => u !== vUrl));
                          }
                        }}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* ONE UNIFIED AUDIO CORRECTION CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      تصحيح واجب الصوت (مستقل عن الصورة)
                    </h3>
                    <div className="text-[11px] text-slate-500 font-semibold">
                      استمع لتسجيل الطالب، قيّم وأرسل التوضيح الصوتي والملاحظات
                    </div>
                  </div>
                </div>

                {activeSubmission.correction?.audioStatus && (
                  <span className="text-xs font-extrabold text-emerald-700 tabular-nums">
                    محفوظ سابقاً:{' '}
                    {activeSubmission.correction.audioScore !== undefined
                      ? `${activeSubmission.correction.audioScore}/100`
                      : activeSubmission.correction.audioStatus}
                  </span>
                )}
              </div>

              {/* Student Audio Player ONLY (No Reference Audio Deck) */}
              <MarkingAudioStudio
                studentAudioUrl={activeSubmission.studentAudioUrl}
                studentName={activeSubmission.studentName}
                hideReference
                hideRecorder
              />

              {/* Directly Below Student Player: 1. درجة الصوت 2. حالة تصحيح الصوت 3. التقدير بالنجوم 0-10 */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="sm:col-span-3 flex items-center gap-2">
                  <label className="text-xs font-extrabold text-slate-700 whitespace-nowrap">
                    درجة الصوت:
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={fAudioScore}
                    onChange={(e) =>
                      setFAudioScore(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))
                    }
                    placeholder="0"
                    className="w-20 px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-mono font-extrabold text-slate-900 text-center tabular-nums"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={fAudioStatus}
                    onChange={(e) => setFAudioStatus(e.target.value as MarkingStatus)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                  >
                    <option value="corrected">صوت مصحّح ومعتمد ✓</option>
                    <option value="retry">مطلوب إعادة تسجيل الصوت</option>
                    <option value="pending">قيد الانتظار</option>
                  </select>
                </div>

                <div className="sm:col-span-5">
                  <StarRatingInput
                    label="التقدير:"
                    value={fAudioRating}
                    onChange={setFAudioRating}
                    compact
                  />
                </div>
              </div>

              {/* Collapsible Action Triggers Row: شرح توضيحية + ملاحظات */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setAudioExplainOpen((p) => !p);
                    setAudioNotesOpen(false);
                  }}
                  className={`px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    audioExplainOpen
                      ? 'bg-rose-600 text-white border-rose-600'
                      : fExtraAudioClips.length > 0 || fSavedTeacherAudios.length > 0 || fSavedAudioLinks.length > 0
                      ? 'bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100'
                      : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <Mic className="w-4 h-4" />
                  <span>شرح توضيحية</span>
                  {(fExtraAudioClips.length > 0 || fSavedTeacherAudios.length > 0 || fSavedAudioLinks.length > 0) && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-mono tabular-nums">
                      {fExtraAudioClips.length + fSavedTeacherAudios.length + fSavedAudioLinks.length}
                    </span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      audioExplainOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAudioNotesOpen((p) => !p);
                    setAudioExplainOpen(false);
                  }}
                  className={`px-4 py-2 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    audioNotesOpen
                      ? 'bg-slate-900 text-white border-slate-900'
                      : fAudioNotes.trim() || fAudioStickerSymbol
                      ? 'bg-indigo-50 text-indigo-900 border-indigo-300 hover:bg-indigo-100'
                      : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>ملاحظات</span>
                  {fAudioStickerSymbol && (
                    <span className="text-sm leading-none">{fAudioStickerSymbol}</span>
                  )}
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      audioNotesOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              {/* Drawer 1: شرح توضيحية (تسجيل صوتي + رفع ملف صوتي + قائمة المقاطع) */}
              {audioExplainOpen && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-rose-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setAudioRecorderOpen(true)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Mic className="w-4 h-4" />
                        <span>تسجيل صوتي</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => audioUploadInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Upload className="w-4 h-4 text-indigo-600" />
                        <span>رفع ملف صوتي</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setAudioExplainOpen(false)}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {fSavedTeacherAudios.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-white border border-indigo-200 space-y-2">
                      <div className="text-[11px] font-bold text-indigo-900">
                        تسجيلات المعلم المحفوظة ({fSavedTeacherAudios.length}):
                      </div>
                      {fSavedTeacherAudios.map((audUrl, idx) => {
                        const resolvedAud = getAlternativeAudioUrls(audUrl)[0] || audUrl;
                        return (
                          <div key={`${audUrl}-${idx}`} className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-indigo-700 shrink-0 tabular-nums">
                              #{idx + 1}
                            </span>
                            <audio controls src={resolvedAud} className="flex-1 h-9 min-w-0" />
                            <a
                              href={audUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 shrink-0"
                              title="فتح الرابط"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setFSavedTeacherAudios((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer shrink-0"
                              title="إزالة المقطع المحفوظ (اضغط إرسال للتأكيد)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {fSavedAudioLinks.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-700">
                        روابط صوتية مرفقة ({fSavedAudioLinks.length}):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {fSavedAudioLinks.map((lnk, idx) => (
                          <div
                            key={`${lnk}-${idx}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                          >
                            <Link2 className="w-3 h-3 text-indigo-700 shrink-0" />
                            <a
                              href={lnk}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-indigo-700 hover:underline max-w-[200px] truncate"
                            >
                              {lnk}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setFSavedAudioLinks((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-rose-600 hover:text-rose-800 cursor-pointer"
                              title="إزالة الرابط"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fExtraAudioClips.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {fExtraAudioClips.map((clip, idx) => (
                        <div
                          key={clip.id}
                          className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200"
                        >
                          <span className="text-[11px] font-bold text-slate-600 shrink-0 tabular-nums">
                            #{idx + 1}
                          </span>
                          <audio controls src={clip.blobUrl} className="flex-1 h-8 min-w-0" />
                          <button
                            type="button"
                            onClick={() =>
                              setFExtraAudioClips((prev) => prev.filter((c) => c.id !== clip.id))
                            }
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer shrink-0"
                            title="حذف المقطع"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Drawer 2: ملاحظات (الملصقات + النصوص الجاهزة + حقل النص) */}
              {audioNotesOpen && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-indigo-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setAudioStickersOpen((s) => !s)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        audioStickersOpen || fAudioStickerSymbol
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <Sticker className="w-4 h-4" />
                      <span>الملصقات</span>
                      {fAudioStickerSymbol && (
                        <span className="text-base leading-none">{fAudioStickerSymbol}</span>
                      )}
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          audioStickersOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <div className="flex items-center gap-2">
                      {fAudioStickerSymbol && (
                        <button
                          type="button"
                          onClick={() => {
                            setFAudioStickerSymbol('');
                            setFAudioStickerLabel('');
                          }}
                          className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          إزالة الملصق
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAudioNotesOpen(false)}
                        className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {audioStickersOpen && (
                    <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {audioStickersList.map((st) => {
                          const isSelected = fAudioStickerSymbol === st.symbol;
                          return (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setFAudioStickerSymbol('');
                                  setFAudioStickerLabel('');
                                } else {
                                  setFAudioStickerSymbol(st.symbol);
                                  setFAudioStickerLabel(st.label);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-400'
                              }`}
                            >
                              <span className="text-lg leading-none">{st.symbol}</span>
                              <span>{st.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {fAudioStickerSymbol && (
                    <div className="p-2.5 rounded-xl bg-white border border-amber-200 flex items-center gap-3">
                      <span className="text-3xl leading-none">{fAudioStickerSymbol}</span>
                      <div>
                        <div className="text-xs font-extrabold text-slate-900">
                          الملصق المختار: {fAudioStickerLabel}
                        </div>
                        <div className="text-[11px] text-slate-500 font-semibold">
                          سيظهر للطالب داخل بطاقة التقييم الصوتي وفي رسالة تيليغرام.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Audio Preset Texts Dropdown */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">
                      نصوص جاهزة خاصة بالتصحيح الصوتي:
                    </label>
                    <select
                      value=""
                      onChange={(e) => {
                        const txt = e.target.value;
                        if (!txt) return;
                        setFAudioNotes((prev) => (prev ? `${prev}\n${txt}` : txt));
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                    >
                      <option value="">اختر نصاً جاهزاً لإضافته...</option>
                      {audioPresetTexts.map((preset) => (
                        <option key={preset.id} value={preset.text}>
                          {preset.text}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    rows={3}
                    value={fAudioNotes}
                    onChange={(e) => setFAudioNotes(e.target.value)}
                    placeholder="اكتب ملاحظتك الصوتية وتوجيهك لنطق الطالب..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900"
                  />
                </div>
              )}

              {/* Audio Submit Bar */}
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
                  disabled={fAudioSaving}
                  onClick={handleSaveAudioCorrection}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {fAudioSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>إرسال تصحيح الصوت</span>
                </button>
              </div>

              {fAudioFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    fAudioFeedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {fAudioFeedback.type === 'ok' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{fAudioFeedback.text}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Teacher Voice Recording Modal (Live Preview & Start/Stop Controls) */}
      <AudioRecorderModal
        isOpen={audioRecorderOpen}
        onClose={() => setAudioRecorderOpen(false)}
        title="تسجيل شرح صوتي توضيحي للطالب"
        onAttachAudio={(clip) =>
          setFExtraAudioClips((prev) => [
            ...prev,
            {
              id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              blobUrl: clip.blobUrl,
              base64: clip.base64,
              name: clip.name,
            },
          ])
        }
      />

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
        homeLogoUrl={homeLogoUrl}
        initialMode={batchModalState.mode}
        onCorrectionsUpdated={applyUpdatedCorrections}
        onCorrectionsCleared={applyClearedCorrections}
      />
    </div>
  );
};
