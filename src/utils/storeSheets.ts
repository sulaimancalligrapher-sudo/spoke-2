import type {
  PortalPublicData,
  ProgramRequestRecord,
  StoreBanner,
  StoreCartEntry,
  StoreCategory,
  StoreCityZone,
  StoreCoupon,
  StoreOrder,
  StoreOrderStatus,
  StorePaymentMethod,
  StoreProduct,
  StoreProductVariantOption,
  StorePublicData,
  StoreSettings,
  StudentRegistrant,
} from '../types';
import {
  callGoogleSheetsPost,
  DEFAULT_WEBHOOK_URL,
  normalizeDigits,
} from './googleSheets';
import {
  DEFAULT_STORE_DATA,
  DEFAULT_STORE_HERO_IMAGE,
  DEFAULT_STORE_SETTINGS,
} from './storeSeed';
import {
  getLocalProgramRequests,
  saveLocalProgramRequests,
} from './portalSheets';
import { getDirectImageUrl } from './mediaUrl';

const STORAGE_KEY_STORE_DATA = 'faseeh_store_data_v1';
const STORAGE_KEY_STORE_CART = 'faseeh_store_cart_v1';
const STORAGE_KEY_STORE_FAVORITES = 'faseeh_store_favorites_v1';
const STORAGE_KEY_STORE_SAVED_ORDERS = 'faseeh_store_orders_v1';

// =========================================================================
// Variant & Price Helpers (Single Source of Variant Pricing)
// =========================================================================

export function parseProductVariants(raw: unknown): StoreProductVariantOption[] {
  if (!raw) return [];
  let list: unknown[] = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else {
      list = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  const out: StoreProductVariantOption[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    let label = '';
    let price: number | null = null;

    if (typeof item === 'string') {
      const pipeIdx = item.indexOf('|');
      if (pipeIdx > -1) {
        label = item.slice(0, pipeIdx).trim();
        const pNum = Number(item.slice(pipeIdx + 1).trim());
        price = !Number.isNaN(pNum) && pNum >= 0 ? pNum : null;
      } else {
        label = item.trim();
      }
    } else if (item && typeof item === 'object') {
      const obj = item as { label?: unknown; price?: unknown };
      label = String(obj.label || '').trim();
      if (obj.price !== null && obj.price !== undefined && obj.price !== '') {
        const pNum = Number(obj.price);
        if (!Number.isNaN(pNum) && pNum >= 0) price = pNum;
      }
    }

    if (label && !seen.has(label)) {
      seen.add(label);
      out.push({ label, price });
    }
  }

  return out;
}

export function resolveVariantUnitPrice(
  product: Pick<StoreProduct, 'price' | 'variants'>,
  variantLabel: string
): number {
  const basePrice = Math.max(0, Number(product.price) || 0);
  if (!variantLabel || !Array.isArray(product.variants)) return basePrice;
  const matched = product.variants.find((v) => v.label.trim() === variantLabel.trim());
  if (matched && matched.price !== null && matched.price !== undefined && !Number.isNaN(Number(matched.price))) {
    return Math.max(0, Number(matched.price));
  }
  return basePrice;
}

export function getProductPriceSummary(product: Pick<StoreProduct, 'price' | 'variants'>): {
  defaultPrice: number;
  minPrice: number;
  maxPrice: number;
  hasRange: boolean;
} {
  const basePrice = Math.max(0, Number(product.price) || 0);
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    return { defaultPrice: basePrice, minPrice: basePrice, maxPrice: basePrice, hasRange: false };
  }
  const prices = product.variants.map((v) =>
    v.price !== null && v.price !== undefined && !Number.isNaN(Number(v.price))
      ? Math.max(0, Number(v.price))
      : basePrice
  );
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  return {
    defaultPrice: prices[0] ?? basePrice,
    minPrice,
    maxPrice,
    hasRange: minPrice !== maxPrice,
  };
}

export function resolveStoreImageUrl(raw?: string): string {
  const s = (raw || '').trim();
  if (!s) return DEFAULT_STORE_HERO_IMAGE;
  return getDirectImageUrl(s) || DEFAULT_STORE_HERO_IMAGE;
}

// =========================================================================
// Data Normalization & Local Persistence
// =========================================================================

