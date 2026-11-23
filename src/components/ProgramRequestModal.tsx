import React, { useEffect, useState } from 'react';
import {
  X,
  User,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  UserPlus,
  BookOpen,
  Sparkles,
  LogIn,
} from 'lucide-react';
import { PortalContentItem, StudentRegistrant } from '../types';
import { SupportedLang } from '../utils/translations';
import { getLocalizedItemField, submitProgramRequestToSheets } from '../utils/portalSheets';

interface ProgramRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  programItem: PortalContentItem | null;
  webhookUrl: string;
  currentLang?: SupportedLang;
  onSwitchToRegister: (prefillName?: string, programTitle?: string) => void;
  onEnterStudentWorkspace?: (student: StudentRegistrant) => void;
}

const PR_UI = {
  ar: {
    modalBadge: 'طلب الالتحاق ببرنامج تدريبي',
    nameLabel: 'اسم المشترك المسجّل',
    namePlaceholder: 'اكتب اسمك الكامل كما سجّلت به',
    idLabel: 'رقم المشترك (ID)',
    idPlaceholder: 'مثال: 1001',
    noteLabel: 'ملاحظة للإدارة (اختياري)',
    notePlaceholder: 'مثال: الوقت المناسب أو المستوى المطلوب...',
    submitBtn: 'تحقق وأرسل طلب الالتحاق',
    submitting: 'جاري التحقق من السجل وإرسال الطلب...',
    newUserPrompt: 'مشترك جديد وليس لديك رقم ID بعد؟',
    switchToRegisterBtn: 'انتقل إلى استمارة تسجيل مشترك جديد',
    notFoundBtn: 'افتح استمارة التسجيل كمشترك جديد الآن',
    successBadge: 'تم تسجيل طلبك بنجاح',
    successMsg: 'تم التحقق من بياناتك وإرسال طلب الالتحاق بهذا البرنامج للإدارة عبر تيليغرام وسنتواصل معك قريباً.',
    enterWorkspaceBtn: 'الدخول إلى صفحتي الخاصة الآن',
    closeBtn: 'إغلاق',
  },
  en: {
    modalBadge: 'Program Enrollment Request',
    nameLabel: 'Registered Subscriber Name',
    namePlaceholder: 'Enter your registered full name',
    idLabel: 'Subscriber ID',
    idPlaceholder: 'e.g. 1001',
    noteLabel: 'Note for Administration (Optional)',
    notePlaceholder: 'Optional note or preferred schedule...',
    submitBtn: 'Verify & Submit Program Request',
    submitting: 'Verifying account & sending request...',
    newUserPrompt: 'New subscriber without an ID yet?',
    switchToRegisterBtn: 'Go to New Subscriber Registration Form',
    notFoundBtn: 'Open New Subscriber Registration Form',
    successBadge: 'Request Submitted Successfully',
    successMsg:
      'Your subscriber account has been verified and your request has been sent to the administration. We will contact you shortly.',
    enterWorkspaceBtn: 'Enter My Private Page Now',
    closeBtn: 'Close',
  },
  th: {
    modalBadge: 'คำขอเข้าร่วมหลักสูตรฝึกอบรม',
    nameLabel: 'ชื่อผู้เรียนที่ลงทะเบียนไว้',
    namePlaceholder: 'กรอกชื่อ-นามสกุลที่ลงทะเบียนไว้',
    idLabel: 'รหัสผู้เรียน (ID)',
    idPlaceholder: 'เช่น 1001',
    noteLabel: 'หมายเหตุเพิ่มเติม (ไม่บังคับ)',
    notePlaceholder: 'เวลาที่สะดวกหรือรายละเอียดเพิ่มเติม...',
    submitBtn: 'ตรวจสอบและส่งคำขอเข้าร่วมหลักสูตร',
    submitting: 'กำลังตรวจสอบข้อมูลและส่งคำขอ...',
    newUserPrompt: 'ยังไม่มีรหัสผู้เรียนใช่ไหม?',
    switchToRegisterBtn: 'ไปยังแบบฟอร์มลงทะเบียนผู้เรียนใหม่',
    notFoundBtn: 'เปิดแบบฟอร์มลงทะเบียนผู้เรียนใหม่',
    successBadge: 'บันทึกคำขอเรียบร้อยแล้ว',
    successMsg:
      'ตรวจสอบข้อมูลเรียบร้อยและส่งคำขอของคุณไปยังผู้ดูแลผ่าน Telegram แล้ว ทางเราจะติดต่อกลับโดยเร็ว',
    enterWorkspaceBtn: 'เข้าสู่หน้าส่วนตัวของฉันทันที',
    closeBtn: 'ปิด',
  },
};

