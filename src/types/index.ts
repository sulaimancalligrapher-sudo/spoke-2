export type EvaluationMode = 'acoustic' | 'ai' | 'local' | 'whisper';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface AcousticWaveformMetrics {
  speechDuration: number;
  expectedDuration: number;
  durationMatchPercent: number;
  energyLevel: number; // 0-100
  voiceActivityDetected: boolean;
  rhythmScore: number; // 0-100
  spectralClarityScore: number; // 0-100
}

export interface WordItem {
  id: string;
  word: string; // with Tashkeel
  plainWord: string; // stripped of Tashkeel
  meaning: string; // المعنى والتوضيح
  category: string; // 'الحرف' | 'الكلمة' | 'الجملة' أو أي فئة مخصصة
  lessonSubject: string; // موضوع الدرس
  level?: number;
  imageUrl?: string; // رابط الصورة
  audioUrl?: string; // رابط الصوت
  autoReadText?: string; // نص مخصص للقراءة الآلية في حال عدم وجود ملف صوتي
  makhrajTip: string; // إرشادات المخرج الصوتي
  letterFocus?: string;
  harakat?: string;
  transliteration?: string;
  repeatCount?: number; // عدد مرات التكرار المطلوبة (افتراضي 1)
  difficultyLevel?: DifficultyLevel; // مستوى تدقيق النطق: 'easy' (سهل) | 'medium' (متوسط) | 'hard' (متقدم)
  recordingDuration?: number; // مدة التسجيل المخصصة بالثواني (افتراضي 5 ثوانٍ)
  allowRetry?: boolean; // السماح بإعادة التمرين بعد تسجيل الإجابة (افتراضي true)
  maxRetries?: number; // الحد الأقصى لعدد محاولات الإعادة بعد تسجيل الإجابة (افتراضي 3، 0 = منع الإعادة، -1 = غير محدود)
}

export interface LetterPhoneme {
  letter: string;
  status: 'صحيح' | 'يحتاج تحسين' | 'مفقود';
  comment?: string;
}

export interface PronunciationEvaluation {
  score: number;
  grade: string;
  isMatch: boolean;
  feedback: string;
  makhrajAdvice: string;
  vowelAccuracy: string;
  detectedWord: string;
  letterBreakdown: LetterPhoneme[];
  timestamp: number;
  recordedAudioUrl?: string;
  engineUsed: EvaluationMode;
  engineNotice?: string;
  acousticMetrics?: AcousticWaveformMetrics;
  repetitionsDetected?: number; // عدد التكرارات التي رصدها النظام
  requiredRepetitions?: number; // عدد التكرارات المطلوبة
  repetitionsVerifiedByEnergy?: boolean; // هل تم التحقق من التكرار عبر نبضات الطاقة الفيزيائية
  difficultyLevel?: DifficultyLevel; // مستوى التدقيق المطبق
  textMatchScore?: number; // نسبة مطابقة النص مع النموذج
  acousticMatchScore?: number; // نسبة مطابقة البصمة الصوتية مع تسجيل المعلم
  acousticComparison?: {
    similarityScore: number;
    durationRatio: number;
    teacherDuration: number;
    studentDuration: number;
    feedback: string;
  };
}

export interface PracticeHistoryItem {
  id: string;
  wordId: string;
  word: string;
  score: number;
  grade: string;
  timestamp: number;
  spokenText: string;
  recordedAudioUrl?: string;
  studentName?: string;
  engineUsed?: EvaluationMode;
}

export interface AudioSettings {
  speed: number;
  engine: 'browser' | 'gemini';
  autoPlayTarget: boolean;
  repeatTargetTwice: boolean;
  preferredEvaluationMode: EvaluationMode;
  studentName: string;
  geminiApiKey?: string;
}

export interface GoogleSheetsConfig {
  enabled: boolean;
  webhookUrl: string;
  autoSync: boolean;
  lastSyncTime?: number;
  driveFolderId?: string; // معرف مجلد أصوات المعلم للتوافق
  teacherDriveFolderId?: string; // معرف مجلد أصوات المعلم والإدارة (الافتراضي: 1YuCKWxGjQn9E2EAKqoKN-7-Kl_UeDC4t)
  studentDriveFolderId?: string; // معرف مجلد تسجيلات أصوات الطلاب (الافتراضي: 1o80NgUVp64TwTt_yRn3I83c6gy8Ce1iA)
  syncCurriculumFromSheets?: boolean; // مزامنة الدروس من ورقة "الدروس"
}