export function normalizeStoreData(raw?: Partial<StorePublicData> | null): StorePublicData {
  const s = (raw?.settings || {}) as Partial<StoreSettings>;
  const settings: StoreSettings = {
    ...DEFAULT_STORE_SETTINGS,
    ...s,
    default_delivery_fee: Math.max(0, Number(s.default_delivery_fee ?? DEFAULT_STORE_SETTINGS.default_delivery_fee) || 0),
    free_shipping_min: Math.max(0, Number(s.free_shipping_min ?? DEFAULT_STORE_SETTINGS.free_shipping_min) || 0),
    cod_enabled: s.cod_enabled !== undefined ? Boolean(s.cod_enabled) : true,
    bank_transfer_enabled: s.bank_transfer_enabled !== undefined ? Boolean(s.bank_transfer_enabled) : true,
    notify_telegram_on_order:
      s.notify_telegram_on_order !== undefined ? Boolean(s.notify_telegram_on_order) : true,
  };

  const categories: StoreCategory[] = (
    Array.isArray(raw?.categories) && raw.categories.length > 0
      ? raw.categories
      : DEFAULT_STORE_DATA.categories
  ).map((c, idx) => ({
    id: String(c.id || `cat_${idx + 1}`),
    name: String(c.name || '').trim() || 'قسم',
    slug: String(c.slug || `cat-${idx + 1}`).trim(),
    image_url: String(c.image_url || '').trim(),
    sort_order: Number(c.sort_order) || idx + 1,
    is_active: c.is_active !== false,
  }));

  const products: StoreProduct[] = (
    Array.isArray(raw?.products) && raw.products.length > 0
      ? raw.products
      : DEFAULT_STORE_DATA.products
  ).map((p, idx) => ({
    id: String(p.id || `prod_${idx + 1}`),
    category_id: String(p.category_id || categories[0]?.id || 'cat_qalam'),
    name: String(p.name || '').trim() || 'منتج',
    sku: String(p.sku || `SKU-${idx + 1}`).trim(),
    description: String(p.description || ''),
    price: Math.max(0, Number(p.price) || 0),
    compare_at_price:
      p.compare_at_price !== null && p.compare_at_price !== undefined && Number(p.compare_at_price) > 0
        ? Number(p.compare_at_price)
        : null,
    stock: Math.max(0, Number(p.stock ?? 0) || 0),
    image_url: String(p.image_url || '').trim(),
    gallery_urls: Array.isArray(p.gallery_urls) ? p.gallery_urls.map((u) => String(u || '').trim()).filter(Boolean) : [],
    variants: parseProductVariants(p.variants),
    is_featured: Boolean(p.is_featured),
    is_active: p.is_active !== false,
    created_at: String(p.created_at || new Date().toISOString()),
  }));

  const banners: StoreBanner[] = (
    Array.isArray(raw?.banners) && raw.banners.length > 0
      ? raw.banners
      : DEFAULT_STORE_DATA.banners
  ).map((b, idx) => ({
    id: String(b.id || `ban_${idx + 1}`),
    title: String(b.title || ''),
    subtitle: String(b.subtitle || ''),
    image_url: String(b.image_url || ''),
    link_url: String(b.link_url || '#catalog'),
    sort_order: Number(b.sort_order) || idx + 1,
    is_active: b.is_active !== false,
  }));

  const cities: StoreCityZone[] = (
    Array.isArray(raw?.cities) && raw.cities.length > 0
      ? raw.cities
      : DEFAULT_STORE_DATA.cities
  ).map((c, idx) => ({
    id: String(c.id || `city_${idx + 1}`),
    name: String(c.name || '').trim() || 'المدينة',
    delivery_fee: Math.max(0, Number(c.delivery_fee) || 0),
    estimated_days: String(c.estimated_days || '2 - 4 أيام'),
    free_shipping_min: Math.max(0, Number(c.free_shipping_min) || 0),
    is_active: c.is_active !== false,
  }));

  const coupons: StoreCoupon[] = (
    Array.isArray(raw?.coupons) && raw.coupons.length > 0
      ? raw.coupons
      : DEFAULT_STORE_DATA.coupons
  ).map((c, idx) => ({
    id: String(c.id || `coup_${idx + 1}`),
    code: String(c.code || '').trim().toUpperCase(),
    discount_type: c.discount_type === 'fixed' ? 'fixed' : 'percent',
    discount_value: Math.max(0, Number(c.discount_value) || 0),
    min_order: Math.max(0, Number(c.min_order) || 0),
    max_uses: Math.max(0, Number(c.max_uses) || 0),
    used_count: Math.max(0, Number(c.used_count) || 0),
    expires_at: String(c.expires_at || ''),
    is_active: c.is_active !== false,
  }));

  const orders: StoreOrder[] = Array.isArray(raw?.orders) ? raw.orders : [];

  return { settings, categories, products, banners, cities, coupons, orders };
}

