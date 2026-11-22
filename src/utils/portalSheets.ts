import {
  PortalContentItem,
  PortalPublicData,
  PortalSectionConfig,
  PortalSettingsConfig,
  RegistrationAttachment,
  RegistrationQuestion,
  RegistrationStage,
  RegistrationSubmissionRecord,
  StudentRegistrant,
} from '../types';
import {
  callGoogleSheetsPost,
  DEFAULT_WEBHOOK_URL,
  STUDENT_AUDIO_DRIVE_FOLDER_ID,
  addIDRegistrantToSheet,
  normalizeDigits,
} from './googleSheets';
import { DEFAULT_PROGRAM_ID } from './courseSchedule';
import heroCalligraphyImg from '../assets/images/academy_hero_calligraphy_1795370348160.jpg';
import aboutStudioImg from '../assets/images/academy_about_studio_1795370349304.jpg';
import galleryArtworkImg from '../assets/images/academy_gallery_artwork_1795370347809.jpg';

const STORAGE_KEY_PORTAL_DATA = 'faseeh_public_portal_data_v1';
const STORAGE_KEY_REG_QUESTIONS = 'faseeh_portal_reg_questions_v1';
const STORAGE_KEY_REG_SUBMISSIONS = 'faseeh_portal_reg_submissions_v1';
const STORAGE_KEY_PORTAL_BOT_USER = 'faseeh_portal_bot_username_v1';

export const DEFAULT_PORTAL_SECTIONS: PortalSectionConfig[] = [
  { key: 'hero', label: 'القسم الترحيبي الرئيسي', enabled: true, sortOrder: 1 },
  { key: 'about', label: 'عن المؤسسة والمنهجية', enabled: true, sortOrder: 2 },
  { key: 'programs', label: 'البرامج والمسارات التعليمية', enabled: true, sortOrder: 3 },
  { key: 'gallery', label: 'معرض الأعمال والصور', enabled: true, sortOrder: 4 },
  { key: 'videos', label: 'مكتبة الفيديو التعريفية', enabled: true, sortOrder: 5 },
  { key: 'contact', label: 'التواصل والاستفسارات', enabled: true, sortOrder: 6 },
  { key: 'store_slot', label: 'المتجر (مساحة محجوزة)', enabled: false, sortOrder: 7 },
];

export const DEFAULT_PORTAL_SETTINGS: PortalSettingsConfig = {
  academyName: 'أكاديمية فصيح للخط العربي والنطق',
  academyTagline: 'منهجية تدريبية متدرجة تجمع بين أصالة الحرف العربي والتقويم التفاعلي الحديث',
  logoUrl: '',
  heroTitle: 'إتقان الحرف العربي نطقاً وخطاً بمنهجية أكاديمية متكاملة',
  heroSubtitle:
    'انضم إلى مساراتنا التدريبية التفاعلية التي تبدأ بمرحلة تمهيدية تعريفية لتقييم مستواك، ثم تنتقل بإشراف المعلم إلى المسار التدريبي المخصص لك.',
  heroMediaUrl: heroCalligraphyImg,
  announcementEnabled: true,
  announcementText:
    'التسجيل متاح الآن في المرحلة التمهيدية — سجّل بياناتك واحصل مباشرة على رقم دخولك وحسابك التجريبي',
  contactEmail: 'info@academy-example.org',
  contactPhone: '+966 50 000 0000',
  contactAddress: 'المقر التعليمي الرئيسي — التعلم الحضوري وعن بُعد',
  contactHours: 'السبت – الخميس · ٩:٠٠ صباحاً – ٦:٠٠ مساءً',
  telegramBotUsername: '',
  whatsappUrl: '',
  stage1DefaultProgramId: DEFAULT_PROGRAM_ID,
  stage1BannerTitle: 'أنت الآن في المرحلة التمهيدية (القسم الافتراضي)',
  stage1BannerBody:
    'تم تفعيل دخولك التجريبي بنجاح. يمكنك الآن استعراض الإرشادات التمهيدية وتجربة النماذج والأسئلة التدريبية المتاحة في هذا القسم لفهم آلية المنصة، ريثما يراجع المشرف بياناتك ويحوّل حسابك إلى مسارك التدريبي المعتمد.',
  adminNotificationEmail: '',
  notifyAdminTelegramOnRegister: true,
  notifyStudentTelegramOnTransfer: true,
  showStoreNavSlot: false,
  storeSlotTitle: 'المتجر',
  storeSlotNote:
    'هذه المساحة محجوزة ومهيّأة لربط متجر الأدوات والمستلزمات المتكامل في المرحلة القادمة دون التأثير على البوابة أو نظام التدريب.',
  sections: DEFAULT_PORTAL_SECTIONS,
};

