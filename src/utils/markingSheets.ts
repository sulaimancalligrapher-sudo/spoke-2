import {
  MarkingConfig,
  MarkingMediaFileItem,
  MarkingPresetText,
  MarkingSticker,
  StudentAchievementSummary,
  TeacherCorrectionRecord,
  UnifiedMarkingSubmission,
  WordItem,
} from '../types';
import { DrawingTemplate } from '../arWriting/types/drawing';
import { VideoLesson } from '../video/videoSheets';
import { CourseClassroom, CourseProgram } from './courseSchedule';
import { DEFAULT_WEBHOOK_URL, callGoogleSheetsPost } from './googleSheets';
import { getDirectImageUrl } from './mediaUrl';
import { DEFAULT_WATERMARK_SETTINGS } from './markingCanvasUtils';

const STORAGE_KEY_MARKING_CONFIG = 'faseeh_marking_config_v1';
const STORAGE_KEY_MARKING_CORRECTIONS_PREFIX = 'faseeh_marking_corrs_v1_';

export const DEFAULT_MARKING_PRESETS: MarkingPresetText[] = [
  { id: 'pr-1', text: 'أحسنت! نطق واضح وإتقان رائع.', category: 'positive', scope: 'audio' },
  { id: 'pr-2', text: 'ممتاز، استمر على هذا المستوى المتألق.', category: 'positive', scope: 'audio' },
  { id: 'pr-3', text: 'كتابة متقنة وخط جميل واضح.', category: 'positive', scope: 'board' },
  { id: 'pr-4', text: 'يرجى الانتباه لمخرج الحرف وإعادة التسجيل.', category: 'correction', scope: 'audio' },
  { id: 'pr-5', text: 'انتبه لرسم الحرف على السطر وأعد المحاولة.', category: 'correction', scope: 'board' },
  { id: 'pr-6', text: 'تشكيل متقن ومسافات ممتازة بين الحروف.', category: 'positive', scope: 'board' },
];

export const DEFAULT_MARKING_STICKERS: MarkingSticker[] = [
  { id: 'st-star', label: 'ممتاز!', symbol: '⭐', color: '#eab308', kind: 'positive', scope: 'board' },
  { id: 'st-clap', label: 'أحسنت', symbol: '👏', color: '#059669', kind: 'positive', scope: 'audio' },
  { id: 'st-gem', label: 'متقن', symbol: '💎', color: '#0284c7', kind: 'positive', scope: 'board' },
  { id: 'st-trophy', label: 'بطل الدرس', symbol: '🏆', color: '#d97706', kind: 'positive', scope: 'both' },
  { id: 'st-check', label: 'صحيح', symbol: '✔️', color: '#16a34a', kind: 'stamp', scope: 'board' },
  { id: 'st-cross', label: 'خطأ', symbol: '❌', color: '#dc2626', kind: 'correction', scope: 'board' },
  { id: 'st-warn', label: 'انتبه هنا', symbol: '⚠️', color: '#ea580c', kind: 'correction', scope: 'board' },
  { id: 'st-retry', label: 'أعد المحاولة', symbol: '🔄', color: '#7c3aed', kind: 'correction', scope: 'audio' },
  { id: 'st-mic', label: 'نطق متقن', symbol: '🎙️', color: '#0284c7', kind: 'positive', scope: 'audio' },
  { id: 'st-heart', label: 'بارك الله فيك', symbol: '🌟', color: '#ca8a04', kind: 'positive', scope: 'audio' },
];

export const DEFAULT_MARKING_CONFIG: MarkingConfig = {
  videoStorageProvider: 'drive',
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
  cloudinaryFolder: 'faseeh_marking',
  teacherTelegramChatId: '',
  notifyTeacherOnSubmission: true,
  notifyStudentOnCorrection: true,
  portalBaseUrl: '',
  presetTexts: DEFAULT_MARKING_PRESETS,
  stickers: DEFAULT_MARKING_STICKERS,
  watermark: DEFAULT_WATERMARK_SETTINGS,
};

export function getLocalMarkingConfig(): MarkingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MARKING_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_MARKING_CONFIG,
        ...parsed,
        presetTexts:
          Array.isArray(parsed?.presetTexts) && parsed.presetTexts.length > 0
            ? parsed.presetTexts
            : DEFAULT_MARKING_PRESETS,
        stickers:
          Array.isArray(parsed?.stickers) && parsed.stickers.length > 0
            ? parsed.stickers
            : DEFAULT_MARKING_STICKERS,
        watermark: {
          ...DEFAULT_WATERMARK_SETTINGS,
          ...(parsed?.watermark || {}),
        },
      };
    }
  } catch {}
  return { ...DEFAULT_MARKING_CONFIG };
}

