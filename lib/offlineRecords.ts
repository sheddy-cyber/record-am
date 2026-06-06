import {
  CartItem,
  Customer,
  CustomerDebt,
  DebtRepayment,
  Expense,
  PaymentMethod,
  PaymentStatus,
  Product,
  RevenueActivity,
  Sale,
  SaleItem,
  StockMovement,
} from '@/types';
import { useBusinessStore } from '@/store/businessStore';
import { createAltUnitNote, getSaleUnitOption } from '@/lib/records';
import {
  adjustCachedProductInventory,
  createLocalId,
  enqueueMutations,
  nowIso,
  readCachedProducts,
  setCachedProductInventory,
  upsertCachedCustomerDebts,
  upsertCachedExpenses,
  upsertCachedProducts,
  upsertCachedRevenueActivities,
  upsertCachedRows,
} from '@/lib/offlineStore';

const roundAmount = (value: number) => Number(value.toFixed(2));

type CachedSale = Omit<Sale, 'customer'> & {
  customer?: Pick<Customer, 'name' | 'phone'>;
};

type CachedSaleItem = Omit<SaleItem, 'product'> & {
  product?: Pick<Product, 'id' | 'name'>;
};

const stripNestedProduct = (product: Product) => {
  const { category, inventory, ...payload } = product;
  return payload;
};

const patchProductInMemory = (
  productId: string,
  updater: (product: Product) => Product,
) => {
  useBusinessStore.setState((state) => ({
    products: state.products.map((product) =>
      product.id === productId ? updater(product) : product,
    ),
  }));
};

const patchProductInventoryInMemory = (
  productId: string,
  branchId: string,
  quantity: number,
) => {
  const timestamp = nowIso();

  patchProductInMemory(productId, (product) => {
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

    return { ...product, inventory: nextInventory, updated_at: timestamp };
  });
};

const getCachedOrMemoryStock = async (
  businessId: string,
  branchId: string,
  productId: string,
) => {
  const memoryProduct = useBusinessStore.getState().products.find((product) => product.id === productId);
  const cachedProducts = memoryProduct ? [] : await readCachedProducts(businessId);
  const product = memoryProduct ?? cachedProducts.find((item) => item.id === productId);
  return product?.inventory?.find((item) => item.branch_id === branchId)?.quantity ?? 0;
};

