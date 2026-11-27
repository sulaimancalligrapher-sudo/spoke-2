import { callGoogleSheetsPost } from '../utils/googleSheets';
import { extractDriveFileId, getAlternativeAudioUrls, getDirectImageUrl } from '../utils/mediaUrl';
import { DEFAULT_TRANSLATIONS, TranslationItem } from '../utils/translations';
import { evaluateArabicLocal, removeTashkeel } from '../utils/arabicMatcher';
import { StudentRegistrant } from '../types';

export interface VideoTimestampQuestion {
  id: string;
  slotIndex: number;
  time: number; // Seconds from start of video or audio
  question: string;
  image?: string;
  audio?: string;
  options: string[];
  correctAnswer: string;
}

export interface VideoLesson {
  id: string;
  rowIndex?: number;
  topic: string; // موضوع الدرس
  title: string; // عنوان الدرس
  instruction?: string;
  videoUrl: string; // YouTube or Google Drive or direct MP4 URL
  explainSound?: string; // Optional explanation audio link
  image?: string; // Optional lesson helper image
  showResult: 'نعم' | 'لا';
  allowRecording: 'نعم' | 'لا';
  maxRecordingTime: number; // Seconds (0 = unlimited / default 60s)
  audioHomeworkMode?: 'free' | 'verify';
  audioHomeworkPrompt?: string;
  audioHomeworkTarget?: string;
  allowUpload: 'نعم' | 'لا';
  uploadTitle?: string;
  retryCount: number; // Allowed retries (0 = locked after completion)
  startDate?: string;
  endDate?: string;
  expireAfterDays?: number | string;
  questions: VideoTimestampQuestion[];
  audioQuestions: VideoTimestampQuestion[];
}

export interface VideoAnsweredQuestionEntry {
  questionKey: string;
  question: string;
  selectedAnswer: string;
  isCorrect: boolean | null;
  type: 'video' | 'audio';
  answeredAt: string;
}

export interface VideoStudentProgress {
  lessonId: string;
  topic: string;
  title: string;
  completed: 'تم' | 'فيديو_تم' | 'إعادة' | '';
  videoCompleted?: boolean;
  videoScore: number;
  explainAudioScore: number;
  answeredQuestions: Record<string, VideoAnsweredQuestionEntry>;
  retryResetCount?: number; // Remaining retries (undefined when unset -> falls back to lesson.retryCount)
  imageLink?: string;
  recordingLink?: string;
  updatedAt?: string;
}

export interface VideoCorrectionEntry {
  lessonTitle: string;
  studentName: string;
  studentId: string;
  imageStatus: string;
  imageScore: string;
  correctedImage: string;
  additionalImages: string[];
  imageLinks?: string[];
  imageDate?: string;
  imageNotes?: string;
  audioStatus: string;
  audioScore: string;
  teacherAudios: string[];
  teacherVideos: string[];
  audioLinks?: string[];
  audioDate?: string;
  audioNotes?: string;
}

export interface VideoStudentSubmissionRow {
  rowIndex?: number;
  studentId: string;
  studentName: string;
  lessonId: string;
  topic: string;
  title: string;
  completed: 'تم' | 'فيديو_تم' | 'إعادة' | '';
  videoScore: number;
  explainAudioScore: number;
  answeredQuestions: Record<string, VideoAnsweredQuestionEntry>;
  retryResetCount?: number;
  imageLink?: string;
  recordingLink?: string;
  updatedAt?: string;
  correction?: VideoCorrectionEntry;
}

export type TelegramTemplateKey =
  | 'student_welcome'
  | 'student_id_not_found'
  | 'student_disabled'
  | 'student_stage_transfer'
  | 'student_program_approved'
  | 'student_video_correction'
  | 'student_class_reminder'
  | 'student_attendance_early'
  | 'student_attendance_ontime'
  | 'student_attendance_late'
  | 'student_attendance_absent'
  | 'admin_new_registration'
  | 'admin_program_request'
  | 'admin_store_order'
  | 'admin_store_program_enroll'
  | 'admin_homework_submitted'
  | 'admin_attendance_checkin'
  | 'admin_daily_absence_summary';

export interface TelegramTemplateConfig {
  enabled: boolean;
  text: string;
}

export type TelegramTemplatesMap = Partial<Record<TelegramTemplateKey, TelegramTemplateConfig>>;

export interface TelegramTemplateMeta {
  key: TelegramTemplateKey;
  audience: 'student' | 'admin';
  labelAr: string;
  descriptionAr: string;
  defaultEnabled: boolean;
  variables: { token: string; label: string }[];
  defaultText: string;
}

