import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { PaymentStatus, Product, Purchase, PurchaseItem, Supplier, SupplierDebt } from '@/types';
import { useBusinessStore } from '@/store/businessStore';
import {
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedRows,
  readCachedProducts,
  upsertCachedProducts,
  upsertCachedRows,
} from '@/lib/offlineStore';

export const roundAmount = (value: number) => Number(value.toFixed(2));

const normalizeProductName = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

export interface PurchaseDraftProduct {
  name: string;
  unit: string;
  selling_price: number;
  reorder_level?: number;
  is_service?: boolean;
}

export interface PurchaseCartItem {
  key: string;
  product?: Product;
  productDraft?: PurchaseDraftProduct;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  input_quantity?: string;
  input_unit_cost?: string;
}

interface ResolvedPurchaseItem {
  product_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

interface PurchaseMutationParams {
  businessId: string;
  branchId: string;
  supplierId?: string;
  supplierName: string;
  items: PurchaseCartItem[];
  amountPaid: number;
  discountAmount?: number;
  notes?: string;
  purchaseDate: string;
}

interface CreatePurchaseParams extends PurchaseMutationParams {
  userId: string;
}

interface UpdatePurchaseParams extends PurchaseMutationParams {
  purchaseId: string;
}

interface PurchaseState {
  purchases: Purchase[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchPurchases: (businessId: string, branchId: string) => Promise<void>;
  fetchPurchaseById: (purchaseId: string) => Promise<Purchase | null>;
  recordPurchase: (params: CreatePurchaseParams) => Promise<Purchase | null>;
  updatePurchase: (params: UpdatePurchaseParams) => Promise<Purchase | null>;
}

export const calculatePurchaseSubtotal = (items: PurchaseCartItem[]) =>
  roundAmount(items.reduce((sum, item) => sum + roundAmount(item.quantity * item.unit_cost), 0));

export const calculatePurchaseTotals = (items: PurchaseCartItem[], discountAmount: number, amountPaid: number) => {
  const subtotal = calculatePurchaseSubtotal(items);
  const normalizedDiscount = Math.max(0, roundAmount(discountAmount));
  const totalAmount = Math.max(0, roundAmount(subtotal - normalizedDiscount));
  const normalizedAmountPaid = Math.max(0, Math.min(totalAmount, roundAmount(amountPaid)));
  const amountOwed = Math.max(0, roundAmount(totalAmount - normalizedAmountPaid));
  const paymentStatus: PaymentStatus = normalizedAmountPaid >= totalAmount
    ? 'paid'
    : normalizedAmountPaid > 0
      ? 'partial'
      : 'credit';

  return {
    subtotal,
    discountAmount: normalizedDiscount,
    totalAmount,
    amountPaid: normalizedAmountPaid,
    amountOwed,
    paymentStatus,
  };
};

export const createPurchaseCartItemFromProduct = (
  product: Product,
  overrides?: Partial<Omit<PurchaseCartItem, 'product' | 'productDraft' | 'key'>>,
): PurchaseCartItem => {
  const quantity = overrides?.quantity ?? 1;
  const unitCost = overrides?.unit_cost ?? Number(product.cost_price ?? 0);

  return {
    key: `product-${product.id}`,
    product,
    quantity,
    unit_cost: unitCost,
    total_cost: roundAmount(quantity * unitCost),
  };
};

export const createPurchaseCartItemFromDraft = (
  productDraft: PurchaseDraftProduct,
  overrides?: Partial<Omit<PurchaseCartItem, 'product' | 'productDraft' | 'key'>>,
): PurchaseCartItem => {
  const quantity = overrides?.quantity ?? 1;
  const unitCost = overrides?.unit_cost ?? 0;

  return {
    key: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productDraft,
    quantity,
    unit_cost: unitCost,
    total_cost: roundAmount(quantity * unitCost),
  };
};

const throwIfError = (error: unknown) => {
  if (error) throw error;
};

const getPurchaseCartItemName = (item: PurchaseCartItem) =>
  item.product?.name ?? item.productDraft?.name ?? '';

async function fetchActiveProducts(businessId: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true);