export const ProgramRequestModal: React.FC<ProgramRequestModalProps> = ({
  isOpen,
  onClose,
  programItem,
  webhookUrl,
  currentLang = 'ar',
  onSwitchToRegister,
  onEnterStudentWorkspace,
}) => {
  const ui = PR_UI[currentLang] || PR_UI.ar;
  const dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentNote, setStudentNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [verifiedStudent, setVerifiedStudent] = useState<StudentRegistrant | null>(null);
  const [requestId, setRequestId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setIsNotFound(false);
      setVerifiedStudent(null);
      setRequestId('');
      setStudentNote('');
    }
  }, [isOpen, programItem?.id]);

  if (!isOpen || !programItem) return null;

  const progTitle = getLocalizedItemField(programItem, 'title', currentLang);
  const progSubtitle = getLocalizedItemField(programItem, 'subtitle', currentLang);
  const progDesc = getLocalizedItemField(programItem, 'description', currentLang);
  const progBadge = getLocalizedItemField(programItem, 'badgeText', currentLang);
  const progMeta1 = getLocalizedItemField(programItem, 'metaPrimary', currentLang);
  const progMeta2 = getLocalizedItemField(programItem, 'metaSecondary', currentLang);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setIsNotFound(false);
    setSubmitting(true);

    try {
      const res = await submitProgramRequestToSheets(webhookUrl, {
        studentName,
        studentId,
        targetProgramCardId: programItem.id,
        targetProgramTitle: programItem.title,
        targetProgramId: programItem.targetProgramId,
        studentNote,
      });

      if (res.success && res.student) {
        setVerifiedStudent(res.student);
        setRequestId(res.requestId || '');
      } else {
        setIsNotFound(Boolean(res.notFound));
        setErrorMsg(
          res.error ||
            'تعذر التحقق من الاسم ورقم المشترك. تأكد من صحة البيانات أو سجّل كمشترك جديد أولاً.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      dir={dir}
    >
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Program Header Card */}
        <div className="bg-emerald-950 text-white px-6 py-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span>{ui.modalBadge}</span>
            </div>
            <h2 className="text-lg font-extrabold font-amiri leading-snug">{progTitle}</h2>
            {progSubtitle && <p className="text-xs text-emerald-100/85">{progSubtitle}</p>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Success Welcome Screen with Same Program Card Details */}
        {verifiedStudent ? (
          <div className="p-6 sm:p-7 space-y-5">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-extrabold text-emerald-900 flex items-center gap-2">
                  <span>{ui.successBadge}</span>
                  {requestId && (
                    <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {requestId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-950/90 leading-relaxed font-semibold">
                  {ui.successMsg}
                </p>
              </div>
            </div>

            {/* Welcome Card Mirroring the Requested Program */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-extrabold text-slate-900 inline-flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>أهلاً بك يا {verifiedStudent.name}</span>
                </span>
                <span className="font-mono tabular-nums text-emerald-900 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-lg">
                  ID #{verifiedStudent.id}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                {progBadge && (
                  <div className="text-[11px] font-bold text-emerald-800">{progBadge}</div>
                )}
                <h3 className="text-base font-extrabold text-slate-900">{progTitle}</h3>
                {progDesc && (
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{progDesc}</p>
                )}
                {(progMeta1 || progMeta2) && (
                  <div className="pt-2 text-xs text-slate-500 font-semibold flex flex-wrap items-center gap-2">
                    {progMeta1 && <span>{progMeta1}</span>}
                    {progMeta1 && progMeta2 && <span aria-hidden="true">·</span>}
                    {progMeta2 && <span>{progMeta2}</span>}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              {onEnterStudentWorkspace && (
                <button
                  type="button"
                  onClick={() => onEnterStudentWorkspace(verifiedStudent)}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn className="w-4 h-4 text-amber-300" />
                  <span>{ui.enterWorkspaceBtn}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold cursor-pointer"
              >
                {ui.closeBtn}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-4">
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2.5">
                <div className="flex items-start gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
                {isNotFound && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onSwitchToRegister(studentName.trim(), programItem.title);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-amber-300" />
                    <span>{ui.notFoundBtn}</span>
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <User className="w-4 h-4 text-emerald-700" />
                <span>{ui.nameLabel}</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder={ui.namePlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-slate-700" />
                <span>{ui.idLabel}</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder={ui.idPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold text-right focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">{ui.noteLabel}</label>
              <textarea
                rows={2}
                value={studentNote}
                onChange={(e) => setStudentNote(e.target.value)}
                placeholder={ui.notePlaceholder}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{ui.submitting}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-amber-300" />
                  <span>{ui.submitBtn}</span>
                </>
              )}
            </button>

            <div className="pt-3 border-t border-slate-100 text-center space-y-2">
              <div className="text-xs text-slate-500 font-semibold">{ui.newUserPrompt}</div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToRegister(studentName.trim(), programItem.title);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-emerald-700" />
                <span>{ui.switchToRegisterBtn}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
