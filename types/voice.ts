// ============================================================
// RECORD AM - Voice Assistant Types
// ============================================================

import { Customer, PaymentMethod, Product } from '@/types';

export type VoiceActionType =
  | 'RECORD_SALE'
  | 'UPDATE_PRODUCT'
  | 'RECORD_STOCK'
  | 'RECORD_DAMAGE'
  | 'RECORD_PURCHASE'
  | 'RECORD_PAYMENT'
  | 'RECORD_DEBT'
  | 'RECORD_EXPENSE'
  | 'UNKNOWN';

export type ReconciliationMethod =
  | 'restock'
  | 'correction'
  | 'damage'
  | 'return'
  | 'internal_use';

export interface VoiceSaleItem {
  queryName: string;
  matchedProduct?: Product;
  quantity: number;
  unitPrice: number;
  catalogSellingPrice?: number;
  costPrice?: number;
  discountAmount?: number;
  unit: string;
  confidence: number;
  availableStock?: number;
  stockToDeduct?: number;
}

export interface VoiceSaleAction {
  type: 'RECORD_SALE';
  items: VoiceSaleItem[];
  customerName?: string;
  matchedCustomer?: Customer;
  customerPhone?: string;
  paymentMethod: PaymentMethod;
  isCredit?: boolean;
  amountPaid: number;
  amountOwed: number;
  cashAmount?: number;
  transferAmount?: number;
  discountAmount: number;
  discountPercentage?: number;
  notes?: string;
  subtotal: number;
  total: number;
}

export interface VoiceUpdateProductAction {
  type: 'UPDATE_PRODUCT';
  productName: string;
  matchedProduct?: Product;
  productId?: string;
  newSellingPrice?: number;
  oldSellingPrice?: number;
  newCostPrice?: number;
  oldCostPrice?: number;
  costingMethod?: 'average' | 'replace' | 'keep';
  quantityChange?: number;
  targetQuantity?: number;
  currentStock?: number;
  reconciliationMethod: ReconciliationMethod;
  notes?: string;
}

export interface VoiceDamageAction {
  type: 'RECORD_DAMAGE';
  productName: string;
  matchedProduct?: Product;
  productId?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalLoss: number;
  reason: string;
  deductFromProfit: boolean;
  notes?: string;
}

export interface VoicePurchaseItem {
  productId?: string;
  matchedProduct?: Product;
  name: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  unit: string;
}

export interface VoicePurchaseAction {
  type: 'RECORD_PURCHASE';
  supplierName: string;
  items: VoicePurchaseItem[];
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface VoicePaymentAction {
  type: 'RECORD_PAYMENT';
  customerName: string;
  matchedCustomer?: Customer;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

export interface VoiceStockItem {
  queryName: string;
  matchedProduct?: Product;
  quantity: number;
  costPrice?: number;
  sellingPrice?: number;
  unit: string;
  isNewProduct?: boolean;
}

export interface VoiceStockAction {
  type: 'RECORD_STOCK';
  items: VoiceStockItem[];
  supplierName?: string;
  notes?: string;
}

export interface VoiceDebtAction {
  type: 'RECORD_DEBT';
  customerName: string;
  matchedCustomer?: Customer;
  customerPhone?: string;
  amount: number;
  notes: string;
  dueDate?: string;
}

export interface VoiceExpenseAction {
  type: 'RECORD_EXPENSE';
  category: string;
  categoryLabel: string;
  amount: number;
  description: string;
  paymentMethod: PaymentMethod;
  expenseDate: string;
}

export interface VoiceUnknownAction {
  type: 'UNKNOWN';
  rawText: string;
  suggestion?: string;
}

export type VoiceAction =
  | VoiceSaleAction
  | VoiceUpdateProductAction
  | VoiceDamageAction
  | VoicePurchaseAction
  | VoicePaymentAction
  | VoiceStockAction
  | VoiceDebtAction
  | VoiceExpenseAction
  | VoiceUnknownAction;

export type VoiceAssistantState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'preview'
  | 'executing'
  | 'completed'
  | 'error'
  | 'needs_key';
