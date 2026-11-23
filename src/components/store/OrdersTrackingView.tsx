import React, { useState } from 'react';
import { PackageSearch, RefreshCw } from 'lucide-react';
import type { StoreOrder, StoreOrderStatus, StoreSettings } from '../../types';
import { trackStoreOrderInSheets } from '../../utils/storeSheets';

const STATUS_AR: Record<StoreOrderStatus, { label: string; color: string }> = {
  pending: { label: 'قيد المراجعة', color: 'text-amber-800 bg-amber-50 border-amber-200' },
  confirmed: { label: 'تم التأكيد', color: 'text-sky-800 bg-sky-50 border-sky-200' },
  shipped: { label: 'جاري التوصيل', color: 'text-indigo-800 bg-indigo-50 border-indigo-200' },
  delivered: { label: 'تم التسليم', color: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
  cancelled: { label: 'ملغي', color: 'text-rose-800 bg-rose-50 border-rose-200' },
};

interface OrdersTrackingViewProps {
  savedOrders: StoreOrder[];
  settings: StoreSettings;
  webhookUrl: string;
  onUpdateSavedOrder: (order: StoreOrder) => void;
}

export const OrdersTrackingView: React.FC<OrdersTrackingViewProps> = ({
  savedOrders,
  settings,
  webhookUrl,
  onUpdateSavedOrder,
}) => {
  const [orderIdInput, setOrderIdInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<StoreOrder | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await trackStoreOrderInSheets(webhookUrl, orderIdInput.trim(), phoneInput.trim());
      if (res.success && res.order) {
        setTrackedOrder(res.order);
        onUpdateSavedOrder(res.order);
      } else {
        setTrackedOrder(null);
        setErrorMsg(res.error || 'تعذر العثور على الطلب');
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshSaved = async (order: StoreOrder) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await trackStoreOrderInSheets(webhookUrl, order.id, order.customer_phone);
      if (res.success && res.order) {
        onUpdateSavedOrder(res.order);
        setTrackedOrder(res.order);
      } else {
        setErrorMsg(res.error || 'تعذر تحديث حالة الطلب');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderOrderCard = (order: StoreOrder, allowRefresh = false) => {
    const st = STATUS_AR[order.status] || STATUS_AR.pending;
    return (
      <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <span className="font-mono text-base font-extrabold text-slate-900">{order.id}</span>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(order.created_at).toLocaleString('ar-SA')} · {order.customer_city}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-lg border px-2.5 py-1 text-xs font-extrabold ${st.color}`}>
              {st.label}
            </span>
            {allowRefresh && (
              <button
                type="button"
                onClick={() => refreshSaved(order)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                title="تحديث الحالة من الشيت"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          {order.items.map((item, idx) => (
            <div key={`${item.product_id}-${idx}`} className="flex justify-between text-slate-700">
              <span>
                {item.name} {item.variant ? `(${item.variant})` : ''} × {item.qty}
              </span>
              <span className="tabular-nums font-bold text-slate-900">
                {item.line_total} {settings.currency}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
          <span className="text-xs text-slate-500">
            {order.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'الدفع عند الاستلام'}
            {order.coupon_code ? ` · كوبون ${order.coupon_code}` : ''}
          </span>
          <span className="font-extrabold text-emerald-900 tabular-nums">
            الإجمالي: {order.total} {settings.currency}
          </span>
        </div>
      </div>
    );
  };

  return (
    <section className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
          تتبع الطلبات وطلباتي
        </h1>
        <p className="text-sm text-slate-600">
          استعلم عن حالة طلبك مباشرة من قاعدة البيانات عبر رقم الطلب ورقم الجوال.
        </p>
      </div>

      <form
        onSubmit={handleLookup}
        className="rounded-2xl border border-slate-200 bg-white p-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end shadow-xs"
      >
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700">رقم الطلب</label>
          <input
            required
            dir="ltr"
            value={orderIdInput}
            onChange={(e) => setOrderIdInput(e.target.value)}
            placeholder="ORD-1001"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-slate-700">رقم الجوال المستخدم في الطلب</label>
          <input
            required
            dir="ltr"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="05xxxxxxxx"
            className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm tabular-nums text-slate-900 focus:border-emerald-700 focus:bg-white focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-900 disabled:opacity-60 cursor-pointer"
        >
          <PackageSearch className="h-4 w-4" />
          <span>{loading ? 'جاري البحث...' : 'تتبع الطلب'}</span>
        </button>
      </form>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
          {errorMsg}
        </div>
      )}

      {trackedOrder && (
        <div className="space-y-3">
          <h2 className="text-base font-extrabold text-slate-900">نتيجة البحث</h2>
          {renderOrderCard(trackedOrder)}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900">طلباتي المحفوظة على هذا الجهاز</h2>
        {savedOrders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            لم تقم بإرسال أي طلبات من هذا المتصفح بعد.
          </div>
        ) : (
          <div className="space-y-4">{savedOrders.map((o) => renderOrderCard(o, true))}</div>
        )}
      </div>
    </section>
  );
};
