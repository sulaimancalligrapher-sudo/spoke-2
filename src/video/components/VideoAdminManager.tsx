import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  Plus,
  Edit3,
  Trash2,
  Save,
  RefreshCw,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  HelpCircle,
  Image as ImageIcon,
  Mic,
  Square,
  Send,
  Search,
  Award,
  ZoomIn,
  X,
  MessageSquare,
  Bot,
  Users,
  Link2,
  Volume2,
  Languages,
  Sparkles,
  Check,
} from 'lucide-react';
import {
  TranslationItem,
  translateBatchWithAI,
  translateSingleWithAI,
} from '../../utils/translations';
import {
  ensureTranslationsSheet,
  saveTranslationsToSheets,
} from '../../utils/googleSheets';
import {
  TelegramConfig,
  TelegramStudentLink,
  VideoLesson,
  VideoStudentSubmissionRow,
  VideoTimestampQuestion,
  buildVideoVariableTranslationItems,
  deleteVideoLessonFromSheets,
  fetchAllVideoSubmissionsForAdmin,
  fetchTelegramConfig,
  fetchTelegramUsers,
  fetchVideoLessonsFromSheets,
  getLocalTelegramConfig,
  resolveVideoAudioAlternatives,
  resolveVideoQuestionImage,
  saveTeacherVideoCorrection,
  saveTelegramConfig,
  saveVideoLessonToSheets,
  sendTelegramNotification,
  syncAllVideoLessonsToSheets,
} from '../videoSheets';

interface VideoAdminManagerProps {
  lessons: VideoLesson[];
  onUpdateLessons: (lessons: VideoLesson[]) => void;
  webhookUrl: string;
  translations?: TranslationItem[];
  onSaveTranslations?: (updated: TranslationItem[]) => void;
  geminiApiKey?: string;
}

type AdminSubTab = 'lessons' | 'corrections' | 'telegram' | 'translations';

function createEmptyLesson(): VideoLesson {
  return {
    id: `vid_${Date.now()}`,
    topic: 'دروس الفيديو التفاعلي',
    title: '',
    instruction: '',
    videoUrl: '',
    explainSound: '',
    image: '',
    showResult: 'نعم',
    allowRecording: 'نعم',
    maxRecordingTime: 60,
    audioHomeworkMode: 'free',
    audioHomeworkPrompt: '',
    audioHomeworkTarget: '',
    allowUpload: 'نعم',
    uploadTitle: 'تصوير واجب الدرس',
    retryCount: 2,
    startDate: '',
    endDate: '',
    expireAfterDays: '',
    questions: [],
    audioQuestions: [],
  };
}

function createEmptyQuestion(slotIndex: number): VideoTimestampQuestion {
  return {
    id: `vq_${Date.now()}_${slotIndex}`,
    slotIndex,
    time: 5,
    question: '',
    image: '',
    audio: '',
    options: ['', '', ''],
    correctAnswer: '',
  };
}

