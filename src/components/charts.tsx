import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, formatCompactPeso, spacing } from '@/theme';
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

export function DonutChart({ segments, size = 132, selectedIndex = null, onSegmentPress }: { segments: { amount: number; color: string; label?: string }[]; size?: number; selectedIndex?: number | null; onSegmentPress?: (index: number) => void }) {
  const stroke = Math.max(16, Math.round(size * 0.105));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, item) => sum + item.amount, 0) || 1;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={colors.surface} strokeWidth={stroke} />
      {segments.map((segment, index) => {
        const length = (segment.amount / total) * circumference;
        const offset = -segments.slice(0, index).reduce((sum, item) => sum + (item.amount / total) * circumference, 0);
        return <Circle key={`${segment.color}-${index}`} accessible={Boolean(onSegmentPress)} accessibilityLabel={segment.label ? `${segment.label}, ${Math.round(segment.amount / total * 100)} percent` : undefined} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth={selectedIndex === index ? stroke + 4 : stroke} strokeDasharray={`${Math.max(0, length - 3)} ${circumference}`} strokeDashoffset={offset} strokeLinecap="round" opacity={selectedIndex === null || selectedIndex === index ? 1 : 0.42} transform={`rotate(-90 ${size / 2} ${size / 2})`} onPress={onSegmentPress ? () => onSegmentPress(index) : undefined} />;
      })}
    </Svg>
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
});