export const TELEGRAM_TEMPLATE_META: TelegramTemplateMeta[] = [
  // ======================== رسائل الطلاب ========================
  {
    key: 'student_welcome',
    audience: 'student',
    labelAr: 'ترحيب ربط البوت بالطالب',
    descriptionAr: 'تُرسل للطالب فور إرسال رقم المشترك (ID) أو الضغط على رابط الربط في البوت.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{studentId}', label: 'رقم المشترك' },
    ],
    defaultText:
      'مرحباً بك يا {studentName}! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم.\nرقم المشترك: <code>{studentId}</code>',
  },
  {
    key: 'student_id_not_found',
    audience: 'student',
    labelAr: 'رقم المشترك غير موجود',
    descriptionAr: 'تُرسل إذا أرسل المستخدم رقماً غير مسجل في ورقة ID registrants.',
    defaultEnabled: true,
    variables: [{ token: '{studentId}', label: 'الرقم المُرسل' }],
    defaultText: 'لم يتم العثور على رقم المشترك ({studentId}). أرسل رقم الـ ID الصحيح للربط.',
  },
  {
    key: 'student_disabled',
    audience: 'student',
    labelAr: 'تنبيه الحساب المعطّل',
    descriptionAr: 'تُرسل إذا حاول طالب موقوف حسابه ربط البوت.',
    defaultEnabled: true,
    variables: [{ token: '{studentName}', label: 'اسم الطالب' }],
    defaultText: 'عذراً {studentName}، هذا الحساب معطّل حالياً. يرجى التواصل مع الإدارة.',
  },
  {
    key: 'student_stage_transfer',
    audience: 'student',
    labelAr: 'ترقية ونقل الطالب إلى برنامج',
    descriptionAr: 'تُرسل للطالب عند تحويله من المرحلة التمهيدية إلى برنامجه الأساسي.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{studentId}', label: 'رقم المشترك' },
      { token: '{programName}', label: 'اسم البرنامج' },
    ],
    defaultText:
      '<b>تهانينا يا {studentName}!</b>\nتم قبولك وتحويل حسابك إلى: <b>{programName}</b>.\nيمكنك الآن الدخول إلى صفحتك الخاصة لبدء التدريب.',
  },
  {
    key: 'student_program_approved',
    audience: 'student',
    labelAr: 'قبول طلب الالتحاق ببرنامج',
    descriptionAr: 'تُرسل للطالب عند موافقة الإدارة على طلبه في صفحة طلبات البرامج.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{studentId}', label: 'رقم المشترك' },
      { token: '{programName}', label: 'اسم البرنامج' },
    ],
    defaultText:
      '<b>تهانينا يا {studentName}!</b>\nتمت الموافقة على طلبك ونقلك إلى برنامج: <b>{programName}</b> (ID: <code>{studentId}</code>).\nيمكنك الدخول الآن إلى صفحتك الخاصة لبدء البرنامج.',
  },
  {
    key: 'student_video_correction',
    audience: 'student',
    labelAr: 'تصحيح واجب الفيديو',
    descriptionAr: 'تُرسل للطالب عند حفظ تصحيح المعلم ودرجته على واجب الفيديو.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{lessonTitle}', label: 'عنوان الدرس' },
      { token: '{imageScore}', label: 'درجة الصورة' },
      { token: '{imageNotes}', label: 'ملاحظة الصورة' },
      { token: '{audioScore}', label: 'درجة الصوت' },
      { token: '{audioNotes}', label: 'ملاحظة الصوت' },
    ],
    defaultText:
      '<b>تم تصحيح واجبك في درس: {lessonTitle}</b>\nدرجة الصورة: {imageScore}\nملاحظة المعلم: {imageNotes}\nدرجة الصوت: {audioScore}\nالتوجيه الصوتي: {audioNotes}',
  },
  {
    key: 'student_class_reminder',
    audience: 'student',
    labelAr: 'تذكير الطالب بموعد الحصة',
    descriptionAr: 'تُرسل تلقائياً قبل بدء الحصة (أو عند بدايتها) وفق جدول كل برنامج ووقته.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{programName}', label: 'اسم البرنامج' },
      { token: '{sessionTitle}', label: 'عنوان الحصة' },
      { token: '{scheduledTime}', label: 'موعد الحصة' },
      { token: '{date}', label: 'التاريخ' },
    ],
    defaultText:
      '⏰ <b>تذكير بموعد الحصة</b>\nمرحباً يا {studentName}، حصة <b>{sessionTitle}</b> ({programName}) تبدأ الساعة <b>{scheduledTime}</b> بتاريخ {date}.\nنرجو الدخول وتأكيد الحضور عبر صفحتك الخاصة.',
  },
  {
    key: 'student_attendance_early',
    audience: 'student',
    labelAr: 'تأكيد حضور مبكر للطالب',
    descriptionAr: 'تُرسل للطالب إذا سجّل حضوره قبل وقت بداية الحصة المحدد.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{sessionTitle}', label: 'الحصة' },
      { token: '{time}', label: 'وقت الدخول' },
      { token: '{scheduledTime}', label: 'وقت الحصة' },
      { token: '{minutesDelta}', label: 'الدقائق المبكرة' },
    ],
    defaultText:
      '🌟 <b>أحسنت يا {studentName}! حضور مبكر</b>\nتم تسجيل حضورك في <b>{sessionTitle}</b> الساعة <code>{time}</code> (قبل الموعد بـ {minutesDelta} دقيقة).',
  },
  {
    key: 'student_attendance_ontime',
    audience: 'student',
    labelAr: 'تأكيد حضور بالموعد للطالب',
    descriptionAr: 'تُرسل للطالب إذا سجّل حضوره خلال فترة السماح المحددة لبداية الحصة.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{sessionTitle}', label: 'الحصة' },
      { token: '{time}', label: 'وقت الدخول' },
      { token: '{scheduledTime}', label: 'وقت الحصة' },
    ],
    defaultText:
      '✅ <b>تم تسجيل حضورك في الموعد</b>\nالطالب: {studentName}\nالحصة: <b>{sessionTitle}</b>\nوقت التسجيل: <code>{time}</code>',
  },
  {
    key: 'student_attendance_late',
    audience: 'student',
    labelAr: 'تنبيه تأخر حضور الطالب',
    descriptionAr: 'تُرسل للطالب إذا سجّل حضوره بعد انتهاء فترة السماح المحددة.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{sessionTitle}', label: 'الحصة' },
      { token: '{time}', label: 'وقت الدخول' },
      { token: '{scheduledTime}', label: 'وقت الحصة' },
      { token: '{minutesDelta}', label: 'دقائق التأخير' },
    ],
    defaultText:
      '⚠️ <b>تنبيه: تم تسجيل حضورك متأخراً</b>\nالطالب: {studentName}\nالحصة: <b>{sessionTitle}</b> (موعدها {scheduledTime})\nوقت دخولك: <code>{time}</code> (تأخير {minutesDelta} دقيقة).',
  },
  {
    key: 'student_attendance_absent',
    audience: 'student',
    labelAr: 'إشعار تسجيل غياب الطالب',
    descriptionAr: 'تُرسل تلقائياً للطالب إذا انتهت الحصة دون تسجيل حضوره.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{programName}', label: 'اسم البرنامج' },
      { token: '{sessionTitle}', label: 'الحصة' },
      { token: '{scheduledTime}', label: 'وقت الحصة' },
      { token: '{date}', label: 'التاريخ' },
    ],
    defaultText:
      '❌ <b>إشعار غياب عن حصة اليوم</b>\nمرحباً يا {studentName}، لم يُسجَّل حضورك في حصة <b>{sessionTitle}</b> ({programName}) بتاريخ {date} الساعة {scheduledTime}.\nيمكنك الدخول للمنصة لتأكيد حضورك أو مراجعة الدرس.',
  },

  // ======================== رسائل الإدارة ========================
  {
    key: 'admin_new_registration',
    audience: 'admin',
    labelAr: 'تنبيه تسجيل مشترك جديد',
    descriptionAr: 'يُرسل للإدارة عند تقديم استمارة تسجيل مشترك جديد من البوابة العامة.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'الاسم' },
      { token: '{studentId}', label: 'رقم التسجيل' },
      { token: '{programName}', label: 'القسم المبدئي' },
      { token: '{phone}', label: 'الهاتف' },
      { token: '{email}', label: 'البريد' },
      { token: '{telegramUsername}', label: 'تيليغرام' },
      { token: '{answersSummary}', label: 'ملخص الإجابات' },
    ],
    defaultText:
      '<b>طلب تسجيل طالب جديد (المرحلة 1)</b>\nالاسم: <b>{studentName}</b>\nرقم التسجيل (ID): <code>{studentId}</code>\nالقسم المبدئي: {programName}\nالهاتف: {phone}\nالبريد: {email}\nتيليغرام: {telegramUsername}\n{answersSummary}',
  },
  {
    key: 'admin_program_request',
    audience: 'admin',
    labelAr: 'تنبيه طلب الالتحاق ببرنامج',
    descriptionAr: 'يُرسل للإدارة عندما يطلب مشترك حالي الانتقال إلى برنامج جديد.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم المشترك' },
      { token: '{studentId}', label: 'رقم المشترك' },
      { token: '{programName}', label: 'البرنامج المطلوب' },
      { token: '{notes}', label: 'ملاحظة المشترك' },
    ],
    defaultText:
      '<b>طلب التحاق ببرنامج تدريبي</b>\nالمشترك: <b>{studentName}</b>\nرقم المشترك (ID): <code>{studentId}</code>\nالبرنامج المطلوب: <b>{programName}</b>\nملاحظة: {notes}',
  },
  {
    key: 'admin_store_order',
    audience: 'admin',
    labelAr: 'تنبيه طلب جديد من المتجر',
    descriptionAr: 'يُرسل للإدارة عند إتمام عميل لطلب منتجات في المتجر.',
    defaultEnabled: true,
    variables: [
      { token: '{orderId}', label: 'رقم الطلب' },
      { token: '{customerName}', label: 'اسم العميل' },
      { token: '{phone}', label: 'الجوال' },
      { token: '{city}', label: 'المدينة' },
      { token: '{paymentMethod}', label: 'طريقة الدفع' },
      { token: '{itemsSummary}', label: 'قائمة المنتجات' },
      { token: '{total}', label: 'الإجمالي' },
      { token: '{currency}', label: 'العملة' },
    ],
    defaultText:
      '<b>طلب جديد في المتجر ({orderId})</b>\nالعميل: <b>{customerName}</b>\nالجوال: <code>{phone}</code>\nالمدينة: {city}\nالدفع: {paymentMethod}\n<b>المنتجات:</b>\n{itemsSummary}\nالإجمالي النهائي: <b>{total} {currency}</b>',
  },
  {
    key: 'admin_store_program_enroll',
    audience: 'admin',
    labelAr: 'تنبيه تسجيل برنامج عبر المتجر',
    descriptionAr: 'يُرسل للإدارة عند طلب الالتحاق ببرنامج مدفوع أو مجاني من واجهة المتجر.',
    defaultEnabled: true,
    variables: [
      { token: '{requestId}', label: 'رقم الطلب' },
      { token: '{programName}', label: 'البرنامج' },
      { token: '{studentName}', label: 'المتدرب' },
      { token: '{studentId}', label: 'رقم ID إن وجد' },
      { token: '{phone}', label: 'الجوال' },
      { token: '{priceLabel}', label: 'الرسوم والدفع' },
      { token: '{notes}', label: 'ملاحظة' },
    ],
    defaultText:
      '<b>طلب التحاق ببرنامج من المتجر ({requestId})</b>\nالبرنامج: <b>{programName}</b>\nالمتدرب: <b>{studentName}</b> ({studentId})\nالجوال: <code>{phone}</code>\nالرسوم: {priceLabel}\nملاحظة: {notes}',
  },
  {
    key: 'admin_homework_submitted',
    audience: 'admin',
    labelAr: 'تنبيه تسليم واجب من طالب',
    descriptionAr: 'يُرسل للإدارة عند إكمال الطالب لدرس فيديو أو رفع واجب صورة/صوت.',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{studentId}', label: 'رقم المشترك' },
      { token: '{lessonTitle}', label: 'عنوان الدرس' },
      { token: '{actionLabel}', label: 'نوع التسليم' },
    ],
    defaultText:
      '📝 <b>تسليم واجب جديد</b>\nالطالب: <b>{studentName}</b> (ID: <code>{studentId}</code>)\nالدرس: {lessonTitle}\nالنوع: {actionLabel}',
  },
  {
    key: 'admin_attendance_checkin',
    audience: 'admin',
    labelAr: 'تنبيه حضور/تأخر طالب للحصة',
    descriptionAr: 'يُرسل للإدارة لحظة تأكيد الطالب لحضوره مع توضيح حالته (مبكر / بالموعد / متأخر).',
    defaultEnabled: true,
    variables: [
      { token: '{studentName}', label: 'اسم الطالب' },
      { token: '{studentId}', label: 'رقم المشترك' },
      { token: '{statusLabel}', label: 'حالة الحضور' },
      { token: '{date}', label: 'التاريخ' },
      { token: '{time}', label: 'وقت الدخول' },
      { token: '{scheduledTime}', label: 'موعد الحصة' },
      { token: '{sessionTitle}', label: 'الحصة' },
      { token: '{location}', label: 'الموقع' },
    ],
    defaultText:
      '📌 <b>تسجيل حضور حصة ({statusLabel})</b>\nالطالب: <b>{studentName}</b> (ID: <code>{studentId}</code>)\nالتاريخ: {date} — وقت الدخول: {time} (الموعد: {scheduledTime})\nالحصة: {sessionTitle}\nالموقع: {location}',
  },
  {
    key: 'admin_daily_absence_summary',
    audience: 'admin',
    labelAr: 'التقرير التلقائي للغياب للإدارة',
    descriptionAr: 'يُرسل للإدارة تلقائياً بعد انتهاء وقت السماح للحصة بقائمة المتغيبين اليوم.',
    defaultEnabled: true,
    variables: [
      { token: '{programName}', label: 'البرنامج' },
      { token: '{sessionTitle}', label: 'الحصة' },
      { token: '{date}', label: 'التاريخ' },
      { token: '{scheduledTime}', label: 'موعد الحصة' },
      { token: '{absentCount}', label: 'عدد الغائبين' },
      { token: '{absentList}', label: 'أسماء الغائبين' },
    ],
    defaultText:
      '📊 <b>ملخص الغياب عن الحصة</b>\nالبرنامج: <b>{programName}</b>\nالحصة: {sessionTitle}\nالتاريخ: {date} · الموعد: {scheduledTime}\nعدد الغائبين: <b>{absentCount}</b>\n{absentList}',
  },
];

