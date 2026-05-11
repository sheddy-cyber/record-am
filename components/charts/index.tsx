import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import Svg, { Rect, Line, Path, Circle, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { COLORS, FONT, RADIUS, SHADOW, SP } from '@/constants';

const SCREEN_W = Dimensions.get('window').width;

// ─────────────────────────────────────────────────────────
// BAR CHART
// ─────────────────────────────────────────────────────────
interface BarDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface BarChartProps {
  data: BarDataPoint[];
  width?: number;
  height?: number;
  color?: string;
  secondaryColor?: string;
  formatValue?: (v: number) => string;
  showSecondary?: boolean;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  width = SCREEN_W - 48,
  height = 200,
  color = COLORS.ink,
  secondaryColor = COLORS.success,
  formatValue = (v) => `₦${(v / 1000).toFixed(0)}k`,
  showSecondary = false,
}) => {
  if (!data.length) return null;

  const paddingLeft = 48;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 40;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const maxVal = Math.max(...data.map((d) => Math.max(d.value, d.secondaryValue ?? 0)), 1);

  const barGroupW = chartW / data.length;
  const barW = showSecondary ? barGroupW * 0.35 : barGroupW * 0.6;
  const barGap = showSecondary ? barGroupW * 0.05 : 0;

  const gridLines = 4;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="1" stopColor={color} stopOpacity="0.6" />
        </LinearGradient>
        <LinearGradient id="barGrad2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={secondaryColor} stopOpacity="1" />
          <Stop offset="1" stopColor={secondaryColor} stopOpacity="0.6" />
        </LinearGradient>
      </Defs>

      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const y = paddingTop + (chartH / gridLines) * i;
        const val = maxVal - (maxVal / gridLines) * i;
        return (
          <G key={i}>
            <Line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke={COLORS.border} strokeWidth={1} />
            <SvgText x={paddingLeft - 6} y={y + 4} fontSize={9} fill={COLORS.text.muted} textAnchor="end">
              {formatValue(val)}
            </SvgText>
          </G>
        );
      })}

      {data.map((d, i) => {
        const groupX = paddingLeft + i * barGroupW;
        const barH = Math.max((d.value / maxVal) * chartH, 2);
        const barX = groupX + (barGroupW - barW * (showSecondary ? 2 : 1) - (showSecondary ? barGap : 0)) / 2;
        const barY = paddingTop + chartH - barH;

        const secH = d.secondaryValue ? Math.max((d.secondaryValue / maxVal) * chartH, 2) : 0;
        const secY = paddingTop + chartH - secH;

        return (
          <G key={i}>
            <Rect x={barX} y={barY} width={barW} height={barH} rx={4} fill="url(#barGrad)" />
            {showSecondary && d.secondaryValue !== undefined && (
              <Rect x={barX + barW + barGap} y={secY} width={barW} height={secH} rx={4} fill="url(#barGrad2)" />
            )}
            <SvgText x={groupX + barGroupW / 2} y={height - paddingBottom + 14} fontSize={10} fill={COLORS.text.muted} textAnchor="middle">
              {d.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
};

// ─────────────────────────────────────────────────────────
// LINE CHART
// ─────────────────────────────────────────────────────────
interface LineDataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
}

interface LineChartProps {
  data: LineDataPoint[];
  width?: number;
  height?: number;
  color?: string;
  secondaryColor?: string;
  showSecondary?: boolean;
  formatValue?: (v: number) => string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  width = SCREEN_W - 48,
  height = 200,
  color = COLORS.ink,
  secondaryColor = COLORS.success,
  showSecondary = false,
  formatValue = (v) => `₦${(v / 1000).toFixed(0)}k`,
}) => {
  if (!data.length) return null;

  const paddingLeft = 48;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 40;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const allValues = data.flatMap((d) => [d.value, d.secondaryValue ?? 0]);
  const maxVal = Math.max(...allValues, 1);
  const gridLines = 4;

  const toX = (i: number) => paddingLeft + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => paddingTop + chartH - (v / maxVal) * chartH;

  const buildPath = (key: 'value' | 'secondaryValue') => {
    return data
      .map((d, i) => {
        const v = key === 'value' ? d.value : (d.secondaryValue ?? 0);
        return `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`;
      })
      .join(' ');
  };

  const buildAreaPath = (key: 'value' | 'secondaryValue') => {
    const linePath = buildPath(key);
    const lastX = toX(data.length - 1);
    const baseY = paddingTop + chartH;
    return `${linePath} L ${lastX} ${baseY} L ${paddingLeft} ${baseY} Z`;
  };

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.15" />
          <Stop offset="1" stopColor={color} stopOpacity="0.0" />
        </LinearGradient>
        <LinearGradient id="lineAreaGrad2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={secondaryColor} stopOpacity="0.12" />
          <Stop offset="1" stopColor={secondaryColor} stopOpacity="0.0" />
        </LinearGradient>
      </Defs>

      {Array.from({ length: gridLines + 1 }).map((_, i) => {
        const y = paddingTop + (chartH / gridLines) * i;
        const val = maxVal - (maxVal / gridLines) * i;
        return (
          <G key={i}>
            <Line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke={COLORS.border} strokeWidth={1} />
            <SvgText x={paddingLeft - 6} y={y + 4} fontSize={9} fill={COLORS.text.muted} textAnchor="end">
              {formatValue(val)}
            </SvgText>
          </G>
        );
      })}

      {data.length > 1 && (
        <>
          <Path d={buildAreaPath('value')} fill="url(#lineAreaGrad)" />
          {showSecondary && <Path d={buildAreaPath('secondaryValue')} fill="url(#lineAreaGrad2)" />}
        </>
      )}

      {data.length > 1 && (
        <>
          <Path d={buildPath('value')} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {showSecondary && (
            <Path d={buildPath('secondaryValue')} fill="none" stroke={secondaryColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,3" />
          )}
        </>
      )}

      {data.map((d, i) => (
        <G key={i}>
          <Circle cx={toX(i)} cy={toY(d.value)} r={4} fill={color} />
          {showSecondary && d.secondaryValue !== undefined && (
            <Circle cx={toX(i)} cy={toY(d.secondaryValue)} r={3} fill={secondaryColor} />
          )}
          <SvgText x={toX(i)} y={height - paddingBottom + 14} fontSize={10} fill={COLORS.text.muted} textAnchor="middle">
            {d.label}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
};

// ─────────────────────────────────────────────────────────
// DONUT / PIE CHART
// ─────────────────────────────────────────────────────────
interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: PieSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSubLabel?: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 160,
  thickness = 28,
  centerLabel,
  centerSubLabel,
}) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;

  let cumulativeAngle = -90;

  const slices = data.map((d) => {
    const fraction = d.value / total;
    const angle = fraction * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = ((startAngle + angle) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = angle > 180 ? 1 : 0;

    const pathD = [`M ${x1} ${y1}`, `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`].join(' ');

    return { ...d, pathD, fraction };
  });

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.border} strokeWidth={thickness} />
      {slices.map((slice, i) => (
        <Path key={i} d={slice.pathD} fill="none" stroke={slice.color} strokeWidth={thickness} strokeLinecap="butt" />
      ))}
      {centerLabel && (
        <SvgText x={cx} y={cy - 4} fontSize={14} fontFamily={FONT.bold} fill={COLORS.text.primary} textAnchor="middle">
          {centerLabel}
        </SvgText>
      )}
      {centerSubLabel && (
        <SvgText x={cx} y={cy + 14} fontSize={10} fill={COLORS.text.muted} textAnchor="middle">
          {centerSubLabel}
        </SvgText>
      )}
    </Svg>
  );
};

// ─────────────────────────────────────────────────────────
// CHART LEGEND
// ─────────────────────────────────────────────────────────
interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

export const ChartLegend: React.FC<{ items: LegendItem[] }> = ({ items }) => (
  <View style={{ gap: 6 }}>
    {items.map((item, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color }} />
          <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: COLORS.text.secondary }}>{item.label}</Text>
        </View>
        {item.value && (
          <Text style={{ fontSize: 13, fontFamily: FONT.medium, color: COLORS.text.primary }}>{item.value}</Text>
        )}
      </View>
    ))}
  </View>
);

