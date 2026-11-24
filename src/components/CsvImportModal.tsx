import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { CATEGORY_LABELS } from '../i18n/translations';
import { Language, Product } from '../types/pos';
import { CsvImportCandidate, parseInventoryCsv } from '../utils/csvParser';
import { downloadCSV } from '../utils/formatters';

interface CsvImportModalProps {
  isOpen: boolean;
  products: Product[];
  lang: Language;
  onClose: () => void;
  onConfirmImport: (params: {
    items: CsvImportCandidate[];
    stockMode: 'replace' | 'add';
  }) => Promise<{ created: number; updated: number }>;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  products,
  lang,
  onClose,
  onConfirmImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [candidates, setCandidates] = useState<CsvImportCandidate[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [stockMode, setStockMode] = useState<'replace' | 'add'>('add');
  const [importing, setImporting] = useState(false);

  const validCandidates = useMemo(
    () => candidates.filter((c) => !c.error),
    [candidates]
  );
  const errorCount = candidates.length - validCandidates.length;
  const newCount = validCandidates.filter((c) => !c.existingProduct).length;
  const updateCount = validCandidates.filter((c) => !!c.existingProduct).length;

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
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
    const sampleRows = [
      ['8850124990011', 'မင်းသား ငါးပိရည်ကျို 200g', 'Min Thar Fish Paste 200g', 'Groceries', 'bottle', 2200, 2700, 20, 5],
      ['8850987990028', 'Royal D ဓာတ်ဆားထုပ်', 'Royal D Electrolyte Sachet', 'Beverages', 'pack', 450, 600, 45, 12],
      ['8851234990035', 'Lifebuoy ဆပ်ပြာခဲ 115g', 'Lifebuoy Soap Bar 115g', 'Personal Care', 'pcs', 1400, 1800, 18, 6],
    ];
    downloadCSV('mingalar-mart-inventory-template.csv', headers, sampleRows);
  };

  const handleFileSelected = async (file: File) => {
    setFileName(file.name);
    setParseError(null);
    try {
      const text = await file.text();
      const { candidates: parsed, missingHeadersError } = parseInventoryCsv(text, products);
      if (missingHeadersError) {
        setParseError(missingHeadersError);
        setCandidates([]);
        return;
      }
      setCandidates(parsed);
    } catch {
      setParseError(
        lang === 'mm' ? 'CSV ဖိုင် ဖတ်ရှု၍မရပါ' : 'Unable to read CSV file'
      );
      setCandidates([]);
    }
  };

  const handleResetAndClose = () => {
    setFileName('');
    setCandidates([]);
    setParseError(null);
    onClose();
  };

