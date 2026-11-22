import React, { useEffect, useRef, useState } from 'react';
import {
  User,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ShieldCheck,
  QrCode,
  Camera,
  MapPin,
  UserPlus,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { StudentRegistrant } from '../types';
import {
  verifyStudentLogin,
  ensureIDRegistrantsSheet,
  fetchIDRegistrants,
  getOrCreateDeviceId,
  getFastOptionalGeolocation,
  requestMandatoryGeolocation,
  normalizeDigits,
} from '../utils/googleSheets';

interface StudentLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (student: StudentRegistrant) => void;
  webhookUrl: string;
  isMandatory?: boolean;
  initialName?: string;
  initialId?: string;
  initialError?: string | null;
  t?: (id: string, fallback?: string) => string;
  onOpenRegistration?: () => void;
}

const QR_READER_ELEMENT_ID = 'faseeh-student-qr-reader';

function playQrSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  } catch {}
}

function parseScannedQrPayload(rawText: string): { name?: string; id?: string } {
  const trimmed = rawText.trim();
  if (!trimmed) return {};

  // 1. JSON payload
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);
      const name = String(obj.username ?? obj.name ?? obj.studentName ?? obj.student_name ?? obj.subscriber_name ?? '').trim();
      const id = normalizeDigits(String(obj.sheetNumber ?? obj.sheet_number ?? obj.id ?? obj.studentId ?? obj.student_id ?? obj.subscriber_id ?? ''));
      if (name || id) return { name: name || undefined, id: id || undefined };
    } catch {}
  }

  // 2. URL or query string payload
  if (trimmed.includes('?') || trimmed.includes('=')) {
    try {
      const queryPart = trimmed.includes('?') ? trimmed.split('?')[1] : trimmed;
      const params = new URLSearchParams(queryPart);
      const name = String(
        params.get('username') ||
          params.get('name') ||
          params.get('student') ||
          params.get('student_name') ||
          params.get('subscriber_name') ||
          ''
      ).trim();
      const id = normalizeDigits(
        String(
          params.get('sheet_number') ||
            params.get('sheetNumber') ||
            params.get('id') ||
            params.get('student_id') ||
            params.get('subscriber_id') ||
            ''
        )
      );
      if (name || id) return { name: name || undefined, id: id || undefined };
    } catch {}
  }

  // 3. Delimited pair: comma, semicolon, pipe, newline
  const parts = trimmed
    .split(/[\n,|;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const firstDigits = normalizeDigits(parts[0]);
    const secondDigits = normalizeDigits(parts[1]);
    const firstIsNum = /^\d+$/.test(firstDigits);
    const secondIsNum = /^\d+$/.test(secondDigits);
    if (firstIsNum && !secondIsNum) {
      return { id: firstDigits, name: parts[1] };
    }
    return { name: parts[0], id: secondDigits || parts[1] };
  }

  // 4. Single token (likely student ID or plain name)
  const normToken = normalizeDigits(trimmed);
  if (/^[a-zA-Z0-9_-]{2,}$/.test(normToken)) {
    return { id: normToken };
  }

  return { name: trimmed };
}

