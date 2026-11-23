import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  MessageCircle,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type {
  StoreCartEntry,
  StoreOrder,
  StorePaymentMethod,
  StorePublicData,
} from '../../types';
import {
  createStoreOrderInSheets,
  evaluateStoreCoupon,
  resolveVariantUnitPrice,
} from '../../utils/storeSheets';
import { StoreImage } from './StoreImage';

interface CartCheckoutDrawerProps {
  open: boolean;
  items: StoreCartEntry[];
  storeData: StorePublicData;
  webhookUrl: string;
  botUsername?: string;
  onClose: () => void;
  onUpdateQty: (key: string, qty: number) => void;
  onRemoveItem: (key: string) => void;
  onClearCart: () => void;
  onOrderCreated: (order: StoreOrder, updatedStoreData?: StorePublicData) => void;
}

export const CartCheckoutDrawer: React.FC<CartCheckoutDrawerProps> = ({
  open,
  items,
  storeData,
  webhookUrl,
  botUsername,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderCreated,
}) => {
  const { settings, cities, coupons } = storeData;
  const activeCities = useMemo(() => cities.filter((c) => c.is_active), [cities]);

  const [step, setStep] = useState<'cart' | 'checkout' | 'receipt'>('cart');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCity, setCustomerCity] = useState(activeCities[0]?.name || '');
  const [customerAddress, setCustomerAddress] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<StorePaymentMethod>(
    settings.cod_enabled ? 'cod' : 'bank_transfer'
  );
  const [bankReference, setBankReference] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [receipt, setReceipt] = useState<StoreOrder | null>(null);
  const [tgNotified, setTgNotified] = useState(false);
  const [copiedIban, setCopiedIban] = useState(false);

  // Sync default city when activeCities changes
  useEffect(() => {
    if (!customerCity && activeCities.length > 0) {
      setCustomerCity(activeCities[0].name);
    }
  }, [activeCities, customerCity]);

  // Pre-fill Telegram info if opened inside Telegram Mini App
  useEffect(() => {
    const tg = (window as unknown as {
      Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string; last_name?: string; username?: string } } } };
    }).Telegram?.WebApp;
    const u = tg?.initDataUnsafe?.user;
    if (u) {
      if (!customerName) {
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        if (fullName) setCustomerName(fullName);
      }
      if (!telegramUsername && u.username) {
        setTelegramUsername(`@${u.username}`);
      }
    }
  }, [customerName, telegramUsername]);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, x) => sum + resolveVariantUnitPrice(x.product, x.variant) * x.qty,
        0
      ),
    [items]
  );

  // Re-evaluate coupon when subtotal changes
  const activeCouponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const check = evaluateStoreCoupon(coupons, appliedCoupon.code, subtotal, settings.currency);
    return check.valid ? check.discount : 0;
  }, [appliedCoupon, coupons, subtotal, settings.currency]);

  const selectedCityZone = useMemo(
    () => activeCities.find((c) => c.name === customerCity),
    [activeCities, customerCity]
  );
  const cityFee = selectedCityZone ? selectedCityZone.delivery_fee : settings.default_delivery_fee;
  const effectiveFreeMin =
    selectedCityZone && selectedCityZone.free_shipping_min > 0
      ? selectedCityZone.free_shipping_min
      : settings.free_shipping_min;
  const deliveryFee =
    items.length === 0
      ? 0
      : effectiveFreeMin > 0 && subtotal >= effectiveFreeMin
      ? 0
      : cityFee;

  const total = Math.max(0, subtotal - activeCouponDiscount + deliveryFee);

  const tgHandle = (settings.telegram_username || botUsername || '').replace(/^@/, '').trim();

  if (!open) return null;

  const handleApplyCoupon = () => {
    const res = evaluateStoreCoupon(coupons, couponInput, subtotal, settings.currency);
    if (res.valid) {
      setAppliedCoupon({ code: res.normalizedCode, discount: res.discount });
      setCouponMessage(res.message);
    } else {
      setAppliedCoupon(null);
      setCouponMessage(res.message);
    }
  };

  const handleCopyIban = () => {
    navigator.clipboard.writeText(settings.bank_iban);
    setCopiedIban(true);
    window.setTimeout(() => setCopiedIban(false), 1800);
  };

  const handleClose = () => {
    if (step === 'receipt') {
      setStep('cart');
      setReceipt(null);
    }
    onClose();
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || items.length === 0) return;

    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await createStoreOrderInSheets(webhookUrl, {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_city: customerCity || activeCities[0]?.name || 'الرياض',
        customer_address: customerAddress.trim(),
        telegram_username: telegramUsername.trim(),
        payment_method: paymentMethod,
        bank_reference: bankReference.trim(),
        coupon_code: appliedCoupon?.code || '',
        notes: notes.trim(),
        items: items.map((x) => ({
          product_id: x.product.id,
          variant: x.variant,
          qty: x.qty,
        })),
        storeData,
      });

      if (!res.success || !res.order) {
        setErrorMsg(res.error || 'تعذر إرسال الطلب حالياً، يرجى المحاولة مرة أخرى.');
        return;
      }

      setReceipt(res.order);
      setTgNotified(Boolean(res.telegramNotified));
      onOrderCreated(res.order, res.updatedStoreData);
      onClearCart();
      setAppliedCoupon(null);
      setCouponMessage('');
      setCouponInput('');
      setStep('receipt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex justify-end bg-slate-950/60 backdrop-blur-xs"
      onClick={handleClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl border-r border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-white">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-emerald-800" />
            <h2 className="text-base font-extrabold text-slate-900">
              {step === 'cart'
                ? `سلة التسوق (${items.reduce((s, x) => s + x.qty, 0)})`
                : step === 'checkout'
                ? 'إتمام الطلب والشحن'
                : 'تأكيد الطلب'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-[#F8FAF9]">
          {step === 'receipt' && receipt ? (
            <div className="space-y-5 py-3">
              <div className="flex flex-col items-center text-center space-y-2">
                <CheckCircle2 className="h-14 w-14 text-emerald-700" />
                <h3 className="text-xl font-extrabold text-slate-900">تم استلام طلبك بنجاح!</h3>
                <p className="text-sm text-slate-600">
                  رقم الطلب المرجعي:{' '}
                  <span className="font-mono font-extrabold text-slate-900 select-all">
                    {receipt.id}
                  </span>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5 text-sm shadow-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">العميل:</span>
                  <span className="font-bold text-slate-900">{receipt.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الجوال:</span>
                  <span className="tabular-nums font-bold text-slate-900" dir="ltr">
                    {receipt.customer_phone}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المدينة:</span>
                  <span className="font-bold text-slate-900">{receipt.customer_city}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">طريقة الدفع:</span>
                  <span className="font-bold text-slate-900">
                    {receipt.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'الدفع عند الاستلام'}
                  </span>
                </div>
                {receipt.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>الخصم ({receipt.coupon_code}):</span>
                    <span className="tabular-nums">
                      -{receipt.discount_amount} {settings.currency}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2.5 text-base">
                  <span className="font-extrabold text-slate-900">الإجمالي:</span>
                  <span className="font-extrabold text-emerald-900 tabular-nums">
                    {receipt.total} {settings.currency}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950 font-semibold leading-relaxed">
                {tgNotified
                  ? 'تم إرسال إشعار فوري للإدارة عبر تيليجرام، ويمكنك متابعة حالة الشحن من تبويب «تتبع الطلبات» في أي وقت.'
                  : 'تم حفظ الطلب في سجل طلباتك، ويمكنك متابعة حالته في أي وقت عبر رقم الطلب ورقم الجوال.'}
              </div>

              {tgHandle && (
                <a
                  href={`https://t.me/${tgHandle}?text=${encodeURIComponent(
                    `مرحباً، أرسلت طلباً برقم ${receipt.id} بمبلغ ${receipt.total} ${settings.currency}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-extrabold text-white hover:bg-sky-700 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>تأكيد ومتابعة الطلب عبر تيليجرام</span>
                </a>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-sm font-extrabold text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                متابعة التسوق
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center space-y-3">
              <ShoppingBag className="h-12 w-12 text-slate-300" />
              <p className="text-sm font-bold text-slate-500">سلة المشتريات فارغة حالياً.</p>
            </div>
          ) : step === 'cart' ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {items.map((item) => {
                  const unitPrice = resolveVariantUnitPrice(item.product, item.variant);
                  return (
                    <div
                      key={item.key}
                      className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs"
                    >
                      <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                        <StoreImage
                          src={item.product.image_url}
                          alt={item.product.name}
                          aspectClass="w-full h-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs font-extrabold text-slate-900 truncate">
                            {item.product.name}
                          </h3>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.key)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer p-0.5"
                            aria-label="حذف"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {item.variant && (
                          <p className="text-[11px] text-slate-500 font-semibold">{item.variant}</p>
                        )}
                        <div className="flex items-center justify-between pt-1">
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50">
                            <button
                              type="button"
                              onClick={() => onUpdateQty(item.key, item.qty - 1)}
                              className="px-2 py-1 text-slate-700 hover:bg-slate-200/70 cursor-pointer"
                              aria-label="إنقاص"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2.5 text-xs font-extrabold tabular-nums">
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateQty(item.key, item.qty + 1)}
                              className="px-2 py-1 text-slate-700 hover:bg-slate-200/70 cursor-pointer"
                              aria-label="زيادة"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="text-xs font-extrabold text-emerald-900 tabular-nums">
                            {unitPrice * item.qty} {settings.currency}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Coupon Box */}
              <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-2 shadow-xs">
                <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-amber-600" />
                  <span>هل لديك كوبون خصم؟</span>
                </label>
                <div className="flex gap-2">
                  <input
                    dir="ltr"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="FASEEH10"
                    className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono uppercase focus:border-emerald-700 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="rounded-xl bg-slate-900 hover:bg-emerald-900 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer"
                  >
                    تطبيق
                  </button>
                </div>
                {couponMessage && (
                  <p
                    className={`text-xs font-bold ${
                      appliedCoupon ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {couponMessage}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <form id="store-checkout-form" onSubmit={handleSubmitOrder} className="space-y-4">
              {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">الاسم الكامل *</label>
                <input
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="الاسم الثلاثي"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">رقم الجوال *</label>
                  <input
                    required
                    type="tel"
                    dir="ltr"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="05xxxxxxxx"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm tabular-nums focus:border-emerald-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    معرف تيليجرام (اختياري)
                  </label>
                  <input
                    dir="ltr"
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                    placeholder="@username"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  المدينة ومنطقة التوصيل *
                </label>
                <select
                  required
                  value={customerCity}
                  onChange={(e) => setCustomerCity(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-emerald-700 focus:outline-none"
                >
                  {activeCities.length > 0 ? (
                    activeCities.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name} (توصيل {c.delivery_fee} {settings.currency} · {c.estimated_days})
                      </option>
                    ))
                  ) : (
                    <option value="الرياض">التوصيل القياسي ({settings.default_delivery_fee} {settings.currency})</option>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">العنوان التفصيلي *</label>
                <textarea
                  required
                  rows={2}
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="الحي، اسم الشارع، أقرب معلم"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:outline-none"
                />
              </div>

              {/* Payment Method */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-extrabold text-slate-900">طريقة الدفع</label>
                <div className="grid grid-cols-2 gap-2.5">
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
                      <span className="block text-xs font-extrabold text-slate-900">
                        الدفع عند الاستلام
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">نقداً للمندوب</span>
                    </button>
                  )}
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
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {settings.bank_name}
                      </span>
                    </button>
                  )}
                </div>

                {paymentMethod === 'bank_transfer' && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2 text-xs">
                    <p className="font-extrabold text-slate-900">
                      {settings.bank_name} · {settings.bank_account_name}
                    </p>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <span className="font-mono text-slate-900 select-all">{settings.bank_iban}</span>
                      <button
                        type="button"
                        onClick={handleCopyIban}
                        className="inline-flex items-center gap-1 text-amber-700 font-extrabold cursor-pointer shrink-0"
                      >
                        {copiedIban ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedIban ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                    </div>
                    <input
                      value={bankReference}
                      onChange={(e) => setBankReference(e.target.value)}
                      placeholder="رقم مرجع الحوالة أو اسم المحول (اختياري)"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs focus:border-emerald-700 focus:bg-white focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  ملاحظات الطلب (اختياري)
                </label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات للمندوب أو تغليف خاص"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-emerald-700 focus:outline-none"
                />
              </div>
            </form>
          )}
        </div>

        {/* Footer Totals & Actions */}
        {step !== 'receipt' && items.length > 0 && (
          <div className="border-t border-slate-200 bg-white p-5 space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>المجموع الفرعي</span>
                <span className="tabular-nums font-bold text-slate-900">
                  {subtotal} {settings.currency}
                </span>
              </div>
              {activeCouponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>خصم الكوبون ({appliedCoupon?.code})</span>
                  <span className="tabular-nums">
                    -{activeCouponDiscount} {settings.currency}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>
                  رسوم التوصيل {step === 'checkout' && customerCity ? `(${customerCity})` : ''}
                </span>
                <span className="tabular-nums font-bold text-slate-900">
                  {deliveryFee === 0 ? 'مجاني' : `${deliveryFee} ${settings.currency}`}
                </span>
              </div>
              {effectiveFreeMin > 0 && subtotal < effectiveFreeMin && (
                <p className="text-[11px] font-bold text-amber-700">
                  أضف منتجات بقيمة {effectiveFreeMin - subtotal} {settings.currency} للحصول على شحن مجاني!
                </p>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold text-slate-900">
                <span>الإجمالي النهائي</span>
                <span className="tabular-nums text-emerald-900">
                  {total} {settings.currency}
                </span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full rounded-xl bg-emerald-800 hover:bg-emerald-900 py-3.5 text-sm font-extrabold text-white transition-colors cursor-pointer"
              >
                متابعة لإتمام الطلب
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  رجوع للسلة
                </button>
                <button
                  type="submit"
                  form="store-checkout-form"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-emerald-800 hover:bg-emerald-900 py-3 text-sm font-extrabold text-white transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'جاري إرسال الطلب...' : 'تأكيد وإرسال الطلب'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