export const DEFAULT_PORTAL_ITEMS: PortalContentItem[] = [
  {
    id: 'about_01',
    section: 'about',
    title: 'تعليم تدرّجي بإشراف مباشر',
    subtitle: 'من الأساسيات إلى الإتقان',
    description:
      'يبدأ كل متعلم بمرحلة تمهيدية واضحة يتعرف خلالها على آلية التمارين والنماذج، قبل أن يوجهه المعلم إلى المجموعة والبرنامج الأنسب لمستواه.',
    mediaUrl: aboutStudioImg,
    badgeText: '٠١ · المنهجية',
    metaPrimary: 'متابعة فردية',
    metaSecondary: 'جداول يومية مرنة',
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'about_02',
    section: 'about',
    title: 'ستة مسارات تطبيقية متكاملة',
    subtitle: 'نطق · إملاء · وصل · كتابة · تفاعل',
    description:
      'منظومة تدريبية موحدة تربط الاستماع والنطق والكتابة والسبورة التفاعلية وتقارير الأداء النهائية في سجل واحد لكل مشترك.',
    badgeText: '٠٢ · التطبيق',
    metaPrimary: 'تقييم مباشر',
    metaSecondary: 'تقارير PDF معتمدة',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'about_03',
    section: 'about',
    title: 'تواصل فوري عبر بوت تيليغرام',
    subtitle: 'تنبيهات وتصحيح مباشر',
    description:
      'بمجرد التسجيل وربط حسابك عبر الرابط المباشر، تصلك إشعارات الدروس وتنبيه الترقية للبرنامج الأساسي وتصحيحات المعلم أولاً بأول.',
    badgeText: '٠٣ · المتابعة',
    metaPrimary: 'إشعارات فورية',
    metaSecondary: 'ربط برقم المشترك',
    enabled: true,
    sortOrder: 3,
  },
  {
    id: 'prog_card_1',
    section: 'programs',
    title: 'المسار التمهيدي (القسم الافتراضي)',
    subtitle: 'المرحلة الأولى فور التسجيل',
    description:
      'يفتح لك فور إرسال استمارة التسجيل؛ يحتوي على إرشادات المنصة ونماذج تجريبية لفهم طريقة التمرين قبل التحويل إلى برنامجك الكامل.',
    badgeText: 'دخول فوري بعد التسجيل',
    metaPrimary: 'نماذج وإرشادات',
    metaSecondary: 'تأهيل مبدئي',
    linkLabel: 'سجّل وابدأ الآن',
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'prog_card_2',
    section: 'programs',
    title: 'برنامج المستوى المبتدئ',
    subtitle: 'المرحلة الثانية · بناء الأساس',
    description:
      'تمارين مركزة لتأسيس مخارج الحروف وتشكيل الكلمات الأساسية والكتابة الموجهة وفق جدول يومي منضبط.',
    badgeText: 'توجيه من الإدارة',
    metaPrimary: 'تأسيس شامل',
    metaSecondary: 'مجموعات يومية',
    linkLabel: 'قدّم طلب الالتحاق',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'prog_card_3',
    section: 'programs',
    title: 'برنامج المستوى المتقدم',
    subtitle: 'المرحلة الثانية · الإتقان والتكامل',
    description:
      'منهج مكثف للمتدربين المتقنين يشمل الجمل المركبة، التصحيح الصوتي والبصري الدقيق، وشهادة إتمام بنهاية البرنامج.',
    badgeText: 'توجيه من الإدارة',
    metaPrimary: 'مستوى متقدم',
    metaSecondary: 'شهادة وتقرير PDF',
    linkLabel: 'قدّم طلب الالتحاق',
    enabled: true,
    sortOrder: 3,
  },
  {
    id: 'gal_01',
    section: 'gallery',
    title: 'مخطوطات وتطبيقات الخط الكلاسيكي',
    subtitle: 'نماذج تدريبية وخطوط عربية أصيلة',
    description: 'لقطات من بيئة التدريب والنماذج اليدوية المعتمدة في مسارات الأكاديمية.',
    mediaUrl: galleryArtworkImg,
    badgeText: 'لوحات ونماذج',
    metaPrimary: 'معرض الأكاديمية',
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'gal_02',
    section: 'gallery',
    title: 'أدوات الخطاط وورشة العمل',
    subtitle: 'أقلام القصب والحبر والورق المصقول',
    description: 'تهيئة الطالب لاختيار الأدوات المناسبة وضبط الجلسة والزاوية الصحيحة للكتابة.',
    mediaUrl: heroCalligraphyImg,
    badgeText: 'أدوات وورش',
    metaPrimary: 'تطبيق عملي',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'gal_03',
    section: 'gallery',
    title: 'قاعات الدرس والتوجيه المباشر',
    subtitle: 'بيئة تعليمية هادئة ومهيأة',
    description: 'الجمع بين الدراسة الحضورية المنضبطة والمتابعة الرقمية المستمرة.',
    mediaUrl: aboutStudioImg,
    badgeText: 'البيئة التعليمية',
    metaPrimary: 'إشراف أكاديمي',
    enabled: true,
    sortOrder: 3,
  },
];

