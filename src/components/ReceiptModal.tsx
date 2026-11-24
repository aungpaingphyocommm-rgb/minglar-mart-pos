import React from 'react';
import { Printer, X, CheckCircle2, RotateCcw } from 'lucide-react';
import { Branch, Language, Sale, StoreSettings } from '../types/pos';
import { PAYMENT_LABELS, UI_TEXT, t } from '../i18n/translations';
import { formatDateTime, formatMMK } from '../utils/formatters';
import { hasReturnableItems } from './SaleReversalModal';

interface ReceiptModalProps {
  sale: Sale | null;
  branches: Branch[];
  settings: StoreSettings;
  lang: Language;
  onClose: () => void;
  onReverseSale?: (sale: Sale) => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  branches,
  settings,
  lang,
  onClose,
  onReverseSale,
}) => {
  if (!sale) return null;

  const saleBranch = branches.find((b) => b.id === sale.branchId);
  const canReverse = Boolean(onReverseSale) && hasReturnableItems(sale);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5 bg-[var(--bg-surface-subtle)]">
          <div
            className={`flex items-center gap-2 ${
              sale.status === 'voided' || sale.reversalOfInvoiceNo
                ? 'text-red-600 dark:text-red-400'
                : 'text-[var(--accent-text)]'
            }`}
          >
            {sale.status === 'voided' || sale.reversalOfInvoiceNo ? (
              <RotateCcw className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            )}
            <span className="text-sm font-semibold">
              {sale.reversalOfInvoiceNo
                ? lang === 'mm'
                  ? 'အရောင်းပြန်အမ်း ဘောင်ချာ'
                  : 'Sale Reversal Credit Note'
                : sale.status === 'voided'
                ? lang === 'mm'
                  ? 'ပယ်ဖျက်ထားသော ဘောင်ချာ'
                  : 'Voided Receipt'
                : lang === 'mm'
                ? 'အရောင်း မှတ်တမ်းတင်ပြီးပါပြီ'
                : 'Sale Completed'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(UI_TEXT.modals.close, lang)}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Thermal paper preview remains crisp white & black for authentic 80mm receipt legibility */}
        <div className="p-5 max-h-[70vh] overflow-y-auto bg-[var(--bg-surface-muted)] flex justify-center">
          <div
            id="thermal-receipt-print"
            className="w-full max-w-[320px] bg-white border border-slate-200 p-5 text-slate-900 text-xs shadow-sm"
          >
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <h2 className="text-base font-bold tracking-tight">
                {lang === 'mm' ? settings.storeNameMm : settings.storeNameEn}
              </h2>
              {(saleBranch || sale.branchNameMm) && (
                <p className="mt-0.5 text-[11px] font-semibold text-slate-800">
                  {lang === 'mm'
                    ? saleBranch?.nameMm ?? sale.branchNameMm
                    : saleBranch?.nameEn ?? sale.branchNameEn}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-600 leading-snug">
                {lang === 'mm'
                  ? saleBranch?.addressMm || settings.addressMm
                  : saleBranch?.addressEn || settings.addressEn}
              </p>
              <p className="mt-0.5 font-mono-num text-[11px] text-slate-600">
                Tel: {saleBranch?.phone || settings.phone}
              </p>
            </div>

            <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'mm' ? 'ဘောင်ချာ' : 'Invoice'}:</span>
                <span className="font-mono-num font-semibold">{sale.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'mm' ? 'အချိန်' : 'Date'}:</span>
                <span className="font-mono-num">{formatDateTime(sale.createdAt, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'mm' ? 'ငွေပေးချေမှု' : 'Payment'}:</span>
                <span className="font-medium">{PAYMENT_LABELS[sale.paymentMethod][lang]}</span>
              </div>
              {(sale.reversalOfInvoiceNo || sale.status === 'voided') && (
                <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-300 text-red-700 font-semibold space-y-0.5">
                  <div>
                    {sale.reversalOfInvoiceNo
                      ? `${lang === 'mm' ? 'မူလဘောင်ချာ' : 'Reversal of'}: ${sale.reversalOfInvoiceNo}`
                      : lang === 'mm'
                      ? 'STATUS: VOIDED / REVERSED'
                      : 'STATUS: VOIDED / REVERSED'}
                  </div>
                  {sale.reversalReason && (
                    <div className="font-normal text-[10px]">
                      {lang === 'mm' ? 'အကြောင်းအရင်း' : 'Reason'}: {sale.reversalReason}
                    </div>
                  )}
                </div>
              )}
            </div>

            <table className="w-full my-2.5 text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1 text-left font-medium">{lang === 'mm' ? 'ပစ္စည်း' : 'Item'}</th>
                  <th className="py-1 text-right font-medium">{lang === 'mm' ? 'ခု' : 'Qty'}</th>
                  <th className="py-1 text-right font-medium">{lang === 'mm' ? 'သင့်ငွေ' : 'Amt'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sale.items.map((item) => (
                  <tr key={item.productId}>
                    <td className="py-1.5 pr-2">
                      <div className="font-medium text-slate-900">
                        {lang === 'mm' ? item.nameMm : item.nameEn}
                      </div>
                      <div className="font-mono-num text-[10px] text-slate-500">
                        {formatMMK(item.unitPrice, lang)} / {lang === 'mm' ? item.unitMm : item.unitEn}
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-mono-num align-top">{item.qty}</td>
                    <td className="py-1.5 text-right font-mono-num font-medium align-top">
                      {item.subtotal.toLocaleString('en-US')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-dashed border-slate-300 pt-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>{t(UI_TEXT.pos.subtotal, lang)}</span>
                <span className="font-mono-num">{formatMMK(sale.subtotal, lang)}</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>{t(UI_TEXT.pos.discount, lang)}</span>
                  <span className="font-mono-num">-{formatMMK(sale.discount, lang)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>{t(UI_TEXT.pos.total, lang)}</span>
                <span className="font-mono-num">{formatMMK(sale.total, lang)}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1">
                <span>{t(UI_TEXT.pos.amountReceived, lang)}</span>
                <span className="font-mono-num">{formatMMK(sale.amountPaid, lang)}</span>
              </div>
              <div className="flex justify-between text-slate-900 font-semibold">
                <span>{t(UI_TEXT.pos.changeDue, lang)}</span>
                <span className="font-mono-num">{formatMMK(sale.changeGiven, lang)}</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-600">
              <p>{lang === 'mm' ? settings.receiptFooterMm : settings.receiptFooterEn}</p>
              <p className="mt-1 font-mono-num text-[10px] text-slate-400">
                {sale.synced ? 'SYNCED' : 'OFFLINE QUEUED'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 border-t border-[var(--border-subtle)] px-5 py-3.5 bg-[var(--bg-surface)]">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>{t(UI_TEXT.modals.printReceipt, lang)}</span>
          </button>
          {canReverse && onReverseSale && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onReverseSale(sale);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/70 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{lang === 'mm' ? 'ပြန်အမ်းမည်' : 'Reverse'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] transition-colors cursor-pointer whitespace-nowrap"
          >
            {t(UI_TEXT.modals.close, lang)}
          </button>
        </div>
      </div>
    </div>
  );
};
