import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS } from '@/constants';
import {
  Mismatch,
  getMismatches,
  removeMismatch,
} from '@/lib/mismatchService';
import { buildPurchasePrefillParam } from '@/lib/purchasePrefill';
import Toast from 'react-native-toast-message';

interface ReconcileWarningBannerProps {
  onReconciled?: () => void;
}

function getMismatchText(mismatch: Mismatch): string {
  if (mismatch.type === 'stock_to_purchase_declined') {
    return `Stock of ${mismatch.productName} increased by ${mismatch.quantity}, but no purchase recorded.`;
  }
  if (mismatch.type === 'stock_to_purchase_mismatch') {
    return `Stock addition of ${mismatch.quantity} ${mismatch.productName} doesn't match purchase quantity of ${mismatch.targetQuantity}.`;
  }
  if (mismatch.type === 'purchase_to_stock_declined') {
    return `Purchase of ${mismatch.quantity} ${mismatch.productName} recorded, but no stock added.`;
  }
  return `Purchase of ${mismatch.quantity} ${mismatch.productName} doesn't match stock addition of ${mismatch.targetQuantity}.`;
}

function getStockAdjustment(mismatch: Mismatch): number {
  if (mismatch.type === 'stock_to_purchase_declined') {
    return -mismatch.quantity;
  }
  if (mismatch.type === 'stock_to_purchase_mismatch') {
    return (mismatch.targetQuantity ?? mismatch.quantity) - mismatch.quantity;
  }
  if (mismatch.type === 'purchase_to_stock_declined') {
    return mismatch.quantity;
  }
  return mismatch.quantity - (mismatch.targetQuantity ?? mismatch.quantity);
}

function getPurchasePrefillQuantity(mismatch: Mismatch): number {
  if (mismatch.type === 'purchase_to_stock_mismatch') {
    return mismatch.targetQuantity ?? mismatch.quantity;
  }
  return mismatch.quantity;
}

function getPurchasePrefillUnitCost(mismatch: Mismatch): number {
  if (mismatch.type === 'purchase_to_stock_mismatch') {
    return mismatch.targetUnitCost ?? mismatch.unitCost;
  }
  return mismatch.unitCost;
}

export function ReconcileWarningBanner({ onReconciled }: ReconcileWarningBannerProps) {
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);

  const loadMismatches = useCallback(async () => {
    const list = await getMismatches();
    setMismatches(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMismatches();
    }, [loadMismatches])
  );

  const handleDismiss = async (mismatch: Mismatch) => {
    Alert.alert(
      'Dismiss Mismatch?',
      'Are you sure you want to dismiss this warning without reconciling?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Dismiss',
          style: 'destructive',
          onPress: async () => {
            await removeMismatch(mismatch.id);
            await loadMismatches();
            Toast.show({
              type: 'info',
              text1: 'Warning dismissed',
            });
          },
        },
      ]
    );
  };

  const openStockForm = (mismatch: Mismatch) => {
    const params: Record<string, string> = {
      productId: mismatch.productId,
      stockAdjustment: String(getStockAdjustment(mismatch)),
      purchasedUnitCost: String(mismatch.targetUnitCost ?? mismatch.unitCost),
      syncFlow: '1',
      mismatchId: mismatch.id,
    };

    if (mismatch.purchaseId) {
      params.purchaseId = mismatch.purchaseId;
    }

    router.push({
      pathname: '/(app)/update-stock',
      params,
    });
  };

  const openPurchaseForm = (mismatch: Mismatch) => {
    const params: Record<string, string> = {
      mismatchId: mismatch.id,
    };

    if (mismatch.purchaseId) {
      params.purchaseId = mismatch.purchaseId;
    } else {
      params.syncFlow = '1';
      params.originalProductId = mismatch.productId;
      params.originalStockQty = String(mismatch.quantity);
      params.originalUnitCost = String(mismatch.unitCost);
      params.prefill = buildPurchasePrefillParam({
        notes: 'Opened from sync mismatch reconciliation.',
        items: [
          {
            productId: mismatch.productId,
            productName: mismatch.productName,
            quantity: getPurchasePrefillQuantity(mismatch),
            unitCost: getPurchasePrefillUnitCost(mismatch),
          },
        ],
      });
    }

    router.push({
      pathname: '/(app)/record-purchase',
      params,
    });
  };

  const handleReconcile = (mismatch: Mismatch) => {
    const sourceQty = mismatch.quantity;
    const targetQty = mismatch.targetQuantity ?? mismatch.quantity;

    let msg = '';
    if (mismatch.type === 'stock_to_purchase_declined') {
      msg = `Stock added: ${sourceQty} ${mismatch.productName}. No corresponding purchase recorded.`;
    } else if (mismatch.type === 'stock_to_purchase_mismatch') {
      msg = `Stock added: ${sourceQty} ${mismatch.productName}. Corresponding purchase recorded: ${targetQty}.`;
    } else if (mismatch.type === 'purchase_to_stock_declined') {
      msg = `Purchase recorded: ${sourceQty} ${mismatch.productName}. No corresponding stock added.`;
    } else if (mismatch.type === 'purchase_to_stock_mismatch') {
      msg = `Purchase recorded: ${sourceQty} ${mismatch.productName}. Corresponding stock added: ${targetQty}.`;
    }

    Alert.alert(
      'Reconcile Sync Mismatch',
      `${msg}\n\nChoose a form to open. No records will be changed until you save.`,
      [
        {
          text: 'Update Stock',
          onPress: () => openStockForm(mismatch),
        },
        {
          text: 'Update Purchase',
          onPress: () => openPurchaseForm(mismatch),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (mismatches.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: 'rgba(255, 150, 0, 0.08)',
        borderColor: COLORS.warning,
        borderWidth: 1,
        borderRadius: RADIUS.md,
        padding: 12,
        marginBottom: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Feather name="alert-triangle" size={16} color={COLORS.warning} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>
            {mismatches.length === 1 ? 'Sync Mismatch Warning' : 'Sync Mismatch Warnings'}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: 2 }}>
            {mismatches.length === 1
              ? '1 mismatch needs attention.'
              : `${mismatches.length} mismatches need attention.`}
          </Text>
        </View>
      </View>

      {mismatches.map((mismatch) => {
        return (
          <View
            key={mismatch.id}
            style={{
              borderTopWidth: 1,
              borderTopColor: 'rgba(247, 197, 159, 0.55)',
              paddingTop: 10,
              gap: 7,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, lineHeight: 17 }}>
              {getMismatchText(mismatch)}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                onPress={() => handleDismiss(mismatch)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: RADIUS.sm,
                  backgroundColor: COLORS.surface2,
                }}
              >
                <Text style={{ fontSize: 11, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                  Dismiss
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleReconcile(mismatch)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: RADIUS.sm,
                  backgroundColor: COLORS.warning,
                }}
              >
                <Text style={{ fontSize: 11, fontFamily: FONT.bold, color: '#FFFFFF' }}>
                  Reconcile
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}
