import React, { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, Text, View } from 'react-native';
import { Icon } from '@/components/icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useBusinessStore } from '@/store/businessStore';
import { useDashboardStore } from '@/store/dashboardStore';
import { useAnalyticsStore } from '@/store/analyticsStore';
import { useDebtStore } from '@/store/debtStore';
import { useSaleStore } from '@/store/saleStore';
import { recordSaleOffline } from '@/lib/offlineRecords';
import { flushOfflineQueue } from '@/lib/offlineStore';
import { dismissScreen } from '@/lib/navigation';
import { Button } from '@/components/ui';
import { Toggle } from '@/components/forms';
import { FilePickerBox, ImportStep, importStyles } from '@/components/import';
import { HeaderAction, ScreenHeader, ScreenShell } from '@/components/layout';
import { COLORS, CURRENCY_SYMBOL, FONT, RADIUS, SP } from '@/constants';
import { CartItem, PaymentMethod, PaymentStatus, Product } from '@/types';

interface ParsedSaleRow {
  rowIndex: number;
  saleNumber: string;
  saleDateIso: string;
  saleDateLabel: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  amountPaidInput: number | null;
  isCreditHint: boolean;
  notes: string;
  status: 'valid' | 'warning' | 'error';
  statusMessage?: string;
  matchedProductId?: string;
}

interface GroupedSaleReceipt {
  saleNumber: string;
  createdAt: string;
  saleDateLabel: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  notes: string;
  items: ParsedSaleRow[];
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  paymentStatus: PaymentStatus;
  hasMissingProducts: boolean;
}

const TEMPLATE_HEADERS = [
  'Date',
  'Sale Number',
  'Product Name',
  'Quantity',
  'Unit Price',
  'Discount',
  'Total Amount',
  'Customer Name',
  'Customer Phone',
  'Payment Method',
  'Amount Paid',
  'Notes',
];

const SAMPLE_ROWS = [
  ['2026-10-15', 'INV-1001', 'Golden Penny Spaghetti 500g', 2, 1000, 0, 2000, 'Tunde Bakare', '08031234567', 'cash', 2000, 'Paid on counter'],
  ['2026-10-15', 'INV-1001', 'Peak Milk Tin 160g', 3, 750, 50, 2200, 'Tunde Bakare', '08031234567', 'cash', 2200, 'Combined receipt'],
  ['2026-10-16', 'INV-1002', 'Dano Powdered Milk 400g', 1, 1800, 0, 1800, '', '', 'transfer', 1800, 'Walk-in bank transfer'],
  ['2026-10-17', 'INV-1003', 'Ariel Detergent 400g', 4, 1100, 0, 4400, 'Amaka Obi', '08098765432', 'pos', 2000, 'Balance owed 2400'],
];

const cleanString = (val: unknown): string => {
  if (val === undefined || val === null) return '';
  return String(val).trim().replace(/\s+/g, ' ');
};

const cleanNumber = (val: unknown): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasNumericValue = (val: unknown): boolean => {
  if (val === undefined || val === null) return false;
  if (typeof val === 'number') return Number.isFinite(val);
  return String(val).trim() !== '' && /[0-9]/.test(String(val));
};

const normalizeName = (value: string) => cleanString(value).toLowerCase();

const normalizePaymentMethod = (
  raw: string,
): { method: PaymentMethod; isCreditHint: boolean } => {
  const lower = raw.trim().toLowerCase();
  if (!lower) return { method: 'cash', isCreditHint: false };
  if (lower.includes('credit') || lower.includes('unpaid') || lower.includes('debt')) {
    return { method: 'cash', isCreditHint: true };
  }
  if (lower.includes('mix') || lower.includes('split')) {
    return { method: 'mixed', isCreditHint: false };
  }
  if (lower.includes('pos') || lower.includes('card') || lower.includes('terminal') || lower.includes('atm')) {
    return { method: 'pos', isCreditHint: false };
  }
  if (
    lower.includes('transfer') ||
    lower.includes('bank') ||
    lower.includes('opay') ||
    lower.includes('palmpay') ||
    lower.includes('moniepoint') ||
    lower.includes('kuda')
  ) {
    return { method: 'transfer', isCreditHint: false };
  }
  if (lower.includes('mobile') || lower.includes('momo') || lower.includes('ussd')) {
    return { method: 'mobile_money', isCreditHint: false };
  }
  if (lower.includes('cash')) {
    return { method: 'cash', isCreditHint: false };
  }
  return { method: 'other', isCreditHint: false };
};

