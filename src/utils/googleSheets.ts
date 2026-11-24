import {
  WordItem,
  StudentSubmissionRecord,
  StudentRegistrant,
  HomeBrandConfig,
  HomeContentBlock,
  HomeBlockType,
  HomeSlideItem,
  HomeNavbarControls,
  SocialLinkItem,
  PracticeHistoryItem,
  Answers1SubmissionRow,
  AdminUserRecord,
  MatchingLessonSubject,
  MatchingExercise,
  MatchingPair,
  MatchingHistoryItem,
  MatchingExerciseHistoryEntry,
  DictationLessonSubject,
  DictationExercise,
  DictationHistoryItem,
  DictationExerciseHistoryEntry,
  WritingHistoryItem,
  WritingExerciseHistoryEntry,
  CatchLessonSubject,
  CatchHistoryItem,
  CatchExerciseHistoryEntry,
} from '../types';
import { removeTashkeel } from './arabicMatcher';
import { INITIAL_MATCHING_SUBJECTS } from '../data/matchingCurriculum';
import { INITIAL_DICTATION_SUBJECTS } from '../data/dictationCurriculum';
import { INITIAL_CATCH_SUBJECTS } from '../data/catchCurriculum';
import { formatDictationSettingsString, parseDictationSettingsString } from './dictationUtils';
import {
  ARRewardTier,
  AR_INTRO_ID,
  getDefaultARRewards,
  splitARRewardsPayload,
} from '../arWriting/services/arRewardsService';
import {
  formatCatchSettingsString,
  getDefaultCatchARIntroReward,
  parseCatchSettingsString,
} from './catchArRewards';
import {
  formatRetrySettingToken,
  parseRetryCountFromSettingsText,
  resolveEffectiveMaxRetries,
} from './retryLimit';

export const DEFAULT_DRIVE_AUDIO_FOLDER_ID = '1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t'; // مجلد أصوات وشرح المعلم
export const STUDENT_AUDIO_DRIVE_FOLDER_ID = '1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA'; // مجلد تسجيلات أصوات الطلاب
export const DEFAULT_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbyAHPq5mzlooQ3mVEpUF8ieluEte48xqpn7pEv_NxAQl41oxHdbsk_iIYMwxxBf1kxUFQ/exec';

/**
 * Convert any Google Drive image / gif / webp / svg link to direct viewable high-res thumbnail
 */
export function normalizeDriveImageUrl(url?: string): string {
  if (!url) return '';
  const clean = url.trim();
  if (clean.includes('drive.google.com')) {
    let fileId = '';
    const matchD = clean.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (matchD && matchD[1]) {
      fileId = matchD[1];
    } else {
      const matchId = clean.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (matchId && matchId[1]) {
        fileId = matchId[1];
      }
    }
    if (fileId) {
      return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
    }
  }
  return clean;
}

/**
 * Fetch curriculum (lessons and exercises) directly from Google Sheet tab "الدروس"
 * Supports the horizontal layout:
 * - Col A: موضوع الدرس
 * - Col B:I (1st word / text)
 * - Col J:Q (2nd word / text)
 * - Col R:Y (3rd word / text)
 * - Col Z:AG (4th word / text) ... and so on!
 */
/**
 * Sends a POST request to Google Apps Script.
 * 1. First tries the local /api/google-sheets proxy (eliminates all browser CORS errors).
 * 2. If the proxy returns an error message or fails to connect:
 *    Falls back to direct fetch.
 * 3. If direct fetch triggers a browser CORS/redirect error (TypeError: Failed to fetch),
 *    retries with mode: 'no-cors' so the browser delivers the payload directly to Google Apps Script!
 */
export async function callGoogleSheetsPost(webhookUrl: string, payload: any): Promise<{
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
}> {
  const cleanUrl = webhookUrl.trim();

  // 1. Try server-side proxy first (best for CORS on Vercel & local server)
  try {
    const proxyRes = await fetch('/api/google-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: cleanUrl, payload }),
    });

    if (proxyRes.ok) {
      const data = await proxyRes.json().catch(() => null);
      if (data && data.success === true && !data.error) {
        return { success: true, data, message: data.message };
      }
      if (data && (data.success === false || data.error)) {
        return { success: false, data, error: data.error || data.message || 'خطأ من مزود Google Sheets' };
      }
    } else {
      const errData = await proxyRes.json().catch(() => null);
      if (errData && (errData.error || errData.message)) {
        return { success: false, data: errData, error: errData.error || errData.message };
      }
    }
  } catch (proxyErr) {
    console.warn('Proxy fetch failed, attempting direct fetch:', proxyErr);
  }

  // 2. Direct fetch fallback
  try {
    const directRes = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (directRes.ok) {
      const data = await directRes.json().catch(() => null);
      if (data && (data.success === false || data.error)) {
        return { success: false, data, error: data.error || data.message || 'خطأ من مزود Google Sheets' };
      }
      return { success: true, data, message: data?.message };
    }
  } catch (directErr: any) {
    console.warn('Direct fetch failed with CORS error, delivering via no-cors mode:', directErr);
    // 3. Fallback to mode: 'no-cors' so the browser delivers the payload directly to Google Apps Script
    try {
      await fetch(cleanUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      return {
        success: true,
        message: 'تم إرسال البيانات إلى Google Sheets بنجاح!',
      };
    } catch (noCorsErr: any) {
      return {
        success: false,
        error: 'تعذر الاتصال بـ Google Sheets: ' + (noCorsErr?.message || 'خطأ في الشبكة'),
      };
    }
  }

  return { success: true, message: 'تم إرسال الطلب إلى Google Sheets!' };
}

/**
 * Fetch curriculum (lessons and exercises) directly from Google Sheet tab "الدروس"
 * Supports the horizontal layout:
 * - Col A: موضوع الدرس
 * - Col B:I (1st word / text)
 * - Col J:Q (2nd word / text)
 * - Col R:Y (3rd word / text)
 * - Col Z:AG (4th word / text) ... and so on!
 */
export async function fetchCurriculumFromSheets(webhookUrl: string): Promise<{
  success: boolean;
  curriculum?: WordItem[];
  subjects?: string[];
  categories?: string[];
  sheetName?: string;
  spreadsheetName?: string;
  spreadsheetUrl?: string;
  error?: string;
}> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets غير صالح' };
  }

  const cleanUrl = webhookUrl.trim();
  const targetUrl = cleanUrl.includes('?') 
    ? `${cleanUrl}&action=get_curriculum&_t=${Date.now()}` 
    : `${cleanUrl}?action=get_curriculum&_t=${Date.now()}`;

  let data: any = null;

  // 1. Try server-side proxy first (bypasses browser CORS)
  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) {
      data = await proxyRes.json().catch(() => null);
    } else {
      const errJson = await proxyRes.json().catch(() => null);
      if (errJson && errJson.error) {
        return { success: false, error: errJson.error };
      }
    }
  } catch (proxyErr) {
    console.warn('Proxy GET failed, trying direct fetch:', proxyErr);
  }

  // 2. Direct fetch fallback
  if (!data || !Array.isArray(data.curriculum)) {
    try {
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (directRes.ok) {
        data = await directRes.json().catch(() => null);
      }
    } catch (directErr: any) {
      console.warn('Direct GET failed:', directErr);
      if (!data) {
        return {
          success: false,
          error:
            'تم حظر الاتصال بـ Google Sheets (CORS). يرجى التأكد عند نشر السكربت (Deploy) في Google Sheets من ضبط: (من يملك حق الوصول Who has access) = (أي شخص Anyone) وليس (أنا فقط Only myself).',
        };
      }
    }
  }

  if (!data || !Array.isArray(data.curriculum)) {
    return {
      success: false,
      error:
        'لم يتم العثور على تمارين في ورقة "الدروس". تأكد من تسمية الورقة (الدروس) وترتيب الأعمدة A:I ونشر السكربت كـ Web App للجميع (Anyone).',
    };
  }

  const words: WordItem[] = data.curriculum
    .map((item: any, idx: number) => ({
      id: item.id || `sheet-${idx + 1}-${Date.now()}`,
      word: String(item.word || '').trim(),
      plainWord: removeTashkeel(String(item.word || '').trim()),
      meaning: item.meaning !== undefined && item.meaning !== null ? String(item.meaning).trim() : '',
      category: String(item.category || '').trim() || 'الكلمة',
      lessonSubject: String(item.lessonSubject || '').trim() || 'الدرس الأول',
      imageUrl: item.imageUrl ? String(item.imageUrl).trim() : undefined,
      audioUrl: item.audioUrl ? String(item.audioUrl).trim() : undefined,
      autoReadText: item.autoReadText ? String(item.autoReadText).trim() : undefined,
      makhrajTip: item.makhrajTip !== undefined && item.makhrajTip !== null ? String(item.makhrajTip).trim() : '',
      letterFocus: String(item.word || '').trim()[0],
      repeatCount: (() => {
        const raw = String(item.repeatCount || '1').trim();
        const parts = raw.split(/[,|]/).map((s) => s.trim());
        const p = parseInt(parts[0]);
        return !isNaN(p) && p > 0 ? p : 1;
      })(),
      difficultyLevel: (() => {
        if (item.difficultyLevel === 'easy' || item.difficultyLevel === 'hard' || item.difficultyLevel === 'medium') {
          return item.difficultyLevel;
        }
        const raw = String(item.repeatCount || '').trim().toLowerCase();
        if (raw.includes('سهل') || raw.includes('easy')) return 'easy';
        if (raw.includes('متقدم') || raw.includes('hard') || raw.includes('صارم')) return 'hard';
        return 'medium';
      })(),
      recordingDuration: (() => {
        if (typeof item.recordingDuration === 'number' && item.recordingDuration >= 2) {
          return item.recordingDuration;
        }
        const raw = String(item.repeatCount || '').trim();
        const parts = raw.split(/[,|]/).map((s) => s.trim());
        if (parts.length >= 3) {
          const d = parseInt(parts[2].replace(/[^0-9]/g, ''));
          if (!isNaN(d) && d >= 2) return d;
        }
        return 5;
      })(),
      allowRetry: (() => {
        if (typeof item.maxRetries === 'number') return item.maxRetries !== 0;
        if (typeof item.allowRetry === 'boolean') {
          return item.allowRetry;
        }
        return parseRetryCountFromSettingsText(String(item.repeatCount || '')).allowRetry;
      })(),
      maxRetries: (() => {
        if (typeof item.maxRetries === 'number' && !isNaN(item.maxRetries)) {
          return item.maxRetries < 0 ? -1 : Math.max(0, Math.floor(item.maxRetries));
        }
        if (typeof item.allowRetry === 'boolean' && !item.allowRetry) {
          return 0;
        }
        return parseRetryCountFromSettingsText(String(item.repeatCount || '')).maxRetries;
      })(),
    }))
    .filter((w: WordItem) => Boolean(w.word));

  const extractedSubjects: string[] = Array.from(new Set(words.map((w) => w.lessonSubject).filter(Boolean)));
  const extractedCategories: string[] = Array.from(new Set(words.map((w) => w.category).filter(Boolean)));
  return {
    success: true,
    curriculum: words,
    subjects: extractedSubjects.length > 0 ? extractedSubjects : undefined,
    categories: extractedCategories.length > 0 ? extractedCategories : undefined,
    sheetName: data.sheetName,
    spreadsheetName: data.spreadsheetName,
    spreadsheetUrl: data.spreadsheetUrl,
  };
}

/**
 * Save or update a word in Google Sheets (Sheet: "الدروس")
 * Automatically places it in the lesson's row in the corresponding 8-column block (B:I, J:Q, R:Y, ...)
 * and uploads audio to Google Drive folder 1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t.
 */
export async function saveWordToGoogleSheets(
  webhookUrl: string,
  wordItem: WordItem,
  audioBase64?: string,
  driveFolderId = DEFAULT_DRIVE_AUDIO_FOLDER_ID
): Promise<{ success: boolean; audioUrl?: string; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير صالح' };
  }

  const payload = {
    action: 'save_word',
    driveFolderId,
    wordItem: {
      lessonSubject: wordItem.lessonSubject,
      category: wordItem.category,
      imageUrl: wordItem.imageUrl || '',
      audioUrl: wordItem.audioUrl || '',
      autoReadText: wordItem.autoReadText || '',
      word: wordItem.word,
      meaning: wordItem.meaning,
      makhrajTip: wordItem.makhrajTip || '',
      repeatCount: wordItem.repeatCount || 1,
      difficultyLevel: wordItem.difficultyLevel || 'medium',
      recordingDuration: wordItem.recordingDuration || 5,
      allowRetry: resolveEffectiveMaxRetries(wordItem) !== 0,
      maxRetries: resolveEffectiveMaxRetries(wordItem),
    },
    audioBase64: audioBase64 || undefined,
  };

  const res = await callGoogleSheetsPost(webhookUrl, payload);

  return {
    success: res.success,
    audioUrl: res.data?.audioUrl,
    message: res.message || (res.success ? 'تم حفظ التمرين في ورقة "الدروس" بنجاح!' : (res.error || 'خطأ أثناء الحفظ')),
  };
}

/**
 * Upload an audio recording (Base64) to Google Drive folder 1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t
 * and return the direct Google Drive playable URL
 */
export async function uploadAudioToDrive(
  webhookUrl: string,
  audioBase64: string,
  wordText: string,
  driveFolderId = DEFAULT_DRIVE_AUDIO_FOLDER_ID,
  customFileName?: string
): Promise<{ success: boolean; audioUrl?: string; fileId?: string; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير مدخل' };
  }

  const payload = {
    action: 'upload_audio',
    driveFolderId,
    word: wordText || 'lesson',
    customFileName: customFileName || undefined,
    audioBase64,
  };

  const res = await callGoogleSheetsPost(webhookUrl, payload);
  if (res.success && res.data?.audioUrl) {
    return {
      success: true,
      audioUrl: res.data.audioUrl,
      fileId: res.data.fileId,
      message: res.data.message || 'تم حفظ ورفع ملف الصوت في Google Drive بنجاح!',
    };
  }

  return {
    success: false,
    message: res.error || res.message || 'تعذر رفع الصوت إلى Google Drive. تأكد من تحديث كود السكربت بالنسخة الجديدة.',
  };
}

/**
 * Delete a word from Google Sheets (Sheet: "الدروس")
 */
export async function deleteWordFromGoogleSheets(
  webhookUrl: string,
  wordText: string,
  lessonSubject: string
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير صالح' };
  }

  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'delete_word',
    word: wordText,
    lessonSubject,
  });

  return {
    success: res.success,
    message: res.success ? 'تم حذف التمرين من ورقة "الدروس" بنجاح' : (res.error || 'خطأ أثناء الحذف'),
  };
}

/**
 * Sync entire curriculum from the App into Google Sheets (Sheet: "الدروس")
 * Groups words by lessonSubject and writes each lesson horizontally with 8-column blocks
 */
export async function syncAllCurriculumToSheets(
  webhookUrl: string,
  curriculum: WordItem[],
  driveFolderId?: string
): Promise<{ success: boolean; count?: number; lessonsCount?: number; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير صالح أو غير مدخل' };
  }

  const payload = {
    action: 'sync_full_curriculum',
    driveFolderId: driveFolderId || DEFAULT_DRIVE_AUDIO_FOLDER_ID,
    curriculum: curriculum.map((item) => ({
      lessonSubject: item.lessonSubject || 'الدرس الأول',
      category: item.category || 'الكلمة',
      imageUrl: item.imageUrl || '',
      audioUrl: item.audioUrl || '',
      autoReadText: item.autoReadText || '',
      word: item.word,
      meaning: item.meaning || '',
      makhrajTip: item.makhrajTip || '',
      repeatCount: item.repeatCount || 1,
      difficultyLevel: item.difficultyLevel || 'medium',
      recordingDuration: item.recordingDuration || 5,
      allowRetry: resolveEffectiveMaxRetries(item) !== 0,
      maxRetries: resolveEffectiveMaxRetries(item),
    })),
  };

  const res = await callGoogleSheetsPost(webhookUrl, payload);

  if (res.success) {
    return {
      success: true,
      count: res.data?.count || curriculum.length,
      lessonsCount: res.data?.lessonsCount,
      message:
        res.data?.message ||
        `تم بنجاح رفع وتحديث ${curriculum.length} كلمة وتدريب في ورقة "الدروس" في Google Sheets بالهيكل الأفقي المعتمد!`,
    };
  }

  return {
    success: false,
    message: res.error || 'تعذر رفع المنهج إلى Google Sheets. تأكد من نشر السكربت بوضعية Anyone.',
  };
}

/**
 * Send a student evaluation record to Google Sheets (Sheet: "سجل_النتائج")
 */
export async function sendScoreToGoogleSheets(
  webhookUrl: string,
  record: StudentSubmissionRecord
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير صالح' };
  }

  const payload = {
    action: 'record_submission',
    timestamp: new Date(record.timestamp).toLocaleString('ar-SA'),
    studentName: record.studentName || 'طالب',
    word: record.word,
    score: record.score,
    grade: record.grade,
    detectedWord: record.detectedWord || '',
    engineUsed: record.engineUsed === 'ai' ? 'ذكاء اصطناعي (Gemini)' : 'النظام الداخلي (مستمر)',
    feedback: record.feedback || '',
  };

  const res = await callGoogleSheetsPost(webhookUrl, payload);
  return {
    success: res.success,
    message: res.success ? 'تم إرسال الدرجة بنجاح إلى جدول Google Sheets!' : (res.error || 'تعذر الاتصال'),
  };
}

const DEVICE_ID_STORAGE_KEY = 'faseeh_device_id_v1';

/**
 * Normalize Eastern Arabic-Indic (٠-٩) and Persian (۰-۹) digits to Western ASCII digits (0-9)
 */
export function normalizeDigits(input: string): string {
  return String(input || '')
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .trim();
}

/**
 * Get or generate a persistent browser Device ID for multi-device limit enforcement
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const generated = `DEV_${Math.random().toString(36).slice(2, 10).toUpperCase()}_${Date.now().toString(36).toUpperCase()}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `DEV_TEMP_${Date.now().toString(36).toUpperCase()}`;
  }
}

/**
 * Non-blocking optional geolocation lookup with strict fast timeout (default 250ms)
 */
export async function getFastOptionalGeolocation(
  timeoutMs = 250
): Promise<{ lat: number | null; lng: number | null }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { lat: null, lng: null };
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (coords: { lat: number | null; lng: number | null }) => {
      if (settled) return;
      settled = true;
      resolve(coords);
    };
    const timer = window.setTimeout(() => done({ lat: null, lng: null }), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.clearTimeout(timer);
          done({
            lat: typeof pos.coords?.latitude === 'number' ? pos.coords.latitude : null,
            lng: typeof pos.coords?.longitude === 'number' ? pos.coords.longitude : null,
          });
        },
        () => {
          window.clearTimeout(timer);
          done({ lat: null, lng: null });
        },
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 600000 }
      );
    } catch {
      window.clearTimeout(timer);
      done({ lat: null, lng: null });
    }
  });
}

export async function requestMandatoryGeolocation(
  timeoutMs = 8000
): Promise<{ lat: number | null; lng: number | null }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { lat: null, lng: null };
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (coords: { lat: number | null; lng: number | null }) => {
      if (settled) return;
      settled = true;
      resolve(coords);
    };
    const timer = window.setTimeout(() => done({ lat: null, lng: null }), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.clearTimeout(timer);
          done({
            lat: typeof pos.coords?.latitude === 'number' ? pos.coords.latitude : null,
            lng: typeof pos.coords?.longitude === 'number' ? pos.coords.longitude : null,
          });
        },
        () => {
          window.clearTimeout(timer);
          done({ lat: null, lng: null });
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
      );
    } catch {
      window.clearTimeout(timer);
      done({ lat: null, lng: null });
    }
  });
}

function parseRegistrantDevicesList(raw: any): { deviceId: string; location?: string; lastLogin?: string }[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((d) => d && (d.deviceId || d.id))
      .map((d) => ({
        deviceId: String(d.deviceId || d.id || '').trim(),
        location: d.location ? String(d.location).trim() : undefined,
        lastLogin: d.lastLogin ? String(d.lastLogin).trim() : undefined,
      }));
  }
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      return parseRegistrantDevicesList(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function parseRequireLocationFlag(val: any): boolean {
  if (val === true) return true;
  const s = String(val || '').trim().toLowerCase();
  return s === 'إجبار' || s === 'اجبار' || s === 'نعم' || s === 'true' || s === 'required' || s === '1';
}

function getAppOriginBaseUrl(): string {
  try {
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}${window.location.pathname}`;
    }
  } catch {}
  return '';
}

function normalizeRegistrantRow(r: any): StudentRegistrant {
  const maxDevNum = Number(r?.maxDevices);
  return {
    id: normalizeDigits(String(r?.id || '')),
    name: String(r?.name || '').trim(),
    status: String(r?.status || 'مفعّل').trim() || 'مفعّل',
    maxDevices: Number.isFinite(maxDevNum) && maxDevNum >= 1 ? Math.min(10, Math.round(maxDevNum)) : 1,
    devices: parseRegistrantDevicesList(r?.devices),
    requireLocation: parseRequireLocationFlag(r?.requireLocation),
    directLoginUrl: r?.directLoginUrl ? String(r.directLoginUrl).trim() : undefined,
    qrImageUrl: r?.qrImageUrl ? String(r.qrImageUrl).trim() : undefined,
    programId: r?.programId ? String(r.programId).trim() : undefined,
    telegramDirectUrl: r?.telegramDirectUrl ? String(r.telegramDirectUrl).trim() : undefined,
    telegramQrImageUrl: r?.telegramQrImageUrl ? String(r.telegramQrImageUrl).trim() : undefined,
  };
}

/**
 * Initialize or ensure sheet "ID registrants" exists with 11 columns
 * (ID, Name, Status, MaxDevices, DevicesJSON, RequireLocation, DirectLoginUrl, QRImage, ProgramId, TelegramDirectUrl, TelegramQRImage)
 */
export async function ensureIDRegistrantsSheet(
  webhookUrl: string
): Promise<{ success: boolean; message: string; supportsDeviceSecurity?: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير صالح' };
  }

  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'init_registrants_sheet',
    appBaseUrl: getAppOriginBaseUrl(),
  });

  return {
    success: res.success,
    supportsDeviceSecurity: Boolean(res.data?.registrantHandled),
    message: res.message || (res.success ? 'تم تجهيز وتحديث الأعمدة الـ 11 لورقة ID registrants بنجاح' : (res.error || 'خطأ في الاتصال')),
  };
}

/**
 * Fetch all registrants from sheet "ID registrants" along with capability flag
 */
export async function fetchIDRegistrantsDetailed(webhookUrl: string): Promise<{
  registrants: StudentRegistrant[];
  supportsDeviceSecurity: boolean;
}> {
  if (webhookUrl && webhookUrl.trim().startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, { action: 'get_registrants' });
      if (res.success && res.data && Array.isArray(res.data.registrants)) {
        const list: StudentRegistrant[] = res.data.registrants
          .map(normalizeRegistrantRow)
          .filter((r: StudentRegistrant) => r.id && r.name && r.id !== 'ID' && r.name !== 'اسم المشترك');

        try {
          localStorage.setItem('faseeh_cached_registrants', JSON.stringify(list));
        } catch {}

        return {
          registrants: list,
          supportsDeviceSecurity: Boolean(res.data.supportsDeviceSecurity),
        };
      }
    } catch (e) {
      console.warn('Error fetching ID registrants from Google Sheets:', e);
    }
  }

  // Fallback to local cached registrants
  try {
    const cached = localStorage.getItem('faseeh_cached_registrants');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          registrants: parsed.map(normalizeRegistrantRow),
          supportsDeviceSecurity: false,
        };
      }
    }
  } catch {}

  // Default demo registrants for offline/initial state
  return {
    registrants: [
      { id: '1001', name: 'أحمد علي', status: 'مفعّل', maxDevices: 1, devices: [], requireLocation: false },
      { id: '1002', name: 'فاطمة محمد', status: 'مفعّل', maxDevices: 1, devices: [], requireLocation: false },
      { id: '1003', name: 'عمر خالد', status: 'مفعّل', maxDevices: 1, devices: [], requireLocation: false },
    ],
    supportsDeviceSecurity: false,
  };
}

/**
 * Fetch all registrants from sheet "ID registrants"
 */
export async function fetchIDRegistrants(webhookUrl: string): Promise<StudentRegistrant[]> {
  const res = await fetchIDRegistrantsDetailed(webhookUrl);
  return res.registrants;
}

/**
 * Add a new registrant to sheet "ID registrants"
 */
export async function addIDRegistrantToSheet(
  webhookUrl: string,
  payload: { id: string; name: string; status?: string; maxDevices?: number; requireLocation?: boolean; programId?: string }
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  const cleanId = normalizeDigits(payload.id);
  const cleanName = payload.name.trim();
  if (!cleanId || !cleanName) {
    return { success: false, message: 'يرجى إدخال رقم ID واسم المشترك.' };
  }
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير مضبوط.' };
  }

  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'add_registrant',
    id: cleanId,
    name: cleanName,
    status: payload.status || 'مفعّل',
    maxDevices: payload.maxDevices ?? 1,
    requireLocation: Boolean(payload.requireLocation),
    programId: payload.programId ? String(payload.programId).trim() : '',
    appBaseUrl: getAppOriginBaseUrl(),
  });

  if (!res.success) {
    return { success: false, message: res.error || 'تعذر إضافة المشترك' };
  }
  return {
    success: true,
    needsScriptUpdate: res.data?.registrantHandled !== true,
    message: res.message || 'تمت إضافة المشترك إلى ورقة ID registrants بنجاح',
  };
}

/**
 * Update an existing registrant (ID, Name, Status, MaxDevices, RequireLocation, ProgramId) in sheet "ID registrants"
 */
export async function updateIDRegistrantInSheet(
  webhookUrl: string,
  payload: {
    originalId: string;
    id: string;
    name: string;
    status: string;
    maxDevices: number;
    requireLocation?: boolean;
    programId?: string;
  }
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير مضبوط.' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'update_registrant',
    originalId: normalizeDigits(payload.originalId),
    id: normalizeDigits(payload.id),
    name: payload.name.trim(),
    status: payload.status || 'مفعّل',
    maxDevices: Math.max(1, Math.min(10, Number(payload.maxDevices) || 1)),
    requireLocation: Boolean(payload.requireLocation),
    programId: payload.programId !== undefined ? String(payload.programId || '').trim() : undefined,
    appBaseUrl: getAppOriginBaseUrl(),
  });
  if (!res.success) {
    return { success: false, message: res.error || 'تعذر تحديث بيانات المشترك' };
  }
  if (res.data?.registrantHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'يرجى تحديث نشر Google Apps Script (New Version) لتفعيل تعديل حالة الحساب والأجهزة وإجبار الموقع والبرنامج.',
    };
  }
  return { success: true, message: res.message || 'تم تحديث بيانات المشترك بنجاح' };
}

/**
 * Reset all registered devices for a student so they can log in from new devices
 */
export async function resetRegistrantDevicesInSheet(
  webhookUrl: string,
  id: string
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير مضبوط.' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'reset_registrant_devices',
    id: normalizeDigits(id),
  });
  if (!res.success) {
    return { success: false, message: res.error || 'تعذر تصفير الأجهزة' };
  }
  if (res.data?.registrantHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'يرجى تحديث نشر Google Apps Script (New Version) لتفعيل تصفير الأجهزة.',
    };
  }
  return { success: true, message: res.message || 'تم تصفير الأجهزة المسجلة للطالب بنجاح' };
}

/**
 * Delete a registrant row from sheet "ID registrants"
 */
export async function deleteIDRegistrantFromSheet(
  webhookUrl: string,
  id: string
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير مضبوط.' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'delete_registrant',
    id: normalizeDigits(id),
  });
  if (!res.success) {
    return { success: false, message: res.error || 'تعذر حذف المشترك' };
  }
  if (res.data?.registrantHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'يرجى تحديث نشر Google Apps Script (New Version) لتفعيل حذف المشترك من الشيت.',
    };
  }
  return { success: true, message: res.message || 'تم حذف المشترك بنجاح' };
}

/**
 * Verify student credentials against sheet "ID registrants"
 * Supports server-side device limit locking, status check, and optional geolocation,
 * with graceful fallback to legacy 2-column registrant matching if Apps Script hasn't been redeployed.
 */
export async function verifyStudentLogin(
  webhookUrl: string,
  enteredName: string,
  enteredId: string,
  opts?: { deviceId?: string; lat?: number | null; lng?: number | null }
): Promise<{ success: boolean; student?: StudentRegistrant; error?: string; errorCode?: string }> {
  const cleanName = enteredName.trim();
  const cleanId = normalizeDigits(enteredId);

  if (!cleanName || !cleanId) {
    return { success: false, error: 'يرجى إدخال اسم المشترك ورقم ID معاً.' };
  }

  // 1. Server-side verification with device + location enforcement when webhookUrl is configured
  if (webhookUrl && webhookUrl.trim().startsWith('http')) {
    try {
      const deviceId = opts?.deviceId || getOrCreateDeviceId();
      const serverRes = await callGoogleSheetsPost(webhookUrl, {
        action: 'verify_student_login',
        studentName: cleanName,
        studentId: cleanId,
        deviceId,
        lat: opts?.lat ?? null,
        lng: opts?.lng ?? null,
      });

      if (serverRes.data?.loginCheckHandled === true) {
        if (serverRes.success && serverRes.data.student) {
          return {
            success: true,
            student: normalizeRegistrantRow(serverRes.data.student),
          };
        }
        return {
          success: false,
          errorCode: serverRes.data.errorCode,
          error: serverRes.data.error || serverRes.error || 'تعذر تسجيل الدخول.',
        };
      }
    } catch (e) {
      console.warn('verify_student_login server check fallback triggered:', e);
    }
  }

  // 2. Legacy / offline fallback matching against ID registrants list
  const registrants = await fetchIDRegistrants(webhookUrl);

  const normalizeArabic = (s: string) =>
    removeTashkeel(s)
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/[ىي]/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();

  const normEntered = normalizeArabic(cleanName);

  // Exact match on both normalized ID and Name
  const matched = registrants.find((r) => {
    return normalizeDigits(r.id) === cleanId && normalizeArabic(r.name) === normEntered;
  });

  if (matched) {
    const rawStatus = String(matched.status || '').trim().toLowerCase();
    if (
      rawStatus === 'معطل' ||
      rawStatus === 'معطّل' ||
      rawStatus === 'لا' ||
      rawStatus === 'no' ||
      rawStatus === 'false' ||
      rawStatus === 'disabled'
    ) {
      return {
        success: false,
        errorCode: 'ACCOUNT_DISABLED',
        error: 'تم تعطيل هذا الحساب. يرجى التواصل مع الإدارة.',
      };
    }
    return { success: true, student: matched };
  }

  // ID matches but name differs
  const idMatch = registrants.find((r) => normalizeDigits(r.id) === cleanId);
  if (idMatch) {
    return {
      success: false,
      error: `رقم ID موجود ولكن الاسم غير مطابق للاسم المسجل في ورقة ID registrants (${idMatch.name}).`,
    };
  }

  // Name matches but ID differs
  const nameMatch = registrants.find((r) => normalizeArabic(r.name) === normEntered);
  if (nameMatch) {
    return {
      success: false,
      error: 'الاسم مسجل ولكن رقم ID غير مطابق للرقم المسجل له في ورقة (ID registrants).',
    };
  }

  return {
    success: false,
    error: 'عفواً، لم يتم العثور على هذا الاسم والرقم في ورقة (ID registrants). تأكد من صحة البيانات.',
  };
}

/**
 * Export student records to CSV file for Excel / Google Sheets import
 */
export function exportRecordsToCSV(records: StudentSubmissionRecord[], filename = 'درجات_الطلاب_فصيح.csv') {
  if (records.length === 0) return;

  const headers = ['التاريخ والوقت', 'اسم الطالب', 'الكلمة', 'الدرجة', 'التقدير', 'ما نطق به', 'نوع التقييم', 'الملاحظات'];

  const rows = records.map((r) => [
    `"${new Date(r.timestamp).toLocaleString('ar-SA')}"`,
    `"${r.studentName || 'طالب'}"`,
    `"${r.word}"`,
    r.score,
    `"${r.grade}"`,
    `"${r.detectedWord || ''}"`,
    `"${r.engineUsed === 'ai' ? 'ذكاء اصطناعي' : 'داخلي'}"`,
    `"${(r.feedback || '').replace(/"/g, '""')}"`,
  ]);

  const BOM = '\uFEFF';
  const csvContent = BOM + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Convert a blob URL to a clean Base64 data URL
 */
export async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface StudentAnswerSubmissionPayload {
  studentId: string;
  studentName: string;
  lessonSubject: string;
  targetWord: string;
  detectedWord: string;
  score: number;
  grade: string;
  feedback?: string;
  audioBlobUrl?: string | null;
  audioBase64?: string | null;
  driveFolderId?: string;
  studentDriveFolderId?: string;
  wordIndex: number;
}

/**
 * Submit approved student answer to Google Sheets (Sheet: "answers 1") and upload audio to Google Drive
 */
export async function submitStudentAnswerToSheet(
  webhookUrl: string,
  payload: StudentAnswerSubmissionPayload
): Promise<{ success: boolean; audioUrl?: string; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير محدد أو غير صالح.' };
  }

  let finalBase64 = payload.audioBase64 || '';
  if (!finalBase64 && payload.audioBlobUrl) {
    try {
      finalBase64 = await blobUrlToBase64(payload.audioBlobUrl);
    } catch (e) {
      console.warn('Could not convert audio blob to base64:', e);
    }
  }

  // Ensure student audio always routes to student folder (1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA)
  const resolvedStudentFolderId =
    payload.studentDriveFolderId ||
    (payload.driveFolderId && payload.driveFolderId !== DEFAULT_DRIVE_AUDIO_FOLDER_ID
      ? payload.driveFolderId
      : STUDENT_AUDIO_DRIVE_FOLDER_ID);

  const finalGradeFeedback = (payload.feedback || payload.grade || '').trim();

  const postPayload = {
    action: 'submit_student_answer',
    studentId: payload.studentId || '',
    studentName: payload.studentName || 'طالب',
    lessonSubject: payload.lessonSubject || 'الدرس الأول',
    targetWord: payload.targetWord,
    detectedWord: payload.detectedWord || '',
    score: payload.score,
    grade: finalGradeFeedback,
    feedback: finalGradeFeedback,
    audioBase64: finalBase64,
    studentDriveFolderId: resolvedStudentFolderId,
    driveFolderId: resolvedStudentFolderId,
    wordIndex: payload.wordIndex >= 0 ? payload.wordIndex : 0,
  };

  const res = await callGoogleSheetsPost(webhookUrl, postPayload);
  return {
    success: res.success,
    audioUrl: res.data?.audioUrl,
    message:
      res.data?.message ||
      (res.success
        ? 'تم إرسال إجابتك واعتمادها بنجاح في ورقة answers 1! ✅'
        : res.error || 'تعذر الإرسال إلى Google Sheets'),
  };
}

/**
 * Fetch branding and social media configuration from sheet "الرئيسية"
 * - B2: Logo Image / Drive URL
 * - B3: Main Title
 * - B4: Subtitle / Description
 * - B8:B17 (URLs) & C8:C17 (Icons)
 */
export async function fetchHomeConfigFromSheets(webhookUrl: string): Promise<HomeBrandConfig | null> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    // Return cached if available
    try {
      const cached = localStorage.getItem('faseeh_cached_home_config');
      if (cached) return JSON.parse(cached);
    } catch {}
    return null;
  }

  const cleanUrl = webhookUrl.trim();
  const targetUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=get_home_config&_t=${Date.now()}`
    : `${cleanUrl}?action=get_home_config&_t=${Date.now()}`;

  let data: any = null;

  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) {
      data = await proxyRes.json().catch(() => null);
    }
  } catch (proxyErr) {
    console.warn('Proxy fetch of homeConfig failed, trying direct:', proxyErr);
  }

  if (!data || !data.homeConfig) {
    try {
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (directRes.ok) {
        data = await directRes.json().catch(() => null);
      }
    } catch (e) {
      console.warn('Direct fetch of homeConfig failed:', e);
    }
  }

  if (data && data.homeConfig) {
    const rawCard = data.homeConfig.card || {};
    const cardConfig = {
      cardLogoUrl: rawCard.cardLogoUrl ? normalizeDriveImageUrl(rawCard.cardLogoUrl) : '',
      cardBgUrl: rawCard.cardBgUrl ? normalizeDriveImageUrl(rawCard.cardBgUrl) : '',
      cardTitle: rawCard.cardTitle || '',
      cardSubtitle: rawCard.cardSubtitle || '',
      extraText1: rawCard.extraText1 || '',
      extraText2: rawCard.extraText2 || '',
      extraText3: rawCard.extraText3 || '',
    };

    const rawBlocks = Array.isArray(data.contentBlocks)
      ? data.contentBlocks
      : Array.isArray(data.homeConfig.contentBlocks)
      ? data.homeConfig.contentBlocks
      : null;
    const normalizedBlocks = rawBlocks ? normalizeHomeContentBlocks(rawBlocks) : undefined;
    if (normalizedBlocks) {
      saveLocalHomeContentBlocks(normalizedBlocks);
    }

    const cfg: HomeBrandConfig = {
      logoUrl: data.homeConfig.logoUrl ? normalizeDriveImageUrl(data.homeConfig.logoUrl) : '',
      title: data.homeConfig.title || '',
      subtitle: data.homeConfig.subtitle || '',
      socialLinks: Array.isArray(data.homeConfig.socialLinks)
        ? data.homeConfig.socialLinks.filter((s: any) => s.url && s.iconKey)
        : [],
      card: cardConfig,
      adminUsers: Array.isArray(data.homeConfig.adminUsers) ? data.homeConfig.adminUsers : [],
      contentBlocks: normalizedBlocks,
    };

    try {
      localStorage.setItem('faseeh_cached_home_config', JSON.stringify(cfg));
    } catch {}

    return cfg;
  }

  // Fallback to local cached
  try {
    const cached = localStorage.getItem('faseeh_cached_home_config');
    if (cached) return JSON.parse(cached);
  } catch {}

  return null;
}

export const STORAGE_KEY_HOME_CONTENT = 'faseeh_home_content_blocks_v1';
export const STORAGE_KEY_HOME_NAVBAR_CONTROLS = 'faseeh_home_navbar_controls_v1';
export const NAVBAR_CONTROLS_BLOCK_ID = '__NAVBAR_CONTROLS__';

export const DEFAULT_HOME_NAVBAR_CONTROLS: HomeNavbarControls = {
  showLessons: false, // مخفي افتراضياً
  showVideo: false, // مخفي افتراضياً
  showSchedule: true, // مسموح / ظاهر افتراضياً
};

export function sanitizeExternalUrl(raw?: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return '';
}

export function normalizeHomeContentBlocks(rawList: any[]): HomeContentBlock[] {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((b) => b && (b.id === NAVBAR_CONTROLS_BLOCK_ID || b.title || b.body || b.mediaUrl || b.linkUrl || (Array.isArray(b.slides) && b.slides.length > 0)))
    .map((b, idx) => {
      const isNavCtrl = String(b.id || '').trim() === NAVBAR_CONTROLS_BLOCK_ID;
      const rawType = String(b.type || 'announcement').trim().toLowerCase();
      const type: HomeBlockType =
        rawType === 'slideshow' || rawType === 'video' || rawType === 'link'
          ? (rawType as HomeBlockType)
          : 'announcement';
      const rawColor = String(b.accentColor || 'emerald').trim();
      const accentColor: HomeContentBlock['accentColor'] =
        rawColor === 'indigo' || rawColor === 'amber' || rawColor === 'rose' || rawColor === 'sky'
          ? rawColor
          : 'emerald';
      const slides: HomeSlideItem[] = Array.isArray(b.slides)
        ? b.slides
            .filter((sl: any) => sl && sl.imageUrl)
            .map((sl: any) => ({
              imageUrl: String(sl.imageUrl || '').trim(),
              caption: sl.caption ? String(sl.caption).trim() : '',
              linkUrl: sl.linkUrl ? String(sl.linkUrl).trim() : '',
            }))
        : [];
      const parseProgramIds = (raw: unknown): string[] => {
        if (Array.isArray(raw)) {
          return raw
            .map((v) => String(v || '').trim())
            .filter((v) => v && v !== 'all' && v !== 'الكل');
        }
        if (typeof raw === 'string' && raw.trim()) {
          const s = raw.trim();
          if (s === 'all' || s === 'الكل') return [];
          if (s.startsWith('[')) {
            try {
              const arr = JSON.parse(s);
              if (Array.isArray(arr)) {
                return arr
                  .map((v) => String(v || '').trim())
                  .filter((v) => v && v !== 'all' && v !== 'الكل');
              }
            } catch {}
          }
          return s
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v && v !== 'all' && v !== 'الكل');
        }
        return [];
      };
      return {
        id: String(b.id || `home_blk_${idx + 1}`).trim(),
        type,
        title: String(b.title || '').trim(),
        body: b.body ? String(b.body).trim() : '',
        mediaUrl: b.mediaUrl ? String(b.mediaUrl).trim() : '',
        linkUrl: b.linkUrl ? String(b.linkUrl).trim() : '',
        buttonLabel: b.buttonLabel ? String(b.buttonLabel).trim() : '',
        badgeText: b.badgeText ? String(b.badgeText).trim() : '',
        accentColor,
        slides,
        enabled: isNavCtrl
          ? false
          : b.enabled === false || String(b.enabled).toLowerCase() === 'false' || String(b.enabled) === '0'
          ? false
          : true,
        sortOrder: isNavCtrl ? 9999 : Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : idx + 1,
        programIds: isNavCtrl ? [] : parseProgramIds(b.programIds),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function extractHomeNavbarControls(blocks: HomeContentBlock[]): HomeNavbarControls {
  const sys = blocks.find((b) => b.id === NAVBAR_CONTROLS_BLOCK_ID);
  if (sys?.body) {
    try {
      const parsed = JSON.parse(sys.body);
      return {
        showLessons: parsed.showLessons === true,
        showVideo: parsed.showVideo === true,
        showSchedule: parsed.showSchedule !== false,
      };
    } catch {}
  }
  return getLocalHomeNavbarControls();
}

export function stripSystemHomeBlocks(blocks: HomeContentBlock[]): HomeContentBlock[] {
  return blocks.filter((b) => b.id !== NAVBAR_CONTROLS_BLOCK_ID);
}

export function mergeHomeNavbarControlsIntoBlocks(
  blocks: HomeContentBlock[],
  controls: HomeNavbarControls
): HomeContentBlock[] {
  const userBlocks = stripSystemHomeBlocks(blocks).map((b, idx) => ({
    ...b,
    sortOrder: idx + 1,
  }));
  const sysBlock: HomeContentBlock = {
    id: NAVBAR_CONTROLS_BLOCK_ID,
    type: 'announcement',
    title: 'إعدادات أزرار الشريط العلوي',
    body: JSON.stringify({
      showLessons: Boolean(controls.showLessons),
      showVideo: Boolean(controls.showVideo),
      showSchedule: controls.showSchedule !== false,
    }),
    enabled: false,
    sortOrder: 9999,
  };
  return [...userBlocks, sysBlock];
}

export function getLocalHomeNavbarControls(): HomeNavbarControls {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HOME_NAVBAR_CONTROLS);
    if (!raw) return { ...DEFAULT_HOME_NAVBAR_CONTROLS };
    const parsed = JSON.parse(raw);
    return {
      showLessons: parsed.showLessons === true,
      showVideo: parsed.showVideo === true,
      showSchedule: parsed.showSchedule !== false,
    };
  } catch {
    return { ...DEFAULT_HOME_NAVBAR_CONTROLS };
  }
}

export function saveLocalHomeNavbarControls(controls: HomeNavbarControls): void {
  try {
    localStorage.setItem(STORAGE_KEY_HOME_NAVBAR_CONTROLS, JSON.stringify(controls));
  } catch {}
}

export function getLocalHomeContentBlocks(): HomeContentBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HOME_CONTENT);
    if (!raw) return [];
    return normalizeHomeContentBlocks(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveLocalHomeContentBlocks(blocks: HomeContentBlock[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_HOME_CONTENT, JSON.stringify(blocks));
  } catch {}
}

export async function fetchHomeContentFromSheets(
  webhookUrl: string
): Promise<{ blocks: HomeContentBlock[]; scriptSupported: boolean }> {
  const local = getLocalHomeContentBlocks();
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { blocks: local, scriptSupported: true };
  }
  try {
    const cleanUrl = webhookUrl.trim();
    const targetUrl = cleanUrl.includes('?')
      ? `${cleanUrl}&action=get_home_content&_t=${Date.now()}`
      : `${cleanUrl}?action=get_home_content&_t=${Date.now()}`;
    const res = await fetch(targetUrl, { method: 'GET', headers: { Accept: 'application/json' } });
    const json = await res.json();
    if (json && json.homeContentHandled && Array.isArray(json.blocks)) {
      const normalized = normalizeHomeContentBlocks(json.blocks);
      saveLocalHomeContentBlocks(normalized);
      return { blocks: normalized, scriptSupported: true };
    }
    return { blocks: local, scriptSupported: false };
  } catch {
    return { blocks: local, scriptSupported: true };
  }
}

export async function saveHomeContentToSheets(
  webhookUrl: string,
  blocks: HomeContentBlock[]
): Promise<{
  success: boolean;
  cloudSaved: boolean;
  needsScriptUpdate?: boolean;
  message: string;
}> {
  const ordered = blocks.map((b, idx) => ({ ...b, sortOrder: idx + 1 }));
  saveLocalHomeContentBlocks(ordered);
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: true,
      cloudSaved: false,
      message: 'تم الحفظ محلياً في المتصفح فقط (لم يتم ضبط رابط Google Sheets Webhook).',
    };
  }
  try {
    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save_home_content',
        blocks: ordered,
      }),
    });
    const json = await res.json();
    if (json && json.homeContentSaved) {
      return {
        success: true,
        cloudSaved: true,
        message: json.message || 'تم حفظ ومزامنة محتوى الصفحة الرئيسية في ورقة محتوى_الرئيسية بنجاح!',
      };
    }
    return {
      success: true,
      cloudSaved: false,
      needsScriptUpdate: true,
      message: 'تم الحفظ محلياً، لكن كود Google Apps Script المنشور قديم. انسخ الكود المحدّث وانشر إصداراً جديداً (New version) لحفظ ورقة محتوى_الرئيسية.',
    };
  } catch (err: any) {
    return {
      success: false,
      cloudSaved: false,
      message: err?.message || 'حدث خطأ أثناء الاتصال بـ Google Sheets.',
    };
  }
}

/**
 * Fetch evaluation and submission history specifically for the logged in student
 * from sheet "answers 1" and local storage
 */
export async function fetchStudentSubmissionsFromSheet(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<PracticeHistoryItem[]> {
  const resultList: PracticeHistoryItem[] = [];
  const cleanId = (studentId || '').trim();
  const cleanName = (studentName || '').trim();

  // 1. Fetch from Google Sheets "answers 1"
  if (webhookUrl && webhookUrl.trim().startsWith('http') && (cleanId || cleanName)) {
    try {
      const targetUrl = `${webhookUrl}?action=get_student_history&studentId=${encodeURIComponent(
        cleanId
      )}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;

      let data: any = null;
      try {
        const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
        if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
      } catch {}

      if (!data || !Array.isArray(data.history)) {
        try {
          const directRes = await fetch(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (directRes.ok) data = await directRes.json().catch(() => null);
        } catch {}
      }

      if (data && Array.isArray(data.history)) {
        for (const item of data.history) {
          resultList.push({
            id: item.id || `sheet-${item.word}-${item.timestamp}`,
            wordId: item.wordId || `w-${item.word}`,
            word: item.word,
            score: typeof item.score === 'number' ? item.score : parseInt(item.score) || 0,
            grade: item.grade || 'معتمد',
            timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
            spokenText: item.spokenText || '',
            recordedAudioUrl: item.recordedAudioUrl || undefined,
            studentName: item.studentName || cleanName,
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching student history from Google Sheets:', e);
    }
  }

  // 2. Merge with locally cached approved student submissions for this student
  try {
    const keys = Object.keys(localStorage);
    for (const k of keys) {
      if (k.startsWith('faseeh_sub_')) {
        // Matches faseeh_sub_{studentId}_... or matches when studentId matches
        if (cleanId && k.startsWith(`faseeh_sub_${cleanId}_`)) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const exists = resultList.some(
                (r) => r.word === parsed.targetWord && Math.abs(r.score - parsed.score) < 2
              );
              if (!exists) {
                resultList.push({
                  id: `local-${k}-${parsed.timestamp || Date.now()}`,
                  wordId: `w-${parsed.targetWord}`,
                  word: parsed.targetWord,
                  score: parsed.score || 0,
                  grade: parsed.grade || 'معتمد',
                  timestamp: parsed.timestamp || Date.now(),
                  spokenText: parsed.detectedWord || '',
                  recordedAudioUrl: parsed.audioUrl || undefined,
                  studentName: parsed.studentName || cleanName,
                });
              }
            } catch {}
          }
        }
      }
    }
  } catch {}

  // Sort by latest timestamp first
  return resultList.sort((a, b) => b.timestamp - a.timestamp);
}

export function normalizeArabicDigits(str: string): string {
  return String(str || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/**
 * Extract accurate percentage (0-100) from answers 2 formulaString or raw value.
 * Handles formats like:
 * - "(5 - 4 صحيح - 1 خطأ = 80%)"
 * - "(5 - الصحيح 5 - أخطاء المحاولات 2 = 71%)"
 * - "%80", "80٪", "80 %", "= 80", Arabic digits "٨٠٪", or Google Sheets decimal "0.8"
 */
export function extractPercentageFromMatchingText(text: string, rawPct?: unknown): number {
  const normalized = normalizeArabicDigits(text || '');

  // 1. Direct match like "80%", "80 %", "80٪"
  const afterPct = normalized.match(/(\d+(?:\.\d+)?)\s*[%٪]/);
  if (afterPct) {
    return Math.min(100, Math.max(0, Math.round(parseFloat(afterPct[1]))));
  }

  // 2. Prefix match like "%80" or "٪80" (common in RTL sheets)
  const beforePct = normalized.match(/[%٪]\s*(\d+(?:\.\d+)?)/);
  if (beforePct) {
    return Math.min(100, Math.max(0, Math.round(parseFloat(beforePct[1]))));
  }

  // 3. Equals / rate label match like "= 80" or "النسبة: 80"
  const eqMatch = normalized.match(/(?:=|النسبة(?:\s*التراكمية)?\s*:?)\s*(\d+(?:\.\d+)?)/);
  if (eqMatch) {
    const val = parseFloat(eqMatch[1]);
    if (val > 0 && val <= 1 && eqMatch[1].includes('.')) {
      return Math.round(val * 100);
    }
    return Math.min(100, Math.max(0, Math.round(val)));
  }

  // 4. Compute from "X صحيح" and total or "Y خطأ"
  const correctMatch = normalized.match(/(\d+)\s*صحيح|صحيح\s*(\d+)|الصحيح\s*(\d+)/);
  const wrongMatch = normalized.match(/(\d+)\s*خطأ|خطأ\s*(\d+)|الخطأ\s*(\d+)|أخطاء\s*المحاولات\s*(\d+)/);
  if (correctMatch) {
    const c = parseInt(correctMatch[1] || correctMatch[2] || correctMatch[3], 10);
    const w = wrongMatch
      ? parseInt(wrongMatch[1] || wrongMatch[2] || wrongMatch[3] || wrongMatch[4], 10)
      : 0;
    const firstNumMatch = normalized.match(/^\s*\(?\s*(\d+)/);
    const totalPairs = firstNumMatch ? parseInt(firstNumMatch[1], 10) : c + w;
    const denom = Math.max(1, c + w > totalPairs ? c + w : totalPairs);
    if (denom > 0) {
      return Math.min(100, Math.max(0, Math.round((c / denom) * 100)));
    }
  }

  // 5. Fallback to raw numeric percentage (supports decimal ratio like 0.8 from Google Sheets)
  if (typeof rawPct === 'number' && !isNaN(rawPct)) {
    if (rawPct > 0 && rawPct <= 1) return Math.round(rawPct * 100);
    return Math.min(100, Math.max(0, Math.round(rawPct)));
  }
  if (typeof rawPct === 'string' && rawPct.trim()) {
    const parsed = parseFloat(normalizeArabicDigits(rawPct));
    if (!isNaN(parsed)) {
      if (parsed > 0 && parsed <= 1 && !rawPct.includes('%') && !rawPct.includes('٪')) {
        return Math.round(parsed * 100);
      }
      return Math.min(100, Math.max(0, Math.round(parsed)));
    }
  }

  return 0;
}

/**
 * Fetch student matching exercise history from sheet "answers 2" and merge with local cache
 */
export async function fetchStudentMatchingHistory(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<MatchingHistoryItem[]> {
  const cleanId = (studentId || '').trim();
  const cleanName = (studentName || '').trim();
  const mergedMap = new Map<string, MatchingHistoryItem>();

  // 1. Fetch from Google Sheets "answers 2"
  if (webhookUrl && webhookUrl.trim().startsWith('http') && (cleanId || cleanName)) {
    try {
      const cleanUrl = webhookUrl.trim();
      const separator = cleanUrl.includes('?') ? '&' : '?';
      const targetUrl = `${cleanUrl}${separator}action=get_student_matching_history&studentId=${encodeURIComponent(
        cleanId
      )}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;

      let data: any = null;
      try {
        const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
        if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
      } catch {}

      if (!data || !Array.isArray(data.matchingHistory)) {
        try {
          const directRes = await fetch(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (directRes.ok) data = await directRes.json().catch(() => null);
        } catch {}
      }

      if (data && Array.isArray(data.matchingHistory)) {
        for (const item of data.matchingHistory) {
          const subj = String(item.lessonSubject || item.subjectName || '').trim();
          if (!subj) continue;
          const exercises: MatchingExerciseHistoryEntry[] = Array.isArray(item.exercises)
            ? item.exercises
                .map((ex: any) => {
                  const formulaStr = String(ex.formulaString || '').trim();
                  return {
                    exerciseNumber: Number(ex.exerciseNumber) || 1,
                    formulaString: formulaStr,
                    percentage: extractPercentageFromMatchingText(formulaStr, ex.percentage),
                  };
                })
                .sort((a: MatchingExerciseHistoryEntry, b: MatchingExerciseHistoryEntry) => a.exerciseNumber - b.exerciseNumber)
            : [];
          mergedMap.set(subj, {
            id: item.id || `ans2-${subj}`,
            timestamp: String(item.timestamp || '').trim(),
            studentId: String(item.studentId || cleanId).trim(),
            studentName: String(item.studentName || cleanName).trim(),
            lessonSubject: subj,
            completionStatus: String(item.completionStatus || '').trim(),
            exercises,
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching student matching history from Google Sheets:', e);
    }
  }

  // 2. Merge with locally cached matching submissions for this student
  try {
    const cacheKey = cleanId ? `faseeh_matching_sub_${cleanId}` : 'faseeh_matching_sub_guest';
    const rawCache = localStorage.getItem(cacheKey);
    if (rawCache) {
      const localItems: MatchingHistoryItem[] = JSON.parse(rawCache);
      if (Array.isArray(localItems)) {
        for (const localItem of localItems) {
          const subj = (localItem.lessonSubject || '').trim();
          if (!subj) continue;
          const normalizedLocalExercises = (localItem.exercises || []).map((ex) => ({
            ...ex,
            percentage: extractPercentageFromMatchingText(ex.formulaString, ex.percentage),
          }));
          const existing = mergedMap.get(subj);
          if (!existing) {
            mergedMap.set(subj, {
              ...localItem,
              exercises: normalizedLocalExercises,
            });
          } else {
            // Merge any locally saved exercises that aren't in the sheet row yet
            const exMap = new Map<number, MatchingExerciseHistoryEntry>();
            for (const ex of existing.exercises) exMap.set(ex.exerciseNumber, ex);
            for (const ex of normalizedLocalExercises) {
              if (!exMap.has(ex.exerciseNumber)) {
                exMap.set(ex.exerciseNumber, ex);
              }
            }
            existing.exercises = Array.from(exMap.values()).sort(
              (a, b) => a.exerciseNumber - b.exerciseNumber
            );
            if (!existing.completionStatus && localItem.completionStatus) {
              existing.completionStatus = localItem.completionStatus;
            }
          }
        }
      }
    }
  } catch {}

  return Array.from(mergedMap.values());
}

/**
 * Fetch all student submissions summary from sheet "answers 1"
 */
export async function fetchAllSubmissionsFromSheet(webhookUrl: string): Promise<Answers1SubmissionRow[]> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return [];
  }

  const cleanUrl = webhookUrl.trim();
  const targetUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=get_all_submissions&_t=${Date.now()}`
    : `${cleanUrl}?action=get_all_submissions&_t=${Date.now()}`;

  let data: any = null;
  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
  } catch {}

  if (!data || !Array.isArray(data.submissions)) {
    try {
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (directRes.ok) data = await directRes.json().catch(() => null);
    } catch {}
  }

  if (data && Array.isArray(data.submissions)) {
    return data.submissions;
  }
  return [];
}

/**
 * Fetch all translations from Google Sheets (Sheet: "الترجمة")
 */
export async function fetchTranslationsFromSheets(webhookUrl: string): Promise<any[] | null> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) return null;
  const cleanUrl = webhookUrl.trim();
  const targetUrl = cleanUrl.includes('?')
    ? `${cleanUrl}&action=get_translations&_t=${Date.now()}`
    : `${cleanUrl}?action=get_translations&_t=${Date.now()}`;

  let data: any = null;
  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
  } catch {}

  if (!data || !Array.isArray(data.translations)) {
    try {
      const directRes = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (directRes.ok) data = await directRes.json().catch(() => null);
    } catch {}
  }

  if (data && Array.isArray(data.translations)) {
    return data.translations;
  }
  return null;
}

/**
 * Save all translations to Google Sheets (Sheet: "الترجمة")
 */
export async function saveTranslationsToSheets(
  webhookUrl: string,
  items: any[]
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير صالح' };
  }
  const payload = {
    action: 'save_translations',
    items: items,
  };
  const res = await callGoogleSheetsPost(webhookUrl, payload);
  return {
    success: res.success,
    message: res.success
      ? 'تم حفظ وتوثيق الترجمات بنجاح في ورقة "الترجمة" وتحديث ورقة "الرئيسية" في Google Sheets!'
      : (res.error || 'تعذر حفظ الترجمات في الشيت'),
  };
}

/**
 * Automatically create and prepare the dedicated "الترجمة" sheet in Google Sheets
 */
export async function ensureTranslationsSheet(
  webhookUrl: string,
  items?: any[]
): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets غير متوفر' };
  }
  const payload = {
    action: 'save_translations',
    items: items || [],
  };
  const res = await callGoogleSheetsPost(webhookUrl, payload);
  return {
    success: res.success,
    message: res.success
      ? 'تم إنشاء وتجهيز ورقة "الترجمة" بنجاح في Google Sheets!'
      : (res.error || 'تعذر إنشاء ورقة الترجمة في الشيت'),
  };
}

export const STORAGE_KEY_MATCHING_CURRICULUM = 'faseeh_matching_curriculum';

/**
 * Fetch matching exercises from sheet "وصل"
 */
export async function fetchMatchingExercisesFromSheets(
  webhookUrl?: string
): Promise<{ success: boolean; subjects: MatchingLessonSubject[]; error?: string }> {
  // If webhook is not provided, return cached or initial curriculum
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_MATCHING_CURRICULUM);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { success: true, subjects: parsed };
        }
      }
    } catch {}
    return { success: true, subjects: INITIAL_MATCHING_SUBJECTS };
  }

  try {
    const cleanUrl = webhookUrl.trim();
    const targetUrl = cleanUrl.includes('?')
      ? `${cleanUrl}&action=get_matching&_t=${Date.now()}`
      : `${cleanUrl}?action=get_matching&_t=${Date.now()}`;

    let res: any = null;
    try {
      const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
      if (proxyRes.ok) {
        res = await proxyRes.json().catch(() => null);
      }
    } catch (proxyErr) {
      console.warn('Proxy GET matching failed, trying direct:', proxyErr);
    }

    if (!res || !res.subjects) {
      try {
        const directRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (directRes.ok) {
          res = await directRes.json().catch(() => null);
        }
      } catch (directErr) {
        console.warn('Direct GET matching failed:', directErr);
      }
    }

    if (res && res.success && Array.isArray(res.subjects) && res.subjects.length > 0) {
      const normalizedSubjects: MatchingLessonSubject[] = res.subjects.map((s: any, sIdx: number) => ({
        id: s.id || `subj-${sIdx + 1}`,
        subjectName: String(s.subjectName || s.subject || `الموضوع ${sIdx + 1}`).trim(),
        exercises: Array.isArray(s.exercises)
          ? s.exercises.map((ex: any, eIdx: number) => {
              const rawSettings = String(ex.settingsString || ex.settings || '').trim();
              const resolvedMaxRetries =
                typeof ex.maxRetries === 'number' && !isNaN(ex.maxRetries)
                  ? resolveEffectiveMaxRetries({ maxRetries: ex.maxRetries })
                  : rawSettings
                  ? parseRetryCountFromSettingsText(rawSettings).maxRetries
                  : resolveEffectiveMaxRetries({ allowRetry: ex.allowRetry });
              return {
                id: ex.id || `ex-${eIdx + 1}`,
                exerciseNumber: ex.exerciseNumber || eIdx + 1,
                questionText: ex.questionText || `صل الكلمات المناسبة ${eIdx + 1}`,
                pairs: Array.isArray(ex.pairs) ? ex.pairs : [],
                inputMode: ex.inputMode || 'both',
                durationSeconds: typeof ex.durationSeconds === 'number' ? ex.durationSeconds : 4,
                lockOnMistake: Boolean(ex.lockOnMistake),
                showMistakeFeedback: ex.showMistakeFeedback !== false,
                allowSmartReassign: Boolean(ex.allowSmartReassign),
                allowRetry: resolvedMaxRetries !== 0,
                maxRetries: resolvedMaxRetries,
              };
            })
          : [],
      }));

      try {
        localStorage.setItem(STORAGE_KEY_MATCHING_CURRICULUM, JSON.stringify(normalizedSubjects));
      } catch {}
      return { success: true, subjects: normalizedSubjects };
    }
  } catch (err: any) {
    console.warn('Failed to fetch matching exercises from sheets:', err);
  }

  // Fallback to cached or initial curriculum
  try {
    const cached = localStorage.getItem(STORAGE_KEY_MATCHING_CURRICULUM);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { success: true, subjects: parsed };
      }
    }
  } catch {}

  return { success: true, subjects: INITIAL_MATCHING_SUBJECTS };
}

/**
 * Format exercise settings object to readable string for Column 4 in sheet "وصل"
 * e.g. "صوت فقط | لا تراجع | إخفاء الخطأ | 4 ثواني"
 */
export function formatExerciseSettingsString(exercise: {
  inputMode?: 'voice_only' | 'both';
  durationSeconds?: number;
  lockOnMistake?: boolean;
  showMistakeFeedback?: boolean;
  allowSmartReassign?: boolean;
  allowRetry?: boolean;
  maxRetries?: number;
}): string {
  const modeStr = exercise.inputMode === 'voice_only' ? 'صوت فقط' : 'فأرة وصوت';
  const lockStr = exercise.lockOnMistake ? 'لا تراجع' : 'إتاحة المحاولة';
  const feedbackStr = exercise.showMistakeFeedback === false ? 'إخفاء الخطأ' : 'إظهار الخطأ';
  const smartStr = exercise.allowSmartReassign ? 'تصحيح ذكي' : 'بدون تصحيح ذكي';
  const retryStr = formatRetrySettingToken(exercise.maxRetries, exercise.allowRetry);
  const dur = typeof exercise.durationSeconds === 'number' && exercise.durationSeconds > 0 ? exercise.durationSeconds : 4;
  return `${modeStr} | ${lockStr} | ${feedbackStr} | ${smartStr} | ${retryStr} | ${dur} ثواني`;
}

/**
 * Parse Column 4 settings string from sheet "وصل" back into exercise properties
 */
export function parseExerciseSettingsString(str?: string): {
  inputMode: 'voice_only' | 'both';
  durationSeconds: number;
  lockOnMistake: boolean;
  showMistakeFeedback: boolean;
  allowSmartReassign: boolean;
  allowRetry: boolean;
  maxRetries: number;
} {
  const s = String(str || '').trim();
  const inputMode: 'voice_only' | 'both' = s.includes('صوت فقط') ? 'voice_only' : 'both';
  const lockOnMistake = s.includes('لا تراجع') || s.includes('قفل');
  const showMistakeFeedback = !s.includes('إخفاء');
  const allowSmartReassign =
    (s.includes('تصحيح ذكي') && !s.includes('بدون تصحيح ذكي')) ||
    s.includes('فك ذكي') ||
    s.includes('تبديل الإجابة');
  const { allowRetry, maxRetries } = parseRetryCountFromSettingsText(s);
  const durMatch = s.match(/(\d+)\s*ثوان/);
  const durationSeconds = durMatch ? parseInt(durMatch[1], 10) : 4;
  return { inputMode, durationSeconds, lockOnMistake, showMistakeFeedback, allowSmartReassign, allowRetry, maxRetries };
}

/**
 * Save or update a matching exercise in sheet "وصل" (4 columns per exercise)
 */
export async function saveMatchingExerciseToSheets(
  webhookUrl: string,
  payload: {
    subjectName: string;
    exerciseNumber: number;
    questionText: string;
    pairs: MatchingPair[];
    inputMode?: 'voice_only' | 'both';
    durationSeconds?: number;
    lockOnMistake?: boolean;
    showMistakeFeedback?: boolean;
    allowSmartReassign?: boolean;
    allowRetry?: boolean;
    maxRetries?: number;
  }
): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets Webhook غير متوفر' };
  }

  const rightWords = payload.pairs.map((p) => p.rightText.trim()).filter(Boolean).join(' | ');
  const leftWords = payload.pairs.map((p) => p.leftText.trim()).filter(Boolean).join(' | ');
  const settingsString = formatExerciseSettingsString(payload);

  const postPayload = {
    action: 'save_matching_exercise',
    sheetName: 'وصل',
    subjectName: payload.subjectName.trim(),
    subject: payload.subjectName.trim(),
    exerciseNumber: payload.exerciseNumber,
    exerciseIndex: payload.exerciseNumber,
    questionText: payload.questionText.trim(),
    rightWords: rightWords,
    leftWords: leftWords,
    settingsString: settingsString,
    settings: settingsString,
  };

  const res = await callGoogleSheetsPost(webhookUrl, postPayload);
  return {
    success: res.success,
    error: res.error,
    message: res.success ? 'تم حفظ التمرين بنجاح في ورقة "وصل" بالهيكل المعتمد!' : res.error,
  };
}

/**
 * Submit student matching answer directly to sheet "answers 2"
 */
export async function submitMatchingAnswerToSheet(
  webhookUrl: string,
  payload: {
    studentId: string;
    studentName: string;
    subjectName: string;
    exerciseNumber: number;
    totalPairs: number;
    correctCount: number;
    wrongCount: number;
    percentage: number;
    totalExercisesInSubject: number;
    completedCountInSubject: number;
    overallPercentage: number;
    modeDescription?: string;
    summaryString?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets Webhook غير متوفر' };
  }

  // Format: e.g. "(5 - 4 صحيح - 1 خطأ = 80%)" or "(5 - الصحيح 5 - أخطاء المحاولات 2 = 71%)"
  const summaryString =
    payload.summaryString ||
    `(${payload.totalPairs} - الصحيح ${payload.correctCount} - الخطأ ${payload.wrongCount} = ${payload.percentage}%)`;
  
  // Format overall status: e.g. "تم إنجاز (2 من 3 تمارين) - النسبة التراكمية: 85%"
  const completionStatus = payload.completedCountInSubject >= payload.totalExercisesInSubject
    ? `مكتمل (${payload.completedCountInSubject} من ${payload.totalExercisesInSubject} تمارين) - النسبة: ${payload.overallPercentage}%`
    : `جاري الإنجاز (${payload.completedCountInSubject} من ${payload.totalExercisesInSubject} تمارين) - النسبة التراكمية: ${payload.overallPercentage}%`;

  const timestampStr = new Date().toLocaleString('ar-SA');

  // Cache locally so the student sees their matching scores immediately in StatsModal
  try {
    const cleanId = (payload.studentId || '').trim();
    const cacheKey = cleanId ? `faseeh_matching_sub_${cleanId}` : 'faseeh_matching_sub_guest';
    const raw = localStorage.getItem(cacheKey);
    const list: MatchingHistoryItem[] = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    const subjName = payload.subjectName.trim();
    const existingIdx = safeList.findIndex((item) => item.lessonSubject === subjName);
    const newEntry: MatchingExerciseHistoryEntry = {
      exerciseNumber: payload.exerciseNumber,
      formulaString: summaryString,
      percentage: payload.percentage,
    };

    if (existingIdx >= 0) {
      const existing = safeList[existingIdx];
      const filteredEx = (existing.exercises || []).filter(
        (ex) => ex.exerciseNumber !== payload.exerciseNumber
      );
      filteredEx.push(newEntry);
      filteredEx.sort((a, b) => a.exerciseNumber - b.exerciseNumber);
      safeList[existingIdx] = {
        ...existing,
        timestamp: timestampStr,
        completionStatus,
        exercises: filteredEx,
      };
    } else {
      safeList.unshift({
        id: `local-ans2-${Date.now()}`,
        timestamp: timestampStr,
        studentId: cleanId,
        studentName: payload.studentName,
        lessonSubject: subjName,
        completionStatus,
        exercises: [newEntry],
      });
    }
    localStorage.setItem(cacheKey, JSON.stringify(safeList));
  } catch {}

  const postPayload = {
    action: 'submit_matching_answer',
    sheetName: 'answers 2',
    studentId: payload.studentId,
    studentName: payload.studentName,
    subjectName: payload.subjectName,
    lessonSubject: payload.subjectName,
    exerciseNumber: payload.exerciseNumber,
    exerciseIndex: payload.exerciseNumber,
    resultFormula: summaryString,
    summaryString: summaryString,
    completionStatus: completionStatus,
    percentage: payload.percentage,
    timestamp: timestampStr,
  };

  const res = await callGoogleSheetsPost(webhookUrl, postPayload);
  return {
    success: res.success,
    error: res.error,
  };
}

/**
 * Export and populate all matching exercises and subjects directly to sheet "وصل"
 * Exact 4-Column Sheet Specification:
 * - Col A: موضوع الدرس
 * - Ex 1 (Cols B:E): B = نص السؤال | C = الكلمات في اليمين ( | ) | D = الكلمات في اليسار ( | ) | E = إعدادات التمرين
 * - Ex 2 (Cols F:I): F = نص السؤال | G = الكلمات في اليمين ( | ) | H = الكلمات في اليسار ( | ) | I = إعدادات التمرين
 * - Ex 3 (Cols J:M)... and so on!
 */
export async function exportAllMatchingCurriculumToSheets(
  webhookUrl: string,
  subjects: MatchingLessonSubject[]
): Promise<{ success: boolean; message: string; count: number }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير متوفر', count: 0 };
  }

  const formattedSubjects = subjects.map((subj) => ({
    subjectName: subj.subjectName,
    exercises: subj.exercises.map((ex) => ({
      exerciseNumber: ex.exerciseNumber,
      questionText: ex.questionText,
      rightWords: ex.pairs.map((p) => p.rightText.trim()).filter(Boolean).join(' | '),
      leftWords: ex.pairs.map((p) => p.leftText.trim()).filter(Boolean).join(' | '),
      settingsString: formatExerciseSettingsString(ex),
    })),
  }));

  const totalExercises = subjects.reduce((sum, s) => sum + s.exercises.length, 0);

  // 1. Try single atomic bulk export action (fastest and guarantees 4-column layout)
  const bulkRes = await callGoogleSheetsPost(webhookUrl, {
    action: 'export_matching_curriculum',
    sheetName: 'وصل',
    subjects: formattedSubjects,
  });

  if (bulkRes.success) {
    return {
      success: true,
      message: `تم نقل وتصدير ${subjects.length} مواضيع و ${totalExercises} تمارين بنجاح إلى ورقة (وصل) بالهيكل الجديد المعتمد (4 أعمدة لكل تمرين)!`,
      count: totalExercises,
    };
  }

  // 2. Fallback to save_matching_exercise per exercise if script is on an older version
  let savedCount = 0;
  for (const subj of subjects) {
    for (const ex of subj.exercises) {
      await saveMatchingExerciseToSheets(webhookUrl, {
        subjectName: subj.subjectName,
        exerciseNumber: ex.exerciseNumber,
        questionText: ex.questionText,
        pairs: ex.pairs,
        inputMode: ex.inputMode,
        durationSeconds: ex.durationSeconds,
        lockOnMistake: ex.lockOnMistake,
        showMistakeFeedback: ex.showMistakeFeedback,
        allowSmartReassign: ex.allowSmartReassign,
        allowRetry: ex.allowRetry,
        maxRetries: ex.maxRetries,
      });
      savedCount++;
    }
  }

  return {
    success: true,
    message: `تم نقل وتصدير ${subjects.length} مواضيع و ${savedCount} تمارين إلى ورقة (وصل)!`,
    count: savedCount,
  };
}

export const STORAGE_KEY_DICTATION_CURRICULUM = 'faseeh_dictation_curriculum';

/**
 * Fetch dictation exercises from sheet "كلمات"
 */
export async function fetchDictationExercisesFromSheets(
  webhookUrl?: string
): Promise<{ success: boolean; subjects: DictationLessonSubject[]; error?: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_DICTATION_CURRICULUM);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { success: true, subjects: parsed };
        }
      }
    } catch {}
    return { success: true, subjects: INITIAL_DICTATION_SUBJECTS };
  }

  try {
    const cleanUrl = webhookUrl.trim();
    const targetUrl = cleanUrl.includes('?')
      ? `${cleanUrl}&action=get_dictation&_t=${Date.now()}`
      : `${cleanUrl}?action=get_dictation&_t=${Date.now()}`;

    let res: any = null;
    try {
      const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
      if (proxyRes.ok) {
        res = await proxyRes.json().catch(() => null);
      }
    } catch (proxyErr) {
      console.warn('Proxy GET dictation failed, trying direct:', proxyErr);
    }

    if (!res || !res.subjects) {
      try {
        const directRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (directRes.ok) {
          res = await directRes.json().catch(() => null);
        }
      } catch (directErr) {
        console.warn('Direct GET dictation failed:', directErr);
      }
    }

    if (res && res.success && Array.isArray(res.subjects) && res.subjects.length > 0) {
      const normalizedSubjects: DictationLessonSubject[] = res.subjects.map((s: any, sIdx: number) => ({
        id: s.id || `dict-subj-${sIdx + 1}`,
        subjectName: String(s.subjectName || s.subject || `الموضوع ${sIdx + 1}`).trim(),
        exercises: Array.isArray(s.exercises)
          ? s.exercises.map((ex: any, eIdx: number) => {
              const parsedSet = parseDictationSettingsString(ex.settingsString || ex.settings || '');
              return {
                id: ex.id || `dict-ex-${eIdx + 1}`,
                exerciseNumber: ex.exerciseNumber || eIdx + 1,
                questionText: String(ex.questionText || `رتب الحروف أو الكلمات ${eIdx + 1}`).trim(),
                scrambledPool: String(ex.scrambledPool || '').trim(),
                correctAnswer: String(ex.correctAnswer || '').trim(),
                settingsString: String(ex.settingsString || ex.settings || '').trim(),
                inputMode: ex.inputMode === 'voice_only' || ex.inputMode === 'both' ? ex.inputMode : parsedSet.inputMode,
                lockOnMistake: ex.lockOnMistake !== undefined ? Boolean(ex.lockOnMistake) : parsedSet.lockOnMistake,
                durationSeconds:
                  typeof ex.durationSeconds === 'number' ? ex.durationSeconds : parsedSet.durationSeconds,
                allowRetry:
                  typeof ex.maxRetries === 'number'
                    ? ex.maxRetries !== 0
                    : ex.allowRetry !== undefined
                    ? Boolean(ex.allowRetry)
                    : parsedSet.allowRetry,
                maxRetries:
                  typeof ex.maxRetries === 'number' && !isNaN(ex.maxRetries)
                    ? ex.maxRetries < 0
                      ? -1
                      : Math.max(0, Math.floor(ex.maxRetries))
                    : ex.allowRetry === false
                    ? 0
                    : parsedSet.maxRetries,
              };
            })
          : [],
      }));

      try {
        localStorage.setItem(STORAGE_KEY_DICTATION_CURRICULUM, JSON.stringify(normalizedSubjects));
      } catch {}
      return { success: true, subjects: normalizedSubjects };
    }
  } catch (err: any) {
    console.warn('Failed to fetch dictation exercises from sheets:', err);
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEY_DICTATION_CURRICULUM);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { success: true, subjects: parsed };
      }
    }
  } catch {}

  return { success: true, subjects: INITIAL_DICTATION_SUBJECTS };
}

/**
 * Save or update a single dictation exercise in sheet "كلمات"
 */
export async function saveDictationExerciseToSheets(
  webhookUrl: string,
  payload: {
    subjectName: string;
    exerciseNumber: number;
    questionText: string;
    scrambledPool: string;
    correctAnswer: string;
    inputMode?: 'voice_only' | 'both';
    lockOnMistake?: boolean;
    durationSeconds?: number;
    allowRetry?: boolean;
    maxRetries?: number;
  }
): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets Webhook غير متوفر' };
  }

  const settingsString = formatDictationSettingsString(payload);
  const postPayload = {
    action: 'save_dictation_exercise',
    sheetName: 'كلمات',
    subjectName: payload.subjectName.trim(),
    subject: payload.subjectName.trim(),
    exerciseNumber: payload.exerciseNumber,
    exerciseIndex: payload.exerciseNumber,
    questionText: payload.questionText.trim(),
    scrambledPool: payload.scrambledPool.trim(),
    correctAnswer: payload.correctAnswer.trim(),
    settingsString,
    settings: settingsString,
  };

  const res = await callGoogleSheetsPost(webhookUrl, postPayload);
  return {
    success: res.success,
    error: res.error,
    message: res.success ? 'تم حفظ التمرين بنجاح في ورقة "كلمات"!' : res.error,
  };
}

/**
 * Bulk export all dictation exercises to sheet "كلمات" (4 columns per exercise)
 */
export async function exportAllDictationCurriculumToSheets(
  webhookUrl: string,
  subjects: DictationLessonSubject[]
): Promise<{ success: boolean; message: string; count: number }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير متوفر', count: 0 };
  }

  const formattedSubjects = subjects.map((subj) => ({
    subjectName: subj.subjectName,
    exercises: subj.exercises.map((ex) => {
      const parsedFallback = parseDictationSettingsString(ex.settingsString || '');
      const normalizedEx = {
        inputMode:
          ex.inputMode === 'voice_only' || ex.inputMode === 'both'
            ? ex.inputMode
            : parsedFallback.inputMode,
        lockOnMistake:
          ex.lockOnMistake !== undefined ? Boolean(ex.lockOnMistake) : parsedFallback.lockOnMistake,
        durationSeconds:
          typeof ex.durationSeconds === 'number' && ex.durationSeconds > 0
            ? ex.durationSeconds
            : parsedFallback.durationSeconds,
        allowRetry:
          typeof ex.maxRetries === 'number' && !isNaN(ex.maxRetries)
            ? ex.maxRetries !== 0
            : ex.allowRetry !== undefined
            ? Boolean(ex.allowRetry)
            : parsedFallback.allowRetry,
        maxRetries:
          typeof ex.maxRetries === 'number' && !isNaN(ex.maxRetries)
            ? ex.maxRetries
            : ex.allowRetry === false
            ? 0
            : parsedFallback.maxRetries,
      };
      return {
        exerciseNumber: ex.exerciseNumber,
        questionText: ex.questionText,
        scrambledPool: ex.scrambledPool,
        correctAnswer: ex.correctAnswer,
        settingsString: formatDictationSettingsString(normalizedEx),
      };
    }),
  }));

  const totalExercises = subjects.reduce((sum, s) => sum + s.exercises.length, 0);

  const bulkRes = await callGoogleSheetsPost(webhookUrl, {
    action: 'export_dictation_curriculum',
    sheetName: 'كلمات',
    subjects: formattedSubjects,
  });

  if (bulkRes.success) {
    return {
      success: true,
      message: `تم تصدير ${subjects.length} مواضيع و ${totalExercises} تمارين إملاء بنجاح إلى ورقة "كلمات"!`,
      count: totalExercises,
    };
  }

  let savedCount = 0;
  for (const subj of subjects) {
    for (const ex of subj.exercises) {
      await saveDictationExerciseToSheets(webhookUrl, {
        subjectName: subj.subjectName,
        exerciseNumber: ex.exerciseNumber,
        questionText: ex.questionText,
        scrambledPool: ex.scrambledPool,
        correctAnswer: ex.correctAnswer,
        inputMode: ex.inputMode,
        lockOnMistake: ex.lockOnMistake,
        durationSeconds: ex.durationSeconds,
        allowRetry: ex.allowRetry,
        maxRetries: ex.maxRetries,
      });
      savedCount++;
    }
  }

  return {
    success: true,
    message: `تم تصدير ${subjects.length} مواضيع و ${savedCount} تمارين إملاء إلى ورقة "كلمات"!`,
    count: savedCount,
  };
}

/**
 * Submit student dictation answer to sheet "answers 3" + local cache
 */
export async function submitDictationAnswerToSheet(
  webhookUrl: string,
  payload: {
    studentId: string;
    studentName: string;
    subjectName: string;
    exerciseNumber: number;
    wrongAttempts: number;
    percentage: number;
    totalExercisesInSubject: number;
    completedCountInSubject: number;
    overallPercentage: number;
    summaryString?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const summaryString =
    payload.summaryString ||
    (payload.wrongAttempts > 0
      ? `(صحيح - أخطاء التحقق ${payload.wrongAttempts} = ${payload.percentage}%)`
      : `(صحيح من أول محاولة = ${payload.percentage}%)`);

  const completionStatus =
    payload.completedCountInSubject >= payload.totalExercisesInSubject
      ? `مكتمل (${payload.completedCountInSubject} من ${payload.totalExercisesInSubject} تمارين) - النسبة: ${payload.overallPercentage}%`
      : `جاري الإنجاز (${payload.completedCountInSubject} من ${payload.totalExercisesInSubject} تمارين) - النسبة التراكمية: ${payload.overallPercentage}%`;

  const timestampStr = new Date().toLocaleString('ar-SA');

  try {
    const cleanId = (payload.studentId || '').trim();
    const cacheKey = cleanId ? `faseeh_dictation_sub_${cleanId}` : 'faseeh_dictation_sub_guest';
    const raw = localStorage.getItem(cacheKey);
    const list: DictationHistoryItem[] = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    const subjName = payload.subjectName.trim();
    const existingIdx = safeList.findIndex((item) => item.lessonSubject === subjName);
    const newEntry: DictationExerciseHistoryEntry = {
      exerciseNumber: payload.exerciseNumber,
      formulaString: summaryString,
      percentage: payload.percentage,
    };

    if (existingIdx >= 0) {
      const existing = safeList[existingIdx];
      const filteredEx = (existing.exercises || []).filter(
        (ex) => ex.exerciseNumber !== payload.exerciseNumber
      );
      filteredEx.push(newEntry);
      filteredEx.sort((a, b) => a.exerciseNumber - b.exerciseNumber);
      safeList[existingIdx] = {
        ...existing,
        timestamp: timestampStr,
        completionStatus,
        exercises: filteredEx,
      };
    } else {
      safeList.unshift({
        id: `local-ans3-${Date.now()}`,
        timestamp: timestampStr,
        studentId: cleanId,
        studentName: payload.studentName,
        lessonSubject: subjName,
        completionStatus,
        exercises: [newEntry],
      });
    }
    localStorage.setItem(cacheKey, JSON.stringify(safeList));
  } catch {}

  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets Webhook غير متوفر' };
  }

  const postPayload = {
    action: 'submit_dictation_answer',
    sheetName: 'answers 3',
    studentId: payload.studentId,
    studentName: payload.studentName,
    subjectName: payload.subjectName,
    lessonSubject: payload.subjectName,
    exerciseNumber: payload.exerciseNumber,
    exerciseIndex: payload.exerciseNumber,
    resultFormula: summaryString,
    summaryString,
    completionStatus,
    percentage: payload.percentage,
    timestamp: timestampStr,
  };

  const res = await callGoogleSheetsPost(webhookUrl, postPayload);
  return {
    success: res.success,
    error: res.error,
  };
}

/**
 * Fetch student dictation history from sheet "answers 3" and merge with local cache
 */
export async function fetchStudentDictationHistory(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<DictationHistoryItem[]> {
  const cleanId = (studentId || '').trim();
  const cleanName = (studentName || '').trim();
  const mergedMap = new Map<string, DictationHistoryItem>();

  if (webhookUrl && webhookUrl.trim().startsWith('http') && (cleanId || cleanName)) {
    try {
      const cleanUrl = webhookUrl.trim();
      const separator = cleanUrl.includes('?') ? '&' : '?';
      const targetUrl = `${cleanUrl}${separator}action=get_student_dictation_history&studentId=${encodeURIComponent(
        cleanId
      )}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;

      let data: any = null;
      try {
        const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
        if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
      } catch {}

      if (!data || !Array.isArray(data.dictationHistory)) {
        try {
          const directRes = await fetch(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (directRes.ok) data = await directRes.json().catch(() => null);
        } catch {}
      }

      if (data && Array.isArray(data.dictationHistory)) {
        for (const item of data.dictationHistory) {
          const subj = String(item.lessonSubject || item.subjectName || '').trim();
          if (!subj) continue;
          const exercises: DictationExerciseHistoryEntry[] = Array.isArray(item.exercises)
            ? item.exercises
                .map((ex: any) => {
                  const formulaStr = String(ex.formulaString || '').trim();
                  return {
                    exerciseNumber: Number(ex.exerciseNumber) || 1,
                    formulaString: formulaStr,
                    percentage: extractPercentageFromMatchingText(formulaStr, ex.percentage),
                  };
                })
                .sort(
                  (a: DictationExerciseHistoryEntry, b: DictationExerciseHistoryEntry) =>
                    a.exerciseNumber - b.exerciseNumber
                )
            : [];
          mergedMap.set(subj, {
            id: item.id || `ans3-${subj}`,
            timestamp: String(item.timestamp || '').trim(),
            studentId: String(item.studentId || cleanId).trim(),
            studentName: String(item.studentName || cleanName).trim(),
            lessonSubject: subj,
            completionStatus: String(item.completionStatus || '').trim(),
            exercises,
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching student dictation history from Google Sheets:', e);
    }
  }

  try {
    const cacheKey = cleanId ? `faseeh_dictation_sub_${cleanId}` : 'faseeh_dictation_sub_guest';
    const rawCache = localStorage.getItem(cacheKey);
    if (rawCache) {
      const localItems: DictationHistoryItem[] = JSON.parse(rawCache);
      if (Array.isArray(localItems)) {
        for (const localItem of localItems) {
          const subj = (localItem.lessonSubject || '').trim();
          if (!subj) continue;
          const normalizedLocalExercises = (localItem.exercises || []).map((ex) => ({
            ...ex,
            percentage: extractPercentageFromMatchingText(ex.formulaString, ex.percentage),
          }));
          const existing = mergedMap.get(subj);
          if (!existing) {
            mergedMap.set(subj, {
              ...localItem,
              exercises: normalizedLocalExercises,
            });
          } else {
            const exMap = new Map<number, DictationExerciseHistoryEntry>();
            for (const ex of existing.exercises) exMap.set(ex.exerciseNumber, ex);
            for (const ex of normalizedLocalExercises) {
              if (!exMap.has(ex.exerciseNumber)) {
                exMap.set(ex.exerciseNumber, ex);
              }
            }
            existing.exercises = Array.from(exMap.values()).sort(
              (a, b) => a.exerciseNumber - b.exerciseNumber
            );
            if (!existing.completionStatus && localItem.completionStatus) {
              existing.completionStatus = localItem.completionStatus;
            }
          }
        }
      }
    }
  } catch {}

  return Array.from(mergedMap.values());
}

export const STORAGE_KEY_CATCH_CURRICULUM = 'faseeh_catch_curriculum_v1';

/**
 * Fetch Catch & Connect exercises from sheet "صيد" (Col A: موضوع الدرس, 4 cols per exercise)
 */
export async function fetchCatchExercisesFromSheets(webhookUrl: string): Promise<{
  success: boolean;
  subjects: CatchLessonSubject[];
  error?: string;
}> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_CATCH_CURRICULUM);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { success: true, subjects: parsed };
        }
      }
    } catch {}
    return { success: true, subjects: INITIAL_CATCH_SUBJECTS };
  }

  try {
    const cleanUrl = webhookUrl.trim();
    const targetUrl = cleanUrl.includes('?')
      ? `${cleanUrl}&action=get_catch&_t=${Date.now()}`
      : `${cleanUrl}?action=get_catch&_t=${Date.now()}`;

    let res: any = null;
    try {
      const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
      if (proxyRes.ok) {
        res = await proxyRes.json().catch(() => null);
      }
    } catch (proxyErr) {
      console.warn('Proxy GET catch failed, trying direct:', proxyErr);
    }

    if (!res || !res.subjects) {
      try {
        const directRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (directRes.ok) {
          res = await directRes.json().catch(() => null);
        }
      } catch (directErr) {
        console.warn('Direct GET catch failed:', directErr);
      }
    }

    if (res && res.success && Array.isArray(res.subjects) && res.subjects.length > 0) {
      const normalizedSubjects: CatchLessonSubject[] = res.subjects.map((s: any, sIdx: number) => ({
        id: s.id || `catch-subj-${sIdx + 1}`,
        subjectName: String(s.subjectName || s.subject || `الموضوع ${sIdx + 1}`).trim(),
        exercises: Array.isArray(s.exercises)
          ? s.exercises.map((ex: any, eIdx: number) => {
              const parsedSet = parseCatchSettingsString(ex.settingsString || ex.settings || '');
              return {
                id: ex.id || `catch-ex-${eIdx + 1}`,
                exerciseNumber: ex.exerciseNumber || eIdx + 1,
                questionText: String(ex.questionText || `اصطد الحروف الصحيحة ${eIdx + 1}`).trim(),
                scrambledPool: String(ex.scrambledPool || '').trim(),
                correctAnswer: String(ex.correctAnswer || '').trim(),
                settingsString: String(ex.settingsString || ex.settings || '').trim(),
                lockOnMistake:
                  ex.lockOnMistake !== undefined ? Boolean(ex.lockOnMistake) : parsedSet.lockOnMistake,
                allowRetry:
                  typeof ex.maxRetries === 'number'
                    ? ex.maxRetries !== 0
                    : ex.allowRetry !== undefined
                    ? Boolean(ex.allowRetry)
                    : parsedSet.allowRetry,
                maxRetries:
                  typeof ex.maxRetries === 'number' && !isNaN(ex.maxRetries)
                    ? ex.maxRetries < 0
                      ? -1
                      : Math.max(0, Math.floor(ex.maxRetries))
                    : ex.allowRetry === false
                    ? 0
                    : parsedSet.maxRetries,
              };
            })
          : [],
      }));

      try {
        localStorage.setItem(STORAGE_KEY_CATCH_CURRICULUM, JSON.stringify(normalizedSubjects));
      } catch {}
      return { success: true, subjects: normalizedSubjects };
    }
  } catch (err: any) {
    console.warn('Failed to fetch catch exercises from sheets:', err);
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEY_CATCH_CURRICULUM);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { success: true, subjects: parsed };
      }
    }
  } catch {}

  return { success: true, subjects: INITIAL_CATCH_SUBJECTS };
}

/**
 * Save or update a single Catch exercise in sheet "صيد"
 */
export async function saveCatchExerciseToSheets(
  webhookUrl: string,
  payload: {
    subjectName: string;
    exerciseNumber: number;
    questionText: string;
    scrambledPool: string;
    correctAnswer: string;
    lockOnMistake?: boolean;
    allowRetry?: boolean;
    maxRetries?: number;
  }
): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets Webhook غير متوفر' };
  }

  const settingsString = formatCatchSettingsString(payload);
  const postPayload = {
    action: 'save_catch_exercise',
    sheetName: 'صيد',
    subjectName: payload.subjectName.trim(),
    subject: payload.subjectName.trim(),
    exerciseNumber: payload.exerciseNumber,
    exerciseIndex: payload.exerciseNumber,
    questionText: payload.questionText.trim(),
    scrambledPool: payload.scrambledPool.trim(),
    correctAnswer: payload.correctAnswer.trim(),
    settingsString,
    settings: settingsString,
  };

  const res = await callGoogleSheetsPost(webhookUrl, postPayload);
  return {
    success: res.success,
    error: res.error,
    message: res.success ? 'تم حفظ التمرين بنجاح في ورقة "صيد"!' : res.error,
  };
}

/**
 * Bulk export all Catch exercises to sheet "صيد" (4 columns per exercise)
 */
export async function exportAllCatchCurriculumToSheets(
  webhookUrl: string,
  subjects: CatchLessonSubject[]
): Promise<{ success: boolean; message: string; count: number }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير متوفر', count: 0 };
  }

  const formattedSubjects = subjects.map((subj) => ({
    subjectName: subj.subjectName,
    exercises: subj.exercises.map((ex) => {
      const parsedFallback = parseCatchSettingsString(ex.settingsString || '');
      const normalizedEx = {
        lockOnMistake:
          ex.lockOnMistake !== undefined ? Boolean(ex.lockOnMistake) : parsedFallback.lockOnMistake,
        allowRetry:
          typeof ex.maxRetries === 'number' && !isNaN(ex.maxRetries)
            ? ex.maxRetries !== 0
            : ex.allowRetry !== undefined
            ? Boolean(ex.allowRetry)
            : parsedFallback.allowRetry,
        maxRetries:
          typeof ex.maxRetries === 'number' && !isNaN(ex.maxRetries)
            ? ex.maxRetries
            : ex.allowRetry === false
            ? 0
            : parsedFallback.maxRetries,
      };
      return {
        exerciseNumber: ex.exerciseNumber,
        questionText: ex.questionText,
        scrambledPool: ex.scrambledPool,
        correctAnswer: ex.correctAnswer,
        settingsString: formatCatchSettingsString(normalizedEx),
      };
    }),
  }));

  const totalExercises = subjects.reduce((sum, s) => sum + s.exercises.length, 0);

  const bulkRes = await callGoogleSheetsPost(webhookUrl, {
    action: 'export_catch_curriculum',
    sheetName: 'صيد',
    subjects: formattedSubjects,
  });

  if (bulkRes.success) {
    return {
      success: true,
      message: `تم تصدير ${subjects.length} مواضيع و ${totalExercises} تمارين صيد بنجاح إلى ورقة "صيد"!`,
      count: totalExercises,
    };
  }

  let savedCount = 0;
  for (const subj of subjects) {
    for (const ex of subj.exercises) {
      await saveCatchExerciseToSheets(webhookUrl, {
        subjectName: subj.subjectName,
        exerciseNumber: ex.exerciseNumber,
        questionText: ex.questionText,
        scrambledPool: ex.scrambledPool,
        correctAnswer: ex.correctAnswer,
        lockOnMistake: ex.lockOnMistake,
        allowRetry: ex.allowRetry,
        maxRetries: ex.maxRetries,
      });
      savedCount++;
    }
  }

  return {
    success: true,
    message: `تم تصدير ${subjects.length} مواضيع و ${savedCount} تمارين صيد إلى ورقة "صيد"!`,
    count: savedCount,
  };
}

/**
 * Submit student Catch answer to sheet "اجابات صيد" + local cache
 */
export async function submitCatchAnswerToSheet(
  webhookUrl: string,
  payload: {
    studentId: string;
    studentName: string;
    subjectName: string;
    exerciseNumber: number;
    wrongAttempts: number;
    percentage: number;
    totalExercisesInSubject: number;
    completedCountInSubject: number;
    overallPercentage: number;
    summaryString?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const summaryString =
    payload.summaryString ||
    (payload.wrongAttempts > 0
      ? `(صحيح - أخطاء التحقق ${payload.wrongAttempts} = ${payload.percentage}%)`
      : `(صحيح من أول محاولة = ${payload.percentage}%)`);

  const completionStatus =
    payload.completedCountInSubject >= payload.totalExercisesInSubject
      ? `مكتمل (${payload.completedCountInSubject} من ${payload.totalExercisesInSubject} تمارين) - النسبة: ${payload.overallPercentage}%`
      : `جاري الإنجاز (${payload.completedCountInSubject} من ${payload.totalExercisesInSubject} تمارين) - النسبة التراكمية: ${payload.overallPercentage}%`;

  const timestampStr = new Date().toLocaleString('ar-SA');

  try {
    const cleanId = (payload.studentId || '').trim();
    const cacheKey = cleanId ? `faseeh_catch_sub_${cleanId}` : 'faseeh_catch_sub_guest';
    const raw = localStorage.getItem(cacheKey);
    const list: CatchHistoryItem[] = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    const subjName = payload.subjectName.trim();
    const existingIdx = safeList.findIndex((item) => item.lessonSubject === subjName);
    const newEntry: CatchExerciseHistoryEntry = {
      exerciseNumber: payload.exerciseNumber,
      formulaString: summaryString,
      percentage: payload.percentage,
    };

    if (existingIdx >= 0) {
      const existing = safeList[existingIdx];
      const filteredEx = (existing.exercises || []).filter(
        (ex) => ex.exerciseNumber !== payload.exerciseNumber
      );
      filteredEx.push(newEntry);
      filteredEx.sort((a, b) => a.exerciseNumber - b.exerciseNumber);
      safeList[existingIdx] = {
        ...existing,
        timestamp: timestampStr,
        completionStatus,
        exercises: filteredEx,
      };
    } else {
      safeList.unshift({
        id: `local-catch-${Date.now()}`,
        timestamp: timestampStr,
        studentId: cleanId,
        studentName: payload.studentName,
        lessonSubject: subjName,
        completionStatus,
        exercises: [newEntry],
      });
    }
    localStorage.setItem(cacheKey, JSON.stringify(safeList));
  } catch {}

  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets Webhook غير متوفر' };
  }

  const postPayload = {
    action: 'submit_catch_answer',
    sheetName: 'اجابات صيد',
    studentId: payload.studentId,
    studentName: payload.studentName,
    subjectName: payload.subjectName,
    lessonSubject: payload.subjectName,
    exerciseNumber: payload.exerciseNumber,
    exerciseIndex: payload.exerciseNumber,
    resultFormula: summaryString,
    summaryString,
    completionStatus,
    percentage: payload.percentage,
    timestamp: timestampStr,
  };

  const res = await callGoogleSheetsPost(webhookUrl, postPayload);
  return {
    success: res.success,
    error: res.error,
  };
}

/**
 * Fetch student Catch history from sheet "اجابات صيد" and merge with local cache
 */
export async function fetchStudentCatchHistory(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<CatchHistoryItem[]> {
  const cleanId = (studentId || '').trim();
  const cleanName = (studentName || '').trim();
  const mergedMap = new Map<string, CatchHistoryItem>();

  if (webhookUrl && webhookUrl.trim().startsWith('http') && (cleanId || cleanName)) {
    try {
      const cleanUrl = webhookUrl.trim();
      const separator = cleanUrl.includes('?') ? '&' : '?';
      const targetUrl = `${cleanUrl}${separator}action=get_student_catch_history&studentId=${encodeURIComponent(
        cleanId
      )}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;

      let data: any = null;
      try {
        const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
        if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
      } catch {}

      if (!data || !Array.isArray(data.catchHistory)) {
        try {
          const directRes = await fetch(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (directRes.ok) data = await directRes.json().catch(() => null);
        } catch {}
      }

      if (data && Array.isArray(data.catchHistory)) {
        for (const item of data.catchHistory) {
          const subj = String(item.lessonSubject || item.subjectName || '').trim();
          if (!subj) continue;
          const exercises: CatchExerciseHistoryEntry[] = Array.isArray(item.exercises)
            ? item.exercises
                .map((ex: any) => {
                  const formulaStr = String(ex.formulaString || '').trim();
                  return {
                    exerciseNumber: Number(ex.exerciseNumber) || 1,
                    formulaString: formulaStr,
                    percentage: extractPercentageFromMatchingText(formulaStr, ex.percentage),
                  };
                })
                .sort(
                  (a: CatchExerciseHistoryEntry, b: CatchExerciseHistoryEntry) =>
                    a.exerciseNumber - b.exerciseNumber
                )
            : [];
          mergedMap.set(subj, {
            id: item.id || `catch-ans-${subj}`,
            timestamp: String(item.timestamp || '').trim(),
            studentId: String(item.studentId || cleanId).trim(),
            studentName: String(item.studentName || cleanName).trim(),
            lessonSubject: subj,
            completionStatus: String(item.completionStatus || '').trim(),
            exercises,
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching student catch history from Google Sheets:', e);
    }
  }

  try {
    const cacheKey = cleanId ? `faseeh_catch_sub_${cleanId}` : 'faseeh_catch_sub_guest';
    const rawCache = localStorage.getItem(cacheKey);
    if (rawCache) {
      const localItems: CatchHistoryItem[] = JSON.parse(rawCache);
      if (Array.isArray(localItems)) {
        for (const localItem of localItems) {
          const subj = (localItem.lessonSubject || '').trim();
          if (!subj) continue;
          const normalizedLocalExercises = (localItem.exercises || []).map((ex) => ({
            ...ex,
            percentage: extractPercentageFromMatchingText(ex.formulaString, ex.percentage),
          }));
          const existing = mergedMap.get(subj);
          if (!existing) {
            mergedMap.set(subj, {
              ...localItem,
              exercises: normalizedLocalExercises,
            });
          } else {
            const exMap = new Map<number, CatchExerciseHistoryEntry>();
            for (const ex of existing.exercises) exMap.set(ex.exerciseNumber, ex);
            for (const ex of normalizedLocalExercises) {
              if (!exMap.has(ex.exerciseNumber)) {
                exMap.set(ex.exerciseNumber, ex);
              }
            }
            existing.exercises = Array.from(exMap.values()).sort(
              (a, b) => a.exerciseNumber - b.exerciseNumber
            );
            if (!existing.completionStatus && localItem.completionStatus) {
              existing.completionStatus = localItem.completionStatus;
            }
          }
        }
      }
    }
  } catch {}

  return Array.from(mergedMap.values());
}

/**
 * Fetch Catch-specific AR Rewards from sheet "مكافآت صيد AR"
 */
export async function fetchCatchARRewardsFromSheet(webhookUrl: string): Promise<{
  success: boolean;
  rewards: ARRewardTier[];
  introReward: ARRewardTier | null;
  needsScriptUpdate?: boolean;
  error?: string;
}> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return {
      success: false,
      rewards: getDefaultARRewards(),
      introReward: getDefaultCatchARIntroReward(),
      error: 'رابط Google Sheets غير متوفر',
    };
  }

  try {
    const cleanUrl = webhookUrl.trim();
    const sep = cleanUrl.includes('?') ? '&' : '?';
    const targetUrl = `${cleanUrl}${sep}action=get_catch_ar_rewards&_t=${Date.now()}`;

    let res: any = null;
    try {
      const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
      if (proxyRes.ok) res = await proxyRes.json().catch(() => null);
    } catch {}

    if (!res) {
      try {
        const directRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (directRes.ok) res = await directRes.json().catch(() => null);
      } catch {}
    }

    if (res && Array.isArray(res.rewards)) {
      const { intro, tiers } = splitARRewardsPayload(res.rewards);
      return {
        success: true,
        rewards: tiers,
        introReward: intro,
      };
    }

    if (res && Array.isArray(res.curriculum)) {
      return {
        success: false,
        rewards: [],
        introReward: null,
        needsScriptUpdate: true,
        error: 'كود Apps Script يحتاج تحديث لإضافة دعم ورقة مكافآت صيد AR',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      rewards: [],
      introReward: null,
      error: err?.message || 'تعذر جلب مكافآت صيد AR',
    };
  }

  return {
    success: false,
    rewards: [],
    introReward: null,
    error: 'تعذر جلب مكافآت صيد AR',
  };
}

/**
 * Save Catch-specific AR Rewards to sheet "مكافآت صيد AR"
 */
export async function saveCatchARRewardsToSheet(
  webhookUrl: string,
  rewards: ARRewardTier[],
  introReward?: ARRewardTier | null
): Promise<{
  success: boolean;
  rewards?: ARRewardTier[];
  introReward?: ARRewardTier | null;
  needsScriptUpdate?: boolean;
  error?: string;
}> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets غير متوفر' };
  }

  const allItems: ARRewardTier[] = [
    ...(introReward ? [{ ...introReward, id: AR_INTRO_ID, minScore: 0, maxScore: 0 }] : []),
    ...rewards.filter((r) => r.id !== AR_INTRO_ID),
  ];

  const postRes = await callGoogleSheetsPost(webhookUrl, {
    action: 'save_catch_ar_rewards',
    sheetName: 'مكافآت صيد AR',
    rewards: allItems.map((r) => ({
      ...r,
      imageUrl: r.presetId ? '' : r.imageUrl,
    })),
  });

  if (postRes.success && postRes.data && Array.isArray(postRes.data.rewards)) {
    const { intro, tiers } = splitARRewardsPayload(postRes.data.rewards);
    return {
      success: true,
      rewards: tiers,
      introReward: intro,
    };
  }

  if (postRes.success && postRes.data && postRes.data.status !== 'success' && postRes.data.success === undefined) {
    return {
      success: false,
      needsScriptUpdate: true,
      error: 'كود Apps Script يحتاج تحديث لحفظ ورقة مكافآت صيد AR',
    };
  }

  return {
    success: postRes.success,
    error: postRes.error,
  };
}

/**
 * Save a completed writing exercise entry to local storage cache so completed lessons hide immediately
 */
export function saveLocalWritingSubmission(
  studentId: string,
  studentName: string,
  topic: string,
  entry: WritingExerciseHistoryEntry,
  completionStatus?: string
): WritingHistoryItem[] {
  const cleanId = (studentId || '').trim();
  const cleanTopic = (topic || '').trim();
  const cacheKey = cleanId ? `faseeh_writing_sub_${cleanId}` : 'faseeh_writing_sub_guest';
  let list: WritingHistoryItem[] = [];
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {}

  const ts = new Date().toLocaleString('ar-SA');
  const idx = list.findIndex((item) => (item.topic || '').trim() === cleanTopic);
  if (idx >= 0) {
    const existing = list[idx];
    const filtered = (existing.exercises || []).filter(
      (ex) => !(ex.slotIndex === entry.slotIndex && (ex.title || '').trim() === (entry.title || '').trim())
    );
    filtered.push(entry);
    filtered.sort((a, b) => a.slotIndex - b.slotIndex);
    list[idx] = {
      ...existing,
      timestamp: ts,
      completionStatus: completionStatus || existing.completionStatus,
      exercises: filtered,
    };
  } else {
    list.unshift({
      id: `local-ans4-${Date.now()}`,
      timestamp: ts,
      studentId: cleanId,
      studentName: (studentName || '').trim(),
      topic: cleanTopic,
      completionStatus: completionStatus || '',
      exercises: [entry],
    });
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify(list));
  } catch {}
  return list;
}

/**
 * Fetch student writing history from sheet "answers 4" and merge with local cache
 */
export async function fetchStudentWritingHistory(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<WritingHistoryItem[]> {
  const cleanId = (studentId || '').trim();
  const cleanName = (studentName || '').trim();
  const mergedMap = new Map<string, WritingHistoryItem>();

  if (webhookUrl && webhookUrl.trim().startsWith('http') && (cleanId || cleanName)) {
    try {
      const cleanUrl = webhookUrl.trim();
      const separator = cleanUrl.includes('?') ? '&' : '?';
      const targetUrl = `${cleanUrl}${separator}action=get_student_writing_history&studentId=${encodeURIComponent(
        cleanId
      )}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;

      let data: any = null;
      try {
        const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
        if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
      } catch {}

      if (!data || !Array.isArray(data.writingHistory)) {
        try {
          const directRes = await fetch(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (directRes.ok) data = await directRes.json().catch(() => null);
        } catch {}
      }

      if (data && Array.isArray(data.writingHistory)) {
        for (const item of data.writingHistory) {
          const topic = String(item.topic || '').trim();
          if (!topic) continue;
          const exercises: WritingExerciseHistoryEntry[] = Array.isArray(item.exercises)
            ? item.exercises
                .map((ex: any) => ({
                  slotIndex: Number(ex.slotIndex) || 1,
                  category: String(ex.category || 'حروف').trim(),
                  title: String(ex.title || '').trim(),
                  imageUrl: String(ex.imageUrl || '').trim(),
                  score: extractPercentageFromMatchingText(String(ex.score || ''), Number(ex.score)),
                  details: String(ex.details || '').trim(),
                }))
                .sort((a: WritingExerciseHistoryEntry, b: WritingExerciseHistoryEntry) => a.slotIndex - b.slotIndex)
            : [];
          mergedMap.set(topic, {
            id: item.id || `ans4-${topic}`,
            timestamp: String(item.timestamp || '').trim(),
            studentId: String(item.studentId || cleanId).trim(),
            studentName: String(item.studentName || cleanName).trim(),
            topic,
            completionStatus: String(item.completionStatus || '').trim(),
            exercises,
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching student writing history from Google Sheets:', e);
    }
  }

  try {
    const cacheKey = cleanId ? `faseeh_writing_sub_${cleanId}` : 'faseeh_writing_sub_guest';
    const rawCache = localStorage.getItem(cacheKey);
    if (rawCache) {
      const localItems: WritingHistoryItem[] = JSON.parse(rawCache);
      if (Array.isArray(localItems)) {
        for (const localItem of localItems) {
          const topic = (localItem.topic || '').trim();
          if (!topic) continue;
          const existing = mergedMap.get(topic);
          if (!existing) {
            mergedMap.set(topic, localItem);
          } else {
            const seen = new Set(
              existing.exercises.map((ex) => `${ex.slotIndex}::${(ex.title || '').trim()}`)
            );
            for (const ex of localItem.exercises || []) {
              const k = `${ex.slotIndex}::${(ex.title || '').trim()}`;
              if (!seen.has(k)) {
                existing.exercises.push(ex);
                seen.add(k);
              }
            }
            existing.exercises.sort((a, b) => a.slotIndex - b.slotIndex);
            if (!existing.completionStatus && localItem.completionStatus) {
              existing.completionStatus = localItem.completionStatus;
            }
          }
        }
      }
    }
  } catch {}

  return Array.from(mergedMap.values());
}

/**
 * Complete Google Apps Script Template Code
 * Supports:
 * - Sheet "الدروس" with horizontal lessons:
 *   - Col A: موضوع الدرس
 *   - Col B:I: النص الأول (8 أعمدة: الفئة | الصورة | الصوت | القراءة الآلية | نص الدرس | المعنى | المخرج | التكرار)
 *   - Col J:Q: النص الثاني (8 أعمدة)
 *   - Col R:Y: النص الثالث (8 أعمدة)
 *   - Col Z:AG: النص الرابع (8 أعمدة)... وهكذا بلا حدود!
 * - Sheet "answers 1" with horizontal student responses:
 *   - Col A: وقت الارسال
 *   - Col B: ID المشترك
 *   - Col C: اسم المشترك
 *   - Col D: موضوع الدرس
 *   - Col E: محجوز
 *   - Col F:J: الإجابة الأولى (الكلمة المستهدفة | النص المنطوق | رابط ملف الصوت | الدرجة % | التقدير)
 *   - Col K:O: الإجابة الثانية (5 أعمدة في نفس الصف)
 *   - Col P:T: الإجابة الثالثة... وهكذا!
 * - Sheet "ID registrants" for student IDs and names
 * - Automatic saving of recorded audio directly into user's Google Drive folder
 */
export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * كود Google Apps Script المتكامل لمنصة (فصيح)
 * ----------------------------------------------------
 * هيكل ورقة "الدروس" المعتمد:
 * العامود A: موضوع الدرس
 * النص الأول (B:I):
 *   B: الفئة | C: الصورة | D: الصوت | E: قراءة آلية | F: نص الدرس | G: المعنى | H: المخرج | I: التكرار
 * النص الثاني (J:Q):
 *   J: الفئة | K: الصورة | L: الصوت | M: قراءة آلية | N: نص الدرس | O: المعنى | P: المخرج | Q: التكرار
 * النص الثالث (R:Y):
 *   R: الفئة | S: الصورة | T: الصوت | U: قراءة آلية | V: نص الدرس | W: المعنى | X: المخرج | Y: التكرار
 * النص الرابع (Z:AG)... وهكذا لكل تمرين 8 أعمدة في نفس صف الدرس!
 *
 * يتم حفظ الأصوات تلقائياً داخل مجلد (فصيح_أصوات_الدروس) في Google Drive الخاص بك!
 */

/**
 * -----------------------------------------------------------------------
 * خطوة تفويض الصلاحيات (Authorization) - لمرة واحدة فقط:
 * إذا ظهر لك أي تنبيه يخص صلاحيات Google Drive أو Sheets:
 * 1. افتح محرر السكربت من الشيت: Extensions -> Apps Script
 * 2. اختر دالة authorizePermissions من القائمة المنسدلة بالأعلى
 * 3. اضغط على زر "تشغيل / Run"
 * 4. ستفتح نافذة جوجل لمنح الإذن لـ Google Drive والشيت والاتصال الخارجي (UrlFetchApp / تيليغرام): اضغط Review Permissions ثم اضغط Allow.
 * 5. اضغط على Deploy -> Manage Deployments -> أيقونة القلم (Edit) -> اختر New Version -> ثم اضغط Deploy.
 * -----------------------------------------------------------------------
 */
function authorizePermissions() {
  var root = DriveApp.getRootFolder();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // إنشاء مجلد تجريبي ومسحه للتأكد من تفويض صلاحيات الإنشاء والكتابة الكاملة
  var testFolder = DriveApp.createFolder("فصيح_أصوات_الدروس");
  var testFile = testFolder.createFile("test_auth.txt", "OK");
  testFile.setTrashed(true);
  // تفويض الاتصال الخارجي لإرسال إشعارات بوت تيليغرام
  var tgPing = UrlFetchApp.fetch("https://api.telegram.org", { muteHttpExceptions: true });
  // تفويض إرسال البريد الإلكتروني عبر MailApp
  var mailQuota = 0;
  try {
    mailQuota = MailApp.getRemainingDailyQuota();
  } catch (mErr) {
    Logger.log("تنبيه صلاحية البريد: " + mErr);
  }
  Logger.log("تم تفويض Google Drive بنجاح: " + root.getName());
  Logger.log("تم تفويض Google Sheets بنجاح: " + ss.getName());
  Logger.log("تم تفويض الاتصال الخارجي (UrlFetchApp / تيليغرام) بنجاح: HTTP " + tgPing.getResponseCode());
  Logger.log("تم تفويض البريد الإلكتروني (MailApp) بنجاح — الحصة المتبقية اليوم: " + mailQuota);
}

/**
 * شغّل هذه الدالة مرة واحدة من محرر Apps Script لمنح صلاحية إرسال البريد وإرسال رسالة اختبارية لبريدك.
 */
function authorizeAndTestEmailGS() {
  var ownerEmail = "";
  try {
    ownerEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || "";
  } catch (e) {}
  var quota = MailApp.getRemainingDailyQuota();
  if (ownerEmail) {
    MailApp.sendEmail({
      to: ownerEmail,
      name: "اختبار البريد الإلكتروني - المنصة التعليمية",
      subject: "اختبار صلاحية إرسال البريد بنجاح",
      body: "تم تفويض صلاحية MailApp بنجاح. الرصيد اليومي المتبقي: " + quota + " رسالة."
    });
    Logger.log("تم إرسال بريد اختباري بنجاح إلى: " + ownerEmail + " | المتبقي اليوم: " + quota);
  } else {
    Logger.log("تم تفويض MailApp بنجاح. الرصيد اليومي المتبقي: " + quota);
  }
}

/**
 * شغّل هذه الدالة مرة واحدة لتفعيل المؤقت التلقائي كل 5 دقائق لإرسال تذكيرات الحصص وتسجيل الغياب تلقائياً.
 */
function setupAttendanceTriggersGS() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "runScheduledAttendanceChecksGS") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("runScheduledAttendanceChecksGS")
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log("تم تثبيت المؤقت الآلي للحصص والغياب (كل 5 دقائق) بنجاح.");
}

function runScheduledAttendanceChecksGS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;
  runAttendanceSchedulerGS(ss, null);
}

function getOrCreateAudioFolder(folderId) {
  // 1. إذا أدخل المعلم معرف مجلد خاص به في Google Drive
  if (folderId && typeof folderId === "string") {
    var fId = folderId.trim();
    if (fId.length > 15) {
      try {
        var customFolder = DriveApp.getFolderById(fId);
        return customFolder;
      } catch (e) {
        Logger.log("Folder by id inaccessible, fallback to auto folder: " + e);
      }
    }
  }

  // 2. البحث عن مجلد "فصيح_أصوات_الدروس" في درايف المعلم نفسه (ملفاتي) أو إنشاؤه تلقائياً
  try {
    var folders = DriveApp.getFoldersByName("فصيح_أصوات_الدروس");
    if (folders.hasNext()) {
      return folders.next();
    }
    var created = DriveApp.createFolder("فصيح_أصوات_الدروس");
    try {
      created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}
    return created;
  } catch (err) {
    Logger.log("Fallback to root folder: " + err);
    // 3. المجلد الجذري (ملفاتي) كخيار بديل نهائي مضمون 100%
    return DriveApp.getRootFolder();
  }
}

// دالة مساعدة لإنشاء أو استرجاع ورقة "الرئيسية" للتحكم بالشعار والعنوان والوصف وروابط التواصل
function getHomeSheet(ss) {
  var sheet = ss.getSheetByName("الرئيسية");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim() === "الرئيسية") {
        return all[i];
      }
    }
    sheet = ss.insertSheet("الرئيسية");
    sheet.getRange(1, 1, 1, 3).setValues([["عنصر الواجهة", "القيمة / الرابط (B)", "اسم الأيقونة (C)"]])
      .setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
    sheet.getRange(2, 1, 1, 3).setValues([["شعار المنصة (رابط صورة أو Drive)", "", ""]]);
    sheet.getRange(3, 1, 1, 3).setValues([["عنوان المنصة الرئيسي", "فَصِيح — منصة تدريب وتقييم النطق ومخارج الحروف العربية", ""]]);
    sheet.getRange(4, 1, 1, 3).setValues([["الوصف التعريفي", "برنامج تعليمي متكامل لضبط وتجويد نطق الحروف والكلمات العربية، يجمع بين دقة التفريغ الصوتي والمقارنة الفيزيائية مع صوت المعلم.", ""]]);
    
    sheet.getRange(6, 1, 1, 3).setValues([["حسابات ومواقع التواصل (10 خانات)", "رابط المنصة / الصفحة (B)", "اسم الأيقونة (C: مطلوب للظهور)"]])
      .setBackground("#047857").setFontColor("#ffffff").setFontWeight("bold");
    sheet.getRange(7, 1, 1, 3).setValues([["الرقم (#)", "رابط المنصة (URL)", "اسم الأيقونة (line / facebook / instagram / youtube)"]])
      .setBackground("#e6f4ea").setFontWeight("bold");
      
    var defaultSocials = [
      ["1", "", "line"],
      ["2", "", "facebook"],
      ["3", "", "instagram"],
      ["4", "", "youtube"],
      ["5", "", ""],
      ["6", "", ""],
      ["7", "", ""],
      ["8", "", ""],
      ["9", "", ""],
      ["10", "", ""]
    ];
    sheet.getRange(8, 1, 10, 3).setValues(defaultSocials);

    // بطاقة الصفحة الرئيسية (B21:B27)
    sheet.getRange(19, 1, 1, 3).setValues([["بطاقة الصفحة الرئيسية (B21:B27)", "القيمة / الرابط (B)", "ملاحظات"]])
      .setBackground("#4338ca").setFontColor("#ffffff").setFontWeight("bold");
    sheet.getRange(20, 1, 1, 3).setValues([["البيان", "القيمة / الرابط", "التفاصيل"]])
      .setBackground("#e0e7ff").setFontWeight("bold");
    sheet.getRange(21, 1, 1, 3).setValues([["رابط صورة شعار البطاقة", "", "رابط صورة أو Drive"]]);
    sheet.getRange(22, 1, 1, 3).setValues([["رابط صورة خلفية البطاقة", "", "رابط صورة أو GIF متحرك أو Drive"]]);
    sheet.getRange(23, 1, 1, 3).setValues([["عنوان البطاقة الرئيسي", "فَصِيح — منصة تدريب وتقييم النطق ومخارج الحروف العربية", "نص العنوان الرئيسي للبطاقة"]]);
    sheet.getRange(24, 1, 1, 3).setValues([["النص الوصفي للبطاقة", "برنامج تعليمي متكامل لضبط وتجويد نطق الحروف والكلمات العربية، يجمع بين دقة التفريغ الصوتي والمقارنة الفيزيائية مع صوت المعلم.", "الوصف التعريفي للبطاقة"]]);
    sheet.getRange(25, 1, 1, 3).setValues([["نص إضافي 1", "", "اختياري"]]);
    sheet.getRange(26, 1, 1, 3).setValues([["نص إضافي 2", "", "اختياري"]]);
    sheet.getRange(27, 1, 1, 3).setValues([["نص إضافي 3", "", "اختياري"]]);

    try {
      sheet.setColumnWidth(1, 230);
      sheet.setColumnWidth(2, 380);
      sheet.setColumnWidth(3, 220);
    } catch(wErr) {}
  }
  return sheet;
}

// دالة قراءة بيانات ورقة "الرئيسية"
function readHomeConfig(ss) {
  try {
    var hSheet = ss.getSheetByName("الرئيسية");
    if (!hSheet) return null;
    var logoUrl = String(hSheet.getRange(2, 2).getValue() || "").trim();
    var title = String(hSheet.getRange(3, 2).getValue() || "").trim();
    var subtitle = String(hSheet.getRange(4, 2).getValue() || "").trim();
    
    var socialLinks = [];
    var maxSocialRow = Math.min(hSheet.getLastRow(), 18);
    if (maxSocialRow >= 8) {
      var rows = hSheet.getRange(8, 2, maxSocialRow - 7, 2).getValues();
      for (var s = 0; s < rows.length; s++) {
        var url = String(rows[s][0] || "").trim();
        var iconKey = String(rows[s][1] || "").trim().toLowerCase();
        // شرط المستخدم: إذا كان يوجد رابط ولم يتم وضع أيقونة لا تظهر! تظهر فقط إذا وُجد الرابط واسم الأيقونة
        if (url && iconKey) {
          socialLinks.push({
            url: url,
            iconKey: iconKey
          });
        }
      }
    }

    // بطاقة الصفحة الرئيسية B21:B27
    var cardLogoUrl = String(hSheet.getRange(21, 2).getValue() || "").trim();
    var cardBgUrl = String(hSheet.getRange(22, 2).getValue() || "").trim();
    var cardTitle = String(hSheet.getRange(23, 2).getValue() || "").trim();
    var cardSubtitle = String(hSheet.getRange(24, 2).getValue() || "").trim();
    var extraText1 = String(hSheet.getRange(25, 2).getValue() || "").trim();
    var extraText2 = String(hSheet.getRange(26, 2).getValue() || "").trim();
    var extraText3 = String(hSheet.getRange(27, 2).getValue() || "").trim();

    var cardConfig = {
      cardLogoUrl: cardLogoUrl,
      cardBgUrl: cardBgUrl,
      cardTitle: cardTitle,
      cardSubtitle: cardSubtitle,
      extraText1: extraText1,
      extraText2: extraText2,
      extraText3: extraText3
    };

    // D2:F31: مخصص لأسماء الإداريين وأرقام الدخول وحالة منع الدخول (إذا كانت "لا" يمنع الدخول فوراً)
    var adminUsers = [];
    try {
      var adminValues = hSheet.getRange(2, 4, 30, 3).getValues(); // Cols D, E, F (Rows 2 to 31)
      for (var a = 0; a < adminValues.length; a++) {
        var aName = String(adminValues[a][0] || "").trim();
        var aPin = String(adminValues[a][1] || "").trim();
        var aBlock = String(adminValues[a][2] || "").trim();
        var isBlocked = (aBlock === "لا" || aBlock.toLowerCase() === "no" || aBlock === "ممنوع" || aBlock === "نعم منع");
        if (aName && aPin) {
          adminUsers.push({
            name: aName,
            pin: aPin,
            blocked: isBlocked
          });
        }
      }
    } catch(adErr) {}

    return {
      logoUrl: logoUrl,
      title: title,
      subtitle: subtitle,
      socialLinks: socialLinks,
      card: cardConfig,
      adminUsers: adminUsers
    };
  } catch(e) {
    return null;
  }
}

// دالة قراءة الترجمات من ورقة "الترجمة"
function readTranslations(ss) {
  try {
    var tSheet = ss.getSheetByName("الترجمة") || ss.getSheetByName("Translations");
    if (!tSheet || tSheet.getLastRow() <= 1) return [];
    var data = tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 5).getValues();
    var list = [];
    for (var i = 0; i < data.length; i++) {
      var id = String(data[i][0] || "").trim();
      if (id) {
        list.push({
          id: id,
          category: String(data[i][1] || "home").trim(),
          ar: String(data[i][2] || "").trim(),
          th: String(data[i][3] || "").trim(),
          en: String(data[i][4] || "").trim()
        });
      }
    }
    return list;
  } catch(e) {
    return [];
  }
}

// دالة مساعدة للتأكد التلقائي وتوليد كافة عناوين الأعمدة في ورقة "الدروس" مهما زاد عدد الأعمدة أفقياً
function ensureLessonsHeaders(sheet, maxColNeeded) {
  try {
    var col1 = sheet.getRange(1, 1).getValue();
    if (!col1) {
      sheet.getRange(1, 1).setValue("موضوع الدرس").setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
    }
    var targetColMax = Math.max(sheet.getLastColumn(), maxColNeeded || 9);
    var totalBlocks = Math.ceil((targetColMax - 1) / 8);
    for (var k = 1; k <= totalBlocks; k++) {
      var startC = 2 + (k - 1) * 8;
      if (sheet.getMaxColumns() < startC + 7) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), (startC + 7) - sheet.getMaxColumns());
      }
      var hVal = sheet.getRange(1, startC).getValue();
      if (!hVal) {
        var blockHeaders = [
          "الفئة " + k,
          "رابط الصورة " + k,
          "رابط الصوت " + k,
          "نص للقراءة الآلية " + k,
          "نص الدرس " + k,
          "المعنى والتوضيح " + k,
          "إرشادات المخرج " + k,
          "عدد التكرار " + k
        ];
        sheet.getRange(1, startC, 1, 8).setValues([blockHeaders])
          .setBackground("#e6f4ea")
          .setFontColor("#065f46")
          .setFontWeight("bold");
      }
    }
  } catch (err) {
    Logger.log("ensureLessonsHeaders note: " + err);
  }
}

// دالة مساعدة للتأكد التلقائي وتوليد كافة عناوين الأعمدة في ورقة "answers 1" مهما زاد عدد الإجابات أفقياً
function ensureAnswersHeaders(sheet, maxColNeeded) {
  try {
    var col1 = sheet.getRange(1, 1).getValue();
    if (!col1) {
      var baseHeaders = ["وقت الارسال", "ID المشترك", "اسم المشترك", "موضوع الدرس", "حالة الإنجاز"];
      sheet.getRange(1, 1, 1, 5).setValues([baseHeaders])
        .setBackground("#047857")
        .setFontColor("#ffffff")
        .setFontWeight("bold");
    }
    var targetColMax = Math.max(sheet.getLastColumn(), maxColNeeded || 10);
    var totalBlocks = Math.ceil((targetColMax - 5) / 5);
    for (var k = 1; k <= totalBlocks; k++) {
      var startC = 6 + (k - 1) * 5;
      if (sheet.getMaxColumns() < startC + 4) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), (startC + 4) - sheet.getMaxColumns());
      }
      var hVal = sheet.getRange(1, startC).getValue();
      if (!hVal) {
        var blockHeaders = [
          "الكلمة المستهدفة " + k,
          "النص المنطوق " + k,
          "رابط ملف الصوت " + k,
          "الدرجة " + k + " (%)",
          "التقدير " + k
        ];
        sheet.getRange(1, startC, 1, 5).setValues([blockHeaders])
          .setBackground("#e6f4ea")
          .setFontColor("#065f46")
          .setFontWeight("bold");
      }
    }
  } catch (err) {
    Logger.log("ensureAnswersHeaders note: " + err);
  }
}

// دالة مساعدة ذكية للعثور على ورقة الدروس وتجنب أي خطأ في التسمية
function getLessonsSheet(ss) {
  var sheet = ss.getSheetByName("الدروس");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      var name = all[i].getName().trim();
      if (name === "الدروس" || name === "دروس") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      try {
        sheet = ss.insertSheet("الدروس");
      } catch(e) {
        for (var j = 0; j < all.length; j++) {
          if (all[j].getName().indexOf("سجل") === -1 && all[j].getName().indexOf("نتائج") === -1) {
            sheet = all[j];
            break;
          }
        }
        if (!sheet) sheet = all[0];
      }
    }
  }
  ensureLessonsHeaders(sheet, 33);
  return sheet;
}

// دالة مساعدة لضمان ترويسة الأعمدة الـ 11 لورقة المشتركين "ID registrants"
function ensureIDRegistrantsHeadersGS(sheet) {
  var expected = [
    "ID",
    "اسم المشترك",
    "الحالة",
    "الحد الأقصى للأجهزة",
    "الأجهزة المسجلة JSON",
    "إجبار الموقع",
    "رابط الدخول المباشر",
    "صورة QR",
    "البرنامج التدريبي",
    "رابط الدخول السريع لتيليغرام",
    "QR الدخول السريع لتيليغرام"
  ];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 11).setValues([expected])
      .setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
    return;
  }
  var existingCols = Math.max(2, sheet.getLastColumn());
  if (existingCols < 9) {
    sheet.getRange(1, 1, 1, 11).setValues([expected])
      .setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
  } else if (existingCols < 11) {
    sheet.getRange(1, 10, 1, 2).setValues([[expected[9], expected[10]]])
      .setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
  }
}

function saveAppBaseUrlGS(baseUrl) {
  var clean = String(baseUrl || "").trim();
  if (!clean) return;
  try {
    PropertiesService.getScriptProperties().setProperty("APP_BASE_URL", clean);
  } catch (e) {}
}

function getAppBaseUrlGS() {
  try {
    return String(PropertiesService.getScriptProperties().getProperty("APP_BASE_URL") || "").trim();
  } catch (e) {
    return "";
  }
}

function buildDirectLoginUrlGS(baseUrl, studentId, studentName) {
  var cleanBase = String(baseUrl || getAppBaseUrlGS() || "").trim();
  var q = "student_id=" + encodeURIComponent(String(studentId || "")) + "&student_name=" + encodeURIComponent(String(studentName || ""));
  if (!cleanBase) return "";
  return cleanBase + (cleanBase.indexOf("?") === -1 ? "?" : "&") + q;
}

function buildTelegramQuickJoinUrlGS(botUsername, studentId) {
  var cleanBot = String(botUsername || "").replace(/^@/, "").replace(/^https?:\\/\\/t\\.me\\//i, "").trim();
  if (!cleanBot) return "";
  var cleanId = normRegDigitsGS(studentId || "");
  if (!cleanId) return "https://t.me/" + cleanBot;
  return "https://t.me/" + cleanBot + "?start=" + encodeURIComponent(cleanId);
}

function buildQrImageUrlGS(directUrl) {
  if (!directUrl) return "";
  return "https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=" + encodeURIComponent(directUrl);
}

function syncRegistrantLinkAndQrCellsGS(sheet, rowNum, studentId, studentName, baseUrl, botUsernameOverride) {
  var directUrl = buildDirectLoginUrlGS(baseUrl, studentId, studentName);
  var qrImgUrl = directUrl ? buildQrImageUrlGS(directUrl) : "";
  if (directUrl) {
    sheet.getRange(rowNum, 7).setValue(directUrl);
    sheet.getRange(rowNum, 8).setFormula('=IMAGE("' + qrImgUrl + '")');
  }
  var resolvedBot = String(botUsernameOverride || "").replace(/^@/, "").trim();
  if (!resolvedBot) {
    try {
      var tgSheetCfg = readTelegramConfigGS(sheet.getParent());
      resolvedBot = String(tgSheetCfg.botUsername || "").replace(/^@/, "").trim();
    } catch (e) {}
  }
  var tgDirectUrl = buildTelegramQuickJoinUrlGS(resolvedBot, studentId);
  var tgQrImgUrl = tgDirectUrl ? buildQrImageUrlGS(tgDirectUrl) : "";
  if (tgDirectUrl) {
    sheet.getRange(rowNum, 10).setValue(tgDirectUrl);
    sheet.getRange(rowNum, 11).setFormula('=IMAGE("' + tgQrImgUrl + '")');
  }
  return {
    directLoginUrl: directUrl,
    qrImageUrl: qrImgUrl,
    telegramDirectUrl: tgDirectUrl,
    telegramQrImageUrl: tgQrImgUrl
  };
}

function isLocationRequiredGS(val) {
  var s = String(val || "").trim().toLowerCase();
  return s === "إجبار" || s === "اجبار" || s === "نعم" || s === "true" || s === "required" || s === "1";
}

function normRegDigitsGS(str) {
  var s = String(str || "").trim();
  var arNums = "٠١٢٣٤٥٦٧٨٩";
  var faNums = "۰۱۲۳۴۵۶۷۸۹";
  for (var i = 0; i < 10; i++) {
    s = s.split(arNums[i]).join(String(i)).split(faNums[i]).join(String(i));
  }
  return s;
}

function normRegArabicGS(str) {
  return String(str || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\\s+/g, " ")
    .trim();
}

function parseRegistrantDevicesGS(raw) {
  if (!raw) return [];
  var str = String(raw || "").trim();
  if (!str || str.charAt(0) !== "[") return [];
  try {
    var arr = JSON.parse(str);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function isRegistrantDisabledGS(statusVal) {
  var s = String(statusVal || "").trim().toLowerCase();
  return s === "معطل" || s === "معطّل" || s === "لا" || s === "no" || s === "false" || s === "disabled" || s === "0";
}

function reverseGeocodeLocGS(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === "" || lng === "") {
    return "غير متاح";
  }
  var nLat = Number(lat);
  var nLng = Number(lng);
  if (isNaN(nLat) || isNaN(nLng)) return "غير متاح";
  try {
    var geo = Maps.newGeocoder().reverseGeocode(nLat, nLng);
    if (geo && geo.results && geo.results.length > 0) {
      var comps = geo.results[0].address_components || [];
      var city = "";
      var country = "";
      for (var c = 0; c < comps.length; c++) {
        var types = comps[c].types || [];
        if (!city && (types.indexOf("locality") !== -1 || types.indexOf("administrative_area_level_1") !== -1)) {
          city = comps[c].long_name || "";
        }
        if (!country && types.indexOf("country") !== -1) {
          country = comps[c].long_name || "";
        }
      }
      if (city && country) return city + "، " + country;
      if (country) return country;
      if (geo.results[0].formatted_address) return String(geo.results[0].formatted_address).slice(0, 60);
    }
  } catch (e) {}
  return nLat.toFixed(4) + ", " + nLng.toFixed(4);
}

function readAllRegistrantsGS(sheet) {
  var lastR = sheet.getLastRow();
  var list = [];
  if (lastR <= 1) return list;
  var colCount = Math.max(11, sheet.getLastColumn());
  var vals = sheet.getRange(2, 1, lastR - 1, colCount).getValues();
  var baseUrl = getAppBaseUrlGS();
  var botUserFromCfg = "";
  try {
    botUserFromCfg = String(readTelegramConfigGS(sheet.getParent()).botUsername || "").replace(/^@/, "").trim();
  } catch (e) {}
  for (var i = 0; i < vals.length; i++) {
    var rId = normRegDigitsGS(vals[i][0]);
    var rName = String(vals[i][1] || "").trim();
    if (rId && rName && rId !== "ID") {
      var rStatus = String(vals[i][2] || "").trim() || "مفعّل";
      var rMax = Number(vals[i][3]);
      if (isNaN(rMax) || rMax < 1) rMax = 1;
      var rDevices = parseRegistrantDevicesGS(vals[i][4]);
      var reqLoc = isLocationRequiredGS(vals[i][5]);
      var directUrl = String(vals[i][6] || "").trim() || buildDirectLoginUrlGS(baseUrl, rId, rName);
      var qrUrl = buildQrImageUrlGS(directUrl);
      var progId = String(vals[i][8] || "").trim();
      var tgDirectUrl = String(vals[i][9] || "").trim() || buildTelegramQuickJoinUrlGS(botUserFromCfg, rId);
      var tgQrUrl = buildQrImageUrlGS(tgDirectUrl);
      list.push({
        rowNumber: i + 2,
        id: rId,
        name: rName,
        status: rStatus,
        maxDevices: rMax,
        devices: rDevices,
        requireLocation: reqLoc,
        directLoginUrl: directUrl,
        qrImageUrl: qrUrl,
        programId: progId,
        telegramDirectUrl: tgDirectUrl,
        telegramQrImageUrl: tgQrUrl
      });
    }
  }
  return list;
}

// دالة مساعدة لإنشاء أو استرجاع ورقة المشتركين "ID registrants"
function getIDRegistrantsSheet(ss) {
  var sheet = ss.getSheetByName("ID registrants");
  if (!sheet) {
    sheet = ss.insertSheet("ID registrants");
    ensureIDRegistrantsHeadersGS(sheet);
    sheet.appendRow(["1001", "أحمد علي", "مفعّل", 1, "[]", "مسموح", "", "", "", "", ""]);
  } else {
    ensureIDRegistrantsHeadersGS(sheet);
  }
  return sheet;
}

// دالة مساعدة لإنشاء أو استرجاع ورقة إجابات الطلاب الأفقية "answers 1"
function getAnswers1Sheet(ss) {
  var sheet = ss.getSheetByName("answers 1");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim().toLowerCase() === "answers 1") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      sheet = ss.insertSheet("answers 1");
    }
  }
  ensureAnswersHeaders(sheet, 25);
  return sheet;
}

// دالة مساعدة لإنشاء أو استرجاع ورقة أسئلة تمرين الوصل "وصل" (4 أعمدة لكل تمرين)
function getMatchingSheet(ss) {
  var sheet = ss.getSheetByName("وصل");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim() === "وصل") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      sheet = ss.insertSheet("وصل");
      var headers = ["موضوع الدرس"];
      for (var ex = 1; ex <= 10; ex++) {
        headers.push("السؤال " + ex);
        headers.push("الكلمات في اليمين " + ex + " ( | )");
        headers.push("الكلمات في اليسار " + ex + " ( | )");
        headers.push("إعدادات التمرين " + ex);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#6b21a8").setFontColor("#ffffff").setFontWeight("bold");
    }
  }
  return sheet;
}

// دالة مساعدة لإنشاء أو استرجاع ورقة إجابات تمرين الوصل "answers 2"
function getAnswers2Sheet(ss) {
  var sheet = ss.getSheetByName("answers 2");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim().toLowerCase() === "answers 2") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      sheet = ss.insertSheet("answers 2");
      var headers = ["وقت الإرسال", "ID المشترك", "اسم المشترك", "موضوع الدرس", "حالة الإنجاز"];
      for (var ex = 1; ex <= 20; ex++) {
        headers.push("تمرين " + ex);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#581c87").setFontColor("#ffffff").setFontWeight("bold");
    }
  }
  return sheet;
}

// دالة مساعدة لإنشاء أو استرجاع ورقة أسئلة التمرين الثالث "كلمات" (4 أعمدة لكل تمرين)
function getWordsSheet(ss) {
  var sheet = ss.getSheetByName("كلمات");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim() === "كلمات") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      sheet = ss.insertSheet("كلمات");
      var headers = ["موضوع الدرس"];
      for (var ex = 1; ex <= 10; ex++) {
        headers.push("السؤال " + ex);
        headers.push("الحروف والكلمات المشتتة " + ex);
        headers.push("الإجابة الصحيحة " + ex);
        headers.push("الإعدادات " + ex);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
    }
  }
  return sheet;
}

// دالة مساعدة لإنشاء أو استرجاع ورقة إجابات التمرين الثالث "answers 3"
function getAnswers3Sheet(ss) {
  var sheet = ss.getSheetByName("answers 3");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim().toLowerCase() === "answers 3") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      sheet = ss.insertSheet("answers 3");
      var headers = ["وقت الإرسال", "ID المشترك", "اسم المشترك", "موضوع الدرس", "حالة الإنجاز"];
      for (var ex = 1; ex <= 20; ex++) {
        headers.push("تمرين " + ex);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#115e59").setFontColor("#ffffff").setFontWeight("bold");
    }
  }
  return sheet;
}

// دالة مساعدة لإنشاء أو استرجاع ورقة سجل محاولات الإعادة "سجل_المحاولات"
function getRetriesSheet(ss) {
  var sheet = ss.getSheetByName("سجل_المحاولات");
  if (!sheet) {
    sheet = ss.insertSheet("سجل_المحاولات");
    sheet.appendRow(["رقم المشترك", "اسم المشترك", "نوع التمرين", "معرف التمرين", "عدد الإعادات", "آخر تحديث"]);
    sheet.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#ede9fe");
  }
  return sheet;
}

// دوال مساعدة للتمرين الرابع: تمرين الكتابة والسبورة والواقع المعزز (ArabicLessons + AR Rewards + answers 4)
var WRITING_LESSONS_SHEET_NAME = "ArabicLessons";
var WRITING_ANSWERS_SHEET_NAME = "answers 4";
var AR_REWARDS_SHEET_NAME = "AR Rewards";
var WRITING_DRIVE_FOLDER_ID = "1kYNXRiFvHY09BYLRbINxerXC5cpYiIOX";
var AR_REWARDS_DRIVE_FOLDER_ID = "1tbmh_Br7_yWw5fpi9gJY8a5NZhv5glFz";
var WRITING_COLS_PER_LESSON = 7;
var WRITING_SUB_HEADERS = ["الفئة", "رابط الصورة", "عنوان الصورة", "نص للقراءة الالية", "عدد التكرار", "المستوى", "خطوات الحرف"];
var WRITING_ANSWER_SUB_HEADERS = ["الفئة", "النص", "صورة التمرين", "الدرجة (%)", "تفاصيل"];

function getWritingLessonsSheet(ss) {
  var sheet = ss.getSheetByName(WRITING_LESSONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(WRITING_LESSONS_SHEET_NAME);
    var headers = ["الموضوع"];
    for (var i = 1; i <= 20; i++) {
      for (var s = 0; s < WRITING_SUB_HEADERS.length; s++) {
        headers.push("الدرس " + i + " - " + WRITING_SUB_HEADERS[s]);
      }
    }
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1e293b").setFontColor("#f8fafc").setFontWeight("bold");
  }
  return sheet;
}

function ensureWritingLessonsHeaderLength(sheet, lessonSlotCount) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var neededCols = 1 + (lessonSlotCount * WRITING_COLS_PER_LESSON);
  if (neededCols > lastCol) {
    var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var newHeaders = currentHeaders.slice();
    var currentSlots = Math.floor((lastCol - 1) / WRITING_COLS_PER_LESSON);
    for (var i = currentSlots + 1; i <= lessonSlotCount; i++) {
      for (var s = 0; s < WRITING_SUB_HEADERS.length; s++) {
        newHeaders.push("الدرس " + i + " - " + WRITING_SUB_HEADERS[s]);
      }
    }
    sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    sheet.getRange(1, 1, 1, newHeaders.length).setBackground("#1e293b").setFontColor("#f8fafc").setFontWeight("bold");
  }
}

function getAnswers4Sheet(ss) {
  var sheet = ss.getSheetByName(WRITING_ANSWERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(WRITING_ANSWERS_SHEET_NAME);
    var headers = ["وقت الارسال", "رقم تسجيل المشترك", "اسم المشترك", "موضوع الدرس", "حالة الانجاز"];
    for (var k = 1; k <= 10; k++) {
      for (var s = 0; s < WRITING_ANSWER_SUB_HEADERS.length; s++) {
        headers.push(WRITING_ANSWER_SUB_HEADERS[s] + " " + k);
      }
    }
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0f172a").setFontColor("#f8fafc").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(5);
  }
  return sheet;
}

function ensureAnswers4HeaderLength(sheet, slotNumber) {
  var lastCol = Math.max(sheet.getLastColumn(), 5);
  var neededCols = 5 + (slotNumber * 5);
  if (neededCols > lastCol) {
    var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var newHeaders = currentHeaders.slice();
    var currentSlots = Math.floor((lastCol - 5) / 5);
    for (var k = currentSlots + 1; k <= slotNumber; k++) {
      for (var s = 0; s < WRITING_ANSWER_SUB_HEADERS.length; s++) {
        newHeaders.push(WRITING_ANSWER_SUB_HEADERS[s] + " " + k);
      }
    }
    sheet.getRange(1, 1, 1, newHeaders.length).setValues([newHeaders]);
    sheet.getRange(1, 1, 1, newHeaders.length).setBackground("#0f172a").setFontColor("#f8fafc").setFontWeight("bold");
  }
}

function getARRewardsSheet(ss) {
  var sheet = ss.getSheetByName(AR_REWARDS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(AR_REWARDS_SHEET_NAME);
    var headers = ["المعرف", "العنوان", "من درجة", "إلى درجة", "التصميم الجاهز", "رابط الصورة", "الحجم", "الإزاحة", "مفعّل"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1e293b").setFontColor("#f8fafc").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// دوال مساعدة للتمرين الخامس: تحدي الصيد AR ("صيد" + "اجابات صيد" + "مكافآت صيد AR")
function getCatchSheet(ss) {
  var sheet = ss.getSheetByName("صيد");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim() === "صيد") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      sheet = ss.insertSheet("صيد");
      var headers = ["موضوع الدرس"];
      for (var ex = 1; ex <= 10; ex++) {
        headers.push("السؤال " + ex);
        headers.push("الحروف والكلمات المشتتة " + ex);
        headers.push("الإجابة الصحيحة " + ex);
        headers.push("الإعدادات " + ex);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#0284c7").setFontColor("#ffffff").setFontWeight("bold");
    }
  }
  return sheet;
}

function getCatchAnswersSheet(ss) {
  var sheet = ss.getSheetByName("اجابات صيد");
  if (!sheet) {
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) {
      if (all[i].getName().trim() === "اجابات صيد") {
        sheet = all[i];
        break;
      }
    }
    if (!sheet) {
      sheet = ss.insertSheet("اجابات صيد");
      var headers = ["وقت الإرسال", "ID المشترك", "اسم المشترك", "موضوع الدرس", "حالة الإنجاز"];
      for (var ex = 1; ex <= 20; ex++) {
        headers.push("تمرين " + ex);
      }
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setBackground("#0369a1").setFontColor("#ffffff").setFontWeight("bold");
    }
  }
  return sheet;
}

function getCatchARRewardsSheet(ss) {
  var sheet = ss.getSheetByName("مكافآت صيد AR");
  if (!sheet) {
    sheet = ss.insertSheet("مكافآت صيد AR");
    var headers = ["المعرف", "العنوان", "من درجة", "إلى درجة", "التصميم الجاهز", "رابط الصورة", "الحجم", "الإزاحة", "مفعّل"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0369a1").setFontColor("#f8fafc").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// =========================================================================
// دوال مساعدة لقسم الفيديو التفاعلي وبوت تيليغرام (مستقل تماماً عن التمارين الأخرى)
// =========================================================================
var VIDEO_QUESTIONS_SHEET_NAME = "فيديو_الأسئلة";
var VIDEO_ANSWERS_SHEET_NAME = "فيديو_الإجابات";
var VIDEO_CORRECTIONS_SHEET_NAME = "فيديو_التصحيح";
var TELEGRAM_CONFIG_SHEET_NAME = "تيليغرام_الإعدادات";
var TELEGRAM_USERS_SHEET_NAME = "تيليغرام_الطلاب";
var SCHEDULE_GROUPS_SHEET_NAME = "مجموعات_الجدول";
var SCHEDULE_DAYS_SHEET_NAME = "الجدول_اليومي";
var ATTENDANCE_SHEET_NAME = "سجل_الحضور";
var HOME_CONTENT_SHEET_NAME = "محتوى_الرئيسية";

function getVideoQuestionsSheet(ss) {
  var sheet = ss.getSheetByName(VIDEO_QUESTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VIDEO_QUESTIONS_SHEET_NAME);
    var headers = [
      "ID", "موضوع الدرس", "عنوان الدرس", "التعليمات", "رابط الفيديو",
      "رابط صوت الشرح", "صورة الدرس", "إظهار النتيجة", "السماح بالتسجيل",
      "مدة التسجيل (ث)", "السماح برفع صورة", "عنوان الواجب", "عدد الإعادات",
      "تاريخ البدء", "تاريخ الانتهاء", "ينتهي بعد أيام", "الأسئلة الزمنية JSON", "أسئلة الصوت JSON"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getVideoAnswersSheet(ss) {
  var sheet = ss.getSheetByName(VIDEO_ANSWERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VIDEO_ANSWERS_SHEET_NAME);
    var headers = [
      "آخر تحديث", "ID المشترك", "اسم المشترك", "معرف الدرس", "موضوع الدرس",
      "عنوان الدرس", "حالة الإكمال", "درجة الفيديو", "درجة الصوت",
      "الإجابات JSON", "المحاولات المتبقية", "رابط الصورة", "رابط التسجيل الصوتي"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getVideoCorrectionsSheet(ss) {
  var sheet = ss.getSheetByName(VIDEO_CORRECTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(VIDEO_CORRECTIONS_SHEET_NAME);
    var headers = [
      "عنوان الدرس", "ID المشترك", "اسم المشترك",
      "حالة الصورة", "درجة الصورة", "الصورة المصححة", "صور إضافية JSON", "تاريخ تصحيح الصورة", "ملاحظات الصورة",
      "حالة الصوت", "درجة الصوت", "تسجيلات المعلم JSON", "فيديوهات المعلم JSON", "تاريخ تصحيح الصوت", "ملاحظات الصوت"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#7c2d12").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getTelegramConfigSheet(ss) {
  var sheet = ss.getSheetByName(TELEGRAM_CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TELEGRAM_CONFIG_SHEET_NAME);
    sheet.appendRow(["المفتاح", "القيمة"]);
    sheet.getRange(1, 1, 1, 2).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    sheet.appendRow(["botToken", ""]);
    sheet.appendRow(["botUsername", ""]);
    sheet.appendRow(["enabled", "false"]);
    sheet.appendRow(["welcomeMessage", "مرحباً بك! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم."]);
    sheet.appendRow(["adminChatId", ""]);
    sheet.appendRow(["notifyOnVideoCorrection", "true"]);
    sheet.appendRow(["notifyAdminOnHomework", "false"]);
    sheet.appendRow(["dailyReminderEnabled", "false"]);
    sheet.appendRow(["customFooter", ""]);
    sheet.appendRow(["templatesJson", "{}"]);
  }
  return sheet;
}

function getTelegramUsersSheet(ss) {
  var sheet = ss.getSheetByName(TELEGRAM_USERS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TELEGRAM_USERS_SHEET_NAME);
    sheet.appendRow(["ID المشترك", "اسم المشترك", "Chat ID", "معرف تيليغرام", "تاريخ الربط", "الإشعارات مفعلة"]);
    sheet.getRange(1, 1, 1, 6).setBackground("#0284c7").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

var DEFAULT_TG_TEMPLATES_GS = {
  student_welcome: "مرحباً بك يا {studentName}! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم.\\nرقم المشترك: <code>{studentId}</code>",
  student_id_not_found: "لم يتم العثور على رقم المشترك ({studentId}). أرسل رقم الـ ID الصحيح للربط.",
  student_disabled: "عذراً {studentName}، هذا الحساب معطّل حالياً. يرجى التواصل مع الإدارة.",
  student_stage_transfer: "<b>تهانينا يا {studentName}!</b>\\nتم قبولك وتحويل حسابك إلى: <b>{programName}</b>.\\nيمكنك الآن الدخول إلى صفحتك الخاصة لبدء التدريب.",
  student_program_approved: "<b>تهانينا يا {studentName}!</b>\\nتمت الموافقة على طلبك ونقلك إلى برنامج: <b>{programName}</b> (ID: <code>{studentId}</code>).\\nيمكنك الدخول الآن إلى صفحتك الخاصة لبدء البرنامج.",
  student_video_correction: "<b>تم تصحيح واجبك في درس: {lessonTitle}</b>\\nدرجة الصورة: {imageScore}\\nملاحظة المعلم: {imageNotes}\\nدرجة الصوت: {audioScore}\\nالتوجيه الصوتي: {audioNotes}",
  student_class_reminder: "⏰ <b>تذكير بموعد الحصة</b>\\nمرحباً يا {studentName}، حصة <b>{sessionTitle}</b> ({programName}) تبدأ الساعة <b>{scheduledTime}</b> بتاريخ {date}.\\nنرجو الدخول وتأكيد الحضور عبر صفحتك الخاصة.",
  student_attendance_early: "🌟 <b>أحسنت يا {studentName}! حضور مبكر</b>\\nتم تسجيل حضورك في <b>{sessionTitle}</b> الساعة <code>{time}</code> (قبل الموعد بـ {minutesDelta} دقيقة).",
  student_attendance_ontime: "✅ <b>تم تسجيل حضورك في الموعد</b>\\nالطالب: {studentName}\\nالحصة: <b>{sessionTitle}</b>\\nوقت التسجيل: <code>{time}</code>",
  student_attendance_late: "⚠️ <b>تنبيه: تم تسجيل حضورك متأخراً</b>\\nالطالب: {studentName}\\nالحصة: <b>{sessionTitle}</b> (موعدها {scheduledTime})\\nوقت دخولك: <code>{time}</code> (تأخير {minutesDelta} دقيقة).",
  student_attendance_absent: "❌ <b>إشعار غياب عن حصة اليوم</b>\\nمرحباً يا {studentName}، لم يُسجَّل حضورك في حصة <b>{sessionTitle}</b> ({programName}) بتاريخ {date} الساعة {scheduledTime}.\\nيمكنك الدخول للمنصة لتأكيد حضورك أو مراجعة الدرس.",
  admin_new_registration: "<b>طلب تسجيل طالب جديد (المرحلة 1)</b>\\nالاسم: <b>{studentName}</b>\\nرقم التسجيل (ID): <code>{studentId}</code>\\nالقسم المبدئي: {programName}\\nالهاتف: {phone}\\nالبريد: {email}\\nتيليغرام: {telegramUsername}\\n{answersSummary}",
  admin_program_request: "<b>طلب التحاق ببرنامج تدريبي</b>\\nالمشترك: <b>{studentName}</b>\\nرقم المشترك (ID): <code>{studentId}</code>\\nالبرنامج المطلوب: <b>{programName}</b>\\nملاحظة: {notes}",
  admin_store_order: "<b>طلب جديد في المتجر ({orderId})</b>\\nالعميل: <b>{customerName}</b>\\nالجوال: <code>{phone}</code>\\nالمدينة: {city}\\nالدفع: {paymentMethod}\\n<b>المنتجات:</b>\\n{itemsSummary}\\nالإجمالي النهائي: <b>{total} {currency}</b>",
  admin_store_program_enroll: "<b>طلب التحاق ببرنامج من المتجر ({requestId})</b>\\nالبرنامج: <b>{programName}</b>\\nالمتدرب: <b>{studentName}</b> ({studentId})\\nالجوال: <code>{phone}</code>\\nالرسوم: {priceLabel}\\nملاحظة: {notes}",
  admin_homework_submitted: "📝 <b>تسليم واجب جديد</b>\\nالطالب: <b>{studentName}</b> (ID: <code>{studentId}</code>)\\nالدرس: {lessonTitle}\\nالنوع: {actionLabel}",
  admin_attendance_checkin: "📌 <b>تسجيل حضور حصة ({statusLabel})</b>\\nالطالب: <b>{studentName}</b> (ID: <code>{studentId}</code>)\\nالتاريخ: {date} — وقت الدخول: {time} (الموعد: {scheduledTime})\\nالحصة: {sessionTitle}\\nالموقع: {location}",
  admin_daily_absence_summary: "📊 <b>ملخص الغياب عن الحصة</b>\\nالبرنامج: <b>{programName}</b>\\nالحصة: {sessionTitle}\\nالتاريخ: {date} · الموعد: {scheduledTime}\\nعدد الغائبين: <b>{absentCount}</b>\\n{absentList}"
};

function readTelegramConfigGS(ss) {
  var sheet = getTelegramConfigSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var cfg = {
    botToken: "",
    botUsername: "",
    enabled: false,
    welcomeMessage: "مرحباً بك! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم.",
    adminChatId: "",
    notifyOnVideoCorrection: true,
    notifyAdminOnHomework: false,
    dailyReminderEnabled: false,
    customFooter: "",
    templates: {}
  };
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || "").trim();
    var v = String(rows[i][1] || "").trim();
    if (k === "botToken") cfg.botToken = v;
    else if (k === "botUsername") cfg.botUsername = v;
    else if (k === "enabled") cfg.enabled = (v.toLowerCase() === "true" || v === "نعم" || v === "1");
    else if (k === "welcomeMessage" && v) cfg.welcomeMessage = v;
    else if (k === "adminChatId") cfg.adminChatId = v;
    else if (k === "notifyOnVideoCorrection") cfg.notifyOnVideoCorrection = (v.toLowerCase() !== "false" && v !== "لا" && v !== "0");
    else if (k === "notifyAdminOnHomework") cfg.notifyAdminOnHomework = (v.toLowerCase() === "true" || v === "نعم" || v === "1");
    else if (k === "dailyReminderEnabled") cfg.dailyReminderEnabled = (v.toLowerCase() === "true" || v === "نعم" || v === "1");
    else if (k === "customFooter") cfg.customFooter = v;
    else if (k === "templatesJson" && v) {
      try {
        var parsedT = JSON.parse(v);
        if (parsedT && typeof parsedT === "object") cfg.templates = parsedT;
      } catch (tErr) {}
    }
  }
  return cfg;
}

function writeTelegramConfigGS(ss, cfg) {
  var sheet = getTelegramConfigSheet(ss);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
  }
  var templatesObj = (cfg.templates && typeof cfg.templates === "object") ? cfg.templates : {};
  var welcomeStr = String(cfg.welcomeMessage || "").trim();
  if (!welcomeStr && templatesObj.student_welcome && templatesObj.student_welcome.text) {
    welcomeStr = String(templatesObj.student_welcome.text).trim();
  }
  if (!welcomeStr) welcomeStr = "مرحباً بك! تم ربط حسابك بنجاح.";
  var rows = [
    ["botToken", String(cfg.botToken || "").trim()],
    ["botUsername", String(cfg.botUsername || "").trim()],
    ["enabled", cfg.enabled ? "true" : "false"],
    ["welcomeMessage", welcomeStr],
    ["adminChatId", String(cfg.adminChatId || "").trim()],
    ["notifyOnVideoCorrection", cfg.notifyOnVideoCorrection === false ? "false" : "true"],
    ["notifyAdminOnHomework", cfg.notifyAdminOnHomework ? "true" : "false"],
    ["dailyReminderEnabled", cfg.dailyReminderEnabled ? "true" : "false"],
    ["customFooter", String(cfg.customFooter || "").trim()],
    ["templatesJson", JSON.stringify(templatesObj)]
  ];
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
}

function renderTelegramTemplateGS(ss, tgCfg, key, vars, extraEnabledFlag) {
  if (extraEnabledFlag === false) return { enabled: false, text: "" };
  var templatesMap = (tgCfg && tgCfg.templates && typeof tgCfg.templates === "object") ? tgCfg.templates : {};
  var customEntry = templatesMap[key];
  if (customEntry && customEntry.enabled === false) {
    return { enabled: false, text: "" };
  }
  var rawText = "";
  if (customEntry && customEntry.text !== undefined && String(customEntry.text).trim() !== "") {
    rawText = String(customEntry.text);
  } else if (key === "student_welcome" && tgCfg && tgCfg.welcomeMessage) {
    rawText = String(tgCfg.welcomeMessage);
  } else {
    rawText = String(DEFAULT_TG_TEMPLATES_GS[key] || "");
  }
  if (!rawText) return { enabled: false, text: "" };
  var out = rawText;
  if (vars && typeof vars === "object") {
    var keys = Object.keys(vars);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var val = vars[k] === undefined || vars[k] === null ? "" : String(vars[k]);
      out = out.replace(new RegExp("\\\\{" + k + "\\\\}", "g"), val);
    }
  }
  out = out.replace(/\\{[a-zA-Z0-9_]+\\}/g, "—");
  if (tgCfg && tgCfg.customFooter && String(tgCfg.customFooter).trim()) {
    out = out + "\\n\\n" + String(tgCfg.customFooter).trim();
  }
  return { enabled: true, text: out };
}

function findStudentTelegramChatIdGS(ss, studentId, studentName) {
  var uRows = getTelegramUsersSheet(ss).getDataRange().getValues();
  var normSid = normRegDigitsGS(studentId || "");
  var sNameClean = String(studentName || "").trim();
  for (var u = 1; u < uRows.length; u++) {
    var uId = normRegDigitsGS(uRows[u][0]);
    var uName = String(uRows[u][1] || "").trim();
    var uChatId = String(uRows[u][2] || "").trim();
    var uEnabled = String(uRows[u][5] || "true").trim().toLowerCase() !== "false";
    if (!uEnabled || !uChatId) continue;
    if ((normSid && uId === normSid) || (!normSid && sNameClean && uName === sNameClean)) {
      return uChatId;
    }
  }
  return "";
}

function sendTelegramBotMessageGS(ss, chatId, text, photoUrl, tokenOverride) {
  var cfg = readTelegramConfigGS(ss);
  var token = String(tokenOverride || cfg.botToken || "").trim();
  if (!token) return { ok: false, error: "لم يتم ضبط رمز البوت (Bot Token)." };
  if (!chatId) return { ok: false, error: "لم يتم تحديد Chat ID." };
  try {
    var apiBase = "https://api.telegram.org/bot" + token;
    var endpoint = photoUrl ? (apiBase + "/sendPhoto") : (apiBase + "/sendMessage");
    var body = photoUrl
      ? { chat_id: String(chatId), photo: String(photoUrl), caption: String(text || ""), parse_mode: "HTML" }
      : { chat_id: String(chatId), text: String(text || ""), parse_mode: "HTML" };
    var resp = UrlFetchApp.fetch(endpoint, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    var respText = resp.getContentText();
    var parsedResp = null;
    try { parsedResp = JSON.parse(respText); } catch (pErr) {}
    if (code >= 200 && code < 300 && (!parsedResp || parsedResp.ok !== false)) {
      return { ok: true };
    }
    var tgErrDesc = (parsedResp && parsedResp.description) ? String(parsedResp.description) : ("HTTP " + code);
    return { ok: false, error: tgErrDesc };
  } catch (tgErr) {
    Logger.log("Telegram send error: " + tgErr);
    return { ok: false, error: String(tgErr) };
  }
}

function uploadVideoBase64ToDriveGS(base64Data, filePrefix, mimeType, folderId) {
  var folder = getOrCreateAudioFolder(folderId || "1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA");
  var cleanBase64 = String(base64Data || "");
  if (cleanBase64.indexOf("base64,") !== -1) {
    cleanBase64 = cleanBase64.split("base64,")[1];
  }
  var resolvedMime = String(mimeType || "application/octet-stream");
  var ext = ".bin";
  if (resolvedMime.indexOf("png") !== -1) ext = ".png";
  else if (resolvedMime.indexOf("jpeg") !== -1 || resolvedMime.indexOf("jpg") !== -1) ext = ".jpg";
  else if (resolvedMime.indexOf("image/") === 0) ext = ".jpg";
  else if (resolvedMime.indexOf("webm") !== -1) ext = ".webm";
  else if (resolvedMime.indexOf("wav") !== -1) ext = ".wav";
  else if (resolvedMime.indexOf("audio/") === 0) ext = ".mp3";
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy-MM-dd_HH-mm-ss");
  var safePrefix = String(filePrefix || "video_media").replace(/[/\\?%*:|"<>]/g, "_");
  var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), resolvedMime, safePrefix + "_" + stamp + ext);
  var file;
  try {
    file = folder.createFile(blob);
  } catch (e) {
    file = DriveApp.getRootFolder().createFile(blob);
  }
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (sErr) {}
  var fid = file.getId();
  if (resolvedMime.indexOf("image/") === 0) {
    return "https://drive.google.com/uc?export=view&id=" + fid;
  }
  return "https://drive.google.com/uc?export=download&id=" + fid;
}

function readVideoLessonsListGS(ss) {
  var sheet = getVideoQuestionsSheet(ss);
  var lastR = sheet.getLastRow();
  var lessons = [];
  if (lastR <= 1) return lessons;
  var rows = sheet.getRange(2, 1, lastR - 1, Math.max(18, sheet.getLastColumn())).getValues();
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var lid = String(row[0] || "").trim();
    var title = String(row[2] || "").trim();
    var vUrl = String(row[4] || "").trim();
    if (!lid && !title && !vUrl) continue;
    var qs = [];
    var aqs = [];
    try { if (row[16]) qs = JSON.parse(String(row[16])); } catch (e) {}
    try { if (row[17]) aqs = JSON.parse(String(row[17])); } catch (e) {}
    lessons.push({
      id: lid || ("video-row-" + (r + 2)),
      rowIndex: r + 2,
      topic: String(row[1] || "دروس الفيديو التفاعلي").trim(),
      title: title || ("درس فيديو " + (r + 1)),
      instruction: String(row[3] || "").trim(),
      videoUrl: vUrl,
      explainSound: String(row[5] || "").trim(),
      image: String(row[6] || "").trim(),
      showResult: String(row[7] || "نعم").trim() === "لا" ? "لا" : "نعم",
      allowRecording: String(row[8] || "نعم").trim() === "لا" ? "لا" : "نعم",
      maxRecordingTime: Number(row[9]) || 60,
      allowUpload: String(row[10] || "نعم").trim() === "لا" ? "لا" : "نعم",
      uploadTitle: String(row[11] || "").trim(),
      retryCount: row[12] !== "" && row[12] !== null && row[12] !== undefined ? Number(row[12]) : 1,
      startDate: String(row[13] || "").trim(),
      endDate: String(row[14] || "").trim(),
      expireAfterDays: row[15] !== "" && row[15] !== null && row[15] !== undefined ? Number(row[15]) : "",
      questions: Array.isArray(qs) ? qs : [],
      audioQuestions: Array.isArray(aqs) ? aqs : []
    });
  }
  return lessons;
}

function readVideoCorrectionsListGS(ss, filterId, filterName) {
  var sheet = getVideoCorrectionsSheet(ss);
  var lastR = sheet.getLastRow();
  var list = [];
  if (lastR <= 1) return list;
  var rows = sheet.getRange(2, 1, lastR - 1, Math.max(15, sheet.getLastColumn())).getValues();
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    var cTitle = String(row[0] || "").trim();
    var cId = String(row[1] || "").trim();
    var cName = String(row[2] || "").trim();
    if (!cTitle && !cId && !cName) continue;
    if (filterId || filterName) {
      var matchId = filterId && cId === filterId;
      var matchName = (!filterId || !cId) && filterName && cName === filterName;
      if (!matchId && !matchName) continue;
    }
    var addImgs = [];
    var tAudios = [];
    var tVideos = [];
    try { if (row[6]) addImgs = JSON.parse(String(row[6])); } catch (e) {}
    try { if (row[11]) tAudios = JSON.parse(String(row[11])); } catch (e) {}
    try { if (row[12]) tVideos = JSON.parse(String(row[12])); } catch (e) {}
    list.push({
      lessonTitle: cTitle,
      studentId: cId,
      studentName: cName,
      imageStatus: String(row[3] || "").trim(),
      imageScore: String(row[4] || "").trim(),
      correctedImage: String(row[5] || "").trim(),
      additionalImages: Array.isArray(addImgs) ? addImgs : [],
      imageDate: String(row[7] || "").trim(),
      imageNotes: String(row[8] || "").trim(),
      audioStatus: String(row[9] || "").trim(),
      audioScore: String(row[10] || "").trim(),
      teacherAudios: Array.isArray(tAudios) ? tAudios : [],
      teacherVideos: Array.isArray(tVideos) ? tVideos : [],
      audioDate: String(row[13] || "").trim(),
      audioNotes: String(row[14] || "").trim()
    });
  }
  return list;
}

function saveWritingRewardBase64ToDrive(imageBase64, filePrefix) {
  var folder = getOrCreateAudioFolder(AR_REWARDS_DRIVE_FOLDER_ID);
  var markerIdx = imageBase64.indexOf("base64,");
  var headerPart = markerIdx !== -1 ? imageBase64.slice(0, markerIdx) : "";
  var cleanBase64 = markerIdx !== -1 ? imageBase64.slice(markerIdx + 7) : imageBase64;
  var isSvg = headerPart.indexOf("svg") !== -1;
  var isWebp = headerPart.indexOf("webp") !== -1;
  var isJpeg = headerPart.indexOf("jpeg") !== -1 || headerPart.indexOf("jpg") !== -1;
  var mime = isSvg ? "image/svg+xml" : isWebp ? "image/webp" : isJpeg ? "image/jpeg" : "image/png";
  var ext = isSvg ? "svg" : isWebp ? "webp" : isJpeg ? "jpg" : "png";
  var decoded = Utilities.base64Decode(cleanBase64);
  var fileName = (filePrefix || "ar_reward") + "_" + Utilities.formatDate(new Date(), "GMT+3", "yyyyMMdd_HHmmss") + "." + ext;
  var blob = Utilities.newBlob(decoded, mime, fileName);
  var file;
  try {
    file = folder.createFile(blob);
  } catch (e) {
    file = DriveApp.getRootFolder().createFile(blob);
  }
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (sErr) {}
  return {
    fileId: file.getId(),
    imageUrl: "https://lh3.googleusercontent.com/d/" + file.getId()
  };
}

function parseRetryLimitSettingGS(rawStr) {
  var s = String(rawStr || "").trim().toLowerCase();
  if (!s) return { allowRetry: true, maxRetries: 3 };
  if (s.indexOf("منع الإعادة") !== -1 || s.indexOf("منع الاعادة") !== -1 || s.indexOf("لا إعادة") !== -1 || s.indexOf("no_retry") !== -1 || s === "false" || s.indexOf(",منع") !== -1) {
    return { allowRetry: false, maxRetries: 0 };
  }
  if (s.indexOf("غير محدود") !== -1 || s.indexOf("مفتوح") !== -1 || s.indexOf("unlimited") !== -1) {
    return { allowRetry: true, maxRetries: -1 };
  }
  var m = s.match(/(?:إعادة|اعادة|محاولات|retry)\\s*[:=]?\\s*(\\d+)/);
  if (m) {
    var n = parseInt(m[1], 10);
    if (!isNaN(n)) return { allowRetry: n > 0, maxRetries: Math.max(0, n) };
  }
  return { allowRetry: true, maxRetries: 3 };
}

// =========================================================================
// دوال مساعدة لقسم المجموعات والجدول اليومي للدورة (ورقتان مستقلتان تماماً)
// =========================================================================
function getScheduleGroupsSheet(ss) {
  var sheet = ss.getSheetByName(SCHEDULE_GROUPS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULE_GROUPS_SHEET_NAME);
    var headers = ["ID المجموعة", "اسم المجموعة", "الوصف", "الدروس المختارة JSON", "تاريخ الإنشاء", "ID البرنامج"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < 6) {
    sheet.getRange(1, 6).setValue("ID البرنامج").setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
  }
  return sheet;
}

function getScheduleDaysSheet(ss) {
  var sheet = ss.getSheetByName(SCHEDULE_DAYS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULE_DAYS_SHEET_NAME);
    var headers = ["معرف اليوم", "التاريخ", "نوع اليوم", "ID المجموعة", "عنوان مخصص", "ملاحظات", "إعدادات الجدول JSON", "ID البرنامج", "وقت الحصة", "المدة (دقيقة)"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    if (sheet.getLastColumn() < 8) {
      sheet.getRange(1, 8).setValue("ID البرنامج").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    }
    if (sheet.getLastColumn() < 10) {
      sheet.getRange(1, 9).setValue("وقت الحصة").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
      sheet.getRange(1, 10).setValue("المدة (دقيقة)").setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    }
  }
  return sheet;
}

function formatSheetDateISO(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT+3", "yyyy-MM-dd");
  }
  var s = String(val).trim();
  var m = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  return s;
}

function formatSheetTimeHHmmGS(val, tz) {
  if (val === undefined || val === null || val === "") return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, tz || Session.getScriptTimeZone() || "Asia/Bangkok", "HH:mm");
  }
  var s = String(val).trim();
  var m = s.match(/^(\\d{1,2}):(\\d{2})/);
  if (m) return ("0" + m[1]).slice(-2) + ":" + m[2];
  return "";
}

function parseScheduleGroupIdsGS(rawVal) {
  if (Array.isArray(rawVal)) {
    return rawVal.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
  }
  var s = String(rawVal || "").trim();
  if (!s) return [];
  if (s.charAt(0) === "[") {
    try {
      var arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        return arr.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
      }
    } catch (e) {}
  }
  return s.split(",").map(function (v) { return String(v || "").trim(); }).filter(Boolean);
}

function readCourseScheduleGS(ss) {
  var gSheet = ss.getSheetByName(SCHEDULE_GROUPS_SHEET_NAME);
  var dSheet = ss.getSheetByName(SCHEDULE_DAYS_SHEET_NAME);
  var groups = [];
  var days = [];
  var settings = { lockFutureDays: true, courseTitle: "جدول الدورة اليومي" };
  var programs = [];

  if (gSheet && gSheet.getLastRow() > 1) {
    var gRows = gSheet.getRange(2, 1, gSheet.getLastRow() - 1, Math.max(6, gSheet.getLastColumn())).getValues();
    for (var i = 0; i < gRows.length; i++) {
      var r = gRows[i];
      var gid = String(r[0] || "").trim();
      var gname = String(r[1] || "").trim();
      if (!gid && !gname) continue;
      var lessonsArr = [];
      try { if (r[3]) lessonsArr = JSON.parse(String(r[3])); } catch (e) {}
      groups.push({
        id: gid || ("grp_" + (i + 1)),
        name: gname || ("مجموعة " + (i + 1)),
        description: String(r[2] || "").trim(),
        lessons: Array.isArray(lessonsArr) ? lessonsArr : [],
        createdAt: String(r[4] || "").trim(),
        programId: String(r[5] || "").trim() || "prog_default"
      });
    }
  }

  if (dSheet && dSheet.getLastRow() > 1) {
    var dCols = Math.max(10, dSheet.getLastColumn());
    var dRows = dSheet.getRange(2, 1, dSheet.getLastRow() - 1, dCols).getValues();
    for (var j = 0; j < dRows.length; j++) {
      var dr = dRows[j];
      if (j === 0 && dr[6]) {
        try {
          var parsedSettings = JSON.parse(String(dr[6]));
          if (parsedSettings && typeof parsedSettings === "object") {
            settings = parsedSettings;
            if (Array.isArray(parsedSettings.programs)) {
              programs = parsedSettings.programs;
            }
          }
        } catch (se) {}
      }
      var did = String(dr[0] || "").trim();
      var dDate = formatSheetDateISO(dr[1]);
      if (!dDate && did === "__SETTINGS__") continue;
      if (!dDate) continue;
      var gIds = parseScheduleGroupIdsGS(dr[3]);
      var dayStartTime = formatSheetTimeHHmmGS(dr[8], ss.getSpreadsheetTimeZone());
      var dayDur = dr[9] !== "" && dr[9] !== null && dr[9] !== undefined ? Number(dr[9]) : undefined;
      days.push({
        id: did || ("day_" + dDate),
        date: dDate,
        dayType: String(dr[2] || "lesson").trim(),
        groupIds: gIds,
        groupId: gIds[0] || "",
        customTitle: String(dr[4] || "").trim(),
        notes: String(dr[5] || "").trim(),
        programId: String(dr[7] || "").trim() || "prog_default",
        startTime: dayStartTime || undefined,
        durationMinutes: (dayDur && !isNaN(dayDur)) ? dayDur : undefined
      });
    }
  }

  return { groups: groups, days: days, settings: settings, programs: programs };
}

function writeCourseScheduleGS(ss, payload) {
  var gSheet = getScheduleGroupsSheet(ss);
  var dSheet = getScheduleDaysSheet(ss);
  var groups = Array.isArray(payload.groups) ? payload.groups : [];
  var days = Array.isArray(payload.days) ? payload.days : [];
  var programs = Array.isArray(payload.programs) ? payload.programs : (payload.settings && Array.isArray(payload.settings.programs) ? payload.settings.programs : []);
  var settings = payload.settings || { lockFutureDays: true, courseTitle: "جدول الدورة اليومي" };
  var settingsPayload = {
    lockFutureDays: settings.lockFutureDays !== undefined ? Boolean(settings.lockFutureDays) : true,
    courseTitle: String(settings.courseTitle || "جدول الدورة اليومي"),
    defaultStartTime: formatSheetTimeHHmmGS(settings.defaultStartTime, "") || "",
    durationMinutes: settings.durationMinutes ? Number(settings.durationMinutes) : 60,
    timezone: String(settings.timezone || ""),
    graceMinutes: settings.graceMinutes !== undefined ? Number(settings.graceMinutes) : 10,
    reminderMinutesBefore: settings.reminderMinutesBefore !== undefined ? Number(settings.reminderMinutesBefore) : 15,
    absenceGraceMinutes: settings.absenceGraceMinutes !== undefined ? Number(settings.absenceGraceMinutes) : 30,
    autoSendReminders: Boolean(settings.autoSendReminders),
    autoMarkAbsent: Boolean(settings.autoMarkAbsent),
    programs: programs
  };

  if (gSheet.getLastRow() > 1) {
    gSheet.getRange(2, 1, gSheet.getLastRow() - 1, Math.max(6, gSheet.getLastColumn())).clearContent();
  }
  if (groups.length > 0) {
    var gValues = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      gValues.push([
        String(g.id || ("grp_" + (i + 1))),
        String(g.name || ""),
        String(g.description || ""),
        JSON.stringify(Array.isArray(g.lessons) ? g.lessons : []),
        String(g.createdAt || ""),
        String(g.programId || "prog_default")
      ]);
    }
    gSheet.getRange(2, 1, gValues.length, 6).setValues(gValues);
  }

  if (dSheet.getLastRow() > 1) {
    dSheet.getRange(2, 1, dSheet.getLastRow() - 1, Math.max(10, dSheet.getLastColumn())).clearContent();
  }
  var dValues = [];
  if (days.length > 0) {
    for (var j = 0; j < days.length; j++) {
      var d = days[j];
      var dayGIds = Array.isArray(d.groupIds) ? d.groupIds : parseScheduleGroupIdsGS(d.groupId);
      dValues.push([
        String(d.id || ("day_" + (j + 1))),
        String(d.date || ""),
        String(d.dayType || "lesson"),
        dayGIds.length > 0 ? JSON.stringify(dayGIds) : "",
        String(d.customTitle || ""),
        String(d.notes || ""),
        j === 0 ? JSON.stringify(settingsPayload) : "",
        String(d.programId || "prog_default"),
        formatSheetTimeHHmmGS(d.startTime, "") || "",
        d.durationMinutes ? Number(d.durationMinutes) : ""
      ]);
    }
  } else {
    dValues.push(["__SETTINGS__", "", "", "", "", "", JSON.stringify(settingsPayload), "", "", ""]);
  }
  dSheet.getRange(2, 1, dValues.length, 10).setValues(dValues);
}

// =========================================================================
// دوال مساعدة لقسم تأكيد حضور الحصة (ورقة مستقلة تماماً: سجل_الحضور)
// =========================================================================
function getAttendanceSheetGS(ss) {
  var sheet = ss.getSheetByName(ATTENDANCE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ATTENDANCE_SHEET_NAME);
    var headers = ["التاريخ", "الوقت", "ID المشترك", "اسم المشترك", "الحصة / المجموعات", "نوع اليوم", "الموقع", "معرف الجهاز", "وقت التسجيل", "الحالة", "فرق الدقائق", "موعد الحصة", "ID البرنامج"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#065f46").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < 13) {
    var extraHeaders = ["الحالة", "فرق الدقائق", "موعد الحصة", "ID البرنامج"];
    for (var eh = 0; eh < extraHeaders.length; eh++) {
      var colIdx = 10 + eh;
      if (colIdx > sheet.getLastColumn() || !String(sheet.getRange(1, colIdx).getValue() || "").trim()) {
        sheet.getRange(1, colIdx).setValue(extraHeaders[eh]).setBackground("#065f46").setFontColor("#ffffff").setFontWeight("bold");
      }
    }
  }
  return sheet;
}

function parseHHmmToMinutesGS(hhmm) {
  var s = String(hhmm || "").trim();
  var m = s.match(/^(\\d{1,2}):(\\d{2})/);
  if (!m) return null;
  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function evalAttendanceTimingGS(checkInTime, scheduledTime, graceMinutes) {
  var schedMin = parseHHmmToMinutesGS(scheduledTime);
  var checkMin = parseHHmmToMinutesGS(checkInTime);
  var grace = (graceMinutes !== undefined && graceMinutes !== null && !isNaN(Number(graceMinutes))) ? Math.max(0, Number(graceMinutes)) : 10;
  if (schedMin === null || checkMin === null) {
    return { status: "on_time", minutesDelta: 0, scheduledTime: formatSheetTimeHHmmGS(scheduledTime, "") || "" };
  }
  var delta = checkMin - schedMin;
  var st = "on_time";
  if (delta < 0) st = "early";
  else if (delta <= grace) st = "on_time";
  else st = "late";
  return { status: st, minutesDelta: delta, scheduledTime: formatSheetTimeHHmmGS(scheduledTime, "") };
}

function getAttendanceStatusLabelArGS(status, minutesDelta) {
  var dAbs = Math.abs(Number(minutesDelta) || 0);
  if (status === "early") return "حاضر مبكراً" + (dAbs > 0 ? (" (-" + dAbs + " د)") : "");
  if (status === "late") return "متأخر" + (dAbs > 0 ? (" (+" + dAbs + " د)") : "");
  if (status === "absent") return "غائب";
  return "حاضر في الموعد";
}

function readAttendanceRecordsGS(ss, filterStudentId, filterDate) {
  var sheet = getAttendanceSheetGS(ss);
  var lastR = sheet.getLastRow();
  var list = [];
  if (lastR <= 1) return list;
  var colCount = Math.max(13, sheet.getLastColumn());
  var rows = sheet.getRange(2, 1, lastR - 1, colCount).getValues();
  var cleanFilterId = filterStudentId ? normRegDigitsGS(filterStudentId) : "";
  var cleanFilterDate = filterDate ? formatSheetDateISO(filterDate) : "";

  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    var rDate = formatSheetDateISO(r[0]);
    var rId = normRegDigitsGS(r[2]);
    if (!rDate && !rId) continue;
    if (cleanFilterId && rId !== cleanFilterId) continue;
    if (cleanFilterDate && rDate !== cleanFilterDate) continue;
    var rawTime = r[1];
    var rTime = "";
    if (Object.prototype.toString.call(rawTime) === "[object Date]" && !isNaN(rawTime.getTime())) {
      rTime = Utilities.formatDate(rawTime, Session.getScriptTimeZone() || "Asia/Bangkok", "HH:mm");
    } else {
      rTime = String(rawTime || "").trim();
    }
    var rStatus = String(r[9] || "on_time").trim();
    if (rStatus !== "early" && rStatus !== "on_time" && rStatus !== "late" && rStatus !== "absent") {
      rStatus = "on_time";
    }
    var rDelta = (r[10] !== "" && r[10] !== null && r[10] !== undefined && !isNaN(Number(r[10]))) ? Number(r[10]) : undefined;
    var rSchedTime = formatSheetTimeHHmmGS(r[11], ss.getSpreadsheetTimeZone ? ss.getSpreadsheetTimeZone() : "") || "";
    list.push({
      rowNumber: i + 2,
      date: rDate,
      time: rTime,
      studentId: rId,
      studentName: String(r[3] || "").trim(),
      sessionTitle: String(r[4] || "").trim(),
      dayType: String(r[5] || "lesson").trim(),
      location: String(r[6] || "").trim(),
      deviceId: String(r[7] || "").trim(),
      createdAt: String(r[8] || "").trim(),
      status: rStatus,
      minutesDelta: rDelta,
      scheduledTime: rSchedTime || undefined,
      programId: String(r[12] || "").trim() || undefined,
      syncedToSheets: true
    });
  }
  return list;
}

function runAttendanceSchedulerGS(ss, overrideNow) {
  var sched = readCourseScheduleGS(ss);
  var tgCfg = readTelegramConfigGS(ss);
  var programs = Array.isArray(sched.programs) && sched.programs.length > 0
    ? sched.programs
    : [{ id: "prog_default", name: "البرنامج الافتراضي", isDefault: true, settings: sched.settings || {} }];
  var defaultProgId = programs[0].id || "prog_default";
  for (var pi = 0; pi < programs.length; pi++) {
    if (programs[pi].isDefault) {
      defaultProgId = programs[pi].id;
      break;
    }
  }
  var allRegs = readAllRegistrantsGS(getIDRegistrantsSheet(ss));
  var attSheet = getAttendanceSheetGS(ss);
  var scriptProps = PropertiesService.getScriptProperties();
  var remindersSent = 0;
  var absencesMarked = 0;
  var adminSummariesSent = 0;
  var details = [];

  for (var i = 0; i < programs.length; i++) {
    var prog = programs[i];
    var pSet = (prog && prog.settings) ? prog.settings : (sched.settings || {});
    var tz = (overrideNow && overrideNow.timezone) ? String(overrideNow.timezone).trim() : (String(pSet.timezone || "").trim() || ss.getSpreadsheetTimeZone() || "Asia/Bangkok");
    var nowObj = new Date();
    var todayISO = (overrideNow && overrideNow.date) ? formatSheetDateISO(overrideNow.date) : Utilities.formatDate(nowObj, tz, "yyyy-MM-dd");
    var nowHHmm = (overrideNow && overrideNow.time) ? formatSheetTimeHHmmGS(overrideNow.time, tz) : Utilities.formatDate(nowObj, tz, "HH:mm");
    var nowMins = parseHHmmToMinutesGS(nowHHmm);
    if (nowMins === null) continue;

    // البحث عن حصة اليوم لهذا البرنامج
    var todayDay = null;
    for (var di = 0; di < sched.days.length; di++) {
      var dItem = sched.days[di];
      var dPid = String(dItem.programId || defaultProgId).trim();
      if (dItem.date === todayISO && dPid === prog.id) {
        todayDay = dItem;
        break;
      }
    }
    if (!todayDay) continue;

    var effStart = formatSheetTimeHHmmGS(todayDay.startTime || pSet.defaultStartTime || "", tz);
    if (!effStart) continue;
    var startMins = parseHHmmToMinutesGS(effStart);
    if (startMins === null) continue;

    var effDuration = Number(todayDay.durationMinutes || pSet.durationMinutes || 60) || 60;
    var remBefore = (pSet.reminderMinutesBefore !== undefined && pSet.reminderMinutesBefore !== null) ? Number(pSet.reminderMinutesBefore) : 15;
    var absGrace = (pSet.absenceGraceMinutes !== undefined && pSet.absenceGraceMinutes !== null) ? Number(pSet.absenceGraceMinutes) : 30;

    var sessionTitle = String(todayDay.customTitle || "").trim();
    if (!sessionTitle) {
      var gNames = [];
      var gIds = Array.isArray(todayDay.groupIds) ? todayDay.groupIds : [];
      for (var gi = 0; gi < gIds.length; gi++) {
        for (var gj = 0; gj < sched.groups.length; gj++) {
          if (sched.groups[gj].id === gIds[gi]) {
            gNames.push(sched.groups[gj].name);
            break;
          }
        }
      }
      sessionTitle = gNames.length > 0 ? gNames.join(" + ") : "حصة اليوم";
    }

    // المشتركون التابعون لهذا البرنامج والمفعلون
    var progStudents = [];
    for (var ri = 0; ri < allRegs.length; ri++) {
      var st = allRegs[ri];
      if (isRegistrantDisabledGS(st.status)) continue;
      var stPid = String(st.programId || defaultProgId).trim() || defaultProgId;
      if (stPid === prog.id) progStudents.push(st);
    }

    // 1. إرسال التذكير التلقائي قبل الحصة
    var remFlagKey = "ATT_REM_" + prog.id + "_" + todayISO;
    var alreadyReminded = scriptProps.getProperty(remFlagKey) === "1";
    var remWindowStart = startMins - Math.max(0, remBefore);
    var remWindowEnd = startMins + 30;
    if (pSet.autoSendReminders && !alreadyReminded && nowMins >= remWindowStart && nowMins <= remWindowEnd && tgCfg.enabled && tgCfg.botToken) {
      var sentHere = 0;
      for (var si = 0; si < progStudents.length; si++) {
        var stu = progStudents[si];
        var stuChat = findStudentTelegramChatIdGS(ss, stu.id, stu.name);
        if (!stuChat) continue;
        var remMsgObj = renderTelegramTemplateGS(ss, tgCfg, "student_class_reminder", {
          studentName: stu.name,
          studentId: stu.id,
          programName: prog.name,
          sessionTitle: sessionTitle,
          scheduledTime: effStart,
          date: todayISO
        });
        if (remMsgObj.enabled && sendTelegramBotMessageGS(ss, stuChat, remMsgObj.text, "").ok) {
          sentHere++;
          remindersSent++;
        }
      }
      scriptProps.setProperty(remFlagKey, "1");
      details.push(prog.name + ": تم إرسال " + sentHere + " تذكير حصة");
    }

    // 2. التسجيل التلقائي للغياب بعد انتهاء الحصة وفترة السماح
    var absFlagKey = "ATT_ABS_" + prog.id + "_" + todayISO;
    var alreadyAbsDone = scriptProps.getProperty(absFlagKey) === "1";
    var absCutoffMins = startMins + effDuration + Math.max(0, absGrace);
    if (pSet.autoMarkAbsent && !alreadyAbsDone && nowMins >= absCutoffMins) {
      var todayAttList = readAttendanceRecordsGS(ss, "", todayISO);
      var checkedInIds = {};
      for (var ai = 0; ai < todayAttList.length; ai++) {
        checkedInIds[todayAttList[ai].studentId] = true;
      }
      var absentNames = [];
      var createdStamp = Utilities.formatDate(nowObj, tz, "yyyy/MM/dd HH:mm:ss");
      for (var si2 = 0; si2 < progStudents.length; si2++) {
        var astu = progStudents[si2];
        if (checkedInIds[astu.id]) continue;
        attSheet.appendRow([
          todayISO,
          effStart,
          astu.id,
          astu.name,
          sessionTitle,
          todayDay.dayType || "lesson",
          "تلقائي (غياب)",
          "scheduler",
          createdStamp,
          "absent",
          0,
          effStart,
          prog.id
        ]);
        absencesMarked++;
        absentNames.push("• " + astu.name + " (ID: " + astu.id + ")");
        if (tgCfg.enabled && tgCfg.botToken) {
          var astuChat = findStudentTelegramChatIdGS(ss, astu.id, astu.name);
          if (astuChat) {
            var absMsgObj = renderTelegramTemplateGS(ss, tgCfg, "student_attendance_absent", {
              studentName: astu.name,
              studentId: astu.id,
              programName: prog.name,
              sessionTitle: sessionTitle,
              scheduledTime: effStart,
              date: todayISO
            });
            if (absMsgObj.enabled) {
              sendTelegramBotMessageGS(ss, astuChat, absMsgObj.text, "");
            }
          }
        }
      }
      if (tgCfg.enabled && tgCfg.botToken && tgCfg.adminChatId && absentNames.length > 0) {
        var sumObj = renderTelegramTemplateGS(ss, tgCfg, "admin_daily_absence_summary", {
          programName: prog.name,
          sessionTitle: sessionTitle,
          date: todayISO,
          scheduledTime: effStart,
          absentCount: absentNames.length,
          absentList: absentNames.join("\\n")
        });
        if (sumObj.enabled && sendTelegramBotMessageGS(ss, tgCfg.adminChatId, sumObj.text, "").ok) {
          adminSummariesSent++;
        }
      }
      scriptProps.setProperty(absFlagKey, "1");
      details.push(prog.name + ": تم تسجيل " + absentNames.length + " حالة غياب");
    }
  }

  return {
    remindersSent: remindersSent,
    absencesMarked: absencesMarked,
    adminSummariesSent: adminSummariesSent,
    details: details
  };
}

// =========================================================================
// دوال مساعدة لقسم محتوى الصفحة الرئيسية الديناميكي (ورقة محتوى_الرئيسية)
// =========================================================================
function getHomeContentSheetGS(ss) {
  var sheet = ss.getSheetByName(HOME_CONTENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HOME_CONTENT_SHEET_NAME);
    var headers = [
      "ID", "النوع (announcement/slideshow/video/link)", "العنوان", "النص / الوصف",
      "رابط الوسائط / الفيديو", "الرابط التفاعلي", "نص الزر", "الوسم", "اللون",
      "مفعّل", "الترتيب", "الشرائح JSON", "البرامج المستهدفة JSON"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#312e81").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else {
    try {
      var m1 = String(sheet.getRange(1, 13).getValue() || "").trim();
      if (!m1) {
        sheet.getRange(1, 13).setValue("البرامج المستهدفة JSON").setBackground("#312e81").setFontColor("#ffffff").setFontWeight("bold");
      }
    } catch (e) {}
  }
  return sheet;
}

function readHomeContentBlocksGS(ss) {
  var sheet = ss.getSheetByName(HOME_CONTENT_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var colCount = Math.max(13, sheet.getLastColumn());
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colCount).getValues();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var bId = String(r[0] || "").trim();
    var bTitle = String(r[2] || "").trim();
    var bBody = String(r[3] || "").trim();
    var bMedia = String(r[4] || "").trim();
    var bLink = String(r[5] || "").trim();
    var slidesArr = [];
    try { if (r[11]) slidesArr = JSON.parse(String(r[11])); } catch (e) {}
    if (!bId && !bTitle && !bBody && !bMedia && !bLink && slidesArr.length === 0) continue;
    var rawEnabled = String(r[9] === undefined || r[9] === null || r[9] === "" ? "true" : r[9]).trim().toLowerCase();
    var isEnabled = rawEnabled !== "false" && rawEnabled !== "0" && rawEnabled !== "لا" && rawEnabled !== "no";
    var progIdsArr = [];
    var rawProgCell = r[12] !== undefined && r[12] !== null ? String(r[12]).trim() : "";
    if (rawProgCell && rawProgCell !== "all" && rawProgCell !== "الكل") {
      if (rawProgCell.charAt(0) === "[") {
        try {
          var parsedPids = JSON.parse(rawProgCell);
          if (Array.isArray(parsedPids)) {
            for (var pi = 0; pi < parsedPids.length; pi++) {
              var pv = String(parsedPids[pi] || "").trim();
              if (pv && pv !== "all" && pv !== "الكل") progIdsArr.push(pv);
            }
          }
        } catch (e) {}
      } else {
        var splitPids = rawProgCell.split(",");
        for (var si = 0; si < splitPids.length; si++) {
          var sv = String(splitPids[si] || "").trim();
          if (sv && sv !== "all" && sv !== "الكل") progIdsArr.push(sv);
        }
      }
    }
    list.push({
      id: bId || ("home_blk_" + (i + 1)),
      type: String(r[1] || "announcement").trim() || "announcement",
      title: bTitle,
      body: bBody,
      mediaUrl: bMedia,
      linkUrl: bLink,
      buttonLabel: String(r[6] || "").trim(),
      badgeText: String(r[7] || "").trim(),
      accentColor: String(r[8] || "emerald").trim() || "emerald",
      enabled: isEnabled,
      sortOrder: Number(r[10]) || (i + 1),
      slides: Array.isArray(slidesArr) ? slidesArr : [],
      programIds: progIdsArr
    });
  }
  list.sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  return list;
}

function writeHomeContentBlocksGS(ss, blocks) {
  var sheet = getHomeContentSheetGS(ss);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn())).clearContent();
  }
  if (!Array.isArray(blocks) || blocks.length === 0) return;
  var rows = [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var pIds = Array.isArray(b.programIds) ? b.programIds : [];
    rows.push([
      String(b.id || ("home_blk_" + (i + 1))),
      String(b.type || "announcement"),
      String(b.title || ""),
      String(b.body || ""),
      String(b.mediaUrl || ""),
      String(b.linkUrl || ""),
      String(b.buttonLabel || ""),
      String(b.badgeText || ""),
      String(b.accentColor || "emerald"),
      b.enabled === false ? "false" : "true",
      Number(b.sortOrder) || (i + 1),
      JSON.stringify(Array.isArray(b.slides) ? b.slides : []),
      JSON.stringify(pIds)
    ]);
  }
  sheet.getRange(2, 1, rows.length, 13).setValues(rows);
}

function getPdfSettingsSheetGS(ss) {
  var sheet = ss.getSheetByName("إعدادات_PDF");
  if (!sheet) {
    sheet = ss.insertSheet("إعدادات_PDF");
    var headers = ["المفتاح", "القيمة JSON", "آخر تحديث"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e6f4ea");
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
  }
  return sheet;
}

function readPdfSettingsGS(ss) {
  var sheet = ss.getSheetByName("إعدادات_PDF");
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(3, sheet.getLastColumn())).getValues();
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] || "").trim();
    if (k === "pdf_report_settings") {
      try {
        return JSON.parse(String(rows[i][1] || "{}"));
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

function writePdfSettingsGS(ss, settingsObj) {
  var sheet = getPdfSettingsSheetGS(ss);
  var jsonStr = JSON.stringify(settingsObj || {});
  var nowStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Riyadh", "yyyy/MM/dd HH:mm:ss");
  var lastR = sheet.getLastRow();
  if (lastR >= 2) {
    var rows = sheet.getRange(2, 1, lastR - 1, 1).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim() === "pdf_report_settings") {
        sheet.getRange(i + 2, 1, 1, 3).setValues([["pdf_report_settings", jsonStr, nowStr]]);
        return;
      }
    }
  }
  sheet.appendRow(["pdf_report_settings", jsonStr, nowStr]);
}

// =========================================================================
// دوال مساعدة مستقلة تماماً للبوابة التعريفية العامة ونظام التسجيل ذي المرحلتين
// =========================================================================
var PORTAL_CONTENT_SHEET_NAME = "محتوى_البوابة_العامة";
var REG_QUESTIONS_SHEET_NAME = "أسئلة_التسجيل";
var REG_SUBMISSIONS_SHEET_NAME = "طلبات_التسجيل";
var PROGRAM_REQUESTS_SHEET_NAME = "طلبات_البرامج";

function getPortalContentSheetGS(ss) {
  var sheet = ss.getSheetByName(PORTAL_CONTENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PORTAL_CONTENT_SHEET_NAME);
    var headers = [
      "المعرف", "نوع السجل / القسم", "العنوان", "العنوان الفرعي", "الوصف والمحتوى",
      "رابط الوسائط", "الرابط الإضافي", "نص الزر", "شارة / تصنيف",
      "بيان إضافي 1", "بيان إضافي 2", "مفعّل", "الترتيب", "بيانات JSON"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#065f46").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
  }
  return sheet;
}

function readPortalDataGS(ss) {
  var sheet = ss.getSheetByName(PORTAL_CONTENT_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(14, sheet.getLastColumn())).getValues();
  var settingsObj = null;
  var items = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var id = String(row[0] || "").trim();
    var sec = String(row[1] || "").trim();
    if (!id && !sec) continue;
    if (id === "__PORTAL_SETTINGS__" || sec === "__SETTINGS__") {
      try {
        settingsObj = JSON.parse(String(row[13] || "{}"));
      } catch (e) {}
      continue;
    }
    var extra = {};
    try {
      if (row[13]) extra = JSON.parse(String(row[13])) || {};
    } catch (e) {}
    var enStr = String(row[11] === undefined || row[11] === "" ? "true" : row[11]).trim().toLowerCase();
    items.push({
      id: id || ("pitem_" + i),
      section: sec || "about",
      title: String(row[2] || "").trim(),
      titleEn: extra.titleEn || undefined,
      titleTh: extra.titleTh || undefined,
      subtitle: String(row[3] || "").trim() || undefined,
      subtitleEn: extra.subtitleEn || undefined,
      subtitleTh: extra.subtitleTh || undefined,
      description: String(row[4] || "").trim(),
      descriptionEn: extra.descriptionEn || undefined,
      descriptionTh: extra.descriptionTh || undefined,
      mediaUrl: String(row[5] || "").trim() || undefined,
      galleryImages: Array.isArray(extra.galleryImages) ? extra.galleryImages : undefined,
      thumbnailUrl: extra.thumbnailUrl || undefined,
      linkUrl: String(row[6] || "").trim() || undefined,
      linkLabel: String(row[7] || "").trim() || undefined,
      linkLabelEn: extra.linkLabelEn || undefined,
      linkLabelTh: extra.linkLabelTh || undefined,
      badgeText: String(row[8] || "").trim() || undefined,
      badgeTextEn: extra.badgeTextEn || undefined,
      badgeTextTh: extra.badgeTextTh || undefined,
      metaPrimary: String(row[9] || "").trim() || undefined,
      metaPrimaryEn: extra.metaPrimaryEn || undefined,
      metaPrimaryTh: extra.metaPrimaryTh || undefined,
      metaSecondary: String(row[10] || "").trim() || undefined,
      metaSecondaryEn: extra.metaSecondaryEn || undefined,
      metaSecondaryTh: extra.metaSecondaryTh || undefined,
      actionType: extra.actionType || undefined,
      slug: extra.slug || undefined,
      targetProgramId: extra.targetProgramId || undefined,
      enabled: !(enStr === "false" || enStr === "0" || enStr === "لا"),
      sortOrder: Number(row[12]) || (i + 1),
      showOnHome: extra.showOnHome !== undefined ? Boolean(extra.showOnHome) : undefined,
      showInStore: extra.showInStore !== undefined ? Boolean(extra.showInStore) : undefined,
      price: extra.price !== undefined && extra.price !== null && extra.price !== "" ? Number(extra.price) || 0 : undefined,
      compareAtPrice: extra.compareAtPrice ? Number(extra.compareAtPrice) : null,
      format: extra.format || undefined,
      duration: extra.duration || undefined,
      startDate: extra.startDate || undefined,
      instructor: extra.instructor || undefined,
      seatsTotal: extra.seatsTotal !== undefined && extra.seatsTotal !== null && extra.seatsTotal !== "" ? Number(extra.seatsTotal) : undefined,
      seatsLeft: extra.seatsLeft !== undefined && extra.seatsLeft !== null && extra.seatsLeft !== "" ? Number(extra.seatsLeft) : undefined,
      syllabus: Array.isArray(extra.syllabus) ? extra.syllabus : undefined,
      recommendedProductIds: Array.isArray(extra.recommendedProductIds) ? extra.recommendedProductIds : undefined
    });
  }
  items.sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  return { settings: settingsObj, items: items };
}

function writePortalDataGS(ss, dataObj) {
  var sheet = getPortalContentSheetGS(ss);
  var lastR = sheet.getLastRow();
  if (lastR > 1) {
    sheet.getRange(2, 1, lastR - 1, Math.max(14, sheet.getLastColumn())).clearContent();
  }
  var rows = [];
  if (dataObj && dataObj.settings) {
    rows.push([
      "__PORTAL_SETTINGS__",
      "__SETTINGS__",
      String(dataObj.settings.academyName || ""),
      String(dataObj.settings.academyTagline || ""),
      String(dataObj.settings.heroTitle || ""),
      String(dataObj.settings.heroMediaUrl || ""),
      String(dataObj.settings.telegramBotUsername || ""),
      String(dataObj.settings.stage1DefaultProgramId || "prog_default"),
      "",
      "",
      "",
      "true",
      0,
      JSON.stringify(dataObj.settings)
    ]);
  }
  var list = (dataObj && Array.isArray(dataObj.items)) ? dataObj.items : [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var extraObj = {
      titleEn: it.titleEn || "",
      titleTh: it.titleTh || "",
      subtitleEn: it.subtitleEn || "",
      subtitleTh: it.subtitleTh || "",
      descriptionEn: it.descriptionEn || "",
      descriptionTh: it.descriptionTh || "",
      galleryImages: Array.isArray(it.galleryImages) ? it.galleryImages : [],
      thumbnailUrl: it.thumbnailUrl || "",
      linkLabelEn: it.linkLabelEn || "",
      linkLabelTh: it.linkLabelTh || "",
      badgeTextEn: it.badgeTextEn || "",
      badgeTextTh: it.badgeTextTh || "",
      metaPrimaryEn: it.metaPrimaryEn || "",
      metaPrimaryTh: it.metaPrimaryTh || "",
      metaSecondaryEn: it.metaSecondaryEn || "",
      metaSecondaryTh: it.metaSecondaryTh || "",
      actionType: it.actionType || "",
      slug: it.slug || "",
      targetProgramId: it.targetProgramId || "",
      showOnHome: it.showOnHome !== undefined ? Boolean(it.showOnHome) : undefined,
      showInStore: it.showInStore !== undefined ? Boolean(it.showInStore) : undefined,
      price: it.price !== undefined && it.price !== null ? Number(it.price) : undefined,
      compareAtPrice: it.compareAtPrice !== undefined && it.compareAtPrice !== null ? Number(it.compareAtPrice) : null,
      format: it.format || "",
      duration: it.duration || "",
      startDate: it.startDate || "",
      instructor: it.instructor || "",
      seatsTotal: it.seatsTotal !== undefined && it.seatsTotal !== null ? Number(it.seatsTotal) : undefined,
      seatsLeft: it.seatsLeft !== undefined && it.seatsLeft !== null ? Number(it.seatsLeft) : undefined,
      syllabus: Array.isArray(it.syllabus) ? it.syllabus : undefined,
      recommendedProductIds: Array.isArray(it.recommendedProductIds) ? it.recommendedProductIds : undefined
    };
    rows.push([
      String(it.id || ("pitem_" + (i + 1))),
      String(it.section || "about"),
      String(it.title || ""),
      String(it.subtitle || ""),
      String(it.description || ""),
      String(it.mediaUrl || ""),
      String(it.linkUrl || ""),
      String(it.linkLabel || ""),
      String(it.badgeText || ""),
      String(it.metaPrimary || ""),
      String(it.metaSecondary || ""),
      it.enabled === false ? "false" : "true",
      Number(it.sortOrder) || (i + 1),
      JSON.stringify(extraObj)
    ]);
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 14).setValues(rows);
  }
}

function getRegistrationQuestionsSheetGS(ss) {
  var sheet = ss.getSheetByName(REG_QUESTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REG_QUESTIONS_SHEET_NAME);
    var headers = [
      "المعرف", "السؤال (عربي)", "السؤال (إنجليزي)", "السؤال (تايلندي)",
      "نوع الحقل", "إلزامي", "الخيارات JSON", "نص توضيحي",
      "رابط شرح", "مفعّل", "الترتيب"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
  }
  return sheet;
}

function readRegistrationQuestionsGS(ss) {
  var sheet = ss.getSheetByName(REG_QUESTIONS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return null;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(11, sheet.getLastColumn())).getValues();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var label = String(row[1] || "").trim();
    if (!label) continue;
    var opts = [];
    try {
      var parsedOpts = JSON.parse(String(row[6] || "[]"));
      if (Array.isArray(parsedOpts)) opts = parsedOpts;
    } catch (e) {
      var rawOpt = String(row[6] || "").trim();
      if (rawOpt) opts = rawOpt.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
    }
    var reqStr = String(row[5] || "").trim().toLowerCase();
    var enStr = String(row[9] === undefined || row[9] === "" ? "true" : row[9]).trim().toLowerCase();
    list.push({
      id: String(row[0] || ("q_" + (i + 1))).trim(),
      label: label,
      labelEn: String(row[2] || "").trim() || undefined,
      labelTh: String(row[3] || "").trim() || undefined,
      type: String(row[4] || "text").trim() || "text",
      required: (reqStr === "true" || reqStr === "1" || reqStr === "نعم"),
      options: opts.length > 0 ? opts : undefined,
      placeholder: String(row[7] || "").trim() || undefined,
      guideUrl: String(row[8] || "").trim() || undefined,
      enabled: !(enStr === "false" || enStr === "0" || enStr === "لا"),
      sortOrder: Number(row[10]) || (i + 1)
    });
  }
  list.sort(function(a, b) { return (a.sortOrder || 0) - (b.sortOrder || 0); });
  return list;
}

function writeRegistrationQuestionsGS(ss, questions) {
  var sheet = getRegistrationQuestionsSheetGS(ss);
  var lastR = sheet.getLastRow();
  if (lastR > 1) {
    sheet.getRange(2, 1, lastR - 1, Math.max(11, sheet.getLastColumn())).clearContent();
  }
  var list = Array.isArray(questions) ? questions : [];
  if (list.length === 0) return;
  var rows = list.map(function(q, idx) {
    return [
      String(q.id || ("q_" + (idx + 1))),
      String(q.label || ""),
      String(q.labelEn || ""),
      String(q.labelTh || ""),
      String(q.type || "text"),
      q.required ? "نعم" : "لا",
      JSON.stringify(Array.isArray(q.options) ? q.options : []),
      String(q.placeholder || ""),
      String(q.guideUrl || ""),
      q.enabled === false ? "لا" : "نعم",
      Number(q.sortOrder) || (idx + 1)
    ];
  });
  sheet.getRange(2, 1, rows.length, 11).setValues(rows);
}

function getRegistrationSubmissionsSheetGS(ss) {
  var sheet = ss.getSheetByName(REG_SUBMISSIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REG_SUBMISSIONS_SHEET_NAME);
    var headers = [
      "تاريخ التسجيل", "رقم المشترك ID", "اسم المتقدم", "البرنامج الحالي",
      "المرحلة", "الحالة", "معرف تيليغرام", "البريد الإلكتروني",
      "رقم الهاتف", "الإجابات JSON", "المرفقات JSON", "ملاحظات الإدارة"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
  }
  return sheet;
}

function readRegistrationSubmissionsGS(ss) {
  var sheet = ss.getSheetByName(REG_SUBMISSIONS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(12, sheet.getLastColumn())).getValues();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var regId = normRegDigitsGS(row[1]);
    var name = String(row[2] || "").trim();
    if (!regId && !name) continue;
    var ansObj = {};
    try { ansObj = JSON.parse(String(row[9] || "{}")); } catch (e) {}
    var attArr = [];
    try { attArr = JSON.parse(String(row[10] || "[]")); } catch (e) {}
    list.push({
      rowIndex: i + 2,
      submittedAt: String(row[0] || "").trim(),
      registrationId: regId,
      studentName: name,
      programId: String(row[3] || "prog_default").trim() || "prog_default",
      stage: String(row[4] || "stage1_default").trim() || "stage1_default",
      status: String(row[5] || "").trim(),
      telegramUsername: String(row[6] || "").trim() || undefined,
      email: String(row[7] || "").trim() || undefined,
      phone: String(row[8] || "").trim() || undefined,
      answers: (ansObj && typeof ansObj === "object") ? ansObj : {},
      attachments: Array.isArray(attArr) ? attArr : [],
      adminNotes: String(row[11] || "").trim() || undefined
    });
  }
  return list.reverse();
}

function generateNextRegistrantIdGS(regSheet, ss, mode, length) {
  var existing = readAllRegistrantsGS(regSheet);
  var maxNum = 1000;
  var used = {};
  for (var i = 0; i < existing.length; i++) {
    var clean = normRegDigitsGS(existing[i].id);
    if (clean) used[clean] = true;
    var n = parseInt(clean, 10);
    if (!isNaN(n) && n >= maxNum && n < 99999999) {
      maxNum = n;
    }
  }
  if (ss) {
    try {
      var subs = readRegistrationSubmissionsGS(ss);
      for (var j = 0; j < subs.length; j++) {
        var cleanS = normRegDigitsGS(subs[j].registrationId);
        if (cleanS) used[cleanS] = true;
      }
    } catch (subErr) {}
  }

  var idMode = String(mode || "random").trim();
  if (idMode === "sequential") {
    var nextNum = maxNum + 1;
    while (used[String(nextNum)]) {
      nextNum++;
    }
    return String(nextNum);
  }

  var safeLen = Math.min(9, Math.max(5, Number(length) || 7));
  var minVal = Math.pow(10, safeLen - 1);
  var maxVal = Math.pow(10, safeLen) - 1;
  var span = maxVal - minVal + 1;
  for (var attempt = 0; attempt < 1000; attempt++) {
    var rnd = minVal + Math.floor(Math.random() * span);
    var cand = String(rnd);
    if (!used[cand]) return cand;
  }
  return String(minVal + Math.floor(Math.random() * span));
}

function getProgramRequestsSheetGS(ss) {
  var sheet = ss.getSheetByName(PROGRAM_REQUESTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PROGRAM_REQUESTS_SHEET_NAME);
    var headers = [
      "رقم الطلب", "التاريخ والوقت", "رقم المشترك ID", "اسم المشترك",
      "البرنامج الحالي", "معرف بطاقة البرنامج", "اسم البرنامج المطلوب", "معرف البرنامج بالجدول",
      "الحالة", "وصف الحالة", "ملاحظة المشترك", "ملاحظة الإدارة", "بيانات المتجر JSON"
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1e3a8a").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
  }
  return sheet;
}

function readProgramRequestsGS(ss) {
  var sheet = ss.getSheetByName(PROGRAM_REQUESTS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(13, sheet.getLastColumn())).getValues();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var reqId = String(row[0] || "").trim();
    var regId = String(row[2] || "").trim().toUpperCase() === "NEW" ? "NEW" : normRegDigitsGS(row[2]);
    var sName = String(row[3] || "").trim();
    if (!reqId && !regId && !sName) continue;
    var extraStore = {};
    try {
      if (row[12]) extraStore = JSON.parse(String(row[12])) || {};
    } catch (e) {}
    list.push({
      rowIndex: i + 2,
      requestId: reqId || ("preq_" + (i + 1)),
      requestedAt: String(row[1] || "").trim(),
      registrationId: regId,
      studentName: sName,
      currentProgramId: String(row[4] || "").trim() || undefined,
      targetProgramCardId: String(row[5] || "").trim(),
      targetProgramTitle: String(row[6] || "").trim(),
      targetProgramId: String(row[7] || "").trim() || undefined,
      status: String(row[8] || "pending").trim() || "pending",
      statusLabel: String(row[9] || "قيد المراجعة").trim(),
      studentNote: String(row[10] || "").trim() || undefined,
      adminNotes: String(row[11] || "").trim() || undefined,
      phone: extraStore.phone || undefined,
      telegramUsername: extraStore.telegramUsername || undefined,
      paymentMethod: extraStore.paymentMethod || undefined,
      bankReference: extraStore.bankReference || undefined,
      pricePaid: extraStore.pricePaid !== undefined ? Number(extraStore.pricePaid) : undefined,
      source: extraStore.source || undefined
    });
  }
  return list.reverse();
}

// =========================================================================
// دوال مساعدة مستقلة للمتجر الإلكتروني (أوراق متجر_*)
// =========================================================================
var STORE_SETTINGS_SHEET = "متجر_الإعدادات";
var STORE_CATEGORIES_SHEET = "متجر_الأقسام";
var STORE_BANNERS_SHEET = "متجر_البانرات";
var STORE_PRODUCTS_SHEET = "متجر_المنتجات";
var STORE_CITIES_SHEET = "متجر_المدن_والشحن";
var STORE_COUPONS_SHEET = "متجر_الكوبونات";
var STORE_ORDERS_SHEET = "متجر_الطلبات";
var STORE_ORDER_ITEMS_SHEET = "متجر_تفاصيل_الطلبات";

function ensureStoreSheetGS(ss, name, headers, bgHex) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground(bgHex || "#065f46").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.setRightToLeft(true);
  }
  return sheet;
}

function storeBoolGS(v, defVal) {
  if (v === undefined || v === null || v === "") return defVal;
  var s = String(v).trim().toLowerCase();
  if (s === "false" || s === "0" || s === "لا" || s === "no") return false;
  if (s === "true" || s === "1" || s === "نعم" || s === "yes") return true;
  return Boolean(v);
}

function storeSheetToObjectsGS(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  var lastC = sheet.getLastColumn();
  if (lastC < 1) return [];
  var headers = sheet.getRange(1, 1, 1, lastC).getValues()[0];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastC).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var obj = {};
    var hasAny = false;
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c] || "").trim();
      if (!h) continue;
      obj[h] = row[c];
      if (row[c] !== "" && row[c] !== null && row[c] !== undefined) hasAny = true;
    }
    if (hasAny) out.push(obj);
  }
  return out;
}

function readStoreDataGS(ss, includeAdminOrders) {
  var stSheet = ss.getSheetByName(STORE_SETTINGS_SHEET);
  var settingsObj = null;
  if (stSheet && stSheet.getLastRow() >= 2) {
    var stRows = stSheet.getRange(2, 1, stSheet.getLastRow() - 1, Math.max(2, stSheet.getLastColumn())).getValues();
    settingsObj = {};
    for (var si = 0; si < stRows.length; si++) {
      var sk = String(stRows[si][0] || "").trim();
      if (!sk) continue;
      var sv = stRows[si][1];
      if (sk === "cod_enabled" || sk === "bank_transfer_enabled" || sk === "notify_telegram_on_order" || sk === "show_in_public_portal") {
        settingsObj[sk] = storeBoolGS(sv, true);
      } else if (sk === "default_delivery_fee" || sk === "free_shipping_min") {
        settingsObj[sk] = Number(sv) || 0;
      } else {
        settingsObj[sk] = String(sv === undefined || sv === null ? "" : sv);
      }
    }
  }

  var catObjs = storeSheetToObjectsGS(ss.getSheetByName(STORE_CATEGORIES_SHEET));
  var categories = catObjs.map(function(r, idx) {
    return {
      id: String(r.id || ("cat_" + (idx + 1))).trim(),
      name: String(r.name || "").trim(),
      slug: String(r.slug || ("cat-" + (idx + 1))).trim(),
      image_url: String(r.image_url || "").trim(),
      sort_order: Number(r.sort_order) || (idx + 1),
      is_active: storeBoolGS(r.is_active, true)
    };
  });

  var banObjs = storeSheetToObjectsGS(ss.getSheetByName(STORE_BANNERS_SHEET));
  var banners = banObjs.map(function(r, idx) {
    return {
      id: String(r.id || ("ban_" + (idx + 1))).trim(),
      title: String(r.title || ""),
      subtitle: String(r.subtitle || ""),
      image_url: String(r.image_url || ""),
      link_url: String(r.link_url || "#catalog"),
      sort_order: Number(r.sort_order) || (idx + 1),
      is_active: storeBoolGS(r.is_active, true)
    };
  });

  var prodObjs = storeSheetToObjectsGS(ss.getSheetByName(STORE_PRODUCTS_SHEET));
  var products = prodObjs.map(function(r, idx) {
    var gal = [];
    try {
      if (r.gallery_urls) {
        var pg = JSON.parse(String(r.gallery_urls));
        if (Array.isArray(pg)) gal = pg;
      }
    } catch (e) {}
    var vars = [];
    try {
      if (r.variants) {
        var pv = JSON.parse(String(r.variants));
        if (Array.isArray(pv)) vars = pv;
      }
    } catch (e) {}
    return {
      id: String(r.id || ("prod_" + (idx + 1))).trim(),
      category_id: String(r.category_id || "").trim(),
      name: String(r.name || "").trim(),
      sku: String(r.sku || "").trim(),
      description: String(r.description || ""),
      price: Number(r.price) || 0,
      compare_at_price: r.compare_at_price !== "" && r.compare_at_price !== null && r.compare_at_price !== undefined ? Number(r.compare_at_price) : null,
      stock: Number(r.stock) || 0,
      image_url: String(r.image_url || "").trim(),
      gallery_urls: gal,
      variants: vars,
      is_featured: storeBoolGS(r.is_featured, false),
      show_on_home: (r.show_on_home !== undefined && r.show_on_home !== "") ? storeBoolGS(r.show_on_home, false) : (idx < 3),
      is_active: storeBoolGS(r.is_active, true),
      created_at: String(r.created_at || new Date().toISOString())
    };
  });

  var cityObjs = storeSheetToObjectsGS(ss.getSheetByName(STORE_CITIES_SHEET));
  var cities = cityObjs.map(function(r, idx) {
    return {
      id: String(r.id || ("city_" + (idx + 1))).trim(),
      name: String(r.name || "").trim(),
      delivery_fee: Number(r.delivery_fee) || 0,
      estimated_days: String(r.estimated_days || "2 - 4 أيام"),
      free_shipping_min: Number(r.free_shipping_min) || 0,
      is_active: storeBoolGS(r.is_active, true)
    };
  });

  var coupObjs = storeSheetToObjectsGS(ss.getSheetByName(STORE_COUPONS_SHEET));
  var coupons = coupObjs.map(function(r, idx) {
    return {
      id: String(r.id || ("coup_" + (idx + 1))).trim(),
      code: String(r.code || "").trim().toUpperCase(),
      discount_type: String(r.discount_type || "percent") === "fixed" ? "fixed" : "percent",
      discount_value: Number(r.discount_value) || 0,
      min_order: Number(r.min_order) || 0,
      max_uses: Number(r.max_uses) || 0,
      used_count: Number(r.used_count) || 0,
      expires_at: String(r.expires_at || ""),
      is_active: storeBoolGS(r.is_active, true)
    };
  });

  var orders = [];
  if (includeAdminOrders) {
    var ordObjs = storeSheetToObjectsGS(ss.getSheetByName(STORE_ORDERS_SHEET));
    orders = ordObjs.map(function(r) {
      var parsedItems = [];
      try { parsedItems = JSON.parse(String(r.items_json || "[]")); } catch (e) {}
      return {
        id: String(r.id || "").trim(),
        created_at: String(r.created_at || ""),
        customer_name: String(r.customer_name || ""),
        customer_phone: String(r.customer_phone || ""),
        customer_city: String(r.customer_city || ""),
        customer_address: String(r.customer_address || ""),
        telegram_username: String(r.telegram_username || ""),
        payment_method: String(r.payment_method || "cod") === "bank_transfer" ? "bank_transfer" : "cod",
        bank_reference: String(r.bank_reference || ""),
        coupon_code: String(r.coupon_code || ""),
        discount_amount: Number(r.discount_amount) || 0,
        items: Array.isArray(parsedItems) ? parsedItems : [],
        subtotal: Number(r.subtotal) || 0,
        delivery_fee: Number(r.delivery_fee) || 0,
        total: Number(r.total) || 0,
        status: String(r.status || "pending").trim() || "pending",
        notes: String(r.notes || "")
      };
    }).reverse();
  }

  return {
    settings: settingsObj,
    categories: categories,
    banners: banners,
    products: products,
    cities: cities,
    coupons: coupons,
    orders: orders
  };
}

function writeStoreDataGS(ss, storeData) {
  if (!storeData || typeof storeData !== "object") return;

  if (storeData.settings && typeof storeData.settings === "object") {
    var stSheet = ensureStoreSheetGS(ss, STORE_SETTINGS_SHEET, ["key", "value"], "#065f46");
    if (stSheet.getLastRow() > 1) stSheet.getRange(2, 1, stSheet.getLastRow() - 1, Math.max(2, stSheet.getLastColumn())).clearContent();
    var keys = Object.keys(storeData.settings);
    if (keys.length > 0) {
      var stRows = keys.map(function(k) { return [k, String(storeData.settings[k] === undefined ? "" : storeData.settings[k])]; });
      stSheet.getRange(2, 1, stRows.length, 2).setValues(stRows);
    }
  }

  if (Array.isArray(storeData.categories)) {
    var catHeaders = ["id", "name", "slug", "image_url", "sort_order", "is_active"];
    var catSheet = ensureStoreSheetGS(ss, STORE_CATEGORIES_SHEET, catHeaders, "#0f766e");
    if (catSheet.getLastRow() > 1) catSheet.getRange(2, 1, catSheet.getLastRow() - 1, catHeaders.length).clearContent();
    if (storeData.categories.length > 0) {
      var catRows = storeData.categories.map(function(c, i) {
        return [String(c.id || ("cat_" + (i + 1))), String(c.name || ""), String(c.slug || ""), String(c.image_url || ""), Number(c.sort_order) || (i + 1), c.is_active === false ? "false" : "true"];
      });
      catSheet.getRange(2, 1, catRows.length, catHeaders.length).setValues(catRows);
    }
  }

  if (Array.isArray(storeData.banners)) {
    var banHeaders = ["id", "title", "subtitle", "image_url", "link_url", "sort_order", "is_active"];
    var banSheet = ensureStoreSheetGS(ss, STORE_BANNERS_SHEET, banHeaders, "#0f766e");
    if (banSheet.getLastRow() > 1) banSheet.getRange(2, 1, banSheet.getLastRow() - 1, banHeaders.length).clearContent();
    if (storeData.banners.length > 0) {
      var banRows = storeData.banners.map(function(b, i) {
        return [String(b.id || ("ban_" + (i + 1))), String(b.title || ""), String(b.subtitle || ""), String(b.image_url || ""), String(b.link_url || ""), Number(b.sort_order) || (i + 1), b.is_active === false ? "false" : "true"];
      });
      banSheet.getRange(2, 1, banRows.length, banHeaders.length).setValues(banRows);
    }
  }

  if (Array.isArray(storeData.products)) {
    var prodHeaders = ["id", "category_id", "name", "sku", "description", "price", "compare_at_price", "stock", "image_url", "gallery_urls", "variants", "is_featured", "show_on_home", "is_active", "created_at"];
    var prodSheet = ensureStoreSheetGS(ss, STORE_PRODUCTS_SHEET, prodHeaders, "#115e59");
    if (prodSheet.getLastRow() > 1) prodSheet.getRange(2, 1, prodSheet.getLastRow() - 1, prodHeaders.length).clearContent();
    if (storeData.products.length > 0) {
      var prodRows = storeData.products.map(function(p, i) {
        return [
          String(p.id || ("prod_" + (i + 1))),
          String(p.category_id || ""),
          String(p.name || ""),
          String(p.sku || ""),
          String(p.description || ""),
          Number(p.price) || 0,
          p.compare_at_price !== null && p.compare_at_price !== undefined ? Number(p.compare_at_price) : "",
          Number(p.stock) || 0,
          String(p.image_url || ""),
          JSON.stringify(Array.isArray(p.gallery_urls) ? p.gallery_urls : []),
          JSON.stringify(Array.isArray(p.variants) ? p.variants : []),
          p.is_featured ? "true" : "false",
          p.show_on_home ? "true" : "false",
          p.is_active === false ? "false" : "true",
          String(p.created_at || new Date().toISOString())
        ];
      });
      prodSheet.getRange(2, 1, prodRows.length, prodHeaders.length).setValues(prodRows);
    }
  }

  if (Array.isArray(storeData.cities)) {
    var cityHeaders = ["id", "name", "delivery_fee", "estimated_days", "free_shipping_min", "is_active"];
    var citySheet = ensureStoreSheetGS(ss, STORE_CITIES_SHEET, cityHeaders, "#1e3a8a");
    if (citySheet.getLastRow() > 1) citySheet.getRange(2, 1, citySheet.getLastRow() - 1, cityHeaders.length).clearContent();
    if (storeData.cities.length > 0) {
      var cityRows = storeData.cities.map(function(c, i) {
        return [String(c.id || ("city_" + (i + 1))), String(c.name || ""), Number(c.delivery_fee) || 0, String(c.estimated_days || ""), Number(c.free_shipping_min) || 0, c.is_active === false ? "false" : "true"];
      });
      citySheet.getRange(2, 1, cityRows.length, cityHeaders.length).setValues(cityRows);
    }
  }

  if (Array.isArray(storeData.coupons)) {
    var coupHeaders = ["id", "code", "discount_type", "discount_value", "min_order", "max_uses", "used_count", "expires_at", "is_active"];
    var coupSheet = ensureStoreSheetGS(ss, STORE_COUPONS_SHEET, coupHeaders, "#92400e");
    if (coupSheet.getLastRow() > 1) coupSheet.getRange(2, 1, coupSheet.getLastRow() - 1, coupHeaders.length).clearContent();
    if (storeData.coupons.length > 0) {
      var coupRows = storeData.coupons.map(function(c, i) {
        return [
          String(c.id || ("coup_" + (i + 1))),
          String(c.code || "").trim().toUpperCase(),
          String(c.discount_type || "percent"),
          Number(c.discount_value) || 0,
          Number(c.min_order) || 0,
          Number(c.max_uses) || 0,
          Number(c.used_count) || 0,
          String(c.expires_at || ""),
          c.is_active === false ? "false" : "true"
        ];
      });
      coupSheet.getRange(2, 1, coupRows.length, coupHeaders.length).setValues(coupRows);
    }
  }
}

function getStoreOrdersSheetGS(ss) {
  return ensureStoreSheetGS(ss, STORE_ORDERS_SHEET, [
    "id", "created_at", "customer_name", "customer_phone", "customer_city",
    "customer_address", "telegram_username", "payment_method", "bank_reference",
    "coupon_code", "discount_amount", "items_json", "subtotal",
    "delivery_fee", "total", "status", "notes"
  ], "#065f46");
}

function getStoreOrderItemsSheetGS(ss) {
  return ensureStoreSheetGS(ss, STORE_ORDER_ITEMS_SHEET, [
    "order_id", "created_at", "product_id", "sku", "product_name", "variant", "qty", "unit_price", "line_total"
  ], "#0f766e");
}



// 1. GET: جلب الدروس، أو بيانات ورقة الرئيسية، أو المشتركين، أو سجل إجابات الطالب من answers 1
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // (أ) إذا كان الطلب جلب بيانات ورقة "الرئيسية" ومحتوى الصفحة الرئيسية
    if (e && e.parameter && e.parameter.action === "get_home_config") {
      var hConfig = readHomeConfig(ss);
      var hContentBlocks = readHomeContentBlocksGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        homeConfig: hConfig,
        contentBlocks: hContentBlocks
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (أ-2) جلب كتل محتوى الصفحة الرئيسية فقط من ورقة "محتوى_الرئيسية"
    if (e && e.parameter && e.parameter.action === "get_home_content") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        homeContentHandled: true,
        blocks: readHomeContentBlocksGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (أ-3) جلب إعدادات تقارير PDF والشهادات من ورقة "إعدادات_PDF"
    if (e && e.parameter && e.parameter.action === "get_pdf_settings") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        pdfSettingsHandled: true,
        settings: readPdfSettingsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (أ-4) جلب بيانات البوابة العامة وأسئلة وطلبات التسجيل
    if (e && e.parameter && e.parameter.action === "get_portal_data") {
      var pData = readPortalDataGS(ss);
      var tgInfo = readTelegramConfigGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        portalData: pData,
        botUsername: tgInfo.botUsername || ""
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (e && e.parameter && e.parameter.action === "get_registration_questions") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        questions: readRegistrationQuestionsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }
    if (e && e.parameter && e.parameter.action === "get_registration_submissions") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        submissions: readRegistrationSubmissionsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && e.parameter.action === "get_program_requests") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        requests: readProgramRequestsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (أ-5) نقاط نهاية المتجر الإلكتروني عبر GET
    if (e && e.parameter && e.parameter.action === "get_store_data") {
      var stIncAdmin = String(e.parameter.includeAdminData || "") === "true";
      var tgInfoSt = readTelegramConfigGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        storeData: readStoreDataGS(ss, stIncAdmin),
        telegramConfigured: Boolean(tgInfoSt.botToken && tgInfoSt.adminChatId),
        botUsername: tgInfoSt.botUsername || ""
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ب) إذا كان الطلب جلب سجل تقييمات وإجابات طالب معين من ورقة "answers 1"
    if (e && e.parameter && e.parameter.action === "get_student_history") {
      var ansSheet = getAnswers1Sheet(ss);
      var qId = String(e.parameter.studentId || "").trim();
      var qName = String(e.parameter.studentName || "").trim();
      var lastR = ansSheet.getLastRow();
      var lastC = Math.max(5, ansSheet.getLastColumn());
      var historyList = [];
      
      if (lastR > 1) {
        var dataRows = ansSheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < dataRows.length; r++) {
          var row = dataRows[r];
          var rowId = String(row[1] || "").trim();
          var rowName = String(row[2] || "").trim();
          var rowSubj = String(row[3] || "").trim();
          var rowTime = String(row[0] || "").trim();
          
          var match = (qId && rowId === qId) || (qName && rowName === qName);
          if (match) {
            // استخراج حزم التمارين الأفقية المكونة من 5 أعمدة
            for (var c = 5; c < row.length; c += 5) {
              var word = String(row[c] || "").trim();
              if (word) {
                var spoken = String(row[c + 1] || "").trim();
                var audio = String(row[c + 2] || "").trim();
                var scoreRaw = String(row[c + 3] || "").replace(/[^0-9]/g, '');
                var grade = String(row[c + 4] || "").trim();
                historyList.push({
                  id: "ans-r" + (r + 2) + "-c" + c,
                  wordId: "w-" + word,
                  word: word,
                  spokenText: spoken,
                  recordedAudioUrl: audio || undefined,
                  score: scoreRaw ? parseInt(scoreRaw) : 0,
                  grade: grade || "معتمد",
                  timestamp: rowTime ? (new Date(rowTime).getTime() || Date.now()) : Date.now(),
                  studentName: rowName || qName,
                  lessonSubject: rowSubj
                });
              }
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        studentId: qId,
        studentName: qName,
        history: historyList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ب-2) إذا كان الطلب جلب سجل درجات تمرين التوصيل لطالب معين من ورقة "answers 2"
    if (e && e.parameter && e.parameter.action === "get_student_matching_history") {
      var a2Sheet = getAnswers2Sheet(ss);
      var qId = String(e.parameter.studentId || "").trim();
      var qName = String(e.parameter.studentName || "").trim();
      var lastR = a2Sheet.getLastRow();
      var lastC = Math.max(6, a2Sheet.getLastColumn());
      var matchingList = [];

      if (lastR > 1) {
        var dataRows = a2Sheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < dataRows.length; r++) {
          var row = dataRows[r];
          var rowTime = String(row[0] || "").trim();
          var rowId = String(row[1] || "").trim();
          var rowName = String(row[2] || "").trim();
          var rowSubj = String(row[3] || "").trim();
          var rowStatus = String(row[4] || "").trim();

          var isMatch = (qId && rowId === qId) || (qName && rowName === qName);
          if (isMatch && rowSubj) {
            var exercisesArr = [];
            for (var c = 5; c < row.length; c++) {
              var cellRaw = row[c];
              var cellStr = String(cellRaw || "").trim();
              if (cellStr) {
                var normCell = cellStr.replace(/[٠-٩]/g, function(d) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); });
                var pctMatch = normCell.match(/(\d+(?:\.\d+)?)\s*[%٪]/) || normCell.match(/[%٪]\s*(\d+(?:\.\d+)?)/) || normCell.match(/=\s*(\d+(?:\.\d+)?)/);
                var pctVal = 0;
                if (pctMatch) {
                  pctVal = Math.round(parseFloat(pctMatch[1]));
                } else if (typeof cellRaw === "number" && cellRaw > 0 && cellRaw <= 1) {
                  pctVal = Math.round(cellRaw * 100);
                }
                exercisesArr.push({
                  exerciseNumber: (c - 5) + 1,
                  formulaString: cellStr,
                  percentage: pctVal
                });
              }
            }
            matchingList.push({
              id: "ans2-r" + (r + 2),
              timestamp: rowTime,
              studentId: rowId || qId,
              studentName: rowName || qName,
              lessonSubject: rowSubj,
              completionStatus: rowStatus,
              exercises: exercisesArr
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        studentId: qId,
        studentName: qName,
        matchingHistory: matchingList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ب-3) إذا كان الطلب جلب سجل درجات تمرين الإملاء لطالب معين من ورقة "answers 3"
    if (e && e.parameter && e.parameter.action === "get_student_dictation_history") {
      var a3Sheet = getAnswers3Sheet(ss);
      var qId = String(e.parameter.studentId || "").trim();
      var qName = String(e.parameter.studentName || "").trim();
      var lastR = a3Sheet.getLastRow();
      var lastC = Math.max(6, a3Sheet.getLastColumn());
      var dictList = [];

      if (lastR > 1) {
        var dataRows = a3Sheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < dataRows.length; r++) {
          var row = dataRows[r];
          var rowTime = String(row[0] || "").trim();
          var rowId = String(row[1] || "").trim();
          var rowName = String(row[2] || "").trim();
          var rowSubj = String(row[3] || "").trim();
          var rowStatus = String(row[4] || "").trim();

          var isMatch = (qId && rowId === qId) || (qName && rowName === qName);
          if (isMatch && rowSubj) {
            var exercisesArr = [];
            for (var c = 5; c < row.length; c++) {
              var cellRaw = row[c];
              var cellStr = String(cellRaw || "").trim();
              if (cellStr) {
                var normCell = cellStr.replace(/[٠-٩]/g, function(d) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); });
                var pctMatch = normCell.match(/(\d+(?:\.\d+)?)\s*[%٪]/) || normCell.match(/[%٪]\s*(\d+(?:\.\d+)?)/) || normCell.match(/=\s*(\d+(?:\.\d+)?)/);
                var pctVal = 0;
                if (pctMatch) {
                  pctVal = Math.round(parseFloat(pctMatch[1]));
                } else if (typeof cellRaw === "number" && cellRaw > 0 && cellRaw <= 1) {
                  pctVal = Math.round(cellRaw * 100);
                }
                exercisesArr.push({
                  exerciseNumber: (c - 5) + 1,
                  formulaString: cellStr,
                  percentage: pctVal
                });
              }
            }
            dictList.push({
              id: "ans3-r" + (r + 2),
              timestamp: rowTime,
              studentId: rowId || qId,
              studentName: rowName || qName,
              lessonSubject: rowSubj,
              completionStatus: rowStatus,
              exercises: exercisesArr
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        studentId: qId,
        studentName: qName,
        dictationHistory: dictList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ب-3-مكرر) إذا كان الطلب جلب سجل درجات تمرين الكتابة لطالب معين من ورقة "answers 4"
    if (e && e.parameter && e.parameter.action === "get_student_writing_history") {
      var a4Sheet = getAnswers4Sheet(ss);
      var qId = String(e.parameter.studentId || "").trim();
      var qName = String(e.parameter.studentName || "").trim();
      var lastR = a4Sheet.getLastRow();
      var lastC = Math.max(6, a4Sheet.getLastColumn());
      var writingList = [];

      if (lastR > 1) {
        var dataRows = a4Sheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < dataRows.length; r++) {
          var row = dataRows[r];
          var rowTime = String(row[0] || "").trim();
          var rowId = String(row[1] || "").trim();
          var rowName = String(row[2] || "").trim();
          var rowTopic = String(row[3] || "").trim();
          var rowStatus = String(row[4] || "").trim();

          var isMatch = (qId && rowId === qId) || (qName && rowName === qName);
          if (isMatch && rowTopic) {
            var exercisesArr = [];
            var slotNum = 1;
            for (var c = 5; c < row.length; c += 5) {
              var catStr = String(row[c] || "").trim();
              var titleStr = String(row[c + 1] || "").trim();
              var imgUrlStr = String(row[c + 2] || "").trim();
              var rawScore = row[c + 3];
              var scoreStr = String(rawScore || "").trim();
              var detailsStr = String(row[c + 4] || "").trim();
              if (titleStr || scoreStr || imgUrlStr) {
                var normScore = scoreStr.replace(/[٠-٩]/g, function(d) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); });
                var pctM = normScore.match(/(\d+(?:\.\d+)?)/);
                var pctVal = 0;
                if (typeof rawScore === "number" && rawScore > 0 && rawScore <= 1) {
                  pctVal = Math.round(rawScore * 100);
                } else if (pctM) {
                  pctVal = Math.round(parseFloat(pctM[1]));
                }
                exercisesArr.push({
                  slotIndex: slotNum,
                  category: catStr || "حروف",
                  title: titleStr,
                  imageUrl: imgUrlStr,
                  score: pctVal,
                  details: detailsStr
                });
              }
              slotNum++;
            }
            writingList.push({
              id: "ans4-r" + (r + 2),
              timestamp: rowTime,
              studentId: rowId || qId,
              studentName: rowName || qName,
              topic: rowTopic,
              completionStatus: rowStatus,
              exercises: exercisesArr
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        studentId: qId,
        studentName: qName,
        writingHistory: writingList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ب-4) جلب سجل عدد محاولات الإعادة لطالب معين من ورقة "سجل_المحاولات"
    if (e && e.parameter && e.parameter.action === "get_student_retries") {
      var rSheet = getRetriesSheet(ss);
      var qId = String(e.parameter.studentId || "").trim();
      var qName = String(e.parameter.studentName || "").trim();
      var lastR = rSheet.getLastRow();
      var retriesList = [];
      if (lastR > 1) {
        var rRows = rSheet.getRange(2, 1, lastR - 1, 6).getValues();
        for (var i = 0; i < rRows.length; i++) {
          var rowId = String(rRows[i][0] || "").trim();
          var rowName = String(rRows[i][1] || "").trim();
          var matched = (qId && rowId === qId) || ((!qId || !rowId) && qName && rowName === qName);
          if (matched) {
            retriesList.push({
              mode: String(rRows[i][2] || "").trim(),
              exerciseKey: String(rRows[i][3] || "").trim(),
              retryCount: parseInt(rRows[i][4], 10) || 0
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        retries: retriesList
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // (ج) إذا كان الطلب جلب قائمة المشتركين من ورقة "ID registrants"
    if (e && e.parameter && e.parameter.action === "get_registrants") {
      var regSheet = getIDRegistrantsSheet(ss);
      var rows = readAllRegistrantsGS(regSheet).map(function(r) {
        return { id: r.id, name: r.name, status: r.status, maxDevices: r.maxDevices, devices: r.devices };
      });
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        supportsDeviceSecurity: true,
        registrants: rows
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-2) إذا كان الطلب جلب ملخص نتائج إجابات الطلاب من ورقة "answers 1"
    if (e && e.parameter && e.parameter.action === "get_all_submissions") {
      var ansSheet = getAnswers1Sheet(ss);
      var lastR = ansSheet.getLastRow();
      var lastC = Math.max(5, ansSheet.getLastColumn());
      var submissionsList = [];
      if (lastR > 1) {
        var dataRows = ansSheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < dataRows.length; r++) {
          var row = dataRows[r];
          var rowTime = String(row[0] || "").trim();
          var rowId = String(row[1] || "").trim();
          var rowName = String(row[2] || "").trim();
          var rowSubj = String(row[3] || "").trim();
          var rowStatus = String(row[4] || "").trim();
          
          if (rowId || rowName || rowSubj) {
            var exercises = [];
            for (var c = 5; c < row.length; c += 5) {
              var word = String(row[c] || "").trim();
              if (word) {
                var spoken = String(row[c + 1] || "").trim();
                var audio = String(row[c + 2] || "").trim();
                var scoreRaw = String(row[c + 3] || "").replace(/[^0-9]/g, '');
                var grade = String(row[c + 4] || "").trim();
                exercises.push({
                  word: word,
                  spokenText: spoken,
                  audioUrl: audio,
                  score: scoreRaw ? parseInt(scoreRaw) : 0,
                  grade: grade
                });
              }
            }
            submissionsList.push({
              rowIndex: r + 2,
              timestamp: rowTime,
              studentId: rowId,
              studentName: rowName,
              lessonSubject: rowSubj,
              status: rowStatus,
              totalExercises: exercises.length,
              exercises: exercises
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        submissions: submissionsList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-3) إذا كان الطلب جلب الترجمات من ورقة "الترجمة"
    if (e && e.parameter && e.parameter.action === "get_translations") {
      var transList = readTranslations(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        translations: transList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-4) إذا كان الطلب جلب أسئلة تمرين الوصل من ورقة "وصل" (4 أعمدة لكل تمرين)
    if (e && e.parameter && e.parameter.action === "get_matching") {
      var mSheet = getMatchingSheet(ss);
      var lastR = mSheet.getLastRow();
      var lastC = Math.max(5, mSheet.getLastColumn());
      var subjectsList = [];
      if (lastR > 1) {
        var rows = mSheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var subjName = String(row[0] || "").trim();
          if (subjName) {
            var exercises = [];
            var exNum = 1;
            for (var c = 1; c < row.length; c += 4) {
              var qText = String(row[c] || "").trim();
              var rWords = String(row[c + 1] || "").trim();
              var lWords = String(row[c + 2] || "").trim();
              var sStr = String(row[c + 3] || "").trim();
              if (qText || rWords || lWords || sStr) {
                var rArr = rWords ? rWords.split("|").map(function(s){return s.trim();}).filter(Boolean) : [];
                var lArr = lWords ? lWords.split("|").map(function(s){return s.trim();}).filter(Boolean) : [];
                var pairs = [];
                var maxLen = Math.max(rArr.length, lArr.length);
                for (var p = 0; p < maxLen; p++) {
                  pairs.push({
                    id: "p-" + p,
                    rightText: rArr[p] || "",
                    leftText: lArr[p] || ""
                  });
                }
                var inputMode = sStr.indexOf("صوت فقط") !== -1 ? "voice_only" : "both";
                var lockOnMistake = sStr.indexOf("لا تراجع") !== -1 || sStr.indexOf("قفل") !== -1;
                var showMistakeFeedback = sStr.indexOf("إخفاء") === -1;
                var allowSmartReassign = (sStr.indexOf("تصحيح ذكي") !== -1 && sStr.indexOf("بدون تصحيح ذكي") === -1) || sStr.indexOf("فك ذكي") !== -1 || sStr.indexOf("تبديل الإجابة") !== -1;
                var parsedR = parseRetryLimitSettingGS(sStr);
                var durMatch = sStr.match(/(\d+)\s*ثوان/);
                var durationSeconds = durMatch ? parseInt(durMatch[1]) : 4;
                exercises.push({
                  id: "ex-" + exNum,
                  exerciseNumber: exNum,
                  questionText: qText || ("صل الكلمات المناسبة " + exNum),
                  pairs: pairs,
                  inputMode: inputMode,
                  durationSeconds: durationSeconds,
                  lockOnMistake: lockOnMistake,
                  showMistakeFeedback: showMistakeFeedback,
                  allowSmartReassign: allowSmartReassign,
                  allowRetry: parsedR.allowRetry,
                  maxRetries: parsedR.maxRetries
                });
                exNum++;
              }
            }
            subjectsList.push({
              id: "subj-" + (r + 1),
              subjectName: subjName,
              subject: subjName,
              exercises: exercises
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        subjects: subjectsList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-5) إذا كان الطلب جلب أسئلة التمرين الثالث من ورقة "كلمات" (4 أعمدة لكل تمرين)
    if (e && e.parameter && e.parameter.action === "get_dictation") {
      var wSheet = getWordsSheet(ss);
      var lastR = wSheet.getLastRow();
      var lastC = Math.max(5, wSheet.getLastColumn());
      var dictSubjects = [];
      if (lastR > 1) {
        var rows = wSheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var subjName = String(row[0] || "").trim();
          if (subjName) {
            var exercises = [];
            var exNum = 1;
            for (var c = 1; c < row.length; c += 4) {
              var qText = String(row[c] || "").trim();
              var poolStr = String(row[c + 1] || "").trim();
              var ansStr = String(row[c + 2] || "").trim();
              var setStr = String(row[c + 3] || "").trim();
              if (qText || poolStr || ansStr || setStr) {
                var parsedDictR = parseRetryLimitSettingGS(setStr);
                var durMatch = setStr.match(/(\\d+)\\s*ثوان/);
                var durationSeconds = durMatch ? parseInt(durMatch[1]) : 5;
                exercises.push({
                  id: "dict-ex-" + (r + 2) + "-" + exNum,
                  exerciseNumber: exNum,
                  questionText: qText || ("تمرين إملاء " + exNum),
                  scrambledPool: poolStr,
                  correctAnswer: ansStr,
                  settingsString: setStr,
                  durationSeconds: durationSeconds,
                  allowRetry: parsedDictR.allowRetry,
                  maxRetries: parsedDictR.maxRetries
                });
                exNum++;
              }
            }
            dictSubjects.push({
              id: "dict-subj-" + (r + 1),
              subjectName: subjName,
              subject: subjName,
              exercises: exercises
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        subjects: dictSubjects
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-6) جلب دروس التمرين الرابع (الكتابة والواقع المعزز) من ورقة "ArabicLessons"
    if (e && e.parameter && e.parameter.action === "get_writing_lessons") {
      var wlSheet = getWritingLessonsSheet(ss);
      var wlData = wlSheet.getDataRange().getValues();
      var wlLessons = [];
      for (var r = 1; r < wlData.length; r++) {
        var row = wlData[r];
        var topic = String(row[0] || "").trim();
        if (!topic) continue;
        var slotIdx = 1;
        for (var c = 1; c < row.length; c += WRITING_COLS_PER_LESSON) {
          var cat = String(row[c] || "").trim();
          var imgUrl = String(row[c + 1] || "").trim();
          var title = String(row[c + 2] || "").trim();
          var tts = String(row[c + 3] || "").trim();
          var rep = Number(row[c + 4]) || 1;
          var diff = String(row[c + 5] || "سهل").trim();
          var stepsStr = String(row[c + 6] || "").trim();
          if (title || imgUrl) {
            var parsedWritingR = parseRetryLimitSettingGS(diff);
            wlLessons.push({
              id: topic + "_" + slotIdx + "_" + (title || ("lesson_" + c)),
              topic: topic,
              category: cat || "حروف",
              imageUrl: imgUrl,
              title: title || ("درس " + slotIdx),
              arabicAudioText: tts || title || ("درس " + slotIdx),
              repeatCount: rep,
              difficulty: diff || "سهل",
              allowRetry: parsedWritingR.allowRetry,
              maxRetries: parsedWritingR.maxRetries,
              stepsData: stepsStr,
              slotIndex: slotIdx,
              colStart: c + 1
            });
          }
          slotIdx++;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        count: wlLessons.length,
        lessons: wlLessons
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-7) جلب جوائز التاج بالواقع المعزز من ورقة "AR Rewards"
    if (e && e.parameter && e.parameter.action === "get_ar_rewards") {
      var arSheet = getARRewardsSheet(ss);
      var arData = arSheet.getDataRange().getValues();
      var rewards = [];
      for (var i = 1; i < arData.length; i++) {
        var row = arData[i];
        var id = String(row[0] || "").trim();
        var title = String(row[1] || "").trim();
        var presetId = String(row[4] || "").trim();
        var imageUrl = String(row[5] || "").trim();
        if (!id && !title && !presetId && !imageUrl) continue;
        rewards.push({
          id: id || ("tier_" + i),
          title: title,
          minScore: Number(row[2]) || 0,
          maxScore: row[3] !== "" && row[3] !== null && row[3] !== undefined ? Number(row[3]) : 100,
          presetId: presetId || undefined,
          imageUrl: imageUrl,
          scaleRatio: Number(row[6]) || 1.35,
          offsetYRatio: row[7] !== "" && row[7] !== null && row[7] !== undefined ? Number(row[7]) : -0.45,
          enabled: String(row[8] !== undefined ? row[8] : "true").toLowerCase() !== "false" && String(row[8]) !== "0"
        });
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        count: rewards.length,
        rewards: rewards
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-8) جلب أسئلة التمرين الخامس (صيد) من ورقة "صيد"
    if (e && e.parameter && e.parameter.action === "get_catch") {
      var cSheet = getCatchSheet(ss);
      var lastR = cSheet.getLastRow();
      var lastC = Math.max(5, cSheet.getLastColumn());
      var catchSubjects = [];
      if (lastR > 1) {
        var rows = cSheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var subjName = String(row[0] || "").trim();
          if (subjName) {
            var exercises = [];
            var exNum = 1;
            for (var c = 1; c < row.length; c += 4) {
              var qText = String(row[c] || "").trim();
              var poolStr = String(row[c + 1] || "").trim();
              var ansStr = String(row[c + 2] || "").trim();
              var setStr = String(row[c + 3] || "").trim();
              if (qText || poolStr || ansStr || setStr) {
                var parsedCatchR = parseRetryLimitSettingGS(setStr);
                exercises.push({
                  id: "catch-ex-" + (r + 2) + "-" + exNum,
                  exerciseNumber: exNum,
                  questionText: qText || ("اصطد الحروف الصحيحة " + exNum),
                  scrambledPool: poolStr,
                  correctAnswer: ansStr,
                  settingsString: setStr,
                  lockOnMistake: setStr.indexOf("لا تراجع") !== -1 || setStr.indexOf("لا يمكن التراجع") !== -1 || setStr.indexOf("قفل") !== -1,
                  allowRetry: parsedCatchR.allowRetry,
                  maxRetries: parsedCatchR.maxRetries
                });
                exNum++;
              }
            }
            catchSubjects.push({
              id: "catch-subj-" + (r + 1),
              subjectName: subjName,
              subject: subjName,
              exercises: exercises
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        subjects: catchSubjects
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-9) جلب سجل إجابات التمرين الخامس من ورقة "اجابات صيد"
    if (e && e.parameter && e.parameter.action === "get_student_catch_history") {
      var caSheet = getCatchAnswersSheet(ss);
      var qId = String(e.parameter.studentId || "").trim();
      var qName = String(e.parameter.studentName || "").trim();
      var lastR = caSheet.getLastRow();
      var lastC = Math.max(6, caSheet.getLastColumn());
      var catchList = [];

      if (lastR > 1) {
        var dataRows = caSheet.getRange(2, 1, lastR - 1, lastC).getValues();
        for (var r = 0; r < dataRows.length; r++) {
          var row = dataRows[r];
          var rowTime = String(row[0] || "").trim();
          var rowId = String(row[1] || "").trim();
          var rowName = String(row[2] || "").trim();
          var rowSubj = String(row[3] || "").trim();
          var rowStatus = String(row[4] || "").trim();

          var isMatch = (qId && rowId === qId) || (qName && rowName === qName);
          if (isMatch && rowSubj) {
            var exercisesArr = [];
            for (var c = 5; c < row.length; c++) {
              var cellRaw = row[c];
              var cellStr = String(cellRaw || "").trim();
              if (cellStr) {
                var normCell = cellStr.replace(/[٠-٩]/g, function(d) { return String("٠١٢٣٤٥٦٧٨٩".indexOf(d)); });
                var pctMatch = normCell.match(/(\\d+(?:\\.\\d+)?)\\s*[%٪]/) || normCell.match(/[%٪]\\s*(\\d+(?:\\.\\d+)?)/) || normCell.match(/=\\s*(\\d+(?:\\.\\d+)?)/);
                var pctVal = 0;
                if (pctMatch) {
                  pctVal = Math.round(parseFloat(pctMatch[1]));
                } else if (typeof cellRaw === "number" && cellRaw > 0 && cellRaw <= 1) {
                  pctVal = Math.round(cellRaw * 100);
                }
                exercisesArr.push({
                  exerciseNumber: (c - 5) + 1,
                  formulaString: cellStr,
                  percentage: pctVal
                });
              }
            }
            catchList.push({
              id: "catch-ans-r" + (r + 2),
              timestamp: rowTime,
              studentId: rowId || qId,
              studentName: rowName || qName,
              lessonSubject: rowSubj,
              completionStatus: rowStatus,
              exercises: exercisesArr
            });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        studentId: qId,
        studentName: qName,
        catchHistory: catchList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-10) جلب مكافآت الواقع المعزز الخاصة بتحدي الصيد من ورقة "مكافآت صيد AR"
    if (e && e.parameter && e.parameter.action === "get_catch_ar_rewards") {
      var carSheet = getCatchARRewardsSheet(ss);
      var carData = carSheet.getDataRange().getValues();
      var catchRewards = [];
      for (var i = 1; i < carData.length; i++) {
        var row = carData[i];
        var id = String(row[0] || "").trim();
        var title = String(row[1] || "").trim();
        var presetId = String(row[4] || "").trim();
        var imageUrl = String(row[5] || "").trim();
        if (!id && !title && !presetId && !imageUrl) continue;
        catchRewards.push({
          id: id || ("tier_" + i),
          title: title,
          minScore: Number(row[2]) || 0,
          maxScore: row[3] !== "" && row[3] !== null && row[3] !== undefined ? Number(row[3]) : 100,
          presetId: presetId || undefined,
          imageUrl: imageUrl,
          scaleRatio: Number(row[6]) || 1.35,
          offsetYRatio: row[7] !== "" && row[7] !== null && row[7] !== undefined ? Number(row[7]) : -0.45,
          enabled: String(row[8] !== undefined ? row[8] : "true").toLowerCase() !== "false" && String(row[8]) !== "0"
        });
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        count: catchRewards.length,
        rewards: catchRewards
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-11) نقاط نهاية قسم الفيديو التفاعلي وبوت تيليغرام (GET)
    if (e && e.parameter && e.parameter.action === "get_video_lessons") {
      var vLessons = readVideoLessonsListGS(ss);
      return ContentService.createTextOutput(JSON.stringify({ success: true, lessons: vLessons }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && e.parameter.action === "get_video_corrections") {
      var vCorr = readVideoCorrectionsListGS(
        ss,
        String(e.parameter.studentId || "").trim(),
        String(e.parameter.studentName || "").trim()
      );
      return ContentService.createTextOutput(JSON.stringify({ success: true, corrections: vCorr }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e && e.parameter && e.parameter.action === "get_telegram_config") {
      return ContentService.createTextOutput(JSON.stringify({ success: true, config: readTelegramConfigGS(ss) }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-12) جلب بيانات المجموعات والجدول اليومي للدورة والبرامج التدريبية (GET)
    if (e && e.parameter && e.parameter.action === "get_course_schedule") {
      var schedData = readCourseScheduleGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        programs: schedData.programs || [],
        groups: schedData.groups,
        days: schedData.days,
        settings: schedData.settings
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ج-13) جلب سجلات حضور الحصص اليومية من ورقة "سجل_الحضور" (GET)
    if (e && e.parameter && e.parameter.action === "get_attendance_records") {
      var attListGet = readAttendanceRecordsGS(
        ss,
        String(e.parameter.studentId || "").trim(),
        String(e.parameter.date || "").trim()
      );
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        attendanceHandled: true,
        records: attListGet
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = getLessonsSheet(ss);
    
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: 0, curriculum: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var lastCol = sheet.getLastColumn();
    var values = sheet.getRange(2, 1, lastRow - 1, Math.max(9, lastCol)).getValues();
    var curriculum = [];
    var currentLessonSubject = "الدرس الأول";
    
    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      var rawSubject = String(row[0] || "").trim();
      if (rawSubject) {
        currentLessonSubject = rawSubject;
      }
      
      // مسح التمارين الأفقية: كل 8 أعمدة تمثل نصاً/تمريناً
      // B:I (col 1..8), J:Q (col 9..16), R:Y (col 17..24)...
      for (var col = 1; col < row.length; col += 8) {
        var wordText = String(row[col + 4] || "").trim(); // نص الدرس (مثل F أو N أو V)
        if (!wordText) continue; // تخطي الخانات الفارغة
        
        var category = String(row[col] || "").trim() || "الكلمة";
        var imageUrl = String(row[col + 1] || "").trim();
        var audioUrl = String(row[col + 2] || "").trim();
        var autoReadText = String(row[col + 3] || "").trim();
        var meaning = String(row[col + 5] || "").trim();
        var makhrajTip = String(row[col + 6] || "").trim();
        var repeatRaw = String(row[col + 7] || "").trim();
        var repeatCount = 1;
        var difficultyLevel = "medium";
        var recordingDuration = 5;
        var parsedLessonRetry = parseRetryLimitSettingGS(repeatRaw);
        var allowRetry = parsedLessonRetry.allowRetry;
        var maxRetries = parsedLessonRetry.maxRetries;
        if (repeatRaw) {
          var parts = repeatRaw.split(/[,|]/).map(function(s) { return s.trim(); });
          if (parts.length >= 1) {
            var p1 = parseInt(parts[0]);
            if (!isNaN(p1) && p1 >= 1) repeatCount = p1;
          }
          if (parts.length >= 2) {
            var p2 = parts[1].toLowerCase();
            if (p2 === "سهل" || p2 === "easy" || p2 === "مبتدئ") difficultyLevel = "easy";
            else if (p2 === "متقدم" || p2 === "hard" || p2 === "صارم") difficultyLevel = "hard";
            else difficultyLevel = "medium";
          }
          if (parts.length >= 3) {
            var p3 = parseInt(parts[2].replace(/[^0-9]/g, ''));
            if (!isNaN(p3) && p3 >= 2) recordingDuration = p3;
          }
        }
        
        curriculum.push({
          id: "sheet-r" + (r + 2) + "-c" + col,
          lessonSubject: currentLessonSubject,
          category: category,
          imageUrl: imageUrl || undefined,
          audioUrl: audioUrl || undefined,
          autoReadText: autoReadText || undefined,
          word: wordText,
          meaning: meaning || "",
          makhrajTip: makhrajTip || "",
          repeatCount: repeatCount,
          difficultyLevel: difficultyLevel,
          recordingDuration: recordingDuration,
          allowRetry: allowRetry,
          maxRetries: maxRetries
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      count: curriculum.length,
      sheetName: sheet.getName(),
      spreadsheetName: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      curriculum: curriculum,
      homeConfig: readHomeConfig(ss),
      contentBlocks: readHomeContentBlocksGS(ss)
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. POST: استقبال الصوت وتخزينه في Drive وحفظ أو حذف التمارين في الصف المناسب
function doPost(e) {
  try {
    var raw = e.postData.contents;
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // (-2) معالجة تحديثات بوت تيليغرام الواردة (Telegram Bot Webhook) لربط الطالب تلقائياً
    if (data && data.message && data.message.chat && !data.action) {
      var chat = data.message.chat;
      var chatId = String(chat.id);
      var tgUser = chat.username ? ("@" + chat.username) : String(chat.first_name || "");
      var textMsg = String(data.message.text || "").trim();

      // أمر معرفة رقم Chat ID للمشرف أو الطالب
      var lowerTgCmd = textMsg.toLowerCase();
      if (lowerTgCmd === "/id" || lowerTgCmd === "/myid" || lowerTgCmd === "id") {
        sendTelegramBotMessageGS(ss, chatId, "رقم Chat ID الخاص بك هو:\\n<code>" + chatId + "</code>", "");
        return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
      }

      var candidateId = "";
      var startMatch = textMsg.match(/\\/start\\s+([^\\s]+)/i);
      if (startMatch) {
        candidateId = normRegDigitsGS(startMatch[1]);
      } else {
        var normMsgId = normRegDigitsGS(textMsg);
        if (/^[a-zA-Z0-9_-]{2,}$/.test(normMsgId)) {
          candidateId = normMsgId;
        }
      }

      if (candidateId) {
        var regSheetTg = getIDRegistrantsSheet(ss);
        var allRegsTg = readAllRegistrantsGS(regSheetTg);
        var matchedStudent = null;
        for (var rIdx = 0; rIdx < allRegsTg.length; rIdx++) {
          if (allRegsTg[rIdx].id === candidateId) {
            matchedStudent = allRegsTg[rIdx];
            break;
          }
        }
        var tgCfgWh = readTelegramConfigGS(ss);
        if (matchedStudent && isRegistrantDisabledGS(matchedStudent.status)) {
          var disObj = renderTelegramTemplateGS(ss, tgCfgWh, "student_disabled", {
            studentName: matchedStudent.name,
            studentId: matchedStudent.id
          });
          if (disObj.enabled) sendTelegramBotMessageGS(ss, chatId, disObj.text, "");
        } else if (matchedStudent) {
          var uSheet = getTelegramUsersSheet(ss);
          var uRows = uSheet.getDataRange().getValues();
          var foundRow = -1;
          for (var u = 1; u < uRows.length; u++) {
            if (normRegDigitsGS(uRows[u][0]) === matchedStudent.id) {
              foundRow = u + 1;
              break;
            }
          }
          var nowTg = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Bangkok", "yyyy/MM/dd HH:mm");
          var rowVals = [matchedStudent.id, matchedStudent.name, chatId, tgUser, nowTg, "true"];
          if (foundRow !== -1) {
            uSheet.getRange(foundRow, 1, 1, 6).setValues([rowVals]);
          } else {
            uSheet.appendRow(rowVals);
          }
          var welObj = renderTelegramTemplateGS(ss, tgCfgWh, "student_welcome", {
            studentName: matchedStudent.name,
            studentId: matchedStudent.id
          });
          if (welObj.enabled) sendTelegramBotMessageGS(ss, chatId, welObj.text, "");
        } else {
          var nfObj = renderTelegramTemplateGS(ss, tgCfgWh, "student_id_not_found", {
            studentId: candidateId
          });
          if (nfObj.enabled) sendTelegramBotMessageGS(ss, chatId, nfObj.text, "");
        }
      } else {
        sendTelegramBotMessageGS(ss, chatId, "أهلاً بك! أرسل رقم المشترك (ID) الخاص بك لربط حسابك وتلقي الإشعارات وتصحيح المعلم.\\nأو أرسل /id لمعرفة Chat ID الخاص بك.", "");
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // =========================================================================
    // (V) نقاط نهاية قسم الفيديو التفاعلي وبوت تيليغرام (POST)
    // =========================================================================
    if (data.action === "get_video_lessons") {
      return ContentService.createTextOutput(JSON.stringify({ success: true, lessons: readVideoLessonsListGS(ss) }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_video_lesson" && data.lesson) {
      var vqSheet = getVideoQuestionsSheet(ss);
      var l = data.lesson;
      var lId = String(l.id || ("vid_" + new Date().getTime())).trim();
      var rowArr = [
        lId,
        l.topic || "دروس الفيديو التفاعلي",
        l.title || "",
        l.instruction || "",
        l.videoUrl || "",
        l.explainSound || "",
        l.image || "",
        l.showResult === "لا" ? "لا" : "نعم",
        l.allowRecording === "لا" ? "لا" : "نعم",
        Number(l.maxRecordingTime) || 60,
        l.allowUpload === "لا" ? "لا" : "نعم",
        l.uploadTitle || "",
        l.retryCount !== undefined && l.retryCount !== null ? Number(l.retryCount) : 1,
        l.startDate || "",
        l.endDate || "",
        l.expireAfterDays !== undefined ? l.expireAfterDays : "",
        JSON.stringify(Array.isArray(l.questions) ? l.questions : []),
        JSON.stringify(Array.isArray(l.audioQuestions) ? l.audioQuestions : [])
      ];
      var lastR = vqSheet.getLastRow();
      var targetR = -1;
      if (lastR > 1) {
        var idsCol = vqSheet.getRange(2, 1, lastR - 1, 1).getValues();
        for (var i = 0; i < idsCol.length; i++) {
          if (String(idsCol[i][0] || "").trim() === lId) {
            targetR = i + 2;
            break;
          }
        }
      }
      if (targetR !== -1) {
        vqSheet.getRange(targetR, 1, 1, rowArr.length).setValues([rowArr]);
      } else {
        vqSheet.appendRow(rowArr);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "تم حفظ درس الفيديو بنجاح!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "delete_video_lesson") {
      var vqSheet = getVideoQuestionsSheet(ss);
      var targetId = String(data.lessonId || "").trim();
      var lastR = vqSheet.getLastRow();
      if (lastR > 1 && targetId) {
        var idsCol = vqSheet.getRange(2, 1, lastR - 1, 1).getValues();
        for (var i = idsCol.length - 1; i >= 0; i--) {
          if (String(idsCol[i][0] || "").trim() === targetId) {
            vqSheet.deleteRow(i + 2);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "sync_video_lessons" && Array.isArray(data.lessons)) {
      var vqSheet = getVideoQuestionsSheet(ss);
      var lastR = vqSheet.getLastRow();
      if (lastR > 1) {
        vqSheet.getRange(2, 1, lastR - 1, Math.max(18, vqSheet.getLastColumn())).clearContent();
      }
      var rowsToWrite = [];
      for (var i = 0; i < data.lessons.length; i++) {
        var l = data.lessons[i];
        rowsToWrite.push([
          String(l.id || ("vid_" + (i + 1))),
          l.topic || "دروس الفيديو التفاعلي",
          l.title || "",
          l.instruction || "",
          l.videoUrl || "",
          l.explainSound || "",
          l.image || "",
          l.showResult === "لا" ? "لا" : "نعم",
          l.allowRecording === "لا" ? "لا" : "نعم",
          Number(l.maxRecordingTime) || 60,
          l.allowUpload === "لا" ? "لا" : "نعم",
          l.uploadTitle || "",
          l.retryCount !== undefined && l.retryCount !== null ? Number(l.retryCount) : 1,
          l.startDate || "",
          l.endDate || "",
          l.expireAfterDays !== undefined ? l.expireAfterDays : "",
          JSON.stringify(Array.isArray(l.questions) ? l.questions : []),
          JSON.stringify(Array.isArray(l.audioQuestions) ? l.audioQuestions : [])
        ]);
      }
      if (rowsToWrite.length > 0) {
        vqSheet.getRange(2, 1, rowsToWrite.length, 18).setValues(rowsToWrite);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        count: rowsToWrite.length,
        message: "تمت مزامنة " + rowsToWrite.length + " دروس في ورقة فيديو_الأسئلة!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_video_answers") {
      var vaSheet = getVideoAnswersSheet(ss);
      var sId = String(data.studentId || "").trim();
      var sName = String(data.studentName || "").trim();
      var lastR = vaSheet.getLastRow();
      var answersList = [];
      if (lastR > 1) {
        var rows = vaSheet.getRange(2, 1, lastR - 1, Math.max(13, vaSheet.getLastColumn())).getValues();
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var rId = String(row[1] || "").trim();
          var rName = String(row[2] || "").trim();
          var matched = (sId && rId === sId) || ((!sId || !rId) && sName && rName === sName);
          if (!matched) continue;
          var parsedAns = {};
          try { if (row[9]) parsedAns = JSON.parse(String(row[9])); } catch (e) {}
          answersList.push({
            updatedAt: String(row[0] || "").trim(),
            studentId: rId,
            studentName: rName,
            lessonId: String(row[3] || "").trim(),
            topic: String(row[4] || "").trim(),
            title: String(row[5] || "").trim(),
            completed: String(row[6] || "").trim(),
            videoScore: Number(row[7] || 0),
            explainAudioScore: Number(row[8] || 0),
            answeredQuestions: parsedAns,
            retryResetCount: (row[10] !== "" && row[10] !== null && row[10] !== undefined) ? Number(row[10]) : null,
            imageLink: String(row[11] || "").trim(),
            recordingLink: String(row[12] || "").trim()
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, answers: answersList }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (
      data.action === "save_video_answer" ||
      data.action === "upload_video_media" ||
      data.action === "complete_video_lesson" ||
      data.action === "retry_video_lesson"
    ) {
      var vaSheet = getVideoAnswersSheet(ss);
      var sId = String(data.studentId || "").trim();
      var sName = String(data.studentName || "طالب").trim();
      var lId = String(data.lessonId || "").trim();
      var topic = String(data.topic || "").trim();
      var title = String(data.title || "").trim();
      var nowFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy/MM/dd HH:mm");

      var lastR = vaSheet.getLastRow();
      var targetR = -1;
      var existingRow = [nowFormatted, sId, sName, lId, topic, title, "", 0, 0, "{}", "", "", ""];
      if (lastR > 1) {
        var rows = vaSheet.getRange(2, 1, lastR - 1, Math.max(13, vaSheet.getLastColumn())).getValues();
        for (var r = 0; r < rows.length; r++) {
          var rId = String(rows[r][1] || "").trim();
          var rName = String(rows[r][2] || "").trim();
          var rLid = String(rows[r][3] || "").trim();
          var idMatch = (sId && rId === sId) || ((!sId || !rId) && sName && rName === sName);
          if (idMatch && rLid === lId) {
            targetR = r + 2;
            existingRow = rows[r];
            break;
          }
        }
      }

      var ansObj = {};
      try { if (existingRow[9]) ansObj = JSON.parse(String(existingRow[9])); } catch (e) {}

      var uploadedUrl = "";
      if (data.action === "save_video_answer" && data.questionKey) {
        ansObj[String(data.questionKey)] = {
          questionKey: String(data.questionKey),
          question: String(data.question || ""),
          selectedAnswer: String(data.selectedAnswer || ""),
          isCorrect: data.isCorrect !== undefined ? data.isCorrect : null,
          type: String(data.questionType || "video"),
          answeredAt: String(data.answeredAt || nowFormatted)
        };
        if (data.videoScore !== undefined) existingRow[7] = Number(data.videoScore) || 0;
        if (data.completed === "تم" || data.completed === "فيديو_تم") existingRow[6] = String(data.completed);
        if (data.retryResetCount !== undefined && data.retryResetCount !== null && data.retryResetCount !== "") {
          existingRow[10] = Number(data.retryResetCount);
        }
      } else if (data.action === "upload_video_media" && data.base64Data) {
        uploadedUrl = uploadVideoBase64ToDriveGS(
          data.base64Data,
          (sId ? sId + "_" : "") + sName + "_" + (data.mediaType || "media"),
          data.mimeType || (data.mediaType === "image" ? "image/jpeg" : "audio/mp3"),
          "1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA"
        );
        if (data.mediaType === "image") existingRow[11] = uploadedUrl;
        else existingRow[12] = uploadedUrl;
        if (data.completed === "تم") existingRow[6] = "تم";
        if (data.retryResetCount !== undefined && data.retryResetCount !== null && data.retryResetCount !== "") {
          existingRow[10] = Number(data.retryResetCount);
        }
      } else if (data.action === "complete_video_lesson") {
        existingRow[6] = (data.completed === "فيديو_تم" ? "فيديو_تم" : "تم");
        if (data.videoScore !== undefined) existingRow[7] = Number(data.videoScore) || 0;
        if (data.explainAudioScore !== undefined) existingRow[8] = Number(data.explainAudioScore) || 0;
        if (data.imageLink) existingRow[11] = String(data.imageLink);
        if (data.recordingLink) existingRow[12] = String(data.recordingLink);
        if (data.retryResetCount !== undefined && data.retryResetCount !== null && data.retryResetCount !== "") {
          existingRow[10] = Number(data.retryResetCount);
        }
      } else if (data.action === "retry_video_lesson") {
        existingRow[6] = "إعادة";
        existingRow[7] = 0;
        ansObj = {};
        if (data.retryResetCount !== undefined && data.retryResetCount !== null && data.retryResetCount !== "") {
          existingRow[10] = Number(data.retryResetCount);
        }
      }

      existingRow[0] = nowFormatted;
      existingRow[1] = sId;
      existingRow[2] = sName;
      existingRow[3] = lId;
      existingRow[4] = topic || existingRow[4];
      existingRow[5] = title || existingRow[5];
      existingRow[9] = JSON.stringify(ansObj);

      if (targetR !== -1) {
        vaSheet.getRange(targetR, 1, 1, 13).setValues([existingRow.slice(0, 13)]);
      } else {
        vaSheet.appendRow(existingRow.slice(0, 13));
      }

      if (data.action === "upload_video_media" || data.action === "complete_video_lesson") {
        var tgCfgHw = readTelegramConfigGS(ss);
        if (tgCfgHw.enabled && tgCfgHw.notifyAdminOnHomework && tgCfgHw.adminChatId) {
          var hwActLabel = data.action === "upload_video_media"
            ? (data.mediaType === "image" ? "رفع صورة الواجب" : "إرسال تسجيل صوتي")
            : "إتمام درس الفيديو";
          var hwObj = renderTelegramTemplateGS(ss, tgCfgHw, "admin_homework_submitted", {
            studentName: sName,
            studentId: sId || "—",
            lessonTitle: title || topic || lId,
            actionLabel: hwActLabel
          });
          if (hwObj.enabled) {
            sendTelegramBotMessageGS(ss, tgCfgHw.adminChatId, hwObj.text, "");
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        url: uploadedUrl || undefined
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_all_video_submissions") {
      var vaSheet = getVideoAnswersSheet(ss);
      var allCorr = readVideoCorrectionsListGS(ss, "", "");
      var corrMap = {};
      for (var cIdx = 0; cIdx < allCorr.length; cIdx++) {
        var cItem = allCorr[cIdx];
        corrMap[(cItem.studentId || cItem.studentName) + "::" + cItem.lessonTitle] = cItem;
      }
      var lastR = vaSheet.getLastRow();
      var subs = [];
      if (lastR > 1) {
        var rows = vaSheet.getRange(2, 1, lastR - 1, Math.max(13, vaSheet.getLastColumn())).getValues();
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var rId = String(row[1] || "").trim();
          var rName = String(row[2] || "").trim();
          var rTitle = String(row[5] || "").trim();
          if (!rId && !rName && !rTitle) continue;
          var parsedAns = {};
          try { if (row[9]) parsedAns = JSON.parse(String(row[9])); } catch (e) {}
          var key = (rId || rName) + "::" + rTitle;
          subs.push({
            rowIndex: r + 2,
            updatedAt: String(row[0] || "").trim(),
            studentId: rId,
            studentName: rName,
            lessonId: String(row[3] || "").trim(),
            topic: String(row[4] || "").trim(),
            title: rTitle,
            completed: String(row[6] || "").trim(),
            videoScore: Number(row[7] || 0),
            explainAudioScore: Number(row[8] || 0),
            answeredQuestions: parsedAns,
            retryResetCount: Number(row[10] || 0),
            imageLink: String(row[11] || "").trim(),
            recordingLink: String(row[12] || "").trim(),
            correction: corrMap[key] || null
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, submissions: subs }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_video_corrections") {
      var vCorr = readVideoCorrectionsListGS(
        ss,
        String(data.studentId || "").trim(),
        String(data.studentName || "").trim()
      );
      return ContentService.createTextOutput(JSON.stringify({ success: true, corrections: vCorr }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_video_correction") {
      var vcSheet = getVideoCorrectionsSheet(ss);
      var lTitle = String(data.lessonTitle || "").trim();
      var sId = String(data.studentId || "").trim();
      var sName = String(data.studentName || "").trim();
      var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy/MM/dd HH:mm");

      var correctedImage = String(data.correctedImage || "").trim();
      if (data.correctedImageBase64) {
        correctedImage = uploadVideoBase64ToDriveGS(
          data.correctedImageBase64,
          "corr_img_" + (sId || sName),
          "image/jpeg",
          "1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t"
        );
      }

      var teacherAudios = Array.isArray(data.teacherAudios) ? data.teacherAudios.slice() : [];
      if (data.teacherAudioBase64) {
        var uploadedAud = uploadVideoBase64ToDriveGS(
          data.teacherAudioBase64,
          "corr_aud_" + (sId || sName),
          "audio/mp3",
          "1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t"
        );
        if (uploadedAud) teacherAudios.push(uploadedAud);
      }

      var addImages = Array.isArray(data.additionalImages) ? data.additionalImages : [];
      var teacherVideos = Array.isArray(data.teacherVideos) ? data.teacherVideos : [];

      var lastR = vcSheet.getLastRow();
      var targetR = -1;
      if (lastR > 1) {
        var rows = vcSheet.getRange(2, 1, lastR - 1, 3).getValues();
        for (var r = 0; r < rows.length; r++) {
          var rTitle = String(rows[r][0] || "").trim();
          var rId = String(rows[r][1] || "").trim();
          var rName = String(rows[r][2] || "").trim();
          var stMatch = (sId && rId === sId) || ((!sId || !rId) && sName && rName === sName);
          if (stMatch && rTitle === lTitle) {
            targetR = r + 2;
            break;
          }
        }
      }

      var rowData = [
        lTitle,
        sId,
        sName,
        String(data.imageStatus || "").trim(),
        String(data.imageScore || "").trim(),
        correctedImage,
        JSON.stringify(addImages),
        data.imageStatus || data.imageScore || correctedImage || data.imageNotes ? nowStr : "",
        String(data.imageNotes || "").trim(),
        String(data.audioStatus || "").trim(),
        String(data.audioScore || "").trim(),
        JSON.stringify(teacherAudios),
        JSON.stringify(teacherVideos),
        data.audioStatus || data.audioScore || teacherAudios.length > 0 || data.audioNotes ? nowStr : "",
        String(data.audioNotes || "").trim()
      ];

      if (targetR !== -1) {
        vcSheet.getRange(targetR, 1, 1, 15).setValues([rowData]);
      } else {
        vcSheet.appendRow(rowData);
      }

      var telegramSent = false;
      var tgCfgCorr = readTelegramConfigGS(ss);
      if (data.sendTelegram && tgCfgCorr.notifyOnVideoCorrection !== false) {
        var corrChatId = findStudentTelegramChatIdGS(ss, sId, sName);
        if (corrChatId) {
          var corrMsgObj = renderTelegramTemplateGS(ss, tgCfgCorr, "student_video_correction", {
            studentName: sName || "طالبنا الكريم",
            lessonTitle: lTitle,
            imageScore: data.imageScore || "—",
            imageNotes: data.imageNotes || "لا توجد ملاحظات",
            audioScore: data.audioScore || "—",
            audioNotes: data.audioNotes || "لا توجد ملاحظات"
          });
          if (corrMsgObj.enabled) {
            telegramSent = sendTelegramBotMessageGS(ss, corrChatId, corrMsgObj.text, correctedImage || "").ok;
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        telegramSent: telegramSent,
        message: "تم حفظ تصحيح المعلم بنجاح!",
        correction: {
          lessonTitle: lTitle,
          studentId: sId,
          studentName: sName,
          imageStatus: rowData[3],
          imageScore: rowData[4],
          correctedImage: correctedImage,
          additionalImages: addImages,
          imageDate: rowData[7],
          imageNotes: rowData[8],
          audioStatus: rowData[9],
          audioScore: rowData[10],
          teacherAudios: teacherAudios,
          teacherVideos: teacherVideos,
          audioDate: rowData[13],
          audioNotes: rowData[14]
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_telegram_config") {
      return ContentService.createTextOutput(JSON.stringify({ success: true, config: readTelegramConfigGS(ss) }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_telegram_config" && data.config) {
      writeTelegramConfigGS(ss, data.config);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "تم حفظ إعدادات تيليغرام في الشيت بنجاح!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_telegram_users") {
      var uSheet = getTelegramUsersSheet(ss);
      var rows = uSheet.getDataRange().getValues();
      var usersList = [];
      for (var u = 1; u < rows.length; u++) {
        if (!rows[u][0] && !rows[u][2]) continue;
        usersList.push({
          studentId: normRegDigitsGS(rows[u][0]),
          studentName: String(rows[u][1] || "").trim(),
          chatId: String(rows[u][2] || "").trim(),
          telegramUsername: String(rows[u][3] || "").trim(),
          linkedAt: String(rows[u][4] || "").trim(),
          notificationsEnabled: String(rows[u][5] || "true") !== "false"
        });
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        supportsTelegramV2: true,
        users: usersList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "link_telegram_user") {
      var uSheet = getTelegramUsersSheet(ss);
      var sIdLink = normRegDigitsGS(data.studentId || "");
      var sNameLink = String(data.studentName || "").trim();
      var chatIdLink = String(data.chatId || "").trim();
      var tgUserLink = String(data.telegramUsername || "").trim();
      var enabledLink = data.notificationsEnabled === false ? "false" : "true";
      if (!sIdLink || !chatIdLink) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          telegramHandled: true,
          error: "يرجى إدخال رقم الطالب (ID) ورقم Chat ID."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var uRows = uSheet.getDataRange().getValues();
      var matchRow = -1;
      for (var u = 1; u < uRows.length; u++) {
        if (normRegDigitsGS(uRows[u][0]) === sIdLink || String(uRows[u][2] || "").trim() === chatIdLink) {
          matchRow = u + 1;
          break;
        }
      }
      var nowTg = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy/MM/dd HH:mm");
      var rowVals = [sIdLink, sNameLink || ("طالب #" + sIdLink), chatIdLink, tgUserLink, nowTg, enabledLink];
      if (matchRow !== -1) {
        uSheet.getRange(matchRow, 1, 1, 6).setValues([rowVals]);
      } else {
        uSheet.appendRow(rowVals);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        telegramHandled: true,
        message: "تم حفظ وربط حساب الطالب في ورقة تيليغرام_الطلاب بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "toggle_telegram_user") {
      var uSheet = getTelegramUsersSheet(ss);
      var uRows = uSheet.getDataRange().getValues();
      var tChat = String(data.chatId || "").trim();
      var tId = normRegDigitsGS(data.studentId || "");
      var nextFlag = data.notificationsEnabled === false ? "false" : "true";
      for (var u = 1; u < uRows.length; u++) {
        if ((tChat && String(uRows[u][2] || "").trim() === tChat) || (tId && normRegDigitsGS(uRows[u][0]) === tId)) {
          uSheet.getRange(u + 1, 6).setValue(nextFlag);
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            telegramHandled: true,
            message: "تم تحديث حالة الإشعارات للطالب بنجاح"
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        telegramHandled: true,
        error: "لم يتم العثور على الطالب في ورقة تيليغرام_الطلاب."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "delete_telegram_user") {
      var uSheet = getTelegramUsersSheet(ss);
      var uRows = uSheet.getDataRange().getValues();
      var dChat = String(data.chatId || "").trim();
      var dId = normRegDigitsGS(data.studentId || "");
      for (var u = uRows.length - 1; u >= 1; u--) {
        if ((dChat && String(uRows[u][2] || "").trim() === dChat) || (dId && normRegDigitsGS(uRows[u][0]) === dId)) {
          uSheet.deleteRow(u + 1);
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            telegramHandled: true,
            message: "تم إلغاء ربط الطالب وحذفه من ورقة تيليغرام_الطلاب"
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        telegramHandled: true,
        error: "لم يتم العثور على السجل."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "send_telegram_notification") {
      var tgCfgSend = readTelegramConfigGS(ss);
      var resolvedToken = String(data.botToken || tgCfgSend.botToken || "").trim();
      if (!resolvedToken) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          sentCount: 0,
          message: "يرجى إدخال رمز البوت (Bot Token) وحفظ الإعدادات أولاً."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var msg = String(data.message || "").trim();
      if (tgCfgSend.customFooter) {
        msg = msg + "\\n\\n" + tgCfgSend.customFooter;
      }
      var photo = String(data.photoUrl || "").trim();
      var sentCount = 0;
      var attemptedCount = 0;
      var lastTgError = "";

      if (data.chatId) {
        attemptedCount = 1;
        var directSendRes = sendTelegramBotMessageGS(ss, String(data.chatId).trim(), msg, photo, resolvedToken);
        if (directSendRes.ok) {
          sentCount++;
        } else {
          lastTgError = directSendRes.error || "";
        }
      } else {
        var targetIdsMap = {};
        var hasTargetIds = Array.isArray(data.studentIds) && data.studentIds.length > 0;
        if (hasTargetIds) {
          for (var ti = 0; ti < data.studentIds.length; ti++) {
            targetIdsMap[normRegDigitsGS(data.studentIds[ti])] = true;
          }
        }
        var uRows = getTelegramUsersSheet(ss).getDataRange().getValues();
        for (var u = 1; u < uRows.length; u++) {
          var uId = normRegDigitsGS(uRows[u][0]);
          var uName = String(uRows[u][1] || "").trim();
          var uChatId = String(uRows[u][2] || "").trim();
          var uEnabled = String(uRows[u][5] || "true").trim().toLowerCase() !== "false";
          if (!uEnabled || !uChatId) continue;
          var matchedGroup = hasTargetIds && targetIdsMap[uId];
          var matchedSingle = (data.studentId && uId === normRegDigitsGS(data.studentId)) || (data.studentName && uName === data.studentName);
          if (data.broadcastAll || matchedGroup || matchedSingle) {
            attemptedCount++;
            var grpSendRes = sendTelegramBotMessageGS(ss, uChatId, msg, photo, resolvedToken);
            if (grpSendRes.ok) {
              sentCount++;
            } else {
              lastTgError = grpSendRes.error || lastTgError;
            }
          }
        }
      }

      var resultMessage = "";
      if (sentCount > 0) {
        resultMessage = "تم إرسال الإشعار بنجاح (" + sentCount + ")";
      } else if (data.chatId) {
        resultMessage = "فشل الإرسال إلى معرف تيليغرام (" + data.chatId + "): " + (lastTgError || "تأكد من إرسال /start للبوت أولاً وصحة Chat ID");
      } else if (attemptedCount === 0) {
        resultMessage = "لا يوجد طلاب مربوطون ومفعّلون في ورقة (تيليغرام_الطلاب) حالياً. يجب على الطالب فتح البوت وإرسال رقم المشترك (ID) أولاً.";
      } else {
        resultMessage = "تم العثور على " + attemptedCount + " طالب مربوط، ولكن فشل الإرسال من تيليغرام: " + (lastTgError || "تحقق من رمز البوت Bot Token");
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: sentCount > 0,
        sentCount: sentCount,
        attemptedCount: attemptedCount,
        message: resultMessage
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // (S) نقاط نهاية قسم المجموعات والجدول اليومي للدورة والبرامج التدريبية (POST)
    if (data.action === "get_course_schedule") {
      var schedRes = readCourseScheduleGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        programs: schedRes.programs || [],
        groups: schedRes.groups,
        days: schedRes.days,
        settings: schedRes.settings
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_course_schedule") {
      writeCourseScheduleGS(ss, data);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        scheduleSaved: true,
        message: "تم حفظ المجموعات والجدول اليومي في Google Sheets بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (S-2) نقاط نهاية سجل حضور الحصص اليومية (ورقة سجل_الحضور)
    if (data.action === "check_in_attendance") {
      var tzAtt = String(data.timezone || ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || "Asia/Bangkok").trim();
      var nowObjAtt = new Date();
      var attDate = formatSheetDateISO(data.date) || Utilities.formatDate(nowObjAtt, tzAtt, "yyyy-MM-dd");
      var attTime = formatSheetTimeHHmmGS(data.time, tzAtt) || Utilities.formatDate(nowObjAtt, tzAtt, "HH:mm");
      var attCreated = Utilities.formatDate(nowObjAtt, tzAtt, "yyyy/MM/dd HH:mm:ss");
      var attSid = normRegDigitsGS(data.studentId || "");
      var attSname = String(data.studentName || "").trim();
      var attSession = String(data.sessionTitle || "حصة اليوم").trim();
      var attDayType = String(data.dayType || "lesson").trim();
      var attDevId = String(data.deviceId || "").trim();
      var attProgId = String(data.programId || "prog_default").trim();
      var attSchedTime = formatSheetTimeHHmmGS(data.scheduledTime || "", tzAtt);
      var attGrace = (data.graceMinutes !== undefined && data.graceMinutes !== null) ? Number(data.graceMinutes) : 10;

      if (!attSid) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          attendanceHandled: true,
          error: "يرجى تسجيل الدخول برقم المشترك أولاً."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // البحث في الجدول السحابي إذا لم يُمرّر scheduledTime
      if (!attSchedTime) {
        try {
          var csAtt = readCourseScheduleGS(ss);
          var progsAtt = Array.isArray(csAtt.programs) ? csAtt.programs : [];
          for (var pai = 0; pai < progsAtt.length; pai++) {
            if (progsAtt[pai].id === attProgId && progsAtt[pai].settings) {
              if (progsAtt[pai].settings.defaultStartTime) attSchedTime = formatSheetTimeHHmmGS(progsAtt[pai].settings.defaultStartTime, tzAtt);
              if (progsAtt[pai].settings.graceMinutes !== undefined) attGrace = Number(progsAtt[pai].settings.graceMinutes);
              break;
            }
          }
          for (var dai = 0; dai < csAtt.days.length; dai++) {
            var dAtt = csAtt.days[dai];
            if (dAtt.date === attDate && (!dAtt.programId || dAtt.programId === attProgId) && dAtt.startTime) {
              attSchedTime = formatSheetTimeHHmmGS(dAtt.startTime, tzAtt);
              break;
            }
          }
        } catch (csErr) {}
      }

      var existingAtt = readAttendanceRecordsGS(ss, attSid, attDate);
      var existingAbsentRow = null;
      if (existingAtt.length > 0) {
        if (existingAtt[0].status !== "absent") {
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            attendanceHandled: true,
            alreadyCheckedIn: true,
            record: existingAtt[0],
            message: "تم تسجيل حضورك لهذا اليوم مسبقاً."
          })).setMimeType(ContentService.MimeType.JSON);
        } else {
          existingAbsentRow = existingAtt[0];
        }
      }

      var timingEval = evalAttendanceTimingGS(attTime, attSchedTime, attGrace);
      var finalAttStatus = existingAbsentRow && timingEval.status !== "late" ? "late" : timingEval.status;
      var statusLabelAr = getAttendanceStatusLabelArGS(finalAttStatus, timingEval.minutesDelta);

      var attLoc = String(data.location || "").trim();
      if (!attLoc || attLoc === "غير متاح") {
        attLoc = reverseGeocodeLocGS(data.lat, data.lng);
      }
      var attSheet = getAttendanceSheetGS(ss);
      var rowPayloadAtt = [
        attDate,
        attTime,
        attSid,
        attSname || ("طالب #" + attSid),
        attSession,
        attDayType,
        attLoc,
        attDevId,
        attCreated,
        finalAttStatus,
        timingEval.minutesDelta,
        timingEval.scheduledTime || "",
        attProgId
      ];
      if (existingAbsentRow && existingAbsentRow.rowNumber >= 2) {
        attSheet.getRange(existingAbsentRow.rowNumber, 1, 1, 13).setValues([rowPayloadAtt]);
      } else {
        attSheet.appendRow(rowPayloadAtt);
      }

      var savedRec = {
        date: attDate,
        time: attTime,
        studentId: attSid,
        studentName: attSname || ("طالب #" + attSid),
        sessionTitle: attSession,
        dayType: attDayType,
        location: attLoc,
        deviceId: attDevId,
        createdAt: attCreated,
        status: finalAttStatus,
        minutesDelta: timingEval.minutesDelta,
        scheduledTime: timingEval.scheduledTime || undefined,
        programId: attProgId,
        syncedToSheets: true
      };

      var tgCfgAtt = readTelegramConfigGS(ss);
      if (tgCfgAtt.enabled && tgCfgAtt.botToken) {
        if (tgCfgAtt.notifyAdminOnHomework && tgCfgAtt.adminChatId) {
          var admAttObj = renderTelegramTemplateGS(ss, tgCfgAtt, "admin_attendance_checkin", {
            studentName: savedRec.studentName,
            studentId: savedRec.studentId,
            statusLabel: statusLabelAr,
            date: attDate,
            time: attTime,
            scheduledTime: timingEval.scheduledTime || "غير محدد",
            sessionTitle: attSession,
            location: (attLoc && attLoc !== "غير متاح") ? attLoc : "غير محدد"
          });
          if (admAttObj.enabled) {
            sendTelegramBotMessageGS(ss, tgCfgAtt.adminChatId, admAttObj.text, "");
          }
        }
        var stuChatAtt = findStudentTelegramChatIdGS(ss, savedRec.studentId, savedRec.studentName);
        if (stuChatAtt) {
          var stuTplKey = finalAttStatus === "early"
            ? "student_attendance_early"
            : finalAttStatus === "late"
            ? "student_attendance_late"
            : "student_attendance_ontime";
          var stuAttObj = renderTelegramTemplateGS(ss, tgCfgAtt, stuTplKey, {
            studentName: savedRec.studentName,
            studentId: savedRec.studentId,
            sessionTitle: attSession,
            time: attTime,
            scheduledTime: timingEval.scheduledTime || attTime,
            minutesDelta: Math.abs(timingEval.minutesDelta || 0)
          });
          if (stuAttObj.enabled) {
            sendTelegramBotMessageGS(ss, stuChatAtt, stuAttObj.text, "");
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        attendanceHandled: true,
        alreadyCheckedIn: false,
        record: savedRec,
        message: "تم تأكيد حضورك في حصة اليوم (" + statusLabelAr + ") بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_attendance_records") {
      var attListPost = readAttendanceRecordsGS(ss, data.studentId || "", data.date || "");
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        attendanceHandled: true,
        records: attListPost
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "delete_attendance_record") {
      var delAttSheet = getAttendanceSheetGS(ss);
      var delRows = delAttSheet.getDataRange().getValues();
      var targetDelDate = formatSheetDateISO(data.date || "");
      var targetDelId = normRegDigitsGS(data.studentId || "");
      var deletedAny = false;
      for (var dIdx = delRows.length - 1; dIdx >= 1; dIdx--) {
        var rowDate = formatSheetDateISO(delRows[dIdx][0]);
        var rowId = normRegDigitsGS(delRows[dIdx][2]);
        if (rowDate === targetDelDate && rowId === targetDelId) {
          delAttSheet.deleteRow(dIdx + 1);
          deletedAny = true;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: deletedAny,
        attendanceHandled: true,
        message: deletedAny ? "تم حذف سجل الحضور من ورقة سجل_الحضور بنجاح." : "لم يتم العثور على سجل الحضور المطلوب."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (S-3) تشغيل فحص تذكيرات الحصص وتسجيل الغياب التلقائي فوراً من لوحة التحكم
    if (data.action === "run_attendance_scheduler_now") {
      var schedRunRes = runAttendanceSchedulerGS(ss, {
        date: data.date || "",
        time: data.time || "",
        timezone: data.timezone || ""
      });
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        schedulerHandled: true,
        remindersSent: schedRunRes.remindersSent,
        absencesMarked: schedRunRes.absencesMarked,
        adminSummariesSent: schedRunRes.adminSummariesSent,
        details: schedRunRes.details,
        message: "تم تنفيذ فحص الحصص الآن: تذكيرات مرسلة (" + schedRunRes.remindersSent + ") · حالات غياب مسجلة (" + schedRunRes.absencesMarked + ")."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (E-1) اختبار وتشخيص إرسال البريد الإلكتروني (MailApp) من لوحة الإدارة
    if (data.action === "test_welcome_email") {
      var toEmailTest = String(data.toEmail || "").trim();
      var portalTitleTest = String(data.academyName || "المنصة التعليمية").trim();
      var replyToTest = String(data.replyToEmail || data.adminNotificationEmail || "").trim();
      if (!toEmailTest || toEmailTest.indexOf("@") === -1) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          emailTestHandled: true,
          error: "يرجى إدخال بريد إلكتروني صحيح للاختبار."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      try {
        var quotaBefore = MailApp.getRemainingDailyQuota();
        var mailOptsTest = {
          to: toEmailTest,
          name: portalTitleTest,
          subject: portalTitleTest + " — رسالة اختبار وتشخيص البريد الإلكتروني",
          body: "مرحباً! هذه رسالة اختبار من منصة " + portalTitleTest + " لتأكيد أن إرسال البريد الترحيبي وإشعارات التسجيل يعمل بنجاح.\\nالحصة المتبقية اليوم قبل الإرسال: " + quotaBefore,
          htmlBody: '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;padding:20px;background:#f8fafc;"><div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;"><h2 style="margin:0 0 8px;color:#065f46;">تم نجاح اختبار البريد الإلكتروني ✓</h2><p style="margin:0 0 10px;color:#334155;font-size:14px;">نظام MailApp في Google Apps Script مفوّض ويعمل بنجاح في <strong>' + portalTitleTest + '</strong>.</p><p style="margin:0;color:#64748b;font-size:12px;">الحصة اليومية المتبقية: ' + Math.max(0, quotaBefore - 1) + ' رسالة</p></div></div>'
        };
        if (replyToTest && replyToTest.indexOf("@") !== -1) {
          mailOptsTest.replyTo = replyToTest;
        }
        MailApp.sendEmail(mailOptsTest);
        var quotaAfter = MailApp.getRemainingDailyQuota();
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          emailTestHandled: true,
          remainingQuota: quotaAfter,
          message: "تم إرسال الرسالة الاختبارية بنجاح إلى (" + toEmailTest + "). المتبقي من رصيدك اليومي: " + quotaAfter + " رسالة."
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (eTestErr) {
        var eMsg = String(eTestErr && eTestErr.message ? eTestErr.message : eTestErr || "خطأ غير معروف");
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          emailTestHandled: true,
          error: "فشل إرسال البريد: " + eMsg + " — إذا كان السبب عدم التفويض، افتح Apps Script وشغّل دالة authorizeAndTestEmailGS ثم انشر New Version."
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // (-1) تهيئة ورقة "الرئيسية"
    if (data.action === "init_home_sheet") {
      getHomeSheet(ss);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "تم تهيئة ورقة الرئيسية بنجاح" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (-1-ب) جلب وحفظ كتل محتوى الصفحة الرئيسية الديناميكي في ورقة "محتوى_الرئيسية"
    if (data.action === "get_home_content") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        homeContentHandled: true,
        blocks: readHomeContentBlocksGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_home_content") {
      var hcBlocks = Array.isArray(data.blocks) ? data.blocks : [];
      writeHomeContentBlocksGS(ss, hcBlocks);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        homeContentSaved: true,
        blocks: readHomeContentBlocksGS(ss),
        message: "تم حفظ ومزامنة محتوى الصفحة الرئيسية في ورقة محتوى_الرئيسية بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (-1-ج) جلب وحفظ إعدادات تقارير PDF والشهادات في ورقة "إعدادات_PDF"
    if (data.action === "get_pdf_settings") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        pdfSettingsHandled: true,
        settings: readPdfSettingsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_pdf_settings") {
      writePdfSettingsGS(ss, data.settings || {});
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        pdfSettingsSaved: true,
        settings: readPdfSettingsGS(ss),
        message: "تم حفظ ومزامنة إعدادات تقارير PDF والشهادات في ورقة إعدادات_PDF بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (-1-ج) نقاط نهاية البوابة العامة ونظام التسجيل ذي المرحلتين (معزولة تماماً)
    if (data.action === "get_portal_data") {
      var pDataPost = readPortalDataGS(ss);
      var tgInfoPost = readTelegramConfigGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        portalData: pDataPost,
        botUsername: tgInfoPost.botUsername || ""
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_portal_data") {
      writePortalDataGS(ss, data.portalData || {});
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        portalData: readPortalDataGS(ss),
        message: "تم حفظ ومزامنة محتوى البوابة العامة في ورقة محتوى_البوابة_العامة بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_registration_questions") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        questions: readRegistrationQuestionsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_registration_questions") {
      writeRegistrationQuestionsGS(ss, data.questions || []);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        questions: readRegistrationQuestionsGS(ss),
        message: "تم حفظ ومزامنة أسئلة التسجيل في ورقة أسئلة_التسجيل بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "upload_portal_file" && data.base64Data) {
      var pFileUrl = uploadVideoBase64ToDriveGS(
        data.base64Data,
        String(data.fileName || ("reg_attachment_" + new Date().getTime())),
        String(data.mimeType || "image/jpeg"),
        String(data.folderId || "1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA")
      );
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        url: pFileUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "submit_portal_registration") {
      if (data.appBaseUrl) saveAppBaseUrlGS(data.appBaseUrl);
      var regSheetSub = getIDRegistrantsSheet(ss);
      var subSheet = getRegistrationSubmissionsSheetGS(ss);
      var newRegId = generateNextRegistrantIdGS(
        regSheetSub,
        ss,
        String(data.registrationIdMode || "random"),
        Number(data.registrationIdLength) || 7
      );
      var regStudentName = String(data.studentName || "").trim();
      if (!regStudentName) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          portalHandled: true,
          error: "يرجى إدخال الاسم الكامل في استمارة التسجيل."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var stage1ProgramId = String(data.stage1DefaultProgramId || "prog_default").trim() || "prog_default";
      var stage1ProgramName = String(data.stage1ProgramName || "القسم الافتراضي (المرحلة التمهيدية)").trim();
      var activeBaseUrlSub = String(data.appBaseUrl || getAppBaseUrlGS() || "").trim();
      var nowSub = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Bangkok", "yyyy/MM/dd HH:mm");

      // 1. إضافة المشترك فوراً في ورقة ID registrants على البرنامج الافتراضي (المرحلة الأولى)
      var tgCfgSub = readTelegramConfigGS(ss);
      var cleanBotUser = String(tgCfgSub.botUsername || data.botUsername || "").replace(/^@/, "").trim();
      regSheetSub.appendRow([newRegId, regStudentName, "مفعّل", 1, "[]", "مسموح", "", "", stage1ProgramId, "", ""]);
      var createdRegRowNum = regSheetSub.getLastRow();
      var syncSubRes = syncRegistrantLinkAndQrCellsGS(regSheetSub, createdRegRowNum, newRegId, regStudentName, activeBaseUrlSub, cleanBotUser);
      var createdDirectUrl = String(syncSubRes.directLoginUrl || "").trim();
      var createdQrUrl = String(syncSubRes.qrImageUrl || "").trim();
      var tgDeepLink = String(syncSubRes.telegramDirectUrl || "").trim() || (cleanBotUser ? ("https://t.me/" + cleanBotUser + "?start=" + newRegId) : "");
      var createdTgQrUrl = String(syncSubRes.telegramQrImageUrl || "").trim() || (tgDeepLink ? buildQrImageUrlGS(tgDeepLink) : "");

      // 2. حفظ تفاصيل الطلب في ورقة طلبات_التسجيل
      var ansMap = (data.answers && typeof data.answers === "object") ? data.answers : {};
      var attList = Array.isArray(data.attachments) ? data.attachments : [];
      var regEmail = String(data.email || "").trim();
      var regPhone = String(data.phone || "").trim();
      var regTgUser = String(data.telegramUsername || "").trim();
      var stage1StatusLabel = "المرحلة 1 - في القسم الافتراضي (" + stage1ProgramName + ")";
      subSheet.appendRow([
        nowSub,
        newRegId,
        regStudentName,
        stage1ProgramId,
        "stage1_default",
        stage1StatusLabel,
        regTgUser,
        regEmail,
        regPhone,
        JSON.stringify(ansMap),
        JSON.stringify(attList),
        ""
      ]);

      // 3. إشعار الإدارة عبر تيليغرام (باستخدام القالب المخصص)
      var tgAdminNotified = false;
      if (data.notifyAdminTelegram !== false && tgCfgSub.botToken && tgCfgSub.adminChatId) {
        var ansSummaryLines = [];
        var ansKeys = Object.keys(ansMap);
        for (var ak = 0; ak < Math.min(ansKeys.length, 6); ak++) {
          var kLabel = ansKeys[ak];
          var kVal = String(ansMap[kLabel] || "").trim();
          if (kVal && kVal !== regStudentName && kVal !== regPhone && kVal !== regEmail && kVal !== regTgUser) {
            ansSummaryLines.push("• " + kLabel + ": " + kVal);
          }
        }
        if (attList.length > 0) {
          ansSummaryLines.push("المرفقات (" + attList.length + "):");
          for (var ai = 0; ai < attList.length; ai++) {
            if (attList[ai] && attList[ai].url) {
              ansSummaryLines.push("- " + (attList[ai].questionLabel || "مرفق") + ": " + attList[ai].url);
            }
          }
        }
        var regAdmObj = renderTelegramTemplateGS(ss, tgCfgSub, "admin_new_registration", {
          studentName: regStudentName,
          studentId: newRegId,
          programName: stage1ProgramName,
          phone: regPhone || "—",
          email: regEmail || "—",
          telegramUsername: regTgUser || "—",
          answersSummary: ansSummaryLines.join("\\n")
        });
        if (regAdmObj.enabled) {
          tgAdminNotified = Boolean(sendTelegramBotMessageGS(ss, tgCfgSub.adminChatId, regAdmObj.text, "").ok);
        }
      }

      // 4. إرسال نسخة بريد إلكتروني للإدارة (اختياري) + بريد ترحيبي HTML للمشترك مع روابط ورموز QR
      var portalTitleMail = String(data.academyName || "المنصة التعليمية").trim();
      var notifyEmailAddr = String(data.adminNotificationEmail || "").trim();
      var adminEmailSent = false;
      var adminEmailError = "";
      if (notifyEmailAddr && notifyEmailAddr.indexOf("@") !== -1) {
        try {
          var mailBody = "طلب تسجيل جديد في المنصة:\\n"
            + "الاسم: " + regStudentName + "\\n"
            + "رقم التسجيل (ID): " + newRegId + "\\n"
            + "القسم الحالي: " + stage1ProgramName + "\\n"
            + "الهاتف: " + regPhone + "\\n"
            + "البريد: " + regEmail + "\\n"
            + "معرف تيليغرام: " + regTgUser + "\\n\\n"
            + "الإجابات:\\n" + JSON.stringify(ansMap, null, 2);
          var admMailOpts = {
            to: notifyEmailAddr,
            name: portalTitleMail,
            subject: "تسجيل طالب جديد: " + regStudentName + " (ID: " + newRegId + ")",
            body: mailBody
          };
          if (regEmail && regEmail.indexOf("@") !== -1) {
            admMailOpts.replyTo = regEmail;
          }
          MailApp.sendEmail(admMailOpts);
          adminEmailSent = true;
        } catch (mailErr) {
          adminEmailError = String(mailErr && mailErr.message ? mailErr.message : mailErr || "Admin MailApp error");
        }
      }

      var studentEmailSent = false;
      var studentEmailError = "";
      if (data.sendStudentWelcomeEmail !== false && regEmail && regEmail.indexOf("@") !== -1) {
        try {
          var loginHrefMail = createdDirectUrl || activeBaseUrlSub;
          var stuMailBody = "مرحباً بك يا " + regStudentName + " في " + portalTitleMail + "!\\n\\n"
            + "تم تسجيلك بنجاح في المرحلة التمهيدية (" + stage1ProgramName + ").\\n\\n"
            + "بيانات دخولك الخاصة:\\n"
            + "• الاسم المسجل: " + regStudentName + "\\n"
            + "• رقم التسجيل (ID): " + newRegId + "\\n";
          if (tgDeepLink) {
            stuMailBody += "\\nالخطوة المهمة التالية — ربط تيليغرام:\\n"
              + "افتح هذا الرابط واضغط (بدء / Start) لتفعيل الإشعارات ومتابعة المعلم:\\n"
              + tgDeepLink + "\\n";
          }
          if (loginHrefMail) {
            stuMailBody += "\\nرابط الدخول المباشر إلى صفحتك الخاصة:\\n" + loginHrefMail + "\\n";
          }

          var escHtmlMail = function(txt) {
            return String(txt || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          };
          var stuHtmlBody = '<div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background:#f8fafc; padding:24px; color:#0f172a;">'
            + '<div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden;">'
            + '<div style="background:#064e3b; color:#ffffff; padding:20px 24px;">'
            + '<h2 style="margin:0; font-size:20px;">' + escHtmlMail(portalTitleMail) + '</h2>'
            + '<p style="margin:6px 0 0; font-size:13px; color:#a7f3d0;">تأكيد التسجيل وبيانات الدخول السريع</p>'
            + '</div>'
            + '<div style="padding:24px;">'
            + '<p style="margin:0 0 12px; font-size:15px;">مرحباً بك يا <strong>' + escHtmlMail(regStudentName) + '</strong>،</p>'
            + '<p style="margin:0 0 16px; font-size:13px; color:#475569; line-height:1.7;">تم اعتماد تسجيلك في المرحلة التمهيدية (<strong>' + escHtmlMail(stage1ProgramName) + '</strong>). احتفظ ببياناتك أدناه للدخول في أي وقت:</p>'
            + '<div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:16px; margin-bottom:18px; text-align:center;">'
            + '<div style="font-size:12px; color:#047857; font-weight:bold;">رقم التسجيل الخاص بك (Student ID)</div>'
            + '<div style="font-size:28px; font-weight:bold; color:#064e3b; letter-spacing:2px; margin-top:4px;">' + escHtmlMail(newRegId) + '</div>'
            + '<div style="font-size:12px; color:#065f46; margin-top:4px;">الاسم المسجل: ' + escHtmlMail(regStudentName) + '</div>'
            + '</div>';

          if (tgDeepLink) {
            stuHtmlBody += '<div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:16px; margin-bottom:16px; text-align:center;">'
              + '<div style="font-size:14px; font-weight:bold; color:#0369a1; margin-bottom:6px;">١ · ربط تيليغرام لمتابعة المعلم والإشعارات</div>'
              + '<p style="margin:0 0 12px; font-size:12px; color:#0c4a6e;">افتح الرابط أو امسح رمز QR ثم اضغط (بدء / Start) داخل البوت:</p>'
              + (createdTgQrUrl ? '<div style="margin-bottom:12px;"><img src="' + escHtmlMail(createdTgQrUrl) + '" alt="Telegram QR" width="160" height="160" style="border-radius:10px; border:1px solid #bae6fd; background:#ffffff; padding:6px;" /></div>' : '')
              + '<a href="' + escHtmlMail(tgDeepLink) + '" style="display:inline-block; background:#0284c7; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:10px; font-weight:bold; font-size:13px;">فتح بوت تيليغرام الآن</a>'
              + '</div>';
          }

          if (loginHrefMail) {
            stuHtmlBody += '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:16px; text-align:center;">'
              + '<div style="font-size:14px; font-weight:bold; color:#0f172a; margin-bottom:6px;">٢ · الدخول المباشر إلى صفحتك الخاصة</div>'
              + '<p style="margin:0 0 12px; font-size:12px; color:#475569;">ابدأ الإرشادات والنماذج التمهيدية عبر الرابط أو بمسح رمز QR:</p>'
              + (createdQrUrl ? '<div style="margin-bottom:12px;"><img src="' + escHtmlMail(createdQrUrl) + '" alt="Login QR" width="160" height="160" style="border-radius:10px; border:1px solid #cbd5e1; background:#ffffff; padding:6px;" /></div>' : '')
              + '<a href="' + escHtmlMail(loginHrefMail) + '" style="display:inline-block; background:#059669; color:#ffffff; text-decoration:none; padding:10px 20px; border-radius:10px; font-weight:bold; font-size:13px;">الدخول المباشر للمنصة</a>'
              + '</div>';
          }

          stuHtmlBody += '<p style="margin:12px 0 0; font-size:11px; color:#94a3b8; text-align:center;">هذه رسالة آلية من ' + escHtmlMail(portalTitleMail) + ' — نرجو الاحتفاظ بها.</p>'
            + '</div></div></div>';

          var stuMailOpts = {
            to: regEmail,
            name: portalTitleMail,
            subject: portalTitleMail + " — تأكيد التسجيل ورقم المشترك (" + newRegId + ")",
            body: stuMailBody,
            htmlBody: stuHtmlBody
          };
          if (notifyEmailAddr && notifyEmailAddr.indexOf("@") !== -1) {
            stuMailOpts.replyTo = notifyEmailAddr;
          }
          MailApp.sendEmail(stuMailOpts);
          studentEmailSent = true;
        } catch (stuMailErr) {
          studentEmailError = String(stuMailErr && stuMailErr.message ? stuMailErr.message : stuMailErr || "MailApp error");
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        registrationId: newRegId,
        telegramDeepLink: tgDeepLink,
        botUsername: cleanBotUser,
        tgAdminNotified: tgAdminNotified,
        adminEmailSent: adminEmailSent,
        adminEmailError: adminEmailError,
        studentEmailSent: studentEmailSent,
        studentEmailError: studentEmailError,
        student: {
          id: newRegId,
          name: regStudentName,
          status: "مفعّل",
          maxDevices: 1,
          devices: [],
          requireLocation: false,
          directLoginUrl: createdDirectUrl,
          qrImageUrl: createdQrUrl,
          programId: stage1ProgramId,
          telegramDirectUrl: tgDeepLink,
          telegramQrImageUrl: createdTgQrUrl
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_registration_submissions") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        submissions: readRegistrationSubmissionsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "transfer_registration_stage") {
      if (data.appBaseUrl) saveAppBaseUrlGS(data.appBaseUrl);
      var tRegId = normRegDigitsGS(data.registrationId || "");
      var tProgId = String(data.targetProgramId || "prog_default").trim();
      var tProgName = String(data.targetProgramName || tProgId).trim();
      var tStage = String(data.stage || "stage2_assigned").trim();
      var tStatusLabel = String(data.statusLabel || ("تم التحويل إلى: " + tProgName)).trim();
      var tAccountStatus = String(data.accountStatus || "مفعّل").trim();
      var tNotes = data.adminNotes !== undefined ? String(data.adminNotes) : undefined;

      // 1. تحديث ورقة ID registrants
      var rSheetT = getIDRegistrantsSheet(ss);
      var allRegsT = readAllRegistrantsGS(rSheetT);
      var matchedStudentNameT = String(data.studentName || "").trim();
      for (var riT = 0; riT < allRegsT.length; riT++) {
        if (allRegsT[riT].id === tRegId) {
          rSheetT.getRange(allRegsT[riT].rowNumber, 3).setValue(tAccountStatus);
          rSheetT.getRange(allRegsT[riT].rowNumber, 9).setValue(tProgId);
          if (!matchedStudentNameT) matchedStudentNameT = allRegsT[riT].name;
          break;
        }
      }

      // 2. تحديث ورقة طلبات_التسجيل
      var sSheetT = getRegistrationSubmissionsSheetGS(ss);
      if (sSheetT.getLastRow() >= 2) {
        var sRows = sSheetT.getRange(2, 1, sSheetT.getLastRow() - 1, 12).getValues();
        for (var si = 0; si < sRows.length; si++) {
          if (normRegDigitsGS(sRows[si][1]) === tRegId) {
            var rNum = si + 2;
            sSheetT.getRange(rNum, 4).setValue(tProgId);
            sSheetT.getRange(rNum, 5).setValue(tStage);
            sSheetT.getRange(rNum, 6).setValue(tStatusLabel);
            if (tNotes !== undefined) sSheetT.getRange(rNum, 12).setValue(tNotes);
          }
        }
      }

      // 3. إشعار الطالب والإدارة عبر تيليغرام عند الترقية/التحويل
      var tgCfgT = readTelegramConfigGS(ss);
      var tgNotifiedStudent = false;
      if (data.notifyStudentTelegram !== false && tgCfgT.botToken) {
        var sChatIdT = findStudentTelegramChatIdGS(ss, tRegId, matchedStudentNameT);
        if (sChatIdT) {
          var trStuObj = renderTelegramTemplateGS(ss, tgCfgT, "student_stage_transfer", {
            studentName: matchedStudentNameT || "مشتركنا الكريم",
            studentId: tRegId,
            programName: tProgName
          });
          if (trStuObj.enabled && sendTelegramBotMessageGS(ss, sChatIdT, trStuObj.text, "").ok) {
            tgNotifiedStudent = true;
          }
        }
      }
      if (tgCfgT.botToken && tgCfgT.adminChatId) {
        sendTelegramBotMessageGS(
          ss,
          tgCfgT.adminChatId,
          "تم تحويل المشترك <b>" + (matchedStudentNameT || tRegId) + "</b> (ID: <code>" + tRegId + "</code>) إلى برنامج: <b>" + tProgName + "</b>.",
          ""
        );
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        tgNotifiedStudent: tgNotifiedStudent,
        message: "تم تحويل المشترك (" + (matchedStudentNameT || tRegId) + ") إلى برنامج (" + tProgName + ") بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "delete_registration_submission") {
      var delId = normRegDigitsGS(data.registrationId || "");
      var delRowIdx = Number(data.rowIndex) || 0;
      var sSheetD = getRegistrationSubmissionsSheetGS(ss);
      if (delRowIdx >= 2 && delRowIdx <= sSheetD.getLastRow()) {
        sSheetD.deleteRow(delRowIdx);
      } else if (delId && sSheetD.getLastRow() >= 2) {
        var dRows = sSheetD.getRange(2, 1, sSheetD.getLastRow() - 1, 2).getValues();
        for (var diD = dRows.length - 1; diD >= 0; diD--) {
          if (normRegDigitsGS(dRows[diD][1]) === delId) {
            sSheetD.deleteRow(diD + 2);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        message: "تم حذف سجل الطلب بنجاح."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // طلب الالتحاق ببرنامج معين لمشترك حالي (مع التحقق من الاسم والرقم في ID registrants) -> ورقة "طلبات_البرامج"
    if (data.action === "submit_program_request") {
      var reqNameIn = String(data.studentName || "").trim();
      var reqIdIn = normRegDigitsGS(data.studentId || "");
      var rSheetPr = getIDRegistrantsSheet(ss);
      var allRegsPr = readAllRegistrantsGS(rSheetPr);
      var normReqName = normRegArabicGS(reqNameIn);
      var foundReg = null;
      for (var pi = 0; pi < allRegsPr.length; pi++) {
        if (allRegsPr[pi].id === reqIdIn && normRegArabicGS(allRegsPr[pi].name) === normReqName) {
          foundReg = allRegsPr[pi];
          break;
        }
      }
      if (!foundReg) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          portalHandled: true,
          notFound: true,
          error: "لم نتمكن من مطابقة الاسم ورقم المشترك في السجل. إذا كنت طالباً جديداً يرجى تعبئة استمارة التسجيل أولاً."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      if (isRegistrantDisabledGS(foundReg.status)) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          portalHandled: true,
          disabled: true,
          error: "هذا الحساب موقوف أو معلّق حالياً، يرجى التواصل مع الإدارة."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var prSheet = getProgramRequestsSheetGS(ss);
      var prId = "PR-" + new Date().getTime().toString().slice(-6);
      var nowPr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Riyadh", "yyyy/MM/dd HH:mm");
      var targetCardId = String(data.targetProgramCardId || "").trim();
      var targetTitle = String(data.targetProgramTitle || "").trim();
      var targetProgId = String(data.targetProgramId || "").trim();
      var stuNote = String(data.studentNote || "").trim();

      prSheet.appendRow([
        prId,
        nowPr,
        foundReg.id,
        foundReg.name,
        foundReg.programId || "",
        targetCardId,
        targetTitle,
        targetProgId,
        "pending",
        "قيد المراجعة",
        stuNote,
        ""
      ]);

      var tgCfgPr = readTelegramConfigGS(ss);
      if (tgCfgPr.botToken && tgCfgPr.adminChatId) {
        var admPrObj = renderTelegramTemplateGS(ss, tgCfgPr, "admin_program_request", {
          studentName: foundReg.name,
          studentId: foundReg.id,
          programName: targetTitle,
          notes: stuNote || "لا توجد ملاحظة"
        });
        if (admPrObj.enabled) {
          sendTelegramBotMessageGS(ss, tgCfgPr.adminChatId, admPrObj.text, "");
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        requestId: prId,
        student: {
          id: foundReg.id,
          name: foundReg.name,
          status: foundReg.status,
          maxDevices: foundReg.maxDevices,
          devices: foundReg.devices,
          requireLocation: foundReg.requireLocation,
          directLoginUrl: foundReg.directLoginUrl,
          qrImageUrl: foundReg.qrImageUrl,
          programId: foundReg.programId
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "get_program_requests") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        requests: readProgramRequestsGS(ss)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "update_program_request_status") {
      var uReqId = String(data.requestId || "").trim();
      var uRowIdx = Number(data.rowIndex) || 0;
      var rawRegIn = String(data.registrationId || "").trim();
      var uRegId = rawRegIn.toUpperCase() === "NEW" ? "" : normRegDigitsGS(rawRegIn);
      var uStatus = String(data.status || "approved").trim();
      var uStatusLabel = String(data.statusLabel || (uStatus === "approved" ? "تمت الموافقة والترقية" : "مرفوض / مؤجل")).trim();
      var uTargetProgId = String(data.targetProgramId || "").trim();
      var uTargetProgName = String(data.targetProgramName || uTargetProgId).trim();
      var uAdminNotes = data.adminNotes !== undefined ? String(data.adminNotes) : undefined;

      var prSheetU = getProgramRequestsSheetGS(ss);
      var targetPrRow = 0;
      if (uRowIdx >= 2 && uRowIdx <= prSheetU.getLastRow()) {
        targetPrRow = uRowIdx;
      } else if (uReqId && prSheetU.getLastRow() >= 2) {
        var prRowsU = prSheetU.getRange(2, 1, prSheetU.getLastRow() - 1, 1).getValues();
        for (var ui = 0; ui < prRowsU.length; ui++) {
          if (String(prRowsU[ui][0] || "").trim() === uReqId) {
            targetPrRow = ui + 2;
            break;
          }
        }
      }

      if (targetPrRow >= 2) {
        prSheetU.getRange(targetPrRow, 9).setValue(uStatus);
        prSheetU.getRange(targetPrRow, 10).setValue(uStatusLabel);
        if (uTargetProgId) prSheetU.getRange(targetPrRow, 8).setValue(uTargetProgId);
        if (uAdminNotes !== undefined) prSheetU.getRange(targetPrRow, 12).setValue(uAdminNotes);
      }

      var tgNotifiedU = false;
      var matchedNameU = String(data.studentName || "").trim();
      var finalAssignedRegId = uRegId;

      if (uStatus === "approved" && uTargetProgId) {
        var rSheetU = getIDRegistrantsSheet(ss);
        var allRegsU = readAllRegistrantsGS(rSheetU);
        var foundExistingReg = false;
        if (uRegId) {
          for (var ru = 0; ru < allRegsU.length; ru++) {
            if (allRegsU[ru].id === uRegId) {
              rSheetU.getRange(allRegsU[ru].rowNumber, 3).setValue("مفعّل");
              rSheetU.getRange(allRegsU[ru].rowNumber, 9).setValue(uTargetProgId);
              if (!matchedNameU) matchedNameU = allRegsU[ru].name;
              foundExistingReg = true;
              break;
            }
          }
        }

        // إذا كان المتقدم عبر المتجر طالباً جديداً (لا يملك ID مسبقاً) -> إنشاء رقم ID عشوائي غير متسلسل وتفعيله على البرنامج
        if (!foundExistingReg && matchedNameU) {
          finalAssignedRegId = generateNextRegistrantIdGS(rSheetU, ss, "random", 7);
          rSheetU.appendRow([finalAssignedRegId, matchedNameU, "مفعّل", 1, "[]", "مسموح", "", "", uTargetProgId, "", ""]);
          var newRegRowNum = rSheetU.getLastRow();
          var activeBaseU = String(getAppBaseUrlGS() || "").trim();
          var tgBotApprove = String(readTelegramConfigGS(ss).botUsername || "").replace(/^@/, "").trim();
          syncRegistrantLinkAndQrCellsGS(rSheetU, newRegRowNum, finalAssignedRegId, matchedNameU, activeBaseU, tgBotApprove);
          if (targetPrRow >= 2) {
            prSheetU.getRange(targetPrRow, 3).setValue(finalAssignedRegId);
          }
        }

        if (finalAssignedRegId) {
          var subSheetU = getRegistrationSubmissionsSheetGS(ss);
          if (subSheetU.getLastRow() >= 2) {
            var sRowsU = subSheetU.getRange(2, 1, subSheetU.getLastRow() - 1, 12).getValues();
            for (var su = 0; su < sRowsU.length; su++) {
              if (normRegDigitsGS(sRowsU[su][1]) === finalAssignedRegId) {
                var srNum = su + 2;
                subSheetU.getRange(srNum, 4).setValue(uTargetProgId);
                subSheetU.getRange(srNum, 5).setValue("stage2_assigned");
                subSheetU.getRange(srNum, 6).setValue("تم التحويل إلى: " + uTargetProgName);
              }
            }
          }
          var tgCfgU = readTelegramConfigGS(ss);
          if (data.notifyStudentTelegram !== false && tgCfgU.botToken) {
            var sChatU = findStudentTelegramChatIdGS(ss, finalAssignedRegId, matchedNameU);
            if (sChatU) {
              var appStuObj = renderTelegramTemplateGS(ss, tgCfgU, "student_program_approved", {
                studentName: matchedNameU || "مشتركنا الكريم",
                studentId: finalAssignedRegId,
                programName: uTargetProgName
              });
              if (appStuObj.enabled && sendTelegramBotMessageGS(ss, sChatU, appStuObj.text, "").ok) {
                tgNotifiedU = true;
              }
            }
          }
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        assignedRegistrationId: finalAssignedRegId,
        tgNotifiedStudent: tgNotifiedU,
        message: uStatus === "approved"
          ? ("تمت الموافقة ونقل المشترك (" + (matchedNameU || finalAssignedRegId) + ") برقم ID: " + finalAssignedRegId + " إلى " + uTargetProgName)
          : "تم تحديث حالة طلب البرنامج بنجاح."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "delete_program_request") {
      var delPrRow = Number(data.rowIndex) || 0;
      var delPrId = String(data.requestId || "").trim();
      var prSheetD = getProgramRequestsSheetGS(ss);
      if (delPrRow >= 2 && delPrRow <= prSheetD.getLastRow()) {
        prSheetD.deleteRow(delPrRow);
      } else if (delPrId && prSheetD.getLastRow() >= 2) {
        var prRowsD = prSheetD.getRange(2, 1, prSheetD.getLastRow() - 1, 1).getValues();
        for (var pdi = prRowsD.length - 1; pdi >= 0; pdi--) {
          if (String(prRowsD[pdi][0] || "").trim() === delPrId) {
            prSheetD.deleteRow(pdi + 2);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        portalHandled: true,
        message: "تم حذف طلب البرنامج."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (-1-د) نقاط نهاية المتجر الإلكتروني (متجر_*) + تسويق البرامج الموحد
    if (data.action === "get_store_data") {
      var stIncludeAdmin = Boolean(data.includeAdminData);
      var tgInfoStP = readTelegramConfigGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        storeData: readStoreDataGS(ss, stIncludeAdmin),
        telegramConfigured: Boolean(tgInfoStP.botToken && tgInfoStP.adminChatId),
        botUsername: tgInfoStP.botUsername || ""
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_store_data") {
      writeStoreDataGS(ss, data.storeData || {});
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        storeData: readStoreDataGS(ss, true),
        message: "تم حفظ ومزامنة كامل بيانات المتجر في أوراق متجر_* بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "create_store_order") {
      var ordIn = data.order || {};
      var curStore = readStoreDataGS(ss, false);
      var prodSheetO = ss.getSheetByName(STORE_PRODUCTS_SHEET);
      var prodListO = (curStore && Array.isArray(curStore.products)) ? curStore.products : [];
      var itemsIn = Array.isArray(ordIn.items) ? ordIn.items : [];
      if (itemsIn.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          storeHandled: true,
          error: "السلة فارغة."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // خصم المخزون من ورقة متجر_المنتجات إذا كانت موجودة
      if (prodSheetO && prodSheetO.getLastRow() >= 2 && prodListO.length > 0) {
        var prodRowsO = prodSheetO.getRange(2, 1, prodSheetO.getLastRow() - 1, Math.max(14, prodSheetO.getLastColumn())).getValues();
        for (var oi = 0; oi < itemsIn.length; oi++) {
          var oItem = itemsIn[oi];
          for (var pi = 0; pi < prodRowsO.length; pi++) {
            if (String(prodRowsO[pi][0] || "").trim() === String(oItem.product_id || "").trim()) {
              var curStock = Math.max(0, Number(prodRowsO[pi][7]) || 0);
              var newStock = Math.max(0, curStock - (Number(oItem.qty) || 1));
              prodSheetO.getRange(pi + 2, 8).setValue(newStock);
              break;
            }
          }
        }
      }

      // تحديث عداد استخدام الكوبون إذا طُبّق
      var usedCouponCode = String(ordIn.coupon_code || "").trim().toUpperCase();
      if (usedCouponCode) {
        var coupSheetO = ss.getSheetByName(STORE_COUPONS_SHEET);
        if (coupSheetO && coupSheetO.getLastRow() >= 2) {
          var coupRowsO = coupSheetO.getRange(2, 1, coupSheetO.getLastRow() - 1, 9).getValues();
          for (var ci = 0; ci < coupRowsO.length; ci++) {
            if (String(coupRowsO[ci][1] || "").trim().toUpperCase() === usedCouponCode) {
              coupSheetO.getRange(ci + 2, 7).setValue((Number(coupRowsO[ci][6]) || 0) + 1);
              break;
            }
          }
        }
      }

      var ordSheet = getStoreOrdersSheetGS(ss);
      var ordItemsSheet = getStoreOrderItemsSheetGS(ss);
      var finalOrderId = "ORD-" + (1000 + ordSheet.getLastRow() + 1);
      var createdIso = String(ordIn.created_at || new Date().toISOString());
      var finalOrder = {
        id: finalOrderId,
        created_at: createdIso,
        customer_name: String(ordIn.customer_name || "").trim(),
        customer_phone: String(ordIn.customer_phone || "").trim(),
        customer_city: String(ordIn.customer_city || "").trim(),
        customer_address: String(ordIn.customer_address || "").trim(),
        telegram_username: String(ordIn.telegram_username || "").trim(),
        payment_method: String(ordIn.payment_method || "cod") === "bank_transfer" ? "bank_transfer" : "cod",
        bank_reference: String(ordIn.bank_reference || "").trim(),
        coupon_code: usedCouponCode,
        discount_amount: Number(ordIn.discount_amount) || 0,
        items: itemsIn,
        subtotal: Number(ordIn.subtotal) || 0,
        delivery_fee: Number(ordIn.delivery_fee) || 0,
        total: Number(ordIn.total) || 0,
        status: "pending",
        notes: String(ordIn.notes || "").trim()
      };

      ordSheet.appendRow([
        finalOrder.id, finalOrder.created_at, finalOrder.customer_name, finalOrder.customer_phone,
        finalOrder.customer_city, finalOrder.customer_address, finalOrder.telegram_username,
        finalOrder.payment_method, finalOrder.bank_reference, finalOrder.coupon_code,
        finalOrder.discount_amount, JSON.stringify(finalOrder.items), finalOrder.subtotal,
        finalOrder.delivery_fee, finalOrder.total, finalOrder.status, finalOrder.notes
      ]);

      var itemRowsO = finalOrder.items.map(function(it) {
        return [
          finalOrder.id, finalOrder.created_at, it.product_id || "", it.sku || "",
          it.name || "", it.variant || "", Number(it.qty) || 1, Number(it.unit_price) || 0, Number(it.line_total) || 0
        ];
      });
      if (itemRowsO.length > 0) {
        ordItemsSheet.getRange(ordItemsSheet.getLastRow() + 1, 1, itemRowsO.length, 9).setValues(itemRowsO);
      }

      var tgNotifiedOrder = false;
      var tgCfgO = readTelegramConfigGS(ss);
      if (data.notifyTelegram !== false && tgCfgO.botToken && tgCfgO.adminChatId) {
        var curCode = String(data.currency || "ر.س");
        var itemsLines = [];
        for (var k = 0; k < finalOrder.items.length; k++) {
          var oi2 = finalOrder.items[k];
          itemsLines.push("• " + oi2.name + (oi2.variant ? " (" + oi2.variant + ")" : "") + " × " + oi2.qty + " = " + oi2.line_total + " " + curCode);
        }
        var payTxtOrd = (finalOrder.payment_method === "bank_transfer" ? "تحويل بنكي" : "الدفع عند الاستلام")
          + (finalOrder.bank_reference ? (" — مرجع: " + finalOrder.bank_reference) : "");
        var ordAdmObj = renderTelegramTemplateGS(ss, tgCfgO, "admin_store_order", {
          orderId: finalOrder.id,
          customerName: finalOrder.customer_name,
          phone: finalOrder.customer_phone,
          city: finalOrder.customer_city || "—",
          paymentMethod: payTxtOrd,
          itemsSummary: itemsLines.join("\\n"),
          total: finalOrder.total,
          currency: curCode
        });
        if (ordAdmObj.enabled && sendTelegramBotMessageGS(ss, tgCfgO.adminChatId, ordAdmObj.text, "").ok) {
          tgNotifiedOrder = true;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        order: finalOrder,
        telegramNotified: tgNotifiedOrder
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "track_store_order") {
      var trOrdId = String(data.orderId || "").trim().toUpperCase();
      var trPhone = normRegDigitsGS(data.phone || "");
      var allOrdsT = readStoreDataGS(ss, true).orders || [];
      var foundOrdT = null;
      for (var ti = 0; ti < allOrdsT.length; ti++) {
        var curO = allOrdsT[ti];
        if (String(curO.id || "").trim().toUpperCase() === trOrdId) {
          var pClean = normRegDigitsGS(curO.customer_phone || "");
          if (!trPhone || pClean.slice(-9) === trPhone.slice(-9)) {
            foundOrdT = curO;
            break;
          }
        }
      }
      if (!foundOrdT) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          storeHandled: true,
          error: "لم يتم العثور على طلب مطابق لرقم الطلب والجوال."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        order: foundOrdT
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "update_store_order_status") {
      var uOrdId = String(data.orderId || "").trim();
      var uOrdStatus = String(data.status || "pending").trim();
      var ordSheetU = getStoreOrdersSheetGS(ss);
      if (ordSheetU.getLastRow() >= 2) {
        var oRowsU = ordSheetU.getRange(2, 1, ordSheetU.getLastRow() - 1, 1).getValues();
        for (var oiU = 0; oiU < oRowsU.length; oiU++) {
          if (String(oRowsU[oiU][0] || "").trim() === uOrdId) {
            ordSheetU.getRange(oiU + 2, 16).setValue(uOrdStatus);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        message: "تم تحديث حالة الطلب بنجاح."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "delete_store_order") {
      var delOrdId = String(data.orderId || "").trim();
      var ordSheetD = getStoreOrdersSheetGS(ss);
      if (ordSheetD.getLastRow() >= 2) {
        var oRowsD = ordSheetD.getRange(2, 1, ordSheetD.getLastRow() - 1, 1).getValues();
        for (var oiD = oRowsD.length - 1; oiD >= 0; oiD--) {
          if (String(oRowsD[oiD][0] || "").trim() === delOrdId) {
            ordSheetD.deleteRow(oiD + 2);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        message: "تم حذف الطلب من ورقة متجر_الطلبات."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "submit_store_program_enrollment") {
      var spName = String(data.studentName || "").trim();
      var spPhone = normRegDigitsGS(data.phone || "");
      var spIdInput = normRegDigitsGS(data.studentId || "");
      var spCardId = String(data.programCardId || "").trim();
      var spTitle = String(data.programTitle || "").trim();
      var spTargetProgId = String(data.targetProgramId || "").trim();
      var spPayMethod = String(data.paymentMethod || "free").trim();
      var spBankRef = String(data.bankReference || "").trim();
      var spPricePaid = Number(data.pricePaid) || 0;
      var spCurrency = String(data.currency || "ر.س");
      var spTgUser = String(data.telegramUsername || "").trim();
      var spNote = String(data.notes || "").trim();

      if (!spName || !spPhone) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          storeHandled: true,
          error: "يرجى إدخال الاسم الكامل ورقم الجوال."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var rSheetSP = getIDRegistrantsSheet(ss);
      var allRegsSP = readAllRegistrantsGS(rSheetSP);
      var existingRegSP = null;
      if (spIdInput) {
        for (var rsi = 0; rsi < allRegsSP.length; rsi++) {
          if (allRegsSP[rsi].id === spIdInput) {
            existingRegSP = allRegsSP[rsi];
            break;
          }
        }
      }

      var prSheetSP = getProgramRequestsSheetGS(ss);
      var spReqId = "ENR-" + new Date().getTime().toString().slice(-6);
      var nowSP = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Riyadh", "yyyy/MM/dd HH:mm");
      var extraStoreMeta = {
        phone: spPhone,
        telegramUsername: spTgUser,
        paymentMethod: spPayMethod,
        bankReference: spBankRef,
        pricePaid: spPricePaid,
        source: "store"
      };
      var statusDescSP = spPricePaid > 0
        ? ("تسجيل مدفوع من المتجر (" + spPricePaid + " " + spCurrency + ") · قيد المراجعة")
        : "تسجيل من المتجر · قيد المراجعة";

      prSheetSP.appendRow([
        spReqId,
        nowSP,
        existingRegSP ? existingRegSP.id : "NEW",
        spName,
        existingRegSP ? (existingRegSP.programId || "") : "",
        spCardId,
        spTitle,
        spTargetProgId,
        "pending",
        statusDescSP,
        spNote,
        "",
        JSON.stringify(extraStoreMeta)
      ]);

      // تقليص المقاعد المتبقية بمقدار 1 في ورقة محتوى_البوابة_العامة إن أمكن
      var pDataSP = readPortalDataGS(ss);
      if (pDataSP && Array.isArray(pDataSP.items)) {
        var seatsChanged = false;
        for (var psi = 0; psi < pDataSP.items.length; psi++) {
          if (pDataSP.items[psi].id === spCardId && pDataSP.items[psi].seatsLeft !== undefined && pDataSP.items[psi].seatsLeft > 0) {
            pDataSP.items[psi].seatsLeft = Math.max(0, Number(pDataSP.items[psi].seatsLeft) - 1);
            seatsChanged = true;
            break;
          }
        }
        if (seatsChanged) writePortalDataGS(ss, pDataSP);
      }

      var tgNotifiedSP = false;
      var tgCfgSP = readTelegramConfigGS(ss);
      if (tgCfgSP.botToken && tgCfgSP.adminChatId) {
        var payLabelSP = spPayMethod === "free" ? "مجاني" : (spPayMethod === "bank_transfer" ? "تحويل بنكي" : "الدفع عند الاستلام");
        var priceTxtSP = (spPricePaid > 0 ? (spPricePaid + " " + spCurrency) : "مجاني") + " · " + payLabelSP + (spBankRef ? (" (" + spBankRef + ")") : "");
        var spNoteFull = [spNote, spTgUser ? ("تيليغرام: " + spTgUser) : ""].filter(Boolean).join(" · ") || "لا توجد ملاحظة";
        var spAdmObj = renderTelegramTemplateGS(ss, tgCfgSP, "admin_store_program_enroll", {
          requestId: spReqId,
          programName: spTitle,
          studentName: spName,
          studentId: existingRegSP ? ("ID: " + existingRegSP.id) : "متقدم جديد",
          phone: spPhone,
          priceLabel: priceTxtSP,
          notes: spNoteFull
        });
        if (spAdmObj.enabled && sendTelegramBotMessageGS(ss, tgCfgSP.adminChatId, spAdmObj.text, "").ok) {
          tgNotifiedSP = true;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        storeHandled: true,
        requestId: spReqId,
        registrationId: existingRegSP ? existingRegSP.id : "NEW",
        student: existingRegSP || undefined,
        telegramNotified: tgNotifiedSP
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0) جلب قائمة المشتركين من ورقة "ID registrants" مع بيانات الحالة والأجهزة وإجبار الموقع والبرنامج ورابط الدخول
    if (data.action === "get_registrants" || data.action === "verify_student") {
      var regSheet = getIDRegistrantsSheet(ss);
      var rows = readAllRegistrantsGS(regSheet).map(function(r) {
        return {
          id: r.id,
          name: r.name,
          status: r.status,
          maxDevices: r.maxDevices,
          devices: r.devices,
          requireLocation: Boolean(r.requireLocation),
          directLoginUrl: r.directLoginUrl || "",
          qrImageUrl: r.qrImageUrl || "",
          programId: r.programId || "",
          telegramDirectUrl: r.telegramDirectUrl || "",
          telegramQrImageUrl: r.telegramQrImageUrl || ""
        };
      });
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        supportsDeviceSecurity: true,
        registrants: rows
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-أ) التحقق الآمن من دخول الطالب مع تفعيل الحالة والحد الأقصى للأجهزة وإجبار/تحديد الموقع الجغرافي
    if (data.action === "verify_student_login") {
      var regSheet = getIDRegistrantsSheet(ss);
      var allRegs = readAllRegistrantsGS(regSheet);
      var cleanInId = normRegDigitsGS(data.studentId || data.id || "");
      var normInName = normRegArabicGS(data.studentName || data.name || "");
      var deviceId = String(data.deviceId || "").trim();

      var matchedRow = null;
      var idOnlyMatch = null;
      var nameOnlyMatch = null;
      for (var ri = 0; ri < allRegs.length; ri++) {
        var item = allRegs[ri];
        var sameId = item.id === cleanInId;
        var sameName = normRegArabicGS(item.name) === normInName;
        if (sameId && sameName) {
          matchedRow = item;
          break;
        }
        if (sameId && !idOnlyMatch) idOnlyMatch = item;
        if (sameName && !nameOnlyMatch) nameOnlyMatch = item;
      }

      if (!matchedRow) {
        var errMsg = "عفواً، لم يتم العثور على هذا الاسم والرقم في ورقة (ID registrants). تأكد من صحة البيانات.";
        if (idOnlyMatch) {
          errMsg = "رقم ID موجود ولكن الاسم غير مطابق للاسم المسجل في ورقة ID registrants (" + idOnlyMatch.name + ").";
        } else if (nameOnlyMatch) {
          errMsg = "الاسم مسجل ولكن رقم ID غير مطابق للرقم المسجل له في ورقة (ID registrants).";
        }
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          loginCheckHandled: true,
          errorCode: "INVALID_CREDENTIALS",
          error: errMsg
        })).setMimeType(ContentService.MimeType.JSON);
      }

      if (isRegistrantDisabledGS(matchedRow.status)) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          loginCheckHandled: true,
          errorCode: "ACCOUNT_DISABLED",
          error: "تم تعطيل هذا الحساب. يرجى التواصل مع الإدارة."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var hasCoords = data.lat !== null && data.lat !== undefined && data.lat !== ""
        && data.lng !== null && data.lng !== undefined && data.lng !== ""
        && !isNaN(Number(data.lat)) && !isNaN(Number(data.lng));

      if (matchedRow.requireLocation && !hasCoords) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          loginCheckHandled: true,
          errorCode: "LOCATION_REQUIRED",
          error: "هذا الحساب يتطلب تفعيل وتحديد الموقع الجغرافي (Location) للدخول. يرجى السماح بصلاحية الموقع والمحاولة مرة أخرى."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var maxDev = Math.max(1, Number(matchedRow.maxDevices) || 1);
      var devList = Array.isArray(matchedRow.devices) ? matchedRow.devices.slice() : [];
      if (deviceId) {
        var locLabel = reverseGeocodeLocGS(data.lat, data.lng);
        var nowStamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "Asia/Riyadh", "yyyy-MM-dd HH:mm");
        var devIdx = -1;
        for (var di = 0; di < devList.length; di++) {
          if (String(devList[di].deviceId || "") === deviceId) {
            devIdx = di;
            break;
          }
        }
        if (devIdx !== -1) {
          devList[devIdx].lastLogin = nowStamp;
          if (locLabel && locLabel !== "غير متاح") {
            devList[devIdx].location = locLabel;
          } else if (!devList[devIdx].location) {
            devList[devIdx].location = "غير متاح";
          }
        } else {
          if (devList.length >= maxDev) {
            return ContentService.createTextOutput(JSON.stringify({
              success: false,
              loginCheckHandled: true,
              errorCode: "DEVICE_LIMIT_EXCEEDED",
              error: "تم تجاوز الحد الأقصى لعدد الأجهزة المسموحة (" + maxDev + " جهاز/أجهزة). يرجى التواصل مع المعلم لتصفير الأجهزة."
            })).setMimeType(ContentService.MimeType.JSON);
          }
          devList.push({
            deviceId: deviceId,
            location: locLabel,
            lastLogin: nowStamp
          });
        }
        regSheet.getRange(matchedRow.rowNumber, 5).setValue(JSON.stringify(devList));
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        loginCheckHandled: true,
        student: {
          id: matchedRow.id,
          name: matchedRow.name,
          status: matchedRow.status,
          maxDevices: maxDev,
          devices: devList,
          requireLocation: Boolean(matchedRow.requireLocation),
          directLoginUrl: matchedRow.directLoginUrl || "",
          qrImageUrl: matchedRow.qrImageUrl || "",
          programId: matchedRow.programId || "",
          telegramDirectUrl: matchedRow.telegramDirectUrl || "",
          telegramQrImageUrl: matchedRow.telegramQrImageUrl || ""
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ب) إنشاء وتجهيز ورقة "ID registrants" أو إضافة مشترك
    if (data.action === "init_registrants_sheet" || data.action === "add_registrant") {
      if (data.appBaseUrl) saveAppBaseUrlGS(data.appBaseUrl);
      var regSheet = getIDRegistrantsSheet(ss);
      var activeBaseUrl = String(data.appBaseUrl || getAppBaseUrlGS() || "").trim();
      var activeBotReg = String(readTelegramConfigGS(ss).botUsername || data.botUsername || "").replace(/^@/, "").trim();

      if (data.id && data.name) {
        var newId = normRegDigitsGS(data.id);
        var newName = String(data.name).trim();
        var newStatus = String(data.status || "مفعّل").trim() || "مفعّل";
        var newMax = Math.max(1, Math.min(10, Number(data.maxDevices) || 1));
        var newReqLoc = isLocationRequiredGS(data.requireLocation) ? "إجبار" : "مسموح";
        var newProgId = String(data.programId || "").trim();
        var existingRows = readAllRegistrantsGS(regSheet);
        var existingRow = null;
        for (var k = 0; k < existingRows.length; k++) {
          if (existingRows[k].id === newId) {
            existingRow = existingRows[k];
            break;
          }
        }
        var targetRowNum;
        if (existingRow) {
          targetRowNum = existingRow.rowNumber;
          regSheet.getRange(targetRowNum, 1, 1, 4).setValues([[newId, newName, newStatus, newMax]]);
          regSheet.getRange(targetRowNum, 6).setValue(newReqLoc);
          regSheet.getRange(targetRowNum, 9).setValue(newProgId);
        } else {
          regSheet.appendRow([newId, newName, newStatus, newMax, "[]", newReqLoc, "", "", newProgId, "", ""]);
          targetRowNum = regSheet.getLastRow();
        }
        syncRegistrantLinkAndQrCellsGS(regSheet, targetRowNum, newId, newName, activeBaseUrl, activeBotReg);
      } else if (data.action === "init_registrants_sheet") {
        // تعبئة الأعمدة الناقصة (إجبار الموقع + الرابط المباشر + QR + رابط وQR تيليغرام السريع) لجميع الصفوف الحالية
        var allToUpgrade = readAllRegistrantsGS(regSheet);
        for (var ui = 0; ui < allToUpgrade.length; ui++) {
          var uRow = allToUpgrade[ui];
          var curReqVal = String(regSheet.getRange(uRow.rowNumber, 6).getValue() || "").trim();
          if (!curReqVal) {
            regSheet.getRange(uRow.rowNumber, 6).setValue("مسموح");
          }
          syncRegistrantLinkAndQrCellsGS(regSheet, uRow.rowNumber, uRow.id, uRow.name, activeBaseUrl, activeBotReg);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        registrantHandled: true,
        message: "تم إعداد وحفظ ورقة ID registrants بالأعمدة الـ 11 بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-د) تعديل بيانات مشترك (ID، الاسم، الحالة، عدد الأجهزة، إجبار الموقع، البرنامج، الرابط وQR)
    if (data.action === "update_registrant") {
      if (data.appBaseUrl) saveAppBaseUrlGS(data.appBaseUrl);
      var regSheet = getIDRegistrantsSheet(ss);
      var rows = readAllRegistrantsGS(regSheet);
      var origId = normRegDigitsGS(data.originalId || data.id || "");
      var targetRow = null;
      for (var k = 0; k < rows.length; k++) {
        if (rows[k].id === origId) {
          targetRow = rows[k];
          break;
        }
      }
      if (!targetRow) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          registrantHandled: true,
          error: "لم يتم العثور على المشترك لتعديله."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      var nextId = normRegDigitsGS(data.id || targetRow.id);
      var nextName = String(data.name || targetRow.name).trim();
      var nextStatus = String(data.status || targetRow.status || "مفعّل").trim();
      var nextMax = Math.max(1, Math.min(10, Number(data.maxDevices) || targetRow.maxDevices || 1));
      var nextReqLoc = data.requireLocation !== undefined
        ? (isLocationRequiredGS(data.requireLocation) ? "إجبار" : "مسموح")
        : (targetRow.requireLocation ? "إجبار" : "مسموح");
      var nextProgId = data.programId !== undefined
        ? String(data.programId || "").trim()
        : (targetRow.programId || "");
      regSheet.getRange(targetRow.rowNumber, 1, 1, 4).setValues([[nextId, nextName, nextStatus, nextMax]]);
      regSheet.getRange(targetRow.rowNumber, 6).setValue(nextReqLoc);
      regSheet.getRange(targetRow.rowNumber, 9).setValue(nextProgId);
      var activeBaseUrlUpd = String(data.appBaseUrl || getAppBaseUrlGS() || "").trim();
      var activeBotUpd = String(readTelegramConfigGS(ss).botUsername || data.botUsername || "").replace(/^@/, "").trim();
      syncRegistrantLinkAndQrCellsGS(regSheet, targetRow.rowNumber, nextId, nextName, activeBaseUrlUpd, activeBotUpd);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        registrantHandled: true,
        message: "تم تحديث بيانات المشترك بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-هـ) تصفير الأجهزة المسجلة لمشترك
    if (data.action === "reset_registrant_devices") {
      var regSheet = getIDRegistrantsSheet(ss);
      var rows = readAllRegistrantsGS(regSheet);
      var targetId = normRegDigitsGS(data.id || "");
      var targetRow = null;
      for (var k = 0; k < rows.length; k++) {
        if (rows[k].id === targetId) {
          targetRow = rows[k];
          break;
        }
      }
      if (!targetRow) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          registrantHandled: true,
          error: "لم يتم العثور على المشترك."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      regSheet.getRange(targetRow.rowNumber, 5).setValue("[]");
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        registrantHandled: true,
        message: "تم تصفير جميع الأجهزة المسجلة للطالب بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-و) حذف مشترك من ورقة "ID registrants"
    if (data.action === "delete_registrant") {
      var regSheet = getIDRegistrantsSheet(ss);
      var rows = readAllRegistrantsGS(regSheet);
      var targetId = normRegDigitsGS(data.id || "");
      for (var k = rows.length - 1; k >= 0; k--) {
        if (rows[k].id === targetId) {
          regSheet.deleteRow(rows[k].rowNumber);
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            registrantHandled: true,
            message: "تم حذف المشترك من الشيت بنجاح"
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        registrantHandled: true,
        error: "لم يتم العثور على المشترك لحذفه."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ج) حفظ الترجمات في ورقة "الترجمة" وتحديث النصوص في ورقة "الرئيسية"
    if (data.action === "save_translations") {
      var tSheet = ss.getSheetByName("الترجمة") || ss.getSheetByName("Translations");
      if (!tSheet) {
        tSheet = ss.insertSheet("الترجمة");
        tSheet.getRange(1, 1, 1, 5).setValues([["المعرف (Key)", "القسم (Category)", "النص العربي (Arabic)", "الترجمة التايلاندية (Thai)", "الترجمة الإنجليزية (English)"]]);
        tSheet.getRange(1, 1, 1, 5).setBackground("#e0e7ff").setFontWeight("bold");
      }
      var tItems = data.items || [];
      if (tItems.length > 0) {
        if (tSheet.getLastRow() > 1) {
          tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 5).clearContent();
        }
        var tRows = tItems.map(function(item) {
          return [item.id, item.category || "", item.ar || "", item.th || "", item.en || ""];
        });
        tSheet.getRange(2, 1, tRows.length, 5).setValues(tRows);

        // مزامنة النصوص مع ورقة "الرئيسية" وورقة "الدروس" (العامود 6 المعنى، والعامود 7 المخرج)
        var hSheet = ss.getSheetByName("الرئيسية");
        var lSheet = ss.getSheetByName("الدروس");
        for (var k = 0; k < tItems.length; k++) {
          var itm = tItems[k];
          if (hSheet) {
            if (itm.id === "nav_platform_title") hSheet.getRange(3, 2).setValue(itm.ar || "");
            if (itm.id === "nav_platform_subtitle") hSheet.getRange(4, 2).setValue(itm.ar || "");
            if (itm.id === "home_card_title") hSheet.getRange(23, 2).setValue(itm.ar || "");
            if (itm.id === "home_card_subtitle") hSheet.getRange(24, 2).setValue(itm.ar || "");
            if (itm.id === "home_card_extra1") hSheet.getRange(25, 2).setValue(itm.ar || "");
            if (itm.id === "home_card_extra2") hSheet.getRange(26, 2).setValue(itm.ar || "");
            if (itm.id === "home_card_extra3") hSheet.getRange(27, 2).setValue(itm.ar || "");
          }
          if (lSheet && itm.id && itm.id.indexOf("lesson_") === 0) {
            var isMeaning = itm.id.indexOf("_meaning") !== -1;
            var isMakhraj = itm.id.indexOf("_makhraj") !== -1;
            var targetWord = itm.id.replace("lesson_", "").replace("_meaning", "").replace("_makhraj", "");
            if (targetWord && (isMeaning || isMakhraj)) {
              var lData = lSheet.getDataRange().getValues();
              for (var lr = 1; lr < lData.length; lr++) {
                var lRow = lData[lr];
                for (var lc = 1; lc < lRow.length; lc += 8) {
                  var wVal = String(lRow[lc + 4] || "").trim();
                  if (wVal && (wVal === targetWord || wVal.replace(/[\u064B-\u065F\u0670]/g, '') === targetWord.replace(/[\u064B-\u065F\u0670]/g, ''))) {
                    if (isMeaning) lSheet.getRange(lr + 1, lc + 5 + 1).setValue(itm.ar || "");
                    if (isMakhraj) lSheet.getRange(lr + 1, lc + 6 + 1).setValue(itm.ar || "");
                  }
                }
              }
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "تم حفظ الترجمات بنجاح في ورقة الترجمة وتحديث ورقة الرئيسية" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (0-د) تصدير ونقل كافة مواضيع وتمارين وصل الكلمات دفعة واحدة إلى ورقة "وصل" (4 أعمدة لكل تمرين)
    if (data.action === "export_matching_curriculum") {
      var mSheet = getMatchingSheet(ss);
      var subjectsArr = data.subjects || [];
      if (!Array.isArray(subjectsArr)) subjectsArr = [];

      var maxEx = 10;
      for (var s = 0; s < subjectsArr.length; s++) {
        if (subjectsArr[s].exercises && subjectsArr[s].exercises.length > maxEx) {
          maxEx = subjectsArr[s].exercises.length;
        }
      }

      // بناء صف العناوين: A = موضوع الدرس | ثم لكل تمرين 4 أعمدة (السؤال | اليمين | اليسار | الإعدادات)
      var headers = ["موضوع الدرس"];
      for (var ex = 1; ex <= maxEx; ex++) {
        headers.push("السؤال " + ex);
        headers.push("الكلمات في اليمين " + ex + " ( | )");
        headers.push("الكلمات في اليسار " + ex + " ( | )");
        headers.push("إعدادات التمرين " + ex);
      }

      // مسح المحتويات السابقة لإعادة كتابة الهيكل المعتمد بدقة
      mSheet.clearContents();
      mSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      mSheet.getRange(1, 1, 1, headers.length).setBackground("#6b21a8").setFontColor("#ffffff").setFontWeight("bold");

      var dataRows = [];
      var totalExCount = 0;
      for (var i = 0; i < subjectsArr.length; i++) {
        var subj = subjectsArr[i];
        var row = [String(subj.subjectName || "").trim()];
        var exercises = subj.exercises || [];
        for (var e = 0; e < maxEx; e++) {
          if (e < exercises.length) {
            var exItem = exercises[e];
            row.push(String(exItem.questionText || "").trim());
            row.push(String(exItem.rightWords || "").trim());
            row.push(String(exItem.leftWords || "").trim());
            row.push(String(exItem.settingsString || "").trim());
            totalExCount++;
          } else {
            row.push("", "", "", "");
          }
        }
        dataRows.push(row);
      }

      if (dataRows.length > 0) {
        mSheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم تصدير " + subjectsArr.length + " مواضيع و " + totalExCount + " تمارين بنجاح إلى ورقة (وصل)",
        count: totalExCount
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-د-2) حفظ أو تحديث تمرين وصل الكلمات في ورقة "وصل" (4 أعمدة لكل تمرين)
    if (data.action === "save_matching_exercise") {
      var mSheet = getMatchingSheet(ss);
      var subjName = String(data.subjectName || data.subject || "").trim();
      var exIdx = parseInt(data.exerciseNumber || data.exerciseIndex || 1);
      var qText = String(data.questionText || "").trim();
      var rWords = String(data.rightWords || "").trim();
      var lWords = String(data.leftWords || "").trim();
      var sStr = String(data.settingsString || data.settings || "").trim();
      
      var lastR = mSheet.getLastRow();
      var targetRow = -1;
      if (lastR > 1) {
        var sVals = mSheet.getRange(2, 1, lastR - 1, 1).getValues();
        for (var i = 0; i < sVals.length; i++) {
          if (String(sVals[i][0] || "").trim() === subjName) {
            targetRow = i + 2;
            break;
          }
        }
      }
      if (targetRow === -1) {
        targetRow = lastR + 1;
        mSheet.getRange(targetRow, 1).setValue(subjName);
      }
      
      var startCol = 2 + (exIdx - 1) * 4;
      mSheet.getRange(targetRow, startCol, 1, 4).setValues([[qText, rWords, lWords, sStr]]);
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم حفظ تمرين الوصل في ورقة (وصل) بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-هـ) تسجيل نتائج إجابة تمرين الوصل في ورقة "answers 2"
    if (data.action === "submit_matching_answer") {
      var a2Sheet = getAnswers2Sheet(ss);
      var timestamp = data.timestamp || new Date().toLocaleString("ar-SA");
      var sId = String(data.studentId || "").trim();
      var sName = String(data.studentName || "").trim();
      var subj = String(data.lessonSubject || data.subjectName || data.subject || "").trim();
      var exIdx = parseInt(data.exerciseIndex || data.exerciseNumber || 1);
      var formula = String(data.resultFormula || data.summaryString || "").trim();
      var compStatus = String(data.completionStatus || "").trim();

      var lastR = a2Sheet.getLastRow();
      var foundRow = -1;
      if (lastR > 1) {
        var rows = a2Sheet.getRange(2, 2, lastR - 1, 3).getValues();
        for (var r = 0; r < rows.length; r++) {
          var rId = String(rows[r][0] || "").trim();
          var rName = String(rows[r][1] || "").trim();
          var rSubj = String(rows[r][2] || "").trim();
          if ((sId && rId === sId && rSubj === subj) || (rName === sName && rSubj === subj)) {
            foundRow = r + 2;
            break;
          }
        }
      }

      var exCol = 6 + (exIdx - 1);
      if (foundRow > 0) {
        a2Sheet.getRange(foundRow, 1).setValue(timestamp);
        if (sId) a2Sheet.getRange(foundRow, 2).setValue(sId);
        if (sName) a2Sheet.getRange(foundRow, 3).setValue(sName);
        if (subj) a2Sheet.getRange(foundRow, 4).setValue(subj);
        if (compStatus) a2Sheet.getRange(foundRow, 5).setValue(compStatus);
        a2Sheet.getRange(foundRow, exCol).setValue(formula);
      } else {
        var newRow = [timestamp, sId, sName, subj, compStatus];
        while (newRow.length < 5 + exIdx) {
          newRow.push("");
        }
        newRow[5 + (exIdx - 1)] = formula;
        a2Sheet.appendRow(newRow);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم تسجيل إجابة تمرين الوصل في ورقة (answers 2) بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-و) تصدير كافة مواضيع وتمارين الإملاء دفعة واحدة إلى ورقة "كلمات" (4 أعمدة لكل تمرين)
    if (data.action === "export_dictation_curriculum") {
      var wSheet = getWordsSheet(ss);
      var subjectsArr = data.subjects || [];
      if (!Array.isArray(subjectsArr)) subjectsArr = [];

      var maxEx = 10;
      for (var s = 0; s < subjectsArr.length; s++) {
        if (subjectsArr[s].exercises && subjectsArr[s].exercises.length > maxEx) {
          maxEx = subjectsArr[s].exercises.length;
        }
      }

      var headers = ["موضوع الدرس"];
      for (var ex = 1; ex <= maxEx; ex++) {
        headers.push("السؤال " + ex);
        headers.push("الحروف والكلمات المشتتة " + ex);
        headers.push("الإجابة الصحيحة " + ex);
        headers.push("الإعدادات " + ex);
      }

      wSheet.clearContents();
      wSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      wSheet.getRange(1, 1, 1, headers.length).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");

      var dataRows = [];
      var totalExCount = 0;
      for (var i = 0; i < subjectsArr.length; i++) {
        var subj = subjectsArr[i];
        var row = [String(subj.subjectName || "").trim()];
        var exercises = subj.exercises || [];
        for (var e = 0; e < maxEx; e++) {
          if (e < exercises.length) {
            var exItem = exercises[e];
            row.push(String(exItem.questionText || "").trim());
            row.push(String(exItem.scrambledPool || "").trim());
            row.push(String(exItem.correctAnswer || "").trim());
            row.push(String(exItem.settingsString || "").trim());
            totalExCount++;
          } else {
            row.push("", "", "", "");
          }
        }
        dataRows.push(row);
      }

      if (dataRows.length > 0) {
        wSheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم تصدير " + subjectsArr.length + " مواضيع و " + totalExCount + " تمارين بنجاح إلى ورقة (كلمات)",
        count: totalExCount
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-و-2) حفظ أو تحديث تمرين إملاء واحد في ورقة "كلمات" (4 أعمدة لكل تمرين)
    if (data.action === "save_dictation_exercise") {
      var wSheet = getWordsSheet(ss);
      var subjName = String(data.subjectName || data.subject || "").trim();
      var exIdx = parseInt(data.exerciseNumber || data.exerciseIndex || 1);
      var qText = String(data.questionText || "").trim();
      var poolStr = String(data.scrambledPool || "").trim();
      var ansStr = String(data.correctAnswer || "").trim();
      var setStr = String(data.settingsString || data.settings || "").trim();

      var lastR = wSheet.getLastRow();
      var targetRow = -1;
      if (lastR > 1) {
        var sVals = wSheet.getRange(2, 1, lastR - 1, 1).getValues();
        for (var i = 0; i < sVals.length; i++) {
          if (String(sVals[i][0] || "").trim() === subjName) {
            targetRow = i + 2;
            break;
          }
        }
      }
      if (targetRow === -1) {
        targetRow = lastR + 1;
        wSheet.getRange(targetRow, 1).setValue(subjName);
      }

      var startCol = 2 + (exIdx - 1) * 4;
      wSheet.getRange(targetRow, startCol, 1, 4).setValues([[qText, poolStr, ansStr, setStr]]);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم حفظ التمرين في ورقة (كلمات) بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ز) تسجيل نتائج إجابة تمرين الإملاء في ورقة "answers 3"
    if (data.action === "submit_dictation_answer") {
      var a3Sheet = getAnswers3Sheet(ss);
      var timestamp = data.timestamp || new Date().toLocaleString("ar-SA");
      var sId = String(data.studentId || "").trim();
      var sName = String(data.studentName || "").trim();
      var subj = String(data.lessonSubject || data.subjectName || data.subject || "").trim();
      var exIdx = parseInt(data.exerciseIndex || data.exerciseNumber || 1);
      var formula = String(data.resultFormula || data.summaryString || "").trim();
      var compStatus = String(data.completionStatus || "").trim();

      var lastR = a3Sheet.getLastRow();
      var foundRow = -1;
      if (lastR > 1) {
        var rows = a3Sheet.getRange(2, 2, lastR - 1, 3).getValues();
        for (var r = 0; r < rows.length; r++) {
          var rId = String(rows[r][0] || "").trim();
          var rName = String(rows[r][1] || "").trim();
          var rSubj = String(rows[r][2] || "").trim();
          if ((sId && rId === sId && rSubj === subj) || (rName === sName && rSubj === subj)) {
            foundRow = r + 2;
            break;
          }
        }
      }

      var exCol = 6 + (exIdx - 1);
      if (foundRow > 0) {
        a3Sheet.getRange(foundRow, 1).setValue(timestamp);
        if (sId) a3Sheet.getRange(foundRow, 2).setValue(sId);
        if (sName) a3Sheet.getRange(foundRow, 3).setValue(sName);
        if (subj) a3Sheet.getRange(foundRow, 4).setValue(subj);
        if (compStatus) a3Sheet.getRange(foundRow, 5).setValue(compStatus);
        a3Sheet.getRange(foundRow, exCol).setValue(formula);
      } else {
        var newRow = [timestamp, sId, sName, subj, compStatus];
        while (newRow.length < 5 + exIdx) {
          newRow.push("");
        }
        newRow[5 + (exIdx - 1)] = formula;
        a3Sheet.appendRow(newRow);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم تسجيل إجابة تمرين الإملاء في ورقة (answers 3) بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ح) تسجيل عدد محاولات الإعادة لطالب معين في ورقة "سجل_المحاولات"
    if (data.action === "record_retry") {
      var rSheet = getRetriesSheet(ss);
      var rSid = String(data.studentId || "").trim();
      var rSname = String(data.studentName || "").trim();
      var rMode = String(data.mode || "").trim();
      var rExKey = String(data.exerciseKey || "").trim();
      var rCount = parseInt(data.retryCount, 10) || 1;
      var rTime = String(data.timestamp || new Date().toLocaleString("ar-SA")).trim();
      var lastR = rSheet.getLastRow();
      var foundRow = -1;
      if (lastR > 1) {
        var rows = rSheet.getRange(2, 1, lastR - 1, 5).getValues();
        for (var i = 0; i < rows.length; i++) {
          var idMatch = rSid && String(rows[i][0] || "").trim() === rSid;
          var nameMatch = (!rSid || !String(rows[i][0] || "").trim()) && rSname && String(rows[i][1] || "").trim() === rSname;
          if ((idMatch || nameMatch) && String(rows[i][2] || "").trim() === rMode && String(rows[i][3] || "").trim() === rExKey) {
            foundRow = i + 2;
            var existingCnt = parseInt(rows[i][4], 10) || 0;
            if (existingCnt > rCount) rCount = existingCnt;
            break;
          }
        }
      }
      if (foundRow > 0) {
        rSheet.getRange(foundRow, 5, 1, 2).setValues([[rCount, rTime]]);
      } else {
        rSheet.appendRow([rSid, rSname, rMode, rExKey, rCount, rTime]);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, retryCount: rCount }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ط) التمرين الرابع (تمرين الكتابة): مزامنة كل الدروس مع ورقة "ArabicLessons"
    if (data.action === "sync_writing_lessons") {
      var wlSheet = getWritingLessonsSheet(ss);
      var lessonsList = data.lessons || [];
      wlSheet.clearContents();
      var topicsMap = {};
      var topicOrder = [];
      for (var li = 0; li < lessonsList.length; li++) {
        var l = lessonsList[li];
        var top = String(l.topic || "خط النسخ").trim();
        if (!topicsMap[top]) {
          topicsMap[top] = [];
          topicOrder.push(top);
        }
        topicsMap[top].push(l);
      }
      var maxPerTopic = 1;
      for (var ti = 0; ti < topicOrder.length; ti++) {
        if (topicsMap[topicOrder[ti]].length > maxPerTopic) {
          maxPerTopic = topicsMap[topicOrder[ti]].length;
        }
      }
      var wHeaders = ["الموضوع"];
      for (var wi = 1; wi <= Math.max(maxPerTopic, 5); wi++) {
        for (var ws = 0; ws < WRITING_SUB_HEADERS.length; ws++) {
          wHeaders.push("الدرس " + wi + " - " + WRITING_SUB_HEADERS[ws]);
        }
      }
      wlSheet.appendRow(wHeaders);
      wlSheet.getRange(1, 1, 1, wHeaders.length).setBackground("#1e293b").setFontColor("#f8fafc").setFontWeight("bold");
      for (var ti2 = 0; ti2 < topicOrder.length; ti2++) {
        var tName = topicOrder[ti2];
        var rowArr = [tName];
        var tLessons = topicsMap[tName] || [];
        for (var k = 0; k < tLessons.length; k++) {
          var item = tLessons[k];
          rowArr.push(
            item.category || "حروف",
            item.imageUrl || "",
            item.title || "",
            item.arabicAudioText || item.title || "",
            Number(item.repeatCount) || 1,
            item.difficulty || "سهل",
            item.stepsData || ""
          );
        }
        wlSheet.appendRow(rowArr);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        count: lessonsList.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ط-2) حفظ أو تحديث درس واحد في ورقة "ArabicLessons"
    if (data.action === "save_writing_lesson") {
      var wlSheet = getWritingLessonsSheet(ss);
      var lessonObj = data.lesson || {};
      var targetTopic = String(lessonObj.topic || "خط النسخ").trim();
      var origTitle = String(data.originalTitle || lessonObj.title || "").trim();
      var newTitle = String(lessonObj.title || "").trim();
      var newValues = [
        lessonObj.category || "حروف",
        lessonObj.imageUrl || "",
        newTitle,
        lessonObj.arabicAudioText || newTitle,
        Number(lessonObj.repeatCount) || 1,
        lessonObj.difficulty || "سهل",
        lessonObj.stepsData || ""
      ];
      var allData = wlSheet.getDataRange().getValues();
      var targetRowIdx = -1;
      for (var r = 1; r < allData.length; r++) {
        if (String(allData[r][0] || "").trim() === targetTopic) {
          targetRowIdx = r + 1;
          break;
        }
      }
      if (targetRowIdx === -1) {
        wlSheet.appendRow([targetTopic].concat(newValues));
        return ContentService.createTextOutput(JSON.stringify({ success: true, status: "success", action: "inserted_new_topic" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var rowData = wlSheet.getRange(targetRowIdx, 1, 1, Math.max(wlSheet.getLastColumn(), 2)).getValues()[0];
      var targetColStart = -1;
      var firstEmptyCol = -1;
      for (var c = 1; c < rowData.length; c += WRITING_COLS_PER_LESSON) {
        var existingTitle = String(rowData[c + 2] || "").trim();
        var existingImg = String(rowData[c + 1] || "").trim();
        if (existingTitle === origTitle || (origTitle === newTitle && existingTitle === newTitle)) {
          targetColStart = c + 1;
          break;
        }
        if (firstEmptyCol === -1 && !existingTitle && !existingImg) {
          firstEmptyCol = c + 1;
        }
      }
      if (targetColStart === -1) {
        targetColStart = firstEmptyCol !== -1 ? firstEmptyCol : rowData.length + 1;
      }
      var neededSlot = Math.ceil((targetColStart - 1) / WRITING_COLS_PER_LESSON);
      ensureWritingLessonsHeaderLength(wlSheet, neededSlot);
      wlSheet.getRange(targetRowIdx, targetColStart, 1, WRITING_COLS_PER_LESSON).setValues([newValues]);
      return ContentService.createTextOutput(JSON.stringify({ success: true, status: "success", action: "updated" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ط-3) حذف درس من ورقة "ArabicLessons"
    if (data.action === "delete_writing_lesson") {
      var wlSheet = getWritingLessonsSheet(ss);
      var delTopic = String(data.topic || "").trim();
      var delTitle = String(data.title || "").trim();
      var allData = wlSheet.getDataRange().getValues();
      for (var r = 1; r < allData.length; r++) {
        if (!delTopic || String(allData[r][0] || "").trim() === delTopic) {
          for (var c = 1; c < allData[r].length; c += WRITING_COLS_PER_LESSON) {
            if (String(allData[r][c + 2] || "").trim() === delTitle) {
              wlSheet.getRange(r + 1, c + 1, 1, WRITING_COLS_PER_LESSON).clearContent();
              return ContentService.createTextOutput(JSON.stringify({ success: true, status: "success" }))
                .setMimeType(ContentService.MimeType.JSON);
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, status: "success" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ي) تسجيل إجابة تمرين الكتابة مع رفع صورة الرسم في Google Drive وتخزينها في ورقة "answers 4"
    if (data.action === "submit_writing_answer") {
      var wSid = String(data.studentId || "").trim();
      var wSname = String(data.studentName || "").trim();
      var wTopic = String(data.topic || "خط النسخ").trim();
      var wSlot = Math.max(1, parseInt(data.slotIndex, 10) || 1);
      var wCat = String(data.category || "حروف").trim();
      var wText = String(data.text || "").trim();
      var wScore = Number(data.score) || 0;
      var wDetails = String(data.details || "").trim();
      var wImgB64 = String(data.imageBase64 || "").trim();
      var wTotal = Math.max(wSlot, parseInt(data.totalLessonsInTopic, 10) || wSlot);
      var driveImageUrl = "";
      var driveError = "";
      if (wImgB64) {
        try {
          var folder = getOrCreateAudioFolder(WRITING_DRIVE_FOLDER_ID);
          var markerIdx = wImgB64.indexOf("base64,");
          var cleanBase64 = markerIdx !== -1 ? wImgB64.slice(markerIdx + 7) : wImgB64;
          var decoded = Utilities.base64Decode(cleanBase64);
          var tsStr = Utilities.formatDate(new Date(), "GMT+3", "yyyyMMdd_HHmmss");
          var fName = "إجابة_" + (wSname || wSid) + "_" + (wText || ("تمرين" + wSlot)) + "_" + tsStr + ".png";
          var blob = Utilities.newBlob(decoded, "image/png", fName);
          var file;
          try {
            file = folder.createFile(blob);
          } catch (fErr) {
            file = DriveApp.getRootFolder().createFile(blob);
          }
          try {
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          } catch (sErr) {}
          driveImageUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
        } catch (driveErr) {
          driveError = driveErr.toString();
          driveImageUrl = "تعذر الرفع لقوقل درايف: " + driveError;
        }
      }
      var a4Sheet = getAnswers4Sheet(ss);
      ensureAnswers4HeaderLength(a4Sheet, wSlot);
      var wTs = Utilities.formatDate(new Date(), "GMT+3", "yyyy-MM-dd HH:mm:ss");
      var a4Data = a4Sheet.getDataRange().getValues();
      var foundRow = -1;
      for (var r = 1; r < a4Data.length; r++) {
        if (String(a4Data[r][1] || "").trim() === wSid && String(a4Data[r][3] || "").trim() === wTopic) {
          foundRow = r + 1;
          break;
        }
      }
      var exColStart = 6 + (wSlot - 1) * 5;
      var exVals = [wCat, wText, driveImageUrl, wScore + "%", wDetails];
      var compText = "";
      if (foundRow === -1) {
        foundRow = a4Sheet.getLastRow() + 1;
        compText = "1/" + wTotal + " مكتمل";
        var fullRow = [wTs, wSid, wSname, wTopic, compText];
        while (fullRow.length < exColStart - 1) fullRow.push("");
        fullRow = fullRow.concat(exVals);
        a4Sheet.getRange(foundRow, 1, 1, fullRow.length).setValues([fullRow]);
      } else {
        a4Sheet.getRange(foundRow, 1, 1, 4).setValues([[wTs, wSid, wSname, wTopic]]);
        a4Sheet.getRange(foundRow, exColStart, 1, 5).setValues([exVals]);
        var rowCells = a4Sheet.getRange(foundRow, 1, 1, a4Sheet.getLastColumn()).getValues()[0];
        var doneCount = 0;
        for (var col = 5; col < rowCells.length; col += 5) {
          if (String(rowCells[col + 1] || "").trim() || String(rowCells[col + 3] || "").trim()) {
            doneCount++;
          }
        }
        compText = doneCount >= wTotal ? ("مكتمل (" + doneCount + "/" + wTotal + ")") : (doneCount + "/" + wTotal + " تمارين مكتملة");
        a4Sheet.getRange(foundRow, 5).setValue(compText);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        imageUrl: driveImageUrl,
        driveError: driveError,
        completionStatus: compText,
        studentId: wSid,
        studentName: wSname,
        topic: wTopic,
        slotIndex: wSlot,
        score: wScore
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ك) رفع صورة مكافأة الواقع المعزز AR إلى Google Drive
    if (data.action === "upload_ar_reward_image") {
      var imgB64 = String(data.imageBase64 || "").trim();
      var tierId = String(data.tierId || "ar_reward").trim();
      if (!imgB64) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, status: "error", message: "لم يتم استلام بيانات الصورة" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var uploaded = saveWritingRewardBase64ToDrive(imgB64, "ar_reward_" + tierId);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        fileId: uploaded.fileId,
        imageUrl: uploaded.imageUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ك-2) حفظ مكافآت الواقع المعزز في ورقة "AR Rewards"
    if (data.action === "save_ar_rewards") {
      var arSheet = getARRewardsSheet(ss);
      var inputRewards = Array.isArray(data.rewards) ? data.rewards : [];
      var savedRewards = [];
      var rowsToWrite = [];
      for (var i = 0; i < inputRewards.length; i++) {
        var item = inputRewards[i] || {};
        var id = String(item.id || ("tier_" + (i + 1))).trim();
        var title = String(item.title || "");
        var minScore = Math.max(0, Math.min(100, Number(item.minScore) || 0));
        var maxScore = Math.max(0, Math.min(100, item.maxScore !== undefined ? Number(item.maxScore) : 100));
        var presetId = String(item.presetId || "").trim();
        var resolvedUrl = String(item.imageUrl || "").trim();
        var scaleRatio = Number(item.scaleRatio) || 1.35;
        var offsetYRatio = item.offsetYRatio !== undefined ? Number(item.offsetYRatio) : -0.45;
        var enabled = item.enabled !== false;
        if (presetId) {
          resolvedUrl = "";
        } else if (resolvedUrl.indexOf("data:image/") === 0) {
          try {
            var uploaded = saveWritingRewardBase64ToDrive(resolvedUrl, "ar_reward_" + id);
            resolvedUrl = uploaded.imageUrl;
          } catch (driveErr) {
            if (resolvedUrl.length > 45000) resolvedUrl = "";
          }
        }
        savedRewards.push({
          id: id,
          title: title,
          minScore: Math.min(minScore, maxScore),
          maxScore: Math.max(minScore, maxScore),
          presetId: presetId || undefined,
          imageUrl: resolvedUrl,
          scaleRatio: scaleRatio,
          offsetYRatio: offsetYRatio,
          enabled: enabled
        });
        rowsToWrite.push([id, title, Math.min(minScore, maxScore), Math.max(minScore, maxScore), presetId, resolvedUrl, scaleRatio, offsetYRatio, enabled ? "true" : "false"]);
      }
      var lastRowAR = arSheet.getLastRow();
      if (lastRowAR > 1) {
        arSheet.getRange(2, 1, lastRowAR - 1, 9).clearContent();
      }
      if (rowsToWrite.length > 0) {
        arSheet.getRange(2, 1, rowsToWrite.length, 9).setValues(rowsToWrite);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        count: rowsToWrite.length,
        rewards: savedRewards
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ل) التمرين الخامس (تحدي الصيد AR): تصدير كافة التمارين دفعة واحدة إلى ورقة "صيد"
    if (data.action === "export_catch_curriculum") {
      var cSheet = getCatchSheet(ss);
      var subjectsArr = data.subjects || [];
      if (!Array.isArray(subjectsArr)) subjectsArr = [];

      var maxEx = 10;
      for (var s = 0; s < subjectsArr.length; s++) {
        if (subjectsArr[s].exercises && subjectsArr[s].exercises.length > maxEx) {
          maxEx = subjectsArr[s].exercises.length;
        }
      }

      var headers = ["موضوع الدرس"];
      for (var ex = 1; ex <= maxEx; ex++) {
        headers.push("السؤال " + ex);
        headers.push("الحروف والكلمات المشتتة " + ex);
        headers.push("الإجابة الصحيحة " + ex);
        headers.push("الإعدادات " + ex);
      }

      cSheet.clearContents();
      cSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      cSheet.getRange(1, 1, 1, headers.length).setBackground("#0284c7").setFontColor("#ffffff").setFontWeight("bold");

      var dataRows = [];
      var totalExCount = 0;
      for (var i = 0; i < subjectsArr.length; i++) {
        var subj = subjectsArr[i];
        var row = [String(subj.subjectName || "").trim()];
        var exercises = subj.exercises || [];
        for (var e = 0; e < maxEx; e++) {
          if (e < exercises.length) {
            var exItem = exercises[e];
            row.push(String(exItem.questionText || "").trim());
            row.push(String(exItem.scrambledPool || "").trim());
            row.push(String(exItem.correctAnswer || "").trim());
            row.push(String(exItem.settingsString || "").trim());
            totalExCount++;
          } else {
            row.push("", "", "", "");
          }
        }
        dataRows.push(row);
      }

      if (dataRows.length > 0) {
        cSheet.getRange(2, 1, dataRows.length, headers.length).setValues(dataRows);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم تصدير " + subjectsArr.length + " مواضيع و " + totalExCount + " تمارين بنجاح إلى ورقة (صيد)",
        count: totalExCount
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ل-2) حفظ أو تحديث تمرين صيد واحد في ورقة "صيد"
    if (data.action === "save_catch_exercise") {
      var cSheet = getCatchSheet(ss);
      var subjName = String(data.subjectName || data.subject || "").trim();
      var exIdx = parseInt(data.exerciseNumber || data.exerciseIndex || 1);
      var qText = String(data.questionText || "").trim();
      var poolStr = String(data.scrambledPool || "").trim();
      var ansStr = String(data.correctAnswer || "").trim();
      var setStr = String(data.settingsString || data.settings || "").trim();

      var lastR = cSheet.getLastRow();
      var targetRow = -1;
      if (lastR > 1) {
        var sVals = cSheet.getRange(2, 1, lastR - 1, 1).getValues();
        for (var i = 0; i < sVals.length; i++) {
          if (String(sVals[i][0] || "").trim() === subjName) {
            targetRow = i + 2;
            break;
          }
        }
      }
      if (targetRow === -1) {
        targetRow = lastR + 1;
        cSheet.getRange(targetRow, 1).setValue(subjName);
      }

      var startCol = 2 + (exIdx - 1) * 4;
      cSheet.getRange(targetRow, startCol, 1, 4).setValues([[qText, poolStr, ansStr, setStr]]);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم حفظ التمرين في ورقة (صيد) بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ل-3) تسجيل نتائج إجابة التمرين الخامس في ورقة "اجابات صيد"
    if (data.action === "submit_catch_answer") {
      var caSheet = getCatchAnswersSheet(ss);
      var timestamp = data.timestamp || new Date().toLocaleString("ar-SA");
      var sId = String(data.studentId || "").trim();
      var sName = String(data.studentName || "").trim();
      var subj = String(data.lessonSubject || data.subjectName || data.subject || "").trim();
      var exIdx = parseInt(data.exerciseIndex || data.exerciseNumber || 1);
      var formula = String(data.resultFormula || data.summaryString || "").trim();
      var compStatus = String(data.completionStatus || "").trim();

      var lastR = caSheet.getLastRow();
      var foundRow = -1;
      if (lastR > 1) {
        var rows = caSheet.getRange(2, 2, lastR - 1, 3).getValues();
        for (var r = 0; r < rows.length; r++) {
          var rId = String(rows[r][0] || "").trim();
          var rName = String(rows[r][1] || "").trim();
          var rSubj = String(rows[r][2] || "").trim();
          if ((sId && rId === sId && rSubj === subj) || (rName === sName && rSubj === subj)) {
            foundRow = r + 2;
            break;
          }
        }
      }

      var exCol = 6 + (exIdx - 1);
      if (foundRow > 0) {
        caSheet.getRange(foundRow, 1).setValue(timestamp);
        if (sId) caSheet.getRange(foundRow, 2).setValue(sId);
        if (sName) caSheet.getRange(foundRow, 3).setValue(sName);
        if (subj) caSheet.getRange(foundRow, 4).setValue(subj);
        if (compStatus) caSheet.getRange(foundRow, 5).setValue(compStatus);
        caSheet.getRange(foundRow, exCol).setValue(formula);
      } else {
        var newRow = [timestamp, sId, sName, subj, compStatus];
        while (newRow.length < 5 + exIdx) {
          newRow.push("");
        }
        newRow[5 + (exIdx - 1)] = formula;
        caSheet.appendRow(newRow);
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "تم تسجيل إجابة تحدي الصيد في ورقة (اجابات صيد) بنجاح"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ل-4) حفظ مكافآت الواقع المعزز الخاصة بتحدي الصيد في ورقة "مكافآت صيد AR"
    if (data.action === "save_catch_ar_rewards") {
      var carSheet = getCatchARRewardsSheet(ss);
      var inputRewards = Array.isArray(data.rewards) ? data.rewards : [];
      var savedRewards = [];
      var rowsToWrite = [];
      for (var i = 0; i < inputRewards.length; i++) {
        var item = inputRewards[i] || {};
        var id = String(item.id || ("tier_" + (i + 1))).trim();
        var title = String(item.title || "");
        var minScore = Math.max(0, Math.min(100, Number(item.minScore) || 0));
        var maxScore = Math.max(0, Math.min(100, item.maxScore !== undefined ? Number(item.maxScore) : 100));
        var presetId = String(item.presetId || "").trim();
        var resolvedUrl = String(item.imageUrl || "").trim();
        var scaleRatio = Number(item.scaleRatio) || 1.35;
        var offsetYRatio = item.offsetYRatio !== undefined ? Number(item.offsetYRatio) : -0.45;
        var enabled = item.enabled !== false;
        if (presetId) {
          resolvedUrl = "";
        } else if (resolvedUrl.indexOf("data:image/") === 0) {
          try {
            var uploaded = saveWritingRewardBase64ToDrive(resolvedUrl, "catch_ar_reward_" + id);
            resolvedUrl = uploaded.imageUrl;
          } catch (driveErr) {
            if (resolvedUrl.length > 45000) resolvedUrl = "";
          }
        }
        savedRewards.push({
          id: id,
          title: title,
          minScore: Math.min(minScore, maxScore),
          maxScore: Math.max(minScore, maxScore),
          presetId: presetId || undefined,
          imageUrl: resolvedUrl,
          scaleRatio: scaleRatio,
          offsetYRatio: offsetYRatio,
          enabled: enabled
        });
        rowsToWrite.push([id, title, Math.min(minScore, maxScore), Math.max(minScore, maxScore), presetId, resolvedUrl, scaleRatio, offsetYRatio, enabled ? "true" : "false"]);
      }
      var lastRowCAR = carSheet.getLastRow();
      if (lastRowCAR > 1) {
        carSheet.getRange(2, 1, lastRowCAR - 1, 9).clearContent();
      }
      if (rowsToWrite.length > 0) {
        carSheet.getRange(2, 1, rowsToWrite.length, 9).setValues(rowsToWrite);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "success",
        count: rowsToWrite.length,
        rewards: savedRewards
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (أ) حفظ صوت المعلم في مجلد الإدارة والشرح (1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t)
    if (data.action === "upload_audio" && data.audioBase64) {
      var teacherFolder = getOrCreateAudioFolder(data.driveFolderId || "1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t");
      var cleanBase64 = String(data.audioBase64);
      if (cleanBase64.indexOf("base64,") !== -1) {
        cleanBase64 = cleanBase64.split("base64,")[1];
      }
      var dateForFile = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy-MM-dd_HH-mm");
      var baseName = String(data.customFileName || data.word || data.fileName || "teacher_audio").trim().replace(/[/\\?%*:|"<>]/g, '_');
      var finalTeacherFileName = baseName + "_" + dateForFile + ".mp3";
      var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), "audio/mp3", finalTeacherFileName);
      var driveFile;
      try {
        driveFile = teacherFolder.createFile(blob);
      } catch (cfErr) {
        driveFile = DriveApp.getRootFolder().createFile(blob);
      }
      try {
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (sErr) {}
      var fileId = driveFile.getId();
      var directAudioUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        fileId: fileId,
        audioUrl: directAudioUrl,
        message: "تم حفظ ورفع صوت المعلم في Google Drive بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (أ-2) تسجيل إجابة الطالب الأفقية في ورقة "answers 1" ورفع ملف صوت الطالب إلى مجلد الطلاب (1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA)
    if (data.action === "submit_student_answer") {
      var ansSheet = getAnswers1Sheet(ss);
      var studentId = String(data.studentId || "").trim();
      var studentName = String(data.studentName || "طالب").trim();
      var lessonSubject = String(data.lessonSubject || "الدرس الأول").trim();
      var targetWord = String(data.targetWord || "").trim();
      var detectedWord = String(data.detectedWord || "").trim();
      var scoreVal = data.score !== undefined ? data.score : 0;
      var grade = String(data.feedback || data.grade || "").trim();
      
      // 1. رفع صوت الطالب إلى مجلد صوتيات الطلاب المخصص في Google Drive
      var directAudioUrl = "";
      if (data.audioBase64) {
        try {
          var targetFolderId = String(data.studentDriveFolderId || data.driveFolderId || "").trim();
          if (!targetFolderId || targetFolderId === "1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t") {
            targetFolderId = "1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA";
          }
          var studentFolder = getOrCreateAudioFolder(targetFolderId);
          var cleanBase64 = String(data.audioBase64);
          if (cleanBase64.indexOf("base64,") !== -1) {
            cleanBase64 = cleanBase64.split("base64,")[1];
          }
          var cleanName = studentName.replace(/[/\\?%*:|"<>]/g, '_');
          var cleanId = studentId.replace(/[/\\?%*:|"<>]/g, '_');
          var cleanWord = (targetWord || detectedWord || "تمرين").replace(/[/\\?%*:|"<>]/g, '_');
          var dateForFile = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy-MM-dd_HH-mm");
          var fullFileName = (cleanId ? (cleanId + "_") : "") + cleanName + "_" + cleanWord + "_" + dateForFile + ".mp3";

          var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), "audio/mp3", fullFileName);
          var driveFile;
          try {
            driveFile = studentFolder.createFile(blob);
          } catch (cfErr) {
            driveFile = DriveApp.getRootFolder().createFile(blob);
          }
          try {
            driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          } catch (sErr) {}
          directAudioUrl = "https://drive.google.com/uc?export=download&id=" + driveFile.getId();
        } catch (uploadErr) {
          Logger.log("Drive student audio upload error: " + uploadErr);
        }
      }
      
      // 2. تنسيق الوقت والتاريخ الحالي
      var timeFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy/MM/dd HH:mm:ss");
      
      // 3. البحث عن صف هذا المشترك لنفس موضوع الدرس
      var lastRow = ansSheet.getLastRow();
      var targetRow = -1;
      var existingRowValues = [];
      
      if (lastRow > 1) {
        var lastCol = Math.max(5, ansSheet.getLastColumn());
        var allRows = ansSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
        for (var r = 0; r < allRows.length; r++) {
          var rId = String(allRows[r][1] || "").trim();
          var rName = String(allRows[r][2] || "").trim();
          var rSubject = String(allRows[r][3] || "").trim();
          
          var idMatches = studentId && rId === studentId;
          var nameMatches = (!studentId || !rId) && (rName === studentName);
          
          if ((idMatches || nameMatches) && rSubject === lessonSubject) {
            targetRow = r + 2;
            existingRowValues = allRows[r];
            break;
          }
        }
      }
      
      // 4. تحديد الحزمة الأفقية المكونة من 5 أعمدة لهذا التمرين
      // الأعمدة تبدأ من Col F (index 6 في الشيت، index 5 في مصفوفة الجافاسكربت)
      // كل تمرين 5 أعمدة: الكلمة المستهدفة | النص المنطوق | رابط ملف الصوت | الدرجة % | التقدير
      var targetBlockCol = -1;
      
      if (targetRow !== -1 && existingRowValues.length > 5) {
        // أ) هل نفس الكلمة موجودة مسبقاً في أحد البلوكات؟ (لتحديثها بالدرجة والتسجيل الجديد)
        for (var c = 5; c < existingRowValues.length; c += 5) {
          var wordInCell = String(existingRowValues[c] || "").trim();
          if (wordInCell && (wordInCell === targetWord || wordInCell.replace(/[\u064B-\u0652]/g, '') === targetWord.replace(/[\u064B-\u0652]/g, ''))) {
            targetBlockCol = c + 1; // 1-based column
            break;
          }
        }
      }
      
      // ب) إذا لم نجد الكلمة مسبقاً، نستخدم wordIndex إذا توفر
      if (targetBlockCol === -1) {
        var wIdx = (data.wordIndex !== undefined && parseInt(data.wordIndex) >= 0) ? parseInt(data.wordIndex) : -1;
        if (wIdx >= 0) {
          targetBlockCol = 6 + (wIdx * 5); // 1-based (Col 6 is F, 11 is K, 16 is P...)
        }
      }
      
      // ج) كخيار احتياطي: أول حزمة فارغة
      if (targetBlockCol === -1) {
        if (targetRow !== -1 && existingRowValues.length > 5) {
          for (var c = 5; c < existingRowValues.length; c += 5) {
            if (!String(existingRowValues[c] || "").trim()) {
              targetBlockCol = c + 1;
              break;
            }
          }
          if (targetBlockCol === -1) {
            targetBlockCol = existingRowValues.length + 1;
          }
        } else {
          targetBlockCol = 6; // أول تمرين F:J
        }
      }
      
      var blockData = [[
        targetWord,
        detectedWord,
        directAudioUrl,
        scoreVal + "%",
        grade
      ]];
      
      // التأكد من توفر أعمدة كافية في الورقة
      var requiredColMax = targetBlockCol + 4;
      if (ansSheet.getMaxColumns() < requiredColMax) {
        ansSheet.insertColumnsAfter(ansSheet.getMaxColumns(), requiredColMax - ansSheet.getMaxColumns());
      }

      // (تسجيل تلقائي وتأكيد كافة عناوين الأعمدة في ورقة answers 1)
      try {
        ensureAnswersHeaders(ansSheet, requiredColMax);
      } catch (headErr) {
        Logger.log("Headers generation note: " + headErr);
      }
      
      if (targetRow !== -1) {
        // تحديث الصف الحالي
        ansSheet.getRange(targetRow, 1).setValue(timeFormatted);
        if (studentId) ansSheet.getRange(targetRow, 2).setValue(studentId);
        if (studentName) ansSheet.getRange(targetRow, 3).setValue(studentName);
        ansSheet.getRange(targetRow, 4).setValue(lessonSubject);
        ansSheet.getRange(targetRow, targetBlockCol, 1, 5).setValues(blockData);
      } else {
        // إنشاء صف جديد لهذا المشترك في هذا الدرس
        var newRow = [
          timeFormatted,
          studentId,
          studentName,
          lessonSubject,
          "" // العامود E المحجوز
        ];
        // ملء الخانات الفارغة إن وجدت قبل هذه الحزمة
        var padCount = targetBlockCol - 6;
        for (var p = 0; p < padCount; p++) {
          newRow.push("");
        }
        newRow = newRow.concat(blockData[0]);
        if (ansSheet.getMaxColumns() < newRow.length) {
          ansSheet.insertColumnsAfter(ansSheet.getMaxColumns(), newRow.length - ansSheet.getMaxColumns());
        }
        ansSheet.appendRow(newRow);
        targetRow = ansSheet.getLastRow();
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        rowIndex: targetRow,
        blockCol: targetBlockCol,
        audioUrl: directAudioUrl,
        message: "تم حفظ وتوثيق إجابتك في ورقة answers 1 بنجاح!"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // (ب) حفظ أو تعديل تمرين في الصف الأفقي لموضوع الدرس
    if (data.action === "save_word" && data.wordItem) {
      var sheet = getLessonsSheet(ss);
      var item = data.wordItem;
      var audioUrl = item.audioUrl || "";
      
      // رفع الصوت المسجل أو المرفوع إلى مجلد Google Drive المحدد إن وجد base64
      if (data.audioBase64) {
        try {
          var folder = getOrCreateAudioFolder(data.driveFolderId);
          var cleanBase64 = String(data.audioBase64);
          if (cleanBase64.indexOf("base64,") !== -1) {
            cleanBase64 = cleanBase64.split("base64,")[1];
          }
          var dateForFile = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy-MM-dd_HH-mm");
          var baseName = String(data.customFileName || item.word || "teacher_audio").trim().replace(/[/\\?%*:|"<>]/g, '_');
          var finalTeacherFileName = baseName + "_" + dateForFile + ".mp3";
          var blob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), "audio/mp3", finalTeacherFileName);
          var driveFile;
          try {
            driveFile = folder.createFile(blob);
          } catch (cfErr) {
            driveFile = DriveApp.getRootFolder().createFile(blob);
          }
          try {
            driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          } catch (sErr) {}
          audioUrl = "https://drive.google.com/uc?export=download&id=" + driveFile.getId();
        } catch (uploadErr) {
          Logger.log("Drive upload error: " + uploadErr);
        }
      }
      
      var lastRow = sheet.getLastRow();
      var lessonRowIndex = -1;
      var wordColIndex = -1;
      var targetSubject = String(item.lessonSubject || "الدرس الأول").trim();
      
      if (lastRow > 1) {
        var lastCol = Math.max(9, sheet.getLastColumn());
        var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
        
        for (var r = 0; r < allValues.length; r++) {
          var rSubject = String(allValues[r][0] || "").trim();
          if (rSubject === targetSubject) {
            lessonRowIndex = r + 2;
            
            // 1. هل الكلمة موجودة بالفعل في إحدى حزم الـ 8 أعمدة لتحديثها؟
            for (var c = 1; c < allValues[r].length; c += 8) {
              if (String(allValues[r][c + 4] || "").trim() === String(item.word || "").trim()) {
                wordColIndex = c + 1; // رقم العامود في الشيت (1-based)
                break;
              }
            }
            
            // 2. إذا لم تكن موجودة، يتم إلحاقها دائماً في نهاية الصف بعد آخر تمرين موجود
            if (wordColIndex === -1) {
              var lastOccupiedCol = 1;
              for (var c = 1; c < allValues[r].length; c += 8) {
                if (String(allValues[r][c + 4] || "").trim()) {
                  lastOccupiedCol = c + 8; // بعد نهاية هذا التمرين
                }
              }
              wordColIndex = lastOccupiedCol + 1;
            }
            break;
          }
        }
      }
      
      var blockData = [[
        item.category || "الكلمة",
        item.imageUrl || "",
        audioUrl,
        item.autoReadText || "",
        item.word,
        item.meaning || "",
        item.makhrajTip || "",
        (function() {
          var rep = parseInt(item.repeatCount) || 1;
          var diff = item.difficultyLevel || "medium";
          var diffArabic = diff === "easy" ? "سهل" : (diff === "hard" ? "متقدم" : "متوسط");
          var dur = parseInt(item.recordingDuration) || 5;
          var mr = (item.maxRetries !== undefined && item.maxRetries !== null) ? parseInt(item.maxRetries) : (item.allowRetry === false ? 0 : 3);
          var retryArabic = mr === 0 ? "منع الإعادة" : (mr < 0 ? "إعادة غير محدودة" : ("إعادة " + mr));
          return rep + "," + diffArabic + "," + dur + "," + retryArabic;
        })()
      ]];
      
      if (lessonRowIndex !== -1 && wordColIndex !== -1) {
        var neededCols = wordColIndex + 7;
        if (sheet.getMaxColumns() < neededCols) {
          sheet.insertColumnsAfter(sheet.getMaxColumns(), neededCols - sheet.getMaxColumns());
        }
        sheet.getRange(lessonRowIndex, wordColIndex, 1, 8).setValues(blockData);
      } else {
        // إنشاء صف جديد للدرس يبدأ بـ العامود A ومعه أول تمرين (B:I)
        var newRow = [targetSubject].concat(blockData[0]);
        if (sheet.getMaxColumns() < newRow.length) {
          sheet.insertColumnsAfter(sheet.getMaxColumns(), newRow.length - sheet.getMaxColumns());
        }
        sheet.appendRow(newRow);
      }

      // التحقق وتوليد عناوين الأعمدة التلقائية لورقة الدروس
      try {
        ensureLessonsHeaders(sheet, Math.max(sheet.getLastColumn(), 9));
      } catch (lhErr) {
        Logger.log("Lessons headers note: " + lhErr);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        audioUrl: audioUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // (ج) حذف تمرين معين من الحزمة المخصصة له
    if (data.action === "delete_word" && data.word) {
      var sheet = getLessonsSheet(ss);
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var lastCol = Math.max(9, sheet.getLastColumn());
        var allValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
        for (var r = 0; r < allValues.length; r++) {
          if (!data.lessonSubject || String(allValues[r][0] || "").trim() === String(data.lessonSubject).trim()) {
            for (var c = 1; c < allValues[r].length; c += 8) {
              if (String(allValues[r][c + 4] || "").trim() === String(data.word).trim()) {
                sheet.getRange(r + 2, c + 1, 1, 8).clearContent();
                break;
              }
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // (د) تصدير وتحديث المنهج كاملاً من النظام إلى ورقة "الدروس" بالهيكل الأفقي
    if (data.action === "sync_full_curriculum" && Array.isArray(data.curriculum)) {
      var sheet = getLessonsSheet(ss);
      
      var maxItemsPerLesson = 1;
      var grouped = {};
      var subjectsOrder = [];
      
      for (var i = 0; i < data.curriculum.length; i++) {
        var itm = data.curriculum[i];
        var s = String(itm.lessonSubject || "الدرس الأول").trim();
        if (!grouped[s]) {
          grouped[s] = [];
          subjectsOrder.push(s);
        }
        grouped[s].push(itm);
        if (grouped[s].length > maxItemsPerLesson) {
          maxItemsPerLesson = grouped[s].length;
        }
      }
      
      // التأكد من توفر جميع الأعمدة وتوسيع الورقة تلقائياً
      var totalColsNeeded = 1 + (Math.max(maxItemsPerLesson, 4) * 8);
      var curMaxCols = sheet.getMaxColumns();
      if (curMaxCols < totalColsNeeded) {
        sheet.insertColumnsAfter(curMaxCols, totalColsNeeded - curMaxCols);
      }
      
      // التأكد من توفر صفوف كافية
      var totalRowsNeeded = Math.max(subjectsOrder.length + 5, 20);
      var curMaxRows = sheet.getMaxRows();
      if (curMaxRows < totalRowsNeeded) {
        sheet.insertRowsAfter(curMaxRows, totalRowsNeeded - curMaxRows);
      }
      
      // تفريغ المحتويات القديمة من الصف 2 فما دون
      var lastR = sheet.getLastRow();
      if (lastR > 1) {
        sheet.getRange(2, 1, lastR - 1, sheet.getMaxColumns()).clearContent();
      }
      
      // عناوين الأعمدة في الصف 1
      var headerRow = ["موضوع الدرس"];
      for (var k = 1; k <= Math.max(maxItemsPerLesson, 4); k++) {
        headerRow.push(
          "الفئة " + k,
          "رابط الصورة " + k,
          "رابط الصوت " + k,
          "نص للقراءة الآلية " + k,
          "نص الدرس " + k,
          "المعنى والتوضيح " + k,
          "إرشادات المخرج " + k,
          "عدد التكرار " + k
        );
      }
      
      sheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
      sheet.getRange(1, 1, 1, headerRow.length).setFontWeight("bold").setBackground("#e6f4ea");
      
      // تجهيز مصفوفة الصفوف وكتابتها دفعة واحدة لسرعة وأمان تامين
      if (subjectsOrder.length > 0) {
        var allRows = [];
        for (var sIdx = 0; sIdx < subjectsOrder.length; sIdx++) {
          var subjectName = subjectsOrder[sIdx];
          var items = grouped[subjectName] || [];
          var rowData = [subjectName];
          
          for (var itemIdx = 0; itemIdx < items.length; itemIdx++) {
            var curItem = items[itemIdx];
            rowData.push(
              curItem.category || "الكلمة",
              curItem.imageUrl || "",
              curItem.audioUrl || "",
              curItem.autoReadText || "",
              curItem.word || "",
              curItem.meaning || "",
              curItem.makhrajTip || "",
              (function() {
                var rep = parseInt(curItem.repeatCount) || 1;
                var diff = curItem.difficultyLevel || "medium";
                var diffArabic = diff === "easy" ? "سهل" : (diff === "hard" ? "متقدم" : "متوسط");
                var dur = parseInt(curItem.recordingDuration) || 5;
                var mr = (curItem.maxRetries !== undefined && curItem.maxRetries !== null) ? parseInt(curItem.maxRetries) : (curItem.allowRetry === false ? 0 : 3);
                var retryArabic = mr === 0 ? "منع الإعادة" : (mr < 0 ? "إعادة غير محدودة" : ("إعادة " + mr));
                return rep + "," + diffArabic + "," + dur + "," + retryArabic;
              })()
            );
          }
          
          while (rowData.length < headerRow.length) {
            rowData.push("");
          }
          allRows.push(rowData);
        }
        
        sheet.getRange(2, 1, allRows.length, headerRow.length).setValues(allRows);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        count: data.curriculum.length,
        lessonsCount: subjectsOrder.length,
        sheetName: sheet.getName(),
        spreadsheetName: ss.getName(),
        spreadsheetUrl: ss.getUrl(),
        message: "تم بنجاح رفع " + data.curriculum.length + " تمريناً إلى ورقة [" + sheet.getName() + "] في ملف (" + ss.getName() + ")!"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // (هـ) تسجيل درجات وتقييم الطلاب في ورقة "سجل_النتائج"
    var resultSheet = ss.getSheetByName("سجل_النتائج") || ss.getSheetByName("النتائج");
    if (!resultSheet) {
      resultSheet = ss.insertSheet("سجل_النتائج");
      resultSheet.appendRow([
        "التاريخ والوقت",
        "اسم الطالب",
        "الكلمة أو الحرف",
        "الدرجة %",
        "التقدير",
        "ما سُمع من الطالب",
        "نظام التقييم",
        "ملاحظات التقييم"
      ]);
      resultSheet.getRange(1, 1, 1, 8).setBackground("#047857").setFontColor("#ffffff").setFontWeight("bold");
    }
    
    resultSheet.appendRow([
      data.timestamp || new Date().toLocaleString(),
      data.studentName || "طالب",
      data.word || "",
      data.score || 0,
      data.grade || "",
      data.detectedWord || "",
      data.engineUsed || "داخلي",
      data.feedback || ""
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    var errStr = err.toString();
    var friendlyError = errStr;
    if (errStr.indexOf("DriveApp") !== -1 || errStr.indexOf("permission") !== -1 || errStr.indexOf("drive.readonly") !== -1) {
      friendlyError = "خطأ في أذونات Google Drive: " + errStr + " (تأكد من تشغيل دالة authorizePermissions ثم عمل Deploy -> Manage Deployments -> تعديل واختيار New Version).";
    }
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: friendlyError
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
