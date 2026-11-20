import React, { useEffect, useMemo, useState } from 'react';
import {
  Languages,
  Sparkles,
  Save,
  Check,
  Search,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
  Film,
} from 'lucide-react';
import {
  TranslationItem,
  translateBatchWithAI,
  translateSingleWithAI,
} from '../../utils/translations';
import {
  ensureTranslationsSheet,
  saveTranslationsToSheets,
} from '../../utils/googleSheets';
import { VideoLesson, buildAllVideoTranslationItems } from '../videoSheets';

interface VideoTranslationManagerProps {
  translations: TranslationItem[];
  onSaveTranslations: (updated: TranslationItem[]) => void;
  videoLessons: VideoLesson[];
  geminiApiKey?: string;
  webhookUrl?: string;
  onRefreshFromSheets?: () => Promise<void>;
}

export const VideoTranslationManager: React.FC<VideoTranslationManagerProps> = ({
  translations,
  onSaveTranslations,
  videoLessons,
  geminiApiKey,
  webhookUrl,
  onRefreshFromSheets,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const [videoItems, setVideoItems] = useState<TranslationItem[]>(() =>
    buildAllVideoTranslationItems(videoLessons, translations)
  );

  useEffect(() => {
    setVideoItems(buildAllVideoTranslationItems(videoLessons, translations));
  }, [translations, videoLessons]);

  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [isSyncingToSheets, setIsSyncingToSheets] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return videoItems;
    return videoItems.filter(
      (i) =>
        i.id.toLowerCase().includes(q) ||
        i.ar.toLowerCase().includes(q) ||
        i.th.toLowerCase().includes(q) ||
        i.en.toLowerCase().includes(q)
    );
  }, [videoItems, searchQuery]);

  const handleUpdateItem = (id: string, patch: Partial<TranslationItem>) => {
    setVideoItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const handleTranslateSingle = async (item: TranslationItem) => {
    if (!item.ar.trim()) return;
    setTranslatingId(item.id);
    try {
      const res = await translateSingleWithAI(item.ar, geminiApiKey);
      handleUpdateItem(item.id, {
        th: res.th || item.th,
        en: res.en || item.en,
      });
    } finally {
      setTranslatingId(null);
    }
  };

  const handleTranslateAll = async () => {
    const targets = filteredItems.filter((i) => i.ar.trim());
    if (targets.length === 0) return;
    setIsBatchTranslating(true);
    setStatusMessage(`جاري ترجمة ${targets.length} نصاً بالذكاء الاصطناعي...`);
    try {
      const results = await translateBatchWithAI(
        targets.map((i) => ({ id: i.id, text: i.ar })),
        geminiApiKey
      );
      setVideoItems((prev) =>
        prev.map((item) => {
          const r = results[item.id];
          if (!r) return item;
          return {
            ...item,
            th: r.th || item.th,
            en: r.en || item.en,
          };
        })
      );
      setStatusMessage('تمت ترجمة نصوص قسم الفيديو بنجاح. اضغط «حفظ ومزامنة» لتثبيتها.');
    } finally {
      setIsBatchTranslating(false);
    }
  };

  const handleSaveAndSync = async () => {
    const map = new Map<string, TranslationItem>();
    translations.forEach((i) => map.set(i.id, i));
    videoItems.forEach((i) => map.set(i.id, i));
    const merged = Array.from(map.values());

    onSaveTranslations(merged);
    setSavedSuccess(true);
    window.setTimeout(() => setSavedSuccess(false), 2000);

    if (webhookUrl && webhookUrl.trim().startsWith('http')) {
      setIsSyncingToSheets(true);
      try {
        await ensureTranslationsSheet(webhookUrl, merged);
        const res = await saveTranslationsToSheets(webhookUrl, merged);
        setStatusMessage(res.message);
      } finally {
        setIsSyncingToSheets(false);
      }
    } else {
      setStatusMessage('تم حفظ ترجمات الفيديو محلياً.');
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-5 font-cairo">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            <Languages className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              إدارة وتخصيص الترجمة — قسم الفيديو التفاعلي و QR
            </h2>
            <p className="text-xs text-slate-500">
              تخصيص نصوص واجهة الفيديو وقارئ البطاقات باللغات (العربية · التايلاندية · الإنجليزية)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefreshFromSheets && (
            <button
              type="button"
              onClick={onRefreshFromSheets}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث</span>
            </button>
          )}
          <button
            type="button"
            disabled={isBatchTranslating}
            onClick={handleTranslateAll}
            className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            {isBatchTranslating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>ترجمة الكل بالذكاء الاصطناعي</span>
          </button>
          <button
            type="button"
            disabled={isSyncingToSheets}
            onClick={handleSaveAndSync}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
          >
            {savedSuccess ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span>{isSyncingToSheets ? 'جاري الحفظ...' : 'حفظ ومزامنة ورقة الترجمة'}</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-900 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="بحث في نصوص الفيديو التفاعلي..."
          className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold"
        />
      </div>

      <div className="space-y-3">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-2 font-mono">
                <Film className="w-3.5 h-3.5 text-indigo-500" />
                <span>{item.id}</span>
                {item.sheetSourceNote && <span>· {item.sheetSourceNote}</span>}
              </div>
              <button
                type="button"
                disabled={translatingId === item.id}
                onClick={() => handleTranslateSingle(item)}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
              >
                {translatingId === item.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                <span>ترجمة آلية</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">العربية</label>
                <input
                  type="text"
                  value={item.ar}
                  onChange={(e) => handleUpdateItem(item.id, { ar: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">التايلاندية (ไทย)</label>
                <input
                  type="text"
                  value={item.th}
                  onChange={(e) => handleUpdateItem(item.id, { th: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">الإنجليزية (English)</label>
                <input
                  type="text"
                  value={item.en}
                  onChange={(e) => handleUpdateItem(item.id, { en: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                  dir="ltr"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