export async function recordSaleOffline(params: {
  businessId: string;
  branchId: string;
  userId: string;
  cart: CartItem[];
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  paymentStatus: PaymentStatus;
}) {
  const timestamp = nowIso();
  const saleId = createLocalId();
  const customerName = params.customerName.trim();
  const customerPhone = params.customerPhone.trim();
  const customerId = customerName ? createLocalId() : undefined;
  const saleNumber = `OFF-${Date.now().toString(36).toUpperCase()}`;

  const customer: Customer | null = customerId
    ? {
        id: customerId,
        business_id: params.businessId,
        name: customerName,
        phone: customerPhone || undefined,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp,
      }
    : null;

  const sale: CachedSale = {
    id: saleId,
    business_id: params.businessId,
    branch_id: params.branchId,
    customer_id: customerId,
    sale_number: saleNumber,
    subtotal: roundAmount(params.subtotal),
    discount_amount: roundAmount(params.discountAmount),
    tax_amount: 0,
    total_amount: roundAmount(params.totalAmount),
    amount_paid: roundAmount(params.amountPaid),
    amount_owed: roundAmount(params.amountOwed),
    payment_status: params.paymentStatus,
    payment_method: params.paymentMethod,
    notes: params.notes || undefined,
    sold_by: params.userId,
    created_at: timestamp,
    updated_at: timestamp,
    customer: customer
      ? { name: customer.name, phone: customer.phone }
      : undefined,
  };

  const saleItems: CachedSaleItem[] = [];
  const stockMovements: StockMovement[] = [];
  const mutations: Parameters<typeof enqueueMutations>[0] = [];

  if (customer) {
    mutations.push({
      operation: 'upsert',
      table: 'customers',
      payload: customer,
      onConflict: 'id',
      description: `Sync customer ${customer.name}`,
    });
  }

  mutations.push({
    operation: 'upsert',
    table: 'sales',
    payload: { ...sale, customer: undefined },
    onConflict: 'id',
    description: `Sync sale ${sale.sale_number}`,
  });

  for (const item of params.cart) {
    const saleItem: CachedSaleItem = {
      id: createLocalId(),
      sale_id: saleId,
      product_id: item.product.id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      cost_price: roundAmount(
        item.product.cost_price *
          getSaleUnitOption(item.product, item.sale_unit, item.bundle_size).stockFactor,
      ),
      discount_amount: item.discount_amount,
      total_price: item.total_price,
      created_at: timestamp,
      product: { id: item.product.id, name: item.product.name },
    };

    saleItems.push(saleItem);
    mutations.push({
      operation: 'upsert',
      table: 'sale_items',
      payload: { ...saleItem, product: undefined },
      onConflict: 'id',
      description: `Sync sale item ${item.product.name}`,
    });

    if (!item.product.is_service) {
      const currentStock = await getCachedOrMemoryStock(params.businessId, params.branchId, item.product.id);
      const nextStock = Math.max(0, roundAmount(currentStock - item.stock_quantity));
      await adjustCachedProductInventory(params.businessId, params.branchId, item.product.id, -item.stock_quantity);
      patchProductInventoryInMemory(item.product.id, params.branchId, nextStock);

      const stockMovement: StockMovement = {
        id: createLocalId(),
        business_id: params.businessId,
        branch_id: params.branchId,
        product_id: item.product.id,
        type: 'stock_out',
        quantity: item.quantity,
        reference: sale.sale_number,
        notes: item.sale_unit !== item.product.unit ? createAltUnitNote(item.sale_unit) : undefined,
        performed_by: params.userId,
        created_at: timestamp,
      };
      stockMovements.push(stockMovement);

      mutations.push(
        {
          operation: 'inventory_adjust',
          payload: {
            product_id: item.product.id,
            branch_id: params.branchId,
            delta: -item.stock_quantity,
          },
          description: `Adjust stock for ${item.product.name}`,
        },
        {
          operation: 'upsert',
          table: 'stock_movements',
          payload: stockMovement,
          onConflict: 'id',
          description: `Sync stock movement for ${item.product.name}`,
        },
      );
    }
  }

  const debt: CustomerDebt | null =
    params.amountOwed > 0 && customerName
      ? {
          id: createLocalId(),
          business_id: params.businessId,
          branch_id: params.branchId,
          customer_id: customerId,
          sale_id: saleId,
          customer_name: customerName,
          customer_phone: customerPhone || undefined,
          original_amount: roundAmount(params.totalAmount),
          amount_paid: roundAmount(params.amountPaid),
          balance: roundAmount(params.amountOwed),
          status: params.paymentStatus === 'partial' ? 'partial' : 'outstanding',
          notes: params.notes || undefined,
          created_at: timestamp,
          updated_at: timestamp,
        }
      : null;

  if (debt) {
    mutations.push({
      operation: 'upsert',
      table: 'customer_debts',
      payload: debt,
      onConflict: 'id',
      description: `Sync debt for ${debt.customer_name}`,
    });
  }

  const activity: RevenueActivity = {
    id: sale.id,
    kind: 'sale',
    customer_name: customerName || 'Walk-in Customer',
    customer_phone: customerPhone || undefined,
    reference: sale.sale_number,
    total_amount: sale.total_amount,
    amount_paid: sale.amount_paid,
    amount_owed: sale.amount_owed,
    payment_status: sale.payment_status,
    payment_method: sale.payment_method,
    notes: sale.notes,
    created_at: sale.created_at,
    sale_id: sale.id,
  };

  await Promise.all([
    upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'sales', [sale]),
    upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'sale_items', saleItems),
    upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'stock_movements', stockMovements),
    debt ? upsertCachedCustomerDebts(params.businessId, params.branchId, [debt]) : Promise.resolve(),
    upsertCachedRevenueActivities(params.businessId, params.branchId, [activity]),
  ]);

  await enqueueMutations(mutations);
  return { sale, activity, debt };
}

