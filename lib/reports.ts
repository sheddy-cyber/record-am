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
    `Thank you.\n_${businessName}_\n_Powered by Record Am - Designed by PYTHRON_`;

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
