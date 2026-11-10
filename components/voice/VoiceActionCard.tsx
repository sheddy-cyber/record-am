// ============================================================
// RECORD AM - Voice Action Preview Card (Clean & Smart Design)
// High-clarity receipt & audit preview void of AI cliches
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { VoiceAction } from '@/types/voice';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';

interface VoiceActionCardProps {
  action: VoiceAction;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit?: () => void;
  autoConfirmSeconds?: number;
  isPaused?: boolean;
  onTogglePause?: () => void;
}

const fmt = (val: number) =>
  `${CURRENCY_SYMBOL}${Number(val || 0).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

export const VoiceActionCard: React.FC<VoiceActionCardProps> = ({
  action,
  onConfirm,
  onCancel,
  autoConfirmSeconds = 0,
  isPaused = true,
  onTogglePause,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(autoConfirmSeconds);
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  // Reset countdown whenever action or duration changes
  useEffect(() => {
    setSecondsLeft(autoConfirmSeconds);
  }, [autoConfirmSeconds, action]);

  // Auto-confirm countdown timer
  useEffect(() => {
    if (isPaused || autoConfirmSeconds <= 0) return;

    if (secondsLeft <= 0) {
      const timeout = setTimeout(() => {
        onConfirmRef.current();
      }, 0);
      return () => clearTimeout(timeout);
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft, isPaused, autoConfirmSeconds]);

  // Navigate to standard screen with prefilled details
  const handleEditInScreen = () => {
    onCancel();
    switch (action.type) {
      case 'RECORD_SALE':
        router.push('/(app)/record-sale' as any);
        break;
      case 'UPDATE_PRODUCT':
        if (action.productId) {
          router.push({ pathname: '/(app)/update-stock', params: { id: action.productId } } as any);
        } else {
          router.push('/(app)/(tabs)/_inventory' as any);
        }
        break;
      case 'RECORD_DAMAGE':
        router.push('/(app)/record-damage' as any);
        break;
      case 'RECORD_PURCHASE':
        router.push('/(app)/record-purchase' as any);
        break;
      case 'RECORD_PAYMENT':
        router.push('/(app)/debts' as any);
        break;
      case 'RECORD_EXPENSE':
        router.push('/(app)/record-expense' as any);
        break;
      case 'RECORD_DEBT':
        router.push('/(app)/record-debt' as any);
        break;
      case 'RECORD_STOCK':
        router.push('/(app)/add-stock' as any);
        break;
    }
  };

  if (action.type === 'UNKNOWN') return null;

  return (
    <View style={styles.cardContainer}>
      {/* ── Auto Confirm Countdown Banner (if enabled) ── */}
      {autoConfirmSeconds > 0 && (
        <View style={styles.countdownRow}>
          <TouchableOpacity
            onPress={onTogglePause}
            style={styles.pauseButton}
            activeOpacity={0.7}
          >
            <Feather
              name={isPaused ? 'play' : 'pause'}
              size={11}
              color="#B45309"
            />
            <Text style={styles.countdownText}>
              {isPaused
                ? 'Auto-save paused'
                : `Auto-saving in ${secondsLeft}s (Tap to pause)`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Header Badge & Title (No indicator dots, clean semantic icons) ── */}
      <View style={styles.headerRow}>
        {action.type === 'RECORD_SALE' && (
          <View style={[styles.badge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
            <Feather name="shopping-bag" size={12} color="#059669" />
            <Text style={[styles.badgeText, { color: '#059669' }]}>RECORD SALE</Text>
          </View>
        )}
        {action.type === 'UPDATE_PRODUCT' && (
          <View style={[styles.badge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <Feather name="refresh-cw" size={12} color="#2563EB" />
            <Text style={[styles.badgeText, { color: '#2563EB' }]}>STOCK & PRICE UPDATE</Text>
          </View>
        )}
        {action.type === 'RECORD_DAMAGE' && (
          <View style={[styles.badge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
            <Feather name="alert-octagon" size={12} color="#DC2626" />
            <Text style={[styles.badgeText, { color: '#DC2626' }]}>DAMAGED GOODS</Text>
          </View>
        )}
        {action.type === 'RECORD_PURCHASE' && (
          <View style={[styles.badge, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}>
            <Feather name="truck" size={12} color="#0D9488" />
            <Text style={[styles.badgeText, { color: '#0D9488' }]}>SUPPLIER PURCHASE</Text>
          </View>
        )}
        {action.type === 'RECORD_PAYMENT' && (
          <View style={[styles.badge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
            <Feather name="check-circle" size={12} color="#059669" />
            <Text style={[styles.badgeText, { color: '#059669' }]}>DEBT REPAYMENT</Text>
          </View>
        )}
        {action.type === 'RECORD_EXPENSE' && (
          <View style={[styles.badge, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <Feather name="minus-circle" size={12} color="#D97706" />
            <Text style={[styles.badgeText, { color: '#D97706' }]}>BUSINESS EXPENSE</Text>
          </View>
        )}
        {action.type === 'RECORD_DEBT' && (
          <View style={[styles.badge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
            <Feather name="user-minus" size={12} color="#7C3AED" />
            <Text style={[styles.badgeText, { color: '#7C3AED' }]}>CUSTOMER DEBT</Text>
          </View>
        )}
        {action.type === 'RECORD_STOCK' && (
          <View style={[styles.badge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <Feather name="package" size={12} color="#2563EB" />
            <Text style={[styles.badgeText, { color: '#2563EB' }]}>STOCK ENTRY</Text>
          </View>
        )}

        <View style={styles.reviewStatusPill}>
          <Feather name="check" size={10} color="#64748B" />
          <Text style={styles.reviewStatusText}>Ready to confirm</Text>
        </View>
      </View>

      {/* ── Action Content Details ── */}
      <View style={styles.contentBody}>
        {/* 1. SALE DETAILS */}
        {action.type === 'RECORD_SALE' && (
          <View>
            <View style={styles.itemsList}>
              {action.items.map((item, idx) => {
                const isCustomPrice =
                  item.catalogSellingPrice !== undefined &&
                  item.catalogSellingPrice !== item.unitPrice;
                return (
                  <View key={idx} style={styles.itemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.itemName}>
                          {item.matchedProduct ? item.matchedProduct.name : item.queryName}
                        </Text>
                        {item.matchedProduct ? (
                          <Feather name="check-circle" size={12} color="#10B981" />
                        ) : (
                          <View style={styles.newTag}>
                            <Text style={styles.newTagText}>Custom</Text>
                          </View>
                        )}
                        {isCustomPrice ? (
                          <View style={[styles.newTag, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1 }]}>
                            <Text style={[styles.newTagText, { color: '#B45309' }]}>
                              Custom Price
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <Text style={styles.itemMeta}>
                          {item.quantity} {item.unit} @ {fmt(item.unitPrice)}
                          {isCustomPrice ? ` (Catalog: ${fmt(item.catalogSellingPrice || 0)})` : ''}
                        </Text>

                        {/* Stock transition badge with Feather vector arrow */}
                        {item.availableStock !== undefined && (
                          <View style={styles.stockTransitionBadge}>
                            <Feather name="box" size={10} color="#0284C7" />
                            <Text style={styles.stockTransitionText}>
                              {item.availableStock}
                            </Text>
                            <Feather name="arrow-right" size={10} color="#0284C7" />
                            <Text style={[styles.stockTransitionText, { fontFamily: FONT.bold }]}>
                              {Math.max(0, item.availableStock - (item.stockToDeduct ?? item.quantity))} left
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <Text style={styles.itemPrice}>
                      {fmt(item.quantity * item.unitPrice)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Discount Row if any */}
            {action.discountAmount > 0 && (
              <View style={styles.discountRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="tag" size={12} color="#B45309" />
                  <Text style={styles.discountLabel}>
                    Discount {action.discountPercentage ? `(${action.discountPercentage}%)` : ''}
                  </Text>
                </View>
                <Text style={styles.discountAmount}>-{fmt(action.discountAmount)}</Text>
              </View>
            )}

            {/* Divider */}
            <View style={styles.divider} />

            {/* Subtotal, Total & Payment details */}
            <View style={styles.summaryContainer}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.metaLabel}>PAYMENT METHOD</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                  <View style={styles.methodCapsule}>
                    <Feather name="credit-card" size={11} color="#0F172A" />
                    <Text style={styles.methodCapsuleText}>
                      {action.paymentMethod === 'mixed' ? 'MIXED PAYMENT' : action.paymentMethod.toUpperCase()}
                    </Text>
                  </View>
                  {action.customerName ? (
                    <View style={[styles.methodCapsule, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                      <Feather name="user" size={11} color="#64748B" />
                      <Text style={[styles.methodCapsuleText, { color: '#0F172A' }]}>
                        {action.customerName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {action.paymentMethod === 'mixed' && (action.cashAmount !== undefined || action.transferAmount !== undefined) ? (
                  <View style={styles.mixedPaymentRow}>
                    <Text style={styles.mixedPaymentText}>
                      Cash {fmt(action.cashAmount ?? 0)} | Transfer {fmt(action.transferAmount ?? 0)}
                    </Text>
                  </View>
                ) : null}

                {action.amountOwed > 0 ? (
                  <View style={styles.owedPill}>
                    <Feather name="alert-circle" size={11} color="#7C3AED" />
                    <Text style={styles.owedPillText}>
                      Paid {fmt(action.amountPaid)} | Owed {fmt(action.amountOwed)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.totalBox}>
                {action.discountAmount > 0 ? (
                  <Text style={styles.subtotalText}>Subtotal: {fmt(action.subtotal)}</Text>
                ) : null}
                <Text style={styles.metaLabel}>TOTAL DUE</Text>
                <Text style={styles.totalValue}>{fmt(action.total)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 2. UPDATE PRODUCT DETAILS */}
        {action.type === 'UPDATE_PRODUCT' && (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Text style={styles.itemName}>{action.productName}</Text>
              <Feather name="check-circle" size={13} color="#0284C7" />
            </View>

            <View style={styles.updateGrid}>
              {action.newSellingPrice !== undefined && (
                <View style={styles.updateCard}>
                  <Text style={styles.metaLabel}>SELLING PRICE</Text>
                  <View style={styles.transitionRow}>
                    <Text style={styles.oldValText}>{fmt(action.oldSellingPrice ?? 0)}</Text>
                    <Feather name="arrow-right" size={12} color="#94A3B8" />
                    <Text style={[styles.newValText, { color: '#10B981' }]}>{fmt(action.newSellingPrice)}</Text>
                  </View>
                </View>
              )}

              {action.newCostPrice !== undefined && (
                <View style={styles.updateCard}>
                  <Text style={styles.metaLabel}>COST PRICE (PROFIT ADJUSTS)</Text>
                  <View style={styles.transitionRow}>
                    <Text style={styles.oldValText}>{fmt(action.oldCostPrice ?? 0)}</Text>
                    <Feather name="arrow-right" size={12} color="#94A3B8" />
                    <Text style={[styles.newValText, { color: '#D97706' }]}>{fmt(action.newCostPrice)}</Text>
                  </View>
                </View>
              )}

              {action.targetQuantity !== undefined && (
                <View style={styles.updateCard}>
                  <Text style={styles.metaLabel}>PHYSICAL COUNT AUDIT</Text>
                  <View style={styles.transitionRow}>
                    <Text style={styles.oldValText}>Count: {action.currentStock ?? 0}</Text>
                    <Feather name="arrow-right" size={12} color="#94A3B8" />
                    <Text style={[styles.newValText, { color: '#0284C7' }]}>{action.targetQuantity}</Text>
                  </View>
                </View>
              )}

              {action.quantityChange !== undefined && action.targetQuantity === undefined && (
                <View style={styles.updateCard}>
                  <Text style={styles.metaLabel}>
                    {action.reconciliationMethod.toUpperCase()} QUANTITY
                  </Text>
                  <View style={styles.transitionRow}>
                    <Text style={styles.oldValText}>{action.currentStock ?? 0}</Text>
                    <Feather name="arrow-right" size={12} color="#94A3B8" />
                    <Text style={[styles.newValText, { color: '#0284C7' }]}>
                      {(action.currentStock ?? 0) + action.quantityChange}
                    </Text>
                    <Text style={styles.changeBadgeText}>
                      ({action.quantityChange > 0 ? `+${action.quantityChange}` : action.quantityChange})
                    </Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.pillRow}>
              <View style={[styles.newTag, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', borderWidth: 1 }]}>
                <Text style={[styles.newTagText, { color: '#0284C7' }]}>
                  Method: {action.reconciliationMethod.toUpperCase()}
                </Text>
              </View>
              {action.costingMethod ? (
                <View style={[styles.newTag, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1 }]}>
                  <Text style={[styles.newTagText, { color: '#B45309' }]}>
                    Costing: {action.costingMethod.toUpperCase()}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* 3. DAMAGE DETAILS */}
        {action.type === 'RECORD_DAMAGE' && (
          <View>
            <View style={styles.summaryContainer}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.metaLabel}>DAMAGED PRODUCT</Text>
                <Text style={styles.itemName}>{action.productName}</Text>
                <Text style={styles.itemMeta}>
                  {action.quantity} {action.unit} @ {fmt(action.unitCost)}
                </Text>
                <Text style={[styles.itemMeta, { marginTop: 4, color: '#DC2626' }]}>
                  Reason: {action.reason}
                </Text>
                {action.deductFromProfit ? (
                  <View style={[styles.newTag, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, marginTop: 6 }]}>
                    <Text style={[styles.newTagText, { color: '#DC2626' }]}>
                      Deducted from profit & expenses: YES
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.totalBox}>
                <Text style={styles.metaLabel}>FINANCIAL LOSS</Text>
                <Text style={[styles.totalValue, { color: '#DC2626' }]}>
                  {fmt(action.totalLoss)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 4. PURCHASE DETAILS */}
        {action.type === 'RECORD_PURCHASE' && (
          <View>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.metaLabel}>SUPPLIER</Text>
              <Text style={styles.itemName}>{action.supplierName}</Text>
            </View>

            <View style={styles.itemsList}>
              {action.items.map((it, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{it.name}</Text>
                    <Text style={styles.itemMeta}>
                      +{it.quantity} {it.unit} @ {fmt(it.unitCost)}
                    </Text>
                  </View>
                  <Text style={styles.itemPrice}>{fmt(it.totalCost)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />
            <View style={styles.summaryContainer}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.metaLabel}>PAYMENT</Text>
                <Text style={styles.metaValue}>
                  {action.paymentMethod.toUpperCase()} | Paid {fmt(action.amountPaid)}
                </Text>
                {action.amountOwed > 0 ? (
                  <View style={[styles.newTag, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, marginTop: 4 }]}>
                    <Text style={[styles.newTagText, { color: '#DC2626' }]}>
                      Supplier Debt: {fmt(action.amountOwed)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.totalBox}>
                <Text style={styles.metaLabel}>TOTAL COST</Text>
                <Text style={[styles.totalValue, { color: '#0D9488' }]}>
                  {fmt(action.totalAmount)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 5. DEBT PAYMENT DETAILS */}
        {action.type === 'RECORD_PAYMENT' && (
          <View>
            <View style={styles.summaryContainer}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.metaLabel}>CUSTOMER & PAYMENT METHOD</Text>
                <Text style={styles.itemName}>{action.customerName}</Text>
                <Text style={styles.itemMeta}>
                  Method: {action.paymentMethod.toUpperCase()} | Balance settled
                </Text>
              </View>
              <View style={styles.totalBox}>
                <Text style={styles.metaLabel}>AMOUNT PAID</Text>
                <Text style={[styles.totalValue, { color: '#10B981' }]}>
                  +{fmt(action.amount)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 6. EXPENSE DETAILS */}
        {action.type === 'RECORD_EXPENSE' && (
          <View>
            <View style={styles.summaryContainer}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.metaLabel}>CATEGORY & DESCRIPTION</Text>
                <Text style={styles.itemName}>{action.description}</Text>
                <Text style={styles.itemMeta}>
                  {action.categoryLabel} | {action.paymentMethod.toUpperCase()}
                </Text>
              </View>
              <View style={styles.totalBox}>
                <Text style={styles.metaLabel}>AMOUNT</Text>
                <Text style={[styles.totalValue, { color: '#D97706' }]}>
                  {fmt(action.amount)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 7. DEBT DETAILS */}
        {action.type === 'RECORD_DEBT' && (
          <View>
            <View style={styles.summaryContainer}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.metaLabel}>CUSTOMER & DETAILS</Text>
                <Text style={styles.itemName}>{action.customerName}</Text>
                {action.customerPhone ? (
                  <Text style={styles.itemMeta}>{action.customerPhone}</Text>
                ) : null}
                <Text style={[styles.itemMeta, { marginTop: 4 }]}>
                  Note: {action.notes}
                </Text>
              </View>
              <View style={styles.totalBox}>
                <Text style={styles.metaLabel}>OWED AMOUNT</Text>
                <Text style={[styles.totalValue, { color: '#7C3AED' }]}>
                  {fmt(action.amount)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 8. SIMPLE STOCK DETAILS */}
        {action.type === 'RECORD_STOCK' && (
          <View>
            <View style={styles.itemsList}>
              {action.items.map((item, idx) => (
                <View key={idx} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.itemName}>
                        {item.matchedProduct ? item.matchedProduct.name : item.queryName}
                      </Text>
                      {item.isNewProduct ? (
                        <View style={[styles.newTag, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 }]}>
                          <Text style={[styles.newTagText, { color: '#2563EB' }]}>
                            New Item
                          </Text>
                        </View>
                      ) : (
                        <Feather name="check-circle" size={12} color="#10B981" />
                      )}
                    </View>
                    <Text style={styles.itemMeta}>
                      Adding: +{item.quantity} {item.unit}
                      {item.costPrice ? ` | Cost: ${fmt(item.costPrice)}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* ── Action Buttons ── */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.cancelBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.cancelBtnText}>Discard</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleEditInScreen}
          style={styles.editBtn}
          activeOpacity={0.7}
        >
          <Feather name="sliders" size={13} color="#0F172A" />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onConfirm}
          style={styles.confirmBtn}
          activeOpacity={0.85}
        >
          <Feather name="check" size={16} color="#FFFFFF" />
          <Text style={styles.confirmBtnText}>Confirm & Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  countdownRow: {
    marginBottom: 12,
    alignItems: 'center',
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#FEF9C3',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  countdownText: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: '#B45309',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  reviewStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reviewStatusText: {
    fontSize: 10.5,
    fontFamily: FONT.medium,
    color: '#64748B',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    letterSpacing: 0.5,
  },
  contentBody: {
    marginBottom: 14,
  },
  itemsList: {
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 14,
    fontFamily: FONT.semiBold,
    color: '#0F172A',
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: '#64748B',
  },
  itemPrice: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: '#0F172A',
  },
  newTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  newTagText: {
    fontSize: 10,
    fontFamily: FONT.bold,
  },
  stockTransitionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  stockTransitionText: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: '#0284C7',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginTop: 8,
  },
  discountLabel: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: '#B45309',
  },
  discountAmount: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: '#B45309',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  metaLabel: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: '#0F172A',
  },
  methodCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  methodCapsuleText: {
    fontSize: 11.5,
    fontFamily: FONT.bold,
    color: '#0F172A',
  },
  mixedPaymentRow: {
    marginTop: 4,
  },
  mixedPaymentText: {
    fontSize: 11,
    fontFamily: FONT.medium,
    color: '#475569',
  },
  owedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  owedPillText: {
    fontSize: 11,
    fontFamily: FONT.bold,
    color: '#7C3AED',
  },
  totalBox: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  subtotalText: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: '#64748B',
    marginBottom: 2,
  },
  totalLabel: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: '#64748B',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 20,
    fontFamily: FONT.bold,
    color: '#10B981',
    letterSpacing: -0.3,
  },
  updateGrid: {
    gap: 8,
    marginVertical: 6,
  },
  updateCard: {
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  transitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  oldValText: {
    fontSize: 13,
    fontFamily: FONT.medium,
    color: '#64748B',
  },
  newValText: {
    fontSize: 14,
    fontFamily: FONT.bold,
  },
  changeBadgeText: {
    fontSize: 11.5,
    fontFamily: FONT.medium,
    color: '#64748B',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontFamily: FONT.medium,
    color: '#64748B',
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  editBtnText: {
    fontSize: 12.5,
    fontFamily: FONT.semiBold,
    color: '#0F172A',
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: '#10B981',
  },
  confirmBtnText: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
  },
});