export function saveLocalMarkingConfig(cfg: MarkingConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_MARKING_CONFIG, JSON.stringify(cfg));
  } catch {}
}

export function buildMarkingShareUrl(submissionKey?: string): string {
  try {
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('page');
    url.searchParams.delete('sub');
    url.searchParams.set('page', 'marking');
    if (submissionKey) {
      url.searchParams.set('sub', submissionKey);
    }
    return url.toString();
  } catch {
    return '?page=marking';
  }
}

export function toCloudinaryMp4Url(rawUrl: string): string {
  const clean = (rawUrl || '').trim();
  if (!clean) return '';
  if (
    clean.includes('res.cloudinary.com') &&
    clean.includes('/video/upload/') &&
    !clean.includes('/f_mp4')
  ) {
    return clean.replace('/video/upload/', '/video/upload/f_mp4,vc_h264/');
  }
  return clean;
}

export function toProxiedCanvasImageUrl(rawUrl: string): string {
  const direct = getDirectImageUrl(rawUrl || '');
  if (!direct) return '';
  if (direct.startsWith('data:') || direct.startsWith('blob:') || direct.startsWith('/')) {
    return direct;
  }
  const driveIdMatch =
    direct.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/) ||
    direct.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    return `/api/proxy-image?id=${encodeURIComponent(driveIdMatch[1])}`;
  }
  return `/api/proxy-image?url=${encodeURIComponent(direct)}`;
}

