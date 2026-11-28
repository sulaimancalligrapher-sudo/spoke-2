import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Mic,
  RefreshCw,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { MarkingConfig, MarkingMediaFileItem } from '../../types';
import {
  deleteCloudinaryLibraryResource,
  deleteMarkingMediaFileFromSheetsAndDrive,
  fetchCloudinaryLibraryResources,
  fetchMarkingDriveMediaFiles,
  fetchMarkingWorkspaceData,
} from '../../utils/markingSheets';
import {
  extractDriveFileId,
  getAlternativeAudioUrls,
  getDirectImageUrl,
} from '../../utils/mediaUrl';
import { CorrectionVideoPlayer } from './CorrectionVideoPlayer';

interface MarkingMediaLibraryProps {
  webhookUrl: string;
  config: MarkingConfig;
}

type SourceFilter = 'all' | 'drive_teacher' | 'drive_student' | 'cloudinary';
type KindFilter = 'all' | 'video' | 'audio' | 'image' | 'pdf';

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function inferMediaKindFromUrl(url: string): MarkingMediaFileItem['mediaKind'] {
  const low = url.toLowerCase();
  if (
    low.includes('/video/upload') ||
    low.endsWith('.mp4') ||
    low.endsWith('.webm') ||
    low.endsWith('.mov') ||
    low.includes('youtube.com') ||
    low.includes('youtu.be')
  ) {
    return 'video';
  }
  if (
    low.endsWith('.mp3') ||
    low.endsWith('.wav') ||
    low.endsWith('.m4a') ||
    low.endsWith('.ogg')
  ) {
    return 'audio';
  }
  if (
    low.includes('/image/upload') ||
    low.includes('export=view') ||
    low.endsWith('.png') ||
    low.endsWith('.jpg') ||
    low.endsWith('.jpeg') ||
    low.endsWith('.webp')
  ) {
    return 'image';
  }
  if (low.endsWith('.pdf')) return 'pdf';
  return 'other';
}

