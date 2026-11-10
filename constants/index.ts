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
  semiBold: 'Steradian Trial Bold',
  bold: 'Steradian Trial Bold',
  black: 'Steradian Trial Black',
} as const;

// ─── Colors ─────────────────────────────────────────────────────────────────
// Theme: Mature Royal Navy (#1E3A8A) + Canary Gold — prestigious clarity & executive elegance
export const COLORS = {
  // Core brand
  primary: '#1E3A8A',         // mature royal navy — navigation panel, tab bar, primary brand tone
  primaryBlue: '#1E3A8A',     // mature royal navy alias
  accent: '#FACC15',          // canary gold — primary action & highlights
  accentLight: '#FEF9C3',     // soft champagne/gold wash
  accentMuted: '#CA8A04',     // deeper gold for pressed states / borders
  accentDark: '#B45309',      // rich amber-gold for accessible text on light surfaces
  onAccent: '#1E3A8A',        // mature navy text/icons on canary gold surfaces
  gold: '#FACC15',            // canary gold — high-contrast revenue metrics & active highlights
  goldLight: '#FEF9C3',       // soft gold wash
  goldMuted: 'rgba(250, 204, 21, 0.18)', // translucent gold capsule

  // Surfaces
  ink: '#1E3A8A',             // mature royal navy — navigation headers, primary dark surfaces
  navPanel: '#0F172A',        // deep slate obsidian — bottom navigation panel / dock
  navy: '#2563EB',            // refined sapphire blue for secondary accents/badges
  navyLight: '#EFF6FF',       // soft royal wash
  card: '#FFFFFF',
  surface: '#f8fafc',         // crisp, modern off-white page background
  surface2: '#f1f5f9',        // subtle slate tint for secondary containers
  elevated: '#FFFFFF',

  // Semantic
  success: '#10b981',         // emerald green
  successLight: '#ecfdf5',
  warning: '#f59e0b',         // lively warm amber-orange
  warningLight: '#fffbeb',
  danger: '#ef4444',          // modern crimson red
  dangerLight: '#fef2f2',
  info: '#0284c7',            // ocean blue
  infoLight: '#f0f9ff',

  // Text
  text: {
    primary: '#0f172a',       // slate-900 for ultra-crisp, mature readability
    secondary: '#475569',     // slate-600
    muted: '#94a3b8',         // slate-400
    inverse: '#f8fafc',       // text on dark
    accent: '#B45309',        // rich amber-gold text (readable on white/light surfaces!)
    onAccent: '#1E3A8A',      // mature navy text on canary gold surfaces
  },

  // Borders
  border: '#eaedf1',          // whisper-thin, sophisticated edge (Upwork reference)
  borderSubtle: '#f1f4f8',    // ultra-soft for internal card dividers
  borderDark: '#cbd5e1',      // slate-300
  shadow: '#0f172a',

  // Chart palette
  chart: ['#FACC15', '#1E3A8A', '#0284c7', '#10b981', '#f59e0b', '#8b5cf6'],

  // Legacy aliases
  background: '#f8fafc',
  cyan: '#0284c7',
  cyanDark: '#1E3A8A',
  cyanLight: '#EFF6FF',
  lime: '#10b981',
  limeLight: '#ecfdf5',
  limeDark: '#059669',
  record: '#FACC15',
} as const;

// ─── Semantic accent groups ─────────────────────────────────────────────────
export const ACCENTS = {
  sales:     { bg: '#FEF9C3', border: '#FDE047', text: '#A16207' },
  inventory: { bg: '#f0f9ff', border: '#bae6fd', text: '#0284c7' },
  debt:      { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
  expense:   { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
  profit:    { bg: '#ecfdf5', border: '#a7f3d0', text: '#059669' },
  warning:   { bg: '#fffbeb', border: '#fde68a', text: '#d97706' },
  danger:    { bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
} as const;

// ─── Typography Scale ───────────────────────────────────────────────────────
export const TYPE = {
  h1:       { fontSize: 26, fontFamily: FONT.bold, letterSpacing: -0.4 },
  h2:       { fontSize: 21, fontFamily: FONT.bold, letterSpacing: -0.3 },
  h3:       { fontSize: 17, fontFamily: FONT.bold, letterSpacing: -0.2 },
  body:     { fontSize: 15, fontFamily: FONT.regular, letterSpacing: -0.1 },
  bodyBold: { fontSize: 15, fontFamily: FONT.bold, letterSpacing: -0.1 },
  caption:  { fontSize: 13, fontFamily: FONT.regular, letterSpacing: 0 },
  label:    { fontSize: 13, fontFamily: FONT.medium, letterSpacing: 0 },
  overline: { fontSize: 11, fontFamily: FONT.bold, letterSpacing: 1, textTransform: 'uppercase' as const },
  big:      { fontSize: 34, fontFamily: FONT.black, letterSpacing: -1 },
  stat:     { fontSize: 22, fontFamily: FONT.bold, letterSpacing: -0.5 },
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
  page: 18,
  card: 16,
} as const;

// ─── Border Radius ──────────────────────────────────────────────────────────
export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
} as const;

// ─── Shadows (flat cards for clean Upwork look; elevation 0 eliminates fuzzy borders) ─
export const SHADOW = {
  sm: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
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
  { value: 'damage', label: 'Damaged Goods / Loss' },
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