export async function uploadVideoToCloudinary(
  blob: Blob,
  config: MarkingConfig,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; url?: string; mp4Url?: string; error?: string }> {
  const cloudName = (config.cloudinaryCloudName || '').trim();
  const uploadPreset = (config.cloudinaryUploadPreset || '').trim();
  const folder = (config.cloudinaryFolder || 'faseeh_marking').trim();

  if (!cloudName || !uploadPreset) {
    return {
      success: false,
      error: 'يرجى ضبط Cloud Name و Upload Preset في إعدادات Cloudinary أولاً.',
    };
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('file', blob, `correction_${Date.now()}.${ext}`);
    formData.append('upload_preset', uploadPreset);
    if (folder) {
      formData.append('folder', folder);
    }

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
      }
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
          onProgress?.(100);
          const mp4Url = toCloudinaryMp4Url(String(json.secure_url));
          resolve({
            success: true,
            url: String(json.secure_url),
            mp4Url,
          });
        } else {
          resolve({
            success: false,
            error:
              json?.error?.message ||
              `فشل الرفع إلى Cloudinary (HTTP ${xhr.status}). تأكد من أن Upload Preset من نوع Unsigned.`,
          });
        }
      } catch {
        resolve({
          success: false,
          error: `استجابة غير صالحة من Cloudinary (HTTP ${xhr.status}).`,
        });
      }
    };

    xhr.onerror = () => {
      resolve({
        success: false,
        error: 'تعذر الاتصال بخادم Cloudinary للرفع. تحقق من اتصال الإنترنت أو اسم الحساب.',
      });
    };

    xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`);
    xhr.send(formData);
  });
}

export async function uploadMarkingMediaToDrive(
  webhookUrl: string,
  params: {
    mediaType: 'image' | 'audio' | 'video' | 'pdf';
    base64Data: string;
    fileName?: string;
    mimeType?: string;
  }
): Promise<{ success: boolean; url?: string; error?: string }> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const res = await callGoogleSheetsPost(url, {
    action: 'upload_marking_media',
    mediaType: params.mediaType,
    mimeType: params.mimeType,
    base64Data: params.base64Data,
    fileName: params.fileName || `marking_${params.mediaType}_${Date.now()}`,
  });
  const raw: any = res;
  const d: any = res.data || raw;
  if (d?.markingHandled && d?.url) {
    return { success: true, url: String(d.url) };
  }
  return {
    success: false,
    error: d?.error || res.error || 'تعذر رفع الوسائط إلى Google Drive. تأكد من تحديث كود Apps Script.',
  };
}

export async function saveMarkingConfigToSheets(
  webhookUrl: string,
  config: MarkingConfig
): Promise<{ success: boolean; message?: string; error?: string }> {
  saveLocalMarkingConfig(config);
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم الحفظ محلياً.' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'save_marking_config',
    config: {
      ...config,
      portalBaseUrl: config.portalBaseUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : ''),
    },
  });
  const raw: any = res;
  const d: any = res.data || raw;
  if (d?.markingHandled || res.success) {
    return { success: true, message: d?.message || 'تم حفظ إعدادات التصحيح وCloudinary في السحابة بنجاح!' };
  }
  return {
    success: false,
    error: d?.error || res.error || 'تعذر حفظ الإعدادات في السحابة.',
  };
}

export interface MarkingWorkspaceFetchContext {
  curriculum?: WordItem[];
  writingTemplates?: DrawingTemplate[];
  videoLessons?: VideoLesson[];
  programs?: CourseProgram[];
  classrooms?: CourseClassroom[];
}

export interface MarkingWorkspaceDataResult {
  success: boolean;
  markingHandled?: boolean;
  config: MarkingConfig;
  submissions: UnifiedMarkingSubmission[];
  corrections: TeacherCorrectionRecord[];
  error?: string;
}

const normStr = (v?: string) => (v || '').trim().toLowerCase();
const normId = (v?: string) =>
  String(v || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim();

export async function fetchMarkingWorkspaceData(
  webhookUrl: string,
  ctx: MarkingWorkspaceFetchContext = {}
): Promise<MarkingWorkspaceDataResult> {
  const localCfg = getLocalMarkingConfig();
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (!url.startsWith('http')) {
    return {
      success: false,
      config: localCfg,
      submissions: [],
      corrections: [],
      error: 'يرجى ربط Google Apps Script أولاً.',
    };
  }

  const sep = url.includes('?') ? '&' : '?';
  const targetUrl = `${url}${sep}action=get_marking_workspace_data&_t=${Date.now()}`;

  let data: any = null;
  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
  } catch {}

  if (!data || !data.success) {
    try {
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (directRes.ok) data = await directRes.json().catch(() => null);
    } catch {}
  }

  if (!data || !data.success) {
    return {
      success: false,
      config: localCfg,
      submissions: [],
      corrections: [],
      error: data?.error || 'تعذر جلب تسليمات الطلاب من Google Sheets.',
    };
  }

  if (!data.markingHandled) {
    return {
      success: false,
      markingHandled: false,
      config: localCfg,
      submissions: [],
      corrections: [],
      error: 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد لتفعيل بوابة التصحيح الجماعي.',
    };
  }

  const remoteCloudName =
    typeof data.config?.cloudinaryCloudName === 'string' &&
    data.config.cloudinaryCloudName.trim() !== ''
      ? data.config.cloudinaryCloudName.trim()
      : localCfg.cloudinaryCloudName;
  const remoteUploadPreset =
    typeof data.config?.cloudinaryUploadPreset === 'string' &&
    data.config.cloudinaryUploadPreset.trim() !== ''
      ? data.config.cloudinaryUploadPreset.trim()
      : localCfg.cloudinaryUploadPreset;
  const remoteProvider =
    data.config?.videoStorageProvider === 'cloudinary' ||
    data.config?.videoStorageProvider === 'drive'
      ? data.config.videoStorageProvider
      : localCfg.videoStorageProvider || 'drive';

  const remoteCfg: MarkingConfig = {
    ...localCfg,
    ...(data.config || {}),
    videoStorageProvider: remoteProvider,
    cloudinaryCloudName: remoteCloudName,
    cloudinaryUploadPreset: remoteUploadPreset,
    presetTexts:
      Array.isArray(data.config?.presetTexts) && data.config.presetTexts.length > 0
        ? data.config.presetTexts
        : localCfg.presetTexts && localCfg.presetTexts.length > 0
        ? localCfg.presetTexts
        : DEFAULT_MARKING_PRESETS,
    stickers:
      Array.isArray(data.config?.stickers) && data.config.stickers.length > 0
        ? data.config.stickers
        : localCfg.stickers && localCfg.stickers.length > 0
        ? localCfg.stickers
        : DEFAULT_MARKING_STICKERS,
    watermark: {
      ...DEFAULT_WATERMARK_SETTINGS,
      ...(localCfg.watermark || {}),
      ...(data.config?.watermark || {}),
    },
  };
  saveLocalMarkingConfig(remoteCfg);

  const corrections: TeacherCorrectionRecord[] = Array.isArray(data.corrections)
    ? data.corrections
    : [];
  const corrMap = new Map<string, TeacherCorrectionRecord>();
  corrections.forEach((c) => {
    if (c.submissionKey) corrMap.set(c.submissionKey, c);
  });

  // Also merge existing video corrections from فيديو_التصحيح if not already in تصحيح_الواجبات
  if (Array.isArray(data.videoCorrections)) {
    data.videoCorrections.forEach((vc: any) => {
      const sId = normId(vc.studentId);
      const sName = normStr(vc.studentName);
      const title = normStr(vc.lessonTitle);
      const vKey = `video::${sId || sName}::${title}`;
      if (!corrMap.has(vKey)) {
        const imgs = Array.isArray(vc.additionalImages) ? vc.additionalImages.filter(Boolean) : [];
        const auds = Array.isArray(vc.teacherAudios) ? vc.teacherAudios.filter(Boolean) : [];
        const vids = Array.isArray(vc.teacherVideos) ? vc.teacherVideos.filter(Boolean) : [];
        const hasDone =
          vc.imageStatus === 'ممتاز' ||
          vc.audioStatus === 'ممتاز' ||
          Boolean(vc.correctedImage) ||
          auds.length > 0 ||
          vids.length > 0 ||
          Boolean(vc.imageNotes) ||
          Boolean(vc.audioNotes);
        if (hasDone) {
          corrMap.set(vKey, {
            id: `vc-${vKey}`,
            submissionKey: vKey,
            exerciseType: 'video',
            studentId: String(vc.studentId || '').trim(),
            studentName: String(vc.studentName || '').trim(),
            lessonSubject: 'فيديو تفاعلي',
            itemTitle: String(vc.lessonTitle || '').trim(),
            status:
              vc.imageStatus === 'يحتاج إعادة' || vc.audioStatus === 'يحتاج إعادة'
                ? 'retry'
                : 'corrected',
            score:
              vc.imageScore !== '' && vc.imageScore !== undefined
                ? Number(vc.imageScore)
                : vc.audioScore !== '' && vc.audioScore !== undefined
                ? Number(vc.audioScore)
                : undefined,
            notes: [vc.imageNotes, vc.audioNotes].filter(Boolean).join('\n'),
            correctedImageUrl: vc.correctedImage || imgs[0] || undefined,
            additionalImages: imgs,
            teacherAudioUrl: auds[0] || undefined,
            teacherAudios: auds,
            teacherVideoUrl: vids[0] || undefined,
            teacherVideos: vids,
            imageStatus: vc.imageStatus === 'يحتاج إعادة' ? 'retry' : vc.imageStatus ? 'corrected' : undefined,
            imageScore: vc.imageScore,
            imageRatingLabel: vc.imageStatus || undefined,
            imageNotes: vc.imageNotes,
            imageLinks: Array.isArray(vc.imageLinks) ? vc.imageLinks : undefined,
            audioStatus: vc.audioStatus === 'يحتاج إعادة' ? 'retry' : vc.audioStatus ? 'corrected' : undefined,
            audioScore: vc.audioScore,
            audioRatingLabel: vc.audioStatus || undefined,
            audioNotes: vc.audioNotes,
            audioLinks: Array.isArray(vc.audioLinks) ? vc.audioLinks : undefined,
            updatedAt: vc.audioDate || vc.imageDate || '',
          });
        }
      }
    });
  }

  const progMap = new Map<string, CourseProgram>();
  (ctx.programs || []).forEach((p) => progMap.set(p.id, p));
  const clsMap = new Map<string, CourseClassroom>();
  (ctx.classrooms || []).forEach((cl) => clsMap.set(cl.id, cl));

  const regById = new Map<string, { programId?: string; classroomId?: string }>();
  const regByName = new Map<string, { programId?: string; classroomId?: string }>();
  (Array.isArray(data.registrants) ? data.registrants : []).forEach((rg: any) => {
    const info = { programId: rg.programId || '', classroomId: rg.classroomId || '' };
    if (rg.id) regById.set(normId(rg.id), info);
    if (rg.name) regByName.set(normStr(rg.name), info);
  });

  const resolveStudentCohort = (studentId: string, studentName: string) => {
    const found =
      (studentId && regById.get(normId(studentId))) ||
      (studentName && regByName.get(normStr(studentName))) ||
      undefined;
    const programId = found?.programId || '';
    const classroomId = found?.classroomId || '';
    return {
      programId: programId || undefined,
      programName: programId ? progMap.get(programId)?.name || programId : undefined,
      classroomId: classroomId || undefined,
      classroomName: classroomId ? clsMap.get(classroomId)?.name || classroomId : undefined,
    };
  };

  const unified: UnifiedMarkingSubmission[] = [];

  // 1. Writing submissions (answers 4)
  (Array.isArray(data.writingSubmissions) ? data.writingSubmissions : []).forEach((w: any) => {
    const sId = String(w.studentId || '').trim();
    const sName = String(w.studentName || '').trim();
    const subj = String(w.lessonSubject || '').trim();
    const slot = Number(w.slotIndex || 1);
    const submissionKey = `writing::${normId(sId) || normStr(sName)}::${normStr(subj)}::${slot}`;
    const cohort = resolveStudentCohort(sId, sName);

    const tpl = (ctx.writingTemplates || []).find(
      (t) =>
        normStr(t.topic) === normStr(subj) &&
        (normStr(t.title) === normStr(w.itemTitle) || Number(t.slotIndex) === slot)
    );
    const wordRef = (ctx.curriculum || []).find(
      (c) => normStr(c.word) === normStr(w.itemTitle) || normStr(c.plainWord) === normStr(w.itemTitle)
    );

    unified.push({
      submissionKey,
      exerciseType: 'writing',
      studentId: sId,
      studentName: sName,
      ...cohort,
      lessonSubject: subj,
      itemTitle: String(w.itemTitle || `تمرين ${slot}`).trim(),
      slotIndex: slot,
      timestamp: String(w.timestamp || ''),
      studentScore: typeof w.score === 'number' ? w.score : undefined,
      studentDetails: String(w.details || ''),
      studentImageUrl: String(w.imageUrl || '').trim() || undefined,
      referenceImageUrl: tpl?.imageUrl || wordRef?.imageUrl || undefined,
      referenceAudioUrl: wordRef?.audioUrl || undefined,
      referenceAutoReadText: tpl?.arabicAudioText || wordRef?.autoReadText || w.itemTitle,
      correction: corrMap.get(submissionKey) || null,
    });
  });

  // 2. Pronunciation submissions (answers 1)
  (Array.isArray(data.pronunciationSubmissions) ? data.pronunciationSubmissions : []).forEach(
    (p: any) => {
      const sId = String(p.studentId || '').trim();
      const sName = String(p.studentName || '').trim();
      const subj = String(p.lessonSubject || '').trim();
      const wordTitle = String(p.itemTitle || '').trim();
      const submissionKey = `pronunciation::${normId(sId) || normStr(sName)}::${normStr(subj)}::${normStr(wordTitle)}`;
      const cohort = resolveStudentCohort(sId, sName);

      const wordRef = (ctx.curriculum || []).find(
        (c) =>
          (normStr(c.lessonSubject) === normStr(subj) && normStr(c.word) === normStr(wordTitle)) ||
          normStr(c.word) === normStr(wordTitle)
      );

      unified.push({
        submissionKey,
        exerciseType: 'pronunciation',
        studentId: sId,
        studentName: sName,
        ...cohort,
        lessonSubject: subj,
        itemTitle: wordTitle,
        timestamp: String(p.timestamp || ''),
        studentScore: typeof p.score === 'number' ? p.score : undefined,
        studentGrade: String(p.grade || ''),
        studentDetails: p.spokenText ? `النطق المسجل: ${p.spokenText}` : undefined,
        studentAudioUrl: String(p.audioUrl || '').trim() || undefined,
        referenceImageUrl: wordRef?.imageUrl || undefined,
        referenceAudioUrl: wordRef?.audioUrl || undefined,
        referenceAutoReadText: wordRef?.autoReadText || wordTitle,
        correction: corrMap.get(submissionKey) || null,
      });
    }
  );

  // 3. Video homework submissions (فيديو_الإجابات)
  (Array.isArray(data.videoSubmissions) ? data.videoSubmissions : []).forEach((v: any) => {
    const sId = String(v.studentId || '').trim();
    const sName = String(v.studentName || '').trim();
    const subj = String(v.lessonSubject || 'فيديو تفاعلي').trim();
    const title = String(v.itemTitle || '').trim();
    const submissionKey = `video::${normId(sId) || normStr(sName)}::${normStr(title)}`;
    const cohort = resolveStudentCohort(sId, sName);

    const vRef = (ctx.videoLessons || []).find(
      (vl) => (v.lessonId && vl.id === v.lessonId) || normStr(vl.title) === normStr(title)
    );

    let parsedAns: Record<string, unknown> = {};
    if (v.answeredQuestions && typeof v.answeredQuestions === 'object') {
      parsedAns = v.answeredQuestions;
    } else if (typeof v.answeredQuestions === 'string' && v.answeredQuestions.trim()) {
      try {
        parsedAns = JSON.parse(v.answeredQuestions);
      } catch {}
    }

    const vScoreNum =
      v.videoScore !== undefined && v.videoScore !== null
        ? Number(v.videoScore)
        : typeof v.score === 'number'
        ? v.score
        : undefined;

    unified.push({
      submissionKey,
      exerciseType: 'video',
      studentId: sId,
      studentName: sName,
      ...cohort,
      lessonId: String(v.lessonId || vRef?.id || '').trim() || undefined,
      lessonSubject: subj,
      itemTitle: title,
      timestamp: String(v.timestamp || ''),
      studentScore: vScoreNum,
      videoScore: vScoreNum,
      answeredQuestions: parsedAns,
      studentGrade: String(v.completed || ''),
      studentImageUrl: String(v.imageUrl || '').trim() || undefined,
      studentAudioUrl: String(v.audioUrl || '').trim() || undefined,
      referenceImageUrl: vRef?.image || undefined,
      referenceAudioUrl: vRef?.explainSound || undefined,
      referenceAutoReadText: vRef?.title || title,
      correction: corrMap.get(submissionKey) || null,
    });
  });

  // 4. Dictation submissions (answers 3)
  (Array.isArray(data.dictationSubmissions) ? data.dictationSubmissions : []).forEach((d: any) => {
    const sId = String(d.studentId || '').trim();
    const sName = String(d.studentName || '').trim();
    const subj = String(d.lessonSubject || '').trim();
    const submissionKey = `dictation::${normId(sId) || normStr(sName)}::${normStr(subj)}`;
    const cohort = resolveStudentCohort(sId, sName);

    unified.push({
      submissionKey,
      exerciseType: 'dictation',
      studentId: sId,
      studentName: sName,
      ...cohort,
      lessonSubject: subj,
      itemTitle: subj,
      timestamp: String(d.timestamp || ''),
      studentGrade: String(d.completionStatus || ''),
      studentDetails: String(d.details || ''),
      correction: corrMap.get(submissionKey) || null,
    });
  });

  // Sort newest / pending first
  unified.sort((a, b) => {
    const aDone = a.correction?.status === 'corrected' ? 1 : 0;
    const bDone = b.correction?.status === 'corrected' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  });

  return {
    success: true,
    markingHandled: true,
    config: remoteCfg,
    submissions: unified,
    corrections,
  };
}

export async function saveMarkingCorrectionToSheets(
  webhookUrl: string,
  payload: {
    submissionKey: string;
    exerciseType: UnifiedMarkingSubmission['exerciseType'];
    studentId: string;
    studentName: string;
    lessonSubject: string;
    itemTitle: string;
    status: TeacherCorrectionRecord['status'];
    saveMode?: TeacherCorrectionRecord['saveMode'];
    score?: number;
    ratingLabel?: string;
    notes: string;
    correctedImageUrl?: string;
    correctedImageBase64?: string;
    additionalImages?: string[];
    additionalImagesBase64?: string[];
    teacherAudioUrl?: string;
    teacherAudioBase64?: string;
    teacherAudios?: string[];
    teacherAudiosBase64?: string[];
    teacherVideoUrl?: string;
    teacherVideos?: string[];
    stickerSymbol?: string;
    stickerLabel?: string;
    imageStatus?: TeacherCorrectionRecord['status'];
    imageScore?: number | string;
    imageRatingLabel?: string;
    imageNotes?: string;
    imageStickerSymbol?: string;
    imageStickerLabel?: string;
    imageLinks?: string[];
    audioStatus?: TeacherCorrectionRecord['status'];
    audioScore?: number | string;
    audioRatingLabel?: string;
    audioNotes?: string;
    audioStickerSymbol?: string;
    audioStickerLabel?: string;
    audioLinks?: string[];
    allowRetry?: boolean;
    sendTelegram?: boolean;
    teacherName?: string;
  }
): Promise<{
  success: boolean;
  correction?: TeacherCorrectionRecord;
  telegramNotified?: boolean;
  error?: string;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const res = await callGoogleSheetsPost(url, {
    action: 'save_marking_correction',
    teacherName: payload.teacherName || 'المعلم',
    correction: payload,
  });
  const raw: any = res;
  const d: any = res.data || raw;
  if (d?.markingHandled && d?.success) {
    return {
      success: true,
      correction: d.correction,
      telegramNotified: Boolean(d.telegramNotified),
    };
  }
  return {
    success: false,
    error: d?.error || res.error || 'تعذر حفظ التصحيح في السحابة.',
  };
}

export async function saveMarkingBatchToSheets(
  webhookUrl: string,
  payload: {
    teacherName?: string;
    saveMode?: TeacherCorrectionRecord['saveMode'];
    sharedCorrectedImageUrl?: string;
    sharedCorrectedImageBase64?: string;
    sharedAdditionalImages?: string[];
    sharedAdditionalImagesBase64?: string[];
    sharedImageLinks?: string[];
    sharedTeacherAudioUrl?: string;
    sharedTeacherAudioBase64?: string;
    sharedTeacherAudios?: string[];
    sharedTeacherAudiosBase64?: string[];
    sharedAudioLinks?: string[];
    sharedTeacherVideoUrl?: string;
    sharedTeacherVideos?: string[];
    sharedStickerSymbol?: string;
    sharedStickerLabel?: string;
    sharedImageStickerSymbol?: string;
    sharedImageStickerLabel?: string;
    sharedAudioStickerSymbol?: string;
    sharedAudioStickerLabel?: string;
    items: Array<{
      submissionKey: string;
      exerciseType: UnifiedMarkingSubmission['exerciseType'];
      studentId: string;
      studentName: string;
      lessonSubject: string;
      itemTitle: string;
      status: TeacherCorrectionRecord['status'];
      saveMode?: TeacherCorrectionRecord['saveMode'];
      score?: number;
      ratingLabel?: string;
      notes: string;
      imageStatus?: TeacherCorrectionRecord['status'];
      imageScore?: number | string;
      imageRatingLabel?: string;
      imageNotes?: string;
      imageLinks?: string[];
      audioStatus?: TeacherCorrectionRecord['status'];
      audioScore?: number | string;
      audioRatingLabel?: string;
      audioNotes?: string;
      audioLinks?: string[];
      correctedImageUrl?: string;
      additionalImages?: string[];
      teacherAudioUrl?: string;
      teacherAudios?: string[];
      teacherVideoUrl?: string;
      teacherVideos?: string[];
      stickerSymbol?: string;
      stickerLabel?: string;
      allowRetry?: boolean;
      sendTelegram?: boolean;
    }>;
  }
): Promise<{
  success: boolean;
  count?: number;
  telegramSentCount?: number;
  corrections?: TeacherCorrectionRecord[];
  error?: string;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const res = await callGoogleSheetsPost(url, {
    action: 'save_marking_batch',
    ...payload,
  });
  const raw: any = res;
  const d: any = res.data || raw;
  if (d?.markingHandled && d?.success) {
    return {
      success: true,
      count: Number(d.count || 0),
      telegramSentCount: Number(d.telegramSentCount || 0),
      corrections: Array.isArray(d.corrections) ? d.corrections : [],
    };
  }
  return {
    success: false,
    error: d?.error || res.error || 'تعذر حفظ التصحيح الجماعي.',
  };
}

export async function clearMarkingCorrectionToSheets(
  webhookUrl: string,
  submissionKey: string
): Promise<{ success: boolean; error?: string }> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const res = await callGoogleSheetsPost(url, {
    action: 'clear_marking_correction',
    submissionKey,
  });
  const raw: any = res;
  const d: any = res.data || raw;
  if (d?.markingHandled && d?.success) {
    return { success: true };
  }
  return {
    success: false,
    error: d?.error || res.error || 'تعذر مسح التصحيح من الشيت.',
  };
}

export async function clearMarkingBatchToSheets(
  webhookUrl: string,
  submissionKeys: string[]
): Promise<{ success: boolean; count?: number; error?: string }> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const res = await callGoogleSheetsPost(url, {
    action: 'clear_marking_batch',
    submissionKeys,
  });
  const raw: any = res;
  const d: any = res.data || raw;
  if (d?.markingHandled && d?.success) {
    return { success: true, count: Number(d.count || 0) };
  }
  return {
    success: false,
    error: d?.error || res.error || 'تعذر مسح التصحيحات المحددة.',
  };
}

export async function fetchStudentAchievementSummary(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<{ success: boolean; summary?: StudentAchievementSummary; error?: string }> {
  const cleanId = normId(studentId);
  const cleanName = (studentName || '').trim();
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (!url.startsWith('http')) {
    return { success: false, error: 'رابط Google Apps Script غير مضبوط.' };
  }
  const sep = url.includes('?') ? '&' : '?';
  const targetUrl = `${url}${sep}action=get_student_achievement_summary&studentId=${encodeURIComponent(
    cleanId
  )}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;

  let data: any = null;
  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
  } catch {}
  if (!data || !data.success) {
    try {
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (directRes.ok) data = await directRes.json().catch(() => null);
    } catch {}
  }

  if (data?.success && data?.summary) {
    return { success: true, summary: data.summary as StudentAchievementSummary };
  }
  return {
    success: false,
    error: data?.error || 'تعذر جلب تقرير إنجاز الطالب. تأكد من تحديث كود Apps Script.',
  };
}