  throwIfError(error);
  return (data as Product[]) ?? [];
}

async function ensureDraftProduct(params: {
  branchId: string;
  businessId: string;
  productDraft: PurchaseDraftProduct;
  unitCost: number;
  productsByName: Map<string, Product>;
}) {
  const { branchId, businessId, productDraft, unitCost, productsByName } = params;
  const cleanedName = productDraft.name.trim().replace(/\s+/g, ' ');
  if (!cleanedName) {
    throw new Error('Each purchase item must have a product name.');
  }

  const nameKey = normalizeProductName(cleanedName);
  const existing = productsByName.get(nameKey);
  if (existing) {
    return existing;
  }

  const { data: createdProduct, error: createProductError } = await supabase
    .from('products')
    .insert({
      business_id: businessId,
      name: cleanedName,
      unit: productDraft.unit.trim() || 'piece',
      cost_price: roundAmount(unitCost),
      selling_price: roundAmount(productDraft.selling_price > 0 ? productDraft.selling_price : unitCost),
      reorder_level: roundAmount(productDraft.reorder_level ?? 5),
      is_service: productDraft.is_service ?? false,
    })
    .select('*')
    .single();

  throwIfError(createProductError);

  const product = createdProduct as Product;
  if (!product.is_service) {
    const { error: inventoryError } = await supabase
      .from('inventory')
      .upsert(
        {
          product_id: product.id,
          branch_id: branchId,
          quantity: 0,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'product_id,branch_id' },
      );

    throwIfError(inventoryError);
  }

  productsByName.set(nameKey, product);
  return product;
}

async function resolvePurchaseItems(items: PurchaseCartItem[], businessId: string, branchId: string) {
  if (items.length === 0) {
    throw new Error('Add at least one item to this purchase.');
  }

  const activeProducts = await fetchActiveProducts(businessId);
  const productsByName = new Map(
    activeProducts.map((product) => [normalizeProductName(product.name), product]),
  );

  const resolvedItems: ResolvedPurchaseItem[] = [];

  for (const item of items) {
    const quantity = roundAmount(item.quantity);
    const unitCost = roundAmount(item.unit_cost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Enter a valid quantity for ${getPurchaseCartItemName(item) || 'this item'}.`);
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error(`Enter a valid unit cost for ${getPurchaseCartItemName(item) || 'this item'}.`);
    }

    let product = item.product;
    if (!product && item.productDraft) {
      product = await ensureDraftProduct({
        branchId,
        businessId,
        productDraft: item.productDraft,
        unitCost,
        productsByName,
      });
    }

    if (!product) {
      throw new Error('Every purchase item must be linked to a product.');
    }

    resolvedItems.push({
      product_id: product.id,
      quantity,
      unit_cost: unitCost,
      total_cost: roundAmount(quantity * unitCost),
    });
  }

  return resolvedItems;
}

async function syncSupplierDebt(params: {
  purchaseId: string;
  businessId: string;
  supplierId?: string;
  supplierName: string;
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  paymentStatus: PaymentStatus;
  notes?: string;
}) {
  const {
    purchaseId,
    businessId,
    supplierId,
    supplierName,
    totalAmount,
    amountPaid,
    amountOwed,
    paymentStatus,
    notes,
  } = params;

  const { data: existingDebts, error: lookupDebtError } = await supabase
    .from('supplier_debts')
    .select('id')
    .eq('purchase_id', purchaseId);

  throwIfError(lookupDebtError);

  const primaryDebtId = existingDebts?.[0]?.id;
  const extraDebtIds = (existingDebts ?? []).slice(1).map((debt) => debt.id);

  if (amountOwed <= 0) {
    if ((existingDebts ?? []).length > 0) {
      const { error: deleteDebtError } = await supabase
        .from('supplier_debts')
        .delete()
        .eq('purchase_id', purchaseId);

      throwIfError(deleteDebtError);
    }
    return;
  }

  if (primaryDebtId) {
    const { error: updateDebtError } = await supabase
      .from('supplier_debts')
      .update({
        business_id: businessId,
        supplier_id: supplierId ?? null,
        supplier_name: supplierName,
        original_amount: totalAmount,
        amount_paid: amountPaid,
        balance: amountOwed,
        status: paymentStatus === 'partial' ? 'partial' : 'outstanding',
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', primaryDebtId);

    throwIfError(updateDebtError);
  } else {
    const { error: createDebtError } = await supabase
      .from('supplier_debts')
      .insert({
        business_id: businessId,
        supplier_id: supplierId ?? null,
        purchase_id: purchaseId,
        supplier_name: supplierName,
        original_amount: totalAmount,
        amount_paid: amountPaid,
        balance: amountOwed,
        status: paymentStatus === 'partial' ? 'partial' : 'outstanding',
        notes: notes ?? null,
      });

    throwIfError(createDebtError);
  }

  if (extraDebtIds.length > 0) {
    const { error: deleteExtraDebtsError } = await supabase
      .from('supplier_debts')
      .delete()
      .in('id', extraDebtIds);

    throwIfError(deleteExtraDebtsError);
  }
}

async function hydratePurchase(purchaseId: string) {
  const { data, error } = await supabase
    .from('purchases')
    .select(`
      *,
      supplier:suppliers(name, phone),
      items:purchase_items(*, product:products(*))
    `)
    .eq('id', purchaseId)
    .single();

  throwIfError(error);
  return data as Purchase;
}

async function writePurchaseRecord(
  params: PurchaseMutationParams & {
    purchaseId?: string;
    purchaseNumber?: string;
    userId?: string;
  },
) {
  const {
    purchaseId,
    purchaseNumber,
    userId,
    businessId,
    branchId,
    supplierId,
    supplierName,
    items,
    amountPaid,
    discountAmount = 0,
    notes,
    purchaseDate,
  } = params;

  const resolvedItems = await resolvePurchaseItems(items, businessId, branchId);
  const totals = calculatePurchaseTotals(
    resolvedItems.map((item) => ({
      key: item.product_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
    })),
    discountAmount,
    amountPaid,
  );

  let currentPurchaseId = purchaseId;

  if (!currentPurchaseId) {
    const { data: generatedNumber, error: numberError } = await supabase.rpc('generate_purchase_number', {
      p_business_id: businessId,
    });
    throwIfError(numberError);

    const { data: insertedPurchase, error: insertPurchaseError } = await supabase
      .from('purchases')
      .insert({
        business_id: businessId,
        branch_id: branchId,
        supplier_id: supplierId ?? null,
        purchase_number: purchaseNumber ?? generatedNumber ?? `PUR-${Date.now()}`,
        total_amount: totals.totalAmount,
        discount_amount: totals.discountAmount,
        amount_paid: totals.amountPaid,
        amount_owed: totals.amountOwed,
        payment_status: totals.paymentStatus,
        notes: notes ?? null,
        purchase_date: purchaseDate,
        recorded_by: userId ?? null,
      })
      .select('id')
      .single();

    throwIfError(insertPurchaseError);
    currentPurchaseId = insertedPurchase?.id;
  } else {
    const { error: updatePurchaseError } = await supabase
      .from('purchases')
      .update({
        supplier_id: supplierId ?? null,
        total_amount: totals.totalAmount,
        discount_amount: totals.discountAmount,
        amount_paid: totals.amountPaid,
        amount_owed: totals.amountOwed,
        payment_status: totals.paymentStatus,
        notes: notes ?? null,
        purchase_date: purchaseDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentPurchaseId);

    throwIfError(updatePurchaseError);

    const { error: deleteItemsError } = await supabase
      .from('purchase_items')
      .delete()
      .eq('purchase_id', currentPurchaseId);

    throwIfError(deleteItemsError);
  }

  if (!currentPurchaseId) {
    throw new Error('Purchase could not be saved.');
  }

  try {
    const { error: insertItemsError } = await supabase
      .from('purchase_items')
      .insert(
        resolvedItems.map((item) => ({
          purchase_id: currentPurchaseId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
        })),
      );

    throwIfError(insertItemsError);

    await syncSupplierDebt({
      purchaseId: currentPurchaseId,
      businessId,
      supplierId,
      supplierName,
      totalAmount: totals.totalAmount,
      amountPaid: totals.amountPaid,
      amountOwed: totals.amountOwed,
      paymentStatus: totals.paymentStatus,
      notes,
    });

    return hydratePurchase(currentPurchaseId);
  } catch (error) {
    if (!purchaseId && currentPurchaseId) {
      await supabase.from('supplier_debts').delete().eq('purchase_id', currentPurchaseId);
      await supabase.from('purchases').delete().eq('id', currentPurchaseId);
    }
    throw error;
  }
}

const stripProductForWrite = (product: Product) => {
  const { category, inventory, ...payload } = product;
  return payload;
};

const hydrateLocalProductsByName = async (businessId: string) => {
  const memoryProducts = useBusinessStore.getState().products;
  const cachedProducts = await readCachedProducts(businessId);
  const products = [...cachedProducts, ...memoryProducts].filter((product) => product.is_active);
  return new Map(products.map((product) => [normalizeProductName(product.name), product]));
};

async function ensureLocalDraftProduct(params: {
  branchId: string;
  businessId: string;
  productDraft: PurchaseDraftProduct;
  unitCost: number;
  productsByName: Map<string, Product>;
  mutations: Parameters<typeof enqueueMutations>[0];
}) {
  const { branchId, businessId, productDraft, unitCost, productsByName, mutations } = params;
  const cleanedName = productDraft.name.trim().replace(/\s+/g, ' ');
  if (!cleanedName) {
    throw new Error('Each purchase item must have a product name.');
  }

  const nameKey = normalizeProductName(cleanedName);
  const existing = productsByName.get(nameKey);
  if (existing) {
    return existing;
  }

  const timestamp = nowIso();
  const product: Product = {
    id: createLocalId(),
    business_id: businessId,
    name: cleanedName,
    unit: productDraft.unit.trim() || 'piece',
    cost_price: roundAmount(unitCost),
    selling_price: roundAmount(productDraft.selling_price > 0 ? productDraft.selling_price : unitCost),
    reorder_level: roundAmount(productDraft.reorder_level ?? 5),
    is_service: productDraft.is_service ?? false,
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
    inventory: productDraft.is_service
      ? []
      : [
          {
            id: createLocalId(),
            product_id: '',
            branch_id: branchId,
            quantity: 0,
            last_updated: timestamp,
          },
        ],
  };

  product.inventory = product.inventory?.map((inventory) => ({
    ...inventory,
    product_id: product.id,
  }));

  productsByName.set(nameKey, product);
  useBusinessStore.setState((state) => ({ products: [...state.products, product] }));
  await upsertCachedProducts(businessId, [product]);

  mutations.push({
    operation: 'upsert',
    table: 'products',
    payload: stripProductForWrite(product),
    onConflict: 'id',
    description: `Sync product ${product.name}`,
  });

  if (!product.is_service) {
    mutations.push({
      operation: 'upsert',
      table: 'inventory',
      payload: {
        product_id: product.id,
        branch_id: branchId,
        quantity: 0,
        last_updated: timestamp,
      },
      onConflict: 'product_id,branch_id',
      description: `Sync inventory shell for ${product.name}`,
    });
  }

  return product;
}

async function resolvePurchaseItemsOffline(
  items: PurchaseCartItem[],
  businessId: string,
  branchId: string,
  mutations: Parameters<typeof enqueueMutations>[0],
) {
  if (items.length === 0) {
    throw new Error('Add at least one item to this purchase.');
  }

  const productsByName = await hydrateLocalProductsByName(businessId);
  const resolvedItems: Array<ResolvedPurchaseItem & { product: Product }> = [];

  for (const item of items) {
    const quantity = roundAmount(item.quantity);
    const unitCost = roundAmount(item.unit_cost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Enter a valid quantity for ${getPurchaseCartItemName(item) || 'this item'}.`);
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error(`Enter a valid unit cost for ${getPurchaseCartItemName(item) || 'this item'}.`);
    }

    let product = item.product;
    if (!product && item.productDraft) {
      product = await ensureLocalDraftProduct({
        branchId,
        businessId,
        productDraft: item.productDraft,
        unitCost,
        productsByName,
        mutations,
      });
    }

    if (!product) {
      throw new Error('Every purchase item must be linked to a product.');
    }

    resolvedItems.push({
      product_id: product.id,
      product,
      quantity,
      unit_cost: unitCost,
      total_cost: roundAmount(quantity * unitCost),
    });
  }