export function getLocalStoreData(): StorePublicData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STORE_DATA);
    if (raw) return normalizeStoreData(JSON.parse(raw));
  } catch {}
  return normalizeStoreData(DEFAULT_STORE_DATA);
}

export function saveLocalStoreData(data: StorePublicData): void {
  try {
    localStorage.setItem(STORAGE_KEY_STORE_DATA, JSON.stringify(normalizeStoreData(data)));
  } catch {}
}

export function getLocalStoreCart(): StoreCartEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STORE_CART);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalStoreCart(items: StoreCartEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_STORE_CART, JSON.stringify(items));
  } catch {}
}

export function getLocalStoreFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STORE_FAVORITES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalStoreFavorites(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_STORE_FAVORITES, JSON.stringify(ids));
  } catch {}
}

export function getLocalSavedStoreOrders(): StoreOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STORE_SAVED_ORDERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalSavedStoreOrders(orders: StoreOrder[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_STORE_SAVED_ORDERS, JSON.stringify(orders));
  } catch {}
}

// =========================================================================
// Coupon & Delivery Calculation Helper
// =========================================================================

export function evaluateStoreCoupon(
  coupons: StoreCoupon[],
  code: string,
  subtotal: number,
  currency: string
): { valid: boolean; discount: number; normalizedCode: string; message: string } {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { valid: false, discount: 0, normalizedCode: '', message: 'يرجى إدخال كود الكوبون.' };
  }
  const coupon = coupons.find((c) => c.code.trim().toUpperCase() === cleanCode);
  if (!coupon || !coupon.is_active) {
    return { valid: false, discount: 0, normalizedCode: cleanCode, message: 'كود الخصم غير صالح أو متوقف.' };
  }
  if (coupon.expires_at) {
    const expTime = new Date(coupon.expires_at).getTime();
    if (!Number.isNaN(expTime) && Date.now() > expTime + 86400000) {
      return { valid: false, discount: 0, normalizedCode: cleanCode, message: 'انتهت صلاحية هذا الكوبون.' };
    }
  }
  if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
    return { valid: false, discount: 0, normalizedCode: cleanCode, message: 'تم استنفاد الحد الأقصى لاستخدام الكوبون.' };
  }
  if (subtotal < coupon.min_order) {
    return {
      valid: false,
      discount: 0,
      normalizedCode: cleanCode,
      message: `الحد الأدنى لتطبيق الكوبون هو ${coupon.min_order} ${currency}.`,
    };
  }
  const rawDiscount =
    coupon.discount_type === 'percent'
      ? Math.round((subtotal * coupon.discount_value) / 100)
      : coupon.discount_value;
  const discount = Math.min(subtotal, Math.max(0, rawDiscount));
  return {
    valid: true,
    discount,
    normalizedCode: cleanCode,
    message: `تم تطبيق خصم ${discount} ${currency}`,
  };
}

// =========================================================================
// Google Sheets Synchronization Endpoints
// =========================================================================

export async function fetchStoreDataFromSheets(
  webhookUrl: string,
  includeAdminData = false
): Promise<{
  success: boolean;
  data: StorePublicData;
  telegramConfigured?: boolean;
  botUsername?: string;
  needsScriptUpdate?: boolean;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, {
        action: 'get_store_data',
        includeAdminData,
      });
      if (res.success && res.data?.storeHandled && res.data?.storeData) {
        const normalized = normalizeStoreData(res.data.storeData);
        saveLocalStoreData(normalized);
        return {
          success: true,
          data: normalized,
          telegramConfigured: Boolean(res.data.telegramConfigured),
          botUsername: String(res.data.botUsername || '').replace(/^@/, '').trim(),
        };
      }
      if (res.success && res.data?.storeHandled !== true) {
        return {
          success: false,
          data: getLocalStoreData(),
          needsScriptUpdate: true,
        };
      }
    } catch (e) {
      console.warn('Error fetching store data from Sheets:', e);
    }
  }
  return { success: false, data: getLocalStoreData() };
}