export async function recordExpenseOffline(params: {
  businessId: string;
  branchId: string;
  userId?: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  expenseDate: string;
}) {
  const timestamp = nowIso();
  const expense: Expense = {
    id: createLocalId(),
    business_id: params.businessId,
    branch_id: params.branchId,
    category: params.category,
    description: params.description,
    amount: roundAmount(params.amount),
    payment_method: params.paymentMethod,
    expense_date: params.expenseDate,
    recorded_by: params.userId,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await Promise.all([
    upsertCachedExpenses(params.businessId, params.branchId, [expense]),
    enqueueMutations([
      {
        operation: 'upsert',
        table: 'expenses',
        payload: expense,
        onConflict: 'id',
        description: `Sync expense ${expense.description}`,
      },
    ]),
  ]);

  return expense;
}

export async function recordDebtOffline(params: {
  businessId: string;
  branchId: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  dueDate?: string;
  notes?: string;
}) {
  const timestamp = nowIso();
  const debt: CustomerDebt = {
    id: createLocalId(),
    business_id: params.businessId,
    branch_id: params.branchId,
    customer_name: params.customerName,
    customer_phone: params.customerPhone || undefined,
    original_amount: roundAmount(params.amount),
    amount_paid: 0,
    balance: roundAmount(params.amount),
    due_date: params.dueDate || undefined,
    status: 'outstanding',
    notes: params.notes || undefined,
    created_at: timestamp,
    updated_at: timestamp,
  };

  await Promise.all([
    upsertCachedCustomerDebts(params.businessId, params.branchId, [debt]),
    enqueueMutations([
      {
        operation: 'upsert',
        table: 'customer_debts',
        payload: debt,
        onConflict: 'id',
        description: `Sync debt for ${debt.customer_name}`,
      },
    ]),
  ]);

  return debt;
}

export async function recordRepaymentOffline(params: {
  businessId: string;
  branchId: string;
  userId: string;
  debt: CustomerDebt;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}) {
  const timestamp = nowIso();
  const amount = roundAmount(params.amount);
  const newAmountPaid = roundAmount(params.debt.amount_paid + amount);
  const newBalance = Math.max(0, roundAmount(params.debt.balance - amount));
  const newStatus = newBalance <= 0 ? 'settled' : 'partial';

  const repayment: DebtRepayment = {
    id: createLocalId(),
    debt_id: params.debt.id,
    amount,
    payment_method: params.paymentMethod,
    notes: params.notes || undefined,
    recorded_by: params.userId,
    created_at: timestamp,
  };

  const debt: CustomerDebt = {
    ...params.debt,
    amount_paid: newAmountPaid,
    balance: newBalance,
    status: newStatus,
    updated_at: timestamp,
  };

  const activity: RevenueActivity = {
    id: repayment.id,
    kind: 'debt_repayment',
    customer_name: debt.customer_name,
    customer_phone: debt.customer_phone,
    reference: debt.sale_id ? 'Debt Settlement' : 'Debt Collection',
    total_amount: repayment.amount,
    amount_paid: repayment.amount,
    amount_owed: debt.balance,
    payment_status: debt.balance <= 0 ? 'paid' : 'partial',
    payment_method: repayment.payment_method,
    notes: repayment.notes,
    created_at: repayment.created_at,
    sale_id: debt.sale_id,
    debt_id: debt.id,
  };

  const mutations: Parameters<typeof enqueueMutations>[0] = [
    {
      operation: 'upsert',
      table: 'debt_repayments',
      payload: repayment,
      onConflict: 'id',
      description: `Sync payment for ${debt.customer_name}`,
    },
    {
      operation: 'update',
      table: 'customer_debts',
      payload: {
        amount_paid: debt.amount_paid,
        balance: debt.balance,
        status: debt.status,
        sale_id: debt.sale_id ?? null,
        updated_at: timestamp,
      },
      match: { id: debt.id },
      conflictPolicy: 'client-wins',
      description: `Sync debt balance for ${debt.customer_name}`,
    },
  ];

  if (debt.sale_id) {
    mutations.push({
      operation: 'sale_payment_recalculate',
      payload: {
        sale_id: debt.sale_id,
        debt_id: debt.id,
        payment_method: params.paymentMethod,
      },
      description: `Sync linked sale payment for ${debt.customer_name}`,
    });
  }

  await Promise.all([
    upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'debt_repayments', [repayment]),
    upsertCachedCustomerDebts(params.businessId, params.branchId, [debt]),
    upsertCachedRevenueActivities(params.businessId, params.branchId, [activity]),
    enqueueMutations(mutations),
  ]);

  return { repayment, debt, activity };
}

