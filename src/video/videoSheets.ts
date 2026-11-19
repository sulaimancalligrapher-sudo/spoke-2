import { callGoogleSheetsPost } from '../utils/googleSheets';
import { extractDriveFileId, getAlternativeAudioUrls, getDirectImageUrl } from '../utils/mediaUrl';
import {
  TelegramConfig,
  TelegramStudentLink,
  VideoAnsweredQuestionEntry,
  VideoCorrectionEntry,
  VideoLesson,
  VideoStudentProgress,
  VideoStudentSubmissionRow,
  VideoTimestampQuestion,
} from './types';

export const VIDEO_SHEETS = {
  QUESTIONS: 'فيديو_الأسئلة',
  ANSWERS: 'فيديو_الإجابات',
  CORRECTIONS: 'فيديو_التصحيح',
  TELEGRAM_CONFIG: 'تيليغرام_الإعدادات',
  TELEGRAM_USERS: 'تيليغرام_الطلاب',
} as const;

const STORAGE_KEY_VIDEO_LESSONS = 'faseeh_video_lessons_v1';
const STORAGE_KEY_VIDEO_PROGRESS_PREFIX = 'faseeh_video_progress_v1_';

export const INITIAL_VIDEO_LESSONS: VideoLesson[] = [
  {
    id: 'video-sample-1',
    topic: 'مخارج الحروف الأساسية',
    title: 'الدرس التفاعلي 1: مخارج الحروف والمدود',
    instruction:
      'شاهد الفيديو بتركيز، وسيظهر لك سؤال تفاعلي تلقائياً عند الدقيقة المحددة. يمكنك بعدها تسليم صورة الواجب أو تسجيل صوتك.',
    videoUrl: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
    explainSound: '',
    image: '',
    showResult: 'نعم',
    allowRecording: 'نعم',
    maxRecordingTime: 60,
    allowUpload: 'نعم',
    uploadTitle: 'تصوير واجب كتابة الحروف',
    retryCount: 2,
    questions: [
      {
        id: 'vq-sample-1-1',
        slotIndex: 0,
        time: 5,
        question: 'كم عدد الحروف الهجائية في اللغة العربية؟',
        options: ['28 حرفاً', '26 حرفاً', '30 حرفاً'],
        correctAnswer: '28 حرفاً',
      },
      {
        id: 'vq-sample-1-2',
        slotIndex: 1,
        time: 12,
        question: 'اختر حرف المد المناسب للكلمة: بَـا...',
        options: ['الألف (ا)', 'السكون (ْ)', 'الشدة (ّ)'],
        correctAnswer: 'الألف (ا)',
      },
    ],
    audioQuestions: [],
  },
];

export function extractYouTubeVideoId(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const match = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (match && match[1]) return match[1];
  const vParam = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return vParam && vParam[1] ? vParam[1] : null;
}

export function getPlayableVideoInfo(url?: string): {
  kind: 'youtube' | 'drive_embed' | 'html5' | 'none';
  youtubeId?: string;
  src?: string;
  embedUrl?: string;
} {
  if (!url || !url.trim()) return { kind: 'none' };
  const trimmed = url.trim();

  const ytId = extractYouTubeVideoId(trimmed);
  if (ytId) {
    return { kind: 'youtube', youtubeId: ytId };
  }

  const driveId = extractDriveFileId(trimmed);
  if (driveId) {
    return {
      kind: 'html5',
      src: `/api/proxy-audio?id=${encodeURIComponent(driveId)}`,
      embedUrl: `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`,
    };
  }

  return { kind: 'html5', src: trimmed };
}

export function resolveVideoQuestionImage(url?: string): string {
  return url ? getDirectImageUrl(url) : '';
}

export function resolveVideoAudioAlternatives(url?: string): string[] {
  return url ? getAlternativeAudioUrls(url) : [];
}

