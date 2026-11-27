// ============================================================
// RECORD AM - Icon set
// Drawn for Record Am on a 24-unit grid: 1.75 stroke, round caps, generous
// corner radii and a filled "point" detail where an icon needs an anchor.
// Names stay compatible with the glyph names used across the codebase.
// ============================================================

import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Pressable } from '@/components/ui/touchables';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

type GlyphProps = { c: string; bg: string };
type Glyph = (p: GlyphProps) => React.ReactElement;

// Shorthand drawing primitives. Every stroke inherits colour/width from <Svg>.
const P = ({ d }: { d: string }) => <Path d={d} />;
const Dot = ({ x, y, r = 1.15, c }: { x: number; y: number; r?: number; c: string }) => (
  <Circle cx={x} cy={y} r={r} fill={c} stroke="none" />
);

// Gear outline computed once: 8 teeth, rounded by the round line-join.
const GEAR_PATH = (() => {
  const cx = 12;
  const cy = 12;
  const rIn = 7;
  const rOut = 9.4;
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * 45 * Math.PI) / 180;
    const deg = (d: number) => (d * Math.PI) / 180;
    const at = (r: number, ang: number) =>
      `${(cx + r * Math.cos(ang)).toFixed(2)} ${(cy + r * Math.sin(ang)).toFixed(2)}`;
    pts.push(at(rIn, a - deg(14)), at(rOut, a - deg(8)), at(rOut, a + deg(8)), at(rIn, a + deg(14)));
  }
  return `M${pts.join(' L')} Z`;
})();

