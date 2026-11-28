import React, { useEffect, useState } from 'react';
import {
  Cloud,
  Send,
  Save,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sliders,
  PenTool,
  ShieldCheck,
  HelpCircle,
  Plus,
  Trash2,
  Sticker,
  MessageSquareText,
  RotateCcw,
  Stamp,
  FolderOpen,
  HardDrive,
} from 'lucide-react';
import {
  AdminUserRecord,
  MarkingConfig,
  MarkingPresetText,
  MarkingSticker,
  WatermarkSettings,
  WordItem,
} from '../../types';
import { DrawingTemplate } from '../../arWriting/types/drawing';
import { VideoLesson } from '../../video/videoSheets';
import { CourseScheduleData } from '../../utils/courseSchedule';
import {
  buildMarkingShareUrl,
  DEFAULT_MARKING_PRESETS,
  DEFAULT_MARKING_STICKERS,
  fetchMarkingWorkspaceData,
  getLocalMarkingConfig,
  saveMarkingConfigToSheets,
} from '../../utils/markingSheets';
import { DEFAULT_WATERMARK_SETTINGS } from '../../utils/markingCanvasUtils';
import { MarkingWorkspace } from './MarkingWorkspace';
import { MarkingMediaLibrary } from './MarkingMediaLibrary';

interface MarkingAdminManagerProps {
  webhookUrl: string;
  curriculum: WordItem[];
  writingTemplates: DrawingTemplate[];
  videoLessons: VideoLesson[];
  courseSchedule: CourseScheduleData;
  adminUsers?: AdminUserRecord[];
  platformTitle?: string;
  homeLogoUrl?: string;
}

