import { Language, MovementType, PaymentMethod, ProductCategory } from '../types/pos';

export const CATEGORY_LABELS: Record<ProductCategory | 'all', { mm: string; en: string }> = {
  all: { mm: 'အားလုံး', en: 'All Items' },
  beverages: { mm: 'အချိုရည် & ကော်ဖီ', en: 'Beverages' },
  snacks: { mm: 'မုန့် & ခေါက်ဆွဲ', en: 'Snacks & Noodles' },
  groceries: { mm: 'အခြေခံစားကုန်', en: 'Groceries' },
  dairy_chilled: { mm: 'နို့ထွက် & အအေး', en: 'Dairy & Chilled' },
  personal_care: { mm: 'တစ်ကိုယ်ရေသုံး', en: 'Personal Care' },
  household: { mm: 'အိမ်သုံးပစ္စည်း', en: 'Household' },
};

export const PAYMENT_LABELS: Record<PaymentMethod, { mm: string; en: string }> = {
  cash: { mm: 'ငွေသား (Cash)', en: 'Cash' },
  kbzpay: { mm: 'KBZPay', en: 'KBZPay' },
  wavepay: { mm: 'WavePay', en: 'WavePay' },
  aya_pay: { mm: 'AYA Pay', en: 'AYA Pay' },
};

export const MOVEMENT_LABELS: Record<MovementType, { mm: string; en: string }> = {
  sale: { mm: 'အရောင်း', en: 'Sale' },
  restock: { mm: 'စတော့ဖြည့်', en: 'Restock' },
  adjustment: { mm: 'စာရင်းညှိ', en: 'Adjustment' },
  void: { mm: 'ပြန်အမ်း/ပယ်ဖျက်', en: 'Void Return' },
  initial: { mm: 'စတင်စာရင်း', en: 'Initial Stock' },
  transfer_in: { mm: 'ဆိုင်ခွဲအဝင်', en: 'Transfer In' },
  transfer_out: { mm: 'ဆိုင်ခွဲအထွက်', en: 'Transfer Out' },
};

export const UNIT_PRESETS: Array<{ mm: string; en: string }> = [
  { mm: 'ထုပ်', en: 'pack' },
  { mm: 'ဗူး', en: 'can/tin' },
  { mm: 'ပုလင်း', en: 'bottle' },
  { mm: 'ကတ်', en: 'strip' },
  { mm: 'ခု', en: 'pcs' },
  { mm: 'ပြည်', en: 'pyi' },
  { mm: 'ပိဿာ', en: 'viss' },
  { mm: 'ဘူး', en: 'box' },
];

