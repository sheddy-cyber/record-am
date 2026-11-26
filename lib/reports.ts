import { Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { cleanSaleNotes, getPaymentBreakdown, isDebtForgiven } from '@/lib/records';
import { CURRENCY_SYMBOL } from '@/constants';
import { Branch, Business, Customer, Sale, Supplier } from '@/types';

const methodLabel = (method: string) =>
  ({ cash: 'Cash', transfer: 'Bank transfer', pos: 'POS', mobile_money: 'Mobile money', mixed: 'Split payment', other: 'Other' } as Record<string, string>)[method] ??
  method.replace('_', ' ');

// Shared look for every printed or exported document: Geist (the device's
// sans supplies the naira sign, which the web Geist lacks),
// paper-white headers (no ink-heavy bands), sentence-case labels.
const DOC_THEME = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important; -webkit-font-smoothing: antialiased; }
  * { text-transform: none !important; }
  .header { background: #FFFFFF !important; border-bottom: 1px solid #E6E2D9 !important; border-radius: 0 !important; box-shadow: none !important; }
  .header, .header * { color: #1A1917 !important; }
  .header p, .header small, .header [class*="sub"], .header [class*="meta"], .header [class*="date"], .header [class*="period"], .header [class*="lbl"] { color: #6B675F !important; }
  h1, .biz-name, .header .title { font-family: 'Geist', -apple-system, 'Segoe UI', Roboto, sans-serif !important; font-weight: 600 !important; letter-spacing: -0.5px !important; }
  table { font-variant-numeric: tabular-nums; }
  th, thead td { background: #F5F3EE !important; color: #57534C !important; font-weight: 600 !important; border-color: #E6E2D9 !important; }
  .report-badge { background: #EDEAE3 !important; color: #1A1917 !important; border-color: #E6E2D9 !important; }
</style>`;

export function generateReceiptHTML(sale: Sale, business: Business, branch: Branch): string {
  const currency = business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) =>
    `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const isRepayment = Boolean((sale as any).isRepayment);
  const isForgiven = !isRepayment && isDebtForgiven(sale.payment_status, sale.notes);
  const hasHigherPayment = !isRepayment && sale.amount_paid > sale.total_amount;
  const effectiveTotal = hasHigherPayment ? sale.amount_paid : sale.total_amount;
  const effectivePaid = hasHigherPayment ? sale.amount_paid : (sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount);

  const items = sale.items ?? [];
  const totalBaseAmount = items.reduce((sum: number, it: any) => sum + (Number(it.total_price) || 0), 0) || sale.total_amount || 1;
  let remainingCalculatedTotal = hasHigherPayment ? effectiveTotal : 0;

  const itemRows = items
    .map((item, index) => {
      let itemTotalPrice = item.total_price;
      let itemUnitPrice = item.unit_price;

      if (hasHigherPayment) {
        if (items.length === 1) {
          itemTotalPrice = effectiveTotal;
        } else if (index === items.length - 1) {
          itemTotalPrice = remainingCalculatedTotal;
        } else {
          itemTotalPrice = Number(((Number(item.total_price) / totalBaseAmount) * effectiveTotal).toFixed(2));
          remainingCalculatedTotal = Number((remainingCalculatedTotal - itemTotalPrice).toFixed(2));
        }
        const qty = Number(item.quantity) || 1;
        itemUnitPrice = Number((itemTotalPrice / qty).toFixed(2));
      }

      return `
      <tr class="item-row">
        <td>
          <div class="item-name">${(item.product as any)?.name ?? (item as any).product_name ?? 'Item'}</div>
          <div class="item-sub">
            ${item.quantity} × ${formatMoney(itemUnitPrice)} each
            ${item.discount_amount > 0 && !hasHigherPayment ? ` (-${formatMoney(item.discount_amount)})` : ''}
          </div>
        </td>
        <td class="item-total">
          ${formatMoney(itemTotalPrice)}
        </td>
      </tr>`;
    })
    .join('');

  const statusColor =
    isRepayment
      ? '#1A1917'
      : isForgiven
        ? '#1A1917'
        : (sale.payment_status === 'paid' || hasHigherPayment)
          ? '#2E7D4F'
          : sale.payment_status === 'partial'
            ? '#B7791F'
            : '#C2412D';

  const statusLabel =
    isRepayment
      ? 'Debt payment'
      : isForgiven
        ? 'Debt forgiven'
        : (sale.payment_status === 'paid' || hasHigherPayment)
          ? 'Paid in full'
          : sale.payment_status === 'partial'
            ? 'Part paid'
            : 'On credit';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${sale.sale_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #EDEAE3;
    display: flex;
    justify-content: center;
    padding: 24px 16px;
    color: #1A1917;
    -webkit-font-smoothing: antialiased;
  }
  .receipt {
    background: #ffffff;
    width: 100%;
    max-width: 400px;
    border-radius: 16px;
    border: 1px solid #E6E2D9;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(26, 25, 23, 0.08);
  }
  .header {
    background: #1A1917;
    padding: 24px 20px 20px;
    text-align: center;
    color: #ffffff;
  }
  .header .biz-name {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.3px;
    margin-bottom: 4px;
  }
  .header .biz-sub {
    font-size: 11.5px;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.4;
  }
  .receipt-ribbon {
    background: #F5F3EE;
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #E6E2D9;
  }
  .receipt-lbl {
    font-size: 9.5px;
    font-weight: 700;
    color: #8A857B;
    letter-spacing: 0.6px;
  }
  .receipt-num {
    font-size: 13px;
    font-weight: 700;
    color: #1A1917;
    margin-top: 1px;
  }
  .receipt-date {
    font-size: 10.5px;
    color: #8A857B;
    margin-top: 2px;
  }
  .status-pill {
    display: inline-flex;
    align-items: center;
    background: ${statusColor};
    color: #ffffff;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
  }
  .customer-card {
    background: #F5F3EE;
    border: 1px solid #E6E2D9;
    border-radius: 10px;
    padding: 10px 14px;
    margin: 14px 20px 0;
  }
  .customer-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #8A857B;
    letter-spacing: 0.6px;
  }
  .customer-name {
    font-size: 13px;
    font-weight: 700;
    color: #1A1917;
    margin-top: 2px;
  }
  .customer-phone {
    font-size: 11px;
    color: #57534C;
    margin-top: 1px;
  }
  .section {
    padding: 14px 20px;
  }
  .table-header {
    display: flex;
    justify-content: space-between;
    padding-bottom: 6px;
    border-bottom: 1px solid #E6E2D9;
    font-size: 9.5px;
    font-weight: 700;
    color: #8A857B;
    letter-spacing: 0.8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  .item-row td {
    padding: 9px 0;
    border-bottom: 1px solid #EDEAE3;
  }
  .item-name {
    font-size: 13px;
    font-weight: 600;
    color: #1A1917;
  }
  .item-sub {
    font-size: 11px;
    color: #8A857B;
    margin-top: 2px;
  }
  .item-total {
    text-align: right;
    font-size: 13.5px;
    font-weight: 700;
    color: #1A1917;
    vertical-align: top;
  }
  .perforation {
    border-top: 1px dashed #D3CEC2;
    margin: 4px 20px;
  }
  .summary-section {
    padding: 14px 20px 16px;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 12.5px;
    color: #57534C;
  }
  .total-box {
    background: #F5F3EE;
    border: 1px solid #E6E2D9;
    border-radius: 10px;
    padding: 10px 14px;
    margin: 8px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total-box .lbl {
    font-size: 14px;
    font-weight: 700;
    color: #1A1917;
  }
  .total-box .val {
    font-size: 19px;
    font-weight: 800;
    color: #1A1917;
  }
  .paid-val {
    color: #2E7D4F;
    font-weight: 700;
  }
  .owed-box {
    background: #F8E5E1;
    border: 1px solid #EECAC2;
    border-radius: 8px;
    padding: 8px 12px;
    margin: 6px 0;
    display: flex;
    justify-content: space-between;
    color: #C2412D;
    font-weight: 700;
    font-size: 12.5px;
  }
  .payment-method-row {
    display: flex;
    justify-content: space-between;
    padding-top: 8px;
    margin-top: 4px;
    border-top: 1px solid #EDEAE3;
    font-size: 11.5px;
    color: #8A857B;
  }
  .payment-method-val {
    font-weight: 700;
    color: #1A1917;
  }
  .footer {
    background: #F5F3EE;
    border-top: 1px solid #E6E2D9;
    padding: 18px 20px;
    text-align: center;
  }
  .footer .thanks {
    font-size: 12px;
    font-weight: 700;
    color: #1A1917;
  }
  .footer .note {
    background: #ffffff;
    border: 1px solid #E6E2D9;
    border-radius: 6px;
    padding: 6px 12px;
    display: inline-block;
    font-size: 11px;
    font-style: italic;
    color: #57534C;
    margin-top: 8px;
    max-width: 90%;
  }
  .barcode {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 2px;
    height: 24px;
    margin: 14px auto 4px;
  }
  .bar {
    height: 24px;
    background: #1A1917;
  }
  .barcode-num {
    font-size: 9.5px;
    color: #8A857B;
    letter-spacing: 2px;
  }
  .powered {
    font-size: 9.5px;
    font-weight: 700;
    color: #8A857B;
    letter-spacing: 1px;
    margin-top: 12px;
  }
</style>
${DOC_THEME}</head>
<body>
<div class="receipt">
  <div class="header">
    ${business.logo_url ? `<img src="${business.logo_url.replace(/"/g, '&quot;')}" alt="${business.name.replace(/"/g, '&quot;')}" style="width:48px;height:48px;border-radius:24px;object-fit:cover;margin-bottom:8px;border:1.5px solid rgba(255,255,255,0.28);" />` : ''}
    <div class="biz-name">${business.name}</div>
    <div class="biz-sub">${branch.name}${business.address ? ' · ' + business.address : ''}${business.phone ? ' · ' + business.phone : ''}</div>
  </div>

  <div class="receipt-ribbon">
    <div>
      <div class="receipt-lbl">Receipt</div>
      <div class="receipt-num">${sale.sale_number}</div>
      <div class="receipt-date">${format(new Date(sale.created_at), 'MMM d, yyyy · h:mm a')}</div>
    </div>
    <div class="status-pill">
      <span>${statusLabel}</span>
    </div>
  </div>

  ${((sale.customer as any)?.name || sale.amount_owed > 0) ? `
  <div class="customer-card">
    <div class="customer-lbl">Customer</div>
    <div class="customer-name">${(sale.customer as any)?.name ?? 'Walk-in Customer'}</div>
    ${(sale.customer as any)?.phone ? `<div class="customer-phone">${(sale.customer as any).phone}</div>` : ''}
  </div>` : ''}

  <div class="section">
    <div class="table-header">
      <span>Item</span>
      <span>Amount</span>
    </div>
    <table>${itemRows}</table>
  </div>

  <div class="perforation"></div>

  <div class="summary-section">
    ${sale.discount_amount > 0 && !hasHigherPayment ? `
    <div class="totals-row"><span>Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div>
    <div class="totals-row" style="color:#C2412D;"><span>Discount</span><span>- ${formatMoney(sale.discount_amount)}</span></div>` : ''}
    ${sale.tax_amount > 0 ? `<div class="totals-row"><span>Tax</span><span>${formatMoney(sale.tax_amount)}</span></div>` : ''}
    
    <div class="total-box">
      <span class="lbl">Total</span>
      <span class="val">${formatMoney(effectiveTotal)}</span>
    </div>
    
    <div class="totals-row">
      <span>Amount Paid</span>
      <span class="paid-val">${formatMoney(effectivePaid)}</span>
    </div>

    ${(!hasHigherPayment && !isForgiven && sale.amount_owed > 0) ? `
    <div class="owed-box">
      <span>Balance Owed</span>
      <span>${formatMoney(sale.amount_owed)}</span>
    </div>` : isForgiven ? `
    <div class="owed-box" style="background:#E3EBF3;border-color:#C9D7E6;color:#1A1917;">
      <span>Debt Status</span>
      <span>FORGIVEN (₦0 DUE)</span>
    </div>` : ''}

    <div class="payment-method-row">
      <span>Payment Method</span>
      <span class="payment-method-val">${methodLabel(sale.payment_method)}${sale.bank_name ? ` (${sale.bank_name})` : ''}</span>
    </div>

    ${sale.payment_method === 'mixed' ? `
    <div class="totals-row" style="font-size:11px;color:#6B675F;padding-left:12px;">
      <span>• Cash</span><span>${formatMoney(getPaymentBreakdown(sale).cash)}</span>
    </div>
    <div class="totals-row" style="font-size:11px;color:#6B675F;padding-left:12px;">
      <span>• Transfer${sale.bank_name ? ` (${sale.bank_name})` : ''}</span><span>${formatMoney(getPaymentBreakdown(sale).transfer)}</span>
    </div>` : ''}
  </div>

  <div class="footer">
    <div class="thanks">Thank you for your business</div>
    ${cleanSaleNotes(sale.notes) ? `<div class="note">"${cleanSaleNotes(sale.notes)}"</div>` : ''}
    <div class="powered">Recorded with Record Am</div>
  </div>
</div>
</body>
</html>`;
}

export interface DailyReportData {
  date: string;
  business: Business;
  branch: Branch;
  totalSales: number;
  totalDiscounts?: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
  totalTransactions: number;
  cashExpected: number;
  cashActual?: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  salesByMethod: { method: string; amount: number }[];
  isClosed: boolean;
}

export function generateDailyReportHTML(data: DailyReportData): string {
  const currency = data.business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) => `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const profitColor = data.netProfit >= 0 ? '#2E7D4F' : '#C2412D';
  const discrepancy = data.cashActual !== undefined ? data.cashActual - data.cashExpected : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Report - ${format(new Date(data.date), 'MMMM d, yyyy')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #F5F3EE; padding: 20px; }
  .report { background: #FFFFFF; max-width: 600px; margin: 0 auto; border: 1px solid #E6E2D9; overflow: hidden; }
  .header { background: #1A1917; padding: 28px 28px 24px; }
  .header h1 { font-size: 20px; font-weight: 800; color: #FFFFFF; margin-bottom: 4px; }
  .header p { font-size: 13px; color: rgba(255,253,248,0.65); }
  .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 20px; }
  .metric { background: #F5F3EE; border: 1px solid #E6E2D9; padding: 14px; }
  .metric .label { font-size: 11px; color: #8A857B; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric .value { font-size: 20px; font-weight: 800; color: #1A1917; }
  .section { padding: 0 20px 20px; }
  .section h2 { font-size: 13px; font-weight: 700; color: #57534C; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; border-top: 1px solid #EDEAE3; padding-top: 16px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #EEEBE4; font-size: 14px; color: #57534C; }
  .row .val { font-weight: 700; color: #1A1917; }
  .cash-box { background: ${data.cashActual !== undefined ? (Math.abs(discrepancy) < 1 ? '#E6F0E9' : discrepancy > 0 ? '#E3EBF3' : '#F8E5E1') : '#F5F3EE'}; border: 1px solid #E6E2D9; padding: 16px; margin: 0 20px 20px; }
  .footer { text-align: center; padding: 16px; border-top: 1px dashed #E6E2D9; }
  .footer p { font-size: 12px; color: #8A857B; }
</style>
${DOC_THEME}</head>
<body>
<div class="report">
  <div class="header">
    <h1>${data.business.name}</h1>
    <p>${data.branch.name} - Daily Report - ${format(new Date(data.date), 'EEEE, MMMM d, yyyy')}</p>
    <p style="margin-top:8px;color:${data.isClosed ? '#E6F0E9' : '#F6EDDA'};font-weight:700;font-size:13px;">
      ${data.isClosed ? 'Day Closed & Balanced' : 'Day Still Open'}
    </p>
  </div>

  <div class="metrics">
    <div class="metric"><div class="label">Total Revenue</div><div class="value" style="color:#1A1917;">${formatMoney(data.totalSales)}</div></div>
    <div class="metric"><div class="label">Net Profit</div><div class="value" style="color:${profitColor};">${formatMoney(data.netProfit)}</div></div>
    <div class="metric"><div class="label">Total Expenses</div><div class="value" style="color:#C2412D;">${formatMoney(data.totalExpenses)}</div></div>
    <div class="metric"><div class="label">Discounts Given</div><div class="value" style="color:#B7791F;">${formatMoney(data.totalDiscounts ?? 0)}</div></div>
  </div>

  <div class="section">
    <h2>Sales by Payment Method</h2>
    ${data.salesByMethod.map((method) => `<div class="row"><span>${methodLabel(method.method)}</span><span class="val">${formatMoney(method.amount)}</span></div>`).join('') || '<p style="color:#8A857B;font-size:13px;">No sales</p>'}
  </div>

  ${data.topProducts.length > 0 ? `
  <div class="section">
    <h2>Top Products</h2>
    ${data.topProducts.map((product, index) => `
    <div class="row">
      <span>${index + 1}. ${product.name} <span style="color:#8A857B;font-size:12px;">(x${product.qty})</span></span>
      <span class="val">${formatMoney(product.revenue)}</span>
    </div>`).join('')}
  </div>` : ''}

  <div class="cash-box">
    <div style="font-size:13px;font-weight:700;color:#1A1917;margin-bottom:10px;">Cash Reconciliation</div>
    <div class="row" style="border:none;"><span>Expected Cash</span><span class="val">${formatMoney(data.cashExpected)}</span></div>
    ${data.cashActual !== undefined ? `
    <div class="row" style="border:none;"><span>Actual Cash Counted</span><span class="val">${formatMoney(data.cashActual)}</span></div>
    <div class="row" style="border:none;font-weight:700;color:${Math.abs(discrepancy) < 1 ? '#2E7D4F' : discrepancy > 0 ? '#3B6B9A' : '#C2412D'};">
      <span>${Math.abs(discrepancy) < 1 ? 'Balanced' : discrepancy > 0 ? 'Surplus' : 'Shortage'}</span>
      <span>${discrepancy >= 0 ? '+' : ''}${formatMoney(discrepancy)}</span>
    </div>` : '<div style="font-size:12px;color:#8A857B;">Day not yet closed</div>'}
  </div>

  <div class="footer">
    <p>Generated by Record Am - ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
    <p style="margin-top:4px;">${data.business.name} - ${data.branch.name}</p>
  </div>
</div>
</body>
</html>`;
}

export async function shareReceiptViaWhatsApp(sale: Sale, business: Business, branch: Branch) {
  const currency = business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) => `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

  const isRepayment = Boolean((sale as any).isRepayment);
  const isForgiven = !isRepayment && isDebtForgiven(sale.payment_status, sale.notes);
  const hasHigherPayment = !isRepayment && sale.amount_paid > sale.total_amount;
  const effectiveTotal = hasHigherPayment ? sale.amount_paid : sale.total_amount;
  const effectivePaid = hasHigherPayment ? sale.amount_paid : (sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount);

  const items = sale.items ?? [];
  const totalBaseAmount = items.reduce((sum: number, it: any) => sum + (Number(it.total_price) || 0), 0) || sale.total_amount || 1;
  let remainingCalculatedTotal = hasHigherPayment ? effectiveTotal : 0;

  const itemLines = items
    .map((item, index) => {
      let itemTotalPrice = item.total_price;
      let itemUnitPrice = item.unit_price;

      if (hasHigherPayment) {
        if (items.length === 1) {
          itemTotalPrice = effectiveTotal;
        } else if (index === items.length - 1) {
          itemTotalPrice = remainingCalculatedTotal;
        } else {
          itemTotalPrice = Number(((Number(item.total_price) / totalBaseAmount) * effectiveTotal).toFixed(2));
          remainingCalculatedTotal = Number((remainingCalculatedTotal - itemTotalPrice).toFixed(2));
        }
        const qty = Number(item.quantity) || 1;
        itemUnitPrice = Number((itemTotalPrice / qty).toFixed(2));
      }

      const discountText = item.discount_amount > 0 && !hasHigherPayment ? ` (Discount: -${formatMoney(item.discount_amount)})` : '';
      const unitText = itemUnitPrice ? ` (@ ${formatMoney(itemUnitPrice)})` : '';
      return `- ${(item.product as any)?.name ?? (item as any).product_name ?? 'Item'} x${item.quantity}${unitText} = ${formatMoney(itemTotalPrice)}${discountText}`;
    })
    .join('\n');

  const message =
    `*Receipt ${sale.sale_number}*\n` +
    `*${business.name}*${branch.name ? ` · ${branch.name}` : ''}\n` +
    `${format(new Date(sale.created_at), 'MMM d, yyyy · h:mm a')}\n` +
    ((sale.customer as any)?.name ? `Customer: ${(sale.customer as any).name}\n` : '') +
    `\n────────────────────\n` +
    `*Items*\n${itemLines}\n` +
    `────────────────────\n` +
    (sale.discount_amount > 0 && !hasHigherPayment ? `Subtotal: ${formatMoney(sale.subtotal)}\nDiscount: -${formatMoney(sale.discount_amount)}\n` : '') +
    `*Total: ${formatMoney(effectiveTotal)}*\n` +
    `Paid: ${formatMoney(effectivePaid)}\n` +
    (!hasHigherPayment && !isForgiven && sale.amount_owed > 0 ? `*Balance owed: ${formatMoney(sale.amount_owed)}*\n` : '') +
    (isForgiven ? `Debt forgiven, nothing is due.\n` : '') +
    `Payment Method: ${methodLabel(sale.payment_method)}${sale.bank_name ? ` (${sale.bank_name})` : ''}\n` +
    (sale.payment_method === 'mixed'
      ? `  • Cash: ${formatMoney(getPaymentBreakdown(sale).cash)}\n  • Transfer${sale.bank_name ? ` (${sale.bank_name})` : ''}: ${formatMoney(getPaymentBreakdown(sale).transfer)}\n`
      : '') +
    (cleanSaleNotes(sale.notes) ? `\nNote: "${cleanSaleNotes(sale.notes)}"\n` : '') +
    `\nThank you for your business.`;

  try {
    await Share.share({
      message,
      title: `Receipt ${sale.sale_number}`,
    });
  } catch (err) {
    console.error('Share error:', err);
  }
}

export async function shareDebtReminderViaWhatsApp(
  customerName: string,
  customerPhone: string,
  balance: number,
  businessName: string,
  dueDate?: string,
) {
  const formatMoney = (value: number) => `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

  const message =
    `Dear *${customerName}*,\n\n` +
    `This is a friendly reminder from *${businessName}*.\n\n` +
    `You have an outstanding balance of *${formatMoney(balance)}*` +
    (dueDate ? ` which was due on *${format(new Date(dueDate), 'MMMM d, yyyy')}*` : '') +
    `.\n\n` +
    `Please make payment at your earliest convenience.\n\n` +
    `Thank you.\n_${businessName}_`;

  try {
    await Share.share({
      message,
      title: `Debt Reminder - ${customerName}`,
    });
  } catch (err) {
    console.error('Share error:', err);
  }
}

export async function shareDailyReport(data: DailyReportData) {
  const currency = data.business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) => `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
  const reportTitle = `Daily Report - ${format(new Date(data.date), 'MMMM d, yyyy')}`;

  try {
    const html = generateDailyReportHTML(data);
    const { uri } = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: reportTitle,
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({
      url: uri,
      title: reportTitle,
      message: reportTitle,
    });
  } catch (err: any) {
    console.error('Share error:', err);

    // If PDF generation failed, fallback to text share
    const fallbackMessage =
      `*DAILY REPORT - ${format(new Date(data.date), 'MMMM d, yyyy')}*\n` +
      `${data.business.name} - ${data.branch.name}\n\n` +
      `Revenue: ${formatMoney(data.totalSales)}\n` +
      `Expenses: ${formatMoney(data.totalExpenses)}\n` +
      `Net Profit: ${formatMoney(data.netProfit)}\n` +
      ((data.totalDiscounts ?? 0) > 0 ? `Discounts: -${formatMoney(data.totalDiscounts ?? 0)}\n` : '') +
      `Sales: ${data.totalTransactions} transaction${data.totalTransactions !== 1 ? 's' : ''}\n` +
      (data.cashActual !== undefined
        ? `Cash: Expected ${formatMoney(data.cashExpected)} | Actual ${formatMoney(data.cashActual)}\n`
        : '') +
        `\n${data.isClosed ? 'Day closed and balanced' : 'Day still open'}\n` +
        `\n_Generated by Record Am_`;

    try {
      await Share.share({
        message: fallbackMessage,
        title: reportTitle,
      });
    } catch (shareErr) {
      console.error('Fallback share error:', shareErr);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// STAFF SHIFT REPORT (REGISTER & COLLECTIONS ONLY)
// ─────────────────────────────────────────────────────────────────

export interface StaffShiftReportData {
  date: string;
  business: Business;
  branch: Branch;
  staffName?: string;
  totalSales: number;
  totalCash: number;
  totalTransfer: number;
  totalPos: number;
  totalDiscounts: number;
  totalTransactions: number;
  digitalBreakdown?: {
    byBank: { bankName: string; total: number; count: number }[];
    byPos: { bankName: string; total: number; count: number }[];
  };
  isClosed: boolean;
}

export function generateStaffShiftReportHTML(data: StaffShiftReportData): string {
  const currency = data.business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) => `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Staff Shift Summary - ${data.date}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; color: #2B2925; background: #ffffff; }
    .header { background: #1A1917; color: #ffffff; padding: 20px; border-radius: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; }
    .header p { margin: 4px 0 0; opacity: 0.9; font-size: 13px; }
    .status { margin-top: 10px; font-weight: 700; font-size: 12px; color: ${data.isClosed ? '#6FB08A' : '#C4613F'}; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .metric { background: #F5F3EE; border: 1px solid #E6E2D9; border-radius: 10px; padding: 14px; }
    .metric .label { font-size: 11px; color: #6B675F; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric .val { font-size: 20px; font-weight: 800; color: #1A1917; margin-top: 4px; }
    .card { background: #ffffff; border: 1px solid #E6E2D9; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .card h2 { font-size: 13px; margin: 0 0 10px; text-transform: uppercase; color: #3D3A35; letter-spacing: 0.5px; border-bottom: 1px solid #EDEAE3; padding-bottom: 8px; font-weight: 700; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #EDEAE3; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .row .val { font-weight: 700; color: #1A1917; }
    .footer { text-align: center; color: #8A857B; font-size: 11px; margin-top: 24px; }
  </style>
${DOC_THEME}</head>
<body>
  <div class="header">
    <h1>Staff Register & Shift Summary</h1>
    <p>${data.business.name} · ${data.branch.name}</p>
    <p>${format(new Date(data.date), 'EEEE, MMMM d, yyyy')}${data.staffName ? ` · Prepared by ${data.staffName}` : ''}</p>
    <div class="status">${data.isClosed ? 'Register closed by management' : 'Register open'}</div>
  </div>

  <div class="metrics">
    <div class="metric">
      <div class="label">Total Collections</div>
      <div class="val">${formatMoney(data.totalSales)}</div>
      <div style="font-size:11px;color:#6B675F;margin-top:2px;">${data.totalTransactions} transaction${data.totalTransactions === 1 ? '' : 's'}</div>
    </div>
    <div class="metric">
      <div class="label">Cash in Till / Drawer</div>
      <div class="val" style="color:#1A1917;">${formatMoney(data.totalCash)}</div>
      <div style="font-size:11px;color:#6B675F;margin-top:2px;">Count in drawer</div>
    </div>
    <div class="metric">
      <div class="label">POS Card Payments</div>
      <div class="val" style="color:#B7791F;">${formatMoney(data.totalPos)}</div>
      <div style="font-size:11px;color:#6B675F;margin-top:2px;">Terminal slips total</div>
    </div>
    <div class="metric">
      <div class="label">Bank Transfers</div>
      <div class="val" style="color:#3B6B9A;">${formatMoney(data.totalTransfer)}</div>
      <div style="font-size:11px;color:#6B675F;margin-top:2px;">Verified transfer alerts</div>
    </div>
  </div>

  ${(data.digitalBreakdown?.byPos && data.digitalBreakdown.byPos.length > 0) ? `
  <div class="card">
    <h2>POS Terminals Breakdown</h2>
    ${data.digitalBreakdown.byPos.map((pos) => `
      <div class="row">
        <span>${pos.bankName} (${pos.count} slip${pos.count === 1 ? '' : 's'})</span>
        <span class="val">${formatMoney(pos.total)}</span>
      </div>
    `).join('')}
  </div>` : ''}

  ${(data.digitalBreakdown?.byBank && data.digitalBreakdown.byBank.length > 0) ? `
  <div class="card">
    <h2>Bank Transfers Breakdown</h2>
    ${data.digitalBreakdown.byBank.map((b) => `
      <div class="row">
        <span>${b.bankName} (${b.count} payment${b.count === 1 ? '' : 's'})</span>
        <span class="val">${formatMoney(b.total)}</span>
      </div>
    `).join('')}
  </div>` : ''}

  ${data.totalDiscounts > 0 ? `
  <div class="card">
    <div class="row" style="font-weight:600;">
      <span>Total Discounts Granted on Sales</span>
      <span class="val" style="color:#B7791F;">-${formatMoney(data.totalDiscounts)}</span>
    </div>
  </div>` : ''}

  <div class="footer">
    <p>Generated with Record Am on ${format(new Date(), 'MMM d, yyyy h:mm a')}</p>
    <p>Confidential Staff Shift Summary</p>
  </div>
</body>
</html>`;
}

export async function shareStaffShiftReport(data: StaffShiftReportData) {
  const currency = data.business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) => `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
  const reportTitle = `Staff Shift Summary - ${format(new Date(data.date), 'MMMM d, yyyy')}`;

  try {
    const html = generateStaffShiftReportHTML(data);
    const { uri } = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: reportTitle,
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({
      url: uri,
      title: reportTitle,
      message: reportTitle,
    });
  } catch (err: any) {
    console.error('Share staff report error:', err);
    const fallbackMessage =
      `*STAFF SHIFT SUMMARY - ${format(new Date(data.date), 'MMMM d, yyyy')}*\n` +
      `${data.business.name} - ${data.branch.name}\n` +
      (data.staffName ? `Staff: ${data.staffName}\n\n` : '\n') +
      `Total Collections: ${formatMoney(data.totalSales)} (${data.totalTransactions} transactions)\n` +
      `Cash in Till: ${formatMoney(data.totalCash)}\n` +
      `POS Card Payments: ${formatMoney(data.totalPos)}\n` +
      `Bank Transfers: ${formatMoney(data.totalTransfer)}\n` +
      (data.totalDiscounts > 0 ? `Discounts: -${formatMoney(data.totalDiscounts)}\n` : '') +
      `\n${data.isClosed ? 'Register Closed by Management' : 'Register Active / Open'}\n` +
      `_Generated by Record Am_`;

    try {
      await Share.share({
        message: fallbackMessage,
        title: reportTitle,
      });
    } catch (shareErr) {
      console.error('Fallback share error:', shareErr);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// INVENTORY STOCK SHEET (DOUBLE-COLUMN A4)
// ─────────────────────────────────────────────────────────────────

export interface InventoryPrintItem {
  name: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  category?: string;
}

export interface InventoryPrintData {
  business: Business;
  branch: Branch;
  filterType: 'all' | 'low_and_out';
  items: InventoryPrintItem[];
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateInventoryStockHTML(data: InventoryPrintData): string {
  const isAll = data.filterType === 'all';
  const filterLabel = isAll ? 'All stock' : 'Low and out of stock';
  const printedAt = format(new Date(), 'MMM d, yyyy - h:mm a');

  const rowsHTML: string[] = [];
  const total = data.items.length;

  for (let i = 0; i < total; i += 2) {
    const leftItem = data.items[i];
    const leftNum = i + 1;
    const rightItem = i + 1 < total ? data.items[i + 1] : null;
    const rightNum = i + 2;

    const formatItemQty = (item: InventoryPrintItem) => {
      const formattedCount = Number.isInteger(item.quantity)
        ? `${item.quantity}`
        : item.quantity.toFixed(2).replace(/\.00$/, '');

      let badge = '';
      let qtyColor = '#1A1917';
      if (item.quantity <= 0) {
        badge = '<span class="badge-out">Out</span>';
        qtyColor = '#C2412D';
      } else if (item.quantity <= item.reorderLevel) {
        badge = '<span class="badge-low">Low</span>';
        qtyColor = '#B7791F';
      }

      return `<span style="color:${qtyColor};font-weight:700;">${formattedCount}</span> <span style="font-size:9.5px;font-weight:400;color:#6B675F;">${escapeHtml(item.unit || '')}</span> ${badge}`;
    };

    const leftTDs = `
      <td class="col-num">${leftNum}</td>
      <td class="col-name">${escapeHtml(leftItem.name)}</td>
      <td class="col-qty">${formatItemQty(leftItem)}</td>
    `;

    const rightTDs = rightItem
      ? `
      <td class="col-num">${rightNum}</td>
      <td class="col-name">${escapeHtml(rightItem.name)}</td>
      <td class="col-qty">${formatItemQty(rightItem)}</td>
      `
      : `
      <td class="col-num"></td>
      <td class="col-name"></td>
      <td class="col-qty"></td>
      `;

    rowsHTML.push(`
      <tr>
        ${leftTDs}
        <td class="col-divider"></td>
        ${rightTDs}
      </tr>
    `);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inventory Stock Sheet - ${filterLabel}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 8mm 8mm 10mm 8mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #2B2925;
    background: #ffffff;
    padding: 0;
    font-size: 11px;
    line-height: 1.25;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1A1917;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
  .biz-info h1 {
    font-size: 17px;
    font-weight: 800;
    color: #1A1917;
    letter-spacing: -0.2px;
  }
  .biz-info p {
    font-size: 11px;
    color: #57534C;
    margin-top: 1px;
  }
  .report-meta {
    text-align: right;
  }
  .report-badge {
    display: inline-block;
    font-size: 10.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 4px;
    background: #1A1917;
    color: #ffffff;
    margin-bottom: 3px;
  }
  .report-date {
    font-size: 10px;
    color: #6B675F;
  }
  .summary-bar {
    display: flex;
    justify-content: space-between;
    background: #F5F3EE;
    border: 1px solid #E6E2D9;
    border-radius: 4px;
    padding: 5px 12px;
    margin-bottom: 10px;
    font-size: 11px;
  }
  .summary-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .summary-item .label { color: #6B675F; }
  .summary-item .value { font-weight: 700; color: #1A1917; }
  .summary-item .value.low { color: #B7791F; }
  .summary-item .value.out { color: #C2412D; }

  table.stock-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  thead {
    display: table-header-group;
  }
  tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  th {
    background: #1A1917;
    color: #ffffff;
    font-weight: 700;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 6px;
    border: 1px solid #1A1917;
  }
  td {
    padding: 3.5px 6px;
    font-size: 10px;
    border-bottom: 1px solid #E6E2D9;
    vertical-align: middle;
  }
  tr:nth-child(even) td {
    background-color: #F5F3EE;
  }
  .col-num {
    width: 24px;
    text-align: center;
    font-weight: 700;
    color: #6B675F;
    font-size: 9px;
  }
  .col-name {
    text-align: left;
    font-weight: 500;
    color: #1A1917;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .col-qty {
    width: 82px;
    text-align: right;
    white-space: nowrap;
  }
  .col-divider {
    width: 10px;
    border-top: none;
    border-bottom: none;
    background: transparent !important;
    padding: 0;
    border-right: 1.5px solid #D3CEC2;
  }
  th.col-divider {
    border: none;
    background: transparent !important;
  }
  .badge-low {
    display: inline-block;
    font-size: 8px;
    color: #8A5A12;
    background: #F6EDDA;
    padding: 0.5px 3px;
    border-radius: 2px;
    margin-left: 2px;
    font-weight: 700;
  }
  .badge-out {
    display: inline-block;
    font-size: 8px;
    color: #A3321F;
    background: #F5DAD4;
    padding: 0.5px 3px;
    border-radius: 2px;
    margin-left: 2px;
    font-weight: 800;
  }
  .footer {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px dashed #D3CEC2;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #8A857B;
  }
</style>
${DOC_THEME}</head>
<body>
  <div class="header">
    <div class="biz-info">
      <h1>${escapeHtml(data.business.name)}</h1>
      <p>${escapeHtml(data.branch.name)}${data.business.address ? ' &bull; ' + escapeHtml(data.business.address) : ''}${data.business.phone ? ' &bull; ' + escapeHtml(data.business.phone) : ''}</p>
    </div>
    <div class="report-meta">
      <div class="report-badge">${filterLabel}</div>
      <div class="report-date">${printedAt}</div>
    </div>
  </div>

  <div class="summary-bar">
    <div class="summary-item">
      <span class="label">Items Listed:</span>
      <span class="value">${data.items.length}</span>
    </div>
    <div class="summary-item">
      <span class="label">Low Stock:</span>
      <span class="value low">${data.lowStockCount}</span>
    </div>
    <div class="summary-item">
      <span class="label">Out of Stock:</span>
      <span class="value out">${data.outOfStockCount}</span>
    </div>
    <div class="summary-item">
      <span class="label">Total Catalog:</span>
      <span class="value">${data.totalProducts}</span>
    </div>
  </div>

  <table class="stock-table">
    <thead>
      <tr>
        <th class="col-num">#</th>
        <th class="col-name" style="text-align:left;">Item Name</th>
        <th class="col-qty" style="text-align:right;">Available Qty</th>
        <th class="col-divider"></th>
        <th class="col-num">#</th>
        <th class="col-name" style="text-align:left;">Item Name</th>
        <th class="col-qty" style="text-align:right;">Available Qty</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML.join('')}
    </tbody>
  </table>

  <div class="footer">
    <span>Record Am &bull; Physical Stock Take Sheet</span>
    <span>Printed on ${printedAt}</span>
  </div>
</body>
</html>`;
}

export async function printInventoryStock(data: InventoryPrintData) {
  try {
    const html = generateInventoryStockHTML(data);
    await Print.printAsync({ html });
  } catch (err) {
    console.error('Print inventory stock error:', err);
    throw err;
  }
}

export async function shareInventoryStockPDF(data: InventoryPrintData) {
  try {
    const html = generateInventoryStockHTML(data);
    const { uri } = await Print.printToFileAsync({
      html,
      width: 595,
      height: 842,
    });

    const filterTag = data.filterType === 'all' ? 'All' : 'Low_Out';
    const filename = `Inventory_Stock_${filterTag}_${format(new Date(), 'yyyyMMdd')}.pdf`;

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({
      url: uri,
      title: filename,
    });
  } catch (err: any) {
    console.error('Share inventory stock PDF error:', err);
    throw err;
  }
}

export interface ProductAnalysisPrintItem {
  rank: number;
  name: string;
  quantitySold: number;
  revenue: number;
  profit: number;
}

export interface ProductAnalysisPrintData {
  business: Business;
  branch?: Branch | null;
  items: ProductAnalysisPrintItem[];
  sortDescription: string;
  searchQuery?: string;
  totalProducts: number;
  totalQtySold: number;
  totalRevenue: number;
  totalProfit: number;
}

export function generateProductAnalysisHTML(data: ProductAnalysisPrintData): string {
  const currency = data.business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (val: number) =>
    `${currency}${val.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const overallMargin =
    data.totalRevenue > 0 ? ((data.totalProfit / data.totalRevenue) * 100).toFixed(1) + '%' : '0%';
  const printedAt = format(new Date(), 'MMM d, yyyy \u00B7 h:mm a');

  const rowsHTML = data.items
    .map((item) => {
      const margin = item.revenue > 0 ? ((item.profit / item.revenue) * 100).toFixed(1) + '%' : '0%';
      const profitColor = item.profit >= 0 ? '#2E7D4F' : '#C2412D';
      return `
      <tr>
        <td class="col-rank">${item.rank}</td>
        <td class="col-name">${escapeHtml(item.name)}</td>
        <td class="col-qty">${item.quantitySold.toLocaleString('en-NG')}</td>
        <td class="col-money">${formatMoney(item.revenue)}</td>
        <td class="col-money" style="color:${profitColor};font-weight:600;">${formatMoney(item.profit)}</td>
        <td class="col-margin">${margin}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Product Analytics - ${escapeHtml(data.business.name)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 10mm 10mm 12mm 10mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #2B2925;
    background: #ffffff;
    padding: 0;
    font-size: 11px;
    line-height: 1.35;
  }
  .header {
    border-bottom: 2px solid #1A1917;
    padding-bottom: 10px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .business-name {
    font-size: 18px;
    font-weight: 800;
    color: #1A1917;
    letter-spacing: -0.2px;
  }
  .branch-name {
    font-size: 11px;
    color: #6B675F;
    margin-top: 2px;
  }
  .report-title-box {
    text-align: right;
  }
  .report-title {
    font-size: 14px;
    font-weight: 700;
    color: #1A1917;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .meta-info {
    font-size: 10px;
    color: #6B675F;
    margin-top: 3px;
  }
  .summary-bar {
    display: flex;
    background: #F5F3EE;
    border: 1px solid #E6E2D9;
    border-radius: 6px;
    padding: 10px 14px;
    margin-bottom: 12px;
    justify-content: space-between;
    gap: 12px;
  }
  .summary-item {
    display: flex;
    flex-direction: column;
  }
  .summary-item .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6B675F;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .summary-item .value {
    font-size: 13px;
    font-weight: 700;
    color: #1A1917;
  }
  .summary-item .value.profit {
    color: #2E7D4F;
  }
  .filter-note {
    font-size: 10px;
    color: #57534C;
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  thead {
    display: table-header-group;
  }
  th {
    background: #1A1917;
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 7px 8px;
    border: none;
  }
  th.col-rank { width: 36px; text-align: center; }
  th.col-name { text-align: left; }
  th.col-qty { width: 75px; text-align: right; }
  th.col-money { width: 105px; text-align: right; }
  th.col-margin { width: 65px; text-align: right; }
  
  tr {
    page-break-inside: avoid;
  }
  tbody tr {
    border-bottom: 1px solid #E6E2D9;
  }
  tbody tr:nth-child(even) {
    background-color: #F5F3EE;
  }
  td {
    padding: 6px 8px;
    font-size: 10.5px;
  }
  td.col-rank {
    text-align: center;
    font-weight: 700;
    color: #1A1917;
  }
  td.col-name {
    font-weight: 500;
    color: #1A1917;
  }
  td.col-qty {
    text-align: right;
    font-weight: 600;
  }
  td.col-money {
    text-align: right;
  }
  td.col-margin {
    text-align: right;
    color: #6B675F;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    font-size: 9.5px;
    color: #8A857B;
    border-top: 1px solid #E6E2D9;
    padding-top: 6px;
    margin-top: 8px;
  }
</style>
${DOC_THEME}</head>
<body>
  <div class="header">
    <div>
      <div class="business-name">${escapeHtml(data.business.name)}</div>
      <div class="branch-name">${escapeHtml(data.branch?.name || 'Main Branch')}</div>
    </div>
    <div class="report-title-box">
      <div class="report-title">Product Performance Analysis</div>
      <div class="meta-info">Printed on ${printedAt}</div>
    </div>
  </div>

  <div class="summary-bar">
    <div class="summary-item">
      <span class="label">Products:</span>
      <span class="value">${data.totalProducts}</span>
    </div>
    <div class="summary-item">
      <span class="label">Units Sold:</span>
      <span class="value">${data.totalQtySold.toLocaleString('en-NG')}</span>
    </div>
    <div class="summary-item">
      <span class="label">Total Revenue:</span>
      <span class="value">${formatMoney(data.totalRevenue)}</span>
    </div>
    <div class="summary-item">
      <span class="label">Total Profit:</span>
      <span class="value profit">${formatMoney(data.totalProfit)}</span>
    </div>
    <div class="summary-item">
      <span class="label">Margin:</span>
      <span class="value">${overallMargin}</span>
    </div>
  </div>

  <div class="filter-note">
    <strong>Parameters:</strong> ${escapeHtml(data.sortDescription)}${data.searchQuery ? ` &bull; <em>Filtered by: "${escapeHtml(data.searchQuery)}"</em>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-rank">#</th>
        <th class="col-name">Product Name</th>
        <th class="col-qty">Units Sold</th>
        <th class="col-money">Revenue</th>
        <th class="col-money">Gross Profit</th>
        <th class="col-margin">Margin</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML}
    </tbody>
  </table>

  <div class="footer">
    <span>Record Am &bull; Product Performance Analysis</span>
    <span>Printed on ${printedAt}</span>
  </div>
</body>
</html>`;
}

export async function printProductAnalysis(data: ProductAnalysisPrintData) {
  try {
    const html = generateProductAnalysisHTML(data);
    await Print.printAsync({ html });
  } catch (err) {
    console.error('Print product analysis error:', err);
    throw err;
  }
}

export async function shareProductAnalysisPDF(data: ProductAnalysisPrintData) {
  try {
    const html = generateProductAnalysisHTML(data);
    const { uri } = await Print.printToFileAsync({
      html,
      width: 595,
      height: 842,
    });

    const filename = `Product_Analysis_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`;

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({
      url: uri,
      title: filename,
    });
  } catch (err: any) {
    console.error('Share product analysis PDF error:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// STOCK ACTIVITY / PURCHASE LIST
// ─────────────────────────────────────────────────────────────────

export interface StockMovementPrintItem {
  name: string;
  type: string;
  quantity: number;
  unit: string;
  createdAt: string;
  reference?: string;
  totalCost?: number;
}

export interface StockMovementPrintData {
  business: Business;
  branch?: Branch | null;
  title: string;
  periodLabel: string;
  items: StockMovementPrintItem[];
  totalReceived: number;
  totalIssued: number;
  searchQuery?: string;
}

const STOCK_MOVEMENT_PRINT_LABELS: Record<string, string> = {
  stock_in: 'Stock in',
  stock_out: 'Stock out',
  adjustment: 'Adjustment',
  transfer: 'Transfer',
  damage: 'Damaged',
  wastage: 'Wastage',
};

const STOCK_MOVEMENT_PRINT_COLORS: Record<string, string> = {
  stock_in: '#2E7D4F',
  stock_out: '#C2412D',
  adjustment: '#3B6B9A',
  transfer: '#B7791F',
  damage: '#C2412D',
  wastage: '#B7791F',
};

/** Creates a concise, printer-friendly list that mirrors the stock history filters. */
export function generateStockMovementReportHTML(data: StockMovementPrintData): string {
  const currency = data.business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) =>
    `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const formatQty = (value: number) =>
    Number.isInteger(value)
      ? `${value}`
      : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  const printedAt = format(new Date(), 'MMM d, yyyy · h:mm a');

  const rows = data.items
    .map((item, index) => {
      const typeLabel = STOCK_MOVEMENT_PRINT_LABELS[item.type] ?? 'Movement';
      const typeColor = STOCK_MOVEMENT_PRINT_COLORS[item.type] ?? '#57534C';
      const cost = item.totalCost && item.totalCost > 0 ? formatMoney(item.totalCost) : '—';
      const reference = item.reference ? `<div class="reference">${escapeHtml(item.reference)}</div>` : '';

      return `
        <tr>
          <td class="number">${index + 1}</td>
          <td class="date">${format(new Date(item.createdAt), 'dd MMM yyyy')}<span>${format(new Date(item.createdAt), 'h:mm a')}</span></td>
          <td class="item"><strong>${escapeHtml(item.name)}</strong>${reference}</td>
          <td><span class="type" style="color:${typeColor};border-color:${typeColor}35;background:${typeColor}12;">${typeLabel}</span></td>
          <td class="quantity">${formatQty(item.quantity)} <span>${escapeHtml(item.unit)}</span></td>
          <td class="cost">${cost}</td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.title)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 16mm 12mm; }
    body { margin: 0; color: #1A1917; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; }
    .header { background: #1A1917; color: #FFFFFF; padding: 22px 24px; border-radius: 8px 8px 0 0; }
    .business { font-size: 21px; font-weight: 800; line-height: 1.2; }
    .branch { margin-top: 4px; color: rgba(255,253,248,.68); font-size: 11px; }
    .report-title { margin-top: 18px; font-size: 16px; font-weight: 800; }
    .period { margin-top: 4px; color: rgba(255,253,248,.7); font-size: 11px; }
    .summary { display: flex; border: 1px solid #E6E2D9; border-top: 0; }
    .metric { flex: 1; padding: 14px 18px; border-right: 1px solid #E6E2D9; }
    .metric:last-child { border-right: 0; }
    .metric-label { color: #8A857B; font-size: 9px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
    .metric-value { margin-top: 4px; color: #1A1917; font-size: 17px; font-weight: 800; }
    .filter-note { padding: 12px 0 10px; color: #8A857B; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { padding: 9px 7px; background: #F5F3EE; border-bottom: 1px solid #E6E2D9; color: #57534C; font-size: 9px; font-weight: 800; letter-spacing: .55px; text-align: left; text-transform: uppercase; }
    td { padding: 10px 7px; border-bottom: 1px solid #EDEAE3; color: #57534C; vertical-align: middle; }
    .number { width: 5%; color: #8A857B; }
    .date { width: 16%; font-size: 10px; }
    .date span { display: block; margin-top: 2px; color: #8A857B; font-size: 9px; }
    .item { width: 31%; }
    .item strong { display: block; color: #1A1917; font-size: 11px; }
    .reference { margin-top: 3px; color: #8A857B; font-size: 9px; overflow-wrap: anywhere; }
    .type { display: inline-block; padding: 3px 6px; border: 1px solid; border-radius: 999px; font-size: 8px; font-weight: 800; white-space: nowrap; }
    .quantity { width: 16%; color: #1A1917; font-weight: 800; text-align: right; white-space: nowrap; }
    .quantity span { color: #8A857B; font-size: 9px; font-weight: 400; }
    .cost { width: 14%; color: #1A1917; font-weight: 700; text-align: right; white-space: nowrap; }
    .footer { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #E6E2D9; color: #8A857B; font-size: 9px; }
  </style>
${DOC_THEME}</head>
<body>
  <section class="header">
    <div class="business">${escapeHtml(data.business.name)}</div>
    <div class="branch">${escapeHtml(data.branch?.name ?? '')}</div>
    <div class="report-title">${escapeHtml(data.title)}</div>
    <div class="period">${escapeHtml(data.periodLabel)}</div>
  </section>
  <section class="summary">
    <div class="metric"><div class="metric-label">Listed items</div><div class="metric-value">${data.items.length}</div></div>
    <div class="metric"><div class="metric-label">Units in</div><div class="metric-value" style="color:#2E7D4F;">+${formatQty(data.totalReceived)}</div></div>
    <div class="metric"><div class="metric-label">Units out</div><div class="metric-value" style="color:#C2412D;">-${formatQty(data.totalIssued)}</div></div>
  </section>
  ${data.searchQuery ? `<div class="filter-note">Search filter: “${escapeHtml(data.searchQuery)}”</div>` : '<div class="filter-note">All items matching the selected filters</div>'}
  <table>
    <thead><tr><th class="number">#</th><th class="date">Date</th><th class="item">Item</th><th>Type</th><th class="quantity">Quantity</th><th class="cost">Cost</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer"><span>Record Am · Stock activity list</span><span>Printed ${printedAt}</span></div>
</body>
</html>`;
}

export async function printStockMovementReport(data: StockMovementPrintData) {
  try {
    await Print.printAsync({ html: generateStockMovementReportHTML(data) });
  } catch (err) {
    console.error('Print stock movement report error:', err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────
// CUSTOMER / SUPPLIER STATEMENTS
// ─────────────────────────────────────────────────────────────────

export interface CounterpartyStatementItem {
  reference: string;
  description: string;
  date: string;
  total: number;
  paid: number;
  balance: number;
}

export interface CounterpartyStatementPrintData {
  business: Business;
  branch?: Branch | null;
  kind: 'customer' | 'supplier';
  counterparty: Pick<Customer | Supplier, 'name' | 'phone' | 'email' | 'address'>;
  totalTrade: number;
  outstandingBalance: number;
  items: CounterpartyStatementItem[];
}

/** Produces a compact account statement for the records currently available on a contact profile. */
export function generateCounterpartyStatementHTML(data: CounterpartyStatementPrintData): string {
  const currency = data.business.currency_symbol ?? CURRENCY_SYMBOL;
  const isCustomer = data.kind === 'customer';
  const reportTitle = isCustomer ? 'Customer Statement' : 'Supplier Statement';
  const tradeLabel = isCustomer ? 'Total sales' : 'Goods purchased';
  const balanceLabel = isCustomer ? 'Customer owes' : 'We owe';
  const activityLabel = isCustomer ? 'Sale' : 'Goods record';
  const formatMoney = (value: number) =>
    `${currency}${(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const printedAt = format(new Date(), 'MMM d, yyyy · h:mm a');
  const contactLines = [
    data.counterparty.phone,
    data.counterparty.email,
    data.counterparty.address,
  ].filter(Boolean).map((value) => escapeHtml(value!)).join(' · ');

  const rows = data.items.map((item) => `
    <tr>
      <td class="date">${format(new Date(item.date), 'dd MMM yyyy')}</td>
      <td class="record"><strong>${escapeHtml(item.description)}</strong><span>${escapeHtml(item.reference)}</span></td>
      <td class="amount">${formatMoney(item.total)}</td>
      <td class="amount paid">${formatMoney(item.paid)}</td>
      <td class="amount ${item.balance > 0 ? 'due' : ''}">${item.balance > 0 ? formatMoney(item.balance) : '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(reportTitle)} · ${escapeHtml(data.counterparty.name)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { margin: 16mm 12mm; }
    body { margin: 0; color: #1A1917; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; }
    .header { padding: 22px 24px; border-radius: 8px 8px 0 0; color: #FFFFFF; background: #1A1917; }
    .business { font-size: 20px; font-weight: 800; }
    .branch { margin-top: 4px; color: rgba(255,253,248,.68); font-size: 11px; }
    .report { margin-top: 19px; font-size: 15px; font-weight: 800; }
    .person { margin-top: 4px; color: rgba(255,253,248,.82); font-size: 13px; font-weight: 600; }
    .contact { margin-top: 4px; color: rgba(255,253,248,.63); font-size: 10px; line-height: 1.4; }
    .metrics { display: flex; border: 1px solid #E6E2D9; border-top: 0; }
    .metric { flex: 1; min-height: 67px; padding: 13px 17px; border-right: 1px solid #E6E2D9; }
    .metric:last-child { border-right: 0; }
    .label { color: #8A857B; font-size: 9px; font-weight: 700; letter-spacing: .65px; text-transform: uppercase; }
    .value { margin-top: 4px; color: #1A1917; font-size: 16px; font-weight: 800; }
    .due-value { color: #C2412D; }
    .note { padding: 13px 0 9px; color: #8A857B; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th { padding: 9px 7px; color: #57534C; background: #F5F3EE; border-bottom: 1px solid #E6E2D9; font-size: 9px; font-weight: 800; letter-spacing: .5px; text-align: left; text-transform: uppercase; }
    td { padding: 10px 7px; border-bottom: 1px solid #EDEAE3; color: #57534C; vertical-align: middle; }
    .date { width: 16%; white-space: nowrap; }
    .record { width: 38%; }
    .record strong { display: block; color: #1A1917; font-size: 11px; }
    .record span { display: block; margin-top: 3px; color: #8A857B; font-size: 9px; }
    .amount { width: 15%; color: #1A1917; font-weight: 700; text-align: right; white-space: nowrap; }
    .paid { color: #2E7D4F; }
    .due { color: #C2412D; }
    .empty { padding: 24px 0; color: #8A857B; text-align: center; }
    .footer { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #E6E2D9; color: #8A857B; font-size: 9px; }
  </style>
${DOC_THEME}</head>
<body>
  <section class="header">
    <div class="business">${escapeHtml(data.business.name)}</div>
    <div class="branch">${escapeHtml(data.branch?.name ?? '')}</div>
    <div class="report">${reportTitle}</div>
    <div class="person">${escapeHtml(data.counterparty.name)}</div>
    ${contactLines ? `<div class="contact">${contactLines}</div>` : ''}
  </section>
  <section class="metrics">
    <div class="metric"><div class="label">${tradeLabel}</div><div class="value">${formatMoney(data.totalTrade)}</div></div>
    <div class="metric"><div class="label">${balanceLabel}</div><div class="value ${data.outstandingBalance > 0 ? 'due-value' : ''}">${formatMoney(data.outstandingBalance)}</div></div>
    <div class="metric"><div class="label">${activityLabel}s listed</div><div class="value">${data.items.length}</div></div>
  </section>
  <div class="note">Latest ${data.items.length} ${activityLabel.toLowerCase()}${data.items.length === 1 ? '' : 's'} available in this profile.</div>
  ${data.items.length > 0 ? `
  <table>
    <thead><tr><th class="date">Date</th><th class="record">Details</th><th class="amount">Total</th><th class="amount">Paid</th><th class="amount">Balance</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>` : '<div class="empty">No activity is available for this profile yet.</div>'}
  <div class="footer"><span>Record Am · ${reportTitle}</span><span>Printed ${printedAt}</span></div>
</body>
</html>`;
}

export async function printCounterpartyStatement(data: CounterpartyStatementPrintData) {
  try {
    await Print.printAsync({ html: generateCounterpartyStatementHTML(data) });
  } catch (err) {
    console.error('Print counterparty statement error:', err);
    throw err;
  }
}

export async function shareCounterpartyStatementPDF(data: CounterpartyStatementPrintData) {
  try {
    const html = generateCounterpartyStatementHTML(data);
    const { uri } = await Print.printToFileAsync({
      html,
      width: 595,
      height: 842,
    });

    const isCustomer = data.kind === 'customer';
    const filename = `${isCustomer ? 'Customer' : 'Supplier'}_Statement_${format(new Date(), 'yyyyMMdd')}.pdf`;

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: filename,
        UTI: 'com.adobe.pdf',
      });
      return;
    }

    await Share.share({
      url: uri,
      title: filename,
    });
  } catch (err: any) {
    console.error('Share counterparty statement PDF error:', err);
    throw err;
  }
}

