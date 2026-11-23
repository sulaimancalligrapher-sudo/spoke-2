import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  X,
  UserPlus,
  Send,
  Upload,
  Camera,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Copy,
  Trash2,
  RotateCw,
  ArrowLeft,
  Bot,
  FileText,
  Sparkles,
  LogIn,
  Download,
  Mail,
} from 'lucide-react';
import {
  PortalSettingsConfig,
  RegistrationAttachment,
  RegistrationQuestion,
  StudentRegistrant,
} from '../types';
import {
  buildTelegramBotStartLink,
  submitPortalRegistrationToSheets,
  uploadPortalFileToDrive,
} from '../utils/portalSheets';
import { getDirectImageUrl } from '../utils/mediaUrl';
import { sanitizeExternalUrl } from '../utils/googleSheets';
import { SupportedLang } from '../utils/translations';

interface PortalRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: RegistrationQuestion[];
  portalSettings: PortalSettingsConfig;
  stage1ProgramName?: string;
  preselectedProgramLabel?: string;
  initialPrefilledName?: string;
  webhookUrl: string;
  currentLang?: SupportedLang;
  onInstantEnterStudentPage: (student: StudentRegistrant) => void;
  onOpenExistingLogin: () => void;
}

const REG_UI = {
  ar: {
    title: 'استمارة التسجيل والالتحاق بالمنصة',
    subtitle: 'أكمل البيانات التالية للدخول الفوري إلى القسم التمهيدي الافتراضي وتجربة الآلية',
    required: 'مطلوب',
    optional: 'اختياري',
    guideLink: 'دليل توضيحي',
    uploadFile: 'رفع ملف أو صورة',
    cameraCapture: 'تصوير بالكاميرا',
    uploading: 'جاري الرفع إلى Google Drive...',
    uploadedOk: 'تم الحفظ في Google Drive',
    openFile: 'معاينة الملف',
    removeFile: 'حذف',
    submitBtn: 'إرسال التسجيل وإنشاء رقم الدخول',
    submittingBtn: 'جاري التسجيل وإرسال الإشعارات...',
    haveAccount: 'لديك رقم مشترك بالفعل؟ تسجيل الدخول',
    successBadge: 'تم التسجيل بنجاح — المرحلة التمهيدية',
    successTitle: 'أهلاً بك! حسابك جاهز للدخول المباشر',
    successSubtitle:
      'تم حفظ طلبك وإشعار الإدارة بنجاح. يمكنك ربط تيليغرام عبر الرابط أو رمز QR أدناه ثم الدخول المباشر باسمك ورقمك.',
    emailSentBadge: 'تم إرسال رسالة تأكيد بالرابطين ورمزي QR إلى بريدك الإلكتروني:',
    emailFailedTitle: 'تعذر إرسال رسالة البريد الإلكتروني تلقائياً إلى:',
    emailFailedHint: 'يمكنك حفظ بيانات الدخول أعلاه وتصوير رمز QR لتيليغرام مباشرة.',
    regIdLabel: 'رقم التسجيل الخاص بك (ID)',
    copyId: 'نسخ الرقم',
    copied: 'تم النسخ',
    tgStepTitle: 'ربط بوت تيليغرام المباشر (رابط + QR)',
    tgStepDesc:
      'افتح الرابط أو امسح رمز QR واضغط Start في تيليغرام ليتم ربط معرفك تلقائياً وتلقي إشعار قبولك وترقيتك للبرنامج الأساسي.',
    tgBtn: 'فتح رابط تيليغرام المباشر الآن',
    tgNoBotHint:
      'بمجرد ضبط اسم مستخدم البوت في إعدادات تيليغرام، سيظهر رابط الربط التلقائي هنا.',
    enterNowBtn: 'الدخول الآن إلى صفحتي الخاصة والبيانات الافتراضية',
    camTitle: 'التقاط صورة مباشرة بالكاميرا',
    camRetake: 'إعادة التقاط',
    camConfirm: 'اعتماد ورفع الصورة',
    camSnap: 'التقاط الآن',
    camSwitch: 'تبديل الكاميرا',
  },
  en: {
    title: 'Academy Registration Application',
    subtitle: 'Complete your details for instant access to the introductory stage',
    required: 'Required',
    optional: 'Optional',
    guideLink: 'Guide',
    uploadFile: 'Upload File / Image',
    cameraCapture: 'Camera Photo',
    uploading: 'Uploading to Google Drive...',
    uploadedOk: 'Saved to Google Drive',
    openFile: 'Open File',
    removeFile: 'Remove',
    submitBtn: 'Submit Registration & Generate ID',
    submittingBtn: 'Submitting & sending notifications...',
    haveAccount: 'Already have a Student ID? Sign In',
    successBadge: 'Registration Complete — Stage 1',
    successTitle: 'Welcome! Your introductory account is ready',
    successSubtitle:
      'Your application has been saved. Link Telegram via the button or QR code below, then enter directly using your Name & ID.',
    emailSentBadge: 'Welcome email with links & QR codes sent to:',
    emailFailedTitle: 'Automatic welcome email could not be delivered to:',
    emailFailedHint: 'Please copy your Registration ID and scan/save the Telegram QR below.',
    regIdLabel: 'Your Registration ID',
    copyId: 'Copy ID',
    copied: 'Copied',
    tgStepTitle: 'Direct Telegram Connection (Link + QR)',
    tgStepDesc:
      'Open the direct link or scan the QR code and press Start in Telegram so we receive your Telegram ID for instant promotion & teacher updates.',
    tgBtn: 'Open Direct Telegram Link',
    tgNoBotHint: 'Configure bot username in Admin Telegram Settings to enable instant deep linking.',
    enterNowBtn: 'Enter My Private Page (Introductory Stage)',
    camTitle: 'Direct Camera Capture',
    camRetake: 'Retake',
    camConfirm: 'Use Photo',
    camSnap: 'Capture',
    camSwitch: 'Switch Camera',
  },
  th: {
    title: 'แบบฟอร์มสมัครเรียนและลงทะเบียน',
    subtitle: 'กรอกข้อมูลเพื่อรับรหัสผู้เรียนและเข้าสู่หน้าทดลองเบื้องต้นได้ทันที',
    required: 'จำเป็น',
    optional: 'ไม่บังคับ',
    guideLink: 'คำแนะนำ',
    uploadFile: 'อัปโหลดไฟล์ / รูปภาพ',
    cameraCapture: 'ถ่ายภาพด้วยกล้อง',
    uploading: 'กำลังอัปโหลดไปยัง Google Drive...',
    uploadedOk: 'บันทึกใน Google Drive แล้ว',
    openFile: 'ดูไฟล์',
    removeFile: 'ลบ',
    submitBtn: 'ส่งใบสมัครและสร้างรหัสเข้าเรียน',
    submittingBtn: 'กำลังบันทึกและส่งการแจ้งเตือน...',
    haveAccount: 'มีรหัสผู้เรียนอยู่แล้ว? เข้าสู่ระบบ',
    successBadge: 'ลงทะเบียนสำเร็จ — ขั้นตอนที่ 1',
    successTitle: 'ยินดีต้อนรับ! บัญชีเบื้องต้นของคุณพร้อมใช้งานแล้ว',
    successSubtitle:
      'ระบบได้บันทึกข้อมูลเรียบร้อยแล้ว เชื่อมต่อ Telegram ผ่านปุ่มหรือสแกน QR ด้านล่าง จากนั้นเข้าสู่หน้าส่วนตัวด้วยชื่อและรหัสของคุณทันที',
    emailSentBadge: 'ส่งอีเมลยืนยันพร้อมลิงก์และ QR Code ไปยังอีเมลของคุณแล้ว:',
    emailFailedTitle: 'ไม่สามารถส่งอีเมลอัตโนมัติไปยัง:',
    emailFailedHint: 'กรุณาบันทึกรหัสผู้เรียนและสแกน QR Telegram ด้านล่างไว้ใช้งาน',
    regIdLabel: 'รหัสลงทะเบียนของคุณ (ID)',
    copyId: 'คัดลอกรหัส',
    copied: 'คัดลอกแล้ว',
    tgStepTitle: 'เชื่อมต่อบอท Telegram โดยตรง (ลิงก์ + QR)',
    tgStepDesc: 'กดลิงก์หรือสแกน QR Code เพื่อเปิด Telegram แล้วกด Start เพื่อให้ระบบบันทึกรหัส Telegram สำหรับแจ้งเตือนผลการอนุมัติ',
    tgBtn: 'เปิดลิงก์ Telegram โดยตรง',
    tgNoBotHint: 'ผู้ดูแลระบบสามารถตั้งค่าชื่อบอทในหน้าตั้งค่า Telegram เพื่อเปิดใช้งานลิงก์ตรง',
    enterNowBtn: 'เข้าสู่หน้าส่วนตัวและข้อมูลเบื้องต้นทันที',
    camTitle: 'ถ่ายภาพด้วยกล้องโดยตรง',
    camRetake: 'ถ่ายใหม่',
    camConfirm: 'ใช้ภาพนี้',
    camSnap: 'ถ่ายภาพ',
    camSwitch: 'สลับกล้อง',
  },
} as const;

