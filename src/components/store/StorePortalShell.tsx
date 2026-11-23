import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  LogIn,
  Menu,
  PackageSearch,
  ShoppingCart,
  X,
} from 'lucide-react';
import type {
  PortalContentItem,
  PortalPublicData,
  StoreCartEntry,
  StoreOrder,
  StoreProduct,
  StorePublicData,
} from '../../types';
import {
  getLocalSavedStoreOrders,
  getLocalStoreCart,
  getLocalStoreFavorites,
  saveLocalSavedStoreOrders,
  saveLocalStoreCart,
  saveLocalStoreFavorites,
} from '../../utils/storeSheets';
import { getDirectImageUrl } from '../../utils/mediaUrl';
import { getSavedPortalBotUsername } from '../../utils/portalSheets';
import { StorefrontView } from './StorefrontView';
import { OrdersTrackingView } from './OrdersTrackingView';
import { ProductModal } from './ProductModal';
import { StoreProgramModal } from './StoreProgramModal';
import { CartCheckoutDrawer } from './CartCheckoutDrawer';

interface StorePortalShellProps {
  storeData: StorePublicData;
  onUpdateStoreData: (next: StorePublicData) => void;
  portalData: PortalPublicData;
  onUpdatePortalData?: (next: PortalPublicData) => void;
  initialView?: 'store' | 'orders';
  initialToast?: string | null;
  onClearInitialToast?: () => void;
  webhookUrl: string;
  onBackToPortal: () => void;
  onOpenStage1Registration: (programTitle?: string) => void;
  onOpenStudentLogin: () => void;
}

