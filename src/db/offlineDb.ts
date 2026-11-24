import {
  DEFAULT_SETTINGS,
  SEED_BRANCHES,
  SEED_MOVEMENTS,
  SEED_PRODUCTS,
  SEED_SALES,
} from '../data/seedData';
import {
  Branch,
  CartItem,
  MovementType,
  PaymentMethod,
  Product,
  Sale,
  StockMovement,
  StoreSettings,
} from '../types/pos';

const DB_NAME = 'mingalar_mart_pos_db';
const DB_VERSION = 2;

const STORES = {
  PRODUCTS: 'products',
  SALES: 'sales',
  MOVEMENTS: 'movements',
  SETTINGS: 'settings',
  BRANCHES: 'branches',
} as const;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        const productStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
        productStore.createIndex('sku', 'sku', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SALES)) {
        const salesStore = db.createObjectStore(STORES.SALES, { keyPath: 'id' });
        salesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.MOVEMENTS)) {
        const movStore = db.createObjectStore(STORES.MOVEMENTS, { keyPath: 'id' });
        movStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.BRANCHES)) {
        db.createObjectStore(STORES.BRANCHES, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function putInStore<T>(db: IDBDatabase, storeName: string, item: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function deleteFromStore(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface FullStoreSnapshot {
  products: Product[];
  sales: Sale[];
  movements: StockMovement[];
  branches: Branch[];
  settings: StoreSettings;
}

export async function initAndLoadSnapshot(): Promise<FullStoreSnapshot> {
  const db = await openDatabase();
  const [products, sales, movements, settingsList, branchList] = await Promise.all([
    getAllFromStore<Product>(db, STORES.PRODUCTS),
    getAllFromStore<Sale>(db, STORES.SALES),
    getAllFromStore<StockMovement>(db, STORES.MOVEMENTS),
    getAllFromStore<StoreSettings>(db, STORES.SETTINGS),
    getAllFromStore<Branch>(db, STORES.BRANCHES),
  ]);

  if (products.length === 0 && settingsList.length === 0) {
    const tx = db.transaction(
      [STORES.PRODUCTS, STORES.SALES, STORES.MOVEMENTS, STORES.SETTINGS, STORES.BRANCHES],
      'readwrite'
    );
    SEED_PRODUCTS.forEach((p) => tx.objectStore(STORES.PRODUCTS).put(p));
    SEED_SALES.forEach((s) => tx.objectStore(STORES.SALES).put(s));
    SEED_MOVEMENTS.forEach((m) => tx.objectStore(STORES.MOVEMENTS).put(m));
    SEED_BRANCHES.forEach((b) => tx.objectStore(STORES.BRANCHES).put(b));
    tx.objectStore(STORES.SETTINGS).put(DEFAULT_SETTINGS);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return {
      products: [...SEED_PRODUCTS],
      sales: [...SEED_SALES].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      movements: [...SEED_MOVEMENTS].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      branches: [...SEED_BRANCHES],
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  // Upgrade / migrate legacy records without branches
  let branches = branchList;
  const settings = { ...DEFAULT_SETTINGS, ...(settingsList[0] ?? {}) };
  let needsMigrationWrite = false;

  if (branches.length === 0) {
    branches = [...SEED_BRANCHES];
    needsMigrationWrite = true;
  }

  const mainBranchId = branches.find((b) => b.isMain)?.id ?? branches[0].id;
  if (!settings.activeBranchId || !branches.some((b) => b.id === settings.activeBranchId)) {
    settings.activeBranchId = mainBranchId;
    needsMigrationWrite = true;
  }

  const migratedProducts = products.map((p) => {
    if (!p.branchStocks) {
      needsMigrationWrite = true;
      const map: Record<string, number> = { [mainBranchId]: p.stock };
      branches.forEach((b) => {
        if (b.id !== mainBranchId) {
          map[b.id] = Math.max(0, Math.floor(p.stock / 2));
        }
      });
      return { ...p, branchStocks: map };
    }
    return p;
  });

  if (needsMigrationWrite) {
    const tx = db.transaction([STORES.BRANCHES, STORES.PRODUCTS, STORES.SETTINGS], 'readwrite');
    branches.forEach((b) => tx.objectStore(STORES.BRANCHES).put(b));
    migratedProducts.forEach((p) => tx.objectStore(STORES.PRODUCTS).put(p));
    tx.objectStore(STORES.SETTINGS).put(settings);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    products: migratedProducts.sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
    sales: sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    movements: movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    branches: branches.sort((a, b) => (a.isMain === b.isMain ? a.code.localeCompare(b.code) : a.isMain ? -1 : 1)),
    settings,
  };
}

export async function saveBranch(branch: Branch): Promise<void> {
  const db = await openDatabase();
  await putInStore(db, STORES.BRANCHES, branch);
}

export async function removeBranch(branchId: string): Promise<void> {
  const db = await openDatabase();
  await deleteFromStore(db, STORES.BRANCHES, branchId);
}

export async function saveProduct(
  product: Product,
  isNew: boolean,
  branch: Branch,
  isOffline: boolean
): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([STORES.PRODUCTS, STORES.MOVEMENTS], 'readwrite');
  const branchStocks = { ...(product.branchStocks ?? {}), [branch.id]: product.stock };
  const normalized: Product = {
    ...product,
    branchStocks,
  };
  tx.objectStore(STORES.PRODUCTS).put(normalized);
  if (isNew && product.stock > 0) {
    const mov: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      sku: product.sku,
      productNameMm: product.nameMm,
      productNameEn: product.nameEn,
      branchId: branch.id,
      branchNameMm: branch.nameMm,
      branchNameEn: branch.nameEn,
      type: 'initial',
      delta: product.stock,
      previousStock: 0,
      newStock: product.stock,
      reason: 'Initial SKU entry',
      synced: !isOffline,
      createdAt: new Date().toISOString(),
    };
    tx.objectStore(STORES.MOVEMENTS).put(mov);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeProduct(productId: string): Promise<void> {
  const db = await openDatabase();
  await deleteFromStore(db, STORES.PRODUCTS, productId);
}

export async function bulkImportProducts(params: {
  items: Array<{
    sku: string;
    nameMm: string;
    nameEn: string;
    category: Product['category'];
    unitMm: string;
    unitEn: string;
    costPrice: number;
    sellPrice: number;
    stock: number;
    minStock: number;
    existingProduct: Product | null;
  }>;
  stockMode: 'replace' | 'add';
  branch: Branch;
  isOffline: boolean;
}): Promise<{ created: number; updated: number }> {
  const { items, stockMode, branch, isOffline } = params;
  const db = await openDatabase();
  const tx = db.transaction([STORES.PRODUCTS, STORES.MOVEMENTS], 'readwrite');
  const prodStore = tx.objectStore(STORES.PRODUCTS);
  const movStore = tx.objectStore(STORES.MOVEMENTS);
  const nowIso = new Date().toISOString();

  let created = 0;
  let updated = 0;

  for (const item of items) {
    if (item.existingProduct) {
      const currentMap = item.existingProduct.branchStocks ?? {
        [branch.id]: item.existingProduct.stock,
      };
      const prevStock = currentMap[branch.id] ?? 0;
      const nextStock =
        stockMode === 'add' ? prevStock + item.stock : Math.max(0, item.stock);
      const delta = nextStock - prevStock;

      const updatedProd: Product = {
        ...item.existingProduct,
        nameMm: item.nameMm,
        nameEn: item.nameEn,
        category: item.category,
        unitMm: item.unitMm,
        unitEn: item.unitEn,
        costPrice: item.costPrice > 0 ? item.costPrice : item.existingProduct.costPrice,
        sellPrice: item.sellPrice,
        stock: nextStock,
        branchStocks: { ...currentMap, [branch.id]: nextStock },
        minStock: item.minStock,
        updatedAt: nowIso,
      };
      prodStore.put(updatedProd);
      updated++;

      if (delta !== 0) {
        movStore.put({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: updatedProd.id,
          sku: updatedProd.sku,
          productNameMm: updatedProd.nameMm,
          productNameEn: updatedProd.nameEn,
          branchId: branch.id,
          branchNameMm: branch.nameMm,
          branchNameEn: branch.nameEn,
          type: delta > 0 ? 'restock' : 'adjustment',
          delta,
          previousStock: prevStock,
          newStock: nextStock,
          reason: 'CSV bulk import',
          synced: !isOffline,
          createdAt: nowIso,
        });
      }
    } else {
      const newId = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newProd: Product = {
        id: newId,
        sku: item.sku,
        nameMm: item.nameMm,
        nameEn: item.nameEn,
        category: item.category,
        unitMm: item.unitMm,
        unitEn: item.unitEn,
        costPrice: item.costPrice,
        sellPrice: item.sellPrice,
        stock: item.stock,
        branchStocks: { [branch.id]: item.stock },
        minStock: item.minStock,
        updatedAt: nowIso,
      };
      prodStore.put(newProd);
      created++;

      if (newProd.stock > 0) {
        movStore.put({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: newId,
          sku: newProd.sku,
          productNameMm: newProd.nameMm,
          productNameEn: newProd.nameEn,
          branchId: branch.id,
          branchNameMm: branch.nameMm,
          branchNameEn: branch.nameEn,
          type: 'initial',
          delta: newProd.stock,
          previousStock: 0,
          newStock: newProd.stock,
          reason: 'CSV bulk import',
          synced: !isOffline,
          createdAt: nowIso,
        });
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { created, updated };
}

export async function adjustStock(params: {
  product: Product;
  branch: Branch;
  delta: number;
  type: MovementType;
  reason: string;
  newCostPrice?: number;
  newSellPrice?: number;
  isOffline: boolean;
}): Promise<{ updatedProduct: Product; movement: StockMovement }> {
  const { product, branch, delta, type, reason, newCostPrice, newSellPrice, isOffline } = params;
  const db = await openDatabase();
  const currentMap = product.branchStocks ?? { [branch.id]: product.stock };
  const previousStock = currentMap[branch.id] ?? 0;
  const newStock = Math.max(0, previousStock + delta);
  const actualDelta = newStock - previousStock;
  const nowIso = new Date().toISOString();

  const updatedProduct: Product = {
    ...product,
    stock: newStock,
    branchStocks: { ...currentMap, [branch.id]: newStock },
    costPrice: newCostPrice !== undefined ? newCostPrice : product.costPrice,
    sellPrice: newSellPrice !== undefined ? newSellPrice : product.sellPrice,
    updatedAt: nowIso,
  };

  const movement: StockMovement = {
    id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: product.id,
    sku: product.sku,
    productNameMm: product.nameMm,
    productNameEn: product.nameEn,
    branchId: branch.id,
    branchNameMm: branch.nameMm,
    branchNameEn: branch.nameEn,
    type,
    delta: actualDelta,
    previousStock,
    newStock,
    reason: reason || (type === 'restock' ? 'Restock' : 'Stock adjustment'),
    synced: !isOffline,
    createdAt: nowIso,
  };

  const tx = db.transaction([STORES.PRODUCTS, STORES.MOVEMENTS], 'readwrite');
  tx.objectStore(STORES.PRODUCTS).put(updatedProduct);
  tx.objectStore(STORES.MOVEMENTS).put(movement);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { updatedProduct, movement };
}

export async function transferProductStock(params: {
  product: Product;
  fromBranch: Branch;
  toBranch: Branch;
  qty: number;
  reason: string;
  isOffline: boolean;
}): Promise<void> {
  const { product, fromBranch, toBranch, qty, reason, isOffline } = params;
  if (fromBranch.id === toBranch.id || qty <= 0) return;

  const db = await openDatabase();
  const currentMap = product.branchStocks ?? { [fromBranch.id]: product.stock };
  const sourcePrev = currentMap[fromBranch.id] ?? 0;
  const transferQty = Math.min(qty, sourcePrev);
  if (transferQty <= 0) return;

  const sourceNext = sourcePrev - transferQty;
  const destPrev = currentMap[toBranch.id] ?? 0;
  const destNext = destPrev + transferQty;
  const nowIso = new Date().toISOString();

  const updatedProduct: Product = {
    ...product,
    branchStocks: {
      ...currentMap,
      [fromBranch.id]: sourceNext,
      [toBranch.id]: destNext,
    },
    updatedAt: nowIso,
  };

  const outMovement: StockMovement = {
    id: `mov-${Date.now()}-out-${Math.random().toString(36).slice(2, 6)}`,
    productId: product.id,
    sku: product.sku,
    productNameMm: product.nameMm,
    productNameEn: product.nameEn,
    branchId: fromBranch.id,
    branchNameMm: fromBranch.nameMm,
    branchNameEn: fromBranch.nameEn,
    type: 'transfer_out',
    delta: -transferQty,
    previousStock: sourcePrev,
    newStock: sourceNext,
    reason: reason || `→ ${toBranch.code} (${toBranch.nameEn})`,
    synced: !isOffline,
    createdAt: nowIso,
  };

  const inMovement: StockMovement = {
    id: `mov-${Date.now()}-in-${Math.random().toString(36).slice(2, 6)}`,
    productId: product.id,
    sku: product.sku,
    productNameMm: product.nameMm,
    productNameEn: product.nameEn,
    branchId: toBranch.id,
    branchNameMm: toBranch.nameMm,
    branchNameEn: toBranch.nameEn,
    type: 'transfer_in',
    delta: transferQty,
    previousStock: destPrev,
    newStock: destNext,
    reason: reason || `← ${fromBranch.code} (${fromBranch.nameEn})`,
    synced: !isOffline,
    createdAt: nowIso,
  };

  const tx = db.transaction([STORES.PRODUCTS, STORES.MOVEMENTS], 'readwrite');
  tx.objectStore(STORES.PRODUCTS).put(updatedProduct);
  tx.objectStore(STORES.MOVEMENTS).put(outMovement);
  tx.objectStore(STORES.MOVEMENTS).put(inMovement);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function completeSale(params: {
  cart: CartItem[];
  branch: Branch;
  discount: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  existingSalesCount: number;
  note?: string;
  isOffline: boolean;
}): Promise<Sale> {
  const { cart, branch, discount, paymentMethod, amountPaid, existingSalesCount, note, isOffline } =
    params;
  const db = await openDatabase();
  const currentProducts = await getAllFromStore<Product>(db, STORES.PRODUCTS);
  const productMap = new Map(currentProducts.map((p) => [p.id, p]));

  const nowDate = new Date();
  const ymd = nowDate.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(existingSalesCount + 1).padStart(4, '0');
  const cleanCode = branch.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'BR1';
  const invoiceNo = `INV-${cleanCode}-${ymd}-${seq}`;
  const nowIso = nowDate.toISOString();

  const subtotal = cart.reduce((acc, item) => acc + item.unitPrice * item.qty, 0);
  const safeDiscount = Math.min(Math.max(0, discount), subtotal);
  const total = subtotal - safeDiscount;
  const rawCost = cart.reduce((acc, item) => acc + item.costPrice * item.qty, 0);
  const profit = total - rawCost;
  const finalPaid = paymentMethod === 'cash' ? amountPaid : total;
  const changeGiven = paymentMethod === 'cash' ? Math.max(0, finalPaid - total) : 0;

  const sale: Sale = {
    id: `sale-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    invoiceNo,
    branchId: branch.id,
    branchNameMm: branch.nameMm,
    branchNameEn: branch.nameEn,
    items: cart.map((c) => ({
      productId: c.productId,
      sku: c.sku,
      nameMm: c.nameMm,
      nameEn: c.nameEn,
      unitMm: c.unitMm,
      unitEn: c.unitEn,
      qty: c.qty,
      unitPrice: c.unitPrice,
      costPrice: c.costPrice,
      subtotal: c.unitPrice * c.qty,
    })),
    subtotal,
    discount: safeDiscount,
    total,
    profit,
    paymentMethod,
    amountPaid: finalPaid,
    changeGiven,
    status: 'completed',
    synced: !isOffline,
    note,
    createdAt: nowIso,
  };

  const tx = db.transaction([STORES.PRODUCTS, STORES.SALES, STORES.MOVEMENTS], 'readwrite');
  const prodStore = tx.objectStore(STORES.PRODUCTS);
  const movStore = tx.objectStore(STORES.MOVEMENTS);

  for (const item of cart) {
    const existing = productMap.get(item.productId);
    if (existing) {
      const map = existing.branchStocks ?? { [branch.id]: existing.stock };
      const prevStock = map[branch.id] ?? 0;
      const nextStock = Math.max(0, prevStock - item.qty);
      prodStore.put({
        ...existing,
        stock: nextStock,
        branchStocks: { ...map, [branch.id]: nextStock },
        updatedAt: nowIso,
      });
      const mov: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        productId: existing.id,
        sku: existing.sku,
        productNameMm: existing.nameMm,
        productNameEn: existing.nameEn,
        branchId: branch.id,
        branchNameMm: branch.nameMm,
        branchNameEn: branch.nameEn,
        type: 'sale',
        delta: nextStock - prevStock,
        previousStock: prevStock,
        newStock: nextStock,
        reason: invoiceNo,
        synced: !isOffline,
        createdAt: nowIso,
      };
      movStore.put(mov);
    }
  }

  tx.objectStore(STORES.SALES).put(sale);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return sale;
}

export async function reverseSale(params: {
  saleId: string;
  branches: Branch[];
  itemsToReturn: Array<{ productId: string; qty: number }>;
  reason: string;
  restoreStock: boolean;
  isOffline: boolean;
}): Promise<Sale | null> {
  const { saleId, branches, itemsToReturn, reason, restoreStock, isOffline } = params;
  const db = await openDatabase();
  const [sales, products] = await Promise.all([
    getAllFromStore<Sale>(db, STORES.SALES),
    getAllFromStore<Product>(db, STORES.PRODUCTS),
  ]);
  const target = sales.find((s) => s.id === saleId);
  if (!target || target.status === 'voided' || target.reversalOfInvoiceNo) return null;

  const targetBranch =
    branches.find((b) => b.id === target.branchId) ??
    branches.find((b) => b.isMain) ??
    branches[0];

  const productMap = new Map(products.map((p) => [p.id, p]));
  const nowIso = new Date().toISOString();
  const prevReversed = target.reversedItems ?? {};

  // Compute actual returnable quantities
  const returnLines = itemsToReturn
    .map((req) => {
      const origItem = target.items.find((i) => i.productId === req.productId);
      if (!origItem) return null;
      const alreadyRev = prevReversed[req.productId] ?? 0;
      const maxRev = Math.max(0, origItem.qty - alreadyRev);
      const qty = Math.min(Math.max(0, Math.floor(req.qty)), maxRev);
      if (qty <= 0) return null;
      return { origItem, qty };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (returnLines.length === 0) return null;

  const nextReversedMap: Record<string, number> = { ...prevReversed };
  returnLines.forEach(({ origItem, qty }) => {
    nextReversedMap[origItem.productId] = (nextReversedMap[origItem.productId] ?? 0) + qty;
  });

  const isFullReversal =
    Object.keys(prevReversed).length === 0 &&
    target.items.every((item) => (nextReversedMap[item.productId] ?? 0) >= item.qty);

  const tx = db.transaction([STORES.PRODUCTS, STORES.SALES, STORES.MOVEMENTS], 'readwrite');
  const salesStore = tx.objectStore(STORES.SALES);
  const prodStore = tx.objectStore(STORES.PRODUCTS);
  const movStore = tx.objectStore(STORES.MOVEMENTS);

  let createdReversalRecord: Sale | null = null;

  if (isFullReversal) {
    const updatedTarget: Sale = {
      ...target,
      status: 'voided',
      reversalReason: reason,
      reversedAt: nowIso,
      reversedItems: nextReversedMap,
      synced: !isOffline,
    };
    salesStore.put(updatedTarget);
    createdReversalRecord = updatedTarget;
  } else {
    // Partial reversal: mark reversed counts on original sale & append negative credit-note sale
    const rawSubtotal = returnLines.reduce(
      (sum, l) => sum + l.origItem.unitPrice * l.qty,
      0
    );
    const discountRatio = target.subtotal > 0 ? target.discount / target.subtotal : 0;
    const proportionalDiscount = Math.round(rawSubtotal * discountRatio);
    const refundTotal = Math.max(0, rawSubtotal - proportionalDiscount);
    const refundCost = returnLines.reduce(
      (sum, l) => sum + l.origItem.costPrice * l.qty,
      0
    );
    const refundProfit = refundTotal - refundCost;

    const existingRevCount = sales.filter(
      (s) => s.reversalOfInvoiceNo === target.invoiceNo
    ).length;
    const baseRevNo = `REV-${target.invoiceNo.replace(/^INV-/, '')}`;
    const revInvoiceNo =
      existingRevCount > 0 ? `${baseRevNo}-${existingRevCount + 1}` : baseRevNo;

    salesStore.put({
      ...target,
      status: 'completed',
      reversedItems: nextReversedMap,
      reversalReason: reason,
      reversedAt: nowIso,
      synced: !isOffline,
    });

    const reversalSale: Sale = {
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      invoiceNo: revInvoiceNo,
      branchId: targetBranch?.id ?? target.branchId,
      branchNameMm: targetBranch?.nameMm ?? target.branchNameMm,
      branchNameEn: targetBranch?.nameEn ?? target.branchNameEn,
      items: returnLines.map(({ origItem, qty }) => ({
        ...origItem,
        qty: -qty,
        subtotal: -(origItem.unitPrice * qty),
      })),
      subtotal: -rawSubtotal,
      discount: -proportionalDiscount,
      total: -refundTotal,
      profit: -refundProfit,
      paymentMethod: target.paymentMethod,
      amountPaid: -refundTotal,
      changeGiven: 0,
      status: 'completed',
      synced: !isOffline,
      reversalOfInvoiceNo: target.invoiceNo,
      reversalReason: reason,
      note: reason,
      createdAt: nowIso,
    };
    salesStore.put(reversalSale);
    createdReversalRecord = reversalSale;
  }

  if (restoreStock) {
    for (const { origItem, qty } of returnLines) {
      const prod = productMap.get(origItem.productId);
      if (prod && targetBranch) {
        const map = prod.branchStocks ?? { [targetBranch.id]: prod.stock };
        const prev = map[targetBranch.id] ?? 0;
        const next = prev + qty;
        prodStore.put({
          ...prod,
          stock: next,
          branchStocks: { ...map, [targetBranch.id]: next },
          updatedAt: nowIso,
        });
        movStore.put({
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: prod.id,
          sku: prod.sku,
          productNameMm: prod.nameMm,
          productNameEn: prod.nameEn,
          branchId: targetBranch.id,
          branchNameMm: targetBranch.nameMm,
          branchNameEn: targetBranch.nameEn,
          type: 'void',
          delta: qty,
          previousStock: prev,
          newStock: next,
          reason: `Reversal ${target.invoiceNo}${reason ? ` · ${reason}` : ''}`,
          synced: !isOffline,
          createdAt: nowIso,
        });
      }
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return createdReversalRecord;
}

export async function voidSale(saleId: string, branches: Branch[], isOffline: boolean): Promise<void> {
  const db = await openDatabase();
  const sales = await getAllFromStore<Sale>(db, STORES.SALES);
  const target = sales.find((s) => s.id === saleId);
  if (!target) return;
  await reverseSale({
    saleId,
    branches,
    itemsToReturn: target.items.map((i) => ({
      productId: i.productId,
      qty: i.qty - (target.reversedItems?.[i.productId] ?? 0),
    })),
    reason: 'Full invoice reversal',
    restoreStock: true,
    isOffline,
  });
}

export async function saveSettings(settings: StoreSettings): Promise<void> {
  const db = await openDatabase();
  await putInStore(db, STORES.SETTINGS, settings);
}

export async function syncPendingRecords(): Promise<string> {
  const db = await openDatabase();
  const [sales, movements, settingsList] = await Promise.all([
    getAllFromStore<Sale>(db, STORES.SALES),
    getAllFromStore<StockMovement>(db, STORES.MOVEMENTS),
    getAllFromStore<StoreSettings>(db, STORES.SETTINGS),
  ]);

  const syncedAt = new Date().toISOString();
  const tx = db.transaction([STORES.SALES, STORES.MOVEMENTS, STORES.SETTINGS], 'readwrite');

  sales.forEach((s) => {
    if (!s.synced) {
      tx.objectStore(STORES.SALES).put({ ...s, synced: true });
    }
  });
  movements.forEach((m) => {
    if (!m.synced) {
      tx.objectStore(STORES.MOVEMENTS).put({ ...m, synced: true });
    }
  });

  const currentSettings = settingsList[0] ?? DEFAULT_SETTINGS;
  tx.objectStore(STORES.SETTINGS).put({ ...currentSettings, lastSyncedAt: syncedAt });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return syncedAt;
}

export async function restoreSnapshot(snapshot: FullStoreSnapshot): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(
    [STORES.PRODUCTS, STORES.SALES, STORES.MOVEMENTS, STORES.SETTINGS, STORES.BRANCHES],
    'readwrite'
  );
  tx.objectStore(STORES.PRODUCTS).clear();
  tx.objectStore(STORES.SALES).clear();
  tx.objectStore(STORES.MOVEMENTS).clear();
  tx.objectStore(STORES.SETTINGS).clear();
  tx.objectStore(STORES.BRANCHES).clear();

  snapshot.products.forEach((p) => tx.objectStore(STORES.PRODUCTS).put(p));
  snapshot.sales.forEach((s) => tx.objectStore(STORES.SALES).put(s));
  snapshot.movements.forEach((m) => tx.objectStore(STORES.MOVEMENTS).put(m));
  (snapshot.branches && snapshot.branches.length > 0 ? snapshot.branches : SEED_BRANCHES).forEach(
    (b) => tx.objectStore(STORES.BRANCHES).put(b)
  );
  tx.objectStore(STORES.SETTINGS).put(snapshot.settings);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function resetToSeedData(): Promise<FullStoreSnapshot> {
  const snapshot: FullStoreSnapshot = {
    products: SEED_PRODUCTS,
    sales: SEED_SALES,
    movements: SEED_MOVEMENTS,
    branches: SEED_BRANCHES,
    settings: DEFAULT_SETTINGS,
  };
  await restoreSnapshot(snapshot);
  return initAndLoadSnapshot();
}

export async function deleteSampleData(): Promise<{
  deletedProducts: number;
  deletedSales: number;
  deletedMovements: number;
}> {
  const db = await openDatabase();
  const sampleProductIds = new Set(SEED_PRODUCTS.map((p) => p.id));
  const sampleSaleIds = new Set(SEED_SALES.map((s) => s.id));
  const sampleMovementIds = new Set(SEED_MOVEMENTS.map((m) => m.id));

  const [products, sales, movements] = await Promise.all([
    getAllFromStore<Product>(db, STORES.PRODUCTS),
    getAllFromStore<Sale>(db, STORES.SALES),
    getAllFromStore<StockMovement>(db, STORES.MOVEMENTS),
  ]);

  const tx = db.transaction([STORES.PRODUCTS, STORES.SALES, STORES.MOVEMENTS], 'readwrite');
  let deletedProducts = 0;
  let deletedSales = 0;
  let deletedMovements = 0;

  products.forEach((p) => {
    if (sampleProductIds.has(p.id)) {
      tx.objectStore(STORES.PRODUCTS).delete(p.id);
      deletedProducts++;
    }
  });
  sales.forEach((s) => {
    if (sampleSaleIds.has(s.id)) {
      tx.objectStore(STORES.SALES).delete(s.id);
      deletedSales++;
    }
  });
  movements.forEach((m) => {
    if (sampleMovementIds.has(m.id)) {
      tx.objectStore(STORES.MOVEMENTS).delete(m.id);
      deletedMovements++;
    }
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { deletedProducts, deletedSales, deletedMovements };
}

export async function clearAllStoreData(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([STORES.PRODUCTS, STORES.SALES, STORES.MOVEMENTS], 'readwrite');
  tx.objectStore(STORES.PRODUCTS).clear();
  tx.objectStore(STORES.SALES).clear();
  tx.objectStore(STORES.MOVEMENTS).clear();

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceLocalStore<T>(
  storeName: 'branches' | 'products' | 'sales' | 'movements' | 'settings',
  records: T[]
): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.clear();
  records.forEach((item) => store.put(item));

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