export function parseVideoDate(raw?: string): Date | null {
  if (!raw) return null;
  const clean = String(raw).trim();
  if (!clean) return null;
  const normalized = clean.replace(/[年月]/g, '-').replace(/日/g, '').replace(/\//g, '-');
  const parsed = new Date(normalized);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getVideoLessonScheduleStatus(lesson: VideoLesson): {
  isAvailable: boolean;
  reason?: 'not_started' | 'expired';
  effectiveEndDate?: string;
} {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const start = parseVideoDate(lesson.startDate);
  if (start) {
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    if (todayStart < startDay) {
      return { isAvailable: false, reason: 'not_started' };
    }
  }

  const end = parseVideoDate(lesson.endDate);
  if (end) {
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();
    if (Date.now() > endDay) {
      return {
        isAvailable: false,
        reason: 'expired',
        effectiveEndDate: end.toLocaleDateString('ar-SA'),
      };
    }
    return { isAvailable: true, effectiveEndDate: end.toLocaleDateString('ar-SA') };
  }

  const expireDays = Number(lesson.expireAfterDays);
  if (start && !isNaN(expireDays) && expireDays > 0) {
    const computedEnd = new Date(start.getTime() + expireDays * 24 * 60 * 60 * 1000);
    const endDay = new Date(
      computedEnd.getFullYear(),
      computedEnd.getMonth(),
      computedEnd.getDate(),
      23,
      59,
      59,
      999
    ).getTime();
    if (Date.now() > endDay) {
      return {
        isAvailable: false,
        reason: 'expired',
        effectiveEndDate: computedEnd.toLocaleDateString('ar-SA'),
      };
    }
    return { isAvailable: true, effectiveEndDate: computedEnd.toLocaleDateString('ar-SA') };
  }

  return { isAvailable: true };
}

function normalizeQuestionItem(raw: any, idx: number): VideoTimestampQuestion | null {
  if (!raw) return null;
  const qText = String(raw.question || raw.q || '').trim();
  const img = String(raw.image || '').trim();
  const aud = String(raw.audio || '').trim();
  if (!qText && !img && !aud) return null;

  const rawOpts = Array.isArray(raw.options)
    ? raw.options
    : typeof raw.options === 'string'
    ? raw.options.split(/[|,،\n]/).map((s: string) => s.trim())
    : [];

  const cleanOpts = rawOpts.map((o: any) => String(o ?? '').trim()).filter(Boolean);
  const timeNum = Number(raw.time ?? raw.timestamp ?? 0);

  return {
    id: String(raw.id || `vq_${idx}_${isNaN(timeNum) ? 0 : timeNum}`),
    slotIndex: typeof raw.slotIndex === 'number' ? raw.slotIndex : idx,
    time: isNaN(timeNum) ? 0 : Math.max(0, timeNum),
    question: qText,
    image: img || undefined,
    audio: aud || undefined,
    options: cleanOpts,
    correctAnswer: String(raw.correctAnswer || '').trim(),
  };
}

function normalizeVideoLessonRow(raw: any, idx: number): VideoLesson | null {
  const title = String(raw.title || raw.word || raw.lessonTitle || '').trim();
  const videoUrl = String(raw.videoUrl || raw.youtubeUrl || '').trim();
  if (!title && !videoUrl) return null;

  const rawQs = Array.isArray(raw.questions) ? raw.questions : [];
  const rawAudioQs = Array.isArray(raw.audioQuestions) ? raw.audioQuestions : [];

  const questions = rawQs
    .map((q: any, i: number) => normalizeQuestionItem(q, i))
    .filter((q: VideoTimestampQuestion | null): q is VideoTimestampQuestion => Boolean(q));

  const audioQuestions = rawAudioQs
    .map((q: any, i: number) => normalizeQuestionItem(q, i))
    .filter((q: VideoTimestampQuestion | null): q is VideoTimestampQuestion => Boolean(q));

  const retryNum = Number(raw.retryCount ?? raw.defaultRetryResetCount ?? 1);

  return {
    id: String(raw.id || raw.comment || `video-row-${idx + 1}`),
    rowIndex: typeof raw.rowIndex === 'number' ? raw.rowIndex : idx + 2,
    topic: String(raw.topic || raw.lessonSubject || raw.comment || 'دروس الفيديو التفاعلي').trim(),
    title: title || `درس فيديو ${idx + 1}`,
    instruction: String(raw.instruction || '').trim() || undefined,
    videoUrl,
    explainSound: String(raw.explainSound || '').trim() || undefined,
    image: String(raw.image || '').trim() || undefined,
    showResult: String(raw.showResult || 'نعم').trim() === 'لا' ? 'لا' : 'نعم',
    allowRecording: String(raw.allowRecording || 'نعم').trim() === 'لا' ? 'لا' : 'نعم',
    maxRecordingTime: Math.max(0, Number(raw.maxRecordingTime ?? 60) || 60),
    allowUpload: String(raw.allowUpload || 'نعم').trim() === 'لا' ? 'لا' : 'نعم',
    uploadTitle: String(raw.uploadTitle || '').trim() || undefined,
    retryCount: isNaN(retryNum) ? 1 : Math.max(0, retryNum),
    startDate: String(raw.startDate || '').trim() || undefined,
    endDate: String(raw.endDate || '').trim() || undefined,
    expireAfterDays: raw.expireAfterDays !== undefined ? raw.expireAfterDays : undefined,
    questions,
    audioQuestions,
  };
}

export function getLocalVideoLessons(): VideoLesson[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VIDEO_LESSONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return INITIAL_VIDEO_LESSONS;
}

export function saveLocalVideoLessons(lessons: VideoLesson[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_VIDEO_LESSONS, JSON.stringify(lessons));
  } catch {}
}

export async function fetchVideoLessonsFromSheets(webhookUrl: string): Promise<VideoLesson[]> {
  if (webhookUrl && webhookUrl.trim().startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, {
        action: 'get_video_lessons',
        sheetName: VIDEO_SHEETS.QUESTIONS,
      });
      const listRaw = res?.data?.lessons || res?.data?.items || (Array.isArray(res?.data) ? res.data : null);
      if (res.success && Array.isArray(listRaw) && listRaw.length > 0) {
        const mapped = listRaw
          .map((row: any, idx: number) => normalizeVideoLessonRow(row, idx))
          .filter((l): l is VideoLesson => Boolean(l));
        if (mapped.length > 0) {
          saveLocalVideoLessons(mapped);
          return mapped;
        }
      }
    } catch (e) {
      console.warn('Video lessons sheet fetch fallback to local:', e);
    }
  }
  return getLocalVideoLessons();
}

