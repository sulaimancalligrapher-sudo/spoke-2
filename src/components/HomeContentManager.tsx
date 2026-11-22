import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Images,
  Video,
  ExternalLink,
  Plus,
  Trash2,
  Edit3,
  Save,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Link2,
  BookOpen,
  Film,
  Calendar,
  Layers,
} from 'lucide-react';
import { HomeBlockType, HomeContentBlock, HomeNavbarControls, HomeSlideItem } from '../types';
import {
  fetchHomeContentFromSheets,
  saveHomeContentToSheets,
  sanitizeExternalUrl,
  NAVBAR_CONTROLS_BLOCK_ID,
  DEFAULT_HOME_NAVBAR_CONTROLS,
  extractHomeNavbarControls,
  stripSystemHomeBlocks,
  mergeHomeNavbarControlsIntoBlocks,
} from '../utils/googleSheets';
import { CourseProgram, PROGRAM_COLOR_META } from '../utils/courseSchedule';
import { getDirectImageUrl } from '../utils/mediaUrl';
import { getPlayableVideoInfo } from '../video/videoSheets';

const ACCENT_META: Record<
  NonNullable<HomeContentBlock['accentColor']>,
  {
    labelAr: string;
    cardCls: string;
    badgeCls: string;
    btnCls: string;
    iconBgCls: string;
  }
> = {
  emerald: {
    labelAr: 'أخضر (نجاح / إعلان)',
    cardCls: 'border-emerald-200 bg-white',
    badgeCls: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    btnCls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    iconBgCls: 'bg-emerald-100 text-emerald-700',
  },
  indigo: {
    labelAr: 'نيلي (أكاديمي)',
    cardCls: 'border-indigo-200 bg-white',
    badgeCls: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    btnCls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    iconBgCls: 'bg-indigo-100 text-indigo-700',
  },
  amber: {
    labelAr: 'ذهبي (تنبيه مهم)',
    cardCls: 'border-amber-300 bg-amber-50/40',
    badgeCls: 'bg-amber-100 text-amber-950 border-amber-300',
    btnCls: 'bg-amber-600 hover:bg-amber-700 text-white',
    iconBgCls: 'bg-amber-100 text-amber-800',
  },
  rose: {
    labelAr: 'أحمر (عاجل)',
    cardCls: 'border-rose-200 bg-rose-50/40',
    badgeCls: 'bg-rose-100 text-rose-900 border-rose-200',
    btnCls: 'bg-rose-600 hover:bg-rose-700 text-white',
    iconBgCls: 'bg-rose-100 text-rose-700',
  },
  sky: {
    labelAr: 'سماوي (معلومة)',
    cardCls: 'border-sky-200 bg-white',
    badgeCls: 'bg-sky-100 text-sky-900 border-sky-200',
    btnCls: 'bg-sky-600 hover:bg-sky-700 text-white',
    iconBgCls: 'bg-sky-100 text-sky-700',
  },
};

const BLOCK_TYPE_META: Record<
  HomeBlockType,
  { labelAr: string; descAr: string; pillCls: string }
> = {
  announcement: {
    labelAr: 'إعلان / تنبيه',
    descAr: 'بطاقة خبر أو تنبيه مهم للطلاب مع صورة وزر رابط اختياري',
    pillCls: 'bg-emerald-100 text-emerald-900',
  },
  slideshow: {
    labelAr: 'معرض شرائح صور',
    descAr: 'شرائح صور متحركة تفاعلية مع وصف ورابط لكل شريحة',
    pillCls: 'bg-indigo-100 text-indigo-900',
  },
  video: {
    labelAr: 'فيديو تعريفي',
    descAr: 'عرض فيديو يوتيوب أو Google Drive أو MP4 مباشرة بالصفحة الرئيسية',
    pillCls: 'bg-rose-100 text-rose-900',
  },
  link: {
    labelAr: 'رابط / مصدر سريع',
    descAr: 'بطاقة رابط خارجي مهم (مثل قناة تيليغرام، حقيبة PDF، إلخ)',
    pillCls: 'bg-sky-100 text-sky-900',
  },
};

// =========================================================================
// 1. STUDENT LANDING SHOWCASE (عرض كتل محتوى الصفحة الرئيسية)
// =========================================================================

