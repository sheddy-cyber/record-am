import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { canViewFinancialData } from '@/lib/permissions';
import { Product, SaleItem } from '@/types';

export const includeProductCosts = () => canViewFinancialData(useAuthStore.getState().userRole);

export const productsTable = () => (includeProductCosts() ? 'products' : 'staff_products');

export const saleItemsTable = () => (includeProductCosts() ? 'sale_items' : 'staff_sale_items');

export const productSummaryMap = () =>
  new Map(useBusinessStore.getState().products.map((product) => [product.id, product]));

export const attachProductSummary = <T extends { product_id?: string | null }>(
  row: T,
  productsById: Map<string, Product>,
) => {
  if (!row.product_id) return row;
  const product = productsById.get(row.product_id);
  if (!product) return row;
  return {
    ...row,
    product: {
      id: product.id,
      name: product.name,
      unit: product.unit,
      selling_price: product.selling_price,
      sku: product.sku,
      barcode: product.barcode,
      is_service: product.is_service,
    },
  };
};

export const attachProductSummaries = <T extends { product_id?: string | null }>(
  rows: T[],
  productsById?: Map<string, Product>,
) => {
  const map = productsById ?? productSummaryMap();
  return rows.map((row) => attachProductSummary(row, map));
};

export const maskSaleItemCosts = (items: SaleItem[]): SaleItem[] =>
  includeProductCosts() ? items : items.map((item) => ({ ...item, cost_price: 0 }));