function getProgressStorageKey(studentId?: string): string {
  const cleanId = (studentId || 'guest').trim();
  return `${STORAGE_KEY_VIDEO_PROGRESS_PREFIX}${cleanId}`;
}

export function getLocalVideoProgressMap(studentId?: string): Record<string, VideoStudentProgress> {
  try {
    const raw = localStorage.getItem(getProgressStorageKey(studentId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

export function saveLocalVideoProgressMap(
  studentId: string | undefined,
  map: Record<string, VideoStudentProgress>
): void {
  try {
    localStorage.setItem(getProgressStorageKey(studentId), JSON.stringify(map));
  } catch {}
}

export function clearLocalVideoProgress(studentId?: string): void {
  try {
    localStorage.removeItem(getProgressStorageKey(studentId));
  } catch {}
}

export async function fetchStudentVideoProgress(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<Record<string, VideoStudentProgress>> {
  const localMap = getLocalVideoProgressMap(studentId);
  if (!webhookUrl || !webhookUrl.trim().startsWith('http') || (!studentId && !studentName)) {
    return localMap;
  }

  try {
    const res = await callGoogleSheetsPost(webhookUrl, {
      action: 'get_video_answers',
      sheetName: VIDEO_SHEETS.ANSWERS,
      studentId,
      studentName,
    });
    const rows = res?.data?.answers || res?.data?.items;
    if (res.success && Array.isArray(rows)) {
      const sheetMap: Record<string, VideoStudentProgress> = {};
      rows.forEach((row: any) => {
        const lid = String(row.lessonId || row.id || row.title || '').trim();
        if (!lid) return;
        const parsedAns =
          row.answeredQuestions && typeof row.answeredQuestions === 'object'
            ? row.answeredQuestions
            : {};
        sheetMap[lid] = {
          lessonId: lid,
          topic: String(row.topic || '').trim(),
          title: String(row.title || '').trim(),
          completed: (row.completed as any) || '',
          videoScore: Number(row.videoScore ?? 0) || 0,
          explainAudioScore: Number(row.explainAudioScore ?? 0) || 0,
          answeredQuestions: parsedAns,
          retryResetCount:
            row.retryResetCount !== undefined && row.retryResetCount !== null
              ? Number(row.retryResetCount)
              : 0,
          imageLink: String(row.imageLink || '').trim() || undefined,
          recordingLink: String(row.recordingLink || '').trim() || undefined,
          updatedAt: String(row.updatedAt || '').trim() || undefined,
        };
      });
      saveLocalVideoProgressMap(studentId, sheetMap);
      return sheetMap;
    }
  } catch (e) {
    console.warn('Video progress fetch fallback to local:', e);
  }

  return localMap;
}

export async function saveVideoQuestionAnswer(
  webhookUrl: string,
  params: {
    studentId: string;
    studentName: string;
    lesson: VideoLesson;
    entry: VideoAnsweredQuestionEntry;
    currentProgress: VideoStudentProgress;
  }
): Promise<{ success: boolean; updatedProgress: VideoStudentProgress }> {
  const { studentId, studentName, lesson, entry, currentProgress } = params;
  const nextAnswers = {
    ...currentProgress.answeredQuestions,
    [entry.questionKey]: entry,
  };

  const totalQs = lesson.questions.length + lesson.audioQuestions.length;
  const answeredValues = Object.values(nextAnswers);
  const gradable = answeredValues.filter((a) => a.isCorrect !== null);
  const correctCount = gradable.filter((a) => a.isCorrect === true).length;
  const videoScore =
    gradable.length > 0
      ? Math.round((correctCount / Math.max(gradable.length, totalQs || 1)) * 100)
      : totalQs > 0
      ? Math.round((answeredValues.length / totalQs) * 100)
      : 100;

  const allMainVideoAnswered =
    lesson.questions.length > 0
      ? lesson.questions.every((_, idx) => Boolean(nextAnswers[`vq_${idx}`]))
      : lesson.audioQuestions.length > 0 &&
        lesson.audioQuestions.every((_, idx) => Boolean(nextAnswers[`aq_${idx}`]));

  const updatedProgress: VideoStudentProgress = {
    ...currentProgress,
    lessonId: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    answeredQuestions: nextAnswers,
    videoScore,
    completed: allMainVideoAnswered ? 'تم' : currentProgress.completed,
    updatedAt: new Date().toISOString(),
  };

  const map = getLocalVideoProgressMap(studentId);
  map[lesson.id] = updatedProgress;
  saveLocalVideoProgressMap(studentId, map);

  if (webhookUrl && webhookUrl.trim().startsWith('http') && studentId) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, {
        action: 'save_video_answer',
        sheetName: VIDEO_SHEETS.ANSWERS,
        studentId,
        studentName,
        lessonId: lesson.id,
        topic: lesson.topic,
        title: lesson.title,
        questionKey: entry.questionKey,
        question: entry.question,
        selectedAnswer: entry.selectedAnswer,
        isCorrect: entry.isCorrect,
        questionType: entry.type,
        videoScore,
        autoComplete: allMainVideoAnswered,
        completed: allMainVideoAnswered ? 'تم' : currentProgress.completed,
        answeredAt: entry.answeredAt,
      });
      return { success: res.success, updatedProgress };
    } catch {}
  }

  return { success: true, updatedProgress };
}

export async function saveVideoHomeworkMedia(
  webhookUrl: string,
  params: {
    studentId: string;
    studentName: string;
    lesson: VideoLesson;
    mediaType: 'image' | 'audio';
    base64Data: string;
    mimeType: string;
    currentProgress: VideoStudentProgress;
  }
): Promise<{ success: boolean; mediaUrl: string; updatedProgress: VideoStudentProgress; cloudSaved: boolean }> {
  const { studentId, studentName, lesson, mediaType, base64Data, mimeType, currentProgress } = params;
  let finalUrl = base64Data;
  let cloudSaved = false;

  if (webhookUrl && webhookUrl.trim().startsWith('http') && studentId) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, {
        action: 'upload_video_media',
        sheetName: VIDEO_SHEETS.ANSWERS,
        studentId,
        studentName,
        lessonId: lesson.id,
        topic: lesson.topic,
        title: lesson.title,
        mediaType,
        base64Data,
        mimeType,
      });
      if (res.success && res.data?.url) {
        finalUrl = String(res.data.url);
        cloudSaved = true;
      } else if (res.success) {
        cloudSaved = true;
      }
    } catch {}
  }

  const updatedProgress: VideoStudentProgress = {
    ...currentProgress,
    lessonId: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    imageLink: mediaType === 'image' ? finalUrl : currentProgress.imageLink,
    recordingLink: mediaType === 'audio' ? finalUrl : currentProgress.recordingLink,
    updatedAt: new Date().toISOString(),
  };

  const map = getLocalVideoProgressMap(studentId);
  map[lesson.id] = updatedProgress;
  saveLocalVideoProgressMap(studentId, map);

  return { success: true, mediaUrl: finalUrl, updatedProgress, cloudSaved };
}

