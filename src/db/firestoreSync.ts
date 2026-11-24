import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../firebase';
import { Branch, Product, Sale, StockMovement, StoreSettings } from '../types/pos';
import { FullStoreSnapshot } from './offlineDb';

export interface FirestoreSyncMetadata {
  fromCache: boolean;
  hasPendingWrites: boolean;
  branchesLoaded: boolean;
  productsLoaded: boolean;
  salesLoaded: boolean;
}

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

export function toFirestoreDocId(ownerId: string, entityId: string): string {
  const cleanOwner = ownerId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const cleanEntity = entityId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 78);
  return `${cleanOwner}_${cleanEntity}`;
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

function buildBranchCreatePayload(ownerId: string, branch: Branch) {
  return {
    id: clampStr(branch.id, 128),
    ownerId,
    code: clampStr(branch.code, 32) || 'BR',
    nameMm: clampStr(branch.nameMm, 120) || 'Branch',
    nameEn: clampStr(branch.nameEn, 120) || 'Branch',
    phone: clampStr(branch.phone, 40),
    addressMm: clampStr(branch.addressMm, 300),
    addressEn: clampStr(branch.addressEn, 300),
    isMain: Boolean(branch.isMain),
    createdAt: clampStr(branch.createdAt || new Date().toISOString(), 64),
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
    serverUpdatedAt: serverTimestamp(),
  };
}

