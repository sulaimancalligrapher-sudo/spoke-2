import React, { useEffect } from 'react';
import { X, UserPlus, LogIn, Sparkles, ArrowLeft } from 'lucide-react';
import { PortalSettingsConfig } from '../types';
import { getPortalUiText, getLocalizedPortalSetting } from '../utils/portalSheets';
import { SupportedLang } from '../utils/translations';
import { getDirectImageUrl } from '../utils/mediaUrl';

interface UnifiedAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  portalSettings: PortalSettingsConfig;
  currentLang: SupportedLang;
  onSelectRegister: () => void;
  onSelectLogin: () => void;
}

export const UnifiedAccessModal: React.FC<UnifiedAccessModalProps> = ({
  isOpen,
  onClose,
  portalSettings,
  currentLang,
  onSelectRegister,
  onSelectLogin,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isRtl = currentLang === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const academyName = getLocalizedPortalSetting(portalSettings, 'academyName', currentLang);
  const logoSrc = portalSettings.logoUrl ? getDirectImageUrl(portalSettings.logoUrl) : '';

  const title = getPortalUiText(portalSettings, 'unified_auth_title', currentLang);
  const subtitle = getPortalUiText(portalSettings, 'unified_auth_subtitle', currentLang);
  const registerBtnText = getPortalUiText(portalSettings, 'unified_auth_register_btn', currentLang);
  const loginBtnText = getPortalUiText(portalSettings, 'unified_auth_login_btn', currentLang);

  const registerHint =
    currentLang === 'en'
      ? 'Start immediately with Phase 1 introductory access & get your ID'
      : currentLang === 'th'
      ? 'รับรหัสผู้เรียนทันทีและเริ่มต้นในส่วนแนะนำเบื้องต้น'
      : 'أنشئ رقم التسجيل الخاص بك فوراً وادخل للقسم التمهيدي';

  const loginHint =
    currentLang === 'en'
      ? 'Sign in with your Name & Student ID to enter your workspace'
      : currentLang === 'th'
      ? 'เข้าสู่ระบบด้วยชื่อและรหัสผู้เรียนของคุณ'
      : 'سجّل الدخول بالاسم ورقم التسجيل (ID) لمتابعة دروسك';

  return (
    <div
      className="fixed inset-0 z-[94] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm font-cairo"
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unified-access-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Header */}
        <div className="bg-emerald-950 text-white px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={academyName}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-2xl object-contain bg-white p-1 border border-white/20 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-emerald-300 truncate">{academyName}</div>
              <h3 id="unified-access-title" className="text-lg font-extrabold text-white truncate">
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl text-white/75 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-600 leading-relaxed">{subtitle}</p>

          <div className="grid grid-cols-1 gap-3.5">
            {/* Option 1: New Registration */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectRegister();
              }}
              className="group w-full p-4 sm:p-5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-start flex items-center justify-between gap-4 shadow-md shadow-emerald-900/15 transition-all cursor-pointer active:scale-[0.99] min-h-[76px]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                  <UserPlus className="w-6 h-6 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-extrabold text-white">{registerBtnText}</div>
                  <div className="text-xs text-emerald-100/85 mt-0.5 leading-snug">{registerHint}</div>
                </div>
              </div>
              <ArrowLeft
                className={`w-5 h-5 text-emerald-200 shrink-0 transition-transform ${
                  isRtl ? 'group-hover:-translate-x-1' : 'rotate-180 group-hover:translate-x-1'
                }`}
              />
            </button>

            {/* Option 2: Existing Subscriber Sign In */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectLogin();
              }}
              className="group w-full p-4 sm:p-5 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 text-start flex items-center justify-between gap-4 transition-all cursor-pointer active:scale-[0.99] min-h-[76px]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                  <LogIn className="w-6 h-6 text-emerald-700" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-extrabold text-slate-900">{loginBtnText}</div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-snug">{loginHint}</div>
                </div>
              </div>
              <ArrowLeft
                className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${
                  isRtl ? 'group-hover:-translate-x-1' : 'rotate-180 group-hover:translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
