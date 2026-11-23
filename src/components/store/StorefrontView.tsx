import React, { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Calendar,
  Clock,
  GraduationCap,
  Heart,
  MessageCircle,
  Search,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import type {
  PortalContentItem,
  StoreProduct,
  StorePublicData,
  StoreTrainingFormat,
} from '../../types';
import { getProductPriceSummary } from '../../utils/storeSheets';
import { StoreImage } from './StoreImage';

const FORMAT_LABELS: Record<StoreTrainingFormat, string> = {
  online_live: 'عن بُعد مباشر',
  in_person: 'حضوري',
  recorded: 'مسجل بالكامل',
};

interface StorefrontViewProps {
  storeData: StorePublicData;
  portalPrograms: PortalContentItem[];
  favorites: string[];
  botUsername?: string;
  onSelectProduct: (product: StoreProduct) => void;
  onQuickAdd: (product: StoreProduct) => void;
  onToggleFavorite: (productId: string) => void;
  onSelectProgram: (program: PortalContentItem) => void;
}

export const StorefrontView: React.FC<StorefrontViewProps> = ({
  storeData,
  portalPrograms,
  favorites,
  botUsername,
  onSelectProduct,
  onQuickAdd,
  onToggleFavorite,
  onSelectProgram,
}) => {
  const { settings, categories, products, banners } = storeData;

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'featured' | 'price_asc' | 'price_desc' | 'favorites'>(
    'featured'
  );
  const [programFormatFilter, setProgramFormatFilter] = useState<'all' | StoreTrainingFormat>('all');

  const activeBanner = useMemo(
    () => banners.find((b) => b.is_active) || banners[0],
    [banners]
  );

  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => c.is_active)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [categories]
  );

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (!p.is_active) return false;
      if (activeCategory !== 'all' && p.category_id !== activeCategory) return false;
      if (sortBy === 'favorites' && !favorites.includes(p.id)) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q) &&
        !p.sku.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    if (sortBy === 'price_asc') {
      return [...list].sort(
        (a, b) => getProductPriceSummary(a).minPrice - getProductPriceSummary(b).minPrice
      );
    }
    if (sortBy === 'price_desc') {
      return [...list].sort(
        (a, b) => getProductPriceSummary(b).minPrice - getProductPriceSummary(a).minPrice
      );
    }
    return [...list].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
  }, [products, activeCategory, searchQuery, sortBy, favorites]);

  // Unified Program Marketing List (Reads strictly from Public Portal's programs)
  const storePrograms = useMemo(() => {
    return portalPrograms
      .filter((p) => p.enabled !== false && p.showInStore !== false)
      .filter((p) =>
        programFormatFilter === 'all' ? true : (p.format || 'online_live') === programFormatFilter
      )
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [portalPrograms, programFormatFilter]);

  const tgHandle = (settings.telegram_username || botUsername || '').replace(/^@/, '').trim();
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Banner */}
      {activeBanner && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
              <div className="lg:col-span-6 p-7 sm:p-10 space-y-4">
                <p className="text-xs font-extrabold uppercase tracking-wide text-amber-700">
                  {settings.store_name} · أدوات أصلية وبرامج متكاملة
                </p>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 font-amiri leading-snug">
                  {activeBanner.title}
                </h1>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                  {activeBanner.subtitle}
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href="#store-catalog"
                    className="px-6 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4 text-amber-300" />
                    <span>تصفح المنتجات</span>
                  </a>
                  {storePrograms.length > 0 && (
                    <a
                      href="#store-programs"
                      className="px-5 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 transition-colors"
                    >
                      <GraduationCap className="w-4 h-4 text-emerald-800" />
                      <span>البرامج التدريبية ({storePrograms.length})</span>
                    </a>
                  )}
                </div>
              </div>
              <div className="lg:col-span-6 h-full">
                <StoreImage
                  src={activeBanner.image_url}
                  alt={activeBanner.title}
                  aspectClass="aspect-[16/10] lg:aspect-[16/11]"
                />
              </div>
            </div>
          </div>

          {/* Service Highlights */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900">تسعيرة شحن لكل مدينة</div>
                <div className="text-[11px] text-slate-500">
                  شحن مجاني للطلبات فوق {settings.free_shipping_min} {settings.currency}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900">تسويق البرامج الموحد</div>
                <div className="text-[11px] text-slate-500">ربط مباشر مع بوابة المشتركين والجدول</div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900">تأكيد فوري عبر تيليجرام</div>
                <div className="text-[11px] text-slate-500">متابعة لحظية للطلبات والمقاعد</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Store Product Catalog */}
      <section id="store-catalog" className="mx-auto max-w-6xl px-4 sm:px-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-extrabold text-emerald-800">المنتجات والأدوات</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
              كتالوج مستلزمات الخط والتدريب
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[210px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو الكود..."
                className="w-full rounded-xl border border-slate-300 bg-white pr-9 pl-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-700 focus:outline-none"
              />
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="featured">المميزة أولاً</option>
                <option value="price_asc">السعر: الأقل</option>
                <option value="price_desc">السعر: الأعلى</option>
                <option value="favorites">المفضلة ({favorites.length})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer border transition-colors ${
              activeCategory === 'all'
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            الكل ({products.filter((p) => p.is_active).length})
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer border transition-colors ${
                activeCategory === cat.id
                  ? 'bg-emerald-800 text-white border-emerald-800'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">
            لا توجد منتجات مطابقة لخيارات البحث الحالية.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product) => {
              const summary = getProductPriceSummary(product);
              const isFav = favorites.includes(product.id);
              const outOfStock = product.stock <= 0;
              const catLabel = categoryNameById.get(product.category_id) || 'أداة';

              return (
                <article
                  key={product.id}
                  className="group rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between shadow-xs hover:border-emerald-300 transition-colors"
                >
                  <div>
                    <div
                      onClick={() => onSelectProduct(product)}
                      className="relative cursor-pointer overflow-hidden"
                    >
                      <StoreImage
                        src={product.image_url}
                        alt={product.name}
                        aspectClass="aspect-[4/3]"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(product.id);
                        }}
                        aria-label="المفضلة"
                        className={`absolute top-3 left-3 p-2 rounded-xl border backdrop-blur-xs cursor-pointer transition-colors ${
                          isFav
                            ? 'bg-rose-50 text-rose-600 border-rose-200'
                            : 'bg-white/90 text-slate-500 border-slate-200 hover:text-rose-600'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                      </button>

                      {outOfStock && (
                        <div className="absolute inset-0 bg-slate-950/55 flex items-center justify-center">
                          <span className="px-3 py-1 rounded-lg bg-white text-slate-900 text-xs font-extrabold">
                            نفدت الكمية
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-5 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                        <span>{catLabel}</span>
                        <span className="font-mono tabular-nums">{product.sku}</span>
                      </div>

                      <h3
                        onClick={() => onSelectProduct(product)}
                        className="text-base font-extrabold text-slate-900 hover:text-emerald-800 cursor-pointer line-clamp-1"
                      >
                        {product.name}
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 min-h-[36px]">
                        {product.description}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3 border-t border-slate-100">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-lg font-extrabold text-emerald-900 tabular-nums">
                          {summary.hasRange
                            ? `${summary.minPrice} - ${summary.maxPrice}`
                            : summary.defaultPrice}{' '}
                          {settings.currency}
                        </span>
                      </div>
                      {product.compare_at_price && product.compare_at_price > summary.minPrice && (
                        <span className="text-[11px] text-slate-400 line-through tabular-nums">
                          {product.compare_at_price} {settings.currency}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => onQuickAdd(product)}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-300 text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>أضف للسلة</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Unified Training Programs Section (from Public Portal's Programs) */}
      <section id="store-programs" className="mx-auto max-w-6xl px-4 sm:px-6 space-y-6 pt-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-t border-slate-200 pt-10">
          <div className="space-y-1">
            <p className="text-xs font-extrabold text-amber-700">البرامج التدريبية والباقات</p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-amiri">
              التسجيل في الدورات والمسارات المتاحة
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              برامج موحدة ومربوطة مباشرة بسجل المشتركين وتصلك حالة القبول والتفعيل عبر تيليجرام.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'online_live', label: 'عن بُعد مباشر' },
                { id: 'in_person', label: 'حضوري' },
                { id: 'recorded', label: 'مسجل' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setProgramFormatFilter(f.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-colors ${
                  programFormatFilter === f.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {storePrograms.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            لا توجد برامج تدريبية معروضة تحت هذا التصنيف حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {storePrograms.map((prog) => {
              const price = Math.max(0, Number(prog.price) || 0);
              const isFree = price <= 0;
              const seatsLeft = prog.seatsLeft !== undefined ? Number(prog.seatsLeft) : 15;
              const soldOut = seatsLeft <= 0;

              return (
                <article
                  key={prog.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between shadow-xs hover:border-emerald-300 transition-colors"
                >
                  <div>
                    <div
                      onClick={() => onSelectProgram(prog)}
                      className="cursor-pointer overflow-hidden"
                    >
                      <StoreImage
                        src={prog.mediaUrl}
                        alt={prog.title}
                        aspectClass="aspect-[16/10]"
                      />
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                        <span className="text-emerald-800">{prog.badgeText || 'برنامج تدريبي'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{FORMAT_LABELS[prog.format || 'online_live']}</span>
                      </div>

                      <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
                        {prog.title}
                      </h3>

                      {prog.description && (
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                          {prog.description}
                        </p>
                      )}

                      <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-bold text-slate-600">
                        <div className="flex items-center gap-1 truncate">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="truncate">{prog.duration || 'مرن'}</span>
                        </div>
                        <div className="flex items-center gap-1 truncate">
                          <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="tabular-nums truncate">{prog.startDate || 'مفتوح'}</span>
                        </div>
                        <div className="flex items-center gap-1 truncate">
                          <Users className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className={`tabular-nums ${soldOut ? 'text-rose-700' : ''}`}>
                            {soldOut ? 'مكتمل' : `${seatsLeft} مقعد`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-lg font-extrabold text-emerald-900 tabular-nums">
                        {isFree ? 'مجاني' : `${price} ${settings.currency}`}
                      </span>
                      {prog.compareAtPrice && prog.compareAtPrice > price && (
                        <span className="block text-[11px] text-slate-400 line-through tabular-nums">
                          {prog.compareAtPrice} {settings.currency}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectProgram(prog)}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-emerald-800 text-white text-xs font-extrabold transition-colors cursor-pointer"
                    >
                      التفاصيل والتسجيل
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom Telegram Assistance */}
      {tgHandle && (
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1 text-center sm:text-right">
              <h3 className="text-lg font-extrabold text-slate-900">
                تحتاج مساعدة في اختيار القلم أو البرنامج المناسب؟
              </h3>
              <p className="text-xs sm:text-sm text-slate-600">
                فريقنا متاح للرد الفوري عبر تيليجرام ومساعدتك في اختيار الأدوات المناسبة لمستواك.
              </p>
            </div>
            <a
              href={`https://t.me/${tgHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 shrink-0 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>تواصل معنا عبر تيليجرام</span>
            </a>
          </div>
        </section>
      )}
    </div>
  );
};
