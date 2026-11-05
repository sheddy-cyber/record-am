import React, { useState, useMemo } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { recordInventorySnapshotOffline } from '@/lib/offlineRecords';
import { Button, Card, EmptyState, SectionHeader, Badge } from '@/components/ui';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP, TYPE } from '@/constants';
import { dismissScreen } from '@/lib/navigation';
import { Category, Product } from '@/types';

interface ParsedStockRow {
  rowIndex: number;
  name: string;
  categoryName?: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  reorderLevel: number;
  barcode?: string;
  status: 'valid' | 'warning' | 'error';
  statusMessage?: string;
  isExisting?: boolean;
  existingProductId?: string;
}

const TEMPLATE_HEADERS = [
  'Product Name',
  'Category',
  'Unit',
  'Cost Price',
  'Selling Price',
  'Quantity',
  'Reorder Level',
  'Barcode',
];

const SAMPLE_TEMPLATE_ROWS = [
  ['Golden Penny Spaghetti 500g', 'Food & Provisions', 'pack', 850, 1000, 50, 10, '893456789012'],
  ['Peak Milk Tin 160g', 'Food & Provisions', 'tin', 600, 750, 30, 8, '893456789013'],
  ['Dano Powdered Milk 400g', 'Food & Provisions', 'sachet', 1500, 1800, 20, 5, ''],
  ['Ariel Detergent 400g', 'Household', 'pack', 900, 1100, 25, 5, ''],
  ['Paracetamol 500mg (10 tabs)', 'Health & Chemist', 'card', 200, 300, 100, 20, ''],
];

const cleanNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
};

const cleanString = (val: any): string => {
  if (val === undefined || val === null) return '';
  return String(val).trim().replace(/\s+/g, ' ');
};

const normalizeName = (name: string): string => {
  return cleanString(name).toLowerCase();
};

