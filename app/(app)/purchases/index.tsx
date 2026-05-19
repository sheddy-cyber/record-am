import React, { useCallback, useEffect } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { usePurchaseStore } from '@/store/purchaseStore';
import { deletePurchaseRecord } from '@/lib/recordDeletion';
import { Button, EmptyState, LoadingScreen, PaymentSummary } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT } from '@/constants';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

export default function PurchasesScreen() {
  const { currentBusiness, currentBranch } = useAuthStore();
  const { purchases, isLoading, fetchPurchases } = usePurchaseStore();

  const load = useCallback(async () => {
    if (!currentBusiness || !currentBranch) return;
    await fetchPurchases(currentBusiness.id, currentBranch.id);
  }, [currentBranch, currentBusiness, fetchPurchases]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeletePurchase = (purchaseId: string) => {
    Alert.alert('Delete purchase', 'Delete this purchase and reverse its stock entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePurchaseRecord(purchaseId);
            await load();
            Toast.show({ type: 'success', text1: 'Purchase deleted' });
          } catch (err: any) {
            Alert.alert('Unable to delete', err.message ?? 'Please try again.');
          }
        },
      },
    ]);
  };

  if (isLoading && !purchases.length) {
    return <LoadingScreen message="Loading purchases..." />;
  }

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title="Purchases"
          subtitle={`${purchases.length} entr${purchases.length === 1 ? 'y' : 'ies'}`}
          theme="dark"
          right={<HeaderAction icon="plus" label="Record Purchase" onPress={() => router.push('/(app)/record-purchase')} />}
        />

        {purchases.length === 0 ? (
          <EmptyState
            icon="package"
            title="No purchases recorded"
            description="Record stock purchases here. Inventory updates automatically."
            action={{ label: 'Record Purchase', onPress: () => router.push('/(app)/record-purchase') }}
          />
        ) : (
          <FlatList
            data={purchases}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
            renderItem={({ item, index }) => (
              <View
                style={{
                  paddingVertical: 16,
                  borderBottomWidth: index === purchases.length - 1 ? 0 : 1,
                  borderBottomColor: COLORS.border,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                      {item.purchase_number}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Feather name="truck" size={12} color={COLORS.text.muted} />
                      <Text style={{ fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>
                        {(item as any).supplier?.name ?? 'Unknown Supplier'}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted, marginTop: 2 }}>
                      {format(new Date(item.created_at), 'MMM d, yyyy \u00B7 h:mm a')}
                    </Text>
                  </View>
                  <PaymentSummary totalAmount={item.total_amount} amountPaid={item.amount_paid} amountOwed={item.amount_owed} />
                </View>

                {(item as any).items?.slice(0, 2).map((purchaseItem: any) => (
                  <Text key={purchaseItem.id} style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                    - {purchaseItem.product?.name} x {purchaseItem.quantity} @ {formatCurrency(purchaseItem.unit_cost)}
                  </Text>
                ))}
                {(item as any).items?.length > 2 ? (
                  <Text style={{ fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>
                    +{(item as any).items.length - 2} more items
                  </Text>
                ) : null}
                <Button
                  title="Delete"
                  icon="trash-2"
                  onPress={() => handleDeletePurchase(item.id)}
                  variant="danger"
                  size="sm"
                  style={{ marginTop: 12 }}
                />
              </View>
            )}
          />
        )}
      </View>
    </ScreenShell>
  );
}
