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
} from 'lucide-react';
import { AdminUserRecord, MarkingConfig, WordItem } from '../../types';
import { DrawingTemplate } from '../../arWriting/types/drawing';
import { VideoLesson } from '../../video/videoSheets';
import { CourseScheduleData } from '../../utils/courseSchedule';
import {
  buildMarkingShareUrl,
  fetchMarkingWorkspaceData,
  getLocalMarkingConfig,
  saveMarkingConfigToSheets,
} from '../../utils/markingSheets';
import { MarkingWorkspace } from './MarkingWorkspace';

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
  const [subTab, setSubTab] = useState<'workspace' | 'settings'>('workspace');
  const [config, setConfig] = useState<MarkingConfig>(() => getLocalMarkingConfig());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCloudinaryHelp, setShowCloudinaryHelp] = useState(false);

  const shareUrl = buildMarkingShareUrl();

  useEffect(() => {
    if (!webhookUrl) return;
    fetchMarkingWorkspaceData(webhookUrl)
      .then((res) => {
        if (res.config) setConfig(res.config);
      })
      .catch(() => {});
  }, [webhookUrl]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await saveMarkingConfigToSheets(webhookUrl, config);
      if (res.success) {
        setSaveMsg({
          type: 'ok',
          text: res.message || 'تم حفظ إعدادات Cloudinary وتيليغرام في Google Sheets بنجاح.',
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
                تصحيح الواجبات (الكتابة، النطق، الإملاء، الفيديو)، التسجيل المباشر لـ Cloudinary، وإشعارات تيليغرام ثنائية الاتجاه
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('workspace')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
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
              className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                subTab === 'settings'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>إعدادات Cloudinary وتيليغرام</span>
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
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
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

      {/* SUBTAB 2: CLOUDINARY & TELEGRAM SETTINGS */}
      {subTab === 'settings' && (
        <form
          onSubmit={handleSaveConfig}
          className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-6"
        >
          {/* Cloudinary Credentials from marking3 */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    بيانات حساب Cloudinary (لتخزين وبث فيديوهات التصحيح MP4)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    الصق نفس قيم حساب Cloudinary الخاصة بك من مشروع marking3 ليتم رفع الفيديو مباشرة وتشغيله في تيليغرام والجوال
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCloudinaryHelp((p) => !p)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>ملاحظة الإعداد</span>
              </button>
            </div>

            {showCloudinaryHelp && (
              <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-950 space-y-1 leading-relaxed">
                <div>1- أدخل <strong>Cloud Name</strong> كما يظهر في لوحة Cloudinary أو في كود marking3.</div>
                <div>2- أدخل <strong>Upload Preset</strong> وتأكد من أنه مضبوط على وضع <strong>Unsigned</strong> في Cloudinary Settings → Upload.</div>
                <div>3- سيتم تخزين الفيديوهات في Cloudinary بصيغة MP4 سريعة التشغيل، بينما تحفظ التسجيلات الصوتية وصور التصحيح في Google Drive تلقائياً.</div>
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

          {/* Two-Way Telegram Sync Settings */}
          <div className="space-y-4">
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
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>حفظ إعدادات التصحيح وCloudinary</span>
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
    </div>
  );
};