export async function saveStoreDataToSheets(
  webhookUrl: string,
  storeData: StorePublicData
): Promise<{ success: boolean; message: string; needsScriptUpdate?: boolean }> {
  const normalized = normalizeStoreData(storeData);
  saveLocalStoreData(normalized);

  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم حفظ بيانات المتجر محلياً (أضف رابط Google Sheets لمزامنة السحابة).' };
  }

  const res = await callGoogleSheetsPost(url, {
    action: 'save_store_data',
    storeData: {
      settings: normalized.settings,
      categories: normalized.categories,
      banners: normalized.banners,
      products: normalized.products,
      cities: normalized.cities,
      coupons: normalized.coupons,
    },
  });

  if (!res.success) {
    return {
      success: false,
      message: res.error || 'تعذر حفظ بيانات المتجر في Google Sheets.',
    };
  }
  if (res.data?.storeHandled !== true) {
    return {
      success: false,
      needsScriptUpdate: true,
      message: 'تم الحفظ محلياً، يرجى نسخ كود Google Apps Script المحدث ونشر إصدار جديد (New Version) لمزامنة أوراق المتجر.',
    };
  }
  return {
    success: true,
    message: res.message || 'تم حفظ ومزامنة كامل كتالوج وإعدادات المتجر في أوراق متجر_* بنجاح!',
  };
}

export async function createStoreOrderInSheets(
  webhookUrl: string,
  payload: {
    customer_name: string;
    customer_phone: string;
    customer_city: string;
    customer_address: string;
    telegram_username?: string;
    payment_method: StorePaymentMethod;
    bank_reference?: string;
    coupon_code?: string;
    notes?: string;
    items: { product_id: string; variant: string; qty: number }[];
    storeData: StorePublicData;
  }
): Promise<{
  success: boolean;
  order?: StoreOrder;
  updatedStoreData?: StorePublicData;
  telegramNotified?: boolean;
  error?: string;
}> {
  const { storeData } = payload;
  const orderItems = payload.items
    .map((entry) => {
      const prod = storeData.products.find((p) => p.id === entry.product_id);
      if (!prod) return null;
      const unitPrice = resolveVariantUnitPrice(prod, entry.variant);
      const qty = Math.max(1, Math.floor(Number(entry.qty) || 1));
      return {
        product_id: prod.id,
        name: prod.name,
        sku: prod.sku,
        variant: entry.variant || '',
        qty,
        unit_price: unitPrice,
        line_total: unitPrice * qty,
      };
    })
    .filter(Boolean) as StoreOrder['items'];

  if (orderItems.length === 0) {
    return { success: false, error: 'السلة فارغة أو لم يتم العثور على المنتجات.' };
  }

  const subtotal = orderItems.reduce((sum, x) => sum + x.line_total, 0);
  const couponRes = payload.coupon_code
    ? evaluateStoreCoupon(storeData.coupons, payload.coupon_code, subtotal, storeData.settings.currency)
    : { valid: false, discount: 0, normalizedCode: '', message: '' };

  const selectedCity = storeData.cities.find((c) => c.name === payload.customer_city && c.is_active);
  const cityFee = selectedCity ? selectedCity.delivery_fee : storeData.settings.default_delivery_fee;
  const freeMin =
    selectedCity && selectedCity.free_shipping_min > 0
      ? selectedCity.free_shipping_min
      : storeData.settings.free_shipping_min;
  const deliveryFee = freeMin > 0 && subtotal >= freeMin ? 0 : cityFee;
  const total = Math.max(0, subtotal - couponRes.discount + deliveryFee);

  const localOrder: StoreOrder = {
    id: `ORD-${Date.now().toString().slice(-5)}`,
    created_at: new Date().toISOString(),
    customer_name: payload.customer_name.trim(),
    customer_phone: normalizeDigits(payload.customer_phone.trim()),
    customer_city: payload.customer_city.trim(),
    customer_address: payload.customer_address.trim(),
    telegram_username: (payload.telegram_username || '').trim(),
    payment_method: payload.payment_method,
    bank_reference: (payload.bank_reference || '').trim(),
    coupon_code: couponRes.valid ? couponRes.normalizedCode : '',
    discount_amount: couponRes.discount,
    items: orderItems,
    subtotal,
    delivery_fee: deliveryFee,
    total,
    status: 'pending',
    notes: (payload.notes || '').trim(),
  };

  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, {
        action: 'create_store_order',
        order: localOrder,
        notifyTelegram: storeData.settings.notify_telegram_on_order !== false,
        currency: storeData.settings.currency,
      });

      if (res.success && res.data?.storeHandled && res.data?.order) {
        const confirmedOrder: StoreOrder = res.data.order;
        const savedList = [confirmedOrder, ...getLocalSavedStoreOrders().filter((o) => o.id !== confirmedOrder.id)];
        saveLocalSavedStoreOrders(savedList);

        const nextProducts = storeData.products.map((p) => {
          const orderedQty = confirmedOrder.items
            .filter((i) => i.product_id === p.id)
            .reduce((s, i) => s + i.qty, 0);
          return orderedQty > 0 ? { ...p, stock: Math.max(0, p.stock - orderedQty) } : p;
        });
        const nextCoupons = confirmedOrder.coupon_code
          ? storeData.coupons.map((c) =>
              c.code.toUpperCase() === confirmedOrder.coupon_code.toUpperCase()
                ? { ...c, used_count: (c.used_count || 0) + 1 }
                : c
            )
          : storeData.coupons;

        const nextStoreData: StorePublicData = {
          ...storeData,
          products: nextProducts,
          coupons: nextCoupons,
          orders: [confirmedOrder, ...storeData.orders],
        };
        saveLocalStoreData(nextStoreData);

        return {
          success: true,
          order: confirmedOrder,
          updatedStoreData: nextStoreData,
          telegramNotified: Boolean(res.data.telegramNotified),
        };
      }
      if (!res.success) {
        return { success: false, error: res.error || 'تعذر تسجيل الطلب في المتجر.' };
      }
    } catch (e) {
      console.warn('create_store_order fallback:', e);
    }
  }

  // Fallback local persistence if webhook unavailable
  const savedList = [localOrder, ...getLocalSavedStoreOrders()];
  saveLocalSavedStoreOrders(savedList);
  const nextStoreData: StorePublicData = {
    ...storeData,
    products: storeData.products.map((p) => {
      const orderedQty = localOrder.items
        .filter((i) => i.product_id === p.id)
        .reduce((s, i) => s + i.qty, 0);
      return orderedQty > 0 ? { ...p, stock: Math.max(0, p.stock - orderedQty) } : p;
    }),
    orders: [localOrder, ...storeData.orders],
  };
  saveLocalStoreData(nextStoreData);
  return { success: true, order: localOrder, updatedStoreData: nextStoreData, telegramNotified: false };
}