export const DEFAULT_REGISTRATION_QUESTIONS: RegistrationQuestion[] = [
  {
    id: 'q_full_name',
    label: 'الاسم الكامل للطالب / المشترك',
    labelEn: 'Full Name',
    labelTh: 'ชื่อ-นามสกุล',
    type: 'text',
    required: true,
    placeholder: 'اكتب اسمك الثلاثي أو الكامل كما سيظهر في الشهادة',
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'q_phone',
    label: 'رقم الجوال / الواتساب',
    labelEn: 'Phone / WhatsApp Number',
    labelTh: 'เบอร์โทรศัพท์ / WhatsApp',
    type: 'phone',
    required: true,
    placeholder: '+966 50 000 0000',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'q_email',
    label: 'البريد الإلكتروني',
    labelEn: 'Email Address',
    labelTh: 'อีเมล',
    type: 'email',
    required: false,
    placeholder: 'name@example.com',
    enabled: true,
    sortOrder: 3,
  },
  {
    id: 'q_telegram',
    label: 'معرف تيليغرام (@username) — إن وُجد',
    labelEn: 'Telegram Username (optional)',
    labelTh: 'ชื่อผู้ใช้ Telegram (ถ้ามี)',
    type: 'text',
    required: false,
    placeholder: '@username',
    enabled: true,
    sortOrder: 4,
  },
  {
    id: 'q_level_goal',
    label: 'المستوى الحالي والهدف من الالتحاق',
    labelEn: 'Current Level & Learning Goal',
    labelTh: 'ระดับปัจจุบันและเป้าหมายการเรียน',
    type: 'select',
    required: true,
    options: ['مبتدئ من الصفر', 'لدي إلمام متوسط وأرغب بالتطوير', 'مستوى متقدم للإتقان والضبط'],
    enabled: true,
    sortOrder: 5,
  },
  {
    id: 'q_sample_file',
    label: 'إرفاق نموذج خط أو صورة تعريفية (اختياري — يُرفع إلى Google Drive)',
    labelEn: 'Upload Writing Sample / Photo (Optional)',
    labelTh: 'อัปโหลดตัวอย่างลายมือ / รูปภาพ (ไม่บังคับ)',
    type: 'file',
    required: false,
    enabled: true,
    sortOrder: 6,
  },
];

