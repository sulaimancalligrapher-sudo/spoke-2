import { DrawingTemplate, LessonStep, LessonDifficulty } from '../types/drawing';
import { DRAWING_TEMPLATES } from '../data/drawingTemplates';
import { formatDirectImageUrl } from '../utils/urlHelper';
import { ARRewardTier, splitARRewardsPayload } from './arRewardsService';
import { DEFAULT_WEBHOOK_URL, GOOGLE_APPS_SCRIPT_TEMPLATE } from '../../utils/googleSheets';

const SHEET_URL_KEY = 'arabic_ar_sheet_url';
const LOCAL_TEMPLATES_KEY = 'arabic_ar_horizontal_templates_v3';
const LOCAL_STEPS_CACHE_KEY = 'arabic_ar_steps_backup_cache';

export const DEFAULT_SHEET_URL = DEFAULT_WEBHOOK_URL;

/**
 * Return authentic Arabic ordinal word for steps
 */
export function getArabicOrdinal(num: number): string {
  const ordinals: Record<number, string> = {
    1: 'الخطوة الأولى',
    2: 'الخطوة الثانية',
    3: 'الخطوة الثالثة',
    4: 'الخطوة الرابعة',
    5: 'الخطوة الخامسة',
    6: 'الخطوة السادسة',
    7: 'الخطوة السابعة',
    8: 'الخطوة الثامنة',
    9: 'الخطوة التاسعة',
    10: 'الخطوة العاشرة',
    11: 'الخطوة الحادية عشرة',
    12: 'الخطوة الثانية عشرة',
    13: 'الخطوة الثالثة عشرة',
    14: 'الخطوة الرابعة عشرة',
    15: 'الخطوة الخامسة عشرة',
  };
  return ordinals[num] || `الخطوة ${num}`;
}

/**
 * Return authentic feminine Arabic ordinal word for drawings/repetitions
 */
export function getArabicDrawingOrdinal(num: number): string {
  const ordinals: Record<number, string> = {
    1: 'الأولى',
    2: 'الثانية',
    3: 'الثالثة',
    4: 'الرابعة',
    5: 'الخامسة',
    6: 'السادسة',
    7: 'السابعة',
    8: 'الثامنة',
    9: 'التاسعة',
    10: 'العاشرة',
    11: 'الحادية عشرة',
    12: 'الثانية عشرة',
    13: 'الثالثة عشرة',
    14: 'الرابعة عشرة',
    15: 'الخامسة عشرة',
  };
  return ordinals[num] || `رقم ${num}`;
}

export function getStepAudioPrompt(step: LessonStep): string {
  if (step.audioHint && step.audioHint.trim()) {
    const hint = step.audioHint.trim();
    if (/^\d+$/.test(hint)) {
      return getArabicOrdinal(parseInt(hint, 10));
    }
    const normalized = hint.replace(/(?:الخطوة|خطوة)\s*(\d+)/g, (_, d) => {
      return getArabicOrdinal(parseInt(d, 10));
    });
    return normalized;
  }
  return getArabicOrdinal(step.stepNumber);
}