  return resolvedItems;
}

async function writePurchaseRecordOffline(params: CreatePurchaseParams) {
  const timestamp = nowIso();
  const mutations: Parameters<typeof enqueueMutations>[0] = [];
  const resolvedItems = await resolvePurchaseItemsOffline(
    params.items,
    params.businessId,
    params.branchId,
    mutations,
  );
  const totals = calculatePurchaseTotals(
    resolvedItems.map((item) => ({
      key: item.product_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
    })),
    params.discountAmount ?? 0,
    params.amountPaid,
  );

  const purchaseId = createLocalId();
  const supplierId = params.supplierId || createLocalId();
  const supplierName = params.supplierName.trim();
  const purchaseNumber = `OFF-PUR-${Date.now().toString(36).toUpperCase()}`;
  const supplier: Supplier = {
    id: supplierId,
    business_id: params.businessId,
    name: supplierName,
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const purchaseItems: PurchaseItem[] = resolvedItems.map((item) => ({
    id: createLocalId(),
    purchase_id: purchaseId,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    total_cost: item.total_cost,
    created_at: timestamp,
    product: item.product,
  }));

  const purchase: Purchase = {
    id: purchaseId,
    business_id: params.businessId,
    branch_id: params.branchId,
    supplier_id: supplierId,
    purchase_number: purchaseNumber,
    total_amount: totals.totalAmount,
    discount_amount: totals.discountAmount,
    amount_paid: totals.amountPaid,
    amount_owed: totals.amountOwed,
    payment_status: totals.paymentStatus,
    notes: params.notes,
    purchase_date: params.purchaseDate,
    recorded_by: params.userId,
    created_at: timestamp,
    updated_at: timestamp,
    supplier: { ...supplier },
    items: purchaseItems,
  };

  const supplierDebt: SupplierDebt | null =
    totals.amountOwed > 0
      ? {
          id: createLocalId(),
          business_id: params.businessId,
          supplier_id: supplierId,
          purchase_id: purchaseId,
          supplier_name: supplierName,
          original_amount: totals.totalAmount,
          amount_paid: totals.amountPaid,
          balance: totals.amountOwed,
          status: totals.paymentStatus === 'partial' ? 'partial' : 'outstanding',
          notes: params.notes,
          created_at: timestamp,
          updated_at: timestamp,
        }
      : null;

  mutations.push(
    {
      operation: 'upsert',
      table: 'suppliers',
      payload: supplier,
      onConflict: 'id',
      description: `Sync supplier ${supplier.name}`,
    },
    {
      operation: 'upsert',
      table: 'purchases',
      payload: {
        id: purchase.id,
        business_id: purchase.business_id,
        branch_id: purchase.branch_id,
        supplier_id: purchase.supplier_id,
        purchase_number: purchase.purchase_number,
        total_amount: purchase.total_amount,
        discount_amount: purchase.discount_amount,
        amount_paid: purchase.amount_paid,
        amount_owed: purchase.amount_owed,
        payment_status: purchase.payment_status,
        notes: purchase.notes ?? null,
        purchase_date: purchase.purchase_date,
        recorded_by: purchase.recorded_by ?? null,
        created_at: purchase.created_at,
        updated_at: purchase.updated_at,
      },
      onConflict: 'id',
      description: `Sync purchase ${purchase.purchase_number}`,
    },
    {
      operation: 'upsert',
      table: 'purchase_items',
      payload: purchaseItems.map((item) => ({
        id: item.id,
        purchase_id: item.purchase_id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        created_at: item.created_at,
      })),
      onConflict: 'id',
      description: `Sync purchase items for ${purchase.purchase_number}`,
    },
  );

  if (supplierDebt) {
    mutations.push({
      operation: 'upsert',
      table: 'supplier_debts',
      payload: supplierDebt,
      onConflict: 'id',
      description: `Sync supplier debt for ${supplierName}`,
    });
  }

  await Promise.all([
    upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'purchases', [purchase]),
    upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'purchase_items', purchaseItems),
    supplierDebt
      ? upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'supplier_debts', [supplierDebt])
      : Promise.resolve(),
    upsertCachedRows({ businessId: params.businessId }, 'suppliers', [supplier]),
    enqueueMutations(mutations),
  ]);

  return purchase;
}