export function normalizePortalPublicData(raw?: Partial<PortalPublicData> | null): PortalPublicData {
  const s = (raw?.settings || {}) as Partial<PortalSettingsConfig>;
  const existingSections = Array.isArray(s.sections) ? s.sections : [];
  const sectionMap = new Map<string, PortalSectionConfig>();
  DEFAULT_PORTAL_SECTIONS.forEach((defSec) => {
    const match = existingSections.find((x) => x.key === defSec.key);
    sectionMap.set(defSec.key, match ? { ...defSec, ...match } : { ...defSec });
  });
  const mergedSections = Array.from(sectionMap.values()).sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );

  const settings: PortalSettingsConfig = {
    ...DEFAULT_PORTAL_SETTINGS,
    ...s,
    heroMediaUrl: s.heroMediaUrl !== undefined ? s.heroMediaUrl : DEFAULT_PORTAL_SETTINGS.heroMediaUrl,
    sections: mergedSections,
  };

  const rawItems = Array.isArray(raw?.items) ? raw.items : DEFAULT_PORTAL_ITEMS;
  const items: PortalContentItem[] = rawItems.map((it, idx) => ({
    id: String(it.id || `pitem_${idx + 1}`),
    section: it.section || 'about',
    title: String(it.title || '').trim(),
    subtitle: it.subtitle ? String(it.subtitle).trim() : undefined,
    description: String(it.description || '').trim(),
    mediaUrl: it.mediaUrl ? String(it.mediaUrl).trim() : undefined,
    linkUrl: it.linkUrl ? String(it.linkUrl).trim() : undefined,
    linkLabel: it.linkLabel ? String(it.linkLabel).trim() : undefined,
    badgeText: it.badgeText ? String(it.badgeText).trim() : undefined,
    metaPrimary: it.metaPrimary ? String(it.metaPrimary).trim() : undefined,
    metaSecondary: it.metaSecondary ? String(it.metaSecondary).trim() : undefined,
    enabled: it.enabled !== false,
    sortOrder: Number(it.sortOrder) || idx + 1,
  }));
  items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return { settings, items };
}

export function normalizeRegistrationQuestions(
  raw?: RegistrationQuestion[] | null
): RegistrationQuestion[] {
  const src = Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_REGISTRATION_QUESTIONS;
  return src
    .map((q, idx) => ({
      id: String(q.id || `q_${idx + 1}`),
      label: String(q.label || '').trim(),
      labelEn: q.labelEn ? String(q.labelEn).trim() : undefined,
      labelTh: q.labelTh ? String(q.labelTh).trim() : undefined,
      type: q.type || 'text',
      required: Boolean(q.required),
      options: Array.isArray(q.options) ? q.options.filter(Boolean) : undefined,
      placeholder: q.placeholder ? String(q.placeholder).trim() : undefined,
      guideUrl: q.guideUrl ? String(q.guideUrl).trim() : undefined,
      enabled: q.enabled !== false,
      sortOrder: Number(q.sortOrder) || idx + 1,
    }))
    .filter((q) => Boolean(q.label))
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function getLocalPortalData(): PortalPublicData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PORTAL_DATA);
    if (raw) {
      return normalizePortalPublicData(JSON.parse(raw));
    }
  } catch {}
  return normalizePortalPublicData(null);
}

export function saveLocalPortalData(data: PortalPublicData): void {
  try {
    localStorage.setItem(STORAGE_KEY_PORTAL_DATA, JSON.stringify(normalizePortalPublicData(data)));
  } catch {}
}

export function getLocalRegistrationQuestions(): RegistrationQuestion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REG_QUESTIONS);
    if (raw) {
      return normalizeRegistrationQuestions(JSON.parse(raw));
    }
  } catch {}
  return normalizeRegistrationQuestions(null);
}

export function saveLocalRegistrationQuestions(questions: RegistrationQuestion[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_REG_QUESTIONS,
      JSON.stringify(normalizeRegistrationQuestions(questions))
    );
  } catch {}
}