export function parseStepsData(raw: any): LessonStep[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Array.isArray((raw as any).steps)) return (raw as any).steps;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'سهل' || trimmed === 'متوسط' || trimmed === 'متقدم' || trimmed === 'صعب') {
      return [];
    }
    try {
      let parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.steps)) return parsed.steps;
    } catch {
      try {
        const cleaned = trimmed.replace(/'/g, '"');
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }
  return [];
}

export function parseDifficultyField(raw: any): {
  difficulty: LessonDifficulty;
  hideDots: boolean;
  hideImage: boolean;
  maxRetries: number;
  allowRetry: boolean;
} {
  const str = String(raw || 'سهل').trim();
  const hideDots = str.includes('بدون_نقاط') || str.includes('إخفاء_النقاط') || str.includes('no_dots');
  const hideImage = str.includes('بدون_صورة') || str.includes('اختبار_ذاكرة') || str.includes('no_image');

  let baseDifficulty: LessonDifficulty = 'سهل';
  if (str.includes('متقدم') || str.includes('advanced') || str.includes('صعب')) {
    baseDifficulty = 'متقدم';
  } else if (str.includes('متوسط') || str.includes('normal') || str.includes('medium')) {
    baseDifficulty = 'متوسط';
  } else {
    baseDifficulty = 'سهل';
  }

  let maxRetries = 3;
  if (
    str.includes('منع_الإعادة') ||
    str.includes('منع الإعادة') ||
    str.includes('منع_الاعادة') ||
    str.includes('no_retry')
  ) {
    maxRetries = 0;
  } else if (
    str.includes('إعادة_مفتوحة') ||
    str.includes('غير_محدود') ||
    str.includes('غير محدود') ||
    str.includes('unlimited')
  ) {
    maxRetries = -1;
  } else {
    const m = str.match(/(?:إعادة|اعادة|محاولات|retry)\s*[:=]?\s*(\d+)/i);
    if (m) {
      const parsed = parseInt(m[1], 10);
      if (!isNaN(parsed)) {
        maxRetries = Math.max(0, parsed);
      }
    }
  }

  return {
    difficulty: baseDifficulty,
    hideDots,
    hideImage,
    maxRetries,
    allowRetry: maxRetries !== 0,
  };
}

export function formatDifficultyField(
  difficulty: LessonDifficulty,
  hideDots?: boolean,
  hideImage?: boolean,
  maxRetries?: number
): string {
  const parts: string[] = [difficulty || 'سهل'];
  if (hideDots) parts.push('بدون_نقاط');
  if (hideImage) parts.push('بدون_صورة');
  const effRetries =
    typeof maxRetries === 'number' && !isNaN(maxRetries)
      ? maxRetries < 0
        ? -1
        : Math.floor(maxRetries)
      : 3;
  if (effRetries === 0) {
    parts.push('منع_الإعادة');
  } else if (effRetries < 0) {
    parts.push('إعادة_مفتوحة');
  } else {
    parts.push(`إعادة:${effRetries}`);
  }
  return parts.join('|');
}

export interface SheetSyncStatus {
  connected: boolean;
  lastSyncTime: Date | null;
  error?: string | null;
}

export const GOOGLE_APPS_SCRIPT_CODE = GOOGLE_APPS_SCRIPT_TEMPLATE;

export interface RegistrantUser {
  id: string;
  name: string;
  loginDate?: string;
}

const LOCAL_USER_KEY = 'arabic_calligraphy_user';
const LOCAL_REGISTRANTS_CACHE_KEY = 'arabic_calligraphy_registrants_cache';

export const DEFAULT_SAMPLE_REGISTRANTS: RegistrantUser[] = [
  { id: '111', name: 'حامد' },
  { id: '222', name: 'حنين' },
  { id: '444', name: 'نور' },
  { id: '555', name: 'داود' },
  { id: '101', name: 'أحمد محمد' },
];

async function fetchJsonViaProxyOrDirect(targetUrl: string): Promise<any> {
  try {
    const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
    if (proxyRes.ok) {
      const json = await proxyRes.json().catch(() => null);
      if (json) return json;
    }
  } catch {}

  const directRes = await fetch(targetUrl, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'follow',
  });
  if (!directRes.ok) {
    throw new Error(`خطأ في استجابة الخادم: ${directRes.status} ${directRes.statusText}`);
  }
  return directRes.json();
}

async function postJsonViaDirectOrProxy(url: string, payload: Record<string, any>): Promise<any> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      const json = await response.json().catch(() => null);
      if (json) return json;
    }
  } catch {}

  const proxyRes = await fetch('/api/google-sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUrl: url, payload }),
  });
  if (!proxyRes.ok) {
    throw new Error(`خطأ في استجابة الخادم: ${proxyRes.status}`);
  }
  return proxyRes.json();
}

class SheetService {
  private overrideUrl: string = '';

  public setOverrideUrl(url?: string): void {
    const clean = (url || '').trim();
    this.overrideUrl = clean;
    if (clean && typeof window !== 'undefined') {
      try {
        localStorage.setItem(SHEET_URL_KEY, clean);
      } catch {}
    }
  }