const parseSpreadsheetDate = (raw: unknown): { iso: string; label: string; parsedOk: boolean } => {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const safe = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate(), 12, 0, 0);
    return {
      iso: safe.toISOString(),
      label: format(safe, 'd MMM yyyy'),
      parsedOk: true,
    };
  }

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 100000) {
    try {
      const code = XLSX.SSF.parse_date_code(raw);
      if (code && code.y && code.m && code.d) {
        const safe = new Date(code.y, code.m - 1, code.d, 12, 0, 0);
        return {
          iso: safe.toISOString(),
          label: format(safe, 'd MMM yyyy'),
          parsedOk: true,
        };
      }
    } catch {
      // Fallback below
    }
  }

  const text = cleanString(raw);
  if (text) {
    // Handle YYYY-MM-DD explicitly in local noon so timezones never shift the day
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]);
      const d = Number(isoMatch[3]);
      const safe = new Date(y, m - 1, d, 12, 0, 0);
      if (!Number.isNaN(safe.getTime())) {
        return { iso: safe.toISOString(), label: format(safe, 'd MMM yyyy'), parsedOk: true };
      }
    }

    // Handle DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY
    const slashMatch = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(text);
    if (slashMatch) {
      const a = Number(slashMatch[1]);
      const b = Number(slashMatch[2]);
      let y = Number(slashMatch[3]);
      if (y < 100) y += 2000;
      const day = a > 12 ? a : b > 12 ? b : a;
      const month = a > 12 ? b : b > 12 ? a : b;
      const safe = new Date(y, month - 1, day, 12, 0, 0);
      if (!Number.isNaN(safe.getTime())) {
        return { iso: safe.toISOString(), label: format(safe, 'd MMM yyyy'), parsedOk: true };
      }
    }

    const fallback = new Date(text);
    if (!Number.isNaN(fallback.getTime())) {
      const safe = new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 12, 0, 0);
      return { iso: safe.toISOString(), label: format(safe, 'd MMM yyyy'), parsedOk: true };
    }
  }

  const now = new Date();
  return {
    iso: now.toISOString(),
    label: format(now, 'd MMM yyyy'),
    parsedOk: false,
  };
};

