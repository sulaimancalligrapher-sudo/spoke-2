import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  UserPlus,
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
  ShoppingCart,
  Menu,
  Globe,
  Heart,
  Clock as ClockIcon,
  Users,
} from 'lucide-react';
import {
  PortalContentItem,
  PortalPublicData,
  PortalSectionType,
  PortalSocialChannel,
  PortalSocialIconKey,
  StoreProduct,
  StorePublicData,
  StoreTrainingFormat,
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
  getSavedPortalBotUsername,
  isPortalUiButtonVisible,
} from '../utils/portalSheets';
import {
  getLocalStoreCart,
  getLocalStoreFavorites,
  getProductPriceSummary,
  saveLocalStoreCart,
  saveLocalStoreFavorites,
} from '../utils/storeSheets';
import { DEFAULT_STORE_SETTINGS } from '../utils/storeSeed';
import { StoreImage } from './store/StoreImage';
import { ProductModal } from './store/ProductModal';
import { StoreProgramModal } from './store/StoreProgramModal';

interface PublicPortalViewProps {
  portalData: PortalPublicData;
  storeData?: StorePublicData;
  webhookUrl?: string;
  onUpdatePortalData?: (next: PortalPublicData) => void;
  currentLang: SupportedLang;
  onSelectLang: (lang: SupportedLang) => void;
  onOpenUnifiedAccess: () => void;
  onOpenRegistration: (programTitle?: string) => void;
  onOpenProgramRequest: (programItem: PortalContentItem) => void;
  onOpenStudentLogin: () => void;
  onOpenStore?: (toastMsg?: string) => void;
  highlightedProgramSlug?: string;
}