function buildProductCreatePayload(ownerId: string, product: Product) {
  return stripUndefined({
    id: clampStr(product.id, 128),
    ownerId,
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

function buildSaleCreatePayload(ownerId: string, sale: Sale) {
  return stripUndefined({
    id: clampStr(sale.id, 128),
    ownerId,
    invoiceNo: clampStr(sale.invoiceNo, 64),
    branchId: clampStr(sale.branchId || 'branch-1', 128),
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
    createdAt: clampStr(sale.createdAt || new Date().toISOString(), 64),
    serverCreatedAt: serverTimestamp(),
    serverUpdatedAt: serverTimestamp(),
  });
}

function buildMovementCreatePayload(ownerId: string, mov: StockMovement) {
  return stripUndefined({
    id: clampStr(mov.id, 128),
    ownerId,
    productId: clampStr(mov.productId, 128),
    sku: clampStr(mov.sku, 64),
    productNameMm: clampStr(mov.productNameMm, 160),
    productNameEn: clampStr(mov.productNameEn, 160),
    branchId: mov.branchId ? clampStr(mov.branchId, 128) : undefined,
    branchNameMm: mov.branchNameMm ? clampStr(mov.branchNameMm, 120) : undefined,
    branchNameEn: mov.branchNameEn ? clampStr(mov.branchNameEn, 120) : undefined,
    type: mov.type,
    delta: Number(mov.delta) || 0,
    previousStock: Math.max(0, Number(mov.previousStock) || 0),
    newStock: Math.max(0, Number(mov.newStock) || 0),
    reason: clampStr(mov.reason, 300),
    synced: Boolean(mov.synced),
    createdAt: clampStr(mov.createdAt || new Date().toISOString(), 64),
    serverCreatedAt: serverTimestamp(),
  });
}

function buildSettingsCreatePayload(ownerId: string, settings: StoreSettings) {
  return stripUndefined({
    id: clampStr(settings.id || 'default', 128),
    ownerId,
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
    lastSyncedAt: settings.lastSyncedAt ?? null,
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
    lastSyncedAt: settings.lastSyncedAt ?? null,
    serverUpdatedAt: serverTimestamp(),
  });
}

function cleanFirestoreDoc<T>(raw: Record<string, unknown>): T {
  const copy = { ...raw };
  delete copy.ownerId;
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
  ownerId: string;
  onBranches: (branches: Branch[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void;
  onProducts: (products: Product[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void;
  onSales: (sales: Sale[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void;
  onMovements: (movements: StockMovement[]) => void;
  onSettings: (settings: StoreSettings | null) => void;
  onInitialEmptyCloud?: () => void;
  onError: (err: Error) => void;
}): () => void {
  const {
    ownerId,
    onBranches,
    onProducts,
    onSales,
    onMovements,
    onSettings,
    onInitialEmptyCloud,
    onError,
  } = params;

  let checkedBootstrap = false;
  let initialBranchesEmpty: boolean | null = null;
  let initialProductsEmpty: boolean | null = null;
  let initialBranchesFromCache = true;

  const maybeTriggerBootstrap = () => {
    if (
      checkedBootstrap ||
      initialBranchesEmpty === null ||
      initialProductsEmpty === null ||
      initialBranchesFromCache
    ) {
      return;
    }
    checkedBootstrap = true;
    if (initialBranchesEmpty && initialProductsEmpty && onInitialEmptyCloud) {
      onInitialEmptyCloud();
    }
  };

  const branchesQ = query(collection(db, 'branches'), where('ownerId', '==', ownerId));
  const unsubBranches = onSnapshot(
    branchesQ,
    { includeMetadataChanges: true },
    (snap) => {
      knownIds.branches = new Set(snap.docs.map((d) => d.id));
      initialBranchesEmpty = snap.empty;
      initialBranchesFromCache = snap.metadata.fromCache;
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<Branch>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) =>
          a.isMain === b.isMain ? a.code.localeCompare(b.code) : a.isMain ? -1 : 1
        );
      onBranches(list, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
      maybeTriggerBootstrap();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'branches');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const productsQ = query(collection(db, 'products'), where('ownerId', '==', ownerId));
  const unsubProducts = onSnapshot(
    productsQ,
    { includeMetadataChanges: true },
    (snap) => {
      knownIds.products = new Set(snap.docs.map((d) => d.id));
      initialProductsEmpty = snap.empty;
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<Product>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
      onProducts(list, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
      maybeTriggerBootstrap();
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'products');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const salesQ = query(collection(db, 'sales'), where('ownerId', '==', ownerId));
  const unsubSales = onSnapshot(
    salesQ,
    { includeMetadataChanges: true },
    (snap) => {
      knownIds.sales = new Set(snap.docs.map((d) => d.id));
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<Sale>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onSales(list, {
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'sales');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const movementsQ = query(collection(db, 'movements'), where('ownerId', '==', ownerId));
  const unsubMovements = onSnapshot(
    movementsQ,
    { includeMetadataChanges: true },
    (snap) => {
      knownIds.movements = new Set(snap.docs.map((d) => d.id));
      const list = snap.docs
        .map((d) => cleanFirestoreDoc<StockMovement>(d.data({ serverTimestamps: 'estimate' })))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onMovements(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'movements');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  const settingsQ = query(collection(db, 'settings'), where('ownerId', '==', ownerId));
  const unsubSettings = onSnapshot(
    settingsQ,
    { includeMetadataChanges: true },
    (snap) => {
      knownIds.settings = new Set(snap.docs.map((d) => d.id));
      if (snap.empty) {
        onSettings(null);
      } else {
        const s = cleanFirestoreDoc<StoreSettings>(
          snap.docs[0].data({ serverTimestamps: 'estimate' })
        );
        onSettings(s);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'settings');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );

  return () => {
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

export function pushSnapshotToFirestore(
  ownerId: string,
  snapshot: FullStoreSnapshot,
  onError?: (err: Error) => void
): void {
  const run = async () => {
    // 1. Branches & Settings first (ensures branch docs exist before sales validation)
    const headerBatch = writeBatch(db);
    let headerOps = 0;

    for (const branch of snapshot.branches) {
      const docId = toFirestoreDocId(ownerId, branch.id);
      const ref = doc(db, 'branches', docId);
      if (knownIds.branches.has(docId)) {
        headerBatch.update(ref, buildBranchUpdatePayload(branch));
      } else {
        headerBatch.set(ref, buildBranchCreatePayload(ownerId, branch));
        knownIds.branches.add(docId);
      }
      headerOps++;
    }

    const settingsDocId = toFirestoreDocId(ownerId, snapshot.settings.id || 'default');
    const settingsRef = doc(db, 'settings', settingsDocId);
    if (knownIds.settings.has(settingsDocId)) {
      headerBatch.update(settingsRef, buildSettingsUpdatePayload(snapshot.settings));
    } else {
      headerBatch.set(settingsRef, buildSettingsCreatePayload(ownerId, snapshot.settings));
      knownIds.settings.add(settingsDocId);
    }
    headerOps++;

    if (headerOps > 0) {
      await headerBatch.commit();
    }

    // 2. Chunk products, sales, and movements in batches of <= 400
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    for (const product of snapshot.products) {
      const docId = toFirestoreDocId(ownerId, product.id);
      const ref = doc(db, 'products', docId);
      if (knownIds.products.has(docId)) {
        ops.push((b) => b.update(ref, buildProductUpdatePayload(product)));
      } else {
        knownIds.products.add(docId);
        ops.push((b) => b.set(ref, buildProductCreatePayload(ownerId, product)));
      }
    }

    for (const sale of snapshot.sales) {
      const docId = toFirestoreDocId(ownerId, sale.id);
      if (!knownIds.sales.has(docId)) {
        knownIds.sales.add(docId);
        const ref = doc(db, 'sales', docId);
        ops.push((b) => b.set(ref, buildSaleCreatePayload(ownerId, sale)));
      }
    }

    for (const mov of snapshot.movements) {
      const docId = toFirestoreDocId(ownerId, mov.id);
      if (!knownIds.movements.has(docId)) {
        knownIds.movements.add(docId);
        const ref = doc(db, 'movements', docId);
        ops.push((b) => b.set(ref, buildMovementCreatePayload(ownerId, mov)));
      }
    }

    for (let i = 0; i < ops.length; i += 400) {
      const chunk = ops.slice(i, i + 400);
      const b = writeBatch(db);
      chunk.forEach((apply) => apply(b));
      await b.commit();
    }
  };

  void run().catch((err) => reportWriteError(err, OperationType.WRITE, 'batch', onError));
}

export function syncBranchToFirestore(
  ownerId: string,
  branch: Branch,
  onError?: (err: Error) => void
) {
  const docId = toFirestoreDocId(ownerId, branch.id);
  const ref = doc(db, 'branches', docId);
  if (knownIds.branches.has(docId)) {
    void updateDoc(ref, buildBranchUpdatePayload(branch)).catch((err) =>
      reportWriteError(err, OperationType.UPDATE, `branches/${docId}`, onError)
    );
  } else {
    knownIds.branches.add(docId);
    void setDoc(ref, buildBranchCreatePayload(ownerId, branch)).catch((err) =>
      reportWriteError(err, OperationType.CREATE, `branches/${docId}`, onError)
    );
  }
}

export function deleteBranchFromFirestore(
  ownerId: string,
  branchId: string,
  onError?: (err: Error) => void
) {
  const docId = toFirestoreDocId(ownerId, branchId);
  knownIds.branches.delete(docId);
  void deleteDoc(doc(db, 'branches', docId)).catch((err) =>
    reportWriteError(err, OperationType.DELETE, `branches/${docId}`, onError)
  );
}

export function syncProductToFirestore(
  ownerId: string,
  product: Product,
  onError?: (err: Error) => void
) {
  const docId = toFirestoreDocId(ownerId, product.id);
  const ref = doc(db, 'products', docId);
  if (knownIds.products.has(docId)) {
    void updateDoc(ref, buildProductUpdatePayload(product)).catch((err) =>
      reportWriteError(err, OperationType.UPDATE, `products/${docId}`, onError)
    );
  } else {
    knownIds.products.add(docId);
    void setDoc(ref, buildProductCreatePayload(ownerId, product)).catch((err) =>
      reportWriteError(err, OperationType.CREATE, `products/${docId}`, onError)
    );
  }
}

export function deleteProductFromFirestore(
  ownerId: string,
  productId: string,
  onError?: (err: Error) => void
) {
  const docId = toFirestoreDocId(ownerId, productId);
  knownIds.products.delete(docId);
  void deleteDoc(doc(db, 'products', docId)).catch((err) =>
    reportWriteError(err, OperationType.DELETE, `products/${docId}`, onError)
  );
}

export function syncSaleToFirestore(
  ownerId: string,
  sale: Sale,
  onError?: (err: Error) => void
) {
  const docId = toFirestoreDocId(ownerId, sale.id);
  const ref = doc(db, 'sales', docId);
  if (knownIds.sales.has(docId)) {
    void updateDoc(
      ref,
      stripUndefined({
        status: sale.status,
        reversedItems: sale.reversedItems ?? undefined,
        reversalReason: sale.reversalReason ? clampStr(sale.reversalReason, 300) : undefined,
        reversedAt: sale.reversedAt ? clampStr(sale.reversedAt, 64) : undefined,
        synced: true,
        serverUpdatedAt: serverTimestamp(),
      })
    ).catch((err) => reportWriteError(err, OperationType.UPDATE, `sales/${docId}`, onError));
  } else {
    knownIds.sales.add(docId);
    void setDoc(ref, buildSaleCreatePayload(ownerId, { ...sale, synced: true })).catch((err) =>
      reportWriteError(err, OperationType.CREATE, `sales/${docId}`, onError)
    );
  }
}

export function syncMovementToFirestore(
  ownerId: string,
  movement: StockMovement,
  onError?: (err: Error) => void
) {
  const docId = toFirestoreDocId(ownerId, movement.id);
  if (knownIds.movements.has(docId)) return;
  knownIds.movements.add(docId);
  const ref = doc(db, 'movements', docId);
  void setDoc(ref, buildMovementCreatePayload(ownerId, { ...movement, synced: true })).catch(
    (err) => reportWriteError(err, OperationType.CREATE, `movements/${docId}`, onError)
  );
}

export function syncSettingsToFirestore(
  ownerId: string,
  settings: StoreSettings,
  onError?: (err: Error) => void
) {
  const docId = toFirestoreDocId(ownerId, settings.id || 'default');
  const ref = doc(db, 'settings', docId);
  if (knownIds.settings.has(docId)) {
    void updateDoc(ref, buildSettingsUpdatePayload(settings)).catch((err) =>
      reportWriteError(err, OperationType.UPDATE, `settings/${docId}`, onError)
    );
  } else {
    knownIds.settings.add(docId);
    void setDoc(ref, buildSettingsCreatePayload(ownerId, settings)).catch((err) =>
      reportWriteError(err, OperationType.CREATE, `settings/${docId}`, onError)
    );
  }
}

export function deleteIdsFromFirestore(
  ownerId: string,
  targets: {
    productIds?: string[];
    saleIds?: string[];
    movementIds?: string[];
  },
  onError?: (err: Error) => void
) {
  const run = async () => {
    const deleteRefs: Array<ReturnType<typeof doc>> = [];
    for (const id of targets.productIds ?? []) {
      const docId = toFirestoreDocId(ownerId, id);
      knownIds.products.delete(docId);
      deleteRefs.push(doc(db, 'products', docId));
    }
    for (const id of targets.saleIds ?? []) {
      const docId = toFirestoreDocId(ownerId, id);
      knownIds.sales.delete(docId);
      deleteRefs.push(doc(db, 'sales', docId));
    }
    for (const id of targets.movementIds ?? []) {
      const docId = toFirestoreDocId(ownerId, id);
      knownIds.movements.delete(docId);
      deleteRefs.push(doc(db, 'movements', docId));
    }
    for (let i = 0; i < deleteRefs.length; i += 400) {
      const batch = writeBatch(db);
      deleteRefs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  };
  void run().catch((err) => reportWriteError(err, OperationType.DELETE, 'batch', onError));
}