export default function ImportSalesScreen() {
  const { currentBusiness, currentBranch, user, profile } = useAuthStore();
  const { products, createProduct, fetchProducts } = useBusinessStore();

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedSaleRow[]>([]);
  const [deductStock, setDeductStock] = useState(false);
  const [autoCreateProducts, setAutoCreateProducts] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{ receipts: number; items: number } | null>(null);

  const productByName = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(normalizeName(p.name), p);
    }
    return map;
  }, [products]);

  const mapAndValidateRows = (rows: any[]): ParsedSaleRow[] => {
    if (!rows.length) return [];

    const keys = Object.keys(rows[0]);
    const findKey = (...synonyms: string[]) => {
      const cleanSyns = synonyms.map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
      return keys.find((k) => {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanSyns.some((syn) => cleanK === syn || cleanK.includes(syn));
      });
    };

    const dateKey = findKey('date', 'sale date', 'transaction date', 'created at', 'day', 'time');
    const saleNumberKey = findKey(
      'sale number',
      'receipt number',
      'receipt',
      'invoice number',
      'invoice',
      'reference',
      'ref',
      'order id',
      'bill no',
    );
    const productKey = findKey(
      'product name',
      'product',
      'item name',
      'item',
      'description',
      'goods',
      'service',
    );
    const qtyKey = findKey('quantity', 'qty', 'units', 'count', 'pcs');
    const unitPriceKey = findKey('unit price', 'selling price', 'price', 'rate');
    const discountKey = findKey('discount', 'discount amount', 'rebate');
    const totalKey = findKey('total amount', 'total', 'line total', 'subtotal', 'amount');
    const customerKey = findKey('customer name', 'customer', 'client', 'buyer');
    const phoneKey = findKey('customer phone', 'phone', 'mobile', 'tel');
    const methodKey = findKey('payment method', 'method', 'payment mode', 'mode', 'channel', 'paid via');
    const paidKey = findKey('amount paid', 'paid', 'deposit');
    const notesKey = findKey('notes', 'note', 'remark', 'remarks', 'comment');

    const dateStamp = format(new Date(), 'yyyyMMdd');

    return rows.map((row, index) => {
      const productName = cleanString(productKey ? row[productKey] : '');
      const rawDate = dateKey ? row[dateKey] : '';
      const parsedDate = parseSpreadsheetDate(rawDate);
      const rawSaleNumber = cleanString(saleNumberKey ? row[saleNumberKey] : '');
      const saleNumber = rawSaleNumber || `IMP-${dateStamp}-${index + 1}`;

      const rawQty = qtyKey ? cleanNumber(row[qtyKey]) : 1;
      const quantity = qtyKey && hasNumericValue(row[qtyKey]) ? rawQty : 1;
      const discount = Math.max(0, discountKey ? cleanNumber(row[discountKey]) : 0);

      let unitPrice = unitPriceKey ? cleanNumber(row[unitPriceKey]) : 0;
      let totalPrice = totalKey ? cleanNumber(row[totalKey]) : 0;

      if (unitPrice <= 0 && totalPrice > 0 && quantity > 0) {
        unitPrice = Number(((totalPrice + discount) / quantity).toFixed(2));
      } else if (totalPrice <= 0 && unitPrice > 0 && quantity > 0) {
        totalPrice = Math.max(0, Number((quantity * unitPrice - discount).toFixed(2)));
      }

      const customerName = cleanString(customerKey ? row[customerKey] : '');
      const customerPhone = cleanString(phoneKey ? row[phoneKey] : '');
      const methodRaw = cleanString(methodKey ? row[methodKey] : '');
      const { method: paymentMethod, isCreditHint } = normalizePaymentMethod(methodRaw);
      const amountPaidInput =
        paidKey && hasNumericValue(row[paidKey]) ? Math.max(0, cleanNumber(row[paidKey])) : null;
      const notes = cleanString(notesKey ? row[notesKey] : '');

      const matched = productName ? productByName.get(normalizeName(productName)) : undefined;

      let status: ParsedSaleRow['status'] = 'valid';
      let statusMessage: string | undefined;

      if (!productName) {
        status = 'error';
        statusMessage = 'Missing product/item name';
      } else if (quantity <= 0) {
        status = 'error';
        statusMessage = 'Quantity must be greater than 0';
      } else if (totalPrice <= 0 && unitPrice <= 0) {
        status = 'error';
        statusMessage = 'Unit price or Total amount must be greater than 0';
      } else if (!parsedDate.parsedOk && rawDate) {
        status = 'warning';
        statusMessage = 'Date not recognised, so today was used';
      } else if (!matched) {
        status = 'warning';
        statusMessage = autoCreateProducts
          ? 'New product will be added to catalog'
          : 'Product not in catalog';
      }

      return {
        rowIndex: index + 1,
        saleNumber,
        saleDateIso: parsedDate.iso,
        saleDateLabel: parsedDate.label,
        productName,
        quantity,
        unitPrice,
        discount,
        totalPrice,
        customerName,
        customerPhone,
        paymentMethod,
        amountPaidInput,
        isCreditHint,
        notes,
        status,
        statusMessage,
        matchedProductId: matched?.id,
      };
    });
  };

  const validRows = useMemo(
    () =>
      parsedRows.filter(
        (r) => r.status !== 'error' && (autoCreateProducts || Boolean(r.matchedProductId)),
      ),
    [parsedRows, autoCreateProducts],
  );

  const errorRowsCount = useMemo(
    () => parsedRows.filter((r) => r.status === 'error').length,
    [parsedRows],
  );

  const groupedReceipts = useMemo<GroupedSaleReceipt[]>(() => {
    const groups = new Map<string, ParsedSaleRow[]>();

    for (const row of validRows) {
      const key = `${row.saleNumber}::${row.saleDateLabel}`;
      const existing = groups.get(key) ?? [];
      existing.push(row);
      groups.set(key, existing);
    }

    return Array.from(groups.values()).map((items) => {
      const first = items[0];
      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const discountAmount = items.reduce((sum, item) => sum + item.discount, 0);
      const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

      let amountPaid = totalAmount;
      const paidValues = items
        .map((item) => item.amountPaidInput)
        .filter((val): val is number => val !== null);

      if (paidValues.length > 0) {
        // If every line repeats the same receipt-level payment total when total > max(paidValues),
        // treat per-line values intelligently; otherwise sum per-line amountPaid capped at totalAmount.
        const allSame = paidValues.every((v) => v === paidValues[0]);
        if (items.length > 1 && allSame && paidValues[0] > items[0].totalPrice) {
          amountPaid = Math.min(totalAmount, paidValues[0]);
        } else {
          amountPaid = Math.min(
            totalAmount,
            paidValues.reduce((sum, v) => sum + v, 0),
          );
        }
      } else if (first.isCreditHint) {
        amountPaid = 0;
      }

      const amountOwed = Math.max(0, Number((totalAmount - amountPaid).toFixed(2)));
      const paymentStatus: PaymentStatus =
        amountOwed <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'credit';

      return {
        saleNumber: first.saleNumber,
        createdAt: first.saleDateIso,
        saleDateLabel: first.saleDateLabel,
        customerName: first.customerName || (amountOwed > 0 ? 'Credit Customer' : ''),
        customerPhone: first.customerPhone,
        paymentMethod: first.paymentMethod,
        notes: first.notes ? `Excel Import · ${first.notes}` : 'Imported from Excel',
        items,
        subtotal: Number(subtotal.toFixed(2)),
        discountAmount: Number(discountAmount.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2)),
        amountPaid: Number(amountPaid.toFixed(2)),
        amountOwed,
        paymentStatus,
        hasMissingProducts: items.some((it) => !it.matchedProductId),
      };
    });
  }, [validRows]);

  const handleDownloadTemplate = async () => {
    try {
      const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...SAMPLE_ROWS]);
      ws['!cols'] = [
        { wch: 13 },
        { wch: 15 },
        { wch: 28 },
        { wch: 10 },
        { wch: 12 },
        { wch: 10 },
        { wch: 14 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 },
        { wch: 14 },
        { wch: 22 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Template');

      const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileUri = `${FileSystem.cacheDirectory}RecordAm_Sales_Import_Template.xlsx`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Save or Share Sales Template',
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('Template Saved', 'Sales template generated in device cache.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate sales template.');
    }
  };

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

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setFileName(asset.name);
      setParsing(true);
      setImportResult(null);

      let rawRows: any[] = [];
      const lower = asset.name.toLowerCase();

      if (lower.endsWith('.csv')) {
        const content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
        rawRows = parsed.data as any[];
      } else {
        const base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const workbook = XLSX.read(base64, { type: 'base64', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: true });
      }

      if (!rawRows?.length) {
        Alert.alert('Empty File', 'No sales rows were found in this file.');
        return;
      }

      setParsedRows(mapAndValidateRows(rawRows));
    } catch (err: any) {
      Alert.alert('Unable to Read File', err?.message || 'Check that the file is a valid Excel (.xlsx/.xls) or CSV file.');
    } finally {
      setParsing(false);
    }
  };

  const handleImportSales = async () => {
    if (!currentBusiness || !currentBranch || !user?.id) {
      Alert.alert('No Active Business', 'Please ensure a business and branch are selected.');
      return;
    }

    if (groupedReceipts.length === 0) {
      Alert.alert('Nothing to Import', 'There are no valid sales rows ready to import.');
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: groupedReceipts.length });

    try {
      const productCache = new Map<string, Product>(productByName);
      let importedReceipts = 0;
      let importedItems = 0;

      for (let i = 0; i < groupedReceipts.length; i += 1) {
        const receipt = groupedReceipts[i];
        setImportProgress({ current: i + 1, total: groupedReceipts.length });

        const cart: CartItem[] = [];

        for (const row of receipt.items) {
          const norm = normalizeName(row.productName);
          let prod = productCache.get(norm);

          if (!prod) {
            if (!autoCreateProducts) continue;
            const created = await createProduct({
              business_id: currentBusiness.id,
              name: row.productName,
              unit: 'piece',
              cost_price: 0,
              selling_price: row.unitPrice > 0 ? row.unitPrice : row.totalPrice / Math.max(1, row.quantity),
              reorder_level: 5,
              is_service: false,
              is_active: true,
            });
            if (!created) {
              throw new Error(`Failed to create product "${row.productName}"`);
            }
            prod = created;
            productCache.set(norm, prod);
          }

          cart.push({
            product: prod,
            quantity: row.quantity,
            stock_quantity: row.quantity,
            sale_unit: prod.unit || 'piece',
            bundle_size: 1,
            unit_price: row.unitPrice,
            discount_amount: row.discount,
            total_price: row.totalPrice,
          });
        }

        if (cart.length === 0) continue;

        await recordSaleOffline({
          businessId: currentBusiness.id,
          branchId: currentBranch.id,
          userId: user.id,
          cart,
          customerName: receipt.customerName,
          customerPhone: receipt.customerPhone,
          paymentMethod: receipt.paymentMethod,
          notes: receipt.notes,
          subtotal: receipt.subtotal,
          discountAmount: receipt.discountAmount,
          totalAmount: receipt.totalAmount,
          amountPaid: receipt.amountPaid,
          amountOwed: receipt.amountOwed,
          paymentStatus: receipt.paymentStatus,
          saleNumber: receipt.saleNumber,
          soldByName: profile?.full_name || user?.user_metadata?.full_name || 'Excel Import',
          createdAt: receipt.createdAt,
          deductStock,
          immediateSync: false,
        });

        importedReceipts += 1;
        importedItems += cart.length;
      }

      // Sync batch to cloud once everything is queued
      await flushOfflineQueue();

      await Promise.all([
        fetchProducts(currentBusiness.id),
        useDebtStore.getState().fetchDebts(currentBusiness.id, currentBranch.id),
        useSaleStore.getState().loadSoldProductQuantities(currentBusiness.id, currentBranch.id, true),
        useDashboardStore.getState().fetchDashboardData(
          currentBusiness.id,
          currentBranch.id,
          useBusinessStore.getState().getStockAlerts,
        ),
      ]).catch(() => {});
      useAnalyticsStore.getState().reset();

      setImportResult({ receipts: importedReceipts, items: importedItems });

      Toast.show({
        type: 'success',
        text1: 'Sales Records Imported',
        text2: `${importedReceipts} receipt${importedReceipts === 1 ? '' : 's'} (${importedItems} line items) transferred.`,
      });
    } catch (err: any) {
      Alert.alert('Import Failed', err?.message || 'Could not finish importing all sales rows.');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const methodName = (m: string) =>
    ({ cash: 'Cash', transfer: 'Transfer', pos: 'POS', mobile_money: 'Mobile money', mixed: 'Split' } as Record<string, string>)[m] ?? m;

  return (
    <ScreenShell>
      <ScreenHeader
        title="Import sales"
        large
        subtitle={`Into ${currentBranch?.name ?? 'this'} branch`}
        left={<HeaderAction icon="arrow-left" onPress={() => dismissScreen()} />}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SP.page, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Template ───────────────────────────────────────── */}
        <ImportStep number={1} title="Start from the template" detail="One row per item sold. Rows with the same sale number become one receipt." />
        <Button title="Download template (.xlsx)" icon="download" variant="secondary" onPress={handleDownloadTemplate} />

        {/* ── 2. File ───────────────────────────────────────────── */}
        <ImportStep number={2} title="Choose your file" detail="Excel (.xlsx, .xls) or CSV." />
        <FilePickerBox fileName={fileName} busy={parsing} disabled={isImporting} onPress={handlePickDocument} />

        <View style={[styles.group, { marginTop: 14, paddingTop: 14, paddingHorizontal: 16 }]}>
          <Toggle
            label="Reduce stock for these sales"
            description="Leave off for old records, so today’s stock counts stay correct."
            value={deductStock}
            onChange={setDeductStock}
          />
          <Toggle
            label="Add products that aren’t in your list"
            description="New names in the file become products with zero stock."
            value={autoCreateProducts}
            onChange={setAutoCreateProducts}
          />
        </View>

        {/* ── 3. Review ─────────────────────────────────────────── */}
        {parsedRows.length > 0 ? (
          <>
            <ImportStep
              number={3}
              title="Check and import"
              detail={`${groupedReceipts.length} ${groupedReceipts.length === 1 ? 'sale' : 'sales'} · ${validRows.length} ${validRows.length === 1 ? 'line' : 'lines'}${
                errorRowsCount > 0 ? ` · ${errorRowsCount} skipped` : ''
              }`}
            />
            <View style={styles.group}>
              {groupedReceipts.slice(0, 8).map((receipt, i, list) => (
                <View key={`${receipt.saleNumber}-${receipt.createdAt}`} style={[styles.row, i < list.length - 1 && styles.divider]}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {receipt.customerName || 'Walk-in'}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {receipt.saleNumber} · {receipt.saleDateLabel} · {receipt.items.length} {receipt.items.length === 1 ? 'item' : 'items'} ·{' '}
                      {methodName(receipt.paymentMethod)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.rowAmount}>
                      {CURRENCY_SYMBOL}
                      {receipt.totalAmount.toLocaleString('en-NG')}
                    </Text>
                    {receipt.amountOwed > 0 ? (
                      <Text style={[styles.rowMeta, { color: COLORS.dangerText }]}>
                        Owes {CURRENCY_SYMBOL}
                        {receipt.amountOwed.toLocaleString('en-NG')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
            {groupedReceipts.length > 8 ? (
              <Text style={styles.more}>and {groupedReceipts.length - 8} more</Text>
            ) : null}

            {errorRowsCount > 0 ? (
              <View style={styles.errors}>
                <Text style={styles.errorsTitle}>These rows will be skipped</Text>
                {parsedRows
                  .filter((r) => r.status === 'error')
                  .slice(0, 5)
                  .map((errRow) => (
                    <Text key={errRow.rowIndex} style={styles.errorsText}>
                      Row {errRow.rowIndex}: {errRow.statusMessage}
                    </Text>
                  ))}
              </View>
            ) : null}

            {importResult ? (
              <View style={styles.done}>
                <Icon name="check-circle" size={20} color={COLORS.success} />
                <Text style={styles.doneText}>
                  Imported {importResult.receipts} {importResult.receipts === 1 ? 'sale' : 'sales'} ({importResult.items} items) into {currentBranch?.name}.
                </Text>
              </View>
            ) : (
              <Button
                title={
                  isImporting && importProgress
                    ? `Importing ${importProgress.current} of ${importProgress.total}…`
                    : `Import ${groupedReceipts.length} ${groupedReceipts.length === 1 ? 'sale' : 'sales'}`
                }
                size="lg"
                loading={isImporting}
                disabled={isImporting || groupedReceipts.length === 0}
                onPress={handleImportSales}
                style={{ marginTop: 16 }}
              />
            )}
          </>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = importStyles;