export function getLocalRegistrationSubmissions(): RegistrationSubmissionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REG_SUBMISSIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalRegistrationSubmissions(list: RegistrationSubmissionRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_REG_SUBMISSIONS, JSON.stringify(list));
  } catch {}
}

export function getSavedPortalBotUsername(): string {
  try {
    return (localStorage.getItem(STORAGE_KEY_PORTAL_BOT_USER) || '').replace(/^@/, '').trim();
  } catch {
    return '';
  }
}

export function savePortalBotUsername(username: string): void {
  try {
    const clean = (username || '').replace(/^@/, '').trim();
    if (clean) localStorage.setItem(STORAGE_KEY_PORTAL_BOT_USER, clean);
  } catch {}
}

export function buildTelegramBotStartLink(botUsername?: string, studentId?: string): string {
  const cleanUser = (botUsername || '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();
  if (!cleanUser) return '';
  const cleanId = normalizeDigits(studentId || '');
  return cleanId ? `https://t.me/${cleanUser}?start=${encodeURIComponent(cleanId)}` : `https://t.me/${cleanUser}`;
}

export async function fetchPortalDataFromSheets(webhookUrl: string): Promise<{
  success: boolean;
  data: PortalPublicData;
  botUsername?: string;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, { action: 'get_portal_data' });
      if (res.success && res.data?.portalHandled) {
        const rawBot = String(res.data.botUsername || '').replace(/^@/, '').trim();
        if (rawBot) savePortalBotUsername(rawBot);
        if (res.data.portalData && (res.data.portalData.settings || (res.data.portalData.items || []).length > 0)) {
          const normalized = normalizePortalPublicData(res.data.portalData);
          if (rawBot && !normalized.settings.telegramBotUsername) {
            normalized.settings.telegramBotUsername = rawBot;
          }
          saveLocalPortalData(normalized);
          return { success: true, data: normalized, botUsername: rawBot };
        }
      }
    } catch (e) {
      console.warn('Error fetching portal data from Sheets:', e);
    }
  }
  const local = getLocalPortalData();
  const cachedBot = getSavedPortalBotUsername();
  if (cachedBot && !local.settings.telegramBotUsername) {
    local.settings.telegramBotUsername = cachedBot;
  }
  return { success: false, data: local, botUsername: local.settings.telegramBotUsername || cachedBot };
}

export async function savePortalDataToSheets(
  webhookUrl: string,
  portalData: PortalPublicData
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  const clean = normalizePortalPublicData(portalData);
  saveLocalPortalData(clean);
  if (clean.settings.telegramBotUsername) {
    savePortalBotUsername(clean.settings.telegramBotUsername);
  }
  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم الحفظ محلياً (أضف رابط Google Sheets لمزامنة السحابة).' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'save_portal_data',
    portalData: clean,
  });
  if (!res.success) {
    return {
      success: false,
      message: res.error || 'تعذر حفظ محتوى البوابة في Google Sheets.',
    };
  }
  if (res.data?.portalHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'تم الحفظ محلياً، لكن كود Google Apps Script المنشور قديم. انسخ الكود المحدث وانشر إصداراً جديداً (New Version).',
    };
  }
  return {
    success: true,
    message: res.message || 'تم حفظ ومزامنة محتوى البوابة العامة في Google Sheets بنجاح!',
  };
}

export async function fetchRegistrationQuestionsFromSheets(webhookUrl: string): Promise<{
  success: boolean;
  questions: RegistrationQuestion[];
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, { action: 'get_registration_questions' });
      if (res.success && res.data?.portalHandled && Array.isArray(res.data.questions) && res.data.questions.length > 0) {
        const normalized = normalizeRegistrationQuestions(res.data.questions);
        saveLocalRegistrationQuestions(normalized);
        return { success: true, questions: normalized };
      }
    } catch (e) {
      console.warn('Error fetching registration questions:', e);
    }
  }
  return { success: false, questions: getLocalRegistrationQuestions() };
}