export async function fetchStudentMarkingCorrections(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<TeacherCorrectionRecord[]> {
  const cleanId = normId(studentId);
  const cleanName = (studentName || '').trim();
  const cacheKey = `${STORAGE_KEY_MARKING_CORRECTIONS_PREFIX}${cleanId || cleanName || 'anon'}`;

  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http') && (cleanId || cleanName)) {
    const sep = url.includes('?') ? '&' : '?';
    const targetUrl = `${url}${sep}action=get_student_corrections&studentId=${encodeURIComponent(cleanId)}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;
    let data: any = null;
    try {
      const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
      if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
    } catch {}
    if (!data || !data.success) {
      try {
        const directRes = await fetch(targetUrl, { method: 'GET', headers: { Accept: 'application/json' } });
        if (directRes.ok) data = await directRes.json().catch(() => null);
      } catch {}
    }
    if (data && data.success && Array.isArray(data.corrections)) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data.corrections));
      } catch {}
      return data.corrections;
    }
  }

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  return [];
}

export async function fetchMarkingDriveMediaFiles(
  webhookUrl: string
): Promise<{ success: boolean; files: MarkingMediaFileItem[]; error?: string }> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (!url.startsWith('http')) {
    return { success: false, files: [], error: 'رابط Google Apps Script غير مضبوط.' };
  }
  const sep = url.includes('?') ? '&' : '?';
  const targetUrl = `${url}${sep}action=list_marking_media_files&_t=${Date.now()}`;
  let data: any = null;
  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
  } catch {}
  if (!data || !data.success) {
    try {
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (directRes.ok) data = await directRes.json().catch(() => null);
    } catch {}
  }

  if (data?.success && Array.isArray(data.files)) {
    return {
      success: true,
      files: data.files as MarkingMediaFileItem[],
    };
  }
  return {
    success: false,
    files: [],
    error: data?.error || 'تعذر جلب ملفات Google Drive. تأكد من تحديث ونشر Apps Script الجديد.',
  };
}

export async function deleteMarkingMediaFileFromSheetsAndDrive(
  webhookUrl: string,
  payload: { fileId?: string; url?: string }
): Promise<{ success: boolean; trashedDrive?: boolean; cleanedRows?: number; error?: string }> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const res = await callGoogleSheetsPost(url, {
    action: 'delete_marking_media_file',
    fileId: payload.fileId || '',
    url: payload.url || '',
  });
  const raw: any = res;
  const d: any = res.data || raw;
  if (d?.success) {
    return {
      success: true,
      trashedDrive: Boolean(d.trashedDrive),
      cleanedRows: Number(d.cleanedRows || 0),
    };
  }
  return {
    success: false,
    error: d?.error || res.error || 'تعذر حذف الملف من Drive / الشيت.',
  };
}

export async function fetchCloudinaryLibraryResources(params?: {
  cloudName?: string;
}): Promise<{
  success: boolean;
  configured: boolean;
  files: MarkingMediaFileItem[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/cloudinary/resources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloudName: params?.cloudName || '',
      }),
    });
    const data = await res.json().catch(() => null);
    if (!data) {
      return { success: false, configured: false, files: [], error: 'استجابة غير صالحة من الخادم.' };
    }
    return {
      success: Boolean(data.success),
      configured: Boolean(data.configured),
      files: Array.isArray(data.files) ? (data.files as MarkingMediaFileItem[]) : [],
      error: data.error,
    };
  } catch (err: any) {
    return {
      success: false,
      configured: false,
      files: [],
      error: err?.message || 'تعذر الاتصال بخدمة Cloudinary في الخادم.',
    };
  }
}

export async function deleteCloudinaryLibraryResource(params: {
  publicId: string;
  resourceType?: 'video' | 'image' | 'raw';
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/cloudinary/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return { success: true };
    }
    return {
      success: false,
      error: data?.error || 'تعذر حذف الملف من Cloudinary.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'تعذر حذف الملف من Cloudinary.',
    };
  }
}