export interface StudentSubmissionRecord {
  id: string;
  studentName: string;
  word: string;
  score: number;
  grade: string;
  detectedWord: string;
  feedback: string;
  engineUsed: EvaluationMode;
  timestamp: number;
  syncedToSheets: boolean;
}

export interface StudentDeviceInfo {
  deviceId: string;
  location?: string;
  lastLogin?: string;
}

export interface StudentRegistrant {
  id: string; // رقم المشترك ID
  name: string; // اسم المشترك
  registeredAt?: number;
  status?: 'مفعّل' | 'معطّل' | string; // حالة الحساب
  maxDevices?: number; // الحد الأقصى للأجهزة المسموحة (افتراضي 1)
  devices?: StudentDeviceInfo[]; // الأجهزة المسجلة مع الموقع وتاريخ آخر دخول
  requireLocation?: boolean; // إجبار تحديد الموقع عند الدخول (افتراضي false = مسموح)
  directLoginUrl?: string; // رابط الدخول المباشر
  qrImageUrl?: string; // رابط/صيغة صورة QR
  programId?: string; // معرف البرنامج التدريبي المخصص للطالب
}

export interface SocialLinkItem {
  url: string;
  iconKey: string; // 'line' | 'facebook' | 'instagram' | 'youtube' | 'x' | 'whatsapp' | 'telegram' | 'tiktok' | 'web'
  label?: string;
}

export interface HomeCardConfig {
  cardLogoUrl?: string; // B21: رابط صورة الشعار
  cardBgUrl?: string; // B22: رابط صورة خلفية للبطاقة
  cardTitle?: string; // B23: نص العنوان
  cardSubtitle?: string; // B24: نص وصف العنوان
  extraText1?: string; // B25: نص إضافي 1
  extraText2?: string; // B26: نص إضافي 2
  extraText3?: string; // B27: نص إضافي 3
}

export interface AdminUserRecord {
  name: string;
  pin: string;
  blocked: boolean; // if cell contains 'لا' -> blocked from entering
}

export interface Answers1ExerciseDetail {
  word: string;
  spokenText: string;
  audioUrl?: string;
  score: number;
  grade: string;
}

export interface Answers1SubmissionRow {
  rowIndex: number;
  timestamp: string;
  studentId: string;
  studentName: string;
  lessonSubject: string;
  status: string;
  totalExercises: number;
  exercises: Answers1ExerciseDetail[];
}

export type HomeBlockType = 'announcement' | 'slideshow' | 'video' | 'link';

export interface HomeSlideItem {
  imageUrl: string;
  caption?: string;
  linkUrl?: string;
}

export interface HomeContentBlock {
  id: string;
  type: HomeBlockType;
  title: string;
  body?: string;
  mediaUrl?: string;
  linkUrl?: string;
  buttonLabel?: string;
  badgeText?: string;
  accentColor?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky';
  slides?: HomeSlideItem[];
  enabled: boolean;
  sortOrder: number;
  programIds?: string[]; // فارغ أو ['all'] = جميع البرامج؛ أو مصفوفة معرفات برامج محددة
}

export interface HomeNavbarControls {
  showLessons: boolean; // افتراضي false (مخفي)
  showVideo: boolean; // افتراضي false (مخفي)
  showSchedule: boolean; // افتراضي true (مسموح)
}

export interface HomeBrandConfig {
  logoUrl?: string; // B2: شعار الشريط العلوي
  title?: string; // B3: عنوان المنصة في الشريط العلوي
  subtitle?: string; // B4: وصف الشريط العلوي
  socialLinks: SocialLinkItem[]; // B8:C17
  card?: HomeCardConfig; // B21:B27: بطاقة الصفحة الرئيسية
  adminUsers?: AdminUserRecord[]; // D2:F31: أسماء الإداريين وأرقام الدخول وحالة المنع
  contentBlocks?: HomeContentBlock[]; // من ورقة "محتوى_الرئيسية"
}