const GLYPHS = {
  // ── Navigation & primitives ────────────────────────────────────────────
  x: () => <P d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: () => <P d="M5 12.6l4.6 4.4L19 7.6" />,
  plus: () => <P d="M12 5v14M5 12h14" />,
  minus: () => <P d="M5 12h14" />,
  'chevron-right': () => <P d="M9.5 5.5L16 12l-6.5 6.5" />,
  'chevron-left': () => <P d="M14.5 5.5L8 12l6.5 6.5" />,
  'chevron-down': () => <P d="M5.5 9.5L12 16l6.5-6.5" />,
  'chevron-up': () => <P d="M5.5 14.5L12 8l6.5 6.5" />,
  'arrow-right': () => <P d="M4.5 12h15M13.5 6l6 6-6 6" />,
  'arrow-left': () => <P d="M19.5 12h-15M10.5 6l-6 6 6 6" />,
  'arrow-up': () => <P d="M12 19.5v-15M6 10.5l6-6 6 6" />,
  'arrow-down': () => <P d="M12 4.5v15M6 13.5l6 6 6-6" />,
  'arrow-up-right': () => <P d="M7 17L17 7M8.5 7H17v8.5" />,
  'arrow-down-left': () => <P d="M17 7L7 17M15.5 17H7V8.5" />,
  'arrow-down-right': () => <P d="M7 7l10 10M17 8.5V17H8.5" />,
  'arrow-right-circle': ({ c }) => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M8 12h8M13 9l3 3-3 3" />
    </>
  ),
  'corner-down-right': () => <P d="M6 4.5v6a4.5 4.5 0 0 0 4.5 4.5H19M15 11l4 4-4 4" />,
  'more-horizontal': ({ c }) => (
    <>
      <Dot x={5.5} y={12} r={1.6} c={c} />
      <Dot x={12} y={12} r={1.6} c={c} />
      <Dot x={18.5} y={12} r={1.6} c={c} />
    </>
  ),
  search: () => (
    <>
      <Circle cx={10.5} cy={10.5} r={6.25} />
      <P d="M15.2 15.2l4.8 4.8" />
    </>
  ),
  circle: () => <Circle cx={12} cy={12} r={8.5} />,
  square: () => <Rect x={4} y={4} width={16} height={16} rx={4} />,
  'check-square': () => (
    <>
      <Rect x={3.75} y={3.75} width={16.5} height={16.5} rx={4.5} />
      <P d="M8 12.3l2.8 2.7L16.3 9.5" />
    </>
  ),
  'check-circle': () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M8 12.4l2.7 2.6L16 9.6" />
    </>
  ),
  'x-circle': () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4" />
    </>
  ),
  'plus-circle': () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M12 8.2v7.6M8.2 12h7.6" />
    </>
  ),
  'minus-circle': () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M8.2 12h7.6" />
    </>
  ),
  'alert-circle': ({ c }) => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M12 7.6v5.2" />
      <Dot x={12} y={16.2} c={c} />
    </>
  ),
  'alert-triangle': ({ c }) => (
    <>
      <P d="M10.27 4.5a2 2 0 0 1 3.46 0l7.06 12.25A2 2 0 0 1 19.06 19.75H4.94a2 2 0 0 1-1.73-3z" />
      <P d="M12 9.4v4" />
      <Dot x={12} y={16.4} c={c} />
    </>
  ),
  'alert-octagon': ({ c }) => (
    <>
      <P d="M8.6 3.5h6.8l5.1 5.1v6.8l-5.1 5.1H8.6l-5.1-5.1V8.6z" />
      <P d="M12 8v4.8" />
      <Dot x={12} y={16} c={c} />
    </>
  ),
  'x-octagon': () => (
    <>
      <P d="M8.6 3.5h6.8l5.1 5.1v6.8l-5.1 5.1H8.6l-5.1-5.1V8.6z" />
      <P d="M9.6 9.6l4.8 4.8M14.4 9.6l-4.8 4.8" />
    </>
  ),
  info: ({ c }) => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M12 11v5.4" />
      <Dot x={12} y={7.9} c={c} />
    </>
  ),
  slash: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M5.8 18.2L18.2 5.8" />
    </>
  ),
  loader: () => <P d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />,

  // ── Commerce ────────────────────────────────────────────────────────────
  box: () => (
    <>
      <Rect x={4} y={9} width={16} height={11} rx={2.75} />
      <P d="M3.5 9l1.7-3.6A1.5 1.5 0 0 1 6.56 4.5h10.88a1.5 1.5 0 0 1 1.36.9L20.5 9" />
      <P d="M10 13h4" />
    </>
  ),
  package: () => (
    <>
      <Rect x={4} y={9} width={16} height={11} rx={2.75} />
      <P d="M3.5 9l1.7-3.6A1.5 1.5 0 0 1 6.56 4.5h10.88a1.5 1.5 0 0 1 1.36.9L20.5 9" />
      <P d="M10 13h4" />
    </>
  ),
  'box-fill': ({ c, bg }) => (
    <>
      <Rect x={4} y={9} width={16} height={11} rx={2.75} fill={c} />
      <P d="M3.5 9l1.7-3.6A1.5 1.5 0 0 1 6.56 4.5h10.88a1.5 1.5 0 0 1 1.36.9L20.5 9" />
      <Path d="M10 13h4" stroke={bg} />
    </>
  ),
  'shopping-bag': () => (
    <>
      <P d="M5.6 8.5h12.8l-.9 10.4a1.75 1.75 0 0 1-1.74 1.6H8.24a1.75 1.75 0 0 1-1.74-1.6z" />
      <P d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
  'shopping-cart': ({ c }) => (
    <>
      <P d="M3 4.5h2.1l2.2 10.3a1.5 1.5 0 0 0 1.47 1.2h8.36a1.5 1.5 0 0 0 1.45-1.1L20.4 8H6" />
      <Dot x={9.5} y={19.6} r={1.35} c={c} />
      <Dot x={17} y={19.6} r={1.35} c={c} />
    </>
  ),
  receipt: () => (
    <>
      <P d="M6 3.5h12v17l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25z" />
      <P d="M9 8.5h6M9 12h6M9 15.5h3.5" />
    </>
  ),
  'receipt-fill': ({ c, bg }) => (
    <>
      <Path d="M6 3.5h12v17l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25z" fill={c} />
      <Path d="M9 8.5h6M9 12h6M9 15.5h3.5" stroke={bg} />
    </>
  ),
  tag: ({ c }) => (
    <>
      <P d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.12l-6.88 6.88a1.5 1.5 0 0 1-2.12 0z" />
      <Dot x={8.2} y={8.2} r={1.4} c={c} />
    </>
  ),
  'credit-card': () => (
    <>
      <Rect x={3} y={5.5} width={18} height={13} rx={3} />
      <P d="M3 10h18M7 14.75h3" />
    </>
  ),
  'dollar-sign': ({ c }) => (
    <>
      <Rect x={2.75} y={6.25} width={18.5} height={11.5} rx={2.75} />
      <Circle cx={12} cy={12} r={2.6} />
      <Dot x={6.3} y={12} c={c} />
      <Dot x={17.7} y={12} c={c} />
    </>
  ),
  cash: ({ c }) => (
    <>
      <Rect x={2.75} y={6.25} width={18.5} height={11.5} rx={2.75} />
      <Circle cx={12} cy={12} r={2.6} />
      <Dot x={6.3} y={12} c={c} />
      <Dot x={17.7} y={12} c={c} />
    </>
  ),
  truck: () => (
    <>
      <P d="M2.75 7.25a1.5 1.5 0 0 1 1.5-1.5h8.5a1.5 1.5 0 0 1 1.5 1.5v9.5h-11.5z" />
      <P d="M14.25 10h3.4l3.1 3.3v3.45h-6.5" />
      <Circle cx={7} cy={17.5} r={1.85} />
      <Circle cx={17.2} cy={17.5} r={1.85} />
    </>
  ),
  printer: ({ c }) => (
    <>
      <P d="M7 8V4.25A.75.75 0 0 1 7.75 3.5h8.5a.75.75 0 0 1 .75.75V8" />
      <P d="M7 16.5H5.5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2H17" />
      <Rect x={7} y={13.25} width={10} height={7.25} rx={1.25} />
      <Dot x={17.2} y={10.9} c={c} />
    </>
  ),
  hash: () => <P d="M9.5 4L8 20M16 4l-1.5 16M4.5 9h15.5M4 15h15.5" />,
  maximize: () => (
    <>
      <P d="M4 8.5V6.25A2.25 2.25 0 0 1 6.25 4H8.5M15.5 4h2.25A2.25 2.25 0 0 1 20 6.25V8.5M20 15.5v2.25A2.25 2.25 0 0 1 17.75 20H15.5M8.5 20H6.25A2.25 2.25 0 0 1 4 17.75V15.5" />
      <P d="M7.5 12h9" />
    </>
  ),
  scan: () => (
    <>
      <P d="M4 8.5V6.25A2.25 2.25 0 0 1 6.25 4H8.5M15.5 4h2.25A2.25 2.25 0 0 1 20 6.25V8.5M20 15.5v2.25A2.25 2.25 0 0 1 17.75 20H15.5M8.5 20H6.25A2.25 2.25 0 0 1 4 17.75V15.5" />
      <P d="M7.5 12h9" />
    </>
  ),

  // ── Places & people ─────────────────────────────────────────────────────
  home: () => (
    <>
      <P d="M4 10.4L11.06 4.3a1.45 1.45 0 0 1 1.88 0L20 10.4V18.75A1.75 1.75 0 0 1 18.25 20.5H5.75A1.75 1.75 0 0 1 4 18.75z" />
      <P d="M9.75 20.5v-4.75a2.25 2.25 0 0 1 4.5 0v4.75" />
    </>
  ),
  'home-fill': ({ c, bg }) => (
    <>
      <Path
        d="M4 10.4L11.06 4.3a1.45 1.45 0 0 1 1.88 0L20 10.4V18.75A1.75 1.75 0 0 1 18.25 20.5H5.75A1.75 1.75 0 0 1 4 18.75z"
        fill={c}
      />
      <Path d="M9.75 20.5v-4.75a2.25 2.25 0 0 1 4.5 0v4.75" stroke={bg} fill={bg} />
    </>
  ),
  user: () => (
    <>
      <Circle cx={12} cy={8.25} r={3.75} />
      <P d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </>
  ),
  users: () => (
    <>
      <Circle cx={9} cy={8.75} r={3.25} />
      <P d="M3 19.5a6 6 0 0 1 12 0" />
      <P d="M15.25 5.7a3.2 3.2 0 0 1 0 6.1M17.4 14.1a6 6 0 0 1 3.6 5.4" />
    </>
  ),
  'user-x': () => (
    <>
      <Circle cx={9.5} cy={8.25} r={3.75} />
      <P d="M2.75 20a6.75 6.75 0 0 1 13.5 0M17.5 8.5l4 4M21.5 8.5l-4 4" />
    </>
  ),
  'user-minus': () => (
    <>
      <Circle cx={9.5} cy={8.25} r={3.75} />
      <P d="M2.75 20a6.75 6.75 0 0 1 13.5 0M17 10.5h5" />
    </>
  ),
  phone: ({ c }) => (
    <>
      <Rect x={6.75} y={2.75} width={10.5} height={18.5} rx={2.75} />
      <P d="M10.75 17.75h2.5" />
      <Dot x={12} y={5.6} r={0.8} c={c} />
    </>
  ),
  mail: () => (
    <>
      <Rect x={3} y={5.25} width={18} height={13.5} rx={3} />
      <P d="M3.75 7.25l7.2 5.1a1.8 1.8 0 0 0 2.1 0l7.2-5.1" />
    </>
  ),
  'map-pin': () => (
    <>
      <P d="M12 21s-6.75-5.9-6.75-11.25a6.75 6.75 0 0 1 13.5 0C18.75 15.1 12 21 12 21z" />
      <Circle cx={12} cy={9.75} r={2.4} />
    </>
  ),
  globe: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" />
    </>
  ),
  briefcase: () => (
    <>
      <Rect x={3} y={7} width={18} height={13} rx={3} />
      <P d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
    </>
  ),
  store: () => (
    <>
      <P d="M4 9.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19V9.5" />
      <P d="M3 9l1.6-4.1A1.5 1.5 0 0 1 6 4h12a1.5 1.5 0 0 1 1.4.9L21 9a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
      <P d="M9.75 20.5v-4.25a2.25 2.25 0 0 1 4.5 0v4.25" />
    </>
  ),

  // ── Records & documents ─────────────────────────────────────────────────
  calendar: ({ c }) => (
    <>
      <Rect x={3.5} y={5} width={17} height={15.5} rx={3} />
      <P d="M3.5 10h17M8 3v4M16 3v4" />
      <Dot x={8.25} y={14.75} r={1.2} c={c} />
    </>
  ),
  clock: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <P d="M12 7.5V12l3 2" />
    </>
  ),
  'file-text': () => (
    <>
      <P d="M6.5 3h7.4l4.6 4.6v11.9A1.5 1.5 0 0 1 17 21H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z" />
      <P d="M13.75 3.25V7.75h4.5M8.5 12.5h7M8.5 16h4.5" />
    </>
  ),
  clipboard: () => (
    <>
      <P d="M8.5 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1.5" />
      <Rect x={8.5} y={3} width={7} height={4} rx={1.4} />
      <P d="M8.5 12h7M8.5 15.5h4.5" />
    </>
  ),
  folder: () => (
    <P d="M3 7.25A2.25 2.25 0 0 1 5.25 5h3.6a1.5 1.5 0 0 1 1.1.48L11.5 7.2h7.25A2.25 2.25 0 0 1 21 9.45v7.3A2.25 2.25 0 0 1 18.75 19H5.25A2.25 2.25 0 0 1 3 16.75z" />
  ),
  inbox: () => (
    <>
      <P d="M3.5 13.5l2.4-7.2A1.75 1.75 0 0 1 7.56 5.1h8.88a1.75 1.75 0 0 1 1.66 1.2l2.4 7.2v4.75A1.75 1.75 0 0 1 18.75 20H5.25A1.75 1.75 0 0 1 3.5 18.25z" />
      <P d="M3.75 13.5H8.5l1.25 2.25h4.5l1.25-2.25h4.75" />
    </>
  ),
  layers: () => (
    <>
      <P d="M12 3.75l8.25 4.5L12 12.75l-8.25-4.5z" />
      <P d="M3.75 12.25L12 16.75l8.25-4.5M3.75 16.25L12 20.75l8.25-4.5" />
    </>
  ),
  list: ({ c }) => (
    <>
      <P d="M9 6.5h11M9 12h11M9 17.5h11" />
      <Dot x={4.75} y={6.5} r={1.2} c={c} />
      <Dot x={4.75} y={12} r={1.2} c={c} />
      <Dot x={4.75} y={17.5} r={1.2} c={c} />
    </>
  ),
  grid: () => (
    <>
      <Rect x={4} y={4} width={6.75} height={6.75} rx={2} />
      <Rect x={13.25} y={4} width={6.75} height={6.75} rx={2} />
      <Rect x={4} y={13.25} width={6.75} height={6.75} rx={2} />
      <Rect x={13.25} y={13.25} width={6.75} height={6.75} rx={2} />
    </>
  ),
  'grid-fill': ({ c }) => (
    <>
      <Rect x={4} y={4} width={6.75} height={6.75} rx={2} fill={c} />
      <Rect x={13.25} y={4} width={6.75} height={6.75} rx={2} fill={c} />
      <Rect x={4} y={13.25} width={6.75} height={6.75} rx={2} fill={c} />
      <Rect x={13.25} y={13.25} width={6.75} height={6.75} rx={2} fill={c} />
    </>
  ),

  // ── Insight ─────────────────────────────────────────────────────────────
  'bar-chart-2': () => (
    <>
      <Rect x={4.25} y={12} width={3.75} height={8} rx={1.4} />
      <Rect x={10.125} y={4.5} width={3.75} height={15.5} rx={1.4} />
      <Rect x={16} y={9} width={3.75} height={11} rx={1.4} />
    </>
  ),
  'pie-chart': () => (
    <>
      <P d="M10.5 4.6a8 8 0 1 0 8.9 8.9H10.5z" />
      <P d="M13.5 2.9a7.6 7.6 0 0 1 7.6 7.6h-7.6z" />
    </>
  ),
  activity: () => <P d="M3 12.5h3.75l2.5-6.5 5 13 2.5-6.5H21" />,
  'trending-up': () => <P d="M3.5 16.5l5.5-5.5 4 4 7.5-7.5M15 7.5h5.5V13" />,
  'trending-down': () => <P d="M3.5 7.5l5.5 5.5 4-4 7.5 7.5M15 16.5h5.5V11" />,
  award: () => (
    <>
      <Circle cx={12} cy={9} r={5.5} />
      <P d="M9.1 13.7L7.75 21 12 18.6l4.25 2.4-1.35-7.3" />
    </>
  ),
  star: () => (
    <P d="M12 3.6l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.2 6.9 19l1.1-5.6-4.2-3.9 5.7-.7z" />
  ),
  zap: () => <P d="M13.25 3L5 13.5h6.25L10.5 21 19 10.5h-6.25z" />,
  'zap-off': () => (
    <>
      <P d="M13.25 3L10.4 6.6M8.3 9.3L5 13.5h6.25L10.5 21l4.1-5.1M16.6 12.6L19 10.5h-6.25" />
      <P d="M3.5 3.5l17 17" />
    </>
  ),

  // ── Actions ─────────────────────────────────────────────────────────────
  'edit-2': () => (
    <P d="M4 20l.95-4.3L15.7 4.95a1.75 1.75 0 0 1 2.48 0l.87.87a1.75 1.75 0 0 1 0 2.48L8.3 19.05zM13.75 6.9l3.35 3.35" />
  ),
  'edit-3': () => (
    <>
      <P d="M4 20l.95-4.3L15.7 4.95a1.75 1.75 0 0 1 2.48 0l.87.87a1.75 1.75 0 0 1 0 2.48L8.3 19.05zM13.75 6.9l3.35 3.35" />
      <P d="M13 20.25h7" />
    </>
  ),
  'trash-2': () => (
    <>
      <P d="M4 6.5h16M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <P d="M6 6.5l.85 12.6A1.5 1.5 0 0 0 8.35 20.5h7.3a1.5 1.5 0 0 0 1.5-1.4L18 6.5M10 10.5v6M14 10.5v6" />
    </>
  ),
  copy: () => (
    <>
      <Rect x={8} y={8} width={12.5} height={12.5} rx={2.75} />
      <P d="M16 8V5.75A2.25 2.25 0 0 0 13.75 3.5h-8A2.25 2.25 0 0 0 3.5 5.75v8A2.25 2.25 0 0 0 5.75 16H8" />
    </>
  ),
  share: () => (
    <>
      <P d="M12 3.75v11M8 7.5l4-4 4 4" />
      <P d="M7.5 10.5H6.25a1.75 1.75 0 0 0-1.75 1.75v6.5a1.75 1.75 0 0 0 1.75 1.75h11.5a1.75 1.75 0 0 0 1.75-1.75v-6.5a1.75 1.75 0 0 0-1.75-1.75H16.5" />
    </>
  ),
  'share-2': () => (
    <>
      <P d="M12 3.75v11M8 7.5l4-4 4 4" />
      <P d="M7.5 10.5H6.25a1.75 1.75 0 0 0-1.75 1.75v6.5a1.75 1.75 0 0 0 1.75 1.75h11.5a1.75 1.75 0 0 0 1.75-1.75v-6.5a1.75 1.75 0 0 0-1.75-1.75H16.5" />
    </>
  ),
  download: () => <P d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.75h15" />,
  'upload-cloud': () => (
    <>
      <P d="M7.25 18.5a4.25 4.25 0 0 1-.55-8.46 5.75 5.75 0 0 1 11.1-.15 4.3 4.3 0 0 1-.55 8.6" />
      <P d="M12 12.25v8M9 15l3-3 3 3" />
    </>
  ),
  cloud: () => (
    <P d="M7.25 18.75a4.25 4.25 0 0 1-.55-8.46 5.75 5.75 0 0 1 11.1-.15 4.3 4.3 0 0 1-.55 8.61z" />
  ),
  'refresh-cw': () => <P d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3l2.2 2.05M19.5 4.5v4.25h-4.25" />,
  'rotate-ccw': () => <P d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.75M4.5 4.5v4.25h4.25" />,
  repeat: () => (
    <P d="M4.5 11V9.75a3.25 3.25 0 0 1 3.25-3.25H19.5M16.5 3.5l3 3-3 3M19.5 13v1.25a3.25 3.25 0 0 1-3.25 3.25H4.5M7.5 20.5l-3-3 3-3" />
  ),
  send: () => <P d="M20.5 3.5L10.2 13.8M20.5 3.5l-6.3 17-4-6.7-6.7-4z" />,
  'log-out': () => (
    <P d="M9.5 20.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5h3.5M15.5 16.5L20 12l-4.5-4.5M20 12H9.5" />
  ),
  'log-in': () => (
    <P d="M14.5 3.5H18A1.5 1.5 0 0 1 19.5 5v14a1.5 1.5 0 0 1-1.5 1.5h-3.5M9.5 16.5L14 12 9.5 7.5M14 12H3.5" />
  ),
  settings: () => (
    <>
      <P d={GEAR_PATH} />
      <Circle cx={12} cy={12} r={2.9} />
    </>
  ),
  sliders: ({ c }) => (
    <>
      <P d="M4 7.5h8.5M17.5 7.5H20M4 16.5h2.5M11.5 16.5H20" />
      <Circle cx={15} cy={7.5} r={2.25} />
      <Circle cx={9} cy={16.5} r={2.25} />
    </>
  ),
  tool: () => (
    <P d="M14.7 4.3a4.6 4.6 0 0 0-4.2 6.3l-6.05 6.05a1.95 1.95 0 0 0 2.75 2.75l6.05-6.05a4.6 4.6 0 0 0 6.3-4.2l-2.75 2.7-2.55-.5-.5-2.55z" />
  ),

  // ── Security & state ────────────────────────────────────────────────────
  lock: ({ c }) => (
    <>
      <Rect x={4.75} y={10.25} width={14.5} height={10.25} rx={2.75} />
      <P d="M8 10.25V7.75a4 4 0 0 1 8 0v2.5" />
      <Dot x={12} y={15.4} r={1.3} c={c} />
    </>
  ),
  key: () => (
    <>
      <Circle cx={8} cy={15.5} r={4} />
      <P d="M10.9 12.6L19.5 4M16.25 7.25l2.5 2.5M13.75 9.75l1.9 1.9" />
    </>
  ),
  shield: () => <P d="M12 3.25l7 2.6v5.55c0 4.6-2.95 8.25-7 9.6-4.05-1.35-7-5-7-9.6V5.85z" />,
  'shield-off': () => (
    <>
      <P d="M7.7 4.85L12 3.25l7 2.6v5.55a10.2 10.2 0 0 1-1.15 4.75M15.9 18.4A10.4 10.4 0 0 1 12 21c-4.05-1.35-7-5-7-9.6V6.4" />
      <P d="M3.5 3.5l17 17" />
    </>
  ),
  eye: () => (
    <>
      <P d="M2.75 12S6.1 5.75 12 5.75 21.25 12 21.25 12 17.9 18.25 12 18.25 2.75 12 2.75 12z" />
      <Circle cx={12} cy={12} r={2.85} />
    </>
  ),
  'eye-off': () => (
    <>
      <P d="M9.9 6.05A8.9 8.9 0 0 1 12 5.75c5.9 0 9.25 6.25 9.25 6.25a17 17 0 0 1-2.3 3.1M6.4 7.65A16.4 16.4 0 0 0 2.75 12S6.1 18.25 12 18.25a8.6 8.6 0 0 0 4.4-1.2" />
      <P d="M10 10.1a2.85 2.85 0 0 0 4 4M3.5 3.5l17 17" />
    </>
  ),
  bell: () => (
    <>
      <P d="M6 16.75V11a6 6 0 0 1 12 0v5.75l1.4 1.75H4.6z" />
      <P d="M10 20.75a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  'bell-off': () => (
    <>
      <P d="M8.1 6.2A6 6 0 0 1 18 11v4.6M15.7 18.5H4.6L6 16.75V11a6 6 0 0 1 .3-1.85M10 20.75a2.2 2.2 0 0 0 4 0" />
      <P d="M3.5 3.5l17 17" />
    </>
  ),
  wifi: ({ c }) => (
    <>
      <P d="M2.75 9.25a14 14 0 0 1 18.5 0M5.75 12.6a9.5 9.5 0 0 1 12.5 0M8.9 15.9a4.8 4.8 0 0 1 6.2 0" />
      <Dot x={12} y={19.25} r={1.3} c={c} />
    </>
  ),
  'wifi-off': ({ c }) => (
    <>
      <P d="M10.4 5.4a14 14 0 0 1 10.85 3.85M2.75 9.25a14 14 0 0 1 3.1-2.1M14.9 10.9a9.5 9.5 0 0 1 3.35 1.7M5.75 12.6a9.5 9.5 0 0 1 4.4-2.1M8.9 15.9a4.8 4.8 0 0 1 6.2 0" />
      <Dot x={12} y={19.25} r={1.3} c={c} />
      <P d="M3.5 3.5l17 17" />
    </>
  ),
  droplet: () => <P d="M12 3.5s6.25 6.5 6.25 10.75a6.25 6.25 0 0 1-12.5 0C5.75 10 12 3.5 12 3.5z" />,

  // ── Voice & media ───────────────────────────────────────────────────────
  mic: () => (
    <>
      <Rect x={8.75} y={3} width={6.5} height={11.5} rx={3.25} />
      <P d="M5.5 11.25a6.5 6.5 0 0 0 13 0M12 17.75V21" />
    </>
  ),
  'mic-fill': ({ c }) => (
    <>
      <Rect x={8.75} y={3} width={6.5} height={11.5} rx={3.25} fill={c} />
      <P d="M5.5 11.25a6.5 6.5 0 0 0 13 0M12 17.75V21" />
    </>
  ),
  'volume-2': () => (
    <>
      <P d="M4 9.5h2.9l4.6-4v13l-4.6-4H4a.75.75 0 0 1-.75-.75v-3.5A.75.75 0 0 1 4 9.5z" />
      <P d="M15 9.4a3.6 3.6 0 0 1 0 5.2M17.75 6.9a7.2 7.2 0 0 1 0 10.2" />
    </>
  ),
  play: () => <P d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10.3-6.4a.8.8 0 0 0 0-1.4L9.2 4.9a.8.8 0 0 0-1.2.7z" />,
  pause: () => (
    <>
      <Rect x={6.5} y={5} width={3.75} height={14} rx={1.25} />
      <Rect x={13.75} y={5} width={3.75} height={14} rx={1.25} />
    </>
  ),
  camera: () => (
    <>
      <P d="M3 9.25A2.25 2.25 0 0 1 5.25 7h2.4l1.35-2.1a1 1 0 0 1 .84-.45h4.32a1 1 0 0 1 .84.45L16.35 7h2.4A2.25 2.25 0 0 1 21 9.25v8.5A2.25 2.25 0 0 1 18.75 20H5.25A2.25 2.25 0 0 1 3 17.75z" />
      <Circle cx={12} cy={13.25} r={3.5} />
    </>
  ),
  'message-circle': () => (
    <P d="M20.25 11.6a8.1 8.1 0 0 1-11.9 7.15L3.75 20.25l1.5-4.3A8.1 8.1 0 1 1 20.25 11.6z" />
  ),
  terminal: ({ c }) => (
    <>
      <Rect x={2.75} y={6} width={18.5} height={12} rx={2.75} />
      <P d="M8 14.75h8" />
      <Dot x={6.75} y={10} r={0.9} c={c} />
      <Dot x={10.25} y={10} r={0.9} c={c} />
      <Dot x={13.75} y={10} r={0.9} c={c} />
      <Dot x={17.25} y={10} r={0.9} c={c} />
    </>
  ),
  keyboard: ({ c }) => (
    <>
      <Rect x={2.75} y={6} width={18.5} height={12} rx={2.75} />
      <P d="M8 14.75h8" />
      <Dot x={6.75} y={10} r={0.9} c={c} />
      <Dot x={10.25} y={10} r={0.9} c={c} />
      <Dot x={13.75} y={10} r={0.9} c={c} />
      <Dot x={17.25} y={10} r={0.9} c={c} />
    </>
  ),

  // ── Text formatting (receipt notes) ─────────────────────────────────────
  code: () => <P d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5" />,
  type: () => <P d="M5 7V5h14v2M12 5v14M9.5 19h5" />,
  italic: () => <P d="M10 5h8M6 19h8M14.5 5l-5 14" />,
  underline: () => <P d="M7 4.5V11a5 5 0 0 0 10 0V4.5M5 20h14" />,
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

/** Every icon name, for pickers and tests. */
export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Stroke width in grid units. Defaults scale up slightly at small sizes so lines stay crisp. */
  strokeWidth?: number;
  /** Colour behind the icon, used for the cut-out details of filled glyphs. */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  /** Makes the glyph itself tappable (with a comfortable hit area). Prefer wrapping in a button. */
  onPress?: () => void;
  accessibilityLabel?: string;
}

function IconImpl({
  name,
  size = 20,
  color = '#1A1917',
  strokeWidth,
  backgroundColor = '#FFFFFF',
  style,
  onPress,
  accessibilityLabel,
}: IconProps) {
  const glyph = (GLYPHS as Record<string, Glyph>)[name] ?? GLYPHS.circle;
  const sw = strokeWidth ?? (size <= 14 ? 2.1 : size <= 18 ? 1.9 : 1.75);
  const svg = (
    <Svg
      // Remount when the glyph changes: react-native-svg does not reliably clear
      // a fill on native when the next glyph simply omits it.
      key={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {glyph({ c: color, bg: backgroundColor })}
    </Svg>
  );
  if (!onPress) return svg;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
    >
      {svg}
    </Pressable>
  );
}

export const Icon = React.memo(IconImpl);
export default Icon;