export const PortalRegistrationModal: React.FC<PortalRegistrationModalProps> = ({
  isOpen,
  onClose,
  questions,
  portalSettings,
  stage1ProgramName,
  preselectedProgramLabel,
  initialPrefilledName,
  webhookUrl,
  currentLang = 'ar',
  onInstantEnterStudentPage,
  onOpenExistingLogin,
}) => {
  const ui = REG_UI[currentLang] || REG_UI.ar;
  const dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  const activeQuestions = React.useMemo(
    () =>
      questions
        .filter((q) => q.enabled !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [questions]
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [uploadingQId, setUploadingQId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedTgLink, setCopiedTgLink] = useState(false);
  const [tgQrDataUrl, setTgQrDataUrl] = useState<string>('');

  const [completedResult, setCompletedResult] = useState<{
    registrationId: string;
    student: StudentRegistrant;
    telegramDeepLink: string;
    botUsername: string;
    studentEmail?: string;
    studentEmailSent?: boolean;
    studentEmailError?: string;
  } | null>(null);

  // Camera capture state
  const [cameraQuestionId, setCameraQuestionId] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setCameraQuestionId(null);
    setCapturedDataUrl(null);
    setCameraError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setErrorMsg(null);
    } else if (initialPrefilledName) {
      const nameQ =
        activeQuestions.find((q) => q.id === 'q_full_name') ||
        activeQuestions.find((q) => q.label.includes('الاسم') || q.type === 'text');
      if (nameQ) {
        setAnswers((prev) =>
          prev[nameQ.id] ? prev : { ...prev, [nameQ.id]: initialPrefilledName }
        );
      }
    }
  }, [isOpen, initialPrefilledName]);

  useEffect(() => {
    const deepUrl = completedResult?.telegramDeepLink;
    if (!deepUrl) {
      setTgQrDataUrl('');
      return;
    }
    let active = true;
    QRCode.toDataURL(deepUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#0369a1', light: '#ffffff' },
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
  }, [completedResult?.telegramDeepLink]);

  useEffect(() => {
    if (!cameraQuestionId || capturedDataUrl) return;
    let active = true;
    const startCam = async () => {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError('تعذر تشغيل الكاميرا. تأكد من منح إذن الكاميرا في المتصفح.');
      }
    };
    startCam();
    return () => {
      active = false;
    };
  }, [cameraQuestionId, cameraFacing, capturedDataUrl]);

  if (!isOpen) return null;

  const getQuestionLabel = (q: RegistrationQuestion): string => {
    if (currentLang === 'en' && q.labelEn) return q.labelEn;
    if (currentLang === 'th' && q.labelTh) return q.labelTh;
    return q.label;
  };

  const handleFileSelected = async (qId: string, file: File) => {
    setErrorMsg(null);
    setUploadingQId(qId);
    try {
      const reader = new FileReader();
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = () => {
          const result = String(reader.result || '');
          const commaIdx = result.indexOf(',');
          resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
        reader.readAsDataURL(file);
      });

      const uploadRes = await uploadPortalFileToDrive(
        webhookUrl,
        base64,
        `reg_${Date.now()}_${file.name}`,
        file.type || 'application/octet-stream'
      );
      if (uploadRes.success && uploadRes.url) {
        setAnswers((prev) => ({ ...prev, [qId]: uploadRes.url! }));
      } else {
        setErrorMsg(uploadRes.error || 'تعذر رفع الملف إلى Google Drive.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء رفع الملف.');
    } finally {
      setUploadingQId(null);
    }
  };

  const handleCapturePhoto = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth || 1280;
    canvas.height = vid.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.85));
  };

  const handleConfirmCapturedPhoto = async () => {
    if (!cameraQuestionId || !capturedDataUrl) return;
    const qId = cameraQuestionId;
    const commaIdx = capturedDataUrl.indexOf(',');
    const base64 = commaIdx >= 0 ? capturedDataUrl.slice(commaIdx + 1) : capturedDataUrl;
    stopCamera();
    setUploadingQId(qId);
    try {
      const uploadRes = await uploadPortalFileToDrive(
        webhookUrl,
        base64,
        `camera_reg_${Date.now()}.jpg`,
        'image/jpeg'
      );
      if (uploadRes.success && uploadRes.url) {
        setAnswers((prev) => ({ ...prev, [qId]: uploadRes.url! }));
      } else {
        setErrorMsg(uploadRes.error || 'تعذر رفع الصورة الملتقطة إلى Google Drive.');
      }
    } finally {
      setUploadingQId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || uploadingQId) return;
    setErrorMsg(null);

    for (const q of activeQuestions) {
      const val = (answers[q.id] || '').trim();
      if (q.required && !val) {
        setErrorMsg(`الحقل «${getQuestionLabel(q)}» مطلوب قبل إرسال الطلب.`);
        return;
      }
      if (val && q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        setErrorMsg(`صيغة البريد الإلكتروني غير صحيحة في حقل «${getQuestionLabel(q)}».`);
        return;
      }
      if (val && q.type === 'phone' && val.replace(/[^\d+]/g, '').length < 6) {
        setErrorMsg(`رقم الهاتف غير مكتمل في حقل «${getQuestionLabel(q)}».`);
        return;
      }
    }

    // Resolve key identity values cleanly from active questions
    const nameQ =
      activeQuestions.find((q) => q.id === 'q_full_name') ||
      activeQuestions.find((q) => q.label.includes('الاسم') || q.type === 'text');
    const phoneQ =
      activeQuestions.find((q) => q.id === 'q_phone') ||
      activeQuestions.find((q) => q.type === 'phone');
    const emailQ =
      activeQuestions.find((q) => q.id === 'q_email') ||
      activeQuestions.find((q) => q.type === 'email');
    const tgQ =
      activeQuestions.find((q) => q.id === 'q_telegram') ||
      activeQuestions.find((q) => q.label.toLowerCase().includes('تيليغرام') || q.label.toLowerCase().includes('telegram'));

    const resolvedName = (nameQ ? answers[nameQ.id] : '') || Object.values(answers)[0] || '';
    if (!resolvedName.trim()) {
      setErrorMsg('يرجى إدخال اسم المشترك الكامل.');
      return;
    }

    const formattedAnswers: Record<string, string> = {};
    const attachments: RegistrationAttachment[] = [];
    activeQuestions.forEach((q) => {
      const v = (answers[q.id] || '').trim();
      if (v) {
        formattedAnswers[q.label] = v;
        if (q.type === 'file') {
          attachments.push({ questionId: q.id, questionLabel: q.label, url: v });
        }
      }
    });
    if (preselectedProgramLabel) {
      formattedAnswers['المسار المهتم به'] = preselectedProgramLabel;
    }

    setSubmitting(true);
    try {
      const res = await submitPortalRegistrationToSheets(webhookUrl, {
        studentName: resolvedName.trim(),
        phone: phoneQ ? answers[phoneQ.id]?.trim() : undefined,
        email: emailQ ? answers[emailQ.id]?.trim() : undefined,
        telegramUsername: tgQ ? answers[tgQ.id]?.trim() : undefined,
        answers: formattedAnswers,
        attachments,
        settings: portalSettings,
        stage1ProgramName,
      });

      if (res.success && res.registrationId && res.student) {
        const botU = res.botUsername || portalSettings.telegramBotUsername || '';
        const tgLink =
          res.telegramDeepLink || buildTelegramBotStartLink(botU, res.registrationId);
        const submittedEmail = emailQ ? answers[emailQ.id]?.trim() : undefined;
        setCompletedResult({
          registrationId: res.registrationId,
          student: res.student,
          telegramDeepLink: tgLink,
          botUsername: botU,
          studentEmail: submittedEmail,
          studentEmailSent: res.studentEmailSent,
          studentEmailError: res.studentEmailError,
        });
      } else {
        setErrorMsg(res.message || 'تعذر إكمال التسجيل حالياً. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    stopCamera();
    setCompletedResult(null);
    setAnswers({});
    setErrorMsg(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm font-cairo"
      dir={dir}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) resetAndClose();
      }}
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92dvh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Top Modal Header */}
        <div className="bg-emerald-950 text-white px-5 py-4 sm:px-7 sm:py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              {completedResult ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-300" />
              ) : (
                <UserPlus className="w-5 h-5 text-amber-300" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                {completedResult ? ui.successTitle : ui.title}
              </h3>
              <p className="text-xs text-emerald-100/80 truncate">
                {completedResult
                  ? ui.successBadge
                  : preselectedProgramLabel
                  ? `${preselectedProgramLabel} · ${ui.subtitle}`
                  : ui.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={resetAndClose}
            disabled={submitting}
            className="p-2 rounded-xl text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-7 overflow-y-auto flex-1 space-y-5">
          {completedResult ? (
            /* =========================================================
               POST-REGISTRATION VIEW:
               1) Registration ID Card
               2) Direct Telegram Bot Deep-Link
               3) One-Click Enter Private Page (Stage 1 Default)
               ========================================================= */
            <div className="space-y-5">
              <p className="text-sm text-slate-600 leading-relaxed">{ui.successSubtitle}</p>

              {completedResult.studentEmail && completedResult.studentEmailSent === true ? (
                <div className="px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 text-xs font-bold flex flex-wrap items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{ui.emailSentBadge}</span>
                  <span dir="ltr" className="font-mono underline">
                    {completedResult.studentEmail}
                  </span>
                </div>
              ) : completedResult.studentEmail ? (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-1">
                  <div className="font-bold flex flex-wrap items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{ui.emailFailedTitle}</span>
                    <span dir="ltr" className="font-mono underline">
                      {completedResult.studentEmail}
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-800 leading-relaxed">
                    {ui.emailFailedHint}
                    {completedResult.studentEmailError
                      ? ` (${completedResult.studentEmailError})`
                      : portalSettings.sendStudentWelcomeEmail === false
                      ? ''
                      : ' — تأكد من نشر أحدث إصدار Apps Script ومنح صلاحية البريد (MailApp).'}
                  </div>
                </div>
              ) : null}

              {/* 1. Registration ID Showcase */}
              <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-emerald-800">{ui.regIdLabel}</div>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-black font-mono tabular-nums text-emerald-950 tracking-wider">
                      {completedResult.registrationId}
                    </span>
                    <span className="text-sm font-bold text-slate-700">
                      · {completedResult.student.name}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600 font-semibold">
                    {stage1ProgramName || 'القسم الافتراضي (المرحلة التمهيدية)'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(completedResult.registrationId);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 2000);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 min-h-[42px]"
                >
                  {copiedId ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedId ? ui.copied : ui.copyId}</span>
                </button>
              </div>

              {/* 2. Direct Telegram Link + Scannable QR Code */}
              <div className="p-5 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-extrabold text-slate-900">{ui.tgStepTitle}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{ui.tgStepDesc}</p>
                  </div>
                </div>

                {completedResult.telegramDeepLink ? (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {tgQrDataUrl && (
                      <div className="p-2.5 bg-white rounded-2xl border border-sky-200 shadow-2xs shrink-0 flex flex-col items-center gap-1.5">
                        <img
                          src={tgQrDataUrl}
                          alt="Telegram Quick-Join QR"
                          className="w-32 h-32 object-contain rounded-lg"
                        />
                        <a
                          href={tgQrDataUrl}
                          download={`telegram_qr_${completedResult.registrationId}.png`}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 hover:text-sky-900"
                        >
                          <Download className="w-3 h-3" />
                          <span>حفظ QR</span>
                        </a>
                      </div>
                    )}

                    <div className="flex-1 w-full space-y-2.5">
                      <a
                        href={completedResult.telegramDeepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors min-h-[44px]"
                      >
                        <Send className="w-4 h-4" />
                        <span>{ui.tgBtn}</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                      </a>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(completedResult.telegramDeepLink);
                          setCopiedTgLink(true);
                          setTimeout(() => setCopiedTgLink(false), 2000);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-white hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                      >
                        {copiedTgLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedTgLink ? ui.copied : 'نسخ رابط تيليغرام المباشر'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-sky-900 bg-white/80 border border-sky-200 rounded-xl p-3 font-medium">
                    {ui.tgNoBotHint}
                  </div>
                )}
              </div>

              {/* 3. One-Click Direct Enter Private Student Workspace */}
              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    const studentToEnter = completedResult.student;
                    resetAndClose();
                    onInstantEnterStudentPage(studentToEnter);
                  }}
                  className="w-full py-4 px-5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm sm:text-base font-extrabold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/15 transition-all cursor-pointer min-h-[52px]"
                >
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  <span>{ui.enterNowBtn}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* =========================================================
               REGISTRATION FORM
               ========================================================= */
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {activeQuestions.map((q, idx) => {
                const labelText = getQuestionLabel(q);
                const val = answers[q.id] || '';
                const safeGuide = sanitizeExternalUrl(q.guideUrl);

                return (
                  <div
                    key={q.id}
                    className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs sm:text-sm font-extrabold text-slate-900">
                        <span className="text-emerald-700 font-mono tabular-nums ml-1.5">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        {labelText}
                        <span className="text-xs font-medium text-slate-500 mr-2">
                          {q.required ? `· ${ui.required}` : `· ${ui.optional}`}
                        </span>
                      </label>

                      {safeGuide && (
                        <a
                          href={safeGuide}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-indigo-700 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{ui.guideLink}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {q.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={val}
                        onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                        placeholder={q.placeholder || ''}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    ) : q.type === 'select' ? (
                      <select
                        value={val}
                        onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      >
                        <option value="">-- اختر من القائمة --</option>
                        {(q.options || []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : q.type === 'file' ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <label className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-white hover:bg-emerald-50 border border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer min-h-[42px] transition-colors">
                            <Upload className="w-4 h-4 text-emerald-700" />
                            <span>{ui.uploadFile}</span>
                            <input
                              type="file"
                              accept="image/*,.pdf,.doc,.docx"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileSelected(q.id, f);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => setCameraQuestionId(q.id)}
                            className="flex-1 min-w-[160px] py-2.5 px-4 rounded-xl bg-white hover:bg-amber-50 border border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer min-h-[42px] transition-colors"
                          >
                            <Camera className="w-4 h-4 text-amber-600" />
                            <span>{ui.cameraCapture}</span>
                          </button>
                        </div>

                        {uploadingQId === q.id && (
                          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{ui.uploading}</span>
                          </div>
                        )}

                        {val && uploadingQId !== q.id && (
                          <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-emerald-200">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={getDirectImageUrl(val)}
                                alt={labelText}
                                referrerPolicy="no-referrer"
                                className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-extrabold text-emerald-800 flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{ui.uploadedOk}</span>
                                </div>
                                <a
                                  href={sanitizeExternalUrl(val)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-indigo-700 hover:underline inline-flex items-center gap-1"
                                >
                                  <span>{ui.openFile}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => setAnswers((p) => ({ ...p, [q.id]: '' }))}
                              className="px-2.5 py-1.5 rounded-lg text-rose-700 hover:bg-rose-50 text-xs font-bold cursor-pointer inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{ui.removeFile}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        type={
                          q.type === 'number'
                            ? 'number'
                            : q.type === 'email'
                            ? 'email'
                            : q.type === 'phone'
                            ? 'tel'
                            : 'text'
                        }
                        dir={q.type === 'phone' || q.type === 'email' ? 'ltr' : undefined}
                        value={val}
                        onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                        placeholder={q.placeholder || ''}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    )}
                  </div>
                );
              })}

              <div className="pt-2 space-y-3">
                <button
                  type="submit"
                  disabled={submitting || Boolean(uploadingQId)}
                  className="w-full py-3.5 px-5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-md shadow-emerald-900/15 transition-all cursor-pointer min-h-[48px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{ui.submittingBtn}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>{ui.submitBtn}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetAndClose();
                    onOpenExistingLogin();
                  }}
                  className="w-full py-2 text-xs font-bold text-slate-600 hover:text-emerald-800 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{ui.haveAccount}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Camera Overlay Sub-Modal */}
      {cameraQuestionId && (
        <div className="fixed inset-0 z-[105] bg-slate-950/90 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-sm font-bold">{ui.camTitle}</span>
              <button
                type="button"
                onClick={stopCamera}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {cameraError ? (
                <div className="p-4 rounded-xl bg-rose-50 text-rose-800 text-xs font-bold text-center">
                  {cameraError}
                </div>
              ) : capturedDataUrl ? (
                <img
                  src={capturedDataUrl}
                  alt="Preview"
                  className="w-full rounded-2xl border border-slate-200 max-h-72 object-contain bg-slate-100"
                />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-2xl bg-black max-h-72 object-cover"
                />
              )}

              <div className="flex flex-wrap gap-2">
                {capturedDataUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setCapturedDataUrl(null)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold cursor-pointer"
                    >
                      {ui.camRetake}
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmCapturedPhoto}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
                    >
                      {ui.camConfirm}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))
                      }
                      className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>{ui.camSwitch}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      disabled={Boolean(cameraError)}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{ui.camSnap}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
