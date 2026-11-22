import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  LogIn,
  Play,
  Maximize2,
  X,
  Mail,
  Phone,
  MapPin,
  Clock,
  ExternalLink,
  ArrowLeft,
  Sliders,
  BookOpen,
  Send,
  ShoppingBag,
  Menu,
} from 'lucide-react';
import { PortalContentItem, PortalPublicData, PortalSectionType } from '../types';
import { LanguageSelector } from './LanguageSelector';
import { SupportedLang } from '../utils/translations';
import { getDirectImageUrl } from '../utils/mediaUrl';
import { getPlayableVideoInfo } from '../video/videoSheets';
import { sanitizeExternalUrl } from '../utils/googleSheets';
import { buildTelegramBotStartLink } from '../utils/portalSheets';

interface PublicPortalViewProps {
  portalData: PortalPublicData;
  currentLang: SupportedLang;
  onSelectLang: (lang: SupportedLang) => void;
  onOpenRegistration: (programTitle?: string) => void;
  onOpenStudentLogin: () => void;
  onOpenAdminLogin: () => void;
  isAdminAuthenticated?: boolean;
  onReturnToAdmin?: () => void;
}

export const PublicPortalView: React.FC<PublicPortalViewProps> = ({
  portalData,
  currentLang,
  onSelectLang,
  onOpenRegistration,
  onOpenStudentLogin,
  onOpenAdminLogin,
  isAdminAuthenticated,
  onReturnToAdmin,
}) => {
  const dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  const { settings, items } = portalData;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<PortalContentItem | null>(null);
  const [activeVideoItem, setActiveVideoItem] = useState<PortalContentItem | null>(null);

  const itemsBySection = useMemo(() => {
    const grouped: Record<PortalSectionType, PortalContentItem[]> = {
      announcement: [],
      hero: [],
      about: [],
      programs: [],
      gallery: [],
      videos: [],
      contact: [],
      store_slot: [],
    };
    items
      .filter((it) => it.enabled !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
      .forEach((it) => {
        if (grouped[it.section]) {
          grouped[it.section].push(it);
        }
      });
    return grouped;
  }, [items]);

  const orderedSections = useMemo(
    () =>
      [...(settings.sections || [])]
        .filter((s) => s.enabled !== false)
        .filter((s) => (s.key === 'store_slot' ? settings.showStoreNavSlot : true))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [settings.sections, settings.showStoreNavSlot]
  );

  const navLinks = useMemo(() => {
    const mapLabels: Partial<Record<PortalSectionType, string>> = {
      about: currentLang === 'ar' ? 'عن المؤسسة' : 'About',
      programs: currentLang === 'ar' ? 'البرامج' : 'Programs',
      gallery: currentLang === 'ar' ? 'المعرض' : 'Gallery',
      videos: currentLang === 'ar' ? 'الفيديو' : 'Videos',
      contact: currentLang === 'ar' ? 'تواصل معنا' : 'Contact',
      store_slot: settings.storeSlotTitle || (currentLang === 'ar' ? 'المتجر' : 'Store'),
    };
    return orderedSections
      .filter((s) => s.key !== 'hero' && s.key !== 'announcement')
      .slice(0, 5)
      .map((s) => ({
        key: s.key,
        href: `#portal-${s.key}`,
        label: mapLabels[s.key] || s.label,
      }));
  }, [orderedSections, currentLang, settings.storeSlotTitle]);

  const telegramMainLink = buildTelegramBotStartLink(settings.telegramBotUsername);
  const heroResolvedImg = settings.heroMediaUrl ? getDirectImageUrl(settings.heroMediaUrl) : '';

  const renderSection = (key: PortalSectionType) => {
    if (key === 'hero') {
      return (
        <section
          key="hero"
          id="portal-hero"
          className="border-b border-slate-200/80 bg-white"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
              {/* Primary Editorial Copy Column */}
              <div className="lg:col-span-6 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="text-xs font-bold text-emerald-800 tracking-wide">
                    {settings.academyName}
                    {settings.academyTagline ? (
                      <>
                        <span className="mx-2 text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-slate-500 font-medium">
                          {currentLang === 'ar' ? 'التسجيل المباشر والصفحة الخاصة' : 'Direct Onboarding & Training'}
                        </span>
                      </>
                    ) : null}
                  </div>

                  <h1
                    className="font-amiri font-bold text-slate-900 leading-[1.28]"
                    style={{
                      fontSize: 'clamp(2rem, 3.6vw, 3.15rem)',
                      textWrap: 'balance',
                    }}
                  >
                    {settings.heroTitle}
                  </h1>

                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                    {settings.heroSubtitle}
                  </p>
                </div>

                {/* Single Primary CTA + Calm Login Action */}
                <div className="space-y-4 pt-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenRegistration()}
                      className="px-6 py-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-extrabold inline-flex items-center gap-2.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap min-h-[46px]"
                    >
                      <UserPlus className="w-4 h-4 text-amber-300" />
                      <span>
                        {currentLang === 'ar'
                          ? 'سجّل الآن وابدأ المرحلة التمهيدية'
                          : 'Register & Start Introductory Stage'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenStudentLogin}
                      className="px-5 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap min-h-[46px]"
                    >
                      <LogIn className="w-4 h-4 text-emerald-800" />
                      <span>
                        {currentLang === 'ar' ? 'دخول المشتركين' : 'Subscriber Sign In'}
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium pt-1">
                    <span>٠١ · تعبئة الاستمارة واستلام رقم ID فوراً</span>
                    <span aria-hidden="true">·</span>
                    <span>٠٢ · دخول مباشر للقسم التمهيدي</span>
                    <span aria-hidden="true">·</span>
                    <span>٠٣ · ترقية من الإدارة لمسارك المخصص</span>
                  </div>
                </div>
              </div>

              {/* Hero Editorial Media Frame */}
              <div className="lg:col-span-6">
                <div className="relative h-64 sm:h-80 lg:h-full min-h-[300px] rounded-2xl overflow-hidden border border-slate-200 bg-emerald-950">
                  {heroResolvedImg ? (
                    <img
                      src={heroResolvedImg}
                      alt={settings.academyName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-white flex items-end justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-amber-200 font-bold">
                        {settings.academyName}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-100/95 leading-snug max-w-md">
                        {settings.academyTagline}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (key === 'about') {
      const list = itemsBySection.about;
      if (list.length === 0) return null;
      return (
        <section
          key="about"
          id="portal-about"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                {currentLang === 'ar' ? 'عن المؤسسة ومنهجية التدريب' : 'About Our Academy & Methodology'}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {currentLang === 'ar'
                  ? 'مسار مترابط يجمع بين التعريف الأكاديمي والتأهيل التمهيدي ثم التدريب المتخصص'
                  : 'Structured educational path combining introductory onboarding and guided training'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {list.map((it, idx) => {
              const imgUrl = it.mediaUrl ? getDirectImageUrl(it.mediaUrl) : '';
              return (
                <article
                  key={it.id}
                  className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden flex flex-col justify-between"
                >
                  {imgUrl && (
                    <div className="h-44 w-full bg-slate-100 overflow-hidden border-b border-slate-200/80">
                      <img
                        src={imgUrl}
                        alt={it.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="p-5 sm:p-6 space-y-2.5 flex-1 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-emerald-800">
                        {it.badgeText || `${String(idx + 1).padStart(2, '0')}.`}
                      </div>
                      <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                        {it.title}
                      </h3>
                      {it.subtitle && (
                        <div className="text-xs font-semibold text-slate-500">{it.subtitle}</div>
                      )}
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                        {it.description}
                      </p>
                    </div>

                    {(it.metaPrimary || it.metaSecondary) && (
                      <div className="pt-4 mt-2 border-t border-slate-100 text-xs text-slate-500 font-medium flex flex-wrap items-center gap-2">
                        {it.metaPrimary && <span>{it.metaPrimary}</span>}
                        {it.metaPrimary && it.metaSecondary && (
                          <span aria-hidden="true">·</span>
                        )}
                        {it.metaSecondary && <span>{it.metaSecondary}</span>}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      );
    }

    if (key === 'programs') {
      const list = itemsBySection.programs;
      if (list.length === 0) return null;
      return (
        <section
          key="programs"
          id="portal-programs"
          className="border-y border-slate-200/80 bg-white"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                  {currentLang === 'ar' ? 'البرامج والمسارات التدريبية' : 'Training Programs & Tracks'}
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  {currentLang === 'ar'
                    ? 'سجّل للدخول مباشرة إلى المسار التمهيدي ثم يوجّهك المشرف للبرنامج المناسب لمستواك'
                    : 'Register for instant Phase 1 onboarding before instructor track assignment'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenRegistration()}
                className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto whitespace-nowrap"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{currentLang === 'ar' ? 'التسجيل الآن' : 'Register Now'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {list.map((prog, idx) => {
                const isFirstStage = idx === 0;
                return (
                  <div
                    key={prog.id}
                    className={`rounded-2xl p-6 flex flex-col justify-between border transition-colors ${
                      isFirstStage
                        ? 'bg-emerald-950 text-white border-emerald-900'
                        : 'bg-slate-50/70 text-slate-900 border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      <div
                        className={`text-xs font-bold ${
                          isFirstStage ? 'text-amber-300' : 'text-emerald-800'
                        }`}
                      >
                        {prog.badgeText || (isFirstStage ? 'المرحلة ١' : 'المرحلة ٢')}
                      </div>

                      <h3 className="text-lg font-extrabold leading-snug">{prog.title}</h3>

                      {prog.subtitle && (
                        <div
                          className={`text-xs font-semibold ${
                            isFirstStage ? 'text-emerald-100/80' : 'text-slate-500'
                          }`}
                        >
                          {prog.subtitle}
                        </div>
                      )}

                      <p
                        className={`text-xs sm:text-sm leading-relaxed ${
                          isFirstStage ? 'text-emerald-50/90' : 'text-slate-600'
                        }`}
                      >
                        {prog.description}
                      </p>
                    </div>

                    <div className="pt-5 mt-5 border-t border-current/10 space-y-3">
                      {(prog.metaPrimary || prog.metaSecondary) && (
                        <div
                          className={`text-xs font-medium flex items-center gap-2 ${
                            isFirstStage ? 'text-emerald-100/75' : 'text-slate-500'
                          }`}
                        >
                          {prog.metaPrimary && <span>{prog.metaPrimary}</span>}
                          {prog.metaPrimary && prog.metaSecondary && (
                            <span aria-hidden="true">·</span>
                          )}
                          {prog.metaSecondary && <span>{prog.metaSecondary}</span>}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenRegistration(prog.title)}
                        className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[42px] ${
                          isFirstStage
                            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                            : 'bg-white hover:bg-emerald-50 text-emerald-900 border border-slate-300'
                        }`}
                      >
                        <span>{prog.linkLabel || 'سجّل في هذا المسار'}</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    if (key === 'gallery') {
      const list = itemsBySection.gallery;
      if (list.length === 0) return null;
      return (
        <section
          key="gallery"
          id="portal-gallery"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16"
        >
          <div className="mb-8 pb-4 border-b border-slate-200">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
              {currentLang === 'ar' ? 'معرض الأعمال والصور' : 'Showcase Gallery'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {currentLang === 'ar'
                ? 'نماذج خطية مختارة ولقطات من مسيرة التعليم والتدريب'
                : 'Selected calligraphy works and learning studio scenes'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {list.map((item) => {
              const imgUrl = item.mediaUrl ? getDirectImageUrl(item.mediaUrl) : '';
              return (
                <div
                  key={item.id}
                  onClick={() => setLightboxItem(item)}
                  className="group bg-white rounded-2xl border border-slate-200 overflow-hidden cursor-pointer flex flex-col"
                >
                  <div className="relative h-56 bg-slate-100 overflow-hidden">
                    {imgUrl && (
                      <img
                        src={imgUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    <div className="absolute bottom-3 left-3 w-8 h-8 rounded-lg bg-slate-950/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="p-4 space-y-1">
                    {item.badgeText && (
                      <div className="text-[11px] font-bold text-emerald-800">{item.badgeText}</div>
                    )}
                    <h3 className="text-sm font-extrabold text-slate-900">{item.title}</h3>
                    {item.description && (
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (key === 'videos') {
      const list = itemsBySection.videos;
      if (list.length === 0) return null;
      return (
        <section
          key="videos"
          id="portal-videos"
          className="border-t border-slate-200/80 bg-white"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <div className="mb-8 pb-4 border-b border-slate-200">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                {currentLang === 'ar' ? 'مكتبة الفيديو التعريفية' : 'Introductory Video Library'}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {currentLang === 'ar'
                  ? 'شروح مرئية موجزة توضح المنهج وطريقة التدريب على المنصة'
                  : 'Short visual walkthroughs explaining the curriculum and training flow'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {list.map((vid) => {
                const safeVidLink = sanitizeExternalUrl(vid.mediaUrl || vid.linkUrl);
                return (
                  <div
                    key={vid.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      {vid.badgeText && (
                        <div className="text-xs font-bold text-emerald-800">{vid.badgeText}</div>
                      )}
                      <h3 className="text-base font-extrabold text-slate-900">{vid.title}</h3>
                      {vid.description && (
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                          {vid.description}
                        </p>
                      )}
                    </div>

                    {safeVidLink && (
                      <button
                        type="button"
                        onClick={() => setActiveVideoItem(vid)}
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[42px]"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>{vid.linkLabel || 'مشاهدة الفيديو'}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
    }

    if (key === 'store_slot') {
      if (!settings.showStoreNavSlot) return null;
      return (
        <section
          key="store_slot"
          id="portal-store_slot"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-12"
        >
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">
              {settings.storeSlotTitle || 'المتجر'}
            </h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              {settings.storeSlotNote}
            </p>
          </div>
        </section>
      );
    }

    if (key === 'contact') {
      const safeWhatsapp = sanitizeExternalUrl(settings.whatsappUrl);
      const safeTelegram = sanitizeExternalUrl(telegramMainLink);
      return (
        <section
          key="contact"
          id="portal-contact"
          className="border-t border-slate-200/80 bg-slate-50"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 space-y-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                  {currentLang === 'ar' ? 'تواصل معنا والانضمام' : 'Contact & Enrollment'}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {currentLang === 'ar'
                    ? 'للاستفسارات عن البرامج أو متابعة حالة تسجيلك، يسعدنا تواصلك عبر القنوات الرسمية أو المبادرة بالتسجيل الفوري.'
                    : 'Reach out via our official channels or start your instant application right away.'}
                </p>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => onOpenRegistration()}
                    className="px-5 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer min-h-[42px]"
                  >
                    <UserPlus className="w-4 h-4 text-amber-300" />
                    <span>{currentLang === 'ar' ? 'فتح استمارة التسجيل' : 'Open Registration'}</span>
                  </button>

                  {safeTelegram && (
                    <a
                      href={safeTelegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-xl bg-white hover:bg-sky-50 text-sky-800 border border-slate-300 text-xs font-extrabold inline-flex items-center gap-2 min-h-[42px]"
                    >
                      <Send className="w-4 h-4" />
                      <span>تيليغرام</span>
                      <ExternalLink className="w-3 h-3 opacity-75" />
                    </a>
                  )}

                  {safeWhatsapp && (
                    <a
                      href={safeWhatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-slate-300 text-xs font-extrabold inline-flex items-center gap-2 min-h-[42px]"
                    >
                      <span>واتساب</span>
                      <ExternalLink className="w-3 h-3 opacity-75" />
                    </a>
                  )}
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <Phone className="w-4 h-4" />
                    <span>الهاتف</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dir-ltr text-right tabular-nums">
                    {settings.contactPhone || '—'}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <Mail className="w-4 h-4" />
                    <span>البريد الإلكتروني</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 break-all">
                    {settings.contactEmail || '—'}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <MapPin className="w-4 h-4" />
                    <span>المقر</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    {settings.contactAddress || '—'}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <Clock className="w-4 h-4" />
                    <span>ساعات العمل</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    {settings.contactHours || '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] text-slate-800 font-cairo flex flex-col" dir={dir}>
      {/* Optional Top Announcement Ribbon (non-sticky so mobile chrome stays lightweight) */}
      {settings.announcementEnabled && settings.announcementText && (
        <div className="bg-emerald-950 text-emerald-50 text-xs font-semibold py-2 px-4 text-center">
          <span>{settings.announcementText}</span>
        </div>
      )}

      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark (single line, no clutter) */}
          <a
            href="#portal-hero"
            className="flex items-center gap-2.5 text-base sm:text-lg font-extrabold text-slate-900 whitespace-nowrap shrink-0"
          >
            {settings.logoUrl ? (
              <img
                src={getDirectImageUrl(settings.logoUrl)}
                alt={settings.academyName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <span className="truncate max-w-[190px] sm:max-w-none">{settings.academyName}</span>
          </a>

          {/* Zone 2: Clean Single-Line Text Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-600">
            {navLinks.map((lnk) => (
              <a
                key={lnk.key}
                href={lnk.href}
                className="hover:text-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                {lnk.label}
              </a>
            ))}
          </nav>

          {/* Zone 3: Primary Action + Language / Login */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <LanguageSelector currentLang={currentLang} onSelectLang={onSelectLang} />
            </div>

            <button
              type="button"
              onClick={onOpenStudentLogin}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            >
              {currentLang === 'ar' ? 'دخول المشتركين' : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={() => onOpenRegistration()}
              className="hidden sm:inline-flex px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-800 hover:bg-emerald-900 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 items-center gap-1.5 min-h-[40px]"
            >
              <span>{currentLang === 'ar' ? 'سجّل الآن' : 'Register'}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="القائمة"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              {navLinks.map((lnk) => (
                <a
                  key={lnk.key}
                  href={lnk.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-bold text-slate-700 hover:text-emerald-800 py-1 px-2"
                >
                  {lnk.label}
                </a>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <LanguageSelector currentLang={currentLang} onSelectLang={onSelectLang} />
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenRegistration();
                }}
                className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
              >
                {currentLang === 'ar' ? 'سجّل الآن' : 'Register Now'}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {orderedSections.map((sec) => renderSection(sec.key))}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="font-bold text-slate-700">
            {settings.academyName}
            <span className="mx-2 text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="font-normal text-slate-500">
              جميع الحقوق محفوظة © {new Date().getFullYear()}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenStudentLogin}
              className="hover:text-emerald-800 font-semibold cursor-pointer"
            >
              بوابة المشتركين
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={
                isAdminAuthenticated && onReturnToAdmin ? onReturnToAdmin : onOpenAdminLogin
              }
              className="inline-flex items-center gap-1.5 hover:text-slate-900 font-semibold cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isAdminAuthenticated ? 'لوحة الإدارة' : 'دخول الإدارة'}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Gallery Lightbox Modal */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="font-extrabold text-sm text-slate-900">{lightboxItem.title}</div>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {lightboxItem.mediaUrl && (
              <div className="bg-slate-950 flex items-center justify-center max-h-[65dvh]">
                <img
                  src={getDirectImageUrl(lightboxItem.mediaUrl)}
                  alt={lightboxItem.title}
                  referrerPolicy="no-referrer"
                  className="max-h-[65dvh] w-auto object-contain"
                />
              </div>
            )}
            {lightboxItem.description && (
              <div className="p-5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                {lightboxItem.description}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Player Modal */}
      {activeVideoItem && (
        <div
          className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveVideoItem(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="font-extrabold text-sm text-slate-900">{activeVideoItem.title}</div>
              <button
                type="button"
                onClick={() => setActiveVideoItem(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-black aspect-video w-full">
              {(() => {
                const rawUrl = activeVideoItem.mediaUrl || activeVideoItem.linkUrl || '';
                const info = getPlayableVideoInfo(rawUrl);
                if ((info.kind === 'youtube' || info.kind === 'drive_embed') && info.embedUrl) {
                  return (
                    <iframe
                      src={info.embedUrl}
                      className="w-full h-full border-0"
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                      title={activeVideoItem.title}
                    />
                  );
                }
                if (info.kind === 'html5' && info.src) {
                  return (
                    <video
                      src={info.src}
                      controls
                      autoPlay
                      className="w-full h-full object-contain"
                    />
                  );
                }
                return (
                  <div className="w-full h-full flex flex-col items-center justify-center text-white p-6 gap-3 text-center">
                    <p className="text-xs text-slate-300">يمكن فتح هذا الفيديو في نافذة خارجية:</p>
                    <a
                      href={sanitizeExternalUrl(rawUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <span>فتح رابط الفيديو</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
