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
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Send,
  ShoppingBag,
  Menu,
  Globe,
} from 'lucide-react';
import {
  PortalContentItem,
  PortalPublicData,
  PortalSectionType,
  PortalSocialChannel,
  PortalSocialIconKey,
} from '../types';
import { LanguageSelector } from './LanguageSelector';
import { SupportedLang } from '../utils/translations';
import { getDirectImageUrl } from '../utils/mediaUrl';
import { getPlayableVideoInfo } from '../video/videoSheets';
import { sanitizeExternalUrl } from '../utils/googleSheets';
import {
  buildTelegramBotStartLink,
  getAutoVideoThumbnail,
  getGallerySlideUrls,
  getLocalizedItemField,
  getLocalizedPortalSetting,
  getPortalUiText,
  isPortalUiButtonVisible,
} from '../utils/portalSheets';

interface PublicPortalViewProps {
  portalData: PortalPublicData;
  currentLang: SupportedLang;
  onSelectLang: (lang: SupportedLang) => void;
  onOpenRegistration: (programTitle?: string) => void;
  onOpenProgramRequest: (programItem: PortalContentItem) => void;
  onOpenStudentLogin: () => void;
  onOpenStore?: () => void;
  highlightedProgramSlug?: string;
}

const BrandSocialSvg: React.FC<{ iconKey: PortalSocialIconKey; iconUrl?: string; label: string }> = ({
  iconKey,
  iconUrl,
  label,
}) => {
  if (iconKey === 'custom' && iconUrl) {
    const safeIcon = sanitizeExternalUrl(iconUrl);
    if (safeIcon) {
      return (
        <img
          src={safeIcon}
          alt={label}
          referrerPolicy="no-referrer"
          className="w-4 h-4 rounded-sm object-contain shrink-0"
        />
      );
    }
  }

  switch (iconKey) {
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
          <path d="M13.5 9H16V6h-2.5C11.57 6 10 7.57 10 9.5V11H8v3h2v7h3v-7h2.3l.7-3H13v-1.5c0-.28.22-.5.5-.5z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-[1.9] shrink-0" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" className="fill-current stroke-none" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
          <path d="M21.58 7.19a2.75 2.75 0 0 0-1.94-1.94C17.93 4.75 12 4.75 12 4.75s-5.93 0-7.64.5a2.75 2.75 0 0 0-1.94 1.94C2 8.9 2 12 2 12s0 3.1.42 4.81a2.75 2.75 0 0 0 1.94 1.94c1.71.5 7.64.5 7.64.5s5.93 0 7.64-.5a2.75 2.75 0 0 0 1.94-1.94C22 15.1 22 12 22 12s0-3.1-.42-4.81zM10 15.25v-6.5L15.5 12 10 15.25z" />
        </svg>
      );
    case 'line':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
          <path d="M12 3C6.48 3 2 6.58 2 11c0 3.92 3.53 7.21 8.31 7.87.32.07.76.22.87.5.1.26.07.66.03.92l-.14.84c-.04.26-.2 1.01.88.55 1.09-.46 5.87-3.46 8.01-5.92C21.37 14.2 22 12.66 22 11c0-4.42-4.48-8-10-8zm-4.2 9.8H5.9a.55.55 0 0 1-.55-.55V8.9a.55.55 0 0 1 1.1 0v2.8h1.35a.55.55 0 0 1 0 1.1zm2.05-.55a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 1.1 0v3.35zm4.55 0a.55.55 0 0 1-.99.33l-1.7-2.32v1.99a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 .99-.33l1.7 2.32V8.9a.55.55 0 0 1 1.1 0v3.35zm3.45-2.25a.55.55 0 0 1 0 1.1H16.5v.6h1.35a.55.55 0 0 1 0 1.1h-1.9a.55.55 0 0 1-.55-.55V8.9a.55.55 0 0 1 .55-.55h1.9a.55.55 0 0 1 0 1.1H16.5v.55h1.35z" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.66 15l-1.3 4.75 4.86-1.27A10 10 0 1 0 12 2zm5.67 14.1c-.24.67-1.4 1.29-1.94 1.37-.5.07-1.14.1-1.84-.12-.43-.14-.98-.32-1.69-.63-2.97-1.28-4.91-4.27-5.06-4.47-.15-.2-1.21-1.61-1.21-3.07s.77-2.18 1.04-2.48c.27-.3.59-.37.79-.37h.57c.18 0 .43-.07.67.51.24.59.82 2.02.9 2.17.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.17-.31.38-.45.51-.15.15-.3.31-.13.61.18.3.78 1.28 1.67 2.08 1.15 1.02 2.11 1.34 2.41 1.49.3.15.47.12.64-.07.18-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.74.82 2.04.97.3.15.5.22.57.34.08.13.08.73-.16 1.4z" />
        </svg>
      );
    case 'telegram':
      return <Send className="w-4 h-4 shrink-0" />;
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
          <path d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6a2.6 2.6 0 0 1 2.6-2.6c.27 0 .52.04.76.11V9.66a5.7 5.7 0 0 0-.76-.05A5.7 5.7 0 0 0 4.16 15.3a5.7 5.7 0 0 0 5.7 5.7 5.7 5.7 0 0 0 5.68-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" aria-hidden="true">
          <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.96 6.82H1.69l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />
        </svg>
      );
    default:
      return <Globe className="w-4 h-4 shrink-0" />;
  }
};

