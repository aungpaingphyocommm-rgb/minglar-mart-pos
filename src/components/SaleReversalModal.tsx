import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Square,
  X,
} from 'lucide-react';
import { PAYMENT_LABELS, UI_TEXT, t } from '../i18n/translations';
import { Branch, Language, Sale } from '../types/pos';
import { formatDateTime, formatMMK } from '../utils/formatters';

interface SaleReversalModalProps {
  isOpen: boolean;
  initialSale: Sale | null;
  sales: Sale[];
  branches: Branch[];
  activeBranch: Branch;
  lang: Language;
  onClose: () => void;
  onConfirmReversal: (params: {
    saleId: string;
    itemsToReturn: Array<{ productId: string; qty: number }>;
    reason: string;
    restoreStock: boolean;
  }) => Promise<void>;
}

const REASON_PRESETS = [
  { id: 'customer_return', mm: 'ဖောက်သည် ပြန်အမ်း', en: 'Customer Return' },
  { id: 'wrong_item', mm: 'ပစ္စည်းမှားယွင်း', en: 'Wrong Item' },
  { id: 'damaged', mm: 'ပျက်စီး / ရက်လွန်', en: 'Damaged / Expired' },
  { id: 'billing_error', mm: 'ငွေစာရင်းမှားယွင်း', en: 'Billing Error' },
];

export function hasReturnableItems(sale: Sale): boolean {
  if (sale.status === 'voided' || Boolean(sale.reversalOfInvoiceNo)) return false;
  return sale.items.some((item) => {
    const returned = sale.reversedItems?.[item.productId] ?? 0;
    return item.qty - returned > 0;
  });
}

