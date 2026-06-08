import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, InteractionManager, Share, Text, TouchableOpacity, View, RefreshControl, Modal, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import ViewShot from 'react-native-view-shot';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { fetchRevenueActivities } from '@/lib/revenue';
import { deleteDebtRepaymentRecord, deleteSaleRecord } from '@/lib/recordDeletion';
import { readCachedRows } from '@/lib/offlineStore';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useTabStore } from '@/store/tabStore';
import { Button, ConfirmDialog, EmptyState, LoadingScreen, PaymentSummary } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { SwipeableTabScreen } from '@/components/navigation/SwipeableTabScreen';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { RevenueActivity, Sale } from '@/types';
import { shareReceiptViaWhatsApp } from '@/lib/reports';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function SalesScreen() {
  const insets = useSafeAreaInsets();
  const businessId = useAuthStore((s) => s.currentBusiness?.id);
  const branchId = useAuthStore((s) => s.currentBranch?.id);
  const businessName = useAuthStore((s) => s.currentBusiness?.name);
  const businessAddress = useAuthStore((s) => s.currentBusiness?.address);
  const businessPhone = useAuthStore((s) => s.currentBusiness?.phone);
  const branchName = useAuthStore((s) => s.currentBranch?.name);
  // Subscribe only to primitive values so unrelated auth store updates do not refetch this tab.
  const [activities, setActivities] = useState<RevenueActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [generatingReceiptId, setGeneratingReceiptId] = useState<string | null>(null);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<RevenueActivity | null>(null);
  const receiptCaptureRef = useRef<ViewShot | null>(null);

  const openRecordSale = () => router.push('/(app)/record-sale');

  const loadActivities = useCallback(async (isRefreshing = false) => {
    if (!businessId || !branchId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!isRefreshing) setLoading(true);
    try {
      const data = await fetchRevenueActivities(businessId, branchId, 60);
      setActivities(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId, branchId]);

  const activeTab = useTabStore((s) => s.activeTab);

  useEffect(() => {
    if (activeTab === 'sales') {
      InteractionManager.runAfterInteractions(() => {
        loadActivities();
      });
    }
  }, [activeTab, loadActivities]);

  // Refetch handled by activeTab selector above — no focus listener needed

  useRealtimeRefresh({
    channelName: `sales-screen-${branchId ?? 'unknown'}`,
    enabled: Boolean(businessId && branchId),
    watch: [businessId, branchId],
    tables: [
      ...(branchId ? [{ table: 'sales', filter: `branch_id=eq.${branchId}` }] : []),
      ...(branchId ? [{ table: 'customer_debts', filter: `branch_id=eq.${branchId}` }] : []),
      { table: 'debt_repayments' },
    ],
    onRefresh: () => loadActivities(true),
  });

  const generateSaleReceipt = async (saleId: string) => {
    if (!businessId || !branchId) return;

    setGeneratingReceiptId(saleId);
    try {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*, customer:customers(name, phone)')
        .eq('id', saleId)
        .single();

      if (saleError) throw saleError;

      const { data, error } = await supabase
        .from('sale_items')
        .select('*, product:products(name)')
        .eq('sale_id', saleId);

      if (error) throw error;

      setPreviewSale({
        ...(sale as Sale),
        items: data ?? [],
      });
    } catch (err) {
      const [cachedSales, cachedItems] = await Promise.all([
        readCachedRows<Sale>({ businessId, branchId }, 'sales'),
        readCachedRows<any>({ businessId, branchId }, 'sale_items'),
      ]);
      const cachedSale = cachedSales.find((item: any) => item.id === saleId);

      if (cachedSale) {
        setPreviewSale({
          ...cachedSale,
          items: cachedItems.filter((item: any) => item.sale_id === saleId),
        });
      } else {
        Alert.alert('Unable to generate receipt', 'The sale receipt could not be prepared right now.');
        console.error(err);
      }
    } finally {
      setGeneratingReceiptId(null);
    }
  };

  const generateRepaymentReceipt = async (repaymentId: string) => {
    if (!businessId || !branchId) return;

    setGeneratingReceiptId(repaymentId);
    try {
      const { data: repayment, error: repaymentError } = await supabase
        .from('debt_repayments')
        .select('*, debt:customer_debts!inner(*)')
        .eq('id', repaymentId)
        .single();

      if (repaymentError) throw repaymentError;

      const debt = Array.isArray(repayment.debt) ? repayment.debt[0] : repayment.debt;
      if (!debt) throw new Error('No linked debt found');

      let originalSale: any = null;
      let saleItems: any[] = [];
      if (debt.sale_id) {
        const { data: sale } = await supabase
          .from('sales')
          .select('*, customer:customers(name, phone)')
          .eq('id', debt.sale_id)
          .single();
        originalSale = sale;

        if (sale) {
          const { data: items } = await supabase
            .from('sale_items')
            .select('*, product:products(name)')
            .eq('sale_id', debt.sale_id);
          saleItems = items ?? [];
        }
      }

      const synthesizedSale: any = {
        id: repayment.id,
        sale_number: originalSale?.sale_number ?? `PAY-${repayment.id.substring(0, 8).toUpperCase()}`,
        created_at: repayment.created_at,
        customer: originalSale?.customer ?? {
          name: debt.customer_name,
          phone: debt.customer_phone ?? undefined,
        },
        items: saleItems,
        subtotal: originalSale?.subtotal ?? repayment.amount,
        discount_amount: originalSale?.discount_amount ?? 0,
        tax_amount: originalSale?.tax_amount ?? 0,
        total_amount: originalSale?.total_amount ?? repayment.amount,
        amount_paid: repayment.amount,
        amount_owed: Math.max(0, debt.balance),
        payment_status: debt.status === 'settled' ? 'paid' : 'partial',
        payment_method: repayment.payment_method,
        notes: repayment.notes ?? originalSale?.notes,
        isRepayment: true,
        originalTotalAmount: originalSale?.total_amount,
        originalAmountPaid: originalSale?.amount_paid,
        accumulatedAmountPaid: debt.amount_paid,
      };

      setPreviewSale(synthesizedSale as any as Sale);
    } catch (err) {
      Alert.alert('Unable to generate receipt', 'The payment receipt could not be prepared right now.');
      console.error(err);
    } finally {
      setGeneratingReceiptId(null);
    }
  };

  const downloadReceipt = async () => {
    if (!previewSale || !businessId || !branchId) return;
    setIsDownloading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission required',
          'Gallery write permission is needed to download the receipt to your device.',
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      const imageUri = await receiptCaptureRef.current?.capture?.();
      if (!imageUri) throw new Error('Could not capture receipt image');

      await MediaLibrary.createAssetAsync(imageUri);
      Alert.alert('Download Complete', 'The receipt has been successfully saved to your gallery.');
    } catch (err) {
      Alert.alert('Download failed', 'The receipt could not be saved to your device.');
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteActivity = (activity: RevenueActivity) => {
    setActivityToDelete(activity);
  };

  const renderActivityItem = ({ item }: { item: RevenueActivity }) => {
    const isRepayment = item.kind === 'debt_repayment';
    const isGenerating = generatingReceiptId === (isRepayment ? item.id : item.sale_id);
    
    return (
      <TouchableOpacity 
        activeOpacity={0.7}
        onLongPress={() => handleDeleteActivity(item)}
        onPress={() => {
          if (isRepayment) {
            generateRepaymentReceipt(item.id);
          } else if (item.sale_id) {
            generateSaleReceipt(item.sale_id);
          }
        }}
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <View style={styles.customerInfo}>
            <View style={[styles.iconContainer, { backgroundColor: isRepayment ? COLORS.successLight : COLORS.accentLight }]}>
              <Feather 
                name={isRepayment ? "arrow-down-left" : "shopping-cart"} 
                size={16} 
                color={isRepayment ? COLORS.success : COLORS.accent} 
              />
            </View>
            <View>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.customer_name}
              </Text>
              <Text style={styles.dateText}>
                {format(new Date(item.created_at), 'MMM d, h:mm a')}
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
            <View style={styles.metaItem}>
              <Feather name="hash" size={12} color={COLORS.text.muted} />
              <Text style={styles.metaText}>{item.reference}</Text>
            </View>
          </View>
          
          {isGenerating ? (
            <ActivityIndicator size="small" color={COLORS.accent} />
          ) : (
            <Feather name="chevron-right" size={16} color={COLORS.text.muted} />
          )}
        </View>

        {item.notes ? (
          <View style={styles.notesContainer}>
            <Text style={styles.notesText} numberOfLines={1}>
              "{item.notes}"
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };



  return (
    <SwipeableTabScreen name="sales">
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Sales"
        subtitle={`${activities.length} activity record${activities.length === 1 ? '' : 's'}`}
        theme="dark"
        right={<HeaderAction icon="plus" label="Record Sale" onPress={openRecordSale} />}
      />



      {activities.length === 0 ? (
        <EmptyState
          icon="shopping-cart"
          title="No sales yet"
          description="Record your first sale or debt collection to start tracking revenue and stock movement."
          action={{ label: 'Record Sale', onPress: openRecordSale }}
        />
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item: any) => `${item.kind}-${item.id}`}
          contentContainerStyle={{ 
            paddingHorizontal: SP.page, 
            paddingTop: SP.page,
            paddingBottom: insets.bottom + 92 
          }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await loadActivities(true);
              }}
              tintColor={COLORS.accent}
            />
          }
          renderItem={renderActivityItem}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
      {/* Receipt Preview Modal */}
      <Modal
        visible={previewSale !== null}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPreviewSale(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(20, 33, 28, 0.85)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingVertical: 40,
            paddingHorizontal: 10,
          }}
        >
          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: RADIUS['2xl'],
              width: '100%',
              maxWidth: 350,
              maxHeight: '90%',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: 'rgba(255, 253, 248, 0.1)',
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
                backgroundColor: COLORS.surface,
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                Receipt Preview
              </Text>
              <TouchableOpacity
                onPress={() => setPreviewSale(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: COLORS.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={16} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>

            {/* Scrollable Receipt Area */}
            <ScrollView
              contentContainerStyle={{
                alignItems: 'center',
                paddingVertical: 20,
                paddingHorizontal: 10,
                backgroundColor: '#F5F0E4',
              }}
              showsVerticalScrollIndicator={false}
            >
              {previewSale && businessName && branchName && (
                <ViewShot
                  ref={receiptCaptureRef}
                  options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                >
                  <View collapsable={false}>
                    <ReceiptShareCard
                      sale={previewSale}
                      businessName={businessName}
                      businessAddress={businessAddress}
                      businessPhone={businessPhone}
                      branchName={branchName}
                    />
                  </View>
                </ViewShot>
              )}
            </ScrollView>

            {/* Premium Action Buttons */}
            <View
              style={{
                padding: 16,
                gap: 10,
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                backgroundColor: COLORS.surface,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={async () => {
                    if (!previewSale || !businessId || !branchId) return;
                    setIsSharingImage(true);
                    try {
                      await new Promise((resolve) => setTimeout(resolve, 100));
                      const imageUri = await receiptCaptureRef.current?.capture?.();
                      if (!imageUri) throw new Error('Could not capture receipt image');

                      if (await Sharing.isAvailableAsync()) {
                        await Sharing.shareAsync(imageUri, {
                          dialogTitle: `Receipt ${previewSale.sale_number}`,
                          mimeType: 'image/png',
                          UTI: 'public.png',
                        });
                      } else {
                        await Share.share({
                          url: imageUri,
                          title: `Receipt ${previewSale.sale_number}`,
                        });
                      }
                    } catch (err) {
                      Alert.alert('Unable to share image', 'Please try again.');
                      console.error(err);
                    } finally {
                      setIsSharingImage(false);
                    }
                  }}
                  disabled={isSharingImage}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: COLORS.ink,
                    paddingVertical: 12,
                    borderRadius: RADIUS.md,
                    opacity: isSharingImage ? 0.7 : 1,
                  }}
                >
                  {isSharingImage ? (
                    <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: '#FFFDF8' }}>Preparing...</Text>
                  ) : (
                    <>
                      <Feather name="image" size={16} color="#FFFDF8" />
                      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: '#FFFDF8' }}>Share Image</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={downloadReceipt}
                  disabled={isDownloading}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: COLORS.success,
                    paddingVertical: 12,
                    borderRadius: RADIUS.md,
                    opacity: isDownloading ? 0.7 : 1,
                  }}
                >
                  {isDownloading ? (
                    <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: '#FFF' }}>Downloading...</Text>
                  ) : (
                    <>
                      <Feather name="download" size={16} color="#FFF" />
                      <Text style={{ fontFamily: FONT.medium, fontSize: 13, color: '#FFF' }}>Download</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      <ConfirmDialog
        visible={activityToDelete !== null}
        title="Delete record"
        message={`Delete this ${activityToDelete?.kind === 'sale' ? 'sale' : 'debt payment'}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!activityToDelete) return;
          const targetActivity = activityToDelete;
          setActivityToDelete(null);
          try {
            if (targetActivity.kind === 'sale') {
              await deleteSaleRecord(targetActivity.sale_id ?? targetActivity.id);
            } else {
              await deleteDebtRepaymentRecord(targetActivity.id);
            }
            await loadActivities();
            Toast.show({ type: 'success', text1: 'Record deleted' });
          } catch (err: any) {
            Alert.alert('Unable to delete', err.message ?? 'Please try again.');
          }
        }}
        onCancel={() => setActivityToDelete(null)}
        variant="danger"
      />
    </ScreenShell>
    </SwipeableTabScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,

  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  customerName: {
    fontSize: 16,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    marginBottom: 2,
  },
  dateText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
  amountInfo: {
    alignItems: 'flex-end',
  },
  totalAmount: {
    fontSize: 17,
    fontFamily: FONT.bold,
    marginBottom: 4,
  },
  debtBadge: {
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: 8,
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
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
  },
  notesText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    fontStyle: 'italic',
  },

});

export default React.memo(SalesScreen);

function ReceiptShareCard({
  sale,
  businessName,
  businessAddress,
  businessPhone,
  branchName,
}: {
  sale: Sale;
  businessName: string;
  businessAddress?: string | null;
  businessPhone?: string | null;
  branchName: string;
}) {
  const statusColor =
    sale.payment_status === 'paid'
      ? COLORS.success
      : sale.payment_status === 'partial'
        ? COLORS.warning
        : COLORS.danger;

  return (
    <View
      style={{
        width: 330,
        backgroundColor: '#FFFDF8',
        borderWidth: 1,
        borderColor: '#D8CEB7',
      }}
      collapsable={false}
    >
      <View style={{ backgroundColor: COLORS.ink, paddingHorizontal: 24, paddingVertical: 24 }}>
        <Text style={{ fontSize: 22, fontFamily: FONT.bold, color: '#FFFDF8', textAlign: 'center' }}>
          {businessName}
        </Text>
        <Text
          style={{
            fontSize: 12,
            fontFamily: FONT.regular,
            color: 'rgba(255,253,248,0.75)',
            textAlign: 'center',
            marginTop: 6,
          }}
        >
          {[branchName, businessAddress, businessPhone].filter(Boolean).join(' · ')}
        </Text>
      </View>

      <View
        style={{
          marginHorizontal: 24,
          marginTop: -12,
          backgroundColor: '#FFFDF8',
          borderWidth: 1,
          borderColor: '#D8CEB7',
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 12, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>
            {sale.sale_number}
          </Text>
          {(sale as any).isRepayment ? (
            <Text style={{ fontSize: 9, fontFamily: FONT.bold, color: COLORS.warning, marginTop: 2 }}>
              INSTALMENT REPAYMENT
            </Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted }}>
          {format(new Date(sale.created_at), 'MMM d, yyyy · h:mm a')}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
        <Text style={{ fontSize: 10, fontFamily: FONT.medium, color: COLORS.text.muted, letterSpacing: 1 }}>
          CUSTOMER
        </Text>
        <View
          style={{
            marginTop: 10,
            backgroundColor: '#F5F0E4',
            borderWidth: 1,
            borderColor: '#D8CEB7',
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }}>
            {(sale.customer as any)?.name ?? 'Walk-in Customer'}
          </Text>
          {(sale.customer as any)?.phone ? (
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: 2 }}>
              {(sale.customer as any).phone}
            </Text>
          ) : null}
        </View>
      </View>

      {sale.items && sale.items.length > 0 ? (
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 }}>
          <Text style={{ fontSize: 10, fontFamily: FONT.medium, color: COLORS.text.muted, letterSpacing: 1 }}>
            ITEMS
          </Text>
          <View style={{ marginTop: 6 }}>
            {sale.items.map((item: any, index: number) => (
              <View
                key={item.id ?? `${item.product_id}-${index}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: '#F0EDE3',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>
                    {(item.product as any)?.name ?? 'Item'}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3 }}>
                    {item.quantity} × {formatCurrency(item.unit_price)}
                    {item.discount_amount > 0 ? ` (Discount: -${formatCurrency(item.discount_amount)})` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                  {formatCurrency(item.total_price)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (sale as any).isRepayment ? (
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 }}>
          <Text style={{ fontSize: 10, fontFamily: FONT.medium, color: COLORS.text.muted, letterSpacing: 1 }}>
            PAYMENT DESCRIPTION
          </Text>
          <View style={{ marginTop: 6, paddingVertical: 10 }}>
            <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>
              Debt Repayment
            </Text>
            <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 3 }}>
              Manual standalone debt settlement
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 24, paddingBottom: 20 }}>
        <Text style={{ fontSize: 10, fontFamily: FONT.medium, color: COLORS.text.muted, letterSpacing: 1 }}>
          SUMMARY
        </Text>
        <View style={{ marginTop: 12, gap: 8 }}>
          {!(sale as any).isRepayment && sale.discount_amount > 0 ? (
            <SummaryRow label="Subtotal" value={formatCurrency(sale.subtotal)} />
          ) : null}
          {!(sale as any).isRepayment && sale.discount_amount > 0 ? (
            <SummaryRow label="Discount" value={`- ${formatCurrency(sale.discount_amount)}`} />
          ) : null}
          {!(sale as any).isRepayment && sale.tax_amount > 0 ? (
            <SummaryRow label="Tax" value={formatCurrency(sale.tax_amount)} />
          ) : null}
          
          {(sale as any).isRepayment ? (
            <>
              {sale.items && sale.items.length > 0 ? (
                <SummaryRow
                  label="Total Purchase"
                  value={formatCurrency(sale.total_amount)}
                />
              ) : null}
              <View style={{ height: 1, backgroundColor: '#D8CEB7', marginTop: 4, marginBottom: 4 }} />
              <SummaryRow
                label="This Payment"
                value={formatCurrency(sale.amount_paid)}
                labelStyle={{ color: COLORS.success, fontFamily: FONT.bold }}
                valueStyle={{ color: COLORS.success, fontFamily: FONT.bold, fontSize: 15 }}
              />
              <SummaryRow
                label="Total Paid (All-time)"
                value={formatCurrency((sale as any).accumulatedAmountPaid ?? sale.amount_paid)}
                labelStyle={{ color: COLORS.text.secondary }}
                valueStyle={{ color: COLORS.text.secondary }}
              />
              <SummaryRow
                label="Remaining Balance"
                value={sale.amount_owed > 0 ? formatCurrency(sale.amount_owed) : 'FULLY SETTLED'}
                labelStyle={{ color: sale.amount_owed > 0 ? COLORS.danger : COLORS.success, fontFamily: FONT.medium }}
                valueStyle={{ color: sale.amount_owed > 0 ? COLORS.danger : COLORS.success, fontFamily: FONT.bold }}
              />
            </>
          ) : (
            <>
              <View style={{ height: 1, backgroundColor: '#D8CEB7', marginTop: 4, marginBottom: 4 }} />
              <SummaryRow
                label="Total"
                value={formatCurrency(sale.total_amount)}
                labelStyle={{ fontFamily: FONT.bold, color: COLORS.text.primary }}
                valueStyle={{ fontSize: 17, fontFamily: FONT.bold, color: COLORS.text.primary }}
              />
              <SummaryRow
                label="Amount Paid"
                value={formatCurrency(sale.amount_paid > 0 ? sale.amount_paid : sale.total_amount)}
                labelStyle={{ color: COLORS.success, fontFamily: FONT.medium }}
                valueStyle={{ color: COLORS.success, fontFamily: FONT.bold }}
              />
              {sale.amount_owed > 0 ? (
                <SummaryRow
                  label="Balance Owed"
                  value={formatCurrency(sale.amount_owed)}
                  labelStyle={{ color: COLORS.danger, fontFamily: FONT.medium }}
                  valueStyle={{ color: COLORS.danger, fontFamily: FONT.bold }}
                />
              ) : null}
            </>
          )}
          <SummaryRow
            label="Payment Method"
            value={sale.payment_method.replace('_', ' ').toUpperCase()}
            labelStyle={{ fontSize: 11 }}
            valueStyle={{ fontSize: 11 }}
          />
        </View>
      </View>

      <View
        style={{
          backgroundColor: `${statusColor}18`,
          borderTopWidth: 1,
          borderTopColor: '#D8CEB7',
          paddingVertical: 14,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontFamily: FONT.bold,
            color: statusColor,
            letterSpacing: 1,
          }}
        >
          {sale.payment_status === 'paid'
            ? 'PAID IN FULL'
            : sale.payment_status === 'partial'
              ? 'PARTIALLY PAID'
              : 'CREDIT / UNPAID'}
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, paddingVertical: 18, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.muted }}>
          Thank you for your business.
        </Text>
        {sale.notes ? (
          <Text
            style={{
              fontSize: 11,
              fontFamily: FONT.regular,
              color: COLORS.text.secondary,
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            "{sale.notes}"
          </Text>
        ) : null}
        <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 10 }}>
          Powered by Record Am · {format(new Date(sale.created_at), 'yyyy')}
        </Text>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  labelStyle,
  valueStyle,
}: {
  label: string;
  value: string;
  labelStyle?: object;
  valueStyle?: object;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }, labelStyle]}>
        {label}
      </Text>
      <Text style={[{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary, textAlign: 'right' }, valueStyle]}>
        {value}
      </Text>
    </View>
  );
}
