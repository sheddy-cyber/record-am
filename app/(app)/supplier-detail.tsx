import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useSupplierStore } from '@/store/supplierStore';
import { useBusinessStore } from '@/store/businessStore';
import { Product, Purchase } from '@/types';
import { deletePurchaseRecord } from '@/lib/recordDeletion';
import { printCounterpartyStatement, shareCounterpartyStatementPDF } from '@/lib/reports';
import { Button, Card, EmptyState, PermissionDenied, SectionHeader, confirmModal } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS } from '@/constants';
import { canManagePurchases, hasPermission } from '@/lib/permissions';
import { dismissScreen } from '@/lib/navigation';

const formatCurrency = (value: number) =>
  `${CURRENCY_SYMBOL}${value.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const getPurchaseItemsSummary = (purchase: Purchase, allProducts: Product[]) => {
  if (purchase.items && purchase.items.length > 0) {
    return purchase.items
      .map((item) => {
        const pName =
          item.product?.name ||
          allProducts.find((p) => p.id === item.product_id)?.name ||
          'Item';
        return `${item.quantity !== 1 ? `${item.quantity}x ` : ''}${pName}`;
      })
      .join(', ');
  }
  return purchase.notes?.trim() || '1 purchase';
};

export default function SupplierDetailScreen() {
  const params = useLocalSearchParams<{ supplierId?: string | string[] }>();
  const supplierId = Array.isArray(params.supplierId) ? params.supplierId[0] : params.supplierId;
  const { currentBusiness, currentBranch, userRole } = useAuthStore();
  const canViewPurchases = hasPermission(userRole, 'purchases.view');
  const canEditPurchases = canManagePurchases(userRole);
  const { products } = useBusinessStore();
  const [refreshing, setRefreshing] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSharingPDF, setIsSharingPDF] = useState(false);
  const {
    suppliers,
    selectedSupplier,
    supplierPurchases,
    fetchSupplierDetail,
    deleteSupplier,
    setSelectedSupplier,
  } = useSupplierStore();

  const closeScreen = () => dismissScreen();

  const onRefresh = useCallback(async () => {
    if (!currentBusiness || !supplierId || !canViewPurchases) return;
    setRefreshing(true);
    try {
      await fetchSupplierDetail(supplierId, currentBusiness.id);
    } catch (_) {}
    setRefreshing(false);
  }, [canViewPurchases, currentBusiness, supplierId, fetchSupplierDetail]);

  // Data is hydrated on app boot. No need to fetch on mount.

  const supplier = useMemo(() => {
    return suppliers.find((item) => item.id === supplierId)
      ?? (selectedSupplier?.id === supplierId ? selectedSupplier : null);
  }, [selectedSupplier, supplierId, suppliers]);

  useEffect(() => {
    if (supplier) {
      setSelectedSupplier(supplier);
    }
  }, [setSelectedSupplier, supplier]);

  useEffect(() => {
    if (canViewPurchases && currentBusiness && supplierId) {
      fetchSupplierDetail(supplierId, currentBusiness.id);
    }
  }, [canViewPurchases, currentBusiness, supplierId, fetchSupplierDetail]);

  const handleDelete = async () => {
    if (!supplier) return;
    const confirmed = await confirmModal({
      title: 'Remove Supplier',
      message: `Are you sure you want to remove ${supplier.name} from your suppliers list?`,
      confirmText: 'Remove',
      type: 'danger',
    });

    if (confirmed) {
      await deleteSupplier(supplier.id);
      setSelectedSupplier(null);
      Toast.show({ type: 'success', text1: 'Supplier removed' });
      closeScreen();
    }
  };

  const handleDeletePurchase = async (purchaseId: string) => {
    const confirmed = await confirmModal({
      title: 'Delete Goods Record',
      message: 'Are you sure you want to delete this supplier goods record? This action cannot be undone.',
      confirmText: 'Delete',
      type: 'danger',
    });

    if (confirmed) {
      try {
        await deletePurchaseRecord(purchaseId);
        if (supplierId && currentBusiness) {
          await fetchSupplierDetail(supplierId, currentBusiness.id);
        }
        Toast.show({ type: 'success', text1: 'Goods record deleted' });
      } catch (err: any) {
        Alert.alert('Unable to delete', err.message ?? 'Please try again.');
      }
    }
  };


  if (!canViewPurchases) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader title="Supplier Details" theme="dark" left={<HeaderAction icon="arrow-left" onPress={closeScreen} />} />
        <PermissionDenied
          title="Supplier purchases are restricted"
          description="This account cannot view supplier balances, purchase records, or goods costs."
        />
      </ScreenShell>
    );
  }

  if (!supplier) {
    return (
      <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
        <ScreenHeader
          title="Supplier Details"
          theme="dark"
          left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        />
        <EmptyState
          icon="truck"
          title="Supplier not found"
          description="This supplier record could not be loaded."
          action={{ label: 'Go Back', onPress: closeScreen }}
        />
      </ScreenShell>
    );
  }

  const openRecordGoods = () =>
    router.push({ pathname: '/(app)/record-purchase', params: { supplierId: supplier.id } });

  const openEditPurchase = (id: string) =>
    router.push({ pathname: '/(app)/record-purchase', params: { purchaseId: id } });

  const openEditSupplier = () =>
    router.push({ pathname: '/(app)/supplier-edit', params: { supplierId: supplier.id } });

  const handlePrintStatement = async () => {
    if (!currentBusiness || isPrinting) return;

    setIsPrinting(true);
    try {
      await printCounterpartyStatement({
        business: currentBusiness,
        branch: currentBranch,
        kind: 'supplier',
        counterparty: supplier,
        totalTrade: supplier.total_purchased ?? 0,
        outstandingBalance: supplier.outstanding_debt ?? 0,
        items: supplierPurchases.map((purchase) => ({
          reference: purchase.purchase_number,
          description: getPurchaseItemsSummary(purchase, products),
          date: purchase.purchase_date || purchase.created_at,
          total: purchase.total_amount,
          paid: purchase.amount_paid,
          balance: purchase.amount_owed,
        })),
      });
      setManageSheetVisible(false);
    } catch (err: any) {
      Alert.alert('Unable to print', err?.message ?? 'Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleShareStatement = async () => {
    if (!currentBusiness || isSharingPDF) return;

    setIsSharingPDF(true);
    try {
      await shareCounterpartyStatementPDF({
        business: currentBusiness,
        branch: currentBranch,
        kind: 'supplier',
        counterparty: supplier,
        totalTrade: supplier.total_purchased ?? 0,
        outstandingBalance: supplier.outstanding_debt ?? 0,
        items: supplierPurchases.map((purchase) => ({
          reference: purchase.purchase_number,
          description: getPurchaseItemsSummary(purchase, products),
          date: purchase.purchase_date || purchase.created_at,
          total: purchase.total_amount,
          paid: purchase.amount_paid,
          balance: purchase.amount_owed,
        })),
      });
      setManageSheetVisible(false);
    } catch (err: any) {
      Alert.alert('Unable to share PDF', err?.message ?? 'Please try again.');
    } finally {
      setIsSharingPDF(false);
    }
  };

  const supplierHasDetails = Boolean(supplier.phone || supplier.email || supplier.address || supplier.notes);

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title={supplier.name}
        subtitle={`${supplierPurchases.length} recent purchase${supplierPurchases.length === 1 ? '' : 's'}`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        right={
          canEditPurchases ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <HeaderAction icon="edit-2" onPress={openEditSupplier} />
            <HeaderAction icon="more-horizontal" onPress={() => setManageSheetVisible(true)} />
          </View>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        <Card style={{ backgroundColor: COLORS.ink, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,253,248,0.1)' }}>
              <Feather name="truck" size={20} color={COLORS.infoLight} />
            </View>
            <View style={{ flex: 1, marginLeft: 11 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: 'rgba(255,253,248,0.6)', letterSpacing: 0.7 }}>SUPPLIER ACCOUNT</Text>
              <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 13, color: 'rgba(255,253,248,0.82)' }}>
                {supplier.total_orders ?? 0} purchase{supplier.total_orders === 1 ? '' : 's'} recorded
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: 'rgba(255,253,248,0.6)', letterSpacing: 0.7 }}>CURRENT BALANCE</Text>
            <Text style={{ marginTop: 5, fontFamily: FONT.bold, fontSize: 28, color: (supplier.outstanding_debt ?? 0) > 0 ? '#FECACA' : COLORS.successLight }}>
              {formatCurrency(supplier.outstanding_debt ?? 0)}
            </Text>
            <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 12, color: 'rgba(255,253,248,0.72)' }}>
              {(supplier.outstanding_debt ?? 0) > 0 ? 'Outstanding from recorded goods' : 'No payment due to this supplier'}
            </Text>
          </View>

          {canEditPurchases ? (
          <TouchableOpacity
            onPress={openRecordGoods}
            activeOpacity={0.82}
            style={{ minHeight: 46, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: RADIUS.md, backgroundColor: COLORS.accent }}
          >
            <Feather name="plus" size={17} color="#FFFFFF" />
            <Text style={{ fontFamily: FONT.bold, fontSize: 14, color: '#FFFFFF' }}>Record goods bought</Text>
          </TouchableOpacity>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {[
              { label: 'TOTAL PURCHASED', value: formatCurrency(supplier.total_purchased ?? 0), color: COLORS.infoLight },
              { label: 'GOODS RECORDS', value: String(supplier.total_orders ?? 0), color: COLORS.successLight },
            ].map((stat) => (
              <View key={stat.label} style={{ flex: 1, padding: 10, borderWidth: 1, borderRadius: RADIUS.md, borderColor: 'rgba(255,253,248,0.1)', backgroundColor: 'rgba(255,253,248,0.06)' }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 9.5, color: 'rgba(255,253,248,0.58)', letterSpacing: 0.45 }}>{stat.label}</Text>
                <Text style={{ marginTop: 4, fontFamily: FONT.bold, fontSize: 14, color: stat.color }} numberOfLines={1}>{stat.value}</Text>
              </View>
            ))}
          </View>
        </Card>

        {supplierHasDetails ? (
          <Card style={{ padding: 16, gap: 12 }}>
            <Text style={{ fontFamily: FONT.bold, fontSize: 13, color: COLORS.text.primary }}>Supplier information</Text>
            {[
              supplier.phone ? { icon: 'phone' as const, label: supplier.phone } : null,
              supplier.email ? { icon: 'mail' as const, label: supplier.email } : null,
              supplier.address ? { icon: 'map-pin' as const, label: supplier.address } : null,
            ].filter(Boolean).map((detail) => (
              <View key={detail!.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Feather name={detail!.icon} size={14} color={COLORS.text.muted} />
                <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary }}>{detail!.label}</Text>
              </View>
            ))}
            {supplier.notes ? (
              <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 11, color: COLORS.text.muted }}>NOTE</Text>
                <Text style={{ marginTop: 4, fontFamily: FONT.regular, fontSize: 13, color: COLORS.text.secondary, fontStyle: 'italic' }}>
                  “{supplier.notes}”
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        <View>
          <SectionHeader
            title={`Recent goods (${supplierPurchases.length})`}
            action={canEditPurchases ? { label: 'Record goods', onPress: openRecordGoods } : undefined}
          />
          {supplierPurchases.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: COLORS.surface2 }}>
                <Feather name="package" size={18} color={COLORS.text.muted} />
              </View>
              <Text style={{ marginTop: 10, fontFamily: FONT.medium, color: COLORS.text.primary, fontSize: 13 }}>No goods recorded yet</Text>
              <Text style={{ marginTop: 3, fontFamily: FONT.regular, color: COLORS.text.muted, fontSize: 12, textAlign: 'center' }}>Record purchases to keep the balance and history up to date.</Text>
              {canEditPurchases ? (
                <Button title="Record goods bought" icon="plus" onPress={openRecordGoods} variant="secondary" size="sm" style={{ marginTop: 14 }} />
              ) : null}
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {supplierPurchases.map((purchase, index) => (
                <View key={purchase.id}>
                  <TouchableOpacity
                    onPress={canEditPurchases ? () => openEditPurchase(purchase.id) : undefined}
                    disabled={!canEditPurchases}
                    activeOpacity={0.75}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 11 }}
                  >
                    <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: `${COLORS.accent}14` }}>
                      <Feather name="package" size={17} color={COLORS.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>{getPurchaseItemsSummary(purchase, products)}</Text>
                      <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 11.5, color: COLORS.text.muted }} numberOfLines={1}>
                        {purchase.purchase_number} · {format(new Date(purchase.purchase_date || purchase.created_at), 'MMM d, yyyy')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', maxWidth: 102 }}>
                      <Text style={{ fontSize: 14, fontFamily: FONT.bold, color: COLORS.text.primary }} numberOfLines={1}>{formatCurrency(purchase.total_amount)}</Text>
                      <Text style={{ marginTop: 3, fontFamily: FONT.medium, fontSize: 11, color: purchase.amount_owed > 0 ? COLORS.danger : COLORS.success }} numberOfLines={1}>
                        {purchase.amount_owed > 0 ? `Owes ${formatCurrency(purchase.amount_owed)}` : 'Paid'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {(purchase.discount_amount > 0 || purchase.notes) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingLeft: 63 }}>
                      <Text style={{ flex: 1, fontFamily: FONT.regular, fontSize: 11.5, color: purchase.discount_amount > 0 ? COLORS.danger : COLORS.text.secondary }} numberOfLines={1}>
                        {purchase.discount_amount > 0 ? `Discount: -${formatCurrency(purchase.discount_amount)}` : purchase.notes}
                      </Text>
                      {canEditPurchases ? (
                        <TouchableOpacity onPress={() => handleDeletePurchase(purchase.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete purchase">
                          <Feather name="trash-2" size={14} color={COLORS.danger} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : (
                    <View style={{ alignItems: 'flex-end', paddingHorizontal: 14, paddingBottom: 10 }}>
                      {canEditPurchases ? (
                        <TouchableOpacity onPress={() => handleDeletePurchase(purchase.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete purchase">
                          <Feather name="trash-2" size={14} color={COLORS.danger} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  )}
                  {index < supplierPurchases.length - 1 ? <View style={{ height: 1, marginHorizontal: 14, backgroundColor: COLORS.border }} /> : null}
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal
        visible={manageSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setManageSheetVisible(false)}
      >
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,33,28,0.48)' }} onPress={() => setManageSheetVisible(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: COLORS.surface }}>
            <View style={{ width: 38, height: 4, alignSelf: 'center', borderRadius: 4, backgroundColor: COLORS.borderDark }} />
            <Text style={{ marginTop: 18, fontFamily: FONT.bold, fontSize: 17, color: COLORS.text.primary }}>Manage supplier</Text>
            <Text style={{ marginTop: 3, fontFamily: FONT.regular, fontSize: 12, color: COLORS.text.muted }}>{supplier.name}</Text>

            <TouchableOpacity
              onPress={handlePrintStatement}
              disabled={isPrinting}
              activeOpacity={0.8}
              style={{ minHeight: 50, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card, opacity: isPrinting ? 0.55 : 1 }}
            >
              <Feather name="printer" size={16} color={COLORS.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.primary }}>{isPrinting ? 'Preparing statement…' : 'Print supplier statement'}</Text>
                <Text style={{ marginTop: 2, fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Balance and recent goods records</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShareStatement}
              disabled={isSharingPDF}
              activeOpacity={0.8}
              style={{ minHeight: 50, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card, opacity: isSharingPDF ? 0.55 : 1 }}
            >
              <Feather name="share-2" size={16} color={COLORS.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.primary }}>{isSharingPDF ? 'Preparing PDF…' : 'Share as PDF'}</Text>
                <Text style={{ marginTop: 2, fontFamily: FONT.regular, fontSize: 11, color: COLORS.text.muted }}>Save statement to device</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setManageSheetVisible(false);
                openEditSupplier();
              }}
              activeOpacity={0.8}
              style={{ minHeight: 50, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: COLORS.border, backgroundColor: COLORS.card }}
            >
              <Feather name="edit-2" size={16} color={COLORS.text.secondary} />
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.primary }}>Edit supplier details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                setManageSheetVisible(false);
                await handleDelete();
              }}
              activeOpacity={0.8}
              style={{ minHeight: 50, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, borderWidth: 1, borderRadius: RADIUS.md, borderColor: '#F5C2BA', backgroundColor: '#FEF3F2' }}
            >
              <Feather name="trash-2" size={16} color={COLORS.danger} />
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.danger }}>Remove supplier</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setManageSheetVisible(false)} activeOpacity={0.8} style={{ alignItems: 'center', paddingVertical: 15 }}>
              <Text style={{ fontFamily: FONT.medium, fontSize: 14, color: COLORS.text.secondary }}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}
