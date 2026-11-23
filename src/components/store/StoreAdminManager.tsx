import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings as SettingsIcon,
  ShoppingCart,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type {
  PortalContentItem,
  PortalPublicData,
  ProgramRequestRecord,
  StoreBanner,
  StoreCategory,
  StoreCityZone,
  StoreCoupon,
  StoreOrderStatus,
  StoreProduct,
  StorePublicData,
  StoreTrainingFormat,
} from '../../types';
import type { CourseProgram } from '../../utils/courseSchedule';
import {
  fetchStoreDataFromSheets,
  saveStoreDataToSheets,
  updateStoreOrderStatusInSheets,
  deleteStoreOrderInSheets,
} from '../../utils/storeSheets';
import {
  savePortalDataToSheets,
  updateProgramRequestStatusInSheets,
  deleteProgramRequestInSheets,
} from '../../utils/portalSheets';
import { StoreImage } from './StoreImage';
import { ProductFormModal } from './ProductFormModal';

interface StoreAdminManagerProps {
  storeData: StorePublicData;
  onUpdateStoreData: (next: StorePublicData) => void;
  portalData: PortalPublicData;
  onUpdatePortalData: (next: PortalPublicData) => void;
  programs: CourseProgram[];
  programRequests: ProgramRequestRecord[];
  onRefreshProgramRequests: () => void;
  onRefreshRegistrants?: () => void;
  webhookUrl: string;
  onOpenStorePreview?: () => void;
}

type StoreAdminTab =
  | 'overview'
  | 'products'
  | 'programMarketing'
  | 'orders'
  | 'catalog'
  | 'marketing'
  | 'settings';

