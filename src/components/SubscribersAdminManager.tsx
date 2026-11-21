import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Users,
  UserPlus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  MapPin,
  Clock,
  RotateCcw,
  Trash2,
  Edit3,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Wrench,
  X,
  Plus,
  Ban,
} from 'lucide-react';
import { StudentRegistrant } from '../types';
import {
  fetchIDRegistrantsDetailed,
  ensureIDRegistrantsSheet,
  addIDRegistrantToSheet,
  updateIDRegistrantInSheet,
  resetRegistrantDevicesInSheet,
  deleteIDRegistrantFromSheet,
  normalizeDigits,
} from '../utils/googleSheets';

interface SubscribersAdminManagerProps {
  webhookUrl: string;
}

export const SubscribersAdminManager: React.FC<SubscribersAdminManagerProps> = ({ webhookUrl }) => {
  const [registrants, setRegistrants] = useState<StudentRegistrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [supportsDeviceSecurity, setSupportsDeviceSecurity] = useState<boolean>(true);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'has_devices'>('all');

  // Add subscriber form
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newMaxDevices, setNewMaxDevices] = useState<number>(2);
  const [newStatus, setNewStatus] = useState<'مفعّل' | 'معطّل'>('مفعّل');
  const [isAdding, setIsAdding] = useState(false);

  // Row-level busy state
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [expandedDevicesId, setExpandedDevicesId] = useState<string | null>(null);

  // Edit modal
  const [editingRow, setEditingRow] = useState<{
    originalId: string;
    id: string;
    name: string;
    status: 'مفعّل' | 'معطّل';
    maxDevices: number;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // QR Card modal
  const [qrStudent, setQrStudent] = useState<StudentRegistrant | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const isDisabledStatus = (status?: string) => {
    const s = String(status || '').trim().toLowerCase();
    return s === 'معطل' || s === 'معطّل' || s === 'لا' || s === 'no' || s === 'false' || s === 'disabled' || s === '0';
  };

  const loadRegistrants = async () => {
    setLoading(true);
    try {
      const res = await fetchIDRegistrantsDetailed(webhookUrl);
      setRegistrants(res.registrants);
      setSupportsDeviceSecurity(res.supportsDeviceSecurity);
    } catch {
      setStatusBanner({
        type: 'error',
        text: 'تعذر جلب قائمة المشتركين من Google Sheets.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRegistrants();
  }, [webhookUrl]);

  const stats = useMemo(() => {
    const total = registrants.length;
    const disabled = registrants.filter((r) => isDisabledStatus(r.status)).length;
    const active = total - disabled;
    const totalDevices = registrants.reduce((sum, r) => sum + (r.devices?.length || 0), 0);
    return { total, active, disabled, totalDevices };
  }, [registrants]);

  const filteredRegistrants = useMemo(() => {
    const q = normalizeDigits(searchQuery).toLowerCase();
    return registrants.filter((r) => {
      if (statusFilter === 'active' && isDisabledStatus(r.status)) return false;
      if (statusFilter === 'disabled' && !isDisabledStatus(r.status)) return false;
      if (statusFilter === 'has_devices' && (!r.devices || r.devices.length === 0)) return false;
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.devices || []).some((d) => (d.location || '').toLowerCase().includes(q))
      );
    });
  }, [registrants, searchQuery, statusFilter]);

  const handleInitOrUpgradeSheet = async () => {
    setLoading(true);
    setStatusBanner(null);
    const res = await ensureIDRegistrantsSheet(webhookUrl);
    if (res.success) {
      setStatusBanner({
        type: res.supportsDeviceSecurity ? 'success' : 'warning',
        text: res.supportsDeviceSecurity
          ? 'تم تجهيز وترقية أعمدة ورقة ID registrants (5 أعمدة) بنجاح!'
          : 'تم إرسال الطلب، ولكن يرجى نشر النسخة الجديدة من Google Apps Script (New Version) لتفعيل الأعمدة الخمسة.',
      });
      await loadRegistrants();
    } else {
      setStatusBanner({ type: 'error', text: res.message });
      setLoading(false);
    }
  };

  const handleAddSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = normalizeDigits(newId);
    const cleanName = newName.trim();
    if (!cleanId || !cleanName) return;

    setIsAdding(true);
    setStatusBanner(null);
    const res = await addIDRegistrantToSheet(webhookUrl, {
      id: cleanId,
      name: cleanName,
      status: newStatus,
      maxDevices: newMaxDevices,
    });

    if (res.success) {
      setNewId('');
      setNewName('');
      setNewMaxDevices(2);
      setNewStatus('مفعّل');
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'success',
        text: res.needsScriptUpdate
          ? 'تمت إضافة المشترك بالصيغة الأساسية. لتفعيل عمود الحالة والأجهزة يرجى نشر New Version من Apps Script.'
          : `تمت إضافة/تحديث المشترك (${cleanName}) في ورقة ID registrants بنجاح.`,
      });
      await loadRegistrants();
    } else {
      setStatusBanner({ type: 'error', text: res.message });
    }
    setIsAdding(false);
  };

  const handleToggleStatus = async (student: StudentRegistrant) => {
    const nextStatus = isDisabledStatus(student.status) ? 'مفعّل' : 'معطّل';
    setBusyRowId(student.id);
    setStatusBanner(null);
    const res = await updateIDRegistrantInSheet(webhookUrl, {
      originalId: student.id,
      id: student.id,
      name: student.name,
      status: nextStatus,
      maxDevices: student.maxDevices || 2,
    });
    if (res.success) {
      setRegistrants((prev) =>
        prev.map((r) => (r.id === student.id ? { ...r, status: nextStatus } : r))
      );
      setStatusBanner({
        type: 'success',
        text: `تم تغيير حالة حساب (${student.name}) إلى: ${nextStatus}`,
      });
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setBusyRowId(null);
  };

  const handleChangeMaxDevices = async (student: StudentRegistrant, nextMax: number) => {
    setBusyRowId(student.id);
    setStatusBanner(null);
    const res = await updateIDRegistrantInSheet(webhookUrl, {
      originalId: student.id,
      id: student.id,
      name: student.name,
      status: student.status || 'مفعّل',
      maxDevices: nextMax,
    });
    if (res.success) {
      setRegistrants((prev) =>
        prev.map((r) => (r.id === student.id ? { ...r, maxDevices: nextMax } : r))
      );
      setStatusBanner({
        type: 'success',
        text: `تم ضبط الحد الأقصى للأجهزة للطالب (${student.name}) إلى ${nextMax}`,
      });
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setBusyRowId(null);
  };

  const handleResetDevices = async (student: StudentRegistrant) => {
    setConfirmResetId(null);
    setBusyRowId(student.id);
    setStatusBanner(null);
    const res = await resetRegistrantDevicesInSheet(webhookUrl, student.id);
    if (res.success) {
      setRegistrants((prev) =>
        prev.map((r) => (r.id === student.id ? { ...r, devices: [] } : r))
      );
      setStatusBanner({
        type: 'success',
        text: `تم تصفير جميع الأجهزة المسجلة للطالب (${student.name}) بنجاح. يمكنه الآن الدخول من جهاز جديد.`,
      });
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setBusyRowId(null);
  };

  const handleDeleteSubscriber = async (student: StudentRegistrant) => {
    setConfirmDeleteId(null);
    setBusyRowId(student.id);
    setStatusBanner(null);
    const res = await deleteIDRegistrantFromSheet(webhookUrl, student.id);
    if (res.success) {
      setRegistrants((prev) => prev.filter((r) => r.id !== student.id));
      setStatusBanner({
        type: 'success',
        text: `تم حذف المشترك (${student.name}) من ورقة ID registrants.`,
      });
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setBusyRowId(null);
  };

  const handleSaveEditModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;
    setIsSavingEdit(true);
    setStatusBanner(null);
    const res = await updateIDRegistrantInSheet(webhookUrl, editingRow);
    if (res.success) {
      setStatusBanner({
        type: 'success',
        text: `تم تحديث بيانات (${editingRow.name}) بنجاح.`,
      });
      setEditingRow(null);
      await loadRegistrants();
    } else {
      setStatusBanner({
        type: res.needsScriptUpdate ? 'warning' : 'error',
        text: res.message,
      });
    }
    setIsSavingEdit(false);
  };

  const handleOpenQrModal = async (student: StudentRegistrant) => {
    setQrStudent(student);
    setCopiedLink(false);
    const autoLoginUrl = `${window.location.origin}${window.location.pathname}?student_id=${encodeURIComponent(
      student.id
    )}&student_name=${encodeURIComponent(student.name)}`;
    try {
      const url = await QRCode.toDataURL(autoLoginUrl, { width: 280, margin: 2 });
      setQrImageUrl(url);
    } catch {
      setQrImageUrl('');
    }
  };

  const getAutoLoginUrl = (student: StudentRegistrant) =>
    `${window.location.origin}${window.location.pathname}?student_id=${encodeURIComponent(
      student.id
    )}&student_name=${encodeURIComponent(student.name)}`;

  const handleCopyAutoLoginLink = async (student: StudentRegistrant) => {
    try {
      await navigator.clipboard.writeText(getAutoLoginUrl(student));
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-6 font-cairo" dir="rtl">
      {/* Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex flex-wrap items-center gap-2">
              <span>إدارة المشتركين والأجهزة (ID registrants)</span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {stats.total} مشترك
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              تحكم مركزي كامل بحسابات الطلاب، التفعيل والتعطيل الفوري، الحد الأقصى للأجهزة المسموحة، تتبع الموقع التقريبي وآخر تسجيل دخول.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleInitOrUpgradeSheet}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 transition-all cursor-pointer disabled:opacity-60"
          >
            <Wrench className="w-4 h-4 text-indigo-600" />
            <span>تجهيز / ترقية أعمدة الشيت</span>
          </button>

          <button
            type="button"
            onClick={loadRegistrants}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث من الشيت</span>
          </button>
        </div>
      </div>

      {/* Warning if Apps Script needs New Version */}
      {!loading && !supportsDeviceSecurity && webhookUrl && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3 text-xs leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold">تذكير: لم يتم تفعيل النسخة الجديدة من Google Apps Script بعد</p>
            <p className="mt-0.5 text-amber-800">
              لتفعيل قفل الأجهزة، تعطيل/تفعيل الحسابات، وتسجيل الموقع الجغرافي في ورقة <code className="font-mono font-bold">ID registrants</code>،
              افتح تبويب <strong>إعدادات ربط Google Sheets</strong> ← انسخ الكود المحدّث ← ثم في Apps Script اختر{' '}
              <strong>Deploy ← Manage deployments ← Edit ← New version</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Status Banner */}
      {statusBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in duration-150 ${
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

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500">إجمالي المشتركين</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-emerald-200/70 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-700">حسابات مفعّلة</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{stats.active}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-rose-200/70 shadow-2xs">
          <div className="text-[11px] font-bold text-rose-700">حسابات معطّلة</div>
          <div className="text-2xl font-black text-rose-700 mt-1">{stats.disabled}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-indigo-200/70 shadow-2xs">
          <div className="text-[11px] font-bold text-indigo-700">الأجهزة الموثقة</div>
          <div className="text-2xl font-black text-indigo-700 mt-1">{stats.totalDevices}</div>
        </div>
      </div>

      {/* Main Content: Add Form + List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Add New Subscriber */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-extrabold text-slate-900">إضافة مشترك جديد</h3>
          </div>

          <form onSubmit={handleAddSubscriber} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم المشترك (ID) - العمود A
              </label>
              <input
                type="text"
                required
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="مثال: 1005"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم المشترك - العمود B
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: خالد المنصور"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الحالة - العمود C</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as 'مفعّل' | 'معطّل')}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="مفعّل">مفعّل</option>
                  <option value="معطّل">معطّل</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أقصى أجهزة - العمود D</label>
                <select
                  value={newMaxDevices}
                  onChange={(e) => setNewMaxDevices(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'جهاز' : 'أجهزة'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isAdding}
              className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>{isAdding ? 'جاري الحفظ...' : 'إضافة إلى ورقة ID registrants'}</span>
            </button>
          </form>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
            <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>آلية حماية الحساب والأجهزة:</span>
            </div>
            <p>• يربط النظام كل متصفح بمعرّف فريد تلقائياً عند دخول الطالب.</p>
            <p>• إذا استبدل الطالب جهازه ووصل للحد الأقصى، اضغط <strong>تصفير الأجهزة</strong> للسماح له بالدخول مجدداً.</p>
            <p>• يتم قبول الأرقام العربية والإنجليزية (١٠٠١ = 1001) تلقائياً.</p>
          </div>
        </div>

        {/* Right: Subscribers List */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4">
          {/* Search + Filter */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pb-3 border-b border-slate-100">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث برقم ID أو اسم المشترك أو المدينة..."
                className="w-full pr-9 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'all', label: 'الكل' },
                  { key: 'active', label: 'مفعّل' },
                  { key: 'disabled', label: 'معطّل' },
                  { key: 'has_devices', label: 'بأجهزة مسجلة' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                    statusFilter === tab.key
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {loading && registrants.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              <span>جاري تحميل قائمة المشتركين...</span>
            </div>
          ) : filteredRegistrants.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              لا توجد نتائج مطابقة لبحثك.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRegistrants.map((student) => {
                const disabled = isDisabledStatus(student.status);
                const maxDev = student.maxDevices || 2;
                const devices = student.devices || [];
                const isBusy = busyRowId === student.id;
                const isExpanded = expandedDevicesId === student.id;

                return (
                  <div
                    key={student.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      disabled
                        ? 'bg-rose-50/40 border-rose-200/80'
                        : 'bg-slate-50/60 border-slate-200/90 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Identity & Status */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="px-2.5 py-1.5 rounded-xl bg-slate-900 text-amber-300 font-mono font-bold text-xs shrink-0">
                          #{student.id}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900 truncate">
                              {student.name}
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleStatus(student)}
                              title="انقر لتبديل حالة التفعيل"
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition-all disabled:opacity-50 ${
                                disabled
                                  ? 'bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                              }`}
                            >
                              {disabled ? (
                                <>
                                  <Ban className="w-3 h-3" />
                                  <span>معطّل</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>مفعّل</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Devices summary */}
                          <div className="flex flex-wrap items-center gap-2.5 mt-1.5 text-[11px] text-slate-600">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDevicesId(isExpanded ? null : student.id)
                              }
                              className="inline-flex items-center gap-1 font-bold text-indigo-700 hover:underline cursor-pointer"
                            >
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>
                                الأجهزة: {devices.length} / {maxDev}
                              </span>
                            </button>

                            {devices.length > 0 && devices[devices.length - 1]?.location && (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <MapPin className="w-3 h-3 text-emerald-600" />
                                <span>{devices[devices.length - 1].location}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500">الحد:</span>
                          <select
                            disabled={isBusy}
                            value={maxDev}
                            onChange={(e) =>
                              handleChangeMaxDevices(student, Number(e.target.value))
                            }
                            className="text-xs font-extrabold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                          >
                            {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </div>

                        {confirmResetId === student.id ? (
                          <div className="flex items-center gap-1 bg-amber-100 px-2 py-1 rounded-xl border border-amber-300">
                            <button
                              type="button"
                              onClick={() => handleResetDevices(student)}
                              className="text-[11px] font-extrabold text-amber-900 px-1.5 cursor-pointer"
                            >
                              تأكيد التصفير
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmResetId(null)}
                              className="text-[11px] text-slate-600 px-1 cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmResetId(student.id)}
                            title="تصفير الأجهزة المسجلة للطالب"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>تصفير الأجهزة</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenQrModal(student)}
                          title="بطاقة QR ورابط الدخول المباشر"
                          className="p-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 transition-all cursor-pointer"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setEditingRow({
                              originalId: student.id,
                              id: student.id,
                              name: student.name,
                              status: disabled ? 'معطّل' : 'مفعّل',
                              maxDevices: maxDev,
                            })
                          }
                          title="تعديل البيانات"
                          className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {confirmDeleteId === student.id ? (
                          <div className="flex items-center gap-1 bg-rose-100 px-2 py-1 rounded-xl border border-rose-300">
                            <button
                              type="button"
                              onClick={() => handleDeleteSubscriber(student)}
                              className="text-[11px] font-extrabold text-rose-800 px-1.5 cursor-pointer"
                            >
                              حذف؟
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[11px] text-slate-600 px-1 cursor-pointer"
                            >
                              لا
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(student.id)}
                            title="حذف المشترك"
                            className="p-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Devices Detail */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
                        {devices.length === 0 ? (
                          <div className="text-[11px] text-slate-500">
                            لم يقم هذا الطالب بتسجيل الدخول من أي جهاز بعد.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {devices.map((dev, idx) => (
                              <div
                                key={dev.deviceId + '_' + idx}
                                className="p-2.5 rounded-xl bg-white border border-slate-200 text-[11px] space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-800 flex items-center gap-1">
                                    <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>جهاز #{idx + 1}</span>
                                  </span>
                                  <span className="font-mono text-[10px] text-slate-400">
                                    {dev.deviceId.slice(0, 14)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-slate-600">
                                  <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <span>{dev.location || 'غير متاح'}</span>
                                </div>
                                {dev.lastLogin && (
                                  <div className="flex items-center gap-1 text-slate-500 font-mono text-[10px]">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span>{dev.lastLogin}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Subscriber Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900">تعديل بيانات المشترك</h3>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditModal} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم المشترك (ID)</label>
                <input
                  type="text"
                  required
                  value={editingRow.id}
                  onChange={(e) => setEditingRow({ ...editingRow, id: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المشترك</label>
                <input
                  type="text"
                  required
                  value={editingRow.name}
                  onChange={(e) => setEditingRow({ ...editingRow, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحالة</label>
                  <select
                    value={editingRow.status}
                    onChange={(e) =>
                      setEditingRow({
                        ...editingRow,
                        status: e.target.value as 'مفعّل' | 'معطّل',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                  >
                    <option value="مفعّل">مفعّل</option>
                    <option value="معطّل">معطّل</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحد الأقصى للأجهزة</label>
                  <select
                    value={editingRow.maxDevices}
                    onChange={(e) =>
                      setEditingRow({
                        ...editingRow,
                        maxDevices: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold"
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>حفظ التغييرات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Card Modal */}
      {qrStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-extrabold text-slate-900">بطاقة دخول الطالب (QR)</h3>
              <button
                type="button"
                onClick={() => setQrStudent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-base font-black text-slate-900">{qrStudent.name}</div>
              <div className="text-xs font-mono font-bold text-indigo-700">ID: {qrStudent.id}</div>
            </div>

            {qrImageUrl && (
              <div className="flex justify-center">
                <img
                  src={qrImageUrl}
                  alt="Student QR"
                  className="w-52 h-52 rounded-2xl border border-slate-200 p-2 bg-white shadow-xs"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => handleCopyAutoLoginLink(qrStudent)}
              className="w-full py-2.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'تم نسخ رابط الدخول المباشر' : 'نسخ رابط الدخول المباشر'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
