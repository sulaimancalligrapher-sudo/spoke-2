import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bot,
  Send,
  Users,
  Save,
  RefreshCw,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Search,
  Bell,
  BellOff,
  Trash2,
  Copy,
  Check,
  UserPlus,
  Image as ImageIcon,
  ShieldCheck,
  Activity,
  X,
  QrCode,
  Download,
  ExternalLink,
} from 'lucide-react';
import {
  TelegramConfig,
  TelegramStudentLink,
  fetchTelegramConfig,
  fetchTelegramUsers,
  getLocalTelegramConfig,
  saveTelegramConfig,
  sendTelegramNotification,
  linkTelegramUserInSheet,
  toggleTelegramUserNotificationsInSheet,
  deleteTelegramUserInSheet,
} from '../video/videoSheets';
import { CourseScheduleData, getTodayLocalISO } from '../utils/courseSchedule';
import { normalizeDigits } from '../utils/googleSheets';

interface TelegramAdminManagerProps {
  webhookUrl: string;
  courseSchedule?: CourseScheduleData;
}

const MESSAGE_TEMPLATES: { label: string; text: string }[] = [
  {
    label: 'تذكير بحصة اليوم',
    text: 'السلام عليكم ورحمة الله وبركاته\nتذكير بموعد درس اليوم في المنصة. يسعدنا حضوركم وإنجاز التمارين في وقتها.',
  },
  {
    label: 'تصحيح الواجبات',
    text: 'السلام عليكم\nتمت مراجعة وتصحيح واجباتكم الأخيرة. يمكنكم الدخول للمنصة للاطلاع على الملاحظات والدرجات.',
  },
  {
    label: 'إعلان إداري',
    text: 'تنبيه هام للمشتركين:\nيرجى مراجعة الجدول اليومي للدورة والتأكد من إتمام الدروس المطلوبة لهذا الأسبوع.',
  },
];