export async function completeVideoLesson(
  webhookUrl: string,
  params: {
    studentId: string;
    studentName: string;
    lesson: VideoLesson;
    currentProgress: VideoStudentProgress;
  }
): Promise<{ success: boolean; updatedProgress: VideoStudentProgress; cloudSaved: boolean }> {
  const { studentId, studentName, lesson, currentProgress } = params;
  const updatedProgress: VideoStudentProgress = {
    ...currentProgress,
    lessonId: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    completed: 'تم',
    updatedAt: new Date().toISOString(),
  };

  const map = getLocalVideoProgressMap(studentId);
  map[lesson.id] = updatedProgress;
  saveLocalVideoProgressMap(studentId, map);

  let cloudSaved = false;
  if (webhookUrl && webhookUrl.trim().startsWith('http') && studentId) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, {
        action: 'complete_video_lesson',
        sheetName: VIDEO_SHEETS.ANSWERS,
        studentId,
        studentName,
        lessonId: lesson.id,
        topic: lesson.topic,
        title: lesson.title,
        videoScore: updatedProgress.videoScore,
        explainAudioScore: updatedProgress.explainAudioScore,
        imageLink: updatedProgress.imageLink || '',
        recordingLink: updatedProgress.recordingLink || '',
        completed: 'تم',
      });
      cloudSaved = Boolean(res.success);
    } catch {}
  }

  return { success: true, updatedProgress, cloudSaved };
}