export default function ImportStockScreen() {
  const { currentBusiness, currentBranch } = useAuthStore();
  const {
    products,
    categories,
    createCategory,
    createProduct,
    fetchProducts,
  } = useBusinessStore();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedStockRow[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  const existingProductByName = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(normalizeName(p.name), p);
      if (p.barcode) {
        map.set(`barcode:${p.barcode.trim().toLowerCase()}`, p);
      }
    }
    return map;
  }, [products]);

  // Generate and Share Excel Template
  const handleDownloadTemplate = async () => {
    try {
      const data = [TEMPLATE_HEADERS, ...SAMPLE_TEMPLATE_ROWS];
      const ws = XLSX.utils.aoa_to_sheet(data);

      // Set column widths
      ws['!cols'] = [
        { wch: 30 }, // Product Name
        { wch: 20 }, // Category
        { wch: 12 }, // Unit
        { wch: 14 }, // Cost Price
        { wch: 14 }, // Selling Price
        { wch: 12 }, // Quantity
        { wch: 14 }, // Reorder Level
        { wch: 18 }, // Barcode
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Template');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = `${FileSystem.cacheDirectory}RecordAm_Stock_Import_Template.xlsx`;

      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Save or Share Stock Template',
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('Success', 'Template generated and ready in device cache.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate template.');
    }
  };

  // Pick Document and Parse
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'text/comma-separated-values',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setFileName(asset.name);
      setParsing(true);
      setImportSuccessCount(null);

      const uri = asset.uri;
      const lowerName = asset.name.toLowerCase();

      let rawRows: any[] = [];

      if (lowerName.endsWith('.csv')) {
        const fileContent = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
        rawRows = parsed.data;
      } else {
        // Read as base64 for XLSX/XLS
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const workbook = XLSX.read(base64, { type: 'base64' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      }

      if (!rawRows || rawRows.length === 0) {
        Alert.alert('Empty File', 'The selected file does not contain any product rows.');
        setParsing(false);
        return;
      }

      // Map Columns intelligently
      const mapped = mapAndValidateRows(rawRows);
      setParsedRows(mapped);
    } catch (err: any) {
      Alert.alert('Parsing Error', err?.message || 'Failed to read file. Please check file format.');
    } finally {
      setParsing(false);
    }
  };

  // Map arbitrary column headers to standard fields
  const mapAndValidateRows = (rows: any[]): ParsedStockRow[] => {
    if (!rows.length) return [];

    const keys = Object.keys(rows[0]);
    const findKey = (...synonyms: string[]) => {
      const cleanSynonyms = synonyms.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
      return keys.find((k) => {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanSynonyms.some((syn) => cleanK === syn || cleanK.includes(syn));
      });
    };

    const nameKey = findKey('product name', 'product', 'item name', 'item', 'title', 'name', 'description');
    const categoryKey = findKey('category', 'cat', 'dept', 'department', 'group');
    const unitKey = findKey('unit', 'uom', 'measurement', 'measure', 'unit of measure');
    const costKey = findKey('cost price', 'cost', 'buying price', 'buy price', 'purchase price');
    const sellingKey = findKey('selling price', 'price', 'sale price', 'sell price', 'rate');
    const qtyKey = findKey('quantity', 'qty', 'stock', 'opening stock', 'opening quantity', 'count');
    const reorderKey = findKey('reorder level', 'reorder', 'min stock', 'alert level');
    const barcodeKey = findKey('barcode', 'upc', 'ean', 'code', 'sku');

    return rows.map((row, index) => {
      const name = cleanString(nameKey ? row[nameKey] : '');
      const categoryName = cleanString(categoryKey ? row[categoryKey] : '');
      const unit = cleanString(unitKey ? row[unitKey] : '') || 'piece';
      const costPrice = cleanNumber(costKey ? row[costKey] : 0);
      const sellingPrice = cleanNumber(sellingKey ? row[sellingKey] : 0);
      const quantity = cleanNumber(qtyKey ? row[qtyKey] : 0);
      const reorderLevel = cleanNumber(reorderKey ? row[reorderKey] : 5) || 5;
      const barcode = cleanString(barcodeKey ? row[barcodeKey] : '') || undefined;

      let status: 'valid' | 'warning' | 'error' = 'valid';
      let statusMessage: string | undefined;

      // Validation
      if (!name) {
        status = 'error';
        statusMessage = 'Missing product name';
      } else if (sellingPrice <= 0) {
        status = 'error';
        statusMessage = 'Selling price is required and must be > 0';
      } else if (costPrice <= 0) {
        status = 'warning';
        statusMessage = 'Cost price is 0 (100% profit recorded)';
      }

      // Check if product already exists
      const existing =
        existingProductByName.get(normalizeName(name)) ||
        (barcode ? existingProductByName.get(`barcode:${barcode.toLowerCase()}`) : undefined);

      return {
        rowIndex: index + 2, // 1-indexed Excel row (row 1 is header)
        name,
        categoryName: categoryName || undefined,
        unit,
        costPrice,
        sellingPrice,
        quantity,
        reorderLevel,
        barcode,
        status,
        statusMessage,
        isExisting: Boolean(existing),
        existingProductId: existing?.id,
      };
    });
  };

  const validRows = useMemo(() => parsedRows.filter((r) => r.status !== 'error'), [parsedRows]);
  const errorRowsCount = useMemo(() => parsedRows.filter((r) => r.status === 'error').length, [parsedRows]);
  const warningRowsCount = useMemo(() => parsedRows.filter((r) => r.status === 'warning').length, [parsedRows]);

  // Execute Import
  const handleExecuteImport = async () => {
    if (!currentBusiness || !currentBranch) {
      Alert.alert('Branch required', 'Please select a business branch before importing.');
      return;
    }

    if (validRows.length === 0) {
      Alert.alert('No valid products', 'There are no valid products to import. Please check errors.');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    try {
      // 1. Prepare Categories cache
      const categoryMap = new Map<string, Category>();
      for (const cat of categories) {
        categoryMap.set(cat.name.toLowerCase().trim(), cat);
      }

      let successCount = 0;

      for (let i = 0; i < validRows.length; i++) {
        const item = validRows[i];
        setImportProgress({ current: i + 1, total: validRows.length });

        // Resolve or create category
        let resolvedCategory: Category | undefined;
        if (item.categoryName) {
          const lowerCat = item.categoryName.toLowerCase().trim();
          if (categoryMap.has(lowerCat)) {
            resolvedCategory = categoryMap.get(lowerCat);
          } else {
            // Auto create missing category
            const newCat = await createCategory({
              business_id: currentBusiness.id,
              name: item.categoryName,
            });
            if (newCat) {
              categoryMap.set(lowerCat, newCat);
              resolvedCategory = newCat;
            }
          }
        }

        // If item exists and updateExisting is checked, update stock
        if (item.isExisting && item.existingProductId && updateExisting) {
          if (item.quantity > 0) {
            await recordInventorySnapshotOffline({
              businessId: currentBusiness.id,
              branchId: currentBranch.id,
              productId: item.existingProductId,
              quantity: item.quantity,
              movement: {
                type: 'stock_in',
                quantity: item.quantity,
                unit_cost: item.costPrice > 0 ? item.costPrice : undefined,
                total_cost: item.costPrice > 0 ? item.costPrice * item.quantity : undefined,
                notes: 'Imported from spreadsheet (restock)',
              },
            });
          }
          successCount++;
          continue;
        }

        // Otherwise create new product
        const newProduct = await createProduct({
          business_id: currentBusiness.id,
          category_id: resolvedCategory?.id,
          category: resolvedCategory,
          name: item.name,
          unit: item.unit,
          cost_price: item.costPrice,
          selling_price: item.sellingPrice,
          reorder_level: item.reorderLevel,
          barcode: item.barcode,
          is_service: false,
        });

        if (newProduct && item.quantity > 0) {
          await recordInventorySnapshotOffline({
            businessId: currentBusiness.id,
            branchId: currentBranch.id,
            productId: newProduct.id,
            quantity: item.quantity,
            movement: {
              type: 'stock_in',
              quantity: item.quantity,
              unit_cost: item.costPrice > 0 ? item.costPrice : undefined,
              total_cost: item.costPrice > 0 ? item.costPrice * item.quantity : undefined,
              notes: 'Imported opening stock from spreadsheet',
            },
          });
        }

        successCount++;
      }

      setImportSuccessCount(successCount);
      await fetchProducts(currentBusiness.id);

      Toast.show({
        type: 'success',
        text1: 'Stock imported successfully!',
        text2: `${successCount} items added to your catalog.`,
      });
    } catch (err: any) {
      Alert.alert('Import Interrupted', err?.message || 'Some products could not be imported.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const closeScreen = () => dismissScreen();

  return (
    <ScreenShell backgroundColor={COLORS.surface} statusBarStyle="light">
      <ScreenHeader
        title="Import Stock"
        subtitle="Bulk add products from Excel or CSV"
        theme="dark"
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: SP.page, paddingBottom: 60, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Step 1: Download Template */}
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: RADIUS.md,
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="file-text" size={20} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: FONT.bold, color: COLORS.text.primary }}>
                Need a template?
              </Text>
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary }}>
                Download our sample spreadsheet with ready-made columns and examples.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.templateButton}
            onPress={handleDownloadTemplate}
            activeOpacity={0.8}
          >
            <Feather name="download" size={16} color={COLORS.ink} />
            <Text style={styles.templateButtonText}>Download Excel Template (.xlsx)</Text>
          </TouchableOpacity>
        </Card>

        {/* Step 2: Upload File */}
        <Card style={{ gap: 14 }}>
          <View>
            <SectionHeader title="Upload Your File" />
            <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: -6, marginBottom: 8 }}>
              Supports Excel (.xlsx, .xls) and CSV
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.uploadBox, fileName && styles.uploadBoxActive]}
            onPress={handlePickDocument}
            activeOpacity={0.75}
            disabled={parsing || isImporting}
          >
            {parsing ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={COLORS.ink} />
                <Text style={styles.uploadPrompt}>Reading spreadsheet data...</Text>
              </View>
            ) : fileName ? (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Feather name="check-circle" size={32} color={COLORS.success} />
                <Text style={styles.uploadFileName} numberOfLines={1}>
                  {fileName}
                </Text>
                <Text style={styles.uploadChangePrompt}>Tap to choose a different file</Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <View style={styles.uploadIconCircle}>
                  <Feather name="upload-cloud" size={26} color={COLORS.ink} />
                </View>
                <Text style={styles.uploadPrompt}>Tap to choose an Excel or CSV file</Text>
                <Text style={styles.uploadHint}>From Google Drive, WhatsApp, or local storage</Text>
              </View>
            )}
          </TouchableOpacity>
        </Card>

        {/* Step 3: Preview & Validation */}
        {parsedRows.length > 0 && !importSuccessCount && (
          <View style={{ gap: 14 }}>
            <View>
              <SectionHeader title={`File Preview (${parsedRows.length} items)`} />
              <Text style={{ fontSize: 12, fontFamily: FONT.regular, color: COLORS.text.secondary, marginTop: -6, marginBottom: 8 }}>
                Review items and validation status before importing
              </Text>
            </View>

            {/* Stats Badges */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[styles.statChip, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
                <Feather name="check" size={14} color={COLORS.success} />
                <Text style={[styles.statChipText, { color: '#065f46' }]}>
                  {validRows.length} Ready
                </Text>
              </View>

              {warningRowsCount > 0 && (
                <View style={[styles.statChip, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
                  <Feather name="alert-triangle" size={14} color={COLORS.warning} />
                  <Text style={[styles.statChipText, { color: '#92400e' }]}>
                    {warningRowsCount} Warnings
                  </Text>
                </View>
              )}

              {errorRowsCount > 0 && (
                <View style={[styles.statChip, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                  <Feather name="x-circle" size={14} color={COLORS.danger} />
                  <Text style={[styles.statChipText, { color: '#991b1b' }]}>
                    {errorRowsCount} Errors
                  </Text>
                </View>
              )}
            </View>

            {/* Update duplicate toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setUpdateExisting((prev) => !prev)}
              activeOpacity={0.8}
            >
              <Feather
                name={updateExisting ? 'check-square' : 'square'}
                size={20}
                color={updateExisting ? COLORS.ink : COLORS.text.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Update existing products</Text>
                <Text style={styles.toggleDesc}>
                  If a product already exists in stock, add to its current quantity instead of creating a duplicate.
                </Text>
              </View>
            </TouchableOpacity>

            {/* Sample of Parsed Rows */}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {parsedRows.slice(0, 10).map((row, idx) => (
                <View
                  key={`row-${idx}`}
                  style={[
                    styles.previewRow,
                    idx < Math.min(parsedRows.length, 10) - 1 && styles.previewRowBorder,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.rowProductName} numberOfLines={1}>
                        {row.name || '(Unnamed Product)'}
                      </Text>
                      {row.isExisting && (
                        <Badge label="In Stock" variant="info" size="sm" />
                      )}
                    </View>
                    <Text style={styles.rowSubtext}>
                      {row.categoryName || 'General'} · {row.quantity} {row.unit} · Sell: {CURRENCY_SYMBOL}
                      {row.sellingPrice.toLocaleString()}
                      {row.costPrice > 0 ? ` · Cost: ${CURRENCY_SYMBOL}${row.costPrice.toLocaleString()}` : ''}
                    </Text>
                    {row.statusMessage && (
                      <Text
                        style={[
                          styles.rowStatusMessage,
                          row.status === 'error' ? { color: COLORS.danger } : { color: COLORS.warning },
                        ]}
                      >
                        {row.status === 'error' ? '✖ ' : '⚠ '}
                        {row.statusMessage}
                      </Text>
                    )}
                  </View>

                  <View>
                    {row.status === 'valid' && (
                      <Feather name="check-circle" size={18} color={COLORS.success} />
                    )}
                    {row.status === 'warning' && (
                      <Feather name="alert-circle" size={18} color={COLORS.warning} />
                    )}
                    {row.status === 'error' && (
                      <Feather name="slash" size={18} color={COLORS.danger} />
                    )}
                  </View>
                </View>
              ))}

              {parsedRows.length > 10 && (
                <View style={styles.moreRowsFooter}>
                  <Text style={styles.moreRowsText}>
                    + {parsedRows.length - 10} more products in file
                  </Text>
                </View>
              )}
            </Card>

            {/* Import Button */}
            <Button
              title={
                isImporting
                  ? `Importing (${importProgress?.current || 0}/${importProgress?.total || validRows.length})...`
                  : `Import ${validRows.length} Products`
              }
              onPress={handleExecuteImport}
              loading={isImporting}
              disabled={validRows.length === 0}
              size="lg"
            />
          </View>
        )}

        {/* Success Screen */}
        {importSuccessCount !== null && (
          <Card style={{ alignItems: 'center', padding: 24, gap: 14 }}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={36} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle}>Import Complete!</Text>
            <Text style={styles.successMessage}>
              Successfully added {importSuccessCount} products to your stock catalog in{' '}
              {currentBranch?.name || 'Main Branch'}.
            </Text>

            <View style={{ width: '100%', maxWidth: 320, gap: 10, marginTop: 8, alignItems: 'center', alignSelf: 'center' }}>
              <Button
                title="View in Inventory"
                onPress={closeScreen}
                variant="primary"
                style={{ width: '100%' }}
              />
              <Button
                title="Import Another"
                onPress={() => {
                  setFileName(null);
                  setParsedRows([]);
                  setImportSuccessCount(null);
                }}
                variant="secondary"
                style={{ width: '100%' }}
              />
            </View>
          </Card>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  templateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(0, 78, 137, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 78, 137, 0.2)',
  },
  templateButtonText: {
    color: COLORS.ink,
    fontSize: 13,
    fontFamily: FONT.semiBold,
  },
  uploadBox: {
    borderWidth: 2,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: RADIUS.lg,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  uploadBoxActive: {
    borderColor: COLORS.success,
    borderStyle: 'solid',
    backgroundColor: '#f0fdf4',
  },
  uploadIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  uploadPrompt: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    textAlign: 'center',
  },
  uploadHint: {
    fontSize: 12,
    fontFamily: FONT.regular,
    color: COLORS.text.muted,
    textAlign: 'center',
  },
  uploadFileName: {
    fontSize: 14,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    textAlign: 'center',
    maxWidth: '90%',
  },
  uploadChangePrompt: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.ink,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statChipText: {
    fontSize: 12,
    fontFamily: FONT.bold,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  toggleLabel: {
    fontSize: 13,
    fontFamily: FONT.semiBold,
    color: COLORS.text.primary,
  },
  toggleDesc: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 12,
  },
  previewRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowProductName: {
    fontSize: 13,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
    flexShrink: 1,
  },
  rowSubtext: {
    fontSize: 11,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    marginTop: 2,
  },
  rowStatusMessage: {
    fontSize: 11,
    fontFamily: FONT.medium,
    marginTop: 3,
  },
  moreRowsFooter: {
    paddingVertical: 10,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  moreRowsText: {
    fontSize: 12,
    fontFamily: FONT.medium,
    color: COLORS.text.muted,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 18,
    fontFamily: FONT.bold,
    color: COLORS.text.primary,
  },
  successMessage: {
    fontSize: 13,
    fontFamily: FONT.regular,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