  const handleImportSubmit = async () => {
    if (validCandidates.length === 0 || importing) return;
    setImporting(true);
    try {
      await onConfirmImport({ items: validCandidates, stockMode });
      handleResetAndClose();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-[var(--accent-text)]" />
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {lang === 'mm'
                  ? 'CSV ဖိုင်မှ ကုန်ပစ္စည်းများ အစုလိုက်တင်သွင်းရန်'
                  : 'Bulk Import Inventory from CSV'}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {lang === 'mm'
                  ? 'Excel / CSV ဖိုင်ဖြင့် ပစ္စည်းအသစ်ထည့်ခြင်းနှင့် လက်ကျန်စတော့ဖြည့်ခြင်းများကို တစ်ပြိုင်နက်လုပ်ဆောင်နိုင်သည်'
                  : 'Upload an exported inventory CSV or template to add new SKUs and update existing stock'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Upload + Template Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface-subtle)] p-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {fileName
                  ? fileName
                  : lang === 'mm'
                  ? 'CSV ဖိုင် ရွေးချယ်တင်သွင်းပါ'
                  : 'Select a .csv file to preview'}
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {lang === 'mm'
                  ? 'လိုအပ်သောကော်လံများ: SKU, Name (MM), Name (EN), Category, Unit, Cost, Sell Price, Stock'
                  : 'Columns: SKU, Name (MM), Name (EN), Category, Unit, Cost (MMK), Sell Price (MMK), Stock, Min Alert'}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{lang === 'mm' ? 'နမူနာ CSV ဒေါင်းလုဒ်' : 'Sample CSV'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-primary-hover)] cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{lang === 'mm' ? 'CSV ဖိုင်ရွေးမည်' : 'Choose CSV File'}</span>
              </button>
            </div>
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Existing SKU Handling + Preview Summary */}
          {candidates.length > 0 && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] px-4 py-3 text-xs">
                <div className="flex flex-wrap items-center gap-3 font-medium">
                  <span className="inline-flex items-center gap-1 text-[var(--accent-text)]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {lang === 'mm' ? `အသစ် ${newCount} မျိုး` : `${newCount} new`}
                  </span>
                  <span className="text-[var(--border-strong)]">·</span>
                  <span className="text-[var(--text-primary)]">
                    {lang === 'mm' ? `ပြင်ဆင်မည် ${updateCount} မျိုး` : `${updateCount} existing updates`}
                  </span>
                  {errorCount > 0 && (
                    <>
                      <span className="text-[var(--border-strong)]">·</span>
                      <span className="text-red-600 dark:text-red-400">
                        {lang === 'mm' ? `အမှား ${errorCount} ကြောင်း ကျော်မည်` : `${errorCount} skipped`}
                      </span>
                    </>
                  )}
                </div>

                {updateCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-muted)]">
                      {lang === 'mm' ? 'ရှိပြီးသား SKU စတော့:' : 'Existing SKU stock:'}
                    </span>
                    <div className="inline-flex rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setStockMode('add')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          stockMode === 'add'
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {lang === 'mm' ? '+ ပေါင်းထည့်' : '+ Add to stock'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStockMode('replace')}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          stockMode === 'replace'
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {lang === 'mm' ? 'အစားထိုး' : 'Replace stock'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Table */}
              <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[var(--bg-surface-subtle)] border-b border-[var(--border-subtle)] text-[var(--text-muted)] font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">SKU</th>
                        <th className="py-2.5 px-3">{lang === 'mm' ? 'ပစ္စည်းအမည်' : 'Product'}</th>
                        <th className="py-2.5 px-3">{lang === 'mm' ? 'အမျိုးအစား' : 'Category'}</th>
                        <th className="py-2.5 px-3 text-right">{lang === 'mm' ? 'ရောင်းဈေး' : 'Sell'}</th>
                        <th className="py-2.5 px-3 text-right">{lang === 'mm' ? 'စတော့' : 'Stock'}</th>
                        <th className="py-2.5 px-3">{lang === 'mm' ? 'အခြေအနေ' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {candidates.map((row) => (
                        <tr key={row.rowNumber} className={row.error ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                          <td className="py-2 px-3 font-mono-num text-[var(--text-muted)]">
                            {row.rowNumber}
                          </td>
                          <td className="py-2 px-3 font-mono-num text-[var(--text-muted)] whitespace-nowrap">
                            {row.sku}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-medium text-[var(--text-primary)]">
                              {lang === 'mm' ? row.nameMm : row.nameEn}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-[var(--text-secondary)] whitespace-nowrap">
                            {CATEGORY_LABELS[row.category][lang]}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-num text-[var(--text-primary)]">
                            {row.sellPrice.toLocaleString('en-US')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono-num text-[var(--text-primary)]">
                            {row.stock}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap font-medium">
                            {row.error ? (
                              <span className="text-red-600 dark:text-red-400">{row.error}</span>
                            ) : row.existingProduct ? (
                              <span className="text-amber-700 dark:text-amber-300">
                                {lang === 'mm' ? 'ပြင်ဆင်မည်' : 'Update SKU'}
                              </span>
                            ) : (
                              <span className="text-[var(--accent-text)]">
                                {lang === 'mm' ? 'အသစ်ထည့်မည်' : 'New SKU'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] px-6 py-4 bg-[var(--bg-surface-subtle)]">
          <button
            type="button"
            onClick={handleResetAndClose}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
          >
            {lang === 'mm' ? 'မလုပ်တော့ပါ' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={validCandidates.length === 0 || importing}
            onClick={handleImportSubmit}
            className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:bg-[var(--bg-surface-muted)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed cursor-pointer"
          >
            {lang === 'mm'
              ? `ကုန်ပစ္စည်း ${validCandidates.length} မျိုး တင်သွင်းမည်`
              : `Import ${validCandidates.length} Products`}
          </button>
        </div>
      </div>
    </div>
  );
};
