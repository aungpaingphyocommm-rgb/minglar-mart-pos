import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { CATEGORY_LABELS, UI_TEXT, UNIT_PRESETS, t } from '../i18n/translations';
import { Language, Product, ProductCategory } from '../types/pos';
import { generateBarcode } from '../utils/formatters';

interface ProductFormModalProps {
  isOpen: boolean;
  editingProduct: Product | null;
  lang: Language;
  onClose: () => void;
  onSave: (product: Product, isNew: boolean) => Promise<void>;
}

const CATEGORIES: ProductCategory[] = [
  'beverages',
  'snacks',
  'groceries',
  'dairy_chilled',
  'personal_care',
  'household',
];

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  editingProduct,
  lang,
  onClose,
  onSave,
}) => {
  const [sku, setSku] = useState('');
  const [nameMm, setNameMm] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState<ProductCategory>('groceries');
  const [unitIndex, setUnitIndex] = useState(0);
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [minStock, setMinStock] = useState('5');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editingProduct) {
      setSku(editingProduct.sku);
      setNameMm(editingProduct.nameMm);
      setNameEn(editingProduct.nameEn);
      setCategory(editingProduct.category);
      const foundUnitIdx = UNIT_PRESETS.findIndex((u) => u.mm === editingProduct.unitMm);
      setUnitIndex(foundUnitIdx >= 0 ? foundUnitIdx : 0);
      setCostPrice(String(editingProduct.costPrice));
      setSellPrice(String(editingProduct.sellPrice));
      setStock(String(editingProduct.stock));
      setMinStock(String(editingProduct.minStock));
    } else {
      setSku(generateBarcode());
      setNameMm('');
      setNameEn('');
      setCategory('groceries');
      setUnitIndex(0);
      setCostPrice('');
      setSellPrice('');
      setStock('10');
      setMinStock('5');
    }
  }, [isOpen, editingProduct]);

  if (!isOpen) return null;

  const costNum = Number(costPrice) || 0;
  const sellNum = Number(sellPrice) || 0;
  const marginPct = sellNum > 0 ? Math.round(((sellNum - costNum) / sellNum) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameMm.trim() && !nameEn.trim()) {
      setError(lang === 'mm' ? 'ပစ္စည်းအမည် ထည့်သွင်းပါ' : 'Please enter a product name');
      return;
    }
    if (!sku.trim()) {
      setError(lang === 'mm' ? 'SKU / Barcode ထည့်သွင်းပါ' : 'Please enter SKU / Barcode');
      return;
    }
    if (sellNum <= 0) {
      setError(lang === 'mm' ? 'ရောင်းဈေး မှန်ကန်စွာ ထည့်ပါ' : 'Sell price must be greater than 0');
      return;
    }

    setSaving(true);
    try {
      const unit = UNIT_PRESETS[unitIndex] ?? UNIT_PRESETS[0];
      const product: Product = {
        id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
        sku: sku.trim(),
        nameMm: nameMm.trim() || nameEn.trim(),
        nameEn: nameEn.trim() || nameMm.trim(),
        category,
        costPrice: Math.max(0, costNum),
        sellPrice: Math.max(0, sellNum),
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
        minStock: Math.max(0, Math.floor(Number(minStock) || 0)),
        unitMm: unit.mm,
        unitEn: unit.en,
        updatedAt: new Date().toISOString(),
      };
      await onSave(product, !editingProduct);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {editingProduct ? t(UI_TEXT.modals.editProductTitle, lang) : t(UI_TEXT.modals.addProductTitle, lang)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {lang === 'mm' ? 'SKU / Barcode နံပါတ်' : 'SKU / Barcode'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
                placeholder="8850123456789"
              />
              <button
                type="button"
                onClick={() => setSku(generateBarcode())}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{lang === 'mm' ? 'အသစ်ထုတ်' : 'Generate'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'မြန်မာအမည်' : 'Product Name (Myanmar)'}
              </label>
              <input
                type="text"
                value={nameMm}
                onChange={(e) => setNameMm(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
                placeholder="ဥပမာ - ရွှေဖီဦး လက်ဖက်ရည်"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'အင်္ဂလိပ်အမည်' : 'Product Name (English)'}
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
                placeholder="e.g. Shwe Phee Oo Tea"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'အမျိုးအစား' : 'Category'}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat][lang]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'ယူနစ် (Unit)' : 'Selling Unit'}
              </label>
              <select
                value={unitIndex}
                onChange={(e) => setUnitIndex(Number(e.target.value))}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
              >
                {UNIT_PRESETS.map((u, idx) => (
                  <option key={u.en} value={idx}>
                    {u.mm} ({u.en})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'ဝယ်ဈေး (ကျပ်)' : 'Cost (MMK)'}
              </label>
              <input
                type="number"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'ရောင်းဈေး (ကျပ်)' : 'Sell (MMK)'}
              </label>
              <input
                type="number"
                min="0"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'လက်ကျန်စတော့' : 'Stock Qty'}
              </label>
              <input
                type="number"
                min="0"
                disabled={!!editingProduct}
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num disabled:bg-[var(--bg-surface-muted)] disabled:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'သတိပေးအဆင့်' : 'Min Alert'}
              </label>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] px-3.5 py-2.5 text-xs text-[var(--text-secondary)]">
            <span>
              {lang === 'mm' ? 'ခန့်မှန်းအမြတ်နှုန်း (Margin)' : 'Estimated Gross Margin'}
            </span>
            <span className="font-mono-num font-semibold text-[var(--text-primary)]">
              {(sellNum - costNum).toLocaleString('en-US')} Ks ({marginPct}%)
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
            >
              {t(UI_TEXT.modals.cancel, lang)}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 cursor-pointer"
            >
              {t(UI_TEXT.modals.save, lang)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
