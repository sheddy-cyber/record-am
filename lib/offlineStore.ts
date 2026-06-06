import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { CustomerDebt, DashboardStats, Expense, Product, RevenueActivity } from '@/types';

type Primitive = string | number | boolean | null;

export interface OfflineScope {
  businessId: string;
  branchId?: string | null;
}

type OfflineOperation =
  | 'upsert'
  | 'update'
  | 'delete'
  | 'inventory_adjust'
  | 'sale_payment_recalculate';

export interface OfflineMutation {
  id: string;
  operation: OfflineOperation;
  table?: string;
  payload?: Record<string, any> | Record<string, any>[];
  match?: Record<string, Primitive>;
  onConflict?: string;
  conflictPolicy?: 'server-wins-if-newer' | 'client-wins';
  description?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface OfflineConflict {
  id: string;
  mutation: OfflineMutation;
  message: string;
  createdAt: string;
}

const QUEUE_KEY = 'record-am:offline-queue:v1';
const CONFLICTS_KEY = 'record-am:offline-conflicts:v1';
const CACHE_PREFIX = 'record-am:offline-cache:v1';
const MAX_CACHE_ROWS = 500;
const MAX_SYNC_ATTEMPTS = 5;

let syncInFlight = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

export const createLocalId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const value = Math.floor(Math.random() * 16);
    const normalized = token === 'x' ? value : (value & 0x3) | 0x8;
    return normalized.toString(16);
  });

export const nowIso = () => new Date().toISOString();

const cacheKey = (scope: OfflineScope, table: string) =>
  `${CACHE_PREFIX}:${scope.businessId}:${scope.branchId ?? 'all'}:${table}`;

const parseArray = <T>(raw: string | null): T[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? 'Unknown sync error');
  }
  return 'Unknown sync error';
};

const getErrorCode = (error: unknown) => {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
};

const isRetryableError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  const code = getErrorCode(error);

  if (code) return false;

  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('networkerror') ||
    message.includes('offline') ||
    message.includes('load failed')
  );
};

const isDuplicateKeyError = (error: unknown) => getErrorCode(error) === '23505';

const sortByFreshness = <T extends Record<string, any>>(rows: T[]) =>
  [...rows].sort((a, b) => {
    const aTime = new Date(a.updated_at ?? a.created_at ?? a.last_updated ?? 0).getTime();
    const bTime = new Date(b.updated_at ?? b.created_at ?? b.last_updated ?? 0).getTime();
    return bTime - aTime;
  });

const capRows = <T extends Record<string, any>>(rows: T[], maxRows = MAX_CACHE_ROWS) =>
  sortByFreshness(rows).slice(0, maxRows);

export async function readCachedRows<T>(scope: OfflineScope, table: string): Promise<T[]> {
  return parseArray<T>(await AsyncStorage.getItem(cacheKey(scope, table)));
}

export async function replaceCachedRows<T extends Record<string, any>>(
  scope: OfflineScope,
  table: string,
  rows: T[],
  maxRows = MAX_CACHE_ROWS,
) {
  await AsyncStorage.setItem(cacheKey(scope, table), JSON.stringify(capRows(rows, maxRows)));
}

export async function upsertCachedRows<T extends { id: string }>(
  scope: OfflineScope,
  table: string,
  rows: T[],
  maxRows = MAX_CACHE_ROWS,
) {
  if (rows.length === 0) return;

  const existingRows = await readCachedRows<T>(scope, table);
  const rowMap = new Map(existingRows.map((row) => [row.id, row]));

  rows.forEach((row) => {
    rowMap.set(row.id, { ...(rowMap.get(row.id) ?? {}), ...row });
  });

  await replaceCachedRows(scope, table, Array.from(rowMap.values()), maxRows);
}

export async function updateCachedRow<T extends { id: string }>(
  scope: OfflineScope,
  table: string,
  rowId: string,
  patch: Partial<T>,
) {
  const rows = await readCachedRows<T>(scope, table);
  await replaceCachedRows(
    scope,
    table,
    rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
  );
}

export async function findCachedRow<T extends { id: string }>(
  scope: OfflineScope,
  table: string,
  rowId: string,
) {
  const rows = await readCachedRows<T>(scope, table);
  return rows.find((row) => row.id === rowId) ?? null;
}

export async function readOfflineQueue() {
  return parseArray<OfflineMutation>(await AsyncStorage.getItem(QUEUE_KEY));
}

