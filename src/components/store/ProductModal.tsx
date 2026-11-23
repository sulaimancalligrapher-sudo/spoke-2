import React, { useState } from 'react';
import { Heart, MessageCircle, Minus, Plus, ShoppingCart, X } from 'lucide-react';
import type { StoreCategory, StoreProduct, StoreSettings } from '../../types';
import { resolveVariantUnitPrice } from '../../utils/storeSheets';
import { StoreImage } from './StoreImage';

interface ProductModalProps {
  product: StoreProduct;
  category?: StoreCategory;
  settings: StoreSettings;
  botUsername?: string;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onAddToCart: (product: StoreProduct, variant: string, qty: number) => void;
  onClose: () => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  category,
  settings,
  botUsername,
  isFavorite,
  onToggleFavorite,
  onAddToCart,
  onClose,
}) => {
  const images = [product.image_url, ...(product.gallery_urls || [])].filter(Boolean);
  const [activeImgIdx, setActiveImgIdx] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(product.variants[0]?.label || '');
  const [qty, setQty] = useState(1);

  const outOfStock = product.stock <= 0;
  const currentPrice = resolveVariantUnitPrice(product, selectedVariant);

  const tgHandle = (settings.telegram_username || botUsername || '').replace(/^@/, '').trim();
  const tgUrl = tgHandle ? `https://t.me/${tgHandle}` : '';

  const handleAdd = () => {
    if (outOfStock) return;
    onAddToCart(product, selectedVariant, qty);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 z-10 rounded-xl border border-slate-200 bg-white/95 p-2 text-slate-800 hover:bg-slate-100 cursor-pointer"
          aria-label="إغلاق"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12">
          {/* Gallery */}
          <div className="md:col-span-6 bg-slate-50 p-5 space-y-3 border-b md:border-b-0 md:border-l border-slate-200">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <StoreImage
                src={images[activeImgIdx] || product.image_url}
                alt={product.name}
                aspectClass="aspect-[4/3]"
              />
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((url, idx) => (
                  <button
                    key={`${url}-${idx}`}
                    type="button"
                    onClick={() => setActiveImgIdx(idx)}
                    className={`w-16 h-12 shrink-0 overflow-hidden rounded-xl border-2 cursor-pointer transition-colors ${
                      activeImgIdx === idx
                        ? 'border-emerald-800'
                        : 'border-slate-200 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <StoreImage src={url} alt={`${product.name} ${idx + 1}`} aspectClass="w-full h-full" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="md:col-span-6 p-6 md:p-7 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-bold">
                <span>{category?.name || 'الأدوات والمستلزمات'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono" dir="ltr">{product.sku}</span>
                {outOfStock ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-rose-700 font-extrabold">غير متوفر حالياً</span>
                  </>
                ) : product.stock <= 5 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-extrabold">متبقي {product.stock} قطع</span>
                  </>
                ) : null}
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
                {product.name}
              </h2>

              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-extrabold text-emerald-900 tabular-nums">
                  {currentPrice} {settings.currency}
                </span>
                {product.compare_at_price && product.compare_at_price > currentPrice && (
                  <span className="text-sm text-slate-400 line-through tabular-nums">
                    {product.compare_at_price} {settings.currency}
                  </span>
                )}
              </div>

              <p className="text-sm leading-relaxed text-slate-600">{product.description}</p>

              {product.variants.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="block text-xs font-extrabold text-slate-900">اختر الخيار:</span>
                  <div className="flex flex-wrap gap-2">
                    {product.variants.map((variant) => {
                      const variantPrice =
                        variant.price !== null && variant.price !== undefined
                          ? variant.price
                          : product.price;
                      const active = selectedVariant === variant.label;
                      return (
                        <button
                          key={variant.label}
                          type="button"
                          onClick={() => setSelectedVariant(variant.label)}
                          className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'border-emerald-800 bg-emerald-800 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-700'
                          }`}
                        >
                          <span>{variant.label}</span>
                          {variant.price !== null && variant.price !== undefined && (
                            <span
                              className={`mr-1.5 tabular-nums ${
                                active ? 'text-emerald-100' : 'text-slate-500'
                              }`}
                            >
                              · {variantPrice} {settings.currency}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="p-2.5 text-slate-800 hover:bg-slate-200 rounded-r-xl cursor-pointer"
                    aria-label="إنقاص الكمية"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-extrabold tabular-nums">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((q) => Math.min(Math.max(1, product.stock), q + 1))}
                    className="p-2.5 text-slate-800 hover:bg-slate-200 rounded-l-xl cursor-pointer"
                    aria-label="زيادة الكمية"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={outOfStock}
                  onClick={handleAdd}
                  title={outOfStock ? 'غير متوفر حالياً' : 'أضف إلى السلة'}
                  aria-label={outOfStock ? 'غير متوفر حالياً' : 'أضف إلى السلة'}
                  className="flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-800 px-5 py-3 text-white hover:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ShoppingCart className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => onToggleFavorite(product.id)}
                  className={`rounded-xl border p-3 transition-colors cursor-pointer ${
                    isFavorite
                      ? 'border-rose-200 bg-rose-50 text-rose-600'
                      : 'border-slate-300 bg-white text-slate-500 hover:text-slate-900'
                  }`}
                  aria-label="المفضلة"
                >
                  <Heart className={`h-5 w-5 ${isFavorite ? 'fill-current' : ''}`} />
                </button>
              </div>

              {tgUrl && (
                <a
                  href={tgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-bold text-slate-800 hover:bg-sky-50 hover:border-sky-200 transition-colors"
                >
                  <MessageCircle className="h-4 w-4 text-sky-600" />
                  <span>استفسر عن المنتج مباشرة عبر تيليجرام</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