const HOME_PROGRAM_FORMAT_LABELS: Record<StoreTrainingFormat, string> = {
  online_live: 'عن بُعد مباشر',
  in_person: 'حضوري',
  recorded: 'مسجل',
};

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
  storeData,
  webhookUrl,
  onUpdatePortalData,
  currentLang,
  onSelectLang,
  onOpenUnifiedAccess,
  onOpenRegistration,
  onOpenProgramRequest,
  onOpenStudentLogin: _onOpenStudentLogin,
  onOpenStore,
  highlightedProgramSlug,
}) => {
  const dir = currentLang === 'ar' ? 'rtl' : 'ltr';
  const { settings, items } = portalData;

  const isStoreEnabled = storeData
    ? storeData.settings.show_in_public_portal !== false
    : settings.showStoreNavSlot;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lightboxState, setLightboxState] = useState<{
    item: PortalContentItem;
    slideIdx: number;
  } | null>(null);
  const [activeVideoItem, setActiveVideoItem] = useState<PortalContentItem | null>(null);
  const [gallerySlideMap, setGallerySlideMap] = useState<Record<string, number>>({});
  const [mobileSlideMap, setMobileSlideMap] = useState<Record<string, number>>({});
  const mobilePauseUntilRef = useRef<number>(0);
  const [favorites, setFavorites] = useState<string[]>(() => getLocalStoreFavorites());
  const [cartCount, setCartCount] = useState<number>(() =>
    getLocalStoreCart().reduce((sum, entry) => sum + entry.qty, 0)
  );
  const [selectedHomeProduct, setSelectedHomeProduct] = useState<StoreProduct | null>(null);
  const [selectedHomeProgram, setSelectedHomeProgram] = useState<PortalContentItem | null>(null);

  const pauseMobileRotation = () => {
    mobilePauseUntilRef.current = Date.now() + 9000;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (Date.now() < mobilePauseUntilRef.current) return;
      if (selectedHomeProduct || selectedHomeProgram || lightboxState || activeVideoItem) return;
      setMobileSlideMap((prev) => ({
        about: (prev.about || 0) + 1,
        programs: (prev.programs || 0) + 1,
        gallery: (prev.gallery || 0) + 1,
        videos: (prev.videos || 0) + 1,
        store_slot: (prev.store_slot || 0) + 1,
      }));
    }, 5500);
    return () => window.clearInterval(timer);
  }, [selectedHomeProduct, selectedHomeProgram, lightboxState, activeVideoItem]);

  const handleToggleFavorite = (productId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      saveLocalStoreFavorites(next);
      return next;
    });
  };

  const addToCartAndOpenStore = (product: StoreProduct, variantLabel?: string, qty = 1) => {
    if (product.stock <= 0) return;
    const chosenVariant =
      variantLabel ||
      (product.variants && product.variants.length > 0 ? product.variants[0].label : '');
    const key = `${product.id}::${chosenVariant}`;
    const existingCart = getLocalStoreCart();
    const existing = existingCart.find((x) => x.key === key);
    const nextCart = existing
      ? existingCart.map((x) =>
          x.key === key ? { ...x, qty: Math.min(product.stock, x.qty + qty) } : x
        )
      : [...existingCart, { key, product, variant: chosenVariant, qty }];
    saveLocalStoreCart(nextCart);
    setCartCount(nextCart.reduce((sum, entry) => sum + entry.qty, 0));
    setSelectedHomeProduct(null);
    setSelectedHomeProgram(null);
    if (onOpenStore) {
      onOpenStore('تمت الإضافة للسلة');
    } else {
      window.location.hash = '#store';
    }
  };

  const openFullStore = () => {
    if (onOpenStore) {
      onOpenStore();
    } else {
      window.location.hash = '#store';
    }
  };

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

  const orderedSections = useMemo(() => {
    const base = [...(settings.sections || [])];
    if (isStoreEnabled && !base.some((s) => s.key === 'store_slot')) {
      base.push({
        key: 'store_slot',
        label: 'المتجر الإلكتروني',
        labelEn: 'Store',
        labelTh: 'ร้านค้า',
        enabled: true,
        sortOrder: 7,
      });
    }
    return base
      .filter((s) => (s.key === 'store_slot' ? isStoreEnabled : s.enabled !== false))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [settings.sections, isStoreEnabled]);

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
    };
    const defaultTh: Partial<Record<PortalSectionType, string>> = {
      about: 'เกี่ยวกับสถาบัน',
      programs: 'หลักสูตร',
      gallery: 'แกลเลอรี',
      videos: 'วิดีโอ',
      contact: 'ติดต่อเรา',
    };
    const defaultAr: Partial<Record<PortalSectionType, string>> = {
      about: 'عن المؤسسة',
      programs: 'البرامج',
      gallery: 'المعرض',
      videos: 'الفيديو',
      contact: 'تواصل معنا',
    };

    return orderedSections
      .filter((s) => s.key !== 'hero' && s.key !== 'announcement' && s.key !== 'store_slot')
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
  }, [orderedSections, currentLang]);

  const effectiveBotUsername = settings.telegramBotUsername || getSavedPortalBotUsername();
  const telegramMainLink = buildTelegramBotStartLink(effectiveBotUsername);
  const heroResolvedImg = settings.heroMediaUrl ? getDirectImageUrl(settings.heroMediaUrl) : '';

  const contactSocialChannels = useMemo(
    () => activeSocialChannels.filter((ch) => ch.showInContact !== false),
    [activeSocialChannels]
  );
  const footerSocialChannels = useMemo(
    () => activeSocialChannels.filter((ch) => ch.showInFooter !== false),
    [activeSocialChannels]
  );

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
      const showUnifiedAuth = isPortalUiButtonVisible(settings, 'unified_auth_btn');
      const unifiedAuthText = getPortalUiText(settings, 'unified_auth_btn', currentLang);
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

                {/* Unified Auth Button (opens 2-option modal) */}
                <div className="space-y-4 pt-2">
                  {showUnifiedAuth && (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={onOpenUnifiedAccess}
                        className="px-6 py-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-extrabold inline-flex items-center gap-2.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[46px]"
                      >
                        <UserPlus className="w-4 h-4 text-amber-300" />
                        <span>{unifiedAuthText}</span>
                      </button>
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
      const activeAboutIdx = (mobileSlideMap.about || 0) % list.length;

      const renderAboutCard = (it: PortalContentItem, idx: number) => {
        const imgUrl = it.mediaUrl ? getDirectImageUrl(it.mediaUrl) : '';
        const title = getLocalizedItemField(it, 'title', currentLang);
        const subtitle = getLocalizedItemField(it, 'subtitle', currentLang);
        const description = getLocalizedItemField(it, 'description', currentLang);
        const badgeText = getLocalizedItemField(it, 'badgeText', currentLang);
        const metaPrimary = getLocalizedItemField(it, 'metaPrimary', currentLang);
        const metaSecondary = getLocalizedItemField(it, 'metaSecondary', currentLang);
        const linkLabel = getLocalizedItemField(it, 'linkLabel', currentLang);
        const hasAction = Boolean(linkLabel && it.actionType && it.actionType !== 'none');
        const safeExtUrl = it.actionType === 'external_url' ? sanitizeExternalUrl(it.linkUrl) : '';

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
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">{title}</h3>
                {subtitle && <div className="text-xs font-semibold text-slate-500">{subtitle}</div>}
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{description}</p>
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
      };

      return (
        <section
          key="about"
          id="portal-about"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                {getPortalUiText(settings, 'about_heading', currentLang)}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {getPortalUiText(settings, 'about_subheading', currentLang)}
              </p>
            </div>
          </div>

          {/* Desktop 3-column grid */}
          <div className="hidden lg:grid lg:grid-cols-3 gap-6">
            {list.map((it, idx) => renderAboutCard(it, idx))}
          </div>

          {/* Mobile & Tablet Spotlight Card + Horizontal Mini-Card Strip */}
          <div className="lg:hidden space-y-3.5">
            {renderAboutCard(list[activeAboutIdx], activeAboutIdx)}
            {list.length > 1 && (
              <div
                className="flex gap-2.5 overflow-x-auto pb-1.5 snap-x"
                style={{ scrollbarWidth: 'none' }}
              >
                {list.map((it, idx) => {
                  const isActive = idx === activeAboutIdx;
                  const imgUrl = it.mediaUrl ? getDirectImageUrl(it.mediaUrl) : '';
                  const title = getLocalizedItemField(it, 'title', currentLang);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => {
                        pauseMobileRotation();
                        setMobileSlideMap((p) => ({ ...p, about: idx }));
                      }}
                      className={`w-40 shrink-0 snap-start rounded-xl border p-2 text-start flex items-center gap-2.5 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-500/30 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {imgUrl ? (
                        <img
                          src={imgUrl}
                          alt={title}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-extrabold font-mono flex items-center justify-center shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                      )}
                      <span className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                        {title}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      );
    }

    if (key === 'programs') {
      const list = itemsBySection.programs.filter((p) => p.showOnHome !== false);
      if (list.length === 0) return null;
      const showHeaderBtn = isPortalUiButtonVisible(settings, 'programs_header_btn');
      const currency = storeData?.settings.currency || DEFAULT_STORE_SETTINGS.currency;
      const activeProgIdx = (mobileSlideMap.programs || 0) % list.length;

      const renderProgramCard = (prog: PortalContentItem, idx: number) => {
        const isFirstStage =
          prog.actionType === 'open_register' ||
          (!prog.actionType && idx === 0);
        const isHighlighted =
          Boolean(highlightedProgramSlug) &&
          (prog.slug === highlightedProgramSlug || prog.id === highlightedProgramSlug);

        const title = getLocalizedItemField(prog, 'title', currentLang);
        const subtitle = getLocalizedItemField(prog, 'subtitle', currentLang);
        const description = getLocalizedItemField(prog, 'description', currentLang);
        const badgeText = getLocalizedItemField(prog, 'badgeText', currentLang);
        const metaPrimary = getLocalizedItemField(prog, 'metaPrimary', currentLang);
        const metaSecondary = getLocalizedItemField(prog, 'metaSecondary', currentLang);
        const priceNum = Math.max(0, Number(prog.price) || 0);
        const isFree = priceNum <= 0;
        const formatLabel = prog.format ? HOME_PROGRAM_FORMAT_LABELS[prog.format] : '';
        const seatsLeft =
          prog.seatsLeft !== undefined ? Number(prog.seatsLeft) : undefined;
        const buttonLabel =
          getLocalizedItemField(prog, 'linkLabel', currentLang) ||
          (currentLang === 'en'
            ? 'Program Details & Enroll'
            : currentLang === 'th'
            ? 'รายละเอียดและสมัครเรียน'
            : 'التفاصيل والتسجيل');

        return (
          <article
            key={prog.id}
            id={`portal-prog-${prog.slug || prog.id}`}
            onClick={() => setSelectedHomeProgram(prog)}
            className={`group rounded-2xl overflow-hidden flex flex-col justify-between border transition-all cursor-pointer ${
              isFirstStage
                ? 'bg-emerald-950 text-white border-emerald-900 hover:border-amber-400/60'
                : 'bg-slate-50/70 text-slate-900 border-slate-200 hover:border-emerald-300'
            } ${isHighlighted ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}
          >
            <div>
              {prog.mediaUrl && (
                <div className="border-b border-current/10 overflow-hidden">
                  <StoreImage
                    src={prog.mediaUrl}
                    alt={title}
                    aspectClass="aspect-[16/9]"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              )}

              <div className="p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className={`text-xs font-bold ${
                      isFirstStage ? 'text-amber-300' : 'text-emerald-800'
                    }`}
                  >
                    {badgeText || (isFirstStage ? 'المرحلة ١' : 'برنامج تدريبي')}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold tabular-nums ${
                      isFirstStage
                        ? isFree
                          ? 'bg-emerald-800/80 text-amber-200'
                          : 'bg-amber-400 text-slate-950'
                        : isFree
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-emerald-800 text-white'
                    }`}
                  >
                    {isFree ? 'مجاني' : `${priceNum} ${currency}`}
                  </span>
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
                  className={`text-xs sm:text-sm leading-relaxed line-clamp-3 ${
                    isFirstStage ? 'text-emerald-50/90' : 'text-slate-600'
                  }`}
                >
                  {description}
                </p>

                {(formatLabel || prog.duration || seatsLeft !== undefined) && (
                  <div
                    className={`flex flex-wrap items-center gap-3 pt-1 text-[11px] font-bold ${
                      isFirstStage ? 'text-emerald-200/80' : 'text-slate-500'
                    }`}
                  >
                    {formatLabel && <span>{formatLabel}</span>}
                    {(prog.duration || metaPrimary) && (
                      <span className="inline-flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        <span>{prog.duration || metaPrimary}</span>
                      </span>
                    )}
                    {seatsLeft !== undefined && (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users className="w-3 h-3" />
                        <span>
                          {seatsLeft <= 0 ? 'مكتمل' : `متبقي ${seatsLeft} مقعد`}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-4 border-t border-current/10 space-y-3">
              {!prog.duration && (metaPrimary || metaSecondary) && (
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

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedHomeProgram(prog);
                }}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[42px] ${
                  isFirstStage
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                    : 'bg-white hover:bg-emerald-50 text-emerald-900 border border-slate-300'
                }`}
              >
                <span>{buttonLabel}</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </article>
        );
      };

      return (
        <section
          key="programs"
          id="portal-programs"
          className="border-y border-slate-200/80 bg-white"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8 pb-4 border-b border-slate-200">
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

            <div className="hidden lg:grid lg:grid-cols-3 gap-6">
              {list.map((prog, idx) => renderProgramCard(prog, idx))}
            </div>

            <div className="lg:hidden space-y-3.5">
              {renderProgramCard(list[activeProgIdx], activeProgIdx)}
              {list.length > 1 && (
                <div
                  className="flex gap-2.5 overflow-x-auto pb-1.5 snap-x"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {list.map((prog, idx) => {
                    const isActive = idx === activeProgIdx;
                    const title = getLocalizedItemField(prog, 'title', currentLang);
                    const priceNum = Math.max(0, Number(prog.price) || 0);
                    return (
                      <button
                        key={prog.id}
                        type="button"
                        onClick={() => {
                          pauseMobileRotation();
                          setMobileSlideMap((p) => ({ ...p, programs: idx }));
                        }}
                        className={`w-44 shrink-0 snap-start rounded-xl border p-2 text-start flex items-center gap-2.5 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-500/30 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {prog.mediaUrl ? (
                          <StoreImage
                            src={prog.mediaUrl}
                            alt={title}
                            aspectClass="w-10 h-10"
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
                          />
                        ) : (
                          <span className="w-10 h-10 rounded-lg bg-emerald-950 text-amber-300 text-xs font-extrabold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 line-clamp-1">
                            {title}
                          </div>
                          <div className="text-[11px] font-bold text-emerald-700 tabular-nums mt-0.5">
                            {priceNum <= 0 ? 'مجاني' : `${priceNum} ${currency}`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    if (key === 'gallery') {
      const list = itemsBySection.gallery;
      if (list.length === 0) return null;
      const activeGalIdx = (mobileSlideMap.gallery || 0) % list.length;

      const renderGalleryCard = (item: PortalContentItem) => {
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
                      pauseMobileRotation();
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
                      pauseMobileRotation();
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
      };

      return (
        <section
          key="gallery"
          id="portal-gallery"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16"
        >
          <div className="mb-6 sm:mb-8 pb-4 border-b border-slate-200">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
              {getPortalUiText(settings, 'gallery_heading', currentLang)}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {getPortalUiText(settings, 'gallery_subheading', currentLang)}
            </p>
          </div>

          <div className="hidden lg:grid lg:grid-cols-3 gap-6">
            {list.map((item) => renderGalleryCard(item))}
          </div>

          <div className="lg:hidden space-y-3.5">
            {renderGalleryCard(list[activeGalIdx])}
            {list.length > 1 && (
              <div
                className="flex gap-2.5 overflow-x-auto pb-1.5 snap-x"
                style={{ scrollbarWidth: 'none' }}
              >
                {list.map((item, idx) => {
                  const isActive = idx === activeGalIdx;
                  const slides = getGallerySlideUrls(item);
                  const thumb = slides[0] || '';
                  const title = getLocalizedItemField(item, 'title', currentLang);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        pauseMobileRotation();
                        setMobileSlideMap((p) => ({ ...p, gallery: idx }));
                      }}
                      className={`w-40 shrink-0 snap-start rounded-xl border p-2 text-start flex items-center gap-2.5 transition-all cursor-pointer ${
                        isActive
                          ? 'bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-500/30 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={title}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
                        />
                      ) : (
                        <span className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 text-xs font-extrabold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                      )}
                      <span className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                        {title}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      );
    }

    if (key === 'videos') {
      const list = itemsBySection.videos;
      if (list.length === 0) return null;
      const activeVidIdx = (mobileSlideMap.videos || 0) % list.length;

      const renderVideoCard = (vid: PortalContentItem) => {
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
      };

      return (
        <section
          key="videos"
          id="portal-videos"
          className="border-t border-slate-200/80 bg-white"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
            <div className="mb-6 sm:mb-8 pb-4 border-b border-slate-200">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                {getPortalUiText(settings, 'videos_heading', currentLang)}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {getPortalUiText(settings, 'videos_subheading', currentLang)}
              </p>
            </div>

            <div className="hidden lg:grid lg:grid-cols-3 gap-6">
              {list.map((vid) => renderVideoCard(vid))}
            </div>

            <div className="lg:hidden space-y-3.5">
              {renderVideoCard(list[activeVidIdx])}
              {list.length > 1 && (
                <div
                  className="flex gap-2.5 overflow-x-auto pb-1.5 snap-x"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {list.map((vid, idx) => {
                    const isActive = idx === activeVidIdx;
                    const thumb = getAutoVideoThumbnail(vid);
                    const title = getLocalizedItemField(vid, 'title', currentLang);
                    return (
                      <button
                        key={vid.id}
                        type="button"
                        onClick={() => {
                          pauseMobileRotation();
                          setMobileSlideMap((p) => ({ ...p, videos: idx }));
                        }}
                        className={`w-44 shrink-0 snap-start rounded-xl border p-2 text-start flex items-center gap-2.5 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-500/30 shadow-2xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="relative w-12 h-9 rounded-lg overflow-hidden bg-slate-900 shrink-0 flex items-center justify-center">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover opacity-85"
                            />
                          ) : null}
                          <Play className="w-3.5 h-3.5 text-white fill-current absolute" />
                        </div>
                        <span className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                          {title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    if (key === 'store_slot') {
      if (!isStoreEnabled) return null;
      const activeProducts = (storeData?.products || []).filter((p) => p.is_active);
      const showcaseProducts = activeProducts.filter((p) => p.show_on_home === true).slice(0, 6);
      const currency = storeData?.settings.currency || DEFAULT_STORE_SETTINGS.currency;
      const catNameById = new Map(
        (storeData?.categories || []).map((c) => [c.id, c.name])
      );
      const activeProdIdx =
        showcaseProducts.length > 0 ? (mobileSlideMap.store_slot || 0) % showcaseProducts.length : 0;

      const renderProductCard = (product: StoreProduct) => {
        const summary = getProductPriceSummary(product);
        const isFav = favorites.includes(product.id);
        const outOfStock = product.stock <= 0;
        const catLabel = catNameById.get(product.category_id) || 'أداة خط';

        return (
          <article
            key={product.id}
            className="group rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between shadow-xs hover:border-emerald-300 transition-colors"
          >
            <div>
              <div
                onClick={() => setSelectedHomeProduct(product)}
                className="relative cursor-pointer overflow-hidden"
              >
                <StoreImage
                  src={product.image_url}
                  alt={product.name}
                  aspectClass="aspect-[4/3]"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite(product.id);
                  }}
                  aria-label="المفضلة"
                  className={`absolute top-3 left-3 p-2 rounded-xl border backdrop-blur-xs cursor-pointer transition-colors ${
                    isFav
                      ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : 'bg-white/90 text-slate-500 border-slate-200 hover:text-rose-600'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                </button>

                {outOfStock && (
                  <div className="absolute inset-0 bg-slate-950/55 flex items-center justify-center">
                    <span className="px-3 py-1 rounded-lg bg-white text-slate-900 text-xs font-extrabold">
                      نفدت الكمية
                    </span>
                  </div>
                )}
              </div>

              <div className="p-5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                  <span>{catLabel}</span>
                  <span className="font-mono tabular-nums">{product.sku}</span>
                </div>

                <h3
                  onClick={() => setSelectedHomeProduct(product)}
                  className="text-base font-extrabold text-slate-900 hover:text-emerald-800 cursor-pointer line-clamp-1"
                >
                  {product.name}
                </h3>

                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 min-h-[36px]">
                  {product.description}
                </p>
              </div>
            </div>

            <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
              <div>
                <div className="text-lg font-extrabold text-emerald-900 tabular-nums">
                  {summary.hasRange
                    ? `${summary.minPrice} - ${summary.maxPrice}`
                    : summary.defaultPrice}{' '}
                  {currency}
                </div>
                {product.compare_at_price && product.compare_at_price > summary.minPrice && (
                  <span className="text-[11px] text-slate-400 line-through tabular-nums">
                    {product.compare_at_price} {currency}
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={outOfStock}
                onClick={() => addToCartAndOpenStore(product)}
                title={outOfStock ? 'نفدت الكمية' : 'أضف للسلة'}
                aria-label={outOfStock ? 'نفدت الكمية' : 'أضف للسلة'}
                className="p-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-300 text-white inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <ShoppingCart className="w-4 h-4" />
              </button>
            </div>
          </article>
        );
      };

      return (
        <section
          key="store_slot"
          id="portal-store_slot"
          className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                {storeSlotTitle || 'منتجات مختارة من المتجر'}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                {storeSlotNote ||
                  'تصفح الأقلام والأحبار والأوراق الأصلية والباقات التدريبية المعتمدة مع توصيل لجميع المدن.'}
              </p>
            </div>

            <button
              type="button"
              onClick={openFullStore}
              className="px-4 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
            >
              <span>
                {currentLang === 'en'
                  ? 'Browse Full Store'
                  : currentLang === 'th'
                  ? 'เข้าชมร้านค้าทั้งหมด'
                  : 'تصفح المتجر الكامل'}
              </span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {showcaseProducts.length > 0 ? (
            <>
              <div className="hidden lg:grid lg:grid-cols-3 gap-6">
                {showcaseProducts.map((product) => renderProductCard(product))}
              </div>

              <div className="lg:hidden space-y-3.5">
                {renderProductCard(showcaseProducts[activeProdIdx])}
                {showcaseProducts.length > 1 && (
                  <div
                    className="flex gap-2.5 overflow-x-auto pb-1.5 snap-x"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    {showcaseProducts.map((product, idx) => {
                      const isActive = idx === activeProdIdx;
                      const summary = getProductPriceSummary(product);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            pauseMobileRotation();
                            setMobileSlideMap((p) => ({ ...p, store_slot: idx }));
                          }}
                          className={`w-44 shrink-0 snap-start rounded-xl border p-2 text-start flex items-center gap-2.5 transition-all cursor-pointer ${
                            isActive
                              ? 'bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-500/30 shadow-2xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <StoreImage
                            src={product.image_url}
                            alt={product.name}
                            aspectClass="w-10 h-10"
                            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-slate-200"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 line-clamp-1">
                              {product.name}
                            </div>
                            <div className="text-[11px] font-bold text-emerald-700 tabular-nums mt-0.5">
                              {summary.minPrice} {currency}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-amber-50/40 p-8 sm:p-10 text-center space-y-4 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-emerald-800 text-amber-300 flex items-center justify-center mx-auto shadow-xs">
                <ShoppingCart className="w-7 h-7" />
              </div>
              <p className="text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
                {storeSlotNote ||
                  'تصفح الأقلام والأحبار والأوراق الأصلية والباقات التدريبية المعتمدة مع توصيل لجميع المدن.'}
              </p>
              <button
                type="button"
                onClick={openFullStore}
                title="المتجر"
                aria-label="المتجر"
                className="p-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white inline-flex items-center justify-center transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-5 h-5 text-amber-300" />
              </button>
            </div>
          )}
        </section>
      );
    }

    if (key === 'contact') {
      const safeTelegram = sanitizeExternalUrl(telegramMainLink);
      const showUnifiedAuth = isPortalUiButtonVisible(settings, 'unified_auth_btn');
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
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className={hasContactCards ? 'lg:col-span-5 space-y-4' : 'lg:col-span-12 space-y-4'}>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
                  {getPortalUiText(settings, 'contact_heading', currentLang)}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                  {getPortalUiText(settings, 'contact_subheading', currentLang)}
                </p>

                <div className="flex flex-wrap gap-2.5 pt-2">
                  {showUnifiedAuth && (
                    <button
                      type="button"
                      onClick={onOpenUnifiedAccess}
                      className="px-5 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer min-h-[42px] whitespace-nowrap shrink-0"
                    >
                      <UserPlus className="w-4 h-4 text-amber-300" />
                      <span>{getPortalUiText(settings, 'unified_auth_btn', currentLang)}</span>
                    </button>
                  )}

                  {safeTelegram && showTgBtn && (
                    <a
                      href={safeTelegram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-xl bg-white hover:bg-sky-50 text-sky-800 border border-slate-300 text-xs font-extrabold inline-flex items-center gap-2 min-h-[42px] whitespace-nowrap shrink-0"
                    >
                      <Send className="w-4 h-4" />
                      <span>{getPortalUiText(settings, 'contact_telegram_btn', currentLang)}</span>
                      <ExternalLink className="w-3 h-3 opacity-75" />
                    </a>
                  )}
                </div>

                {/* Dynamic Social Channels shown in Contact section */}
                {contactSocialChannels.length > 0 && (
                  <div className="pt-3 flex flex-wrap items-center gap-2">
                    {contactSocialChannels.map((ch) => {
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

  const showHeaderUnifiedAuth = isPortalUiButtonVisible(settings, 'unified_auth_btn');
  const headerUnifiedAuthText = getPortalUiText(settings, 'unified_auth_btn', currentLang);

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
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
            <span className="truncate max-w-[160px] sm:max-w-[230px] lg:max-w-none">{academyName}</span>
          </a>

          {/* Zone 2: Clean Single-Line Text Nav Links + Icon-Only Store Cart */}
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
            {isStoreEnabled && (
              <button
                type="button"
                onClick={openFullStore}
                title="المتجر"
                aria-label="المتجر"
                className="relative p-2 rounded-xl text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50 border border-emerald-200/80 transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 min-h-[40px] min-w-[40px]"
              >
                <ShoppingCart className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold tabular-nums flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          {/* Zone 3: Icon-Only Language + Unified Access Button + Mobile Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSelector currentLang={currentLang} onSelectLang={onSelectLang} iconOnly />

            {showHeaderUnifiedAuth && (
              <button
                type="button"
                onClick={onOpenUnifiedAccess}
                className="hidden sm:inline-flex px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-800 hover:bg-emerald-900 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0 items-center gap-1.5 min-h-[40px]"
              >
                <UserPlus className="w-3.5 h-3.5 text-amber-300" />
                <span>{headerUnifiedAuthText}</span>
              </button>
            )}

            {isStoreEnabled && (
              <button
                type="button"
                onClick={openFullStore}
                title="المتجر"
                aria-label="المتجر"
                className="lg:hidden relative p-2 rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
              >
                <ShoppingCart className="w-4 h-4" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold tabular-nums flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
              aria-label="القائمة"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3">
            <div className="flex flex-wrap gap-2.5">
              {navLinks.map((lnk) => (
                <a
                  key={lnk.key}
                  href={lnk.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-bold text-slate-700 hover:text-emerald-800 py-1.5 px-2.5 rounded-lg hover:bg-slate-50"
                >
                  {lnk.label}
                </a>
              ))}
            </div>
            {showHeaderUnifiedAuth && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenUnifiedAccess();
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
                >
                  <UserPlus className="w-4 h-4 text-amber-300" />
                  <span>{headerUnifiedAuthText}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{orderedSections.map((sec) => renderSection(sec.key))}</main>

      {/* Clean Icon-Only Social Channels Footer */}
      {footerSocialChannels.length > 0 && (
        <footer className="border-t border-slate-200 bg-white py-5 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-center gap-2.5">
            {footerSocialChannels.map((ch) => {
              const safeHref = sanitizeExternalUrl(ch.url);
              if (!safeHref) return null;
              return (
                <a
                  key={ch.id}
                  href={safeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={ch.appName}
                  aria-label={ch.appName}
                  className={`w-10 h-10 rounded-xl border inline-flex items-center justify-center transition-colors shrink-0 ${getSocialButtonStyle(
                    ch.iconKey
                  )}`}
                >
                  <BrandSocialSvg
                    iconKey={ch.iconKey}
                    iconUrl={ch.iconUrl}
                    label={ch.appName}
                  />
                </a>
              );
            })}
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

      {/* Public Home Product Details Modal */}
      {selectedHomeProduct && storeData && (
        <ProductModal
          product={selectedHomeProduct}
          category={storeData.categories.find((c) => c.id === selectedHomeProduct.category_id)}
          settings={storeData.settings}
          botUsername={effectiveBotUsername}
          isFavorite={favorites.includes(selectedHomeProduct.id)}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setSelectedHomeProduct(null)}
          onAddToCart={(prod, variant, qty) => addToCartAndOpenStore(prod, variant, qty)}
        />
      )}

      {/* Public Home Rich Program Details & Instant Registration Modal */}
      {selectedHomeProgram && (
        <StoreProgramModal
          program={selectedHomeProgram}
          settings={storeData?.settings || DEFAULT_STORE_SETTINGS}
          recommendedProducts={(storeData?.products || []).filter(
            (p) =>
              p.is_active &&
              Array.isArray(selectedHomeProgram.recommendedProductIds) &&
              selectedHomeProgram.recommendedProductIds.includes(p.id)
          )}
          botUsername={effectiveBotUsername}
          webhookUrl={webhookUrl || ''}
          onAddToCart={(prod) => addToCartAndOpenStore(prod)}
          onEnrolled={(programId) => {
            if (!onUpdatePortalData) return;
            const nextItems = (portalData.items || []).map((item) => {
              if (item.id === programId && item.seatsLeft !== undefined) {
                return { ...item, seatsLeft: Math.max(0, Number(item.seatsLeft) - 1) };
              }
              return item;
            });
            onUpdatePortalData({ ...portalData, items: nextItems });
          }}
          onOpenStage1Onboarding={(programTitle) => {
            setSelectedHomeProgram(null);
            onOpenRegistration(programTitle);
          }}
          onClose={() => setSelectedHomeProgram(null)}
        />
      )}
    </div>
  );
};
