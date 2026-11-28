import {
  DocumentData,
  DocumentReference,
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { SEED_MOVEMENTS, SEED_PRODUCTS, SEED_SALES } from '../data/seedData';
import { DEFAULT_SHOP_ID, OperationType, db, handleFirestoreError } from '../firebase';
import { Branch, Product, Sale, StockMovement, StoreSettings } from '../types/pos';
import { FullStoreSnapshot } from './offlineDb';

export interface FirestoreSyncMetadata {
  fromCache: boolean;
  hasPendingWrites: boolean;
  branchesLoaded: boolean;
  productsLoaded: boolean;
  salesLoaded: boolean;
}

const SEED_PRODUCT_ID_SET = new Set(SEED_PRODUCTS.map((p) => p.id));
const SEED_SALE_ID_SET = new Set(SEED_SALES.map((s) => s.id));
const SEED_MOVEMENT_ID_SET = new Set(SEED_MOVEMENTS.map((m) => m.id));

const knownIds = {
  branches: new Set<string>(),
  products: new Set<string>(),
  sales: new Set<string>(),
  movements: new Set<string>(),
  settings: new Set<string>(),
};

export function resetKnownFirestoreIds() {
  knownIds.branches.clear();
  knownIds.products.clear();
  knownIds.sales.clear();
  knownIds.movements.clear();
  knownIds.settings.clear();
}

export function toFirestoreDocId(shopId: string, entityId: string): string {
  const cleanShop = (shopId || DEFAULT_SHOP_ID).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const cleanEntity = entityId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 78);
  return `${cleanShop}_${cleanEntity}`;
}

