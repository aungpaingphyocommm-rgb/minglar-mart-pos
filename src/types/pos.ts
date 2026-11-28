export type Language = 'mm' | 'en';

export type NavTab = 'pos' | 'inventory' | 'movements' | 'sales' | 'settings';

export type ProductCategory =
  | 'beverages'
  | 'snacks'
  | 'groceries'
  | 'personal_care'
  | 'household'
  | 'dairy_chilled';

export type PaymentMethod = 'cash' | 'kbzpay' | 'wavepay' | 'aya_pay';

export type MovementType =
  | 'sale'
  | 'restock'
  | 'adjustment'
  | 'void'
  | 'initial'
  | 'transfer_in'
  | 'transfer_out';

export interface Branch {
  id: string;
  shopId?: string;
  code: string;
  nameMm: string;
  nameEn: string;
  phone: string;
  addressMm: string;
  addressEn: string;
  isMain: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  shopId?: string;
  branchId?: string;
  sku: string;
  nameMm: string;
  nameEn: string;
  category: ProductCategory;
  costPrice: number;
  sellPrice: number;
  stock: number;
  branchStocks?: Record<string, number>;
  minStock: number;
  unitMm: string;
  unitEn: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  sku: string;
  nameMm: string;
  nameEn: string;
  unitMm: string;
  unitEn: string;
  costPrice: number;
  unitPrice: number;
  qty: number;
  maxStock: number;
}

export interface SaleItem {
  productId: string;
  sku: string;
  nameMm: string;
  nameEn: string;
  unitMm: string;
  unitEn: string;
  qty: number;
  unitPrice: number;
  costPrice: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  shopId?: string;
  invoiceNo: string;
  branchId?: string;
  branchNameMm?: string;
  branchNameEn?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  changeGiven: number;
  status: 'completed' | 'voided';
  synced: boolean;
  note?: string;
  reversalReason?: string;
  reversedAt?: string;
  reversedItems?: Record<string, number>;
  reversalOfInvoiceNo?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface StockMovement {
  id: string;
  shopId?: string;
  productId: string;
  sku: string;
  productNameMm: string;
  productNameEn: string;
  branchId?: string;
  branchNameMm?: string;
  branchNameEn?: string;
  type: MovementType;
  delta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  synced: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type ThemeMode = 'light' | 'dark';

export interface StoreSettings {
  id: 'default';
  shopId?: string;
  storeNameMm: string;
  storeNameEn: string;
  phone: string;
  addressMm: string;
  addressEn: string;
  receiptFooterMm: string;
  receiptFooterEn: string;
  defaultLanguage: Language;
  theme?: ThemeMode;
  activeBranchId?: string;
  multiBranchEnabled?: boolean;
  lastSyncedAt: string | null;
  updatedAt?: string;
}
