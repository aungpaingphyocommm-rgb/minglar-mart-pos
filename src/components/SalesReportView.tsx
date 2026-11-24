import React, { useMemo, useState } from 'react';
import { Calendar, Download, FileText, RotateCcw } from 'lucide-react';
import { PAYMENT_LABELS, UI_TEXT, t } from '../i18n/translations';
import { Branch, Language, PaymentMethod, Sale } from '../types/pos';
import { downloadCSV, formatDateTime, formatMMK } from '../utils/formatters';
import { hasReturnableItems } from './SaleReversalModal';

interface SalesReportViewProps {
  sales: Sale[];
  branches: Branch[];
  activeBranch: Branch;
  multiBranchEnabled: boolean;
  lang: Language;
  isOffline: boolean;
  onViewReceipt: (sale: Sale) => void;
  onReverseSale: (sale: Sale) => void;
}

type DateRangePreset = 'daily' | 'weekly' | 'monthly' | 'custom';

export const SalesReportView: React.FC<SalesReportViewProps> = ({
  sales,
  branches,
  activeBranch,
  multiBranchEnabled,
  lang,
  isOffline,
  onViewReceipt,
  onReverseSale,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [rangePreset, setRangePreset] = useState<DateRangePreset>('daily');
  const [branchScope, setBranchScope] = useState<'active' | 'all'>('all');
  const [customStart, setCustomStart] = useState(todayStr);
  const [customEnd, setCustomEnd] = useState(todayStr);

  const filteredSales = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return sales.filter((sale) => {
      if (multiBranchEnabled && branchScope === 'active' && sale.branchId && sale.branchId !== activeBranch.id) {
        return false;
      }
      const ts = new Date(sale.createdAt).getTime();
      if (rangePreset === 'daily') {
        return ts >= startOfToday;
      }
      if (rangePreset === 'weekly') {
        return ts >= weekAgo;
      }
      if (rangePreset === 'monthly') {
        return ts >= monthStart;
      }
      const startTs = customStart ? new Date(`${customStart}T00:00:00`).getTime() : 0;
      const endTs = customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : Infinity;
      return ts >= startTs && ts <= endTs;
    });
  }, [sales, branchScope, activeBranch.id, rangePreset, customStart, customEnd]);

  const completedSales = useMemo(
    () => filteredSales.filter((s) => s.status === 'completed'),
    [filteredSales]
  );

  const metrics = useMemo(() => {
    const totalRevenue = completedSales.reduce((sum, s) => sum + s.total, 0);
    const totalProfit = completedSales.reduce((sum, s) => sum + s.profit, 0);
    const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const orderCount = completedSales.filter((s) => !s.reversalOfInvoiceNo).length;

    const byPayment: Record<PaymentMethod, number> = {
      cash: 0,
      kbzpay: 0,
      wavepay: 0,
      aya_pay: 0,
    };
    completedSales.forEach((s) => {
      byPayment[s.paymentMethod] += s.total;
    });

    const itemMap = new Map<
      string,
      {
        productId: string;
        sku: string;
        nameMm: string;
        nameEn: string;
        qtySold: number;
        revenue: number;
        cost: number;
      }
    >();

    completedSales.forEach((sale) => {
      sale.items.forEach((item) => {
        const existing = itemMap.get(item.productId);
        const itemCost = item.costPrice * item.qty;
        if (existing) {
          existing.qtySold += item.qty;
          existing.revenue += item.subtotal;
          existing.cost += itemCost;
        } else {
          itemMap.set(item.productId, {
            productId: item.productId,
            sku: item.sku,
            nameMm: item.nameMm,
            nameEn: item.nameEn,
            qtySold: item.qty,
            revenue: item.subtotal,
            cost: itemCost,
          });
        }
      });
    });

    const topItems = Array.from(itemMap.values())
      .filter((entry) => entry.qtySold > 0)
      .map((entry) => {
        const profit = entry.revenue - entry.cost;
        const margin = entry.revenue > 0 ? (profit / entry.revenue) * 100 : 0;
        return { ...entry, profit, margin };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const byBranch = branches.map((b) => {
      const bSales = completedSales.filter((s) => (s.branchId ?? branches[0]?.id) === b.id);
      const rev = bSales.reduce((sum, s) => sum + s.total, 0);
      const prof = bSales.reduce((sum, s) => sum + s.profit, 0);
      return {
        branch: b,
        orders: bSales.filter((s) => !s.reversalOfInvoiceNo).length,
        revenue: rev,
        profit: prof,
        sharePct: totalRevenue > 0 ? Math.max(0, Math.round((rev / totalRevenue) * 100)) : 0,
      };
    });

    return { totalRevenue, totalProfit, marginPct, orderCount, byPayment, topItems, byBranch };
  }, [completedSales, branches]);

  const handleExportReport = () => {
    const headers = [
      'Invoice No',
      'Branch',
      'Date',
      'Status',
      'Payment Method',
      'Items Count',
      'Subtotal (MMK)',
      'Discount (MMK)',
      'Total (MMK)',
      'Gross Profit (MMK)',
      'Sync Status',
    ];
    const rows = filteredSales.map((s) => [
      s.invoiceNo,
      s.branchNameEn ?? activeBranch.nameEn,
      s.createdAt,
      s.status,
      PAYMENT_LABELS[s.paymentMethod].en,
      s.items.reduce((a, b) => a + b.qty, 0),
      s.subtotal,
      s.discount,
      s.total,
      s.profit,
      s.synced ? 'Synced' : 'Pending Offline',
    ]);
    downloadCSV(`sales-report-${branchScope}-${rangePreset}-${todayStr}.csv`, headers, rows);
  };

  return (
    <div className="space-y-5">
      {/* Header + Date & Branch Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">{t(UI_TEXT.sales.title, lang)}</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {isOffline
              ? lang === 'mm'
                ? 'အော့ဖ်လိုင်းမုဒ် — စက်ထဲရှိ မှတ်တမ်းများမှ တိုက်ရိုက်တွက်ချက်ပေးနေသည်'
                : 'Offline Mode — Reports calculated directly from local IndexedDB storage'
              : lang === 'mm'
              ? 'ဆိုင်ခွဲအလိုက် နေ့စဉ်၊ အပတ်စဉ်နှင့် လစဉ် အရောင်းနှင့် အမြတ်စာရင်းများ'
              : 'Filterable daily, weekly, and monthly revenue, branch comparison, and profit margins'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {multiBranchEnabled && branches.length > 1 && (
            <div className="flex items-center gap-1 p-1 bg-[var(--segmented-bg)] rounded-lg">
              <button
                type="button"
                onClick={() => setBranchScope('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  branchScope === 'all'
                    ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lang === 'mm' ? 'ဆိုင်ခွဲအားလုံး' : 'All Branches'}
              </button>
              <button
                type="button"
                onClick={() => setBranchScope('active')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  branchScope === 'active'
                    ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {activeBranch.code}
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 p-1 bg-[var(--segmented-bg)] rounded-lg">
            {(
              [
                { id: 'daily', mm: 'နေ့စဉ်', en: 'Daily' },
                { id: 'weekly', mm: 'အပတ်စဉ်', en: 'Weekly' },
                { id: 'monthly', mm: 'လစဉ်', en: 'Monthly' },
                { id: 'custom', mm: 'စိတ်ကြိုက်', en: 'Custom' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setRangePreset(preset.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  rangePreset === preset.id
                    ? 'bg-[var(--segmented-active)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {preset[lang]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportReport}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{lang === 'mm' ? 'Report CSV ထုတ်မည်' : 'Export Report CSV'}</span>
          </button>
        </div>
      </div>

      {/* Custom Date Range Pickers */}
      {rangePreset === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 text-xs">
          <Calendar className="w-4 h-4 text-[var(--text-muted)]" />
          <div className="flex items-center gap-2">
            <label className="text-[var(--text-secondary)] font-medium">
              {lang === 'mm' ? 'စတင်ရက်' : 'From'}:
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-2.5 py-1.5 font-mono-num text-xs focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[var(--text-secondary)] font-medium">
              {lang === 'mm' ? 'ကုန်ဆုံးရက်' : 'To'}:
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-2.5 py-1.5 font-mono-num text-xs focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {lang === 'mm' ? 'စုစုပေါင်း အရောင်းငွေ' : 'Total Sales'}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[var(--text-primary)]">
            {formatMMK(metrics.totalRevenue, lang)}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {lang === 'mm' ? 'စုစုပေါင်း အမြတ်ငွေ' : 'Gross Profit'}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[var(--accent-text)]">
            {formatMMK(metrics.totalProfit, lang)}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {lang === 'mm' ? 'အမြတ်ရာခိုင်နှုန်း (Margin)' : 'Profit Margin'}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[var(--text-primary)]">
            {metrics.marginPct.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="text-xs font-medium text-[var(--text-muted)]">
            {t(UI_TEXT.sales.totalOrders, lang)}
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-num text-[var(--text-primary)]">
            {metrics.orderCount}
          </div>
        </div>
      </div>

      {/* Multi-Branch Revenue Breakdown when viewing All Branches */}
      {multiBranchEnabled && branches.length > 1 && branchScope === 'all' && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3.5">
            {lang === 'mm' ? 'ဆိုင်ခွဲအလိုက် အရောင်းနှိုင်းယှဉ်ချက်' : 'Branch Performance Breakdown'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.byBranch.map((entry) => (
              <div
                key={entry.branch.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--text-primary)]">
                    {entry.branch.code} · {lang === 'mm' ? entry.branch.nameMm : entry.branch.nameEn}
                  </span>
                  <span className="font-mono-num text-[var(--text-muted)]">
                    {entry.orders} {lang === 'mm' ? 'စောင်' : 'inv'}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono-num text-sm font-bold text-[var(--text-primary)]">
                    {formatMMK(entry.revenue, lang)}
                  </span>
                  <span className="font-mono-num text-xs text-[var(--accent-text)]">
                    +{formatMMK(entry.profit, lang)} ({entry.sharePct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[var(--bg-surface-muted)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-primary)] rounded-full transition-all"
                    style={{ width: `${entry.sharePct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top-Selling Items + Payment Breakdown Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] px-5 py-3.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {lang === 'mm' ? 'အရောင်းရဆုံး ပစ္စည်းများ' : 'Top-Selling Items'}
            </h2>
            <span className="text-xs text-[var(--text-muted)] font-mono-num">
              {metrics.topItems.length} {lang === 'mm' ? 'မျိုး' : 'items'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                  <th className="py-2.5 px-4">{lang === 'mm' ? 'ပစ္စည်းအမည်' : 'Product'}</th>
                  <th className="py-2.5 px-4 text-right">{lang === 'mm' ? 'ရောင်းရမှု' : 'Qty'}</th>
                  <th className="py-2.5 px-4 text-right">{lang === 'mm' ? 'အရောင်းငွေ' : 'Revenue'}</th>
                  <th className="py-2.5 px-4 text-right">{lang === 'mm' ? 'အမြတ်' : 'Profit'}</th>
                  <th className="py-2.5 px-4 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                {metrics.topItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[var(--text-muted)]">
                      {lang === 'mm'
                        ? 'ရွေးချယ်ထားသော ရက်အတွင်း အရောင်းမရှိသေးပါ'
                        : 'No completed sales in this date range'}
                    </td>
                  </tr>
                ) : (
                  metrics.topItems.map((item, idx) => (
                    <tr key={item.productId} className="hover:bg-[var(--bg-surface-subtle)]">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-[var(--text-primary)]">
                          <span className="font-mono-num text-[var(--text-muted)] mr-2">0{idx + 1}.</span>
                          {lang === 'mm' ? item.nameMm : item.nameEn}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-[var(--text-primary)]">
                        {item.qtySold}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num text-[var(--text-primary)]">
                        {item.revenue.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num text-[var(--accent-text)] font-medium">
                        {item.profit.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num text-[var(--text-secondary)]">
                        {item.margin.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
              {lang === 'mm' ? 'ငွေပေးချေမှု အချိုးအစား' : 'Payment Breakdown'}
            </h2>
            <div className="space-y-4">
              {(['cash', 'kbzpay', 'wavepay', 'aya_pay'] as PaymentMethod[]).map((method) => {
                const amount = metrics.byPayment[method];
                const pct =
                  metrics.totalRevenue > 0 ? Math.round((amount / metrics.totalRevenue) * 100) : 0;
                return (
                  <div key={method} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-secondary)]">
                        {PAYMENT_LABELS[method][lang]}
                      </span>
                      <span className="font-mono-num text-[var(--text-primary)] font-semibold">
                        {formatMMK(amount, lang)} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--bg-surface-muted)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-primary)] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
            {lang === 'mm'
              ? 'ပယ်ဖျက်ထားသော ဘောင်ချာများကို အမြတ်တွက်ချက်မှုတွင် ထည့်သွင်းမထားပါ။'
              : 'Voided invoices are excluded from revenue, profit, and top-item rankings.'}
          </div>
        </div>
      </div>

      {/* Detailed Invoice Table */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            {lang === 'mm' ? 'ဘောင်ချာ မှတ်တမ်းများ' : 'Invoice History'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)]">
                <th className="py-3 px-4">{lang === 'mm' ? 'ဘောင်ချာနံပါတ်' : 'Invoice No'}</th>
                {multiBranchEnabled && (
                  <th className="py-3 px-4">{lang === 'mm' ? 'ဆိုင်ခွဲ' : 'Branch'}</th>
                )}
                <th className="py-3 px-4">{lang === 'mm' ? 'အချိန်' : 'Timestamp'}</th>
                <th className="py-3 px-4">{lang === 'mm' ? 'ငွေပေးချေမှု' : 'Payment'}</th>
                <th className="py-3 px-4 text-right">{lang === 'mm' ? 'ပစ္စည်း' : 'Items'}</th>
                <th className="py-3 px-4 text-right">{lang === 'mm' ? 'စုစုပေါင်း' : 'Total'}</th>
                <th className="py-3 px-4 text-right">{lang === 'mm' ? 'အမြတ်' : 'Profit'}</th>
                <th className="py-3 px-4 text-right">{lang === 'mm' ? 'လုပ်ဆောင်ချက်' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={multiBranchEnabled ? 8 : 7} className="py-10 text-center text-sm text-[var(--text-muted)]">
                    {lang === 'mm' ? 'ဘောင်ချာ မရှိသေးပါ' : 'No invoices found in this period'}
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isVoided = sale.status === 'voided';
                  const isCreditNote = Boolean(sale.reversalOfInvoiceNo);
                  const canReverse = hasReturnableItems(sale);
                  const hasPartialReturns =
                    !isVoided &&
                    !isCreditNote &&
                    Object.values(sale.reversedItems ?? {}).some((q) => q > 0);

                  return (
                    <tr
                      key={sale.id}
                      className={`hover:bg-[var(--bg-surface-subtle)] ${isVoided ? 'opacity-60' : ''}`}
                    >
                      <td className="py-3 px-4 font-mono-num text-xs font-semibold text-[var(--text-primary)] whitespace-nowrap">
                        <span>{sale.invoiceNo}</span>
                        {!sale.synced && (
                          <span className="ml-2 text-[11px] font-normal text-amber-700 dark:text-amber-300">
                            · Offline
                          </span>
                        )}
                        {isVoided && (
                          <span className="ml-2 text-[11px] font-medium text-red-600 dark:text-red-400">
                            · {t(UI_TEXT.sales.voidedLabel, lang)}
                          </span>
                        )}
                        {isCreditNote && (
                          <span className="ml-2 text-[11px] font-medium text-red-600 dark:text-red-400">
                            · {lang === 'mm' ? `ပြန်အမ်း (${sale.reversalOfInvoiceNo})` : `Reversal of ${sale.reversalOfInvoiceNo}`}
                          </span>
                        )}
                        {hasPartialReturns && (
                          <span className="ml-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            · {canReverse
                              ? lang === 'mm'
                                ? 'တစ်စိတ်တစ်ပိုင်း ပြန်အမ်းပြီး'
                                : 'Partially Returned'
                              : lang === 'mm'
                              ? 'အပြည့်ပြန်အမ်းပြီး'
                              : 'Fully Returned'}
                          </span>
                        )}
                      </td>
                      {multiBranchEnabled && (
                        <td className="py-3 px-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {lang === 'mm'
                            ? sale.branchNameMm ?? activeBranch.nameMm
                            : sale.branchNameEn ?? activeBranch.nameEn}
                        </td>
                      )}
                      <td className="py-3 px-4 font-mono-num text-xs text-[var(--text-muted)] whitespace-nowrap">
                        {formatDateTime(sale.createdAt, lang)}
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {PAYMENT_LABELS[sale.paymentMethod][lang]}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-num text-xs text-[var(--text-secondary)]">
                        {sale.items.reduce((a, b) => a + b.qty, 0)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-num font-semibold whitespace-nowrap ${
                          isCreditNote
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {formatMMK(sale.total, lang)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-num text-xs font-medium whitespace-nowrap ${
                          isCreditNote
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-[var(--accent-text)]'
                        }`}
                      >
                        {isVoided ? '—' : formatMMK(sale.profit, lang)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewReceipt(sale)}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>{t(UI_TEXT.sales.viewReceipt, lang)}</span>
                          </button>
                          {canReverse && (
                            <button
                              type="button"
                              onClick={() => onReverseSale(sale)}
                              title={lang === 'mm' ? 'အရောင်းပြန်အမ်း / ပယ်ဖျက်' : 'Reverse / Refund Sale'}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-red-200 dark:hover:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>{lang === 'mm' ? 'ပြန်အမ်း' : 'Reverse'}</span>
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