function clampStr(val: string | undefined, maxLen: number): string {
  return (val ?? '').slice(0, maxLen);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function buildBranchCreatePayload(shopId: string, branch: Branch) {
  const nowIso = new Date().toISOString();
  return {
    id: clampStr(branch.id, 128),
    shopId: clampStr(shopId || DEFAULT_SHOP_ID, 128),
    code: clampStr(branch.code, 32) || 'BR',
    nameMm: clampStr(branch.nameMm, 120) || 'Branch',
    nameEn: clampStr(branch.nameEn, 120) || 'Branch',
    phone: clampStr(branch.phone, 40),
    addressMm: clampStr(branch.addressMm, 300),
    addressEn: clampStr(branch.addressEn, 300),
    isMain: Boolean(branch.isMain),
    createdAt: clampStr(branch.createdAt || nowIso, 64),
    updatedAt: clampStr(branch.updatedAt || nowIso, 64),
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  };
}

function buildBranchUpdatePayload(branch: Branch) {
  return {
    code: clampStr(branch.code, 32) || 'BR',
    nameMm: clampStr(branch.nameMm, 120) || 'Branch',
    nameEn: clampStr(branch.nameEn, 120) || 'Branch',
    phone: clampStr(branch.phone, 40),
    addressMm: clampStr(branch.addressMm, 300),
    addressEn: clampStr(branch.addressEn, 300),
    isMain: Boolean(branch.isMain),
    updatedAt: clampStr(branch.updatedAt || new Date().toISOString(), 64),
    serverUpdatedAt: serverTimestamp(),
  };
}

function buildProductCreatePayload(shopId: string, product: Product, fallbackBranchId = 'branch-1') {
  const nowIso = new Date().toISOString();
  return stripUndefined({
    id: clampStr(product.id, 128),
    shopId: clampStr(shopId || DEFAULT_SHOP_ID, 128),
    branchId: clampStr(product.branchId || fallbackBranchId, 128),
    sku: clampStr(product.sku, 64) || 'SKU',
    nameMm: clampStr(product.nameMm, 160) || 'Product',
    nameEn: clampStr(product.nameEn, 160) || 'Product',
    category: product.category,
    costPrice: Math.max(0, Number(product.costPrice) || 0),
    sellPrice: Math.max(0, Number(product.sellPrice) || 0),
    stock: Math.max(0, Number(product.stock) || 0),
    branchStocks: product.branchStocks ?? undefined,
    minStock: Math.max(0, Number(product.minStock) || 0),
    unitMm: clampStr(product.unitMm, 32) || 'ခု',
    unitEn: clampStr(product.unitEn, 32) || 'pcs',
    updatedAt: clampStr(product.updatedAt || nowIso, 64),
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });
}

function buildProductUpdatePayload(product: Product) {
  return stripUndefined({
    sku: clampStr(product.sku, 64) || 'SKU',
    nameMm: clampStr(product.nameMm, 160) || 'Product',
    nameEn: clampStr(product.nameEn, 160) || 'Product',
    category: product.category,
    costPrice: Math.max(0, Number(product.costPrice) || 0),
    sellPrice: Math.max(0, Number(product.sellPrice) || 0),
    stock: Math.max(0, Number(product.stock) || 0),
    branchStocks: product.branchStocks ?? undefined,
    minStock: Math.max(0, Number(product.minStock) || 0),
    unitMm: clampStr(product.unitMm, 32) || 'ခု',
    unitEn: clampStr(product.unitEn, 32) || 'pcs',
    updatedAt: clampStr(product.updatedAt || new Date().toISOString(), 64),
    serverUpdatedAt: serverTimestamp(),
  });
}

function buildSaleCreatePayload(shopId: string, sale: Sale, fallbackBranchId = 'branch-1') {
  const nowIso = new Date().toISOString();
  return stripUndefined({
    id: clampStr(sale.id, 128),
    shopId: clampStr(shopId || DEFAULT_SHOP_ID, 128),
    invoiceNo: clampStr(sale.invoiceNo, 64),
    branchId: clampStr(sale.branchId || fallbackBranchId, 128),
    branchNameMm: sale.branchNameMm ? clampStr(sale.branchNameMm, 120) : undefined,
    branchNameEn: sale.branchNameEn ? clampStr(sale.branchNameEn, 120) : undefined,
    items: sale.items.slice(0, 100).map((item) => ({
      productId: clampStr(item.productId, 128),
      sku: clampStr(item.sku, 64),
      nameMm: clampStr(item.nameMm, 160),
      nameEn: clampStr(item.nameEn, 160),
      unitMm: clampStr(item.unitMm, 32),
      unitEn: clampStr(item.unitEn, 32),
      qty: Number(item.qty) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      costPrice: Number(item.costPrice) || 0,
      subtotal: Number(item.subtotal) || 0,
    })),
    subtotal: Number(sale.subtotal) || 0,
    discount: Number(sale.discount) || 0,
    total: Number(sale.total) || 0,
    profit: Number(sale.profit) || 0,
    paymentMethod: sale.paymentMethod,
    amountPaid: Number(sale.amountPaid) || 0,
    changeGiven: Math.max(0, Number(sale.changeGiven) || 0),
    status: sale.status,
    synced: Boolean(sale.synced),
    note: sale.note ? clampStr(sale.note, 300) : undefined,
    reversalReason: sale.reversalReason ? clampStr(sale.reversalReason, 300) : undefined,
    reversedAt: sale.reversedAt ? clampStr(sale.reversedAt, 64) : undefined,
    reversedItems: sale.reversedItems ?? undefined,
    reversalOfInvoiceNo: sale.reversalOfInvoiceNo
      ? clampStr(sale.reversalOfInvoiceNo, 64)
      : undefined,
    createdAt: clampStr(sale.createdAt || nowIso, 64),
    updatedAt: clampStr(sale.updatedAt || sale.createdAt || nowIso, 64),
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });
}

function buildMovementCreatePayload(
  shopId: string,
  mov: StockMovement,
  fallbackBranchId = 'branch-1'
) {
  const created = clampStr(mov.createdAt || new Date().toISOString(), 64);
  return stripUndefined({
    id: clampStr(mov.id, 128),
    shopId: clampStr(shopId || DEFAULT_SHOP_ID, 128),
    productId: clampStr(mov.productId, 128),
    sku: clampStr(mov.sku, 64),
    productNameMm: clampStr(mov.productNameMm, 160),
    productNameEn: clampStr(mov.productNameEn, 160),
    branchId: clampStr(mov.branchId || fallbackBranchId, 128),
    branchNameMm: mov.branchNameMm ? clampStr(mov.branchNameMm, 120) : undefined,
    branchNameEn: mov.branchNameEn ? clampStr(mov.branchNameEn, 120) : undefined,
    type: mov.type,
    delta: Number(mov.delta) || 0,
    previousStock: Math.max(0, Number(mov.previousStock) || 0),
    newStock: Math.max(0, Number(mov.newStock) || 0),
    reason: clampStr(mov.reason, 300),
    synced: Boolean(mov.synced),
    createdAt: created,
    updatedAt: clampStr(mov.updatedAt || created, 64),
    serverCreatedAt: serverTimestamp(),
  });
}

function buildSettingsCreatePayload(shopId: string, settings: StoreSettings) {
  const nowIso = new Date().toISOString();
  return stripUndefined({
    id: clampStr(settings.id || 'default', 128),
    shopId: clampStr(shopId || DEFAULT_SHOP_ID, 128),
    storeNameMm: clampStr(settings.storeNameMm, 120),
    storeNameEn: clampStr(settings.storeNameEn, 120),
    phone: clampStr(settings.phone, 40),
    addressMm: clampStr(settings.addressMm, 300),
    addressEn: clampStr(settings.addressEn, 300),
    receiptFooterMm: clampStr(settings.receiptFooterMm, 200),
    receiptFooterEn: clampStr(settings.receiptFooterEn, 200),
    defaultLanguage: settings.defaultLanguage,
    theme: settings.theme ?? 'light',
    activeBranchId: settings.activeBranchId
      ? clampStr(settings.activeBranchId, 128)
      : undefined,
    multiBranchEnabled: settings.multiBranchEnabled ?? true,
    lastSyncedAt: settings.lastSyncedAt ?? null,
    updatedAt: clampStr(settings.updatedAt || nowIso, 64),
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });
}

function buildSettingsUpdatePayload(settings: StoreSettings) {
  return stripUndefined({
    storeNameMm: clampStr(settings.storeNameMm, 120),
    storeNameEn: clampStr(settings.storeNameEn, 120),
    phone: clampStr(settings.phone, 40),
    addressMm: clampStr(settings.addressMm, 300),
    addressEn: clampStr(settings.addressEn, 300),
    receiptFooterMm: clampStr(settings.receiptFooterMm, 200),
    receiptFooterEn: clampStr(settings.receiptFooterEn, 200),
    defaultLanguage: settings.defaultLanguage,
    theme: settings.theme ?? 'light',
    activeBranchId: settings.activeBranchId
      ? clampStr(settings.activeBranchId, 128)
      : undefined,
    multiBranchEnabled: settings.multiBranchEnabled ?? true,
    lastSyncedAt: settings.lastSyncedAt ?? null,
    updatedAt: clampStr(settings.updatedAt || new Date().toISOString(), 64),
    serverUpdatedAt: serverTimestamp(),
  });
}

function cleanFirestoreDoc<T>(raw: Record<string, unknown>): T {
  const copy = { ...raw };
  delete copy.serverCreatedAt;
  delete copy.serverUpdatedAt;
  if (copy.createdAt instanceof Timestamp) {
    copy.createdAt = copy.createdAt.toDate().toISOString();
  }
  if (copy.updatedAt instanceof Timestamp) {
    copy.updatedAt = copy.updatedAt.toDate().toISOString();
  }
  return copy as T;
}

export function subscribeToStoreCollections(params: {
  shopId: string;
  branchId: string;
  onBranches: (
    branches: Branch[],
    meta: { fromCache: boolean; hasPendingWrites: boolean; cloudHasData: boolean }
  ) => void;
  onProducts: (
    products: Product[],
    meta: {
      fromCache: boolean;
      hasPendingWrites: boolean;
      cloudHasData: boolean;
      productsCount: number;
    }
  ) => void;
  onSales: (
    sales: Sale[],
    meta: { fromCache: boolean; hasPendingWrites: boolean; cloudHasData: boolean }
  ) => void;
  onMovements: (
    movements: StockMovement[],
    meta: { fromCache: boolean; cloudHasData: boolean }
  ) => void;
  onSettings: (settings: StoreSettings | null) => void;
  onInitialEmptyCloud?: () => void;
  onError: (err: Error) => void;
}): () => void {
  const {
    shopId,
    branchId,
    onBranches,
    onProducts,
    onSales,
    onMovements,
    onSettings,
    onInitialEmptyCloud,
    onError,
  } = params;

  if (!db) {
    return () => {};
  }
  const firestore = db;

  let unsubscribed = false;
  let checkedBootstrap = false;
  let initialBranchesEmpty: boolean | null = null;
  let initialProductsEmpty: boolean | null = null;
  let initialBranchesFromCache = true;
  let initialProductsFromCache = true;
  let cloudHasData = false;

  const maybeTriggerBootstrap = () => {
    if (initialBranchesEmpty === false || initialProductsEmpty === false) {
      cloudHasData = true;
    }
    if (
      checkedBootstrap ||
      initialBranchesEmpty === null ||
      initialProductsEmpty === null ||
      initialBranchesFromCache ||
      initialProductsFromCache
    ) {
      return;
    }
    checkedBootstrap = true;
    if (initialBranchesEmpty && initialProductsEmpty && onInitialEmptyCloud) {
      onInitialEmptyCloud();
    }
  };

  const branchesQ = query(collection(firestore, 'branches'), where('shopId', '==', shopId));
  const unsubBranches = onSnapshot(
    branchesQ,
    { includeMetadataChanges: true },
    (snap) => {
      if (unsubscribed) return;
      knownIds.branches = new Set(snap.docs.map((d) => d.id));
      initialBranchesEmpty = snap.empty;
      initialBranchesFromCache = snap.metadata.fromCache;
      if (!snap.empty) {
        cloudHasData = true;
      }
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<Branch>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) =>
          a.isMain === b.isMain ? a.code.localeCompare(b.code) : a.isMain ? -1 : 1
        );
      maybeTriggerBootstrap();
      onBranches(list, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
        cloudHasData,
      });
    },
    (error) => {
      if (unsubscribed) return;
      try {
        handleFirestoreError(error, OperationType.GET, 'branches');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const productsQ = query(
    collection(firestore, 'products'),
    where('shopId', '==', shopId),
    where('branchId', '==', branchId)
  );
  const unsubProducts = onSnapshot(
    productsQ,
    { includeMetadataChanges: true },
    (snap) => {
      if (unsubscribed) return;
      knownIds.products = new Set(snap.docs.map((d) => d.id));
      initialProductsEmpty = snap.empty;
      initialProductsFromCache = snap.metadata.fromCache;
      if (!snap.empty) {
        cloudHasData = true;
      }
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<Product>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
      maybeTriggerBootstrap();
      onProducts(list, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
        cloudHasData,
        productsCount: snap.size,
      });
    },
    (error) => {
      if (unsubscribed) return;
      try {
        handleFirestoreError(error, OperationType.GET, 'products');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const salesQ = query(
    collection(firestore, 'sales'),
    where('shopId', '==', shopId),
    where('branchId', '==', branchId)
  );
  const unsubSales = onSnapshot(
    salesQ,
    { includeMetadataChanges: true },
    (snap) => {
      if (unsubscribed) return;
      knownIds.sales = new Set(snap.docs.map((d) => d.id));
      if (!snap.empty) {
        cloudHasData = true;
      }
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<Sale>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onSales(list, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
        cloudHasData,
      });
    },
    (error) => {
      if (unsubscribed) return;
      try {
        handleFirestoreError(error, OperationType.GET, 'sales');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const movementsQ = query(
    collection(firestore, 'movements'),
    where('shopId', '==', shopId),
    where('branchId', '==', branchId)
  );
  const unsubMovements = onSnapshot(
    movementsQ,
    { includeMetadataChanges: true },
    (snap) => {
      if (unsubscribed) return;
      knownIds.movements = new Set(snap.docs.map((d) => d.id));
      if (!snap.empty) {
        cloudHasData = true;
      }
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<StockMovement>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onMovements(list, { fromCache: snap.metadata.fromCache, cloudHasData });
    },
    (error) => {
      if (unsubscribed) return;
      try {
        handleFirestoreError(error, OperationType.GET, 'movements');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const settingsQ = query(collection(firestore, 'settings'), where('shopId', '==', shopId));
  const unsubSettings = onSnapshot(
    settingsQ,
    { includeMetadataChanges: true },
    (snap) => {
      if (unsubscribed) return;
      knownIds.settings = new Set(snap.docs.map((d) => d.id));
      if (snap.empty) {
        onSettings(null);
      } else {
        cloudHasData = true;
        const s = cleanFirestoreDoc<StoreSettings>(
          snap.docs[0].data({ serverTimestamps: 'estimate' })
        );
        onSettings(s);
      }
    },
    (error) => {
      if (unsubscribed) return;
      try {
        handleFirestoreError(error, OperationType.GET, 'settings');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  return () => {
    unsubscribed = true;
    unsubBranches();
    unsubProducts();
    unsubSales();
    unsubMovements();
    unsubSettings();
  };
}

function reportWriteError(
  error: unknown,
  op: OperationType,
  path: string,
  onError?: (err: Error) => void
) {
  try {
    handleFirestoreError(error, op, path);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (onError) onError(err);
  }
}

export async function pushSnapshotToFirestoreAsync(
  shopId: string,
  branchId: string,
  snapshot: FullStoreSnapshot,
  isOffline = false,
  onError?: (err: Error) => void
): Promise<void> {
  if (!db) {
    throw new Error('Firebase is not configured (missing VITE_FIREBASE_CONFIG).');
  }
  const firestore = db;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const mainBranchId =
    snapshot.branches.find((b) => b.isMain)?.id ?? snapshot.branches[0]?.id ?? branchId;

  try {
    if (!isOffline) {
      const [bSnap, pSnap, sSnap, mSnap, stSnap] = await Promise.all([
        getDocs(query(collection(firestore, 'branches'), where('shopId', '==', effectiveShopId))),
        getDocs(
          query(
            collection(firestore, 'products'),
            where('shopId', '==', effectiveShopId),
            where('branchId', '==', branchId)
          )
        ),
        getDocs(
          query(
            collection(firestore, 'sales'),
            where('shopId', '==', effectiveShopId),
            where('branchId', '==', branchId)
          )
        ),
        getDocs(
          query(
            collection(firestore, 'movements'),
            where('shopId', '==', effectiveShopId),
            where('branchId', '==', branchId)
          )
        ),
        getDocs(query(collection(firestore, 'settings'), where('shopId', '==', effectiveShopId))),
      ]);
      knownIds.branches = new Set(bSnap.docs.map((d) => d.id));
      knownIds.products = new Set(pSnap.docs.map((d) => d.id));
      knownIds.sales = new Set(sSnap.docs.map((d) => d.id));
      knownIds.movements = new Set(mSnap.docs.map((d) => d.id));
      knownIds.settings = new Set(stSnap.docs.map((d) => d.id));
    }

    // 1. Branches & Settings first (ensures branch docs exist before sales validation)
    const headerBatch = writeBatch(firestore);
    let headerOps = 0;

    for (const branch of snapshot.branches) {
      const docId = toFirestoreDocId(effectiveShopId, branch.id);
      const ref = doc(firestore, 'branches', docId);
      if (knownIds.branches.has(docId)) {
        headerBatch.update(ref, buildBranchUpdatePayload(branch));
      } else {
        headerBatch.set(ref, buildBranchCreatePayload(effectiveShopId, branch));
        knownIds.branches.add(docId);
      }
      headerOps++;
    }

    const settingsDocId = toFirestoreDocId(effectiveShopId, snapshot.settings.id || 'default');
    const settingsRef = doc(firestore, 'settings', settingsDocId);
    const syncedSettings: StoreSettings = {
      ...snapshot.settings,
      shopId: effectiveShopId,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (knownIds.settings.has(settingsDocId)) {
      headerBatch.update(settingsRef, buildSettingsUpdatePayload(syncedSettings));
    } else {
      headerBatch.set(settingsRef, buildSettingsCreatePayload(effectiveShopId, syncedSettings));
      knownIds.settings.add(settingsDocId);
    }
    headerOps++;

    if (headerOps > 0) {
      if (isOffline) {
        void headerBatch.commit().catch((err) =>
          reportWriteError(err, OperationType.WRITE, 'batch', onError)
        );
      } else {
        await headerBatch.commit();
      }
    }

    // 2. Chunk selected branch's products, sales, and movements in batches of <= 400
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    const branchScopedProducts = snapshot.products.filter(
      (p) => (p.branchId || mainBranchId) === branchId
    );
    for (const product of branchScopedProducts) {
      const normalizedProd: Product = {
        ...product,
        shopId: effectiveShopId,
        branchId,
        updatedAt: product.updatedAt || new Date().toISOString(),
      };
      const docId = toFirestoreDocId(effectiveShopId, normalizedProd.id);
      const ref = doc(firestore, 'products', docId);
      if (knownIds.products.has(docId)) {
        ops.push((b) => b.update(ref, buildProductUpdatePayload(normalizedProd)));
      } else {
        knownIds.products.add(docId);
        ops.push((b) =>
          b.set(ref, buildProductCreatePayload(effectiveShopId, normalizedProd, branchId))
        );
      }
    }

    const branchScopedSales = snapshot.sales.filter(
      (s) => (s.branchId || mainBranchId) === branchId
    );
    for (const sale of branchScopedSales) {
      const normalizedSale: Sale = {
        ...sale,
        shopId: effectiveShopId,
        branchId,
        synced: true,
        updatedAt: sale.updatedAt || new Date().toISOString(),
      };
      const docId = toFirestoreDocId(effectiveShopId, normalizedSale.id);
      const ref = doc(firestore, 'sales', docId);
      if (!knownIds.sales.has(docId)) {
        knownIds.sales.add(docId);
        ops.push((b) =>
          b.set(ref, buildSaleCreatePayload(effectiveShopId, normalizedSale, branchId))
        );
      } else if (normalizedSale.status !== 'voided') {
        ops.push((b) =>
          b.update(
            ref,
            stripUndefined({
              status: normalizedSale.status,
              reversedItems: normalizedSale.reversedItems ?? undefined,
              reversalReason: normalizedSale.reversalReason
                ? clampStr(normalizedSale.reversalReason, 300)
                : undefined,
              reversedAt: normalizedSale.reversedAt
                ? clampStr(normalizedSale.reversedAt, 64)
                : undefined,
              synced: true,
              updatedAt: clampStr(normalizedSale.updatedAt, 64),
              serverUpdatedAt: serverTimestamp(),
            })
          )
        );
      }
    }

    const branchScopedMovements = snapshot.movements.filter(
      (m) => (m.branchId || mainBranchId) === branchId
    );
    for (const mov of branchScopedMovements) {
      const docId = toFirestoreDocId(effectiveShopId, mov.id);
      if (!knownIds.movements.has(docId)) {
        knownIds.movements.add(docId);
        const ref = doc(firestore, 'movements', docId);
        ops.push((b) =>
          b.set(
            ref,
            buildMovementCreatePayload(
              effectiveShopId,
              { ...mov, shopId: effectiveShopId, branchId, synced: true },
              branchId
            )
          )
        );
      }
    }

    for (let i = 0; i < ops.length; i += 400) {
      const chunk = ops.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((apply) => apply(b));
      if (isOffline) {
        void b.commit().catch((err) =>
          reportWriteError(err, OperationType.WRITE, 'batch', onError)
        );
      } else {
        await b.commit();
      }
    }
  } catch (err) {
    reportWriteError(err, OperationType.WRITE, 'batch', onError);
    throw err;
  }
}

function isNotFoundFirestoreError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return code === 'not-found' || msg.includes('no document to update');
}

function isPermissionDeniedError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return code === 'permission-denied' || msg.includes('missing or insufficient permissions');
}

async function upsertDocResilient(params: {
  ref: DocumentReference<DocumentData>;
  knownSet: Set<string>;
  docId: string;
  createPayload: Record<string, unknown>;
  updatePayload: Record<string, unknown>;
  path: string;
  onError?: (err: Error) => void;
}): Promise<void> {
  const { ref, knownSet, docId, createPayload, updatePayload, path, onError } = params;
  if (knownSet.has(docId)) {
    try {
      await updateDoc(ref, updatePayload);
      return;
    } catch (err) {
      if (isNotFoundFirestoreError(err)) {
        knownSet.delete(docId);
        try {
          await setDoc(ref, createPayload);
          knownSet.add(docId);
          return;
        } catch (retryErr) {
          reportWriteError(retryErr, OperationType.CREATE, path, onError);
          return;
        }
      }
      reportWriteError(err, OperationType.UPDATE, path, onError);
      return;
    }
  }

  try {
    await setDoc(ref, createPayload);
    knownSet.add(docId);
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      try {
        const existingSnap = await getDoc(ref);
        if (existingSnap.exists()) {
          knownSet.add(docId);
          await updateDoc(ref, updatePayload);
          return;
        }
      } catch (retryErr) {
        reportWriteError(retryErr, OperationType.UPDATE, path, onError);
        return;
      }
    }
    reportWriteError(err, OperationType.CREATE, path, onError);
  }
}

function buildSaleUpdatePayload(sale: Sale) {
  return stripUndefined({
    status: sale.status,
    reversedItems: sale.reversedItems ?? undefined,
    reversalReason: sale.reversalReason ? clampStr(sale.reversalReason, 300) : undefined,
    reversedAt: sale.reversedAt ? clampStr(sale.reversedAt, 64) : undefined,
    synced: true,
    updatedAt: clampStr(sale.updatedAt || new Date().toISOString(), 64),
    serverUpdatedAt: serverTimestamp(),
  });
}

async function fetchCollectionPreferServer<T>(
  q: ReturnType<typeof query>,
  isOffline: boolean
): Promise<{ docs: Array<{ id: string; data: T }> }> {
  const snap = isOffline
    ? await getDocs(q)
    : await getDocsFromServer(q).catch(() => getDocs(q));
  return {
    docs: snap.docs.map((d) => ({
      id: d.id,
      data: cleanFirestoreDoc<T>(d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>),
    })),
  };
}

export interface ReconciledFirestoreResult {
  branches: Branch[];
  products: Product[];
  sales: Sale[];
  movements: StockMovement[];
  settings: StoreSettings | null;
  productsCount: number;
}

export async function reconcileAndSyncFirestore(params: {
  shopId: string;
  branchId: string;
  localSnapshot: FullStoreSnapshot;
  isOffline?: boolean;
  onError?: (err: Error) => void;
}): Promise<ReconciledFirestoreResult> {
  if (!db) {
    throw new Error('Firebase is not configured (missing VITE_FIREBASE_CONFIG).');
  }
  const firestore = db;
  const effectiveShopId = params.shopId || DEFAULT_SHOP_ID;
  const { branchId, localSnapshot, isOffline = false, onError } = params;
  const mainBranchId =
    localSnapshot.branches.find((b) => b.isMain)?.id ??
    localSnapshot.branches[0]?.id ??
    branchId;

  try {
    const [bRes, pRes, sRes, mRes, stRes] = await Promise.all([
      fetchCollectionPreferServer<Branch>(
        query(collection(firestore, 'branches'), where('shopId', '==', effectiveShopId)),
        isOffline
      ),
      fetchCollectionPreferServer<Product>(
        query(
          collection(firestore, 'products'),
          where('shopId', '==', effectiveShopId),
          where('branchId', '==', branchId)
        ),
        isOffline
      ),
      fetchCollectionPreferServer<Sale>(
        query(
          collection(firestore, 'sales'),
          where('shopId', '==', effectiveShopId),
          where('branchId', '==', branchId)
        ),
        isOffline
      ),
      fetchCollectionPreferServer<StockMovement>(
        query(
          collection(firestore, 'movements'),
          where('shopId', '==', effectiveShopId),
          where('branchId', '==', branchId)
        ),
        isOffline
      ),
      fetchCollectionPreferServer<StoreSettings>(
        query(collection(firestore, 'settings'), where('shopId', '==', effectiveShopId)),
        isOffline
      ),
    ]);

    knownIds.branches = new Set(bRes.docs.map((d) => d.id));
    knownIds.products = new Set(pRes.docs.map((d) => d.id));
    knownIds.sales = new Set(sRes.docs.map((d) => d.id));
    knownIds.movements = new Set(mRes.docs.map((d) => d.id));
    knownIds.settings = new Set(stRes.docs.map((d) => d.id));

    const remoteBranchMap = new Map(bRes.docs.map((d) => [d.data.id, d.data]));
    const remoteProdMap = new Map(pRes.docs.map((d) => [d.data.id, d.data]));
    const remoteSaleMap = new Map(sRes.docs.map((d) => [d.data.id, d.data]));
    const remoteMovMap = new Map(mRes.docs.map((d) => [d.data.id, d.data]));
    const remoteSettings = stRes.docs[0]?.data ?? null;

    const headerBatch = writeBatch(firestore);
    let headerOps = 0;
    const mergedBranches = new Map<string, Branch>(remoteBranchMap);

    for (const branch of localSnapshot.branches) {
      const normalizedBranch: Branch = {
        ...branch,
        shopId: effectiveShopId,
        updatedAt: branch.updatedAt || branch.createdAt || new Date().toISOString(),
      };
      const docId = toFirestoreDocId(effectiveShopId, normalizedBranch.id);
      const ref = doc(firestore, 'branches', docId);
      const remote = remoteBranchMap.get(normalizedBranch.id);

      if (!remote) {
        if (bRes.docs.length === 0 || !normalizedBranch.isMain) {
          headerBatch.set(ref, buildBranchCreatePayload(effectiveShopId, normalizedBranch));
          knownIds.branches.add(docId);
          mergedBranches.set(normalizedBranch.id, normalizedBranch);
          headerOps++;
        }
      } else if ((normalizedBranch.updatedAt ?? '') > (remote.updatedAt ?? '')) {
        headerBatch.update(ref, buildBranchUpdatePayload(normalizedBranch));
        mergedBranches.set(normalizedBranch.id, normalizedBranch);
        headerOps++;
      }
    }

    const settingsDocId = toFirestoreDocId(
      effectiveShopId,
      localSnapshot.settings.id || 'default'
    );
    const settingsRef = doc(firestore, 'settings', settingsDocId);
    const syncedAtIso = new Date().toISOString();
    const baseSettings: StoreSettings = {
      ...(remoteSettings ?? localSnapshot.settings),
      ...localSnapshot.settings,
      shopId: effectiveShopId,
      lastSyncedAt: syncedAtIso,
      updatedAt: syncedAtIso,
    };

    if (!remoteSettings) {
      headerBatch.set(settingsRef, buildSettingsCreatePayload(effectiveShopId, baseSettings));
      knownIds.settings.add(settingsDocId);
      headerOps++;
    } else if ((localSnapshot.settings.updatedAt ?? '') >= (remoteSettings.updatedAt ?? '')) {
      headerBatch.update(settingsRef, buildSettingsUpdatePayload(baseSettings));
      headerOps++;
    }

    if (headerOps > 0) {
      await headerBatch.commit();
    }

    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
    const mergedProducts = new Map<string, Product>(remoteProdMap);
    const cloudHasProducts = pRes.docs.length > 0;

    const branchScopedProducts = localSnapshot.products.filter(
      (p) => (p.branchId || mainBranchId) === branchId
    );
    for (const product of branchScopedProducts) {
      const normalizedProd: Product = {
        ...product,
        shopId: effectiveShopId,
        branchId,
        updatedAt: product.updatedAt || new Date().toISOString(),
      };
      const docId = toFirestoreDocId(effectiveShopId, normalizedProd.id);
      const ref = doc(firestore, 'products', docId);
      const remote = remoteProdMap.get(normalizedProd.id);

      if (!remote) {
        // Avoid resurrecting default sample rows if another device already cleared/customized this branch in Firestore
        const isUneditedSeed = SEED_PRODUCT_ID_SET.has(normalizedProd.id);
        if (!cloudHasProducts || !isUneditedSeed) {
          knownIds.products.add(docId);
          ops.push((b) =>
            b.set(ref, buildProductCreatePayload(effectiveShopId, normalizedProd, branchId))
          );
          mergedProducts.set(normalizedProd.id, normalizedProd);
        }
      } else if ((normalizedProd.updatedAt ?? '') > (remote.updatedAt ?? '')) {
        ops.push((b) => b.update(ref, buildProductUpdatePayload(normalizedProd)));
        mergedProducts.set(normalizedProd.id, normalizedProd);
      }
    }

    const mergedSales = new Map<string, Sale>(remoteSaleMap);
    const cloudHasSales = sRes.docs.length > 0;
    const branchScopedSales = localSnapshot.sales.filter(
      (s) => (s.branchId || mainBranchId) === branchId
    );
    for (const sale of branchScopedSales) {
      const normalizedSale: Sale = {
        ...sale,
        shopId: effectiveShopId,
        branchId,
        synced: true,
        updatedAt: sale.updatedAt || sale.createdAt || new Date().toISOString(),
      };
      const docId = toFirestoreDocId(effectiveShopId, normalizedSale.id);
      const ref = doc(firestore, 'sales', docId);
      const remote = remoteSaleMap.get(normalizedSale.id);

      if (!remote) {
        if (!cloudHasSales || !SEED_SALE_ID_SET.has(normalizedSale.id) || !sale.synced) {
          knownIds.sales.add(docId);
          ops.push((b) =>
            b.set(ref, buildSaleCreatePayload(effectiveShopId, normalizedSale, branchId))
          );
          mergedSales.set(normalizedSale.id, normalizedSale);
        }
      } else if (
        remote.status !== 'voided' &&
        (normalizedSale.updatedAt ?? '') > (remote.updatedAt ?? remote.createdAt ?? '')
      ) {
        ops.push((b) => b.update(ref, buildSaleUpdatePayload(normalizedSale)));
        mergedSales.set(normalizedSale.id, normalizedSale);
      }
    }

    const mergedMovements = new Map<string, StockMovement>(remoteMovMap);
    const cloudHasMovements = mRes.docs.length > 0;
    const branchScopedMovements = localSnapshot.movements.filter(
      (m) => (m.branchId || mainBranchId) === branchId
    );
    for (const mov of branchScopedMovements) {
      const docId = toFirestoreDocId(effectiveShopId, mov.id);
      const normalizedMov: StockMovement = {
        ...mov,
        shopId: effectiveShopId,
        branchId,
        synced: true,
        updatedAt: mov.updatedAt || mov.createdAt || new Date().toISOString(),
      };
      if (!remoteMovMap.has(mov.id)) {
        if (!cloudHasMovements || !SEED_MOVEMENT_ID_SET.has(mov.id) || !mov.synced) {
          knownIds.movements.add(docId);
          const ref = doc(firestore, 'movements', docId);
          ops.push((b) =>
            b.set(ref, buildMovementCreatePayload(effectiveShopId, normalizedMov, branchId))
          );
          mergedMovements.set(mov.id, normalizedMov);
        }
      }
    }

    for (let i = 0; i < ops.length; i += 400) {
      const chunk = ops.slice(i, i + 400);
      const b = writeBatch(firestore);
      chunk.forEach((apply) => apply(b));
      await b.commit();
    }

    const finalBranches = Array.from(mergedBranches.values()).sort((a, b) =>
      a.isMain === b.isMain ? a.code.localeCompare(b.code) : a.isMain ? -1 : 1
    );
    const finalProducts = Array.from(mergedProducts.values()).sort((a, b) =>
      a.nameEn.localeCompare(b.nameEn)
    );
    const finalSales = Array.from(mergedSales.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    const finalMovements = Array.from(mergedMovements.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );

    return {
      branches: finalBranches,
      products: finalProducts,
      sales: finalSales,
      movements: finalMovements,
      settings: remoteSettings ?? baseSettings,
      productsCount: finalProducts.length,
    };
  } catch (err) {
    reportWriteError(err, OperationType.WRITE, 'reconcile', onError);
    throw err;
  }
}

export function pushSnapshotToFirestore(
  shopId: string,
  branchId: string,
  snapshot: FullStoreSnapshot,
  onError?: (err: Error) => void
): void {
  if (!db) return;
  void pushSnapshotToFirestoreAsync(shopId, branchId, snapshot, false, onError).catch(() => {});
}

export function syncBranchToFirestore(
  shopId: string,
  branch: Branch,
  onError?: (err: Error) => void
) {
  if (!db) return;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const docId = toFirestoreDocId(effectiveShopId, branch.id);
  const ref = doc(db, 'branches', docId);
  void upsertDocResilient({
    ref,
    knownSet: knownIds.branches,
    docId,
    createPayload: buildBranchCreatePayload(effectiveShopId, branch),
    updatePayload: buildBranchUpdatePayload(branch),
    path: `branches/${docId}`,
    onError,
  });
}

export function deleteBranchFromFirestore(
  shopId: string,
  branchId: string,
  onError?: (err: Error) => void
) {
  if (!db) return;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const docId = toFirestoreDocId(effectiveShopId, branchId);
  knownIds.branches.delete(docId);
  void deleteDoc(doc(db, 'branches', docId)).catch((err) =>
    reportWriteError(err, OperationType.DELETE, `branches/${docId}`, onError)
  );
}

export function syncProductToFirestore(
  shopId: string,
  product: Product,
  onError?: (err: Error) => void
) {
  if (!db) return;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const docId = toFirestoreDocId(effectiveShopId, product.id);
  const ref = doc(db, 'products', docId);
  void upsertDocResilient({
    ref,
    knownSet: knownIds.products,
    docId,
    createPayload: buildProductCreatePayload(effectiveShopId, product, product.branchId || 'branch-1'),
    updatePayload: buildProductUpdatePayload(product),
    path: `products/${docId}`,
    onError,
  });
}

export function deleteProductFromFirestore(
  shopId: string,
  productId: string,
  onError?: (err: Error) => void
) {
  if (!db) return;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const docId = toFirestoreDocId(effectiveShopId, productId);
  knownIds.products.delete(docId);
  void deleteDoc(doc(db, 'products', docId)).catch((err) =>
    reportWriteError(err, OperationType.DELETE, `products/${docId}`, onError)
  );
}

export function syncSaleToFirestore(
  shopId: string,
  sale: Sale,
  onError?: (err: Error) => void
) {
  if (!db) return;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const docId = toFirestoreDocId(effectiveShopId, sale.id);
  const ref = doc(db, 'sales', docId);
  const normalizedSale: Sale = {
    ...sale,
    shopId: effectiveShopId,
    synced: true,
    updatedAt: sale.updatedAt || sale.createdAt || new Date().toISOString(),
  };
  void upsertDocResilient({
    ref,
    knownSet: knownIds.sales,
    docId,
    createPayload: buildSaleCreatePayload(
      effectiveShopId,
      normalizedSale,
      sale.branchId || 'branch-1'
    ),
    updatePayload: buildSaleUpdatePayload(normalizedSale),
    path: `sales/${docId}`,
    onError,
  });
}

export function syncMovementToFirestore(
  shopId: string,
  movement: StockMovement,
  onError?: (err: Error) => void
) {
  if (!db) return;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const docId = toFirestoreDocId(effectiveShopId, movement.id);
  if (knownIds.movements.has(docId)) return;
  knownIds.movements.add(docId);
  const ref = doc(db, 'movements', docId);
  void setDoc(
    ref,
    buildMovementCreatePayload(
      effectiveShopId,
      { ...movement, synced: true },
      movement.branchId || 'branch-1'
    )
  ).catch((err) => reportWriteError(err, OperationType.CREATE, `movements/${docId}`, onError));
}

export function syncSettingsToFirestore(
  shopId: string,
  settings: StoreSettings,
  onError?: (err: Error) => void
) {
  if (!db) return;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const docId = toFirestoreDocId(effectiveShopId, settings.id || 'default');
  const ref = doc(db, 'settings', docId);
  void upsertDocResilient({
    ref,
    knownSet: knownIds.settings,
    docId,
    createPayload: buildSettingsCreatePayload(effectiveShopId, settings),
    updatePayload: buildSettingsUpdatePayload(settings),
    path: `settings/${docId}`,
    onError,
  });
}

export function deleteIdsFromFirestore(
  shopId: string,
  targets: {
    productIds?: string[];
    saleIds?: string[];
    movementIds?: string[];
  },
  onError?: (err: Error) => void
) {
  if (!db) return;
  const firestore = db;
  const effectiveShopId = shopId || DEFAULT_SHOP_ID;
  const run = async () => {
    const deleteRefs: Array<ReturnType<typeof doc>> = [];
    for (const id of targets.productIds ?? []) {
      const docId = toFirestoreDocId(effectiveShopId, id);
      knownIds.products.delete(docId);
      deleteRefs.push(doc(firestore, 'products', docId));
    }
    for (const id of targets.saleIds ?? []) {
      const docId = toFirestoreDocId(effectiveShopId, id);
      knownIds.sales.delete(docId);
      deleteRefs.push(doc(firestore, 'sales', docId));
    }
    for (const id of targets.movementIds ?? []) {
      const docId = toFirestoreDocId(effectiveShopId, id);
      knownIds.movements.delete(docId);
      deleteRefs.push(doc(firestore, 'movements', docId));
    }
    for (let i = 0; i < deleteRefs.length; i += 400) {
      const batch = writeBatch(firestore);
      deleteRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  };
  void run().catch((err) => reportWriteError(err, OperationType.DELETE, 'batch', onError));
}
