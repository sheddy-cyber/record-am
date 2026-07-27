import { BusinessType } from '@/types';

// ─── Brand ──────────────────────────────────────────────────────────────────
export const BRAND = {
  name: 'Record Am',
  tagline: 'Smart records for everyday business.',
} as const;

export const APP_VERSION = '1.0.0';
export const APP_FOOTER_TEXT = `v${APP_VERSION} \u00B7 PYTHRON Labs`;
export const CURRENCY_SYMBOL = String.fromCharCode(0x20A6);

// ─── Font helpers ───────────────────────────────────────────────────────────
// Maps semantic weight names to the physical Steradian font-family strings
// registered in _layout.tsx. Use these EVERYWHERE instead of raw fontWeight.
export const FONT = {
  thin: 'Steradian Trial Thin',
  light: 'Steradian Trial Light',
  regular: 'Steradian Trial',
  medium: 'Steradian Trial Medium',
  bold: 'Steradian Trial Bold',
  black: 'Steradian Trial Black',
} as const;

// ─── Colors ─────────────────────────────────────────────────────────────────
// Theme: Atomic Tangerine + Steel Azure — warm energy meets professional depth
export const COLORS = {
  // Core brand
  accent: '#ff6b35',          // atomic tangerine — primary action
  accentLight: '#fff1eb',     // soft tangerine wash
  accentMuted: '#e55a25',     // deeper tangerine for pressed/text

  // Surfaces
  ink: '#004e89',             // steel azure — headers, tab bar, dark surfaces
  navy: '#1a659e',            // baltic blue for secondary dark
  card: '#FFFFFF',
  surface: '#f9f8f6',         // warm off-white page background
  surface2: '#efefd0',        // beige — subtle warm alt background
  elevated: '#FFFFFF',

  // Semantic
  success: '#2ecc71',
  successLight: '#eafaf1',
  warning: '#d97706',         // lively warm amber-orange — vibrant alerts & actions
  warningLight: '#fff8f0',
  danger: '#e74c3c',
  dangerLight: '#fdf0ef',
  info: '#1a659e',            // baltic blue
  infoLight: '#eaf2f8',

  // Text
  text: {
    primary: '#004e89',       // steel azure for primary text
    secondary: '#1a659e',     // baltic blue
    muted: '#7a9ab5',         // muted azure
    inverse: '#efefd0',       // beige — text on dark
    accent: '#ff6b35',
  },

  // Borders
  border: '#dde8f0',
  borderDark: '#b8cfdf',
  shadow: '#004e89',

  // Chart palette
  chart: ['#ff6b35', '#004e89', '#1a659e', '#f7c59f', '#efefd0', '#e55a25'],

  // Legacy aliases
  primary: '#ff6b35',
  background: '#f9f8f6',
  cyan: '#1a659e',
  cyanDark: '#004e89',
  cyanLight: '#eaf2f8',
  lime: '#2ecc71',
  limeLight: '#eafaf1',
  limeDark: '#27ae60',
  record: '#ff6b35',
} as const;

// ─── Semantic accent groups ─────────────────────────────────────────────────
export const ACCENTS = {
  sales:     { bg: '#fff1eb', border: '#ffd4bc', text: '#c44a1c' },
  inventory: { bg: '#eaf2f8', border: '#b8cfdf', text: '#004e89' },
  debt:      { bg: '#fdf0ef', border: '#f5c6c2', text: '#c0392b' },
  expense:   { bg: '#fef9f5', border: '#f7dfc8', text: '#b7650a' },
  profit:    { bg: '#eafaf1', border: '#a9dfbf', text: '#1e8449' },
  warning:   { bg: '#fef9f5', border: '#f7dfc8', text: '#b7650a' },
  danger:    { bg: '#fdf0ef', border: '#f5c6c2', text: '#c0392b' },
} as const;

