import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable, TouchableOpacity } from '@/components/ui/touchables';
import { Icon } from '@/components/icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { cleanSaleNotes, isDebtForgiven } from '@/lib/records';
import { Avatar, Button } from '@/components/ui';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW } from '@/constants';
import { RevenueActivity } from '@/types';
import { haptics } from '@/lib/haptics';
import { useSaleSelection } from '@/store/saleSelectionStore';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.muted }}>{label}</Text>
      <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** What a card shows about the sale. */
function describe(item: RevenueActivity) {
  const isRepayment = item.kind === 'debt_repayment';
  const hasHigherPayment = !isRepayment && item.amount_paid > item.total_amount;
  const displayAmount = hasHigherPayment ? item.amount_paid : item.total_amount;
  const methodName =
    item.payment_method === 'mixed'
      ? 'Split payment'
      : item.payment_method === 'pos'
      ? 'POS'
      : (item.payment_method?.replace('_', ' ') || 'cash').replace(/^\w/, (c) => c.toUpperCase());
  const formattedPaymentMethod = item.bank_name ? `${methodName} · ${item.bank_name}` : methodName;
  return { isRepayment, hasHigherPayment, displayAmount, formattedPaymentMethod };
}

/** Avatar, name, items and amount. Memoised: selecting a card never redraws it. */
const CardSummary = React.memo(function CardSummary({ item }: { item: RevenueActivity }) {
  const { isRepayment, displayAmount, formattedPaymentMethod } = describe(item);
  return (
    <>
    <Avatar name={item.customer_name || 'Walk-in'} size={38} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.customerName} numberOfLines={1}>
        {item.customer_name || 'Walk-in customer'}
      </Text>
      <Text style={styles.dateText} numberOfLines={1}>
        {isRepayment ? 'Debt payment' : item.items_summary || 'Sale'} · {format(new Date(item.created_at), 'h:mm a')}
      </Text>
    </View>
    <View style={styles.amountInfo}>
      <Text style={[styles.totalAmount, isRepayment && { color: COLORS.successText }]}>
        {isRepayment ? '+' : ''}
        {formatCurrency(displayAmount)}
      </Text>
      <Text
        style={[
          styles.statusText,
          item.amount_owed > 0 && !isDebtForgiven(item.payment_status, item.notes) && { color: COLORS.dangerText },
        ]}
        numberOfLines={1}
      >
        {item.amount_owed > 0 && !isDebtForgiven(item.payment_status, item.notes)
          ? `Owes ${formatCurrency(item.amount_owed)}`
          : isDebtForgiven(item.payment_status, item.notes)
          ? 'Debt forgiven'
          : formattedPaymentMethod}
      </Text>
    </View>
    </>
  );
});