// ─────────────────────────────────────────────────────────
// METRIC CARD
// ─────────────────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: string;
  growth?: number;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  subtext?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, growth, icon, color = COLORS.ink, subtext }) => {
  const isPositive = (growth ?? 0) >= 0;
  const showGrowth = growth !== undefined && growth !== 0;

  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: RADIUS.md,
        padding: SP.card,
        flex: 1,
        ...SHADOW.sm,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: RADIUS.sm,
            backgroundColor: color + '14',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={icon} size={16} color={color} />
        </View>
        {showGrowth && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isPositive ? COLORS.successLight : COLORS.dangerLight,
              borderRadius: RADIUS.full,
              paddingHorizontal: 8,
              paddingVertical: 2,
              gap: 2,
            }}
          >
            <Text style={{ fontSize: 10, fontFamily: FONT.bold, color: isPositive ? COLORS.success : COLORS.danger }}>
              {isPositive ? '↑' : '↓'} {Math.abs(growth!).toFixed(1)}%
            </Text>
          </View>
        )}
      </View>
      <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 20, fontFamily: FONT.bold, color: COLORS.text.primary }}>{value}</Text>
      {subtext && <Text style={{ fontSize: 11, fontFamily: FONT.regular, color: COLORS.text.muted, marginTop: 2 }}>{subtext}</Text>}
    </View>
  );
};