export async function saveRegistrationQuestionsToSheets(
  webhookUrl: string,
  questions: RegistrationQuestion[]
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  const clean = normalizeRegistrationQuestions(questions);
  saveLocalRegistrationQuestions(clean);
  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم حفظ أسئلة التسجيل محلياً.' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'save_registration_questions',
    questions: clean,
  });
  if (!res.success) {
    return { success: false, message: res.error || 'تعذر حفظ أسئلة التسجيل في الشيت.' };
  }
  if (res.data?.portalHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'تم الحفظ محلياً، لكن يرجى تحديث Google Apps Script لمزامنة ورقة أسئلة_التسجيل.',
    };
  }
  return {
    success: true,
    message: res.message || 'تم حفظ ومزامنة أسئلة استمارة التسجيل بنجاح!',
  };
}

export async function uploadPortalFileToDrive(
  webhookUrl: string,
  base64Data: string,
  fileName: string,
  mimeType: string,
  folderId?: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (!url.startsWith('http')) {
    return { success: false, error: 'رابط Google Sheets غير مضبوط لرفع الملف إلى Drive.' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'upload_portal_file',
    base64Data,
    fileName,
    mimeType,
    folderId: folderId || STUDENT_AUDIO_DRIVE_FOLDER_ID,
  });
  if (res.success && res.data?.url) {
    return { success: true, url: String(res.data.url) };
  }
  return { success: false, error: res.error || 'تعذر رفع الملف إلى Google Drive.' };
}