export const StorePortalShell: React.FC<StorePortalShellProps> = ({
  storeData,
  onUpdateStoreData,
  portalData,
  onUpdatePortalData,
  initialView = 'store',
  initialToast,
  onClearInitialToast,
  webhookUrl,
  onBackToPortal,
  onOpenStage1Registration,
  onOpenStudentLogin,
}) => {
  const [activeView, setActiveView] = useState<'store' | 'orders'>(initialView);
  const [cart, setCart] = useState<StoreCartEntry[]>(() => getLocalStoreCart());
  const [favorites, setFavorites] = useState<string[]>(() => getLocalStoreFavorites());
  const [savedOrders, setSavedOrders] = useState<StoreOrder[]>(() => getLocalSavedStoreOrders());

  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<PortalContentItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(initialToast || null);

  React.useEffect(() => {
    setCart(getLocalStoreCart());
  }, []);

  React.useEffect(() => {
    if (!initialToast) return;
    setToastMsg(initialToast);
    const t = window.setTimeout(() => {
      setToastMsg(null);
      onClearInitialToast?.();
    }, 3000);
    return () => window.clearTimeout(t);
  }, [initialToast, onClearInitialToast]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2600);
  };

  const portalPrograms = useMemo(
    () => (portalData.items || []).filter((i) => i.section === 'programs'),
    [portalData.items]
  );

  const recommendedForActiveProgram = useMemo(() => {
    if (!selectedProgram || !Array.isArray(selectedProgram.recommendedProductIds)) return [];
    const idSet = new Set(selectedProgram.recommendedProductIds);
    return storeData.products.filter((p) => p.is_active && idSet.has(p.id));
  }, [selectedProgram, storeData.products]);

  const handleAddToCart = (product: StoreProduct, variantLabel?: string, qty = 1) => {
    if (product.stock <= 0) return;
    const chosenVariant =
      variantLabel ||
      (product.variants && product.variants.length > 0 ? product.variants[0].label : '');
    const key = `${product.id}::${chosenVariant}`;

    setCart((prev) => {
      const existing = prev.find((x) => x.key === key);
      const next = existing
        ? prev.map((x) =>
            x.key === key ? { ...x, qty: Math.min(product.stock, x.qty + qty) } : x
          )
        : [...prev, { key, product, variant: chosenVariant, qty }];
      saveLocalStoreCart(next);
      return next;
    });

    showToast(`تمت إضافة «${product.name}» إلى السلة`);
  };

  const handleUpdateQty = (key: string, qty: number) => {
    setCart((prev) => {
      const next =
        qty <= 0
          ? prev.filter((x) => x.key !== key)
          : prev.map((x) => (x.key === key ? { ...x, qty: Math.min(x.product.stock, qty) } : x));
      saveLocalStoreCart(next);
      return next;
    });
  };

  const handleRemoveItem = (key: string) => {
    setCart((prev) => {
      const next = prev.filter((x) => x.key !== key);
      saveLocalStoreCart(next);
      return next;
    });
  };

  const handleClearCart = () => {
    setCart([]);
    saveLocalStoreCart([]);
  };

  const handleToggleFavorite = (productId: string) => {
    setFavorites((prev) => {
      const exists = prev.includes(productId);
      const next = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
      saveLocalStoreFavorites(next);
      return next;
    });
  };

  const handleOrderCreated = (order: StoreOrder, updatedStoreData?: StorePublicData) => {
    if (updatedStoreData) {
      onUpdateStoreData(updatedStoreData);
    }
    setSavedOrders((prev) => {
      const next = [order, ...prev.filter((o) => o.id !== order.id)];
      saveLocalSavedStoreOrders(next);
      return next;
    });
  };

  const handleUpdateSavedOrder = (order: StoreOrder) => {
    setSavedOrders((prev) => {
      const next = [order, ...prev.filter((o) => o.id !== order.id)];
      saveLocalSavedStoreOrders(next);
      return next;
    });
  };

  const handleProgramEnrolled = (programCardId: string) => {
    if (onUpdatePortalData) {
      const nextItems = (portalData.items || []).map((it) => {
        if (it.id !== programCardId) return it;
        const currentSeats = it.seatsLeft !== undefined ? Number(it.seatsLeft) : 15;
        return { ...it, seatsLeft: Math.max(0, currentSeats - 1) };
      });
      onUpdatePortalData({ ...portalData, items: nextItems });
    }
  };

  const totalCartItems = useMemo(() => cart.reduce((sum, x) => sum + x.qty, 0), [cart]);
  const botUsername = portalData.settings?.telegramBotUsername || getSavedPortalBotUsername();

  return (
    <div className="min-h-screen bg-[#F8FAF9] text-slate-800 font-cairo flex flex-col" dir="rtl">
      {/* Announcement Ribbon */}
      {storeData.settings.announcement_text && (
        <div className="bg-emerald-950 text-emerald-50 text-xs font-semibold py-2 px-4 text-center">
          <span>{storeData.settings.announcement_text}</span>
        </div>
      )}

      {/* 3-Zone Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Brand + Back to Public Portal */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToPortal}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              title="العودة للبوابة العامة"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">البوابة الرئيسية</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('store')}
              className="flex items-center gap-2 text-base font-extrabold text-slate-900 truncate cursor-pointer"
            >
              {portalData.settings?.logoUrl ? (
                <img
                  src={getDirectImageUrl(portalData.settings.logoUrl)}
                  alt={storeData.settings.store_name}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                />
              ) : null}
              <span className="truncate">{storeData.settings.store_name}</span>
            </button>
          </div>

          {/* Zone 2: Store Nav */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-bold text-slate-600">
            <button
              type="button"
              onClick={() => {
                setActiveView('store');
                window.location.hash = '#store';
              }}
              className={`cursor-pointer transition-colors ${
                activeView === 'store' ? 'text-emerald-800 font-extrabold' : 'hover:text-emerald-800'
              }`}
            >
              المنتجات والبرامج
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('orders');
                window.location.hash = '#store-orders';
              }}
              className={`inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeView === 'orders' ? 'text-emerald-800 font-extrabold' : 'hover:text-emerald-800'
              }`}
            >
              <PackageSearch className="w-4 h-4" />
              <span>تتبع الطلبات</span>
            </button>
          </nav>

          {/* Zone 3: Student Login + Cart Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenStudentLogin}
              className="hidden sm:inline-flex px-3 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold items-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-700" />
              <span>بوابة المشتركين</span>
            </button>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label="سلة التسوق"
              title="سلة التسوق"
              className="relative p-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white inline-flex items-center justify-center cursor-pointer"
            >
              <ShoppingCart className="w-5 h-5 text-amber-300" />
              {totalCartItems > 0 && (
                <span className="absolute -top-1.5 -left-1.5 min-w-[20px] h-5 px-1 rounded-full bg-amber-400 text-slate-950 text-[11px] font-extrabold tabular-nums flex items-center justify-center border-2 border-white">
                  {totalCartItems}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-xl border border-slate-200 text-slate-700 cursor-pointer"
              aria-label="القائمة"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveView('store');
                  setMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  activeView === 'store' ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                المنتجات والبرامج
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView('orders');
                  setMobileMenuOpen(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                  activeView === 'orders' ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                تتبع الطلبات
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenStudentLogin();
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
            >
              بوابة المشتركين
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {activeView === 'orders' ? (
          <OrdersTrackingView
            savedOrders={savedOrders}
            settings={storeData.settings}
            webhookUrl={webhookUrl}
            onUpdateSavedOrder={handleUpdateSavedOrder}
          />
        ) : (
          <StorefrontView
            storeData={storeData}
            portalPrograms={portalPrograms}
            favorites={favorites}
            botUsername={botUsername}
            onSelectProduct={(p) => setSelectedProduct(p)}
            onQuickAdd={(p) => handleAddToCart(p)}
            onToggleFavorite={handleToggleFavorite}
            onSelectProgram={(prog) => setSelectedProgram(prog)}
          />
        )}
      </main>

      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-[96] rounded-2xl bg-slate-900 text-white px-4 py-3 text-xs font-extrabold shadow-xl border border-slate-700 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Modals & Drawer */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          category={storeData.categories.find((c) => c.id === selectedProduct.category_id)}
          settings={storeData.settings}
          botUsername={botUsername}
          isFavorite={favorites.includes(selectedProduct.id)}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(prod, variant, qty) => handleAddToCart(prod, variant, qty)}
        />
      )}

      {selectedProgram && (
        <StoreProgramModal
          program={selectedProgram}
          settings={storeData.settings}
          recommendedProducts={recommendedForActiveProgram}
          botUsername={botUsername}
          webhookUrl={webhookUrl}
          onAddToCart={(prod) => handleAddToCart(prod)}
          onEnrolled={handleProgramEnrolled}
          onOpenStage1Onboarding={(title) => onOpenStage1Registration(title)}
          onClose={() => setSelectedProgram(null)}
        />
      )}

      <CartCheckoutDrawer
        open={cartOpen}
        items={cart}
        storeData={storeData}
        webhookUrl={webhookUrl}
        botUsername={botUsername}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        onOrderCreated={handleOrderCreated}
      />
    </div>
  );
};