export async function consumeVideoRetryAttempt(
  webhookUrl: string,
  params: {
    studentId: string;
    studentName: string;
    lesson: VideoLesson;
    currentProgress: VideoStudentProgress;
  }
): Promise<{ success: boolean; updatedProgress: VideoStudentProgress }> {
  const { studentId, studentName, lesson, currentProgress } = params;
  const currentRemaining =
    typeof currentProgress.retryResetCount === 'number'
      ? currentProgress.retryResetCount
      : lesson.retryCount;

  const updatedProgress: VideoStudentProgress = {
    ...currentProgress,
    completed: 'إعادة',
    retryResetCount: Math.max(0, currentRemaining - 1),
    answeredQuestions: {},
    videoScore: 0,
    updatedAt: new Date().toISOString(),
  };

  const map = getLocalVideoProgressMap(studentId);
  map[lesson.id] = updatedProgress;
  saveLocalVideoProgressMap(studentId, map);

  if (webhookUrl && webhookUrl.trim().startsWith('http') && studentId) {
    try {
      await callGoogleSheetsPost(webhookUrl, {
        action: 'retry_video_lesson',
        sheetName: VIDEO_SHEETS.ANSWERS,
        studentId,
        studentName,
        lessonId: lesson.id,
        topic: lesson.topic,
        title: lesson.title,
        retryResetCount: updatedProgress.retryResetCount,
      });
    } catch {}
  }

  return { success: true, updatedProgress };
}

