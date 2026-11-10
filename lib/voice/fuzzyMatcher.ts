import Fuse from 'fuse.js';
import { Customer, Product } from '@/types';
import { EXPENSE_CATEGORIES, PRODUCT_UNITS } from '@/constants';

export interface MatchResult<T> {
  item: T;
  score: number; // 0 (perfect match) to 1 (poor match)
  confidence: number; // 0 to 1 (1 = best)
}

/**
 * Fuzzy matches a product name against business catalog.
 */
export function matchProduct(
  query: string,
  products: Product[],
): MatchResult<Product> | null {
  if (!query || !products || products.length === 0) return null;

  const cleanQuery = query.trim().toLowerCase();

  // 1. Exact match attempt first
  const exact = products.find(
    (p) =>
      p.name.toLowerCase() === cleanQuery ||
      p.sku?.toLowerCase() === cleanQuery ||
      p.barcode?.toLowerCase() === cleanQuery,
  );
  if (exact) {
    return { item: exact, score: 0, confidence: 1 };
  }

  // 2. Fuse.js fuzzy search
  const fuse = new Fuse(products, {
    keys: [
      { name: 'name', weight: 0.7 },
      { name: 'sku', weight: 0.2 },
      { name: 'barcode', weight: 0.1 },
    ],
    threshold: 0.45, // Match tolerance
    includeScore: true,
    minMatchCharLength: 2,
  });

  const results = fuse.search(cleanQuery);
  if (results.length > 0) {
    const best = results[0];
    const score = best.score ?? 0.5;
    return {
      item: best.item,
      score,
      confidence: Math.max(0, 1 - score),
    };
  }

  return null;
}

/**
 * Fuzzy matches a customer against business customers.
 */
export function matchCustomer(
  query: string,
  customers: Customer[],
): MatchResult<Customer> | null {
  if (!query || !customers || customers.length === 0) return null;

  const cleanQuery = query.trim().toLowerCase();

  const exact = customers.find(
    (c) =>
      c.name.toLowerCase() === cleanQuery ||
      (c.phone && c.phone.replace(/[^0-9]/g, '') === cleanQuery.replace(/[^0-9]/g, '')),
  );
  if (exact) {
    return { item: exact, score: 0, confidence: 1 };
  }

  const fuse = new Fuse(customers, {
    keys: [
      { name: 'name', weight: 0.8 },
      { name: 'phone', weight: 0.2 },
    ],
    threshold: 0.4,
    includeScore: true,
  });

  const results = fuse.search(cleanQuery);
  if (results.length > 0) {
    const best = results[0];
    const score = best.score ?? 0.5;
    return {
      item: best.item,
      score,
      confidence: Math.max(0, 1 - score),
    };
  }

  return null;
}

/**
 * Category aliases and synonyms covering retail/Nigerian shop expressions.
 */
const CATEGORY_SYNONYMS: Record<string, string> = {
  // electricity / power / fuel
  fuel: 'electricity',
  diesel: 'electricity',
  petrol: 'electricity',
  generator: 'electricity',
  gen: 'electricity',
  power: 'electricity',
  nepa: 'electricity',
  light: 'electricity',
  electric: 'electricity',
  phcn: 'electricity',

  // transport / delivery
  transport: 'transport',
  logistics: 'transport',
  delivery: 'transport',
  keke: 'transport',
  okada: 'transport',
  bike: 'transport',
  uber: 'transport',
  bolt: 'transport',
  bus: 'transport',
  fare: 'transport',
  waybill: 'transport',
  dispatch: 'transport',

  // salary / wages
  salary: 'salary',
  salaries: 'salary',
  wages: 'salary',
  wage: 'salary',
  staff: 'salary',
  worker: 'salary',
  salesgirl: 'salary',
  salesboy: 'salary',
  apprentice: 'salary',
  stipend: 'salary',

  // rent
  rent: 'rent',
  shop: 'rent',
  lease: 'rent',
  landlord: 'rent',

  // supplies
  supplies: 'supplies',
  nylon: 'supplies',
  bags: 'supplies',
  paper: 'supplies',
  stationery: 'supplies',
  receipt: 'supplies',
  tape: 'supplies',
  carton: 'supplies',

  // maintenance
  maintenance: 'maintenance',
  repair: 'maintenance',
  fix: 'maintenance',
  plumber: 'maintenance',
  carpenter: 'maintenance',
  service: 'maintenance',
  cleaning: 'maintenance',
  cleaner: 'maintenance',

  // internet / phone
  internet: 'internet',
  data: 'internet',
  airtime: 'internet',
  recharge: 'internet',
  wifi: 'internet',
  mtn: 'internet',
  glo: 'internet',
  airtel: 'internet',

  // water
  water: 'water',
  purewater: 'water',
  dispenser: 'water',
  tanker: 'water',

  // security
  security: 'security',
  guard: 'security',
  vigilante: 'security',
  watchman: 'security',

  // damage / loss
  damage: 'damage',
  damaged: 'damage',
  spoilt: 'damage',
  broken: 'damage',
  expired: 'damage',
  loss: 'damage',
  waste: 'damage',
};

/**
 * Resolves expense category from user description or explicit category word.
 */
export function matchExpenseCategory(query: string): { value: string; label: string } {
  const clean = query.trim().toLowerCase();

  // Check synonym map first
  const words = clean.split(/[^a-z0-9]+/);
  for (const word of words) {
    if (CATEGORY_SYNONYMS[word]) {
      const catKey = CATEGORY_SYNONYMS[word];
      const match = EXPENSE_CATEGORIES.find((c) => c.value === catKey);
      if (match) return match;
    }
  }

  // Exact match with known categories
  for (const cat of EXPENSE_CATEGORIES) {
    if (clean.includes(cat.value)) {
      return cat;
    }
  }

  // Fallback to "other"
  const fallback = EXPENSE_CATEGORIES.find((c) => c.value === 'other') || {
    value: 'other',
    label: 'Other Expense',
  };
  return fallback;
}

/**
 * Standardizes retail unit words.
 */
export function normalizeUnit(rawUnit?: string): string {
  if (!rawUnit) return 'piece';
  const clean = rawUnit.trim().toLowerCase();

  const map: Record<string, string> = {
    pcs: 'piece',
    pc: 'piece',
    pieces: 'piece',
    item: 'piece',
    items: 'piece',
    ctn: 'carton',
    ctns: 'carton',
    cartons: 'carton',
    pk: 'pack',
    pks: 'pack',
    packs: 'pack',
    packet: 'pack',
    packets: 'pack',
    btl: 'bottle',
    btls: 'bottle',
    bottles: 'bottle',
    tin: 'tin',
    tins: 'tin',
    can: 'tin',
    cans: 'tin',
    bag: 'bag',
    bags: 'bag',
    dz: 'dozen',
    dozen: 'dozen',
    doz: 'dozen',
    roll: 'roll',
    rolls: 'roll',
    kg: 'kg',
    kilo: 'kg',
    kilogram: 'kg',
  };

  return map[clean] || clean;
}