  public getStoredSheetUrl(): string {
    if (this.overrideUrl && this.overrideUrl.startsWith('http')) {
      return this.overrideUrl;
    }
    if (typeof window === 'undefined') return DEFAULT_WEBHOOK_URL;
    try {
      const mainConfigRaw = localStorage.getItem('faseeh_sheets_config_v1');
      if (mainConfigRaw) {
        const parsed = JSON.parse(mainConfigRaw);
        if (parsed?.webhookUrl && String(parsed.webhookUrl).trim().startsWith('http')) {
          return String(parsed.webhookUrl).trim();
        }
      }
      const stored = localStorage.getItem(SHEET_URL_KEY);
      if (stored && stored.trim().startsWith('http')) {
        return stored.trim();
      }
    } catch {}
    return DEFAULT_WEBHOOK_URL;
  }

  public setStoredSheetUrl(url: string): void {
    const trimmed = url.trim() || DEFAULT_WEBHOOK_URL;
    this.overrideUrl = trimmed;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(SHEET_URL_KEY, trimmed);
      } catch {}
    }
  }

  public getStepsBackupMap(): Record<string, LessonStep[]> {
    if (typeof window === 'undefined') return {};
    try {
      const cached = localStorage.getItem(LOCAL_STEPS_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return {};
  }

  public saveStepsToBackup(lessonTitle: string, steps: LessonStep[]): void {
    if (typeof window === 'undefined' || !lessonTitle) return;
    try {
      const map = this.getStepsBackupMap();
      map[lessonTitle.trim()] = steps;
      localStorage.setItem(LOCAL_STEPS_CACHE_KEY, JSON.stringify(map));
    } catch {}
  }

  public getLocalTemplates(): DrawingTemplate[] {
    if (typeof window === 'undefined') return this.normalizeTemplates(DRAWING_TEMPLATES);
    try {
      const cached = localStorage.getItem(LOCAL_TEMPLATES_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return this.normalizeTemplates(parsed);
        }
      }
    } catch {}
    return this.normalizeTemplates(DRAWING_TEMPLATES);
  }

  public saveLocalTemplates(templates: DrawingTemplate[]): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(templates));
        templates.forEach((t) => {
          if (t.steps && t.steps.length > 0) {
            this.saveStepsToBackup(t.title, t.steps);
          }
        });
      } catch {}
    }
  }

  public normalizeTemplates(rawList: DrawingTemplate[]): DrawingTemplate[] {
    const backupStepsMap = this.getStepsBackupMap();
    return rawList.map((item, idx) => {
      const topic = (item.topic || 'خط النسخ (الأساسيات)').trim();
      let category = (item.category || 'حروف').trim();
      if (category === 'letters') category = 'حروف';
      if (category === 'words') category = 'كلمات';
      if (category === 'shapes') category = 'رسمة وزخرفة';

      const directImg = formatDirectImageUrl(item.imageUrl);
      const title = (item.title || `درس ${idx + 1}`).trim();

      let parsedSteps: LessonStep[] = [];
      if (Array.isArray(item.steps) && item.steps.length > 0) {
        parsedSteps = item.steps;
      } else if (item.stepsData) {
        parsedSteps = parseStepsData(item.stepsData);
      }

      if (parsedSteps.length === 0 && backupStepsMap[title]) {
        parsedSteps = backupStepsMap[title];
      }

      const diffObj = parseDifficultyField(item.difficulty);
      const effRetries =
        typeof item.maxRetries === 'number' && !isNaN(item.maxRetries)
          ? item.maxRetries < 0
            ? -1
            : Math.floor(item.maxRetries)
          : item.allowRetry === false
          ? 0
          : diffObj.maxRetries;

      return {
        ...item,
        id: item.id || `tpl_${idx}_${Date.now()}`,
        topic,
        category,
        imageUrl: directImg || item.imageUrl || '',
        title,
        titleEn: item.titleEn || '',
        arabicAudioText: item.arabicAudioText || item.title || '',
        repeatCount: Number(item.repeatCount) || 1,
        difficulty: item.difficulty ? diffObj.difficulty : (item.difficulty || 'سهل'),
        hideDots: item.hideDots !== undefined ? item.hideDots : diffObj.hideDots,
        hideImage: item.hideImage !== undefined ? item.hideImage : diffObj.hideImage,
        maxRetries: effRetries,
        allowRetry: effRetries !== 0,
        slotIndex: item.slotIndex !== undefined ? item.slotIndex : idx + 1,
        svgData: item.svgData || '',
        steps: parsedSteps,
        stepsData: item.stepsData || (parsedSteps.length > 0 ? JSON.stringify(parsedSteps) : ''),
      };
    });
  }

  public async fetchLessonsFromSheet(): Promise<{
    success: boolean;
    lessons: DrawingTemplate[];
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return {
        success: false,
        lessons: this.getLocalTemplates(),
        error: 'لم يتم إدخال رابط تطبيق ويب Google Apps Script بعد',
      };
    }

    try {
      const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=get_writing_lessons&_ts=${Date.now()}`;
      const json = await fetchJsonViaProxyOrDirect(fetchUrl);

      if ((json.status === 'success' || json.success) && Array.isArray(json.lessons)) {
        if (json.lessons.length === 0) {
          this.saveLocalTemplates([]);
          return { success: true, lessons: [] };
        }

        const validTemplates: DrawingTemplate[] = json.lessons.map((item: any, slotIdx: number) => {
          const topic = (item.topic || 'خط النسخ').trim();
          const category = (item.category || 'حروف').trim();
          const rawImg = String(item.imageUrl || '').trim();
          const directImg = formatDirectImageUrl(rawImg);
          const title = String(item.title || 'درس بدون عنوان').trim();
          const tts = String(item.arabicAudioText || title).trim();
          const steps: LessonStep[] = parseStepsData(item.stepsData);
          const diffObj = parseDifficultyField(item.difficulty);
          const effRetries =
            typeof item.maxRetries === 'number' && !isNaN(item.maxRetries)
              ? item.maxRetries < 0
                ? -1
                : Math.floor(item.maxRetries)
              : diffObj.maxRetries;

          return {
            id: String(item.id || `sheet_${topic}_${title}`),
            topic,
            category,
            imageUrl: directImg,
            title,
            titleEn: String(item.titleEn || ''),
            arabicAudioText: tts,
            repeatCount: Number(item.repeatCount) || 1,
            difficulty: diffObj.difficulty,
            hideDots: diffObj.hideDots,
            hideImage: diffObj.hideImage,
            maxRetries: effRetries,
            allowRetry: effRetries !== 0,
            slotIndex: Number(item.slotIndex) || slotIdx + 1,
            description: String(item.description || ''),
            svgData: item.svgData || '',
            tags: [topic, category, diffObj.difficulty],
            steps,
            stepsData: item.stepsData || (steps.length > 0 ? JSON.stringify(steps) : ''),
          };
        });

        const normalized = this.normalizeTemplates(validTemplates);
        this.saveLocalTemplates(normalized);
        return { success: true, lessons: normalized };
      }

      throw new Error(json.message || json.error || 'استجابة غير صالحة من Google Sheets');
    } catch (err: any) {
      return {
        success: false,
        lessons: this.getLocalTemplates(),
        error: err.message || 'فشل الاتصال بجدول البيانات',
      };
    }
  }

  public async saveLessonToSheet(
    lesson: DrawingTemplate,
    originalTitle?: string
  ): Promise<{ success: boolean; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (lesson.steps && lesson.steps.length > 0) {
      this.saveStepsToBackup(lesson.title, lesson.steps);
    }
    if (!url) {
      return { success: false, error: 'الرابط غير موجود' };
    }

    const stepsSerialized =
      lesson.stepsData || (lesson.steps && lesson.steps.length > 0 ? JSON.stringify(lesson.steps) : '');
    const serializedDifficulty = formatDifficultyField(
      lesson.difficulty || 'سهل',
      lesson.hideDots,
      lesson.hideImage,
      lesson.maxRetries
    );

    try {
      const json = await postJsonViaDirectOrProxy(url, {
        action: 'save_writing_lesson',
        originalTitle: originalTitle || lesson.title,
        lesson: {
          topic: lesson.topic || 'خط النسخ',
          category: lesson.category || 'حروف',
          imageUrl: lesson.imageUrl || '',
          title: lesson.title,
          arabicAudioText: lesson.arabicAudioText || lesson.title,
          repeatCount: Number(lesson.repeatCount) || 1,
          difficulty: serializedDifficulty,
          stepsData: stepsSerialized,
        },
      });
      if (json.status === 'success' || json.success) {
        return { success: true };
      }
      throw new Error(json.message || json.error || 'خطأ في حفظ الدرس في الشيت');
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر الاتصال بـ Google Sheets' };
    }
  }

  public async deleteLessonFromSheet(
    topic: string,
    title: string,
    imageUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) return { success: false, error: 'الرابط غير موجود' };

    try {
      const json = await postJsonViaDirectOrProxy(url, {
        action: 'delete_writing_lesson',
        topic,
        title,
        imageUrl,
      });
      return {
        success: json.status === 'success' || Boolean(json.success),
        error: json.message || json.error,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر حذف الدرس من الشيت' };
    }
  }

  public async syncAllLessonsToSheet(
    lessons: DrawingTemplate[]
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, error: 'لم يتم ضبط رابط Google Apps Script بعد' };
    }

    try {
      const json = await postJsonViaDirectOrProxy(url, {
        action: 'sync_writing_lessons',
        lessons: lessons.map((l) => ({
          topic: l.topic || 'خط النسخ',
          category: l.category || 'حروف',
          imageUrl: l.imageUrl || '',
          title: l.title,
          arabicAudioText: l.arabicAudioText || l.title,
          repeatCount: Number(l.repeatCount) || 1,
          difficulty: formatDifficultyField(l.difficulty || 'سهل', l.hideDots, l.hideImage, l.maxRetries),
          stepsData: l.stepsData || (l.steps && l.steps.length > 0 ? JSON.stringify(l.steps) : ''),
        })),
      });

      if (json.status === 'success' || json.success) {
        return { success: true, count: json.count };
      }
      throw new Error(json.message || json.error || 'فشل مزامنة الدروس مع الشيت');
    } catch (err: any) {
      return { success: false, error: err.message || 'تعذر إرسال البيانات إلى Google Sheets' };
    }
  }

  public async initializeSheetWithDefaults(): Promise<{ success: boolean; count?: number; error?: string }> {
    return this.syncAllLessonsToSheet(this.getLocalTemplates());
  }

  public getStoredUser(): RegistrantUser | null {
    if (typeof window === 'undefined') return null;
    try {
      const data = localStorage.getItem(LOCAL_USER_KEY);
      if (data) return JSON.parse(data);
    } catch {}
    return null;
  }

  public saveStoredUser(user: RegistrantUser | null): void {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_USER_KEY);
    }
  }

  public getCachedRegistrants(): RegistrantUser[] {
    if (typeof window === 'undefined') return DEFAULT_SAMPLE_REGISTRANTS;
    try {
      const data = localStorage.getItem(LOCAL_REGISTRANTS_CACHE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_SAMPLE_REGISTRANTS;
  }

  public saveCachedRegistrants(registrants: RegistrantUser[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_REGISTRANTS_CACHE_KEY, JSON.stringify(registrants));
    } catch {}
  }

  public normalizeArabicText(str: string): string {
    if (!str) return '';
    return str
      .trim()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/[ىيئ]/g, 'ي')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  public async fetchRegistrants(): Promise<{
    success: boolean;
    registrants: RegistrantUser[];
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: true, registrants: this.getCachedRegistrants() };
    }

    try {
      const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=get_registrants&_ts=${Date.now()}`;
      const json = await fetchJsonViaProxyOrDirect(fetchUrl);

      if ((json.status === 'success' || json.success) && Array.isArray(json.registrants)) {
        const list: RegistrantUser[] = json.registrants.map((r: any) => ({
          id: String(r.id || '').trim(),
          name: String(r.name || '').trim(),
        }));
        if (list.length > 0) {
          this.saveCachedRegistrants(list);
          return { success: true, registrants: list };
        }
      }
      return { success: true, registrants: this.getCachedRegistrants() };
    } catch (err: any) {
      return {
        success: true,
        registrants: this.getCachedRegistrants(),
        error: err.message,
      };
    }
  }

  public async verifyRegistrant(
    rawId: string,
    rawName: string
  ): Promise<{ success: boolean; user?: RegistrantUser; error?: string }> {
    const cleanId = this.normalizeArabicText(rawId);
    const cleanName = this.normalizeArabicText(rawName);
    if (!cleanId) return { success: false, error: 'يرجى إدخال رقم المشترك (ID)' };
    if (!cleanName) return { success: false, error: 'يرجى إدخال اسم المشترك' };

    let registrants: RegistrantUser[] = [];
    try {
      const fresh = await this.fetchRegistrants();
      if (fresh.success && fresh.registrants?.length > 0) {
        registrants = fresh.registrants;
      }
    } catch {}

    if (registrants.length === 0) {
      registrants = this.getCachedRegistrants();
    }

    const matched = registrants.find((r) => {
      const regId = this.normalizeArabicText(r.id);
      const regName = this.normalizeArabicText(r.name);
      return regId === cleanId && (regName === cleanName || regName.includes(cleanName) || cleanName.includes(regName));
    });

    if (matched) {
      const verifiedUser: RegistrantUser = {
        id: matched.id,
        name: matched.name,
        loginDate: new Date().toISOString(),
      };
      this.saveStoredUser(verifiedUser);
      return { success: true, user: verifiedUser };
    }

    const idOnlyMatch = registrants.find((r) => this.normalizeArabicText(r.id) === cleanId);
    if (idOnlyMatch) {
      return {
        success: false,
        error: `رقم المشترك (${rawId}) مسجل في الشيت باسم «${idOnlyMatch.name}»، يرجى التأكد من كتابة الاسم بصورة صحيحة.`,
      };
    }

    return {
      success: false,
      error: `رقم المشترك (${rawId}) غير مسجل في ورقة ID registrants في Google Sheets.`,
    };
  }

  public async addRegistrant(
    id: string,
    name: string
  ): Promise<{ success: boolean; user?: RegistrantUser; error?: string }> {
    const url = this.getStoredSheetUrl();
    if (!url) return { success: false, error: 'رابط الشيت غير مضبوط' };

    try {
      const json = await postJsonViaDirectOrProxy(url, {
        action: 'add_registrant',
        id: id.trim(),
        name: name.trim(),
      });
      if (json.status === 'success' || json.success) {
        const newUser: RegistrantUser = { id: id.trim(), name: name.trim() };
        const currentList = this.getCachedRegistrants();
        this.saveCachedRegistrants([newUser, ...currentList.filter((u) => u.id !== newUser.id)]);
        return { success: true, user: newUser };
      }
      return { success: false, error: json.message || json.error || 'تعذر إضافة المشترك' };
    } catch (err: any) {
      return { success: false, error: err.message || 'خطأ في الاتصال بالخادم' };
    }
  }

  /**
   * Submit student's writing exercise answer, upload drawing to Google Drive,
   * and log row into sheet 'answers 4'
   */
  public async submitLessonAnswer(payload: {
    studentId: string;
    studentName: string;
    topic: string;
    slotIndex: number;
    category: string;
    text: string;
    imageBase64: string;
    score: number;
    details: string;
    totalLessonsInTopic?: number;
  }): Promise<{
    success: boolean;
    imageUrl?: string;
    driveError?: string;
    completionStatus?: string;
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, error: 'رابط Google Apps Script غير مضبوط' };
    }

    try {
      const json = await postJsonViaDirectOrProxy(url, {
        action: 'submit_writing_answer',
        sheetName: 'answers 4',
        ...payload,
      });

      if (json.status === 'success' || json.success) {
        return {
          success: true,
          imageUrl: json.imageUrl,
          driveError: json.driveError || '',
          completionStatus: json.completionStatus,
        };
      }
      return {
        success: false,
        error: json.message || json.error || 'تعذر تسجيل الإجابة في ورقة answers 4',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'حدث خطأ أثناء رفع الإجابة وحفظها',
      };
    }
  }

  public async fetchARRewardsFromSheet(): Promise<{
    success: boolean;
    rewards: ARRewardTier[];
    introReward?: ARRewardTier | null;
    needsScriptUpdate?: boolean;
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, rewards: [], introReward: null };
    }

    try {
      const fetchUrl = `${url}${url.includes('?') ? '&' : '?'}action=get_ar_rewards&_ts=${Date.now()}`;
      const json = await fetchJsonViaProxyOrDirect(fetchUrl);

      if ((json.status === 'success' || json.success) && Array.isArray(json.rewards)) {
        if (json.rewards.length === 0) {
          return { success: true, rewards: [], introReward: null };
        }
        const { intro, tiers } = splitARRewardsPayload(json.rewards);
        return { success: true, rewards: tiers, introReward: intro };
      }

      if (Array.isArray(json.curriculum) || Array.isArray(json.lessons)) {
        return {
          success: false,
          rewards: [],
          introReward: null,
          needsScriptUpdate: true,
          error: 'يتطلب تحديث كود Apps Script لدعم ورقة AR Rewards',
        };
      }

      return {
        success: false,
        rewards: [],
        introReward: null,
        error: json.message || json.error || 'تعذر قراءة مكافآت الواقع المعزز من الشيت',
      };
    } catch (err: any) {
      return {
        success: false,
        rewards: [],
        introReward: null,
        error: err.message || 'تعذر الاتصال بـ Google Sheets',
      };
    }
  }

  public async saveARRewardsToSheet(
    tiers: ARRewardTier[],
    introReward?: ARRewardTier | null
  ): Promise<{
    success: boolean;
    rewards?: ARRewardTier[];
    introReward?: ARRewardTier | null;
    needsScriptUpdate?: boolean;
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, error: 'رابط Google Apps Script غير مضبوط' };
    }

    const allToSend = introReward
      ? [{ ...introReward, id: '__ar_intro__', minScore: 0, maxScore: 0 }, ...tiers.filter((t) => t.id !== '__ar_intro__')]
      : tiers;

    try {
      const json = await postJsonViaDirectOrProxy(url, {
        action: 'save_ar_rewards',
        rewards: allToSend.map((t) => ({
          id: t.id,
          title: t.title,
          minScore: t.minScore,
          maxScore: t.maxScore,
          presetId: t.presetId || '',
          imageUrl: t.presetId ? '' : t.imageUrl || '',
          scaleRatio: t.scaleRatio,
          offsetYRatio: t.offsetYRatio,
          enabled: t.enabled,
        })),
      });

      if (json.status === 'success' || json.success) {
        if (Array.isArray(json.rewards)) {
          const { intro, tiers: normalizedTiers } = splitARRewardsPayload(json.rewards);
          return { success: true, rewards: normalizedTiers, introReward: intro };
        }
        return { success: true, rewards: tiers, introReward: introReward || null };
      }

      const msg = String(json.message || json.error || '');
      if (msg.includes('Unknown action')) {
        return {
          success: false,
          needsScriptUpdate: true,
          error: 'كود Apps Script المنشور على الشيت قديم ولا يدعم ورقة AR Rewards بعد',
        };
      }
      return {
        success: false,
        error: msg || 'تعذر حفظ مكافآت الواقع المعزز في الشيت',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'حدث خطأ أثناء إرسال الإعدادات إلى الشيت',
      };
    }
  }

  public async uploadARRewardImage(
    tierId: string,
    imageBase64: string
  ): Promise<{
    success: boolean;
    imageUrl?: string;
    needsScriptUpdate?: boolean;
    error?: string;
  }> {
    const url = this.getStoredSheetUrl();
    if (!url) {
      return { success: false, error: 'رابط Google Apps Script غير مضبوط' };
    }

    try {
      const json = await postJsonViaDirectOrProxy(url, {
        action: 'upload_ar_reward_image',
        tierId,
        imageBase64,
      });

      if ((json.status === 'success' || json.success) && json.imageUrl) {
        return { success: true, imageUrl: String(json.imageUrl) };
      }

      const msg = String(json.message || json.error || '');
      if (msg.includes('Unknown action')) {
        return {
          success: false,
          needsScriptUpdate: true,
          error: 'كود Apps Script المنشور لا يدعم الرفع المباشر لمجلد الجوائز بعد',
        };
      }

      return { success: false, error: msg || 'تعذر رفع الصورة إلى قوقل درايف' };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'خطأ أثناء رفع الصورة إلى Google Drive',
      };
    }
  }
}

export const sheetService = new SheetService();
