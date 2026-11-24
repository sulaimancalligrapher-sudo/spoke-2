import {
  PortalContentItem,
  PortalPublicData,
  PortalSectionConfig,
  PortalSettingsConfig,
  PortalSocialChannel,
  PortalUiTextEntry,
  ProgramRequestRecord,
  ProgramRequestStatus,
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
import { SupportedLang } from './translations';
import { getDirectImageUrl } from './mediaUrl';
import heroCalligraphyImg from '../assets/images/academy_hero_calligraphy_1795370348160.jpg';
import aboutStudioImg from '../assets/images/academy_about_studio_1795370349304.jpg';
import galleryArtworkImg from '../assets/images/academy_gallery_artwork_1795370347809.jpg';

const STORAGE_KEY_PORTAL_DATA = 'faseeh_public_portal_data_v1';
const STORAGE_KEY_REG_QUESTIONS = 'faseeh_portal_reg_questions_v1';
const STORAGE_KEY_REG_SUBMISSIONS = 'faseeh_portal_reg_submissions_v1';
const STORAGE_KEY_PROGRAM_REQUESTS = 'faseeh_portal_program_requests_v1';
const STORAGE_KEY_PORTAL_BOT_USER = 'faseeh_portal_bot_username_v1';

export const DEFAULT_PORTAL_SECTIONS: PortalSectionConfig[] = [
  { key: 'hero', label: 'القسم الترحيبي الرئيسي', labelEn: 'Welcome Hero', labelTh: 'หน้าหลักต้อนรับ', enabled: true, sortOrder: 1 },
  { key: 'about', label: 'عن المؤسسة والمنهجية', labelEn: 'About Academy', labelTh: 'เกี่ยวกับสถาบัน', enabled: true, sortOrder: 2 },
  { key: 'programs', label: 'البرامج والمسارات التعليمية', labelEn: 'Training Programs', labelTh: 'หลักสูตรการฝึกอบรม', enabled: true, sortOrder: 3 },
  { key: 'gallery', label: 'معرض الأعمال والصور', labelEn: 'Showcase Gallery', labelTh: 'แกลเลอรีผลงาน', enabled: true, sortOrder: 4 },
  { key: 'videos', label: 'مكتبة الفيديو التعريفية', labelEn: 'Introductory Videos', labelTh: 'วิดีโอแนะนำ', enabled: true, sortOrder: 5 },
  { key: 'contact', label: 'التواصل والاستفسارات', labelEn: 'Contact & Channels', labelTh: 'ติดต่อเรา', enabled: true, sortOrder: 6 },
  { key: 'store_slot', label: 'المتجر الإلكتروني', labelEn: 'Store', labelTh: 'ร้านค้า', enabled: true, sortOrder: 7 },
];

export const DEFAULT_SOCIAL_CHANNELS: PortalSocialChannel[] = [
  { id: 'soc_fb', appName: 'Facebook', iconKey: 'facebook', url: '', enabled: true, sortOrder: 1, showInContact: true, showInFooter: true },
  { id: 'soc_ig', appName: 'Instagram', iconKey: 'instagram', url: '', enabled: true, sortOrder: 2, showInContact: true, showInFooter: true },
  { id: 'soc_yt', appName: 'YouTube', iconKey: 'youtube', url: '', enabled: true, sortOrder: 3, showInContact: true, showInFooter: true },
  { id: 'soc_line', appName: 'LINE', iconKey: 'line', url: '', enabled: true, sortOrder: 4, showInContact: true, showInFooter: true },
];

export const PORTAL_UI_TEXT_METADATA: { key: string; group: string; isButton?: boolean }[] = [
  { key: 'unified_auth_btn', group: 'الدخول والتسجيل الموحد', isButton: true },
  { key: 'unified_auth_title', group: 'الدخول والتسجيل الموحد' },
  { key: 'unified_auth_subtitle', group: 'الدخول والتسجيل الموحد' },
  { key: 'unified_auth_register_btn', group: 'الدخول والتسجيل الموحد', isButton: true },
  { key: 'unified_auth_login_btn', group: 'الدخول والتسجيل الموحد', isButton: true },
  { key: 'hero_badge_suffix', group: 'القسم الترحيبي' },
  { key: 'hero_step_1', group: 'القسم الترحيبي' },
  { key: 'hero_step_2', group: 'القسم الترحيبي' },
  { key: 'hero_step_3', group: 'القسم الترحيبي' },
  { key: 'about_heading', group: 'عن المؤسسة' },
  { key: 'about_subheading', group: 'عن المؤسسة' },
  { key: 'programs_heading', group: 'قسم البرامج' },
  { key: 'programs_subheading', group: 'قسم البرامج' },
  { key: 'programs_header_btn', group: 'قسم البرامج', isButton: true },
  { key: 'gallery_heading', group: 'معرض الأعمال' },
  { key: 'gallery_subheading', group: 'معرض الأعمال' },
  { key: 'videos_heading', group: 'مكتبة الفيديو' },
  { key: 'videos_subheading', group: 'مكتبة الفيديو' },
  { key: 'contact_heading', group: 'تواصل معنا' },
  { key: 'contact_subheading', group: 'تواصل معنا' },
  { key: 'contact_telegram_btn', group: 'تواصل معنا', isButton: true },
];

export const DEFAULT_PORTAL_UI_TEXTS: Record<string, PortalUiTextEntry> = {
  unified_auth_btn: { ar: 'تسجيل', en: 'Access', th: 'เข้าใช้', visible: true },
  unified_auth_title: { ar: 'مرحباً بك في بوابة المنصة', en: 'Welcome to the Academy Portal', th: 'ยินดีต้อนรับสู่พอร์ทัลสถาบัน', visible: true },
  unified_auth_subtitle: {
    ar: 'اختر تسجيل مشترك جديد للبدء الفوري بالمرحلة التمهيدية، أو دخول المشتركين إذا كان لديك رقم تسجيل (ID).',
    en: 'Choose New Subscriber Registration to start immediately, or Subscriber Sign In if you already have a Student ID.',
    th: 'เลือกสมัครสมาชิกใหม่เพื่อเริ่มทันที หรือเข้าสู่ระบบผู้เรียนหากคุณมีรหัสผู้เรียนแล้ว',
    visible: true,
  },
  unified_auth_register_btn: { ar: 'تسجيل مشترك جديد', en: 'New Subscriber Registration', th: 'สมัครสมาชิกใหม่', visible: true },
  unified_auth_login_btn: { ar: 'دخول المشتركين', en: 'Subscriber Sign In', th: 'เข้าสู่ระบบผู้เรียน', visible: true },
  hero_badge_suffix: { ar: 'التسجيل المباشر والصفحة الخاصة', en: 'Direct Onboarding & Training', th: 'การลงทะเบียนและหน้าส่วนตัว', visible: true },
  hero_step_1: { ar: '٠١ · تعبئة الاستمارة واستلام رقم ID فوراً', en: '01 · Complete form & get ID instantly', th: '01 · กรอกแบบฟอร์มและรับรหัสทันที', visible: true },
  hero_step_2: { ar: '٠٢ · دخول مباشر للقسم التمهيدي', en: '02 · Instant access to introductory stage', th: '02 · เข้าสู่ส่วนแนะนำเบื้องต้นทันที', visible: true },
  hero_step_3: { ar: '٠٣ · ترقية من الإدارة لمسارك المخصص', en: '03 · Admin assignment to your track', th: '03 · ผู้ดูแลจัดกลุ่มหลักสูตรให้คุณ', visible: true },
  about_heading: { ar: 'عن المؤسسة ومنهجية التدريب', en: 'About Our Academy & Methodology', th: 'เกี่ยวกับสถาบันและแนวทางการสอน', visible: true },
  about_subheading: {
    ar: 'مسار مترابط يجمع بين التعريف الأكاديمي والتأهيل التمهيدي ثم التدريب المتخصص',
    en: 'Structured educational path combining introductory onboarding and guided training',
    th: 'เส้นทางการเรียนรู้ที่เป็นระบบตั้งแต่ขั้นพื้นฐานจนถึงขั้นสูง',
    visible: true,
  },
  programs_heading: { ar: 'البرامج والمسارات التدريبية', en: 'Training Programs & Tracks', th: 'หลักสูตรและแผนการฝึกอบรม', visible: true },
  programs_subheading: {
    ar: 'سجّل للدخول مباشرة إلى المسار التمهيدي أو اختر البرنامج المطلوب للتقديم عليه',
    en: 'Register for Phase 1 onboarding or apply directly to a specific training track',
    th: 'ลงทะเบียนเพื่อเข้าสู่ขั้นแนะนำ หรือสมัครเข้าสู่หลักสูตรที่ต้องการ',
    visible: true,
  },
  programs_header_btn: { ar: 'التسجيل الآن', en: 'Register Now', th: 'ลงทะเบียนตอนนี้', visible: true },
  gallery_heading: { ar: 'معرض الأعمال والصور', en: 'Showcase Gallery', th: 'แกลเลอรีผลงาน', visible: true },
  gallery_subheading: {
    ar: 'نماذج خطية مختارة ولقطات من مسيرة التعليم والتدريب',
    en: 'Selected calligraphy works and learning studio scenes',
    th: 'ตัวอย่างผลงานคัดลายมือและบรรยากาศการเรียนรู้',
    visible: true,
  },
  videos_heading: { ar: 'مكتبة الفيديو التعريفية', en: 'Introductory Video Library', th: 'คลังวิดีโอแนะนำ', visible: true },
  videos_subheading: {
    ar: 'شروح مرئية موجزة توضح المنهج وطريقة التدريب على المنصة',
    en: 'Short visual walkthroughs explaining the curriculum and training flow',
    th: 'วิดีโอสั้นอธิบายหลักสูตรและวิธีการฝึกฝน',
    visible: true,
  },
  contact_heading: { ar: 'تواصل معنا والانضمام', en: 'Contact & Enrollment', th: 'ติดต่อสอบถามและสมัครเรียน', visible: true },
  contact_subheading: {
    ar: 'للاستفسارات عن البرامج أو متابعة حالة تسجيلك، يسعدنا تواصلك عبر القنوات الرسمية أو المبادرة بالتسجيل الفوري.',
    en: 'Reach out via our official channels or start your instant application right away.',
    th: 'ติดต่อผ่านช่องทางทางการของเรา หรือสมัครเรียนได้ทันที',
    visible: true,
  },
  contact_telegram_btn: { ar: 'تيليغرام', en: 'Telegram', th: 'Telegram', visible: true },
};

export const DEFAULT_PORTAL_SETTINGS: PortalSettingsConfig = {
  academyName: 'أكاديمية فصيح للخط العربي والنطق',
  academyNameEn: 'Faseeh Arabic Calligraphy & Speech Academy',
  academyNameTh: 'สถาบันฟาซีห์ภาษาอาหรับและการคัดลายมือ',
  academyTagline: 'منهجية تدريبية متدرجة تجمع بين أصالة الحرف العربي والتقويم التفاعلي الحديث',
  academyTaglineEn: 'Step-by-step training combining authentic Arabic letterform with modern interactive feedback',
  academyTaglineTh: 'แนวทางการฝึกฝนที่ผสานอักษรอาหรับดั้งเดิมกับการประเมินผลเชิงโต้ตอบสมัยใหม่',
  showHeroOverlay: true,
  logoUrl: '',
  heroTitle: 'إتقان الحرف العربي نطقاً وخطاً بمنهجية أكاديمية متكاملة',
  heroTitleEn: 'Master Arabic Pronunciation & Calligraphy with an Integrated Curriculum',
  heroTitleTh: 'เชี่ยวชาญการออกเสียงและการคัดลายมืออาหรับอย่างเป็นระบบ',
  heroSubtitle:
    'انضم إلى مساراتنا التدريبية التفاعلية التي تبدأ بمرحلة تمهيدية تعريفية لتقييم مستواك، ثم تنتقل بإشراف المعلم إلى المسار التدريبي المخصص لك.',
  heroSubtitleEn:
    'Join our interactive learning tracks starting with an introductory stage before your instructor assigns your specialized program.',
  heroSubtitleTh:
    'เข้าร่วมหลักสูตรเชิงโต้ตอบของเราโดยเริ่มจากขั้นพื้นฐานก่อนที่ผู้สอนจะจัดกลุ่มที่เหมาะสมให้คุณ',
  heroMediaUrl: heroCalligraphyImg,
  announcementEnabled: true,
  announcementText:
    'التسجيل متاح الآن في المرحلة التمهيدية — سجّل بياناتك واحصل مباشرة على رقم دخولك وحسابك التجريبي',
  announcementTextEn:
    'Enrollment is open for Phase 1 Introductory Stage — register now to receive your ID and instant access',
  announcementTextTh:
    'เปิดรับสมัครขั้นแนะนำเบื้องต้นแล้ววันนี้ — ลงทะเบียนเพื่อรับรหัสผู้เรียนและเข้าใช้งานได้ทันที',
  contactEmail: 'info@academy-example.org',
  contactPhone: '+966 50 000 0000',
  contactAddress: '',
  contactHours: 'السبت – الخميس · ٩:٠٠ صباحاً – ٦:٠٠ مساءً',
  telegramBotUsername: '',
  whatsappUrl: '',
  socialChannels: DEFAULT_SOCIAL_CHANNELS,
  stage1DefaultProgramId: DEFAULT_PROGRAM_ID,
  stage1BannerTitle: 'أنت الآن في المرحلة التمهيدية (القسم الافتراضي)',
  stage1BannerBody:
    'تم تفعيل دخولك التجريبي بنجاح. يمكنك الآن استعراض الإرشادات التمهيدية وتجربة النماذج والأسئلة التدريبية المتاحة في هذا القسم لفهم آلية المنصة، ريثما يراجع المشرف بياناتك ويحوّل حسابك إلى مسارك التدريبي المعتمد.',
  adminNotificationEmail: '',
  sendStudentWelcomeEmail: true,
  notifyAdminTelegramOnRegister: true,
  notifyStudentTelegramOnTransfer: true,
  registrationIdMode: 'random',
  registrationIdLength: 7,
  showStoreNavSlot: true,
  storeSlotTitle: 'المتجر',
  storeSlotTitleEn: 'Store',
  storeSlotTitleTh: 'ร้านค้า',
  storeSlotNote:
    'استعرض أدوات الخط العربي والقرطاسية المختارة والبرامج التدريبية المتخصصة في متجرنا المتكامل مع تتبع فوري للطلبات.',
  storeSlotNoteEn: 'Explore calligraphy supplies, curated stationery, and specialized training tracks in our store.',
  storeSlotNoteTh: 'เลือกชมอุปกรณ์คัดลายมือ เครื่องเขียน และหลักสูตรอบรมเฉพาะทางในร้านค้าของเรา',
  uiTexts: DEFAULT_PORTAL_UI_TEXTS,
  sections: DEFAULT_PORTAL_SECTIONS,
};

export const DEFAULT_PORTAL_ITEMS: PortalContentItem[] = [
  {
    id: 'about_01',
    section: 'about',
    title: 'تعليم تدرّجي بإشراف مباشر',
    titleEn: 'Guided Step-by-Step Instruction',
    titleTh: 'การสอนแบบทีละขั้นตอนพร้อมผู้ดูแล',
    subtitle: 'من الأساسيات إلى الإتقان',
    subtitleEn: 'From Foundations to Mastery',
    subtitleTh: 'จากพื้นฐานสู่ความชำนาญ',
    description:
      'يبدأ كل متعلم بمرحلة تمهيدية واضحة يتعرف خلالها على آلية التمارين والنماذج، قبل أن يوجهه المعلم إلى المجموعة والبرنامج الأنسب لمستواه.',
    mediaUrl: aboutStudioImg,
    badgeText: '٠١ · المنهجية',
    metaPrimary: 'متابعة فردية',
    metaSecondary: 'جداول يومية مرنة',
    actionType: 'scroll_section',
    linkLabel: 'تعرّف على البرامج',
    linkLabelEn: 'Explore Programs',
    linkLabelTh: 'ดูหลักสูตรทั้งหมด',
    linkUrl: '#portal-programs',
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'about_02',
    section: 'about',
    title: 'ستة مسارات تطبيقية متكاملة',
    titleEn: 'Six Integrated Practice Modules',
    titleTh: '6 โหมดฝึกปฏิบัติครบวงจร',
    subtitle: 'نطق · إملاء · وصل · كتابة · تفاعل',
    description:
      'منظومة تدريبية موحدة تربط الاستماع والنطق والكتابة والسبورة التفاعلية وتقارير الأداء النهائية في سجل واحد لكل مشترك.',
    badgeText: '٠٢ · التطبيق',
    metaPrimary: 'تقييم مباشر',
    metaSecondary: 'تقارير PDF معتمدة',
    actionType: 'scroll_section',
    linkLabel: 'شاهد النماذج المرئية',
    linkLabelEn: 'Watch Demos',
    linkLabelTh: 'ดูวิดีโอสาธิต',
    linkUrl: '#portal-videos',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'about_03',
    section: 'about',
    title: 'تواصل فوري عبر بوت تيليغرام',
    titleEn: 'Instant Telegram Feedback',
    titleTh: 'แจ้งเตือนและตรวจงานผ่าน Telegram',
    subtitle: 'تنبيهات وتصحيح مباشر',
    description:
      'بمجرد التسجيل وربط حسابك عبر الرابط المباشر، تصلك إشعارات الدروس وتنبيه الترقية للبرنامج الأساسي وتصحيحات المعلم أولاً بأول.',
    badgeText: '٠٣ · المتابعة',
    metaPrimary: 'إشعارات فورية',
    metaSecondary: 'ربط برقم المشترك',
    actionType: 'open_register',
    linkLabel: 'سجّل وابدأ الآن',
    linkLabelEn: 'Register Now',
    linkLabelTh: 'สมัครเรียนทันที',
    enabled: true,
    sortOrder: 3,
  },
  {
    id: 'prog_card_1',
    section: 'programs',
    title: 'المسار التمهيدي (القسم الافتراضي)',
    titleEn: 'Introductory Track (Default Stage)',
    titleTh: 'หลักสูตรแนะนำเบื้องต้น',
    subtitle: 'المرحلة الأولى فور التسجيل',
    description:
      'يفتح لك فور إرسال استمارة التسجيل؛ يحتوي على إرشادات المنصة ونماذج تجريبية لفهم طريقة التمرين قبل التحويل إلى برنامجك الكامل.',
    mediaUrl: heroCalligraphyImg,
    badgeText: 'دخول فوري بعد التسجيل',
    metaPrimary: 'نماذج وإرشادات',
    metaSecondary: 'تأهيل مبدئي',
    actionType: 'open_register',
    slug: 'intro-stage',
    linkLabel: 'سجّل وابدأ الآن',
    linkLabelEn: 'Register & Start',
    linkLabelTh: 'สมัครและเริ่มทันที',
    enabled: true,
    sortOrder: 1,
    showOnHome: true,
    showInStore: true,
    price: 0,
    format: 'online_live',
    duration: 'تمهيدي مرن',
    startDate: 'دخول فوري',
    instructor: 'فريق الإشراف الأكاديمي',
    seatsTotal: 200,
    seatsLeft: 185,
    syllabus: [
      'التعرف على بيئة المنصة وتجربة تمارين النطق والإملاء',
      'فحص جاهزية الميكروفون والكاميرا للسبورة',
      'التمهيد قبل اعتماد الانتقال للبرنامج الأساسي',
    ],
  },
  {
    id: 'prog_card_2',
    section: 'programs',
    title: 'برنامج المستوى المبتدئ',
    titleEn: 'Beginner Level Program',
    titleTh: 'หลักสูตรระดับเริ่มต้น',
    subtitle: 'المرحلة الثانية · بناء الأساس',
    description:
      'تمارين مركزة لتأسيس مخارج الحروف وتشكيل الكلمات الأساسية والكتابة الموجهة وفق جدول يومي منضبط.',
    mediaUrl: aboutStudioImg,
    badgeText: 'للمشتركين المسجلين',
    metaPrimary: 'تأسيس شامل',
    metaSecondary: 'مجموعات يومية',
    actionType: 'open_program_request',
    slug: 'beginner-program',
    linkLabel: 'طلب الالتحاق بالبرنامج',
    linkLabelEn: 'Request This Program',
    linkLabelTh: 'ขอเข้าร่วมหลักสูตรนี้',
    enabled: true,
    sortOrder: 2,
    showOnHome: true,
    showInStore: true,
    price: 250,
    compareAtPrice: 320,
    format: 'online_live',
    duration: '4 أسابيع · 16 ساعة',
    startDate: 'تسجيل مستمر',
    instructor: 'أ. سليمان الخطاط',
    seatsTotal: 30,
    seatsLeft: 14,
    syllabus: [
      'ضبط مخارج الحروف الأساسية وتمييز الحركات',
      'تدريبات وصل الحروف وبناء الكلمة على السطر',
      'متابعة يومية عبر تيليغرام وتقارير أداء أسبوعية',
    ],
  },
  {
    id: 'prog_card_3',
    section: 'programs',
    title: 'برنامج المستوى المتقدم',
    titleEn: 'Advanced Level Program',
    titleTh: 'หลักสูตรระดับสูง',
    subtitle: 'المرحلة الثانية · الإتقان والتكامل',
    description:
      'منهج مكثف للمتدربين المتقنين يشمل الجمل المركبة، التصحيح الصوتي والبصري الدقيق، وشهادة إتمام بنهاية البرنامج.',
    mediaUrl: galleryArtworkImg,
    badgeText: 'للمشتركين المسجلين',
    metaPrimary: 'مستوى متقدم',
    metaSecondary: 'شهادة وتقرير PDF',
    actionType: 'open_program_request',
    slug: 'advanced-program',
    linkLabel: 'طلب الالتحاق بالبرنامج',
    linkLabelEn: 'Request This Program',
    linkLabelTh: 'ขอเข้าร่วมหลักสูตรนี้',
    enabled: true,
    sortOrder: 3,
    showOnHome: true,
    showInStore: true,
    price: 380,
    compareAtPrice: 480,
    format: 'online_live',
    duration: '6 أسابيع · 24 ساعة',
    startDate: 'الدفعة الجديدة',
    instructor: 'أ. سليمان الخطاط',
    seatsTotal: 25,
    seatsLeft: 9,
    syllabus: [
      'إتقان التراكيب والكتابة الخطية وفق الميزان',
      'التصحيح الفردي بالفيديو والتقييم الصوتي الدقيق',
      'تقرير ختامي شامل وشهادة إتمام معتمدة PDF',
    ],
  },
  {
    id: 'gal_01',
    section: 'gallery',
    title: 'مخطوطات وتطبيقات الخط الكلاسيكي',
    titleEn: 'Classical Calligraphy Manuscripts',
    titleTh: 'ผลงานคัดลายมือคลาสสิก',
    subtitle: 'نماذج تدريبية وخطوط عربية أصيلة',
    description: 'لقطات من بيئة التدريب والنماذج اليدوية المعتمدة في مسارات الأكاديمية.',
    mediaUrl: galleryArtworkImg,
    galleryImages: [galleryArtworkImg, heroCalligraphyImg, aboutStudioImg],
    badgeText: 'لوحات ونماذج',
    metaPrimary: 'معرض الأكاديمية',
    enabled: true,
    sortOrder: 1,
  },
  {
    id: 'gal_02',
    section: 'gallery',
    title: 'أدوات الخطاط وورشة العمل',
    titleEn: 'Calligrapher Tools & Studio',
    titleTh: 'อุปกรณ์และสตูดิโอฝึกหัด',
    subtitle: 'أقلام القصب والحبر والورق المصقول',
    description: 'تهيئة الطالب لاختيار الأدوات المناسبة وضبط الجلسة والزاوية الصحيحة للكتابة.',
    mediaUrl: heroCalligraphyImg,
    galleryImages: [heroCalligraphyImg, aboutStudioImg],
    badgeText: 'أدوات وورش',
    metaPrimary: 'تطبيق عملي',
    enabled: true,
    sortOrder: 2,
  },
  {
    id: 'gal_03',
    section: 'gallery',
    title: 'قاعات الدرس والتوجيه المباشر',
    titleEn: 'Guided Study Studio',
    titleTh: 'บรรยากาศการเรียนการสอน',
    subtitle: 'بيئة تعليمية هادئة ومهيأة',
    description: 'الجمع بين الدراسة المنضبطة عن بُعد والمتابعة الرقمية المستمرة.',
    mediaUrl: aboutStudioImg,
    galleryImages: [aboutStudioImg, galleryArtworkImg],
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
    id: 'q_email',
    label: 'البريد الإلكتروني (لإرسال بيانات الدخول ورقم التسجيل)',
    labelEn: 'Email Address (to receive your ID & access link)',
    labelTh: 'อีเมล (สำหรับรับรหัสผู้เรียนและลิงก์เข้าใช้งาน)',
    type: 'email',
    required: true,
    placeholder: 'name@example.com',
    enabled: true,
    sortOrder: 2,
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

  // Merge socialChannels (migrate legacy whatsappUrl once if no socialChannels present yet)
  let mergedChannels: PortalSocialChannel[];
  if (Array.isArray(s.socialChannels)) {
    mergedChannels = s.socialChannels
      .map((ch, idx) => ({
        id: String(ch.id || `soc_${idx + 1}`),
        appName: String(ch.appName || '').trim() || 'Link',
        iconKey: ch.iconKey || 'globe',
        iconUrl: ch.iconUrl ? String(ch.iconUrl).trim() : undefined,
        url: String(ch.url || '').trim(),
        enabled: ch.enabled !== false,
        sortOrder: Number(ch.sortOrder) || idx + 1,
        showInContact: ch.showInContact !== false,
        showInFooter: ch.showInFooter !== false,
      }))
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  } else {
    mergedChannels = DEFAULT_SOCIAL_CHANNELS.map((c) => ({ ...c }));
    if (s.whatsappUrl && s.whatsappUrl.trim()) {
      mergedChannels.push({
        id: 'soc_wa_legacy',
        appName: 'WhatsApp',
        iconKey: 'whatsapp',
        url: s.whatsappUrl.trim(),
        enabled: true,
        sortOrder: mergedChannels.length + 1,
        showInContact: true,
        showInFooter: true,
      });
    }
  }

  // Merge uiTexts cleanly so new keys always get safe defaults
  const mergedUiTexts: Record<string, PortalUiTextEntry> = {};
  Object.keys(DEFAULT_PORTAL_UI_TEXTS).forEach((k) => {
    const defEntry = DEFAULT_PORTAL_UI_TEXTS[k];
    const customEntry = s.uiTexts && s.uiTexts[k];
    mergedUiTexts[k] = customEntry
      ? {
          ar:
            k === 'unified_auth_btn' && String(customEntry.ar || '').trim() === 'الدخول والتسجيل'
              ? defEntry.ar
              : customEntry.ar !== undefined
              ? String(customEntry.ar)
              : defEntry.ar,
          en:
            k === 'unified_auth_btn' && String(customEntry.en || '').trim() === 'Sign In / Register'
              ? defEntry.en
              : customEntry.en !== undefined
              ? String(customEntry.en)
              : defEntry.en,
          th:
            k === 'unified_auth_btn' && String(customEntry.th || '').trim() === 'เข้าสู่ระบบ / สมัครเรียน'
              ? defEntry.th
              : customEntry.th !== undefined
              ? String(customEntry.th)
              : defEntry.th,
          visible: customEntry.visible !== undefined ? Boolean(customEntry.visible) : defEntry.visible !== false,
        }
      : { ...defEntry };
  });

  const settings: PortalSettingsConfig = {
    ...DEFAULT_PORTAL_SETTINGS,
    ...s,
    showHeroOverlay: s.showHeroOverlay !== undefined ? Boolean(s.showHeroOverlay) : true,
    sendStudentWelcomeEmail:
      s.sendStudentWelcomeEmail !== undefined ? Boolean(s.sendStudentWelcomeEmail) : true,
    registrationIdMode: s.registrationIdMode === 'sequential' ? 'sequential' : 'random',
    registrationIdLength:
      s.registrationIdLength && [5, 6, 7, 8].includes(Number(s.registrationIdLength))
        ? Number(s.registrationIdLength)
        : 7,
    heroMediaUrl: s.heroMediaUrl !== undefined ? s.heroMediaUrl : DEFAULT_PORTAL_SETTINGS.heroMediaUrl,
    contactAddress: s.contactAddress !== undefined ? String(s.contactAddress) : DEFAULT_PORTAL_SETTINGS.contactAddress,
    contactPhone: s.contactPhone !== undefined ? String(s.contactPhone) : DEFAULT_PORTAL_SETTINGS.contactPhone,
    contactEmail: s.contactEmail !== undefined ? String(s.contactEmail) : DEFAULT_PORTAL_SETTINGS.contactEmail,
    contactHours: s.contactHours !== undefined ? String(s.contactHours) : DEFAULT_PORTAL_SETTINGS.contactHours,
    socialChannels: mergedChannels,
    uiTexts: mergedUiTexts,
    sections: mergedSections,
  };

  const rawItems = Array.isArray(raw?.items) ? raw.items : DEFAULT_PORTAL_ITEMS;
  const items: PortalContentItem[] = rawItems.map((it, idx) => {
    const cleanGallery = Array.isArray(it.galleryImages)
      ? it.galleryImages.map((u) => String(u || '').trim()).filter(Boolean)
      : [];
    const primaryMedia = it.mediaUrl ? String(it.mediaUrl).trim() : cleanGallery[0] || undefined;
    const defaultAction =
      it.section === 'programs'
        ? idx === 0 || String(it.id || '').includes('1')
          ? 'open_register'
          : 'open_program_request'
        : undefined;

    return {
      id: String(it.id || `pitem_${idx + 1}`),
      section: it.section || 'about',
      title: String(it.title || '').trim(),
      titleEn: it.titleEn ? String(it.titleEn).trim() : undefined,
      titleTh: it.titleTh ? String(it.titleTh).trim() : undefined,
      subtitle: it.subtitle ? String(it.subtitle).trim() : undefined,
      subtitleEn: it.subtitleEn ? String(it.subtitleEn).trim() : undefined,
      subtitleTh: it.subtitleTh ? String(it.subtitleTh).trim() : undefined,
      description: String(it.description || '').trim(),
      descriptionEn: it.descriptionEn ? String(it.descriptionEn).trim() : undefined,
      descriptionTh: it.descriptionTh ? String(it.descriptionTh).trim() : undefined,
      mediaUrl: primaryMedia,
      galleryImages: cleanGallery.length > 0 ? cleanGallery : primaryMedia && it.section === 'gallery' ? [primaryMedia] : undefined,
      thumbnailUrl: it.thumbnailUrl ? String(it.thumbnailUrl).trim() : undefined,
      linkUrl: it.linkUrl ? String(it.linkUrl).trim() : undefined,
      linkLabel: it.linkLabel ? String(it.linkLabel).trim() : undefined,
      linkLabelEn: it.linkLabelEn ? String(it.linkLabelEn).trim() : undefined,
      linkLabelTh: it.linkLabelTh ? String(it.linkLabelTh).trim() : undefined,
      badgeText: it.badgeText ? String(it.badgeText).trim() : undefined,
      badgeTextEn: it.badgeTextEn ? String(it.badgeTextEn).trim() : undefined,
      badgeTextTh: it.badgeTextTh ? String(it.badgeTextTh).trim() : undefined,
      metaPrimary: it.metaPrimary ? String(it.metaPrimary).trim() : undefined,
      metaPrimaryEn: it.metaPrimaryEn ? String(it.metaPrimaryEn).trim() : undefined,
      metaPrimaryTh: it.metaPrimaryTh ? String(it.metaPrimaryTh).trim() : undefined,
      metaSecondary: it.metaSecondary ? String(it.metaSecondary).trim() : undefined,
      metaSecondaryEn: it.metaSecondaryEn ? String(it.metaSecondaryEn).trim() : undefined,
      metaSecondaryTh: it.metaSecondaryTh ? String(it.metaSecondaryTh).trim() : undefined,
      actionType: it.actionType || defaultAction,
      slug: it.slug ? String(it.slug).trim() : undefined,
      targetProgramId: it.targetProgramId ? String(it.targetProgramId).trim() : undefined,
      enabled: it.enabled !== false,
      sortOrder: Number(it.sortOrder) || idx + 1,
      showOnHome: it.showOnHome !== undefined ? Boolean(it.showOnHome) : undefined,
      showInStore: it.showInStore !== undefined ? Boolean(it.showInStore) : undefined,
      price: it.price !== undefined && it.price !== null ? Math.max(0, Number(it.price) || 0) : undefined,
      compareAtPrice:
        it.compareAtPrice !== undefined && it.compareAtPrice !== null && Number(it.compareAtPrice) > 0
          ? Number(it.compareAtPrice)
          : null,
      format: it.format || undefined,
      duration: it.duration ? String(it.duration).trim() : undefined,
      startDate: it.startDate ? String(it.startDate).trim() : undefined,
      instructor: it.instructor ? String(it.instructor).trim() : undefined,
      seatsTotal:
        it.seatsTotal !== undefined && it.seatsTotal !== null ? Math.max(0, Number(it.seatsTotal) || 0) : undefined,
      seatsLeft:
        it.seatsLeft !== undefined && it.seatsLeft !== null ? Math.max(0, Number(it.seatsLeft) || 0) : undefined,
      syllabus: Array.isArray(it.syllabus) ? it.syllabus.map((x) => String(x || '').trim()).filter(Boolean) : undefined,
      recommendedProductIds: Array.isArray(it.recommendedProductIds)
        ? it.recommendedProductIds.map((x) => String(x || '').trim()).filter(Boolean)
        : undefined,
    };
  });
  items.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return { settings, items };
}

export function getPortalUiText(
  settings: PortalSettingsConfig,
  key: string,
  lang: SupportedLang,
  fallback?: string
): string {
  const entry = settings.uiTexts?.[key] || DEFAULT_PORTAL_UI_TEXTS[key];
  if (!entry) return fallback || '';
  if (lang === 'en') return (entry.en || entry.ar || fallback || '').trim();
  if (lang === 'th') return (entry.th || entry.en || entry.ar || fallback || '').trim();
  return (entry.ar || fallback || '').trim();
}

export function isPortalUiButtonVisible(settings: PortalSettingsConfig, key: string): boolean {
  const entry = settings.uiTexts?.[key];
  if (!entry) return true;
  return entry.visible !== false;
}

export function getLocalizedPortalSetting(
  settings: PortalSettingsConfig,
  field: 'academyName' | 'academyTagline' | 'heroTitle' | 'heroSubtitle' | 'announcementText' | 'storeSlotTitle' | 'storeSlotNote',
  lang: SupportedLang
): string {
  if (lang === 'en') {
    const enVal = (settings as any)[`${field}En`];
    if (enVal && String(enVal).trim()) return String(enVal).trim();
  }
  if (lang === 'th') {
    const thVal = (settings as any)[`${field}Th`];
    if (thVal && String(thVal).trim()) return String(thVal).trim();
    const enVal = (settings as any)[`${field}En`];
    if (enVal && String(enVal).trim()) return String(enVal).trim();
  }
  return String((settings as any)[field] || '').trim();
}

export function getLocalizedItemField(
  item: PortalContentItem,
  field: 'title' | 'subtitle' | 'description' | 'badgeText' | 'linkLabel' | 'metaPrimary' | 'metaSecondary',
  lang: SupportedLang
): string {
  if (lang === 'en') {
    const enVal = (item as any)[`${field}En`];
    if (enVal && String(enVal).trim()) return String(enVal).trim();
  }
  if (lang === 'th') {
    const thVal = (item as any)[`${field}Th`];
    if (thVal && String(thVal).trim()) return String(thVal).trim();
    const enVal = (item as any)[`${field}En`];
    if (enVal && String(enVal).trim()) return String(enVal).trim();
  }
  return String((item as any)[field] || '').trim();
}

export function getGallerySlideUrls(item: PortalContentItem): string[] {
  const arr = Array.isArray(item.galleryImages) ? item.galleryImages.filter(Boolean) : [];
  if (arr.length > 0) return arr.map((u) => getDirectImageUrl(u)).filter(Boolean);
  if (item.mediaUrl) return [getDirectImageUrl(item.mediaUrl)].filter(Boolean);
  return [];
}

export function getAutoVideoThumbnail(item: PortalContentItem): string {
  if (item.thumbnailUrl && item.thumbnailUrl.trim()) {
    return getDirectImageUrl(item.thumbnailUrl.trim());
  }
  const raw = (item.mediaUrl || item.linkUrl || '').trim();
  if (!raw) return '';
  const ytMatch = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,})/);
  if (ytMatch && ytMatch[1]) {
    return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  }
  return '';
}