export function getDefaultTelegramTemplates(): Record<TelegramTemplateKey, TelegramTemplateConfig> {
  const out = {} as Record<TelegramTemplateKey, TelegramTemplateConfig>;
  TELEGRAM_TEMPLATE_META.forEach((m) => {
    out[m.key] = { enabled: m.defaultEnabled, text: m.defaultText };
  });
  return out;
}

export function resolveTelegramTemplate(
  config: TelegramConfig,
  key: TelegramTemplateKey
): TelegramTemplateConfig {
  const meta = TELEGRAM_TEMPLATE_META.find((m) => m.key === key);
  const custom = config.templates?.[key];
  if (key === 'student_welcome' && (!custom || !custom.text?.trim()) && config.welcomeMessage?.trim()) {
    return {
      enabled: custom?.enabled !== false,
      text: config.welcomeMessage,
    };
  }
  return {
    enabled: custom?.enabled !== undefined ? Boolean(custom.enabled) : meta?.defaultEnabled !== false,
    text: custom?.text !== undefined && custom.text !== '' ? custom.text : meta?.defaultText || '',
  };
}

export interface TelegramConfig {
  botToken: string;
  botUsername: string;
  enabled: boolean;
  welcomeMessage?: string;
  webhookUrl?: string;
  adminChatId?: string;
  notifyOnVideoCorrection?: boolean;
  notifyAdminOnHomework?: boolean;
  dailyReminderEnabled?: boolean;
  customFooter?: string;
  templates?: TelegramTemplatesMap;
}

