import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  CreditCard,
  Banknote,
  ScanBarcode,
  RotateCcw,
} from 'lucide-react';
import { CATEGORY_LABELS, PAYMENT_LABELS, UI_TEXT, t } from '../i18n/translations';
import { CartItem, Language, PaymentMethod, Product, ProductCategory } from '../types/pos';
import { formatMMK, playBeep } from '../utils/formatters';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface PosViewProps {
  products: Product[];
  lang: Language;
  onCompleteSale: (params: {
    cart: CartItem[];
    discount: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
  }) => Promise<void>;
  onOpenReversal?: () => void;
}

const CATEGORIES: Array<ProductCategory | 'all'> = [
  'all',
  'beverages',
  'snacks',
  'groceries',
  'dairy_chilled',
  'personal_care',
  'household',
];

const KYAT_BILLS = [1000, 5000, 10000, 20000];

export const PosView: React.FC<PosViewProps> = ({
  products,
  lang,
  onCompleteSale,
  onOpenReversal,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountInput, setDiscountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceivedInput, setCashReceivedInput] = useState('');
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    window.setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 2200);
  };

  const addProductToCart = (product: Product): boolean => {
    if (product.stock <= 0) {
      playBeep('error');
      showToast(
        `${lang === 'mm' ? product.nameMm : product.nameEn} — ${t(UI_TEXT.pos.outOfStock, lang)}`,
        'err'
      );
      return false;
    }

    let added = false;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === product.id);
      if (idx >= 0) {
        if (prev[idx].qty >= product.stock) {
          playBeep('error');
          showToast(t(UI_TEXT.pos.stockLimitReached, lang), 'err');
          return prev;
        }
        added = true;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1, maxStock: product.stock };
        return copy;
      }
      added = true;
      return [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          nameMm: product.nameMm,
          nameEn: product.nameEn,
          unitMm: product.unitMm,
          unitEn: product.unitEn,
          costPrice: product.costPrice,
          unitPrice: product.sellPrice,
          qty: 1,
          maxStock: product.stock,
        },
      ];
    });

    if (added) {
      playBeep('scan');
    }
    return added;
  };

  const handleBarcodeLookup = (rawCode: string): boolean => {
    const code = rawCode.trim().toLowerCase();
    if (!code) return false;
    const match = products.find((p) => p.sku.toLowerCase() === code);
    if (!match) {
      playBeep('error');
      showToast(`${t(UI_TEXT.pos.barcodeNotFound, lang)}: ${rawCode}`, 'err');
      return false;
    }
    const ok = addProductToCart(match);
    if (ok) {
      showToast(`+1 ${lang === 'mm' ? match.nameMm : match.nameEn}`, 'ok');
    }
    return ok;
  };

  useEffect(() => {
    let buffer = '';
    let lastKeyTime = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (scannerOpen) return;
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (isInput) return;

      const now = Date.now();
      if (now - lastKeyTime > 80) {
        buffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter' && buffer.length >= 4) {
        e.preventDefault();
        handleBarcodeLookup(buffer);
        buffer = '';
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.nameMm.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, search]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),
    [cart]
  );
  const discount = Math.min(Math.max(0, Number(discountInput) || 0), subtotal);
  const total = subtotal - discount;
  const cashReceived = Number(cashReceivedInput) || 0;
  const changeDue = paymentMethod === 'cash' ? Math.max(0, cashReceived - total) : 0;
  const isCashShort = paymentMethod === 'cash' && cashReceived < total;

  const updateCartQty = (productId: string, nextQty: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          if (nextQty <= 0) return null;
          if (nextQty > item.maxStock) {
            showToast(t(UI_TEXT.pos.stockLimitReached, lang), 'err');
            return item;
          }
          return { ...item, qty: nextQty };
        })
        .filter((x): x is CartItem => x !== null)
    );
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && search.trim()) {
      e.preventDefault();
      const exactSku = products.find((p) => p.sku.toLowerCase() === search.trim().toLowerCase());
      if (exactSku) {
        addProductToCart(exactSku);
        setSearch('');
      } else if (filteredProducts.length === 1) {
        addProductToCart(filteredProducts[0]);
        setSearch('');
      } else {
        showToast(t(UI_TEXT.pos.barcodeNotFound, lang), 'err');
      }
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || submitting) return;
    if (paymentMethod === 'cash' && cashReceived < total) {
      playBeep('error');
      showToast(t(UI_TEXT.pos.insufficientCash, lang), 'err');
      return;
    }

    setSubmitting(true);
    try {
      await onCompleteSale({
        cart,
        discount,
        paymentMethod,
        amountPaid: paymentMethod === 'cash' ? cashReceived : total,
      });
      playBeep('success');
      setCart([]);
      setDiscountInput('');
      setCashReceivedInput('');
      searchInputRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full min-h-[calc(100vh-8.5rem)]">
      {/* Left: Catalog & Barcode Search */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t(UI_TEXT.pos.searchPlaceholder, lang)}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4 text-[var(--accent-text)]" />
            <span>{lang === 'mm' ? 'Barcode စကန်' : 'Scan Barcode'}</span>
          </button>
          {onOpenReversal && (
            <button
              type="button"
              onClick={onOpenReversal}
              className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span>{lang === 'mm' ? 'အရောင်းပြန်အမ်း' : 'Sale Reversal'}</span>
            </button>
          )}
        </div>

        {/* Toast Feedback */}
        {toast && (
          <div
            className={`mb-3 rounded-lg border px-3.5 py-2 text-xs font-medium flex items-center justify-between ${
              toast.kind === 'ok'
                ? 'bg-[var(--accent-soft)] border-[var(--accent-soft-border)] text-[var(--accent-text)]'
                : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300'
            }`}
          >
            <span>{toast.msg}</span>
            <ScanBarcode className="w-3.5 h-3.5 shrink-0" />
          </div>
        )}

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3">
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]'
                    : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-muted)]'
                }`}
              >
                {CATEGORY_LABELS[cat][lang]}
              </button>
            );
          })}
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col items-center justify-center p-8 text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              {lang === 'mm' ? 'ကိုက်ညီသော ကုန်ပစ္စည်း မတွေ့ပါ' : 'No matching products found'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
              }}
              className="mt-3 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
            >
              {lang === 'mm' ? 'အားလုံးပြန်ကြည့်မည်' : 'Reset Filters'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 content-start">
            {filteredProducts.map((product) => {
              const outOfStock = product.stock <= 0;
              const lowStock = !outOfStock && product.stock <= product.minStock;
              const inCartQty = cart.find((c) => c.productId === product.id)?.qty ?? 0;

              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => addProductToCart(product)}
                  className={`text-left rounded-xl border p-3.5 transition-colors flex flex-col justify-between min-h-[124px] cursor-pointer ${
                    outOfStock
                      ? 'border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] opacity-60 cursor-not-allowed'
                      : inCartQty > 0
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] text-[var(--text-muted)] truncate">
                        {CATEGORY_LABELS[product.category][lang]}
                      </span>
                      {inCartQty > 0 && (
                        <span className="font-mono-num text-[11px] font-bold text-[var(--accent-text)] shrink-0">
                          ×{inCartQty}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-sm font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
                      {lang === 'mm' ? product.nameMm : product.nameEn}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate font-mono-num">
                      {product.sku}
                    </p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-[var(--border-subtle)] flex items-baseline justify-between gap-2">
                    <span className="font-mono-num text-sm font-bold text-[var(--text-primary)]">
                      {formatMMK(product.sellPrice, lang)}
                    </span>
                    <span
                      className={`font-mono-num text-[11px] font-medium whitespace-nowrap ${
                        outOfStock
                          ? 'text-red-600 dark:text-red-400'
                          : lowStock
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {outOfStock
                        ? t(UI_TEXT.pos.outOfStock, lang)
                        : `${t(UI_TEXT.pos.inStock, lang)}: ${product.stock}`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Current Order & Checkout */}
      <div className="w-full lg:w-[390px] xl:w-[420px] shrink-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[var(--accent-text)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {t(UI_TEXT.pos.cartTitle, lang)}
            </h2>
            <span className="font-mono-num text-xs text-[var(--text-muted)]">
              · {cart.reduce((a, b) => a + b.qty, 0)}
            </span>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCart([]);
                setDiscountInput('');
                setCashReceivedInput('');
              }}
              className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
            >
              {t(UI_TEXT.pos.clearCart, lang)}
            </button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)] px-4 min-h-[200px] max-h-[340px] lg:max-h-none">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                {t(UI_TEXT.pos.emptyCartTitle, lang)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)] max-w-[240px]">
                {t(UI_TEXT.pos.emptyCartSub, lang)}
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--text-primary)] leading-snug">
                    {lang === 'mm' ? item.nameMm : item.nameEn}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)] font-mono-num">
                    {formatMMK(item.unitPrice, lang)} / {lang === 'mm' ? item.unitMm : item.unitEn}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.productId, item.qty - 1)}
                    aria-label="Decrease quantity"
                    className="w-7 h-7 rounded-md border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-7 text-center font-mono-num text-sm font-semibold text-[var(--text-primary)]">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.productId, item.qty + 1)}
                    aria-label="Increase quantity"
                    className="w-7 h-7 rounded-md border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-right shrink-0 w-24">
                  <div className="font-mono-num text-sm font-semibold text-[var(--text-primary)]">
                    {(item.unitPrice * item.qty).toLocaleString('en-US')}
                  </div>
                  <button
                    type="button"
                    onClick={() => updateCartQty(item.productId, 0)}
                    aria-label="Remove item"
                    className="mt-0.5 inline-flex items-center text-[11px] text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Payment Footer */}
        <div className="border-t border-[var(--border-subtle)] p-4 space-y-3 bg-[var(--bg-surface-subtle)] rounded-b-xl">
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>{t(UI_TEXT.pos.subtotal, lang)}</span>
              <span className="font-mono-num">{formatMMK(subtotal, lang)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="discount-input" className="text-[var(--text-secondary)]">
                {t(UI_TEXT.pos.discount, lang)} (Ks)
              </label>
              <input
                id="discount-input"
                type="number"
                min="0"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder="0"
                className="w-28 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-2.5 py-1 text-right text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-base font-bold text-[var(--text-primary)]">
              <span>{t(UI_TEXT.pos.total, lang)}</span>
              <span className="font-mono-num text-lg text-[var(--accent-text)]">
                {formatMMK(total, lang)}
              </span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t(UI_TEXT.pos.paymentMethod, lang)}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['cash', 'kbzpay', 'wavepay', 'aya_pay'] as PaymentMethod[]).map((method) => {
                const active = paymentMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)]'
                    }`}
                  >
                    {method === 'cash' ? (
                      <Banknote className="w-3.5 h-3.5" />
                    ) : (
                      <CreditCard className="w-3.5 h-3.5" />
                    )}
                    <span className="truncate">{PAYMENT_LABELS[method][lang]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cash Tendered + Quick Banknotes */}
          {paymentMethod === 'cash' && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="cash-received" className="text-xs font-medium text-[var(--text-secondary)]">
                  {t(UI_TEXT.pos.amountReceived, lang)}
                </label>
                <input
                  id="cash-received"
                  type="number"
                  min="0"
                  value={cashReceivedInput}
                  onChange={(e) => setCashReceivedInput(e.target.value)}
                  placeholder={String(total)}
                  className="w-36 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-1.5 text-right text-sm font-mono-num font-semibold focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCashReceivedInput(String(total))}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
                >
                  {t(UI_TEXT.pos.exactAmount, lang)}
                </button>
                {KYAT_BILLS.map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => setCashReceivedInput(String(bill))}
                    className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-mono-num text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
                  >
                    {bill.toLocaleString('en-US')}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[var(--text-secondary)]">{t(UI_TEXT.pos.changeDue, lang)}</span>
                <span
                  className={`font-mono-num font-bold ${
                    isCashShort && cashReceivedInput !== ''
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {formatMMK(changeDue, lang)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={cart.length === 0 || submitting || (paymentMethod === 'cash' && cashReceived < total)}
            onClick={handleCheckout}
            className="w-full rounded-lg bg-[var(--accent-primary)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:bg-[var(--bg-surface-muted)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t(UI_TEXT.pos.checkoutBtn, lang)}
          </button>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={scannerOpen}
        products={products}
        lang={lang}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeLookup}
      />
    </div>
  );
};
