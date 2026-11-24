import { CATEGORY_LABELS, UNIT_PRESETS } from '../i18n/translations';
import { Product, ProductCategory } from '../types/pos';
import { generateBarcode } from './formatters';

export interface CsvImportCandidate {
  rowNumber: number;
  sku: string;
  nameMm: string;
  nameEn: string;
  category: ProductCategory;
  unitMm: string;
  unitEn: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  existingProduct: Product | null;
  error: string | null;
}

export function parseCsvMatrix(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c !== '')) rows.push(currentRow);

  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveCategory(raw: string): ProductCategory {
  const val = raw.trim().toLowerCase();
  if (!val) return 'groceries';
  const keys: ProductCategory[] = [
    'beverages',
    'snacks',
    'groceries',
    'dairy_chilled',
    'personal_care',
    'household',
  ];
  for (const key of keys) {
    if (
      val === key ||
      val === CATEGORY_LABELS[key].en.toLowerCase() ||
      val === CATEGORY_LABELS[key].mm.toLowerCase()
    ) {
      return key;
    }
  }
  if (val.includes('bev') || val.includes('drink') || val.includes('coffee') || val.includes('tea')) {
    return 'beverages';
  }
  if (val.includes('snack') || val.includes('noodle') || val.includes('biscuit')) {
    return 'snacks';
  }
  if (val.includes('dairy') || val.includes('milk') || val.includes('chill')) {
    return 'dairy_chilled';
  }
  if (val.includes('care') || val.includes('soap') || val.includes('shampoo')) {
    return 'personal_care';
  }
  if (val.includes('house') || val.includes('clean')) {
    return 'household';
  }
  return 'groceries';
}

function resolveUnit(raw: string): { mm: string; en: string } {
  const val = raw.trim().toLowerCase();
  if (!val) return UNIT_PRESETS[0];
  const matched = UNIT_PRESETS.find(
    (u) => u.en.toLowerCase() === val || u.mm.toLowerCase() === val || u.en.toLowerCase().includes(val)
  );
  if (matched) return matched;
  return { mm: raw.trim(), en: raw.trim() };
}

function parseNumber(raw: string, fallback = 0): number {
  const cleaned = raw.replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

export function parseInventoryCsv(
  csvText: string,
  existingProducts: Product[]
): { candidates: CsvImportCandidate[]; missingHeadersError: string | null } {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return {
      candidates: [],
      missingHeadersError: 'CSV file must contain a header row and at least one product row.',
    };
  }

  const rawHeaders = matrix[0].map(normalizeHeader);
  const findCol = (aliases: string[]): number =>
    rawHeaders.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));

  const idxSku = findCol(['sku', 'barcode', 'code']);
  const idxNameMm = findCol(['namemm', 'myanmarname', 'burmesename', 'mmname']);
  const idxNameEn = findCol(['nameen', 'englishname', 'enname', 'productname', 'name']);
  const idxCategory = findCol(['category', 'cat', 'group']);
  const idxUnit = findCol(['unit', 'sellingunit', 'uom']);
  const idxCost = findCol(['cost', 'costprice', 'buyprice']);
  const idxSell = findCol(['sellprice', 'sell', 'price', 'retailprice']);
  const idxStock = findCol(['stock', 'qty', 'quantity', 'onhand']);
  const idxMinStock = findCol(['minalert', 'minstock', 'reorder', 'threshold']);

  if (idxNameMm === -1 && idxNameEn === -1) {
    return {
      candidates: [],
      missingHeadersError:
        'Could not find a product name column (e.g. "Name (MM)", "Name (EN)", or "Name").',
    };
  }
  if (idxSell === -1) {
    return {
      candidates: [],
      missingHeadersError: 'Could not find a sell price column (e.g. "Sell Price (MMK)" or "Price").',
    };
  }

  const bySku = new Map(existingProducts.map((p) => [p.sku.toLowerCase(), p]));
  const candidates: CsvImportCandidate[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const get = (idx: number) => (idx >= 0 && idx < row.length ? row[idx] : '');

    const rawSku = get(idxSku).trim();
    const rawNameMm = get(idxNameMm).trim();
    const rawNameEn = get(idxNameEn).trim();
    const nameMm = rawNameMm || rawNameEn;
    const nameEn = rawNameEn || rawNameMm;
    const sellPrice = Math.round(parseNumber(get(idxSell), 0));
    const costPrice = Math.max(0, Math.round(parseNumber(get(idxCost), 0)));
    const stock = Math.max(0, Math.floor(parseNumber(get(idxStock), 0)));
    const minStock = Math.max(0, Math.floor(parseNumber(get(idxMinStock), 5)));
    const category = resolveCategory(get(idxCategory));
    const unit = resolveUnit(get(idxUnit));

    const sku = rawSku || generateBarcode();
    const existingProduct = bySku.get(sku.toLowerCase()) ?? null;

    let error: string | null = null;
    if (!nameMm && !nameEn) {
      error = 'Missing product name';
    } else if (sellPrice <= 0) {
      error = 'Sell price must be > 0';
    }

    candidates.push({
      rowNumber: r + 1,
      sku,
      nameMm,
      nameEn,
      category,
      unitMm: unit.mm,
      unitEn: unit.en,
      costPrice,
      sellPrice,
      stock,
      minStock,
      existingProduct,
      error,
    });
  }

  return { candidates, missingHeadersError: null };
}