export async function submitPortalRegistrationToSheets(
  webhookUrl: string,
  payload: {
    studentName: string;
    email?: string;
    phone?: string;
    telegramUsername?: string;
    answers: Record<string, string>;
    attachments: RegistrationAttachment[];
    settings: PortalSettingsConfig;
    stage1ProgramName?: string;
  }
): Promise<{
  success: boolean;
  registrationId?: string;
  student?: StudentRegistrant;
  telegramDeepLink?: string;
  botUsername?: string;
  message?: string;
  offlineFallback?: boolean;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const stage1ProgId = payload.settings.stage1DefaultProgramId || DEFAULT_PROGRAM_ID;
  const stage1ProgName = payload.stage1ProgramName || 'القسم الافتراضي (المرحلة التمهيدية)';
  const originBase =
    typeof window !== 'undefined' && !window.location.origin.includes('localhost')
      ? window.location.origin + window.location.pathname
      : '';

  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, {
        action: 'submit_portal_registration',
        studentName: payload.studentName.trim(),
        email: payload.email || '',
        phone: payload.phone || '',
        telegramUsername: payload.telegramUsername || '',
        answers: payload.answers,
        attachments: payload.attachments,
        stage1DefaultProgramId: stage1ProgId,
        stage1ProgramName: stage1ProgName,
        botUsername: payload.settings.telegramBotUsername || getSavedPortalBotUsername(),
        notifyAdminTelegram: payload.settings.notifyAdminTelegramOnRegister !== false,
        adminNotificationEmail: payload.settings.adminNotificationEmail || '',
        appBaseUrl: originBase,
      });

      if (res.success && res.data?.portalHandled && res.data?.registrationId) {
        const regId = String(res.data.registrationId);
        const student: StudentRegistrant = res.data.student || {
          id: regId,
          name: payload.studentName.trim(),
          status: 'مفعّل',
          maxDevices: 1,
          devices: [],
          requireLocation: false,
          programId: stage1ProgId,
        };
        const resolvedBot = String(
          res.data.botUsername || payload.settings.telegramBotUsername || getSavedPortalBotUsername()
        )
          .replace(/^@/, '')
          .trim();
        if (resolvedBot) savePortalBotUsername(resolvedBot);
        const deepLink =
          String(res.data.telegramDeepLink || '').trim() ||
          buildTelegramBotStartLink(resolvedBot, regId);

        const localSubs = getLocalRegistrationSubmissions();
        saveLocalRegistrationSubmissions([
          {
            submittedAt: new Date().toLocaleString('en-GB'),
            registrationId: regId,
            studentName: payload.studentName.trim(),
            programId: stage1ProgId,
            programName: stage1ProgName,
            stage: 'stage1_default',
            status: `المرحلة 1 - في القسم الافتراضي (${stage1ProgName})`,
            telegramUsername: payload.telegramUsername,
            email: payload.email,
            phone: payload.phone,
            answers: payload.answers,
            attachments: payload.attachments,
          },
          ...localSubs,
        ]);

        return {
          success: true,
          registrationId: regId,
          student,
          telegramDeepLink: deepLink,
          botUsername: resolvedBot,
        };
      }

      // If Apps Script is older and didn't handle submit_portal_registration yet, fall back to add_registrant
      if (res.success && res.data?.portalHandled !== true) {
        const fallbackId = String(Math.floor(1000 + (Date.now() % 8900)));
        await addIDRegistrantToSheet(url, {
          id: fallbackId,
          name: payload.studentName.trim(),
          status: 'مفعّل',
          maxDevices: 1,
          programId: stage1ProgId,
        }).catch(() => {});
        const resolvedBot = String(
          payload.settings.telegramBotUsername || getSavedPortalBotUsername()
        )
          .replace(/^@/, '')
          .trim();
        const student: StudentRegistrant = {
          id: fallbackId,
          name: payload.studentName.trim(),
          status: 'مفعّل',
          maxDevices: 1,
          devices: [],
          programId: stage1ProgId,
        };
        const localSubs = getLocalRegistrationSubmissions();
        saveLocalRegistrationSubmissions([
          {
            submittedAt: new Date().toLocaleString('en-GB'),
            registrationId: fallbackId,
            studentName: payload.studentName.trim(),
            programId: stage1ProgId,
            programName: stage1ProgName,
            stage: 'stage1_default',
            status: `المرحلة 1 - في القسم الافتراضي (${stage1ProgName})`,
            telegramUsername: payload.telegramUsername,
            email: payload.email,
            phone: payload.phone,
            answers: payload.answers,
            attachments: payload.attachments,
          },
          ...localSubs,
        ]);
        return {
          success: true,
          registrationId: fallbackId,
          student,
          botUsername: resolvedBot,
          telegramDeepLink: buildTelegramBotStartLink(resolvedBot, fallbackId),
          offlineFallback: true,
        };
      }

      if (!res.success) {
        return { success: false, message: res.error || 'تعذر إرسال طلب التسجيل.' };
      }
    } catch (err: any) {
      console.warn('Submit registration fallback:', err);
    }
  }

  // Offline local fallback
  const localId = String(Math.floor(1000 + (Date.now() % 8900)));
  const resolvedBot = (payload.settings.telegramBotUsername || getSavedPortalBotUsername()).trim();
  const student: StudentRegistrant = {
    id: localId,
    name: payload.studentName.trim(),
    status: 'مفعّل',
    maxDevices: 1,
    devices: [],
    programId: stage1ProgId,
  };
  const localSubs = getLocalRegistrationSubmissions();
  saveLocalRegistrationSubmissions([
    {
      submittedAt: new Date().toLocaleString('en-GB'),
      registrationId: localId,
      studentName: payload.studentName.trim(),
      programId: stage1ProgId,
      programName: stage1ProgName,
      stage: 'stage1_default',
      status: `المرحلة 1 - في القسم الافتراضي (${stage1ProgName})`,
      telegramUsername: payload.telegramUsername,
      email: payload.email,
      phone: payload.phone,
      answers: payload.answers,
      attachments: payload.attachments,
    },
    ...localSubs,
  ]);
  return {
    success: true,
    registrationId: localId,
    student,
    botUsername: resolvedBot,
    telegramDeepLink: buildTelegramBotStartLink(resolvedBot, localId),
    offlineFallback: true,
  };
}

