import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Download,
  Edit3,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { CATEGORY_LABELS, UI_TEXT, t } from '../i18n/translations';
import { Branch, Language, Product, ProductCategory } from '../types/pos';
import { downloadCSV, formatMMK } from '../utils/formatters';

interface InventoryViewProps {
  products: Product[];
  branches: Branch[];
  activeBranch: Branch;
  lang: Language;
  onAddNew: () => void;
  onImportCsv: () => void;
  onEdit: (product: Product) => void;
  onRestock: (product: Product) => void;
  onTransfer: (product: Product) => void;
  onDelete: (productId: string) => Promise<void>;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  branches,
  activeBranch,
  lang,
  onAddNew,
  onImportCsv,
  onEdit,
  onRestock,
  onTransfer,
  onDelete,
}) => {
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const totalSkus = products.length;
    const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);
    const totalCostValue = products.reduce((sum, p) => sum + p.stock * p.costPrice, 0);
    const alertCount = products.filter((p) => p.stock <= p.minStock).length;
    return { totalSkus, totalUnits, totalCostValue, alertCount };
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (stockFilter === 'low' && (p.stock <= 0 || p.stock > p.minStock)) return false;
      if (stockFilter === 'out' && p.stock > 0) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.nameMm.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    });
  }, [products, stockFilter, categoryFilter, search]);

  const handleExportCsv = () => {
    const headers = [
      'SKU',
      'Name (MM)',
      'Name (EN)',
      'Category',
      'Unit',
      'Cost (MMK)',
      'Sell Price (MMK)',
      'Stock',
      'Min Alert',
    ];
    const rows = filtered.map((p) => [
      p.sku,
      p.nameMm,
      p.nameEn,
      CATEGORY_LABELS[p.category][lang],
      p.unitEn,
      p.costPrice,
      p.sellPrice,
      p.stock,
      p.minStock,
    ]);
    downloadCSV(`inventory-${activeBranch.code}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{t(UI_TEXT.inventory.title, lang)}</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {lang === 'mm' ? 'လက်ရှိဆိုင်ခွဲ:' : 'Active Branch:'}{' '}
            <span className="font-medium text-[var(--text-secondary)]">
              {activeBranch.code} · {lang === 'mm' ? activeBranch.nameMm : activeBranch.nameEn}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onImportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{lang === 'mm' ? 'CSV မှတင်သွင်းမည်' : 'Import CSV'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t(UI_TEXT.inventory.exportCsv, lang)}</span>
          </button>
          <button
            type="button"
            onClick={onAddNew}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-primary-hover)] cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t(UI_TEXT.inventory.addProduct, lang)}</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {t(UI_TEXT.inventory.totalSkus, lang)}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[var(--text-primary)]">
            {stats.totalSkus}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {t(UI_TEXT.inventory.totalUnits, lang)} ({activeBranch.code})
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[var(--text-primary)]">
            {stats.totalUnits.toLocaleString('en-US')}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {t(UI_TEXT.inventory.inventoryValue, lang)}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[var(--text-primary)]">
            {formatMMK(stats.totalCostValue, lang)}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {t(UI_TEXT.inventory.lowAlerts, lang)}
          </div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono-num flex items-center gap-2 ${
              stats.alertCount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-[var(--accent-text)]'
            }`}
          >
            <span>{stats.alertCount}</span>
            {stats.alertCount > 0 && <AlertTriangle className="w-4 h-4 shrink-0" />}
          </div>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[var(--segmented-bg)] rounded-lg">
            {(['all', 'low', 'out'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStockFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  stockFilter === f
                    ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {f === 'all'
                  ? t(UI_TEXT.inventory.filterAll, lang)
                  : f === 'low'
                  ? t(UI_TEXT.inventory.filterLow, lang)
                  : t(UI_TEXT.inventory.filterOut, lang)}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ProductCategory | 'all')}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] focus:border-[var(--accent-primary)] focus:outline-none"
          >
            {(Object.keys(CATEGORY_LABELS) as Array<ProductCategory | 'all'>).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat][lang]}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'mm' ? 'ပစ္စည်းအမည် သို့မဟုတ် SKU ရှာရန်...' : 'Search name or SKU...'}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] pl-9 pr-3 py-2 text-xs focus:border-[var(--accent-primary)] focus:outline-none"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                <th className="py-3 px-4">{t(UI_TEXT.inventory.skuCol, lang)}</th>
                <th className="py-3 px-4">{t(UI_TEXT.inventory.nameCol, lang)}</th>
                <th className="py-3 px-4">{t(UI_TEXT.inventory.categoryCol, lang)}</th>
                <th className="py-3 px-4 text-right">{t(UI_TEXT.inventory.costCol, lang)}</th>
                <th className="py-3 px-4 text-right">{t(UI_TEXT.inventory.sellCol, lang)}</th>
                <th className="py-3 px-4 text-right">{t(UI_TEXT.inventory.stockCol, lang)}</th>
                <th className="py-3 px-4 text-right">{t(UI_TEXT.inventory.actionsCol, lang)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-[var(--text-muted)]">
                    {lang === 'mm' ? 'ကုန်ပစ္စည်း မတွေ့ပါ' : 'No products match your filter'}
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const isOut = product.stock <= 0;
                  const isLow = !isOut && product.stock <= product.minStock;
                  const margin =
                    product.sellPrice > 0
                      ? Math.round(((product.sellPrice - product.costPrice) / product.sellPrice) * 100)
                      : 0;
                  const totalAllBranches = branches.reduce(
                    (acc, b) => acc + (product.branchStocks?.[b.id] ?? (b.id === activeBranch.id ? product.stock : 0)),
                    0
                  );

                  return (
                    <tr key={product.id} className="hover:bg-[var(--bg-surface-subtle)] transition-colors">
                      <td className="py-3 px-4 font-mono-num text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {product.sku}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[var(--text-primary)]">
                          {lang === 'mm' ? product.nameMm : product.nameEn}
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {lang === 'mm' ? product.nameEn : product.nameMm}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {CATEGORY_LABELS[product.category][lang]}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {product.costPrice.toLocaleString('en-US')}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="font-mono-num text-sm font-semibold text-[var(--text-primary)]">
                          {product.sellPrice.toLocaleString('en-US')}
                        </div>
                        <div className="font-mono-num text-[11px] text-[var(--text-muted)]">
                          {margin}% margin
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div
                          className={`font-mono-num text-sm font-bold ${
                            isOut
                              ? 'text-red-600 dark:text-red-400'
                              : isLow
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {product.stock} {lang === 'mm' ? product.unitMm : product.unitEn}
                        </div>
                        {branches.length > 1 && (
                          <div className="font-mono-num text-[11px] text-[var(--text-muted)]">
                            {lang === 'mm' ? 'စုစုပေါင်း' : 'All'}: {totalAllBranches}
                          </div>
                        )}
                        {(isOut || isLow) && (
                          <div
                            className={`text-[11px] font-medium ${
                              isOut
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {isOut
                              ? t(UI_TEXT.pos.outOfStock, lang)
                              : t(UI_TEXT.pos.lowStock, lang)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onRestock(product)}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent-text)] hover:bg-[var(--accent-soft-hover)] cursor-pointer"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span>{t(UI_TEXT.inventory.restock, lang)}</span>
                          </button>
                          {branches.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onTransfer(product)}
                              title={lang === 'mm' ? 'ဆိုင်ခွဲ စတော့လွှဲမည်' : 'Transfer between branches'}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEdit(product)}
                            aria-label={t(UI_TEXT.inventory.edit, lang)}
                            className="rounded-md border border-[var(--border-subtle)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {confirmDeleteId === product.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await onDelete(product.id);
                                setConfirmDeleteId(null);
                              }}
                              className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 cursor-pointer"
                            >
                              {lang === 'mm' ? 'ဖျက်ရန်သေချာ' : 'Confirm'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(product.id)}
                              aria-label={t(UI_TEXT.inventory.delete, lang)}
                              className="rounded-md border border-[var(--border-subtle)] p-1.5 text-[var(--text-muted)] hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
