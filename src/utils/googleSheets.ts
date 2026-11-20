import {
  WordItem,
  StudentSubmissionRecord,
  StudentRegistrant,
  HomeBrandConfig,
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
  'https://script.google.com/macros/s/AKfycbwSvwtAQrVqNlLbhxtM6nckp3tXbXXzHnueEFWKNJrQsg5KXOCXWNDgZ2kHeuzfhviTTA/exec';

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
        return { success: false, error: data.error || data.message || 'خطأ من مزود Google Sheets' };
      }
    } else {
      const errData = await proxyRes.json().catch(() => null);
      if (errData && (errData.error || errData.message)) {
        return { success: false, error: errData.error || errData.message };
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

/**
 * Initialize or ensure sheet "ID registrants" exists with Col A: ID and Col B: اسم المشترك
 */
export async function ensureIDRegistrantsSheet(webhookUrl: string): Promise<{ success: boolean; message: string }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'رابط Google Sheets Webhook غير صالح' };
  }

  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'init_registrants_sheet',
  });

  return {
    success: res.success,
    message: res.message || (res.success ? 'تم تجهيز ورقة ID registrants بنجاح' : 'خطأ في الاتصال'),
  };
}

/**
 * Fetch all registrants from sheet "ID registrants"
 */
export async function fetchIDRegistrants(webhookUrl: string): Promise<StudentRegistrant[]> {
  if (webhookUrl && webhookUrl.trim().startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(webhookUrl, { action: 'get_registrants' });
      if (res.success && res.data && Array.isArray(res.data.registrants)) {
        const list: StudentRegistrant[] = res.data.registrants
          .map((r: any) => ({
            id: String(r.id || '').trim(),
            name: String(r.name || '').trim(),
          }))
          .filter((r: StudentRegistrant) => r.id && r.name && r.id !== 'ID' && r.name !== 'اسم المشترك');

        try {
          localStorage.setItem('faseeh_cached_registrants', JSON.stringify(list));
        } catch {}

        if (list.length > 0) return list;
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
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  // Default demo registrants for offline/initial state
  return [
    { id: '1001', name: 'أحمد علي' },
    { id: '1002', name: 'فاطمة محمد' },
    { id: '1003', name: 'عمر خالد' },
  ];
}

/**
 * Verify student credentials against sheet "ID registrants"
 */
export async function verifyStudentLogin(
  webhookUrl: string,
  enteredName: string,
  enteredId: string
): Promise<{ success: boolean; student?: StudentRegistrant; error?: string }> {
  const cleanName = enteredName.trim();
  const cleanId = enteredId.trim();

  if (!cleanName || !cleanId) {
    return { success: false, error: 'يرجى إدخال اسم المشترك ورقم ID معاً.' };
  }

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

  // 1. Exact match on both ID and Name
  const matched = registrants.find((r) => {
    return String(r.id).trim() === cleanId && normalizeArabic(r.name) === normEntered;
  });

  if (matched) {
    return { success: true, student: matched };
  }

  // 2. If ID matches but name is different, give helpful guidance
  const idMatch = registrants.find((r) => String(r.id).trim() === cleanId);
  if (idMatch) {
    return {
      success: false,
      error: `رقم ID موجود ولكن الاسم غير مطابق للاسم المسجل في ورقة ID registrants (${idMatch.name}).`,
    };
  }

  // 3. If Name matches but ID is different
  const nameMatch = registrants.find((r) => normalizeArabic(r.name) === normEntered);
  if (nameMatch) {
    return {
      success: false,
      error: `الاسم مسجل ولكن رقم ID غير مطابق للرقم المسجل له في ورقة (ID registrants).`,
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

    const cfg: HomeBrandConfig = {
      logoUrl: data.homeConfig.logoUrl ? normalizeDriveImageUrl(data.homeConfig.logoUrl) : '',
      title: data.homeConfig.title || '',
      subtitle: data.homeConfig.subtitle || '',
      socialLinks: Array.isArray(data.homeConfig.socialLinks)
        ? data.homeConfig.socialLinks.filter((s: any) => s.url && s.iconKey)
        : [],
      card: cardConfig,
      adminUsers: Array.isArray(data.homeConfig.adminUsers) ? data.homeConfig.adminUsers : [],
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
 * 4. ستفتح نافذة جوجل لمنح الإذن لـ Google Drive والشيت: اضغط Review Permissions ثم اضغط Allow.
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
  Logger.log("تم تفويض Google Drive بنجاح: " + root.getName());
  Logger.log("تم تفويض Google Sheets بنجاح: " + ss.getName());
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

// دالة مساعدة لإنشاء أو استرجاع ورقة المشتركين "ID registrants"
function getIDRegistrantsSheet(ss) {
  var sheet = ss.getSheetByName("ID registrants");
  if (!sheet) {
    sheet = ss.insertSheet("ID registrants");
    sheet.appendRow(["ID", "اسم المشترك"]);
    sheet.getRange(1, 1, 1, 2).setBackground("#0c3868").setFontColor("#ffffff").setFontWeight("bold");
    sheet.appendRow(["1001", "أحمد علي"]);
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

function readTelegramConfigGS(ss) {
  var sheet = getTelegramConfigSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var cfg = { botToken: "", botUsername: "", enabled: false, welcomeMessage: "مرحباً بك! تم ربط حسابك بنجاح." };
  for (var i = 1; i < rows.length; i++) {
    var k = String(rows[i][0] || "").trim();
    var v = String(rows[i][1] || "").trim();
    if (k === "botToken") cfg.botToken = v;
    else if (k === "botUsername") cfg.botUsername = v;
    else if (k === "enabled") cfg.enabled = (v.toLowerCase() === "true" || v === "نعم" || v === "1");
    else if (k === "welcomeMessage" && v) cfg.welcomeMessage = v;
  }
  return cfg;
}

function writeTelegramConfigGS(ss, cfg) {
  var sheet = getTelegramConfigSheet(ss);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
  }
  sheet.getRange(2, 1, 4, 2).setValues([
    ["botToken", String(cfg.botToken || "").trim()],
    ["botUsername", String(cfg.botUsername || "").trim()],
    ["enabled", cfg.enabled ? "true" : "false"],
    ["welcomeMessage", String(cfg.welcomeMessage || "مرحباً بك! تم ربط حسابك بنجاح.").trim()]
  ]);
}

function sendTelegramBotMessageGS(ss, chatId, text, photoUrl) {
  var cfg = readTelegramConfigGS(ss);
  if (!cfg.botToken || !chatId) return false;
  try {
    var apiBase = "https://api.telegram.org/bot" + cfg.botToken;
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
    return code >= 200 && code < 300;
  } catch (tgErr) {
    Logger.log("Telegram send error: " + tgErr);
    return false;
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
  var m = s.match(/(?:إعادة|اعادة|محاولات|retry)\s*[:=]?\s*(\d+)/);
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
    var headers = ["ID المجموعة", "اسم المجموعة", "الوصف", "الدروس المختارة JSON", "تاريخ الإنشاء"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#0f766e").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getScheduleDaysSheet(ss) {
  var sheet = ss.getSheetByName(SCHEDULE_DAYS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULE_DAYS_SHEET_NAME);
    var headers = ["معرف اليوم", "التاريخ", "نوع اليوم", "ID المجموعة", "عنوان مخصص", "ملاحظات", "إعدادات الجدول JSON"];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#1e293b").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatSheetDateISO(val) {
  if (!val) return "";
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || "GMT+3", "yyyy-MM-dd");
  }
  var s = String(val).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + "-" + m[2] + "-" + m[3];
  return s;
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

  if (gSheet && gSheet.getLastRow() > 1) {
    var gRows = gSheet.getRange(2, 1, gSheet.getLastRow() - 1, Math.max(5, gSheet.getLastColumn())).getValues();
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
        createdAt: String(r[4] || "").trim()
      });
    }
  }

  if (dSheet && dSheet.getLastRow() > 1) {
    var dRows = dSheet.getRange(2, 1, dSheet.getLastRow() - 1, Math.max(7, dSheet.getLastColumn())).getValues();
    for (var j = 0; j < dRows.length; j++) {
      var dr = dRows[j];
      if (j === 0 && dr[6]) {
        try {
          var parsedSettings = JSON.parse(String(dr[6]));
          if (parsedSettings && typeof parsedSettings === "object") {
            settings = parsedSettings;
          }
        } catch (se) {}
      }
      var did = String(dr[0] || "").trim();
      var dDate = formatSheetDateISO(dr[1]);
      if (!dDate && did === "__SETTINGS__") continue;
      if (!dDate) continue;
      var gIds = parseScheduleGroupIdsGS(dr[3]);
      days.push({
        id: did || ("day_" + dDate),
        date: dDate,
        dayType: String(dr[2] || "lesson").trim(),
        groupIds: gIds,
        groupId: gIds[0] || "",
        customTitle: String(dr[4] || "").trim(),
        notes: String(dr[5] || "").trim()
      });
    }
  }

  return { groups: groups, days: days, settings: settings };
}

function writeCourseScheduleGS(ss, payload) {
  var gSheet = getScheduleGroupsSheet(ss);
  var dSheet = getScheduleDaysSheet(ss);
  var groups = Array.isArray(payload.groups) ? payload.groups : [];
  var days = Array.isArray(payload.days) ? payload.days : [];
  var settings = payload.settings || { lockFutureDays: true, courseTitle: "جدول الدورة اليومي" };

  if (gSheet.getLastRow() > 1) {
    gSheet.getRange(2, 1, gSheet.getLastRow() - 1, Math.max(5, gSheet.getLastColumn())).clearContent();
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
        String(g.createdAt || "")
      ]);
    }
    gSheet.getRange(2, 1, gValues.length, 5).setValues(gValues);
  }

  if (dSheet.getLastRow() > 1) {
    dSheet.getRange(2, 1, dSheet.getLastRow() - 1, Math.max(7, dSheet.getLastColumn())).clearContent();
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
        j === 0 ? JSON.stringify(settings) : ""
      ]);
    }
  } else {
    dValues.push(["__SETTINGS__", "", "", "", "", "", JSON.stringify(settings)]);
  }
  dSheet.getRange(2, 1, dValues.length, 7).setValues(dValues);
}