export const UI_TEXT = {
  nav: {
    pos: { mm: 'POS အရောင်း', en: 'POS Register' },
    inventory: { mm: 'ကုန်ပစ္စည်း & စတော့', en: 'Inventory' },
    movements: { mm: 'စတော့ အဝင်/အထွက်', en: 'Stock Ledger' },
    sales: { mm: 'အရောင်းမှတ်တမ်း', en: 'Sales & Profit' },
    settings: { mm: 'ဆိုင် & Offline Backup', en: 'Settings & Sync' },
  },
  status: {
    online: { mm: 'အွန်လိုင်း ချိတ်ဆက်ထားသည်', en: 'Online Connected' },
    offline: { mm: 'အော့ဖ်လိုင်း (စက်ထဲတွင်သိမ်းဆည်းနေသည်)', en: 'Offline Mode (Saved Locally)' },
    pendingSync: { mm: 'Sync စောင့်ဆိုင်းဆဲ', en: 'Pending Sync' },
    synced: { mm: 'သိမ်းဆည်းပြီး', en: 'Synced' },
    simulatedOffline: { mm: 'အော့ဖ်လိုင်း စမ်းသပ်မုဒ် ဖွင့်ထားသည်', en: 'Offline Test Mode Active' },
  },
  pos: {
    searchPlaceholder: {
      mm: 'ပစ္စည်းအမည် သို့မဟုတ် Barcode ရိုက်ထည့်ပါ (Enter နှိပ်၍ထည့်နိုင်)',
      en: 'Search item name or scan barcode (press Enter to add)',
    },
    cartTitle: { mm: 'အရောင်းစာရင်း', en: 'Current Order' },
    clearCart: { mm: 'စာရင်းရှင်း', en: 'Clear' },
    emptyCartTitle: { mm: 'ပစ္စည်း မထည့်ရသေးပါ', en: 'No items in cart' },
    emptyCartSub: {
      mm: 'ဘယ်ဘက်မှ ပစ္စည်းကိုနှိပ်ပါ သို့မဟုတ် Barcode စကန်ဖတ်ပါ',
      en: 'Tap any product on the left or scan a barcode to start billing.',
    },
    inStock: { mm: 'လက်ကျန်', en: 'Stock' },
    lowStock: { mm: 'လက်ကျန်နည်း', en: 'Low' },
    outOfStock: { mm: 'ပစ္စည်းပြတ်', en: 'Out of Stock' },
    subtotal: { mm: 'စုစုပေါင်း', en: 'Subtotal' },
    discount: { mm: 'လျှော့ဈေး', en: 'Discount' },
    total: { mm: 'ကျသင့်ငွေ', en: 'Total Due' },
    paymentMethod: { mm: 'ငွေပေးချေမှု', en: 'Payment Method' },
    amountReceived: { mm: 'လက်ခံငွေ', en: 'Amount Received' },
    changeDue: { mm: 'ပြန်အမ်းငွေ', en: 'Change Due' },
    exactAmount: { mm: 'အတိအကျ', en: 'Exact' },
    checkoutBtn: { mm: 'ငွေရှင်းပြီး ဘောင်ချာထုတ်မည်', en: 'Complete Sale & Print' },
    insufficientCash: { mm: 'လက်ခံငွေ မလုံလောက်ပါ', en: 'Received cash is less than total' },
    stockLimitReached: { mm: 'လက်ကျန်စတော့ထက် ပိုထည့်၍မရပါ', en: 'Cannot exceed available stock' },
    barcodeNotFound: { mm: 'Barcode မတွေ့ပါ', en: 'Barcode not found' },
  },
  inventory: {
    title: { mm: 'ကုန်ပစ္စည်းနှင့် စတော့စာရင်း', en: 'Inventory & Stock Control' },
    addProduct: { mm: 'ပစ္စည်းအသစ်ထည့်မည်', en: 'Add Product' },
    exportCsv: { mm: 'CSV ထုတ်ယူမည်', en: 'Export CSV' },
    totalSkus: { mm: 'ပစ္စည်းအမျိုးအစား', en: 'Total SKUs' },
    totalUnits: { mm: 'စုစုပေါင်း အရေအတွက်', en: 'Total Units' },
    inventoryValue: { mm: 'စတော့ အရင်းတန်ဖိုး', en: 'Stock Cost Value' },
    lowAlerts: { mm: 'လက်ကျန်နည်း / ပြတ်', en: 'Low / Out Alerts' },
    filterAll: { mm: 'အားလုံး', en: 'All' },
    filterLow: { mm: 'လက်ကျန်နည်း', en: 'Low Stock' },
    filterOut: { mm: 'ပစ္စည်းပြတ်', en: 'Out of Stock' },
    restock: { mm: 'စတော့ဖြည့်', en: 'Restock' },
    adjust: { mm: 'စာရင်းညှိ', en: 'Adjust' },
    edit: { mm: 'ပြင်မည်', en: 'Edit' },
    delete: { mm: 'ဖျက်မည်', en: 'Delete' },
    skuCol: { mm: 'SKU / Barcode', en: 'SKU / Barcode' },
    nameCol: { mm: 'ပစ္စည်းအမည်', en: 'Product Name' },
    categoryCol: { mm: 'အမျိုးအစား', en: 'Category' },
    costCol: { mm: 'ဝယ်ဈေး', en: 'Cost' },
    sellCol: { mm: 'ရောင်းဈေး', en: 'Sell Price' },
    stockCol: { mm: 'လက်ကျန်', en: 'Stock' },
    actionsCol: { mm: 'လုပ်ဆောင်ချက်', en: 'Actions' },
  },
  modals: {
    save: { mm: 'သိမ်းဆည်းမည်', en: 'Save' },
    cancel: { mm: 'မလုပ်တော့ပါ', en: 'Cancel' },
    close: { mm: 'ပိတ်မည်', en: 'Close' },
    printReceipt: { mm: 'ဘောင်ချာ Print ထုတ်မည်', en: 'Print Receipt' },
    newSale: { mm: 'အရောင်းအသစ်စမည်', en: 'New Sale' },
    addProductTitle: { mm: 'ကုန်ပစ္စည်းအသစ် ထည့်သွင်းခြင်း', en: 'Add New Product' },
    editProductTitle: { mm: 'ကုန်ပစ္စည်းအချက်အလက် ပြင်ဆင်ခြင်း', en: 'Edit Product' },
    restockTitle: { mm: 'စတော့ အဝင်ဖြည့်သွင်းခြင်း', en: 'Restock / Adjust Inventory' },
    confirmDelete: {
      mm: 'ဤကုန်ပစ္စည်းကို ဖျက်ရန် သေချာပါသလား?',
      en: 'Are you sure you want to delete this product?',
    },
  },
  sales: {
    title: { mm: 'အရောင်းမှတ်တမ်းနှင့် အမြတ်စာရင်း', en: 'Sales History & Daily Profit' },
    todayRevenue: { mm: 'ယနေ့ အရောင်းစုစုပေါင်း', en: "Today's Revenue" },
    todayProfit: { mm: 'ယနေ့ ခန့်မှန်းအမြတ်', en: "Today's Gross Profit" },
    totalOrders: { mm: 'ဘောင်ချာ အရေအတွက်', en: 'Completed Invoices' },
    digitalShare: { mm: 'Mobile Pay ဝင်ငွေ', en: 'Mobile Pay Total' },
    voidSale: { mm: 'ပယ်ဖျက် (စတော့ပြန်ထည့်)', en: 'Void & Restore Stock' },
    viewReceipt: { mm: 'ဘောင်ချာကြည့်', en: 'Receipt' },
    voidedLabel: { mm: 'ပယ်ဖျက်ပြီး', en: 'Voided' },
  },
} as const;

export function t(pair: { mm: string; en: string }, lang: Language): string {
  return pair[lang];
}
