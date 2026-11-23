import type {
  StoreBanner,
  StoreCategory,
  StoreCityZone,
  StoreCoupon,
  StoreProduct,
  StorePublicData,
  StoreSettings,
} from '../types';
import heroCalligraphyAtelierImg from '../assets/images/hero_calligraphy_atelier_1795243897105.jpg';
import heroNukhbaBannerImg from '../assets/images/hero_nukhba_banner_1795253789582.jpg';
import prodAharPaperImg from '../assets/images/product_ahar_paper_1795243896080.jpg';
import prodBambooQalamImg from '../assets/images/product_bamboo_qalam_1795243896890.jpg';
import prodCourseCurriculumImg from '../assets/images/product_course_curriculum_1795243897155.jpg';
import prodInkwellSetImg from '../assets/images/product_inkwell_set_1795243896765.jpg';
import prodLeatherSleeveImg from '../assets/images/product_leather_sleeve_1795253789520.jpg';
import prodSmartDeskLampImg from '../assets/images/product_smart_desk_lamp_1795253790257.jpg';

export const DEFAULT_STORE_HERO_IMAGE = heroCalligraphyAtelierImg;
export const DEFAULT_STORE_BANNER_IMAGE = heroNukhbaBannerImg;

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  store_name: 'متجر فصيح لأدوات الخط والقرطاسية',
  store_tagline: 'أقلام القصب، الورق المقهر، أطقم الحبر الطبيعي، ومستلزمات المكتب والتدريب المختارة بعناية.',
  currency: 'ر.س',
  default_delivery_fee: 25,
  free_shipping_min: 450,
  whatsapp: '',
  telegram_username: '',
  bank_name: 'مصرف الراجحي',
  bank_account_name: 'مؤسسة فصيح للتعليم والخط العربي',
  bank_iban: 'SA0380000000608010167519',
  cod_enabled: true,
  bank_transfer_enabled: true,
  announcement_text: 'شحن مجاني للطلبات فوق 450 ر.س · استلم تأكيد طلبك وتتبع حالة التجهيز عبر تيليجرام',
  notify_telegram_on_order: true,
};

export const DEFAULT_STORE_CATEGORIES: StoreCategory[] = [
  {
    id: 'cat_qalam',
    name: 'أقلام القصب والخط',
    slug: 'qalam',
    image_url: prodBambooQalamImg,
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'cat_ink_paper',
    name: 'الحبر والورق المقهر',
    slug: 'ink-paper',
    image_url: prodInkwellSetImg,
    sort_order: 2,
    is_active: true,
  },
  {
    id: 'cat_curriculum',
    name: 'الكراسات والمناهج المطبوعة',
    slug: 'curriculum-books',
    image_url: prodCourseCurriculumImg,
    sort_order: 3,
    is_active: true,
  },
  {
    id: 'cat_studio_gear',
    name: 'مستلزمات المكتب والجلديات',
    slug: 'studio-gear',
    image_url: prodSmartDeskLampImg,
    sort_order: 4,
    is_active: true,
  },
];

