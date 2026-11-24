import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  ClipboardList,
  CloudOff,
  Globe,
  Menu,
  Package,
  Plus,
  Settings,
  ShoppingCart,
  Store,
  Wifi,
  X,
} from 'lucide-react';
import { BranchFormModal } from './components/BranchFormModal';
import { BranchTransferModal } from './components/BranchTransferModal';
import { CsvImportModal } from './components/CsvImportModal';
import { InventoryView } from './components/InventoryView';
import { PosView } from './components/PosView';
import { ProductFormModal } from './components/ProductFormModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ReceiptModal } from './components/ReceiptModal';
import { RestockModal } from './components/RestockModal';
import { SaleReversalModal } from './components/SaleReversalModal';
import { SalesReportView } from './components/SalesReportView';
import { SettingsView } from './components/SettingsView';
import { StockLedgerView } from './components/StockLedgerView';
import { DEFAULT_SETTINGS, SEED_BRANCHES } from './data/seedData';
import {
  FullStoreSnapshot,
  adjustStock,
  bulkImportProducts,
  clearAllStoreData,
  completeSale,
  deleteSampleData,
  initAndLoadSnapshot,
  removeBranch,
  removeProduct,
  resetToSeedData,
  restoreSnapshot,
  reverseSale,
  saveBranch,
  saveProduct,
  saveSettings,
  syncPendingRecords,
  transferProductStock,
} from './db/offlineDb';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { UI_TEXT, t } from './i18n/translations';
import {
  Branch,
  CartItem,
  Language,
  MovementType,
  NavTab,
  PaymentMethod,
  Product,
  Sale,
  StockMovement,
  StoreSettings,
  ThemeMode,
} from './types/pos';
import { CsvImportCandidate } from './utils/csvParser';

const THEME_CACHE_KEY = 'mingalar_pos_theme';