export async function updateStoreOrderStatusInSheets(
  webhookUrl: string,
  orderId: string,
  status: StoreOrderStatus,
  notifyAdminTelegram = false
): Promise<{ success: boolean; message: string }> {
  const local = getLocalStoreData();
  const nextOrders = local.orders.map((o) => (o.id === orderId ? { ...o, status } : o));
  saveLocalStoreData({ ...local, orders: nextOrders });

  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم تحديث حالة الطلب محلياً.' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'update_store_order_status',
    orderId,
    status,
    notifyAdminTelegram,
  });
  return {
    success: res.success,
    message: res.message || (res.success ? 'تم تحديث حالة الطلب في ورقة متجر_الطلبات.' : res.error || 'تعذر التحديث.'),
  };
}

export async function deleteStoreOrderInSheets(
  webhookUrl: string,
  orderId: string
): Promise<{ success: boolean; message: string }> {
  const local = getLocalStoreData();
  saveLocalStoreData({ ...local, orders: local.orders.filter((o) => o.id !== orderId) });

  const url = (webhookUrl || '').trim();
  if (!url.startsWith('http')) {
    return { success: true, message: 'تم حذف الطلب محلياً.' };
  }
  const res = await callGoogleSheetsPost(url, {
    action: 'delete_store_order',
    orderId,
  });
  return {
    success: res.success,
    message: res.message || (res.success ? 'تم حذف الطلب.' : res.error || 'تعذر الحذف.'),
  };
}

export async function trackStoreOrderInSheets(
  webhookUrl: string,
  orderId: string,
  phone: string
): Promise<{ success: boolean; order?: StoreOrder; error?: string }> {
  const cleanId = orderId.trim().toUpperCase();
  const cleanPhone = normalizeDigits(phone.trim());
  if (!cleanId || !cleanPhone) {
    return { success: false, error: 'أدخل رقم الطلب ورقم الجوال للمتابعة.' };
  }

  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, {
        action: 'track_store_order',
        orderId: cleanId,
        phone: cleanPhone,
      });
      if (res.success && res.data?.storeHandled && res.data?.order) {
        return { success: true, order: res.data.order };
      }
      if (res.data?.storeHandled) {
        return { success: false, error: res.error || res.data?.error || 'لم يتم العثور على طلب مطابق.' };
      }
    } catch {}
  }

  const localAll = [...getLocalSavedStoreOrders(), ...getLocalStoreData().orders];
  const matched = localAll.find(
    (o) =>
      o.id.trim().toUpperCase() === cleanId &&
      normalizeDigits(o.customer_phone).slice(-9) === cleanPhone.slice(-9)
  );
  if (matched) return { success: true, order: matched };
  return { success: false, error: 'لم يتم العثور على طلب مطابق لهذه البيانات.' };
}

