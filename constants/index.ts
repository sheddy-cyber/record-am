import { BusinessType } from '@/types';

// ─── Brand ──────────────────────────────────────────────────────────────────
export const BRAND = {
  name: 'Record Am',
  tagline: 'Every sale, every naira, accounted for.',
} as const;

export const APP_VERSION = '1.0.0';
export const APP_FOOTER_TEXT = `v${APP_VERSION} · PYTHRON Labs`;
export const CURRENCY_SYMBOL = String.fromCharCode(0x20A6);

// ─── Typefaces ──────────────────────────────────────────────────────────────
// One family throughout: Geist. The bundled files add a naira sign (U+20A6),
// which stock Geist lacks, so amounts never fall back to another font.
// Families are registered in app/_layout.tsx. Use these instead of fontWeight.
export const FONT = {
  thin: 'Geist-Regular',
  light: 'Geist-Regular',
  regular: 'Geist-Regular',
  medium: 'Geist-Medium',
  semiBold: 'Geist-SemiBold',
  bold: 'Geist-SemiBold',
  black: 'Geist-Bold',
  heavy: 'Geist-Bold',
  /** Large titles and hero figures. */
  display: 'Geist-SemiBold',
  /** Quoted speech and notes set at display sizes. */
  displayRegular: 'Geist-Regular',
} as const;

export const FONT_ASSETS = {
  'Geist-Regular': require('../assets/fonts/Geist-Regular.ttf'),
  'Geist-Medium': require('../assets/fonts/Geist-Medium.ttf'),
  'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.ttf'),
  'Geist-Bold': require('../assets/fonts/Geist-Bold.ttf'),
} as const;

// ─── Palette ────────────────────────────────────────────────────────────────
// "Paper & Clay": warm paper surfaces, ink text, one earthy accent used sparingly.
// Semantic colours are deliberately muted so status never shouts over content.
export const PALETTE = {
  paper: '#F5F3EE',
  paperDeep: '#EDEAE3',
  white: '#FFFFFF',
  ink: '#1A1917',
  ink2: '#2B2925',
  graphite: '#57534C',
  stone: '#8A857B',
  pebble: '#B3AEA4',
  line: '#E6E2D9',
  lineSoft: '#EEEBE4',
  lineStrong: '#D3CEC2',
  clay: '#C4613F',
  clayDeep: '#A9502F',
  clayText: '#9A4527',
  clayTint: '#F6E7DF',
  green: '#2E7D4F',
  greenText: '#24663F',
  greenTint: '#E6F0E9',
  amber: '#B7791F',
  amberText: '#8A5A12',
  amberTint: '#F6EDDA',
  red: '#C2412D',
  redText: '#A3321F',
  redTint: '#F8E5E1',
  blue: '#3B6B9A',
  blueText: '#2F5A84',
  blueTint: '#E3EBF3',
} as const;

export const COLORS = {
  // Core brand
  primary: PALETTE.ink,
  primaryBlue: PALETTE.ink,
  accent: PALETTE.clay, // the one colour that means "act here"
  accentLight: PALETTE.clayTint,
  accentMuted: PALETTE.clayDeep, // pressed state
  accentDark: PALETTE.clayText, // accent-coloured text on light surfaces
  onAccent: '#FFFFFF',
  gold: PALETTE.clay,
  goldLight: PALETTE.clayTint,
  goldMuted: 'rgba(196, 97, 63, 0.12)',

  // Surfaces
  ink: PALETTE.ink, // primary text & primary buttons
  navPanel: PALETTE.white,
  navy: PALETTE.ink2, // selected / emphasised state
  navyLight: PALETTE.paperDeep,
  card: PALETTE.white,
  surface: PALETTE.paper, // page background
  surface2: PALETTE.paperDeep, // sunken containers, segmented controls
  elevated: PALETTE.white,
  scrim: 'rgba(26, 25, 23, 0.42)',

  // Semantic
  success: PALETTE.green,
  successLight: PALETTE.greenTint,
  successText: PALETTE.greenText,
  warning: PALETTE.amber,
  warningLight: PALETTE.amberTint,
  warningText: PALETTE.amberText,
  danger: PALETTE.red,
  dangerLight: PALETTE.redTint,
  dangerText: PALETTE.redText,
  info: PALETTE.blue,
  infoLight: PALETTE.blueTint,
  infoText: PALETTE.blueText,

  // Text
  text: {
    primary: PALETTE.ink,
    secondary: PALETTE.graphite,
    muted: PALETTE.stone,
    faint: PALETTE.pebble,
    inverse: '#FAF9F6',
    accent: PALETTE.clayText,
    onAccent: '#FFFFFF',
  },

  // Lines
  border: PALETTE.line,
  borderSubtle: PALETTE.lineSoft,
  borderDark: PALETTE.lineStrong,
  shadow: PALETTE.ink,

  // Charts, ordered so adjacent series stay distinguishable
  chart: [PALETTE.clay, PALETTE.ink2, '#7C9A86', '#D4A24C', '#6E8CAB', '#9C7AA0'],

  // Legacy aliases (kept so older call sites keep compiling)
  background: PALETTE.paper,
  secondary: PALETTE.graphite,
  cyan: PALETTE.blue,
  cyanDark: PALETTE.ink,
  cyanLight: PALETTE.blueTint,
  lime: PALETTE.green,
  limeLight: PALETTE.greenTint,
  limeDark: PALETTE.greenText,
  record: PALETTE.clay,
} as const;

