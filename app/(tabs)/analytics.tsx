import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AnalyticsRangeSheet } from '@/components/AnalyticsRangeSheet';
import { BarList, DonutChart, SpendLineChart } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { SpaceSelector } from '@/components/SpaceSelector';
import { AppText, Chip, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { analyticsTotals, categoryTotalsForTransactions, expenseContribution, incomeCategoryTotalsForTransactions, isRefund, isSpend, resolveAnalyticsDateRange, spendingTrendSeries, transactionsInRange, transactionsInSpace, type AnalyticsCustomRange, type AnalyticsRangeKey } from '@/services/analytics';
import { colors, formatCompactPeso, formatPeso, spacing } from '@/theme';

export default function AnalyticsScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const chartWidth = Math.max(250, Math.min(1112, width - (desktop ? 248 + 64 + 42 : spacing.xl * 4)));
  const { transactions, categories, accounts, members, selectedSpaceId } = useFinance();
  const [rangeKey, setRangeKey] = useState<AnalyticsRangeKey>('this_month');
  const [customRange, setCustomRange] = useState<AnalyticsCustomRange | null>(null);
  const [isRangeSheetOpen, setRangeSheetOpen] = useState(false);
  const visibleTransactions = transactionsInSpace(transactions, selectedSpaceId);
  const range = useMemo(() => resolveAnalyticsDateRange(rangeKey, new Date(), customRange ?? undefined), [rangeKey, customRange]);
  const periodTransactions = useMemo(() => transactionsInRange(visibleTransactions, range.start, range.end), [visibleTransactions, range]);
  const totals = useMemo(() => analyticsTotals(visibleTransactions, range), [visibleTransactions, range]);
  const categoryData = useMemo(() => categoryTotalsForTransactions(periodTransactions, categories, selectedSpaceId), [periodTransactions, categories, selectedSpaceId]);
  const incomeCategoryData = useMemo(() => incomeCategoryTotalsForTransactions(periodTransactions, categories, selectedSpaceId), [periodTransactions, categories, selectedSpaceId]);
  const series = useMemo(() => spendingTrendSeries(visibleTransactions, range), [visibleTransactions, range]);
  const spending = periodTransactions.filter(isSpend);
  const expenseActivity = periodTransactions.filter((item) => isSpend(item) || isRefund(item));
  const accountData = accounts.map((account) => ({ id: account.id, name: account.name, color: account.accent, amount: expenseActivity.filter((item) => isRefund(item) ? item.accountToId === account.id : item.accountFromId === account.id).reduce((sum, item) => sum + expenseContribution(item), 0) })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const merchants = Object.entries(expenseActivity.reduce<Record<string, number>>((acc, item) => { const name = item.merchant ?? item.counterpartyName ?? 'Other'; acc[name] = (acc[name] ?? 0) + expenseContribution(item); return acc; }, {})).map(([name, amount]) => ({ name, amount })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const memberData = members.map((member, index) => ({ id: member.id, name: member.fullName, color: index % 2 === 0 ? colors.mintDark : colors.blue, amount: spending.filter((item) => item.paidByUserId === member.id).reduce((sum, item) => sum + item.amount, 0) })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const comparisonIsLower = (totals.spendingChange ?? 0) <= 0;
  const handleRangeSelect = (key: AnalyticsRangeKey, nextCustomRange?: AnalyticsCustomRange) => {
    if (key === 'custom' && nextCustomRange) setCustomRange(nextCustomRange);
    setRangeKey(key);
    setRangeSheetOpen(false);
  };
  return (
    <Screen title="Analytics" subtitle="Clear patterns, no spreadsheet required" contentStyle={desktop ? styles.wideContent : undefined} right={<Chip label={range.label} icon="chevron-down" selected onPress={() => setRangeSheetOpen(true)} />}>
      <SpaceSelector />
      <AppText variant="caption" style={styles.rangeLabel}>{range.rangeLabel}</AppText>
      <Surface style={styles.trendCard}>
        <View style={styles.cardHeader}><View><AppText variant="eyebrow" style={styles.eyebrow}>SPENDING TREND</AppText><AppText variant="h2" style={styles.value}>{formatPeso(totals.spending)}</AppText></View>{totals.spendingChange !== null && <View style={[styles.change, comparisonIsLower ? styles.changeGood : styles.changeWarning]}><Ionicons name={comparisonIsLower ? 'trending-down' : 'trending-up'} size={16} color={comparisonIsLower ? colors.mintDeep : colors.danger} /><AppText variant="caption" style={{ color: comparisonIsLower ? colors.mintDeep : colors.danger }}>{Math.abs(totals.spendingChange).toFixed(0)}% {range.comparisonLabel}</AppText></View>}</View>
        {totals.spending > 0 ? <SpendLineChart data={series} width={chartWidth} height={desktop ? 230 : 165} /> : <View style={styles.emptyTrend}><Ionicons name="analytics-outline" size={26} color={colors.slate} /><AppText style={styles.emptyText}>No spending recorded for this period.</AppText></View>}
      </Surface>

      <View style={styles.split}>
        <Surface style={styles.metric}><View style={styles.metricIcon}><Ionicons name="arrow-down" size={18} color={colors.mintDeep} /></View><AppText variant="caption" style={styles.label}>INCOME</AppText><AppText variant="h3">{formatCompactPeso(totals.income)}</AppText></Surface>
        <Surface style={styles.metric}><View style={[styles.metricIcon, styles.expenseIcon]}><Ionicons name="arrow-up" size={18} color={colors.ink} /></View><AppText variant="caption" style={styles.label}>EXPENSES</AppText><AppText variant="h3">{formatCompactPeso(totals.spending)}</AppText></Surface>
      </View>

      <View style={desktop ? styles.desktopGrid : styles.mobileGrid}>
        <View style={styles.gridColumn}>
          <View style={styles.section}><SectionHeader title="Where it went" /><Surface style={styles.donutCard}>{categoryData.length ? <><View style={styles.donutWrap}><DonutChart segments={categoryData.map((item) => ({ amount: item.amount, color: item.color }))} /><View style={styles.donutCenter}><AppText variant="caption" style={styles.label}>TOTAL</AppText><AppText variant="bodyMedium">{formatCompactPeso(totals.spending)}</AppText></View></View><View style={styles.legend}>{categoryData.slice(0, 5).map((item) => <View key={item.id} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: item.color }]} /><AppText style={styles.legendName}>{item.name}</AppText><AppText variant="bodyMedium">{Math.round((item.amount / totals.spending) * 100)}%</AppText></View>)}</View></> : <AppText style={styles.emptyText}>No expense categories for this period.</AppText>}</Surface></View>
          <View style={styles.section}><SectionHeader title="By account" /><Surface style={styles.padded}>{accountData.length ? <BarList items={accountData} total={totals.spending} /> : <AppText style={styles.emptyText}>No account spending for this period.</AppText>}</Surface></View>
        </View>
        <View style={styles.gridColumn}>
          <View style={styles.section}><SectionHeader title="Income sources" /><Surface style={styles.padded}>{incomeCategoryData.length ? <BarList items={incomeCategoryData} total={totals.income} /> : <AppText style={styles.emptyText}>No income categories for this period.</AppText>}</Surface></View>
          <View style={styles.section}><SectionHeader title="Top merchants" /><Surface style={styles.merchantCard}>{merchants.length ? merchants.map((item, index) => <View key={item.name} style={[styles.merchantRow, index > 0 && styles.borderTop]}><View style={styles.rank}><AppText variant="caption" style={styles.rankText}>{index + 1}</AppText></View><AppText variant="bodyMedium" style={styles.merchantName}>{item.name}</AppText><AppText variant="bodyMedium">{formatPeso(item.amount)}</AppText></View>) : <AppText style={styles.emptyText}>No merchants for this period.</AppText>}</Surface></View>
          <View style={styles.section}><SectionHeader title="By member" /><Surface style={styles.padded}>{memberData.length ? <BarList items={memberData} total={totals.spending} /> : <AppText style={styles.emptyText}>No member spending for this period.</AppText>}</Surface></View>
        </View>
      </View>
      <AnalyticsRangeSheet visible={isRangeSheetOpen} selectedKey={rangeKey} customRange={customRange} onClose={() => setRangeSheetOpen(false)} onSelect={handleRangeSelect} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wideContent: { maxWidth: 1240 },
  desktopGrid: { flexDirection: 'row', gap: spacing.xxl, alignItems: 'flex-start' },
  mobileGrid: { gap: spacing.xxl },
  gridColumn: { flex: 1, minWidth: 0, gap: spacing.xxl },
  trendCard: { padding: spacing.xl, gap: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: colors.slate },
  value: { marginTop: spacing.xs },
  rangeLabel: { color: colors.slate, marginTop: -spacing.md },
  change: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 6, maxWidth: '54%' },
  changeGood: { backgroundColor: colors.mintWash },
  changeWarning: { backgroundColor: colors.dangerWash },
  split: { flexDirection: 'row', gap: spacing.md },
  metric: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  metricIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash },
  expenseIcon: { backgroundColor: colors.surface },
  label: { color: colors.slate },
  section: { gap: spacing.md },
  donutCard: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  donutWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  legend: { flex: 1, gap: spacing.md },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { flex: 1, color: colors.slateDark },
  padded: { padding: spacing.lg },
  merchantCard: { paddingHorizontal: spacing.lg },
  merchantRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  borderTop: { borderTopWidth: 1, borderTopColor: colors.border },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  rankText: { color: colors.slate },
  merchantName: { flex: 1 },
  emptyTrend: { minHeight: 165, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyText: { color: colors.slate, paddingVertical: spacing.sm },
});