const CardDetails = React.memo(function CardDetails({
  item,
  isGenerating,
  onDelete,
  onGenerateReceipt,
}: {
  item: RevenueActivity;
  isGenerating: boolean;
  onDelete: (item: RevenueActivity) => void;
  onGenerateReceipt: (item: RevenueActivity) => void;
}) {
  const { isRepayment, hasHigherPayment, displayAmount, formattedPaymentMethod } = describe(item);
  return (
    <View style={styles.expandedContent}>
      <View style={styles.detailGrid}>
        <Detail label="Payment" value={formattedPaymentMethod} />
        {item.sold_by_name ? <Detail label="Recorded by" value={item.sold_by_name} /> : null}
        {item.reference ? <Detail label="Reference" value={item.reference} /> : null}
        {cleanSaleNotes(item.notes) ? <Detail label="Note" value={cleanSaleNotes(item.notes)} /> : null}
      </View>
      {item.items && item.items.length > 0 ? (
        <View style={styles.itemsList}>
          <Text style={styles.itemsHeaderText}>Items</Text>
          {(() => {
            const totalBaseAmount = item.items.reduce((sum, it) => sum + (it.total_price || 0), 0) || item.total_amount || 1;
            let remainingCalculatedTotal = hasHigherPayment ? item.amount_paid : 0;

            return item.items.map((i, idx) => {
              let itemTotalPrice = i.total_price;
              let itemUnitPrice = i.unit_price;

              if (hasHigherPayment) {
                if (item.items!.length === 1) {
                  itemTotalPrice = item.amount_paid;
                } else if (idx === item.items!.length - 1) {
                  itemTotalPrice = remainingCalculatedTotal;
                } else {
                  itemTotalPrice = Number(((i.total_price / totalBaseAmount) * item.amount_paid).toFixed(2));
                  remainingCalculatedTotal = Number((remainingCalculatedTotal - itemTotalPrice).toFixed(2));
                }
                const qty = i.quantity || 1;
                itemUnitPrice = Number((itemTotalPrice / qty).toFixed(2));
              } else if (itemUnitPrice === undefined && i.quantity > 0) {
                itemUnitPrice = Number((itemTotalPrice / i.quantity).toFixed(2));
              }

              return (
                <View key={idx} style={styles.itemRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.itemName}>
                      {i.quantity}x{' '}
                      {i.product_name &&
                      i.product_name !== 'Unknown Item' &&
                      i.product_name !== 'Unknown'
                        ? i.product_name
                        : 'Item'}
                    </Text>
                    {itemUnitPrice !== undefined ? (
                      <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 1 }}>
                        {formatCurrency(itemUnitPrice)} each
                      </Text>
                    ) : null}
                    {Boolean(i.discount_amount && i.discount_amount > 0 && !hasHigherPayment) && (
                      <Text style={styles.itemDiscountText}>
                        Discount: -{formatCurrency(i.discount_amount!)}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.itemPrice}>
                    {formatCurrency(itemTotalPrice)}
                  </Text>
                </View>
              );
            });
          })()}

          {Boolean(item.discount_amount && item.discount_amount > 0 && !hasHigherPayment) && (
            <View style={styles.totalsBreakdown}>
              <View style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryValue}>
                  {formatCurrency(item.subtotal && item.subtotal > 0 ? item.subtotal : (item.total_amount + item.discount_amount!))}
                </Text>
              </View>
              <View style={styles.summaryLine}>
                <Text style={[styles.summaryLabel, { color: COLORS.warning }]}>Discount</Text>
                <Text style={[styles.summaryValue, { color: COLORS.warning }]}>
                  -{formatCurrency(item.discount_amount!)}
                </Text>
              </View>
              <View style={[styles.summaryLine, styles.summaryLineTotal]}>
                <Text style={styles.summaryLabelTotal}>Total</Text>
                <Text style={styles.summaryValueTotal}>
                  {formatCurrency(displayAmount)}
                </Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        <Text style={[styles.notesText, { marginTop: 10 }]}>No item details available.</Text>
      )}

      <View style={styles.expandedActions}>
        {!isRepayment && (
          <Button
            title="Edit"
            icon="edit-2"
            onPress={() => router.push(`/(app)/record-sale?saleId=${item.sale_id ?? item.id}`)}
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
          />
        )}
        <Button
          title={isGenerating ? 'Preparing…' : 'Receipt'}
          icon="file-text"
          disabled={isGenerating}
          loading={isGenerating}
          onPress={() => onGenerateReceipt(item)}
          variant="primary"
          size="sm"
          style={{ flex: 1 }}
        />
        <TouchableOpacity
          style={styles.deleteActionButton}
          onPress={() => onDelete(item)}
          activeOpacity={0.7}
          accessibilityLabel="Delete record"
        >
          <Icon name="trash-2" size={16} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

/** The checkbox shown in selection mode. Tapping it toggles the sale too. */
function SelectionCheck({ selected, disabled, onPress }: { selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.selectionCheckCol}>
      <View style={[styles.checkboxCircle, selected && styles.checkboxCircleSelected, disabled && styles.checkboxCircleDisabled]}>
        {selected ? <Icon name="check" size={13} color="#FFFFFF" /> : null}
      </View>
    </Pressable>
  );
}

interface CardBodyProps {
  item: RevenueActivity;
  onToggleExpand: (id: string) => void;
  onDelete: (item: RevenueActivity) => void;
  onToggleSelect?: (item: RevenueActivity) => void;
  onLongPressSelect?: (item: RevenueActivity) => void;
}

/**
 * The tappable part of the card. It takes no selection props (it reads the
 * selection only when touched), so entering or leaving selection mode never
 * re-renders it.
 */
const CardBody = React.memo(function CardBody({ item, onToggleExpand, onDelete, onToggleSelect, onLongPressSelect }: CardBodyProps) {
  return (
    <TouchableOpacity
      style={styles.cardBody}
      activeOpacity={0.7}
      onPress={() => {
        if (useSaleSelection.getState().ids.size > 0) {
          onToggleSelect?.(item);
        } else {
          onToggleExpand(item.id);
        }
      }}
      onLongPress={() => {
        if (useSaleSelection.getState().ids.size > 0) {
          onToggleSelect?.(item);
        } else if (item.kind === 'sale') {
          haptics.press();
          onLongPressSelect?.(item);
        } else {
          onDelete(item);
        }
      }}
      delayLongPress={280}
    >
      <View style={styles.cardHeader}>
        <CardSummary item={item} />
      </View>
    </TouchableOpacity>
  );
});

interface SaleActivityCardProps extends CardBodyProps {
  isExpanded: boolean;
  generatingReceiptId: string | null;
  onGenerateReceipt: (item: RevenueActivity) => void;
}

export const SaleActivityCard = React.memo<SaleActivityCardProps>(({
  item,
  isExpanded,
  onToggleExpand,
  onDelete,
  generatingReceiptId,
  onGenerateReceipt,
  onToggleSelect,
  onLongPressSelect,
}) => {
  // Read straight from the selection store, so entering selection mode updates
  // every card, the header and the action bar in the same frame. Only this
  // frame and the checkbox re-render; the body and details are memoised.
  const isSelectionMode = useSaleSelection((s) => s.ids.size > 0);
  const isSelected = useSaleSelection((s) => s.ids.has(item.id));
  const isGenerating = generatingReceiptId === (item.kind === 'debt_repayment' ? item.id : item.sale_id);

  return (
    <View style={[styles.card, isExpanded && styles.cardExpanded, isSelected && styles.cardSelected]}>
      <View style={styles.cardRow}>
        {isSelectionMode ? (
          <SelectionCheck
            selected={isSelected}
            disabled={item.kind === 'debt_repayment'}
            onPress={() => onToggleSelect?.(item)}
          />
        ) : null}
        <CardBody
          item={item}
          onToggleExpand={onToggleExpand}
          onDelete={onDelete}
          onToggleSelect={onToggleSelect}
          onLongPressSelect={onLongPressSelect}
        />
      </View>

      {isExpanded ? (
        <CardDetails item={item} isGenerating={isGenerating} onDelete={onDelete} onGenerateReceipt={onGenerateReceipt} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    marginTop: 2,
    marginBottom: 8,
  },
  cardExpanded: {
    borderColor: COLORS.borderDark,
    zIndex: 2,
  },
  cardSelected: {
    borderColor: COLORS.navy,
    backgroundColor: '#F5F3EE',
    borderWidth: 1,
  },
  selectionCheckCol: {
    // 10 + the 12 gap the checkbox used to share with the avatar.
    marginRight: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#D3CEC2',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCircleSelected: {
    borderColor: COLORS.navy,
    backgroundColor: COLORS.navy,
  },
  checkboxCircleDisabled: {
    borderColor: '#E6E2D9',
    backgroundColor: '#EDEAE3',
    opacity: 0.5,
  },
  deleteActionButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: '#F5DAD4',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EECAC2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardBody: { flex: 1 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  customerName: {
    fontSize: 15,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  statusText: {
    fontSize: 12.5,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  detailGrid: {
    paddingTop: 10,
    marginBottom: 4,
  },
  repaymentBadge: {
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: RADIUS.xs,
  },
  repaymentBadgeText: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: COLORS.success,
    letterSpacing: 0.2,
  },
  dateText: {
    fontSize: 12.5,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 2,
  },
  amountInfo: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontSize: 15.5,
    fontFamily: FONT.semiBold,
    color: COLORS.text.primary,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  itemsSummary: {
    fontSize: 12.5,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginBottom: 9,
    lineHeight: 17,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  notesContainer: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderSubtle,
  },
  notesText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    fontStyle: 'italic',
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderSubtle,
  },
  itemsList: {
    marginBottom: 12,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.borderSubtle,
  },
  itemsHeaderText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSubtle,
  },
  itemName: {
    fontSize: 13,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
    flex: 1,
    paddingRight: 10,
  },
  itemPrice: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  expandedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemDiscountText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.warning,
    marginTop: 2,
  },
  totalsBreakdown: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderSubtle,
    gap: 4,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  summaryValue: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
  },
  summaryLineTotal: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderSubtle,
  },
  summaryLabelTotal: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  summaryValueTotal: {
    fontSize: 14.5,
    fontFamily: FONT.bold,
    color: COLORS.ink,
  },
});