// 1. GET: جلب الدروس، أو بيانات ورقة الرئيسية، أو المشتركين، أو سجل إجابات الطالب من answers 1
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // (أ) إذا كان الطلب جلب بيانات ورقة "الرئيسية" (الشعار والعنوان والوصف وحسابات التواصل)
    if (e && e.parameter && e.parameter.action === "get_home_config") {
      var hConfig = readHomeConfig(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        homeConfig: hConfig
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
      var lastR = regSheet.getLastRow();
      var registrants = [];
      if (lastR > 1) {
        var vals = regSheet.getRange(2, 1, lastR - 1, 2).getValues();
        for (var i = 0; i < vals.length; i++) {
          var rId = String(vals[i][0] || "").trim();
          var rName = String(vals[i][1] || "").trim();
          if (rId && rName && rId !== "ID") {
            registrants.push({ id: rId, name: rName });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, registrants: registrants }))
        .setMimeType(ContentService.MimeType.JSON);
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

    // (ج-12) جلب بيانات المجموعات والجدول اليومي للدورة (GET)
    if (e && e.parameter && e.parameter.action === "get_course_schedule") {
      var schedData = readCourseScheduleGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        groups: schedData.groups,
        days: schedData.days,
        settings: schedData.settings
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
      homeConfig: readHomeConfig(ss)
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
      var candidateId = "";
      var startMatch = textMsg.match(/\\/start\\s+([^\\s]+)/i);
      if (startMatch) {
        candidateId = startMatch[1].trim();
      } else if (/^[a-zA-Z0-9_-]{2,}$/.test(textMsg)) {
        candidateId = textMsg;
      }

      if (candidateId) {
        var regSheetTg = getIDRegistrantsSheet(ss);
        var regRowsTg = regSheetTg.getDataRange().getValues();
        var matchedStudent = null;
        for (var rIdx = 1; rIdx < regRowsTg.length; rIdx++) {
          var rowId = String(regRowsTg[rIdx][0] || "").trim();
          var rowName = String(regRowsTg[rIdx][1] || "").trim();
          if (rowId === candidateId) {
            matchedStudent = { id: rowId, name: rowName };
            break;
          }
        }
        if (matchedStudent) {
          var uSheet = getTelegramUsersSheet(ss);
          var uRows = uSheet.getDataRange().getValues();
          var foundRow = -1;
          for (var u = 1; u < uRows.length; u++) {
            if (String(uRows[u][0] || "").trim() === matchedStudent.id) {
              foundRow = u + 1;
              break;
            }
          }
          var nowTg = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT+3", "yyyy/MM/dd HH:mm");
          var rowVals = [matchedStudent.id, matchedStudent.name, chatId, tgUser, nowTg, "true"];
          if (foundRow !== -1) {
            uSheet.getRange(foundRow, 1, 1, 6).setValues([rowVals]);
          } else {
            uSheet.appendRow(rowVals);
          }
          var tgCfg = readTelegramConfigGS(ss);
          sendTelegramBotMessageGS(ss, chatId, (tgCfg.welcomeMessage || "مرحباً بك!") + "\\nالطالب: " + matchedStudent.name + " (ID: " + matchedStudent.id + ")", "");
        } else {
          sendTelegramBotMessageGS(ss, chatId, "لم يتم العثور على رقم المشترك (" + candidateId + "). أرسل رقم الـ ID الصحيح للربط.", "");
        }
      } else {
        sendTelegramBotMessageGS(ss, chatId, "أهلاً بك! أرسل رقم المشترك (ID) الخاص بك لربط حسابك وتلقي الإشعارات وتصحيح المعلم.", "");
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
      if (data.sendTelegram) {
        var tgUsers = getTelegramUsersSheet(ss).getDataRange().getValues();
        for (var u = 1; u < tgUsers.length; u++) {
          var uId = String(tgUsers[u][0] || "").trim();
          var uName = String(tgUsers[u][1] || "").trim();
          var uChatId = String(tgUsers[u][2] || "").trim();
          var uEnabled = String(tgUsers[u][5] || "true") !== "false";
          if (uEnabled && uChatId && ((sId && uId === sId) || (sName && uName === sName))) {
            var summaryMsg = "<b>تم تصحيح واجبك في درس: " + lTitle + "</b>";
            if (data.imageScore) summaryMsg += "\\nدرجة الصورة: " + data.imageScore;
            if (data.imageNotes) summaryMsg += "\\nملاحظة المعلم: " + data.imageNotes;
            if (data.audioScore) summaryMsg += "\\nدرجة الصوت: " + data.audioScore;
            if (data.audioNotes) summaryMsg += "\\nتوجيه صوتي: " + data.audioNotes;
            telegramSent = sendTelegramBotMessageGS(ss, uChatId, summaryMsg, correctedImage || "");
            break;
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
          studentId: String(rows[u][0] || "").trim(),
          studentName: String(rows[u][1] || "").trim(),
          chatId: String(rows[u][2] || "").trim(),
          telegramUsername: String(rows[u][3] || "").trim(),
          linkedAt: String(rows[u][4] || "").trim(),
          notificationsEnabled: String(rows[u][5] || "true") !== "false"
        });
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, users: usersList }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "send_telegram_notification") {
      var msg = String(data.message || "").trim();
      var photo = String(data.photoUrl || "").trim();
      var sentCount = 0;
      if (data.chatId) {
        if (sendTelegramBotMessageGS(ss, String(data.chatId), msg, photo)) sentCount++;
      } else {
        var uRows = getTelegramUsersSheet(ss).getDataRange().getValues();
        for (var u = 1; u < uRows.length; u++) {
          var uId = String(uRows[u][0] || "").trim();
          var uName = String(uRows[u][1] || "").trim();
          var uChatId = String(uRows[u][2] || "").trim();
          var uEnabled = String(uRows[u][5] || "true") !== "false";
          if (!uEnabled || !uChatId) continue;
          if (data.broadcastAll || (data.studentId && uId === data.studentId) || (data.studentName && uName === data.studentName)) {
            if (sendTelegramBotMessageGS(ss, uChatId, msg, photo)) sentCount++;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: sentCount > 0,
        sentCount: sentCount,
        message: sentCount > 0 ? ("تم إرسال الإشعار بنجاح (" + sentCount + ")") : "لم يتم العثور على طلاب مربوطين بالبوت أو فشل الإرسال"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // (S) نقاط نهاية قسم المجموعات والجدول اليومي للدورة (POST)
    if (data.action === "get_course_schedule") {
      var schedRes = readCourseScheduleGS(ss);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
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

    // (-1) تهيئة ورقة "الرئيسية"
    if (data.action === "init_home_sheet") {
      getHomeSheet(ss);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "تم تهيئة ورقة الرئيسية بنجاح" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (0) جلب أو التحقق من ورقة "ID registrants" للمشتركين
    if (data.action === "get_registrants" || data.action === "verify_student") {
      var regSheet = getIDRegistrantsSheet(ss);
      var lastR = regSheet.getLastRow();
      var registrants = [];
      if (lastR > 1) {
        var vals = regSheet.getRange(2, 1, lastR - 1, 2).getValues();
        for (var i = 0; i < vals.length; i++) {
          var rId = String(vals[i][0] || "").trim();
          var rName = String(vals[i][1] || "").trim();
          if (rId && rName && rId !== "ID") {
            registrants.push({ id: rId, name: rName });
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, registrants: registrants }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // (0-ب) إنشاء وتجهيز ورقة "ID registrants" أو إضافة مشترك
    if (data.action === "init_registrants_sheet" || data.action === "add_registrant") {
      var regSheet = getIDRegistrantsSheet(ss);
      if (data.id && data.name) {
        regSheet.appendRow([String(data.id).trim(), String(data.name).trim()]);
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "تم إعداد ورقة ID registrants بنجاح" }))
        .setMimeType(ContentService.MimeType.JSON);
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