export interface MatchingPair {
  id: string;
  rightText: string;
  leftText: string;
}

export interface MatchingExercise {
  id: string;
  exerciseNumber: number; // 1, 2, 3...
  questionText: string;
  pairs: MatchingPair[];
  inputMode?: 'voice_only' | 'both'; // صوت فقط أو كلاهما (فأرة وصوت)
  durationSeconds?: number; // مدة تسجيل الصوت بالثواني (افتراضياً 4 ثوانٍ)
  lockOnMistake?: boolean; // لا يمكن التراجع عن الإجابة عند الخطأ (تثبيت الخطأ)
  showMistakeFeedback?: boolean; // إظهار الخطأ فوراً (افتراضياً true) أو إخفاؤه حتى النهاية (false)
  allowSmartReassign?: boolean; // فك وتصحيح الخطأ الذكي (السماح بتبديل الإجابة وفك الربط السابق تلقائياً)
  allowRetry?: boolean; // السماح بإعادة التمرين بعد تسجيل الإجابة (افتراضي true)
  maxRetries?: number; // الحد الأقصى لعدد محاولات الإعادة بعد تسجيل الإجابة (افتراضي 3، 0 = منع الإعادة، -1 = غير محدود)
}

export interface MatchingLessonSubject {
  id: string;
  subjectName: string;
  exercises: MatchingExercise[];
}

export interface MatchingSubmissionResult {
  exerciseNumber: number;
  totalPairs: number;
  correctCount: number;
  wrongCount: number;
  percentage: number;
  summaryString: string; // e.g. "(5 - الصحيح 4 - الخطأ 1 = 80%)"
}

export interface MatchingExerciseHistoryEntry {
  exerciseNumber: number;
  formulaString: string; // e.g. "(5 - 4 صحيح - 1 خطأ = 80%)"
  percentage: number;
}

export interface MatchingHistoryItem {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  lessonSubject: string;
  completionStatus: string;
  exercises: MatchingExerciseHistoryEntry[];
}

export type DictationQuestionType =
  | 'letters_word'
  | 'letters_sentence'
  | 'words_sentence'
  | 'fill_letter'
  | 'fill_word';

export interface DictationExercise {
  id: string;
  exerciseNumber: number;
  questionText: string; // Col 1: نص | صورة:رابط | صوت:رابط
  scrambledPool: string; // Col 2: الحروف / الحروف المتصلة / الكلمات المشتتة
  correctAnswer: string; // Col 3: الإجابة الصحيحة (تقبل |...| للفراغ الناقص)
  settingsString?: string; // Col 4: الإعدادات
  inputMode?: 'voice_only' | 'both'; // صوت فقط أو صوت وفأرة
  lockOnMistake?: boolean; // لا يمكن التراجع (true) أو إتاحة المحاولة (false)
  durationSeconds?: number; // مدة تسجيل الصوت بالثواني (افتراضياً 5)
  allowRetry?: boolean; // السماح بإعادة التمرين بعد التسجيل (افتراضي true)
  maxRetries?: number; // الحد الأقصى لعدد محاولات الإعادة بعد التسجيل (افتراضي 3، 0 = منع الإعادة، -1 = غير محدود)
}

export interface DictationLessonSubject {
  id: string;
  subjectName: string;
  exercises: DictationExercise[];
}

export interface DictationExerciseHistoryEntry {
  exerciseNumber: number;
  formulaString: string;
  percentage: number;
}

export interface DictationHistoryItem {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  lessonSubject: string;
  completionStatus: string;
  exercises: DictationExerciseHistoryEntry[];
}

export interface WritingExerciseHistoryEntry {
  slotIndex: number;
  category: string;
  title: string;
  imageUrl?: string;
  score: number;
  details?: string;
}

export interface WritingHistoryItem {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  topic: string;
  completionStatus: string;
  exercises: WritingExerciseHistoryEntry[];
}

export type CatchQuestionType = DictationQuestionType;

