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
  selectedStrategy?: CostStrategy;
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
  selectedStrategy,
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

  const isWeightedActive = selectedStrategy === 'weighted';
  const isNewActive = selectedStrategy === 'new';
  const isOldActive = selectedStrategy === 'old';

  const isPriceIncrease = newCost > oldCost;
  const priceDiff = Math.abs(newCost - oldCost);
  const totalStockAfter = currentStock + incomingQty;

  return (
    <View style={styles.container}>
      {/* ── Header Ribbon (Upwork Smart Alert) ── */}
      <View style={styles.headerBanner}>
        <View
          style={[
            styles.avatarIcon,
            isPriceIncrease ? styles.avatarIncrease : styles.avatarDecrease,
          ]}
        >
          <Feather
            name={isPriceIncrease ? 'trending-up' : 'trending-down'}
            size={17}
            color="#FFFFFF"
          />
        </View>

        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Cost Price Change</Text>
            <View
              style={[
                styles.diffPill,
                isPriceIncrease ? styles.diffPillIncrease : styles.diffPillDecrease,
              ]}
            >
              <Text style={styles.diffPillText}>
                {isPriceIncrease ? '+' : '-'}
                {CURRENCY_SYMBOL}
                {formatCount(priceDiff)} / {cleanUnit}
              </Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            How should Record Am value your inventory across old and new stock?
          </Text>
        </View>
      </View>

      {/* ── Smart Data Strip: On Hand vs Incoming ── */}
      <View style={styles.contextCard}>
        <View style={styles.contextItem}>
          <View style={styles.contextLabelRow}>
            <Feather name="box" size={11} color={COLORS.text.muted} />
            <Text style={styles.contextLabel}>CURRENT ON-HAND</Text>
          </View>
          <Text style={styles.contextValue}>
            {formatCount(currentStock)} {cleanUnit}
          </Text>
          <Text style={styles.contextSub}>
            @ {CURRENCY_SYMBOL}{formatCount(oldCost)} each
          </Text>
        </View>

        <View style={styles.contextDivider} />

        <View style={styles.contextItem}>
          <View style={styles.contextLabelRow}>
            <Feather name="truck" size={11} color={COLORS.text.muted} />
            <Text style={styles.contextLabel}>
              {isFromPurchase ? 'PURCHASED BATCH' : 'INCOMING BATCH'}
            </Text>
          </View>
          <Text style={styles.contextValue}>
            {incomingQty > 0 ? `${formatCount(incomingQty)} ${cleanUnit}` : 'New Rate'}
          </Text>
          <Text style={styles.contextSub}>
            @ {CURRENCY_SYMBOL}{formatCount(newCost)} each
          </Text>
        </View>
      </View>

      {/* ── Strategy Options (Upwork Intelligence Cards) ── */}
      <View style={styles.optionsList}>
        {/* Option 1: Weighted Average */}
        <TouchableOpacity
          activeOpacity={0.75}
          disabled={!hasBothBatches}
          style={[
            styles.optionCard,
            isWeightedActive && styles.optionCardActive,
            !hasBothBatches && styles.optionCardDisabled,
          ]}
          onPress={() => {
            if (isWeightedActive) return;
            onSelectStrategy(weightedCost, 'weighted');
          }}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.radioAndTitle}>
              <View
                style={[
                  styles.radioCircle,
                  isWeightedActive && styles.radioCircleActive,
                ]}
              >
                {isWeightedActive ? (
                  <Feather name="check" size={11} color="#FFFFFF" />
                ) : null}
              </View>

              <View style={styles.titleCol}>
                <View style={styles.titleBadgeRow}>
                  <Text
                    style={[
                      styles.optionTitle,
                      isWeightedActive && styles.optionTitleActive,
                    ]}
                  >
                    Weighted Average
                  </Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.priceContainer}>
              <Text
                style={[
                  styles.optionPrice,
                  isWeightedActive && styles.optionPriceActive,
                ]}
              >
                {CURRENCY_SYMBOL}{formatCount(weightedCost)}
              </Text>
              <Text style={styles.priceUnit}>/ {cleanUnit}</Text>
            </View>
          </View>

          <Text style={styles.optionDescription}>
            {hasBothBatches
              ? `Blends current stock (${formatCount(currentStock)} @ ${CURRENCY_SYMBOL}${formatCount(oldCost)}) with incoming stock (${formatCount(incomingQty)} @ ${CURRENCY_SYMBOL}${formatCount(newCost)}) so your profit margins remain balanced.`
              : `Blends old and new stock costs proportionally. To enable, enter your added units in the Stock Quantity field.`}
          </Text>
        </TouchableOpacity>

        {/* Option 2: Use New Cost Price */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={[
            styles.optionCard,
            isNewActive && styles.optionCardActive,
          ]}
          onPress={() => {
            if (isNewActive) return;
            onSelectStrategy(newCost, 'new');
          }}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.radioAndTitle}>
              <View
                style={[
                  styles.radioCircle,
                  isNewActive && styles.radioCircleActive,
                ]}
              >
                {isNewActive ? (
                  <Feather name="check" size={11} color="#FFFFFF" />
                ) : null}
              </View>

              <View style={styles.titleCol}>
                <View style={styles.titleBadgeRow}>
                  <Text
                    style={[
                      styles.optionTitle,
                      isNewActive && styles.optionTitleActive,
                    ]}
                  >
                    Use New Cost Price
                  </Text>
                  <View style={styles.marketBadge}>
                    <Text style={styles.marketBadgeText}>MARKET REPLACEMENT</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.priceContainer}>
              <Text
                style={[
                  styles.optionPrice,
                  isNewActive && styles.optionPriceActive,
                ]}
              >
                {CURRENCY_SYMBOL}{formatCount(newCost)}
              </Text>
              <Text style={styles.priceUnit}>/ {cleanUnit}</Text>
            </View>
          </View>

          <Text style={styles.optionDescription}>
            Revalues all inventory ({totalStockAfter > 0 ? `${formatCount(totalStockAfter)} ` : ''}{cleanUnit}) to {CURRENCY_SYMBOL}{formatCount(newCost)}. Best when replacement cost has permanently risen.
          </Text>
        </TouchableOpacity>

        {/* Option 3: Stick with Old Cost Price */}
        <TouchableOpacity
          activeOpacity={0.75}
          style={[
            styles.optionCard,
            isOldActive && styles.optionCardActive,
          ]}
          onPress={() => {
            if (isOldActive) return;
            onSelectStrategy(oldCost, 'old');
          }}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.radioAndTitle}>
              <View
                style={[
                  styles.radioCircle,
                  isOldActive && styles.radioCircleActive,
                ]}
              >
                {isOldActive ? (
                  <Feather name="check" size={11} color="#FFFFFF" />
                ) : null}
              </View>

              <View style={styles.titleCol}>
                <View style={styles.titleBadgeRow}>
                  <Text
                    style={[
                      styles.optionTitle,
                      isOldActive && styles.optionTitleActive,
                    ]}
                  >
                    Stick with Old Cost Price
                  </Text>
                  <View style={styles.baselineBadge}>
                    <Text style={styles.baselineBadgeText}>PRESERVE CATALOG</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.priceContainer}>
              <Text
                style={[
                  styles.optionPrice,
                  isOldActive && styles.optionPriceActive,
                ]}
              >
                {CURRENCY_SYMBOL}{formatCount(oldCost)}
              </Text>
              <Text style={styles.priceUnit}>/ {cleanUnit}</Text>
            </View>
          </View>

          <Text style={styles.optionDescription}>
            Keeps current catalog cost at {CURRENCY_SYMBOL}{formatCount(oldCost)}. The new purchase price is recorded for history, but catalog margins stay unchanged.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  avatarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarIncrease: {
    backgroundColor: '#D97706',
  },
  avatarDecrease: {
    backgroundColor: '#0284C7',
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
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  diffPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diffPillIncrease: {
    backgroundColor: '#B45309',
  },
  diffPillDecrease: {
    backgroundColor: '#0369A1',
  },
  diffPillText: {
    fontSize: 10,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  contextCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  contextItem: {
    flex: 1,
  },
  contextLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  contextLabel: {
    fontSize: 9.5,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    letterSpacing: 0.5,
  },
  contextValue: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  contextSub: {
    fontSize: 10.5,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 1,
  },
  contextDivider: {
    width: StyleSheet.hairlineWidth,
    height: '75%',
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  optionsList: {
    gap: 8,
  },
  optionCard: {
    padding: 13,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  optionCardActive: {
    backgroundColor: '#F0F9FF',
    borderColor: COLORS.navy,
    borderWidth: 1.5,
  },
  optionCardDisabled: {
    opacity: 0.55,
    backgroundColor: '#F1F5F9',
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
    gap: 9,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioCircleActive: {
    borderColor: COLORS.navy,
    backgroundColor: COLORS.navy,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionTitle: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.1,
  },
  optionTitleActive: {
    color: COLORS.navy,
  },
  recommendedBadge: {
    backgroundColor: '#15803D',
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  recommendedBadgeText: {
    fontSize: 8.5,
    fontFamily: FONT.bold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  marketBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  marketBadgeText: {
    fontSize: 8.5,
    fontFamily: FONT.bold,
    color: '#0369A1',
    letterSpacing: 0.4,
  },
  baselineBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  baselineBadgeText: {
    fontSize: 8.5,
    fontFamily: FONT.bold,
    color: '#475569',
    letterSpacing: 0.4,
  },
  priceContainer: {
    alignItems: 'flex-end',
  },
  optionPrice: {
    fontSize: 14.5,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    letterSpacing: -0.2,
  },
  optionPriceActive: {
    color: COLORS.navy,
  },
  priceUnit: {
    fontSize: 10,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  optionDescription: {
    fontSize: 11.5,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    lineHeight: 16.5,
    paddingLeft: 29,
  },
});