export const TelegramAdminManager: React.FC<TelegramAdminManagerProps> = ({
  webhookUrl,
  courseSchedule,
}) => {
  const [tgConfig, setTgConfig] = useState<TelegramConfig>(() => getLocalTelegramConfig());
  const [tgUsers, setTgUsers] = useState<TelegramStudentLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [sendingAdminTest, setSendingAdminTest] = useState(false);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [botDiagnostic, setBotDiagnostic] = useState<string | null>(null);

  // Notification composer state
  const [targetValue, setTargetValue] = useState<string>('ALL'); // 'ALL' | 'SELECTED' | 'CUSTOM_CHAT' | 'CHAT:<chatId>'
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customChatId, setCustomChatId] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // Telegram Quick Link & QR Code state
  const [qrStudentId, setQrStudentId] = useState('');
  const [tgQrDataUrl, setTgQrDataUrl] = useState('');

  // Linked students search, manual link & row actions
  const [userSearch, setUserSearch] = useState('');
  const [showManualLink, setShowManualLink] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualChatId, setManualChatId] = useState('');
  const [manualUsername, setManualUsername] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [busyUserKey, setBusyUserKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, users] = await Promise.all([
        fetchTelegramConfig(webhookUrl),
        fetchTelegramUsers(webhookUrl),
      ]);
      setTgConfig(cfg);
      setTgUsers(users);
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'تعذر جلب إعدادات أو قائمة مستخدمي تيليغرام من Google Sheets.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [webhookUrl]);

  const todayScheduleMessage = useMemo(() => {
    if (!courseSchedule) return '';
    const todayIso = getTodayLocalISO();
    const todayDays = courseSchedule.days.filter((d) => d.date === todayIso);
    if (todayDays.length === 0) return '';
    const lines: string[] = [`<b>تذكير بجدول اليوم (${todayIso}):</b>`];
    todayDays.forEach((d) => {
      const gIds = d.groupIds?.length ? d.groupIds : d.groupId ? [d.groupId] : [];
      const groupNames = gIds
        .map((gid) => courseSchedule.groups.find((g) => g.id === gid))
        .filter(Boolean);
      if (d.customTitle) lines.push(`• ${d.customTitle}`);
      groupNames.forEach((grp) => {
        if (!grp) return;
        const topics = grp.lessons.map((l) => l.topicName).join('، ');
        lines.push(`- <b>${grp.name}</b>${topics ? `: ${topics}` : ''}`);
      });
    });
    return lines.join('\n');
  }, [courseSchedule]);

  const filteredUsers = useMemo(() => {
    const q = normalizeDigits(userSearch).toLowerCase();
    if (!q) return tgUsers;
    return tgUsers.filter(
      (u) =>
        u.studentName.toLowerCase().includes(q) ||
        normalizeDigits(u.studentId).toLowerCase().includes(q) ||
        u.chatId.toLowerCase().includes(q) ||
        (u.telegramUsername || '').toLowerCase().includes(q)
    );
  }, [tgUsers, userSearch]);

  const activeUsersCount = useMemo(
    () => tgUsers.filter((u) => u.notificationsEnabled !== false).length,
    [tgUsers]
  );

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {}
  };

  const cleanBotUsername = useMemo(
    () => (tgConfig.botUsername || '').trim().replace(/^@/, ''),
    [tgConfig.botUsername]
  );

  const tgQuickUrl = useMemo(() => {
    if (!cleanBotUsername) return '';
    const cleanSid = normalizeDigits(qrStudentId);
    return cleanSid
      ? `https://t.me/${cleanBotUsername}?start=${encodeURIComponent(cleanSid)}`
      : `https://t.me/${cleanBotUsername}`;
  }, [cleanBotUsername, qrStudentId]);

  useEffect(() => {
    let active = true;
    if (!tgQuickUrl) {
      setTgQrDataUrl('');
      return;
    }
    QRCode.toDataURL(tgQuickUrl, {
      width: 260,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (active) setTgQrDataUrl(url);
      })
      .catch(() => {
        if (active) setTgQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [tgQuickUrl]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusBanner(null);
    try {
      let configToSave: TelegramConfig = {
        ...tgConfig,
        botToken: tgConfig.botToken.trim(),
        botUsername: tgConfig.botUsername.trim().replace(/^@/, ''),
        adminChatId: (tgConfig.adminChatId || '').trim(),
      };
      if (configToSave.botToken && !configToSave.botUsername) {
        try {
          const resp = await fetch(
            `https://api.telegram.org/bot${encodeURIComponent(configToSave.botToken)}/getMe`
          );
          const meData = await resp.json();
          if (meData.ok && meData.result?.username) {
            configToSave = { ...configToSave, botUsername: String(meData.result.username) };
            setTgConfig(configToSave);
          }
        } catch {}
      }
      const res = await saveTelegramConfig(webhookUrl, configToSave);
      setStatusBanner({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestBot = async () => {
    if (!tgConfig.botToken.trim()) {
      setBotDiagnostic('يرجى إدخال Bot Token أولاً.');
      return;
    }
    setBotDiagnostic('جاري الاتصال بخوادم تيليغرام وفحص التوكن...');
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(tgConfig.botToken.trim())}/getMe`
      );
      const data = await resp.json();
      if (data.ok && data.result) {
        const uname = data.result.username || '';
        if (uname) setTgConfig((prev) => ({ ...prev, botUsername: uname }));
        setBotDiagnostic(`تم التحقق بنجاح! اسم البوت: ${data.result.first_name} (@${uname})`);
      } else {
        setBotDiagnostic(`فشل التحقق: ${data.description || 'تأكد من صحة Bot Token'}`);
      }
    } catch {
      setBotDiagnostic('تعذر الاتصال بـ Telegram API من المتصفح.');
    }
  };

  const handleRegisterWebhook = async () => {
    if (!tgConfig.botToken.trim() || !webhookUrl.trim().startsWith('http')) {
      setBotDiagnostic('يجب توفر Bot Token ورابط Google Apps Script Webhook أولاً.');
      return;
    }
    setBotDiagnostic('جاري ربط Webhook البوت مع Google Apps Script...');
    try {
      const apiUrl = `https://api.telegram.org/bot${encodeURIComponent(
        tgConfig.botToken.trim()
      )}/setWebhook?url=${encodeURIComponent(webhookUrl.trim())}`;
      const resp = await fetch(apiUrl);
      const data = await resp.json();
      if (data.ok) {
        setBotDiagnostic('تم ربط Webhook تيليغرام مع Google Apps Script بنجاح!');
      } else {
        setBotDiagnostic(`تعذر ضبط Webhook: ${data.description || 'خطأ غير معروف'}`);
      }
    } catch {
      setBotDiagnostic('حدث خطأ أثناء ضبط Webhook.');
    }
  };

  const handleCheckWebhookInfo = async () => {
    if (!tgConfig.botToken.trim()) {
      setBotDiagnostic('يرجى إدخال Bot Token أولاً.');
      return;
    }
    setBotDiagnostic('جاري فحص حالة Webhook الحالية...');
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(tgConfig.botToken.trim())}/getWebhookInfo`
      );
      const data = await resp.json();
      if (data.ok && data.result) {
        const curUrl = data.result.url || '(غير مربوط)';
        const pending = data.result.pending_update_count || 0;
        const lastErr = data.result.last_error_message ? ` — آخر خطأ: ${data.result.last_error_message}` : '';
        setBotDiagnostic(`Webhook الحالي: ${curUrl} · تحديثات معلقة: ${pending}${lastErr}`);
      } else {
        setBotDiagnostic(`تعذر الفحص: ${data.description || 'خطأ غير معروف'}`);
      }
    } catch {
      setBotDiagnostic('تعذر الاتصال بخوادم تيليغرام.');
    }
  };

  const handleTestAdminAlert = async () => {
    const adminCid = (tgConfig.adminChatId || '').trim();
    const tokenVal = (tgConfig.botToken || '').trim();
    if (!tokenVal) {
      setStatusBanner({
        type: 'warning',
        text: 'يرجى إدخال Bot Token أولاً.',
      });
      return;
    }
    if (!adminCid) {
      setStatusBanner({
        type: 'warning',
        text: 'أدخل رقم Chat ID للمشرف أولاً (أرسل /id للبوت لمعرفته).',
      });
      return;
    }
    setSendingAdminTest(true);
    setStatusBanner(null);
    try {
      const res = await sendTelegramNotification(webhookUrl, {
        chatId: adminCid,
        botToken: tokenVal,
        message: '<b>رسالة اختبار للمشرف</b>\nتم ربط تنبيهات الإدارة عبر بوت تيليغرام بنجاح.',
      });
      setStatusBanner({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? 'تم إرسال رسالة الاختبار إلى حساب المشرف في تيليغرام بنجاح!'
          : res.message,
      });
    } finally {
      setSendingAdminTest(false);
    }
  };

  const handleSendNotification = async () => {
    if (!messageText.trim()) return;
    setSendingMsg(true);
    setStatusBanner(null);
    try {
      const tokenVal = (tgConfig.botToken || '').trim();
      let params: Parameters<typeof sendTelegramNotification>[1] = {
        message: messageText.trim(),
        photoUrl: photoUrl.trim() || undefined,
        botToken: tokenVal || undefined,
      };

      if (targetValue === 'ALL') {
        params.broadcastAll = true;
      } else if (targetValue === 'SELECTED') {
        const cleanSelected = selectedIds.map((id) => normalizeDigits(id)).filter(Boolean);
        if (cleanSelected.length === 0) {
          setStatusBanner({
            type: 'warning',
            text: 'يرجى تحديد طالب واحد على الأقل لإرسال الإشعار المخصص.',
          });
          setSendingMsg(false);
          return;
        }
        params.studentIds = cleanSelected;
      } else if (targetValue === 'CUSTOM_CHAT') {
        const cleanCid = customChatId.trim();
        if (!cleanCid) {
          setStatusBanner({
            type: 'warning',
            text: 'يرجى إدخال رقم Chat ID المطلوب الإرسال إليه.',
          });
          setSendingMsg(false);
          return;
        }
        params.chatId = cleanCid;
      } else if (targetValue.startsWith('CHAT:')) {
        params.chatId = targetValue.slice('CHAT:'.length);
      }

      const res = await sendTelegramNotification(webhookUrl, params);
      setStatusBanner({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
      if (res.success) {
        setMessageText('');
        setPhotoUrl('');
      }
    } finally {
      setSendingMsg(false);
    }
  };

  const handleManualLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualId.trim() || !manualChatId.trim()) return;
    setSavingManual(true);
    setStatusBanner(null);
    const res = await linkTelegramUserInSheet(webhookUrl, {
      studentId: normalizeDigits(manualId),
      studentName: manualName.trim(),
      chatId: manualChatId.trim(),
      telegramUsername: manualUsername.trim(),
      notificationsEnabled: true,
    });
    if (res.success) {
      setStatusBanner({ type: 'success', text: res.message });
      setManualId('');
      setManualName('');
      setManualChatId('');
      setManualUsername('');
      setShowManualLink(false);
      await loadData();
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setSavingManual(false);
  };

  const handleToggleUserNotify = async (u: TelegramStudentLink) => {
    const key = `${u.studentId}-${u.chatId}`;
    const nextEnabled = !(u.notificationsEnabled !== false);
    setBusyUserKey(key);
    setStatusBanner(null);
    const res = await toggleTelegramUserNotificationsInSheet(webhookUrl, {
      studentId: u.studentId,
      chatId: u.chatId,
      notificationsEnabled: nextEnabled,
    });
    if (res.success) {
      setTgUsers((prev) =>
        prev.map((row) =>
          row.chatId === u.chatId && row.studentId === u.studentId
            ? { ...row, notificationsEnabled: nextEnabled }
            : row
        )
      );
      setStatusBanner({
        type: 'success',
        text: nextEnabled
          ? `تم تفعيل إشعارات الطالب (${u.studentName})`
          : `تم إيقاف إشعارات الطالب (${u.studentName}) مؤقتاً`,
      });
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setBusyUserKey(null);
  };

  const handleDeleteUser = async (u: TelegramStudentLink) => {
    const key = `${u.studentId}-${u.chatId}`;
    setConfirmDeleteKey(null);
    setBusyUserKey(key);
    setStatusBanner(null);
    const res = await deleteTelegramUserInSheet(webhookUrl, {
      studentId: u.studentId,
      chatId: u.chatId,
    });
    if (res.success) {
      setTgUsers((prev) =>
        prev.filter((row) => !(row.chatId === u.chatId && row.studentId === u.studentId))
      );
      setStatusBanner({ type: 'success', text: res.message });
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setBusyUserKey(null);
  };

  return (
    <div className="space-y-6 font-cairo" dir="rtl">
      {/* Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
              <span>بوت تيليغرام والإشعارات المركزية</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  tgConfig.enabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {tgConfig.enabled ? 'مفعّل' : 'غير مفعّل'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                {activeUsersCount} / {tgUsers.length} طالب نشط
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              إدارة مستقلة لإعدادات البوت (<code className="font-mono">تيليغرام_الإعدادات</code>) والطلاب المربوطين (
              <code className="font-mono">تيليغرام_الطلاب</code>) وإرسال الإشعارات الجماعية أو حسب المجموعات.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {tgConfig.botUsername && (
            <button
              type="button"
              onClick={() => copyText('bot_link', `https://t.me/${tgConfig.botUsername}`)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-bold cursor-pointer"
            >
              {copiedKey === 'bot_link' ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Copy className="w-4 h-4 text-sky-600" />
              )}
              <span>نسخ رابط البوت (@{tgConfig.botUsername})</span>
            </button>
          )}
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث من الشيت</span>
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {statusBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Column 1: Bot Configuration + Quick Access QR Card */}
        <div className="space-y-6">
        <form
          onSubmit={handleSaveConfig}
          className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-sky-600" />
              <span>إعدادات البوت والتشغيل التلقائي</span>
            </h3>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-sky-600" />}
          </div>

          <div className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Bot Token (من BotFather)</label>
                <input
                  type="text"
                  value={tgConfig.botToken}
                  onChange={(e) => setTgConfig({ ...tgConfig, botToken: e.target.value })}
                  placeholder="123456789:ABCdef..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  dir="ltr"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">معرف البوت (بدون @)</label>
                <input
                  type="text"
                  value={tgConfig.botUsername}
                  onChange={(e) =>
                    setTgConfig({ ...tgConfig, botUsername: e.target.value.replace('@', '') })
                  }
                  placeholder="FaseehBot"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Chat ID للمشرف / المعلم (لاستقبال التنبيهات)</span>
                <span className="text-[10px] font-normal text-slate-500">أرسل /id للبوت لمعرفته</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tgConfig.adminChatId || ''}
                  onChange={(e) => setTgConfig({ ...tgConfig, adminChatId: e.target.value })}
                  placeholder="مثال: 987654321"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  dir="ltr"
                />
                <button
                  type="button"
                  disabled={sendingAdminTest}
                  onClick={handleTestAdminAlert}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-bold cursor-pointer shrink-0 disabled:opacity-60"
                >
                  {sendingAdminTest ? 'جاري الإرسال...' : 'اختبار تنبيه المشرف'}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">رسالة الترحيب عند ربط الطالب للبوت</label>
              <textarea
                rows={2}
                value={tgConfig.welcomeMessage || ''}
                onChange={(e) => setTgConfig({ ...tgConfig, welcomeMessage: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">تذييل ثابت أسفل الإشعارات (اختياري)</label>
              <input
                type="text"
                value={tgConfig.customFooter || ''}
                onChange={(e) => setTgConfig({ ...tgConfig, customFooter: e.target.value })}
                placeholder="مثال: منصة فصيح التعليمية — نتمنى لكم التوفيق"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            {/* Automation Toggles */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
              <div className="text-xs font-extrabold text-slate-800">قواعد التنبيه التلقائي</div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tgConfig.enabled}
                  onChange={(e) => setTgConfig({ ...tgConfig, enabled: e.target.checked })}
                  className="w-4 h-4 rounded accent-sky-600"
                />
                <span>تفعيل نظام بوت تيليغرام العام</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tgConfig.notifyOnVideoCorrection !== false}
                  onChange={(e) =>
                    setTgConfig({ ...tgConfig, notifyOnVideoCorrection: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-sky-600"
                />
                <span>إشعار الطالب تلقائياً عند تصحيح واجب الفيديو</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(tgConfig.notifyAdminOnHomework)}
                  onChange={(e) =>
                    setTgConfig({ ...tgConfig, notifyAdminOnHomework: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-sky-600"
                />
                <span>تنبيه المشرف عند إرسال واجب أو تأكيد حضور</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(tgConfig.dailyReminderEnabled)}
                  onChange={(e) =>
                    setTgConfig({ ...tgConfig, dailyReminderEnabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-sky-600"
                />
                <span>تفعيل وضع التذكير اليومي لحصص الدورة</span>
              </label>
            </div>
          </div>

          {botDiagnostic && (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs font-bold text-sky-900 break-words">
              {botDiagnostic}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ الإعدادات</span>
            </button>

            <button
              type="button"
              onClick={handleTestBot}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
            >
              فحص البوت
            </button>

            <button
              type="button"
              onClick={handleRegisterWebhook}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>ربط Webhook بالشيت</span>
            </button>

            <button
              type="button"
              onClick={handleCheckWebhookInfo}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>حالة الربط</span>
            </button>
          </div>
        </form>

        {/* Quick Link & QR Code Card for Telegram */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-sky-600" />
              <span>رابط ورمز QR للدخول السريع إلى تيليغرام</span>
            </h3>
          </div>

          {!cleanBotUsername ? (
            <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200 text-xs font-bold text-sky-900 leading-relaxed">
              أدخل <code className="font-mono">Bot Token</code> واضغط «فحص البوت» أو «حفظ الإعدادات» ليتم جلب معرف البوت تلقائياً وإنشاء رابط الدخول السريع ورمز QR الخاص به.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">
                  تخصيص برقم الطالب للربط التلقائي (اختياري)
                </label>
                <input
                  type="text"
                  value={qrStudentId}
                  onChange={(e) => setQrStudentId(e.target.value)}
                  placeholder="اتركه فارغاً لرابط البوت العام أو اكتب رقم المشترك مثل 1001"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="w-40 h-40 rounded-2xl bg-white p-2 border border-slate-200 shadow-2xs flex items-center justify-center shrink-0">
                  {tgQrDataUrl ? (
                    <img src={tgQrDataUrl} alt="Telegram Bot QR" className="w-full h-full object-contain" />
                  ) : (
                    <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0 w-full space-y-2.5 text-center sm:text-right">
                  <div className="text-xs font-extrabold text-slate-800">
                    {normalizeDigits(qrStudentId)
                      ? `رابط ربط مباشر للطالب #${normalizeDigits(qrStudentId)}`
                      : `الرابط المباشر لبوت تيليغرام (@${cleanBotUsername})`}
                  </div>
                  <div
                    className="p-2 rounded-xl bg-white border border-slate-200 text-[11px] font-mono text-sky-800 break-all"
                    dir="ltr"
                  >
                    {tgQuickUrl}
                  </div>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      onClick={() => copyText('qr_quick_link', tgQuickUrl)}
                      className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === 'qr_quick_link' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === 'qr_quick_link' ? 'تم النسخ' : 'نسخ الرابط'}</span>
                    </button>

                    <a
                      href={tgQuickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-sky-600" />
                      <span>فتح في تيليغرام</span>
                    </a>

                    {tgQrDataUrl && (
                      <a
                        href={tgQrDataUrl}
                        download={`telegram-${cleanBotUsername}${normalizeDigits(qrStudentId) ? `-${normalizeDigits(qrStudentId)}` : ''}.png`}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>تحميل QR</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>

        {/* Column 2: Notification Sender + Linked Students Management */}
        <div className="space-y-6">
          {/* Broadcast & Targeted Message Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-600" />
                <span>إرسال إشعار فوري عبر تيليغرام</span>
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الفئة المستهدفة</label>
                <select
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-900"
                >
                  <option value="ALL">جميع الطلاب المربوطين النشطين ({activeUsersCount})</option>
                  <option value="CUSTOM_CHAT">إرسال مباشر لـ Chat ID (تجريبي أو مستخدم محدد)</option>
                  {tgUsers.length > 0 && (
                    <option value="SELECTED">
                      تحديد مجموعة طلاب يدوياً ({selectedIds.length} محدد)
                    </option>
                  )}
                  {tgUsers.length > 0 && (
                    <optgroup label="إرسال لطالب محدد">
                      {tgUsers.map((u) => (
                        <option key={`${u.studentId}-${u.chatId}`} value={`CHAT:${u.chatId}`}>
                          {u.studentName} (ID: {u.studentId})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {targetValue === 'CUSTOM_CHAT' && (
                <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 space-y-1.5">
                  <label className="block text-[11px] font-extrabold text-sky-900">
                    أدخل Telegram Chat ID المستهدف (يمكن استخدام Chat ID المشرف أو الطالب للتجربة):
                  </label>
                  <input
                    type="text"
                    value={customChatId}
                    onChange={(e) => setCustomChatId(e.target.value)}
                    placeholder="مثال: 987654321"
                    className="w-full px-3 py-2 rounded-xl border border-sky-300 bg-white text-xs font-mono"
                    dir="ltr"
                  />
                </div>
              )}

              {targetValue === 'ALL' && activeUsersCount === 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900 leading-relaxed">
                  تنبيه: لا يوجد طلاب مربوطون في ورقة <code className="font-mono">تيليغرام_الطلاب</code> بعد. اطلب من الطالب فتح البوت عبر رابط QR وإرسال رقم اشتراكه، أو اختر «إرسال مباشر لـ Chat ID» للتجربة الفورية.
                </div>
              )}

              {targetValue === 'SELECTED' && tgUsers.length > 0 && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 max-h-36 overflow-y-auto space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 pb-1 border-b border-slate-200">
                    <span>اختر الطلاب المراد إرسال الإشعار لهم:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedIds(
                          selectedIds.length === tgUsers.length
                            ? []
                            : tgUsers.map((u) => u.studentId)
                        )
                      }
                      className="text-sky-700 hover:underline cursor-pointer"
                    >
                      {selectedIds.length === tgUsers.length ? 'إلغاء الكل' : 'تحديد الكل'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {tgUsers.map((u) => {
                      const checked = selectedIds.includes(u.studentId);
                      return (
                        <label
                          key={`sel-${u.studentId}-${u.chatId}`}
                          className="flex items-center gap-2 text-[11px] font-bold text-slate-800 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedIds((prev) =>
                                e.target.checked
                                  ? [...prev, u.studentId]
                                  : prev.filter((id) => id !== u.studentId)
                              );
                            }}
                            className="w-3.5 h-3.5 rounded accent-sky-600"
                          />
                          <span className="truncate">{u.studentName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Templates */}
              <div className="flex flex-wrap items-center gap-1.5">
                {todayScheduleMessage && (
                  <button
                    type="button"
                    onClick={() => setMessageText(todayScheduleMessage)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-extrabold cursor-pointer"
                  >
                    + تعبئة جدول اليوم تلقائياً
                  </button>
                )}
                {MESSAGE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => setMessageText(tpl.text)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-800 border border-slate-200 text-[11px] font-bold cursor-pointer"
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="اكتب نص الإشعار أو التذكير للطلاب (يدعم تنسيق <b>عريض</b>)..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs"
              />

              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="رابط صورة مرفقة (اختياري https://...)"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-mono"
                  dir="ltr"
                />
              </div>

              <button
                type="button"
                disabled={sendingMsg || !messageText.trim()}
                onClick={handleSendNotification}
                className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>إرسال الإشعار الآن</span>
              </button>
            </div>
          </div>

          {/* Linked Users Management Card */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <span>الطلاب المربوطون ({tgUsers.length})</span>
              </h3>

              <button
                type="button"
                onClick={() => setShowManualLink((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{showManualLink ? 'إغلاق الربط اليدوي' : 'ربط طالب يدوياً'}</span>
              </button>
            </div>

            {showManualLink && (
              <form
                onSubmit={handleManualLinkSubmit}
                className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 space-y-3"
              >
                <div className="text-xs font-extrabold text-indigo-900">ربط أو تحديث طالب يدوياً</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    required
                    value={manualId}
                    onChange={(e) => setManualId(e.target.value)}
                    placeholder="رقم المشترك (ID) *"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="اسم الطالب"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={manualChatId}
                    onChange={(e) => setManualChatId(e.target.value)}
                    placeholder="Telegram Chat ID *"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono"
                    dir="ltr"
                  />
                  <input
                    type="text"
                    value={manualUsername}
                    onChange={(e) => setManualUsername(e.target.value)}
                    placeholder="معرف تيليغرام (@user) اختياري"
                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono"
                    dir="ltr"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {savingManual ? 'جاري الحفظ...' : 'حفظ وربط الطالب'}
                </button>
              </form>
            )}

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="بحث بالاسم أو ID أو Chat ID..."
                className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
              />
            </div>

            {filteredUsers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                لا يوجد طلاب مربوطون في ورقة «تيليغرام_الطلاب» حتى الآن.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                {filteredUsers.map((u) => {
                  const key = `${u.studentId}-${u.chatId}`;
                  const isBusy = busyUserKey === key;
                  const enabled = u.notificationsEnabled !== false;
                  const deepLink = tgConfig.botUsername
                    ? `https://t.me/${tgConfig.botUsername}?start=${encodeURIComponent(u.studentId)}`
                    : '';

                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        enabled
                          ? 'bg-slate-50/70 border-slate-200'
                          : 'bg-rose-50/40 border-rose-200/80'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-xs text-slate-900 truncate">
                            {u.studentName || `طالب #${u.studentId}`}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-amber-300 font-mono text-[10px] font-bold">
                            #{u.studentId}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                          Chat: {u.chatId}
                          {u.telegramUsername ? ` · ${u.telegramUsername}` : ''}
                          {u.linkedAt ? ` · ${u.linkedAt}` : ''}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggleUserNotify(u)}
                          title={enabled ? 'إيقاف الإشعارات لهذا الطالب' : 'تفعيل الإشعارات'}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                            enabled
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {enabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                          <span>{enabled ? 'مفعّل' : 'متوقف'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTargetValue(`CHAT:${u.chatId}`)}
                          title="إرسال رسالة مباشرة لهذا الطالب"
                          className="p-1.5 rounded-xl bg-white hover:bg-sky-50 text-sky-700 border border-slate-200 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>

                        {deepLink && (
                          <button
                            type="button"
                            onClick={() => copyText(key, deepLink)}
                            title="نسخ رابط الربط السريع للطالب"
                            className="p-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 cursor-pointer"
                          >
                            {copiedKey === key ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {confirmDeleteKey === key ? (
                          <div className="flex items-center gap-1 bg-rose-100 px-2 py-1 rounded-xl border border-rose-300">
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="text-[11px] font-extrabold text-rose-800 px-1 cursor-pointer"
                            >
                              حذف؟
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(null)}
                              className="text-[11px] text-slate-600 px-1 cursor-pointer"
                            >
                              لا
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteKey(key)}
                            title="إلغاء الربط"
                            className="p-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
