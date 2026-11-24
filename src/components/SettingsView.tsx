import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Download,
  Edit3,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Store,
  Sun,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react';
import { SEED_MOVEMENTS, SEED_PRODUCTS, SEED_SALES } from '../data/seedData';
import { FullStoreSnapshot } from '../db/offlineDb';
import { Branch, Language, StoreSettings, ThemeMode } from '../types/pos';
import { formatDateTime } from '../utils/formatters';

interface SettingsViewProps {
  settings: StoreSettings;
  branches: Branch[];
  activeBranch: Branch;
  multiBranchEnabled: boolean;
  lang: Language;
  theme: ThemeMode;
  isBrowserOnline: boolean;
  simulatedOffline: boolean;
  pendingSyncCount: number;
  snapshot: FullStoreSnapshot;
  onToggleMultiBranch: (enabled: boolean) => Promise<void>;
  onSelectBranch: (branchId: string) => Promise<void>;
  onAddBranch: () => void;
  onEditBranch: (branch: Branch) => void;
  onDeleteBranch: (branchId: string) => Promise<void>;
  onChangeTheme: (nextTheme: ThemeMode) => Promise<void>;
  onToggleSimulatedOffline: () => void;
  onSyncNow: () => Promise<void>;
  onSaveSettings: (next: StoreSettings) => Promise<void>;
  onRestoreBackup: (snapshot: FullStoreSnapshot) => Promise<void>;
  onDeleteSampleData: () => Promise<{
    deletedProducts: number;
    deletedSales: number;
    deletedMovements: number;
  }>;
  onClearAllData: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  firebaseConfigured: boolean;
  firebaseProjectId: string | null;
  firebaseConfigError: string | null;
  authUser: { uid: string; isAnonymous: boolean } | null;
  firestoreMeta: {
    active: boolean;
    persistenceEnabled: boolean;
    fromCache: boolean;
    hasPendingWrites: boolean;
    error: string | null;
  };
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  branches,
  activeBranch,
  multiBranchEnabled,
  lang,
  theme,
  isBrowserOnline,
  simulatedOffline,
  pendingSyncCount,
  snapshot,
  onToggleMultiBranch,
  onSelectBranch,
  onAddBranch,
  onEditBranch,
  onDeleteBranch,
  onChangeTheme,
  onToggleSimulatedOffline,
  onSyncNow,
  onSaveSettings,
  onRestoreBackup,
  onDeleteSampleData,
  onClearAllData,
  onResetDemo,
  firebaseConfigured,
  firebaseProjectId,
  firebaseConfigError,
  authUser,
  firestoreMeta,
}) => {
  const [form, setForm] = useState<StoreSettings>(settings);
  const [statusMsg, setStatusMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResultBanner, setSyncResultBanner] = useState<{
    kind: 'ok' | 'err';
    msg: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteSample, setConfirmDeleteSample] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteBranchId, setConfirmDeleteBranchId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResultBanner(null);
    try {
      await onSyncNow();
      const okMsg = lang === 'mm' ? 'Sync အောင်မြင်ပါသည်' : 'Sync successful';
      setSyncResultBanner({ kind: 'ok', msg: okMsg });
      setStatusMsg(okMsg);
      window.setTimeout(() => {
        setStatusMsg((prev) => (prev === okMsg ? '' : prev));
      }, 3500);
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : lang === 'mm'
          ? 'Sync လုပ်ရာတွင် အမှားဖြစ်ပွားပါသည်'
          : 'Sync failed';
      setSyncResultBanner({ kind: 'err', msg: errMsg });
    } finally {
      setSyncing(false);
    }
  };

  const sampleProductIds = new Set(SEED_PRODUCTS.map((p) => p.id));
  const sampleSaleIds = new Set(SEED_SALES.map((s) => s.id));
  const sampleMovIds = new Set(SEED_MOVEMENTS.map((m) => m.id));
  const remainingSampleCount =
    snapshot.products.filter((p) => sampleProductIds.has(p.id)).length +
    snapshot.sales.filter((s) => sampleSaleIds.has(s.id)).length +
    snapshot.movements.filter((m) => sampleMovIds.has(m.id)).length;

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const effectiveOffline = !isBrowserOnline || simulatedOffline;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({ ...form, theme });
    setStatusMsg(lang === 'mm' ? 'ဆိုင်အချက်အလက်များ သိမ်းဆည်းပြီးပါပြီ' : 'Store settings saved');
    window.setTimeout(() => setStatusMsg(''), 2500);
  };

  const handleExportJson = () => {
    const json = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mingalar-mart-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as FullStoreSnapshot;
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.sales) || !parsed.settings) {
        throw new Error('Invalid backup format');
      }
      await onRestoreBackup(parsed);
      setForm(parsed.settings);
      setStatusMsg(
        lang === 'mm' ? 'Backup ဖိုင်မှ အချက်အလက်များ ပြန်လည်တင်သွင်းပြီးပါပြီ' : 'Backup restored successfully'
      );
    } catch {
      setStatusMsg(
        lang === 'mm' ? 'Backup ဖိုင် မှားယွင်းနေပါသည်' : 'Invalid backup JSON file'
      );
    }
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          {lang === 'mm' ? 'ဆိုင်ခွဲများ၊ အပြင်အဆင်နှင့် Offline Backup' : 'Branches, Settings & Offline Sync'}
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          {lang === 'mm'
            ? 'ဆိုင်ခွဲများစီမံခန့်ခွဲခြင်း၊ မျက်နှာပြင်အရောင်နှင့် အော့ဖ်လိုင်း Backup ထုတ်ယူခြင်း'
            : 'Manage store branches, appearance theme, receipt header, offline queue sync, and JSON backups'}
        </p>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] px-4 py-2.5 text-xs font-medium text-[var(--accent-text)]">
          {statusMsg}
        </div>
      )}

      {/* Store Branches Management Panel + Single/Multi-Branch Toggle */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-[var(--accent-text)] shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {lang === 'mm' ? 'ဆိုင်ခွဲ စနစ် (Single / Multi-Branch)' : 'Store Mode & Branches'}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {multiBranchEnabled
                  ? lang === 'mm'
                    ? 'On (ဆိုင်ခွဲများ) — ဆိုင်ခွဲတစ်ခုချင်းစီအလိုက် စတော့လက်ကျန်နှင့် ဘောင်ချာများ သီးခြားခွဲထားသည်'
                    : 'On (Multi-Branch) — Track separate stock, transfers, and reports across branches'
                  : lang === 'mm'
                  ? 'Off (ဆိုင်တစ်ဆိုင်တည်း) — ပင်မဆိုင်တစ်ခုတည်းဖြင့် ရိုးရှင်းစွာ အသုံးပြုနေသည်'
                  : 'Off (Single Store) — Simplified single-location POS using main store stock'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => onToggleMultiBranch(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  !multiBranchEnabled
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lang === 'mm' ? 'Off · ဆိုင်တစ်ဆိုင်တည်း' : 'Off · Single Store'}
              </button>
              <button
                type="button"
                onClick={() => onToggleMultiBranch(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  multiBranchEnabled
                    ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lang === 'mm' ? 'On · ဆိုင်ခွဲများ' : 'On · Multi-Branch'}
              </button>
            </div>

            {multiBranchEnabled && (
              <button
                type="button"
                onClick={onAddBranch}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-primary-hover)] cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{lang === 'mm' ? 'ဆိုင်ခွဲအသစ်ထည့်မည်' : 'Add Branch'}</span>
              </button>
            )}
          </div>
        </div>

        {!multiBranchEnabled ? (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            {lang === 'mm'
              ? `လက်ရှိတွင် "${activeBranch.nameMm}" တစ်ဆိုင်တည်းစနစ် (Off) ဖြင့် အသုံးပြုနေပါသည်။ ဆိုင်ခွဲများစွာ ထပ်မံအသုံးပြုလိုပါက "On · ဆိုင်ခွဲများ" သို့ အချိန်မရွေး ပြန်ဖွင့်နိုင်ပါသည်။`
              : `Currently operating in Single-Store mode using "${activeBranch.nameEn}". Existing branch records are preserved if you turn Multi-Branch back On later.`}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {branches.map((branch) => {
              const isActive = branch.id === activeBranch.id;
              return (
                <div
                  key={branch.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                    isActive
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num text-xs font-semibold text-[var(--accent-text)]">
                        {branch.code}
                        {branch.isMain && (
                          <span className="ml-2 font-sans font-normal text-[var(--text-muted)]">
                            · {lang === 'mm' ? 'ပင်မဆိုင်' : 'Main'}
                          </span>
                        )}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent-text)]">
                          <Check className="w-3 h-3" />
                          {lang === 'mm' ? 'လက်ရှိဆိုင်' : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                      {lang === 'mm' ? branch.nameMm : branch.nameEn}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {lang === 'mm' ? branch.addressMm : branch.addressEn}
                    </div>
                    <div className="mt-1 font-mono-num text-[11px] text-[var(--text-secondary)]">
                      {branch.phone}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => onSelectBranch(branch.id)}
                        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
                      >
                        {lang === 'mm' ? 'ဤဆိုင်ခွဲသို့ပြောင်းမည်' : 'Switch to Branch'}
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {lang === 'mm' ? 'POS တွင်အသုံးပြုနေသည်' : 'Selected for POS'}
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditBranch(branch)}
                        aria-label="Edit branch"
                        className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {!branch.isMain && branches.length > 1 && (
                        confirmDeleteBranchId === branch.id ? (
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteBranch(branch.id);
                              setConfirmDeleteBranchId(null);
                            }}
                            className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 cursor-pointer"
                          >
                            {lang === 'mm' ? 'ဖျက်မည်' : 'Confirm'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteBranchId(branch.id)}
                            aria-label="Delete branch"
                            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Appearance & Theme Mode Panel */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              {lang === 'mm' ? 'မျက်နှာပြင် အရောင်ပုံစံ (Theme Mode)' : 'Appearance & Color Theme'}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {lang === 'mm'
                ? 'နေ့ပိုင်း (Light) သို့မဟုတ် ညပိုင်း (Dark Mode) သို့ ပြောင်းလဲအသုံးပြုနိုင်သည်'
                : 'Switch between high-clarity Light Mode and eye-comfort Dark Mode'}
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] shrink-0">
            <button
              type="button"
              onClick={() => onChangeTheme('light')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                theme === 'light'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>{lang === 'mm' ? 'အလင်း (Light)' : 'Light Mode'}</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeTheme('dark')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                theme === 'dark'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>{lang === 'mm' ? 'အမှောင် (Dark)' : 'Dark Mode'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Offline Queue & Sync Panel */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            {effectiveOffline ? (
              <CloudOff className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            ) : (
              <Wifi className="w-5 h-5 text-[var(--accent-text)] mt-0.5 shrink-0" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {effectiveOffline
                  ? lang === 'mm'
                    ? 'အော့ဖ်လိုင်း မုဒ်ဖြင့် အလုပ်လုပ်နေသည်'
                    : 'Operating in Offline Mode'
                  : lang === 'mm'
                  ? 'အွန်လိုင်း ချိတ်ဆက်မှု ကောင်းမွန်သည်'
                  : 'Online Connection Active'}
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono-num">
                {lang === 'mm' ? 'Sync စောင့်ဆိုင်းဆဲ မှတ်တမ်း:' : 'Pending offline records:'}{' '}
                <strong className="text-[var(--text-primary)]">{pendingSyncCount}</strong>
                {settings.lastSyncedAt && (
                  <>
                    {' '}
                    · {lang === 'mm' ? 'နောက်ဆုံး Sync:' : 'Last synced:'}{' '}
                    {formatDateTime(settings.lastSyncedAt, lang)}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleSimulatedOffline}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                simulatedOffline
                  ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)]'
              }`}
            >
              {simulatedOffline
                ? lang === 'mm'
                  ? 'Offline စမ်းသပ်မုဒ် ပိတ်မည်'
                  : 'Exit Offline Test Mode'
                : lang === 'mm'
                ? 'Offline စမ်းသပ်မုဒ် ဖွင့်မည်'
                : 'Simulate Offline Mode'}
            </button>

            <button
              type="button"
              disabled={syncing}
              onClick={handleManualSync}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>
                {syncing
                  ? lang === 'mm'
                    ? 'Sync လုပ်နေသည်...'
                    : 'Syncing...'
                  : lang === 'mm'
                  ? 'ယခု Sync လုပ်မည်'
                  : 'Sync to Firestore'}
              </span>
            </button>
          </div>
        </div>

        {syncResultBanner && (
          <div
            className={`rounded-lg border px-3.5 py-2 text-xs font-medium flex items-center gap-2 ${
              syncResultBanner.kind === 'ok'
                ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
            }`}
          >
            {syncResultBanner.kind === 'ok' && <Check className="w-4 h-4 shrink-0" />}
            <span>{syncResultBanner.msg}</span>
          </div>
        )}

        {/* Cloud Firestore Real-Time Sync & Offline Persistence */}
        <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Cloud className="w-5 h-5 text-[var(--accent-text)] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Firestore Cloud Real-Time Sync (Anonymous Auth)
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {!firebaseConfigured ? (
                  lang === 'mm' ? (
                    'VITE_FIREBASE_CONFIG Environment Variable မထည့်သွင်းရသေးပါ — Cloudflare Pages Env Vars တွင် ဆိုင်အလိုက် Firebase Config ထည့်ပေးပါ (လက်ရှိ Offline IndexedDB ဖြင့် အလုပ်လုပ်နေသည်)'
                  ) : (
                    'VITE_FIREBASE_CONFIG is not set — add this store’s Firebase JSON in Cloudflare Environment Variables (running locally via IndexedDB).'
                  )
                ) : authUser ? (
                  <>
                    {firebaseProjectId && (
                      <>
                        <span className="font-mono-num font-medium text-[var(--text-primary)]">
                          Project: {firebaseProjectId}
                        </span>
                        {' · '}
                      </>
                    )}
                    <span className="font-mono-num font-medium text-[var(--text-primary)]">
                      UID: {authUser.uid.slice(0, 10)}...
                    </span>
                    {' · '}
                    {firestoreMeta.hasPendingWrites
                      ? lang === 'mm'
                        ? 'Offline Writes စောင့်ဆိုင်းနေသည်'
                        : 'Pending Offline Writes'
                      : firestoreMeta.fromCache
                      ? lang === 'mm'
                        ? 'IndexedDB Cache မှ အလုပ်လုပ်နေသည်'
                        : 'Serving from IndexedDB Cache'
                      : lang === 'mm'
                      ? 'ကုန်ပစ္စည်းနှင့် အရောင်းများ Real-Time ချိတ်ဆက်ထားသည်'
                      : 'Products & sales synced in real time'}
                    {firestoreMeta.persistenceEnabled &&
                      (lang === 'mm'
                        ? ' · Offline Persistence ဖွင့်ပြီး'
                        : ' · Offline Persistence On')}
                  </>
                ) : lang === 'mm' ? (
                  'Login ဝင်ရန်မလိုဘဲ Anonymous Auth ဖြင့် Firestore Cloud သို့ အလိုအလျောက် Sync လုပ်ပေးပါမည်'
                ) : (
                  'Syncs data to Firestore automatically using Anonymous Auth without login'
                )}
              </p>
              {(firestoreMeta.error || firebaseConfigError) && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {firestoreMeta.error || firebaseConfigError}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={syncing}
              onClick={handleManualSync}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] disabled:opacity-60 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>
                {syncing
                  ? lang === 'mm'
                    ? 'Sync လုပ်နေသည်...'
                    : 'Syncing...'
                  : lang === 'mm'
                  ? 'Firestore သို့ Sync လုပ်မည်'
                  : 'Sync to Firestore'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Store Receipt Settings Form */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
      >
        <h2 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3">
          {lang === 'mm' ? 'ပင်မဆိုင် အချက်အလက် (ဘောင်ချာတွင်ပြသရန်)' : 'Business Name & Receipt Footer'}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {lang === 'mm' ? 'ဆိုင်အမည် (မြန်မာ)' : 'Store Name (Myanmar)'}
            </label>
            <input
              type="text"
              value={form.storeNameMm}
              onChange={(e) => setForm({ ...form, storeNameMm: e.target.value })}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {lang === 'mm' ? 'ဆိုင်အမည် (English)' : 'Store Name (English)'}
            </label>
            <input
              type="text"
              value={form.storeNameEn}
              onChange={(e) => setForm({ ...form, storeNameEn: e.target.value })}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {lang === 'mm' ? 'ဘောင်ချာအောက်ခြေစာသား (မြန်မာ)' : 'Receipt Footer (Myanmar)'}
            </label>
            <input
              type="text"
              value={form.receiptFooterMm}
              onChange={(e) => setForm({ ...form, receiptFooterMm: e.target.value })}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              {lang === 'mm' ? 'မူလဘာသာစကား' : 'Default Language'}
            </label>
            <select
              value={form.defaultLanguage}
              onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value as Language })}
              className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="mm">မြန်မာ (Myanmar)</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] cursor-pointer"
          >
            {lang === 'mm' ? 'သိမ်းဆည်းမည်' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* JSON Backup & Restore */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-3">
          {lang === 'mm' ? 'စာရင်း Backup ထုတ်ယူခြင်းနှင့် ပြန်တင်ခြင်း' : 'Offline Backup & Restore'}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
          >
            <Download className="w-4 h-4 text-[var(--accent-text)]" />
            <span>{lang === 'mm' ? 'JSON Backup ဒေါင်းလုဒ်ဆွဲမည်' : 'Export Full Backup (.json)'}</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
          >
            <Upload className="w-4 h-4 text-[var(--text-muted)]" />
            <span>{lang === 'mm' ? 'Backup ဖိုင်မှ ပြန်တင်မည်' : 'Restore from Backup'}</span>
          </button>

          {remainingSampleCount > 0 && (
            confirmDeleteSample ? (
              <button
                type="button"
                onClick={async () => {
                  const res = await onDeleteSampleData();
                  setConfirmDeleteSample(false);
                  setStatusMsg(
                    lang === 'mm'
                      ? `နမူနာဒေတာဟောင်းများ (${res.deletedProducts} ပစ္စည်း၊ ${res.deletedSales} ဘောင်ချာ) ဖျက်သိမ်းပြီးပါပြီ`
                      : `Deleted old sample data (${res.deletedProducts} products, ${res.deletedSales} sales)`
                  );
                }}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
              >
                <span>
                  {lang === 'mm' ? 'နမူနာဒေတာအားလုံး ဖျက်ရန်သေချာသည်' : 'Confirm Delete Sample Data'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDeleteSample(true)}
                className="flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/60 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {lang === 'mm'
                    ? `နမူနာဒေတာဟောင်းများ ဖျက်မည် (${remainingSampleCount})`
                    : `Delete Old Sample Data (${remainingSampleCount})`}
                </span>
              </button>
            )
          )}

          {confirmClearAll ? (
            <button
              type="button"
              onClick={async () => {
                await onClearAllData();
                setConfirmClearAll(false);
                setStatusMsg(
                  lang === 'mm'
                    ? 'ကုန်ပစ္စည်းနှင့် အရောင်းစာရင်းအားလုံး ရှင်းလင်းပြီးပါပြီ'
                    : 'All products, sales, and ledger entries cleared'
                );
              }}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
            >
              <span>
                {lang === 'mm' ? 'စာရင်းအားလုံး အပြီးဖျက်ရန်သေချာသည်' : 'Confirm Clear All Store Data'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-2 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{lang === 'mm' ? 'စာရင်းအားလုံး ရှင်းလင်းမည်' : 'Clear All Store Data'}</span>
            </button>
          )}

          {confirmReset ? (
            <button
              type="button"
              onClick={async () => {
                await onResetDemo();
                setConfirmReset(false);
                setStatusMsg(lang === 'mm' ? 'မူလစာရင်းသို့ ပြန်လည်သတ်မှတ်ပြီးပါပြီ' : 'Demo data reset');
              }}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 cursor-pointer"
            >
              <span>{lang === 'mm' ? 'မူလစာရင်းပြန်ထားရန် သေချာသည်' : 'Confirm Reset Data'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{lang === 'mm' ? 'နမူနာစာရင်း ပြန်စမည်' : 'Reset Demo Data'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