export const VideoAdminManager: React.FC<VideoAdminManagerProps> = ({
  lessons,
  onUpdateLessons,
  webhookUrl,
  translations = [],
  onSaveTranslations,
  geminiApiKey,
}) => {
  const [subTab, setSubTab] = useState<AdminSubTab>('lessons');
  const [statusBanner, setStatusBanner] = useState<{ success: boolean; message: string } | null>(
    null
  );
  const [syncing, setSyncing] = useState(false);

  // =========================================================================
  // VARIABLE TRANSLATIONS STATE (ترجمة المتغيرات)
  // =========================================================================
  const [varItems, setVarItems] = useState<TranslationItem[]>(() =>
    buildVideoVariableTranslationItems(lessons, translations)
  );
  const [varSearch, setVarSearch] = useState('');
  const [translatingVarId, setTranslatingVarId] = useState<string | null>(null);
  const [isBatchTranslatingVars, setIsBatchTranslatingVars] = useState(false);
  const [savingVarsToSheet, setSavingVarsToSheet] = useState(false);
  const [savedVarsFlash, setSavedVarsFlash] = useState(false);

  useEffect(() => {
    setVarItems(buildVideoVariableTranslationItems(lessons, translations));
  }, [lessons, translations]);

  const filteredVarItems = useMemo(() => {
    const q = varSearch.trim().toLowerCase();
    if (!q) return varItems;
    return varItems.filter(
      (i) =>
        i.id.toLowerCase().includes(q) ||
        i.ar.toLowerCase().includes(q) ||
        i.th.toLowerCase().includes(q) ||
        i.en.toLowerCase().includes(q) ||
        (i.sheetSourceNote || '').toLowerCase().includes(q)
    );
  }, [varItems, varSearch]);

  const handleUpdateVarItem = (id: string, patch: Partial<TranslationItem>) => {
    setVarItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const handleTranslateVarSingle = async (item: TranslationItem) => {
    if (!item.ar.trim()) return;
    setTranslatingVarId(item.id);
    try {
      const res = await translateSingleWithAI(item.ar, geminiApiKey);
      handleUpdateVarItem(item.id, {
        th: res.th || item.th,
        en: res.en || item.en,
      });
    } finally {
      setTranslatingVarId(null);
    }
  };

  const handleTranslateAllVars = async () => {
    const targets = filteredVarItems.filter((i) => i.ar.trim());
    if (targets.length === 0) return;
    setIsBatchTranslatingVars(true);
    setStatusBanner({
      success: true,
      message: `جاري ترجمة ${targets.length} متغيراً بالذكاء الاصطناعي...`,
    });
    try {
      const results = await translateBatchWithAI(
        targets.map((i) => ({ id: i.id, text: i.ar })),
        geminiApiKey
      );
      setVarItems((prev) =>
        prev.map((item) => {
          const r = results[item.id];
          if (!r) return item;
          return {
            ...item,
            th: r.th || item.th,
            en: r.en || item.en,
          };
        })
      );
      setStatusBanner({
        success: true,
        message: 'تمت ترجمة جميع متغيرات الفيديو. اضغط «حفظ ومزامنة ورقة الترجمة» لتثبيتها.',
      });
    } finally {
      setIsBatchTranslatingVars(false);
    }
  };

  const handleSaveVarsAndSync = async () => {
    const map = new Map<string, TranslationItem>();
    translations.forEach((i) => map.set(i.id, i));
    varItems.forEach((i) => map.set(i.id, i));
    const merged = Array.from(map.values());

    if (onSaveTranslations) onSaveTranslations(merged);
    setSavedVarsFlash(true);
    window.setTimeout(() => setSavedVarsFlash(false), 2000);

    if (webhookUrl && webhookUrl.trim().startsWith('http')) {
      setSavingVarsToSheet(true);
      try {
        await ensureTranslationsSheet(webhookUrl, merged);
        const res = await saveTranslationsToSheets(webhookUrl, merged);
        setStatusBanner({
          success: res.success,
          message: res.message,
        });
      } finally {
        setSavingVarsToSheet(false);
      }
    } else {
      setStatusBanner({
        success: true,
        message: 'تم حفظ ترجمة متغيرات الفيديو محلياً.',
      });
    }
  };

  // =========================================================================
  // 1. LESSONS BUILDER & LIST STATE
  // =========================================================================
  const [editingLesson, setEditingLesson] = useState<VideoLesson | null>(null);
  const [savingLesson, setSavingLesson] = useState(false);
  const [lessonSearch, setLessonSearch] = useState('');

  const filteredLessons = useMemo(() => {
    const q = lessonSearch.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.topic.toLowerCase().includes(q) ||
        (l.instruction || '').toLowerCase().includes(q)
    );
  }, [lessons, lessonSearch]);

  const handleSaveLessonForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson || !editingLesson.title.trim()) return;
    setSavingLesson(true);
    setStatusBanner(null);
    try {
      const cleaned: VideoLesson = {
        ...editingLesson,
        questions: editingLesson.questions
          .filter((q) => q.question.trim() || q.image || q.audio)
          .map((q, idx) => ({
            ...q,
            slotIndex: idx,
            options: q.options.map((o) => o.trim()).filter(Boolean),
          })),
        audioQuestions: editingLesson.audioQuestions
          .filter((q) => q.question.trim() || q.image || q.audio)
          .map((q, idx) => ({
            ...q,
            slotIndex: idx,
            options: q.options.map((o) => o.trim()).filter(Boolean),
          })),
      };

      const res = await saveVideoLessonToSheets(webhookUrl, cleaned, lessons);
      onUpdateLessons(res.lessons);
      setEditingLesson(null);
      setStatusBanner({
        success: true,
        message: res.cloudSaved
          ? 'تم حفظ درس الفيديو ومزامنته مع ورقة «فيديو_الأسئلة» بنجاح!'
          : 'تم حفظ درس الفيديو محلياً بنجاح (اربط الشيت لمزامنة السحابة).',
      });
    } finally {
      setSavingLesson(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('هل تريد حذف درس الفيديو هذا نهائياً؟')) return;
    setSyncing(true);
    try {
      const res = await deleteVideoLessonFromSheets(webhookUrl, lessonId, lessons);
      onUpdateLessons(res.lessons);
      setStatusBanner({
        success: true,
        message: res.cloudSaved ? 'تم حذف الدرس من القائمة ومن Google Sheets.' : 'تم حذف الدرس محلياً.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncAllLessons = async () => {
    setSyncing(true);
    setStatusBanner(null);
    try {
      const res = await syncAllVideoLessonsToSheets(webhookUrl, lessons);
      setStatusBanner({ success: res.success, message: res.message });
    } finally {
      setSyncing(false);
    }
  };

  const handlePullLessons = async () => {
    setSyncing(true);
    setStatusBanner(null);
    try {
      const pulled = await fetchVideoLessonsFromSheets(webhookUrl);
      onUpdateLessons(pulled);
      setStatusBanner({
        success: true,
        message: `تم جلب وتحديث ${pulled.length} دروس فيديو من الشيت بنجاح!`,
      });
    } finally {
      setSyncing(false);
    }
  };

  // =========================================================================
  // 2. TEACHER CORRECTIONS REVIEW STATE
  // =========================================================================
  const [submissions, setSubmissions] = useState<VideoStudentSubmissionRow[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subSearch, setSubSearch] = useState('');
  const [subFilter, setSubFilter] = useState<'all' | 'pending' | 'graded'>('all');
  const [selectedSub, setSelectedSub] = useState<VideoStudentSubmissionRow | null>(null);
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  // Correction Form Fields
  const [corrImageStatus, setCorrImageStatus] = useState('ممتاز');
  const [corrImageScore, setCorrImageScore] = useState('');
  const [corrImageUrl, setCorrImageUrl] = useState('');
  const [corrImageBase64, setCorrImageBase64] = useState('');
  const [corrImageNotes, setCorrImageNotes] = useState('');

  const [corrAudioStatus, setCorrAudioStatus] = useState('ممتاز');
  const [corrAudioScore, setCorrAudioScore] = useState('');
  const [corrTeacherAudioUrl, setCorrTeacherAudioUrl] = useState('');
  const [corrTeacherAudioBase64, setCorrTeacherAudioBase64] = useState('');
  const [corrTeacherVideoUrl, setCorrTeacherVideoUrl] = useState('');
  const [corrAudioNotes, setCorrAudioNotes] = useState('');
  const [sendTgOnSave, setSendTgOnSave] = useState(true);
  const [savingCorrection, setSavingCorrection] = useState(false);

  // Teacher Mic Recorder inside Grading Drawer
  const teacherRecRef = useRef<MediaRecorder | null>(null);
  const teacherChunksRef = useRef<Blob[]>([]);
  const [isRecTeacherAudio, setIsRecTeacherAudio] = useState(false);
  const [teacherAudioPreviewUrl, setTeacherAudioPreviewUrl] = useState<string | null>(null);

  const loadSubmissions = async () => {
    setLoadingSubs(true);
    try {
      const rows = await fetchAllVideoSubmissionsForAdmin(webhookUrl);
      setSubmissions(rows);
    } finally {
      setLoadingSubs(false);
    }
  };

  useEffect(() => {
    if (subTab === 'corrections') {
      loadSubmissions();
    } else if (subTab === 'telegram') {
      loadTelegramData();
    }
  }, [subTab]);

  const openGradingDrawer = (row: VideoStudentSubmissionRow) => {
    setSelectedSub(row);
    const c = row.correction;
    setCorrImageStatus(c?.imageStatus || 'ممتاز');
    setCorrImageScore(c?.imageScore || '');
    setCorrImageUrl(c?.correctedImage || '');
    setCorrImageBase64('');
    setCorrImageNotes(c?.imageNotes || '');
    setCorrAudioStatus(c?.audioStatus || 'ممتاز');
    setCorrAudioScore(c?.audioScore || '');
    setCorrTeacherAudioUrl(c?.teacherAudios?.[0] || '');
    setCorrTeacherAudioBase64('');
    setCorrTeacherVideoUrl(c?.teacherVideos?.[0] || '');
    setCorrAudioNotes(c?.audioNotes || '');
    setTeacherAudioPreviewUrl(null);
  };

  const handleCorrImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCorrImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleTeacherAudioRecording = async () => {
    if (isRecTeacherAudio) {
      if (teacherRecRef.current && teacherRecRef.current.state !== 'inactive') {
        teacherRecRef.current.stop();
      }
      setIsRecTeacherAudio(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      teacherRecRef.current = recorder;
      teacherChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) teacherChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(teacherChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setTeacherAudioPreviewUrl(URL.createObjectURL(blob));
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') setCorrTeacherAudioBase64(reader.result);
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setIsRecTeacherAudio(true);
    } catch {
      setStatusBanner({ success: false, message: 'تعذر الوصول للميكروفون لتسجيل ملاحظة المعلم.' });
    }
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub) return;
    setSavingCorrection(true);
    setStatusBanner(null);
    try {
      const res = await saveTeacherVideoCorrection(webhookUrl, {
        lessonTitle: selectedSub.title,
        studentId: selectedSub.studentId,
        studentName: selectedSub.studentName,
        imageStatus: corrImageStatus,
        imageScore: corrImageScore,
        correctedImage: corrImageUrl,
        correctedImageBase64: corrImageBase64 || undefined,
        imageNotes: corrImageNotes,
        audioStatus: corrAudioStatus,
        audioScore: corrAudioScore,
        teacherAudios: corrTeacherAudioUrl.trim() ? [corrTeacherAudioUrl.trim()] : [],
        teacherAudioBase64: corrTeacherAudioBase64 || undefined,
        teacherVideos: corrTeacherVideoUrl.trim() ? [corrTeacherVideoUrl.trim()] : [],
        audioNotes: corrAudioNotes,
        sendTelegram: sendTgOnSave,
      });

      setStatusBanner({
        success: res.success,
        message: res.telegramSent
          ? `${res.message} وتم إرسال إشعار للطالب عبر تيليغرام.`
          : res.message,
      });

      if (res.success && res.correction) {
        setSubmissions((prev) =>
          prev.map((item) =>
            item.studentId === selectedSub.studentId && item.title === selectedSub.title
              ? { ...item, correction: res.correction }
              : item
          )
        );
        setSelectedSub(null);
      }
    } finally {
      setSavingCorrection(false);
    }
  };

  const filteredSubmissions = useMemo(() => {
    const q = subSearch.trim().toLowerCase();
    return submissions.filter((row) => {
      const isGraded = Boolean(
        row.correction && (row.correction.imageScore || row.correction.audioScore || row.correction.imageNotes)
      );
      if (subFilter === 'pending' && isGraded) return false;
      if (subFilter === 'graded' && !isGraded) return false;
      if (!q) return true;
      return (
        row.studentName.toLowerCase().includes(q) ||
        row.studentId.toLowerCase().includes(q) ||
        row.title.toLowerCase().includes(q)
      );
    });
  }, [submissions, subSearch, subFilter]);

  // =========================================================================
  // 3. TELEGRAM BOT CONFIG & LINKED STUDENTS STATE
  // =========================================================================
  const [tgConfig, setTgConfig] = useState<TelegramConfig>(() => getLocalTelegramConfig());
  const [tgUsers, setTgUsers] = useState<TelegramStudentLink[]>([]);
  const [loadingTg, setLoadingTg] = useState(false);
  const [savingTg, setSavingTg] = useState(false);
  const [tgTestResult, setTgTestResult] = useState<string | null>(null);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [targetChatId, setTargetChatId] = useState<string>('ALL');
  const [sendingMsg, setSendingMsg] = useState(false);

  const loadTelegramData = async () => {
    setLoadingTg(true);
    try {
      const [cfg, users] = await Promise.all([
        fetchTelegramConfig(webhookUrl),
        fetchTelegramUsers(webhookUrl),
      ]);
      setTgConfig(cfg);
      setTgUsers(users);
    } finally {
      setLoadingTg(false);
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTg(true);
    setStatusBanner(null);
    try {
      const res = await saveTelegramConfig(webhookUrl, tgConfig);
      setStatusBanner({ success: res.success, message: res.message });
    } finally {
      setSavingTg(false);
    }
  };

  const handleTestTelegramBot = async () => {
    if (!tgConfig.botToken.trim()) {
      setTgTestResult('يرجى إدخال Bot Token أولاً.');
      return;
    }
    setTgTestResult('جاري فحص البوت...');
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(tgConfig.botToken.trim())}/getMe`
      );
      const data = await resp.json();
      if (data.ok && data.result) {
        const uname = data.result.username || '';
        if (uname) setTgConfig((prev) => ({ ...prev, botUsername: uname }));
        setTgTestResult(`تم التحقق بنجاح! اسم البوت: ${data.result.first_name} (@${uname})`);
      } else {
        setTgTestResult(`فشل التحقق: ${data.description || 'تأكد من التوكن'}`);
      }
    } catch {
      setTgTestResult('تعذر الاتصال بخوادم تيليغرام من المتصفح.');
    }
  };

  const handleRegisterTelegramWebhook = async () => {
    if (!tgConfig.botToken.trim() || !webhookUrl.trim().startsWith('http')) {
      setTgTestResult('يجب توفر كل من Bot Token ورابط Google Apps Script Webhook أولاً.');
      return;
    }
    setTgTestResult('جاري ربط Webhook البوت مع Google Apps Script...');
    try {
      const apiUrl = `https://api.telegram.org/bot${encodeURIComponent(
        tgConfig.botToken.trim()
      )}/setWebhook?url=${encodeURIComponent(webhookUrl.trim())}`;
      const resp = await fetch(apiUrl);
      const data = await resp.json();
      if (data.ok) {
        setTgTestResult('تم ربط Webhook تيليغرام مع Google Apps Script بنجاح!');
      } else {
        setTgTestResult(`تعذر ضبط Webhook: ${data.description || 'خطأ غير معروف'}`);
      }
    } catch {
      setTgTestResult('حدث خطأ أثناء ضبط Webhook.');
    }
  };

  const handleSendTelegramMessage = async () => {
    if (!broadcastMsg.trim()) return;
    setSendingMsg(true);
    setStatusBanner(null);
    try {
      const res = await sendTelegramNotification(webhookUrl, {
        message: broadcastMsg.trim(),
        chatId: targetChatId === 'ALL' ? undefined : targetChatId,
        broadcastAll: targetChatId === 'ALL',
      });
      setStatusBanner({ success: res.success, message: res.message });
      if (res.success) setBroadcastMsg('');
    } finally {
      setSendingMsg(false);
    }
  };

  return (
    <div className="space-y-6 font-cairo">
      {/* Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#0c3868] text-white flex items-center justify-center shrink-0">
              <Film className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                إدارة الفيديو التفاعلي والتصحيح وإشعارات تيليغرام
              </h2>
              <p className="text-xs text-slate-500">
                إدارة أوراق (فيديو_الأسئلة · فيديو_الإجابات · فيديو_التصحيح · تيليغرام_الإعدادات)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePullLessons}
              disabled={syncing}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>جلب من الشيت</span>
            </button>
            <button
              type="button"
              onClick={handleSyncAllLessons}
              disabled={syncing}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>مزامنة دروس الفيديو إلى الشيت</span>
            </button>
          </div>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setSubTab('lessons')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'lessons'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Film className="w-4 h-4 shrink-0" />
            <span className="truncate">دروس الفيديو ({lessons.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('corrections')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'corrections'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-4 h-4 shrink-0" />
            <span className="truncate">تصحيح واجبات الطلاب</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('translations')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'translations'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Languages className="w-4 h-4 shrink-0" />
            <span className="truncate">ترجمة المتغيرات ({varItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('telegram')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              subTab === 'telegram'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="w-4 h-4 shrink-0" />
            <span className="truncate">بوت تيليغرام والإشعارات</span>
          </button>
        </div>

        {statusBanner && (
          <div
            className={`p-3 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-2 ${
              statusBanner.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          SUB-TAB 1: VIDEO LESSONS & TIMED QUESTIONS BUILDER
         ===================================================================== */}
      {subTab === 'lessons' && (
        <div className="space-y-5">
          {!editingLesson ? (
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={lessonSearch}
                    onChange={(e) => setLessonSearch(e.target.value)}
                    placeholder="بحث في دروس الفيديو أو الموضوع..."
                    className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setEditingLesson(createEmptyLesson())}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة درس فيديو جديد</span>
                </button>
              </div>

              {filteredLessons.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
                  لا توجد دروس فيديو مطابقة. اضغط «إضافة درس فيديو جديد» للبدء.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-[11px] font-bold text-indigo-600 flex flex-wrap items-center gap-2">
                          <span>{lesson.topic}</span>
                          <span>·</span>
                          <span>{lesson.questions.length} أسئلة فيديو</span>
                          {lesson.audioQuestions.length > 0 && (
                            <>
                              <span>·</span>
                              <span>{lesson.audioQuestions.length} أسئلة صوت</span>
                            </>
                          )}
                        </div>
                        <h4 className="font-extrabold text-slate-900 text-sm sm:text-base">
                          {lesson.title}
                        </h4>
                        <div className="text-[11px] text-slate-500 truncate max-w-xl font-mono">
                          {lesson.videoUrl || 'بدون رابط فيديو'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingLesson(JSON.parse(JSON.stringify(lesson)))}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-800 hover:text-indigo-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLesson(lesson.id)}
                          className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 cursor-pointer"
                          title="حذف الدرس"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Lesson Add / Edit Form */
            <form
              onSubmit={handleSaveLessonForm}
              className="bg-white rounded-3xl p-5 sm:p-6 border border-indigo-200 shadow-sm space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-base font-extrabold text-slate-900">
                  {lessons.some((l) => l.id === editingLesson.id)
                    ? `تعديل الدرس: ${editingLesson.title}`
                    : 'إضافة درس فيديو تفاعلي جديد'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingLesson(null)}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">موضوع الدرس</label>
                  <input
                    type="text"
                    required
                    value={editingLesson.topic}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, topic: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">عنوان الدرس</label>
                  <input
                    type="text"
                    required
                    value={editingLesson.title}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, title: e.target.value })
                    }
                    placeholder="مثال: مخرج حرف الضاد"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700">
                    رابط الفيديو (YouTube أو Google Drive أو MP4)
                  </label>
                  <input
                    type="text"
                    required
                    value={editingLesson.videoUrl}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, videoUrl: e.target.value })
                    }
                    placeholder="https://www.youtube.com/watch?v=... أو رابط Drive"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700">تعليمات الدرس للطلاب</label>
                  <textarea
                    rows={2}
                    value={editingLesson.instruction || ''}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, instruction: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">رابط صوت شرح المعلم (اختياري)</label>
                  <input
                    type="text"
                    value={editingLesson.explainSound || ''}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, explainSound: e.target.value })
                    }
                    placeholder="رابط Drive أو MP3"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">رابط صورة توضيحية للدرس (اختياري)</label>
                  <input
                    type="text"
                    value={editingLesson.image || ''}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, image: e.target.value })
                    }
                    placeholder="رابط Drive أو صورة مباشرة"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Lesson Options Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">إظهار نتيجة السؤال</label>
                  <select
                    value={editingLesson.showResult}
                    onChange={(e) =>
                      setEditingLesson({
                        ...editingLesson,
                        showResult: e.target.value as 'نعم' | 'لا',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="نعم">نعم</option>
                    <option value="لا">لا</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">السماح برفع صورة</label>
                  <select
                    value={editingLesson.allowUpload}
                    onChange={(e) =>
                      setEditingLesson({
                        ...editingLesson,
                        allowUpload: e.target.value as 'نعم' | 'لا',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="نعم">نعم</option>
                    <option value="لا">لا</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">السماح بالتسجيل الصوتي</label>
                  <select
                    value={editingLesson.allowRecording}
                    onChange={(e) =>
                      setEditingLesson({
                        ...editingLesson,
                        allowRecording: e.target.value as 'نعم' | 'لا',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    <option value="نعم">نعم</option>
                    <option value="لا">لا</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">مدة التسجيل (ثانية)</label>
                  <input
                    type="number"
                    min={5}
                    value={editingLesson.maxRecordingTime}
                    onChange={(e) =>
                      setEditingLesson({
                        ...editingLesson,
                        maxRecordingTime: Number(e.target.value) || 60,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">عنوان واجب الصورة</label>
                  <input
                    type="text"
                    value={editingLesson.uploadTitle || ''}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, uploadTitle: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">عدد محاولات الإعادة</label>
                  <input
                    type="number"
                    min={0}
                    value={editingLesson.retryCount}
                    onChange={(e) =>
                      setEditingLesson({
                        ...editingLesson,
                        retryCount: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">تاريخ البدء (اختياري)</label>
                  <input
                    type="date"
                    value={editingLesson.startDate || ''}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, startDate: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">تاريخ الانتهاء (اختياري)</label>
                  <input
                    type="date"
                    value={editingLesson.endDate || ''}
                    onChange={(e) =>
                      setEditingLesson({ ...editingLesson, endDate: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Audio Homework Mode (Free vs Pronunciation Verification) */}
              {editingLesson.allowRecording !== 'لا' && (
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-extrabold text-amber-950 flex items-center gap-1.5">
                      <Mic className="w-4 h-4 text-amber-600" />
                      <span>إعدادات نوع الواجب الصوتي</span>
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-700">نوع الواجب الصوتي</label>
                      <select
                        value={editingLesson.audioHomeworkMode || 'free'}
                        onChange={(e) =>
                          setEditingLesson({
                            ...editingLesson,
                            audioHomeworkMode: e.target.value === 'verify' ? 'verify' : 'free',
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold text-slate-900"
                      >
                        <option value="free">تسجيل حر يرسله الطالب للمعلم (الوضع الافتراضي)</option>
                        <option value="verify">تحقق من نطق نص محدد ثم إرساله للمعلم</option>
                      </select>
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-700">
                        نص السؤال / التوجيه للطالب (يظهر فوق أزرار التسجيل)
                      </label>
                      <input
                        type="text"
                        value={editingLesson.audioHomeworkPrompt || ''}
                        onChange={(e) =>
                          setEditingLesson({
                            ...editingLesson,
                            audioHomeworkPrompt: e.target.value,
                          })
                        }
                        placeholder="مثال: اقرأ الجملة التالية بصوت واضح ثم أرسل التسجيل"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-bold"
                      />
                    </div>

                    {editingLesson.audioHomeworkMode === 'verify' && (
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[11px] font-bold text-slate-700">
                          الكلمة أو الجملة المطلوبة للتحقق من النطق (بالعربية)
                        </label>
                        <input
                          type="text"
                          required={editingLesson.audioHomeworkMode === 'verify'}
                          value={editingLesson.audioHomeworkTarget || ''}
                          onChange={(e) =>
                            setEditingLesson({
                              ...editingLesson,
                              audioHomeworkTarget: e.target.value,
                            })
                          }
                          placeholder="مثال: بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 bg-white text-sm font-extrabold text-slate-900"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Timed Video Questions Builder */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-indigo-600" />
                    <span>الأسئلة الزمنية داخل الفيديو ({editingLesson.questions.length})</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingLesson({
                        ...editingLesson,
                        questions: [
                          ...editingLesson.questions,
                          createEmptyQuestion(editingLesson.questions.length),
                        ],
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة سؤال زمني</span>
                  </button>
                </div>

                {editingLesson.questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-indigo-700">
                        سؤال #{qIdx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-600">وقت الظهور (بالثواني):</label>
                        <input
                          type="number"
                          min={0}
                          value={q.time}
                          onChange={(e) => {
                            const next = [...editingLesson.questions];
                            next[qIdx] = { ...q, time: Math.max(0, Number(e.target.value) || 0) };
                            setEditingLesson({ ...editingLesson, questions: next });
                          }}
                          className="w-20 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-mono font-bold"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditingLesson({
                              ...editingLesson,
                              questions: editingLesson.questions.filter((_, i) => i !== qIdx),
                            })
                          }
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={q.question}
                      onChange={(e) => {
                        const next = [...editingLesson.questions];
                        next[qIdx] = { ...q, question: e.target.value };
                        setEditingLesson({ ...editingLesson, questions: next });
                      }}
                      placeholder="نص السؤال التفاعلي..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-bold"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">
                          الخيارات (افصل بينها بـ | أو اتركها فارغة لسؤال مقالي)
                        </label>
                        <input
                          type="text"
                          value={q.options.join(' | ')}
                          onChange={(e) => {
                            const next = [...editingLesson.questions];
                            next[qIdx] = {
                              ...q,
                              options: e.target.value.split('|').map((s) => s.trim()),
                            };
                            setEditingLesson({ ...editingLesson, questions: next });
                          }}
                          placeholder="خيار 1 | خيار 2 | خيار 3"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">الإجابة الصحيحة</label>
                        <input
                          type="text"
                          value={q.correctAnswer}
                          onChange={(e) => {
                            const next = [...editingLesson.questions];
                            next[qIdx] = { ...q, correctAnswer: e.target.value };
                            setEditingLesson({ ...editingLesson, questions: next });
                          }}
                          placeholder="الإجابة الصحيحة المطابقة لأحد الخيارات"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">رابط صورة السؤال (اختياري)</label>
                        <input
                          type="text"
                          value={q.image || ''}
                          onChange={(e) => {
                            const next = [...editingLesson.questions];
                            next[qIdx] = { ...q, image: e.target.value };
                            setEditingLesson({ ...editingLesson, questions: next });
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono"
                          dir="ltr"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600">رابط صوت السؤال (اختياري)</label>
                        <input
                          type="text"
                          value={q.audio || ''}
                          onChange={(e) => {
                            const next = [...editingLesson.questions];
                            next[qIdx] = { ...q, audio: e.target.value };
                            setEditingLesson({ ...editingLesson, questions: next });
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingLesson(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingLesson}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-70"
                >
                  {savingLesson ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>حفظ درس الفيديو</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: STUDENT SUBMISSIONS & TEACHER CORRECTIONS
         ===================================================================== */}
      {subTab === 'corrections' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  placeholder="بحث باسم الطالب، ID، أو الدرس..."
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                />
              </div>

              <select
                value={subFilter}
                onChange={(e) => setSubFilter(e.target.value as any)}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
              >
                <option value="all">جميع التسليمات</option>
                <option value="pending">بانتظار التصحيح</option>
                <option value="graded">تم التصحيح</option>
              </select>
            </div>

            <button
              type="button"
              onClick={loadSubmissions}
              disabled={loadingSubs}
              className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSubs ? 'animate-spin' : ''}`} />
              <span>تحديث التسليمات</span>
            </button>
          </div>

          {loadingSubs ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
              <span className="text-xs font-bold">جاري جلب تسليمات الطلاب من «فيديو_الإجابات»...</span>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
              لا توجد تسليمات مسجلة في ورقة «فيديو_الإجابات» حالياً.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredSubmissions.map((row, idx) => {
                const isGraded = Boolean(
                  row.correction &&
                    (row.correction.imageScore || row.correction.audioScore || row.correction.imageNotes)
                );
                return (
                  <div
                    key={`${row.studentId}-${row.lessonId}-${idx}`}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-extrabold text-slate-900">{row.studentName || 'طالب'}</span>
                        <span className="font-mono text-slate-500">ID: {row.studentId || '-'}</span>
                        <span>·</span>
                        <span className="font-bold text-indigo-700">{row.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700">أسئلة الفيديو: {row.videoScore}%</span>
                        {row.imageLink && <span className="text-emerald-700 font-bold">أرفق صورة</span>}
                        {row.recordingLink && <span className="text-amber-700 font-bold">أرفق تسجيل صوتي</span>}
                        {row.updatedAt && <span className="font-mono">{row.updatedAt}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg border ${
                          isGraded
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {isGraded ? 'تم التصحيح' : 'بانتظار التصحيح'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openGradingDrawer(row)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer"
                      >
                        معاينة وتصحيح
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: TELEGRAM BOT & STUDENT NOTIFICATIONS
         ===================================================================== */}
      {subTab === 'telegram' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Bot Settings Card */}
          <form
            onSubmit={handleSaveTelegram}
            className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Bot className="w-5 h-5 text-sky-600" />
                <span>إعدادات بوت تيليغرام (تيليغرام_الإعدادات)</span>
              </h3>
              {loadingTg && <Loader2 className="w-4 h-4 animate-spin text-sky-600" />}
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Bot Token (من BotFather)</label>
                <input
                  type="text"
                  value={tgConfig.botToken}
                  onChange={(e) => setTgConfig({ ...tgConfig, botToken: e.target.value })}
                  placeholder="123456789:ABCdefGHIjklMNO..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">معرف البوت (Username بدون @)</label>
                <input
                  type="text"
                  value={tgConfig.botUsername}
                  onChange={(e) =>
                    setTgConfig({ ...tgConfig, botUsername: e.target.value.replace('@', '') })
                  }
                  placeholder="FaseehVideoBot"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">رسالة الترحيب عند ربط الطالب للبوت</label>
                <textarea
                  rows={2}
                  value={tgConfig.welcomeMessage || ''}
                  onChange={(e) => setTgConfig({ ...tgConfig, welcomeMessage: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tgConfig.enabled}
                  onChange={(e) => setTgConfig({ ...tgConfig, enabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-sky-600"
                />
                <span>تفعيل إشعارات البوت التلقائية</span>
              </label>
            </div>

            {tgTestResult && (
              <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900">
                {tgTestResult}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="submit"
                disabled={savingTg}
                className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {savingTg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>حفظ الإعدادات</span>
              </button>

              <button
                type="button"
                onClick={handleTestTelegramBot}
                className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
              >
                فحص البوت
              </button>

              <button
                type="button"
                onClick={handleRegisterTelegramWebhook}
                className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>ربط Webhook بالشيت</span>
              </button>
            </div>
          </form>

          {/* Linked Users & Notification Sender Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-600" />
                <span>الطلاب المربوطون ({tgUsers.length})</span>
              </h3>
              <button
                type="button"
                onClick={loadTelegramData}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
              >
                تحديث
              </button>
            </div>

            {tgConfig.botUsername && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                رابط ربط الطالب المباشر: يرسل الطالب رقم الـ ID الخاص به للبوت{' '}
                <span className="font-mono font-bold text-sky-700" dir="ltr">
                  @{tgConfig.botUsername}
                </span>
              </div>
            )}

            {/* Quick Notification Sender */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="text-xs font-extrabold text-slate-800">إرسال إشعار فوري عبر تيليغرام</div>
              <select
                value={targetChatId}
                onChange={(e) => setTargetChatId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
              >
                <option value="ALL">إرسال لجميع الطلاب المربوطين ({tgUsers.length})</option>
                {tgUsers.map((u) => (
                  <option key={u.chatId} value={u.chatId}>
                    {u.studentName} (ID: {u.studentId})
                  </option>
                ))}
              </select>

              <textarea
                rows={2}
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="اكتب نص الإشعار أو التنبيه للطالب..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
              />

              <button
                type="button"
                disabled={sendingMsg || !broadcastMsg.trim()}
                onClick={handleSendTelegramMessage}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>إرسال الإشعار</span>
              </button>
            </div>

            {/* Users List */}
            {tgUsers.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 font-bold">
                لا يوجد طلاب مربوطون في ورقة «تيليغرام_الطلاب» بعد.
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1.5">
                {tgUsers.map((u) => (
                  <div
                    key={`${u.studentId}-${u.chatId}`}
                    className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-extrabold text-slate-900">{u.studentName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        ID: {u.studentId} · {u.telegramUsername || u.chatId}
                      </div>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-bold">مربوط</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TEACHER GRADING MODAL FOR SELECTED STUDENT SUBMISSION
         ===================================================================== */}
      {selectedSub && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92dvh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-[#0c3868] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-white">
                  تصحيح واجب: {selectedSub.studentName} (ID: {selectedSub.studentId})
                </h3>
                <p className="text-xs text-blue-100">{selectedSub.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSub(null)}
                className="p-2 text-white/80 hover:text-white rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCorrection} className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Student Submitted Media Preview */}
              {(selectedSub.imageLink || selectedSub.recordingLink) && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="text-xs font-extrabold text-slate-700">ملفات الطالب المرسلة:</div>
                  {selectedSub.imageLink && (
                    <div className="relative max-w-sm">
                      <img
                        src={resolveVideoQuestionImage(selectedSub.imageLink) || selectedSub.imageLink}
                        alt="واجب الطالب"
                        onClick={() =>
                          setZoomedImg(
                            resolveVideoQuestionImage(selectedSub.imageLink) || selectedSub.imageLink!
                          )
                        }
                        className="w-full max-h-56 object-contain rounded-xl border border-slate-200 bg-white cursor-zoom-in"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setZoomedImg(
                            resolveVideoQuestionImage(selectedSub.imageLink) || selectedSub.imageLink!
                          )
                        }
                        className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-slate-900/80 text-white cursor-pointer"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  {selectedSub.recordingLink && (
                    <audio
                      controls
                      src={
                        resolveVideoAudioAlternatives(selectedSub.recordingLink)[0] ||
                        selectedSub.recordingLink
                      }
                      className="w-full h-10"
                    />
                  )}
                </div>
              )}

              {/* Photo Correction Fields */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-indigo-600" />
                  <span>تصحيح واجب الصورة</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">الحالة</label>
                    <input
                      type="text"
                      value={corrImageStatus}
                      onChange={(e) => setCorrImageStatus(e.target.value)}
                      placeholder="ممتاز / يحتاج إعادة"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">الدرجة</label>
                    <input
                      type="text"
                      value={corrImageScore}
                      onChange={(e) => setCorrImageScore(e.target.value)}
                      placeholder="10/10 أو 95%"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">رابط الصورة المصححة</label>
                    <input
                      type="text"
                      value={corrImageUrl}
                      onChange={(e) => setCorrImageUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                  <label className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{corrImageBase64 ? 'تم اختيار صورة مصححة' : 'أو رفع صورة مصححة لـ Drive'}</span>
                    <input type="file" accept="image/*" onChange={handleCorrImageFile} className="hidden" />
                  </label>
                </div>

                <textarea
                  rows={2}
                  value={corrImageNotes}
                  onChange={(e) => setCorrImageNotes(e.target.value)}
                  placeholder="ملاحظات المعلم على واجب الصورة..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              {/* Audio & Video Correction Fields */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-emerald-600" />
                  <span>تصحيح الواجب الصوتي وتوجيه المعلم</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">الحالة</label>
                    <input
                      type="text"
                      value={corrAudioStatus}
                      onChange={(e) => setCorrAudioStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">الدرجة</label>
                    <input
                      type="text"
                      value={corrAudioScore}
                      onChange={(e) => setCorrAudioScore(e.target.value)}
                      placeholder="10/10"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleTeacherAudioRecording}
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer ${
                      isRecTeacherAudio
                        ? 'bg-slate-900 text-white'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {isRecTeacherAudio ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    <span>{isRecTeacherAudio ? 'إيقاف تسجيل التوجيه' : 'تسجيل ملاحظة صوتية للطالب'}</span>
                  </button>
                  {teacherAudioPreviewUrl && (
                    <audio controls src={teacherAudioPreviewUrl} className="h-9 flex-1 min-w-[200px]" />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">رابط صوت المعلم (اختياري)</label>
                    <input
                      type="text"
                      value={corrTeacherAudioUrl}
                      onChange={(e) => setCorrTeacherAudioUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">رابط فيديو تصحيح المعلم (اختياري)</label>
                    <input
                      type="text"
                      value={corrTeacherVideoUrl}
                      onChange={(e) => setCorrTeacherVideoUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                      dir="ltr"
                    />
                  </div>
                </div>

                <textarea
                  rows={2}
                  value={corrAudioNotes}
                  onChange={(e) => setCorrAudioNotes(e.target.value)}
                  placeholder="ملاحظات المعلم على التلاوة / النطق..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={sendTgOnSave}
                  onChange={(e) => setSendTgOnSave(e.target.checked)}
                  className="w-4 h-4 rounded accent-sky-600"
                />
                <span>إرسال إشعار فوري بالنتيجة والتصحيح للطالب عبر بوت تيليغرام</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedSub(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingCorrection}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                >
                  {savingCorrection ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>حفظ التصحيح في «فيديو_التصحيح»</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 4: VARIABLE TRANSLATIONS MANAGER (ترجمة المتغيرات)
         ===================================================================== */}
      {subTab === 'translations' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                <Languages className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  ترجمة متغيرات دروس الفيديو والأسئلة
                </h3>
                <p className="text-xs text-slate-500">
                  ترجمة المواضيع، العناوين، التعليمات، الأسئلة الزمنية وخياراتها مع حفظ التقييم الأصلي بالورقة
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isBatchTranslatingVars || filteredVarItems.length === 0}
                onClick={handleTranslateAllVars}
                className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isBatchTranslatingVars ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>ترجمة الكل بالذكاء الاصطناعي</span>
              </button>

              <button
                type="button"
                disabled={savingVarsToSheet}
                onClick={handleSaveVarsAndSync}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {savedVarsFlash ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                <span>{savingVarsToSheet ? 'جاري الحفظ...' : 'حفظ ومزامنة ورقة الترجمة'}</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={varSearch}
              onChange={(e) => setVarSearch(e.target.value)}
              placeholder="بحث في المواضيع، العناوين، الأسئلة، الخيارات..."
              className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {filteredVarItems.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm font-bold bg-slate-50 rounded-2xl border border-slate-200">
              لا توجد متغيرات نصية مطابقة للبحث حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVarItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                        {item.categoryLabel || 'متغير فيديو'}
                      </span>
                      {item.sheetSourceNote && (
                        <span className="font-semibold text-slate-600">{item.sheetSourceNote}</span>
                      )}
                      <span className="font-mono text-slate-400">{item.id}</span>
                    </div>
                    <button
                      type="button"
                      disabled={translatingVarId === item.id}
                      onClick={() => handleTranslateVarSingle(item)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {translatingVarId === item.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      <span>ترجمة آلية</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">العربية</label>
                      <input
                        type="text"
                        value={item.ar}
                        onChange={(e) => handleUpdateVarItem(item.id, { ar: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">التايلاندية (ไทย)</label>
                      <input
                        type="text"
                        value={item.th}
                        onChange={(e) => handleUpdateVarItem(item.id, { th: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600">الإنجليزية (English)</label>
                      <input
                        type="text"
                        value={item.en}
                        onChange={(e) => handleUpdateVarItem(item.id, { en: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {zoomedImg && (
        <div
          onClick={() => setZoomedImg(null)}
          className="fixed inset-0 z-[120] bg-slate-950/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={zoomedImg}
            alt="صورة مكبرة"
            className="max-w-full max-h-[90dvh] rounded-2xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