export const MarkingMediaLibrary: React.FC<MarkingMediaLibraryProps> = ({
  webhookUrl,
  config,
}) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MarkingMediaFileItem[]>([]);
  const [cloudinaryConfigured, setCloudinaryConfigured] = useState<boolean>(false);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [previewItem, setPreviewItem] = useState<MarkingMediaFileItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setDriveNotice(null);
    setFeedback(null);
    try {
      const [driveRes, cldRes, wsRes] = await Promise.all([
        fetchMarkingDriveMediaFiles(webhookUrl),
        fetchCloudinaryLibraryResources({ cloudName: config.cloudinaryCloudName }),
        fetchMarkingWorkspaceData(webhookUrl),
      ]);

      setCloudinaryConfigured(cldRes.configured);
      if (!driveRes.success && driveRes.error) {
        setDriveNotice(driveRes.error);
      }

      // Build reference map (URL / Drive fileId -> students & lessons using it)
      const refByKey = new Map<
        string,
        Array<{ submissionKey: string; studentName: string; studentId?: string; itemTitle: string }>
      >();
      const addRef = (
        rawUrl: string | undefined,
        info: { submissionKey: string; studentName: string; studentId?: string; itemTitle: string }
      ) => {
        const clean = (rawUrl || '').trim();
        if (!clean) return;
        const dId = extractDriveFileId(clean);
        const key = dId ? `drive:${dId}` : clean;
        const arr = refByKey.get(key) || [];
        if (!arr.some((x) => x.submissionKey === info.submissionKey)) {
          arr.push(info);
          refByKey.set(key, arr);
        }
      };

      const sheetMediaItems = new Map<string, MarkingMediaFileItem>();
      const pushSheetMedia = (
        rawUrl: string | undefined,
        kindHint: MarkingMediaFileItem['mediaKind'],
        labelName: string,
        info: { submissionKey: string; studentName: string; studentId?: string; itemTitle: string }
      ) => {
        const clean = (rawUrl || '').trim();
        if (!clean) return;
        addRef(clean, info);
        const dId = extractDriveFileId(clean);
        const mapKey = dId ? `drive:${dId}` : clean;
        const existing = sheetMediaItems.get(mapKey);
        if (existing) {
          existing.referencedIn = refByKey.get(mapKey);
          return;
        }
        const isCld = clean.includes('res.cloudinary.com');
        sheetMediaItems.set(mapKey, {
          id: dId || `sheet-${mapKey}`,
          name: `${labelName} — ${info.studentName || info.itemTitle || 'مرفق'}`,
          url: clean,
          source: dId ? 'drive' : isCld ? 'cloudinary' : 'sheet',
          folderKind: labelName.includes('الطالب') ? 'student' : 'teacher',
          mediaKind: kindHint !== 'other' ? kindHint : inferMediaKindFromUrl(clean),
          referencedIn: refByKey.get(mapKey),
        });
      };

      if (wsRes.success) {
        wsRes.submissions.forEach((sub) => {
          const info = {
            submissionKey: sub.submissionKey,
            studentName: sub.studentName || sub.studentId || 'طالب',
            studentId: sub.studentId,
            itemTitle: sub.itemTitle || sub.lessonSubject,
          };
          if (sub.studentImageUrl) pushSheetMedia(sub.studentImageUrl, 'image', 'صورة الطالب', info);
          if (sub.studentAudioUrl) pushSheetMedia(sub.studentAudioUrl, 'audio', 'صوت الطالب', info);
          const c = sub.correction;
          if (c) {
            if (c.correctedImageUrl) pushSheetMedia(c.correctedImageUrl, 'image', 'لوحة التصحيح', info);
            (c.additionalImages || []).forEach((u) => pushSheetMedia(u, 'image', 'صورة إضافية', info));
            (c.imageLinks || []).forEach((u) => pushSheetMedia(u, inferMediaKindFromUrl(u), 'رابط مرفق', info));
            if (c.teacherAudioUrl) pushSheetMedia(c.teacherAudioUrl, 'audio', 'صوت المعلم', info);
            (c.teacherAudios || []).forEach((u) => pushSheetMedia(u, 'audio', 'صوت المعلم', info));
            (c.audioLinks || []).forEach((u) => pushSheetMedia(u, inferMediaKindFromUrl(u), 'رابط صوتي', info));
            if (c.teacherVideoUrl) pushSheetMedia(c.teacherVideoUrl, 'video', 'فيديو المعلم', info);
            (c.teacherVideos || []).forEach((u) => pushSheetMedia(u, 'video', 'فيديو المعلم', info));
          }
        });
      }

      // Merge Drive API files + Cloudinary API files + Sheet-discovered files
      const mergedMap = new Map<string, MarkingMediaFileItem>();

      driveRes.files.forEach((f) => {
        const key = `drive:${f.id}`;
        mergedMap.set(key, {
          ...f,
          referencedIn: refByKey.get(key) || [],
        });
      });

      cldRes.files.forEach((f) => {
        const key = f.url;
        mergedMap.set(key, {
          ...f,
          referencedIn: refByKey.get(key) || [],
        });
      });

      sheetMediaItems.forEach((f, key) => {
        if (!mergedMap.has(key)) {
          mergedMap.set(key, f);
        } else {
          const existing = mergedMap.get(key)!;
          existing.referencedIn = refByKey.get(key) || existing.referencedIn || [];
        }
      });

      const list = Array.from(mergedMap.values()).sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [webhookUrl, config.cloudinaryCloudName]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const counts = useMemo(() => {
    let driveTeacher = 0;
    let driveStudent = 0;
    let cld = 0;
    items.forEach((f) => {
      if (f.source === 'drive') {
        if (f.folderKind === 'student') driveStudent++;
        else driveTeacher++;
      } else {
        cld++;
      }
    });
    return {
      all: items.length,
      driveTeacher,
      driveStudent,
      cld,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((f) => {
      if (sourceFilter === 'drive_teacher' && (f.source !== 'drive' || f.folderKind === 'student')) {
        return false;
      }
      if (sourceFilter === 'drive_student' && (f.source !== 'drive' || f.folderKind !== 'student')) {
        return false;
      }
      if (sourceFilter === 'cloudinary' && f.source === 'drive') {
        return false;
      }
      if (kindFilter !== 'all' && f.mediaKind !== kindFilter) return false;
      if (q) {
        const refText = (f.referencedIn || [])
          .map((r) => `${r.studentName} ${r.studentId || ''} ${r.itemTitle}`)
          .join(' ');
        const hay = `${f.name} ${f.url} ${refText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, sourceFilter, kindFilter, searchQuery]);

  const handleConfirmDelete = async (item: MarkingMediaFileItem) => {
    if (deletingId) return;
    setDeletingId(item.id);
    setFeedback(null);
    try {
      let deletedRemote = false;
      if (item.source === 'cloudinary' && item.publicId && cloudinaryConfigured) {
        const cldDel = await deleteCloudinaryLibraryResource({
          publicId: item.publicId,
          resourceType: item.cloudinaryResourceType || 'video',
        });
        if (!cldDel.success) {
          setFeedback({
            type: 'err',
            text: cldDel.error || 'تعذر حذف الملف من Cloudinary.',
          });
          return;
        }
        deletedRemote = true;
      }

      const driveFileId = item.source === 'drive' ? extractDriveFileId(item.url) || item.id : '';
      const sheetRes = await deleteMarkingMediaFileFromSheetsAndDrive(webhookUrl, {
        fileId: driveFileId,
        url: item.url,
      });

      if (sheetRes.success || deletedRemote) {
        setItems((prev) => prev.filter((x) => x.id !== item.id && x.url !== item.url));
        if (previewItem?.id === item.id) setPreviewItem(null);
        setConfirmDeleteId(null);

        const parts: string[] = [];
        if (sheetRes.trashedDrive) parts.push('سلة مهملات Google Drive');
        if (deletedRemote) parts.push('Cloudinary');
        if ((sheetRes.cleanedRows || 0) > 0) parts.push(`تنظيف ${sheetRes.cleanedRows} صف في الشيت`);

        setFeedback({
          type: 'ok',
          text:
            parts.length > 0
              ? `تم الحذف بنجاح (${parts.join(' + ')}).`
              : 'تمت إزالة مرجع الملف من جدول التصحيحات.',
        });
      } else {
        setFeedback({
          type: 'err',
          text: sheetRes.error || 'تعذر إتمام عملية الحذف.',
        });
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 font-cairo text-right">
      {/* Header & Controls */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                مستعرض وإدارة الملفات المحفوظة (Google Drive & Cloudinary)
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                استعرض الفيديوهات والصور والتسجيلات الصوتية المحفوظة في مجلدات التصحيح أو الشيت واحذف غير المرغوب فيها بأمان
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={loadLibrary}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث القائمة ({items.length})</span>
          </button>
        </div>

        {/* Status Notices */}
        {driveNotice && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>ملاحظة Drive: {driveNotice}</span>
          </div>
        )}

        {!cloudinaryConfigured && (
          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-950 text-[11px] font-bold flex items-start gap-2">
            <Cloud className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              تُعرض هنا روابط Cloudinary المحفوظة في الشيت ويمكن إزالة ارتباطها من الشيت مباشرة. للحذف الدائم من خادم Cloudinary نفسه، أضف{' '}
              <span dir="ltr" className="font-mono bg-white px-1.5 py-0.5 rounded border border-sky-200">
                CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
              </span>{' '}
              في إعدادات الأسرار (.env) للخادم.
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-rose-50 text-rose-900 border border-rose-200'
            }`}
          >
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          <div className="lg:col-span-6 flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: `الكل (${counts.all})` },
                { id: 'drive_teacher', label: `Drive المعلم (${counts.driveTeacher})` },
                { id: 'drive_student', label: `Drive الطلاب (${counts.driveStudent})` },
                { id: 'cloudinary', label: `Cloudinary والروابط (${counts.cld})` },
              ] as Array<{ id: SourceFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap ${
                  sourceFilter === tab.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="lg:col-span-3">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800"
            >
              <option value="all">كل أنواع الوسائط</option>
              <option value="video">فيديوهات التصحيح</option>
              <option value="audio">التسجيلات الصوتية</option>
              <option value="image">الصور المصححة والمرفقة</option>
              <option value="pdf">ملفات PDF</option>
            </select>
          </div>

          <div className="lg:col-span-3 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم الملف أو الطالب..."
              className="w-full pr-8 pl-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Inline Preview Card */}
      {previewItem && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-indigo-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-slate-900 truncate">{previewItem.name}</div>
              <div className="text-[11px] text-slate-500 font-semibold">
                {previewItem.source === 'drive' ? 'Google Drive' : 'Cloudinary / رابط خارجي'} ·{' '}
                {formatBytes(previewItem.size)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPreviewItem(null)}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {previewItem.mediaKind === 'video' ? (
            <CorrectionVideoPlayer url={previewItem.url} label={previewItem.name} />
          ) : previewItem.mediaKind === 'audio' ? (
            <audio
              controls
              src={getAlternativeAudioUrls(previewItem.url)[0] || previewItem.url}
              className="w-full"
            />
          ) : previewItem.mediaKind === 'image' ? (
            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center max-h-96">
              <img
                src={getDirectImageUrl(previewItem.url)}
                alt={previewItem.name}
                className="max-h-96 object-contain"
              />
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between gap-2">
              <span>ملف مرفق — افتحه للمعاينة الكاملة</span>
              <a
                href={previewItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white inline-flex items-center gap-1"
              >
                <span>فتح الملف</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Files Grid / Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-10 text-center text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
            <span>جاري جلب قائمة الملفات من Google Drive و Cloudinary...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-xs font-bold text-slate-500">
            لا توجد ملفات مطابقة لمعايير التصفية الحالية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-extrabold">
                  <th className="py-3 px-3.5">النوع</th>
                  <th className="py-3 px-3.5">اسم الملف / المرفق</th>
                  <th className="py-3 px-3.5">المصدر</th>
                  <th className="py-3 px-3.5">الحجم</th>
                  <th className="py-3 px-3.5">مرتبط بالطالب / الدرس</th>
                  <th className="py-3 px-3.5 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isConfirming = confirmDeleteId === item.id;
                  const isBusy = deletingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {item.mediaKind === 'video' ? (
                          <span className="inline-flex items-center gap-1 text-indigo-700 font-extrabold">
                            <Video className="w-4 h-4" />
                            <span>فيديو</span>
                          </span>
                        ) : item.mediaKind === 'audio' ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-extrabold">
                            <Mic className="w-4 h-4" />
                            <span>صوت</span>
                          </span>
                        ) : item.mediaKind === 'image' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-extrabold">
                            <ImageIcon className="w-4 h-4" />
                            <span>صورة</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-700 font-extrabold">
                            <FileText className="w-4 h-4" />
                            <span>ملف</span>
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 max-w-[260px]">
                        <div className="font-extrabold text-slate-900 truncate" title={item.name}>
                          {item.name}
                        </div>
                        {item.createdAt && (
                          <div className="text-[10px] font-mono text-slate-400">
                            {item.createdAt.slice(0, 16).replace('T', ' ')}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        {item.source === 'drive' ? (
                          <span className="inline-flex items-center gap-1 text-slate-700 font-bold">
                            <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                            <span>
                              {item.folderKind === 'student' ? 'Drive الطلاب' : 'Drive المعلم'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sky-700 font-bold">
                            <Cloud className="w-3.5 h-3.5" />
                            <span>{item.source === 'cloudinary' ? 'Cloudinary' : 'رابط شيت'}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-slate-600 tabular-nums">
                        {formatBytes(item.size)}
                      </td>

                      <td className="py-2.5 px-3.5 max-w-[220px]">
                        {item.referencedIn && item.referencedIn.length > 0 ? (
                          <div className="space-y-0.5">
                            {item.referencedIn.slice(0, 2).map((ref) => (
                              <div
                                key={ref.submissionKey}
                                className="text-[11px] font-bold text-slate-800 truncate"
                              >
                                {ref.studentName} · {ref.itemTitle}
                              </div>
                            ))}
                            {item.referencedIn.length > 2 && (
                              <div className="text-[10px] text-slate-500">
                                + {item.referencedIn.length - 2} آخرون
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">غير مرتبط بصف نشط</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 text-left whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold cursor-pointer"
                          >
                            معاينة
                          </button>

                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                            title="فتح الرابط الأصلي"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>

                          {isConfirming ? (
                            <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleConfirmDelete(item)}
                                className="text-[11px] font-extrabold text-rose-700 hover:underline cursor-pointer"
                              >
                                {isBusy ? 'جاري الحذف...' : 'تأكيد الحذف'}
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(item.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold inline-flex items-center gap-1 cursor-pointer"
                              title="حذف الملف وتنظيف الشيت"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