export const usePurchaseStore = create<PurchaseState>((set) => ({
  purchases: [],
  isLoading: false,
  isSaving: false,
  error: null,

  fetchPurchases: async (businessId, branchId) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select(`
          *,
          supplier:suppliers(name, phone),
          items:purchase_items(*, product:products(name, unit))
        `)
        .eq('business_id', businessId)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(50);

      throwIfError(error);
      const serverPurchases = (data as Purchase[]) ?? [];
      const cachedPurchases = await readCachedRows<Purchase>({ businessId, branchId }, 'purchases');
      const serverPurchaseIds = new Set(serverPurchases.map((purchase) => purchase.id));
      const purchases = [
        ...serverPurchases,
        ...cachedPurchases.filter((purchase) => !serverPurchaseIds.has(purchase.id)),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      set({ purchases });
      await upsertCachedRows({ businessId, branchId }, 'purchases', purchases);
    } catch (err: any) {
      const purchases = await readCachedRows<Purchase>({ businessId, branchId }, 'purchases');
      if (purchases.length > 0) {
        set({ purchases, error: null });
      } else {
        set({ error: err.message ?? 'Unable to load purchases.' });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  fetchPurchaseById: async (purchaseId) => {
    try {
      return await hydratePurchase(purchaseId);
    } catch (err: any) {
      set({ error: err.message ?? 'Unable to load purchase.' });
      return null;
    }
  },

  recordPurchase: async (params) => {
    set({ isSaving: true, error: null });
    try {
      const purchase = await writePurchaseRecordOffline(params);
      set((state) => ({ purchases: [purchase, ...state.purchases.filter((item) => item.id !== purchase.id)] }));
      return purchase;
    } catch (err: any) {
      console.error('[recordPurchase]', err);
      set({ error: err.message ?? 'Unable to record purchase.' });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  updatePurchase: async (params) => {
    set({ isSaving: true, error: null });
    try {
      const purchase = await writePurchaseRecord(params);
      set((state) => {
        const exists = state.purchases.some((item) => item.id === purchase.id);
        return {
          purchases: exists
            ? state.purchases.map((item) => (item.id === purchase.id ? purchase : item))
            : [purchase, ...state.purchases],
        };
      });
      return purchase;
    } catch (err: any) {
      console.error('[updatePurchase]', err);
      set({ error: err.message ?? 'Unable to update purchase.' });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },
}));