export const MarkingAdminManager: React.FC<MarkingAdminManagerProps> = ({
  webhookUrl,
  curriculum,
  writingTemplates,
  videoLessons,
  courseSchedule,
  adminUsers = [],
  platformTitle,
  homeLogoUrl,
}) => {
  const [subTab, setSubTab] = useState<'workspace' | 'settings' | 'media'>('workspace');
  const [config, setConfig] = useState<MarkingConfig>(() => getLocalMarkingConfig());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCloudinaryHelp, setShowCloudinaryHelp] = useState(false);

  // New Preset Text / Sticker Inputs (separated by board vs audio scope)
  const [presetScopeTab, setPresetScopeTab] = useState<'board' | 'audio'>('board');
  const [stickerScopeTab, setStickerScopeTab] = useState<'board' | 'audio'>('board');
  const [newPresetText, setNewPresetText] = useState('');
  const [newPresetCat, setNewPresetCat] = useState<MarkingPresetText['category']>('positive');
  const [newStickerSymbol, setNewStickerSymbol] = useState('🌟');
  const [newStickerLabel, setNewStickerLabel] = useState('');
  const [newStickerKind, setNewStickerKind] = useState<MarkingSticker['kind']>('positive');
  const [newStickerColor, setNewStickerColor] = useState('#059669');

  const shareUrl = buildMarkingShareUrl();

  useEffect(() => {
    if (!webhookUrl) return;
    fetchMarkingWorkspaceData(webhookUrl)
      .then((res) => {
        if (res.config) setConfig(res.config);
      })
      .catch(() => {});
  }, [webhookUrl]);

  const presetTexts =
    config.presetTexts && config.presetTexts.length > 0
      ? config.presetTexts
      : DEFAULT_MARKING_PRESETS;
  const stickers =
    config.stickers && config.stickers.length > 0 ? config.stickers : DEFAULT_MARKING_STICKERS;

  const filteredPresetsByScope = presetTexts.filter((p) => {
    const sc = p.scope || 'board';
    return sc === presetScopeTab || sc === 'both';
  });

  const filteredStickersByScope = stickers.filter((s) => {
    const sc = s.scope || 'board';
    return sc === stickerScopeTab || sc === 'both';
  });

  const watermark: WatermarkSettings = {
    ...DEFAULT_WATERMARK_SETTINGS,
    ...(config.watermark || {}),
  };

  const updateWatermark = (patch: Partial<WatermarkSettings>) => {
    setConfig((prev) => ({
      ...prev,
      watermark: {
        ...DEFAULT_WATERMARK_SETTINGS,
        ...(prev.watermark || {}),
        ...patch,
      },
    }));
  };

  const handleAddPreset = () => {
    const clean = newPresetText.trim();
    if (!clean) return;
    const item: MarkingPresetText = {
      id: `pr-${Date.now()}`,
      text: clean,
      category: newPresetCat,
      scope: presetScopeTab,
    };
    setConfig((prev) => ({
      ...prev,
      presetTexts: [...(prev.presetTexts || DEFAULT_MARKING_PRESETS), item],
    }));
    setNewPresetText('');
  };

  const handleDeletePreset = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      presetTexts: (prev.presetTexts || DEFAULT_MARKING_PRESETS).filter((p) => p.id !== id),
    }));
  };

  const handleAddSticker = () => {
    const sym = newStickerSymbol.trim();
    const lbl = newStickerLabel.trim();
    if (!sym && !lbl) return;
    const item: MarkingSticker = {
      id: `st-${Date.now()}`,
      symbol: sym || '✨',
      label: lbl || sym || 'ملصق',
      kind: newStickerKind,
      color: newStickerColor,
      scope: stickerScopeTab,
    };
    setConfig((prev) => ({
      ...prev,
      stickers: [...(prev.stickers || DEFAULT_MARKING_STICKERS), item],
    }));
    setNewStickerLabel('');
  };

  const handleDeleteSticker = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      stickers: (prev.stickers || DEFAULT_MARKING_STICKERS).filter((s) => s.id !== id),
    }));
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const payloadToSave: MarkingConfig = {
        ...config,
        presetTexts,
        stickers,
        watermark,
      };
      const res = await saveMarkingConfigToSheets(webhookUrl, payloadToSave);
      if (res.success) {
        setSaveMsg({
          type: 'ok',
          text: res.message || 'تم حفظ إعدادات Cloudinary وتيليغرام والنصوص والاستيكرات في Google Sheets بنجاح.',
        });
      } else {
        setSaveMsg({
          type: 'err',
          text: res.error || 'تعذر حفظ الإعدادات في السحابة.',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPortalLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="space-y-5 font-cairo text-right">
      {/* Sub-navigation & Standalone Link Banner */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                قسم التصحيح والمتابعة والمعلمين
              </h2>
              <p className="text-xs text-slate-500">
                تصحيح واجبات الفيديو التفاعلي (الصورة والصوت)، كاميرا OBS المباشرة، النصوص والاستيكرات المخصصة، وإشعارات تيليغرام
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('workspace')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'workspace'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>استوديو التصحيح</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('settings')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'settings'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>الإعدادات والنصوص والاستيكرات</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('media')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                subTab === 'media'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>ملفات Drive و Cloudinary</span>
            </button>
          </div>
        </div>

        {/* Standalone Shareable Teacher Link Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>رابط صفحة التصحيح المستقلة للمعلمين (?page=marking)</span>
            </div>
            <div className="text-[11px] text-slate-500 font-semibold">
              يفتح صفحة مستقلة تماماً ومحمية ببيانات دخول المعلم من ورقة «الرئيسية» (الأعمدة D:F).
            </div>
            <div
              dir="ltr"
              className="text-[11px] font-mono text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 truncate text-left"
            >
              {shareUrl}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyPortalLink}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedLink ? 'تم النسخ!' : 'نسخ الرابط المستقل'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.href = shareUrl;
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>فتح صفحة التصحيح المستقلة</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SUBTAB 1: WORKSPACE */}
      {subTab === 'workspace' && (
        <MarkingWorkspace
          webhookUrl={webhookUrl}
          curriculum={curriculum}
          writingTemplates={writingTemplates}
          videoLessons={videoLessons}
          courseSchedule={courseSchedule}
          adminUsers={adminUsers}
          platformTitle={platformTitle}
          homeLogoUrl={homeLogoUrl}
          isStandalonePage={false}
          onOpenAdminMarkingSettings={() => setSubTab('settings')}
        />
      )}

      {/* SUBTAB 2: SETTINGS (VIDEO STORAGE PROVIDER, CLOUDINARY, TELEGRAM, PRESET TEXTS, STICKERS) */}
      {subTab === 'settings' && (
        <form
          onSubmit={handleSaveConfig}
          className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-6"
        >
          {/* Video Storage Provider Switch + Cloudinary Credentials */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    مكان حفظ فيديوهات التصحيح وإعدادات Cloudinary
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    اختر مكان حفظ فيديوهات الشرح المرسلة من المعلم (Google Drive أو Cloudinary MP4)، وتُشغل كلاهما مباشرة داخل الصفحة
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCloudinaryHelp((p) => !p)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>ملاحظة الإعداد</span>
              </button>
            </div>

            {/* Explicit Provider Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, videoStorageProvider: 'drive' }))}
                className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex items-start gap-2.5 ${
                  (config.videoStorageProvider || 'drive') === 'drive'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <HardDrive className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-xs font-extrabold">
                    Google Drive (مجلد تصحيحات المعلم)
                  </div>
                  <div
                    className={`text-[11px] font-semibold ${
                      (config.videoStorageProvider || 'drive') === 'drive'
                        ? 'text-emerald-50'
                        : 'text-slate-500'
                    }`}
                  >
                    يحفظ في مجلد Drive ويُبث داخل الصفحة عبر الوسيط السريع بدون تنزيل إجباري
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, videoStorageProvider: 'cloudinary' }))}
                className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex items-start gap-2.5 ${
                  config.videoStorageProvider === 'cloudinary'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Cloud className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="text-xs font-extrabold">
                    Cloudinary (تخزين وبث MP4 سحابي)
                  </div>
                  <div
                    className={`text-[11px] font-semibold ${
                      config.videoStorageProvider === 'cloudinary'
                        ? 'text-sky-50'
                        : 'text-slate-500'
                    }`}
                  >
                    مناسب للمقاطع الكبيرة حتى 80 MB وصيغة MP4 السريعة عبر الجوال وتيليغرام
                  </div>
                </div>
              </button>
            </div>

            {showCloudinaryHelp && (
              <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-950 space-y-1 leading-relaxed">
                <div>1- أدخل <strong>Cloud Name</strong> كما يظهر في لوحة Cloudinary.</div>
                <div>2- أدخل <strong>Upload Preset</strong> وتأكد من أنه مضبوط على وضع <strong>Unsigned</strong> في Cloudinary Settings → Upload.</div>
                <div>3- التبديل بين Google Drive و Cloudinary أعلاه يحدد مباشرة أين تُرفع فيديوهات المعلم الجديدة عند التصحيح الفردي أو الجماعي.</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cloud Name (اسم السحابة):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={config.cloudinaryCloudName}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, cloudinaryCloudName: e.target.value }))
                  }
                  placeholder="مثال: dxxxxxxx"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 text-left focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Upload Preset (Unsigned):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={config.cloudinaryUploadPreset}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, cloudinaryUploadPreset: e.target.value }))
                  }
                  placeholder="مثال: ml_default أو preset_name"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 text-left focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Folder (مجلد الحفظ الاختياري):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={config.cloudinaryFolder}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, cloudinaryFolder: e.target.value }))
                  }
                  placeholder="faseeh_marking"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-900 text-left focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Preset Texts & Stickers Management (Separated Board vs Audio) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
            {/* Custom Preset Texts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-sm font-extrabold text-slate-900">
                    النصوص الجاهزة ({filteredPresetsByScope.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({ ...prev, presetTexts: DEFAULT_MARKING_PRESETS }))
                  }
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استعادة الافتراضي</span>
                </button>
              </div>

              {/* Scope Switch Tabs: Board vs Audio */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPresetScopeTab('board')}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                    presetScopeTab === 'board'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  نصوص السبورة والصور
                </button>
                <button
                  type="button"
                  onClick={() => setPresetScopeTab('audio')}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                    presetScopeTab === 'audio'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  نصوص تصحيح الصوت
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newPresetText}
                  onChange={(e) => setNewPresetText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddPreset();
                    }
                  }}
                  placeholder={
                    presetScopeTab === 'board'
                      ? 'أضف عبارة لسبورة تصحيح الصورة...'
                      : 'أضف عبارة لقسم تصحيح الصوت...'
                  }
                  className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-500"
                />
                <select
                  value={newPresetCat}
                  onChange={(e) => setNewPresetCat(e.target.value as MarkingPresetText['category'])}
                  className="px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  <option value="positive">تشجيعي</option>
                  <option value="correction">تصحيحي</option>
                  <option value="general">عام</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddPreset}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                {filteredPresetsByScope.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 font-semibold">
                    لا توجد عبارات مضافة لهذا القسم بعد.
                  </div>
                ) : (
                  filteredPresetsByScope.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="font-semibold text-slate-800 truncate">{p.text}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const nextScope = presetScopeTab === 'board' ? 'audio' : 'board';
                            setConfig((prev) => ({
                              ...prev,
                              presetTexts: (prev.presetTexts || DEFAULT_MARKING_PRESETS).map((x) =>
                                x.id === p.id ? { ...x, scope: nextScope } : x
                              ),
                            }));
                          }}
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                          title="نقل العبارة للقسم الآخر"
                        >
                          {presetScopeTab === 'board' ? 'نقل للصوت' : 'نقل للسبورة'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(p.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0 cursor-pointer"
                          title="حذف النص"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Custom Stickers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Sticker className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-extrabold text-slate-900">
                    الملصقات والختوم ({filteredStickersByScope.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({ ...prev, stickers: DEFAULT_MARKING_STICKERS }))
                  }
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استعادة الافتراضي</span>
                </button>
              </div>

              {/* Scope Switch Tabs: Board vs Audio */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStickerScopeTab('board')}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                    stickerScopeTab === 'board'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ملصقات السبورة والصور
                </button>
                <button
                  type="button"
                  onClick={() => setStickerScopeTab('audio')}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                    stickerScopeTab === 'audio'
                      ? 'bg-white text-indigo-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ملصقات تصحيح الصوت
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newStickerSymbol}
                  onChange={(e) => setNewStickerSymbol(e.target.value)}
                  placeholder="الرمز ⭐"
                  className="w-16 text-center px-2 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold"
                />
                <input
                  type="text"
                  value={newStickerLabel}
                  onChange={(e) => setNewStickerLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSticker();
                    }
                  }}
                  placeholder={
                    stickerScopeTab === 'board'
                      ? 'اسم ملصق السبورة (مثال: أحسنت!)'
                      : 'اسم ملصق الصوت (مثال: نطق متقن)'
                  }
                  className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-emerald-500"
                />
                <select
                  value={newStickerKind}
                  onChange={(e) => setNewStickerKind(e.target.value as MarkingSticker['kind'])}
                  className="px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
                >
                  <option value="positive">تشجيعي</option>
                  <option value="correction">توضيح خطأ</option>
                  <option value="stamp">ختم</option>
                </select>
                <input
                  type="color"
                  value={newStickerColor}
                  onChange={(e) => setNewStickerColor(e.target.value)}
                  className="w-9 h-9 rounded-xl border border-slate-200 cursor-pointer p-0 bg-white"
                  title="لون خلفية الختم"
                />
                <button
                  type="button"
                  onClick={handleAddSticker}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-0.5">
                {filteredStickersByScope.length === 0 ? (
                  <div className="col-span-2 p-4 text-center text-xs text-slate-400 font-semibold">
                    لا توجد ملصقات مضافة لهذا القسم بعد.
                  </div>
                ) : (
                  filteredStickersByScope.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg leading-none shrink-0">{st.symbol}</span>
                        <div className="min-w-0">
                          <div className="font-extrabold text-slate-900 truncate">{st.label}</div>
                          <div className="text-[10px] text-slate-500">
                            {st.kind === 'correction'
                              ? 'توضيح خطأ'
                              : st.kind === 'stamp'
                              ? 'ختم سريع'
                              : 'تشجيعي'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSticker(st.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0 cursor-pointer"
                        title="حذف الاستيكر"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Watermark Settings for Teaching Images & Board Exports */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Stamp className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    إعدادات العلامة المائية لصور التدريس والتصحيح
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    تُدمج تلقائياً على صور السبورة المصحّحة والصور الملتقطة بالكاميرا (الشعار، اسم الطالب، الدرس والتاريخ)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watermark.enabled}
                    onChange={(e) => updateWatermark({ enabled: e.target.checked })}
                    className="accent-indigo-600 w-4 h-4"
                  />
                  <span>تفعيل العلامة المائية</span>
                </label>

                <button
                  type="button"
                  onClick={() => updateWatermark({ ...DEFAULT_WATERMARK_SETTINGS })}
                  className="text-[11px] font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استعادة الافتراضي</span>
                </button>
              </div>
            </div>

            {watermark.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    بادئة نص العلامة المائية:
                  </label>
                  <input
                    type="text"
                    value={watermark.textPrefix}
                    onChange={(e) => updateWatermark({ textPrefix: e.target.value })}
                    placeholder="تقييم الخط والكتابة:"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رابط شعار العلامة المائية (اختياري — يستخدم شعار المنصة إذا تُرك فارغاً):
                  </label>
                  <input
                    type="url"
                    dir="ltr"
                    value={watermark.logoUrl}
                    onChange={(e) => updateWatermark({ logoUrl: e.target.value })}
                    placeholder={homeLogoUrl || 'https://...'}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-900 text-left focus:outline-hidden focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    موقع الشعار:
                  </label>
                  <select
                    value={watermark.logoPosition}
                    onChange={(e) =>
                      updateWatermark({
                        logoPosition: e.target.value as WatermarkSettings['logoPosition'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                  >
                    <option value="bottom-right">أسفل اليمين</option>
                    <option value="bottom-left">أسفل اليسار</option>
                    <option value="top-right">أعلى اليمين</option>
                    <option value="top-left">أعلى اليسار</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    موقع النص:
                  </label>
                  <select
                    value={watermark.textPosition}
                    onChange={(e) =>
                      updateWatermark({
                        textPosition: e.target.value as WatermarkSettings['textPosition'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900"
                  >
                    <option value="bottom-left">أسفل اليسار</option>
                    <option value="bottom-right">أسفل اليمين</option>
                    <option value="top-left">أعلى اليسار</option>
                    <option value="top-right">أعلى اليمين</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    حجم الخط ({watermark.fontSize}px):
                  </label>
                  <input
                    type="range"
                    min={12}
                    max={34}
                    step={1}
                    value={watermark.fontSize}
                    onChange={(e) => updateWatermark({ fontSize: Number(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نسبة الشفافية ({Math.round(watermark.opacity * 100)}%):
                  </label>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={watermark.opacity}
                    onChange={(e) => updateWatermark({ opacity: Number(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نسبة حجم الشعار ({Math.round(watermark.sizeFactor * 100)}%):
                  </label>
                  <input
                    type="range"
                    min={0.05}
                    max={0.25}
                    step={0.01}
                    value={watermark.sizeFactor}
                    onChange={(e) => updateWatermark({ sizeFactor: Number(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    شفافية خلفية النص ({Math.round(watermark.textBgOpacity * 100)}%):
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={0.95}
                    step={0.05}
                    value={watermark.textBgOpacity}
                    onChange={(e) => updateWatermark({ textBgOpacity: Number(e.target.value) })}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Two-Way Telegram Sync Settings */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Send className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  إعدادات إشعارات تيليغرام ثنائية الاتجاه (المعلم ↔ الطالب)
                </h3>
                <p className="text-[11px] text-slate-500">
                  إشعار المعلم فور تسليم الطالب للواجب، وإشعار الطالب فور تصحيح المعلم
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  معرف شات تيليغرام للمعلم (اختياري):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={config.teacherTelegramChatId}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, teacherTelegramChatId: e.target.value }))
                  }
                  placeholder="اتركه فارغاً لاستخدام Admin Chat ID الرئيسي للبوت"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-900 text-left focus:outline-hidden focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  إذا تُرك فارغاً، تصل تنبيهات الواجبات إلى مشرف البوت المسجل في تبويب «بوت تيليغرام».
                </span>
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.notifyTeacherOnSubmission}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        notifyTeacherOnSubmission: e.target.checked,
                      }))
                    }
                    className="accent-emerald-600 w-4 h-4"
                  />
                  <span>إرسال إشعار للمعلم على تيليغرام عند تسليم الطالب لأي درس أو واجب</span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.notifyStudentOnCorrection}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        notifyStudentOnCorrection: e.target.checked,
                      }))
                    }
                    className="accent-sky-600 w-4 h-4"
                  />
                  <span>إرسال إشعار ووسائط التصحيح للطالب على تيليغرام عند اعتماد التصحيح</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-500 font-semibold">
              تحفظ هذه الإعدادات في ورقة «إعدادات_التصحيح» وتعمل من أي جهاز.
            </span>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>حفظ جميع إعدادات التصحيح</span>
            </button>
          </div>

          {saveMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                saveMsg.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {saveMsg.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{saveMsg.text}</span>
            </div>
          )}
        </form>
      )}

      {/* SUBTAB 3: MEDIA LIBRARY BROWSER (DRIVE & CLOUDINARY) */}
      {subTab === 'media' && <MarkingMediaLibrary webhookUrl={webhookUrl} config={config} />}
    </div>
  );
};