export async function fetchVideoCorrections(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<VideoCorrectionEntry[]> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http') || (!studentId && !studentName)) {
    return [];
  }

  try {
    const res = await callGoogleSheetsPost(webhookUrl, {
      action: 'get_video_corrections',
      sheetName: VIDEO_SHEETS.CORRECTIONS,
      studentId,
      studentName,
    });
    const list = res?.data?.corrections || res?.data?.items;
    if (res.success && Array.isArray(list)) {
      return list.map((c: any) => ({
        lessonTitle: String(c.lessonTitle || c.title || '').trim(),
        studentName: String(c.studentName || studentName || '').trim(),
        studentId: String(c.studentId || studentId || '').trim(),
        imageStatus: String(c.imageStatus || '').trim(),
        imageScore: String(c.imageScore || '').trim(),
        correctedImage: String(c.correctedImage || '').trim(),
        additionalImages: Array.isArray(c.additionalImages) ? c.additionalImages : [],
        imageDate: String(c.imageDate || '').trim() || undefined,
        imageNotes: String(c.imageNotes || '').trim() || undefined,
        audioStatus: String(c.audioStatus || '').trim(),
        audioScore: String(c.audioScore || '').trim(),
        teacherAudios: Array.isArray(c.teacherAudios) ? c.teacherAudios : [],
        teacherVideos: Array.isArray(c.teacherVideos) ? c.teacherVideos : [],
        audioDate: String(c.audioDate || '').trim() || undefined,
        audioNotes: String(c.audioNotes || '').trim() || undefined,
      }));
    }
  } catch (e) {
    console.warn('Video corrections fetch notice:', e);
  }
  return [];
}

// =========================================================================
// ADMIN PANEL & TEACHER CORRECTION HELPERS (فيديو_الأسئلة / فيديو_التصحيح)
// =========================================================================

const STORAGE_KEY_TELEGRAM_CONFIG = 'faseeh_video_telegram_config_v1';
const STORAGE_KEY_TELEGRAM_USERS = 'faseeh_video_telegram_users_v1';

export async function saveVideoLessonToSheets(
  webhookUrl: string,
  lesson: VideoLesson,
  currentLessons: VideoLesson[]
): Promise<{ success: boolean; lessons: VideoLesson[]; cloudSaved: boolean; message?: string }> {
  const exists = currentLessons.some((l) => l.id === lesson.id);
  const nextList = exists
    ? currentLessons.map((l) => (l.id === lesson.id ? lesson : l))
    : [...currentLessons, lesson];
  saveLocalVideoLessons(nextList);

  if (webhookUrl && webhookUrl.trim().startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, {
        action: 'save_video_lesson',
        sheetName: VIDEO_SHEETS.QUESTIONS,
        lesson,
      });
      return {
        success: true,
        lessons: nextList,
        cloudSaved: Boolean(res.success),
        message: res.message || (res.success ? 'تم حفظ درس الفيديو في Google Sheets بنجاح' : undefined),
      };
    } catch {}
  }

  return { success: true, lessons: nextList, cloudSaved: false };
}

export async function deleteVideoLessonFromSheets(
  webhookUrl: string,
  lessonId: string,
  currentLessons: VideoLesson[]
): Promise<{ success: boolean; lessons: VideoLesson[]; cloudSaved: boolean }> {
  const target = currentLessons.find((l) => l.id === lessonId);
  const nextList = currentLessons.filter((l) => l.id !== lessonId);
  saveLocalVideoLessons(nextList);

  if (webhookUrl && webhookUrl.trim().startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, {
        action: 'delete_video_lesson',
        sheetName: VIDEO_SHEETS.QUESTIONS,
        lessonId,
        rowIndex: target?.rowIndex,
        title: target?.title,
      });
      return { success: true, lessons: nextList, cloudSaved: Boolean(res.success) };
    } catch {}
  }

  return { success: true, lessons: nextList, cloudSaved: false };
}

