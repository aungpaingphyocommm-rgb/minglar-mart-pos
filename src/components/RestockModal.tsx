import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { UI_TEXT, t } from '../i18n/translations';
import { Language, MovementType, Product } from '../types/pos';

interface RestockModalProps {
  product: Product | null;
  lang: Language;
  onClose: () => void;
  onSubmit: (params: {
    product: Product;
    delta: number;
    type: MovementType;
    reason: string;
    newCostPrice?: number;
  }) => Promise<void>;
}

export const RestockModal: React.FC<RestockModalProps> = ({
  product,
  lang,
  onClose,
  onSubmit,
}) => {
  const [mode, setMode] = useState<'restock' | 'deduct'>('restock');
  const [qty, setQty] = useState('12');
  const [costPrice, setCostPrice] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setMode('restock');
      setQty('12');
      setCostPrice(String(product.costPrice));
      setReason('');
    }
  }, [product]);

  if (!product) return null;

  const qtyNum = Math.max(0, Math.floor(Number(qty) || 0));
  const delta = mode === 'restock' ? qtyNum : -qtyNum;
  const previewStock = Math.max(0, product.stock + delta);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qtyNum <= 0) return;
    setSubmitting(true);
    try {
      await onSubmit({
        product,
        delta,
        type: mode === 'restock' ? 'restock' : 'adjustment',
        reason:
          reason.trim() ||
          (mode === 'restock'
            ? lang === 'mm'
              ? 'ကုန်ပစ္စည်း အဝင်ဖြည့်သွင်းမှု'
              : 'Wholesale restock'
            : lang === 'mm'
            ? 'ပျက်စီး/သက်တမ်းလွန် စာရင်းနှုတ်'
            : 'Stock deduction / shrinkage'),
        newCostPrice: mode === 'restock' ? Math.max(0, Number(costPrice) || product.costPrice) : undefined,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {t(UI_TEXT.modals.restockTitle, lang)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {lang === 'mm' ? product.nameMm : product.nameEn}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono-num">
              <span>{product.sku}</span>
              <span>·</span>
              <span>
                {lang === 'mm' ? 'လက်ရှိစတော့:' : 'Current Stock:'} {product.stock}{' '}
                {lang === 'mm' ? product.unitMm : product.unitEn}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--segmented-bg)] rounded-lg">
            <button
              type="button"
              onClick={() => setMode('restock')}
              className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'restock'
                  ? 'bg-[var(--segmented-active)] text-[var(--accent-text)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {lang === 'mm' ? '+ စတော့အဝင်ဖြည့်မည်' : '+ Add Stock'}
            </button>
            <button
              type="button"
              onClick={() => setMode('deduct')}
              className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                mode === 'deduct'
                  ? 'bg-[var(--segmented-active)] text-red-600 dark:text-red-400 shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {lang === 'mm' ? '- စာရင်းနှုတ်မည်' : '- Deduct / Shrinkage'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'အရေအတွက်' : 'Quantity'}
              </label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            {mode === 'restock' && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {lang === 'mm' ? 'ဝယ်ဈေးအသစ် (ကျပ်)' : 'Unit Cost (MMK)'}
                </label>
                <input
                  type="number"
                  min="0"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {lang === 'mm' ? 'မှတ်ချက် / ပေးသွင်းသူ' : 'Reason / Supplier Note'}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === 'restock'
                  ? lang === 'mm'
                    ? 'ဥပမာ - ရန်ကုန်လက်ကားဆိုင်မှ ဝယ်ယူ'
                    : 'e.g. Wholesale delivery'
                  : lang === 'mm'
                  ? 'ဥပမာ - ပစ္စည်းပျက်စီး / ရက်လွန်'
                  : 'e.g. Damaged / Expired'
              }
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] rounded-lg px-3.5 py-2.5">
            <span className="text-[var(--text-secondary)]">
              {lang === 'mm' ? 'ပြောင်းလဲပြီးနောက် လက်ကျန်' : 'Resulting Stock Balance'}
            </span>
            <span className="font-mono-num font-bold text-[var(--text-primary)]">
              {product.stock} → {previewStock} {lang === 'mm' ? product.unitMm : product.unitEn}
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
            >
              {t(UI_TEXT.modals.cancel, lang)}
            </button>
            <button
              type="submit"
              disabled={submitting || qtyNum <= 0}
              className={`rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer ${
                mode === 'restock'
                  ? 'bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)]'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {t(UI_TEXT.modals.save, lang)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
