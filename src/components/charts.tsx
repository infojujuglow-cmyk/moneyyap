import type { ComponentProps, ComponentType } from 'react';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, formatCompactPeso, formatPeso, radii, shadows, spacing } from '@/theme';
import type { MonthlyPoint } from '@/types/finance';
import { AppText } from './ui';

export function SpendLineChart({ data, width, height = 150 }: { data: MonthlyPoint[]; width: number; height?: number }) {
  const top = Math.max(...data.map((item) => item.expense), 1) * 1.15;
  const horizontalPadding = 8;
  const chartHeight = height - 30;
  const points = data.map((item, index) => ({
    x: horizontalPadding + index * ((width - horizontalPadding * 2) / Math.max(data.length - 1, 1)),
    y: 8 + chartHeight - (item.expense / top) * chartHeight,
  }));
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  const area = `${line} L${points.at(-1)?.x ?? width},${height - 18} L${points[0]?.x ?? 0},${height - 18} Z`;
  return (
    <View>
      <Svg width={width} height={height}>
        <Defs><LinearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.expense} stopOpacity="0.2" /><Stop offset="1" stopColor={colors.expense} stopOpacity="0" /></LinearGradient></Defs>
        <Path d={area} fill="url(#expenseArea)" />
        <Path d={line} fill="none" stroke={colors.expense} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <Circle key={data[index]?.label} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4.5 : 2.5} fill={colors.white} stroke={colors.expense} strokeWidth={index === points.length - 1 ? 3 : 2} />)}
      </Svg>
      <View style={styles.axis}>{data.map((item, index) => <View key={`${item.label}-${index}`} style={styles.axisSlot}>{item.showLabel !== false && <AppText variant="caption" numberOfLines={1} style={styles.axisLabel}>{item.label}</AppText>}</View>)}</View>
    </View>
  );
}

export function CashFlowChart({ data, width, height = 220 }: { data: MonthlyPoint[]; width: number; height?: number }) {
  const top = Math.max(...data.flatMap((item) => [item.income, item.expense]), 1) * 1.15;
  const horizontalPadding = 10;
  const chartHeight = height - 32;
  const pointsFor = (key: 'income' | 'expense') => data.map((item, index) => ({
    x: horizontalPadding + index * ((width - horizontalPadding * 2) / Math.max(data.length - 1, 1)),
    y: 8 + chartHeight - (item[key] / top) * chartHeight,
  }));
  const incomePoints = pointsFor('income');
  const expensePoints = pointsFor('expense');
  const pathFor = (points: { x: number; y: number }[]) => points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  return (
    <View>
      <Svg width={width} height={height}>
        <Path d={pathFor(incomePoints)} fill="none" stroke={colors.income} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={pathFor(expensePoints)} fill="none" stroke={colors.expense} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {incomePoints.map((point, index) => <Circle key={`income-${data[index]?.label}-${index}`} cx={point.x} cy={point.y} r="3" fill={colors.white} stroke={colors.income} strokeWidth="2" />)}
        {expensePoints.map((point, index) => <Circle key={`expense-${data[index]?.label}-${index}`} cx={point.x} cy={point.y} r="3" fill={colors.white} stroke={colors.expense} strokeWidth="2" />)}
      </Svg>
      <View style={styles.axis}>{data.map((item, index) => <View key={`${item.label}-${index}`} style={styles.axisSlot}>{item.showLabel !== false && <AppText variant="caption" numberOfLines={1} style={styles.axisLabel}>{item.label}</AppText>}</View>)}</View>
    </View>
  );
}

type HoverCircleProps = ComponentProps<typeof Circle> & { onMouseEnter?: () => void; onMouseLeave?: () => void };
const HoverCircle = Circle as unknown as ComponentType<HoverCircleProps>;