function getSocialButtonStyle(iconKey: PortalSocialIconKey): string {
  switch (iconKey) {
    case 'facebook':
      return 'bg-white hover:bg-blue-50 text-blue-700 border-slate-200 hover:border-blue-300';
    case 'instagram':
      return 'bg-white hover:bg-pink-50 text-pink-700 border-slate-200 hover:border-pink-300';
    case 'youtube':
      return 'bg-white hover:bg-rose-50 text-rose-700 border-slate-200 hover:border-rose-300';
    case 'line':
      return 'bg-white hover:bg-emerald-50 text-emerald-700 border-slate-200 hover:border-emerald-300';
    case 'whatsapp':
      return 'bg-white hover:bg-green-50 text-green-700 border-slate-200 hover:border-green-300';
    case 'telegram':
      return 'bg-white hover:bg-sky-50 text-sky-700 border-slate-200 hover:border-sky-300';
    case 'tiktok':
    case 'x':
      return 'bg-white hover:bg-slate-100 text-slate-900 border-slate-200 hover:border-slate-400';
    default:
      return 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200';
  }
}

export const PublicPortalView: React.FC<PublicPortalViewProps> = ({
  portalData,
  currentLang,
  onSelectLang,
  onOpenRegistration,
  onOpenProgramRequest,
  onOpenStudentLogin,
  onOpenStore,
  highlightedProgramSlug,
}) => {
  const dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  const { settings, items } = portalData;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lightboxState, setLightboxState] = useState<{
    item: PortalContentItem;
    slideIdx: number;
  } | null>(null);
  const [activeVideoItem, setActiveVideoItem] = useState<PortalContentItem | null>(null);
  const [gallerySlideMap, setGallerySlideMap] = useState<Record<string, number>>({});

  const academyName = getLocalizedPortalSetting(settings, 'academyName', currentLang);
  const academyTagline = getLocalizedPortalSetting(settings, 'academyTagline', currentLang);
  const heroTitle = getLocalizedPortalSetting(settings, 'heroTitle', currentLang);
  const heroSubtitle = getLocalizedPortalSetting(settings, 'heroSubtitle', currentLang);
  const announcementText = getLocalizedPortalSetting(settings, 'announcementText', currentLang);
  const storeSlotTitle = getLocalizedPortalSetting(settings, 'storeSlotTitle', currentLang);
  const storeSlotNote = getLocalizedPortalSetting(settings, 'storeSlotNote', currentLang);

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

  const activeSocialChannels = useMemo<PortalSocialChannel[]>(() => {
    return (settings.socialChannels || [])
      .filter((ch) => ch.enabled !== false && Boolean(sanitizeExternalUrl(ch.url)))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [settings.socialChannels]);

  const navLinks = useMemo(() => {
    const defaultEn: Partial<Record<PortalSectionType, string>> = {
      about: 'About',
      programs: 'Programs',
      gallery: 'Gallery',
      videos: 'Videos',
      contact: 'Contact',
      store_slot: storeSlotTitle || 'Store',
    };
    const defaultTh: Partial<Record<PortalSectionType, string>> = {
      about: 'เกี่ยวกับสถาบัน',
      programs: 'หลักสูตร',
      gallery: 'แกลเลอรี',
      videos: 'วิดีโอ',
      contact: 'ติดต่อเรา',
      store_slot: storeSlotTitle || 'ร้านค้า',
    };
    const defaultAr: Partial<Record<PortalSectionType, string>> = {
      about: 'عن المؤسسة',
      programs: 'البرامج',
      gallery: 'المعرض',
      videos: 'الفيديو',
      contact: 'تواصل معنا',
      store_slot: storeSlotTitle || 'المتجر',
    };

    return orderedSections
      .filter((s) => s.key !== 'hero' && s.key !== 'announcement')
      .slice(0, 6)
      .map((s) => {
        const label =
          currentLang === 'en'
            ? s.labelEn || defaultEn[s.key] || s.label
            : currentLang === 'th'
            ? s.labelTh || s.labelEn || defaultTh[s.key] || s.label
            : defaultAr[s.key] || s.label;
        return {
          key: s.key,
          href: `#portal-${s.key}`,
          label,
        };
      });
  }, [orderedSections, currentLang, storeSlotTitle]);

  const telegramMainLink = buildTelegramBotStartLink(settings.telegramBotUsername);
  const heroResolvedImg = settings.heroMediaUrl ? getDirectImageUrl(settings.heroMediaUrl) : '';

  const triggerItemAction = (item: PortalContentItem) => {
    const resolvedTitle = getLocalizedItemField(item, 'title', currentLang);
    const act =
      item.actionType ||
      (item.section === 'programs'
        ? item.id.includes('1')
          ? 'open_register'
          : 'open_program_request'
        : 'none');

    if (act === 'open_register') {
      onOpenRegistration(resolvedTitle);
      return;
    }
    if (act === 'open_program_request') {
      onOpenProgramRequest(item);
      return;
    }
    if (act === 'scroll_section') {
      const target = (item.linkUrl || '#portal-programs').replace(/^#/, '');
      const el = document.getElementById(target);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (act === 'external_url' && item.linkUrl) {
      const safe = sanitizeExternalUrl(item.linkUrl);
      if (safe) {
        window.open(safe, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const renderSection = (key: PortalSectionType) => {
    if (key === 'hero') {
      const showHeroRegisterBtn = isPortalUiButtonVisible(settings, 'hero_register_btn');
      const showHeroLoginBtn = isPortalUiButtonVisible(settings, 'hero_login_btn');
      const badgeSuffix = getPortalUiText(settings, 'hero_badge_suffix', currentLang);
      const step1 = getPortalUiText(settings, 'hero_step_1', currentLang);
      const step2 = getPortalUiText(settings, 'hero_step_2', currentLang);
      const step3 = getPortalUiText(settings, 'hero_step_3', currentLang);
      const showSteps =
        (isPortalUiButtonVisible(settings, 'hero_step_1') && step1) ||
        (isPortalUiButtonVisible(settings, 'hero_step_2') && step2) ||
        (isPortalUiButtonVisible(settings, 'hero_step_3') && step3);

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
                    {academyName}
                    {badgeSuffix && isPortalUiButtonVisible(settings, 'hero_badge_suffix') ? (
                      <>
                        <span className="mx-2 text-slate-400" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-slate-500 font-medium">{badgeSuffix}</span>
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
                    {heroTitle}
                  </h1>

                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                    {heroSubtitle}
                  </p>
                </div>

                {/* Single Primary CTA + Calm Login Action */}
                <div className="space-y-4 pt-2">
                  {(showHeroRegisterBtn || showHeroLoginBtn) && (
                    <div className="flex flex-wrap items-center gap-3">
                      {showHeroRegisterBtn && (
                        <button
                          type="button"
                          onClick={() => onOpenRegistration()}
                          className="px-6 py-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-extrabold inline-flex items-center gap-2.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap min-h-[46px]"
                        >
                          <UserPlus className="w-4 h-4 text-amber-300" />
                          <span>{getPortalUiText(settings, 'hero_register_btn', currentLang)}</span>
                        </button>
                      )}

                      {showHeroLoginBtn && (
                        <button
                          type="button"
                          onClick={onOpenStudentLogin}
                          className="px-5 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap min-h-[46px]"
                        >
                          <LogIn className="w-4 h-4 text-emerald-800" />
                          <span>{getPortalUiText(settings, 'hero_login_btn', currentLang)}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {showSteps && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium pt-1">
                      {isPortalUiButtonVisible(settings, 'hero_step_1') && step1 && (
                        <span>{step1}</span>
                      )}
                      {isPortalUiButtonVisible(settings, 'hero_step_2') && step2 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{step2}</span>
                        </>
                      )}
                      {isPortalUiButtonVisible(settings, 'hero_step_3') && step3 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{step3}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Hero Editorial Media Frame */}
              <div className="lg:col-span-6">
                <div className="relative h-64 sm:h-80 lg:h-full min-h-[300px] rounded-2xl overflow-hidden border border-slate-200 bg-emerald-950">
                  {heroResolvedImg ? (
                    <img
                      src={heroResolvedImg}
                      alt={academyName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  {settings.showHeroOverlay !== false && (academyName || academyTagline) && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent pointer-events-none" />
                      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-white flex items-end justify-between gap-4">
                        <div className="space-y-1">
                          {academyName && (
                            <div className="text-xs text-amber-200 font-bold">{academyName}</div>
                          )}
                          {academyTagline && (
                            <p className="text-xs sm:text-sm text-slate-100/95 leading-snug max-w-md">
                              {academyTagline}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
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
                {getPortalUiText(settings, 'about_heading', currentLang)}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {getPortalUiText(settings, 'about_subheading', currentLang)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {list.map((it, idx) => {
              const imgUrl = it.mediaUrl ? getDirectImageUrl(it.mediaUrl) : '';
              const title = getLocalizedItemField(it, 'title', currentLang);
              const subtitle = getLocalizedItemField(it, 'subtitle', currentLang);
              const description = getLocalizedItemField(it, 'description', currentLang);
              const badgeText = getLocalizedItemField(it, 'badgeText', currentLang);
              const metaPrimary = getLocalizedItemField(it, 'metaPrimary', currentLang);
              const metaSecondary = getLocalizedItemField(it, 'metaSecondary', currentLang);
              const linkLabel = getLocalizedItemField(it, 'linkLabel', currentLang);
              const hasAction = Boolean(
                linkLabel && it.actionType && it.actionType !== 'none'
              );
              const safeExtUrl =
                it.actionType === 'external_url' ? sanitizeExternalUrl(it.linkUrl) : '';

              return (
                <article
                  key={it.id}
                  className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden flex flex-col justify-between"
                >
                  {imgUrl && (
                    <div className="h-44 w-full bg-slate-100 overflow-hidden border-b border-slate-200/80">
                      <img
                        src={imgUrl}
                        alt={title}
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
                        {badgeText || `${String(idx + 1).padStart(2, '0')}.`}
                      </div>
                      <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                        {title}
                      </h3>
                      {subtitle && (
                        <div className="text-xs font-semibold text-slate-500">{subtitle}</div>
                      )}
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                        {description}
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {(metaPrimary || metaSecondary) && (
                        <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 font-medium flex flex-wrap items-center gap-2">
                          {metaPrimary && <span>{metaPrimary}</span>}
                          {metaPrimary && metaSecondary && <span aria-hidden="true">·</span>}
                          {metaSecondary && <span>{metaSecondary}</span>}
                        </div>
                      )}

                      {hasAction &&
                        (it.actionType === 'external_url' && safeExtUrl ? (
                          <a
                            href={safeExtUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2 px-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-emerald-900 border border-slate-200 hover:border-emerald-300 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <span>{linkLabel}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => triggerItemAction(it)}
                            className="w-full py-2 px-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 text-emerald-900 border border-slate-200 hover:border-emerald-300 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <span>{linkLabel}</span>
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
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
      const showHeaderBtn = isPortalUiButtonVisible(settings, 'programs_header_btn');
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
                  {getPortalUiText(settings, 'programs_heading', currentLang)}
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  {getPortalUiText(settings, 'programs_subheading', currentLang)}
                </p>
              </div>
              {showHeaderBtn && (
                <button
                  type="button"
                  onClick={() => onOpenRegistration()}
                  className="px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{getPortalUiText(settings, 'programs_header_btn', currentLang)}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {list.map((prog, idx) => {
                const isFirstStage =
                  prog.actionType === 'open_register' ||
                  (!prog.actionType && idx === 0);
                const effectiveAction =
                  prog.actionType || (isFirstStage ? 'open_register' : 'open_program_request');
                const isHighlighted =
                  Boolean(highlightedProgramSlug) &&
                  (prog.slug === highlightedProgramSlug || prog.id === highlightedProgramSlug);

                const title = getLocalizedItemField(prog, 'title', currentLang);
                const subtitle = getLocalizedItemField(prog, 'subtitle', currentLang);
                const description = getLocalizedItemField(prog, 'description', currentLang);
                const badgeText = getLocalizedItemField(prog, 'badgeText', currentLang);
                const metaPrimary = getLocalizedItemField(prog, 'metaPrimary', currentLang);
                const metaSecondary = getLocalizedItemField(prog, 'metaSecondary', currentLang);
                const buttonLabel =
                  getLocalizedItemField(prog, 'linkLabel', currentLang) ||
                  (effectiveAction === 'open_program_request'
                    ? currentLang === 'en'
                      ? 'Request This Program'
                      : currentLang === 'th'
                      ? 'ขอเข้าร่วมหลักสูตรนี้'
                      : 'طلب الالتحاق بالبرنامج'
                    : currentLang === 'en'
                    ? 'Register & Start'
                    : currentLang === 'th'
                    ? 'สมัครและเริ่มทันที'
                    : 'سجّل وابدأ الآن');

                const safeExtUrl =
                  effectiveAction === 'external_url' ? sanitizeExternalUrl(prog.linkUrl) : '';

                return (
                  <div
                    key={prog.id}
                    id={`portal-prog-${prog.slug || prog.id}`}
                    className={`rounded-2xl p-6 flex flex-col justify-between border transition-all ${
                      isFirstStage
                        ? 'bg-emerald-950 text-white border-emerald-900'
                        : 'bg-slate-50/70 text-slate-900 border-slate-200'
                    } ${isHighlighted ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}
                  >
                    <div className="space-y-3">
                      <div
                        className={`text-xs font-bold ${
                          isFirstStage ? 'text-amber-300' : 'text-emerald-800'
                        }`}
                      >
                        {badgeText || (isFirstStage ? 'المرحلة ١' : 'المرحلة ٢')}
                      </div>

                      <h3 className="text-lg font-extrabold leading-snug">{title}</h3>

                      {subtitle && (
                        <div
                          className={`text-xs font-semibold ${
                            isFirstStage ? 'text-emerald-100/80' : 'text-slate-500'
                          }`}
                        >
                          {subtitle}
                        </div>
                      )}

                      <p
                        className={`text-xs sm:text-sm leading-relaxed ${
                          isFirstStage ? 'text-emerald-50/90' : 'text-slate-600'
                        }`}
                      >
                        {description}
                      </p>
                    </div>

                    <div className="pt-5 mt-5 border-t border-current/10 space-y-3">
                      {(metaPrimary || metaSecondary) && (
                        <div
                          className={`text-xs font-medium flex items-center gap-2 ${
                            isFirstStage ? 'text-emerald-100/75' : 'text-slate-500'
                          }`}
                        >
                          {metaPrimary && <span>{metaPrimary}</span>}
                          {metaPrimary && metaSecondary && <span aria-hidden="true">·</span>}
                          {metaSecondary && <span>{metaSecondary}</span>}
                        </div>
                      )}

                      {effectiveAction !== 'none' &&
                        (effectiveAction === 'external_url' && safeExtUrl ? (
                          <a
                            href={safeExtUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-colors min-h-[42px] ${
                              isFirstStage
                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                                : 'bg-white hover:bg-emerald-50 text-emerald-900 border border-slate-300'
                            }`}
                          >
                            <span>{buttonLabel}</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => triggerItemAction({ ...prog, actionType: effectiveAction })}
                            className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[42px] ${
                              isFirstStage
                                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                                : 'bg-white hover:bg-emerald-50 text-emerald-900 border border-slate-300'
                            }`}
                          >
                            <span>{buttonLabel}</span>
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                        ))}
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
              {getPortalUiText(settings, 'gallery_heading', currentLang)}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {getPortalUiText(settings, 'gallery_subheading', currentLang)}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {list.map((item) => {
              const slides = getGallerySlideUrls(item);
              const total = slides.length;
              const currentIdx = total > 0 ? (gallerySlideMap[item.id] || 0) % total : 0;
              const activeImg = slides[currentIdx] || '';
              const title = getLocalizedItemField(item, 'title', currentLang);
              const description = getLocalizedItemField(item, 'description', currentLang);
              const badgeText = getLocalizedItemField(item, 'badgeText', currentLang);

              return (
                <div
                  key={item.id}
                  onClick={() => setLightboxState({ item, slideIdx: currentIdx })}
                  className="group bg-white rounded-2xl border border-slate-200 overflow-hidden cursor-pointer flex flex-col"
                >
                  <div className="relative h-56 bg-slate-100 overflow-hidden">
                    {activeImg && (
                      <img
                        src={activeImg}
                        alt={title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}

                    {total > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGallerySlideMap((prev) => ({
                              ...prev,
                              [item.id]: (currentIdx - 1 + total) % total,
                            }));
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/65 hover:bg-slate-950/85 text-white flex items-center justify-center transition-colors cursor-pointer"
                          aria-label="الصورة السابقة"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGallerySlideMap((prev) => ({
                              ...prev,
                              [item.id]: (currentIdx + 1) % total,
                            }));
                          }}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/65 hover:bg-slate-950/85 text-white flex items-center justify-center transition-colors cursor-pointer"
                          aria-label="الصورة التالية"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-lg bg-slate-950/70 text-white text-[11px] font-bold tabular-nums">
                          {currentIdx + 1} / {total}
                        </div>
                      </>
                    )}

                    <div className="absolute bottom-3 left-3 w-8 h-8 rounded-lg bg-slate-950/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Maximize2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="p-4 space-y-1">
                    {badgeText && (
                      <div className="text-[11px] font-bold text-emerald-800">{badgeText}</div>
                    )}
                    <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
                    {description && (
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {description}
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
                {getPortalUiText(settings, 'videos_heading', currentLang)}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {getPortalUiText(settings, 'videos_subheading', currentLang)}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {list.map((vid) => {
                const safeVidLink = sanitizeExternalUrl(vid.mediaUrl || vid.linkUrl);
                const thumbUrl = getAutoVideoThumbnail(vid);
                const title = getLocalizedItemField(vid, 'title', currentLang);
                const description = getLocalizedItemField(vid, 'description', currentLang);
                const badgeText = getLocalizedItemField(vid, 'badgeText', currentLang);
                const buttonLabel = getLocalizedItemField(vid, 'linkLabel', currentLang);

                return (
                  <div
                    key={vid.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 overflow-hidden flex flex-col justify-between"
                  >
                    {/* Clickable Video / Animated GIF Thumbnail Preview */}
                    <button
                      type="button"
                      onClick={() => safeVidLink && setActiveVideoItem(vid)}
                      className="relative aspect-video w-full bg-slate-900 overflow-hidden group cursor-pointer block"
                    >
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-800" />
                      )}
                      <div className="absolute inset-0 bg-slate-950/30 group-hover:bg-slate-950/45 transition-colors flex items-center justify-center">
                        <span className="w-12 h-12 rounded-full bg-white/95 text-emerald-900 shadow-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Play className="w-5 h-5 fill-current" />
                        </span>
                      </div>
                    </button>

                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-2">
                        {badgeText && (
                          <div className="text-xs font-bold text-emerald-800">{badgeText}</div>
                        )}
                        <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
                        {description && (
                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                            {description}
                          </p>
                        )}
                      </div>

                      {safeVidLink && buttonLabel && (
                        <button
                          type="button"
                          onClick={() => setActiveVideoItem(vid)}
                          className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[42px]"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>{buttonLabel}</span>
                        </button>
                      )}
                    </div>
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
          <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-amber-50/40 p-8 sm:p-10 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-emerald-800 text-amber-300 flex items-center justify-center mx-auto shadow-xs">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
              {storeSlotTitle || 'المتجر والأدوات'}
            </h2>
            <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
              {storeSlotNote ||
                'تصفح الأقلام والأحبار والأوراق الأصلية والباقات التدريبية المعتمدة مع توصيل لجميع المدن.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onOpenStore) {
                    onOpenStore();
                  } else {
                    window.location.hash = '#store';
                  }
                }}
                className="px-6 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 text-amber-300" />
                <span>
                  {currentLang === 'en'
                    ? 'Visit Store & Programs'
                    : currentLang === 'th'
                    ? 'เข้าสู่ร้านค้าและหลักสูตร'
                    : 'دخول المتجر وتصفح الأدوات والبرامج'}
                </span>
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (key === 'contact') {
      const safeTelegram = sanitizeExternalUrl(telegramMainLink);
      const showRegBtn = isPortalUiButtonVisible(settings, 'contact_register_btn');
      const showTgBtn = isPortalUiButtonVisible(settings, 'contact_telegram_btn');

      const contactCards = [
        settings.contactPhone.trim()
          ? {
              key: 'phone',
              label:
                currentLang === 'en' ? 'Phone' : currentLang === 'th' ? 'โทรศัพท์' : 'الهاتف',
              value: settings.contactPhone.trim(),
              icon: <Phone className="w-4 h-4" />,
              isLtr: true,
            }
          : null,
        settings.contactEmail.trim()
          ? {
              key: 'email',
              label:
                currentLang === 'en' ? 'Email' : currentLang === 'th' ? 'อีเมล' : 'البريد الإلكتروني',
              value: settings.contactEmail.trim(),
              icon: <Mail className="w-4 h-4" />,
              isEmail: true,
            }
          : null,
        settings.contactAddress.trim()
          ? {
              key: 'address',
              label:
                currentLang === 'en' ? 'Address' : currentLang === 'th' ? 'ที่อยู่' : 'المقر',
              value: settings.contactAddress.trim(),
              icon: <MapPin className="w-4 h-4" />,
            }
          : null,
        settings.contactHours.trim()
          ? {
              key: 'hours',
              label:
                currentLang === 'en'
                  ? 'Working Hours'
                  : currentLang === 'th'
                  ? 'เวลาทำการ'
                  : 'ساعات العمل',
              value: settings.contactHours.trim(),
              icon: <Clock className="w-4 h-4" />,
            }
          : null,
      ].filter(Boolean) as {
        key: string;
        label: string;
        value: string;
        icon: React.ReactNode;
        isLtr?: boolean;
        isEmail?: boolean;
      }[];

      const hasContactCards = contactCards.length > 0;

      return (
        <section
          key="contact"
          id="portal-contact"
          className="border-t border-slate-200/80 bg-slate-50"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className={hasContactCards ? 'lg:col-span-5 space-y-4' : 'lg:col-span-12 space-y-4'}>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                  {getPortalUiText(settings, 'contact_heading', currentLang)}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                  {getPortalUiText(settings, 'contact_subheading', currentLang)}
                </p>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {showRegBtn && (
                    <button
                      type="button"
                      onClick={() => onOpenRegistration()}
                      className="px-5 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer min-h-[42px]"
                    >
                      <UserPlus className="w-4 h-4 text-amber-300" />
                      <span>{getPortalUiText(settings, 'contact_register_btn', currentLang)}</span>
                    </button>
                  )}

                  {safeTelegram && showTgBtn && (
                    <a
                      href={safeTelegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-xl bg-white hover:bg-sky-50 text-sky-800 border border-slate-300 text-xs font-extrabold inline-flex items-center gap-2 min-h-[42px]"
                    >
                      <Send className="w-4 h-4" />
                      <span>{getPortalUiText(settings, 'contact_telegram_btn', currentLang)}</span>
                      <ExternalLink className="w-3 h-3 opacity-75" />
                    </a>
                  )}
                </div>

                {/* Dynamic Social Channels */}
                {activeSocialChannels.length > 0 && (
                  <div className="pt-3 flex flex-wrap items-center gap-2">
                    {activeSocialChannels.map((ch) => {
                      const safeHref = sanitizeExternalUrl(ch.url);
                      if (!safeHref) return null;
                      return (
                        <a
                          key={ch.id}
                          href={safeHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`px-3.5 py-2.5 rounded-xl border text-xs font-extrabold inline-flex items-center gap-2 transition-colors min-h-[40px] ${getSocialButtonStyle(
                            ch.iconKey
                          )}`}
                        >
                          <BrandSocialSvg
                            iconKey={ch.iconKey}
                            iconUrl={ch.iconUrl}
                            label={ch.appName}
                          />
                          <span>{ch.appName}</span>
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>

              {hasContactCards && (
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {contactCards.map((card) => (
                    <div
                      key={card.key}
                      className="bg-white rounded-2xl border border-slate-200 p-5 space-y-1.5"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                        {card.icon}
                        <span>{card.label}</span>
                      </div>
                      <div
                        className={`text-sm font-bold text-slate-900 ${
                          card.isLtr ? 'dir-ltr text-right tabular-nums' : ''
                        } ${card.isEmail ? 'break-all' : ''}`}
                      >
                        {card.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    return null;
  };

  const showHeaderLogin = isPortalUiButtonVisible(settings, 'header_login_btn');
  const showHeaderRegister = isPortalUiButtonVisible(settings, 'header_register_btn');
  const showFooterPortalBtn = isPortalUiButtonVisible(settings, 'footer_portal_btn');

  return (
    <div className="min-h-screen bg-[#F8FAF9] text-slate-800 font-cairo flex flex-col" dir={dir}>
      {/* Optional Top Announcement Ribbon */}
      {settings.announcementEnabled && announcementText && (
        <div className="bg-emerald-950 text-emerald-50 text-xs font-semibold py-2 px-4 text-center">
          <span>{announcementText}</span>
        </div>
      )}

      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#portal-hero"
            className="flex items-center gap-2.5 text-base sm:text-lg font-extrabold text-slate-900 whitespace-nowrap shrink-0"
          >
            {settings.logoUrl ? (
              <img
                src={getDirectImageUrl(settings.logoUrl)}
                alt={academyName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <span className="truncate max-w-[190px] sm:max-w-none">{academyName}</span>
          </a>

          {/* Zone 2: Clean Single-Line Text Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-600">
            {navLinks.map((lnk) =>
              lnk.key === 'store_slot' ? (
                <button
                  key={lnk.key}
                  type="button"
                  onClick={() => {
                    if (onOpenStore) onOpenStore();
                    else window.location.hash = '#store';
                  }}
                  className="hover:text-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 text-emerald-800 font-extrabold"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{lnk.label}</span>
                </button>
              ) : (
                <a
                  key={lnk.key}
                  href={lnk.href}
                  className="hover:text-emerald-800 transition-colors whitespace-nowrap shrink-0"
                >
                  {lnk.label}
                </a>
              )
            )}
          </nav>

          {/* Zone 3: Primary Action + Language / Login */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <LanguageSelector currentLang={currentLang} onSelectLang={onSelectLang} />
            </div>

            {showHeaderLogin && (
              <button
                type="button"
                onClick={onOpenStudentLogin}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
              >
                {getPortalUiText(settings, 'header_login_btn', currentLang)}
              </button>
            )}

            {showHeaderRegister && (
              <button
                type="button"
                onClick={() => onOpenRegistration()}
                className="hidden sm:inline-flex px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-800 hover:bg-emerald-900 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 items-center gap-1.5 min-h-[40px]"
              >
                <span>{getPortalUiText(settings, 'header_register_btn', currentLang)}</span>
              </button>
            )}

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
              {navLinks.map((lnk) =>
                lnk.key === 'store_slot' ? (
                  <button
                    key={lnk.key}
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      if (onOpenStore) onOpenStore();
                      else window.location.hash = '#store';
                    }}
                    className="text-sm font-extrabold text-emerald-800 hover:text-emerald-900 py-1 px-2 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{lnk.label}</span>
                  </button>
                ) : (
                  <a
                    key={lnk.key}
                    href={lnk.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-sm font-bold text-slate-700 hover:text-emerald-800 py-1 px-2"
                  >
                    {lnk.label}
                  </a>
                )
              )}
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <LanguageSelector currentLang={currentLang} onSelectLang={onSelectLang} />
              {showHeaderRegister && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenRegistration();
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
                >
                  {getPortalUiText(settings, 'header_register_btn', currentLang)}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{orderedSections.map((sec) => renderSection(sec.key))}</main>

      {/* Clean Footer: Social Channels + Subscriber Portal ONLY (zero admin/copyright links) */}
      {(activeSocialChannels.length > 0 || showFooterPortalBtn) && (
        <footer className="border-t border-slate-200 bg-white py-5 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {activeSocialChannels.map((ch) => {
                const safeHref = sanitizeExternalUrl(ch.url);
                if (!safeHref) return null;
                return (
                  <a
                    key={ch.id}
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-3 py-1.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${getSocialButtonStyle(
                      ch.iconKey
                    )}`}
                  >
                    <BrandSocialSvg
                      iconKey={ch.iconKey}
                      iconUrl={ch.iconUrl}
                      label={ch.appName}
                    />
                    <span>{ch.appName}</span>
                  </a>
                );
              })}
            </div>

            {showFooterPortalBtn && (
              <button
                type="button"
                onClick={onOpenStudentLogin}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-emerald-700" />
                <span>{getPortalUiText(settings, 'footer_portal_btn', currentLang)}</span>
              </button>
            )}
          </div>
        </footer>
      )}

      {/* Gallery Multi-Image Lightbox Modal */}
      {lightboxState && (() => {
        const slides = getGallerySlideUrls(lightboxState.item);
        const total = slides.length;
        const safeIdx = total > 0 ? lightboxState.slideIdx % total : 0;
        const currentUrl = slides[safeIdx] || '';
        const lbTitle = getLocalizedItemField(lightboxState.item, 'title', currentLang);
        const lbDesc = getLocalizedItemField(lightboxState.item, 'description', currentLang);

        return (
          <div
            className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => setLightboxState(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="font-extrabold text-sm text-slate-900 truncate">{lbTitle}</div>
                  {total > 1 && (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold tabular-nums shrink-0">
                      {safeIdx + 1} / {total}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxState(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {currentUrl && (
                <div className="relative bg-slate-950 flex items-center justify-center max-h-[65dvh] min-h-[260px]">
                  <img
                    src={currentUrl}
                    alt={lbTitle}
                    referrerPolicy="no-referrer"
                    className="max-h-[65dvh] w-auto object-contain"
                  />

                  {total > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxState({
                            item: lightboxState.item,
                            slideIdx: (safeIdx - 1 + total) % total,
                          })
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-slate-900 shadow-lg flex items-center justify-center cursor-pointer"
                        aria-label="الصورة السابقة"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxState({
                            item: lightboxState.item,
                            slideIdx: (safeIdx + 1) % total,
                          })
                        }
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-slate-900 shadow-lg flex items-center justify-center cursor-pointer"
                        aria-label="الصورة التالية"
                      >
                        <ArrowLeft className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {lbDesc && (
                <div className="p-5 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {lbDesc}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
              <div className="font-extrabold text-sm text-slate-900">
                {getLocalizedItemField(activeVideoItem, 'title', currentLang)}
              </div>
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
