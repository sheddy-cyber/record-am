import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, CURRENCY_SYMBOL } from '@/constants';
import { calculateWeightedAverageCost } from '@/lib/costing';

export type CostStrategy = 'weighted' | 'new' | 'old';

export interface CostStrategySelectorProps {
  oldCost: number;
  newCost: number;
  currentStock: number;
  incomingQty: number;
  currentCostPrice: string;
  onSelectStrategy: (cost: number, strategy: CostStrategy) => void;
  productUnit?: string;
  isFromPurchase?: boolean;
}

const formatCount = (value: number) =>
  Number.isInteger(value)
    ? `${value}`
    : value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d*[1-9])0+$/, '$1');

export function CostStrategySelector({
  oldCost,
  newCost,
  currentStock,
  incomingQty,
  currentCostPrice,
  onSelectStrategy,
  productUnit = 'unit',
  isFromPurchase = false,
}: CostStrategySelectorProps) {
  const cleanUnit = productUnit.trim() || 'unit';
  const hasBothBatches = currentStock > 0 && incomingQty > 0;

  const weightedCost = hasBothBatches
    ? calculateWeightedAverageCost({
        currentStock,
        currentCostPrice: oldCost,
        addedQuantity: incomingQty,
        newUnitCost: newCost,
      })
    : newCost;

  const parsedCurrent = parseFloat(currentCostPrice) || 0;
  const isWeightedActive = hasBothBatches && Math.abs(parsedCurrent - weightedCost) < 0.01;
  const isNewActive = Math.abs(parsedCurrent - newCost) < 0.01;
  const isOldActive = Math.abs(parsedCurrent - oldCost) < 0.01;

  const isPriceIncrease = newCost > oldCost;
  const priceDiff = Math.abs(newCost - oldCost);
  const totalStockAfter = currentStock + incomingQty;

  return (
    <View style={styles.container}>
      {/* Alert Header */}
      <View style={styles.headerBanner}>
        <View style={[styles.iconWrapper, isPriceIncrease ? styles.iconWrapperIncrease : styles.iconWrapperDecrease]}>
          <Feather
            name={isPriceIncrease ? 'trending-up' : 'trending-down'}
            size={18}
            color={isPriceIncrease ? COLORS.warning : COLORS.navy}
          />
        </View>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Cost Price Change Detected</Text>
            <View style={[styles.diffBadge, isPriceIncrease ? styles.diffBadgeIncrease : styles.diffBadgeDecrease]}>
              <Text style={[styles.diffBadgeText, isPriceIncrease ? styles.diffBadgeTextIncrease : styles.diffBadgeTextDecrease]}>
                {isPriceIncrease ? '+' : '-'}{CURRENCY_SYMBOL}{formatCount(priceDiff)}
              </Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            You are changing your cost price. How should Record Am value your inventory?
          </Text>
        </View>
      </View>

      {/* Stock Context Breakdown */}
      <View style={styles.contextCard}>
        <View style={styles.contextItem}>
          <Text style={styles.contextLabel}>Current Stock</Text>
          <Text style={styles.contextValue}>
            {formatCount(currentStock)} {cleanUnit} @ {CURRENCY_SYMBOL}{formatCount(oldCost)}
          </Text>
        </View>
        <View style={styles.contextDivider} />
        <View style={styles.contextItem}>
          <Text style={styles.contextLabel}>{isFromPurchase ? 'New Purchase' : 'New Batch / Input'}</Text>
          <Text style={styles.contextValue}>
            {incomingQty > 0 ? `${formatCount(incomingQty)} ${cleanUnit} @ ` : ''}{CURRENCY_SYMBOL}{formatCount(newCost)}
          </Text>
        </View>
      </View>

      {/* Strategy Cards */}
      <View style={styles.optionsList}>
        {/* Option 1: Weighted Average */}
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!hasBothBatches}
          style={[
            styles.optionCard,
            isWeightedActive && styles.optionCardActive,
            !hasBothBatches && styles.optionCardDisabled,
          ]}
          onPress={() => onSelectStrategy(weightedCost, 'weighted')}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.radioAndTitle}>
              <View style={[styles.radioCircle, isWeightedActive && styles.radioCircleActive]}>
                {isWeightedActive ? <View style={styles.radioInnerDot} /> : null}
              </View>
              <View style={styles.titleWithBadge}>
                <Text style={[styles.optionTitle, isWeightedActive && styles.optionTitleActive]}>
                  Weighted Average (Balanced)
                </Text>
                <View style={styles.recommendedBadge}>
                  <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
                </View>
              </View>
            </View>
            <View style={styles.priceContainer}>
              <Text style={[styles.optionPrice, isWeightedActive && styles.optionPriceActive]}>
                {CURRENCY_SYMBOL}{formatCount(weightedCost)}
              </Text>
              <Text style={styles.priceUnit}>/ {cleanUnit}</Text>
            </View>
          </View>
          <Text style={styles.optionDescription}>
            {hasBothBatches
              ? `Balances old stock (${formatCount(currentStock)} @ ${CURRENCY_SYMBOL}${formatCount(oldCost)}) with new stock (${formatCount(incomingQty)} @ ${CURRENCY_SYMBOL}${formatCount(newCost)}) based on quantity so profit margins stay realistic.`
              : `Balances old and new stock costs proportionally. To enable this, update your Stock Quantity below with the new units added.`}
          </Text>
        </TouchableOpacity>

        {/* Option 2: Use New Cost Price */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.optionCard, isNewActive && styles.optionCardActive]}
          onPress={() => onSelectStrategy(newCost, 'new')}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.radioAndTitle}>
              <View style={[styles.radioCircle, isNewActive && styles.radioCircleActive]}>
                {isNewActive ? <View style={styles.radioInnerDot} /> : null}
              </View>
              <Text style={[styles.optionTitle, isNewActive && styles.optionTitleActive]}>
                Use New Cost Price
              </Text>
            </View>
            <View style={styles.priceContainer}>
              <Text style={[styles.optionPrice, isNewActive && styles.optionPriceActive]}>
                {CURRENCY_SYMBOL}{formatCount(newCost)}
              </Text>
              <Text style={styles.priceUnit}>/ {cleanUnit}</Text>
            </View>
          </View>
          <Text style={styles.optionDescription}>
            Applies the new price of {CURRENCY_SYMBOL}{formatCount(newCost)} across all {totalStockAfter > 0 ? `${formatCount(totalStockAfter)} ` : ''}units (both old and new). Choose this if your replacement cost is now higher.
          </Text>
        </TouchableOpacity>

        {/* Option 3: Stick with Old Cost Price */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.optionCard, isOldActive && styles.optionCardActive]}
          onPress={() => onSelectStrategy(oldCost, 'old')}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.radioAndTitle}>
              <View style={[styles.radioCircle, isOldActive && styles.radioCircleActive]}>
                {isOldActive ? <View style={styles.radioInnerDot} /> : null}
              </View>
              <Text style={[styles.optionTitle, isOldActive && styles.optionTitleActive]}>
                Stick with Old Cost Price
              </Text>
            </View>
            <View style={styles.priceContainer}>
              <Text style={[styles.optionPrice, isOldActive && styles.optionPriceActive]}>
                {CURRENCY_SYMBOL}{formatCount(oldCost)}
              </Text>
              <Text style={styles.priceUnit}>/ {cleanUnit}</Text>
            </View>
          </View>
          <Text style={styles.optionDescription}>
            Keeps your current catalog cost at {CURRENCY_SYMBOL}{formatCount(oldCost)}. The new purchase price is saved for record keeping, but your catalog cost and profit margins remain unchanged.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -4,
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 12,
  },
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconWrapperIncrease: {
    backgroundColor: COLORS.warningLight,
  },
  iconWrapperDecrease: {
    backgroundColor: COLORS.infoLight,
  },
  headerContent: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.ink,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  diffBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
  },
  diffBadgeIncrease: {
    backgroundColor: COLORS.warningLight,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  diffBadgeDecrease: {
    backgroundColor: COLORS.infoLight,
    borderWidth: 1,
    borderColor: COLORS.navy,
  },
  diffBadgeText: {
    fontSize: 11,
    fontFamily: FONT.bold,
  },
  diffBadgeTextIncrease: {
    color: COLORS.warning,
  },
  diffBadgeTextDecrease: {
    color: COLORS.navy,
  },
  contextCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  contextItem: {
    flex: 1,
  },
  contextLabel: {
    fontSize: 10,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  contextValue: {
    fontSize: 12,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginTop: 1,
  },
  contextDivider: {
    width: 1,
    height: '80%',
    backgroundColor: COLORS.border,
    marginHorizontal: 10,
  },
  optionsList: {
    gap: 8,
  },
  optionCard: {
    padding: 12,
    borderRadius: RADIUS.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 6,
  },
  optionCardActive: {
    backgroundColor: COLORS.accentLight,
    borderColor: COLORS.accent,
  },
  optionCardDisabled: {
    opacity: 0.6,
    backgroundColor: COLORS.surface,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  radioAndTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioCircleActive: {
    borderColor: COLORS.accent,
  },
  radioInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  titleWithBadge: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  optionTitleActive: {
    color: COLORS.accentMuted,
  },
  recommendedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: RADIUS.xs,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  optionPrice: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  optionPriceActive: {
    color: COLORS.accentMuted,
  },
  priceUnit: {
    fontSize: 10,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  optionDescription: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    lineHeight: 15,
    paddingLeft: 26,
  },
});