export function DonutChart({ segments, size = 132, selectedIndex = null, onSegmentPress }: { segments: { amount: number; color: string; label?: string }[]; size?: number; selectedIndex?: number | null; onSegmentPress?: (index: number) => void }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const stroke = Math.max(16, Math.round(size * 0.105));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, item) => sum + item.amount, 0) || 1;
  const activeIndex = hoveredIndex ?? selectedIndex;
  const hovered = hoveredIndex === null ? null : segments[hoveredIndex];
  const hoveredStart = hoveredIndex === null ? 0 : segments.slice(0, hoveredIndex).reduce((sum, item) => sum + item.amount, 0) / total;
  const hoveredShare = hovered ? hovered.amount / total : 0;
  const hoveredAngle = (-90 + hoveredStart * 360 + hoveredShare * 180) * Math.PI / 180;
  const tooltipWidth = Math.min(176, Math.max(140, size - 16));
  const tooltipLeft = Math.max(0, Math.min(size - tooltipWidth, size / 2 + Math.cos(hoveredAngle) * radius * 0.72 - tooltipWidth / 2));
  const tooltipTop = Math.max(8, Math.min(size - 76, size / 2 + Math.sin(hoveredAngle) * radius * 0.72 - 38));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.surface} strokeWidth={stroke} />
        {segments.map((segment, index) => {
          const length = (segment.amount / total) * circumference;
          const offset = -segments.slice(0, index).reduce((sum, item) => sum + (item.amount / total) * circumference, 0);
          const hoverProps = Platform.OS === 'web' ? { onMouseEnter: () => setHoveredIndex(index), onMouseLeave: () => setHoveredIndex(null) } : {};
          return <HoverCircle {...hoverProps} key={`${segment.color}-${index}`} accessible={Boolean(onSegmentPress)} accessibilityLabel={`${segment.label ?? 'Value'}, ${formatPeso(segment.amount)}, ${Math.round(segment.amount / total * 100)} percent`} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth={activeIndex === index ? stroke + 4 : stroke} strokeDasharray={`${Math.max(0, length - 3)} ${circumference}`} strokeDashoffset={offset} strokeLinecap="round" opacity={activeIndex === null || activeIndex === index ? 1 : 0.42} transform={`rotate(-90 ${size / 2} ${size / 2})`} onPress={onSegmentPress ? () => onSegmentPress(index) : undefined} />;
        })}
      </Svg>
      {hovered && <View pointerEvents="none" style={[styles.donutTooltip, { width: tooltipWidth, left: tooltipLeft, top: tooltipTop, borderColor: `${hovered.color}66` }]}><View style={[styles.tooltipDot, { backgroundColor: hovered.color }]} /><View style={styles.tooltipCopy}><AppText variant="caption" numberOfLines={1} style={styles.tooltipLabel}>{hovered.label ?? 'Value'}</AppText><AppText variant="bodyMedium" numberOfLines={1} style={styles.tooltipValue}>{formatPeso(hovered.amount)}</AppText><AppText variant="caption" style={styles.tooltipPercent}>{Math.round(hovered.amount / total * 100)}%</AppText></View></View>}
    </View>
  );
}

export function BarList({ items, total, tone = 'expense' }: { items: { id: string; name: string; color: string; amount: number }[]; total: number; tone?: 'income' | 'expense' | 'neutral' }) {
  const amountTone = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : colors.neutralAmount;
  return <View style={styles.barList}>{items.map((item) => <View key={item.id} style={styles.barItem}><View style={styles.barHeader}><View style={styles.barLabel}><View style={[styles.dot, { backgroundColor: item.color }]} /><AppText variant="bodyMedium">{item.name}</AppText></View><AppText variant="bodyMedium" style={{ color: amountTone }}>{formatCompactPeso(item.amount)}</AppText></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(3, (item.amount / Math.max(total, 1)) * 100)}%`, backgroundColor: item.color }]} /></View></View>)}</View>;
}

const styles = StyleSheet.create({
  axis: { flexDirection: 'row', marginTop: -12, paddingHorizontal: 2 },
  axisSlot: { flex: 1, minWidth: 0 },
  axisLabel: { color: colors.slate, textAlign: 'center', fontSize: 10 },
  barList: { gap: spacing.lg },
  barItem: { gap: spacing.sm },
  barHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  donutTooltip: { position: 'absolute', zIndex: 10, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, backgroundColor: colors.white, ...shadows.lift },
  tooltipDot: { width: 9, height: 9, borderRadius: 5 },
  tooltipCopy: { flex: 1, minWidth: 0, paddingRight: 34 },
  tooltipLabel: { color: colors.slate, fontSize: 11 },
  tooltipValue: { color: colors.neutralAmount },
  tooltipPercent: { position: 'absolute', right: 0, top: 0, color: colors.slate },
});
