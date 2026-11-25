// ============================================================
// RECORD AM - Voice preview
// Every command is shown the same way: what kind of record it is, the lines
// it will write, and the totals. Plain receipt language, nothing decorative.
// ============================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon, IconName } from '@/components/icons';
import { COLORS, CURRENCY_SYMBOL, FONT, TYPE } from '@/constants';
import { VoiceAction } from '@/types/voice';

const money = (val: number | undefined) =>
  `${CURRENCY_SYMBOL}${Number(val || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

const qty = (n: number) => Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  pos: 'POS',
  mobile_money: 'Mobile money',
  mixed: 'Split payment',
  other: 'On credit',
};

const KIND: Record<Exclude<VoiceAction['type'], 'UNKNOWN'>, { label: string; icon: IconName }> = {
  RECORD_SALE: { label: 'Sale', icon: 'receipt' },
  UPDATE_PRODUCT: { label: 'Product update', icon: 'edit-2' },
  RECORD_STOCK: { label: 'Stock in', icon: 'box' },
  RECORD_DAMAGE: { label: 'Damaged stock', icon: 'alert-triangle' },
  RECORD_PURCHASE: { label: 'Purchase', icon: 'truck' },
  RECORD_PAYMENT: { label: 'Debt payment', icon: 'cash' },
  RECORD_DEBT: { label: 'New debt', icon: 'user' },
  RECORD_EXPENSE: { label: 'Expense', icon: 'credit-card' },
};

// ─── Building blocks ────────────────────────────────────────────────────────

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'good' | 'bad' | 'muted' }) {
  const color =
    tone === 'good' ? COLORS.successText : tone === 'bad' ? COLORS.dangerText : tone === 'muted' ? COLORS.text.muted : COLORS.text.primary;
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && { color: COLORS.text.primary, fontFamily: FONT.semiBold }]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.lineValueStrong, { color }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Item({ title, detail, amount, flag }: { title: string; detail?: string; amount?: string; flag?: string }) {
  return (
    <View style={styles.item}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {title}
        </Text>
        {detail ? <Text style={styles.itemDetail}>{detail}</Text> : null}
        {flag ? <Text style={styles.itemFlag}>{flag}</Text> : null}
      </View>
      {amount ? <Text style={styles.itemAmount}>{amount}</Text> : null}
    </View>
  );
}

const Rule = () => <View style={styles.rule} />;

function Change({ label, from, to }: { label: string; from?: string; to?: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {from ? <Text style={[styles.lineValue, { color: COLORS.text.muted, textDecorationLine: 'line-through' }]}>{from}</Text> : null}
        {from ? <Icon name="arrow-right" size={13} color={COLORS.text.muted} /> : null}
        <Text style={[styles.lineValue, { fontFamily: FONT.semiBold }]}>{to}</Text>
      </View>
    </View>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

export function VoiceActionCard({ action }: { action: VoiceAction }) {
  if (action.type === 'UNKNOWN') return null;
  const kind = KIND[action.type];

  let body: React.ReactNode = null;

  switch (action.type) {
    case 'RECORD_SALE': {
      const credit = Boolean(action.isCredit) || action.amountOwed > 0;
      body = (
        <>
          {action.items.map((it, i) => {
            const remaining =
              it.availableStock !== undefined && it.stockToDeduct !== undefined ? it.availableStock - it.stockToDeduct : undefined;
            return (
              <Item
                key={`${it.queryName}-${i}`}
                title={`${qty(it.quantity)} × ${it.matchedProduct?.name ?? it.queryName}`}
                detail={`${money(it.unitPrice)} per ${it.unit}${
                  it.catalogSellingPrice !== undefined && it.unitPrice !== it.catalogSellingPrice
                    ? ` (list ${money(it.catalogSellingPrice)})`
                    : ''
                }`}
                amount={money(it.unitPrice * it.quantity - (it.discountAmount || 0))}
                flag={remaining !== undefined && remaining <= (it.matchedProduct?.reorder_level ?? 0) ? `${qty(Math.max(remaining, 0))} left after this sale` : undefined}
              />
            );
          })}
          <Rule />
          {action.discountAmount > 0 ? (
            <>
              <Line label="Subtotal" value={money(action.subtotal)} />
              <Line
                label={action.discountPercentage ? `Discount (${action.discountPercentage}%)` : 'Discount'}
                value={`−${money(action.discountAmount)}`}
              />
            </>
          ) : null}
          <Line label="Total" value={money(action.total)} strong />
          {credit ? (
            <>
              <Line label="Paid now" value={money(action.amountPaid)} />
              <Line label="Owes" value={money(action.amountOwed)} tone="bad" />
            </>
          ) : null}
          {action.paymentMethod === 'mixed' && (action.cashAmount !== undefined || action.transferAmount !== undefined) ? (
            <Line label="Split" value={`${money(action.cashAmount)} cash · ${money(action.transferAmount)} transfer`} />
          ) : (
            <Line label="Payment" value={credit && action.amountPaid === 0 ? 'On credit' : METHOD_LABEL[action.paymentMethod] ?? action.paymentMethod} />
          )}
          <Line
            label="Customer"
            value={action.customerName ? `${action.customerName}${action.matchedCustomer ? '' : ' (new)'}` : 'Walk-in'}
            tone={action.customerName ? undefined : 'muted'}
          />
        </>
      );
      break;
    }

    case 'UPDATE_PRODUCT': {
      const stockTo =
        action.targetQuantity !== undefined
          ? action.targetQuantity
          : action.quantityChange !== undefined
          ? (action.currentStock ?? 0) + action.quantityChange
          : undefined;
      body = (
        <>
          <Item title={action.productName} />
          <Rule />
          {action.newSellingPrice !== undefined ? (
            <Change label="Selling price" from={money(action.oldSellingPrice)} to={money(action.newSellingPrice)} />
          ) : null}
          {action.newCostPrice !== undefined ? (
            <Change label="Cost price" from={money(action.oldCostPrice)} to={money(action.newCostPrice)} />
          ) : null}
          {stockTo !== undefined ? <Change label="Stock" from={qty(action.currentStock ?? 0)} to={qty(stockTo)} /> : null}
          {action.newCostPrice !== undefined && action.quantityChange ? (
            <Line
              label="Costing"
              value={action.costingMethod === 'replace' ? 'Use new cost' : action.costingMethod === 'keep' ? 'Keep old cost' : 'Average old and new'}
            />
          ) : null}
        </>
      );
      break;
    }

    case 'RECORD_STOCK':
      body = (
        <>
          {action.items.map((it, i) => (
            <Item
              key={`${it.queryName}-${i}`}
              title={`${qty(it.quantity)} × ${it.matchedProduct?.name ?? it.queryName}`}
              detail={[
                it.costPrice !== undefined ? `cost ${money(it.costPrice)}` : null,
                it.sellingPrice !== undefined ? `sells at ${money(it.sellingPrice)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              flag={it.isNewProduct ? 'New product, will be added to your stock list' : undefined}
            />
          ))}
          {action.supplierName ? (
            <>
              <Rule />
              <Line label="Supplier" value={action.supplierName} />
            </>
          ) : null}
        </>
      );
      break;

    case 'RECORD_DAMAGE':
      body = (
        <>
          <Item title={`${qty(action.quantity)} × ${action.productName}`} detail={action.reason} />
          <Rule />
          <Line label="Value lost" value={money(action.totalLoss)} tone="bad" strong />
          <Line label="Counts against profit" value={action.deductFromProfit ? 'Yes' : 'No'} />
        </>
      );
      break;

    case 'RECORD_PURCHASE':
      body = (
        <>
          {action.items.map((it, i) => (
            <Item
              key={`${it.name}-${i}`}
              title={`${qty(it.quantity)} × ${it.name}`}
              detail={`${money(it.unitCost)} per ${it.unit}`}
              amount={money(it.totalCost)}
              flag={!it.productId ? 'Not in your stock list yet' : undefined}
            />
          ))}
          <Rule />
          <Line label="Total" value={money(action.totalAmount)} strong />
          <Line label="Paid" value={money(action.amountPaid)} />
          {action.amountOwed > 0 ? <Line label="You owe" value={money(action.amountOwed)} tone="bad" /> : null}
          <Line label="Supplier" value={action.supplierName} />
        </>
      );
      break;

    case 'RECORD_PAYMENT':
      body = (
        <>
          <Line label="From" value={action.customerName} strong />
          <Line label="Amount" value={money(action.amount)} tone="good" />
          <Line label="Method" value={METHOD_LABEL[action.paymentMethod] ?? action.paymentMethod} />
          {!action.matchedCustomer ? <Text style={styles.note}>No existing debt found for this name. Check the spelling before saving.</Text> : null}
        </>
      );
      break;

    case 'RECORD_DEBT':
      body = (
        <>
          <Line label="Customer" value={`${action.customerName}${action.matchedCustomer ? '' : ' (new)'}`} strong />
          <Line label="Amount owed" value={money(action.amount)} tone="bad" />
          {action.dueDate ? <Line label="Due" value={action.dueDate} /> : null}
          {action.notes ? <Line label="Note" value={action.notes} /> : null}
        </>
      );
      break;

    case 'RECORD_EXPENSE':
      body = (
        <>
          <Line label="Category" value={action.categoryLabel} strong />
          <Line label="Amount" value={money(action.amount)} />
          {action.description && action.description !== action.categoryLabel ? <Line label="For" value={action.description} /> : null}
          <Line label="Paid by" value={METHOD_LABEL[action.paymentMethod] ?? action.paymentMethod} />
        </>
      );
      break;
  }

  return (
    <View style={styles.card}>
      <View style={styles.kind}>
        <Icon name={kind.icon} size={15} color={COLORS.text.secondary} />
        <Text style={styles.kindLabel}>{kind.label}</Text>
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  kindLabel: { fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.secondary },
  item: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
  itemTitle: { fontSize: 15.5, fontFamily: FONT.medium, color: COLORS.text.primary, letterSpacing: -0.2 },
  itemDetail: { ...TYPE.footnote, color: COLORS.text.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  itemFlag: { ...TYPE.footnote, color: COLORS.warningText, marginTop: 3 },
  itemAmount: { fontSize: 15.5, fontFamily: FONT.semiBold, color: COLORS.text.primary, fontVariant: ['tabular-nums'] },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: 8 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, gap: 16 },
  lineLabel: { fontSize: 14, fontFamily: FONT.regular, color: COLORS.text.secondary },
  lineValue: { fontSize: 14.5, fontFamily: FONT.medium, color: COLORS.text.primary, textAlign: 'right', flexShrink: 1, fontVariant: ['tabular-nums'] },
  lineValueStrong: { fontSize: 18, fontFamily: FONT.semiBold, letterSpacing: -0.3 },
  note: { ...TYPE.footnote, color: COLORS.warningText, marginTop: 6, lineHeight: 17 },
});