export const DEFAULT_STORE_PRODUCTS: StoreProduct[] = [
  {
    id: 'prod_1001',
    category_id: 'cat_qalam',
    name: 'طقم أقلام قصب جاوي وبامبو مقطوطة يدوياً (5 مقاسات)',
    sku: 'FSH-QLM-01',
    description:
      'طقم احترافي يضم 5 أقلام قصب وبامبو معالجة حرارياً ومقطوطة بزاوية دقيقة لخطوط النسخ والرقعة والثلث، مع حافظة قماشية.',
    price: 165,
    compare_at_price: 210,
    stock: 22,
    image_url: prodBambooQalamImg,
    gallery_urls: [heroCalligraphyAtelierImg],
    variants: [
      { label: 'قطّة يمين (عربي تقليدي)', price: 165 },
      { label: 'طقم موسّع (8 مقاسات + سكين بري)', price: 245 },
    ],
    is_featured: true,
    is_active: true,
    created_at: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'prod_1002',
    category_id: 'cat_ink_paper',
    name: 'طقم المحبرة التقليدية بالحبر العربي الأصلي والليقة',
    sku: 'FSH-INK-02',
    description:
      'محبرة خزفية مصقولة مع ليقة حرير طبيعي وزجاجة حبر عربي أسود فاحم ناعم التدفق لا يسيل على الورق المقهر.',
    price: 135,
    compare_at_price: 170,
    stock: 19,
    image_url: prodInkwellSetImg,
    gallery_urls: [],
    variants: [
      { label: 'حبر أسود فاحم (60 مل)', price: 135 },
      { label: 'طقم حبر أسود + بني جوزي (قطعتان)', price: 185 },
    ],
    is_featured: true,
    is_active: true,
    created_at: '2026-11-03T12:00:00.000Z',
  },
  {
    id: 'prod_1003',
    category_id: 'cat_ink_paper',
    name: 'رزمة ورق مقهّر (آهار) فاخر للتمرين واللوحات — 25 ورقة',
    sku: 'FSH-PPR-03',
    description:
      'ورق مقهر يدوياً بالنشا وبياض البيض يمنح القلم انزلاقاً سلساً وقابلية التصحيح بالمسح دون تلف الألياف.',
    price: 120,
    compare_at_price: null,
    stock: 28,
    image_url: prodAharPaperImg,
    gallery_urls: [],
    variants: [
      { label: 'مقاس A4 للتمرين اليومي (25 ورقة)', price: 120 },
      { label: 'مقاس A3 للوحات الكاملة (20 ورقة)', price: 175 },
    ],
    is_featured: true,
    is_active: true,
    created_at: '2026-11-04T09:00:00.000Z',
  },
  {
    id: 'prod_1004',
    category_id: 'cat_curriculum',
    name: 'حقيبة المنهج التأسيسي: كراسة أمشق + كتيب المخارج والنطق',
    sku: 'FSH-BK-04',
    description:
      'مطبوعة تعليمية مرافقة لمسارات الأكاديمية تحتوي على شواهد مشروحة بخط واضح وشبكات مسطرة بميزان النقاط.',
    price: 95,
    compare_at_price: 125,
    stock: 35,
    image_url: prodCourseCurriculumImg,
    gallery_urls: [],
    variants: [
      { label: 'نسخة المستوى التمهيدي والمبتدئ', price: 95 },
      { label: 'المجموعة الكاملة (المبتدئ + المتقدم)', price: 165 },
    ],
    is_featured: true,
    is_active: true,
    created_at: '2026-11-05T11:30:00.000Z',
  },
  {
    id: 'prod_1005',
    category_id: 'cat_studio_gear',
    name: 'حافظة أدوات ولابتوب من الجلد الطبيعي المخيط يدوياً',
    sku: 'FSH-LTH-05',
    description:
      'طقم جلد طبيعي فاخر يحمي دفتر المخطوطات والأقلام أو الحاسب المحمول مع محفظة بطاقات مطابقة.',
    price: 310,
    compare_at_price: 360,
    stock: 11,
    image_url: prodLeatherSleeveImg,
    gallery_urls: [],
    variants: [
      { label: '14 بوصة - بني جملي', price: 310 },
      { label: '16 بوصة - بني جملي', price: 345 },
    ],
    is_featured: true,
    is_active: true,
    created_at: '2026-11-06T09:30:00.000Z',
  },
  {
    id: 'prod_1006',
    category_id: 'cat_studio_gear',
    name: 'مصباح مكتب معماري ألمنيوم وخشب بلوط لورش الخط',
    sku: 'FSH-DSK-06',
    description:
      'مصباح عمل بإضاءة دافئة عالية الدقة اللونية مريحة للعين أثناء الكتابة والتدقيق في تفاصيل الحروف.',
    price: 275,
    compare_at_price: 330,
    stock: 7,
    image_url: prodSmartDeskLampImg,
    gallery_urls: [],
    variants: [{ label: 'ألمنيوم وبلوط فاتح', price: null }],
    is_featured: true,
    is_active: true,
    created_at: '2026-11-08T14:15:00.000Z',
  },
];

export const DEFAULT_STORE_BANNERS: StoreBanner[] = [
  {
    id: 'ban_1',
    title: 'أدوات الخط العربي الأصيلة ومناهج التدريب المعتمدة',
    subtitle: 'اقتنِ مستلزمات التطبيق العملي أو التحق بالبرامج التدريبية المرتبطة بحسابك التعليمي مباشرة.',
    image_url: heroCalligraphyAtelierImg,
    link_url: '#catalog',
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'ban_2',
    title: 'تجهيز بيئة الدراسة والكتابة الهادئة',
    subtitle: 'خامات طبيعية منتقاة بعناية تصلك لباب منزلك مع تتبع فوري للطلبات.',
    image_url: heroNukhbaBannerImg,
    link_url: '#programs',
    sort_order: 2,
    is_active: false,
  },
];

export const DEFAULT_STORE_CITIES: StoreCityZone[] = [
  {
    id: 'city_riyadh',
    name: 'الرياض',
    delivery_fee: 18,
    estimated_days: '24 - 48 ساعة',
    free_shipping_min: 350,
    is_active: true,
  },
  {
    id: 'city_jeddah',
    name: 'جدة ومكة',
    delivery_fee: 22,
    estimated_days: '2 - 3 أيام',
    free_shipping_min: 400,
    is_active: true,
  },
  {
    id: 'city_dammam',
    name: 'الدمام والخبر',
    delivery_fee: 24,
    estimated_days: '2 - 3 أيام',
    free_shipping_min: 450,
    is_active: true,
  },
  {
    id: 'city_other',
    name: 'باقي المدن / الشحن الدولي',
    delivery_fee: 32,
    estimated_days: '3 - 6 أيام',
    free_shipping_min: 600,
    is_active: true,
  },
];

export const DEFAULT_STORE_COUPONS: StoreCoupon[] = [
  {
    id: 'coup_1',
    code: 'FASEEH10',
    discount_type: 'percent',
    discount_value: 10,
    min_order: 100,
    max_uses: 500,
    used_count: 0,
    expires_at: '2027-12-31',
    is_active: true,
  },
];

export const DEFAULT_STORE_DATA: StorePublicData = {
  settings: DEFAULT_STORE_SETTINGS,
  categories: DEFAULT_STORE_CATEGORIES,
  products: DEFAULT_STORE_PRODUCTS,
  banners: DEFAULT_STORE_BANNERS,
  cities: DEFAULT_STORE_CITIES,
  coupons: DEFAULT_STORE_COUPONS,
  orders: [],
};