// ─── Typography Scale ───────────────────────────────────────────────────────
export const TYPE = {
  h1:       { fontSize: 28, fontFamily: FONT.bold, letterSpacing: -0.4 },
  h2:       { fontSize: 22, fontFamily: FONT.bold, letterSpacing: -0.3 },
  h3:       { fontSize: 18, fontFamily: FONT.bold, letterSpacing: -0.2 },
  body:     { fontSize: 15, fontFamily: FONT.regular, letterSpacing: 0 },
  bodyBold: { fontSize: 15, fontFamily: FONT.bold, letterSpacing: 0 },
  caption:  { fontSize: 13, fontFamily: FONT.regular, letterSpacing: 0 },
  label:    { fontSize: 13, fontFamily: FONT.medium, letterSpacing: 0 },
  overline: { fontSize: 11, fontFamily: FONT.medium, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  big:      { fontSize: 34, fontFamily: FONT.black, letterSpacing: -0.5 },
  stat:     { fontSize: 24, fontFamily: FONT.bold, letterSpacing: -0.3 },
} as const;

// ─── Spacing (4-point grid) ─────────────────────────────────────────────────
export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  page: 20,
  card: 16,
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────
export const RADIUS = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
} as const;

// ─── Shadows (disabled — relying on borders and spacing for depth) ──────────
export const SHADOW = {
  sm: {},
  md: {},
  lg: {},
} as const;

// ─── Business Data ──────────────────────────────────────────────────────────

export const BUSINESS_TYPES: { value: BusinessType; label: string; icon?: string }[] = [
  { value: 'provisions', label: 'Provisions / Supermarket' },
  { value: 'pharmacy', label: 'Pharmacy / Chemist' },
  { value: 'cyber_cafe', label: 'Cyber Cafe / ICT Services' },
  { value: 'salon', label: 'Salon / Barber Shop' },
  { value: 'fashion', label: 'Fashion / Clothing' },
  { value: 'electronics', label: 'Electronics / Gadgets' },
  { value: 'food', label: 'Food / Restaurant' },
  { value: 'hardware', label: 'Hardware / Building' },
  { value: 'cosmetics', label: 'Cosmetics / Beauty' },
  { value: 'stationery', label: 'Stationery / Books' },
  { value: 'other', label: 'Other Business' },
];

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent / Shop Rent' },
  { value: 'electricity', label: 'Electricity / NEPA Bill' },
  { value: 'transport', label: 'Transport / Logistics' },
  { value: 'salary', label: 'Staff Salary' },
  { value: 'supplies', label: 'Office Supplies' },
  { value: 'maintenance', label: 'Maintenance / Repairs' },
  { value: 'marketing', label: 'Marketing / Advertising' },
  { value: 'internet', label: 'Internet / Data' },
  { value: 'water', label: 'Water Bill' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other Expense' },
];

export const PRODUCT_UNITS = [
  { value: 'piece', label: 'Piece / Item' },
  { value: 'page', label: 'Page' },
  { value: 'dozen', label: 'Dozen (12)' },
  { value: 'carton', label: 'Carton' },
  { value: 'pack', label: 'Pack' },
  { value: 'bag', label: 'Bag' },
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'g', label: 'Gram (g)' },
  { value: 'litre', label: 'Litre (L)' },
  { value: 'ml', label: 'Millilitre (ml)' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'tin', label: 'Tin / Can' },
  { value: 'roll', label: 'Roll' },
  { value: 'yard', label: 'Yard' },
  { value: 'metre', label: 'Metre (m)' },
  { value: 'hour', label: 'Hour (Services)' },
  { value: 'session', label: 'Session (Services)' },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank Transfer' },
  { value: 'pos', label: 'POS / Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'mixed', label: 'Mixed Payment' },
];

export const ROLES = [
  { value: 'owner', label: 'Owner', description: 'Full access to everything' },
  { value: 'manager', label: 'Manager', description: 'Manage stock, sales, and view reports' },
  { value: 'cashier', label: 'Cashier', description: 'Record sales only' },
  { value: 'auditor', label: 'Auditor', description: 'View-only access to reports' },
];
