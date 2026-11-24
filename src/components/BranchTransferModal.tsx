import React, { useEffect, useState } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import { Branch, Language, Product } from '../types/pos';

interface BranchTransferModalProps {
  product: Product | null;
  branches: Branch[];
  activeBranchId: string;
  lang: Language;
  onClose: () => void;
  onTransfer: (params: {
    product: Product;
    fromBranch: Branch;
    toBranch: Branch;
    qty: number;
    reason: string;
  }) => Promise<void>;
}

export const BranchTransferModal: React.FC<BranchTransferModalProps> = ({
  product,
  branches,
  activeBranchId,
  lang,
  onClose,
  onTransfer,
}) => {
  const [fromId, setFromId] = useState(activeBranchId);
  const [toId, setToId] = useState('');
  const [qty, setQty] = useState('5');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!product || branches.length < 2) return;
    setFromId(activeBranchId);
    const other = branches.find((b) => b.id !== activeBranchId) ?? branches[0];
    setToId(other.id);
    setQty('5');
    setReason('');
  }, [product, branches, activeBranchId]);

  if (!product) return null;

  const fromBranch = branches.find((b) => b.id === fromId) ?? branches[0];
  const toBranch = branches.find((b) => b.id === toId) ?? branches.find((b) => b.id !== fromBranch.id);

  const getStockFor = (bId: string) => product.branchStocks?.[bId] ?? (bId === activeBranchId ? product.stock : 0);
  const sourceStock = fromBranch ? getStockFor(fromBranch.id) : 0;
  const destStock = toBranch ? getStockFor(toBranch.id) : 0;
  const qtyNum = Math.max(0, Math.floor(Number(qty) || 0));
  const invalidTransfer = !fromBranch || !toBranch || fromBranch.id === toBranch.id || qtyNum <= 0 || qtyNum > sourceStock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalidTransfer || !toBranch) return;
    setSubmitting(true);
    try {
      await onTransfer({
        product,
        fromBranch,
        toBranch,
        qty: qtyNum,
        reason:
          reason.trim() ||
          `${fromBranch.code} → ${toBranch.code} (${lang === 'mm' ? 'ဆိုင်ခွဲစတော့လွှဲပြောင်းမှု' : 'Branch transfer'})`,
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
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-[var(--accent-text)]" />
            <h2 className="text-base font-semibold">
              {lang === 'mm' ? 'ဆိုင်ခွဲ စတော့လွှဲပြောင်းခြင်း' : 'Inter-Branch Stock Transfer'}
            </h2>
          </div>
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
            <div className="mt-1 font-mono-num text-xs text-[var(--text-muted)]">{product.sku}</div>
          </div>

          {branches.length < 2 ? (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-300">
              {lang === 'mm'
                ? 'စတော့လွှဲပြောင်းရန် ဆိုင်ခွဲ အနည်းဆုံး ၂ ခု ရှိရန် လိုအပ်ပါသည်။ Settings တွင် ဆိုင်ခွဲအသစ် ထည့်သွင်းပါ။'
                : 'Add at least 2 store branches in Settings to transfer stock between locations.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {lang === 'mm' ? 'ပေးပို့မည့်ဆိုင်ခွဲ (From)' : 'Source Branch'}
                  </label>
                  <select
                    value={fromId}
                    onChange={(e) => {
                      const nextFrom = e.target.value;
                      setFromId(nextFrom);
                      if (nextFrom === toId) {
                        const alt = branches.find((b) => b.id !== nextFrom);
                        if (alt) setToId(alt.id);
                      }
                    }}
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-xs focus:border-[var(--accent-primary)] focus:outline-none"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} · {lang === 'mm' ? b.nameMm : b.nameEn} ({getStockFor(b.id)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    {lang === 'mm' ? 'လက်ခံမည့်ဆိုင်ခွဲ (To)' : 'Destination Branch'}
                  </label>
                  <select
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-xs focus:border-[var(--accent-primary)] focus:outline-none"
                  >
                    {branches
                      .filter((b) => b.id !== fromId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code} · {lang === 'mm' ? b.nameMm : b.nameEn} ({getStockFor(b.id)})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {lang === 'mm' ? 'လွှဲပြောင်းမည့် အရေအတွက်' : 'Quantity to Transfer'}
                </label>
                <input
                  type="number"
                  min="1"
                  max={sourceStock}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
                />
                {qtyNum > sourceStock && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    {lang === 'mm'
                      ? `ပေးပို့ဆိုင်ခွဲတွင် ${sourceStock} သာ ကျန်ရှိပါသည်`
                      : `Only ${sourceStock} available at source branch`}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  {lang === 'mm' ? 'မှတ်ချက်' : 'Transfer Note'}
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={lang === 'mm' ? 'ဥပမာ - ကားဖြင့်ပို့ဆောင်' : 'e.g. Afternoon stock transfer'}
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              {toBranch && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">{fromBranch.code}:</span>
                    <span className="font-mono-num font-semibold">
                      {sourceStock} → {Math.max(0, sourceStock - qtyNum)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">{toBranch.code}:</span>
                    <span className="font-mono-num font-semibold text-[var(--accent-text)]">
                      {destStock} → {destStock + Math.min(qtyNum, sourceStock)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
            >
              {lang === 'mm' ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting || invalidTransfer}
              className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:bg-[var(--bg-surface-muted)] disabled:text-[var(--text-muted)] cursor-pointer"
            >
              {lang === 'mm' ? 'လွှဲပြောင်းမည်' : 'Transfer Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
