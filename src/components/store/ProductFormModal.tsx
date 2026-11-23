import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { StoreCategory, StoreProduct, StoreProductVariantOption } from '../../types';
import { extractDriveFileId } from '../../utils/mediaUrl';
import { parseProductVariants } from '../../utils/storeSheets';
import { StoreImage } from './StoreImage';

interface ProductFormModalProps {
  product: StoreProduct | null;
  categories: StoreCategory[];
  currency: string;
  onSave: (product: StoreProduct) => void;
  onClose: () => void;
}

interface VariantDraftRow {
  label: string;
  priceText: string;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  product,
  categories,
  currency,
  onSave,
  onClose,
}) => {
  const isEdit = Boolean(product);
  const [name, setName] = useState(product?.name || '');
  const [categoryId, setCategoryId] = useState(product?.category_id || categories[0]?.id || 'cat_qalam');
  const [sku, setSku] = useState(product?.sku || '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [compareAtPrice, setCompareAtPrice] = useState(
    product?.compare_at_price ? String(product.compare_at_price) : ''
  );
  const [stock, setStock] = useState(product ? String(product.stock) : '15');
  const [imageUrl, setImageUrl] = useState(product?.image_url || '');
  const [galleryText, setGalleryText] = useState((product?.gallery_urls || []).join(', '));
  const [description, setDescription] = useState(product?.description || '');
  const [isFeatured, setIsFeatured] = useState(product?.is_featured ?? true);
  const [showOnHome, setShowOnHome] = useState(product?.show_on_home ?? false);
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [variantRows, setVariantRows] = useState<VariantDraftRow[]>(() => {
    const parsed = parseProductVariants(product?.variants || []);
    return parsed.map((v) => ({
      label: v.label,
      priceText: v.price !== null && v.price !== undefined ? String(v.price) : '',
    }));
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedVariants: StoreProductVariantOption[] = variantRows
      .map((r) => {
        const label = r.label.trim();
        if (!label) return null;
        const pTrim = r.priceText.trim();
        const pNum = pTrim !== '' ? Number(pTrim) : null;
        return {
          label,
          price: pNum !== null && !Number.isNaN(pNum) && pNum >= 0 ? pNum : null,
        };
      })
      .filter(Boolean) as StoreProductVariantOption[];

    const galleryUrls = galleryText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const saved: StoreProduct = {
      id: product?.id || `prod_${Date.now().toString().slice(-6)}`,
      name: name.trim(),
      category_id: categoryId,
      sku: sku.trim() || `FSH-${Date.now().toString().slice(-4)}`,
      price: Math.max(0, Number(price) || 0),
      compare_at_price: compareAtPrice.trim() ? Math.max(0, Number(compareAtPrice) || 0) : null,
      stock: Math.max(0, Math.floor(Number(stock) || 0)),
      image_url: imageUrl.trim(),
      gallery_urls: galleryUrls,
      variants: cleanedVariants,
      description: description.trim(),
      is_featured: isFeatured,
      show_on_home: showOnHome,
      is_active: isActive,
      created_at: product?.created_at || new Date().toISOString(),
    };
    onSave(saved);
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <h2 className="text-base font-extrabold text-slate-900">
            {isEdit ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد للمتجر'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82dvh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">اسم المنتج *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: طقم أقلام قصب جاوي (5 مقاسات)"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">القسم *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-emerald-700 focus:bg-white focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">السعر ({currency}) *</label>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm tabular-nums focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">سعر قبل الخصم</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={compareAtPrice}
                onChange={(e) => setCompareAtPrice(e.target.value)}
                placeholder="اختياري"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm tabular-nums focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">الكمية بالمخزون *</label>
              <input
                required
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm tabular-nums focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">رمز SKU</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="تلقائي"
                dir="ltr"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">رابط الصورة الرئيسية *</label>
              <input
                required
                dir="ltr"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://drive.google.com/file/d/.../view?usp=sharing أو رابط مباشر"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-mono focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
              {extractDriveFileId(imageUrl) ? (
                <p className="text-[11px] font-bold text-emerald-700">
                  تم التعرف على رابط Google Drive وسيُحوّل للعرض المباشر تلقائياً.
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  يقبل روابط الصور المباشرة أو روابط Google Drive (مشاركة: أي شخص لديه الرابط).
                </p>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <StoreImage src={imageUrl} alt={name || 'معاينة الصورة'} aspectClass="aspect-[4/3]" />
            </div>
          </div>

          {/* Per-Variant Custom Pricing Builder */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold text-slate-900">الخيارات والمقاسات مع تسعير مخصص</p>
                <p className="text-[11px] text-slate-500">
                  أضف خيارات (مثل: مقاس A4، مقاس A3) واترك السعر فارغاً لاستخدام السعر الأساسي.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVariantRows((prev) => [...prev, { label: '', priceText: '' }])}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-800 hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>إضافة خيار</span>
              </button>
            </div>

            {variantRows.length > 0 && (
              <div className="space-y-2">
                {variantRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6">
                      <input
                        value={row.label}
                        onChange={(e) =>
                          setVariantRows((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                          )
                        }
                        placeholder="اسم الخيار (مثال: A4 - 25 ورقة)"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-emerald-700 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-5">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.priceText}
                        onChange={(e) =>
                          setVariantRows((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, priceText: e.target.value } : item))
                          )
                        }
                        placeholder={`السعر (${price || 'الأساسي'} ${currency})`}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs tabular-nums focus:border-emerald-700 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setVariantRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                        title="حذف الخيار"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              روابط صور إضافية (اختياري، مفصولة بفاصلة)
            </label>
            <input
              dir="ltr"
              value={galleryText}
              onChange={(e) => setGalleryText(e.target.value)}
              placeholder="https://..., https://..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs focus:border-emerald-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">وصف المنتج</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="اكتب مواصفات المنتج ومميزاته..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm focus:border-emerald-700 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-700"
              />
              <span>متاح للبيع في المتجر</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="h-4 w-4 rounded accent-amber-600"
              />
              <span>منتج مميز</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-emerald-900 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnHome}
                onChange={(e) => setShowOnHome(e.target.checked)}
                className="h-4 w-4 rounded accent-emerald-700"
              />
              <span>عرض في الصفحة العامة</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-900 cursor-pointer"
            >
              {isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
