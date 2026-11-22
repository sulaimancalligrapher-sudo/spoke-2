import React, { useEffect, useMemo, useState } from 'react';
import {
  Globe,
  FileSpreadsheet,
  Users,
  ShoppingBag,
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
} from 'lucide-react';
import {
  PortalContentItem,
  PortalPublicData,
  PortalSectionType,
  RegistrationQuestion,
  RegistrationQuestionType,
  RegistrationSubmissionRecord,
} from '../types';
import { CourseProgram } from '../utils/courseSchedule';
import {
  deleteRegistrationSubmissionInSheets,
  fetchPortalDataFromSheets,
  fetchRegistrationQuestionsFromSheets,
  fetchRegistrationSubmissionsFromSheets,
  savePortalDataToSheets,
  saveRegistrationQuestionsToSheets,
  transferRegistrationStageInSheets,
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

export const PortalAdminManager: React.FC<PortalAdminManagerProps> = ({
  portalData,
  onUpdatePortalData,
  questions,
  onUpdateQuestions,
  programs,
  webhookUrl,
  onRefreshRegistrants,
  onPreviewPublicPortal,
}) => {
  const [subTab, setSubTab] = useState<'submissions' | 'content' | 'questions' | 'store'>(
    'submissions'
  );
  const [banner, setBanner] = useState<{ success: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Content item editor state
  const [activeContentSection, setActiveContentSection] = useState<
    'about' | 'programs' | 'gallery' | 'videos'
  >('about');
  const [editingItem, setEditingItem] = useState<PortalContentItem | null>(null);

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
  const [copiedRegLink, setCopiedRegLink] = useState(false);

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

  useEffect(() => {
    loadSubmissions();
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

  const updateSettings = (patch: Partial<PortalPublicData['settings']>) => {
    onUpdatePortalData({
      ...portalData,
      settings: {
        ...portalData.settings,
        ...patch,
      },
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
    const exists = portalData.items.some((x) => x.id === editingItem.id);
    const nextItems = exists
      ? portalData.items.map((x) => (x.id === editingItem.id ? editingItem : x))
      : [...portalData.items, editingItem];
    const nextData: PortalPublicData = { ...portalData, items: nextItems };
    onUpdatePortalData(nextData);
    setEditingItem(null);
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

  const copyRegistrationDirectUrl = () => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}#register`;
    navigator.clipboard?.writeText(url);
    setCopiedRegLink(true);
    setTimeout(() => setCopiedRegLink(false), 2000);
  };

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
              إدارة البوابة العامة ونظام التسجيل ذي المرحلتين
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              وحدة منفصلة تماماً لإدارة الصفحة التعريفية (ورقة{' '}
              <code className="font-mono text-emerald-800">محتوى_البوابة_العامة</code>)، استمارة
              الالتحاق (<code className="font-mono text-emerald-800">أسئلة_التسجيل</code>)، وترقية
              المتقدمين من القسم الافتراضي إلى البرامج التدريبية (
              <code className="font-mono text-emerald-800">طلبات_التسجيل</code>).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={copyRegistrationDirectUrl}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            {copiedRegLink ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copiedRegLink ? 'تم نسخ رابط الاستمارة!' : 'نسخ رابط التسجيل المباشر'}</span>
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

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSubTab('submissions')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'submissions'
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>طلبات التسجيل والتحويل ({stageCounts.total})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('content')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'content'
              ? 'bg-emerald-800 text-white border-emerald-800'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>محتوى وأقسام البوابة العامة</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('questions')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
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
          className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 border cursor-pointer transition-colors ${
            subTab === 'store'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>المتجر (مساحة محجوزة)</span>
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
          {/* Two-Stage Onboarding & Telegram Settings Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  إعدادات المرحلة الأولى والربط مع تيليغرام والبريد
                </h3>
                <p className="text-xs text-slate-500">
                  يحدد البرنامج الافتراضي الذي يدخل إليه المتقدم فوراً بعد التسجيل، ورسالة
                  الإرشادات داخل صفحته الخاصة قبل تحويله.
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

          {/* Filter & Refresh Bar */}
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
                      {/* Row 1: Identity & Stage Status */}
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

                      {/* Row 2: Contact & Answers */}
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

                      {/* Row 3: Stage 2 Transfer Controls */}
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
          SUB-TAB 2: PUBLIC PORTAL CMS (محتوى البوابة العامة)
         ================================================================ */}
      {subTab === 'content' && (
        <div className="space-y-5">
          {/* Cloud Actions Bar */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-600">
              عدّل بيانات البوابة التعريفية وأقسامها، ثم اضغط حفظ للمزامنة مع ورقة{' '}
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

          {/* Identity, Hero & Contact Details */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 pb-2 border-b border-slate-100">
              الهوية، القسم الترحيبي، ومعلومات التواصل
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
                <label className="text-xs font-bold text-slate-700">العنوان / المقر:</label>
                <input
                  type="text"
                  value={portalData.settings.contactAddress}
                  onChange={(e) => updateSettings({ contactAddress: e.target.value })}
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
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-700">رابط واتساب مباشر (اختياري):</label>
                <input
                  type="text"
                  dir="ltr"
                  value={portalData.settings.whatsappUrl || ''}
                  onChange={(e) => updateSettings({ whatsappUrl: e.target.value })}
                  placeholder="https://wa.me/..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>
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
              <div className="flex flex-wrap gap-2">
                {(['about', 'programs', 'gallery', 'videos'] as const).map((secKey) => (
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
              </div>

              <button
                type="button"
                onClick={() =>
                  setEditingItem({
                    id: `pitem_${Date.now()}`,
                    section: activeContentSection,
                    title: '',
                    subtitle: '',
                    description: '',
                    mediaUrl: '',
                    linkUrl: '',
                    linkLabel: '',
                    badgeText: '',
                    metaPrimary: '',
                    metaSecondary: '',
                    enabled: true,
                    sortOrder: sectionItems.length + 1,
                  })
                }
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
                  <input
                    type="text"
                    dir="ltr"
                    value={editingItem.mediaUrl || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, mediaUrl: e.target.value })}
                    placeholder="رابط صورة أو فيديو (YouTube / Drive / URL)"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
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
                    placeholder="نص الزر (مثال: سجّل في هذا المسار / مشاهدة الفيديو)"
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
              {sectionItems.map((it, idx) => (
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
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{it.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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
                      onClick={() => setEditingItem(it)}
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
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          SUB-TAB 3: DYNAMIC REGISTRATION QUESTIONS (أسئلة_التسجيل)
         ================================================================ */}
      {subTab === 'questions' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                محرر أسئلة استمارة التسجيل (ورقة أسئلة_التسجيل)
              </h3>
              <p className="text-xs text-slate-500">
                أضف أو رتّب الأسئلة التي تملؤها الطالبات والطلاب قبل الدخول التلقائي للمرحلة الأولى.
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
          SUB-TAB 4: RESERVED STORE PLACEHOLDER (المتجر - جاهز للربط لاحقاً)
         ================================================================ */}
      {subTab === 'store' && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">
                قسم المتجر (مساحة محجوزة ومعزولة للربط لاحقاً)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                بناءً على طلبك، تم ترك قسم المتجر فارغاً حالياً ومنفصلاً تماماً، مع تجهيز موضعه في
                القائمة وترتيب الأقسام حتى ندمج مستودع المتجر المتكامل لاحقاً بسلاسة دون أي تعارض مع
                البوابة أو التدريب.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 max-w-2xl">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={portalData.settings.showStoreNavSlot}
                onChange={(e) => updateSettings({ showStoreNavSlot: e.target.checked })}
              />
              <span>إظهار بطاقة «المتجر (قريباً)» في الواجهة العامة مؤقتاً (اتركه مغلقاً لإخفائه)</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={portalData.settings.storeSlotTitle}
                onChange={(e) => updateSettings({ storeSlotTitle: e.target.value })}
                placeholder="اسم القسم (المتجر)"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
              />
              <input
                type="text"
                value={portalData.settings.storeSlotNote}
                onChange={(e) => updateSettings({ storeSlotNote: e.target.value })}
                placeholder="وصف مختصر..."
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
              />
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => handleSavePortal()}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>حفظ حالة المساحة المحجوزة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
