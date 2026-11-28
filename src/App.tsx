import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import {
  BarChart3,
  ClipboardList,
  Cloud,
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
import {
  DEFAULT_SETTINGS,
  SEED_BRANCHES,
  SEED_MOVEMENTS,
  SEED_PRODUCTS,
  SEED_SALES,
} from './data/seedData';
import {
  deleteBranchFromFirestore,
  deleteIdsFromFirestore,
  deleteProductFromFirestore,
  pushSnapshotToFirestore,
  pushSnapshotToFirestoreAsync,
  resetKnownFirestoreIds,
  subscribeToStoreCollections,
  syncBranchToFirestore,
  syncMovementToFirestore,
  syncProductToFirestore,
  syncSaleToFirestore,
  syncSettingsToFirestore,
} from './db/firestoreSync';
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
  replaceLocalStore,
  replaceLocalStoreForBranch,
  resetToSeedData,
  restoreSnapshot,
  reverseSale,
  saveBranch,
  saveProduct,
  saveSettings,
  syncPendingRecords,
  transferProductStock,
} from './db/offlineDb';
import {
  auth,
  db,
  ensureAnonymousAuth,
  firebaseConfigError,
  firebaseConfigSource,
  firebaseProjectId,
  isFirebaseConfigured,
  isFirestoreCacheError,
  persistencePromise,
  recoverFromFirestoreCacheError,
  resolveShopId,
} from './firebase';
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

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreMeta, setFirestoreMeta] = useState({
    active: false,
    persistenceEnabled: false,
    fromCache: false,
    hasPendingWrites: false,
    error: null as string | null,
  });

  const latestSnapshotRef = useRef<FullStoreSnapshot>({
    products: [],
    sales: [],
    movements: [],
    branches: SEED_BRANCHES,
    settings: DEFAULT_SETTINGS,
  });
  latestSnapshotRef.current = { products, sales, movements, branches, settings };
  const wasSimulatedOfflineRef = useRef(false);

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
    persistencePromise.then(({ enabled }) => {
      if (active) {
        setFirestoreMeta((prev) => ({ ...prev, persistenceEnabled: enabled }));
      }
    });
    let unsubAuth: (() => void) | null = null;
    if (!isFirebaseConfigured || !auth) {
      setAuthReady(true);
    } else {
      unsubAuth = onAuthStateChanged(auth, (user) => {
        if (!active) return;
        setAuthUser(user);
        setAuthReady(true);
        if (!user || !user.isAnonymous) {
          resetKnownFirestoreIds();
          setFirestoreMeta((prev) => ({
            ...prev,
            active: false,
            fromCache: false,
            hasPendingWrites: false,
            error: null,
          }));
          if (navigator.onLine) {
            void ensureAnonymousAuth().catch((err) => {
              if (!active) return;
              const msg = err instanceof Error ? err.message : String(err);
              setFirestoreMeta((prev) => ({ ...prev, error: msg }));
            });
          }
        }
      });
    }
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
      if (unsubAuth) unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (!db) return;
    if (simulatedOffline) {
      wasSimulatedOfflineRef.current = true;
      void disableNetwork(db).catch(() => {});
    } else if (wasSimulatedOfflineRef.current) {
      wasSimulatedOfflineRef.current = false;
      void enableNetwork(db).catch(() => {});
    }
  }, [simulatedOffline]);

  const handleFirestoreSyncError = useCallback((err: Error) => {
    let msg = err.message;
    try {
      const parsed = JSON.parse(err.message) as { error?: string };
      if (parsed.error) msg = parsed.error;
    } catch {
      // Keep raw message
    }
    if (isFirestoreCacheError(msg)) {
      void recoverFromFirestoreCacheError(msg).then((recovering) => {
        if (recovering) {
          setFirestoreMeta((prev) => ({
            ...prev,
            error:
              'Firestore cache reset in progress. Reconnecting automatically...',
          }));
        }
      });
    }
    setFirestoreMeta((prev) => ({ ...prev, error: msg }));
  }, []);

  // Anonymous Auth is used strictly for login, never for shop/data isolation
  const isCloudSignedIn = Boolean(authUser?.isAnonymous);
  const activeShopId = resolveShopId(settings.shopId);
  const multiBranchEnabled = settings.multiBranchEnabled !== false;

  const mainBranch = useMemo(
    () => branches.find((b) => b.isMain) ?? branches[0] ?? SEED_BRANCHES[0],
    [branches]
  );

  const activeBranch = useMemo(() => {
    if (!multiBranchEnabled) {
      return mainBranch;
    }
    return branches.find((b) => b.id === settings.activeBranchId) ?? mainBranch;
  }, [branches, settings.activeBranchId, multiBranchEnabled, mainBranch]);

  const selectedBranchId = activeBranch.id;

  // Attach real-time Firestore listeners once Anonymous Auth is ready using shared shopId + selectedBranchId
  useEffect(() => {
    if (!authReady || loading || !isCloudSignedIn) {
      return;
    }

    let cloudInitialized = false;
    setFirestoreMeta((prev) => ({ ...prev, active: true, error: null }));

    const unsubscribe = subscribeToStoreCollections({
      shopId: activeShopId,
      branchId: selectedBranchId,
      onBranches: (remoteBranches, meta) => {
        setFirestoreMeta((prev) => ({
          ...prev,
          active: true,
          fromCache: meta.fromCache,
          hasPendingWrites: meta.hasPendingWrites,
        }));
        if (meta.cloudHasData || cloudInitialized) {
          if (remoteBranches.length > 0) {
            cloudInitialized = true;
            setBranches(remoteBranches);
            void replaceLocalStore('branches', remoteBranches);
          }
        }
      },
      onProducts: (remoteProducts, meta) => {
        setFirestoreMeta((prev) => ({
          ...prev,
          active: true,
          fromCache: meta.fromCache,
          hasPendingWrites: meta.hasPendingWrites,
        }));
        if (meta.cloudHasData || remoteProducts.length > 0 || cloudInitialized) {
          cloudInitialized = true;
          void replaceLocalStoreForBranch(
            'products',
            selectedBranchId,
            mainBranch.id,
            remoteProducts
          ).then((merged) => {
            setProducts(merged.sort((a, b) => a.nameEn.localeCompare(b.nameEn)));
          });
        }
      },
      onSales: (remoteSales, meta) => {
        setFirestoreMeta((prev) => ({
          ...prev,
          active: true,
          fromCache: meta.fromCache,
          hasPendingWrites: meta.hasPendingWrites,
        }));
        if (meta.cloudHasData || remoteSales.length > 0 || cloudInitialized) {
          void replaceLocalStoreForBranch(
            'sales',
            selectedBranchId,
            mainBranch.id,
            remoteSales
          ).then((merged) => {
            setSales(merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          });
        }
      },
      onMovements: (remoteMovements, meta) => {
        if (meta.cloudHasData || remoteMovements.length > 0 || cloudInitialized) {
          void replaceLocalStoreForBranch(
            'movements',
            selectedBranchId,
            mainBranch.id,
            remoteMovements
          ).then((merged) => {
            setMovements(merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
          });
        }
      },
      onSettings: (remoteSettings) => {
        if (remoteSettings) {
          setSettings((prev) => {
            const merged: StoreSettings = {
              ...prev,
              ...remoteSettings,
              shopId: resolveShopId(remoteSettings.shopId ?? prev.shopId),
              // Keep each device's local branch & theme selection independent
              activeBranchId: prev.activeBranchId ?? remoteSettings.activeBranchId,
              theme: prev.theme ?? remoteSettings.theme,
            };
            void replaceLocalStore('settings', [merged]);
            return merged;
          });
          setLang(remoteSettings.defaultLanguage);
        }
      },
      onInitialEmptyCloud: () => {
        cloudInitialized = true;
        pushSnapshotToFirestore(
          activeShopId,
          selectedBranchId,
          latestSnapshotRef.current,
          handleFirestoreSyncError
        );
      },
      onError: handleFirestoreSyncError,
    });

    return () => {
      unsubscribe();
    };
  }, [
    authReady,
    isCloudSignedIn,
    loading,
    activeShopId,
    selectedBranchId,
    mainBranch.id,
    handleFirestoreSyncError,
  ]);

  // Scope products to the selected branch so all devices on same shop + branch see the exact same product count
  const branchProducts = useMemo(
    () =>
      products
        .filter((p) => (p.branchId || mainBranch.id) === activeBranch.id)
        .map((p) => ({
          ...p,
          stock: p.branchStocks ? p.branchStocks[activeBranch.id] ?? p.stock : p.stock,
        })),
    [products, activeBranch.id, mainBranch.id]
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

  // cloudUid is derived above auth listener effect

  const handleToggleMultiBranch = async (enabled: boolean) => {
    const updated: StoreSettings = {
      ...settings,
      shopId: activeShopId,
      multiBranchEnabled: enabled,
      activeBranchId: enabled ? settings.activeBranchId ?? mainBranch.id : mainBranch.id,
      updatedAt: new Date().toISOString(),
    };
    setSettings(updated);
    await saveSettings(updated);
    if (isCloudSignedIn) {
      syncSettingsToFirestore(activeShopId, updated, handleFirestoreSyncError);
    }
  };

  const handleSelectBranch = async (branchId: string) => {
    const updated: StoreSettings = { ...settings, activeBranchId: branchId };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleSaveBranch = async (branch: Branch) => {
    const withShop: Branch = {
      ...branch,
      shopId: activeShopId,
      updatedAt: new Date().toISOString(),
    };
    await saveBranch(withShop);
    await reloadSnapshot();
    if (isCloudSignedIn) {
      syncBranchToFirestore(activeShopId, withShop, handleFirestoreSyncError);
    }
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
    if (isCloudSignedIn) {
      deleteBranchFromFirestore(activeShopId, branchId, handleFirestoreSyncError);
    }
  };

  const handleCompleteSale = async (params: {
    cart: CartItem[];
    discount: number;
    paymentMethod: PaymentMethod;
    amountPaid: number;
  }) => {
    const createdSale = await completeSale({
      ...params,
      branch: { ...activeBranch, shopId: activeShopId },
      existingSalesCount: sales.length,
      isOffline,
    });
    const snap = await reloadSnapshot();
    setReceiptSale(createdSale);
    if (isCloudSignedIn) {
      syncSaleToFirestore(activeShopId, createdSale, handleFirestoreSyncError);
      const cartIds = new Set(params.cart.map((c) => c.productId));
      snap.products
        .filter((p) => cartIds.has(p.id))
        .forEach((p) => syncProductToFirestore(activeShopId, p, handleFirestoreSyncError));
      snap.movements
        .filter((m) => m.reason === createdSale.invoiceNo)
        .forEach((m) => syncMovementToFirestore(activeShopId, m, handleFirestoreSyncError));
    }
  };

  const handleSaveProduct = async (product: Product, isNew: boolean) => {
    const nowIso = new Date().toISOString();
    const enriched: Product = {
      ...product,
      shopId: activeShopId,
      branchId: product.branchId || activeBranch.id,
      updatedAt: nowIso,
    };
    await saveProduct(enriched, isNew, { ...activeBranch, shopId: activeShopId }, isOffline);
    const snap = await reloadSnapshot();
    if (isCloudSignedIn) {
      const savedProd = snap.products.find((p) => p.id === product.id);
      if (savedProd) {
        syncProductToFirestore(activeShopId, savedProd, handleFirestoreSyncError);
      }
      if (isNew && product.stock > 0) {
        const initMov = snap.movements.find(
          (m) => m.productId === product.id && m.type === 'initial'
        );
        if (initMov) {
          syncMovementToFirestore(activeShopId, initMov, handleFirestoreSyncError);
        }
      }
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    await removeProduct(productId);
    await reloadSnapshot();
    if (isCloudSignedIn) {
      deleteProductFromFirestore(activeShopId, productId, handleFirestoreSyncError);
    }
  };

  const handleBulkImportCsv = async (params: {
    items: CsvImportCandidate[];
    stockMode: 'replace' | 'add';
  }) => {
    const res = await bulkImportProducts({
      items: params.items,
      stockMode: params.stockMode,
      branch: { ...activeBranch, shopId: activeShopId },
      isOffline,
    });
    const snap = await reloadSnapshot();
    if (isCloudSignedIn) {
      pushSnapshotToFirestore(activeShopId, selectedBranchId, snap, handleFirestoreSyncError);
    }
    return res;
  };

  const handleAdjustStock = async (params: {
    product: Product;
    delta: number;
    type: MovementType;
    reason: string;
    newCostPrice?: number;
  }) => {
    const { updatedProduct, movement } = await adjustStock({
      ...params,
      branch: { ...activeBranch, shopId: activeShopId },
      isOffline,
    });
    await reloadSnapshot();
    if (isCloudSignedIn) {
      syncProductToFirestore(activeShopId, updatedProduct, handleFirestoreSyncError);
      syncMovementToFirestore(activeShopId, movement, handleFirestoreSyncError);
    }
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
    const snap = await reloadSnapshot();
    if (isCloudSignedIn) {
      const updatedProd = snap.products.find((p) => p.id === params.product.id);
      if (updatedProd) {
        syncProductToFirestore(activeShopId, updatedProd, handleFirestoreSyncError);
      }
      snap.movements
        .filter(
          (m) =>
            m.productId === params.product.id &&
            (m.type === 'transfer_in' || m.type === 'transfer_out')
        )
        .slice(0, 2)
        .forEach((m) => syncMovementToFirestore(activeShopId, m, handleFirestoreSyncError));
    }
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
    const snap = await reloadSnapshot();
    if (reversalRecord) {
      setReceiptSale(reversalRecord);
    }
    if (isCloudSignedIn) {
      const updatedOrig = snap.sales.find((s) => s.id === params.saleId);
      if (updatedOrig) {
        syncSaleToFirestore(
          activeShopId,
          { ...updatedOrig, shopId: activeShopId, updatedAt: new Date().toISOString() },
          handleFirestoreSyncError
        );
      }
      if (reversalRecord && reversalRecord.id !== params.saleId) {
        syncSaleToFirestore(
          activeShopId,
          { ...reversalRecord, shopId: activeShopId, updatedAt: new Date().toISOString() },
          handleFirestoreSyncError
        );
      }
      if (params.restoreStock) {
        const retIds = new Set(params.itemsToReturn.map((i) => i.productId));
        snap.products
          .filter((p) => retIds.has(p.id))
          .forEach((p) => syncProductToFirestore(activeShopId, p, handleFirestoreSyncError));
        snap.movements
          .filter(
            (m) =>
              m.type === 'void' &&
              updatedOrig &&
              m.reason.includes(updatedOrig.invoiceNo)
          )
          .slice(0, retIds.size)
          .forEach((m) => syncMovementToFirestore(activeShopId, m, handleFirestoreSyncError));
      }
    }
  };

  const handleSaveSettings = async (next: StoreSettings) => {
    const updated: StoreSettings = {
      ...next,
      shopId: resolveShopId(next.shopId),
      updatedAt: new Date().toISOString(),
    };
    await saveSettings(updated);
    setLang(updated.defaultLanguage);
    if (updated.theme) {
      setTheme(updated.theme);
    }
    const snap = await reloadSnapshot();
    if (isCloudSignedIn) {
      syncSettingsToFirestore(
        resolveShopId(snap.settings.shopId),
        snap.settings,
        handleFirestoreSyncError
      );
    }
  };

  const handleChangeTheme = async (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    const updated: StoreSettings = { ...settings, theme: nextTheme };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleSyncNow = async () => {
    if (!isFirebaseConfigured || !auth || !db) {
      throw new Error(firebaseConfigError ?? 'VITE_FIREBASE_CONFIG missing or invalid JSON');
    }

    if (!isCloudSignedIn) {
      if (isOffline) {
        throw new Error(
          lang === 'mm'
            ? 'Firestore သို့ Sync လုပ်ရန် အင်တာနက် ချိတ်ဆက်ပေးပါ'
            : 'Connect to the internet to initialize Anonymous Cloud Sync'
        );
      }
      await ensureAnonymousAuth();
    }

    await syncPendingRecords();
    const snap = await reloadSnapshot();
    await pushSnapshotToFirestoreAsync(
      activeShopId,
      selectedBranchId,
      snap,
      isOffline,
      handleFirestoreSyncError
    );
    const syncedSettings: StoreSettings = {
      ...snap.settings,
      shopId: activeShopId,
      lastSyncedAt: new Date().toISOString(),
    };
    await saveSettings(syncedSettings);
    setSettings(syncedSettings);
    setFirestoreMeta((prev) => ({ ...prev, error: null }));
  };

  const handleRestoreBackup = async (snap: FullStoreSnapshot) => {
    await restoreSnapshot(snap);
    const reloaded = await reloadSnapshot();
    setLang(reloaded.settings.defaultLanguage);
    setTheme(reloaded.settings.theme ?? 'light');
    if (isCloudSignedIn) {
      pushSnapshotToFirestore(
        resolveShopId(reloaded.settings.shopId),
        reloaded.settings.activeBranchId || selectedBranchId,
        reloaded,
        handleFirestoreSyncError
      );
    }
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
    if (isCloudSignedIn) {
      pushSnapshotToFirestore(
        resolveShopId(snap.settings.shopId),
        snap.settings.activeBranchId || 'branch-1',
        snap,
        handleFirestoreSyncError
      );
    }
  };

  const handleDeleteSampleData = async () => {
    const sampleProductIds = SEED_PRODUCTS.map((p) => p.id);
    const sampleSaleIds = SEED_SALES.map((s) => s.id);
    const sampleMovementIds = SEED_MOVEMENTS.map((m) => m.id);
    const res = await deleteSampleData();
    await reloadSnapshot();
    if (isCloudSignedIn) {
      deleteIdsFromFirestore(
        activeShopId,
        {
          productIds: sampleProductIds,
          saleIds: sampleSaleIds,
          movementIds: sampleMovementIds,
        },
        handleFirestoreSyncError
      );
    }
    return res;
  };

  const handleClearAllData = async () => {
    const pIds = products
      .filter((p) => (p.branchId || mainBranch.id) === selectedBranchId)
      .map((p) => p.id);
    const sIds = sales
      .filter((s) => (s.branchId || mainBranch.id) === selectedBranchId)
      .map((s) => s.id);
    const mIds = movements
      .filter((m) => (m.branchId || mainBranch.id) === selectedBranchId)
      .map((m) => m.id);
    await clearAllStoreData();
    await reloadSnapshot();
    if (isCloudSignedIn) {
      deleteIdsFromFirestore(
        activeShopId,
        { productIds: pIds, saleIds: sIds, movementIds: mIds },
        handleFirestoreSyncError
      );
    }
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
          {/* Active Branch Switcher (only shown when Multi-Branch Mode is On) */}
          {multiBranchEnabled && (
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
          )}

          {/* Cloud Sync Quick Status */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Cloud
              className={`w-3.5 h-3.5 ${
                firestoreMeta.active
                  ? 'text-[var(--accent-text)]'
                  : 'text-[var(--text-muted)]'
              }`}
            />
            <span>
              {!isFirebaseConfigured
                ? 'Local Mode'
                : authUser
                ? firestoreMeta.hasPendingWrites
                  ? 'Cloud Syncing...'
                  : firestoreMeta.fromCache
                  ? 'Cloud Cache'
                  : 'Cloud Synced'
                : 'Cloud Sync'}
            </span>
          </button>

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
            multiBranchEnabled={multiBranchEnabled}
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
            multiBranchEnabled={multiBranchEnabled}
            lang={lang}
          />
        ) : activeTab === 'sales' ? (
          <SalesReportView
            sales={sales}
            branches={branches}
            activeBranch={activeBranch}
            multiBranchEnabled={multiBranchEnabled}
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
            multiBranchEnabled={multiBranchEnabled}
            lang={lang}
            theme={theme}
            isBrowserOnline={isBrowserOnline}
            simulatedOffline={simulatedOffline}
            pendingSyncCount={pendingSyncCount}
            snapshot={snapshot}
            onToggleMultiBranch={handleToggleMultiBranch}
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
            firebaseConfigured={isFirebaseConfigured}
            firebaseProjectId={firebaseProjectId}
            firebaseConfigSource={firebaseConfigSource}
            firebaseConfigError={firebaseConfigError}
            shopId={activeShopId}
            authUser={
              authUser
                ? {
                    uid: authUser.uid,
                    isAnonymous: authUser.isAnonymous,
                  }
                : null
            }
            firestoreMeta={firestoreMeta}
          />
        )}
      </main>

      {/* Modals */}
      <ReceiptModal
        sale={receiptSale}
        branches={branches}
        settings={settings}
        multiBranchEnabled={multiBranchEnabled}
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
        multiBranchEnabled={multiBranchEnabled}
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