export interface TelegramStudentLink {
  studentId: string;
  studentName: string;
  chatId: string;
  telegramUsername?: string;
  linkedAt?: string;
  notificationsEnabled: boolean;
}

export const VIDEO_SHEETS = {
  QUESTIONS: 'فيديو_الأسئلة',
  ANSWERS: 'فيديو_الإجابات',
  CORRECTIONS: 'فيديو_التصحيح',
  TELEGRAM_CONFIG: 'تيليغرام_الإعدادات',
  TELEGRAM_USERS: 'تيليغرام_الطلاب',
} as const;

const STORAGE_KEY_VIDEO_LESSONS = 'faseeh_video_lessons_v1';
const STORAGE_KEY_VIDEO_PROGRESS_PREFIX = 'faseeh_video_progress_v1_';
const STORAGE_KEY_VIDEO_RETRIES_USED = 'faseeh_video_retries_used_v1';

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

const AUDIO_HW_CFG_MARKER_ID = '__audio_hw_cfg__';

function normalizeVideoLessonRow(raw: any, idx: number): VideoLesson | null {
  const title = String(raw.title || raw.word || raw.lessonTitle || '').trim();
  const videoUrl = String(raw.videoUrl || raw.youtubeUrl || '').trim();
  if (!title && !videoUrl) return null;

  const rawQs = Array.isArray(raw.questions) ? raw.questions : [];
  const rawAudioQs = Array.isArray(raw.audioQuestions) ? raw.audioQuestions : [];

  const audioHwCfg = rawAudioQs.find((q: any) => q && q.id === AUDIO_HW_CFG_MARKER_ID);
  const filteredRawAudioQs = rawAudioQs.filter((q: any) => !q || q.id !== AUDIO_HW_CFG_MARKER_ID);

  const questions = rawQs
    .map((q: any, i: number) => normalizeQuestionItem(q, i))
    .filter((q: VideoTimestampQuestion | null): q is VideoTimestampQuestion => Boolean(q));

  const audioQuestions = filteredRawAudioQs
    .map((q: any, i: number) => normalizeQuestionItem(q, i))
    .filter((q: VideoTimestampQuestion | null): q is VideoTimestampQuestion => Boolean(q));

  const retryNum = Number(raw.retryCount ?? raw.defaultRetryResetCount ?? 1);
  const resolvedModeRaw = String(
    raw.audioHomeworkMode || (Array.isArray(audioHwCfg?.options) ? audioHwCfg.options[0] : '') || 'free'
  ).trim();
  const audioHomeworkMode: 'free' | 'verify' = resolvedModeRaw === 'verify' ? 'verify' : 'free';
  const audioHomeworkPrompt = String(raw.audioHomeworkPrompt ?? audioHwCfg?.question ?? '').trim();
  const audioHomeworkTarget = String(raw.audioHomeworkTarget ?? audioHwCfg?.correctAnswer ?? '').trim();

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
    audioHomeworkMode,
    audioHomeworkPrompt: audioHomeworkPrompt || undefined,
    audioHomeworkTarget: audioHomeworkTarget || undefined,
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

export function serializeVideoLessonForSheet(lesson: VideoLesson): VideoLesson {
  const cleanAudioQs = (lesson.audioQuestions || []).filter((q) => q.id !== AUDIO_HW_CFG_MARKER_ID);
  if (lesson.audioHomeworkMode === 'verify' || lesson.audioHomeworkPrompt || lesson.audioHomeworkTarget) {
    cleanAudioQs.push({
      id: AUDIO_HW_CFG_MARKER_ID,
      slotIndex: -1,
      time: 0,
      question: (lesson.audioHomeworkPrompt || '').trim(),
      options: [lesson.audioHomeworkMode === 'verify' ? 'verify' : 'free'],
      correctAnswer: (lesson.audioHomeworkTarget || '').trim(),
    });
  }
  return {
    ...lesson,
    audioQuestions: cleanAudioQs,
  };
}

export function verifyVideoAudioPronunciation(
  targetText: string,
  spokenText: string
): { matched: boolean; score: number; cleanSpoken: string } {
  const normalizePlain = (txt: string) =>
    removeTashkeel(txt || '')
      .replace(/[إأآا]/g, 'ا')
      .replace(/[ىي]/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[.,!؟;:_#%&*()<>[\]{}"'،؛]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const cleanTarget = normalizePlain(targetText);
  const cleanSpoken = normalizePlain(spokenText);
  if (!cleanTarget || !cleanSpoken) {
    return { matched: false, score: 0, cleanSpoken: (spokenText || '').trim() };
  }
  if (cleanTarget === cleanSpoken || cleanSpoken.includes(cleanTarget)) {
    return { matched: true, score: 100, cleanSpoken: (spokenText || '').trim() };
  }
  const evalRes = evaluateArabicLocal(targetText, spokenText, 1, 'medium');
  if (evalRes.isMatch || evalRes.score >= 70) {
    return {
      matched: true,
      score: evalRes.score,
      cleanSpoken: (spokenText || '').trim(),
    };
  }
  // Multi-word sentence tolerance: check how many target words appear in spoken tokens
  const targetTokens = cleanTarget.split(' ').filter(Boolean);
  const spokenTokens = cleanSpoken.split(' ').filter(Boolean);
  if (targetTokens.length >= 2 && spokenTokens.length > 0) {
    const matchedTokens = targetTokens.filter((tt) =>
      spokenTokens.some((st) => st === tt || st.includes(tt) || tt.includes(st))
    ).length;
    const ratio = Math.round((matchedTokens / targetTokens.length) * 100);
    if (ratio >= 70) {
      return {
        matched: true,
        score: Math.max(evalRes.score, ratio),
        cleanSpoken: (spokenText || '').trim(),
      };
    }
  }
  return {
    matched: Boolean(evalRes.isMatch),
    score: evalRes.score,
    cleanSpoken: (spokenText || '').trim(),
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

export interface VideoLessonCompletionEval {
  isFullyCompleted: boolean;
  videoDone: boolean;
  videoQuestionsDone: boolean;
  imageRequired: boolean;
  imageDone: boolean;
  audioRequired: boolean;
  audioDone: boolean;
  hasAnyProgress: boolean;
  missingParts: ('video' | 'image' | 'audio')[];
}

export function evaluateVideoLessonCompletion(
  lesson: VideoLesson,
  progress?: VideoStudentProgress
): VideoLessonCompletionEval {
  const answered = progress?.answeredQuestions || {};
  const videoQsDone =
    lesson.questions.length === 0 ||
    lesson.questions.every((_, idx) => Boolean(answered[`vq_${idx}`]));
  const audioQsDone =
    lesson.audioQuestions.length === 0 ||
    lesson.audioQuestions.every((_, idx) => Boolean(answered[`aq_${idx}`]));
  const videoQuestionsDone = videoQsDone && audioQsDone;

  const videoDone = Boolean(
    progress &&
      (progress.videoCompleted === true ||
        progress.completed === 'تم' ||
        progress.completed === 'فيديو_تم')
  );

  const imageRequired = lesson.allowUpload !== 'لا';
  const imageDone = !imageRequired || Boolean(progress?.imageLink && progress.imageLink.trim());

  const audioRequired = lesson.allowRecording !== 'لا';
  const audioDone = !audioRequired || Boolean(progress?.recordingLink && progress.recordingLink.trim());

  const missingParts: ('video' | 'image' | 'audio')[] = [];
  if (!videoDone) missingParts.push('video');
  if (imageRequired && !imageDone) missingParts.push('image');
  if (audioRequired && !audioDone) missingParts.push('audio');

  const isFullyCompleted = missingParts.length === 0;
  const hasAnyProgress = Boolean(
    progress &&
      (videoDone ||
        Object.keys(answered).length > 0 ||
        Boolean(progress.imageLink && progress.imageLink.trim()) ||
        Boolean(progress.recordingLink && progress.recordingLink.trim()) ||
        progress.completed === 'إعادة')
  );

  return {
    isFullyCompleted,
    videoDone,
    videoQuestionsDone,
    imageRequired,
    imageDone,
    audioRequired,
    audioDone,
    hasAnyProgress,
    missingParts,
  };
}

function getVideoRetryEntryKey(
  studentId: string | undefined,
  studentName: string | undefined,
  lessonId: string
): string {
  const sPart = (studentId || '').trim()
    ? `id:${(studentId || '').trim()}`
    : (studentName || '').trim()
    ? `name:${(studentName || '').trim()}`
    : 'guest';
  return `${sPart}::${(lessonId || '').trim()}`;
}

function readLocalVideoRetriesUsedMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VIDEO_RETRIES_USED);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function writeLocalVideoRetriesUsedMap(map: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY_VIDEO_RETRIES_USED, JSON.stringify(map));
  } catch {}
}

export function getVideoUsedRetriesCount(
  student: Pick<StudentRegistrant, 'id' | 'name'> | null | undefined,
  lessonId: string
): number {
  const map = readLocalVideoRetriesUsedMap();
  const key = getVideoRetryEntryKey(student?.id, student?.name, lessonId);
  const val = Number(map[key] || 0);
  return !isNaN(val) && val > 0 ? Math.floor(val) : 0;
}

export function getVideoRemainingRetries(
  lesson: VideoLesson,
  student: Pick<StudentRegistrant, 'id' | 'name'> | null | undefined,
  progress?: VideoStudentProgress
): number {
  const maxRetries = Math.max(0, Number(lesson.retryCount ?? 0) || 0);
  if (maxRetries === 0) return 0;

  const usedRecorded = getVideoUsedRetriesCount(student, lesson.id);
  // If sheet explicitly recorded a positive remaining count lower than maxRetries (from another device before سجل_المحاولات), respect that too
  const sheetHintUsed =
    progress &&
    typeof progress.retryResetCount === 'number' &&
    !isNaN(progress.retryResetCount) &&
    progress.retryResetCount > 0 &&
    progress.retryResetCount < maxRetries
      ? maxRetries - progress.retryResetCount
      : 0;

  const effectiveUsed = Math.max(usedRecorded, sheetHintUsed);
  return Math.max(0, maxRetries - effectiveUsed);
}

async function syncVideoRetriesUsedFromSheets(
  webhookUrl: string,
  studentId: string,
  studentName: string
): Promise<void> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) return;
  const cleanId = (studentId || '').trim();
  const cleanName = (studentName || '').trim();
  if (!cleanId && !cleanName) return;

  try {
    const cleanUrl = webhookUrl.trim();
    const sep = cleanUrl.includes('?') ? '&' : '?';
    const targetUrl = `${cleanUrl}${sep}action=get_student_retries&studentId=${encodeURIComponent(
      cleanId
    )}&studentName=${encodeURIComponent(cleanName)}&_t=${Date.now()}`;

    let data: any = null;
    try {
      const proxyRes = await fetch(`/api/google-sheets?url=${encodeURIComponent(targetUrl)}`);
      if (proxyRes.ok) data = await proxyRes.json().catch(() => null);
    } catch {}

    if (!data || !Array.isArray(data.retries)) {
      try {
        const directRes = await fetch(targetUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (directRes.ok) data = await directRes.json().catch(() => null);
      } catch {}
    }

    if (data && Array.isArray(data.retries)) {
      const map = readLocalVideoRetriesUsedMap();
      let changed = false;
      for (const r of data.retries) {
        if (String(r.mode || '').trim() === 'video' && r.exerciseKey) {
          const cnt = parseInt(String(r.retryCount || 0), 10) || 0;
          const entryKey = getVideoRetryEntryKey(cleanId, cleanName, String(r.exerciseKey));
          if (cnt > 0 && (map[entryKey] || 0) < cnt) {
            map[entryKey] = cnt;
            changed = true;
          }
        }
      }
      if (changed) writeLocalVideoRetriesUsedMap(map);
    }
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
    const [res] = await Promise.all([
      callGoogleSheetsPost(webhookUrl, {
        action: 'get_video_answers',
        sheetName: VIDEO_SHEETS.ANSWERS,
        studentId,
        studentName,
      }),
      syncVideoRetriesUsedFromSheets(webhookUrl, studentId, studentName),
    ]);
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
        const comp = String(row.completed || '').trim() as VideoStudentProgress['completed'];
        const rawRetry = row.retryResetCount;
        const parsedRetry =
          rawRetry !== undefined && rawRetry !== null && rawRetry !== '' && !isNaN(Number(rawRetry))
            ? Number(rawRetry)
            : undefined;
        sheetMap[lid] = {
          lessonId: lid,
          topic: String(row.topic || '').trim(),
          title: String(row.title || '').trim(),
          completed: comp || '',
          videoCompleted: comp === 'تم' || comp === 'فيديو_تم',
          videoScore: Number(row.videoScore ?? 0) || 0,
          explainAudioScore: Number(row.explainAudioScore ?? 0) || 0,
          answeredQuestions: parsedAns,
          retryResetCount: parsedRetry,
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

  const retryToPersist =
    typeof currentProgress.retryResetCount === 'number' && !isNaN(currentProgress.retryResetCount)
      ? currentProgress.retryResetCount
      : lesson.retryCount;

  const updatedProgress: VideoStudentProgress = {
    ...currentProgress,
    lessonId: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    answeredQuestions: nextAnswers,
    videoScore,
    retryResetCount: retryToPersist,
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
        autoComplete: false,
        completed: currentProgress.completed || '',
        retryResetCount: retryToPersist,
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

  const retryToPersist =
    typeof currentProgress.retryResetCount === 'number' && !isNaN(currentProgress.retryResetCount)
      ? currentProgress.retryResetCount
      : lesson.retryCount;

  const tentativeProgress: VideoStudentProgress = {
    ...currentProgress,
    lessonId: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    imageLink: mediaType === 'image' ? finalUrl : currentProgress.imageLink,
    recordingLink: mediaType === 'audio' ? finalUrl : currentProgress.recordingLink,
    retryResetCount: retryToPersist,
  };
  const evalAfterMedia = evaluateVideoLessonCompletion(lesson, tentativeProgress);
  const nextCompleted: VideoStudentProgress['completed'] = evalAfterMedia.isFullyCompleted
    ? 'تم'
    : currentProgress.completed === 'تم'
    ? 'فيديو_تم'
    : currentProgress.completed || '';

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
        completed: nextCompleted,
        retryResetCount: retryToPersist,
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
    ...tentativeProgress,
    imageLink: mediaType === 'image' ? finalUrl : currentProgress.imageLink,
    recordingLink: mediaType === 'audio' ? finalUrl : currentProgress.recordingLink,
    completed: nextCompleted,
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

  const retryToPersist =
    typeof currentProgress.retryResetCount === 'number' && !isNaN(currentProgress.retryResetCount)
      ? currentProgress.retryResetCount
      : lesson.retryCount;

  const draftProgress: VideoStudentProgress = {
    ...currentProgress,
    lessonId: lesson.id,
    topic: lesson.topic,
    title: lesson.title,
    videoCompleted: true,
    retryResetCount: retryToPersist,
  };
  const evalRes = evaluateVideoLessonCompletion(lesson, draftProgress);
  const nextCompleted: 'تم' | 'فيديو_تم' = evalRes.isFullyCompleted ? 'تم' : 'فيديو_تم';

  const updatedProgress: VideoStudentProgress = {
    ...draftProgress,
    completed: nextCompleted,
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
        completed: nextCompleted,
        retryResetCount: retryToPersist,
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
  const currentRemaining = getVideoRemainingRetries(
    lesson,
    { id: studentId, name: studentName },
    currentProgress
  );
  const nextRemaining = Math.max(0, currentRemaining - 1);

  const retryMap = readLocalVideoRetriesUsedMap();
  const rKey = getVideoRetryEntryKey(studentId, studentName, lesson.id);
  const nextUsed = (Number(retryMap[rKey]) || 0) + 1;
  retryMap[rKey] = nextUsed;
  writeLocalVideoRetriesUsedMap(retryMap);

  const updatedProgress: VideoStudentProgress = {
    ...currentProgress,
    completed: 'إعادة',
    videoCompleted: false,
    retryResetCount: nextRemaining,
    answeredQuestions: {},
    videoScore: 0,
    // Keep imageLink and recordingLink intact!
    imageLink: currentProgress.imageLink,
    recordingLink: currentProgress.recordingLink,
    updatedAt: new Date().toISOString(),
  };

  const map = getLocalVideoProgressMap(studentId);
  map[lesson.id] = updatedProgress;
  saveLocalVideoProgressMap(studentId, map);

  if (webhookUrl && webhookUrl.trim().startsWith('http') && (studentId || studentName)) {
    try {
      await Promise.all([
        callGoogleSheetsPost(webhookUrl, {
          action: 'retry_video_lesson',
          sheetName: VIDEO_SHEETS.ANSWERS,
          studentId,
          studentName,
          lessonId: lesson.id,
          topic: lesson.topic,
          title: lesson.title,
          retryResetCount: nextRemaining,
        }),
        callGoogleSheetsPost(webhookUrl, {
          action: 'record_retry',
          sheetName: 'سجل_المحاولات',
          studentId,
          studentName,
          mode: 'video',
          exerciseKey: lesson.id,
          retryCount: nextUsed,
          timestamp: new Date().toLocaleString('ar-SA'),
        }),
      ]);
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
        imageLinks: Array.isArray(c.imageLinks) ? c.imageLinks : [],
        imageDate: String(c.imageDate || '').trim() || undefined,
        imageNotes: String(c.imageNotes || '').trim() || undefined,
        audioStatus: String(c.audioStatus || '').trim(),
        audioScore: String(c.audioScore || '').trim(),
        teacherAudios: Array.isArray(c.teacherAudios) ? c.teacherAudios : [],
        teacherVideos: Array.isArray(c.teacherVideos) ? c.teacherVideos : [],
        audioLinks: Array.isArray(c.audioLinks) ? c.audioLinks : [],
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
        lesson: serializeVideoLessonForSheet(lesson),
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
    lessons: lessons.map((l) => serializeVideoLessonForSheet(l)),
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

export function normalizeTelegramTemplates(raw?: any, legacyWelcome?: string): TelegramTemplatesMap {
  const defaults = getDefaultTelegramTemplates();
  const out: TelegramTemplatesMap = {};
  (Object.keys(defaults) as TelegramTemplateKey[]).forEach((k) => {
    const custom = raw && typeof raw === 'object' ? raw[k] : undefined;
    const defItem = defaults[k];
    if (custom && typeof custom === 'object') {
      out[k] = {
        enabled: custom.enabled !== undefined ? Boolean(custom.enabled) : defItem.enabled,
        text: custom.text !== undefined ? String(custom.text) : defItem.text,
      };
    } else if (k === 'student_welcome' && legacyWelcome && legacyWelcome.trim()) {
      out[k] = { enabled: true, text: legacyWelcome };
    } else {
      out[k] = { ...defItem };
    }
  });
  return out;
}

export function getLocalTelegramConfig(): TelegramConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TELEGRAM_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      const welcomeMsg = String(
        parsed.welcomeMessage ||
          'مرحباً بك! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم.'
      );
      return {
        botToken: String(parsed.botToken || ''),
        botUsername: String(parsed.botUsername || ''),
        enabled: Boolean(parsed.enabled),
        welcomeMessage: welcomeMsg,
        webhookUrl: parsed.webhookUrl ? String(parsed.webhookUrl) : undefined,
        adminChatId: String(parsed.adminChatId || ''),
        notifyOnVideoCorrection: parsed.notifyOnVideoCorrection !== false,
        notifyAdminOnHomework: Boolean(parsed.notifyAdminOnHomework),
        dailyReminderEnabled: Boolean(parsed.dailyReminderEnabled),
        customFooter: String(parsed.customFooter || ''),
        templates: normalizeTelegramTemplates(parsed.templates, welcomeMsg),
      };
    }
  } catch {}
  const defaultWelcome = 'مرحباً بك! تم ربط حسابك بنجاح لتلقي إشعارات الدروس وتصحيحات المعلم.';
  return {
    botToken: '',
    botUsername: '',
    enabled: false,
    welcomeMessage: defaultWelcome,
    adminChatId: '',
    notifyOnVideoCorrection: true,
    notifyAdminOnHomework: false,
    dailyReminderEnabled: false,
    customFooter: '',
    templates: normalizeTelegramTemplates(undefined, defaultWelcome),
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
      const c = res.data.config;
      const welcomeMsg = String(c.welcomeMessage || local.welcomeMessage || '');
      let rawTemplates = c.templates;
      if (typeof c.templatesJson === 'string' && c.templatesJson.trim()) {
        try {
          rawTemplates = JSON.parse(c.templatesJson);
        } catch {}
      }
      const cfg: TelegramConfig = {
        botToken: String(c.botToken || ''),
        botUsername: String(c.botUsername || ''),
        enabled: Boolean(c.enabled),
        welcomeMessage: welcomeMsg,
        webhookUrl: c.webhookUrl ? String(c.webhookUrl) : undefined,
        adminChatId: String(c.adminChatId || ''),
        notifyOnVideoCorrection: c.notifyOnVideoCorrection !== false,
        notifyAdminOnHomework: Boolean(c.notifyAdminOnHomework),
        dailyReminderEnabled: Boolean(c.dailyReminderEnabled),
        customFooter: String(c.customFooter || ''),
        templates: normalizeTelegramTemplates(rawTemplates || local.templates, welcomeMsg),
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
  const normalizedTemplates = normalizeTelegramTemplates(config.templates, config.welcomeMessage);
  const syncedWelcome = normalizedTemplates.student_welcome?.text || config.welcomeMessage || '';
  const payloadConfig: TelegramConfig = {
    ...config,
    welcomeMessage: syncedWelcome,
    templates: normalizedTemplates,
  };
  saveLocalTelegramConfig(payloadConfig);
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'تم الحفظ محلياً (أدخل رابط Webhook لمزامنة الشيت)' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'save_telegram_config',
    sheetName: VIDEO_SHEETS.TELEGRAM_CONFIG,
    config: {
      ...payloadConfig,
      templatesJson: JSON.stringify(normalizedTemplates),
    },
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

export async function linkTelegramUserInSheet(
  webhookUrl: string,
  payload: {
    studentId: string;
    studentName: string;
    chatId: string;
    telegramUsername?: string;
    notificationsEnabled?: boolean;
  }
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'يرجى ربط Google Sheets Webhook أولاً.' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'link_telegram_user',
    sheetName: VIDEO_SHEETS.TELEGRAM_USERS,
    ...payload,
  });
  if (!res.success) {
    return { success: false, message: res.error || 'تعذر ربط الطالب في ورقة تيليغرام' };
  }
  if (res.data?.telegramHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'يرجى تحديث نشر Google Apps Script (New Version) لتفعيل الربط اليدوي.',
    };
  }
  return { success: true, message: res.message || 'تم ربط الطالب ببوت تيليغرام بنجاح' };
}

export async function toggleTelegramUserNotificationsInSheet(
  webhookUrl: string,
  params: { studentId?: string; chatId: string; notificationsEnabled: boolean }
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'يرجى ربط Google Sheets Webhook أولاً.' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'toggle_telegram_user',
    sheetName: VIDEO_SHEETS.TELEGRAM_USERS,
    ...params,
  });
  if (!res.success) {
    return { success: false, message: res.error || 'تعذر تحديث حالة الإشعارات' };
  }
  if (res.data?.telegramHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'يرجى تحديث نشر Google Apps Script (New Version) لتفعيل تبديل حالة الإشعارات.',
    };
  }
  return { success: true, message: res.message || 'تم تحديث حالة الإشعارات بنجاح' };
}

export async function deleteTelegramUserInSheet(
  webhookUrl: string,
  params: { studentId?: string; chatId: string }
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  if (!webhookUrl || !webhookUrl.trim().startsWith('http')) {
    return { success: false, message: 'يرجى ربط Google Sheets Webhook أولاً.' };
  }
  const res = await callGoogleSheetsPost(webhookUrl, {
    action: 'delete_telegram_user',
    sheetName: VIDEO_SHEETS.TELEGRAM_USERS,
    ...params,
  });
  if (!res.success) {
    return { success: false, message: res.error || 'تعذر إلغاء ربط الطالب' };
  }
  if (res.data?.telegramHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'يرجى تحديث نشر Google Apps Script (New Version) لتفعيل حذف ربط الطالب.',
    };
  }
  return { success: true, message: res.message || 'تم إلغاء ربط الطالب بنجاح' };
}

export async function sendTelegramNotification(
  webhookUrl: string,
  params: {
    studentId?: string;
    studentIds?: string[];
    studentName?: string;
    chatId?: string;
    message: string;
    photoUrl?: string;
    broadcastAll?: boolean;
    botToken?: string;
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

// =========================================================================
// DYNAMIC VARIABLE TRANSLATIONS BUILDER FOR VIDEO LESSONS (الترجمة)
// =========================================================================

export function buildVideoVariableTranslationItems(
  lessons: VideoLesson[],
  existingTranslations: TranslationItem[]
): TranslationItem[] {
  const savedMap = new Map<string, TranslationItem>();
  existingTranslations.forEach((item) => {
    savedMap.set(item.id, item);
  });

  const outMap = new Map<string, TranslationItem>();
  const addDynamic = (
    id: string,
    arText: string,
    categoryLabel: string,
    note: string
  ) => {
    const clean = (arText || '').trim();
    if (!clean) return;
    const prev = savedMap.get(id);
    outMap.set(id, {
      id,
      category: 'video',
      categoryLabel,
      ar: prev?.ar?.trim() ? prev.ar : clean,
      th: prev?.th || '',
      en: prev?.en || '',
      isSheetLinked: true,
      sheetSourceNote: note,
    });
  };

  lessons.forEach((lesson) => {
    const topic = (lesson.topic || '').trim();
    const title = (lesson.title || '').trim();

    if (topic) {
      addDynamic(
        `video_topic_${topic}`,
        topic,
        'مواضيع دروس الفيديو (فيديو_الأسئلة)',
        'موضوع درس فيديو'
      );
    }
    if (title) {
      addDynamic(
        `video_title_${lesson.id}`,
        title,
        'عناوين دروس الفيديو (فيديو_الأسئلة)',
        `موضوع: ${topic || 'عام'}`
      );
    }
    if (lesson.instruction && lesson.instruction.trim()) {
      addDynamic(
        `video_instr_${lesson.id}`,
        lesson.instruction,
        'تعليمات دروس الفيديو (فيديو_الأسئلة)',
        `تعليمات: ${title || lesson.id}`
      );
    }
    if (lesson.uploadTitle && lesson.uploadTitle.trim()) {
      addDynamic(
        `video_upload_title_${lesson.id}`,
        lesson.uploadTitle,
        'عناوين واجبات الصور (فيديو_الأسئلة)',
        `واجب الصورة: ${title || lesson.id}`
      );
    }
    if (lesson.audioHomeworkPrompt && lesson.audioHomeworkPrompt.trim()) {
      addDynamic(
        `video_audio_hw_prompt_${lesson.id}`,
        lesson.audioHomeworkPrompt,
        'توجيهات الواجب الصوتي (فيديو_الأسئلة)',
        `سؤال الواجب الصوتي: ${title || lesson.id}`
      );
    }

    (lesson.questions || []).forEach((q, qIdx) => {
      if (q.question && q.question.trim()) {
        addDynamic(
          `video_vq_q_${lesson.id}_${qIdx}`,
          q.question,
          'أسئلة الفيديو التفاعلية (فيديو_الأسئلة)',
          `${title || lesson.id} · س${qIdx + 1}`
        );
      }
      (q.options || []).forEach((opt, oIdx) => {
        if (opt && opt.trim()) {
          addDynamic(
            `video_vq_opt_${lesson.id}_${qIdx}_${oIdx}`,
            opt,
            'خيارات أسئلة الفيديو (فيديو_الأسئلة)',
            `${title || lesson.id} · س${qIdx + 1} · خيار ${oIdx + 1}`
          );
        }
      });
      const ans = (q.correctAnswer || '').trim();
      if (ans && !(q.options || []).some((o) => o.trim() === ans)) {
        addDynamic(
          `video_vq_ans_${lesson.id}_${qIdx}`,
          ans,
          'إجابات أسئلة الفيديو (فيديو_الأسئلة)',
          `${title || lesson.id} · س${qIdx + 1}`
        );
      }
    });

    (lesson.audioQuestions || []).forEach((aq, qIdx) => {
      if (aq.question && aq.question.trim()) {
        addDynamic(
          `video_aq_q_${lesson.id}_${qIdx}`,
          aq.question,
          'أسئلة الصوت التفاعلية (فيديو_الأسئلة)',
          `${title || lesson.id} · صوت س${qIdx + 1}`
        );
      }
      (aq.options || []).forEach((opt, oIdx) => {
        if (opt && opt.trim()) {
          addDynamic(
            `video_aq_opt_${lesson.id}_${qIdx}_${oIdx}`,
            opt,
            'خيارات أسئلة الصوت (فيديو_الأسئلة)',
            `${title || lesson.id} · صوت س${qIdx + 1} · خيار ${oIdx + 1}`
          );
        }
      });
      const ans = (aq.correctAnswer || '').trim();
      if (ans && !(aq.options || []).some((o) => o.trim() === ans)) {
        addDynamic(
          `video_aq_ans_${lesson.id}_${qIdx}`,
          ans,
          'إجابات أسئلة الصوت (فيديو_الأسئلة)',
          `${title || lesson.id} · صوت س${qIdx + 1}`
        );
      }
    });
  });

  return Array.from(outMap.values());
}

export function buildAllVideoTranslationItems(
  lessons: VideoLesson[],
  existingTranslations: TranslationItem[]
): TranslationItem[] {
  const map = new Map<string, TranslationItem>();

  DEFAULT_TRANSLATIONS.filter(
    (d) => d.category === 'video' || d.id.startsWith('login_qr_')
  ).forEach((d) => map.set(d.id, d));

  existingTranslations.forEach((item) => {
    if (
      item.category === 'video' ||
      item.id.startsWith('video_') ||
      item.id === 'nav_video_btn' ||
      item.id.startsWith('login_qr_')
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
          : { ...item, category: 'video' }
      );
    }
  });

  buildVideoVariableTranslationItems(lessons, existingTranslations).forEach((dyn) => {
    map.set(dyn.id, dyn);
  });

  return Array.from(map.values());
}

