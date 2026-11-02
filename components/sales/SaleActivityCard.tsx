import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { cleanSaleNotes, isDebtForgiven } from '@/lib/records';
import { Button, SmartChip } from '@/components/ui';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SHADOW } from '@/constants';
import { RevenueActivity } from '@/types';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

interface SaleActivityCardProps {
  item: RevenueActivity;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onDelete: (item: RevenueActivity) => void;
  generatingReceiptId: string | null;
  onGenerateReceipt: (item: RevenueActivity) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (item: RevenueActivity) => void;
  onLongPressSelect?: (item: RevenueActivity) => void;
}

export const SaleActivityCard = React.memo<SaleActivityCardProps>(({
  item,
  isExpanded,
  onToggleExpand,
  onDelete,
  generatingReceiptId,
  onGenerateReceipt,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  onLongPressSelect,
}) => {
  const isRepayment = item.kind === 'debt_repayment';
  const hasHigherPayment = !isRepayment && item.amount_paid > item.total_amount;
  const displayAmount = hasHigherPayment ? item.amount_paid : item.total_amount;
  const isGenerating = generatingReceiptId === (isRepayment ? item.id : item.sale_id);
  const initials = (item.customer_name || 'C').charAt(0).toUpperCase();

  const formattedPaymentMethod =
    item.payment_method === 'mixed'
      ? 'Mixed'
      : item.bank_name
      ? `${item.payment_method.replace('_', ' ')} · ${item.bank_name}`
      : item.payment_method?.replace('_', ' ') || 'Cash';

  return (
    <View
      style={[
        styles.card,
        isExpanded && styles.cardExpanded,
        isSelected && styles.cardSelected,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        delayPressIn={0}
        onPress={() => {
          if (isSelectionMode) {
            onToggleSelect?.(item);
          } else {
            onToggleExpand(item.id);
          }
        }}
        onLongPress={() => {
          if (isSelectionMode) {
            onToggleSelect?.(item);
          } else if (item.kind === 'sale') {
            onLongPressSelect?.(item);
          } else {
            onDelete(item);
          }
        }}
        delayLongPress={350}
      >
        {/* ── Top Header Row: Avatar, Name, Time, and Amount ── */}
        <View style={styles.cardHeader}>
          {isSelectionMode && (
            <View style={styles.selectionCheckCol}>
              <View
                style={[
                  styles.checkboxCircle,
                  isSelected && styles.checkboxCircleSelected,
                  item.kind === 'debt_repayment' && styles.checkboxCircleDisabled,
                ]}
              >
                {isSelected ? (
                  <Feather name="check" size={13} color="#FFFFFF" />
                ) : null}
              </View>
            </View>
          )}
          <View style={styles.customerInfo}>
            <View
              style={[
                styles.avatarContainer,
                { backgroundColor: isRepayment ? COLORS.successLight : COLORS.navyLight },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: FONT.bold,
                  color: isRepayment ? COLORS.success : COLORS.ink,
                }}
              >
                {initials}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {item.customer_name}
                </Text>
                {isRepayment ? (
                  <View style={styles.repaymentBadge}>
                    <Text style={styles.repaymentBadgeText}>Settlement</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.dateText}>
                {format(new Date(item.created_at), 'h:mm a')}
              </Text>
            </View>
          </View>

          <View style={styles.amountInfo}>
            <Text style={[styles.totalAmount, { color: isRepayment ? COLORS.success : COLORS.text.primary }]}>
              {isRepayment ? '+' : ''}{formatCurrency(displayAmount)}
            </Text>
            <Feather
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={15}
              color={COLORS.text.muted}
              style={{ marginTop: 2 }}
            />
          </View>
        </View>

        {/* ── Items summary preview (Upwork-style crisp details) ── */}
        {item.items_summary ? (
          <Text style={styles.itemsSummary} numberOfLines={1}>
            {item.items_summary}
          </Text>
        ) : null}

        {/* ── Smart Micro-Chips Row (Upwork Intelligence) ── */}
        <View style={styles.chipsRow}>
          {item.amount_owed > 0 && !isDebtForgiven(item.payment_status, item.notes) ? (
            <SmartChip
              label={`Owes ${formatCurrency(item.amount_owed)}`}
              deep
              variant="danger"
              size="xs"
            />
          ) : isDebtForgiven(item.payment_status, item.notes) ? (
            <SmartChip
              label="Debt Forgiven"
              deep
              variant="neutral"
              size="xs"
            />
          ) : (
            <SmartChip
              label="Fully Paid"
              deep
              variant="success"
              size="xs"
            />
          )}

          <SmartChip
            label={formattedPaymentMethod}
            icon="credit-card"
            variant="neutral"
            size="xs"
          />

          {item.sold_by_name ? (
            <SmartChip
              label={item.sold_by_name}
              icon="user"
              variant="neutral"
              size="xs"
            />
          ) : null}

          {Boolean(item.discount_amount && item.discount_amount > 0) && (
            <SmartChip
              label={`-${formatCurrency(item.discount_amount!)} OFF`}
              icon="tag"
              variant="warning"
              size="xs"
            />
          )}
        </View>

        {cleanSaleNotes(item.notes) ? (
          <View style={styles.notesContainer}>
            <Text style={styles.notesText} numberOfLines={1}>
              "{cleanSaleNotes(item.notes)}"
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedContent}>
          {item.items && item.items.length > 0 ? (
            <View style={styles.itemsList}>
              <Text style={styles.itemsHeaderText}>ITEMS SOLD</Text>
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
                    <Text style={styles.summaryLabelTotal}>Total Amount</Text>
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
                title="Edit Sale"
                icon="edit-2"
                onPress={() => router.push(`/(app)/record-sale?saleId=${item.sale_id ?? item.id}`)}
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
              />
            )}
            <Button
              title={isGenerating ? 'Preparing...' : 'Get Receipt'}
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
              <Feather name="trash-2" size={16} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    marginTop: 2,
    marginBottom: 6,
  },
  cardExpanded: {
    borderColor: COLORS.navy,
    borderWidth: 1,
    zIndex: 2,
  },
  cardSelected: {
    borderColor: COLORS.navy,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
  },
  selectionCheckCol: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCircleSelected: {
    borderColor: COLORS.navy,
    backgroundColor: COLORS.navy,
  },
  checkboxCircleDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    opacity: 0.5,
  },
  deleteActionButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: '#FEE2E2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
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
    fontSize: 11.5,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    marginTop: 1,
  },
  amountInfo: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontSize: 16,
    fontFamily: FONT.bold,
    letterSpacing: -0.3,
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
    color: COLORS.accent,
  },
});
