import React, { useState, useEffect, useMemo } from 'react';
import { DrawingTemplate } from '../types/drawing';
import { StudentRegistrant, WritingHistoryItem } from '../../types';
import { getRetryStatus } from '../../utils/retryLimit';
import { audioService } from '../services/audioService';
import { formatDirectImageUrl } from '../utils/urlHelper';
import {
  SupportedLang,
  TranslationItem,
  DEFAULT_TRANSLATIONS,
  getTranslatedString,
  getTranslatedWritingTopic,
  getTranslatedWritingCategory,
  getTranslatedWritingLessonTitle,
  getTranslatedWritingDifficulty,
} from '../../utils/translations';
import {
  X,
  Search,
  BookOpen,
  Volume2,
  LayoutList,
  LayoutGrid,
  Repeat,
  Image as ImageIcon,
  Eye,
  EyeOff,
  RotateCcw,
  Lock,
  CheckCircle2,
} from 'lucide-react';

interface TemplateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTemplate: DrawingTemplate | null;
  onSelectTemplate: (template: DrawingTemplate, isRetry?: boolean) => void;
  onAddCustomTemplate?: (template: DrawingTemplate) => void;
  templates?: DrawingTemplate[];
  writingHistory?: WritingHistoryItem[];
  currentStudent?: StudentRegistrant | null;
  currentLang?: SupportedLang;
  translations?: TranslationItem[];
}

export function buildWritingRetryKey(tpl: DrawingTemplate): string {
  const topic = (tpl.topic || 'خط النسخ').trim();
  const title = (tpl.title || '').trim();
  return `${topic}::${title || `slot-${tpl.slotIndex || 1}`}`;
}

export function findWritingCompletedScore(
  tpl: DrawingTemplate,
  writingHistory: WritingHistoryItem[] = []
): number | undefined {
  if (!writingHistory.length) return undefined;
  const cleanTopic = (tpl.topic || 'خط النسخ').trim();
  const cleanTitle = (tpl.title || '').trim();
  const record = writingHistory.find((h) => (h.topic || '').trim() === cleanTopic);
  if (!record || !Array.isArray(record.exercises)) return undefined;

  const found = record.exercises.find((ex) => {
    const exTitle = (ex.title || '').trim();
    if (cleanTitle && exTitle && exTitle === cleanTitle) return true;
    if (tpl.slotIndex && ex.slotIndex === tpl.slotIndex && (!exTitle || !cleanTitle)) return true;
    return false;
  });
  return found ? found.score : undefined;
}

