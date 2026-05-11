import { BusinessType } from '@/types';

// ─── Brand ──────────────────────────────────────────────────────────────────
export const BRAND = {
  name: 'Record Am',
  tagline: 'Smart records for everyday business.',
} as const;

export const APP_VERSION = '1.0.0';
export const APP_FOOTER_TEXT = `v${APP_VERSION} · PYTHRON Labs`;

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
export const COLORS = {
  // Core brand
  accent: '#C9963B',          // warm gold — primary accent
  accentLight: '#FDF5E6',     // light gold tint
  accentMuted: '#A07A2F',     // darker gold for text-on-light

  // Surfaces
  ink: '#0F172A',             // deepest navy — headers, tab bar
  navy: '#1E293B',            // secondary dark surface
  card: '#FFFFFF',
  surface: '#F8FAFC',         // page backgrounds
  surface2: '#F1F5F9',        // subtle card alt / input backgrounds
  elevated: '#FFFFFF',        // elevated surfaces (modals, overlays)

  // Semantic
  success: '#059669',
  successLight: '#ECFDF5',
  warning: '#D97706',
  warningLight: '#FFFBEB',
  danger: '#DC2626',
  dangerLight: '#FEF2F2',
  info: '#2563EB',
  infoLight: '#EFF6FF',

  // Text
  text: {
    primary: '#0F172A',
    secondary: '#475569',
    muted: '#94A3B8',
    inverse: '#F8FAFC',
    accent: '#C9963B',
  },

  // Borders & Shadows
  border: '#E2E8F0',
  borderDark: '#CBD5E1',
  shadow: '#0F172A',

  // Chart palette
  chart: ['#0F172A', '#C9963B', '#059669', '#2563EB', '#DC2626', '#7C3AED'],

  // Legacy aliases so existing code doesn't break during migration
  primary: '#C9963B',
  background: '#F8FAFC',
  cyan: '#C9963B',
  cyanDark: '#A07A2F',
  cyanLight: '#FDF5E6',
  lime: '#C9963B',
  limeLight: '#FDF5E6',
  limeDark: '#A07A2F',
  record: '#C9963B',
} as const;

// ─── Semantic accent groups ─────────────────────────────────────────────────
export const ACCENTS = {
  sales:     { bg: '#FDF5E6', border: '#F5DEB3', text: '#92610A' },
  inventory: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  debt:      { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  expense:   { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
  profit:    { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
  warning:   { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' },
  danger:    { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
} as const;

// ─── Typography Scale ───────────────────────────────────────────────────────
export const TYPE = {
  h1:       { fontSize: 28, fontFamily: FONT.bold, letterSpacing: -0.5 },
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
  page: 20,   // standard horizontal page padding
  card: 16,   // standard card padding
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

// ─── Shadows ────────────────────────────────────────────────────────────────
export const SHADOW = {
  sm: {
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
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