export function buildProgramShareUrl(item: PortalContentItem): string {
  const slugOrId = (item.slug || item.id || '').trim();
  if (typeof window === 'undefined' || !slugOrId) return '';
  return `${window.location.origin}${window.location.pathname}#program=${encodeURIComponent(slugOrId)}`;
}

export function buildRegistrationShareUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}#register`;
}

export function buildAccessShareUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}#access`;
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

export function getLocalProgramRequests(): ProgramRequestRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRAM_REQUESTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalProgramRequests(list: ProgramRequestRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROGRAM_REQUESTS, JSON.stringify(list));
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

export function generateLocalRandomRegistrationId(length = 7): string {
  const safeLen = Math.min(8, Math.max(4, Math.floor(length) || 7));
  const min = Math.pow(10, safeLen - 1);
  const max = Math.pow(10, safeLen) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export interface EmailDiagnosisResult {
  success: boolean;
  emailDiagHandled?: boolean;
  scriptVersion?: string;
  mailAuthorized: boolean;
  remainingQuota: number;
  diagnosisCode: 'OK' | 'AUTH_REQUIRED' | 'QUOTA_ZERO' | 'MAIL_ERROR' | 'SCRIPT_OUTDATED' | 'NETWORK_ERROR' | string;
  rawError?: string;
  effectiveUserEmail?: string;
  activeUserEmail?: string;
  scriptTimezone?: string;
  needsScriptUpdate?: boolean;
  message?: string;
}

export async function diagnosePortalEmailStatus(
  webhookUrl: string
): Promise<EmailDiagnosisResult> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (!url.startsWith('http')) {
    return {
      success: false,
      mailAuthorized: false,
      remainingQuota: 0,
      diagnosisCode: 'NETWORK_ERROR',
      message: 'يرجى ربط Google Apps Script Webhook أولاً.',
    };
  }
  try {
    const res = await callGoogleSheetsPost(url, { action: 'diagnose_email_status' });
    const rawRes: any = res;
    const d: any = res.data || {};
    if (d.emailDiagHandled || rawRes.emailDiagHandled) {
      const src: any = d.emailDiagHandled ? d : rawRes;
      return {
        success: Boolean(src.success),
        emailDiagHandled: true,
        scriptVersion: src.scriptVersion || '',
        mailAuthorized: Boolean(src.mailAuthorized),
        remainingQuota: Number(src.remainingQuota || 0),
        diagnosisCode: src.diagnosisCode || 'UNKNOWN',
        rawError: src.rawError ? String(src.rawError) : undefined,
        effectiveUserEmail: src.effectiveUserEmail ? String(src.effectiveUserEmail) : undefined,
        activeUserEmail: src.activeUserEmail ? String(src.activeUserEmail) : undefined,
        scriptTimezone: src.scriptTimezone ? String(src.scriptTimezone) : undefined,
      };
    }
    return {
      success: false,
      mailAuthorized: false,
      remainingQuota: 0,
      diagnosisCode: 'SCRIPT_OUTDATED',
      needsScriptUpdate: true,
      message:
        'الرابط الخلفي الحالي لا يدعم الفحص العميق للبريد بعد — يرجى نسخ الكود المحدث في Google Apps Script ونشر إصدار جديد (New version).',
    };
  } catch (err: any) {
    return {
      success: false,
      mailAuthorized: false,
      remainingQuota: 0,
      diagnosisCode: 'NETWORK_ERROR',
      rawError: err?.message || 'Network error',
      message: err?.message || 'تعذر الاتصال بالسيرفر لفحص حالة البريد.',
    };
  }
}