const ORDER_STATUS_META: Record<StoreOrderStatus, { label: string; cls: string }> = {
  pending: { label: 'قيد المراجعة', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  confirmed: { label: 'تم التأكيد', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  shipped: { label: 'جاري التوصيل', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  delivered: { label: 'تم التسليم', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'ملغي', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
};

const FORMAT_LABELS: Record<StoreTrainingFormat, string> = {
  online_live: 'عن بُعد مباشر',
  in_person: 'حضوري',
  recorded: 'مسجل بالكامل',
};

export const StoreAdminManager: React.FC<StoreAdminManagerProps> = ({
  storeData,
  onUpdateStoreData,
  portalData,
  onUpdatePortalData,
  programs,
  programRequests,
  onRefreshProgramRequests,
  onRefreshRegistrants,
  webhookUrl,
  onOpenStorePreview,
}) => {
  const [tab, setTab] = useState<StoreAdminTab>('overview');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ success: boolean; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Products state
  const [productQuery, setProductQuery] = useState('');
  const [editingProduct, setEditingProduct] = useState<StoreProduct | null | undefined>(undefined);
  const [confirmDeleteProdId, setConfirmDeleteProdId] = useState<string | null>(null);

  // Orders state
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | StoreOrderStatus>('all');
  const [confirmDeleteOrdId, setConfirmDeleteOrdId] = useState<string | null>(null);

  // Unified Program Marketing Editor
  const [editingProgCard, setEditingProgCard] = useState<PortalContentItem | null>(null);
  const [isAddingNewProg, setIsAddingNewProg] = useState(false);
  const [confirmDeleteProgId, setConfirmDeleteProgId] = useState<string | null>(null);
  const [syllabusDraft, setSyllabusDraft] = useState('');
  const [reqTargetProgMap, setReqTargetProgMap] = useState<Record<string, string>>({});
  const [processingReqId, setProcessingReqId] = useState<string | null>(null);

  // Catalog (Category & Banner forms)
  const [catName, setCatName] = useState('');
  const [catImage, setCatImage] = useState('');
  const [banTitle, setBanTitle] = useState('');
  const [banSubtitle, setBanSubtitle] = useState('');
  const [banImage, setBanImage] = useState('');

  // Marketing (Coupon & City forms)
  const [coupCode, setCoupCode] = useState('');
  const [coupType, setCoupType] = useState<'percent' | 'fixed'>('percent');
  const [coupVal, setCoupVal] = useState('10');
  const [coupMin, setCoupMin] = useState('100');
  const [coupMaxUses, setCoupMaxUses] = useState('200');
  const [coupExpires, setCoupExpires] = useState('2027-12-31');

  const [cityName, setCityName] = useState('');
  const [cityFee, setCityFee] = useState('20');
  const [cityDays, setCityDays] = useState('2 - 3 أيام');
  const [cityFreeMin, setCityFreeMin] = useState('400');

  const currency = storeData.settings.currency || 'ر.س';

  const portalPrograms = useMemo(
    () =>
      (portalData.items || [])
        .filter((i) => i.section === 'programs')
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [portalData.items]
  );

  const storeProgramRequests = useMemo(
    () => programRequests.filter((r) => r.source === 'store' || Boolean(r.paymentMethod)),
    [programRequests]
  );

  const lowStockProducts = useMemo(
    () => storeData.products.filter((p) => p.is_active && p.stock <= 5),
    [storeData.products]
  );

  const totalRevenue = useMemo(
    () =>
      storeData.orders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0),
    [storeData.orders]
  );

  const pendingOrdersCount = useMemo(
    () => storeData.orders.filter((o) => o.status === 'pending').length,
    [storeData.orders]
  );

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return storeData.products;
    return storeData.products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [storeData.products, productQuery]);

  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'all') return storeData.orders;
    return storeData.orders.filter((o) => o.status === orderStatusFilter);
  }, [storeData.orders, orderStatusFilter]);

  const copyText = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1800);
  };

  const handlePullStore = async () => {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetchStoreDataFromSheets(webhookUrl, true);
      onUpdateStoreData(res.data);
      onRefreshProgramRequests();
      setBanner({
        success: res.success,
        text: res.success
          ? 'تمت مزامنة المنتجات والطلبات وإعدادات المتجر من Google Sheets بنجاح!'
          : res.needsScriptUpdate
          ? 'تم عرض البيانات المحلية — يرجى تحديث نشر Google Apps Script (New Version) لقراءة أوراق متجر_* من السحابة.'
          : 'تعذر السحب من الشيت؛ تم عرض البيانات المحلية.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveStore = async (overrideStore?: StorePublicData) => {
    setBusy(true);
    setBanner(null);
    try {
      const target = overrideStore || storeData;
      const res = await saveStoreDataToSheets(webhookUrl, target);
      setBanner({ success: res.success, text: res.message });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProduct = async (saved: StoreProduct) => {
    const exists = storeData.products.some((p) => p.id === saved.id);
    const nextProducts = exists
      ? storeData.products.map((p) => (p.id === saved.id ? saved : p))
      : [saved, ...storeData.products];
    const nextStore = { ...storeData, products: nextProducts };
    onUpdateStoreData(nextStore);
    setEditingProduct(undefined);
    await handleSaveStore(nextStore);
  };

  const handleDeleteProduct = async (id: string) => {
    const nextStore = {
      ...storeData,
      products: storeData.products.filter((p) => p.id !== id),
    };
    onUpdateStoreData(nextStore);
    setConfirmDeleteProdId(null);
    await handleSaveStore(nextStore);
  };

  const handleUpdateOrderStatus = async (orderId: string, nextStatus: StoreOrderStatus) => {
    const nextStore: StorePublicData = {
      ...storeData,
      orders: storeData.orders.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)),
    };
    onUpdateStoreData(nextStore);
    const res = await updateStoreOrderStatusInSheets(webhookUrl, orderId, nextStatus);
    setBanner({ success: res.success, text: res.message });
  };

  const handleDeleteOrder = async (orderId: string) => {
    const nextStore: StorePublicData = {
      ...storeData,
      orders: storeData.orders.filter((o) => o.id !== orderId),
    };
    onUpdateStoreData(nextStore);
    setConfirmDeleteOrdId(null);
    const res = await deleteStoreOrderInSheets(webhookUrl, orderId);
    setBanner({ success: res.success, text: res.message });
  };

  // Save unified program marketing + core fields directly to PortalPublicData (محتوى_البوابة_العامة)
  const handleSaveProgramMarketing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProgCard) return;
    const cleanedSyllabus = syllabusDraft
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const updatedCard: PortalContentItem = {
      ...editingProgCard,
      section: 'programs',
      syllabus: cleanedSyllabus,
      actionType: Number(editingProgCard.price || 0) <= 0 ? 'open_register' : 'open_program_request',
    };
    const exists = portalData.items.some((it) => it.id === updatedCard.id);
    const nextItems = exists
      ? portalData.items.map((it) => (it.id === updatedCard.id ? updatedCard : it))
      : [...portalData.items, updatedCard];
    const nextPortal: PortalPublicData = {
      ...portalData,
      items: nextItems,
    };
    onUpdatePortalData(nextPortal);
    setEditingProgCard(null);
    setIsAddingNewProg(false);
    setBusy(true);
    try {
      const res = await savePortalDataToSheets(webhookUrl, nextPortal);
      setBanner({
        success: res.success,
        text: res.success
          ? `تم حفظ بيانات البرنامج «${updatedCard.title}» ومزامنتها في الصفحة العامة والمتجر بنجاح!`
          : res.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleMoveProgramOrder = async (progId: string, dir: -1 | 1) => {
    const idx = portalPrograms.findIndex((p) => p.id === progId);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= portalPrograms.length) return;
    const reordered = [...portalPrograms];
    const tmp = reordered[idx];
    reordered[idx] = reordered[swapIdx];
    reordered[swapIdx] = tmp;
    const orderMap = new Map<string, number>();
    reordered.forEach((p, i) => orderMap.set(p.id, i + 1));
    const nextPortal: PortalPublicData = {
      ...portalData,
      items: portalData.items.map((it) =>
        it.section === 'programs' && orderMap.has(it.id)
          ? { ...it, sortOrder: orderMap.get(it.id)! }
          : it
      ),
    };
    onUpdatePortalData(nextPortal);
    await savePortalDataToSheets(webhookUrl, nextPortal);
  };

  const handleDeleteProgramCard = async (progId: string) => {
    const nextPortal: PortalPublicData = {
      ...portalData,
      items: portalData.items.filter((it) => it.id !== progId),
    };
    onUpdatePortalData(nextPortal);
    setConfirmDeleteProgId(null);
    const res = await savePortalDataToSheets(webhookUrl, nextPortal);
    setBanner({ success: res.success, text: res.success ? 'تم حذف بطاقة البرنامج ومزامنة الشيت.' : res.message });
  };

  const handleApproveOrRejectStoreReq = async (
    req: ProgramRequestRecord,
    status: 'approved' | 'rejected'
  ) => {
    const chosenProgId =
      reqTargetProgMap[req.requestId] || req.targetProgramId || programs[0]?.id || '';
    const chosenProgName =
      programs.find((p) => p.id === chosenProgId)?.name || req.targetProgramTitle;

    if (status === 'approved' && !chosenProgId) {
      setBanner({
        success: false,
        text: 'يرجى تحديد البرنامج الدراسي من قائمة الجدول قبل الاعتماد حتى يتم تفعيل حساب الطالب عليه.',
      });
      return;
    }

    setProcessingReqId(req.requestId);
    try {
      const res = await updateProgramRequestStatusInSheets(webhookUrl, {
        requestId: req.requestId,
        rowIndex: req.rowIndex,
        registrationId: req.registrationId,
        studentName: req.studentName,
        status,
        targetProgramId: chosenProgId,
        targetProgramName: chosenProgName,
        notifyStudentTelegram: true,
      });
      setBanner({ success: res.success, text: res.message });
      onRefreshProgramRequests();
      if (status === 'approved') {
        onRefreshRegistrants?.();
      }
    } finally {
      setProcessingReqId(null);
    }
  };

  const storeDirectUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#store`
      : '#store';
  const storeOrdersUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}#store-orders`
      : '#store-orders';

  const tabs: { id: StoreAdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'overview', label: 'نظرة عامة', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'products', label: 'المنتجات والمخزون', icon: <ShoppingCart className="w-3.5 h-3.5" />, badge: storeData.products.length },
    { id: 'programMarketing', label: 'إدارة البرامج والتسويق', icon: <GraduationCap className="w-3.5 h-3.5" />, badge: portalPrograms.length },
    { id: 'orders', label: 'الطلبات', icon: <Package className="w-3.5 h-3.5" />, badge: pendingOrdersCount || undefined },
    { id: 'catalog', label: 'الأقسام والبانرات', icon: <FolderTree className="w-3.5 h-3.5" /> },
    { id: 'marketing', label: 'الكوبونات والتوصيل', icon: <Tag className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'إعدادات المتجر', icon: <SettingsIcon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header Toolbar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
            مركز إدارة المتجر وتسويق البرامج (متجر_*)
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            مربوط تلقائياً ببوابة الدروس وبوت تيليغرام الموحد — بطاقات البرامج في المتجر هي نفس برامج البوابة العامة دون أي تكرار.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenStorePreview && (
            <button
              type="button"
              onClick={onOpenStorePreview}
              className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>معاينة المتجر (#store)</span>
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={handlePullStore}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            <span>سحب من الشيت</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleSaveStore()}
            className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Save className="w-3.5 h-3.5" />
            <span>حفظ ومزامنة المتجر للشيت</span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          className={`rounded-2xl px-4 py-3 border text-xs font-bold flex items-center justify-between gap-3 ${
            banner.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{banner.text}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="underline cursor-pointer shrink-0">
            إخلاق
          </button>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              tab === t.id
                ? 'bg-white text-emerald-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            {t.badge !== undefined && t.badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-[10px] tabular-nums">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200">
              <p className="text-xs font-bold text-slate-500">إجمالي المبيعات (غير الملغاة)</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">
                {totalRevenue} {currency}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200">
              <p className="text-xs font-bold text-slate-500">طلبات المتجر</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">
                {storeData.orders.length}{' '}
                <span className="text-xs font-bold text-amber-700">({pendingOrdersCount} قيد المراجعة)</span>
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200">
              <p className="text-xs font-bold text-slate-500">تسجيلات البرامج عبر المتجر</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">
                {storeProgramRequests.length}
              </p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200">
              <p className="text-xs font-bold text-slate-500">تنبيه المخزون المنخفض (&le; 5)</p>
              <p className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">
                {lowStockProducts.length}
              </p>
            </div>
          </div>

          {/* Direct Store URLs */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
            <h4 className="text-sm font-extrabold text-slate-900">الروابط المباشرة للمتجر وتتبع الطلبات</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-slate-500">رابط واجهة المتجر</div>
                  <div dir="ltr" className="text-xs font-mono text-slate-800 truncate">{storeDirectUrl}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyText('storeUrl', storeDirectUrl)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedKey === 'storeUrl' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'storeUrl' ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-slate-500">رابط تتبع الطلبات المباشر</div>
                  <div dir="ltr" className="text-xs font-mono text-slate-800 truncate">{storeOrdersUrl}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyText('ordersUrl', storeOrdersUrl)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedKey === 'ordersUrl' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'ordersUrl' ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-slate-900">أحدث طلبات المتجر</h4>
                <button type="button" onClick={() => setTab('orders')} className="text-xs font-bold text-emerald-800 hover:underline cursor-pointer">
                  عرض الكل
                </button>
              </div>
              {storeData.orders.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">لا توجد طلبات متجر مسجلة حتى الآن.</p>
              ) : (
                storeData.orders.slice(0, 5).map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-xs">
                    <div>
                      <span className="font-extrabold text-slate-900">{o.customer_name}</span>{' '}
                      <span className="font-mono text-slate-500">({o.id})</span>
                      <div className="text-[11px] text-slate-500">{o.customer_city} · {ORDER_STATUS_META[o.status]?.label || o.status}</div>
                    </div>
                    <span className="font-extrabold text-slate-900 tabular-nums">{o.total} {currency}</span>
                  </div>
                ))
              )}
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>تنبيهات المخزون المنخفض</span>
                </h4>
                <button type="button" onClick={() => setTab('products')} className="text-xs font-bold text-emerald-800 hover:underline cursor-pointer">
                  إدارة المخزون
                </button>
              </div>
              {lowStockProducts.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">جميع المنتجات تتوفر بكميات كافية.</p>
              ) : (
                lowStockProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-xs">
                    <span className="font-bold text-slate-800 truncate">{p.name}</span>
                    <span className="font-mono font-extrabold text-rose-700 shrink-0">المتبقي: {p.stock}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTS */}
      {tab === 'products' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder="ابحث باسم المنتج أو رمز SKU..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 pr-9 pl-3 py-2 text-xs focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setEditingProduct(null)}
              className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة منتج جديد</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredProducts.map((p) => {
              const catName = storeData.categories.find((c) => c.id === p.category_id)?.name || 'عام';
              return (
                <div
                  key={p.id}
                  className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center gap-3.5 justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0">
                      <StoreImage src={p.image_url} alt={p.name} aspectClass="w-full h-full" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-extrabold text-slate-900 truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                        <span>{catName}</span>
                        <span className="font-mono">{p.sku}</span>
                        <span className="font-bold text-emerald-800 tabular-nums">{p.price} {currency}</span>
                        <span className={`font-bold tabular-nums ${p.stock <= 5 ? 'text-rose-700' : 'text-slate-600'}`}>
                          المخزون: {p.stock}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {p.show_on_home && (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                            معروض في الصفحة العامة
                          </span>
                        )}
                        {!p.is_active && (
                          <span className="inline-block text-[10px] font-bold text-rose-700">مخفي عن الزوار</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const nextStore: StorePublicData = {
                          ...storeData,
                          products: storeData.products.map((it) =>
                            it.id === p.id ? { ...it, show_on_home: !it.show_on_home } : it
                          ),
                        };
                        onUpdateStoreData(nextStore);
                        await handleSaveStore(nextStore);
                      }}
                      className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer ${
                        p.show_on_home
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      title="عرض أو إخفاء في الصفحة العامة"
                    >
                      {p.show_on_home ? 'ظاهر بالرئيسية' : 'إظهار بالرئيسية'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingProduct(p)}
                      className="p-2 rounded-lg border border-slate-200 bg-white text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                      title="تعديل"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {confirmDeleteProdId === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(p.id)}
                          className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                        >
                          تأكيد
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteProdId(null)}
                          className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProdId(p.id)}
                        className="p-2 rounded-lg border border-slate-200 bg-white text-rose-700 hover:bg-rose-50 cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: UNIFIED PROGRAM MANAGEMENT & MARKETING */}
      {tab === 'programMarketing' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  إدارة البرامج التدريبية الموحّدة (المتجر + الصفحة العامة)
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  مكان واحد لإضافة وتعديل جميع البرامج التدريبية؛ يمكنك التحكم بعرض كل برنامج في الصفحة العامة وفي المتجر، مع السعر والمقاعد والأدوات المقترحة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddingNewProg(true);
                  setSyllabusDraft('');
                  setEditingProgCard({
                    id: `prog_card_${Date.now().toString().slice(-5)}`,
                    section: 'programs',
                    title: '',
                    subtitle: '',
                    description: '',
                    badgeText: 'برنامج تدريبي',
                    slug: `program-${portalPrograms.length + 1}`,
                    enabled: true,
                    sortOrder: portalPrograms.length + 1,
                    showOnHome: true,
                    showInStore: true,
                    price: 0,
                    compareAtPrice: null,
                    format: 'online_live',
                    duration: '4 أسابيع',
                    startDate: 'تسجيل مفتوح',
                    instructor: '',
                    seatsTotal: 30,
                    seatsLeft: 25,
                    syllabus: [],
                    recommendedProductIds: [],
                    actionType: 'open_register',
                  });
                }}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة برنامج جديد</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {portalPrograms.map((prog, idx) => {
                const showInStore = prog.showInStore !== false;
                const showOnHome = prog.showOnHome !== false;
                const priceVal = Number(prog.price) || 0;
                const linkedProgName = programs.find((p) => p.id === prog.targetProgramId)?.name;
                return (
                  <div key={prog.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="text-sm font-extrabold text-slate-900">{prog.title || 'برنامج بدون عنوان'}</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              showOnHome ? 'bg-indigo-100 text-indigo-900' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {showOnHome ? 'بالصفحة العامة' : 'مخفي من الرئيسية'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              showInStore ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {showInStore ? 'بالمتجر' : 'مخفي من المتجر'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                          <span className="font-bold text-emerald-800 tabular-nums">
                            {priceVal > 0 ? `${priceVal} ${currency}` : 'مجاني'}
                          </span>
                          <span>·</span>
                          <span>{FORMAT_LABELS[prog.format || 'online_live']}</span>
                          {prog.seatsLeft !== undefined && (
                            <>
                              <span>·</span>
                              <span className="tabular-nums">المقاعد المتبقية: {prog.seatsLeft}</span>
                            </>
                          )}
                        </div>
                        {linkedProgName && (
                          <div className="text-[11px] font-bold text-indigo-700">
                            مربوط بمجموعة الجدول: {linkedProgName}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveProgramOrder(prog.id, -1)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                            title="تقديم للأعلى"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === portalPrograms.length - 1}
                            onClick={() => handleMoveProgramOrder(prog.id, 1)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-30 cursor-pointer"
                            title="تأخير للأسفل"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingNewProg(false);
                              setSyllabusDraft((prog.syllabus || []).join('\n'));
                              setEditingProgCard({
                                ...prog,
                                showOnHome: prog.showOnHome !== false,
                                showInStore: prog.showInStore !== false,
                                price: prog.price ?? 0,
                                format: prog.format || 'online_live',
                                seatsTotal: prog.seatsTotal ?? 30,
                                seatsLeft: prog.seatsLeft ?? 15,
                                recommendedProductIds: prog.recommendedProductIds || [],
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-emerald-700 text-xs font-bold text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>تعديل</span>
                          </button>

                          {confirmDeleteProgId === prog.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteProgramCard(prog.id)}
                                className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                              >
                                حذف
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteProgId(null)}
                                className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProgId(prog.id)}
                              className="p-1.5 rounded-xl bg-white border border-slate-200 text-rose-700 hover:bg-rose-50 cursor-pointer"
                              title="حذف البرنامج"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Store Program Enrollments (from طلبات_البرامج where source==='store') */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  طلبات التسجيل في البرامج الواردة من المتجر
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  عند اعتماد طلب من طالب جديد لا يملك ID مسبقاً، يُنشئ النظام له رقم ID تلقائياً ويفعّله على البرنامج المختار.
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshProgramRequests}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تحديث الطلبات</span>
              </button>
            </div>

            {storeProgramRequests.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                لا توجد طلبات التحاق برامج واردة من واجهة المتجر بعد.
              </p>
            ) : (
              <div className="space-y-3">
                {storeProgramRequests.map((req) => {
                  const chosenProg = reqTargetProgMap[req.requestId] ?? req.targetProgramId ?? (programs[0]?.id || '');
                  return (
                    <div
                      key={req.requestId}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900">{req.studentName}</span>
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                              {req.registrationId === 'NEW' || !req.registrationId ? 'متقدم جديد' : `ID: ${req.registrationId}`}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                req.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : req.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {req.statusLabel}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap gap-3">
                            <span>البرنامج: <strong>{req.targetProgramTitle}</strong></span>
                            {req.phone && <span dir="ltr" className="font-mono">{req.phone}</span>}
                            {req.pricePaid !== undefined && (
                              <span className="font-bold text-emerald-800">
                                {req.pricePaid > 0 ? `${req.pricePaid} ${currency}` : 'مجاني'}
                                {req.paymentMethod === 'bank_transfer' ? ' · تحويل بنكي' : req.paymentMethod === 'cod' ? ' · عند الاستلام' : ''}
                              </span>
                            )}
                            {req.bankReference && (
                              <span className="text-amber-800 font-bold">مرجع الحوالة: {req.bankReference}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={chosenProg}
                            onChange={(e) =>
                              setReqTargetProgMap((prev) => ({ ...prev, [req.requestId]: e.target.value }))
                            }
                            className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                          >
                            {programs.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {req.status !== 'approved' && (
                            <button
                              type="button"
                              disabled={processingReqId === req.requestId}
                              onClick={() => handleApproveOrRejectStoreReq(req, 'approved')}
                              className="px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Award className="w-3.5 h-3.5" />
                              <span>اعتماد وتفعيل ID</span>
                            </button>
                          )}
                          {req.status === 'pending' && (
                            <button
                              type="button"
                              disabled={processingReqId === req.requestId}
                              onClick={() => handleApproveOrRejectStoreReq(req, 'rejected')}
                              className="px-3 py-1.5 rounded-xl border border-rose-300 bg-white text-rose-700 text-xs font-bold cursor-pointer"
                            >
                              تأجيل
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteProgramRequestInSheets(webhookUrl, req.requestId, req.rowIndex);
                              onRefreshProgramRequests();
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-700 cursor-pointer"
                            title="حذف الطلب"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* TAB 4: ORDERS */}
      {tab === 'orders' && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-extrabold text-slate-900">سجل طلبات المتجر (متجر_الطلبات)</h4>
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setOrderStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    orderStatusFilter === st
                      ? 'bg-emerald-800 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {st === 'all' ? 'الكل' : ORDER_STATUS_META[st].label}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">لا توجد طلبات في هذا التصنيف.</p>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((o) => (
                <div key={o.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-extrabold text-sm text-slate-900">{o.id}</span>
                        <span className="text-sm font-bold text-slate-800">{o.customer_name}</span>
                        <span dir="ltr" className="text-xs font-mono text-slate-600">{o.customer_phone}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {o.customer_city} — {o.customer_address}
                        {o.telegram_username ? ` · تيليغرام: ${o.telegram_username}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={o.status}
                        onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value as StoreOrderStatus)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
                          ORDER_STATUS_META[o.status]?.cls || 'bg-white border-slate-300'
                        }`}
                      >
                        <option value="pending">قيد المراجعة</option>
                        <option value="confirmed">تم التأكيد</option>
                        <option value="shipped">جاري التوصيل</option>
                        <option value="delivered">تم التسليم</option>
                        <option value="cancelled">ملغي</option>
                      </select>

                      {confirmDeleteOrdId === o.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(o.id)}
                            className="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                          >
                            حذف
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteOrdId(null)}
                            className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                          >
                            تراجع
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteOrdId(o.id)}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    {o.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-slate-700">
                        <span>
                          {it.name} {it.variant ? `(${it.variant})` : ''} × {it.qty}
                        </span>
                        <span className="font-bold tabular-nums">{it.line_total} {currency}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5 text-xs">
                    <span className="text-slate-600">
                      {o.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'الدفع عند الاستلام'}
                      {o.bank_reference ? ` · مرجع: ${o.bank_reference}` : ''}
                      {o.coupon_code ? ` · كوبون ${o.coupon_code} (-${o.discount_amount})` : ''}
                      {` · التوصيل: ${o.delivery_fee} ${currency}`}
                    </span>
                    <span className="text-sm font-extrabold text-emerald-900 tabular-nums">
                      الإجمالي: {o.total} {currency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: CATEGORIES & BANNERS */}
      {tab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Categories */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <h4 className="text-sm font-extrabold text-slate-900">الأقسام (متجر_الأقسام)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="اسم القسم الجديد..."
                className="sm:col-span-1 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              />
              <input
                dir="ltr"
                value={catImage}
                onChange={(e) => setCatImage(e.target.value)}
                placeholder="رابط صورة اختياري"
                className="sm:col-span-1 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!catName.trim()) return;
                  const newCat: StoreCategory = {
                    id: `cat_${Date.now().toString().slice(-5)}`,
                    name: catName.trim(),
                    slug: `cat-${Date.now().toString().slice(-4)}`,
                    image_url: catImage.trim(),
                    sort_order: storeData.categories.length + 1,
                    is_active: true,
                  };
                  const nextStore = { ...storeData, categories: [...storeData.categories, newCat] };
                  onUpdateStoreData(nextStore);
                  setCatName('');
                  setCatImage('');
                  await handleSaveStore(nextStore);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة قسم</span>
              </button>
            </div>
            <div className="space-y-2">
              {storeData.categories.map((cat) => (
                <div key={cat.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-slate-900">{cat.name}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const nextStore = {
                        ...storeData,
                        categories: storeData.categories.filter((c) => c.id !== cat.id),
                      };
                      onUpdateStoreData(nextStore);
                      await handleSaveStore(nextStore);
                    }}
                    className="p-1 rounded text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Banners */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <h4 className="text-sm font-extrabold text-slate-900">البانرات الترويجية (متجر_البانرات)</h4>
            <div className="space-y-2">
              <input
                value={banTitle}
                onChange={(e) => setBanTitle(e.target.value)}
                placeholder="عنوان البانر الرئيسي"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              />
              <input
                value={banSubtitle}
                onChange={(e) => setBanSubtitle(e.target.value)}
                placeholder="النص الفرعي للبانر"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              />
              <div className="flex gap-2">
                <input
                  dir="ltr"
                  value={banImage}
                  onChange={(e) => setBanImage(e.target.value)}
                  placeholder="رابط الصورة (اختياري)"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!banTitle.trim()) return;
                    const newBan: StoreBanner = {
                      id: `ban_${Date.now().toString().slice(-5)}`,
                      title: banTitle.trim(),
                      subtitle: banSubtitle.trim(),
                      image_url: banImage.trim(),
                      link_url: '#catalog',
                      sort_order: storeData.banners.length + 1,
                      is_active: true,
                    };
                    const nextStore = { ...storeData, banners: [newBan, ...storeData.banners] };
                    onUpdateStoreData(nextStore);
                    setBanTitle('');
                    setBanSubtitle('');
                    setBanImage('');
                    await handleSaveStore(nextStore);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة بانر</span>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {storeData.banners.map((ban) => (
                <div key={ban.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">{ban.title}</div>
                    <div className="text-[11px] text-slate-500 truncate">{ban.subtitle}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        const nextStore = {
                          ...storeData,
                          banners: storeData.banners.map((b) =>
                            b.id === ban.id ? { ...b, is_active: !b.is_active } : b
                          ),
                        };
                        onUpdateStoreData(nextStore);
                        await handleSaveStore(nextStore);
                      }}
                      className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                        ban.is_active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {ban.is_active ? 'مفعّل' : 'معطّل'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const nextStore = {
                          ...storeData,
                          banners: storeData.banners.filter((b) => b.id !== ban.id),
                        };
                        onUpdateStoreData(nextStore);
                        await handleSaveStore(nextStore);
                      }}
                      className="p-1 rounded text-rose-700 hover:bg-rose-50 cursor-pointer"
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

      {/* TAB 6: COUPONS & DELIVERY CITIES */}
      {tab === 'marketing' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Coupons */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <h4 className="text-sm font-extrabold text-slate-900">كوبونات الخصم (متجر_الكوبونات)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input
                value={coupCode}
                onChange={(e) => setCoupCode(e.target.value.toUpperCase())}
                placeholder="كود الخصم (FASEEH10)"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs uppercase font-mono"
              />
              <select
                value={coupType}
                onChange={(e) => setCoupType(e.target.value as 'percent' | 'fixed')}
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              >
                <option value="percent">نسبة مئوية %</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
              <input
                type="number"
                value={coupVal}
                onChange={(e) => setCoupVal(e.target.value)}
                placeholder="قيمة الخصم"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
              />
              <input
                type="number"
                value={coupMin}
                onChange={(e) => setCoupMin(e.target.value)}
                placeholder="الحد الأدنى"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
              />
              <input
                type="number"
                value={coupMaxUses}
                onChange={(e) => setCoupMaxUses(e.target.value)}
                placeholder="أقصى استخدامات"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!coupCode.trim()) return;
                  const newCoup: StoreCoupon = {
                    id: `coup_${Date.now().toString().slice(-5)}`,
                    code: coupCode.trim().toUpperCase(),
                    discount_type: coupType,
                    discount_value: Math.max(0, Number(coupVal) || 0),
                    min_order: Math.max(0, Number(coupMin) || 0),
                    max_uses: Math.max(0, Number(coupMaxUses) || 0),
                    used_count: 0,
                    expires_at: coupExpires,
                    is_active: true,
                  };
                  const nextStore = { ...storeData, coupons: [newCoup, ...storeData.coupons] };
                  onUpdateStoreData(nextStore);
                  setCoupCode('');
                  await handleSaveStore(nextStore);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة كوبون</span>
              </button>
            </div>
            <div className="space-y-2">
              {storeData.coupons.map((c) => (
                <div key={c.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-extrabold text-slate-900">{c.code}</span>{' '}
                    <span className="text-emerald-800 font-bold">
                      ({c.discount_type === 'percent' ? `${c.discount_value}%` : `${c.discount_value} ${currency}`})
                    </span>
                    <div className="text-[11px] text-slate-500">
                      حد أدنى: {c.min_order} · الاستخدام: {c.used_count}/{c.max_uses || '∞'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const nextStore = {
                        ...storeData,
                        coupons: storeData.coupons.filter((x) => x.id !== c.id),
                      };
                      onUpdateStoreData(nextStore);
                      await handleSaveStore(nextStore);
                    }}
                    className="p-1 rounded text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cities */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-700" />
              <span>مدن وأسعار التوصيل (متجر_المدن_والشحن)</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="اسم المدينة..."
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              />
              <input
                type="number"
                value={cityFee}
                onChange={(e) => setCityFee(e.target.value)}
                placeholder="الرسوم"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
              />
              <input
                value={cityDays}
                onChange={(e) => setCityDays(e.target.value)}
                placeholder="مدة التوصيل"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!cityName.trim()) return;
                  const newCity: StoreCityZone = {
                    id: `city_${Date.now().toString().slice(-5)}`,
                    name: cityName.trim(),
                    delivery_fee: Math.max(0, Number(cityFee) || 0),
                    estimated_days: cityDays.trim() || '2 - 4 أيام',
                    free_shipping_min: Math.max(0, Number(cityFreeMin) || 0),
                    is_active: true,
                  };
                  const nextStore = { ...storeData, cities: [...storeData.cities, newCity] };
                  onUpdateStoreData(nextStore);
                  setCityName('');
                  await handleSaveStore(nextStore);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة مدينة</span>
              </button>
            </div>
            <div className="space-y-2">
              {storeData.cities.map((ct) => (
                <div key={ct.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">{ct.name}</span>{' '}
                    <span className="text-slate-600 tabular-nums">
                      — {ct.delivery_fee} {currency} ({ct.estimated_days})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const nextStore = {
                        ...storeData,
                        cities: storeData.cities.filter((x) => x.id !== ct.id),
                      };
                      onUpdateStoreData(nextStore);
                      await handleSaveStore(nextStore);
                    }}
                    className="p-1 rounded text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: STORE SETTINGS */}
      {tab === 'settings' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">اسم المتجر</label>
              <input
                value={storeData.settings.store_name}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, store_name: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">العملة</label>
              <input
                value={storeData.settings.currency}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, currency: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-700">الشعار التعريفي للمتجر</label>
              <input
                value={storeData.settings.store_tagline}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, store_tagline: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-700">شريط الإعلان أعلى المتجر</label>
              <input
                value={storeData.settings.announcement_text}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, announcement_text: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">رسوم التوصيل الافتراضية</label>
              <input
                type="number"
                value={storeData.settings.default_delivery_fee}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: {
                      ...storeData.settings,
                      default_delivery_fee: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">الحد الأدنى للشحن المجاني</label>
              <input
                type="number"
                value={storeData.settings.free_shipping_min}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: {
                      ...storeData.settings,
                      free_shipping_min: Math.max(0, Number(e.target.value) || 0),
                    },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">اسم البنك للتحويلات</label>
              <input
                value={storeData.settings.bank_name}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, bank_name: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">اسم المستفيد</label>
              <input
                value={storeData.settings.bank_account_name}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, bank_account_name: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">رقم الآيبان (IBAN)</label>
              <input
                dir="ltr"
                value={storeData.settings.bank_iban}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, bank_iban: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">معرف حساب الدعم في تيليجرام</label>
              <input
                dir="ltr"
                value={storeData.settings.telegram_username}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, telegram_username: e.target.value },
                  })
                }
                placeholder="username (اختياري)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-2 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={storeData.settings.cod_enabled}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, cod_enabled: e.target.checked },
                  })
                }
              />
              <span>تفعيل الدفع عند الاستلام</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={storeData.settings.bank_transfer_enabled}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, bank_transfer_enabled: e.target.checked },
                  })
                }
              />
              <span>تفعيل التحويل البنكي المباشر</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={storeData.settings.notify_telegram_on_order !== false}
                onChange={(e) =>
                  onUpdateStoreData({
                    ...storeData,
                    settings: { ...storeData.settings, notify_telegram_on_order: e.target.checked },
                  })
                }
              />
              <span>إشعار الإدارة عبر بوت تيليغرام الموحد عند كل طلب</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-emerald-900 cursor-pointer">
              <input
                type="checkbox"
                checked={storeData.settings.show_in_public_portal !== false}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  const nextStore: StorePublicData = {
                    ...storeData,
                    settings: { ...storeData.settings, show_in_public_portal: checked },
                  };
                  onUpdateStoreData(nextStore);
                  const nextPortal: PortalPublicData = {
                    ...portalData,
                    settings: {
                      ...portalData.settings,
                      showStoreNavSlot: checked,
                      sections: (portalData.settings.sections || []).map((s) =>
                        s.key === 'store_slot' ? { ...s, enabled: checked } : s
                      ),
                    },
                  };
                  onUpdatePortalData(nextPortal);
                  await Promise.all([
                    saveStoreDataToSheets(webhookUrl, nextStore),
                    savePortalDataToSheets(webhookUrl, nextPortal),
                  ]);
                }}
              />
              <span>إظهار أيقونة المتجر (عربة التسوق) وقسم المنتجات المختارة في الصفحة العامة</span>
            </label>
          </div>

          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSaveStore()}
              className="px-6 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>حفظ جميع إعدادات المتجر</span>
            </button>
          </div>
        </div>
      )}

      {/* Product Add/Edit Modal */}
      {editingProduct !== undefined && (
        <ProductFormModal
          product={editingProduct}
          categories={storeData.categories}
          currency={currency}
          onSave={handleSaveProduct}
          onClose={() => setEditingProduct(undefined)}
        />
      )}

      {/* Unified Program Marketing Modal */}
      {editingProgCard && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => setEditingProgCard(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                {isAddingNewProg ? 'إضافة برنامج تدريبي جديد' : `تعديل البرنامج: ${editingProgCard.title}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingProgCard(null);
                  setIsAddingNewProg(false);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProgramMarketing} className="p-6 space-y-4 max-h-[82dvh] overflow-y-auto">
              <div className="flex flex-wrap gap-6 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                <label className="inline-flex items-center gap-2 text-xs font-extrabold text-indigo-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProgCard.showOnHome !== false}
                    onChange={(e) =>
                      setEditingProgCard({ ...editingProgCard, showOnHome: e.target.checked })
                    }
                  />
                  <span>عرض في الصفحة العامة للزوار</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-extrabold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingProgCard.showInStore !== false}
                    onChange={(e) =>
                      setEditingProgCard({ ...editingProgCard, showInStore: e.target.checked })
                    }
                  />
                  <span>عرض في المتجر</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">اسم البرنامج التدريبي *</label>
                  <input
                    required
                    value={editingProgCard.title}
                    onChange={(e) => setEditingProgCard({ ...editingProgCard, title: e.target.value })}
                    placeholder="مثال: برنامج المستوى التأسيسي"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">العنوان الفرعي / الشارة</label>
                  <input
                    value={editingProgCard.badgeText || ''}
                    onChange={(e) => setEditingProgCard({ ...editingProgCard, badgeText: e.target.value })}
                    placeholder="مثال: دخول فوري · المرحلة ١"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">وصف البرنامج للزوار</label>
                <textarea
                  rows={2}
                  value={editingProgCard.description}
                  onChange={(e) => setEditingProgCard({ ...editingProgCard, description: e.target.value })}
                  placeholder="وصف مختصر يظهر على بطاقة البرنامج وداخل نافذة التفاصيل..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">رابط صورة البرنامج (يدعم Google Drive أو رابط مباشر)</label>
                <input
                  dir="ltr"
                  value={editingProgCard.mediaUrl || ''}
                  onChange={(e) => setEditingProgCard({ ...editingProgCard, mediaUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    سعر التسجيل ({currency}) (0 = مجاني)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingProgCard.price ?? 0}
                    onChange={(e) =>
                      setEditingProgCard({
                        ...editingProgCard,
                        price: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">سعر قبل الخصم</label>
                  <input
                    type="number"
                    min="0"
                    value={editingProgCard.compareAtPrice || ''}
                    onChange={(e) =>
                      setEditingProgCard({
                        ...editingProgCard,
                        compareAtPrice: e.target.value ? Math.max(0, Number(e.target.value) || 0) : null,
                      })
                    }
                    placeholder="اختياري"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">نمط التدريب</label>
                  <select
                    value={editingProgCard.format || 'online_live'}
                    onChange={(e) =>
                      setEditingProgCard({
                        ...editingProgCard,
                        format: e.target.value as StoreTrainingFormat,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                  >
                    <option value="online_live">عن بُعد مباشر</option>
                    <option value="in_person">حضوري</option>
                    <option value="recorded">مسجل بالكامل</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">اسم المدرب / المشرف</label>
                  <input
                    value={editingProgCard.instructor || ''}
                    onChange={(e) =>
                      setEditingProgCard({ ...editingProgCard, instructor: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">الربط بمجموعة الجدول اليومي</label>
                  <select
                    value={editingProgCard.targetProgramId || ''}
                    onChange={(e) =>
                      setEditingProgCard({ ...editingProgCard, targetProgramId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                  >
                    <option value="">-- اختر مجموعة البرنامج عند القبول --</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">المدة</label>
                  <input
                    value={editingProgCard.duration || ''}
                    onChange={(e) =>
                      setEditingProgCard({ ...editingProgCard, duration: e.target.value })
                    }
                    placeholder="4 أسابيع"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">تاريخ البدء</label>
                  <input
                    value={editingProgCard.startDate || ''}
                    onChange={(e) =>
                      setEditingProgCard({ ...editingProgCard, startDate: e.target.value })
                    }
                    placeholder="تسجيل مستمر"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">إجمالي المقاعد</label>
                  <input
                    type="number"
                    min="0"
                    value={editingProgCard.seatsTotal ?? 30}
                    onChange={(e) =>
                      setEditingProgCard({
                        ...editingProgCard,
                        seatsTotal: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">المقاعد المتبقية</label>
                  <input
                    type="number"
                    min="0"
                    value={editingProgCard.seatsLeft ?? 15}
                    onChange={(e) =>
                      setEditingProgCard({
                        ...editingProgCard,
                        seatsLeft: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700">محاور البرنامج (كل محور في سطر)</label>
                <textarea
                  rows={4}
                  value={syllabusDraft}
                  onChange={(e) => setSyllabusDraft(e.target.value)}
                  placeholder="المحور الأول..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                />
              </div>

              {storeData.products.length > 0 && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs font-extrabold text-slate-900">
                    أدوات المتجر الموصى بها لهذا البرنامج (تظهر داخل بطاقة التسجيل لسهولة الشراء)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {storeData.products.map((prod) => {
                      const selectedIds = editingProgCard.recommendedProductIds || [];
                      const checked = selectedIds.includes(prod.id);
                      return (
                        <label
                          key={prod.id}
                          className="flex items-center gap-2 text-xs text-slate-700 bg-white px-2.5 py-2 rounded-lg border border-slate-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...selectedIds, prod.id]
                                : selectedIds.filter((x) => x !== prod.id);
                              setEditingProgCard({ ...editingProgCard, recommendedProductIds: nextIds });
                            }}
                          />
                          <span className="truncate">{prod.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bilingual Program Translations (EN / TH) */}
              <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <summary className="text-xs font-extrabold text-slate-900 cursor-pointer select-none">
                  ترجمة تفاصيل البرنامج (English / ภาษาไทย) — اختياري
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        Title (English)
                      </label>
                      <input
                        dir="ltr"
                        value={editingProgCard.titleEn || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, titleEn: e.target.value })
                        }
                        placeholder="Program Title (EN)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        ชื่อหลักสูตร (ภาษาไทย)
                      </label>
                      <input
                        value={editingProgCard.titleTh || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, titleTh: e.target.value })
                        }
                        placeholder="ชื่อหลักสูตร (TH)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        Badge / Subtitle (EN)
                      </label>
                      <input
                        dir="ltr"
                        value={editingProgCard.badgeTextEn || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, badgeTextEn: e.target.value })
                        }
                        placeholder="Badge (EN)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        ป้ายกำกับ (TH)
                      </label>
                      <input
                        value={editingProgCard.badgeTextTh || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, badgeTextTh: e.target.value })
                        }
                        placeholder="ป้ายกำกับ (TH)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        Description (EN)
                      </label>
                      <textarea
                        rows={2}
                        dir="ltr"
                        value={editingProgCard.descriptionEn || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, descriptionEn: e.target.value })
                        }
                        placeholder="Program description (EN)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        รายละเอียด (TH)
                      </label>
                      <textarea
                        rows={2}
                        value={editingProgCard.descriptionTh || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, descriptionTh: e.target.value })
                        }
                        placeholder="รายละเอียดหลักสูตร (TH)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        Button Label (EN)
                      </label>
                      <input
                        dir="ltr"
                        value={editingProgCard.linkLabelEn || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, linkLabelEn: e.target.value })
                        }
                        placeholder="Enroll Now (EN)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-bold text-slate-600">
                        ข้อความปุ่ม (TH)
                      </label>
                      <input
                        value={editingProgCard.linkLabelTh || ''}
                        onChange={(e) =>
                          setEditingProgCard({ ...editingProgCard, linkLabelTh: e.target.value })
                        }
                        placeholder="สมัครเรียน (TH)"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                  </div>
                </div>
              </details>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingProgCard(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold cursor-pointer"
                >
                  حفظ ومزامنة إعدادات التسويق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