export async function recordInventorySnapshotOffline(params: {
  businessId: string;
  branchId: string;
  productId: string;
  quantity: number;
  movement?: Omit<StockMovement, 'id' | 'business_id' | 'branch_id' | 'product_id' | 'created_at'>;
}) {
  const timestamp = nowIso();
  const nextQuantity = Math.max(0, roundAmount(params.quantity));
  const stockMovement: StockMovement | null = params.movement
    ? {
        id: createLocalId(),
        business_id: params.businessId,
        branch_id: params.branchId,
        product_id: params.productId,
        created_at: timestamp,
        ...params.movement,
      }
    : null;

  await setCachedProductInventory(params.businessId, params.branchId, params.productId, nextQuantity);
  patchProductInventoryInMemory(params.productId, params.branchId, nextQuantity);

  const mutations: Parameters<typeof enqueueMutations>[0] = [
    {
      operation: 'upsert',
      table: 'inventory',
      payload: {
        product_id: params.productId,
        branch_id: params.branchId,
        quantity: nextQuantity,
        last_updated: timestamp,
      },
      onConflict: 'product_id,branch_id',
      description: 'Sync inventory snapshot',
    },
  ];

  if (stockMovement) {
    mutations.push({
      operation: 'upsert',
      table: 'stock_movements',
      payload: stockMovement,
      onConflict: 'id',
      description: 'Sync stock movement',
    });
  }

  await Promise.all([
    stockMovement
      ? upsertCachedRows({ businessId: params.businessId, branchId: params.branchId }, 'stock_movements', [stockMovement])
      : Promise.resolve(),
    enqueueMutations(mutations),
  ]);
}

export async function updateProductAndInventoryOffline(params: {
  businessId: string;
  branchId?: string;
  product: Product;
  productPatch: Partial<Product>;
  nextQuantity?: number;
  movement?: Omit<StockMovement, 'id' | 'business_id' | 'branch_id' | 'product_id' | 'created_at'>;
}) {
  const timestamp = nowIso();
  const productPatch = {
    ...params.productPatch,
    updated_at: timestamp,
  };

  const nextProduct: Product = {
    ...params.product,
    ...productPatch,
  };

  useBusinessStore.setState((state) => ({
    products: state.products.map((product) =>
      product.id === params.product.id ? nextProduct : product,
    ),
  }));
  await upsertCachedProducts(params.businessId, [nextProduct]);

  const mutations: Parameters<typeof enqueueMutations>[0] = [
    {
      operation: 'update',
      table: 'products',
      payload: productPatch,
      match: { id: params.product.id },
      conflictPolicy: 'server-wins-if-newer',
      description: `Sync product ${nextProduct.name}`,
    },
  ];

  if (params.branchId && params.nextQuantity !== undefined) {
    const nextQuantity = Math.max(0, roundAmount(params.nextQuantity));
    await setCachedProductInventory(params.businessId, params.branchId, params.product.id, nextQuantity);
    patchProductInventoryInMemory(params.product.id, params.branchId, nextQuantity);

    mutations.push({
      operation: 'upsert',
      table: 'inventory',
      payload: {
        product_id: params.product.id,
        branch_id: params.branchId,
        quantity: nextQuantity,
        last_updated: timestamp,
      },
      onConflict: 'product_id,branch_id',
      description: `Sync inventory for ${nextProduct.name}`,
    });

    if (params.movement) {
      const stockMovement: StockMovement = {
        id: createLocalId(),
        business_id: params.businessId,
        branch_id: params.branchId,
        product_id: params.product.id,
        created_at: timestamp,
        ...params.movement,
      };

      await upsertCachedRows(
        { businessId: params.businessId, branchId: params.branchId },
        'stock_movements',
        [stockMovement],
      );

      mutations.push({
        operation: 'upsert',
        table: 'stock_movements',
        payload: stockMovement,
        onConflict: 'id',
        description: `Sync stock movement for ${nextProduct.name}`,
      });
    }
  }

  await enqueueMutations(mutations);
}

export function sanitizeProductForWrite(product: Product) {
  return stripNestedProduct(product);
}
