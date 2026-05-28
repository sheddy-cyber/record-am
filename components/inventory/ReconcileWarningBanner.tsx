import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SP } from '@/constants';
import {
  Mismatch,
  getMismatches,
  removeMismatch,
  reconcileStockToMatchPurchase,
  reconcilePurchaseToMatchStock,
} from '@/lib/mismatchService';
import Toast from 'react-native-toast-message';

interface ReconcileWarningBannerProps {
  onReconciled?: () => void;
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
      `${msg}\n\nChoose an action to reconcile this:`,
      [
        {
          text: 'Update Stock',
          onPress: async () => {
            const success = await reconcileStockToMatchPurchase(mismatch);
            if (success) {
              Toast.show({
                type: 'success',
                text1: 'Stock updated to match purchase',
              });
              await loadMismatches();
              onReconciled?.();
            } else {
              Toast.show({
                type: 'error',
                text1: 'Reconciliation failed',
              });
            }
          },
        },
        {
          text: 'Update Purchase',
          onPress: async () => {
            const success = await reconcilePurchaseToMatchStock(mismatch);
            if (success) {
              Toast.show({
                type: 'success',
                text1: 'Purchase updated to match stock',
              });
              await loadMismatches();
              onReconciled?.();
            } else {
              Toast.show({
                type: 'error',
                text1: 'Reconciliation failed',
              });
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (mismatches.length === 0) return null;

  return (
    <View style={{ gap: 10, marginBottom: 14 }}>
      {mismatches.map((mismatch) => {
        let text = '';
        if (mismatch.type === 'stock_to_purchase_declined') {
          text = `Stock of ${mismatch.productName} increased by ${mismatch.quantity}, but no purchase recorded.`;
        } else if (mismatch.type === 'stock_to_purchase_mismatch') {
          text = `Stock addition of ${mismatch.quantity} ${mismatch.productName} doesn't match purchase quantity of ${mismatch.targetQuantity}.`;
        } else if (mismatch.type === 'purchase_to_stock_declined') {
          text = `Purchase of ${mismatch.quantity} ${mismatch.productName} recorded, but no stock added.`;
        } else if (mismatch.type === 'purchase_to_stock_mismatch') {
          text = `Purchase of ${mismatch.quantity} ${mismatch.productName} doesn't match stock addition of ${mismatch.targetQuantity}.`;
        }

        return (
          <View
            key={mismatch.id}
            style={{
              backgroundColor: 'rgba(255, 150, 0, 0.08)',
              borderColor: COLORS.warning,
              borderWidth: 1,
              borderRadius: RADIUS.md,
              padding: 12,
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Feather name="alert-triangle" size={16} color={COLORS.warning} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                  Sync Mismatch Warning
                </Text>
                <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: 2 }}>
                  {text}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => handleDismiss(mismatch)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
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