export async function syncAllVideoLessonsToSheets(
  webhookUrl: string,
  lessons: VideoLesson[]
): Promise<{ success: boolean; message: string }> {
  saveLocalVideoLessons(lessons);
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير صالح' };
  }

  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'sync_video_lessons',
    sheetName: VIDEO_SHEETS.QUESTIONS,
    lessons,
  });

  return {
    success: Boolean(res.success),
    message:
      res.message ||
      (res.success
        ? `تم مزامنة ${lessons.length} دروس فيديو في ورقة "${VIDEO_SHEETS.QUESTIONS}" بنجاح!`
        : res.error || 'تعذر المزامنة مع Google Sheets'),
  };
}

export async function fetchAllVideoSubmissionsForAdmin(
  webhookUrl: string
): Promise<VideoStudentSubmissionRow[]> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) return [];

  try {
    const res = await callGoogleSheetsPost(webhookUrl, {
      action: 'get_all_video_submissions',
      sheetName: VIDEO_SHEETS.ANSWERS,
      correctionsSheetName: VIDEO_SHEETS.CORRECTIONS,
    });
    const list = res?.data?.submissions || res?.data?.items;
    if (res.success && Array.isArray(list)) {
      return list.map((row: any, idx: number) => ({
        rowIndex: typeof row.rowIndex === 'number' ? row.rowIndex : idx + 2,
        studentId: String(row.studentId || '').trim(),
        studentName: String(row.studentName || '').trim(),
        lessonId: String(row.lessonId || '').trim(),
        topic: String(row.topic || '').trim(),
        title: String(row.title || '').trim(),
        completed: (row.completed as any) || '',
        videoScore: Number(row.videoScore ?? 0) || 0,
        explainAudioScore: Number(row.explainAudioScore ?? 0) || 0,
        answeredQuestions:
          row.answeredQuestions && typeof row.answeredQuestions === 'object'
            ? row.answeredQuestions
            : {},
        retryResetCount: Number(row.retryResetCount ?? 0) || 0,
        imageLink: String(row.imageLink || '').trim() || undefined,
        recordingLink: String(row.recordingLink || '').trim() || undefined,
        updatedAt: String(row.updatedAt || '').trim() || undefined,
        correction: row.correction || undefined,
      }));
    }
  } catch (e) {
    console.warn('Error fetching all video submissions:', e);
  }
  return [];
}

export async function saveTeacherVideoCorrection(
  webhookUrl: string,
  payload: {
    lessonTitle: string;
    studentId: string;
    studentName: string;
    imageStatus: string;
    imageScore: string;
    correctedImage?: string;
    correctedImageBase64?: string;
    additionalImages?: string[];
    imageNotes?: string;
    audioStatus: string;
    audioScore: string;
    teacherAudios?: string[];
    teacherAudioBase64?: string;
    teacherVideos?: string[];
    audioNotes?: string;
    sendTelegram?: boolean;
  }
): Promise<{ success: boolean; correction?: VideoCorrectionEntry; telegramSent?: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير صالح' };
  }

  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'save_video_correction',
    sheetName: VIDEO_SHEETS.CORRECTIONS,
    ...payload,
  });

  return {
    success: Boolean(res.success),
    correction: res.data?.correction,
    telegramSent: Boolean(res.data?.telegramSent),
    message:
      res.message ||
      (res.success ? 'تم حفظ التصحيح وإرساله بنجاح!' : res.error || 'تعذر حفظ التصحيح'),
  };
}

// =========================================================================
// TELEGRAM BOT SETTINGS & NOTIFICATIONS (تيليغرام_الإعدادات / تيليغرام_الطلاب)
// =========================================================================

