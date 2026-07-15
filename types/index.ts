// ============================================================
// RECORD AM - TypeScript Types
// ============================================================

export type BusinessType =
  | 'provisions'
  | 'pharmacy'
  | 'cyber_cafe'
  | 'salon'
  | 'fashion'
  | 'electronics'
  | 'food'
  | 'hardware'
  | 'cosmetics'
  | 'stationery'
  | 'other';

export type UserRole = 'owner' | 'manager' | 'cashier' | 'auditor';

export type PaymentMethod = 'cash' | 'transfer' | 'pos' | 'mobile_money' | 'mixed';

export type PaymentStatus = 'paid' | 'partial' | 'credit';

export type StockMovementType =
  | 'stock_in'
  | 'stock_out'
  | 'adjustment'
  | 'transfer'
  | 'damage'
  | 'wastage';

export type DebtStatus = 'outstanding' | 'partial' | 'settled';

// ============================================================
// CORE ENTITIES
// ============================================================

export interface Business {
  id: string;
  name: string;
  type: BusinessType;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  currency_symbol: string;
  tax_rate: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  business_id: string;
  name: string;
  address?: string;
  phone?: string;
  is_main: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  pin_hash?: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessMember {
  id: string;
  business_id: string;
  user_id: string;
  branch_id?: string;
  role: UserRole;
  is_active: boolean;
  invited_at: string;
  joined_at?: string;
}

export interface Category {
  id: string;
  business_id: string;
  name: string;
  color: string;
  icon?: string;
  created_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id?: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  image_url?: string;
  is_service: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category;
  inventory?: Inventory[];
}

export interface Inventory {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  last_updated: string;
}

export interface StockMovement {
  id: string;
  business_id: string;
  branch_id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  reference?: string;
  notes?: string;
  performed_by?: string;
  created_at: string;
  // joined
  product?: Product;
}

export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  business_id: string;
  branch_id: string;
  customer_id?: string;
  sale_number: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_owed: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  notes?: string;
  sold_by?: string;
  created_at: string;
  updated_at: string;
  // joined
  customer?: Customer;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  cost_price?: number;
  discount_amount: number;
  total_price: number;
  created_at: string;
  // joined
  product?: Product;
}

export interface Expense {
  id: string;
  business_id: string;
  branch_id: string;
  category: string;
  description: string;
  amount: number;
  payment_method: PaymentMethod;
  receipt_url?: string;
  expense_date: string;
  recorded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: string;
  business_id: string;
  branch_id: string;
  supplier_id?: string;
  purchase_number: string;
  total_amount: number;
  discount_amount: number;
  amount_paid: number;
  amount_owed: number;
  payment_status: PaymentStatus;
  notes?: string;
  purchase_date: string;
  recorded_by?: string;
  created_at: string;
  updated_at: string;
  // joined
  supplier?: Supplier;
  items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
  product?: Product;
}

export interface CustomerDebt {
  id: string;
  business_id: string;
  branch_id: string;
  customer_id?: string;
  sale_id?: string;
  customer_name: string;
  customer_phone?: string;
  original_amount: number;
  amount_paid: number;
  balance: number;
  due_date?: string;
  status: DebtStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
  // joined
  repayments?: DebtRepayment[];
}

export interface DebtRepayment {
  id: string;
  debt_id: string;
  amount: number;
  payment_method: PaymentMethod;
  notes?: string;
  recorded_by?: string;
  created_at: string;
}

export interface SupplierDebt {
  id: string;
  business_id: string;
  supplier_id?: string;
  purchase_id?: string;
  supplier_name: string;
  original_amount: number;
  amount_paid: number;
  balance: number;
  due_date?: string;
  status: DebtStatus;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DailySummary {
  id: string;
  business_id: string;
  branch_id: string;
  summary_date: string;
  total_sales: number;
  total_expenses: number;
  total_purchases: number;
  gross_profit: number;
  net_profit: number;
  cash_in_hand_expected: number;
  cash_in_hand_actual?: number;
  discrepancy: number;
  notes?: string;
  closed_by?: string;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  business_id: string;
  user_id?: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// CART (local state only, not stored in DB)
// ============================================================
export interface CartItem {
  product: Product;
  quantity: number;
  stock_quantity: number;
  sale_unit: string;
  unit_price: number;
  discount_amount: number;
  total_price: number;
  bundle_size?: number;
  base_sale_unit?: string;
  uses_custom_bundle?: boolean;
}

export interface RevenueActivity {
  id: string;
  kind: 'sale' | 'debt_repayment';
  customer_name: string;
  customer_phone?: string;
  reference: string;
  items_summary?: string;
  total_amount: number;
  amount_paid: number;
  amount_owed: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  notes?: string;
  created_at: string;
  sale_id?: string;
  debt_id?: string;
  items?: {
    quantity: number;
    total_price: number;
    product_name: string;
  }[];
}

// ============================================================
// ANALYTICS
// ============================================================
export interface DashboardStats {
  today_sales: number;
  today_profit: number;
  today_expenses: number;
  total_products: number;
  low_stock_count: number;
  out_of_stock_count: number;
  outstanding_debts: number;
  total_customers: number;
}

export interface StockAlertSummary {
  lowStockProducts: Product[];
  outOfStockProducts: Product[];
}

export interface SalesTrend {
  date: string;
  total: number;
  profit: number;
}
