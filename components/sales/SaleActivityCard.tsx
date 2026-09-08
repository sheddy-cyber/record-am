import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';
import { Button } from '@/components/ui';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
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
}

export const SaleActivityCard = React.memo<SaleActivityCardProps>(({
  item,
  isExpanded,
  onToggleExpand,
  onDelete,
  generatingReceiptId,
  onGenerateReceipt,
}) => {
  const isRepayment = item.kind === 'debt_repayment';
  const isGenerating = generatingReceiptId === (isRepayment ? item.id : item.sale_id);

  return (
    <View style={[styles.card, isExpanded && { borderColor: COLORS.accent }]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => onDelete(item)}
        onPress={() => onToggleExpand(item.id)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.customerInfo}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isRepayment ? COLORS.successLight : COLORS.accentLight },
              ]}
            >
              <Feather
                name={isRepayment ? 'arrow-down-left' : 'shopping-cart'}
                size={16}
                color={isRepayment ? COLORS.success : COLORS.accent}
              />
            </View>
            <View>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customer_name}
              </Text>
              <Text style={styles.dateText}>
                {format(new Date(item.created_at), 'h:mm a')}
              </Text>
            </View>
          </View>

          <View style={styles.amountInfo}>
            <Text style={[styles.totalAmount, { color: isRepayment ? COLORS.success : COLORS.accent }]}>
              {formatCurrency(item.total_amount)}
            </Text>
            {item.amount_owed > 0 ? (
              <View style={styles.debtBadge}>
                <Text style={styles.debtText}>
                  Owes {formatCurrency(item.amount_owed)}
                </Text>
              </View>
            ) : (
              <Text style={styles.paidText}>Fully Paid</Text>
            )}
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Feather name="credit-card" size={12} color={COLORS.text.muted} />
              <Text style={styles.metaText}>{item.payment_method.replace('_', ' ').toUpperCase()}</Text>
            </View>
          </View>

          <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.text.muted} />
        </View>

        {item.notes ? (
          <View style={styles.notesContainer}>
            <Text style={styles.notesText} numberOfLines={1}>
              "{item.notes}"
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.expandedContent}>
          {item.items && item.items.length > 0 ? (
            <View style={styles.itemsList}>
              <Text style={styles.itemsHeaderText}>ITEMS SOLD</Text>
              {item.items.map((i, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemName}>
                    {i.quantity}x {i.product_name}
                  </Text>
                  <Text style={styles.itemPrice}>
                    {formatCurrency(i.total_price)}
                  </Text>
                </View>
              ))}
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
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  customerName: {
    fontSize: 15,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  dateText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
  amountInfo: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontSize: 16,
    fontFamily: FONT.bold,
    marginBottom: 2,
  },
  debtBadge: {
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  debtText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.danger,
  },
  paidText: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: COLORS.success,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  notesContainer: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
  },
  notesText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    fontStyle: 'italic',
  },
  expandedContent: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  itemsList: {
    marginBottom: 10,
    backgroundColor: '#F7F5F0',
    borderRadius: RADIUS.md,
    padding: 10,
  },
  itemsHeaderText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
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
    gap: 8,
  },
});