export default function App() {
  const isBrowserOnline = useOnlineStatus();
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('pos');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [branches, setBranches] = useState<Branch[]>(SEED_BRANCHES);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_SETTINGS);
  const [lang, setLang] = useState<Language>('mm');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_CACHE_KEY);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [reversalModalState, setReversalModalState] = useState<{
    isOpen: boolean;
    initialSale: Sale | null;
  }>({ isOpen: false, initialSale: null });

  const isOffline = !isBrowserOnline || simulatedOffline;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_CACHE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#0B1120' : '#0F766E');
    }
  }, [theme]);

  const reloadSnapshot = useCallback(async () => {
    const snap = await initAndLoadSnapshot();
    setProducts(snap.products);
    setSales(snap.sales);
    setMovements(snap.movements);
    setBranches(snap.branches);
    setSettings(snap.settings);
    return snap;
  }, []);

  useEffect(() => {
    let active = true;
    initAndLoadSnapshot().then((snap) => {
      if (!active) return;
      setProducts(snap.products);
      setSales(snap.sales);
      setMovements(snap.movements);
      setBranches(snap.branches);
      setSettings(snap.settings);
      setLang(snap.settings.defaultLanguage);
      if (snap.settings.theme) {
        setTheme(snap.settings.theme);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const activeBranch = useMemo(
    () =>
      branches.find((b) => b.id === settings.activeBranchId) ??
      branches.find((b) => b.isMain) ??
      branches[0] ??
      SEED_BRANCHES[0],
    [branches, settings.activeBranchId]
  );

  // Scope products to the active branch's stock level while preserving full branchStocks map
  const branchProducts = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        stock: p.branchStocks ? p.branchStocks[activeBranch.id] ?? 0 : p.stock,
      })),
    [products, activeBranch.id]
  );

  const pendingSyncCount = useMemo(() => {
    const unsyncedSales = sales.filter((s) => !s.synced).length;
    const unsyncedMovs = movements.filter((m) => !m.synced).length;
    return unsyncedSales + unsyncedMovs;
  }, [sales, movements]);

  const lowStockCount = useMemo(
    () => branchProducts.filter((p) => p.stock <= p.minStock).length,
    [branchProducts]
  );

  useEffect(() => {
    if (!isOffline && pendingSyncCount > 0) {
      syncPendingRecords().then(() => {
        reloadSnapshot();
      });
    }
  }, [isOffline, pendingSyncCount, reloadSnapshot]);

  const handleSelectBranch = async (branchId: string) => {
    const updated: StoreSettings = { ...settings, activeBranchId: branchId };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleSaveBranch = async (branch: Branch) => {
    await saveBranch(branch);
    await reloadSnapshot();
  };

  const handleDeleteBranch = async (branchId: string) => {
    await removeBranch(branchId);
    if (settings.activeBranchId === branchId) {
      const main = branches.find((b) => b.isMain && b.id !== branchId) ?? branches[0];
      if (main) {
        await saveSettings({ ...settings, activeBranchId: main.id });
      }
    }
    await reloadSnapshot();
  };

  const handleCompleteSale = async (params: {
    cart: CartItem[];
    discount: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
  }) => {
    const createdSale = await completeSale({
      ...params,
      branch: activeBranch,
      existingSalesCount: sales.length,
      isOffline,
    });
    await reloadSnapshot();
    setReceiptSale(createdSale);
  };

  const handleSaveProduct = async (product: Product, isNew: boolean) => {
    await saveProduct(product, isNew, activeBranch, isOffline);
    await reloadSnapshot();
  };

  const handleDeleteProduct = async (productId: string) => {
    await removeProduct(productId);
    await reloadSnapshot();
  };

  const handleBulkImportCsv = async (params: {
    items: CsvImportCandidate[];
    stockMode: 'replace' | 'add';
  }) => {
    const res = await bulkImportProducts({
      items: params.items,
      stockMode: params.stockMode,
      branch: activeBranch,
      isOffline,
    });
    await reloadSnapshot();
    return res;
  };

  const handleAdjustStock = async (params: {
    product: Product;
    delta: number;
    type: MovementType;
    reason: string;
    newCostPrice?: number;
  }) => {
    await adjustStock({
      ...params,
      branch: activeBranch,
      isOffline,
    });
    await reloadSnapshot();
  };

  const handleTransferStock = async (params: {
    product: Product;
    fromBranch: Branch;
    toBranch: Branch;
    qty: number;
    reason: string;
  }) => {
    await transferProductStock({
      ...params,
      isOffline,
    });
    await reloadSnapshot();
  };

  const handleReverseSale = async (params: {
    saleId: string;
    itemsToReturn: Array<{ productId: string; qty: number }>;
    reason: string;
    restoreStock: boolean;
  }) => {
    const reversalRecord = await reverseSale({
      ...params,
      branches,
      isOffline,
    });
    await reloadSnapshot();
    if (reversalRecord) {
      setReceiptSale(reversalRecord);
    }
  };

  const handleSaveSettings = async (next: StoreSettings) => {
    await saveSettings(next);
    setLang(next.defaultLanguage);
    if (next.theme) {
      setTheme(next.theme);
    }
    await reloadSnapshot();
  };

  const handleChangeTheme = async (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    const updated: StoreSettings = { ...settings, theme: nextTheme };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleSyncNow = async () => {
    if (isOffline) return;
    await syncPendingRecords();
    await reloadSnapshot();
  };

  const handleRestoreBackup = async (snap: FullStoreSnapshot) => {
    await restoreSnapshot(snap);
    const reloaded = await reloadSnapshot();
    setLang(reloaded.settings.defaultLanguage);
    setTheme(reloaded.settings.theme ?? 'light');
  };

  const handleResetDemo = async () => {
    const snap = await resetToSeedData();
    setProducts(snap.products);
    setSales(snap.sales);
    setMovements(snap.movements);
    setBranches(snap.branches);
    setSettings(snap.settings);
    setLang(snap.settings.defaultLanguage);
    setTheme(snap.settings.theme ?? 'light');
  };

  const handleDeleteSampleData = async () => {
    const res = await deleteSampleData();
    await reloadSnapshot();
    return res;
  };

  const handleClearAllData = async () => {
    await clearAllStoreData();
    await reloadSnapshot();
  };

  const navItems: Array<{ id: NavTab; label: { mm: string; en: string }; icon: typeof ShoppingCart }> = [
    { id: 'pos', label: UI_TEXT.nav.pos, icon: ShoppingCart },
    { id: 'inventory', label: UI_TEXT.nav.inventory, icon: Package },
    { id: 'movements', label: UI_TEXT.nav.movements, icon: ClipboardList },
    { id: 'sales', label: UI_TEXT.nav.sales, icon: BarChart3 },
    { id: 'settings', label: UI_TEXT.nav.settings, icon: Settings },
  ];

  const snapshot: FullStoreSnapshot = {
    products,
    sales,
    movements,
    branches,
    settings,
  };

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col">
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('pos')}
          className="text-lg font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0 cursor-pointer"
        >
          {lang === 'mm' ? 'မင်္ဂလာမတ် POS' : 'Mingalar Mart POS'}
        </button>

        {/* Zone 2: Clean single-line navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-[var(--text-muted)]">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-[var(--accent-primary)] text-[var(--accent-text)] font-semibold'
                    : 'border-transparent hover:text-[var(--text-primary)]'
                }`}
              >
                {t(item.label, lang)}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action + Mobile Drawer Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setEditingProduct(null);
              setProductModalOpen(true);
            }}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-primary-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t(UI_TEXT.inventory.addProduct, lang)}</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="lg:hidden rounded-lg border border-[var(--border-subtle)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer ${
                  active
                    ? 'bg-[var(--nav-active-bg)] text-[var(--accent-text)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t(item.label, lang)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Workspace Utility Strip: Connectivity, Active Branch Switcher, Low-Stock, Language, PWA */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5 font-medium">
            {isOffline ? (
              <>
                <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-amber-700 dark:text-amber-300">
                  {simulatedOffline
                    ? t(UI_TEXT.status.simulatedOffline, lang)
                    : t(UI_TEXT.status.offline, lang)}
                </span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                <span className="text-[var(--text-secondary)]">{t(UI_TEXT.status.online, lang)}</span>
              </>
            )}
          </span>

          {pendingSyncCount > 0 && (
            <>
              <span aria-hidden="true" className="text-[var(--border-strong)]">·</span>
              <span className="font-mono-num text-amber-700 dark:text-amber-300 font-medium">
                {t(UI_TEXT.status.pendingSync, lang)}: {pendingSyncCount}
              </span>
            </>
          )}

          {lowStockCount > 0 && (
            <>
              <span aria-hidden="true" className="text-[var(--border-strong)]">·</span>
              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className="font-medium text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
              >
                {lang === 'mm'
                  ? `လက်ကျန်နည်း/ပြတ် ပစ္စည်း ${lowStockCount} မျိုး`
                  : `${lowStockCount} low/out-of-stock items`}
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active Branch Switcher */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1">
            <Store className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
            <select
              aria-label={lang === 'mm' ? 'ဆိုင်ခွဲရွေးချယ်ရန်' : 'Select active store branch'}
              value={activeBranch.id}
              onChange={(e) => {
                if (e.target.value === '__manage__') {
                  setActiveTab('settings');
                } else {
                  handleSelectBranch(e.target.value);
                }
              }}
              className="bg-transparent text-xs font-medium text-[var(--text-primary)] focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                  {b.code} · {lang === 'mm' ? b.nameMm : b.nameEn}
                </option>
              ))}
              <option value="__manage__" className="bg-[var(--bg-surface)] text-[var(--accent-text)]">
                + {lang === 'mm' ? 'ဆိုင်ခွဲများ စီမံရန်...' : 'Manage Branches...'}
              </option>
            </select>
          </div>

          <div className="w-auto">
            <PWAInstallButton lang={lang} />
          </div>

          <div className="inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
            <Globe className="w-3.5 h-3.5 text-[var(--text-muted)] ml-2 mr-1" />
            <button
              type="button"
              onClick={() => setLang('mm')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                lang === 'mm'
                  ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              မြန်မာ
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                lang === 'en'
                  ? 'bg-[var(--text-primary)] text-[var(--bg-surface)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <main className="flex-1 px-4 sm:px-6 py-5 max-w-[1440px] w-full mx-auto">
        {loading ? (
          <div className="space-y-4">
            <div className="h-10 w-64 rounded-lg bg-[var(--bg-surface-muted)] animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-40 rounded-xl bg-[var(--bg-surface-muted)] animate-pulse" />
              <div className="h-40 rounded-xl bg-[var(--bg-surface-muted)] animate-pulse" />
              <div className="h-40 rounded-xl bg-[var(--bg-surface-muted)] animate-pulse" />
            </div>
          </div>
        ) : activeTab === 'pos' ? (
          <PosView
            key={activeBranch.id}
            products={branchProducts}
            lang={lang}
            onCompleteSale={handleCompleteSale}
            onOpenReversal={() => setReversalModalState({ isOpen: true, initialSale: null })}
          />
        ) : activeTab === 'inventory' ? (
          <InventoryView
            products={branchProducts}
            branches={branches}
            activeBranch={activeBranch}
            lang={lang}
            onAddNew={() => {
              setEditingProduct(null);
              setProductModalOpen(true);
            }}
            onImportCsv={() => setCsvImportOpen(true)}
            onEdit={(prod) => {
              setEditingProduct(prod);
              setProductModalOpen(true);
            }}
            onRestock={(prod) => setRestockProduct(prod)}
            onTransfer={(prod) => setTransferProduct(prod)}
            onDelete={handleDeleteProduct}
          />
        ) : activeTab === 'movements' ? (
          <StockLedgerView
            movements={movements}
            branches={branches}
            activeBranch={activeBranch}
            lang={lang}
          />
        ) : activeTab === 'sales' ? (
          <SalesReportView
            sales={sales}
            branches={branches}
            activeBranch={activeBranch}
            lang={lang}
            isOffline={isOffline}
            onViewReceipt={(sale) => setReceiptSale(sale)}
            onReverseSale={(sale) => setReversalModalState({ isOpen: true, initialSale: sale })}
          />
        ) : (
          <SettingsView
            settings={settings}
            branches={branches}
            activeBranch={activeBranch}
            lang={lang}
            theme={theme}
            isBrowserOnline={isBrowserOnline}
            simulatedOffline={simulatedOffline}
            pendingSyncCount={pendingSyncCount}
            snapshot={snapshot}
            onSelectBranch={handleSelectBranch}
            onAddBranch={() => {
              setEditingBranch(null);
              setBranchModalOpen(true);
            }}
            onEditBranch={(b) => {
              setEditingBranch(b);
              setBranchModalOpen(true);
            }}
            onDeleteBranch={handleDeleteBranch}
            onChangeTheme={handleChangeTheme}
            onToggleSimulatedOffline={() => setSimulatedOffline((v) => !v)}
            onSyncNow={handleSyncNow}
            onSaveSettings={handleSaveSettings}
            onRestoreBackup={handleRestoreBackup}
            onDeleteSampleData={handleDeleteSampleData}
            onClearAllData={handleClearAllData}
            onResetDemo={handleResetDemo}
          />
        )}
      </main>

      {/* Modals */}
      <ReceiptModal
        sale={receiptSale}
        branches={branches}
        settings={settings}
        lang={lang}
        onClose={() => setReceiptSale(null)}
        onReverseSale={(sale) => setReversalModalState({ isOpen: true, initialSale: sale })}
      />

      <SaleReversalModal
        isOpen={reversalModalState.isOpen}
        initialSale={reversalModalState.initialSale}
        sales={sales}
        branches={branches}
        activeBranch={activeBranch}
        lang={lang}
        onClose={() => setReversalModalState({ isOpen: false, initialSale: null })}
        onConfirmReversal={handleReverseSale}
      />

      <ProductFormModal
        isOpen={productModalOpen}
        editingProduct={editingProduct}
        lang={lang}
        onClose={() => {
          setProductModalOpen(false);
          setEditingProduct(null);
        }}
        onSave={handleSaveProduct}
      />

      <RestockModal
        product={restockProduct}
        lang={lang}
        onClose={() => setRestockProduct(null)}
        onSubmit={handleAdjustStock}
      />

      <CsvImportModal
        isOpen={csvImportOpen}
        products={branchProducts}
        lang={lang}
        onClose={() => setCsvImportOpen(false)}
        onConfirmImport={handleBulkImportCsv}
      />

      <BranchTransferModal
        product={transferProduct}
        branches={branches}
        activeBranchId={activeBranch.id}
        lang={lang}
        onClose={() => setTransferProduct(null)}
        onTransfer={handleTransferStock}
      />

      <BranchFormModal
        isOpen={branchModalOpen}
        editingBranch={editingBranch}
        lang={lang}
        onClose={() => {
          setBranchModalOpen(false);
          setEditingBranch(null);
        }}
        onSave={handleSaveBranch}
      />
    </div>
  );
}