const writeOfflineQueue = async (queue: OfflineMutation[]) => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export async function getPendingMutationCount() {
  const queue = await readOfflineQueue();
  return queue.length;
}

export async function enqueueMutation(
  mutation: Omit<OfflineMutation, 'id' | 'attempts' | 'createdAt' | 'updatedAt'> & { id?: string },
) {
  await enqueueMutations([mutation]);
}

export async function enqueueMutations(
  mutations: Array<Omit<OfflineMutation, 'id' | 'attempts' | 'createdAt' | 'updatedAt'> & { id?: string }>,
) {
  if (mutations.length === 0) return;

  const timestamp = nowIso();
  const queue = await readOfflineQueue();
  const nextQueue = [
    ...queue,
    ...mutations.map((mutation) => ({
      ...mutation,
      id: mutation.id ?? createLocalId(),
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  ];

  await writeOfflineQueue(nextQueue);
  scheduleOfflineSync();
}

export function scheduleOfflineSync(delayMs = 800) {
  if (syncTimer) return;

  syncTimer = setTimeout(() => {
    syncTimer = null;
    void flushOfflineQueue();
  }, delayMs);
}

const appendConflict = async (mutation: OfflineMutation, error: unknown) => {
  const conflicts = parseArray<OfflineConflict>(await AsyncStorage.getItem(CONFLICTS_KEY));
  const nextConflict: OfflineConflict = {
    id: createLocalId(),
    mutation,
    message: getErrorMessage(error),
    createdAt: nowIso(),
  };

  await AsyncStorage.setItem(CONFLICTS_KEY, JSON.stringify([nextConflict, ...conflicts].slice(0, 100)));
};

const applyMatch = (query: any, match?: Record<string, Primitive>) => {
  let nextQuery = query;
  Object.entries(match ?? {}).forEach(([key, value]) => {
    nextQuery = nextQuery.eq(key, value);
  });
  return nextQuery;
};

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

const assertMutationTable = (mutation: OfflineMutation) => {
  if (!mutation.table) {
    throw new Error(`Offline mutation ${mutation.operation} requires a table.`);
  }
  return mutation.table;
};

const readServerUpdatedAt = async (table: string, match?: Record<string, Primitive>) => {
  if (!match?.id) return null;

  const { data, error } = await supabase
    .from(table)
    .select('updated_at')
    .eq('id', match.id)
    .maybeSingle();

  throwIfError(error);
  return (data as { updated_at?: string } | null)?.updated_at ?? null;
};

const executeMutation = async (mutation: OfflineMutation) => {
  if (mutation.operation === 'upsert') {
    const table = assertMutationTable(mutation);
    const { error } = await supabase
      .from(table)
      .upsert(mutation.payload as any, mutation.onConflict ? { onConflict: mutation.onConflict } : undefined);
    throwIfError(error);
    return;
  }

  if (mutation.operation === 'update') {
    const table = assertMutationTable(mutation);
    const payload = mutation.payload as Record<string, any>;

    if (mutation.conflictPolicy === 'server-wins-if-newer' && payload?.updated_at) {
      const serverUpdatedAt = await readServerUpdatedAt(table, mutation.match);
      if (serverUpdatedAt && new Date(serverUpdatedAt).getTime() > new Date(payload.updated_at).getTime()) {
        await appendConflict(mutation, new Error('Server row is newer than the offline update.'));
        return;
      }
    }

    const { error } = await applyMatch(supabase.from(table).update(payload), mutation.match);
    throwIfError(error);
    return;
  }

  if (mutation.operation === 'delete') {
    const table = assertMutationTable(mutation);
    const { error } = await applyMatch(supabase.from(table).delete(), mutation.match);
    throwIfError(error);
    return;
  }

  if (mutation.operation === 'inventory_adjust') {
    const payload = mutation.payload as {
      product_id: string;
      branch_id: string;
      delta: number;
    };

    const { data, error } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', payload.product_id)
      .eq('branch_id', payload.branch_id)
      .maybeSingle();

    throwIfError(error);

    const currentQuantity = Number((data as { quantity?: number } | null)?.quantity ?? 0);
    const nextQuantity = Math.max(0, Number((currentQuantity + payload.delta).toFixed(2)));

    const { error: upsertError } = await supabase
      .from('inventory')
      .upsert(
        {
          product_id: payload.product_id,
          branch_id: payload.branch_id,
          quantity: nextQuantity,
          last_updated: nowIso(),
        },
        { onConflict: 'product_id,branch_id' },
      );

    throwIfError(upsertError);
    return;
  }

  if (mutation.operation === 'sale_payment_recalculate') {
    const payload = mutation.payload as {
      sale_id: string;
      debt_id: string;
      payment_method: string;
    };

    const [{ data: sale, error: saleError }, { data: debt, error: debtError }] = await Promise.all([
      supabase
        .from('sales')
        .select('amount_paid,total_amount,payment_method')
        .eq('id', payload.sale_id)
        .single(),
      supabase
        .from('customer_debts')
        .select('amount_paid,balance,status')
        .eq('id', payload.debt_id)
        .single(),
    ]);

    throwIfError(saleError);
    throwIfError(debtError);

    const saleRow = sale as { amount_paid: number; total_amount: number; payment_method: string };
    const debtRow = debt as { amount_paid: number; balance: number; status: string };
    const nextMethod =
      saleRow.payment_method === 'mixed' || saleRow.payment_method === payload.payment_method
        ? saleRow.payment_method
        : 'mixed';

    const { error } = await supabase
      .from('sales')
      .update({
        amount_paid: debtRow.amount_paid,
        amount_owed: Math.max(0, debtRow.balance),
        payment_status: debtRow.balance <= 0 ? 'paid' : 'partial',
        payment_method: nextMethod,
        updated_at: nowIso(),
      })
      .eq('id', payload.sale_id);

    throwIfError(error);
    return;
  }
};

export async function flushOfflineQueue() {
  if (syncInFlight) {
    return { synced: 0, remaining: await getPendingMutationCount(), conflicts: 0 };
  }

  syncInFlight = true;

  try {
    const queue = await readOfflineQueue();
    if (queue.length === 0) {
      return { synced: 0, remaining: 0, conflicts: 0 };
    }

    let synced = 0;
    let conflicts = 0;
    let remainingQueue: OfflineMutation[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const mutation = queue[index];

      try {
        await executeMutation(mutation);
        synced += 1;
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          synced += 1;
          continue;
        }

        const nextMutation: OfflineMutation = {
          ...mutation,
          attempts: mutation.attempts + 1,
          lastError: getErrorMessage(error),
          updatedAt: nowIso(),
        };

        if (!isRetryableError(error) && nextMutation.attempts >= MAX_SYNC_ATTEMPTS) {
          await appendConflict(nextMutation, error);
          conflicts += 1;
          continue;
        }

        remainingQueue = [nextMutation, ...queue.slice(index + 1)];
        break;
      }
    }

    await writeOfflineQueue(remainingQueue);
    return { synced, remaining: remainingQueue.length, conflicts };
  } finally {
    syncInFlight = false;
  }
}

export async function cacheProducts(businessId: string, products: Product[]) {
  await replaceCachedRows<Product>({ businessId }, 'products', products, 1000);
}

export async function readCachedProducts(businessId: string) {
  return readCachedRows<Product>({ businessId }, 'products');
}

export async function upsertCachedProducts(businessId: string, products: Product[]) {
  await upsertCachedRows<Product>({ businessId }, 'products', products, 1000);
}

export async function setCachedProductInventory(
  businessId: string,
  branchId: string,
  productId: string,
  quantity: number,
) {
  const products = await readCachedProducts(businessId);
  const timestamp = nowIso();

  const nextProducts = products.map((product) => {
    if (product.id !== productId) return product;

    const inventory = product.inventory ?? [];
    const existing = inventory.find((item) => item.branch_id === branchId);
    const nextInventory = existing
      ? inventory.map((item) =>
          item.branch_id === branchId
            ? { ...item, quantity, last_updated: timestamp }
            : item,
        )
      : [
          ...inventory,
          {
            id: createLocalId(),
            product_id: productId,
            branch_id: branchId,
            quantity,
            last_updated: timestamp,
          },
        ];

    return {
      ...product,
      inventory: nextInventory,
      updated_at: timestamp,
    };
  });

  await cacheProducts(businessId, nextProducts);
}

export async function adjustCachedProductInventory(
  businessId: string,
  branchId: string,
  productId: string,
  delta: number,
) {
  const products = await readCachedProducts(businessId);
  const product = products.find((item) => item.id === productId);
  const currentQuantity =
    product?.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;
  await setCachedProductInventory(
    businessId,
    branchId,
    productId,
    Math.max(0, Number((currentQuantity + delta).toFixed(2))),
  );
}

export async function cacheRevenueActivities(
  businessId: string,
  branchId: string,
  activities: RevenueActivity[],
) {
  await replaceCachedRows<RevenueActivity>(
    { businessId, branchId },
    'revenue_activities',
    activities,
    300,
  );
}

export async function readCachedRevenueActivities(
  businessId: string,
  branchId: string,
  limit = 60,
) {
  const activities = await readCachedRows<RevenueActivity>(
    { businessId, branchId },
    'revenue_activities',
  );
  return sortByFreshness(activities).slice(0, limit);
}

export async function upsertCachedRevenueActivities(
  businessId: string,
  branchId: string,
  activities: RevenueActivity[],
) {
  await upsertCachedRows<RevenueActivity>(
    { businessId, branchId },
    'revenue_activities',
    activities,
    300,
  );
}

export async function cacheCustomerDebts(
  businessId: string,
  branchId: string,
  debts: CustomerDebt[],
) {
  await replaceCachedRows<CustomerDebt>({ businessId, branchId }, 'customer_debts', debts, 300);
}

export async function readCachedCustomerDebts(businessId: string, branchId: string) {
  return readCachedRows<CustomerDebt>({ businessId, branchId }, 'customer_debts');
}

export async function upsertCachedCustomerDebts(
  businessId: string,
  branchId: string,
  debts: CustomerDebt[],
) {
  await upsertCachedRows<CustomerDebt>({ businessId, branchId }, 'customer_debts', debts, 300);
}

export async function cacheExpenses(businessId: string, branchId: string, expenses: Expense[]) {
  await replaceCachedRows<Expense>({ businessId, branchId }, 'expenses', expenses, 300);
}

export async function readCachedExpenses(businessId: string, branchId: string) {
  return readCachedRows<Expense>({ businessId, branchId }, 'expenses');
}

export async function upsertCachedExpenses(
  businessId: string,
  branchId: string,
  expenses: Expense[],
) {
  await upsertCachedRows<Expense>({ businessId, branchId }, 'expenses', expenses, 300);
}

const sameLocalDate = (isoDate: string, targetDate = new Date()) => {
  const date = new Date(isoDate);
  return (
    date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate()
  );
};

export async function buildCachedDashboardData(
  businessId: string,
  branchId: string,
): Promise<{
  stats: DashboardStats;
  recentActivities: RevenueActivity[];
  recentDebts: CustomerDebt[];
}> {
  const [activities, debts, expenses, products] = await Promise.all([
    readCachedRevenueActivities(businessId, branchId, 60),
    readCachedCustomerDebts(businessId, branchId),
    readCachedExpenses(businessId, branchId),
    readCachedProducts(businessId),
  ]);

  const todayActivities = activities.filter((activity) => sameLocalDate(activity.created_at));
  const todayExpenses = expenses.filter((expense) => {
    if (expense.expense_date) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = `${today.getMonth() + 1}`.padStart(2, '0');
      const dd = `${today.getDate()}`.padStart(2, '0');
      return expense.expense_date === `${yyyy}-${mm}-${dd}`;
    }
    return sameLocalDate(expense.created_at);
  });
  const openDebts = debts.filter((debt) => debt.status !== 'settled');

  const todaySales = todayActivities.reduce((sum, activity) => sum + activity.amount_paid, 0);
  const todayExpenseTotal = todayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const stockCounts = products.reduce(
    (acc, product) => {
      if (product.is_service || !product.is_active) return acc;
      const stock =
        product.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;
      if (stock <= 0) acc.outOfStock += 1;
      if (stock > 0 && stock <= product.reorder_level) acc.lowStock += 1;
      return acc;
    },
    { lowStock: 0, outOfStock: 0 },
  );

  return {
    stats: {
      today_sales: todaySales,
      today_profit: todaySales - todayExpenseTotal,
      today_expenses: todayExpenseTotal,
      total_products: products.filter((product) => product.is_active).length,
      low_stock_count: stockCounts.lowStock,
      out_of_stock_count: stockCounts.outOfStock,
      outstanding_debts: openDebts.reduce((sum, debt) => sum + debt.balance, 0),
      total_customers: new Set(openDebts.map((debt) => debt.customer_name.toLowerCase())).size,
    },
    recentActivities: activities.slice(0, 4),
    recentDebts: sortByFreshness(openDebts).slice(0, 3),
  };
}
