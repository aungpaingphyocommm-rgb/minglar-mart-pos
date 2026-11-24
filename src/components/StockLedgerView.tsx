import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MOVEMENT_LABELS } from '../i18n/translations';
import { Branch, Language, MovementType, StockMovement } from '../types/pos';
import { formatDateTime } from '../utils/formatters';

interface StockLedgerViewProps {
  movements: StockMovement[];
  branches: Branch[];
  activeBranch: Branch;
  lang: Language;
}

export const StockLedgerView: React.FC<StockLedgerViewProps> = ({
  movements,
  branches,
  activeBranch,
  lang,
}) => {
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all');
  const [branchScope, setBranchScope] = useState<'active' | 'all'>('active');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (branchScope === 'active' && m.branchId && m.branchId !== activeBranch.id) return false;
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (!q) return true;
      return (
        m.productNameMm.toLowerCase().includes(q) ||
        m.productNameEn.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.reason.toLowerCase().includes(q)
      );
    });
  }, [movements, branchScope, activeBranch.id, typeFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {lang === 'mm' ? 'စတော့ အဝင်/အထွက် မှတ်တမ်း' : 'Offline Stock Movement Ledger'}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {lang === 'mm'
              ? 'အရောင်း၊ အဝင်ဖြည့်သွင်းမှုနှင့် ဆိုင်ခွဲစတော့လွှဲပြောင်းမှုတိုင်းကို မှတ်တမ်းတင်ထားသည်'
              : 'Immutable local audit log of sales, restocks, transfers, adjustments, and void returns'}
          </p>
        </div>

        {branches.length > 1 && (
          <div className="inline-flex items-center gap-1 p-1 bg-[var(--segmented-bg)] rounded-lg shrink-0 self-start">
            <button
              type="button"
              onClick={() => setBranchScope('active')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                branchScope === 'active'
                  ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {activeBranch.code}
            </button>
            <button
              type="button"
              onClick={() => setBranchScope('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap ${
                branchScope === 'all'
                  ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {lang === 'mm' ? 'ဆိုင်ခွဲအားလုံး' : 'All Branches'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[var(--segmented-bg)] rounded-lg">
          {(['all', 'sale', 'restock', 'transfer_in', 'transfer_out', 'adjustment', 'void'] as const).map(
            (tKey) => (
              <button
                key={tKey}
                type="button"
                onClick={() => setTypeFilter(tKey)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  typeFilter === tKey
                    ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tKey === 'all'
                  ? lang === 'mm'
                    ? 'အားလုံး'
                    : 'All'
                  : MOVEMENT_LABELS[tKey][lang]}
              </button>
            )
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'mm' ? 'ပစ္စည်း သို့မဟုတ် ဘောင်ချာ ရှာရန်...' : 'Search item or invoice...'}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] pl-9 pr-3 py-2 text-xs focus:border-[var(--accent-primary)] focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                <th className="py-3 px-4">{lang === 'mm' ? 'အချိန်' : 'Timestamp'}</th>
                <th className="py-3 px-4">{lang === 'mm' ? 'ဆိုင်ခွဲ' : 'Branch'}</th>
                <th className="py-3 px-4">{lang === 'mm' ? 'ပစ္စည်း' : 'Product'}</th>
                <th className="py-3 px-4">{lang === 'mm' ? 'အမျိုးအစား' : 'Type'}</th>
                <th className="py-3 px-4 text-right">{lang === 'mm' ? 'အပြောင်းအလဲ' : 'Delta'}</th>
                <th className="py-3 px-4 text-right">{lang === 'mm' ? 'လက်ကျန်' : 'Balance'}</th>
                <th className="py-3 px-4">{lang === 'mm' ? 'မှတ်ချက်' : 'Reference'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-[var(--text-muted)]">
                    {lang === 'mm' ? 'မှတ်တမ်း မရှိသေးပါ' : 'No stock movements recorded yet'}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-[var(--bg-surface-subtle)]">
                    <td className="py-3 px-4 font-mono-num text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {formatDateTime(m.createdAt, lang)}
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                      {lang === 'mm'
                        ? m.branchNameMm ?? activeBranch.nameMm
                        : m.branchNameEn ?? activeBranch.nameEn}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[var(--text-primary)]">
                        {lang === 'mm' ? m.productNameMm : m.productNameEn}
                      </div>
                      <div className="font-mono-num text-[11px] text-[var(--text-muted)]">{m.sku}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap">
                      {MOVEMENT_LABELS[m.type][lang]}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-num font-bold whitespace-nowrap ${
                        m.delta >= 0
                          ? 'text-[var(--accent-text)]'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {m.delta >= 0 ? `+${m.delta}` : m.delta}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-xs text-[var(--text-secondary)] whitespace-nowrap">
                      {m.previousStock} → <strong className="text-[var(--text-primary)]">{m.newStock}</strong>
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                      <span>{m.reason}</span>
                      {!m.synced && (
                        <span className="ml-2 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                          · {lang === 'mm' ? 'Offline' : 'Pending Sync'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