// ─── Semantic accent groups ─────────────────────────────────────────────────
export const ACCENTS = {
  sales: { bg: PALETTE.clayTint, border: '#EBCDBE', text: PALETTE.clayText },
  inventory: { bg: PALETTE.blueTint, border: '#C9D7E6', text: PALETTE.blueText },
  debt: { bg: PALETTE.redTint, border: '#EECAC2', text: PALETTE.redText },
  expense: { bg: PALETTE.amberTint, border: '#E9D6AE', text: PALETTE.amberText },
  profit: { bg: PALETTE.greenTint, border: '#C5DCCB', text: PALETTE.greenText },
  warning: { bg: PALETTE.amberTint, border: '#E9D6AE', text: PALETTE.amberText },
  danger: { bg: PALETTE.redTint, border: '#EECAC2', text: PALETTE.redText },
} as const;

// ─── Typography Scale ───────────────────────────────────────────────────────
export const TYPE = {
  display: { fontSize: 40, fontFamily: FONT.display, letterSpacing: -1.3, lineHeight: 46 },
  largeTitle: { fontSize: 30, fontFamily: FONT.display, letterSpacing: -0.9, lineHeight: 36 },
  h1: { fontSize: 25, fontFamily: FONT.display, letterSpacing: -0.7 },
  h2: { fontSize: 20, fontFamily: FONT.semiBold, letterSpacing: -0.3 },
  h3: { fontSize: 17, fontFamily: FONT.semiBold, letterSpacing: -0.2 },
  body: { fontSize: 15, fontFamily: FONT.regular, letterSpacing: -0.1, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontFamily: FONT.semiBold, letterSpacing: -0.1 },
  callout: { fontSize: 14, fontFamily: FONT.regular, letterSpacing: -0.05, lineHeight: 19 },
  caption: { fontSize: 13, fontFamily: FONT.regular, letterSpacing: 0 },
  footnote: { fontSize: 12, fontFamily: FONT.regular, letterSpacing: 0.05 },
  label: { fontSize: 13, fontFamily: FONT.medium, letterSpacing: 0 },
  overline: { fontSize: 11.5, fontFamily: FONT.medium, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  big: { fontSize: 34, fontFamily: FONT.display, letterSpacing: -1.1 },
  stat: { fontSize: 22, fontFamily: FONT.semiBold, letterSpacing: -0.5, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
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
  md: 12,
  lg: 18,
  xl: 22,
  '2xl': 28,
  full: 999,
} as const;

// ─── Elevation ──────────────────────────────────────────────────────────────
// Surfaces separate by tone, not shadow. Shadows are reserved for things that
// genuinely float (sheets, toasts, the tab bar).
export const SHADOW = {
  sm: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  md: {
    shadowColor: PALETTE.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: PALETTE.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

// ─── Motion ─────────────────────────────────────────────────────────────────
export const MOTION = {
  fast: 140,
  base: 220,
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
