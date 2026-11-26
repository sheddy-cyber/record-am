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
import { Icon } from '@/components/icons';
import { FilePickerBox, ImportStep, importStyles } from '@/components/import';
import { Toggle } from '@/components/forms';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { recordInventorySnapshotOffline } from '@/lib/offlineRecords';
import {
  defaultPurchaseLink,
  linkFields,
  planPurchaseForStock,
  purchaseLinkProblem,
  recordPurchaseForStock,
  StockPurchaseItem,
} from '@/lib/stockPurchaseLink';
import { PurchaseLinkFields } from '@/components/inventory/PurchaseLinkFields';
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
  const [purchaseLink, setPurchaseLink] = useState(defaultPurchaseLink);
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

    const linkProblem = purchaseLinkProblem(purchaseLink);
    if (linkProblem) {
      Alert.alert('Purchase details', linkProblem);
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    try {
      // The whole import is recorded as one purchase; every stock movement
      // points at it.
      const link = await planPurchaseForStock(purchaseLink);
      const purchased: StockPurchaseItem[] = [];

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
            const existing = useBusinessStore.getState().products.find((p) => p.id === item.existingProductId);
            const currentStock = Number(
              existing?.inventory?.find((row) => row.branch_id === currentBranch.id)?.quantity ?? 0,
            );
            // The quantity goes up by the spreadsheet amount (it used to replace the count).
            await recordInventorySnapshotOffline({
              businessId: currentBusiness.id,
              branchId: currentBranch.id,
              productId: item.existingProductId,
              quantity: currentStock + item.quantity,
              movement: {
                type: 'stock_in',
                quantity: item.quantity,
                unit_cost: item.costPrice > 0 ? item.costPrice : undefined,
                total_cost: item.costPrice > 0 ? item.costPrice * item.quantity : undefined,
                notes: 'Imported from spreadsheet (restock)',
                ...linkFields(link),
              },
            });
            if (existing) {
              purchased.push({
                product: existing,
                quantity: item.quantity,
                unitCost: item.costPrice > 0 ? item.costPrice : Number(existing.cost_price ?? 0),
              });
            }
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
              ...linkFields(link),
            },
          });
          purchased.push({ product: newProduct, quantity: item.quantity, unitCost: item.costPrice });
        }

        successCount++;
      }

      if (link && purchased.length > 0) {
        await recordPurchaseForStock({
          businessId: currentBusiness.id,
          branchId: currentBranch.id,
          items: purchased,
          choice: purchaseLink,
          notes: `Imported from a spreadsheet (${purchased.length} ${purchased.length === 1 ? 'item' : 'items'})`,
          link,
        });
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
    <ScreenShell>
      <ScreenHeader
        title="Import products"
        large
        subtitle={`Into ${currentBranch?.name ?? 'this'} branch`}
        left={<HeaderAction icon="arrow-left" onPress={closeScreen} />}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        {importSuccessCount !== null ? (
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 12 }}>
            <View style={styles.successIcon}>
              <Icon name="check" size={30} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <Text style={styles.successTitle}>
              {importSuccessCount} {importSuccessCount === 1 ? 'product' : 'products'} added
            </Text>
            <Text style={styles.successText}>They are in your stock list for {currentBranch?.name || 'this branch'}.</Text>
            <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 16 }}>
              <Button title="Go to stock" size="lg" onPress={closeScreen} />
              <Button
                title="Import another file"
                variant="secondary"
                size="lg"
                onPress={() => {
                  setFileName(null);
                  setParsedRows([]);
                  setImportSuccessCount(null);
                }}
              />
            </View>
          </View>
        ) : (
          <>
            <ImportStep number={1} title="Start from the template" detail="Columns for name, category, unit, quantity, cost and selling price, with examples." />
            <Button title="Download template (.xlsx)" icon="download" variant="secondary" onPress={handleDownloadTemplate} />

            <ImportStep number={2} title="Choose your file" detail="Excel (.xlsx, .xls) or CSV." />
            <FilePickerBox fileName={fileName} busy={parsing} disabled={isImporting} onPress={handlePickDocument} />

            {parsedRows.length > 0 ? (
              <>
                <ImportStep
                  number={3}
                  title="Check and import"
                  detail={[
                    `${validRows.length} ready`,
                    warningRowsCount > 0 ? `${warningRowsCount} with warnings` : null,
                    errorRowsCount > 0 ? `${errorRowsCount} will be skipped` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />

                <View style={[styles.group, { paddingTop: 14, paddingHorizontal: 16, marginBottom: 12 }]}>
                  <Toggle
                    label="Add to products you already have"
                    description="If a name matches an existing product, its quantity goes up instead of creating a duplicate."
                    value={updateExisting}
                    onChange={setUpdateExisting}
                  />
                  <PurchaseLinkFields
                    value={purchaseLink}
                    onChange={setPurchaseLink}
                    quantity={validRows.reduce((sum, row) => sum + (row.quantity > 0 ? row.quantity : 0), 0)}
                  />
                </View>

                <View style={styles.group}>
                  {parsedRows.slice(0, 10).map((row, idx, list) => (
                    <View key={`row-${idx}`} style={[styles.row, idx < list.length - 1 && styles.divider]}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {row.name || 'Unnamed product'}
                          </Text>
                          {row.isExisting ? <Text style={styles.existing}>Existing</Text> : null}
                        </View>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {row.quantity} {row.unit} · sells at {CURRENCY_SYMBOL}
                          {row.sellingPrice.toLocaleString()}
                          {row.costPrice > 0 ? ` · cost ${CURRENCY_SYMBOL}${row.costPrice.toLocaleString()}` : ''}
                        </Text>
                        {row.statusMessage ? (
                          <Text style={[styles.rowMeta, { color: row.status === 'error' ? COLORS.dangerText : COLORS.warningText }]}>
                            {row.statusMessage}
                          </Text>
                        ) : null}
                      </View>
                      <Icon
                        name={row.status === 'valid' ? 'check' : row.status === 'warning' ? 'alert-circle' : 'slash'}
                        size={17}
                        color={row.status === 'valid' ? COLORS.success : row.status === 'warning' ? COLORS.warning : COLORS.danger}
                      />
                    </View>
                  ))}
                </View>
                {parsedRows.length > 10 ? <Text style={styles.more}>and {parsedRows.length - 10} more in the file</Text> : null}

                <Button
                  title={
                    isImporting
                      ? `Importing ${importProgress?.current || 0} of ${importProgress?.total || validRows.length}…`
                      : `Import ${validRows.length} ${validRows.length === 1 ? 'product' : 'products'}`
                  }
                  onPress={handleExecuteImport}
                  loading={isImporting}
                  disabled={validRows.length === 0}
                  size="lg"
                  style={{ marginTop: 16 }}
                />
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  ...importStyles,
  existing: {
    fontSize: 10.5,
    fontFamily: FONT.medium,
    color: COLORS.text.secondary,
    backgroundColor: COLORS.surface2,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  successIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 26, fontFamily: FONT.display, color: COLORS.text.primary, textAlign: 'center' },
  successText: { fontSize: 15, fontFamily: FONT.regular, color: COLORS.text.secondary, textAlign: 'center' },
});
