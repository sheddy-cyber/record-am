import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { recordInventorySnapshotOffline } from '@/lib/offlineRecords';
import { Card, SectionHeader, Badge } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { BarcodeScannerModal } from '@/components/scanner/BarcodeScannerModal';
import { formatAmountInput } from '@/components/forms/keyboard';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { dismissScreen } from '@/lib/navigation';
import { Category, Product } from '@/types';

const COMMON_UNITS = [
  'piece',
  'carton',
  'pack',
  'bag',
  'kg',
  'bottle',
  'tin',
  'pair',
  'dozen',
];

interface SessionAddedItem {
  id: string;
  name: string;
  unit: string;
  categoryName?: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  barcode?: string;
  timestamp: string;
}

export default function RapidAddStockScreen() {
  const { currentBusiness, currentBranch } = useAuthStore();
  const {
    products,
    categories,
    createCategory,
    createProduct,
    updateProduct,
    fetchProducts,
  } = useBusinessStore();

  const nameInputRef = useRef<TextInput>(null);

  // Form states
  const [productName, setProductName] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [productUnit, setProductUnit] = useState('piece');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [barcode, setBarcode] = useState('');
  const [reorderLevel, setReorderLevel] = useState('5');
  const [lockCategoryAndUnit, setLockCategoryAndUnit] = useState(true);

  // Modals & UI states
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionItems, setSessionItems] = useState<SessionAddedItem[]>([]);
  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Focus name input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  // Handle Quick Category Creation
  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || !currentBusiness) return;

    setCreatingCategory(true);
    try {
      const created = await createCategory({
        business_id: currentBusiness.id,
        name: trimmed,
      });
      if (created) {
        setSelectedCategoryId(created.id);
        setNewCategoryName('');
        setNewCategoryModalOpen(false);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to create category.');
    } finally {
      setCreatingCategory(false);
    }
  };

  // Handle formatted amount inputs (delimiting thousands with commas)
  const handleAmountChange = (setter: (val: string) => void) => (text: string) => {
    const clean = text.replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : clean;
    setter(sanitized);
  };

  // Quick Quantity adjusters
  const addQty = (amount: number) => {
    const current = parseFloat(quantity.replace(/,/g, '')) || 0;
    setQuantity(String(Math.max(1, current + amount)));
  };

  // Save product and prepare for next item
  const handleSaveAndAddNext = async (exitAfter = false) => {
    if (!currentBusiness || !currentBranch) return;

    const cleanName = productName.trim().replace(/\s+/g, ' ');
    if (!cleanName) {
      Alert.alert('Product Name Required', 'Please enter a name for the product.');
      nameInputRef.current?.focus();
      return;
    }

    const parsedSellingPrice = parseFloat(sellingPrice.replace(/,/g, '')) || 0;
    if (parsedSellingPrice <= 0) {
      Alert.alert('Selling Price Required', 'Enter a selling price greater than zero.');
      return;
    }

    const parsedCostPrice = parseFloat(costPrice.replace(/,/g, '')) || 0;
    const parsedQuantity = parseFloat(quantity.replace(/,/g, '')) || 0;
    const parsedReorder = parseFloat(reorderLevel.replace(/,/g, '')) || 5;

    setSaving(true);
    try {
      const existingProduct = products.find(
        (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase(),
      );

      let savedProduct: Product | null = null;

      if (existingProduct) {
        // Restock existing product seamlessly without interruptions or warnings
        await updateProduct(existingProduct.id, {
          selling_price: parsedSellingPrice > 0 ? parsedSellingPrice : existingProduct.selling_price,
          cost_price: parsedCostPrice > 0 ? parsedCostPrice : existingProduct.cost_price,
          barcode: barcode.trim() || existingProduct.barcode,
        });

        savedProduct = {
          ...existingProduct,
          selling_price: parsedSellingPrice > 0 ? parsedSellingPrice : existingProduct.selling_price,
          cost_price: parsedCostPrice > 0 ? parsedCostPrice : existingProduct.cost_price,
          barcode: barcode.trim() || existingProduct.barcode,
        };

        if (parsedQuantity > 0) {
          const currentStock = existingProduct.inventory?.[0]?.quantity ?? 0;
          await recordInventorySnapshotOffline({
            businessId: currentBusiness.id,
            branchId: currentBranch.id,
            productId: existingProduct.id,
            quantity: currentStock + parsedQuantity,
            movement: {
              type: 'stock_in',
              quantity: parsedQuantity,
              unit_cost: parsedCostPrice > 0 ? parsedCostPrice : undefined,
              total_cost: parsedCostPrice > 0 ? parsedCostPrice * parsedQuantity : undefined,
              notes: 'Rapid entry restock',
            },
          });
        }
      } else {
        savedProduct = await createProduct({
          business_id: currentBusiness.id,
          category_id: selectedCategoryId || undefined,
          category: selectedCategory,
          name: cleanName,
          unit: productUnit.trim() || 'piece',
          cost_price: parsedCostPrice,
          selling_price: parsedSellingPrice,
          reorder_level: parsedReorder,
          barcode: barcode.trim() || undefined,
          is_service: false,
        });

        if (!savedProduct) {
          throw new Error('Could not save product.');
        }

        // Record inventory snapshot
        if (parsedQuantity > 0) {
          await recordInventorySnapshotOffline({
            businessId: currentBusiness.id,
            branchId: currentBranch.id,
            productId: savedProduct.id,
            quantity: parsedQuantity,
            movement: {
              type: 'stock_in',
              quantity: parsedQuantity,
              unit_cost: parsedCostPrice > 0 ? parsedCostPrice : undefined,
              total_cost: parsedCostPrice > 0 ? parsedCostPrice * parsedQuantity : undefined,
              notes: 'Rapid entry opening stock',
            },
          });
        }
      }

      try {
        Vibration.vibrate(40);
      } catch (_) {}

      // Add to session history
      const sessionEntry: SessionAddedItem = {
        id: savedProduct.id,
        name: savedProduct.name,
        unit: savedProduct.unit,
        categoryName: selectedCategory?.name,
        quantity: parsedQuantity,
        costPrice: parsedCostPrice,
        sellingPrice: parsedSellingPrice,
        barcode: savedProduct.barcode,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setSessionItems((prev) => [sessionEntry, ...prev]);

      Toast.show({
        type: 'success',
        text1: 'Added!',
        text2: `${cleanName} (${parsedQuantity} ${savedProduct.unit}) added to stock.`,
        visibilityTime: 1800,
      });

      if (exitAfter) {
        dismissScreen();
        return;
      }

      // Reset fields for the next product
      setProductName('');
      setCostPrice('');
      setSellingPrice('');
      setQuantity('1');
      setBarcode('');

      // If lockCategoryAndUnit is false, reset category & unit as well
      if (!lockCategoryAndUnit) {
        setSelectedCategoryId(null);
        setProductUnit('piece');
      }

      // Re-focus on name input for seamless high-speed entry
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add product.');
    } finally {
      setSaving(false);
    }
  };

  const closeScreen = () => {
    if (productName.trim() || sellingPrice.trim()) {
      Alert.alert(
        'Unsaved Product',
        'You have details typed for a product. Do you want to discard it and finish?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard & Exit', style: 'destructive', onPress: () => dismissScreen() },
        ],
      );
    } else {
      dismissScreen();
    }
  };

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Rapid Stock Entry"
        subtitle={`${sessionItems.length} ${sessionItems.length === 1 ? 'item' : 'items'} added this session`}
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
        right={
          <TouchableOpacity
            style={styles.doneHeaderButton}
            onPress={() => dismissScreen()}
            activeOpacity={0.8}
          >
            <Text style={styles.doneHeaderButtonText}>Done</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SP.page, paddingBottom: 40, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Rapid Entry Form Card */}
        <Card style={{ gap: 12 }}>
          {/* Product Name Input */}
          <View>
            <Text style={styles.fieldLabel}>Product Name *</Text>
            <View style={styles.inputBox}>
              <TextInput
                ref={nameInputRef}
                value={productName}
                onChangeText={setProductName}
                placeholder="e.g. Indomie Onion, Coca-Cola 50cl"
                placeholderTextColor={COLORS.text.muted}
                style={styles.textInput}
                returnKeyType="next"
              />
              {productName.length > 0 && (
                <TouchableOpacity
                  onPress={() => setProductName('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={14} color={COLORS.text.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Category Quick Chips */}
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.fieldLabel}>Category</Text>
              <TouchableOpacity
                onPress={() => setNewCategoryModalOpen((prev) => !prev)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Feather name="plus" size={12} color={COLORS.ink} />
                <Text style={{ fontSize: 11, fontFamily: FONT.semiBold, color: COLORS.ink }}>
                  New Category
                </Text>
              </TouchableOpacity>
            </View>

            {newCategoryModalOpen && (
              <View style={styles.newCategoryRow}>
                <TextInput
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="Category name..."
                  placeholderTextColor={COLORS.text.muted}
                  style={styles.newCategoryInput}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.newCategorySaveBtn}
                  onPress={handleCreateCategory}
                  disabled={creatingCategory || !newCategoryName.trim()}
                >
                  <Text style={styles.newCategorySaveText}>
                    {creatingCategory ? '...' : 'Add'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ padding: 6 }}
                  onPress={() => setNewCategoryModalOpen(false)}
                >
                  <Feather name="x" size={14} color={COLORS.text.muted} />
                </TouchableOpacity>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  selectedCategoryId === null && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategoryId(null)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategoryId === null && styles.categoryChipTextActive,
                  ]}
                >
                  General
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    selectedCategoryId === cat.id && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategoryId === cat.id && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Unit Chips */}
          <View>
            <Text style={styles.fieldLabel}>Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {COMMON_UNITS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[
                    styles.unitChip,
                    productUnit === u && styles.unitChipActive,
                  ]}
                  onPress={() => setProductUnit(u)}
                >
                  <Text
                    style={[
                      styles.unitChipText,
                      productUnit === u && styles.unitChipTextActive,
                    ]}
                  >
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Pricing: Cost & Selling Price */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Cost Price ({CURRENCY_SYMBOL})</Text>
              <View style={styles.inputBox}>
                <Text style={styles.currencyPrefix}>{CURRENCY_SYMBOL}</Text>
                <TextInput
                  value={formatAmountInput(costPrice)}
                  onChangeText={handleAmountChange(setCostPrice)}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.text.muted}
                  style={styles.textInput}
                />
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Selling Price ({CURRENCY_SYMBOL}) *</Text>
              <View style={[styles.inputBox, !sellingPrice && styles.inputBoxRequired]}>
                <Text style={styles.currencyPrefix}>{CURRENCY_SYMBOL}</Text>
                <TextInput
                  value={formatAmountInput(sellingPrice)}
                  onChangeText={handleAmountChange(setSellingPrice)}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.text.muted}
                  style={styles.textInput}
                />
              </View>
            </View>
          </View>

          {/* Quantity & Barcode */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Quantity */}
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Quantity ({productUnit})</Text>
              <View style={styles.inputBox}>
                <TextInput
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="1"
                  keyboardType="numeric"
                  placeholderTextColor={COLORS.text.muted}
                  style={styles.textInput}
                />
              </View>
              {/* Quick Stepper Buttons */}
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                {[1, 5, 10, 20].map((step) => (
                  <TouchableOpacity
                    key={`step-${step}`}
                    onPress={() => addQty(step)}
                    style={styles.stepperChip}
                  >
                    <Text style={styles.stepperChipText}>+{step}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Barcode */}
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Barcode (Optional)</Text>
              <View style={styles.inputBox}>
                <TextInput
                  value={barcode}
                  onChangeText={setBarcode}
                  placeholder="Scan or type"
                  placeholderTextColor={COLORS.text.muted}
                  style={styles.textInput}
                />
                <TouchableOpacity
                  onPress={() => setScannerOpen(true)}
                  style={styles.scanIconButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="maximize" size={15} color={COLORS.ink} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Keep Category/Unit toggle */}
          <TouchableOpacity
            style={styles.rememberToggle}
            onPress={() => setLockCategoryAndUnit((prev) => !prev)}
            activeOpacity={0.8}
          >
            <Feather
              name={lockCategoryAndUnit ? 'check-square' : 'square'}
              size={18}
              color={lockCategoryAndUnit ? COLORS.ink : COLORS.text.muted}
            />
            <Text style={styles.rememberToggleText}>
              Keep category ({selectedCategory?.name || 'General'}) & unit ({productUnit}) for next item
            </Text>
          </TouchableOpacity>

          {/* Action Buttons */}
          <View style={{ gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              style={styles.saveNextButton}
              onPress={() => handleSaveAndAddNext(false)}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Feather name="plus-circle" size={18} color={COLORS.onAccent} />
              <Text style={styles.saveNextButtonText}>
                {saving ? 'Saving...' : 'Save & Add Next Product'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveFinishButton}
              onPress={() => handleSaveAndAddNext(true)}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.saveFinishButtonText}>Save & Finish</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Live Session List */}
        {sessionItems.length > 0 && (
          <View style={{ gap: 10 }}>
            <View>
              <SectionHeader title={`Added in this Session (${sessionItems.length})`} />
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: -6, marginBottom: 8 }}>
                Recently created products appear here immediately
              </Text>
            </View>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {sessionItems.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.sessionRow,
                    index < sessionItems.length - 1 && styles.sessionRowBorder,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.sessionItemSubtext}>
                      {item.categoryName || 'General'} · {item.quantity} {item.unit} · Sell: {CURRENCY_SYMBOL}
                      {item.sellingPrice.toLocaleString()}
                      {item.costPrice > 0 ? ` · Cost: ${CURRENCY_SYMBOL}${item.costPrice.toLocaleString()}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <Badge label={`+${item.quantity} ${item.unit}`} variant="success" size="sm" />
                    <Text style={styles.sessionItemTime}>{item.timestamp}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(scanned) => setBarcode(scanned)}
        title="Scan Barcode for Product"
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  doneHeaderButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  doneHeaderButtonText: {
    color: COLORS.onAccent,
    fontFamily: FONT.bold,
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 10,
    height: 42,
  },
  inputBoxRequired: {
    borderColor: '#e2e8f0',
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONT.medium,
    color: COLORS.text.primary,
    paddingVertical: 0,
  },
  currencyPrefix: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.muted,
    marginRight: 4,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: 'rgba(0, 78, 137, 0.12)',
    borderColor: COLORS.ink,
  },
  categoryChipText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  categoryChipTextActive: {
    color: COLORS.ink,
    fontFamily: FONT.bold,
  },
  newCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    backgroundColor: '#eff6ff',
    padding: 6,
    borderRadius: RADIUS.md,
  },
  newCategoryInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: FONT.regular,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  newCategorySaveBtn: {
    backgroundColor: COLORS.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  newCategorySaveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: FONT.bold,
  },
  unitChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  unitChipActive: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  unitChipText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
  },
  unitChipTextActive: {
    color: '#FFFFFF',
    fontFamily: FONT.bold,
  },
  stepperChip: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    backgroundColor: COLORS.surface2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperChipText: {
    fontSize: 11,
    fontFamily: FONT.semiBold,
    color: COLORS.text.secondary,
  },
  scanIconButton: {
    padding: 6,
    backgroundColor: 'rgba(0, 78, 137, 0.08)',
    borderRadius: RADIUS.sm,
  },
  rememberToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  rememberToggleText: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    flex: 1,
  },
  saveNextButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveNextButtonText: {
    color: COLORS.onAccent,
    fontSize: 15,
    fontFamily: FONT.bold,
  },
  saveFinishButton: {
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  saveFinishButtonText: {
    color: COLORS.text.primary,
    fontSize: 13,
    fontFamily: FONT.semiBold,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 12,
  },
  sessionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sessionItemName: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  sessionItemSubtext: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  sessionItemTime: {
    fontSize: 10,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
  },
});
