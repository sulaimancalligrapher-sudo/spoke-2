import React, { useEffect, useMemo, useState } from 'react';
import {
  Mail,
  Stethoscope,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Send,
  Loader2,
  Save,
  Users,
  CheckSquare,
  Square,
  Sparkles,
  FileCode2,
  ShieldAlert,
  Info,
  Search,
} from 'lucide-react';
import {
  PortalPublicData,
  RegistrationSubmissionRecord,
} from '../types';
import {
  CourseClassroom,
  CourseProgram,
  PROGRAM_COLOR_META,
} from '../utils/courseSchedule';
import {
  EmailDiagnosisResult,
  diagnosePortalEmailStatus,
  fetchRegistrationSubmissionsFromSheets,
  savePortalDataToSheets,
  sendCustomAdminEmails,
  testPortalWelcomeEmail,
} from '../utils/portalSheets';

interface EmailAdminManagerProps {
  webhookUrl: string;
  portalData: PortalPublicData;
  onUpdatePortalData: (next: PortalPublicData) => void;
  coursePrograms?: CourseProgram[];
  courseClassrooms?: CourseClassroom[];
  onNavigateToSheets?: () => void;
}

export const EmailAdminManager: React.FC<EmailAdminManagerProps> = ({
  webhookUrl,
  portalData,
  onUpdatePortalData,
  coursePrograms = [],
  courseClassrooms = [],
  onNavigateToSheets,
}) => {
  // 1. Live Diagnostics State
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<EmailDiagnosisResult | null>(null);

  // 2. Test Email State
  const [testEmailInput, setTestEmailInput] = useState(
    portalData.settings.adminNotificationEmail || portalData.settings.contactEmail || ''
  );
  const [testLoading, setTestLoading] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    success: boolean;
    message: string;
    rawError?: string;
    diagnosisCode?: string;
    quota?: number;
    effectiveUserEmail?: string;
  } | null>(null);

  // 3. Auto Email Settings State
  const [adminNotifyEmail, setAdminNotifyEmail] = useState(
    portalData.settings.adminNotificationEmail || ''
  );
  const [contactEmail, setContactEmail] = useState(
    portalData.settings.contactEmail || ''
  );
  const [sendWelcomeToggle, setSendWelcomeToggle] = useState(
    portalData.settings.sendStudentWelcomeEmail !== false
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // 4. Custom Email Composer State
  const [subsLoading, setSubsLoading] = useState(false);
  const [submissions, setSubmissions] = useState<RegistrationSubmissionRecord[]>([]);
  const [filterProgramId, setFilterProgramId] = useState<string>('ALL');
  const [filterClassroomId, setFilterClassroomId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedEmails, setSelectedEmails] = useState<Record<string, boolean>>({});
  const [manualEmailsText, setManualEmailsText] = useState<string>('');
  const [composerSubject, setComposerSubject] = useState<string>(
    `رسالة من ${portalData.settings.academyName || 'الأكاديمية التعليمية'}`
  );
  const [composerBody, setComposerBody] = useState<string>(
    'مرحباً {name}،\n\nنود إعلامكم بالتحديثات الجديدة الخاصة ببرنامجكم التدريبي (رقم التسجيل: {id}).\n\nمع أطيب التحيات،'
  );
  const [composerSending, setComposerSending] = useState(false);
  const [composerFeedback, setComposerFeedback] = useState<{
    success: boolean;
    message: string;
    failedList?: { email: string; error: string }[];
  } | null>(null);

  useEffect(() => {
    setAdminNotifyEmail(portalData.settings.adminNotificationEmail || '');
    setContactEmail(portalData.settings.contactEmail || '');
    setSendWelcomeToggle(portalData.settings.sendStudentWelcomeEmail !== false);
  }, [
    portalData.settings.adminNotificationEmail,
    portalData.settings.contactEmail,
    portalData.settings.sendStudentWelcomeEmail,
  ]);

  const handleRunDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const res = await diagnosePortalEmailStatus(webhookUrl);
      setDiagResult(res);
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    handleRunDiagnostics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl]);

  const handleLoadSubscribers = async () => {
    setSubsLoading(true);
    try {
      const res = await fetchRegistrationSubmissionsFromSheets(webhookUrl);
      const valid = (res.submissions || []).filter(
        (s) => s.email && s.email.trim().includes('@')
      );
      setSubmissions(valid);
    } finally {
      setSubsLoading(false);
    }
  };

  useEffect(() => {
    handleLoadSubscribers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookUrl]);

  const handleSendTestEmail = async () => {
    setTestLoading(true);
    setTestFeedback(null);
    try {
      const res = await testPortalWelcomeEmail(webhookUrl, {
        toEmail: testEmailInput,
        academyName: portalData.settings.academyName || 'الأكاديمية التعليمية',
        adminNotificationEmail: adminNotifyEmail || contactEmail,
      });
      setTestFeedback({
        success: res.success,
        message: res.message,
        rawError: res.rawError,
        diagnosisCode: res.diagnosisCode,
        quota: res.quota,
        effectiveUserEmail: res.effectiveUserEmail,
      });
      await handleRunDiagnostics();
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveAutoEmailSettings = async () => {
    setSettingsSaving(true);
    setSettingsStatus(null);
    const nextData: PortalPublicData = {
      ...portalData,
      settings: {
        ...portalData.settings,
        adminNotificationEmail: adminNotifyEmail.trim(),
        contactEmail: contactEmail.trim(),
        sendStudentWelcomeEmail: sendWelcomeToggle,
      },
    };
    onUpdatePortalData(nextData);
    try {
      const res = await savePortalDataToSheets(webhookUrl, nextData);
      setSettingsStatus({
        success: res.success,
        message: res.message || (res.success ? 'تم حفظ إعدادات البريد التلقائي في الشيت.' : 'تعذر الحفظ.'),
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  // Deduplicated subscribers with emails
  const emailSubscribers = useMemo(() => {
    const seen = new Set<string>();
    const list: RegistrationSubmissionRecord[] = [];
    for (const sub of submissions) {
      const em = (sub.email || '').trim().toLowerCase();
      if (!em || !em.includes('@') || seen.has(em)) continue;
      seen.add(em);
      list.push(sub);
    }
    return list;
  }, [submissions]);

  const classroomsForFilter = useMemo(() => {
    if (filterProgramId === 'ALL') return courseClassrooms;
    return courseClassrooms.filter((c) => c.programId === filterProgramId);
  }, [courseClassrooms, filterProgramId]);

  const filteredSubscribers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return emailSubscribers.filter((sub) => {
      if (filterProgramId !== 'ALL' && sub.programId !== filterProgramId) return false;
      if (filterClassroomId !== 'ALL' && (sub.classroomId || '') !== filterClassroomId) return false;
      if (q) {
        const hay = `${sub.studentName} ${sub.email || ''} ${sub.registrationId} ${sub.programName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [emailSubscribers, filterProgramId, filterClassroomId, searchTerm]);

  const selectedRecipientsList = useMemo(() => {
    const map = new Map<string, { email: string; name?: string; registrationId?: string }>();
    for (const sub of emailSubscribers) {
      const key = (sub.email || '').trim().toLowerCase();
      if (selectedEmails[key]) {
        map.set(key, {
          email: sub.email!.trim(),
          name: sub.studentName,
          registrationId: sub.registrationId,
        });
      }
    }
    const extraParts = manualEmailsText
      .split(/[\n,;،]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    for (const em of extraParts) {
      const key = em.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { email: em });
      }
    }
    return Array.from(map.values());
  }, [emailSubscribers, selectedEmails, manualEmailsText]);

  const toggleSelectAllFiltered = () => {
    const allSelected =
      filteredSubscribers.length > 0 &&
      filteredSubscribers.every((s) => selectedEmails[(s.email || '').trim().toLowerCase()]);
    const next = { ...selectedEmails };
    for (const s of filteredSubscribers) {
      const k = (s.email || '').trim().toLowerCase();
      next[k] = !allSelected;
    }
    setSelectedEmails(next);
  };

  const handleSendCustomEmails = async () => {
    if (selectedRecipientsList.length === 0) {
      setComposerFeedback({
        success: false,
        message: 'اختر مشتركاً واحداً على الأقل أو أدخل بريداً إلكترونياً يدوياً.',
      });
      return;
    }
    if (!composerSubject.trim() || !composerBody.trim()) {
      setComposerFeedback({
        success: false,
        message: 'يرجى كتابة موضوع الرسالة ومحتواها.',
      });
      return;
    }
    setComposerSending(true);
    setComposerFeedback(null);
    try {
      const res = await sendCustomAdminEmails(webhookUrl, {
        recipients: selectedRecipientsList,
        subject: composerSubject.trim(),
        body: composerBody.trim(),
        senderName: portalData.settings.academyName || 'الأكاديمية التعليمية',
        replyToEmail: adminNotifyEmail || contactEmail,
      });
      setComposerFeedback({
        success: res.success,
        message: res.message,
        failedList: res.failedList,
      });
      if (res.success) {
        await handleRunDiagnostics();
      }
    } finally {
      setComposerSending(false);
    }
  };

  const renderDiagnosisBadge = () => {
    if (!diagResult) return null;
    if (diagResult.needsScriptUpdate || diagResult.diagnosisCode === 'SCRIPT_OUTDATED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>الرابط الخلفي يحتاج تحديث نشر (New Version)</span>
        </span>
      );
    }
    if (diagResult.diagnosisCode === 'OK' && diagResult.mailAuthorized && diagResult.remainingQuota > 0) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>البريد مفعّل وجاهز ({diagResult.remainingQuota} رسالة متبقية اليوم)</span>
        </span>
      );
    }
    if (diagResult.diagnosisCode === 'AUTH_REQUIRED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-extrabold">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>ينقصه تفويض Google Mail (script.send_mail)</span>
        </span>
      );
    }
    if (diagResult.diagnosisCode === 'QUOTA_ZERO') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>مفوّض لكن الرصيد اليومي = 0</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-extrabold">
        <XCircle className="w-3.5 h-3.5" />
        <span>خطأ: {diagResult.diagnosisCode}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 font-cairo" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6 text-indigo-300" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-extrabold">
              إدارة البريد الإلكتروني والتشخيص العميق
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              فحص مباشر لحالة صلاحيات MailApp في Google Apps Script، وكشف سبب عدم الإرسال أو نفاد الحصة، وإرسال بريد اختباري أو رسائل جماعية/فردية للمشتركين.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRunDiagnostics}
            disabled={diagLoading}
            className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {diagLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Stethoscope className="w-4 h-4" />
            )}
            <span>فحص الصلاحية والرصيد الآن</span>
          </button>
          {onNavigateToSheets && (
            <button
              type="button"
              onClick={onNavigateToSheets}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <FileCode2 className="w-4 h-4" />
              <span>كود Apps Script</span>
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Deep Diagnostics Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-indigo-600" />
            <span>نتائج الفحص المباشر من الخادم (Google Apps Script)</span>
          </h3>
          {renderDiagnosisBadge()}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[11px] font-bold text-slate-500">حالة تفويض MailApp</div>
            <div className="text-sm font-extrabold text-slate-900">
              {diagLoading
                ? 'جاري الفحص...'
                : diagResult?.mailAuthorized
                ? 'مفوّض بنجاح ✓'
                : 'غير مفوّض أو يحتاج تحديث'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[11px] font-bold text-slate-500">الرصيد اليومي المتبقي</div>
            <div className="text-sm font-extrabold font-mono text-slate-900">
              {diagLoading ? '...' : `${diagResult?.remainingQuota ?? 0} رسالة`}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[11px] font-bold text-slate-500">الحساب المُرسِل (المالك)</div>
            <div className="text-xs font-extrabold font-mono text-slate-800 truncate" dir="ltr">
              {diagResult?.effectiveUserEmail || 'غير مكشوف / يتطلب إذن'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[11px] font-bold text-slate-500">إصدار السكربت</div>
            <div className="text-xs font-extrabold font-mono text-slate-800 truncate" dir="ltr">
              {diagResult?.scriptVersion || (diagResult?.needsScriptUpdate ? 'قديـم' : '—')}
            </div>
          </div>
        </div>

        {(diagResult?.rawError || diagResult?.message) && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
            <div className="font-extrabold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>تفاصيل الخطأ من Google:</span>
            </div>
            <div className="font-mono text-[11px] break-all bg-white/80 p-2 rounded-xl border border-rose-200" dir="ltr">
              {diagResult.rawError || diagResult.message}
            </div>
          </div>
        )}

        {/* Root-cause Explanation & Checklist */}
        <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-2 text-xs text-slate-800 leading-relaxed">
          <div className="font-extrabold text-indigo-950 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>لماذا ظهر سابقاً «تنبيه صلاحية البريد» ثم «الحصة المتبقية: 0» ولم يرسل البريد؟</span>
          </div>
          <p>
            كان الكود القديم يغلف <code className="bg-white px-1 rounded font-mono">MailApp.getRemainingDailyQuota()</code> داخل <code className="bg-white px-1 rounded font-mono">try/catch</code> مما أخفى نافذة طلب إذن Gmail في Apps Script وأظهر 0. تم إصلاح الدالة الآن لتطلب الإذن مباشرة. لتشغيل البريد فوراً:
          </p>
          <ol className="list-decimal list-inside space-y-1 font-bold text-slate-700">
            <li>افتح تبويب «ربط Google Sheets» وانسخ كود Apps Script المحدّث والصقه في محرر Apps Script.</li>
            <li>شغّل دالة <code className="bg-white px-1.5 py-0.5 rounded font-mono text-indigo-700">authorizePermissions</code> من القائمة العلوية في المحرر واضغط «مراجعة الأذونات» ثم «السماح» (Allow) لإرسال البريد.</li>
            <li>إذا أظهر السجل الرصيد &gt; 0 (عادة 100 لحساب Gmail المجاني)، اضغط «نشر (Deploy) ← إدارة عمليات النشر ← تعديل (القلم) ← إصدار جديد (New version) ← نشر».</li>
            <li>انقر هنا على «فحص الصلاحية والرصيد الآن» للتأكد أن الحصة &gt; 0.</li>
          </ol>
        </div>
      </div>

      {/* Section 2: Instant Test Email + Auto Email Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Instant Test */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-600" />
            <span>اختبار إرسال بريد فوري (MailApp)</span>
          </h3>
          <p className="text-xs text-slate-500">
            أرسل رسالة اختبار فعلية للتأكد من وصولها لصندوق الوارد ومتابعة الرصيد المتبقي بعد الإرسال.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-700 block">
              البريد المستلم للاختبار
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                dir="ltr"
                value={testEmailInput}
                onChange={(e) => setTestEmailInput(e.target.value)}
                placeholder="name@example.com"
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={testLoading}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
              >
                {testLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>إرسال بريد اختباري</span>
              </button>
            </div>
          </div>

          {testFeedback && (
            <div
              className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                testFeedback.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="font-extrabold flex items-center gap-1.5">
                {testFeedback.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{testFeedback.message}</span>
              </div>
              {testFeedback.rawError && (
                <div className="font-mono text-[11px] bg-white/80 p-2 rounded-xl border border-rose-200 break-all" dir="ltr">
                  {testFeedback.rawError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Auto Email Settings */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>إعدادات الإشعارات البريدية التلقائية</span>
          </h3>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700 block">
                بريد الإدارة لاستلام إشعارات التسجيل والطلبات الجديدة
              </label>
              <input
                type="email"
                dir="ltr"
                value={adminNotifyEmail}
                onChange={(e) => setAdminNotifyEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700 block">
                بريد التواصل الظاهر للزوار (Reply-To)
              </label>
              <input
                type="email"
                dir="ltr"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="contact@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono"
              />
            </div>

            <label className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-extrabold text-slate-800">
                  إرسال رسالة ترحيبية تلقائية بالبريد للطالب عند التسجيل
                </div>
                <div className="text-[11px] text-slate-500">
                  تتضمن رقم التسجيل (ID) ورابط الدخول ورابط تيليغرام.
                </div>
              </div>
              <input
                type="checkbox"
                checked={sendWelcomeToggle}
                onChange={(e) => setSendWelcomeToggle(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveAutoEmailSettings}
                disabled={settingsSaving}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {settingsSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>حفظ الإعدادات في الشيت</span>
              </button>
              {settingsStatus && (
                <span
                  className={`text-xs font-bold ${
                    settingsStatus.success ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {settingsStatus.message}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Custom Bulk/Single Email Composer */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>إرسال بريد إلكتروني مخصص (فردي أو جماعي للمشتركين)</span>
          </h3>
          <button
            type="button"
            onClick={handleLoadSubscribers}
            disabled={subsLoading}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${subsLoading ? 'animate-spin' : ''}`} />
            <span>تحديث قائمة المشتركين ({emailSubscribers.length})</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Recipients Picker */}
          <div className="lg:col-span-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={filterProgramId}
                onChange={(e) => {
                  setFilterProgramId(e.target.value);
                  setFilterClassroomId('ALL');
                }}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
              >
                <option value="ALL">كل البرامج ({emailSubscribers.length})</option>
                {coursePrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <select
                value={filterClassroomId}
                onChange={(e) => setFilterClassroomId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
              >
                <option value="ALL">كل الفصول</option>
                {classroomsForFilter.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث بالاسم أو البريد أو رقم ID..."
                className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold"
              />
            </div>

            <div className="flex items-center justify-between text-xs px-1">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="text-indigo-700 hover:text-indigo-900 font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>تحديد / إلغاء تحديد المعروضين ({filteredSubscribers.length})</span>
              </button>
              <span className="font-bold text-slate-500">
                المحددون: {selectedRecipientsList.length}
              </span>
            </div>

            <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100 bg-slate-50/50">
              {filteredSubscribers.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  لا يوجد مشتركين لديهم بريد إلكتروني مسجّل ضمن هذا التصفية.
                </div>
              ) : (
                filteredSubscribers.map((sub) => {
                  const key = (sub.email || '').trim().toLowerCase();
                  const checked = Boolean(selectedEmails[key]);
                  const prog = coursePrograms.find((p) => p.id === sub.programId);
                  const cls = courseClassrooms.find((c) => c.id === sub.classroomId);
                  const pMeta = PROGRAM_COLOR_META[prog?.color || 'emerald'];
                  return (
                    <button
                      key={`${sub.registrationId}_${key}`}
                      type="button"
                      onClick={() =>
                        setSelectedEmails((prev) => ({ ...prev, [key]: !prev[key] }))
                      }
                      className={`w-full p-2.5 text-right flex items-center gap-2.5 transition-colors cursor-pointer ${
                        checked ? 'bg-indigo-50/80' : 'hover:bg-white'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 truncate">
                            {sub.studentName}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            #{sub.registrationId}
                          </span>
                          {prog && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${pMeta.pillBg} ${pMeta.pillText} ${pMeta.pillBorder}`}
                            >
                              {prog.name}
                            </span>
                          )}
                          {cls && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-slate-200 text-slate-700">
                              {cls.name}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-600 truncate" dir="ltr">
                          {sub.email}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-extrabold text-slate-700 block">
                إضافة عناوين بريد يدوياً (مفصولة بفاصلة أو سطر جديد)
              </label>
              <textarea
                rows={2}
                dir="ltr"
                value={manualEmailsText}
                onChange={(e) => setManualEmailsText(e.target.value)}
                placeholder="example1@gmail.com, example2@gmail.com"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono"
              />
            </div>
          </div>

          {/* Message Editor */}
          <div className="lg:col-span-7 space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700 block">
                عنوان / موضوع الرسالة
              </label>
              <input
                type="text"
                value={composerSubject}
                onChange={(e) => setComposerSubject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold"
                placeholder="موضوع الرسالة..."
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-extrabold text-slate-700">
                  نص الرسالة
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">إدراج متغير تلقائي:</span>
                  <button
                    type="button"
                    onClick={() => setComposerBody((b) => `${b} {name}`)}
                    className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold cursor-pointer hover:bg-indigo-100"
                  >
                    {'{name}'} اسم الطالب
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerBody((b) => `${b} {id}`)}
                    className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold cursor-pointer hover:bg-indigo-100"
                  >
                    {'{id}'} رقم التسجيل
                  </button>
                </div>
              </div>
              <textarea
                rows={8}
                value={composerBody}
                onChange={(e) => setComposerBody(e.target.value)}
                className="w-full px-3.5 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-xs leading-relaxed"
                placeholder="اكتب رسالتك هنا..."
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleSendCustomEmails}
                disabled={composerSending || selectedRecipientsList.length === 0}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {composerSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>إرسال إلى ({selectedRecipientsList.length}) مستلم الآن</span>
              </button>
            </div>

            {composerFeedback && (
              <div
                className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                  composerFeedback.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <div className="font-extrabold">{composerFeedback.message}</div>
                {composerFeedback.failedList && composerFeedback.failedList.length > 0 && (
                  <ul className="list-disc list-inside text-[11px] font-mono" dir="ltr">
                    {composerFeedback.failedList.map((f, idx) => (
                      <li key={idx}>
                        {f.email}: {f.error}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