export async function testPortalWelcomeEmail(
  webhookUrl: string,
  payload: {
    toEmail: string;
    academyName?: string;
    adminNotificationEmail?: string;
  }
): Promise<{
  success: boolean;
  quota?: number;
  quotaBefore?: number;
  diagnosisCode?: string;
  effectiveUserEmail?: string;
  rawError?: string;
  error?: string;
  message: string;
  needsScriptUpdate?: boolean;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const email = (payload.toEmail || '').trim();
  if (!url.startsWith('http')) {
    return { success: false, message: 'يرجى ربط Google Apps Script Webhook أولاً.' };
  }
  if (!email || !email.includes('@')) {
    return { success: false, message: 'يرجى إدخال بريد إلكتروني صحيح للاختبار.' };
  }
  try {
    const res = await callGoogleSheetsPost(url, {
      action: 'test_welcome_email',
      toEmail: email,
      academyName: payload.academyName || 'الأكاديمية التعليمية',
      adminNotificationEmail: payload.adminNotificationEmail || '',
      replyToEmail: payload.adminNotificationEmail || '',
    });
    const d = res.data || {};
    if (d.emailTestHandled) {
      return {
        success: Boolean(res.success),
        quota: d.remainingQuota !== undefined ? Number(d.remainingQuota) : undefined,
        quotaBefore: d.quotaBefore !== undefined ? Number(d.quotaBefore) : undefined,
        diagnosisCode: d.diagnosisCode ? String(d.diagnosisCode) : undefined,
        effectiveUserEmail: d.effectiveUserEmail ? String(d.effectiveUserEmail) : undefined,
        rawError: d.rawError ? String(d.rawError) : undefined,
        error: d.error ? String(d.error) : undefined,
        message:
          d.message ||
          (res.success
            ? 'تم إرسال بريد الاختبار بنجاح! تفقد البريد الوارد أو الرسائل غير المرغوب فيها (Spam).'
            : String(d.error || 'فشل إرسال البريد.')),
      };
    }
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'كود Google Apps Script المنشور لا يحتوي على اختبار البريد بعد — انسخ الكود المحدث وانشر إصداراً جديداً (New version).',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'تعذر الاتصال بالسيرفر لاختبار البريد.',
    };
  }
}

