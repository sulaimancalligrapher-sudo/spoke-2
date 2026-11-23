import React, { useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MessageCircle,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import type {
  PortalContentItem,
  StoreProduct,
  StoreSettings,
  StoreTrainingFormat,
} from '../../types';
import { submitStoreProgramEnrollmentToSheets } from '../../utils/storeSheets';
import { StoreImage } from './StoreImage';

const FORMAT_LABELS: Record<StoreTrainingFormat, string> = {
  online_live: 'عن بُعد مباشر',
  in_person: 'حضوري',
  recorded: 'مسجل بالكامل',
};

interface StoreProgramModalProps {
  program: PortalContentItem;
  settings: StoreSettings;
  recommendedProducts: StoreProduct[];
  botUsername?: string;
  webhookUrl: string;
  onAddToCart: (product: StoreProduct) => void;
  onEnrolled: (programId: string) => void;
  onOpenStage1Onboarding?: (programTitle: string) => void;
  onClose: () => void;
}

export const StoreProgramModal: React.FC<StoreProgramModalProps> = ({
  program,
  settings,
  recommendedProducts,
  botUsername,
  webhookUrl,
  onAddToCart,
  onEnrolled,
  onOpenStage1Onboarding,
  onClose,
}) => {
  const price = Math.max(0, Number(program.price) || 0);
  const isFree = price <= 0;
  const seatsLeft = program.seatsLeft !== undefined ? Number(program.seatsLeft) : 15;
  const soldOut = seatsLeft <= 0;

  const [applicantType, setApplicantType] = useState<'new' | 'existing'>('new');
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'bank_transfer' | 'free'>(
    isFree ? 'free' : settings.bank_transfer_enabled ? 'bank_transfer' : 'cod'
  );
  const [bankReference, setBankReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmedRequestId, setConfirmedRequestId] = useState<string | null>(null);
  const [tgNotified, setTgNotified] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);

  const tgHandle = (settings.telegram_username || botUsername || '').replace(/^@/, '').trim();
  const tgUrl = tgHandle ? `https://t.me/${tgHandle}` : '';

  const copyIban = () => {
    navigator.clipboard.writeText(settings.bank_iban);
    setCopiedIban(true);
    window.setTimeout(() => setCopiedIban(false), 1800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (soldOut || submitting) return;
    if (applicantType === 'existing' && !studentId.trim()) {
      setErrorMsg('يرجى إدخال رقم المشترك (ID) أو التحويل إلى «متقدم جديد».');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await submitStoreProgramEnrollmentToSheets(webhookUrl, {
        programCardId: program.id,
        programTitle: program.title,
        targetProgramId: program.targetProgramId,
        studentName: studentName.trim(),
        studentId: applicantType === 'existing' ? studentId.trim() : '',
        phone: studentPhone.trim(),
        telegramUsername: telegramUsername.trim(),
        paymentMethod: isFree ? 'free' : paymentMethod,
        bankReference: bankReference.trim(),
        pricePaid: price,
        currency: settings.currency,
        notes: notes.trim(),
      });

      if (!res.success) {
        setErrorMsg(res.error || 'تعذر تسجيل الطلب حالياً.');
        return;
      }

      setConfirmedRequestId(res.requestId || `ENR-${Date.now().toString().slice(-5)}`);
      setTgNotified(Boolean(res.telegramNotified));
      onEnrolled(program.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 z-10 rounded-xl border border-slate-200 bg-white/95 p-2 text-slate-800 hover:bg-slate-100 cursor-pointer"
          aria-label="إغلاق"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Info Column */}
          <div className="md:col-span-6 bg-slate-50 p-6 space-y-5 border-b md:border-b-0 md:border-l border-slate-200 max-h-[86dvh] overflow-y-auto">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <StoreImage src={program.mediaUrl} alt={program.title} aspectClass="aspect-[16/10]" />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-bold">
                <span>{program.badgeText || 'برنامج تدريبي'}</span>
                <span aria-hidden="true">·</span>
                <span>{FORMAT_LABELS[program.format || 'online_live']}</span>
                {program.instructor && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>المدرب: {program.instructor}</span>
                  </>
                )}
              </div>

              <h2 className="text-xl font-extrabold text-slate-900 leading-snug">{program.title}</h2>

              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-extrabold text-emerald-900 tabular-nums">
                  {isFree ? 'مجاني' : `${price} ${settings.currency}`}
                </span>
                {program.compareAtPrice && program.compareAtPrice > price && (
                  <span className="text-sm text-slate-400 line-through tabular-nums">
                    {program.compareAtPrice} {settings.currency}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-xs text-slate-700 font-bold">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="truncate">{program.duration || 'مرن'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="tabular-nums truncate">{program.startDate || 'تسجيل مفتوح'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className={`tabular-nums ${soldOut ? 'text-rose-700 font-extrabold' : ''}`}>
                    {soldOut ? 'مكتمل' : `${seatsLeft} مقعد متاح`}
                  </span>
                </div>
              </div>

              {program.description && (
                <p className="text-sm leading-relaxed text-slate-600 pt-1">{program.description}</p>
              )}

              {program.syllabus && program.syllabus.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <h3 className="text-xs font-extrabold text-slate-900">محاور البرنامج التدريبي:</h3>
                  <ol className="space-y-1.5 text-xs text-slate-700">
                    {program.syllabus.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="font-mono font-extrabold text-amber-700 shrink-0">
                          {String(idx + 1).padStart(2, '0')}.
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Recommended Store Supplies linked to this program */}
              {recommendedProducts.length > 0 && (
                <div className="space-y-2.5 border-t border-slate-200 pt-4">
                  <h3 className="text-xs font-extrabold text-slate-900">
                    أدوات ومستلزمات مقترحة مع هذا البرنامج:
                  </h3>
                  <div className="space-y-2">
                    {recommendedProducts.map((prod) => (
                      <div
                        key={prod.id}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-slate-200">
                            <StoreImage src={prod.image_url} alt={prod.name} aspectClass="w-full h-full" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">{prod.name}</div>
                            <div className="text-[11px] font-extrabold text-emerald-800 tabular-nums">
                              {prod.price} {settings.currency}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={prod.stock <= 0}
                          onClick={() => onAddToCart(prod)}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-emerald-900 disabled:bg-slate-300 text-white text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <ShoppingBag className="w-3 h-3" />
                          <span>أضف للسلة</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Enrollment Form / Receipt Column */}
          <div className="md:col-span-6 p-6 md:p-7 flex flex-col justify-center">
            {confirmedRequestId ? (
              <div className="space-y-5 py-4">
                <div className="flex flex-col items-center text-center space-y-2">
                  <CheckCircle2 className="h-12 w-12 text-emerald-700" />
                  <h3 className="text-xl font-extrabold text-slate-900">تم تسجيل طلب الالتحاق بنجاح</h3>
                  <p className="text-sm text-slate-600">
                    رقم الطلب المرجعي:{' '}
                    <span className="font-mono font-extrabold text-slate-900 select-all">
                      {confirmedRequestId}
                    </span>
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">المتدرب:</span>
                    <span className="font-bold text-slate-900">{studentName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">البرنامج:</span>
                    <span className="font-bold text-emerald-900">{program.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">الرسوم:</span>
                    <span className="font-extrabold text-slate-900 tabular-nums">
                      {isFree ? 'مجاني' : `${price} ${settings.currency}`}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
                    {tgNotified
                      ? 'تم إرسال إشعار فوري للإدارة عبر تيليجرام، وفور اعتماد الطلب سيُفعّل البرنامج في حسابك مباشرة.'
                      : 'تم تسجيل طلبك في ورقة «طلبات_البرامج»، وفور اعتماد الإدارة سيتم تفعيل البرنامج وإصدار رقم دخولك.'}
                  </div>
                </div>

                {tgUrl && (
                  <a
                    href={tgUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-xs font-extrabold text-white hover:bg-sky-700 transition-colors"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>تواصل عبر تيليجرام لتأكيد التفعيل</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-extrabold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  إغلاق والعودة للمتجر
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900">التسجيل في البرنامج التدريبي</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    يرتبط هذا التسجيل مباشرة بسجل المشتركين وتصلك حالة التفعيل عبر تيليجرام.
                  </p>
                </div>

                {isFree && program.actionType === 'open_register' && onOpenStage1Onboarding && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-emerald-950 font-bold">
                      هذا المسار مجاني ويتيح دخولاً فورياً بالمرحلة التمهيدية.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenStage1Onboarding(program.title);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold cursor-pointer shrink-0"
                    >
                      دخول فوري بالاستمارة التمهيدية
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800">
                    {errorMsg}
                  </div>
                )}

                {/* Existing subscriber vs new applicant */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setApplicantType('new')}
                    className={`py-2 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                      applicantType === 'new'
                        ? 'bg-white text-emerald-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    متقدم جديد
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplicantType('existing')}
                    className={`py-2 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                      applicantType === 'existing'
                        ? 'bg-white text-emerald-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    لدي رقم ID مسبق
                  </button>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">الاسم الكامل للمتدرب *</label>
                  <input
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="اكتب اسمك الكامل"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:bg-white focus:outline-none"
                  />
                </div>

                {applicantType === 'existing' && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">رقم المشترك (ID) *</label>
                    <input
                      required
                      dir="ltr"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="1001"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-mono focus:border-emerald-700 focus:bg-white focus:outline-none"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">رقم الجوال *</label>
                    <input
                      required
                      type="tel"
                      dir="ltr"
                      value={studentPhone}
                      onChange={(e) => setStudentPhone(e.target.value)}
                      placeholder="05xxxxxxxx"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm tabular-nums focus:border-emerald-700 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">معرف تيليجرام (اختياري)</label>
                    <input
                      dir="ltr"
                      value={telegramUsername}
                      onChange={(e) => setTelegramUsername(e.target.value)}
                      placeholder="@username"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                {!isFree && (
                  <div className="space-y-2.5 pt-1">
                    <label className="block text-xs font-extrabold text-slate-900">طريقة السداد</label>
                    <div className="grid grid-cols-2 gap-2">
                      {settings.bank_transfer_enabled && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('bank_transfer')}
                          className={`rounded-xl border p-3 text-right cursor-pointer transition-colors ${
                            paymentMethod === 'bank_transfer'
                              ? 'border-emerald-800 bg-emerald-50 ring-1 ring-emerald-800'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          <span className="block text-xs font-extrabold text-slate-900">تحويل بنكي</span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">تأكيد سريع للمقعد</span>
                        </button>
                      )}
                      {settings.cod_enabled && (
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('cod')}
                          className={`rounded-xl border p-3 text-right cursor-pointer transition-colors ${
                            paymentMethod === 'cod'
                              ? 'border-emerald-800 bg-emerald-50 ring-1 ring-emerald-800'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          <span className="block text-xs font-extrabold text-slate-900">الدفع عند الحضور / التواصل</span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">يُدفع عند التأكيد</span>
                        </button>
                      )}
                    </div>

                    {paymentMethod === 'bank_transfer' && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2 text-xs">
                        <p className="font-extrabold text-slate-900">
                          {settings.bank_name} · {settings.bank_account_name}
                        </p>
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                          <span className="font-mono text-slate-900 select-all">{settings.bank_iban}</span>
                          <button
                            type="button"
                            onClick={copyIban}
                            className="inline-flex items-center gap-1 text-amber-700 font-extrabold cursor-pointer shrink-0"
                          >
                            {copiedIban ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{copiedIban ? 'تم النسخ' : 'نسخ'}</span>
                          </button>
                        </div>
                        <input
                          value={bankReference}
                          onChange={(e) => setBankReference(e.target.value)}
                          placeholder="رقم مرجع الحوالة أو اسم المحول (اختياري)"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-emerald-700 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">ملاحظات إضافية (اختياري)</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="استفسار أو الوقت المفضل"
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm focus:border-emerald-700 focus:bg-white focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={soldOut || submitting}
                  className="w-full rounded-xl bg-emerald-800 py-3 text-xs sm:text-sm font-extrabold text-white hover:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {soldOut
                    ? 'اكتملت المقاعد المتاحة'
                    : submitting
                    ? 'جاري تسجيل مقعدك...'
                    : isFree
                    ? 'تأكيد التسجيل المجاني'
                    : `تأكيد التسجيل (${price} ${settings.currency})`}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