const SlideshowCard: React.FC<{ block: HomeContentBlock }> = ({ block }) => {
  const slides = block.slides || [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slides.length, paused]);

  useEffect(() => {
    if (activeIdx >= slides.length) setActiveIdx(0);
  }, [slides.length, activeIdx]);

  if (slides.length === 0) return null;
  const current = slides[activeIdx] || slides[0];
  const imgSrc = getDirectImageUrl(current.imageUrl);
  const safeSlideLink = sanitizeExternalUrl(current.linkUrl);
  const accent = ACCENT_META[block.accentColor || 'indigo'];

  return (
    <div
      className={`rounded-3xl border shadow-lg overflow-hidden ${accent.cardCls}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {(block.title || block.badgeText) && (
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent.iconBgCls}`}>
              <Images className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                {block.title}
              </h3>
              {block.body && <p className="text-xs text-slate-500 font-semibold">{block.body}</p>}
            </div>
          </div>
          {block.badgeText && (
            <span className={`px-3 py-1 rounded-xl text-[11px] font-extrabold border ${accent.badgeCls}`}>
              {block.badgeText}
            </span>
          )}
        </div>
      )}

      <div className="relative bg-slate-950 aspect-[16/9] sm:aspect-[21/9] w-full overflow-hidden">
        <img
          src={imgSrc}
          alt={current.caption || block.title || 'صورة العرض'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-slate-950/90 via-slate-950/45 to-transparent p-4 sm:p-5 flex flex-wrap items-end justify-between gap-3">
          <div className="text-white space-y-1 max-w-2xl">
            {current.caption && (
              <p className="text-xs sm:text-sm font-bold leading-relaxed drop-shadow-xs">
                {current.caption}
              </p>
            )}
          </div>
          {safeSlideLink && (
            <a
              href={safeSlideLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-white/95 hover:bg-white text-slate-900 text-xs font-extrabold flex items-center gap-1.5 shadow-md transition-transform hover:scale-105"
            >
              <span>{block.buttonLabel || 'فتح الرابط'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActiveIdx((prev) => (prev - 1 + slides.length) % slides.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center border border-white/20 cursor-pointer"
              aria-label="الشريحة السابقة"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setActiveIdx((prev) => (prev + 1) % slides.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center border border-white/20 cursor-pointer"
              aria-label="الشريحة التالية"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-slate-900/65 px-2.5 py-1 rounded-full backdrop-blur-xs">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    idx === activeIdx ? 'w-5 bg-emerald-400' : 'w-2 bg-white/50 hover:bg-white/80'
                  }`}
                  aria-label={`شريحة ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const HomeContentShowcase: React.FC<{
  blocks: HomeContentBlock[];
  activeProgramId?: string;
  programsList?: CourseProgram[];
}> = ({ blocks, activeProgramId }) => {
  const activeBlocks = useMemo(
    () =>
      [...blocks]
        .filter((b) => {
          if (!b.enabled || b.id === NAVBAR_CONTROLS_BLOCK_ID) return false;
          const targets = (b.programIds || []).filter((id) => id && id !== 'all');
          if (targets.length === 0) return true;
          return activeProgramId ? targets.includes(activeProgramId) : false;
        })
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [blocks, activeProgramId]
  );

  if (activeBlocks.length === 0) return null;

  return (
    <div className="max-w-4xl w-full mx-auto space-y-5">
      {activeBlocks.map((block) => {
        const accent = ACCENT_META[block.accentColor || 'emerald'];
        const safeLink = sanitizeExternalUrl(block.linkUrl);

        if (block.type === 'slideshow') {
          return <SlideshowCard key={block.id} block={block} />;
        }

        if (block.type === 'video') {
          const playable = getPlayableVideoInfo(block.mediaUrl);
          return (
            <div key={block.id} className={`rounded-3xl border shadow-lg overflow-hidden ${accent.cardCls}`}>
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.iconBgCls}`}>
                      <Video className="w-5 h-5" />
                    </span>
                    <div>
                      <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                        {block.title || 'فيديو تعريفي'}
                      </h3>
                      {block.body && (
                        <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5">
                          {block.body}
                        </p>
                      )}
                    </div>
                  </div>
                  {block.badgeText && (
                    <span className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${accent.badgeCls}`}>
                      {block.badgeText}
                    </span>
                  )}
                </div>

                {playable.kind === 'youtube' && playable.youtubeId ? (
                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-200">
                    <iframe
                      src={`https://www.youtube.com/embed/${playable.youtubeId}?rel=0`}
                      title={block.title || 'فيديو يوتيوب'}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : playable.embedUrl ? (
                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-200">
                    <iframe
                      src={playable.embedUrl}
                      title={block.title || 'فيديو تعريفي'}
                      className="w-full h-full"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                    />
                  </div>
                ) : playable.src ? (
                  <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-200">
                    <video
                      src={playable.src}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : null}

                {safeLink && (
                  <div className="flex justify-end">
                    <a
                      href={safeLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs ${accent.btnCls}`}
                    >
                      <span>{block.buttonLabel || 'مشاهدة / فتح الرابط'}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        }

        if (block.type === 'link') {
          const thumbSrc = block.mediaUrl ? getDirectImageUrl(block.mediaUrl) : '';
          return (
            <div key={block.id} className={`rounded-3xl border shadow-md p-5 sm:p-6 ${accent.cardCls}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt={block.title}
                      className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${accent.iconBgCls}`}>
                      <Link2 className="w-5 h-5" />
                    </span>
                  )}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                        {block.title}
                      </h3>
                      {block.badgeText && (
                        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border ${accent.badgeCls}`}>
                          {block.badgeText}
                        </span>
                      )}
                    </div>
                    {block.body && (
                      <p className="text-xs sm:text-sm text-slate-600 font-semibold leading-relaxed">
                        {block.body}
                      </p>
                    )}
                  </div>
                </div>

                {safeLink && (
                  <a
                    href={safeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 shadow-sm shrink-0 transition-transform hover:scale-[1.02] ${accent.btnCls}`}
                  >
                    <span>{block.buttonLabel || 'فتح الرابط'}</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          );
        }

        // Default: 'announcement'
        const bannerSrc = block.mediaUrl ? getDirectImageUrl(block.mediaUrl) : '';
        return (
          <div key={block.id} className={`rounded-3xl border shadow-lg overflow-hidden ${accent.cardCls}`}>
            {bannerSrc && (
              <div className="w-full max-h-72 overflow-hidden bg-slate-100 border-b border-slate-100">
                <img
                  src={bannerSrc}
                  alt={block.title || 'صورة الإعلان'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            )}
            <div className="p-5 sm:p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent.iconBgCls}`}>
                    <Megaphone className="w-5 h-5" />
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                    {block.title}
                  </h3>
                </div>
                {block.badgeText && (
                  <span className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${accent.badgeCls}`}>
                    {block.badgeText}
                  </span>
                )}
              </div>

              {block.body && (
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line font-semibold">
                  {block.body}
                </p>
              )}

              {safeLink && (
                <div className="pt-1 flex justify-end">
                  <a
                    href={safeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs ${accent.btnCls}`}
                  >
                    <span>{block.buttonLabel || 'التفاصيل'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// =========================================================================
// 2. ADMIN EDITOR (لوحة إدارة محتوى الصفحة الرئيسية — محتوى_الرئيسية)
// =========================================================================

interface HomeContentAdminManagerProps {
  blocks: HomeContentBlock[];
  onUpdateBlocks: (next: HomeContentBlock[]) => void;
  navbarControls?: HomeNavbarControls;
  onUpdateNavbarControls?: (next: HomeNavbarControls) => void;
  webhookUrl: string;
  coursePrograms?: CourseProgram[];
}

export const HomeContentAdminManager: React.FC<HomeContentAdminManagerProps> = ({
  blocks,
  onUpdateBlocks,
  navbarControls = DEFAULT_HOME_NAVBAR_CONTROLS,
  onUpdateNavbarControls,
  webhookUrl,
  coursePrograms = [],
}) => {
  const userBlocks = useMemo(() => stripSystemHomeBlocks(blocks), [blocks]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [blockType, setBlockType] = useState<HomeBlockType>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [buttonLabel, setButtonLabel] = useState('');
  const [badgeText, setBadgeText] = useState('');
  const [accentColor, setAccentColor] = useState<NonNullable<HomeContentBlock['accentColor']>>('emerald');
  const [enabled, setEnabled] = useState(true);
  const [targetProgramIds, setTargetProgramIds] = useState<string[]>([]);
  const [previewProgramFilter, setPreviewProgramFilter] = useState<string>('ALL');
  const [slides, setSlides] = useState<HomeSlideItem[]>([]);
  const [newSlideImg, setNewSlideImg] = useState('');
  const [newSlideCaption, setNewSlideCaption] = useState('');
  const [newSlideLink, setNewSlideLink] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [scriptSupported, setScriptSupported] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'warn' | 'error';
    message: string;
  } | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setBlockType('announcement');
    setTitle('');
    setBody('');
    setMediaUrl('');
    setLinkUrl('');
    setButtonLabel('');
    setBadgeText('');
    setAccentColor('emerald');
    setEnabled(true);
    setTargetProgramIds([]);
    setSlides([]);
    setNewSlideImg('');
    setNewSlideCaption('');
    setNewSlideLink('');
  };

  const handleEditBlock = (blk: HomeContentBlock) => {
    setEditingId(blk.id);
    setBlockType(blk.type);
    setTitle(blk.title);
    setBody(blk.body || '');
    setMediaUrl(blk.mediaUrl || '');
    setLinkUrl(blk.linkUrl || '');
    setButtonLabel(blk.buttonLabel || '');
    setBadgeText(blk.badgeText || '');
    setAccentColor(blk.accentColor || 'emerald');
    setEnabled(blk.enabled);
    setTargetProgramIds((blk.programIds || []).filter((id) => id && id !== 'all'));
    setSlides(blk.slides ? [...blk.slides] : []);
    setStatusBanner(null);
  };

  const handleToggleTargetProgram = (progId: string) => {
    setTargetProgramIds((prev) =>
      prev.includes(progId) ? prev.filter((id) => id !== progId) : [...prev, progId]
    );
  };

  const handleAddSlide = () => {
    const cleanImg = newSlideImg.trim();
    if (!cleanImg) return;
    setSlides((prev) => [
      ...prev,
      {
        imageUrl: cleanImg,
        caption: newSlideCaption.trim(),
        linkUrl: newSlideLink.trim(),
      },
    ]);
    setNewSlideImg('');
    setNewSlideCaption('');
    setNewSlideLink('');
  };

  const handleSaveBlockForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (blockType === 'slideshow' && slides.length === 0 && !newSlideImg.trim()) {
      setStatusBanner({
        type: 'error',
        message: 'أضف شريحة صورة واحدة على الأقل لمعرض الشرائح.',
      });
      return;
    }
    if (blockType !== 'slideshow' && !title.trim() && !body.trim() && !mediaUrl.trim()) {
      setStatusBanner({
        type: 'error',
        message: 'يرجى كتابة العنوان أو النص أو إدخال رابط الوسائط.',
      });
      return;
    }

    const finalSlides = [...slides];
    if (blockType === 'slideshow' && newSlideImg.trim()) {
      finalSlides.push({
        imageUrl: newSlideImg.trim(),
        caption: newSlideCaption.trim(),
        linkUrl: newSlideLink.trim(),
      });
    }

    const nextItem: HomeContentBlock = {
      id: editingId || `home_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: blockType,
      title: title.trim() || BLOCK_TYPE_META[blockType].labelAr,
      body: body.trim(),
      mediaUrl: mediaUrl.trim(),
      linkUrl: linkUrl.trim(),
      buttonLabel: buttonLabel.trim(),
      badgeText: badgeText.trim(),
      accentColor,
      slides: blockType === 'slideshow' ? finalSlides : [],
      enabled,
      sortOrder: editingId
        ? userBlocks.find((b) => b.id === editingId)?.sortOrder || userBlocks.length + 1
        : userBlocks.length + 1,
      programIds: targetProgramIds,
    };

    const nextList = editingId
      ? userBlocks.map((b) => (b.id === editingId ? nextItem : b))
      : [...userBlocks, nextItem];

    onUpdateBlocks(nextList.map((b, i) => ({ ...b, sortOrder: i + 1 })));
    resetForm();
    setStatusBanner({
      type: 'success',
      message: editingId
        ? 'تم تحديث العنصر في القائمة. اضغط «حفظ ومزامنة إلى الشيت» لاعتماده سحابياً.'
        : 'تمت إضافة العنصر بنجاح. اضغط «حفظ ومزامنة إلى الشيت» لاعتماده سحابياً.',
    });
  };

  const handleMoveBlock = (blockId: string, dir: -1 | 1) => {
    const index = userBlocks.findIndex((b) => b.id === blockId);
    if (index < 0) return;
    const target = index + dir;
    if (target < 0 || target >= userBlocks.length) return;
    const copy = [...userBlocks];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    onUpdateBlocks(copy.map((b, i) => ({ ...b, sortOrder: i + 1 })));
  };

  const handleToggleEnabled = (id: string) => {
    onUpdateBlocks(
      userBlocks.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b))
    );
  };

  const handleDeleteBlock = (id: string) => {
    const next = userBlocks
      .filter((b) => b.id !== id)
      .map((b, i) => ({ ...b, sortOrder: i + 1 }));
    onUpdateBlocks(next);
    setConfirmDeleteId(null);
    if (editingId === id) resetForm();
  };

  const handleToggleNavbarButton = async (key: keyof HomeNavbarControls) => {
    const nextControls: HomeNavbarControls = {
      ...navbarControls,
      [key]: !navbarControls[key],
    };
    onUpdateNavbarControls?.(nextControls);
    if (webhookUrl && webhookUrl.trim().startsWith('http')) {
      try {
        const merged = mergeHomeNavbarControlsIntoBlocks(userBlocks, nextControls);
        const res = await saveHomeContentToSheets(webhookUrl, merged);
        if (res.needsScriptUpdate) setScriptSupported(false);
        else if (res.cloudSaved) setScriptSupported(true);
      } catch {}
    }
  };

  const handleSyncToCloud = async () => {
    setIsSaving(true);
    setStatusBanner(null);
    try {
      const payloadBlocks = mergeHomeNavbarControlsIntoBlocks(userBlocks, navbarControls);
      const res = await saveHomeContentToSheets(webhookUrl, payloadBlocks);
      if (res.needsScriptUpdate) setScriptSupported(false);
      else if (res.cloudSaved) setScriptSupported(true);
      setStatusBanner({
        type: res.cloudSaved ? 'success' : res.needsScriptUpdate ? 'warn' : 'error',
        message: res.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePullFromCloud = async () => {
    if (!webhookUrl) {
      setStatusBanner({
        type: 'error',
        message: 'يرجى ضبط رابط Google Sheets Webhook أولاً.',
      });
      return;
    }
    setIsPulling(true);
    setStatusBanner(null);
    try {
      const res = await fetchHomeContentFromSheets(webhookUrl);
      setScriptSupported(res.scriptSupported);
      if (!res.scriptSupported) {
        setStatusBanner({
          type: 'warn',
          message: 'كود Google Apps Script المنشور قديم ولا يدعم ورقة «محتوى_الرئيسية» بعد.',
        });
      } else {
        const cleanBlocks = stripSystemHomeBlocks(res.blocks);
        const extractedControls = extractHomeNavbarControls(res.blocks);
        onUpdateBlocks(cleanBlocks);
        onUpdateNavbarControls?.(extractedControls);
        setStatusBanner({
          type: 'success',
          message: `تم جلب ${cleanBlocks.length} عناصر وإعدادات الشريط العلوي من ورقة «محتوى_الرئيسية» بنجاح!`,
        });
      }
    } finally {
      setIsPulling(false);
    }
  };

  const activeCount = userBlocks.filter((b) => b.enabled).length;

  return (
    <div className="space-y-5 font-cairo">
      {/* Header & Cloud Actions */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                إدارة محتوى الصفحة الرئيسية (ورقة محتوى_الرئيسية)
              </h2>
              <p className="text-xs text-slate-500">
                أضف إعلانات، معارض صور متحركة، فيديوهات تعريفية، وروابط سريعة لتظهر للطلاب أسفل بطاقة الترحيب والحضور.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-extrabold">
              المفعّل: {activeCount} / {userBlocks.length}
            </span>
            <button
              type="button"
              onClick={handlePullFromCloud}
              disabled={isPulling}
              className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isPulling ? 'animate-spin' : ''}`} />
              <span>جلب من الشيت</span>
            </button>
            <button
              type="button"
              onClick={handleSyncToCloud}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'جاري الحفظ...' : 'حفظ ومزامنة إلى الشيت'}</span>
            </button>
          </div>
        </div>

        {/* Navbar Visibility Controls (إظهار/إخفاء أزرار الشريط العلوي بأيقونة بدون نص) */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-extrabold text-slate-800">
              التحكم بإظهار أزرار الشريط العلوي للطلاب
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              اضغط على أيقونة العين لإظهار أو إخفاء كل زر في الشريط العلوي
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                {
                  key: 'showLessons' as const,
                  label: 'زر دروس',
                  icon: <BookOpen className="w-4 h-4 text-indigo-600" />,
                  activeCls: 'border-indigo-200 bg-white',
                  btnActiveCls: 'bg-indigo-600 text-white hover:bg-indigo-700',
                },
                {
                  key: 'showVideo' as const,
                  label: 'زر فيديو',
                  icon: <Film className="w-4 h-4 text-slate-800" />,
                  activeCls: 'border-slate-300 bg-white',
                  btnActiveCls: 'bg-slate-900 text-white hover:bg-slate-800',
                },
                {
                  key: 'showSchedule' as const,
                  label: 'زر جدول الدروس',
                  icon: <Calendar className="w-4 h-4 text-teal-600" />,
                  activeCls: 'border-teal-200 bg-white',
                  btnActiveCls: 'bg-teal-600 text-white hover:bg-teal-700',
                },
              ] as const
            ).map((item) => {
              const isVisible = Boolean(navbarControls[item.key]);
              return (
                <div
                  key={item.key}
                  className={`px-3.5 py-2.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                    isVisible ? item.activeCls : 'border-slate-200 bg-slate-100/70 opacity-85'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      {item.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 truncate">
                        {item.label}
                      </div>
                      <div className="text-[10px] font-bold text-slate-500">
                        {isVisible ? 'ظاهر في الشريط العلوي' : 'مخفي عن الطلاب'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleNavbarButton(item.key)}
                    title={isVisible ? `إخفاء ${item.label}` : `إظهار ${item.label}`}
                    aria-label={isVisible ? `إخفاء ${item.label}` : `إظهار ${item.label}`}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs ${
                      isVisible
                        ? item.btnActiveCls
                        : 'bg-white border border-slate-300 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {!scriptSupported && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              تحتاج إلى نسخ كود Google Apps Script المحدّث من تبويب إعدادات Google Sheets ونشر إصدار جديد (New version) لدعم ورقة «محتوى_الرئيسية».
            </span>
          </div>
        )}

        {statusBanner && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
              statusBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusBanner.type === 'warn'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{statusBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="p-1 opacity-60 hover:opacity-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Main Editor Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Form Builder */}
        <form
          onSubmit={handleSaveBlockForm}
          className="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4 h-fit"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-extrabold text-slate-900">
              {editingId ? 'تعديل كتلة محتوى' : 'إضافة كتلة محتوى جديدة'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                إلغاء التعديل
              </button>
            )}
          </div>

          {/* Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600">نوع المحتوى</label>
            <div className="grid grid-cols-2 gap-2">
              {(['announcement', 'slideshow', 'video', 'link'] as HomeBlockType[]).map((t) => {
                const active = blockType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBlockType(t)}
                    className={`p-2.5 rounded-xl border text-right text-xs font-extrabold transition-all cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {BLOCK_TYPE_META[t].labelAr}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500">{BLOCK_TYPE_META[blockType].descAr}</p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">العنوان</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: إعلان بدء المستوى الثاني..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">
              {blockType === 'slideshow' ? 'وصف مختصر (اختياري)' : 'النص / الوصف'}
            </label>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="اكتب نص الإعلان أو وصف الفيديو أو الرابط..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold resize-y"
            />
          </div>

          {blockType !== 'slideshow' && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">
                {blockType === 'video'
                  ? 'رابط الفيديو (YouTube أو Google Drive أو MP4)'
                  : 'رابط صورة مرفقة (اختياري — رابط مباشر أو Drive)'}
              </label>
              <input
                type="text"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder={
                  blockType === 'video'
                    ? 'https://www.youtube.com/watch?v=... أو رابط Drive'
                    : 'https://... أو رابط صورة Google Drive'
                }
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>
          )}

          {blockType === 'slideshow' && (
            <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-3">
              <div className="text-xs font-extrabold text-indigo-950">
                شرائح الصور ({slides.length})
              </div>
              {slides.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {slides.map((sl, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-xl bg-white border border-indigo-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <img
                          src={getDirectImageUrl(sl.imageUrl)}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 truncate">
                            {sl.caption || `شريحة ${idx + 1}`}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate font-mono" dir="ltr">
                            {sl.imageUrl}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSlides((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 pt-1 border-t border-indigo-200/70">
                <input
                  type="text"
                  value={newSlideImg}
                  onChange={(e) => setNewSlideImg(e.target.value)}
                  placeholder="رابط الصورة (مباشر أو Google Drive)"
                  dir="ltr"
                  className="w-full px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs font-mono"
                />
                <input
                  type="text"
                  value={newSlideCaption}
                  onChange={(e) => setNewSlideCaption(e.target.value)}
                  placeholder="تعليق أو عنوان فوق الشريحة (اختياري)"
                  className="w-full px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs"
                />
                <input
                  type="text"
                  value={newSlideLink}
                  onChange={(e) => setNewSlideLink(e.target.value)}
                  placeholder="رابط عند الضغط على الشريحة (اختياري https://...)"
                  dir="ltr"
                  className="w-full px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddSlide}
                  className="w-full py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  + إضافة شريحة إلى المعرض
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">الرابط الخارجي (اختياري)</label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">نص زر الرابط (اختياري)</label>
              <input
                type="text"
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                placeholder="مثال: افتح الملف"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">وسم / شارة (اختياري)</label>
              <input
                type="text"
                value={badgeText}
                onChange={(e) => setBadgeText(e.target.value)}
                placeholder="مثال: مهم / جديد"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600">لون البطاقة</label>
              <select
                value={accentColor}
                onChange={(e) =>
                  setAccentColor(e.target.value as NonNullable<HomeContentBlock['accentColor']>)
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
              >
                {(Object.keys(ACCENT_META) as NonNullable<HomeContentBlock['accentColor']>[]).map(
                  (c) => (
                    <option key={c} value={c}>
                      {ACCENT_META[c].labelAr}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Target Program Selector (جميع البرامج أو برنامج محدد) */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-200/80 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-extrabold text-indigo-950 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>البرنامج المستهدف (لمن يظهر هذا المحتوى؟)</span>
              </label>
              <span className="text-[10px] font-bold text-indigo-700">
                {targetProgramIds.length === 0 ? 'يظهر للجميع' : `${targetProgramIds.length} محدد`}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTargetProgramIds([])}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer ${
                  targetProgramIds.length === 0
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                جميع البرامج (افتراضي)
              </button>

              {coursePrograms.map((prog) => {
                const selected = targetProgramIds.includes(prog.id);
                const pCol = PROGRAM_COLOR_META[prog.color || 'emerald'];
                return (
                  <button
                    key={prog.id}
                    type="button"
                    onClick={() => handleToggleTargetProgram(prog.id)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold border flex items-center gap-1.5 transition-all cursor-pointer ${
                      selected
                        ? `${pCol.activeBtn} shadow-2xs`
                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        selected ? 'bg-white' : pCol.dotBg
                      }`}
                    />
                    <span>{prog.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
            <span className="text-xs font-extrabold text-slate-800">
              إظهار هذه الكتلة في الصفحة الرئيسية
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-5 h-5 text-emerald-600 rounded cursor-pointer"
            />
          </label>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{editingId ? 'تحديث العنصر في القائمة' : 'إضافة إلى القائمة'}</span>
          </button>
        </form>

        {/* Blocks List + Preview Filter + Live Order Controls */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                العناصر المضافة ({userBlocks.length})
              </h3>
              {previewProgramFilter !== 'ALL' && (
                <span className="text-[11px] font-bold text-indigo-700">
                  معاينة مفلترة — التعديل والحفظ يشمل كل العناصر
                </span>
              )}
            </div>

            {/* Preview Filter Bar by Program */}
            {coursePrograms.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <span className="text-[10px] font-extrabold text-slate-500 px-1">
                  فلتر المعاينة:
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewProgramFilter('ALL')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer transition-all ${
                    previewProgramFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  عرض الكل ({userBlocks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewProgramFilter('GENERAL')}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer transition-all ${
                    previewProgramFilter === 'GENERAL'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  العام فقط
                </button>
                {coursePrograms.map((prog) => {
                  const pCol = PROGRAM_COLOR_META[prog.color || 'emerald'];
                  const active = previewProgramFilter === prog.id;
                  return (
                    <button
                      key={prog.id}
                      type="button"
                      onClick={() => setPreviewProgramFilter(prog.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border cursor-pointer transition-all flex items-center gap-1 ${
                        active
                          ? pCol.activeBtn
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          active ? 'bg-white' : pCol.dotBg
                        }`}
                      />
                      <span>معاينة: {prog.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {(() => {
              const filteredBlocks = userBlocks.filter((blk) => {
                const targets = (blk.programIds || []).filter((id) => id && id !== 'all');
                if (previewProgramFilter === 'ALL') return true;
                if (previewProgramFilter === 'GENERAL') return targets.length === 0;
                return targets.length === 0 || targets.includes(previewProgramFilter);
              });

              if (filteredBlocks.length === 0) {
                return (
                  <div className="py-12 text-center text-xs font-bold text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    {userBlocks.length === 0
                      ? 'لا توجد عناصر مضافة في محتوى الصفحة الرئيسية بعد. أضف أول إعلان أو فيديو أو رابط من النموذج الجانبي.'
                      : 'لا توجد عناصر مطابقة لفلتر البرنامج المختار.'}
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredBlocks.map((blk) => {
                    const realIdx = userBlocks.findIndex((x) => x.id === blk.id);
                    const tMeta = BLOCK_TYPE_META[blk.type];
                    const isConfirming = confirmDeleteId === blk.id;
                    const targets = (blk.programIds || []).filter((id) => id && id !== 'all');
                    return (
                      <div
                        key={blk.id}
                        className={`p-4 rounded-2xl border transition-all space-y-2 ${
                          blk.enabled
                            ? 'bg-white border-slate-200 shadow-2xs'
                            : 'bg-slate-50/70 border-slate-200 opacity-65'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${tMeta.pillCls}`}>
                                {tMeta.labelAr}
                              </span>
                              {targets.length === 0 ? (
                                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                                  جميع البرامج
                                </span>
                              ) : (
                                targets.map((pid) => {
                                  const pObj = coursePrograms.find((p) => p.id === pid);
                                  const pCol = PROGRAM_COLOR_META[pObj?.color || 'indigo'];
                                  return (
                                    <span
                                      key={pid}
                                      className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold ${pCol.pillBg} ${pCol.pillText} ${pCol.pillBorder}`}
                                    >
                                      {pObj?.name || pid}
                                    </span>
                                  );
                                })
                              )}
                              {blk.badgeText && (
                                <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold">
                                  {blk.badgeText}
                                </span>
                              )}
                              {!blk.enabled && (
                                <span className="px-2 py-0.5 rounded-lg bg-slate-200 text-slate-600 text-[10px] font-bold">
                                  مخفي
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-extrabold text-slate-900">
                              {blk.title}
                            </div>
                            {blk.body && (
                              <div className="text-xs text-slate-600 line-clamp-2">{blk.body}</div>
                            )}
                            {blk.type === 'slideshow' && (
                              <div className="text-[11px] font-bold text-indigo-700">
                                عدد الشرائح: {blk.slides?.length || 0}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveBlock(blk.id, -1)}
                              disabled={realIdx <= 0}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 cursor-pointer"
                              title="تحريك للأعلى"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveBlock(blk.id, 1)}
                              disabled={realIdx < 0 || realIdx >= userBlocks.length - 1}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 cursor-pointer"
                              title="تحريك للأسفل"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleEnabled(blk.id)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                              title={blk.enabled ? 'إخفاء مؤقتاً' : 'إظهار'}
                            >
                              {blk.enabled ? (
                                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditBlock(blk)}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 cursor-pointer"
                              title="تعديل"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {isConfirming ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBlock(blk.id)}
                                  className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold cursor-pointer"
                                >
                                  تأكيد
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
                                >
                                  لا
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(blk.id)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