export function getLocalTelegramConfig(): TelegramConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TELEGRAM_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        botToken: String(parsed.botToken || ''),
        botUsername: String(parsed.botUsername || ''),
        enabled: Boolean(parsed.enabled),
        welcomeMessage: String(
          parsed.welcomeMessage ||
            'مرحباً بك! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم.'
        ),
        webhookUrl: parsed.webhookUrl ? String(parsed.webhookUrl) : undefined,
      };
    }
  } catch {}
  return {
    botToken: '',
    botUsername: '',
    enabled: false,
    welcomeMessage: 'مرحباً بك! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم.',
  };
}

export function saveLocalTelegramConfig(config: TelegramConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_TELEGRAM_CONFIG, JSON.stringify(config));
  } catch {}
}

export async function fetchTelegramConfig(webhookUrl: string): Promise<TelegramConfig> {
  const local = getLocalTelegramConfig();
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) return local;
  try {
    const res = await callGoogleSheetsPost(webhookUrl, {
      action: 'get_telegram_config',
      sheetName: VIDEO_SHEETS.TELEGRAM_CONFIG,
    });
    if (res.success && res.data?.config) {
      const cfg: TelegramConfig = {
        botToken: String(res.data.config.botToken || ''),
        botUsername: String(res.data.config.botUsername || ''),
        enabled: Boolean(res.data.config.enabled),
        welcomeMessage: String(res.data.config.welcomeMessage || local.welcomeMessage || ''),
        webhookUrl: res.data.config.webhookUrl ? String(res.data.config.webhookUrl) : undefined,
      };
      saveLocalTelegramConfig(cfg);
      return cfg;
    }
  } catch {}
  return local;
}

export async function saveTelegramConfig(
  webhookUrl: string,
  config: TelegramConfig
): Promise<{ success: boolean; message: string }> {
  saveLocalTelegramConfig(config);
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'تم الحفظ محلياً (أدخل رابط Webhook لمزامنة الشيت)' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'save_telegram_config',
    sheetName: VIDEO_SHEETS.TELEGRAM_CONFIG,
    config,
  });
  return {
    success: Boolean(res.success),
    message:
      res.message ||
      (res.success ? 'تم حفظ إعدادات تيليغرام في الشيت بنجاح' : res.error || 'تعذر حفظ الإعدادات'),
  };
}

export async function fetchTelegramUsers(webhookUrl: string): Promise<TelegramStudentLink[]> {
  try {
    if (webhookUrl && webhookUrl.trim().startsWith('http')) {
      const res = await callGoogleSheetsPost(webhookUrl, {
        action: 'get_telegram_users',
        sheetName: VIDEO_SHEETS.TELEGRAM_USERS,
      });
      const users = res?.data?.users;
      if (res.success && Array.isArray(users)) {
        const clean: TelegramStudentLink[] = users.map((u: any) => ({
          studentId: String(u.studentId || '').trim(),
          studentName: String(u.studentName || '').trim(),
          chatId: String(u.chatId || '').trim(),
          telegramUsername: String(u.telegramUsername || '').trim() || undefined,
          linkedAt: String(u.linkedAt || '').trim() || undefined,
          notificationsEnabled: u.notificationsEnabled !== false,
        }));
        try {
          localStorage.setItem(STORAGE_KEY_TELEGRAM_USERS, JSON.stringify(clean));
        } catch {}
        return clean;
      }
    }
  } catch {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TELEGRAM_USERS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function sendTelegramNotification(
  webhookUrl: string,
  params: {
    studentId?: string;
    studentName?: string;
    chatId?: string;
    message: string;
    photoUrl?: string;
    broadcastAll?: boolean;
  }
): Promise<{ success: boolean; sentCount?: number; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'يرجى ربط Google Sheets Webhook أولاً لإرسال الإشعارات.' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'send_telegram_notification',
    sheetName: VIDEO_SHEETS.TELEGRAM_USERS,
    configSheetName: VIDEO_SHEETS.TELEGRAM_CONFIG,
    ...params,
  });
  return {
    success: Boolean(res.success),
    sentCount: res.data?.sentCount,
    message:
      res.message ||
      (res.success ? 'تم إرسال إشعار تيليغرام بنجاح!' : res.error || 'تعذر إرسال الإشعار'),
  };
}

