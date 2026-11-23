import React, { useEffect, useMemo, useState } from 'react';
import {
  Globe,
  Users,
  ShoppingCart,
  Plus,
  Trash2,
  Edit3,
  Save,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ArrowRightLeft,
  Bot,
  Copy,
  Check,
  Search,
  ListChecks,
  X,
  Image as ImageIcon,
  Languages,
  Share2,
  ClipboardCheck,
  Link2,
} from 'lucide-react';
import {
  PortalContentItem,
  PortalItemActionType,
  PortalPublicData,
  PortalSocialChannel,
  PortalSocialIconKey,
  ProgramRequestRecord,
  ProgramRequestStatus,
  RegistrationQuestion,
  RegistrationQuestionType,
  RegistrationSubmissionRecord,
  StorePublicData,
} from '../types';
import { StoreAdminManager } from './store/StoreAdminManager';
import { getLocalStoreData, saveLocalStoreData } from '../utils/storeSheets';
import { CourseProgram } from '../utils/courseSchedule';
import {
  PORTAL_UI_TEXT_METADATA,
  buildProgramShareUrl,
  buildRegistrationShareUrl,
  deleteProgramRequestInSheets,
  deleteRegistrationSubmissionInSheets,
  fetchPortalDataFromSheets,
  fetchProgramRequestsFromSheets,
  fetchRegistrationQuestionsFromSheets,
  fetchRegistrationSubmissionsFromSheets,
  savePortalDataToSheets,
  saveRegistrationQuestionsToSheets,
  transferRegistrationStageInSheets,
  updateProgramRequestStatusInSheets,
} from '../utils/portalSheets';
import { getDirectImageUrl } from '../utils/mediaUrl';
import { sanitizeExternalUrl } from '../utils/googleSheets';

interface PortalAdminManagerProps {
  portalData: PortalPublicData;
  onUpdatePortalData: (next: PortalPublicData) => void;
  questions: RegistrationQuestion[];
  onUpdateQuestions: (next: RegistrationQuestion[]) => void;
  programs: CourseProgram[];
  webhookUrl: string;
  onRefreshRegistrants?: () => void;
  onPreviewPublicPortal?: () => void;
  storeData?: StorePublicData;
  onUpdateStoreData?: (next: StorePublicData) => void;
  onOpenStorePreview?: () => void;
}

const QUESTION_TYPE_LABELS: Record<RegistrationQuestionType, string> = {
  text: 'نص قصير',
  textarea: 'نص طويل / فقرة',
  number: 'رقم',
  phone: 'رقم هاتف / واتساب',
  email: 'بريد إلكتروني',
  select: 'قائمة اختيار متعددة',
  file: 'رفع ملف / صورة (Google Drive + كاميرا)',
};

const CONTENT_SECTION_LABELS: Record<'about' | 'programs' | 'gallery' | 'videos', string> = {
  about: 'عن المؤسسة والمميزات',
  programs: 'بطاقات البرامج المعروضة للزوار',
  gallery: 'معرض الأعمال والصور',
  videos: 'مكتبة الفيديو التعريفية',
};

const SOCIAL_ICON_LABELS: Record<PortalSocialIconKey, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  line: 'LINE',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  x: 'X (Twitter)',
  globe: 'موقع إلكتروني',
  custom: 'أيقونة مخصصة (رابط صورة)',
};

const ACTION_TYPE_LABELS: Record<PortalItemActionType, string> = {
  none: 'بدون زر (عرض نصي فقط)',
  open_register: 'فتح استمارة التسجيل الجديد (المرحلة 1)',
  open_program_request: 'فتح نافذة طلب الالتحاق بالبرنامج (للمشتركين)',
  scroll_section: 'الانتقال إلى قسم في نفس الصفحة',
  external_url: 'فتح رابط خارجي',
};

