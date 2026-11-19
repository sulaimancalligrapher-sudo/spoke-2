import React, { useEffect, useMemo, useState } from 'react';
import {
  TranslationItem,
  DEFAULT_TRANSLATIONS,
  translateSingleWithAI,
  translateBatchWithAI,
  getCatchSubjectTranslationId,
  getCatchQuestionTranslationId,
} from '../utils/translations';
import { CatchLessonSubject } from '../types';
import { getQuestionPlainText, parseQuestionBlocks } from '../utils/matchingMedia';
import {
  ensureTranslationsSheet,
  saveTranslationsToSheets,
} from '../utils/googleSheets';
import {
  Languages,
  Sparkles,
  Save,
  Check,
  Search,
  RefreshCw,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  HelpCircle,
  Target,
  Image as ImageIcon,
  Volume2,
} from 'lucide-react';

interface CatchTranslationManagerProps {
  translations: TranslationItem[];
  onSaveTranslations: (updated: TranslationItem[]) => void;
  catchSubjects: CatchLessonSubject[];
  geminiApiKey?: string;
  webhookUrl?: string;
  onRefreshFromSheets?: () => Promise<void>;
}

type CatchTransSubTab = 'ui' | 'subjects' | 'questions';

export const CatchTranslationManager: React.FC<CatchTranslationManagerProps> = ({
  translations,
  onSaveTranslations,
  catchSubjects,
  geminiApiKey,
  webhookUrl,
  onRefreshFromSheets,
}) => {
  const [subTab, setSubTab] = useState<CatchTransSubTab>('ui');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

  const buildCatchItems = (
    baseList: TranslationItem[],
    subjects: CatchLessonSubject[]
  ): TranslationItem[] => {
    const map = new Map<string, TranslationItem>();

    // 1. Default Catch UI items
    DEFAULT_TRANSLATIONS.filter((d) => d.category === 'catch').forEach((d) => {
      map.set(d.id, d);
    });

    // 2. Overlay any saved catch items from baseList
    baseList.forEach((item) => {
      if (
        item.category === 'catch' ||
        item.id.startsWith('catch_') ||
        item.id.startsWith('stats_catch_') ||
        item.id === 'stats_tab_catch'
      ) {
        const existing = map.get(item.id);
        map.set(
          item.id,
          existing
            ? {
                ...existing,
                ar: item.ar !== undefined ? item.ar : existing.ar,
                th: item.th !== undefined ? item.th : existing.th,
                en: item.en !== undefined ? item.en : existing.en,
              }
            : { ...item, category: 'catch' }
        );
      }
    });

    // 3. Dynamic Subject names & Question plain text from sheet "صيد"
    subjects.forEach((subj) => {
      const cleanName = (subj.subjectName || '').trim();
      if (!cleanName) return;

      const subjId = getCatchSubjectTranslationId(cleanName);
      const existingSubj = map.get(subjId);
      const subjNote = `موضوع درس صيد (${subj.exercises.length} تمارين)`;
      if (!existingSubj) {
        map.set(subjId, {
          id: subjId,
          category: 'catch',
          categoryLabel: 'أسماء مواضيع دروس الصيد (صيد)',
          ar: cleanName,
          th: '',
          en: '',
          isSheetLinked: true,
          sheetSourceNote: subjNote,
        });
      } else {
        map.set(subjId, {
          ...existingSubj,
          category: 'catch',
          categoryLabel: 'أسماء مواضيع دروس الصيد (صيد)',
          isSheetLinked: true,
          sheetSourceNote: subjNote,
          ar: existingSubj.ar?.trim() ? existingSubj.ar : cleanName,
        });
      }

      // 4. Question prompt texts per exercise (floating Arabic letter/word bubbles stay in Arabic!)
      subj.exercises.forEach((ex) => {
        const plainQ = getQuestionPlainText(ex.questionText);
        const hasTextBlock = parseQuestionBlocks(ex.questionText).some(
          (b) => b.type === 'text' && b.value.trim()
        );
        if (!hasTextBlock || !plainQ) return;

        const qId = getCatchQuestionTranslationId(cleanName, ex.exerciseNumber);
        const existingQ = map.get(qId);
        const qNote = `[${cleanName}] تمرين ${ex.exerciseNumber}`;
        if (!existingQ) {
          map.set(qId, {
            id: qId,
            category: 'catch',
            categoryLabel: 'نصوص أسئلة تحدي الصيد (صيد)',
            ar: plainQ,
            th: '',
            en: '',
            isSheetLinked: true,
            sheetSourceNote: qNote,
          });
        } else {
          map.set(qId, {
            ...existingQ,
            category: 'catch',
            categoryLabel: 'نصوص أسئلة تحدي الصيد (صيد)',
            isSheetLinked: true,
            sheetSourceNote: qNote,
            ar: existingQ.ar?.trim() ? existingQ.ar : plainQ,
          });
        }
      });
    });

    return Array.from(map.values());
  };

  const [catchItems, setCatchItems] = useState<TranslationItem[]>(() =>
    buildCatchItems(translations, catchSubjects)
  );

  useEffect(() => {
    setCatchItems(buildCatchItems(translations, catchSubjects));
  }, [translations, catchSubjects]);

  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [isSyncingToSheets, setIsSyncingToSheets] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sheetSyncStatus, setSheetSyncStatus] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const uiItems = useMemo(
    () =>
      catchItems.filter(
        (i) => !i.id.startsWith('catch_subj_') && !i.id.startsWith('catch_q_')
      ),
    [catchItems]
  );

  const subjectItems = useMemo(
    () => catchItems.filter((i) => i.id.startsWith('catch_subj_')),
    [catchItems]
  );

  const questionItems = useMemo(
    () => catchItems.filter((i) => i.id.startsWith('catch_q_')),
    [catchItems]
  );

  const currentTabItems = useMemo(() => {
    let list =
      subTab === 'ui'
        ? uiItems
        : subTab === 'subjects'
        ? subjectItems
        : questionItems;

    if (subTab === 'questions' && selectedSubjectFilter !== 'all') {
      list = list.filter(
        (i) =>
          i.sheetSourceNote &&
          i.sheetSourceNote.includes(`[${selectedSubjectFilter}]`)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.id.toLowerCase().includes(q) ||
          item.ar.toLowerCase().includes(q) ||
          item.th.toLowerCase().includes(q) ||
          item.en.toLowerCase().includes(q) ||
          (item.sheetSourceNote && item.sheetSourceNote.toLowerCase().includes(q))
      );
    }

    return list;
  }, [subTab, uiItems, subjectItems, questionItems, selectedSubjectFilter, searchQuery]);

  const mergeWithPrimaryTranslations = (nextCatch: TranslationItem[]): TranslationItem[] => {
    const map = new Map<string, TranslationItem>();
    translations.forEach((item) => map.set(item.id, item));
    nextCatch.forEach((item) => map.set(item.id, item));
    return Array.from(map.values());
  };

  const handleUpdateItem = (id: string, patch: Partial<TranslationItem>) => {
    setCatchItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleTranslateSingle = async (item: TranslationItem) => {
    if (!item.ar || !item.ar.trim()) {
      alert('يرجى وجود النص العربي أولاً ليتم ترجمته بالذكاء الاصطناعي.');
      return;
    }
    setTranslatingId(item.id);
    setStatusMessage('جاري استدعاء الذكاء الاصطناعي لترجمة النص...');
    try {
      const result = await translateSingleWithAI(item.ar, geminiApiKey);
      handleUpdateItem(item.id, {
        th: result.th !== undefined ? result.th : item.th,
        en: result.en !== undefined ? result.en : item.en,
      });
      setStatusMessage(`✨ تم ترجمة "${item.ar.slice(0, 30)}" بنجاح`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (e: any) {
      alert('تعذر الترجمة: ' + (e?.message || 'تأكد من الاتصال'));
    } finally {
      setTranslatingId(null);
    }
  };

  const handleTranslateBatchInCurrentTab = async () => {
    const targets = currentTabItems.filter((i) => i.ar && i.ar.trim());
    if (targets.length === 0) return;

    if (
      !confirm(
        `هل تريد ترجمة جميع نصوص هذا التبويب (${targets.length} نصاً) إلى التايلاندية والإنجليزية بالذكاء الاصطناعي دفعة واحدة؟`
      )
    ) {
      return;
    }

    setIsBatchTranslating(true);
    setStatusMessage(`جاري ترجمة ${targets.length} نصاً بالذكاء الاصطناعي...`);
    try {
      const batchPayload = targets.map((i) => ({ id: i.id, text: i.ar }));
      const results = await translateBatchWithAI(batchPayload, geminiApiKey);
      setCatchItems((prev) =>
        prev.map((item) => {
          const r = results[item.id];
          if (!r) return item;
          return {
            ...item,
            th: r.th !== undefined && r.th !== '' ? r.th : item.th,
            en: r.en !== undefined && r.en !== '' ? r.en : item.en,
          };
        })
      );
      setStatusMessage(
        '🎉 اكتملت الترجمة الجماعية بنجاح! اضغط "حفظ ومزامنة في ورقة الترجمة" لتثبيت النتائج.'
      );
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (e: any) {
      alert('تعذر إكمال الترجمة الجماعية: ' + (e?.message || 'خطأ في الاتصال'));
    } finally {
      setIsBatchTranslating(false);
    }
  };

  const handleSaveAndSyncAll = async () => {
    const merged = mergeWithPrimaryTranslations(catchItems);
    onSaveTranslations(merged);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);

    if (webhookUrl && webhookUrl.trim().startsWith('http')) {
      setIsSyncingToSheets(true);
      setSheetSyncStatus(null);
      try {
        const res = await saveTranslationsToSheets(webhookUrl, merged);
        setSheetSyncStatus(res);
      } catch (e: any) {
        setSheetSyncStatus({
          success: false,
          message: 'تم الحفظ محلياً، وتعذرت المزامنة مع ورقة الترجمة: ' + (e?.message || ''),
        });
      } finally {
        setIsSyncingToSheets(false);
      }
    } else {
      setStatusMessage('✓ تم حفظ ترجمات تحدي الصيد في المتصفح!');
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleRefreshFromSheet = async () => {
    if (!onRefreshFromSheets) return;
    setIsRefreshing(true);
    try {
      await onRefreshFromSheets();
      setStatusMessage('✓ تم جلب أحدث تمارين الصيد والترجمات من Google Sheets!');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEnsureSheet = async () => {
    if (!webhookUrl) {
      alert('يرجى إدخال رابط Google Sheets Webhook أولاً في الإعدادات.');
      return;
    }
    setIsSyncingToSheets(true);
    const merged = mergeWithPrimaryTranslations(catchItems);
    const res = await ensureTranslationsSheet(webhookUrl, merged);
    setIsSyncingToSheets(false);
    setSheetSyncStatus(res);
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-md border border-sky-200/80 space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Languages className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              إدارة وتخصيص الترجمة 4 — تحدي الصيد (AR)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              مخصص لترجمة واجهة تحدي الصيد وإعدادات اليد والواقع المعزز والمواضيع وأسئلة ورقة (صيد) — مع إبقاء الفقاعات والحروف العربية كما هي
            </p>
          </div>
        </div>

        {/* Save / Sync / Batch AI Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {onRefreshFromSheets && (
            <button
              type="button"
              onClick={handleRefreshFromSheet}
              disabled={isRefreshing || isSyncingToSheets}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              title="سحب أحدث تمارين الصيد والترجمات من Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>تحديث من الشيت</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleTranslateBatchInCurrentTab}
            disabled={isBatchTranslating || currentTabItems.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
          >
            {isBatchTranslating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            )}
            <span>ترجمة القسم بالذكاء الاصطناعي ({currentTabItems.length})</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAndSyncAll}
            disabled={isSyncingToSheets}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
              savedSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-sky-600 hover:bg-sky-700 text-white'
            }`}
          >
            {isSyncingToSheets ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : savedSuccess ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{savedSuccess ? 'تم الحفظ والمزامنة!' : 'حفظ ومزامنة في ورقة الترجمة'}</span>
          </button>
        </div>
      </div>

      {/* Status & Sync Banners */}
      {statusMessage && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {sheetSyncStatus && (
        <div
          className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in ${
            sheetSyncStatus.success
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {sheetSyncStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{sheetSyncStatus.message}</span>
          </div>
          {!sheetSyncStatus.success && webhookUrl && (
            <button
              type="button"
              onClick={handleEnsureSheet}
              className="px-3 py-1 bg-white border border-rose-300 rounded-lg text-[11px] font-bold text-rose-800 hover:bg-rose-100 cursor-pointer flex items-center gap-1"
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>تجهيز ورقة الترجمة</span>
            </button>
          )}
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => {
            setSubTab('ui');
            setSearchQuery('');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'ui'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Target className="w-3.5 h-3.5" />
          <span>واجهة تحدي الصيد ({uiItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubTab('subjects');
            setSearchQuery('');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'subjects'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>أسماء مواضيع الصيد ({subjectItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubTab('questions');
            setSearchQuery('');
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'questions'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>نصوص أسئلة الصيد ({questionItems.length})</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50/80 rounded-2xl border border-slate-200/80">
        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'questions' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 whitespace-nowrap">
                📚 تصفية بالموضوع:
              </span>
              <select
                value={selectedSubjectFilter}
                onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:border-sky-600 cursor-pointer shadow-2xs"
              >
                <option value="all">جميع المواضيع ({questionItems.length})</option>
                {catchSubjects.map((s) => (
                  <option key={s.id} value={s.subjectName}>
                    {s.subjectName}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs font-semibold text-slate-500">
              {subTab === 'ui'
                ? 'أزرار شريط الصيد، خيارات القبض باليد (السبابة + الإبهام)، صندوق الإجابة، ونتائج التحدي'
                : 'ترجمة أسماء الدروس والمواضيع المسجلة في العمود A من ورقة (صيد)'}
            </span>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في نصوص تحدي الصيد..."
            className="w-full pr-8 pl-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:border-sky-600 shadow-2xs"
          />
        </div>
      </div>

      {/* Translations Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <th className="p-3 w-1/4">النص العربي الأصلي 🇸🇦</th>
              <th className="p-3 w-1/3">الترجمة التايلاندية (ภาษาไทย) 🇹🇭</th>
              <th className="p-3 w-1/3">الترجمة الإنجليزية (English) 🇬🇧</th>
              <th className="p-3 text-center w-24">الذكاء الاصطناعي</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentTabItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-400 text-xs">
                  لا توجد نصوص مطابقة للعرض في هذا القسم.
                </td>
              </tr>
            ) : (
              currentTabItems.map((item) => {
                const isSheetDynamic =
                  item.id.startsWith('catch_subj_') || item.id.startsWith('catch_q_');

                let mediaBadges: { hasImg: boolean; hasAud: boolean } | null = null;
                if (item.id.startsWith('catch_q_') && item.sheetSourceNote) {
                  const matchSubj = item.sheetSourceNote.match(/^\[(.+?)\]\s*تمرين\s*(\d+)/);
                  if (matchSubj) {
                    const subjObj = catchSubjects.find((s) => s.subjectName === matchSubj[1]);
                    const exObj = subjObj?.exercises.find(
                      (e) => e.exerciseNumber === Number(matchSubj[2])
                    );
                    if (exObj) {
                      const blocks = parseQuestionBlocks(exObj.questionText);
                      mediaBadges = {
                        hasImg: blocks.some((b) => b.type === 'image'),
                        hasAud: blocks.some((b) => b.type === 'audio'),
                      };
                    }
                  }
                }

                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 align-top">
                      <textarea
                        rows={2}
                        value={item.ar}
                        onChange={(e) => handleUpdateItem(item.id, { ar: e.target.value })}
                        readOnly={isSheetDynamic}
                        className={`w-full p-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 transition-colors resize-y leading-relaxed font-cairo ${
                          isSheetDynamic
                            ? 'bg-slate-100/80 text-slate-700 cursor-default'
                            : 'bg-slate-50 hover:bg-white focus:bg-white focus:border-sky-600'
                        }`}
                        dir="rtl"
                      />
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span
                          className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]"
                          title={item.id}
                        >
                          {item.id}
                        </span>
                        {item.sheetSourceNote && (
                          <span className="px-1.5 py-0.5 bg-sky-100 text-sky-900 rounded-md text-[9px] font-bold">
                            🔗 {item.sheetSourceNote}
                          </span>
                        )}
                        {mediaBadges?.hasImg && (
                          <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 rounded-md text-[9px] font-bold inline-flex items-center gap-0.5">
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>صورة</span>
                          </span>
                        )}
                        {mediaBadges?.hasAud && (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded-md text-[9px] font-bold inline-flex items-center gap-0.5">
                            <Volume2 className="w-2.5 h-2.5" />
                            <span>صوت</span>
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 align-top">
                      <textarea
                        rows={2}
                        value={item.th}
                        onChange={(e) => handleUpdateItem(item.id, { th: e.target.value })}
                        placeholder="พิมพ์คำแปลภาษาไทย..."
                        className="w-full p-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-sky-600 rounded-xl text-xs text-slate-900 transition-colors resize-y leading-relaxed font-sans"
                        dir="ltr"
                      />
                    </td>

                    <td className="p-3 align-top">
                      <textarea
                        rows={2}
                        value={item.en}
                        onChange={(e) => handleUpdateItem(item.id, { en: e.target.value })}
                        placeholder="Type English translation..."
                        className="w-full p-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-sky-600 rounded-xl text-xs text-slate-900 transition-colors resize-y leading-relaxed font-sans"
                        dir="ltr"
                      />
                    </td>

                    <td className="p-3 text-center align-middle">
                      <button
                        type="button"
                        onClick={() => handleTranslateSingle(item)}
                        disabled={translatingId === item.id || isBatchTranslating}
                        className="p-2 bg-sky-50 hover:bg-sky-100 text-sky-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer inline-flex items-center justify-center"
                        title="ترجمة هذا النص بالذكاء الاصطناعي"
                      >
                        {translatingId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-sky-600" />
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Save Action */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <span>إجمالي نصوص هذا التبويب: {currentTabItems.length} نص</span>
        <button
          type="button"
          onClick={handleSaveAndSyncAll}
          disabled={isSyncingToSheets}
          className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
        >
          حفظ ومزامنة في ورقة الترجمة
        </button>
      </div>
    </div>
  );
};