export async function sendCustomAdminEmails(
  webhookUrl: string,
  payload: {
    recipients: { email: string; name?: string; registrationId?: string }[];
    subject: string;
    body: string;
    senderName?: string;
    replyToEmail?: string;
  }
): Promise<{
  success: boolean;
  sentCount?: number;
  failedCount?: number;
  failedList?: { email: string; error: string }[];
  remainingQuota?: number;
  diagnosisCode?: string;
  rawError?: string;
  needsScriptUpdate?: boolean;
  message: string;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (!url.startsWith('http')) {
    return { success: false, message: 'يرجى ربط Google Apps Script Webhook أولاً.' };
  }
  try {
    const res = await callGoogleSheetsPost(url, {
      action: 'send_custom_email',
      recipients: payload.recipients,
      subject: payload.subject,
      body: payload.body,
      senderName: payload.senderName || 'الأكاديمية التعليمية',
      replyToEmail: payload.replyToEmail || '',
    });
    const d = res.data || {};
    if (d.customEmailHandled) {
      return {
        success: Boolean(res.success),
        sentCount: d.sentCount !== undefined ? Number(d.sentCount) : undefined,
        failedCount: d.failedCount !== undefined ? Number(d.failedCount) : undefined,
        failedList: Array.isArray(d.failedList) ? d.failedList : undefined,
        remainingQuota: d.remainingQuota !== undefined ? Number(d.remainingQuota) : undefined,
        diagnosisCode: d.diagnosisCode ? String(d.diagnosisCode) : undefined,
        rawError: d.rawError ? String(d.rawError) : undefined,
        message: d.message || d.error || (res.success ? 'تم الإرسال بنجاح.' : 'تعذر إرسال البريد.'),
      };
    }
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'الرابط الخلفي المنشور لا يدعم الإرسال المخصص بعد — انسخ الكود المحدث في Apps Script وانشر إصداراً جديداً.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'تعذر الاتصال بالسيرفر لإرسال البريد.',
    };
  }
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
    stage1DefaultClassroomId?: string;
  }
): Promise<{
  success: boolean;
  registrationId?: string;
  student?: StudentRegistrant;
  telegramDeepLink?: string;
  botUsername?: string;
  studentEmailSent?: boolean;
  studentEmailError?: string;
  message?: string;
  offlineFallback?: boolean;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const stage1ProgId = payload.settings.stage1DefaultProgramId || DEFAULT_PROGRAM_ID;
  const stage1ProgName = payload.stage1ProgramName || 'القسم الافتراضي (المرحلة التمهيدية)';
  const stage1ClassroomId = (payload.stage1DefaultClassroomId || '').trim();
  const idMode = payload.settings.registrationIdMode === 'sequential' ? 'sequential' : 'random';
  const idLength = payload.settings.registrationIdLength || 7;
  const originBase =
    typeof window !== 'undefined' &&
    window.location.origin &&
    !window.location.origin.startsWith('file')
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
        stage1DefaultClassroomId: stage1ClassroomId,
        stage1ProgramName: stage1ProgName,
        academyName: payload.settings.academyName || '',
        botUsername: payload.settings.telegramBotUsername || getSavedPortalBotUsername(),
        notifyAdminTelegram: payload.settings.notifyAdminTelegramOnRegister !== false,
        adminNotificationEmail: payload.settings.adminNotificationEmail || '',
        sendStudentWelcomeEmail: payload.settings.sendStudentWelcomeEmail !== false,
        registrationIdMode: idMode,
        registrationIdLength: idLength,
        appBaseUrl: originBase,
      });

      if (res.success && res.data?.portalHandled && res.data?.registrationId) {
        const regId = String(res.data.registrationId);
        const resolvedBot = String(
          res.data.botUsername || payload.settings.telegramBotUsername || getSavedPortalBotUsername()
        )
          .replace(/^@/, '')
          .trim();
        if (resolvedBot) savePortalBotUsername(resolvedBot);
        const deepLink =
          String(res.data.telegramDeepLink || '').trim() ||
          buildTelegramBotStartLink(resolvedBot, regId);
        const rawStudent: StudentRegistrant = res.data.student || {
          id: regId,
          name: payload.studentName.trim(),
          status: 'مفعّل',
          maxDevices: 1,
          devices: [],
          requireLocation: false,
          programId: stage1ProgId,
        };
        const student: StudentRegistrant = {
          ...rawStudent,
          telegramDirectUrl: rawStudent.telegramDirectUrl || deepLink || undefined,
          telegramQrImageUrl:
            rawStudent.telegramQrImageUrl ||
            (deepLink
              ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(deepLink)}`
              : undefined),
        };

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
          studentEmailSent: Boolean(res.data.studentEmailSent),
          studentEmailError: res.data.studentEmailError ? String(res.data.studentEmailError) : undefined,
        };
      }

      if (res.success && res.data?.portalHandled !== true) {
        const fallbackId = generateLocalRandomRegistrationId(idLength);
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

  const localId = generateLocalRandomRegistrationId(idLength);
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
    targetClassroomId?: string;
    targetClassroomName?: string;
    stage: RegistrationStage;
    accountStatus?: string;
    adminNotes?: string;
    notifyStudentTelegram?: boolean;
  }
): Promise<{ success: boolean; message: string; tgNotifiedStudent?: boolean; needsScriptUpdate?: boolean }> {
  const clsSuffix = payload.targetClassroomName ? ` — ${payload.targetClassroomName}` : '';
  const local = getLocalRegistrationSubmissions().map((rec) =>
    normalizeDigits(rec.registrationId) === normalizeDigits(payload.registrationId)
      ? {
          ...rec,
          programId: payload.targetProgramId,
          programName: payload.targetProgramName,
          classroomId: payload.targetClassroomId !== undefined ? payload.targetClassroomId : rec.classroomId,
          stage: payload.stage,
          status:
            payload.stage === 'stage2_assigned'
              ? `تم التحويل إلى: ${payload.targetProgramName}${clsSuffix}`
              : payload.stage === 'paused'
              ? 'معلّق / موقوف'
              : `المرحلة 1 - في القسم الافتراضي (${payload.targetProgramName}${clsSuffix})`,
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
      ? `تم التحويل إلى: ${payload.targetProgramName}${clsSuffix}`
      : payload.stage === 'paused'
      ? 'معلّق / موقوف'
      : `المرحلة 1 - في القسم الافتراضي (${payload.targetProgramName}${clsSuffix})`;

  const res = await callGoogleSheetsPost(url, {
    action: 'transfer_registration_stage',
    registrationId: payload.registrationId,
    studentName: payload.studentName,
    targetProgramId: payload.targetProgramId,
    targetProgramName: payload.targetProgramName,
    targetClassroomId: payload.targetClassroomId,
    targetClassroomName: payload.targetClassroomName,
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

// =========================================================================
// طلبات الالتحاق بالبرامج للمشتركين الحاليين (ورقة: "طلبات_البرامج")
// =========================================================================

export async function submitProgramRequestToSheets(
  webhookUrl: string,
  payload: {
    studentName: string;
    studentId: string;
    targetProgramCardId: string;
    targetProgramTitle: string;
    targetProgramId?: string;
    studentNote?: string;
  }
): Promise<{
  success: boolean;
  notFound?: boolean;
  disabled?: boolean;
  requestId?: string;
  student?: StudentRegistrant;
  error?: string;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const cleanName = payload.studentName.trim();
  const cleanId = normalizeDigits(payload.studentId.trim());

  if (!cleanName || !cleanId) {
    return { success: false, error: 'يرجى إدخال الاسم ورقم المشترك (ID) معاً.' };
  }

  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, {
        action: 'submit_program_request',
        studentName: cleanName,
        studentId: cleanId,
        targetProgramCardId: payload.targetProgramCardId,
        targetProgramTitle: payload.targetProgramTitle,
        targetProgramId: payload.targetProgramId || '',
        studentNote: payload.studentNote || '',
      });

      if (res.success && res.data?.portalHandled) {
        const reqId = String(res.data.requestId || `PR-${Date.now().toString().slice(-6)}`);
        const stu: StudentRegistrant = res.data.student || {
          id: cleanId,
          name: cleanName,
          status: 'مفعّل',
          maxDevices: 1,
          devices: [],
        };
        const existingLocal = getLocalProgramRequests();
        saveLocalProgramRequests([
          {
            requestId: reqId,
            requestedAt: new Date().toLocaleString('en-GB'),
            registrationId: stu.id,
            studentName: stu.name,
            currentProgramId: stu.programId,
            targetProgramCardId: payload.targetProgramCardId,
            targetProgramTitle: payload.targetProgramTitle,
            targetProgramId: payload.targetProgramId,
            status: 'pending',
            statusLabel: 'قيد المراجعة',
            studentNote: payload.studentNote,
          },
          ...existingLocal,
        ]);
        return { success: true, requestId: reqId, student: stu };
      }

      if (res.data?.portalHandled) {
        return {
          success: false,
          notFound: Boolean(res.data?.notFound),
          disabled: Boolean(res.data?.disabled),
          error:
            res.error ||
            res.data?.error ||
            'لم نتمكن من مطابقة بيانات المشترك. تأكد من الاسم ورقم الـ ID أو سجّل كمشترك جديد.',
        };
      }
    } catch (e) {
      console.warn('submitProgramRequest error:', e);
    }
  }

  return {
    success: false,
    error: 'تعذر الاتصال بالسيرفر للتحقق من بيانات المشترك. يرجى المحاولة مجدداً.',
  };
}

export async function fetchProgramRequestsFromSheets(webhookUrl: string): Promise<{
  success: boolean;
  requests: ProgramRequestRecord[];
  needsScriptUpdate?: boolean;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, { action: 'get_program_requests' });
      if (res.success && res.data?.portalHandled && Array.isArray(res.data.requests)) {
        const list: ProgramRequestRecord[] = res.data.requests;
        saveLocalProgramRequests(list);
        return { success: true, requests: list };
      }
      if (res.success && res.data?.portalHandled !== true) {
        return {
          success: false,
          requests: getLocalProgramRequests(),
          needsScriptUpdate: true,
        };
      }
    } catch (e) {
      console.warn('Error fetching program requests:', e);
    }
  }
  return { success: false, requests: getLocalProgramRequests() };
}

export async function updateProgramRequestStatusInSheets(
  webhookUrl: string,
  payload: {
    requestId: string;
    rowIndex?: number;
    registrationId: string;
    studentName: string;
    status: ProgramRequestStatus;
    targetProgramId?: string;
    targetProgramName?: string;
    targetClassroomId?: string;
    targetClassroomName?: string;
    adminNotes?: string;
    notifyStudentTelegram?: boolean;
  }
): Promise<{ success: boolean; message: string; tgNotifiedStudent?: boolean; needsScriptUpdate?: boolean }> {
  const statusLabel =
    payload.status === 'approved'
      ? `تمت الموافقة (${payload.targetProgramName || payload.targetProgramId || ''}${payload.targetClassroomName ? ` — ${payload.targetClassroomName}` : ''})`
      : payload.status === 'rejected'
      ? 'مؤجل / مرفوض'
      : 'قيد المراجعة';

  const nextLocal = getLocalProgramRequests().map((req) =>
    req.requestId === payload.requestId
      ? {
          ...req,
          status: payload.status,
          statusLabel,
          targetProgramId: payload.targetProgramId || req.targetProgramId,
          targetClassroomId: payload.targetClassroomId !== undefined ? payload.targetClassroomId : req.targetClassroomId,
          adminNotes: payload.adminNotes !== undefined ? payload.adminNotes : req.adminNotes,
        }
      : req
  );
  saveLocalProgramRequests(nextLocal);

  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم التحديث محلياً.' };
  }

  const res = await callGoogleSheetsPost(url, {
    action: 'update_program_request_status',
    requestId: payload.requestId,
    rowIndex: payload.rowIndex,
    registrationId: payload.registrationId,
    studentName: payload.studentName,
    status: payload.status,
    statusLabel,
    targetProgramId: payload.targetProgramId || '',
    targetProgramName: payload.targetProgramName || payload.targetProgramId || '',
    targetClassroomId: payload.targetClassroomId,
    targetClassroomName: payload.targetClassroomName,
    adminNotes: payload.adminNotes,
    notifyStudentTelegram: payload.notifyStudentTelegram !== false,
  });

  if (!res.success) {
    return { success: false, message: res.error || 'تعذر تحديث طلب البرنامج في Google Sheets.' };
  }
  if (res.data?.portalHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'تم الحفظ محلياً، يرجى تحديث نشر Google Apps Script لتفعيل ورقة طلبات_البرامج.',
    };
  }
  return {
    success: true,
    tgNotifiedStudent: Boolean(res.data?.tgNotifiedStudent),
    message: res.message || 'تم تحديث حالة طلب البرنامج بنجاح!',
  };
}

export async function deleteProgramRequestInSheets(
  webhookUrl: string,
  requestId: string,
  rowIndex?: number
): Promise<{ success: boolean; message: string }> {
  const nextLocal = getLocalProgramRequests().filter((r) => r.requestId !== requestId);
  saveLocalProgramRequests(nextLocal);

  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم الحذف محلياً.' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'delete_program_request',
    requestId,
    rowIndex,
  });
  return {
    success: res.success,
    message: res.message || (res.success ? 'تم حذف طلب البرنامج بنجاح.' : res.error || 'تعذر الحذف.'),
  };
}