export interface CatchExercise {
  id: string;
  exerciseNumber: number;
  questionText: string; // Col 1: نص | صورة:رابط | صوت:رابط
  scrambledPool: string; // Col 2: الحروف / الحروف المتصلة / الكلمات المشتتة
  correctAnswer: string; // Col 3: الإجابة الصحيحة (تقبل |...| للفراغ الناقص)
  settingsString?: string; // Col 4: الإعدادات (تراجع / إعادة ...)
  lockOnMistake?: boolean; // لا يمكن التراجع (true) أو إتاحة المحاولة (false)
  allowRetry?: boolean; // السماح بإعادة التمرين بعد التسجيل (افتراضي true)
  maxRetries?: number; // الحد الأقصى لمحاولات الإعادة (افتراضي 3، 0 = منع، -1 = غير محدود)
}

export interface CatchLessonSubject {
  id: string;
  subjectName: string;
  exercises: CatchExercise[];
}

export interface CatchExerciseHistoryEntry {
  exerciseNumber: number;
  formulaString: string;
  percentage: number;
}

export interface CatchHistoryItem {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  lessonSubject: string;
  completionStatus: string;
  exercises: CatchExerciseHistoryEntry[];
}

export type PdfReleaseControlMode =
  | 'always_on'
  | 'always_off'
  | 'after_date'
  | 'on_completion';

export type PdfFontFamily = 'Cairo' | 'Amiri' | 'Aref Ruqaa';
export type PdfTextAlign = 'right' | 'center' | 'left';

export interface PdfSignatureConfig {
  id: string;
  title: string;
  url: string;
  width: number;
}

export interface PdfStampConfig {
  id: string;
  title: string;
  url: string;
  width: number;
}

export interface PdfProgramReleaseOverride {
  releaseMode: PdfReleaseControlMode;
  releaseDate?: string;
}

export interface PdfReportSectionsConfig {
  overallSummary: boolean;
  encouragement: boolean;
  attendance: boolean;
  scheduleProgress: boolean;
  pronunciation: boolean;
  matching: boolean;
  dictation: boolean;
  writing: boolean;
  catchAr: boolean;
  video: boolean;
}

export interface PdfCertificateConfig {
  enabled: boolean;
  orientation: 'landscape' | 'portrait';
  backgroundUrl: string;
  frameUrl: string;
  footerImageUrl: string;
  footerImageHeight: number;
  subjectText: string;
  subjectFontSize: number;
  subjectAlign: PdfTextAlign;
  subjectFontFamily: PdfFontFamily;
  subjectColor: string;
  bodyText: string;
  bodyFontSize: number;
  bodyAlign: PdfTextAlign;
  bodyFontFamily: PdfFontFamily;
  bodyColor: string;
  marginTop: number;
  marginSide: number;
  marginBottom: number;
  signatures: PdfSignatureConfig[];
  stamps: PdfStampConfig[];
}

export interface PdfReportSettings {
  allowStudentFullReport: boolean;
  allowStudentCertificate: boolean;
  releaseMode: PdfReleaseControlMode;
  releaseDate: string;
  programReleaseOverrides: Record<string, PdfProgramReleaseOverride>;
  studentAllowOverrides: Record<string, 'allow' | 'deny'>;
  backgroundUrl: string;
  logoUrl: string;
  headerTitle: string;
  headerSubtitle: string;
  footerNote: string;
  coverImageBeforeUrl: string;
  closingImageAfterUrl: string;
  accentColor: 'emerald' | 'indigo' | 'amber' | 'slate';
  includeSections: PdfReportSectionsConfig;
  certificate: PdfCertificateConfig;
}

export type PortalSectionType =
  | 'announcement'
  | 'hero'
  | 'about'
  | 'programs'
  | 'gallery'
  | 'videos'
  | 'contact'
  | 'store_slot';

export type PortalSocialIconKey =
  | 'facebook'
  | 'instagram'
  | 'youtube'
  | 'line'
  | 'whatsapp'
  | 'telegram'
  | 'tiktok'
  | 'x'
  | 'globe'
  | 'custom';

export interface PortalSocialChannel {
  id: string;
  appName: string;
  iconKey: PortalSocialIconKey;
  iconUrl?: string;
  url: string;
  enabled: boolean;
  sortOrder: number;
}

export interface PortalUiTextEntry {
  ar: string;
  en: string;
  th: string;
  visible?: boolean;
}