export const SaleReversalModal: React.FC<SaleReversalModalProps> = ({
  isOpen,
  initialSale,
  sales,
  branches,
  activeBranch,
  lang,
  onClose,
  onConfirmReversal,
}) => {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<'active' | 'all'>('active');
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [restoreStock, setRestoreStock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reversibleSales = useMemo(
    () => sales.filter(hasReturnableItems),
    [sales]
  );

  const selectedSale = useMemo(
    () => sales.find((s) => s.id === selectedSaleId) ?? null,
    [sales, selectedSaleId]
  );

  // Sync state when modal opens or initialSale changes
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setInvoiceSearch('');
    setReason(REASON_PRESETS[0][lang]);
    setRestoreStock(true);

    if (initialSale && hasReturnableItems(initialSale)) {
      setSelectedSaleId(initialSale.id);
      const initialMap: Record<string, number> = {};
      initialSale.items.forEach((item) => {
        const rem = Math.max(0, item.qty - (initialSale.reversedItems?.[item.productId] ?? 0));
        initialMap[item.productId] = rem;
      });
      setReturnQtys(initialMap);
    } else {
      setSelectedSaleId(null);
      setReturnQtys({});
      setBranchFilter(branches.length > 1 ? 'active' : 'all');
    }
  }, [isOpen, initialSale, lang, branches.length]);

  const handleSelectInvoice = (sale: Sale) => {
    setSelectedSaleId(sale.id);
    setErrorMsg(null);
    const initialMap: Record<string, number> = {};
    sale.items.forEach((item) => {
      const rem = Math.max(0, item.qty - (sale.reversedItems?.[item.productId] ?? 0));
      initialMap[item.productId] = rem;
    });
    setReturnQtys(initialMap);
  };

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return reversibleSales.filter((sale) => {
      if (branchFilter === 'active' && sale.branchId && sale.branchId !== activeBranch.id) {
        return false;
      }
      if (!q) return true;
      if (sale.invoiceNo.toLowerCase().includes(q)) return true;
      return sale.items.some(
        (item) =>
          item.nameEn.toLowerCase().includes(q) ||
          item.nameMm.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q)
      );
    });
  }, [reversibleSales, branchFilter, activeBranch.id, invoiceSearch]);

  const summary = useMemo(() => {
    if (!selectedSale) {
      return { totalUnits: 0, rawSubtotal: 0, proportionalDiscount: 0, refundTotal: 0, isFull: false };
    }
    let totalUnits = 0;
    let rawSubtotal = 0;
    const prevReversed = selectedSale.reversedItems ?? {};
    let returningAllRemaining = true;

    selectedSale.items.forEach((item) => {
      const remaining = Math.max(0, item.qty - (prevReversed[item.productId] ?? 0));
      const qty = Math.min(Math.max(0, returnQtys[item.productId] ?? 0), remaining);
      if (qty < remaining) {
        returningAllRemaining = false;
      }
      totalUnits += qty;
      rawSubtotal += item.unitPrice * qty;
    });

    const isUnreversedFull =
      Object.keys(prevReversed).length === 0 && returningAllRemaining && totalUnits > 0;
    const discountRatio =
      selectedSale.subtotal > 0 ? selectedSale.discount / selectedSale.subtotal : 0;
    const proportionalDiscount = isUnreversedFull
      ? selectedSale.discount
      : Math.round(rawSubtotal * discountRatio);
    const refundTotal = isUnreversedFull
      ? selectedSale.total
      : Math.max(0, rawSubtotal - proportionalDiscount);

    return {
      totalUnits,
      rawSubtotal,
      proportionalDiscount,
      refundTotal,
      isFull: isUnreversedFull,
    };
  }, [selectedSale, returnQtys]);

  if (!isOpen) return null;

  const setQtyForItem = (productId: string, nextQty: number, maxQty: number) => {
    const clamped = Math.min(Math.max(0, Math.floor(nextQty) || 0), maxQty);
    setReturnQtys((prev) => ({ ...prev, [productId]: clamped }));
  };

  const handleSelectAllRemaining = () => {
    if (!selectedSale) return;
    const next: Record<string, number> = {};
    selectedSale.items.forEach((item) => {
      next[item.productId] = Math.max(0, item.qty - (selectedSale.reversedItems?.[item.productId] ?? 0));
    });
    setReturnQtys(next);
  };

  const handleClearQuantities = () => {
    if (!selectedSale) return;
    const next: Record<string, number> = {};
    selectedSale.items.forEach((item) => {
      next[item.productId] = 0;
    });
    setReturnQtys(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale || summary.totalUnits <= 0 || submitting) return;

    const itemsToReturn = selectedSale.items
      .map((item) => ({
        productId: item.productId,
        qty: returnQtys[item.productId] ?? 0,
      }))
      .filter((i) => i.qty > 0);

    if (itemsToReturn.length === 0) {
      setErrorMsg(
        lang === 'mm'
          ? 'ပြန်အမ်းမည့် ပစ္စည်းအရေအတွက် ရွေးချယ်ပါ'
          : 'Select at least one item quantity to reverse'
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onConfirmReversal({
        saleId: selectedSale.id,
        itemsToReturn,
        reason: reason.trim() || REASON_PRESETS[0][lang],
        restoreStock,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : lang === 'mm'
          ? 'အရောင်းပြန်အမ်းရာတွင် အမှားဖြစ်ပွားပါသည်'
          : 'Failed to process sale reversal'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden my-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 bg-[var(--bg-surface-subtle)]">
          <div className="flex items-center gap-2.5">
            {selectedSale && !initialSale && (
              <button
                type="button"
                onClick={() => setSelectedSaleId(null)}
                aria-label={lang === 'mm' ? 'ဘောင်ချာစာရင်းသို့ ပြန်သွားမည်' : 'Back to invoice list'}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <RotateCcw className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {lang === 'mm' ? 'အရောင်းပြန်အမ်း / ပယ်ဖျက်ခြင်း' : 'Sale Reversal & Refund'}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {selectedSale
                  ? `${selectedSale.invoiceNo} · ${formatDateTime(selectedSale.createdAt, lang)}`
                  : lang === 'mm'
                  ? 'ပြန်အမ်းမည့် ဘောင်ချာကို ရွေးချယ်ပါ'
                  : 'Select a completed invoice to reverse full or partial items'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(UI_TEXT.modals.close, lang)}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Select Reversible Invoice */}
        {!selectedSale ? (
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder={
                    lang === 'mm'
                      ? 'ဘောင်ချာနံပါတ် သို့မဟုတ် ပစ္စည်းအမည်ဖြင့် ရှာပါ...'
                      : 'Search by invoice number, item name, or SKU...'
                  }
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-10 pr-4 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              {branches.length > 1 && (
                <div className="flex items-center gap-1 p-1 bg-[var(--segmented-bg)] rounded-lg shrink-0">
                  <button
                    type="button"
                    onClick={() => setBranchFilter('active')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                      branchFilter === 'active'
                        ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {activeBranch.code}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBranchFilter('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                      branchFilter === 'all'
                        ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {lang === 'mm' ? 'အားလုံး' : 'All'}
                  </button>
                </div>
              )}
            </div>

            <div className="max-h-[380px] overflow-y-auto divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {filteredInvoices.length === 0 ? (
                <div className="py-12 px-4 text-center text-sm text-[var(--text-muted)]">
                  {lang === 'mm'
                    ? 'ပြန်အမ်းနိုင်သော ဘောင်ချာ မတွေ့ပါ'
                    : 'No reversible invoices found'}
                </div>
              ) : (
                filteredInvoices.map((sale) => {
                  const totalUnits = sale.items.reduce((s, i) => s + i.qty, 0);
                  const alreadyReversedUnits = Object.values(sale.reversedItems ?? {}).reduce(
                    (s, q) => s + q,
                    0
                  );
                  return (
                    <button
                      key={sale.id}
                      type="button"
                      onClick={() => handleSelectInvoice(sale)}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--bg-surface-subtle)] transition-colors flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-num text-sm font-semibold text-[var(--text-primary)]">
                            {sale.invoiceNo}
                          </span>
                          {alreadyReversedUnits > 0 && (
                            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                              · {lang === 'mm' ? 'တစ်စိတ်တစ်ပိုင်း ပြန်အမ်းပြီး' : 'Partially Returned'}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--text-muted)] truncate">
                          {lang === 'mm'
                            ? sale.branchNameMm ?? activeBranch.nameMm
                            : sale.branchNameEn ?? activeBranch.nameEn}{' '}
                          · {formatDateTime(sale.createdAt, lang)} ·{' '}
                          {PAYMENT_LABELS[sale.paymentMethod][lang]} · {totalUnits}{' '}
                          {lang === 'mm' ? 'ခု' : 'items'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono-num text-sm font-bold text-[var(--text-primary)]">
                          {formatMMK(sale.total, lang)}
                        </div>
                        <div className="text-[11px] font-medium text-[var(--accent-text)]">
                          {lang === 'mm' ? 'ရွေးချယ်မည် →' : 'Select →'}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
              >
                {t(UI_TEXT.modals.close, lang)}
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Configure Reversal Quantities, Reason & Stock Restoration */
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Invoice Info Bar */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">
                  {lang === 'mm'
                    ? selectedSale.branchNameMm ?? activeBranch.nameMm
                    : selectedSale.branchNameEn ?? activeBranch.nameEn}
                </span>
                <span className="mx-2 text-[var(--border-strong)]">·</span>
                <span>{PAYMENT_LABELS[selectedSale.paymentMethod][lang]}</span>
                <span className="mx-2 text-[var(--border-strong)]">·</span>
                <span className="font-mono-num">
                  {lang === 'mm' ? 'မူလကျသင့်ငွေ' : 'Original'}: {formatMMK(selectedSale.total, lang)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllRemaining}
                  className="text-xs font-medium text-[var(--accent-text)] hover:underline cursor-pointer whitespace-nowrap"
                >
                  {lang === 'mm' ? 'အားလုံးပြန်အမ်း' : 'Select Full Invoice'}
                </button>
                <span className="text-[var(--border-strong)]">·</span>
                <button
                  type="button"
                  onClick={handleClearQuantities}
                  className="text-xs font-medium text-[var(--text-muted)] hover:underline cursor-pointer whitespace-nowrap"
                >
                  {lang === 'mm' ? 'ရှင်းလင်းမည်' : 'Clear'}
                </button>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="max-h-[250px] overflow-y-auto rounded-xl border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
              {selectedSale.items.map((item) => {
                const alreadyReturned = selectedSale.reversedItems?.[item.productId] ?? 0;
                const remaining = Math.max(0, item.qty - alreadyReturned);
                const qtyToReturn = returnQtys[item.productId] ?? 0;
                const lineRefund = item.unitPrice * qtyToReturn;

                return (
                  <div
                    key={item.productId}
                    className={`px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 ${
                      remaining === 0 ? 'opacity-50 bg-[var(--bg-surface-muted)]' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {lang === 'mm' ? item.nameMm : item.nameEn}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)] font-mono-num">
                        {formatMMK(item.unitPrice, lang)} · {lang === 'mm' ? 'ရောင်း' : 'Sold'}: {item.qty}
                        {alreadyReturned > 0 &&
                          ` · ${lang === 'mm' ? 'ပြန်အမ်းပြီး' : 'Returned'}: ${alreadyReturned}`}
                        {` · ${lang === 'mm' ? 'ကျန်' : 'Returnable'}: ${remaining}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={remaining === 0 || qtyToReturn <= 0}
                        onClick={() => setQtyForItem(item.productId, qtyToReturn - 1, remaining)}
                        aria-label="Decrease return quantity"
                        className="w-7 h-7 rounded-md border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] disabled:opacity-40 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        disabled={remaining === 0}
                        value={qtyToReturn}
                        onChange={(e) =>
                          setQtyForItem(item.productId, Number(e.target.value), remaining)
                        }
                        className="w-12 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center font-mono-num text-sm font-semibold text-[var(--text-primary)] py-1 focus:border-[var(--accent-primary)] focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={remaining === 0 || qtyToReturn >= remaining}
                        onClick={() => setQtyForItem(item.productId, qtyToReturn + 1, remaining)}
                        aria-label="Increase return quantity"
                        className="w-7 h-7 rounded-md border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="w-24 text-right font-mono-num text-sm font-semibold text-[var(--text-primary)] shrink-0">
                      {qtyToReturn > 0 ? `-${lineRefund.toLocaleString('en-US')}` : '0'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reversal Reason */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                {lang === 'mm' ? 'ပြန်အမ်း / ပယ်ဖျက်ရသည့် အကြောင်းအရင်း' : 'Reversal Reason'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {REASON_PRESETS.map((preset) => {
                  const text = preset[lang];
                  const active = reason === text;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setReason(text)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)]'
                      }`}
                    >
                      {text}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  lang === 'mm' ? 'အကြောင်းအရင်း ရိုက်ထည့်ပါ...' : 'Enter reversal reason...'
                }
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            {/* Restore Stock Toggle */}
            <button
              type="button"
              onClick={() => setRestoreStock((v) => !v)}
              className="w-full flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-3.5 py-2.5 text-left cursor-pointer hover:bg-[var(--bg-surface-muted)] transition-colors"
            >
              {restoreStock ? (
                <CheckSquare className="w-4 h-4 text-[var(--accent-text)] mt-0.5 shrink-0" />
              ) : (
                <Square className="w-4 h-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
              )}
              <div>
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  {lang === 'mm'
                    ? 'ပြန်အမ်းပစ္စည်းများကို ဆိုင်ခွဲစတော့ထဲသို့ ပြန်ပေါင်းထည့်မည်'
                    : 'Restore returned items to branch inventory'}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {lang === 'mm'
                    ? 'ပျက်စီး/ရက်လွန်ပစ္စည်း ဖြစ်ပါက အမှန်ခြစ်ဖြုတ်ထားနိုင်ပါသည်'
                    : 'Uncheck if items are damaged or expired and cannot be resold'}
                </div>
              </div>
            </button>

            {/* Refund Total Summary */}
            <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 p-4 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span>
                  {lang === 'mm' ? 'ပြန်အမ်းမည့် ပစ္စည်းအရေအတွက်' : 'Items to Reverse'}
                </span>
                <span className="font-mono-num font-semibold text-[var(--text-primary)]">
                  {summary.totalUnits} {lang === 'mm' ? 'ခု' : 'units'}
                  {summary.isFull
                    ? lang === 'mm'
                      ? ' (ဘောင်ချာအပြည့်)'
                      : ' (Full Invoice)'
                    : ''}
                </span>
              </div>
              {summary.proportionalDiscount > 0 && (
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>{lang === 'mm' ? 'လျှော့ဈေး ပြန်နုတ်' : 'Proportional Discount'}</span>
                  <span className="font-mono-num">
                    -{formatMMK(summary.proportionalDiscount, lang)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-red-200 dark:border-red-900/50 text-sm font-bold">
                <span className="text-red-700 dark:text-red-300">
                  {lang === 'mm' ? 'ဖောက်သည်သို့ ပြန်အမ်းငွေ' : 'Total Refund Amount'}
                </span>
                <span className="font-mono-num text-base text-red-700 dark:text-red-300">
                  {formatMMK(summary.refundTotal, lang)}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3.5 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
              >
                {t(UI_TEXT.modals.cancel, lang)}
              </button>
              <button
                type="submit"
                disabled={summary.totalUnits <= 0 || submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                <span>
                  {lang === 'mm' ? 'အရောင်းပြန်အမ်း အတည်ပြုမည်' : 'Confirm Sale Reversal'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