export const StudentLoginModal: React.FC<StudentLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  webhookUrl,
  isMandatory = false,
  initialName = '',
  initialId = '',
  initialError = null,
  t,
  onOpenRegistration,
}) => {
  const tr = (id: string, fallback: string) => (t ? t(id, fallback) : fallback);
  const [studentName, setStudentName] = useState(initialName);
  const [studentId, setStudentId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const qrInstanceRef = useRef<Html5Qrcode | null>(null);
  const scannerBusyRef = useRef(false);

  useEffect(() => {
    if (initialName) setStudentName(initialName);
  }, [initialName]);

  useEffect(() => {
    if (initialId) setStudentId(initialId);
  }, [initialId]);

  useEffect(() => {
    if (initialError) setErrorMsg(initialError);
  }, [initialError]);

  const stopScanner = async () => {
    const inst = qrInstanceRef.current;
    qrInstanceRef.current = null;
    if (inst) {
      try {
        if (inst.isScanning) {
          await inst.stop();
        }
      } catch {}
      try {
        inst.clear();
      } catch {}
    }
    scannerBusyRef.current = false;
    setIsQrScannerOpen(false);
    setScannerStarting(false);
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const performLoginVerification = async (enteredName: string, enteredId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      let cleanName = enteredName.trim();
      const cleanId = normalizeDigits(enteredId);

      // If QR only passed an ID, resolve the matching student name from ID registrants
      if (cleanId && !cleanName) {
        const registrants = await fetchIDRegistrants(webhookUrl);
        const found = registrants.find((r) => normalizeDigits(r.id) === cleanId);
        if (found) {
          cleanName = found.name;
          setStudentName(found.name);
        }
      }

      if (!cleanName) {
        setErrorMsg('يرجى إدخال اسم المشترك');
        return;
      }
      if (!cleanId) {
        setErrorMsg('يرجى إدخال رقم ID');
        return;
      }

      const deviceId = getOrCreateDeviceId();
      const geo = await getFastOptionalGeolocation(800);
      let result = await verifyStudentLogin(webhookUrl, cleanName, cleanId, {
        deviceId,
        lat: geo.lat,
        lng: geo.lng,
      });

      if (!result.success && result.errorCode === 'LOCATION_REQUIRED') {
        const mandatoryGeo = await requestMandatoryGeolocation(8000);
        if (mandatoryGeo.lat !== null && mandatoryGeo.lng !== null) {
          result = await verifyStudentLogin(webhookUrl, cleanName, cleanId, {
            deviceId,
            lat: mandatoryGeo.lat,
            lng: mandatoryGeo.lng,
          });
        }
      }

      if (result.success && result.student) {
        setSuccessMsg(`أهلاً بك يا ${result.student.name}! تم التحقق من ورقة ID registrants بنجاح.`);
        setTimeout(() => {
          onLoginSuccess(result.student!);
          onClose();
        }, 700);
      } else {
        setErrorMsg(result.error || 'عفواً، الاسم أو رقم ID غير مسجل في ورقة (ID registrants).');
      }
    } catch (err: any) {
      setErrorMsg('حدث خطأ أثناء الاتصال بالجدول: ' + (err.message || 'خطأ غير متوقع'));
    } finally {
      setLoading(false);
    }
  };

  const startQrScanner = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsQrScannerOpen(true);
    setScannerStarting(true);
    scannerBusyRef.current = false;

    window.setTimeout(async () => {
      const container = document.getElementById(QR_READER_ELEMENT_ID);
      if (!container) {
        setScannerStarting(false);
        return;
      }

      try {
        const scanner = new Html5Qrcode(QR_READER_ELEMENT_ID);
        qrInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decodedText) => {
            if (scannerBusyRef.current) return;
            scannerBusyRef.current = true;
            playQrSuccessChime();
            const parsed = parseScannedQrPayload(decodedText);
            if (parsed.name) setStudentName(parsed.name);
            if (parsed.id) setStudentId(parsed.id);
            await stopScanner();
            await performLoginVerification(parsed.name || '', parsed.id || '');
          },
          () => {}
        );
      } catch {
        setErrorMsg('تعذر تشغيل كاميرا الجوال لقراءة QR. تأكد من منح صلاحية الكاميرا.');
        await stopScanner();
      } finally {
        setScannerStarting(false);
      }
    }, 80);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLoginVerification(studentName, studentId);
  };

  const handleInitSheet = async () => {
    if (!webhookUrl) {
      setErrorMsg('يرجى التأكد من ربط Google Sheets في لوحة التحكم أولاً.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await ensureIDRegistrantsSheet(webhookUrl);
      if (res.success) {
        setSuccessMsg('تم إنشاء وتجهيز ورقة "ID registrants" بنجاح في Google Sheets!');
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg('خطأ أثناء تجهيز الورقة: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm font-cairo animate-in fade-in duration-200 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90dvh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#0c3868] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <User className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                {tr('login_modal_title', 'تسجيل دخول المشترك')}
              </h3>
              <p className="text-xs text-blue-100">
                {tr('login_modal_desc', 'التحقق عبر ورقة المشتركين (ID registrants)')}
              </p>
            </div>
          </div>

          {!isMandatory && (
            <button
              type="button"
              onClick={() => {
                stopScanner();
                onClose();
              }}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-start gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-bold">{successMsg}</span>
            </div>
          )}

          {/* QR Scanner Active Overlay / Box */}
          {isQrScannerOpen ? (
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3 border border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>{tr('login_qr_modal_title', 'قارئ بطاقة الطالب (QR)')}</span>
                </div>
                <button
                  type="button"
                  onClick={stopScanner}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold cursor-pointer"
                >
                  {tr('login_qr_cancel', 'إغلاق الكاميرا')}
                </button>
              </div>

              <div className="rounded-xl overflow-hidden bg-black min-h-[240px] flex items-center justify-center relative">
                {scannerStarting && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 z-10 text-xs font-bold text-slate-200">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span>جاري تشغيل الكاميرا...</span>
                  </div>
                )}
                <div id={QR_READER_ELEMENT_ID} className="w-full" />
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed text-center">
                {tr(
                  'login_qr_modal_hint',
                  'وجّه الكاميرا نحو رمز QR الخاص بالطالب وسيتم تعبئة الاسم والرقم والدخول تلقائياً.'
                )}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={startQrScanner}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
            >
              <Camera className="w-4 h-4 text-indigo-600" />
              <QrCode className="w-4 h-4 text-indigo-600" />
              <span>{tr('login_qr_scan_btn', 'مسح رمز QR بكاميرا الجوال')}</span>
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Field 1: اسم المشترك */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-4 h-4 text-emerald-600" />
                <span>{tr('login_name_label', 'اسم المشترك:')}</span>
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="أحمد علي"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all font-medium"
                required
              />
            </div>

            {/* Field 2: رقم ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span>{tr('login_id_label', 'رقم المشترك (ID) أو رقم الجوال:')}</span>
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="1001"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-mono font-bold"
                required
              />
            </div>

            {/* Info note */}
            <div className="p-2.5 bg-blue-50/80 border border-blue-100 rounded-xl text-[11px] text-blue-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                يتم مطابقة الاسم ورقم الـ ID تلقائياً مع ورقة <strong>ID registrants</strong> في ملف الشيت.
              </span>
            </div>

            {/* Submit Action Button */}
            <div className="pt-1 flex flex-col gap-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#0c3868] hover:bg-blue-900 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-blue-900/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق من ورقة المشتركين...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{tr('login_submit_btn', 'تسجيل ومتابعة التدريب')}</span>
                  </>
                )}
              </button>

              {onOpenRegistration && (
                <button
                  type="button"
                  onClick={() => {
                    stopScanner();
                    onClose();
                    onOpenRegistration();
                  }}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  <span>طالب جديد؟ افتح استمارة التسجيل والالتحاق</span>
                </button>
              )}

              {webhookUrl && (
                <button
                  type="button"
                  onClick={handleInitSheet}
                  disabled={loading}
                  className="text-[11px] text-slate-500 hover:text-indigo-600 text-center py-1 font-semibold transition-colors cursor-pointer"
                >
                  إنشاء/تأكيد ورقة ID registrants في الشيت
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