export type PortalItemActionType =
  | 'none'
  | 'scroll_section'
  | 'external_url'
  | 'open_register'
  | 'open_program_request';

export interface PortalSectionConfig {
  key: PortalSectionType;
  label: string;
  labelEn?: string;
  labelTh?: string;
  enabled: boolean;
  sortOrder: number;
}

export interface PortalContentItem {
  id: string;
  section: PortalSectionType;
  title: string;
  titleEn?: string;
  titleTh?: string;
  subtitle?: string;
  subtitleEn?: string;
  subtitleTh?: string;
  description: string;
  descriptionEn?: string;
  descriptionTh?: string;
  mediaUrl?: string;
  galleryImages?: string[];
  thumbnailUrl?: string;
  linkUrl?: string;
  linkLabel?: string;
  linkLabelEn?: string;
  linkLabelTh?: string;
  badgeText?: string;
  badgeTextEn?: string;
  badgeTextTh?: string;
  metaPrimary?: string;
  metaPrimaryEn?: string;
  metaPrimaryTh?: string;
  metaSecondary?: string;
  metaSecondaryEn?: string;
  metaSecondaryTh?: string;
  actionType?: PortalItemActionType;
  slug?: string;
  targetProgramId?: string;
  enabled: boolean;
  sortOrder: number;
}

export interface PortalSettingsConfig {
  academyName: string;
  academyNameEn?: string;
  academyNameTh?: string;
  academyTagline: string;
  academyTaglineEn?: string;
  academyTaglineTh?: string;
  showHeroOverlay?: boolean;
  logoUrl?: string;
  heroTitle: string;
  heroTitleEn?: string;
  heroTitleTh?: string;
  heroSubtitle: string;
  heroSubtitleEn?: string;
  heroSubtitleTh?: string;
  heroMediaUrl?: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementTextEn?: string;
  announcementTextTh?: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  contactHours: string;
  telegramBotUsername: string;
  whatsappUrl?: string;
  socialChannels: PortalSocialChannel[];
  stage1DefaultProgramId: string;
  stage1BannerTitle: string;
  stage1BannerBody: string;
  adminNotificationEmail?: string;
  sendStudentWelcomeEmail?: boolean;
  notifyAdminTelegramOnRegister: boolean;
  notifyStudentTelegramOnTransfer: boolean;
  showStoreNavSlot: boolean;
  storeSlotTitle: string;
  storeSlotTitleEn?: string;
  storeSlotTitleTh?: string;
  storeSlotNote: string;
  storeSlotNoteEn?: string;
  storeSlotNoteTh?: string;
  uiTexts: Record<string, PortalUiTextEntry>;
  sections: PortalSectionConfig[];
}

export interface PortalPublicData {
  settings: PortalSettingsConfig;
  items: PortalContentItem[];
}

export type RegistrationQuestionType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'phone'
  | 'email'
  | 'select'
  | 'file';

export interface RegistrationQuestion {
  id: string;
  label: string;
  labelEn?: string;
  labelTh?: string;
  type: RegistrationQuestionType;
  required: boolean;
  options?: string[];
  placeholder?: string;
  guideUrl?: string;
  enabled: boolean;
  sortOrder: number;
}

export type RegistrationStage = 'stage1_default' | 'stage2_assigned' | 'paused';

export interface RegistrationAttachment {
  questionId: string;
  questionLabel: string;
  url: string;
}

export interface RegistrationSubmissionRecord {
  rowIndex?: number;
  submittedAt: string;
  registrationId: string;
  studentName: string;
  programId: string;
  programName?: string;
  stage: RegistrationStage;
  status: string;
  telegramUsername?: string;
  email?: string;
  phone?: string;
  answers: Record<string, string>;
  attachments: RegistrationAttachment[];
  adminNotes?: string;
}

export type ProgramRequestStatus = 'pending' | 'approved' | 'rejected';

export interface ProgramRequestRecord {
  rowIndex?: number;
  requestId: string;
  requestedAt: string;
  registrationId: string;
  studentName: string;
  currentProgramId?: string;
  targetProgramCardId: string;
  targetProgramTitle: string;
  targetProgramId?: string;
  status: ProgramRequestStatus;
  statusLabel: string;
  studentNote?: string;
  adminNotes?: string;
}




