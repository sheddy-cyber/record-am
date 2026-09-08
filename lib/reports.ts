import { Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { CURRENCY_SYMBOL } from '@/constants';
import { Branch, Business, Sale } from '@/types';

export function generateReceiptHTML(sale: Sale, business: Business, branch: Branch): string {
  const currency = business.currency_symbol ?? CURRENCY_SYMBOL;
  const formatMoney = (value: number) =>
    `${currency}${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const itemRows = (sale.items ?? [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0ede3;">
          <div style="font-weight:600;color:#1B201D;">${(item.product as any)?.name ?? 'Item'}</div>
          <div style="font-size:12px;color:#7D877F;">
            ${item.quantity} x ${formatMoney(item.unit_price)}
            ${item.discount_amount > 0 ? `(Discount: -${formatMoney(item.discount_amount)})` : ''}
          </div>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f0ede3;text-align:right;font-weight:600;color:#1B201D;">
          ${formatMoney(item.total_price)}
        </td>
      </tr>`
    )
    .join('');

  const statusColor =
    sale.payment_status === 'paid'
      ? '#238B5B'
      : sale.payment_status === 'partial'
        ? '#C87A22'
        : '#C44536';
  const statusLabel =
    sale.payment_status === 'paid'
      ? 'PAID IN FULL'
      : sale.payment_status === 'partial'
        ? 'PARTIALLY PAID'
        : 'CREDIT / UNPAID';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${sale.sale_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f0e4; display: flex; justify-content: center; padding: 20px; }
  .receipt { background: #fffdf8; width: 100%; max-width: 420px; border: 1px solid #d8ceb7; overflow: hidden; }
  .header { background: #14211C; padding: 28px 24px 24px; text-align: center; }
  .header .biz-name { font-size: 22px; font-weight: 800; color: #fffdf8; margin-bottom: 4px; }
  .header .biz-sub { font-size: 13px; color: rgba(255,253,248,0.72); }
  .receipt-tag { background: #fffdf8; margin: 0 24px; margin-top: -14px; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #d8ceb7; }
  .receipt-num { font-size: 13px; font-weight: 700; color: #14211C; }
  .receipt-date { font-size: 12px; color: #7D877F; }
  .section { padding: 20px 24px; }
  .section-title { font-size: 11px; font-weight: 700; color: #7D877F; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; }
  .customer-box { background: #f5f0e4; padding: 12px 16px; margin-bottom: 4px; border: 1px solid #d8ceb7; }
  .customer-box .name { font-size: 15px; font-weight: 700; color: #1B201D; }
  .customer-box .phone { font-size: 13px; color: #4C5A52; margin-top: 2px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: #4C5A52; }
  .totals-row.total { border-top: 2px solid #d8ceb7; margin-top: 8px; padding-top: 12px; font-size: 17px; font-weight: 800; color: #1B201D; }
  .totals-row.owed { color: #C44536; font-weight: 700; }
  .status-badge { text-align: center; padding: 14px; background: ${statusColor}18; border-top: 1px solid #d8ceb7; }
  .status-badge span { font-size: 13px; font-weight: 800; color: ${statusColor}; letter-spacing: 1px; }
  .footer { padding: 20px 24px; text-align: center; border-top: 1px dashed #d8ceb7; }
  .footer p { font-size: 12px; color: #7D877F; margin-bottom: 4px; }
  .powered { font-size: 11px; color: #9AA39D; margin-top: 12px; }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <div class="biz-name">${business.name}</div>
    <div class="biz-sub">${branch.name}${business.address ? ' - ' + business.address : ''}${business.phone ? ' - ' + business.phone : ''}</div>
  </div>

  <div class="receipt-tag">
    <span class="receipt-num">${sale.sale_number}</span>
    <span class="receipt-date">${format(new Date(sale.created_at), 'MMM d, yyyy - h:mm a')}</span>
  </div>

  ${(sale.customer || sale.amount_owed > 0) ? `
  <div class="section" style="padding-bottom:0;">
    <div class="section-title">Customer</div>
    <div class="customer-box">
      <div class="name">${(sale.customer as any)?.name ?? 'Walk-in Customer'}</div>
      ${(sale.customer as any)?.phone ? `<div class="phone">${(sale.customer as any).phone}</div>` : ''}
    </div>
  </div>` : ''}

  <div class="section" style="padding-bottom:0;">
    <div class="section-title">Items</div>
    <table>${itemRows}</table>
  </div>

  <div class="section">
    <div class="section-title">Summary</div>
    ${sale.discount_amount > 0 ? `
    <div class="totals-row"><span>Subtotal</span><span>${formatMoney(sale.subtotal)}</span></div>
    <div class="totals-row"><span>Discount</span><span>- ${formatMoney(sale.discount_amount)}</span></div>` : ''}
    ${sale.tax_amount > 0 ? `<div class="totals-row"><span>Tax</span><span>${formatMoney(sale.tax_amount)}</span></div>` : ''}
    <div class="totals-row total"><span>Total</span><span>${formatMoney(sale.total_amount)}</span></div>
    <div class="totals-row" style="color:#238B5B;font-weight:700;padding-top:8px;">
      <span>Amount Paid</span><span>${formatMoney(sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount)}</span>
    </div>
    ${sale.amount_owed > 0 ? `<div class="totals-row owed"><span>Balance Owed</span><span>${formatMoney(sale.amount_owed)}</span></div>` : ''}
    <div class="totals-row" style="font-size:12px;color:#7D877F;padding-top:4px;">
      <span>Payment Method</span><span>${sale.payment_method.replace('_', ' ').toUpperCase()}</span>
    </div>
  </div>

  <div class="status-badge"><span>${statusLabel}</span></div>

  <div class="footer">
    <p>Thank you for your business.</p>
    ${sale.notes ? `<p style="font-style:italic;">"${sale.notes}"</p>` : ''}
    <p style="margin-top:8px;">${business.name} - ${format(new Date(sale.created_at), 'yyyy')}</p>
    <div class="powered">Powered by Record Am - Designed by PYTHRON</div>
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
  const profitColor = data.netProfit >= 0 ? '#238B5B' : '#C44536';
  const discrepancy = data.cashActual !== undefined ? data.cashActual - data.cashExpected : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Daily Report - ${format(new Date(data.date), 'MMMM d, yyyy')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f0e4; padding: 20px; }
  .report { background: #fffdf8; max-width: 600px; margin: 0 auto; border: 1px solid #d8ceb7; overflow: hidden; }
  .header { background: #14211C; padding: 28px 28px 24px; }
  .header h1 { font-size: 20px; font-weight: 800; color: #fffdf8; margin-bottom: 4px; }
  .header p { font-size: 13px; color: rgba(255,253,248,0.65); }
  .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 20px; }
  .metric { background: #f5f0e4; border: 1px solid #d8ceb7; padding: 14px; }
  .metric .label { font-size: 11px; color: #7D877F; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .metric .value { font-size: 20px; font-weight: 800; color: #1B201D; }
  .section { padding: 0 20px 20px; }
  .section h2 { font-size: 13px; font-weight: 700; color: #4C5A52; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; border-top: 1px solid #ebe4d2; padding-top: 16px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0ede3; font-size: 14px; color: #4C5A52; }
  .row .val { font-weight: 700; color: #1B201D; }
  .cash-box { background: ${data.cashActual !== undefined ? (Math.abs(discrepancy) < 1 ? '#DCEFE5' : discrepancy > 0 ? '#DCE8F3' : '#F6DFDA') : '#f5f0e4'}; border: 1px solid #d8ceb7; padding: 16px; margin: 0 20px 20px; }
  .footer { text-align: center; padding: 16px; border-top: 1px dashed #d8ceb7; }
  .footer p { font-size: 12px; color: #7D877F; }
</style>
</head>
<body>
<div class="report">
  <div class="header">
    <h1>${data.business.name}</h1>
    <p>${data.branch.name} - Daily Report - ${format(new Date(data.date), 'EEEE, MMMM d, yyyy')}</p>
    <p style="margin-top:8px;color:${data.isClosed ? '#DCEFE5' : '#F6E2C7'};font-weight:700;font-size:13px;">
      ${data.isClosed ? 'Day Closed & Balanced' : 'Day Still Open'}
    </p>
  </div>

  <div class="metrics">
    <div class="metric"><div class="label">Total Revenue</div><div class="value" style="color:#14211C;">${formatMoney(data.totalSales)}</div></div>
    <div class="metric"><div class="label">Net Profit</div><div class="value" style="color:${profitColor};">${formatMoney(data.netProfit)}</div></div>
    <div class="metric"><div class="label">Total Expenses</div><div class="value" style="color:#C44536;">${formatMoney(data.totalExpenses)}</div></div>
    <div class="metric"><div class="label">Transactions</div><div class="value">${data.totalTransactions}</div></div>
  </div>

  <div class="section">
    <h2>Sales by Payment Method</h2>
    ${data.salesByMethod.map((method) => `<div class="row"><span>${method.method.replace('_', ' ').toUpperCase()}</span><span class="val">${formatMoney(method.amount)}</span></div>`).join('') || '<p style="color:#7D877F;font-size:13px;">No sales</p>'}
  </div>

  ${data.topProducts.length > 0 ? `
  <div class="section">
    <h2>Top Products</h2>
    ${data.topProducts.map((product, index) => `
    <div class="row">
      <span>${index + 1}. ${product.name} <span style="color:#7D877F;font-size:12px;">(x${product.qty})</span></span>
      <span class="val">${formatMoney(product.revenue)}</span>
    </div>`).join('')}
  </div>` : ''}

  <div class="cash-box">
    <div style="font-size:13px;font-weight:700;color:#1B201D;margin-bottom:10px;">Cash Reconciliation</div>
    <div class="row" style="border:none;"><span>Expected Cash</span><span class="val">${formatMoney(data.cashExpected)}</span></div>
    ${data.cashActual !== undefined ? `
    <div class="row" style="border:none;"><span>Actual Cash Counted</span><span class="val">${formatMoney(data.cashActual)}</span></div>
    <div class="row" style="border:none;font-weight:700;color:${Math.abs(discrepancy) < 1 ? '#238B5B' : discrepancy > 0 ? '#2F6EA8' : '#C44536'};">
      <span>${Math.abs(discrepancy) < 1 ? 'Balanced' : discrepancy > 0 ? 'Surplus' : 'Shortage'}</span>
      <span>${discrepancy >= 0 ? '+' : ''}${formatMoney(discrepancy)}</span>
    </div>` : '<div style="font-size:12px;color:#7D877F;">Day not yet closed</div>'}
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

  const itemLines = (sale.items ?? [])
    .map((item) => {
      const discountText = item.discount_amount > 0 ? ` (Discount: -${formatMoney(item.discount_amount)})` : '';
      return `- ${(item.product as any)?.name ?? 'Item'} x${item.quantity} = ${formatMoney(item.total_price)}${discountText}`;
    })
    .join('\n');

  const message =
    `*RECEIPT - ${sale.sale_number}*\n` +
    `${business.name} (${branch.name})\n` +
    `${format(new Date(sale.created_at), 'MMM d, yyyy - h:mm a')}\n\n` +
    `*ITEMS*\n${itemLines}\n\n` +
    (sale.discount_amount > 0 ? `*SUBTOTAL:* ${formatMoney(sale.subtotal)}\n*DISCOUNT:* -${formatMoney(sale.discount_amount)}\n` : '') +
    `*TOTAL:* ${formatMoney(sale.total_amount)}\n` +
    `*PAID:* ${formatMoney(sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount)}\n` +
    (sale.amount_owed > 0 ? `*BALANCE:* ${formatMoney(sale.amount_owed)}\n` : '') +
    `\nPayment: ${sale.payment_method.replace('_', ' ').toUpperCase()}\n` +
    `\n_Thank you for your business._\n_Powered by Record Am - Designed by PYTHRON_`;

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
  } catch (err) {
    console.error('Share error:', err);

    const fallbackMessage =
      `*DAILY REPORT - ${format(new Date(data.date), 'MMMM d, yyyy')}*\n` +
      `${data.business.name} - ${data.branch.name}\n\n` +
      `Revenue: ${formatMoney(data.totalSales)}\n` +
      `Expenses: ${formatMoney(data.totalExpenses)}\n` +
      `Net Profit: ${formatMoney(data.netProfit)}\n` +
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
  const filterLabel = isAll ? 'ALL STOCK ITEMS' : 'LOW & OUT OF STOCK ITEMS';
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
      let qtyColor = '#0f172a';
      if (item.quantity <= 0) {
        badge = '<span class="badge-out">OUT</span>';
        qtyColor = '#dc2626';
      } else if (item.quantity <= item.reorderLevel) {
        badge = '<span class="badge-low">LOW</span>';
        qtyColor = '#d97706';
      }

      return `<span style="color:${qtyColor};font-weight:700;">${formattedCount}</span> <span style="font-size:9.5px;font-weight:400;color:#64748b;">${escapeHtml(item.unit || '')}</span> ${badge}`;
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
    color: #1e293b;
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
    border-bottom: 2px solid #0f172a;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
  .biz-info h1 {
    font-size: 17px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.2px;
  }
  .biz-info p {
    font-size: 11px;
    color: #475569;
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
    background: #0f172a;
    color: #ffffff;
    margin-bottom: 3px;
  }
  .report-date {
    font-size: 10px;
    color: #64748b;
  }
  .summary-bar {
    display: flex;
    justify-content: space-between;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
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
  .summary-item .label { color: #64748b; }
  .summary-item .value { font-weight: 700; color: #0f172a; }
  .summary-item .value.low { color: #d97706; }
  .summary-item .value.out { color: #dc2626; }

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
    background: #0f172a;
    color: #ffffff;
    font-weight: 700;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 6px;
    border: 1px solid #0f172a;
  }
  td {
    padding: 3.5px 6px;
    font-size: 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: middle;
  }
  tr:nth-child(even) td {
    background-color: #f8fafc;
  }
  .col-num {
    width: 24px;
    text-align: center;
    font-weight: 700;
    color: #64748b;
    font-size: 9px;
  }
  .col-name {
    text-align: left;
    font-weight: 500;
    color: #0f172a;
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
    border-right: 1.5px solid #cbd5e1;
  }
  th.col-divider {
    border: none;
    background: transparent !important;
  }
  .badge-low {
    display: inline-block;
    font-size: 8px;
    color: #b45309;
    background: #fef3c7;
    padding: 0.5px 3px;
    border-radius: 2px;
    margin-left: 2px;
    font-weight: 700;
  }
  .badge-out {
    display: inline-block;
    font-size: 8px;
    color: #b91c1c;
    background: #fee2e2;
    padding: 0.5px 3px;
    border-radius: 2px;
    margin-left: 2px;
    font-weight: 800;
  }
  .footer {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px dashed #cbd5e1;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #94a3b8;
  }
</style>
</head>
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
  } catch (err) {
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
      const profitColor = item.profit >= 0 ? '#16a34a' : '#dc2626';
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
    color: #1e293b;
    background: #ffffff;
    padding: 0;
    font-size: 11px;
    line-height: 1.35;
  }
  .header {
    border-bottom: 2px solid #004e89;
    padding-bottom: 10px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .business-name {
    font-size: 18px;
    font-weight: 800;
    color: #004e89;
    letter-spacing: -0.2px;
  }
  .branch-name {
    font-size: 11px;
    color: #64748b;
    margin-top: 2px;
  }
  .report-title-box {
    text-align: right;
  }
  .report-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .meta-info {
    font-size: 10px;
    color: #64748b;
    margin-top: 3px;
  }
  .summary-bar {
    display: flex;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
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
    color: #64748b;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .summary-item .value {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
  }
  .summary-item .value.profit {
    color: #16a34a;
  }
  .filter-note {
    font-size: 10px;
    color: #475569;
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
    background: #004e89;
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
    border-bottom: 1px solid #e2e8f0;
  }
  tbody tr:nth-child(even) {
    background-color: #f8fafc;
  }
  td {
    padding: 6px 8px;
    font-size: 10.5px;
  }
  td.col-rank {
    text-align: center;
    font-weight: 700;
    color: #004e89;
  }
  td.col-name {
    font-weight: 500;
    color: #0f172a;
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
    color: #64748b;
  }
  .footer {
    display: flex;
    justify-content: space-between;
    font-size: 9.5px;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
    margin-top: 8px;
  }
</style>
</head>
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
  } catch (err) {
    console.error('Share product analysis PDF error:', err);
    throw err;
  }
}