export async function fetchRegistrationSubmissionsFromSheets(webhookUrl: string): Promise<{
  success: boolean;
  submissions: RegistrationSubmissionRecord[];
  needsScriptUpdate?: boolean;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, { action: 'get_registration_submissions' });
      if (res.success && res.data?.portalHandled && Array.isArray(res.data.submissions)) {
        const list: RegistrationSubmissionRecord[] = res.data.submissions;
        saveLocalRegistrationSubmissions(list);
        return { success: true, submissions: list };
      }
      if (res.success && res.data?.portalHandled !== true) {
        return {
          success: false,
          submissions: getLocalRegistrationSubmissions(),
          needsScriptUpdate: true,
        };
      }
    } catch (e) {
      console.warn('Error fetching registration submissions:', e);
    }
  }
  return { success: false, submissions: getLocalRegistrationSubmissions() };
}

export async function transferRegistrationStageInSheets(
  webhookUrl: string,
  payload: {
    registrationId: string;
    studentName: string;
    targetProgramId: string;
    targetProgramName: string;
    stage: RegistrationStage;
    accountStatus?: string;
    adminNotes?: string;
    notifyStudentTelegram?: boolean;
  }
): Promise<{ success: boolean; message: string; tgNotifiedStudent?: boolean; needsScriptUpdate?: boolean }> {
  const local = getLocalRegistrationSubmissions().map((rec) =>
    normalizeDigits(rec.registrationId) === normalizeDigits(payload.registrationId)
      ? {
          ...rec,
          programId: payload.targetProgramId,
          programName: payload.targetProgramName,
          stage: payload.stage,
          status:
            payload.stage === 'stage2_assigned'
              ? `تم التحويل إلى: ${payload.targetProgramName}`
              : payload.stage === 'paused'
              ? 'معلّق / موقوف'
              : `المرحلة 1 - في القسم الافتراضي (${payload.targetProgramName})`,
          adminNotes: payload.adminNotes !== undefined ? payload.adminNotes : rec.adminNotes,
        }
      : rec
  );
  saveLocalRegistrationSubmissions(local);

  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم تحديث مرحلة المشترك محلياً.' };
  }

  const statusLabel =
    payload.stage === 'stage2_assigned'
      ? `تم التحويل إلى: ${payload.targetProgramName}`
      : payload.stage === 'paused'
      ? 'معلّق / موقوف'
      : `المرحلة 1 - في القسم الافتراضي (${payload.targetProgramName})`;

  const res = await callGoogleSheetsPost(url, {
    action: 'transfer_registration_stage',
    registrationId: payload.registrationId,
    studentName: payload.studentName,
    targetProgramId: payload.targetProgramId,
    targetProgramName: payload.targetProgramName,
    stage: payload.stage,
    statusLabel,
    accountStatus: payload.accountStatus || (payload.stage === 'paused' ? 'معطّل' : 'مفعّل'),
    adminNotes: payload.adminNotes,
    notifyStudentTelegram: payload.notifyStudentTelegram !== false,
  });

  if (!res.success) {
    return { success: false, message: res.error || 'تعذر تحويل المشترك في Google Sheets.' };
  }
  if (res.data?.portalHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'تم التحديث محلياً، لكن يرجى تحديث نشر Google Apps Script لتفعيل التحويل في الشيت وإشعار تيليغرام.',
    };
  }
  return {
    success: true,
    tgNotifiedStudent: Boolean(res.data?.tgNotifiedStudent),
    message:
      res.message ||
      `تم تحويل المشترك (${payload.studentName}) إلى برنامج (${payload.targetProgramName}) بنجاح!`,
  };
}

export async function deleteRegistrationSubmissionInSheets(
  webhookUrl: string,
  registrationId: string,
  rowIndex?: number
): Promise<{ success: boolean; message: string }> {
  const local = getLocalRegistrationSubmissions().filter(
    (rec) => normalizeDigits(rec.registrationId) !== normalizeDigits(registrationId)
  );
  saveLocalRegistrationSubmissions(local);

  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم الحذف محلياً.' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'delete_registration_submission',
    registrationId,
    rowIndex,
  });
  return {
    success: res.success,
    message: res.message || (res.success ? 'تم حذف سجل الطلب بنجاح.' : res.error || 'تعذر الحذف.'),
  };
}