// =========================================================================
// Unified Program Marketing Enrollment from Store (Writes into طلبات_البرامج)
// =========================================================================

export async function submitStoreProgramEnrollmentToSheets(
  webhookUrl: string,
  payload: {
    programCardId: string;
    programTitle: string;
    targetProgramId?: string;
    studentName: string;
    studentId?: string;
    phone: string;
    telegramUsername?: string;
    paymentMethod: 'cod' | 'bank_transfer' | 'free';
    bankReference?: string;
    pricePaid: number;
    currency: string;
    notes?: string;
    portalData?: PortalPublicData;
  }
): Promise<{
  success: boolean;
  requestId?: string;
  student?: StudentRegistrant;
  telegramNotified?: boolean;
  error?: string;
}> {
  const url = (webhookUrl || DEFAULT_WEBHOOK_URL).trim();
  const cleanName = payload.studentName.trim();
  const cleanPhone = normalizeDigits(payload.phone.trim());
  const cleanId = payload.studentId ? normalizeDigits(payload.studentId.trim()) : '';

  if (!cleanName || !cleanPhone) {
    return { success: false, error: 'يرجى إدخال الاسم الكامل ورقم الجوال.' };
  }

  const localReqId = `ENR-${Date.now().toString().slice(-6)}`;

  if (url.startsWith('http')) {
    try {
      const res = await callGoogleSheetsPost(url, {
        action: 'submit_store_program_enrollment',
        programCardId: payload.programCardId,
        programTitle: payload.programTitle,
        targetProgramId: payload.targetProgramId || '',
        studentName: cleanName,
        studentId: cleanId,
        phone: cleanPhone,
        telegramUsername: (payload.telegramUsername || '').trim(),
        paymentMethod: payload.paymentMethod,
        bankReference: (payload.bankReference || '').trim(),
        pricePaid: Math.max(0, Number(payload.pricePaid) || 0),
        currency: payload.currency,
        notes: (payload.notes || '').trim(),
      });

      if (res.success && res.data?.storeHandled) {
        const finalId = String(res.data.requestId || localReqId);
        const rec: ProgramRequestRecord = {
          requestId: finalId,
          requestedAt: new Date().toLocaleString('en-GB'),
          registrationId: res.data.registrationId || cleanId || 'NEW',
          studentName: cleanName,
          targetProgramCardId: payload.programCardId,
          targetProgramTitle: payload.programTitle,
          targetProgramId: payload.targetProgramId,
          status: 'pending',
          statusLabel: 'طلب من المتجر · قيد المراجعة',
          studentNote: payload.notes,
          phone: cleanPhone,
          telegramUsername: payload.telegramUsername,
          paymentMethod: payload.paymentMethod,
          bankReference: payload.bankReference,
          pricePaid: payload.pricePaid,
          source: 'store',
        };
        saveLocalProgramRequests([rec, ...getLocalProgramRequests()]);
        return {
          success: true,
          requestId: finalId,
          student: res.data.student,
          telegramNotified: Boolean(res.data.telegramNotified),
        };
      }
      if (!res.success && res.data?.storeHandled) {
        return { success: false, error: res.error || res.data?.error || 'تعذر تسجيل طلب البرنامج.' };
      }
    } catch (e) {
      console.warn('submit_store_program_enrollment fallback:', e);
    }
  }

  const rec: ProgramRequestRecord = {
    requestId: localReqId,
    requestedAt: new Date().toLocaleString('en-GB'),
    registrationId: cleanId || 'NEW',
    studentName: cleanName,
    targetProgramCardId: payload.programCardId,
    targetProgramTitle: payload.programTitle,
    targetProgramId: payload.targetProgramId,
    status: 'pending',
    statusLabel: 'طلب من المتجر · قيد المراجعة',
    studentNote: payload.notes,
    phone: cleanPhone,
    telegramUsername: payload.telegramUsername,
    paymentMethod: payload.paymentMethod,
    bankReference: payload.bankReference,
    pricePaid: payload.pricePaid,
    source: 'store',
  };
  saveLocalProgramRequests([rec, ...getLocalProgramRequests()]);
  return { success: true, requestId: localReqId, telegramNotified: false };
}