export const PortalAdminManager: React.FC<PortalAdminManagerProps> = ({
  portalData,
  onUpdatePortalData,
  questions,
  onUpdateQuestions,
  programs,
  webhookUrl,
  onRefreshRegistrants,
  onPreviewPublicPortal,
  storeData,
  onUpdateStoreData,
  onOpenStorePreview,
}) => {
  const [subTab, setSubTab] = useState<
    'submissions' | 'programRequests' | 'content' | 'translations' | 'questions' | 'store'
  >('submissions');
  const [localStoreFallback, setLocalStoreFallback] = useState<StorePublicData>(() =>
    getLocalStoreData()
  );
  const resolvedStoreData = storeData || localStoreFallback;
  const handleStoreChange = (next: StorePublicData) => {
    setLocalStoreFallback(next);
    saveLocalStoreData(next);
    onUpdateStoreData?.(next);
  };
  const [banner, setBanner] = useState<{ success: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Content item editor state (programs managed centrally inside StoreAdminManager)
  const [activeContentSection, setActiveContentSection] = useState<
    'about' | 'gallery' | 'videos'
  >('about');
  const [editingItem, setEditingItem] = useState<PortalContentItem | null>(null);
  const [galleryUrlDraft, setGalleryUrlDraft] = useState('');

  // Question editor state
  const [editingQuestion, setEditingQuestion] = useState<RegistrationQuestion | null>(null);
  const [optionsDraft, setOptionsDraft] = useState('');

  // Submissions review & Stage 2 promotion state
  const [submissions, setSubmissions] = useState<RegistrationSubmissionRecord[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | 'stage1_default' | 'stage2_assigned' | 'paused'>('all');
  const [transferProgramMap, setTransferProgramMap] = useState<Record<string, string>>({});
  const [transferNotesMap, setTransferNotesMap] = useState<Record<string, string>>({});
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Program Enrollment Requests state (طلبات_البرامج)
  const [programRequests, setProgramRequests] = useState<ProgramRequestRecord[]>([]);
  const [loadingProgramRequests, setLoadingProgramRequests] = useState(false);
  const [reqFilter, setReqFilter] = useState<'all' | ProgramRequestStatus>('all');
  const [reqSearch, setReqSearch] = useState('');
  const [reqTargetMap, setReqTargetMap] = useState<Record<string, string>>({});
  const [reqNotesMap, setReqNotesMap] = useState<Record<string, string>>({});
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);
  const [confirmDeleteReqId, setConfirmDeleteReqId] = useState<string | null>(null);

  // Translation section filter state
  const [transItemSection, setTransItemSection] = useState<'about' | 'programs' | 'gallery' | 'videos'>('programs');

  // Clipboard copy badges
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadSubmissions = async () => {
    setLoadingSubmissions(true);
    try {
      const res = await fetchRegistrationSubmissionsFromSheets(webhookUrl);
      setSubmissions(res.submissions || []);
      if (res.needsScriptUpdate) {
        setBanner({
          success: false,
          text: 'ملاحظة: كود Google Apps Script المنشور يحتاج تحديثاً (New Version) لقراءة ورقة طلبات_التسجيل من السحابة.',
        });
      }
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const loadProgramRequests = async () => {
    setLoadingProgramRequests(true);
    try {
      const res = await fetchProgramRequestsFromSheets(webhookUrl);
      setProgramRequests(res.requests || []);
    } finally {
      setLoadingProgramRequests(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
    loadProgramRequests();
  }, [webhookUrl]);

  const handleSavePortal = async (overrideData?: PortalPublicData) => {
    setBusy(true);
    setBanner(null);
    try {
      const target = overrideData || portalData;
      const res = await savePortalDataToSheets(webhookUrl, target);
      setBanner({ success: res.success, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  const handlePullPortal = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetchPortalDataFromSheets(webhookUrl);
      onUpdatePortalData(res.data);
      setBanner({
        success: res.success,
        text: res.success
          ? 'تم سحب محتوى وإعدادات البوابة العامة من Google Sheets بنجاح!'
          : 'تعذر السحب من الشيت؛ تم عرض النسخة المحفوظة محلياً.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveQuestions = async (overrideList?: RegistrationQuestion[]) => {
    setBusy(true);
    setBanner(null);
    try {
      const target = overrideList || questions;
      const res = await saveRegistrationQuestionsToSheets(webhookUrl, target);
      setBanner({ success: res.success, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  const handlePullQuestions = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetchRegistrationQuestionsFromSheets(webhookUrl);
      onUpdateQuestions(res.questions);
      setBanner({
        success: res.success,
        text: res.success
          ? 'تم سحب أسئلة التسجيل من ورقة أسئلة_التسجيل بنجاح!'
          : 'تم تحميل النسخة المحلية لأسئلة التسجيل.',
      });
    } finally {
      setBusy(false);
    }
  };

  const filteredSubmissions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return submissions.filter((sub) => {
      if (stageFilter !== 'all' && sub.stage !== stageFilter) return false;
      if (!q) return true;
      return (
        sub.studentName.toLowerCase().includes(q) ||
        sub.registrationId.toLowerCase().includes(q) ||
        (sub.phone || '').toLowerCase().includes(q) ||
        (sub.email || '').toLowerCase().includes(q) ||
        (sub.telegramUsername || '').toLowerCase().includes(q)
      );
    });
  }, [submissions, searchTerm, stageFilter]);

  const stageCounts = useMemo(() => {
    let s1 = 0;
    let s2 = 0;
    let paused = 0;
    submissions.forEach((s) => {
      if (s.stage === 'stage2_assigned') s2++;
      else if (s.stage === 'paused') paused++;
      else s1++;
    });
    return { total: submissions.length, s1, s2, paused };
  }, [submissions]);

  const filteredProgramRequests = useMemo(() => {
    const q = reqSearch.trim().toLowerCase();
    return programRequests.filter((r) => {
      if (reqFilter !== 'all' && r.status !== reqFilter) return false;
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.registrationId.toLowerCase().includes(q) ||
        r.targetProgramTitle.toLowerCase().includes(q) ||
        r.requestId.toLowerCase().includes(q)
      );
    });
  }, [programRequests, reqFilter, reqSearch]);

  const reqCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    programRequests.forEach((r) => {
      if (r.status === 'approved') approved++;
      else if (r.status === 'rejected') rejected++;
      else pending++;
    });
    return { total: programRequests.length, pending, approved, rejected };
  }, [programRequests]);

  const updateSettings = (patch: Partial<PortalPublicData['settings']>) => {
    onUpdatePortalData({
      ...portalData,
      settings: {
        ...portalData.settings,
        ...patch,
      },
    });
  };

  const updateSocialChannel = (channelId: string, patch: Partial<PortalSocialChannel>) => {
    const next = (portalData.settings.socialChannels || []).map((ch) =>
      ch.id === channelId ? { ...ch, ...patch } : ch
    );
    updateSettings({ socialChannels: next });
  };

  const addSocialChannel = (preset?: { appName: string; iconKey: PortalSocialIconKey }) => {
    const existing = portalData.settings.socialChannels || [];
    const nextItem: PortalSocialChannel = {
      id: `soc_${Date.now()}`,
      appName: preset?.appName || 'قناة جديدة',
      iconKey: preset?.iconKey || 'globe',
      url: '',
      enabled: true,
      sortOrder: existing.length + 1,
    };
    updateSettings({ socialChannels: [...existing, nextItem] });
  };

  const moveSocialChannel = (idx: number, delta: number) => {
    const list = [...(portalData.settings.socialChannels || [])].sort(
      (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
    );
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    updateSettings({
      socialChannels: list.map((c, i) => ({ ...c, sortOrder: i + 1 })),
    });
  };

  const deleteSocialChannel = (channelId: string) => {
    const next = (portalData.settings.socialChannels || [])
      .filter((c) => c.id !== channelId)
      .map((c, i) => ({ ...c, sortOrder: i + 1 }));
    updateSettings({ socialChannels: next });
  };

  const updateUiTextEntry = (
    key: string,
    patch: Partial<{ ar: string; en: string; th: string; visible: boolean }>
  ) => {
    const current = portalData.settings.uiTexts || {};
    const existing = current[key] || { ar: '', en: '', th: '', visible: true };
    updateSettings({
      uiTexts: {
        ...current,
        [key]: {
          ...existing,
          ...patch,
        },
      },
    });
  };

  const updateItemTranslationField = (
    itemId: string,
    patch: Partial<PortalContentItem>
  ) => {
    onUpdatePortalData({
      ...portalData,
      items: portalData.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
    });
  };

  const moveSectionOrder = (idx: number, delta: number) => {
    const list = [...portalData.settings.sections].sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    const renumbered = list.map((s, i) => ({ ...s, sortOrder: i + 1 }));
    updateSettings({ sections: renumbered });
  };

  const sectionItems = useMemo(
    () =>
      portalData.items
        .filter((it) => it.section === activeContentSection)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [portalData.items, activeContentSection]
  );

  const handleSaveEditingItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.title.trim()) return;

    let finalized = { ...editingItem };
    if (finalized.section === 'gallery') {
      const cleanArr = (finalized.galleryImages || [])
        .map((u) => u.trim())
        .filter(Boolean);
      const primary = finalized.mediaUrl?.trim() || cleanArr[0] || '';
      const mergedArr = cleanArr.length > 0 ? cleanArr : primary ? [primary] : [];
      finalized.galleryImages = mergedArr;
      finalized.mediaUrl = mergedArr[0] || primary;
    }

    const exists = portalData.items.some((x) => x.id === finalized.id);
    const nextItems = exists
      ? portalData.items.map((x) => (x.id === finalized.id ? finalized : x))
      : [...portalData.items, finalized];
    const nextData: PortalPublicData = { ...portalData, items: nextItems };
    onUpdatePortalData(nextData);
    setEditingItem(null);
    setGalleryUrlDraft('');
  };

  const handleMoveItem = (itemId: string, delta: number) => {
    const list = [...sectionItems];
    const idx = list.findIndex((i) => i.id === itemId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const temp = list[idx];
    list[idx] = list[target];
    list[target] = temp;
    const reorderedMap = new Map(list.map((it, i) => [it.id, i + 1]));
    onUpdatePortalData({
      ...portalData,
      items: portalData.items.map((it) =>
        reorderedMap.has(it.id) ? { ...it, sortOrder: reorderedMap.get(it.id)! } : it
      ),
    });
  };

  const handleSaveEditingQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editingQuestion.label.trim()) return;
    const cleanOptions =
      editingQuestion.type === 'select'
        ? optionsDraft
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const finalized: RegistrationQuestion = {
      ...editingQuestion,
      options: cleanOptions,
    };
    const exists = questions.some((q) => q.id === finalized.id);
    const nextList = exists
      ? questions.map((q) => (q.id === finalized.id ? finalized : q))
      : [...questions, finalized];
    onUpdateQuestions(nextList);
    setEditingQuestion(null);
  };

  const handleMoveQuestion = (qId: string, delta: number) => {
    const list = [...questions].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const idx = list.findIndex((q) => q.id === qId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= list.length) return;
    const temp = list[idx];
    list[idx] = list[target];
    list[target] = temp;
    onUpdateQuestions(list.map((q, i) => ({ ...q, sortOrder: i + 1 })));
  };

  const handleTransferStudent = async (sub: RegistrationSubmissionRecord) => {
    const chosenProgId =
      transferProgramMap[sub.registrationId] ||
      programs.find((p) => p.id !== portalData.settings.stage1DefaultProgramId)?.id ||
      sub.programId;
    const progObj = programs.find((p) => p.id === chosenProgId);
    const targetProgName = progObj?.name || chosenProgId;
    const isStage1 = chosenProgId === portalData.settings.stage1DefaultProgramId;

    setTransferringId(sub.registrationId);
    setBanner(null);
    try {
      const res = await transferRegistrationStageInSheets(webhookUrl, {
        registrationId: sub.registrationId,
        studentName: sub.studentName,
        targetProgramId: chosenProgId,
        targetProgramName: targetProgName,
        stage: isStage1 ? 'stage1_default' : 'stage2_assigned',
        accountStatus: 'مفعّل',
        adminNotes:
          transferNotesMap[sub.registrationId] !== undefined
            ? transferNotesMap[sub.registrationId]
            : sub.adminNotes,
        notifyStudentTelegram: portalData.settings.notifyStudentTelegramOnTransfer,
      });

      setBanner({
        success: res.success,
        text: res.tgNotifiedStudent
          ? `${res.message} (تم إرسال إشعار القبول والترقية للطالب عبر تيليغرام)`
          : res.message,
      });

      await loadSubmissions();
      if (onRefreshRegistrants) onRefreshRegistrants();
    } finally {
      setTransferringId(null);
    }
  };

  const handleTogglePauseStudent = async (sub: RegistrationSubmissionRecord) => {
    const nextPaused = sub.stage !== 'paused';
    setTransferringId(sub.registrationId);
    try {
      const progObj = programs.find((p) => p.id === sub.programId);
      const res = await transferRegistrationStageInSheets(webhookUrl, {
        registrationId: sub.registrationId,
        studentName: sub.studentName,
        targetProgramId: sub.programId,
        targetProgramName: progObj?.name || sub.programId,
        stage: nextPaused
          ? 'paused'
          : sub.programId === portalData.settings.stage1DefaultProgramId
          ? 'stage1_default'
          : 'stage2_assigned',
        accountStatus: nextPaused ? 'معطّل' : 'مفعّل',
        notifyStudentTelegram: false,
      });
      setBanner({ success: res.success, text: res.message });
      await loadSubmissions();
      if (onRefreshRegistrants) onRefreshRegistrants();
    } finally {
      setTransferringId(null);
    }
  };

  const handleConfirmDeleteSub = async (sub: RegistrationSubmissionRecord) => {
    setBusy(true);
    try {
      const res = await deleteRegistrationSubmissionInSheets(
        webhookUrl,
        sub.registrationId,
        sub.rowIndex
      );
      setBanner({ success: res.success, text: res.message });
      setConfirmDeleteId(null);
      await loadSubmissions();
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateProgramReq = async (
    req: ProgramRequestRecord,
    nextStatus: ProgramRequestStatus
  ) => {
    const chosenProgId =
      reqTargetMap[req.requestId] ||
      req.targetProgramId ||
      programs.find((p) => p.id !== portalData.settings.stage1DefaultProgramId)?.id ||
      programs[0]?.id ||
      '';
    const progObj = programs.find((p) => p.id === chosenProgId);
    const chosenProgName = progObj?.name || req.targetProgramTitle;

    setProcessingReqId(req.requestId);
    setBanner(null);
    try {
      const res = await updateProgramRequestStatusInSheets(webhookUrl, {
        requestId: req.requestId,
        rowIndex: req.rowIndex,
        registrationId: req.registrationId,
        studentName: req.studentName,
        status: nextStatus,
        targetProgramId: chosenProgId,
        targetProgramName: chosenProgName,
        adminNotes:
          reqNotesMap[req.requestId] !== undefined ? reqNotesMap[req.requestId] : req.adminNotes,
        notifyStudentTelegram:
          nextStatus === 'approved' && portalData.settings.notifyStudentTelegramOnTransfer !== false,
      });

      setBanner({
        success: res.success,
        text: res.tgNotifiedStudent
          ? `${res.message} (تم إشعار المشترك على تيليغرام ونقله للبرنامج)`
          : res.message,
      });

      await Promise.all([loadProgramRequests(), loadSubmissions()]);
      if (onRefreshRegistrants) onRefreshRegistrants();
    } finally {
      setProcessingReqId(null);
    }
  };

  const handleConfirmDeleteProgramReq = async (req: ProgramRequestRecord) => {
    setBusy(true);
    try {
      const res = await deleteProgramRequestInSheets(webhookUrl, req.requestId, req.rowIndex);
      setBanner({ success: res.success, text: res.message });
      setConfirmDeleteReqId(null);
      await loadProgramRequests();
    } finally {
      setBusy(false);
    }
  };

  const copyTextWithBadge = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const registrationUrl = buildRegistrationShareUrl();

  return (
    <div className="space-y-5 font-cairo">
      {/* Section Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              إدارة البوابة العامة والتسجيل وبرامج الالتحاق
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              وحدة معزولة بالكامل لإدارة الواجهة العامة، قنوات التواصل، الترجمات وإظهار الأزرار،
              أسئلة التسجيل (<code className="font-mono text-emerald-800">أسئلة_التسجيل</code>)،
              المرحلة 1 و 2 (<code className="font-mono text-emerald-800">طلبات_التسجيل</code>)،
              وطلبات البرامج (<code className="font-mono text-emerald-800">طلبات_البرامج</code>).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => copyTextWithBadge('header_reg', registrationUrl)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {copiedKey === 'header_reg' ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>
              {copiedKey === 'header_reg' ? 'تم نسخ رابط التسجيل!' : 'نسخ رابط التسجيل المستقل'}
            </span>
          </button>

          {onPreviewPublicPortal && (
            <button
              type="button"
              onClick={onPreviewPublicPortal}
              className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>معاينة البوابة العامة</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tabs Navigation (All isolated within PortalAdminManager) */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSubTab('submissions')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'submissions'
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>طلبات التسجيل والمرحلة 1 ({stageCounts.total})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('programRequests')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'programRequests'
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>
            طلبات البرامج ({reqCounts.pending > 0 ? `${reqCounts.pending} جديد` : reqCounts.total})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('content')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'content'
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>محتوى البوابة وقنوات التواصل</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('translations')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'translations'
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Languages className="w-4 h-4" />
          <span>النصوص والأزرار والترجمة</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('questions')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'questions'
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ListChecks className="w-4 h-4" />
          <span>أسئلة استمارة التسجيل ({questions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('store')}
          className={`px-3.5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'store'
              ? 'bg-emerald-900 text-white border-emerald-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>المتجر وتسويق البرامج</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            banner.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ================================================================
          SUB-TAB 1: SUBMISSIONS & TWO-STAGE PROMOTION + ONBOARDING SETTINGS
         ================================================================ */}
      {subTab === 'submissions' && (
        <div className="space-y-5">
          {/* Standalone Registration Link Bar */}
          <div className="bg-emerald-50/70 rounded-2xl p-3.5 sm:p-4 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-emerald-950 font-bold min-w-0">
              <Link2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="shrink-0">رابط صفحة التسجيل المستقل للمتقدمين الجدد:</span>
              <code
                dir="ltr"
                className="px-2 py-1 rounded-lg bg-white border border-emerald-200 font-mono text-[11px] truncate max-w-[260px] sm:max-w-md"
              >
                {registrationUrl}
              </code>
            </div>
            <button
              type="button"
              onClick={() => copyTextWithBadge('sub_reg_bar', registrationUrl)}
              className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
            >
              {copiedKey === 'sub_reg_bar' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'sub_reg_bar' ? 'تم النسخ!' : 'نسخ رابط التسجيل'}</span>
            </button>
          </div>

          {/* Two-Stage Onboarding & Telegram & Welcome Email Settings Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  إعدادات المرحلة الأولى والربط مع تيليغرام والبريد الإلكتروني
                </h3>
                <p className="text-xs text-slate-500">
                  يحدد البرنامج الافتراضي للدخول الفوري، وإرسال رسالة البريد بالرقم التسجيلي للمشترك.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSavePortal()}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{busy ? 'جاري الحفظ...' : 'حفظ الإعدادات في الشيت'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  البرنامج الافتراضي (المرحلة 1 فور التسجيل):
                </label>
                <select
                  value={portalData.settings.stage1DefaultProgramId}
                  onChange={(e) => updateSettings({ stage1DefaultProgramId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  اسم مستخدم بوت تيليغرام (لرابط الدخول المباشر بعد التسجيل):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={portalData.settings.telegramBotUsername}
                  onChange={(e) =>
                    updateSettings({ telegramBotUsername: e.target.value.replace(/^@/, '') })
                  }
                  placeholder="my_academy_bot"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  بريد الإدارة لاستلام نسخة من طلبات التسجيل (اختياري):
                </label>
                <input
                  type="email"
                  dir="ltr"
                  value={portalData.settings.adminNotificationEmail || ''}
                  onChange={(e) => updateSettings({ adminNotificationEmail: e.target.value })}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  عنوان شريط الترحيب لطالب المرحلة الأولى:
                </label>
                <input
                  type="text"
                  value={portalData.settings.stage1BannerTitle}
                  onChange={(e) => updateSettings({ stage1BannerTitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  نص الإرشادات التمهيدية لطالب المرحلة الأولى:
                </label>
                <input
                  type="text"
                  value={portalData.settings.stage1BannerBody}
                  onChange={(e) => updateSettings({ stage1BannerBody: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 pt-1 text-xs font-bold text-slate-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={portalData.settings.sendStudentWelcomeEmail !== false}
                  onChange={(e) => updateSettings({ sendStudentWelcomeEmail: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-700"
                />
                <span>إرسال بريد ترحيبي للمشترك يحتوي رقم الـ ID ورابط تيليغرام فور التسجيل</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={portalData.settings.notifyAdminTelegramOnRegister !== false}
                  onChange={(e) =>
                    updateSettings({ notifyAdminTelegramOnRegister: e.target.checked })
                  }
                  className="rounded border-slate-300 text-emerald-700"
                />
                <span>إرسال إشعار فوري للإدارة عبر تيليغرام عند تسجيل متقدم جديد</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={portalData.settings.notifyStudentTelegramOnTransfer !== false}
                  onChange={(e) =>
                    updateSettings({ notifyStudentTelegramOnTransfer: e.target.checked })
                  }
                  className="rounded border-slate-300 text-emerald-700"
                />
                <span>إشعار الطالب عبر تيليغرام عند تحويله إلى برنامج المرحلة الثانية</span>
              </label>
            </div>
          </div>

          {/* Submissions List */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: 'all', label: `الكل (${stageCounts.total})` },
                    { key: 'stage1_default', label: `المرحلة 1 · القسم الافتراضي (${stageCounts.s1})` },
                    { key: 'stage2_assigned', label: `المرحلة 2 · تم التحويل (${stageCounts.s2})` },
                    { key: 'paused', label: `معلّق / موقوف (${stageCounts.paused})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStageFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                      stageFilter === tab.key
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-60">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ابحث بالاسم أو رقم ID أو الهاتف..."
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={loadSubmissions}
                  disabled={loadingSubmissions}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSubmissions ? 'animate-spin' : ''}`} />
                  <span>تحديث</span>
                </button>
              </div>
            </div>

            {filteredSubmissions.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-slate-700">
                  لا توجد طلبات تسجيل مطابقة للعرض حالياً
                </div>
                <p className="text-xs text-slate-500">
                  بمجرد تعبئة استمارة التسجيل من البوابة العامة ستظهر السجلات هنا جاهزة للمراجعة
                  والتحويل.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSubmissions.map((sub) => {
                  const currentProgObj = programs.find((p) => p.id === sub.programId);
                  const selectedTarget =
                    transferProgramMap[sub.registrationId] ||
                    programs.find((p) => p.id !== portalData.settings.stage1DefaultProgramId)?.id ||
                    sub.programId;

                  return (
                    <div
                      key={`${sub.registrationId}-${sub.rowIndex || sub.submittedAt}`}
                      className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-extrabold tabular-nums">
                            ID: {sub.registrationId}
                          </span>
                          <span className="text-sm font-extrabold text-slate-900">
                            {sub.studentName}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {sub.submittedAt}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                          <span
                            className={`px-2.5 py-1 rounded-lg border ${
                              sub.stage === 'stage2_assigned'
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                : sub.stage === 'paused'
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : 'bg-amber-50 text-amber-900 border-amber-200'
                            }`}
                          >
                            {sub.status ||
                              (sub.stage === 'stage2_assigned'
                                ? `المرحلة 2 · ${currentProgObj?.name || sub.programId}`
                                : 'المرحلة 1 · القسم الافتراضي')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                        <div className="lg:col-span-5 space-y-1.5 text-slate-700">
                          {sub.phone && (
                            <div>
                              <span className="font-bold text-slate-500">الهاتف: </span>
                              <span dir="ltr" className="font-mono font-bold">
                                {sub.phone}
                              </span>
                            </div>
                          )}
                          {sub.email && (
                            <div>
                              <span className="font-bold text-slate-500">البريد: </span>
                              <span>{sub.email}</span>
                            </div>
                          )}
                          {sub.telegramUsername && (
                            <div className="flex items-center gap-1.5">
                              <Bot className="w-3.5 h-3.5 text-sky-600" />
                              <span className="font-bold text-sky-800 dir-ltr">
                                {sub.telegramUsername}
                              </span>
                            </div>
                          )}

                          {sub.attachments && sub.attachments.length > 0 && (
                            <div className="pt-1 flex flex-wrap gap-2">
                              {sub.attachments.map((att, aIdx) => (
                                <a
                                  key={aIdx}
                                  href={sanitizeExternalUrl(att.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 text-emerald-800 font-bold inline-flex items-center gap-1.5"
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  <span className="truncate max-w-[140px]">
                                    {att.questionLabel || 'مرفق Drive'}
                                  </span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/80 p-3 space-y-1">
                          {Object.entries(sub.answers || {}).map(([qLabel, ansVal]) => (
                            <div key={qLabel} className="text-xs leading-relaxed">
                              <span className="font-bold text-slate-500">{qLabel}: </span>
                              <span className="font-semibold text-slate-900 break-words">
                                {String(ansVal).startsWith('http') ? (
                                  <a
                                    href={sanitizeExternalUrl(String(ansVal))}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-700 hover:underline"
                                  >
                                    فتح الرابط المرفق
                                  </a>
                                ) : (
                                  ansVal
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/70 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          <select
                            value={selectedTarget}
                            onChange={(e) =>
                              setTransferProgramMap((p) => ({
                                ...p,
                                [sub.registrationId]: e.target.value,
                              }))
                            }
                            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold min-w-[190px]"
                          >
                            {programs.map((prog) => (
                              <option key={prog.id} value={prog.id}>
                                {prog.name}
                                {prog.id === portalData.settings.stage1DefaultProgramId
                                  ? ' (الافتراضي)'
                                  : ''}
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={
                              transferNotesMap[sub.registrationId] !== undefined
                                ? transferNotesMap[sub.registrationId]
                                : sub.adminNotes || ''
                            }
                            onChange={(e) =>
                              setTransferNotesMap((p) => ({
                                ...p,
                                [sub.registrationId]: e.target.value,
                              }))
                            }
                            placeholder="ملاحظة إدارية (اختياري)..."
                            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs flex-1 min-w-[160px]"
                          />

                          <button
                            type="button"
                            onClick={() => handleTransferStudent(sub)}
                            disabled={transferringId === sub.registrationId}
                            className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>
                              {transferringId === sub.registrationId
                                ? 'جاري التحويل...'
                                : 'تحويل وترقية إلى البرنامج'}
                            </span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleTogglePauseStudent(sub)}
                            disabled={transferringId === sub.registrationId}
                            className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-slate-300 text-xs font-bold cursor-pointer"
                          >
                            {sub.stage === 'paused' ? 'إعادة التفعيل' : 'تعليق مؤقت'}
                          </button>

                          {confirmDeleteId === sub.registrationId ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleConfirmDeleteSub(sub)}
                                className="px-2.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                              >
                                تأكيد الحذف
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(sub.registrationId)}
                              className="p-2 rounded-xl text-rose-700 hover:bg-rose-50 border border-slate-200 cursor-pointer"
                              title="حذف الطلب"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================
          SUB-TAB 2: PROGRAM ENROLLMENT REQUESTS (ورقة: "طلبات_البرامج")
         ================================================================ */}
      {subTab === 'programRequests' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                طلبات التحاق المشتركين بالبرامج (ورقة طلبات_البرامج)
              </h3>
              <p className="text-xs text-slate-500">
                الطلبات الواردة من بطاقات البرامج أو الروابط المستقلة بعد تحقق النظام من اسم ورقم ID
                المشترك.
              </p>
            </div>

            <button
              type="button"
              onClick={loadProgramRequests}
              disabled={loadingProgramRequests}
              className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer self-start md:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingProgramRequests ? 'animate-spin' : ''}`} />
              <span>تحديث من الشيت</span>
            </button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'all', label: `الكل (${reqCounts.total})` },
                  { key: 'pending', label: `قيد المراجعة (${reqCounts.pending})` },
                  { key: 'approved', label: `تم الاعتماد والنقل (${reqCounts.approved})` },
                  { key: 'rejected', label: `مؤجل / مرفوض (${reqCounts.rejected})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setReqFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                    reqFilter === tab.key
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                placeholder="بحث باسم المشترك أو ID أو البرنامج..."
                className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>
          </div>

          {filteredProgramRequests.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <ClipboardCheck className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-700">
                لا توجد طلبات برامج في هذه القائمة حالياً
              </div>
              <p className="text-xs text-slate-500">
                عندما يضغط مشترك مسجل على «طلب الالتحاق بالبرنامج» أو يزور رابط البرنامج المستقل
                ويؤكد بياناته، سيصل طلبه هنا للمراجعة والاعتماد.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProgramRequests.map((req) => {
                const selectedProgId =
                  reqTargetMap[req.requestId] ||
                  req.targetProgramId ||
                  programs.find((p) => p.id !== portalData.settings.stage1DefaultProgramId)?.id ||
                  programs[0]?.id ||
                  '';

                return (
                  <div
                    key={req.requestId}
                    className="p-4 sm:p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono text-xs font-extrabold tabular-nums">
                          ID: {req.registrationId}
                        </span>
                        <span className="text-sm font-extrabold text-slate-900">
                          {req.studentName}
                        </span>
                        <span className="text-xs font-mono text-slate-500">{req.requestId}</span>
                        <span className="text-xs text-slate-500">{req.requestedAt}</span>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${
                          req.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : req.status === 'rejected'
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-amber-50 text-amber-900 border-amber-200'
                        }`}
                      >
                        {req.statusLabel ||
                          (req.status === 'approved'
                            ? 'تم الاعتماد والنقل'
                            : req.status === 'rejected'
                            ? 'مؤجل / مرفوض'
                            : 'قيد المراجعة')}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                        <div className="text-slate-500 font-bold">البرنامج المطلوب الالتحاق به:</div>
                        <div className="font-extrabold text-emerald-900 text-sm">
                          {req.targetProgramTitle}
                        </div>
                        {req.currentProgramId && (
                          <div className="text-[11px] text-slate-500">
                            القسم الحالي: <span className="font-bold">{req.currentProgramId}</span>
                          </div>
                        )}
                        {(req.source === 'store' || req.paymentMethod || req.phone) && (
                          <div className="text-[11px] text-amber-800 font-bold flex flex-wrap gap-2 pt-1">
                            {req.source === 'store' && <span>وارد من المتجر</span>}
                            {req.phone && <span dir="ltr" className="font-mono">جوال: {req.phone}</span>}
                            {req.pricePaid !== undefined && (
                              <span>
                                الرسوم: {req.pricePaid > 0 ? `${req.pricePaid} ${resolvedStoreData.settings.currency}` : 'مجاني'}
                              </span>
                            )}
                            {req.bankReference && <span>مرجع الحوالة: {req.bankReference}</span>}
                          </div>
                        )}
                      </div>

                      <div className="p-3 rounded-xl bg-white border border-slate-200/80 space-y-1">
                        <div className="text-slate-500 font-bold">ملاحظة المشترك:</div>
                        <div className="text-slate-800 font-medium">
                          {req.studentNote ? req.studentNote : '— لم يضف المشترك ملاحظة —'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/70 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <select
                          value={selectedProgId}
                          onChange={(e) =>
                            setReqTargetMap((p) => ({ ...p, [req.requestId]: e.target.value }))
                          }
                          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold min-w-[190px]"
                        >
                          {programs.map((prog) => (
                            <option key={prog.id} value={prog.id}>
                              {prog.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          value={
                            reqNotesMap[req.requestId] !== undefined
                              ? reqNotesMap[req.requestId]
                              : req.adminNotes || ''
                          }
                          onChange={(e) =>
                            setReqNotesMap((p) => ({ ...p, [req.requestId]: e.target.value }))
                          }
                          placeholder="ملاحظة إدارية..."
                          className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs flex-1 min-w-[150px]"
                        />

                        <button
                          type="button"
                          onClick={() => handleUpdateProgramReq(req, 'approved')}
                          disabled={processingReqId === req.requestId}
                          className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          <span>
                            {processingReqId === req.requestId
                              ? 'جاري الاعتماد...'
                              : 'اعتماد ونقل المشترك للبرنامج'}
                          </span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateProgramReq(req, 'rejected')}
                          disabled={processingReqId === req.requestId}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-slate-300 text-xs font-bold cursor-pointer"
                        >
                          تأجيل / رفض
                        </button>

                        {confirmDeleteReqId === req.requestId ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteProgramReq(req)}
                              className="px-2.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
                            >
                              تأكيد
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteReqId(null)}
                              className="px-2.5 py-2 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteReqId(req.requestId)}
                            className="p-2 rounded-xl text-rose-700 hover:bg-rose-50 border border-slate-200 cursor-pointer"
                            title="حذف الطلب"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================
          SUB-TAB 3: PUBLIC PORTAL CMS & SOCIAL CHANNELS
         ================================================================ */}
      {subTab === 'content' && (
        <div className="space-y-5">
          {/* Cloud Actions Bar */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-600">
              عدّل بيانات البوابة التعريفية وأقسامها وقنوات التواصل، ثم اضغط حفظ للمزامنة مع ورقة{' '}
              <code className="font-mono text-emerald-800">محتوى_البوابة_العامة</code>.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePullPortal}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                <span>سحب من الشيت</span>
              </button>
              <button
                type="button"
                onClick={() => handleSavePortal()}
                disabled={busy}
                className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ ومزامنة البوابة العامة</span>
              </button>
            </div>
          </div>

          {/* Identity, Hero, Hero Overlay & Contact Details */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-100">
              الهوية، القسم الترحيبي، نص صورة الواجهة، ومعلومات التواصل
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">اسم المؤسسة / الأكاديمية:</label>
                <input
                  type="text"
                  value={portalData.settings.academyName}
                  onChange={(e) => updateSettings({ academyName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">شعار المؤسسة (رابط الصورة اختياري):</label>
                <input
                  type="text"
                  dir="ltr"
                  value={portalData.settings.logoUrl || ''}
                  onChange={(e) => updateSettings({ logoUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">العنوان الرئيسي في الواجهة (Hero Title):</label>
                <input
                  type="text"
                  value={portalData.settings.heroTitle}
                  onChange={(e) => updateSettings({ heroTitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">صورة الواجهة الرئيسية (رابط الصورة):</label>
                <input
                  type="text"
                  dir="ltr"
                  value={portalData.settings.heroMediaUrl || ''}
                  onChange={(e) => updateSettings({ heroMediaUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              {/* Hero Image Overlay Tagline Control */}
              <div className="md:col-span-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-extrabold text-slate-800">
                    النص الظاهر داخل صورة الواجهة الرئيسية (Tagline Overlay):
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-emerald-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={portalData.settings.showHeroOverlay !== false}
                      onChange={(e) => updateSettings({ showHeroOverlay: e.target.checked })}
                    />
                    <span>إظهار الشريط النصي فوق صورة الواجهة</span>
                  </label>
                </div>
                <input
                  type="text"
                  value={portalData.settings.academyTagline}
                  onChange={(e) => updateSettings({ academyTagline: e.target.value })}
                  placeholder="منهجية تدريبية متدرجة..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-slate-700">النص الترحيبي للواجهة (Hero Subtitle):</label>
                <textarea
                  rows={2}
                  value={portalData.settings.heroSubtitle}
                  onChange={(e) => updateSettings({ heroSubtitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div className="md:col-span-4 flex items-center gap-2">
                  <input
                    id="ann-enabled"
                    type="checkbox"
                    checked={portalData.settings.announcementEnabled}
                    onChange={(e) => updateSettings({ announcementEnabled: e.target.checked })}
                  />
                  <label htmlFor="ann-enabled" className="text-xs font-bold text-slate-800 cursor-pointer">
                    تفعيل شريط التنبيه العلوي:
                  </label>
                </div>
                <div className="md:col-span-4">
                  <input
                    type="text"
                    value={portalData.settings.announcementText}
                    onChange={(e) => updateSettings({ announcementText: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div className="md:col-span-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-extrabold text-slate-800 mb-2">
                  بيانات التواصل الأساسية (أي حقل تتركه فارغاً يتم إخفاء بطاقته تلقائياً من الصفحة العامة)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">الهاتف:</label>
                    <input
                      type="text"
                      dir="ltr"
                      value={portalData.settings.contactPhone}
                      onChange={(e) => updateSettings({ contactPhone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">البريد الإلكتروني:</label>
                    <input
                      type="email"
                      dir="ltr"
                      value={portalData.settings.contactEmail}
                      onChange={(e) => updateSettings({ contactEmail: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">العنوان / المقر (اتركه فارغاً للأونلاين):</label>
                    <input
                      type="text"
                      value={portalData.settings.contactAddress}
                      onChange={(e) => updateSettings({ contactAddress: e.target.value })}
                      placeholder="فارغ = مخفي في الصفحة"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">أوقات الدوام:</label>
                    <input
                      type="text"
                      value={portalData.settings.contactHours}
                      onChange={(e) => updateSettings({ contactHours: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Social Channels Manager */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-2.5">
                <Share2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    قنوات التواصل الاجتماعي (فيسبوك / إنستغرام / يوتيوب / لاين / وغيرها)
                  </h3>
                  <p className="text-xs text-slate-500">
                    تظهر القنوات التي تحتوي على رابط ومفعّلة في قسم «تواصل معنا» وفي الشريط السفلي
                    للصفحة.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { appName: 'Facebook', iconKey: 'facebook' },
                    { appName: 'Instagram', iconKey: 'instagram' },
                    { appName: 'YouTube', iconKey: 'youtube' },
                    { appName: 'LINE', iconKey: 'line' },
                    { appName: 'WhatsApp', iconKey: 'whatsapp' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.iconKey}
                    type="button"
                    onClick={() => addSocialChannel(preset)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-emerald-700" />
                    <span>{preset.appName}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => addSocialChannel()}
                  className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>قناة مخصصة</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {[...(portalData.settings.socialChannels || [])]
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                .map((ch, idx, arr) => (
                  <div
                    key={ch.id}
                    className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center"
                  >
                    <div className="lg:col-span-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateSocialChannel(ch.id, { enabled: !ch.enabled })}
                        className={`p-1.5 rounded-lg cursor-pointer shrink-0 ${
                          ch.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                        }`}
                        title={ch.enabled ? 'إخفاء القناة' : 'إظهار القناة'}
                      >
                        {ch.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>

                      <input
                        type="text"
                        value={ch.appName}
                        onChange={(e) => updateSocialChannel(ch.id, { appName: e.target.value })}
                        placeholder="اسم التطبيق"
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                      />
                    </div>

                    <div className="lg:col-span-3">
                      <select
                        value={ch.iconKey}
                        onChange={(e) =>
                          updateSocialChannel(ch.id, {
                            iconKey: e.target.value as PortalSocialIconKey,
                          })
                        }
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                      >
                        {Object.entries(SOCIAL_ICON_LABELS).map(([k, lbl]) => (
                          <option key={k} value={k}>
                            {lbl}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="lg:col-span-4 space-y-1.5">
                      <input
                        type="url"
                        dir="ltr"
                        value={ch.url}
                        onChange={(e) => updateSocialChannel(ch.id, { url: e.target.value })}
                        placeholder="https://... (اتركه فارغاً لإخفاء القناة)"
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                      {ch.iconKey === 'custom' && (
                        <input
                          type="url"
                          dir="ltr"
                          value={ch.iconUrl || ''}
                          onChange={(e) => updateSocialChannel(ch.id, { iconUrl: e.target.value })}
                          placeholder="رابط صورة الأيقونة المخصصة (PNG/SVG)"
                          className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-[11px]"
                        />
                      )}
                    </div>

                    <div className="lg:col-span-2 flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveSocialChannel(idx, -1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === arr.length - 1}
                        onClick={() => moveSocialChannel(idx, 1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSocialChannel(ch.id)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Sections Visibility & Ordering */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              ترتيب وإظهار أقسام الصفحة التعريفية
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {[...portalData.settings.sections]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((sec, idx, arr) => (
                  <div
                    key={sec.key}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          const next = portalData.settings.sections.map((s) =>
                            s.key === sec.key ? { ...s, enabled: !s.enabled } : s
                          );
                          updateSettings({ sections: next });
                        }}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          sec.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'
                        }`}
                        title={sec.enabled ? 'إخفاء القسم' : 'إظهار القسم'}
                      >
                        {sec.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <span className="text-xs font-bold text-slate-800 truncate">{sec.label}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveSectionOrder(idx, -1)}
                        className="p-1 rounded-lg hover:bg-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === arr.length - 1}
                        onClick={() => moveSectionOrder(idx, 1)}
                        className="p-1 rounded-lg hover:bg-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Section Cards Manager */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['about', 'gallery', 'videos'] as const).map((secKey) => (
                  <button
                    key={secKey}
                    type="button"
                    onClick={() => {
                      setActiveContentSection(secKey);
                      setEditingItem(null);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                      activeContentSection === secKey
                        ? 'bg-emerald-800 text-white border-emerald-800'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {CONTENT_SECTION_LABELS[secKey]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSubTab('store')}
                  className="px-3 py-2 rounded-xl text-[11px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                >
                  إدارة البرامج ← من تبويب المتجر
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const defaultAction: PortalItemActionType = 'none';
                  setGalleryUrlDraft('');
                  setEditingItem({
                    id: `pitem_${Date.now()}`,
                    section: activeContentSection,
                    title: '',
                    subtitle: '',
                    description: '',
                    mediaUrl: '',
                    galleryImages: activeContentSection === 'gallery' ? [] : undefined,
                    thumbnailUrl: '',
                    linkUrl: '',
                    linkLabel: '',
                    badgeText: '',
                    metaPrimary: '',
                    metaSecondary: '',
                    actionType: defaultAction,
                    enabled: true,
                    sortOrder: sectionItems.length + 1,
                  });
                }}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة بطاقة جديدة</span>
              </button>
            </div>

            {editingItem && (
              <form
                onSubmit={handleSaveEditingItem}
                className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">
                    تحرير بطاقة في: {CONTENT_SECTION_LABELS[activeContentSection]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={editingItem.title}
                    onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                    placeholder="العنوان الرئيسي *"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={editingItem.subtitle || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, subtitle: e.target.value })}
                    placeholder="عنوان فرعي (اختياري)"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />

                  {editingItem.section !== 'gallery' && (
                    <input
                      type="text"
                      dir="ltr"
                      value={editingItem.mediaUrl || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, mediaUrl: e.target.value })}
                      placeholder={
                        editingItem.section === 'videos'
                          ? 'رابط الفيديو (YouTube / Google Drive / MP4)'
                          : 'رابط صورة أو وسائط (URL / Drive)'
                      }
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                  )}

                  {editingItem.section === 'videos' && (
                    <input
                      type="text"
                      dir="ltr"
                      value={editingItem.thumbnailUrl || ''}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, thumbnailUrl: e.target.value })
                      }
                      placeholder="رابط صورة مصغرة أو GIF متحركة (تلقائي ليوتيوب إن تُرك فارغاً)"
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                  )}

                  <input
                    type="text"
                    value={editingItem.badgeText || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, badgeText: e.target.value })}
                    placeholder="تصنيف مختصر (مثال: ٠١ · المنهجية)"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />

                  <input
                    type="text"
                    value={editingItem.linkLabel || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, linkLabel: e.target.value })}
                    placeholder={
                      editingItem.section === 'videos'
                        ? 'نص الزر أسفل الفيديو (اتركه فارغاً للاكتفاء بالضغط على الصورة)'
                        : 'نص الزر على البطاقة (اتركه فارغاً لإخفاء الزر)'
                    }
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editingItem.metaPrimary || ''}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, metaPrimary: e.target.value })
                      }
                      placeholder="تفصيل 1"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                    <input
                      type="text"
                      value={editingItem.metaSecondary || ''}
                      onChange={(e) =>
                        setEditingItem({ ...editingItem, metaSecondary: e.target.value })
                      }
                      placeholder="تفصيل 2"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                  </div>

                  {/* Action Config for About & Programs */}
                  {(editingItem.section === 'about' || editingItem.section === 'programs') && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">
                          وظيفة الزر عند الضغط:
                        </label>
                        <select
                          value={editingItem.actionType || 'none'}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              actionType: e.target.value as PortalItemActionType,
                            })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        >
                          {Object.entries(ACTION_TYPE_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(editingItem.actionType === 'external_url' ||
                        editingItem.actionType === 'scroll_section') && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-600">
                            {editingItem.actionType === 'scroll_section'
                              ? 'معرّف القسم في الصفحة (#portal-programs ...)'
                              : 'الرابط الخارجي (https://...)'}
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={editingItem.linkUrl || ''}
                            onChange={(e) =>
                              setEditingItem({ ...editingItem, linkUrl: e.target.value })
                            }
                            placeholder={
                              editingItem.actionType === 'scroll_section'
                                ? '#portal-programs'
                                : 'https://...'
                            }
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Extra fields for Programs: targetProgramId & Slug */}
                  {editingItem.section === 'programs' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">
                          البرنامج المقابل في جدول الدورات (لتسريع نقل الطالب):
                        </label>
                        <select
                          value={editingItem.targetProgramId || ''}
                          onChange={(e) =>
                            setEditingItem({ ...editingItem, targetProgramId: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        >
                          <option value="">— اختيار يدوي عند المراجعة —</option>
                          {programs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">
                          معرّف الرابط المستقل للبرنامج (Slug):
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={editingItem.slug || ''}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              slug: e.target.value.replace(/\s+/g, '-'),
                            })
                          }
                          placeholder="beginner-program"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono"
                        />
                      </div>
                    </>
                  )}

                  {/* Multi-Image Slider Editor for Gallery */}
                  {editingItem.section === 'gallery' && (
                    <div className="md:col-span-2 p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5">
                      <div className="text-xs font-extrabold text-slate-800">
                        صور السلايدر في هذه البطاقة ({(editingItem.galleryImages || []).length} صور)
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="url"
                          dir="ltr"
                          value={galleryUrlDraft}
                          onChange={(e) => setGalleryUrlDraft(e.target.value)}
                          placeholder="الصق رابط صورة جديدة لإضافتها إلى المعرض..."
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = galleryUrlDraft.trim();
                            if (!val) return;
                            const nextArr = [...(editingItem.galleryImages || []), val];
                            setEditingItem({
                              ...editingItem,
                              galleryImages: nextArr,
                              mediaUrl: nextArr[0],
                            });
                            setGalleryUrlDraft('');
                          }}
                          className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer shrink-0"
                        >
                          + إضافة صورة
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {(editingItem.galleryImages || []).map((imgU, gIdx) => (
                          <div
                            key={`${imgU}-${gIdx}`}
                            className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                          >
                            <img
                              src={getDirectImageUrl(imgU)}
                              alt={`صورة ${gIdx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            <input
                              type="text"
                              dir="ltr"
                              value={imgU}
                              onChange={(e) => {
                                const nextArr = [...(editingItem.galleryImages || [])];
                                nextArr[gIdx] = e.target.value;
                                setEditingItem({
                                  ...editingItem,
                                  galleryImages: nextArr,
                                  mediaUrl: nextArr[0] || '',
                                });
                              }}
                              className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const nextArr = (editingItem.galleryImages || []).filter(
                                  (_, i) => i !== gIdx
                                );
                                setEditingItem({
                                  ...editingItem,
                                  galleryImages: nextArr,
                                  mediaUrl: nextArr[0] || '',
                                });
                              }}
                              className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    rows={2}
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    placeholder="الوصف التفصيلي..."
                    className="md:col-span-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                  >
                    اعتماد البطاقة (ثم اضغط حفظ لمزامنة الشيت)
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {sectionItems.map((it, idx) => {
                const progUrl = it.section === 'programs' ? buildProgramShareUrl(it) : '';
                return (
                  <div
                    key={it.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {it.mediaUrl ? (
                        <img
                          src={getDirectImageUrl(it.mediaUrl)}
                          alt={it.title}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {it.title}
                          {it.section === 'gallery' &&
                            Array.isArray(it.galleryImages) &&
                            it.galleryImages.length > 1 && (
                              <span className="mr-2 text-[11px] text-emerald-800">
                                ({it.galleryImages.length} صور)
                              </span>
                            )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{it.description}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {it.section === 'programs' && progUrl && (
                        <button
                          type="button"
                          onClick={() => copyTextWithBadge(`prog_${it.id}`, progUrl)}
                          className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `prog_${it.id}` ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedKey === `prog_${it.id}` ? 'تم النسخ!' : 'نسخ رابط البرنامج'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveItem(it.id, -1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === sectionItems.length - 1}
                        onClick={() => handleMoveItem(it.id, 1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryUrlDraft('');
                          setEditingItem({
                            ...it,
                            galleryImages:
                              it.section === 'gallery'
                                ? it.galleryImages && it.galleryImages.length > 0
                                  ? [...it.galleryImages]
                                  : it.mediaUrl
                                  ? [it.mediaUrl]
                                  : []
                                : it.galleryImages,
                          });
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdatePortalData({
                            ...portalData,
                            items: portalData.items.filter((x) => x.id !== it.id),
                          });
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          SUB-TAB 4: TEXTS, BUTTON VISIBILITY & TRANSLATIONS (Isolated)
         ================================================================ */}
      {subTab === 'translations' && (
        <div className="space-y-5">
          {/* Save Banner */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                قسم الترجمة والتحكم الكامل بنصوص وأزرار البوابة العامة
              </h3>
              <p className="text-xs text-slate-500">
                خاص بالبوابة العامة فقط — يمكنك إظهار أو إخفاء أي زر وتعديل نصوصه بالعربية
                والإنجليزية والتايلندية في مكان واحد.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSavePortal()}
              disabled={busy}
              className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{busy ? 'جاري الحفظ...' : 'حفظ ومزامنة الترجمات في الشيت'}</span>
            </button>
          </div>

          {/* 1. Static UI Buttons & Headings (uiTexts) */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h4 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-100">
              1. نصوص وأزرار الواجهة الرئيسية (إظهار / إخفاء + ترجمة)
            </h4>

            <div className="space-y-2.5">
              {PORTAL_UI_TEXT_METADATA.map((meta) => {
                const entry = portalData.settings.uiTexts?.[meta.key] || {
                  ar: '',
                  en: '',
                  th: '',
                  visible: true,
                };
                const isVis = entry.visible !== false;
                return (
                  <div
                    key={meta.key}
                    className="p-3 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold text-[11px]">
                          {meta.group}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">{meta.key}</span>
                        {meta.isButton && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            زر تفاعلي
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => updateUiTextEntry(meta.key, { visible: !isVis })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                          isVis
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isVis ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        <span>{isVis ? 'ظاهر' : 'مخفي'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={entry.ar}
                        onChange={(e) => updateUiTextEntry(meta.key, { ar: e.target.value })}
                        placeholder="النص بالعربية"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={entry.en}
                        onChange={(e) => updateUiTextEntry(meta.key, { en: e.target.value })}
                        placeholder="English Text"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={entry.th}
                        onChange={(e) => updateUiTextEntry(meta.key, { th: e.target.value })}
                        placeholder="ข้อความภาษาไทย"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Academy Identity & Hero Texts Translations */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h4 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-100">
              2. ترجمة بيانات الهوية والقسم الترحيبي وشريط التنبيه
            </h4>

            <div className="space-y-3">
              {(
                [
                  {
                    label: 'اسم المؤسسة / الأكاديمية',
                    arKey: 'academyName',
                    enKey: 'academyNameEn',
                    thKey: 'academyNameTh',
                  },
                  {
                    label: 'نص صورة الواجهة الرئيسية (Tagline)',
                    arKey: 'academyTagline',
                    enKey: 'academyTaglineEn',
                    thKey: 'academyTaglineTh',
                  },
                  {
                    label: 'العنوان الرئيسي (Hero Title)',
                    arKey: 'heroTitle',
                    enKey: 'heroTitleEn',
                    thKey: 'heroTitleTh',
                  },
                  {
                    label: 'النص الترحيبي (Hero Subtitle)',
                    arKey: 'heroSubtitle',
                    enKey: 'heroSubtitleEn',
                    thKey: 'heroSubtitleTh',
                  },
                  {
                    label: 'نص شريط التنبيه العلوي',
                    arKey: 'announcementText',
                    enKey: 'announcementTextEn',
                    thKey: 'announcementTextTh',
                  },
                ] as const
              ).map((row) => (
                <div
                  key={row.arKey}
                  className="p-3 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-1.5"
                >
                  <div className="text-xs font-extrabold text-slate-800">{row.label}</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={(portalData.settings as any)[row.arKey] || ''}
                      onChange={(e) => updateSettings({ [row.arKey]: e.target.value } as any)}
                      placeholder="العربية"
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                    />
                    <input
                      type="text"
                      dir="ltr"
                      value={(portalData.settings as any)[row.enKey] || ''}
                      onChange={(e) => updateSettings({ [row.enKey]: e.target.value } as any)}
                      placeholder="English"
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                    <input
                      type="text"
                      value={(portalData.settings as any)[row.thKey] || ''}
                      onChange={(e) => updateSettings({ [row.thKey]: e.target.value } as any)}
                      placeholder="ภาษาไทย"
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Dynamic Cards Translations */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <h4 className="text-sm font-extrabold text-slate-900">
                3. ترجمة البطاقات والأزرار داخل الأقسام
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {(['programs', 'about', 'gallery', 'videos'] as const).map((secKey) => (
                  <button
                    key={secKey}
                    type="button"
                    onClick={() => setTransItemSection(secKey)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                      transItemSection === secKey
                        ? 'bg-emerald-800 text-white border-emerald-800'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {CONTENT_SECTION_LABELS[secKey]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {portalData.items
                .filter((it) => it.section === transItemSection)
                .map((it) => (
                  <div
                    key={it.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2.5"
                  >
                    <div className="text-xs font-extrabold text-emerald-900">{it.title}</div>

                    {/* Title EN/TH */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={it.title}
                        onChange={(e) => updateItemTranslationField(it.id, { title: e.target.value })}
                        placeholder="العنوان (AR)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={it.titleEn || ''}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { titleEn: e.target.value })
                        }
                        placeholder="Title (EN)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={it.titleTh || ''}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { titleTh: e.target.value })
                        }
                        placeholder="ชื่อเรื่อง (TH)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                    </div>

                    {/* Description EN/TH */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={it.description}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { description: e.target.value })
                        }
                        placeholder="الوصف (AR)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={it.descriptionEn || ''}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { descriptionEn: e.target.value })
                        }
                        placeholder="Description (EN)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={it.descriptionTh || ''}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { descriptionTh: e.target.value })
                        }
                        placeholder="รายละเอียด (TH)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                    </div>

                    {/* Button Label EN/TH */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={it.linkLabel || ''}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { linkLabel: e.target.value })
                        }
                        placeholder="نص الزر (AR)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={it.linkLabelEn || ''}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { linkLabelEn: e.target.value })
                        }
                        placeholder="Button Label (EN)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                      <input
                        type="text"
                        value={it.linkLabelTh || ''}
                        onChange={(e) =>
                          updateItemTranslationField(it.id, { linkLabelTh: e.target.value })
                        }
                        placeholder="ข้อความปุ่ม (TH)"
                        className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          SUB-TAB 5: DYNAMIC REGISTRATION QUESTIONS (أسئلة_التسجيل)
         ================================================================ */}
      {subTab === 'questions' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                محرر أسئلة استمارة التسجيل (ورقة أسئلة_التسجيل)
              </h3>
              <p className="text-xs text-slate-500">
                أضف أو رتّب الأسئلة التي تملؤها الطالبات والطلاب (البريد الإلكتروني إلزامي افتراضياً
                لإرسال رقم الـ ID).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePullQuestions}
                disabled={busy}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                <span>سحب من الشيت</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOptionsDraft('');
                  setEditingQuestion({
                    id: `q_${Date.now()}`,
                    label: '',
                    type: 'text',
                    required: false,
                    enabled: true,
                    sortOrder: questions.length + 1,
                  });
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>سؤال جديد</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveQuestions()}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ ومزامنة الأسئلة</span>
              </button>
            </div>
          </div>

          {editingQuestion && (
            <form
              onSubmit={handleSaveEditingQuestion}
              className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900">تحرير سؤال التسجيل</span>
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="p-1 text-slate-500 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={editingQuestion.label}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, label: e.target.value })}
                  placeholder="نص السؤال بالعربية *"
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                />
                <select
                  value={editingQuestion.type}
                  onChange={(e) =>
                    setEditingQuestion({
                      ...editingQuestion,
                      type: e.target.value as RegistrationQuestionType,
                    })
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                >
                  {Object.entries(QUESTION_TYPE_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={editingQuestion.labelEn || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, labelEn: e.target.value })
                  }
                  placeholder="السؤال بالإنجليزية (اختياري)"
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
                <input
                  type="text"
                  value={editingQuestion.labelTh || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, labelTh: e.target.value })
                  }
                  placeholder="السؤال بالتايلندية (اختياري)"
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
                <input
                  type="text"
                  value={editingQuestion.placeholder || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, placeholder: e.target.value })
                  }
                  placeholder="نص تلميح داخل الحقل (Placeholder)"
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={editingQuestion.guideUrl || ''}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, guideUrl: e.target.value })
                  }
                  placeholder="رابط توضيحي اختياري (https://...)"
                  className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
                {editingQuestion.type === 'select' && (
                  <textarea
                    rows={3}
                    value={optionsDraft}
                    onChange={(e) => setOptionsDraft(e.target.value)}
                    placeholder="اكتب كل خيار في سطر مستقل..."
                    className="md:col-span-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-4 text-xs font-bold">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingQuestion.required}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, required: e.target.checked })
                      }
                    />
                    <span>حقل إلزامي</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingQuestion.enabled !== false}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, enabled: e.target.checked })
                      }
                    />
                    <span>مفعّل في الاستمارة</span>
                  </label>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(null)}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                  >
                    اعتماد السؤال
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="space-y-2.5">
            {[...questions]
              .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
              .map((q, idx, arr) => (
                <div
                  key={q.id}
                  className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs sm:text-sm font-extrabold text-slate-900">
                      <span className="font-mono text-emerald-700 ml-1.5">{idx + 1}.</span>
                      {q.label}
                      {q.required && (
                        <span className="text-[11px] font-bold text-rose-600 mr-2">· إلزامي</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      النوع: {QUESTION_TYPE_LABELS[q.type]} ·{' '}
                      {q.enabled === false ? 'مخفي' : 'ظاهر في الاستمارة'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveQuestion(q.id, -1)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === arr.length - 1}
                      onClick={() => handleMoveQuestion(q.id, 1)}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOptionsDraft((q.options || []).join('\n'));
                        setEditingQuestion(q);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-indigo-700 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateQuestions(questions.filter((x) => x.id !== q.id))}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ================================================================
          SUB-TAB 6: INTEGRATED STORE & UNIFIED PROGRAM MARKETING (المتجر)
         ================================================================ */}
      {subTab === 'store' && (
        <StoreAdminManager
          storeData={resolvedStoreData}
          onUpdateStoreData={handleStoreChange}
          portalData={portalData}
          onUpdatePortalData={onUpdatePortalData}
          programs={programs}
          programRequests={programRequests}
          onRefreshProgramRequests={loadProgramRequests}
          onRefreshRegistrants={onRefreshRegistrants}
          webhookUrl={webhookUrl}
          onOpenStorePreview={onOpenStorePreview}
        />
      )}
    </div>
  );
};
