import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { SmartSelectSheet } from './SmartSelectSheet';
import { AppText, Chip } from './ui';
import { change, compareCategories, monthWindow, monthlyYearTrend, periodSummary, yearMonthWithinWindow, yearWindow, type ComparisonCategory } from '@/services/report-comparisons';
import { colors, formatPeso, radii, spacing } from '@/theme';
import type { Category, Transaction } from '@/types/finance';

type Mode = 'compare_months' | 'compare_years' | 'this_year';
type Effect = 'expense' | 'income' | 'net';
type Palette = { card: string; elevated: string; border: string; text: string; muted: string };
const monthLabel = (year: number, month: number) => new Date(year, month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
const metricValue = (summary: { spending: number; income: number; netCashFlow: number }, effect: Effect) => effect === 'expense' ? summary.spending : effect === 'income' ? summary.income : summary.netCashFlow;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPeso(Math.abs(value))}`;
const deltaLabel = (current: number, previous: number) => {
  const delta = change(current, previous);
  return `${signed(delta.absolute)} (${delta.percentage === null ? 'N/A' : `${delta.percentage > 0 ? '+' : ''}${delta.percentage.toFixed(1)}%`})`;
};

export function ReportComparisons({ mode, transactions, categories, palette, desktop }: { mode: Mode; transactions: Transaction[]; categories: Category[]; palette: Palette; desktop: boolean }) {
  const now = new Date();
  const [firstMonth, setFirstMonth] = useState(() => new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const [secondMonth, setSecondMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [firstYear, setFirstYear] = useState(now.getFullYear() - 1);
  const [secondYear, setSecondYear] = useState(now.getFullYear());
  const [trendYear, setTrendYear] = useState(now.getFullYear());
  const [ytd, setYtd] = useState(false);
  const [effect, setEffect] = useState<Effect>('expense');
  const [chartType, setChartType] = useState<'bars' | 'lines'>('bars');
  const [picker, setPicker] = useState<'first' | 'second' | 'year' | 'category' | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drillIds, setDrillIds] = useState<string[] | null>(null);
  const [drillTitle, setDrillTitle] = useState('');
  const [chosenMonth, setChosenMonth] = useState<number | null>(null);
  const firstPeriod = mode === 'compare_months' ? monthWindow(firstMonth.getFullYear(), firstMonth.getMonth(), now) : yearWindow(firstYear, now, ytd);
  const secondPeriod = mode === 'compare_months' ? monthWindow(secondMonth.getFullYear(), secondMonth.getMonth(), now) : yearWindow(secondYear, now, ytd);
  const categoryDescendants = new Set<string>();
  if (categoryId) {
    categoryDescendants.add(categoryId);
    let previousSize = -1;
    while (categoryDescendants.size !== previousSize) { previousSize = categoryDescendants.size; categories.forEach((item) => { if (item.parentId && categoryDescendants.has(item.parentId)) categoryDescendants.add(item.id); }); }
  }
  const scopedTransactions = categoryId ? transactions.filter((item) => item.categoryId && categoryDescendants.has(item.categoryId)) : transactions;
  const before = periodSummary(scopedTransactions, firstPeriod);
  const after = periodSummary(scopedTransactions, secondPeriod);
  const trend = monthlyYearTrend(scopedTransactions, trendYear, now);
  const expenseRows = compareCategories(before.transactions, after.transactions, categories, 'expense');
  const incomeRows = compareCategories(before.transactions, after.transactions, categories, 'income');
  const historicalStart = Math.min(now.getFullYear() - 10, ...transactions.map((item) => new Date(item.transactionDate).getFullYear()).filter(Number.isFinite));
  const years = Array.from({ length: now.getFullYear() - historicalStart + 1 }, (_, index) => now.getFullYear() - index);
  const monthOptions = years.flatMap((year) => Array.from({ length: 12 }, (_, month) => ({ id: `${year}-${month}`, label: monthLabel(year, month) }))).filter((item) => new Date(Number(item.id.split('-')[0]), Number(item.id.split('-')[1]), 1) <= now);
  const opened = drillIds ? transactions.filter((item) => drillIds.includes(item.id)) : [];
  const openTransactions = (ids: string[], title: string) => { setDrillIds(ids); setDrillTitle(title); };
  const pick = (id: string) => {
    if (picker === 'category') { setCategoryId(id === '__all__' ? null : id); setDrillIds(null); return; }
    if (mode === 'compare_months') {
      const [year = now.getFullYear(), month = now.getMonth()] = id.split('-').map(Number);
      if (picker === 'first') setFirstMonth(new Date(year, month, 1)); else setSecondMonth(new Date(year, month, 1));
    } else if (picker === 'first') setFirstYear(Number(id)); else if (picker === 'second') setSecondYear(Number(id)); else setTrendYear(Number(id));
    setExpanded(new Set()); setDrillIds(null);
  };
  const selector = (which: 'first' | 'second' | 'year', label: string) => <Pressable accessibilityRole="button" onPress={() => setPicker(which)} style={[styles.selector, { backgroundColor: palette.card, borderColor: palette.border }]}><AppText variant="bodyMedium" style={{ color: palette.text }}>{label}</AppText><Ionicons name="chevron-down" size={16} color={palette.muted} /></Pressable>;
  const renderCategory = (row: ComparisonCategory, categoryEffect: 'expense' | 'income', depth = 0): React.ReactNode => {
    const isExpanded = expanded.has(row.id);
    const diff = change(row.after, row.before);
    const tone = categoryEffect === 'expense' ? diff.absolute > 0 ? colors.expense : colors.income : diff.absolute > 0 ? colors.income : colors.expense;
    return <View key={row.id} style={[styles.categoryBranch, depth > 0 && { marginLeft: spacing.lg, borderLeftWidth: 2, borderLeftColor: palette.border }]}>
      <View style={styles.categoryLine}><Pressable style={styles.categoryAction} onPress={() => openTransactions(row.transactionIds, row.name)}><AppText variant="bodyMedium" style={{ color: palette.text }}>{row.name}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{firstPeriod.label}: {formatPeso(row.before)} · {secondPeriod.label}: {formatPeso(row.after)}</AppText></Pressable><View style={styles.categoryDelta}><AppText variant="caption" style={{ color: diff.absolute === 0 ? palette.muted : tone }}>{deltaLabel(row.after, row.before)}</AppText>{row.children.length > 0 && <Pressable accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${row.name}`} onPress={() => setExpanded((current) => { const next = new Set(current); if (isExpanded) next.delete(row.id); else next.add(row.id); return next; })} hitSlop={12}><Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={palette.muted} /></Pressable>}</View></View>
      {isExpanded && row.children.map((child) => renderCategory(child, categoryEffect, depth + 1))}
    </View>;
  };
  const comparisonMetrics: { label: string; key: Effect }[] = [{ label: 'Income', key: 'income' }, { label: 'Expenses', key: 'expense' }, { label: 'Net cash flow', key: 'net' }];
  const trendVisible = trend.filter((item) => !item.future);
  const annual = trendVisible.reduce((sum, item) => ({ income: sum.income + item.income, spending: sum.spending + item.spending, netCashFlow: sum.netCashFlow + item.netCashFlow }), { income: 0, spending: 0, netCashFlow: 0 });
  const highest = trendVisible.reduce<typeof trend[number] | null>((best, item) => !best || item.spending > best.spending ? item : best, null);
  const lowest = trendVisible.reduce<typeof trend[number] | null>((best, item) => !best || item.spending < best.spending ? item : best, null);
  const maxValue = Math.max(1, ...trendVisible.flatMap((item) => [item.income, item.spending, Math.abs(item.netCashFlow)]));
  const comparisonMax = Math.max(1, Math.abs(metricValue(before, effect)), Math.abs(metricValue(after, effect)));
  const displayedCategories = effect === 'income' ? [{ title: 'Income categories', rows: incomeRows, categoryEffect: 'income' as const }] : effect === 'expense' ? [{ title: 'Expense categories', rows: expenseRows, categoryEffect: 'expense' as const }] : [{ title: 'Income categories', rows: incomeRows, categoryEffect: 'income' as const }, { title: 'Expense categories', rows: expenseRows, categoryEffect: 'expense' as const }];
  const chartValue = (item: { income: number; spending: number; netCashFlow: number }) => metricValue(item, effect);
  const chartColor = effect === 'income' ? colors.income : effect === 'expense' ? colors.expense : colors.blue;
  const chartY = (value: number) => effect === 'net' ? 74 - value / maxValue * 60 : 138 - value / maxValue * 120;
  const linePoints = trendVisible.map((item) => `${(item.month + 0.5) * 610 / 12},${chartY(chartValue(item))}`).join(' L');
  const selectedTrend = chosenMonth === null ? null : trend[chosenMonth];

  return <View style={styles.stack}>
    <View style={styles.selectorRow}>{mode === 'this_year' ? selector('year', String(trendYear)) : <>{selector('first', firstPeriod.label)}<AppText style={{ color: palette.muted }}>vs</AppText>{selector('second', secondPeriod.label)}{mode === 'compare_years' && <Chip label="Same cutoff (YTD)" selected={ytd} onPress={() => setYtd(!ytd)} />}</>}</View>
    <View style={styles.selectorRow}><Chip label="Expenses" selected={effect === 'expense'} onPress={() => { setEffect('expense'); setCategoryId(null); }} /><Chip label="Income" selected={effect === 'income'} onPress={() => { setEffect('income'); setCategoryId(null); }} /><Chip label="Net cash flow" selected={effect === 'net'} onPress={() => { setEffect('net'); setCategoryId(null); }} /><Chip label={categoryId ? categories.find((item) => item.id === categoryId)?.name ?? 'Category' : 'All categories'} selected={Boolean(categoryId)} onPress={() => setPicker('category')} />{mode === 'this_year' && <><Chip label="Bars" selected={chartType === 'bars'} onPress={() => setChartType('bars')} /><Chip label="Lines" selected={chartType === 'lines'} onPress={() => setChartType('lines')} /></>}</View>
    {mode === 'this_year' ? <>
      <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}><AppText variant="h3" style={{ color: palette.text }}>January–December {trendYear}</AppText><AppText variant="caption" style={{ color: palette.muted }}>Current month is partial · future months have no data</AppText><ScrollView horizontal={!desktop} contentContainerStyle={styles.trendScroll}>
          <View style={styles.trendChart}>
            {chartType === 'lines' && <Svg pointerEvents="none" width="100%" height={148} viewBox="0 0 610 148" preserveAspectRatio="none" style={styles.trendLine}>
              <Path d={linePoints ? 'M' + linePoints : ''} stroke={chartColor} strokeWidth={3} fill="none" />
              {trendVisible.map((item) => <Circle key={item.month} cx={(item.month + 0.5) * 610 / 12} cy={chartY(chartValue(item))} r={4} fill={chartColor} />)}
            </Svg>}
            {trend.map((item) => <Pressable key={item.month} accessibilityRole="button" accessibilityLabel={item.future ? item.label + ', no data yet' : item.label + ', ' + formatPeso(chartValue(item))} onPress={() => !item.future && setChosenMonth(item.month)} disabled={item.future} style={[styles.monthColumn, item.month === chosenMonth && { backgroundColor: palette.elevated }]}>
              <View style={styles.monthBars}>
                {item.future ? <View style={[styles.futureBar, { borderColor: palette.border }]} /> : chartType === 'bars' ? effect === 'net'
                  ? <View style={styles.netBarTrack}><View style={[styles.netBaseline, { backgroundColor: palette.border }]} /><View style={[styles.netBar, { height: Math.max(2, Math.abs(item.netCashFlow) / maxValue * 60), backgroundColor: item.netCashFlow >= 0 ? colors.income : colors.expense, bottom: item.netCashFlow >= 0 ? 74 : undefined, top: item.netCashFlow < 0 ? 74 : undefined }]} /></View>
                  : <><View style={[styles.bar, { height: Math.max(2, item.income / maxValue * 130), backgroundColor: colors.income }]} /><View style={[styles.bar, { height: Math.max(2, item.spending / maxValue * 130), backgroundColor: colors.expense }]} /></> : null}
              </View>
              <AppText variant="caption" style={{ color: palette.muted }}>{new Date(trendYear, item.month, 1).toLocaleDateString('en-PH', { month: 'short' })}{item.partial && !item.future ? '*' : ''}</AppText>
            </Pressable>)}
          </View>
        </ScrollView><View style={styles.legend}><AppText variant="caption" style={{ color: colors.income }}>● Income</AppText><AppText variant="caption" style={{ color: colors.expense }}>● Expenses</AppText></View></View>
      <View style={styles.statGrid}>{comparisonMetrics.map((item) => <View key={item.key} style={[styles.stat, { backgroundColor: palette.card, borderColor: palette.border }]}><AppText variant="eyebrow" style={{ color: palette.muted }}>{item.label} {trendYear === now.getFullYear() ? 'YTD' : 'TOTAL'}</AppText><AppText variant="h3" style={{ color: item.key === 'income' ? colors.income : item.key === 'expense' ? colors.expense : palette.text }}>{formatPeso(metricValue(annual, item.key))}</AppText><AppText variant="caption" style={{ color: palette.muted }}>Avg {formatPeso(metricValue(annual, item.key) / Math.max(1, trendVisible.length))} / month</AppText></View>)}</View>
      <AppText variant="caption" style={{ color: palette.muted }}>Highest spending: {highest?.label ?? '—'} {highest ? formatPeso(highest.spending) : ''} · Lowest: {lowest?.label ?? '—'} {lowest ? formatPeso(lowest.spending) : ''}</AppText>
      {selectedTrend && !selectedTrend.future && <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}><AppText variant="h3" style={{ color: palette.text }}>{selectedTrend.label}{selectedTrend.partial ? ' · Partial' : ''}</AppText><AppText style={{ color: palette.text }}>Income {formatPeso(selectedTrend.income)} · Expenses {formatPeso(selectedTrend.spending)} · Net {formatPeso(selectedTrend.netCashFlow)}</AppText><Pressable onPress={() => openTransactions(selectedTrend.transactions.map((item) => item.id), selectedTrend.label)}><AppText style={{ color: colors.mintDeep }}>View transactions →</AppText></Pressable></View>}
    </> : <>
      <AppText variant="caption" style={{ color: palette.muted }}>{firstPeriod.partial ? `${firstPeriod.label} is partial. ` : ''}{secondPeriod.partial ? `${secondPeriod.label} is partial. ` : ''}{mode === 'compare_years' && ytd ? 'Both years use the same month and day cutoff.' : ''}</AppText>
      <View style={styles.statGrid}>{comparisonMetrics.map((item) => { const previous = metricValue(before, item.key); const current = metricValue(after, item.key); const delta = change(current, previous); const good = item.key === 'expense' ? delta.absolute < 0 : delta.absolute > 0; return <View key={item.key} style={[styles.stat, { backgroundColor: palette.card, borderColor: palette.border }]}><AppText variant="eyebrow" style={{ color: palette.muted }}>{item.label}</AppText><View style={styles.pair}><AppText variant="caption" style={{ color: palette.muted }}>{firstPeriod.label}</AppText><AppText variant="bodyMedium" style={{ color: palette.text }}>{formatPeso(previous)}</AppText></View><View style={styles.pair}><AppText variant="caption" style={{ color: palette.muted }}>{secondPeriod.label}</AppText><AppText variant="bodyMedium" style={{ color: palette.text }}>{formatPeso(current)}</AppText></View><AppText variant="caption" style={{ color: delta.absolute === 0 ? palette.muted : good ? colors.income : colors.expense }}>{deltaLabel(current, previous)}</AppText></View>; })}</View>
      <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}><AppText variant="h3" style={{ color: palette.text }}>{effect === 'expense' ? 'Expenses' : effect === 'income' ? 'Income' : 'Net cash flow'} comparison</AppText><View style={styles.comparisonBars}>{[before, after].map((summary, index) => <View key={index} style={styles.comparisonBarColumn}><AppText variant="bodyMedium" style={{ color: palette.text }}>{signed(metricValue(summary, effect))}</AppText><View style={[styles.comparisonBarTrack, { backgroundColor: palette.elevated }]}><View style={[styles.comparisonBarFill, { height: `${Math.abs(metricValue(summary, effect)) / comparisonMax * 100}%`, backgroundColor: index ? colors.mintDark : colors.blue }]} /></View><AppText variant="caption" style={{ color: palette.muted, textAlign: 'center' }}>{index ? secondPeriod.label : firstPeriod.label}</AppText></View>)}</View></View>
      <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}>{displayedCategories.map((section) => <View key={section.categoryEffect} style={styles.categorySection}><AppText variant="h3" style={{ color: palette.text }}>{section.title}</AppText>{section.rows.length ? section.rows.map((row) => renderCategory(row, section.categoryEffect)) : <AppText style={{ color: palette.muted }}>No categories in either period.</AppText>}</View>)}</View>
      {mode === 'compare_years' && <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}><AppText variant="h3" style={{ color: palette.text }}>Monthly breakdown</AppText>{Array.from({ length: 12 }, (_, month) => { const a = yearMonthWithinWindow(scopedTransactions, firstYear, month, firstPeriod.end); const b = yearMonthWithinWindow(scopedTransactions, secondYear, month, secondPeriod.end); return <View key={month} style={styles.pair}><AppText variant="caption" style={{ color: palette.muted }}>{new Date(2020, month).toLocaleDateString('en-PH', { month: 'short' })}</AppText><AppText variant="caption" style={{ color: palette.text }}>{a ? formatPeso(metricValue(a, effect)) : "—"} → {b ? formatPeso(metricValue(b, effect)) : "—"}</AppText></View>; })}</View>}
    </>}
    {opened.length > 0 && <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={styles.pair}><AppText variant="h3" style={{ color: palette.text }}>{drillTitle}</AppText><Pressable onPress={() => setDrillIds(null)}><Ionicons name="close-circle" size={22} color={palette.muted} /></Pressable></View>{opened.map((item) => <Pressable key={item.id} onPress={() => router.push(`/transaction/${item.id}`)} style={styles.pair}><AppText variant="caption" style={{ color: palette.text }}>{item.merchant ?? item.counterpartyName ?? item.type}</AppText><AppText variant="caption" style={{ color: palette.text }}>{formatPeso(item.amount)}</AppText></Pressable>)}</View>}
    <SmartSelectSheet visible={picker !== null} title={picker === 'category' ? 'Filter by category' : mode === 'compare_months' ? 'Choose month' : 'Choose year'} options={picker === 'category' ? [{ id: '__all__', label: 'All categories' }, ...categories.filter((item) => effect === 'net' || item.type === effect).map((item) => ({ id: item.id, label: effect === 'net' ? `${item.type === 'income' ? 'Income' : 'Expense'} · ${item.name}` : item.name, parentId: item.parentId }))] : mode === 'compare_months' ? monthOptions : years.map((year) => ({ id: String(year), label: String(year) }))} hierarchical={picker === 'category'} selectedIds={[picker === 'category' ? categoryId ?? '__all__' : mode === 'compare_months' ? `${(picker === 'first' ? firstMonth : secondMonth).getFullYear()}-${(picker === 'first' ? firstMonth : secondMonth).getMonth()}` : String(picker === 'first' ? firstYear : picker === 'second' ? secondYear : trendYear)]} onClose={() => setPicker(null)} onSelect={pick} />
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg }, selectorRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, selector: { minHeight: 40, minWidth: 110, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  panel: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md }, statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, stat: { flexGrow: 1, flexBasis: 190, borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm }, pair: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  comparisonBars: { minHeight: 210, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: spacing.xl }, comparisonBarColumn: { flex: 1, maxWidth: 220, alignItems: 'center', gap: spacing.sm }, comparisonBarTrack: { height: 155, width: '100%', justifyContent: 'flex-end', borderRadius: radii.md, overflow: 'hidden' }, comparisonBarFill: { width: '100%', borderTopLeftRadius: radii.sm, borderTopRightRadius: radii.sm }, categorySection: { gap: spacing.sm },
  categoryBranch: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#AAB1B4' }, categoryLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, categoryAction: { flex: 1, minWidth: 0, gap: 2 }, categoryDelta: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.sm },
  trendScroll: { flexGrow: 1 }, trendChart: { flex: 1, minWidth: 610, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs }, trendLine: { position: 'absolute', top: 0, left: 0, right: 0 }, monthColumn: { flex: 1, alignItems: 'center', borderRadius: radii.sm, paddingVertical: spacing.sm }, monthBars: { height: 148, flexDirection: 'row', alignItems: 'flex-end', gap: 3, position: 'relative' }, bar: { width: 10, borderRadius: 4 }, netBarTrack: { width: 18, height: 148, position: 'relative' }, netBaseline: { height: 1, position: 'absolute', top: 74, left: 0, right: 0 }, netBar: { position: 'absolute', left: 2, right: 2, borderRadius: 4 }, futureBar: { width: 18, height: 2, borderWidth: 1, borderStyle: 'dashed' }, legend: { flexDirection: 'row', gap: spacing.lg },
});