export const TemplateLibraryModal: React.FC<TemplateLibraryModalProps> = ({
  isOpen,
  onClose,
  selectedTemplate,
  onSelectTemplate,
  templates = [],
  writingHistory = [],
  currentStudent = null,
  currentLang = 'ar',
  translations = DEFAULT_TRANSLATIONS,
}) => {
  const allTemplates = templates || [];
  const tr = (id: string, fallback: string) =>
    getTranslatedString(id, currentLang, translations, fallback) || fallback;

  // View mode: 'list' (default as requested) or 'grid' (cards)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState<boolean>(false);

  // Extract unique topics
  const topics = Array.from(
    new Set(allTemplates.map(t => (t.topic || 'خط النسخ (الأساسيات)').trim()))
  ).filter(Boolean);

  const [selectedTopic, setSelectedTopic] = useState<string>(() => {
    return topics.length > 0 ? topics[0] : '';
  });

  // Keep selectedTopic valid
  useEffect(() => {
    if (topics.length > 0 && (!selectedTopic || !topics.includes(selectedTopic))) {
      setSelectedTopic(topics[0]);
    }
  }, [topics, selectedTopic]);

  // Lessons under the selected topic
  const lessonsInTopic = allTemplates.filter(
    t => (t.topic || 'خط النسخ (الأساسيات)').trim() === selectedTopic
  );

  // Extract unique categories within this topic (NO "الكل" tab as requested)
  const categoriesInTopic = Array.from(
    new Set(lessonsInTopic.map(t => (t.category || 'حروف').trim()))
  ).filter(Boolean);

  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // When selected topic changes, set selectedCategory to the first available category
  useEffect(() => {
    if (categoriesInTopic.length > 0) {
      if (!selectedCategory || !categoriesInTopic.includes(selectedCategory)) {
        setSelectedCategory(categoriesInTopic[0]);
      }
    } else {
      setSelectedCategory('حروف');
    }
  }, [selectedTopic, categoriesInTopic, selectedCategory]);

  // Precompute completion scores for templates in the selected topic
  const scoresByTemplateId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tpl of lessonsInTopic) {
      const s = findWritingCompletedScore(tpl, writingHistory);
      if (s !== undefined) {
        map[tpl.id] = s;
      }
    }
    return map;
  }, [lessonsInTopic, writingHistory]);

  if (!isOpen) return null;

  const lessonsInCategory = lessonsInTopic.filter(
    tpl => (tpl.category || 'حروف').trim() === selectedCategory
  );

  // Filter lessons in selected topic and category (hiding completed unless showCompleted is toggled on)
  const filteredLessons = lessonsInCategory
    .filter(tpl => showCompleted || scoresByTemplateId[tpl.id] === undefined)
    .filter(tpl => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const translatedTitle = getTranslatedWritingLessonTitle(
        tpl.topic || 'خط النسخ',
        tpl.title,
        tpl.slotIndex,
        currentLang,
        translations,
        tpl.titleEn
      );
      const translatedTopic = getTranslatedWritingTopic(
        tpl.topic || 'خط النسخ',
        currentLang,
        translations
      );
      const translatedCat = getTranslatedWritingCategory(
        tpl.category || 'حروف',
        currentLang,
        translations
      );
      return (
        tpl.title.toLowerCase().includes(q) ||
        translatedTitle.toLowerCase().includes(q) ||
        translatedTopic.toLowerCase().includes(q) ||
        translatedCat.toLowerCase().includes(q) ||
        (tpl.titleEn && tpl.titleEn.toLowerCase().includes(q)) ||
        (tpl.description && tpl.description.toLowerCase().includes(q)) ||
        (tpl.arabicAudioText && tpl.arabicAudioText.toLowerCase().includes(q))
      );
    });

  const hasHiddenCompleted =
    !showCompleted &&
    !searchQuery.trim() &&
    lessonsInCategory.length > 0 &&
    filteredLessons.length === 0;

  const handleChooseLesson = (item: DrawingTemplate, isRetry = false) => {
    onSelectTemplate(item, isRetry);
    onClose();
  };

  const translatedSelectedCat = getTranslatedWritingCategory(
    selectedCategory,
    currentLang,
    translations
  );

  return (
    <div
      dir={currentLang === 'ar' ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[90] flex items-center justify-center p-2.5 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-4xl max-h-[90dvh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold font-ruqaa text-amber-400 flex items-center gap-2">
                <span>{tr('writing_lib_title', 'الدروس')}</span>
              </h2>
              <p className="text-xs text-slate-400">
                {tr('writing_lib_subtitle', 'اختر درساً للشف والتمرن على السبورة التفاعلية أو بكاميرا الواقع المعزز AR')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle Button: List vs Cards (Grid) */}
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              title={viewMode === 'list' ? tr('writing_lib_view_grid', 'عرض البطاقات') : tr('writing_lib_view_list', 'عرض القائمة')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
            >
              {viewMode === 'list' ? (
                <>
                  <LayoutGrid className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">{tr('writing_lib_view_grid', 'عرض البطاقات')}</span>
                </>
              ) : (
                <>
                  <LayoutList className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">{tr('writing_lib_view_list', 'عرض القائمة')}</span>
                </>
              )}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              title={tr('writing_toolbar_close', 'إغلاق')}
              aria-label={tr('writing_toolbar_close', 'إغلاق')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 1. Topics Dropdown + Eye Toggle & Search Bar */}
        <div className="p-4 sm:px-6 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Topics Dropdown + Show/Hide Completed Eye Toggle */}
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-bold text-amber-400 shrink-0">
              {tr('writing_lib_topic_label', 'موضوع الدرس:')}
            </span>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="flex-1 max-w-xs px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs sm:text-sm text-slate-100 font-bold focus:outline-hidden focus:border-amber-500 cursor-pointer"
            >
              {topics.map(top => (
                <option key={top} value={top}>
                  {getTranslatedWritingTopic(top, currentLang, translations)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowCompleted((prev) => !prev)}
              title={
                showCompleted
                  ? tr('writing_lib_hide_completed_tooltip', 'إخفاء الدروس التي تم تسجيل إجابتها')
                  : tr('writing_lib_show_completed_tooltip', 'إظهار الدروس التي تم تسجيل إجابتها')
              }
              aria-label={
                showCompleted
                  ? tr('writing_lib_hide_completed_tooltip', 'إخفاء الدروس التي تم تسجيل إجابتها')
                  : tr('writing_lib_show_completed_tooltip', 'إظهار الدروس التي تم تسجيل إجابتها')
              }
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                showCompleted
                  ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {showCompleted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px]">
            <Search
              className={`w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 text-slate-400 ${
                currentLang === 'ar' ? 'right-3' : 'left-3'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('writing_lib_search_placeholder', 'ابحث عن درس أو حرف...')}
              className={`w-full py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-amber-500 ${
                currentLang === 'ar' ? 'pl-3 pr-8' : 'pr-3 pl-8'
              }`}
            />
          </div>
        </div>

        {/* 2. Category Tabs (Filtered by selected topic - NO 'الكل' tab) */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="text-xs text-slate-400 font-semibold mx-1 shrink-0">
            {tr('writing_lib_categories_label', 'الفئات:')}
          </span>
          {categoriesInTopic.map(cat => {
            const inCat = lessonsInTopic.filter(l => (l.category || 'حروف').trim() === cat);
            const visibleCount = showCompleted
              ? inCat.length
              : inCat.filter(l => scoresByTemplateId[l.id] === undefined).length;
            const isCatActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  isCatActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <span>{getTranslatedWritingCategory(cat, currentLang, translations)}</span>
                <span className="text-[10px] opacity-75">({visibleCount})</span>
              </button>
            );
          })}
        </div>

        {/* 3. Lessons View (List by default, or Grid/Cards) */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {viewMode === 'list' ? (
            /* =================== LIST VIEW (DEFAULT) =================== */
            <div className="flex flex-col gap-2.5">
              {filteredLessons.map(item => {
                const isSelected = selectedTemplate?.id === item.id;
                const directUrl = formatDirectImageUrl(item.imageUrl);
                const score = scoresByTemplateId[item.id];
                const isCompleted = score !== undefined;
                const retryKey = buildWritingRetryKey(item);
                const retryStatus = getRetryStatus('writing', currentStudent, retryKey, item);
                const canRetry = retryStatus.canRetry;
                const displayTitle = getTranslatedWritingLessonTitle(
                  item.topic || 'خط النسخ',
                  item.title,
                  item.slotIndex,
                  currentLang,
                  translations,
                  item.titleEn
                );
                const displayDifficulty = getTranslatedWritingDifficulty(
                  item.difficulty,
                  currentLang,
                  translations
                );

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isCompleted && !canRetry) return;
                      handleChooseLesson(item, isCompleted && canRetry);
                    }}
                    className={`group p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isCompleted && !canRetry
                        ? 'bg-emerald-950/30 border-emerald-500/30 opacity-90 cursor-default'
                        : isCompleted
                        ? 'bg-emerald-950/35 hover:bg-emerald-950/50 border-emerald-500/40 cursor-pointer'
                        : isSelected
                        ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] cursor-pointer'
                        : 'bg-slate-900/70 hover:bg-slate-800 border-slate-800 hover:border-slate-700 cursor-pointer'
                    }`}
                  >
                    {/* Start side: Thumbnail + Title & Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Thumbnail on Crisp White Background for Black Calligraphy */}
                      <div className="w-14 h-14 rounded-xl bg-white border border-slate-300 shadow-inner flex items-center justify-center p-1.5 shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
                        {directUrl ? (
                          <img
                            src={directUrl}
                            alt={displayTitle}
                            className="max-h-full max-w-full object-contain filter drop-shadow"
                            crossOrigin="anonymous"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : item.svgData ? (
                          <div
                            className="w-full h-full flex items-center justify-center text-slate-950 [&>svg]:max-h-full [&>svg]:max-w-full [&>svg]:w-auto [&>svg]:h-auto"
                            dangerouslySetInnerHTML={{ __html: item.svgData }}
                          />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        )}
                      </div>

                      {/* Title & Arabic Pronunciation Preview */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-400 transition-colors truncate">
                            {displayTitle}
                          </h3>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                              {tr('writing_lib_selected_badge', 'محدد حالياً')}
                            </span>
                          )}
                          {isCompleted && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                                score >= 85
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : score >= 70
                                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}
                            >
                              {score}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {item.arabicAudioText ? (
                            <span dir="rtl" className="inline-block">{item.arabicAudioText}</span>
                          ) : (
                            item.description || tr('writing_lib_default_desc', 'تمرين شف وكتابة على السبورة')
                          )}
                        </p>
                      </div>
                    </div>

                    {/* End side: Badges, Retry / Lock & Audio Pronounce */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Repeat Count */}
                      <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-amber-400 text-[11px] font-bold">
                        <Repeat className="w-3 h-3" />
                        <span>
                          {tr('writing_lib_repeat_prefix', 'التكرار: {count}').replace(
                            '{count}',
                            String(item.repeatCount || 1)
                          )}
                        </span>
                      </div>

                      {/* Difficulty */}
                      <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold border border-slate-700">
                        {displayDifficulty}
                      </span>

                      {isCompleted && !retryStatus.isUnlimited && retryStatus.maxRetries > 0 && (
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold border ${
                            canRetry
                              ? 'bg-slate-950 text-slate-300 border-slate-700'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                          title={
                            canRetry
                              ? tr('writing_lib_retry_remaining', 'متبقٍ {remaining} من {max}')
                                  .replace('{remaining}', String(retryStatus.remainingRetries))
                                  .replace('{max}', String(retryStatus.maxRetries))
                              : tr('writing_lib_retry_max_reached', 'وصلت للحد الأقصى لمحاولات الإعادة ({used} من {max})')
                                  .replace('{used}', String(retryStatus.usedRetries))
                                  .replace('{max}', String(retryStatus.maxRetries))
                          }
                        >
                          {canRetry
                            ? `${retryStatus.remainingRetries}/${retryStatus.maxRetries}`
                            : `${retryStatus.usedRetries}/${retryStatus.maxRetries}`}
                        </span>
                      )}

                      {isCompleted && (
                        canRetry ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChooseLesson(item, true);
                            }}
                            title={
                              retryStatus.isUnlimited
                                ? tr('writing_lib_retry_btn', 'إعادة التمرين')
                                : `${tr('writing_lib_retry_btn', 'إعادة التمرين')} (${tr('writing_lib_retry_remaining', 'متبقٍ {remaining} من {max}')
                                    .replace('{remaining}', String(retryStatus.remainingRetries))
                                    .replace('{max}', String(retryStatus.maxRetries))})`
                            }
                            aria-label={tr('writing_lib_retry_btn', 'إعادة التمرين')}
                            className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 transition-all cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <span
                            onClick={(e) => e.stopPropagation()}
                            title={
                              retryStatus.maxRetries > 0
                                ? tr('writing_lib_retry_max_reached', 'وصلت للحد الأقصى لمحاولات الإعادة ({used} من {max})')
                                    .replace('{used}', String(retryStatus.usedRetries))
                                    .replace('{max}', String(retryStatus.maxRetries))
                                : tr('writing_lib_retry_locked_lesson', 'الإعادة مغلقة لهذا الدرس')
                            }
                            aria-label={tr('writing_lib_retry_locked', 'الإعادة مغلقة')}
                            className="p-2 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center"
                          >
                            <Lock className="w-4 h-4" />
                          </span>
                        )
                      )}

                      {/* Listen button (always Arabic TTS) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          audioService.speakArabic(item.arabicAudioText || item.title);
                        }}
                        title={tr('writing_lib_listen_tooltip', 'استمع للنطق')}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition-all cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* =================== CARDS / GRID VIEW =================== */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {filteredLessons.map(item => {
                const isSelected = selectedTemplate?.id === item.id;
                const directUrl = formatDirectImageUrl(item.imageUrl);
                const score = scoresByTemplateId[item.id];
                const isCompleted = score !== undefined;
                const retryKey = buildWritingRetryKey(item);
                const retryStatus = getRetryStatus('writing', currentStudent, retryKey, item);
                const canRetry = retryStatus.canRetry;
                const displayTitle = getTranslatedWritingLessonTitle(
                  item.topic || 'خط النسخ',
                  item.title,
                  item.slotIndex,
                  currentLang,
                  translations,
                  item.titleEn
                );
                const displayDifficulty = getTranslatedWritingDifficulty(
                  item.difficulty,
                  currentLang,
                  translations
                );

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (isCompleted && !canRetry) return;
                      handleChooseLesson(item, isCompleted && canRetry);
                    }}
                    className={`group relative p-3 sm:p-4 rounded-2xl border transition-all flex flex-col items-center justify-between text-center ${
                      isCompleted && !canRetry
                        ? 'bg-emerald-950/30 border-emerald-500/30 opacity-90 cursor-default'
                        : isCompleted
                        ? 'bg-emerald-950/35 hover:bg-emerald-950/50 border-emerald-500/40 cursor-pointer'
                        : isSelected
                        ? 'bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.25)] cursor-pointer'
                        : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600 cursor-pointer'
                    }`}
                  >
                    {/* Thumbnail Preview on Crisp White Background */}
                    <div className="relative w-full aspect-square rounded-2xl bg-white border border-slate-300 shadow-inner flex items-center justify-center p-3 mb-2.5 overflow-hidden group-hover:scale-105 transition-transform duration-200">
                      {directUrl ? (
                        <img
                          src={directUrl}
                          alt={displayTitle}
                          className="max-h-full max-w-full object-contain filter drop-shadow"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : item.svgData ? (
                        <div
                          className="w-full h-full flex items-center justify-center text-slate-950 [&>svg]:w-full [&>svg]:h-full [&>svg]:max-h-full"
                          dangerouslySetInnerHTML={{ __html: item.svgData }}
                        />
                      ) : (
                        <ImageIcon className="w-8 h-8 text-slate-400" />
                      )}

                      {/* Repeat count badge */}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-slate-900/90 text-amber-400 border border-slate-700 text-[10px] font-bold flex items-center gap-1">
                        <Repeat className="w-2.5 h-2.5" />
                        <span>{item.repeatCount || 1}</span>
                      </div>

                      {/* Completed Score Badge */}
                      {isCompleted && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold shadow">
                          {score}%
                        </div>
                      )}

                      {/* Audio Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          audioService.speakArabic(item.arabicAudioText || item.title);
                        }}
                        title={tr('writing_lib_listen_tooltip', 'استمع للنطق')}
                        className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-slate-900/80 hover:bg-amber-500 hover:text-slate-950 text-slate-300 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Title */}
                    <div className="w-full">
                      <h3 className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-amber-400 transition-colors line-clamp-1">
                        {displayTitle}
                      </h3>
                      <p dir="rtl" className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                        {item.arabicAudioText || item.title}
                      </p>
                    </div>

                    {/* Difficulty & Retry Footer */}
                    <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-amber-400 border border-slate-700">
                        {displayDifficulty}
                      </span>

                      {isCompleted && !retryStatus.isUnlimited && retryStatus.maxRetries > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-700">
                          {canRetry
                            ? `${retryStatus.remainingRetries}/${retryStatus.maxRetries}`
                            : `${retryStatus.usedRetries}/${retryStatus.maxRetries}`}
                        </span>
                      )}

                      {isCompleted && (
                        canRetry ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChooseLesson(item, true);
                            }}
                            title={tr('writing_lib_retry_btn', 'إعادة التمرين')}
                            className="p-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        ) : (
                          <span
                            onClick={(e) => e.stopPropagation()}
                            title={tr('writing_lib_retry_locked', 'الإعادة مغلقة')}
                            className="p-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700"
                          >
                            <Lock className="w-3 h-3" />
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasHiddenCompleted ? (
            <div className="p-10 text-center">
              <div className="inline-flex flex-col items-center gap-2 max-w-md mx-auto p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                <p className="text-xs sm:text-sm font-bold leading-relaxed">
                  {tr('writing_lib_all_completed', 'أتممت جميع دروس هذه الفئة! اضغط على أيقونة العين أعلاه لإظهارها أو إعادتها.')}
                </p>
              </div>
            </div>
          ) : filteredLessons.length === 0 && (
            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-slate-500" />
              <p className="text-sm font-bold text-slate-300">
                {allTemplates.length === 0
                  ? tr('writing_lib_no_lessons', 'لا توجد دروس مضافة بعد في تمرين الكتابة')
                  : tr('writing_lib_no_lessons_in_cat', 'لا توجد دروس في الفئة "{category}"').replace(
                      '{category}',
                      translatedSelectedCat
                    )}
              </p>
              <p className="text-xs text-slate-500">
                {allTemplates.length === 0
                  ? tr('writing_lib_no_lessons_hint', 'يمكنك إضافة الدروس من لوحة الإدارة في تبويب «تمرين الكتابة» أو مزامنتها من ورقة ArabicLessons.')
                  : tr('writing_lib_switch_cat_hint', 'يمكنك التبديل إلى فئة أخرى أو اختيار موضوع مختلف من القائمة بالأعلى.')}
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
