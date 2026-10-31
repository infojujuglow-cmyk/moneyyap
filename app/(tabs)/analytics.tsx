import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnalyticsRangeSheet } from '@/components/AnalyticsRangeSheet';
import { CashFlowChart, DonutChart, SpendLineChart } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { SmartSelectSheet } from '@/components/SmartSelectSheet';
import { SpaceSelector } from '@/components/SpaceSelector';
import { AppText, Button, Chip } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { isReportKey, reportItems, reportLabel, type ReportKey } from '@/lib/reports';
import {
  accountBalancesAsOf,
  analyticsTotals,
  categoryReportBreakdown,
  formatReportPercentage,
  payeeBreakdownForTransactions,
  resolveAnalyticsDateRange,
  spaceReportBreakdown,
  spendingTrendSeries,
  transactionsInRange,
  transactionsInSpace,
  type AnalyticsCustomRange,
  type AnalyticsRangeKey,
  type CategoryReportItem,
  type SpaceReportItem,
} from '@/services/analytics';
import { colors, formatCompactPeso, formatPeso, radii, reportCategoryColors, spacing, typography } from '@/theme';
import type { Account, Category, CategoryType, Space, Transaction } from '@/types/finance';

type Palette = { background: string; card: string; elevated: string; border: string; text: string; muted: string };

const paletteFor = (dark: boolean): Palette => dark
  ? { background: '#11151B', card: '#191F27', elevated: '#222A34', border: '#303946', text: '#F5F7F8', muted: '#A6AFBA' }
  : { background: '#F5F7F5', card: '#FFFFFF', elevated: '#F2F5F2', border: '#E2E7E3', text: colors.ink, muted: colors.slate };

const accountLabel = (account: Account) => account.institution ? `${account.name} · ${account.institution}` : account.name;

function MetricCard({ label, amount, tone, icon, palette }: { label: string; amount: number; tone: 'income' | 'expense' | 'neutral'; icon: keyof typeof Ionicons.glyphMap; palette: Palette }) {
  const color = tone === 'income' ? colors.income : tone === 'expense' ? colors.expense : palette.background === '#11151B' ? palette.text : colors.neutralAmount;
  return <View style={[styles.metricCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.metricIcon, { backgroundColor: `${color}17` }]}><Ionicons name={icon} size={19} color={color} /></View><AppText variant="eyebrow" style={{ color: palette.muted }}>{label}</AppText><AppText variant="h2" numberOfLines={1} adjustsFontSizeToFit style={{ color }}>{formatCompactPeso(amount)}</AppText></View>;
}

function ReportEmpty({ icon, title, body, palette, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; palette: Palette; action?: React.ReactNode }) {
  return <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: palette.elevated }]}><Ionicons name={icon} size={28} color={colors.mintDark} /></View><AppText variant="h3" style={{ color: palette.text }}>{title}</AppText><AppText style={[styles.emptyBody, { color: palette.muted }]}>{body}</AppText>{action}</View>;
}

function ReportCard({ children, palette, style }: React.PropsWithChildren<{ palette: Palette; style?: object }>) {
  return <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }, style]}>{children}</View>;
}

function Drilldown({ title, transactions, palette, accounts = [], categories = [], onClose }: { title: string; transactions: Transaction[]; palette: Palette; accounts?: Account[]; categories?: Category[]; onClose: () => void }) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const categoryPath = (categoryId: string | null) => {
    const names: string[] = [];
    let current = categoryId ? categoryMap.get(categoryId) : undefined;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) { visited.add(current.id); names.unshift(current.name); current = current.parentId ? categoryMap.get(current.parentId) : undefined; }
    return names.join(' › ');
  };
  return <ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>UNDERLYING TRANSACTIONS</AppText><AppText variant="h3" style={{ color: palette.text }}>{title}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}</AppText></View><Pressable accessibilityLabel="Close transaction drill-down" onPress={onClose}><Ionicons name="close-circle" size={25} color={palette.muted} /></Pressable></View>{transactions.map((transaction, index) => {
    const incoming = transaction.financialEffect === 'income';
    const outgoing = transaction.financialEffect === 'expense';
    const amountColor = transaction.type === 'refund' || incoming ? colors.income : outgoing ? colors.expense : palette.background === '#11151B' ? palette.text : colors.neutralAmount;
    const accountId = outgoing ? transaction.accountFromId : incoming ? transaction.accountToId : transaction.accountFromId ?? transaction.accountToId;
    const account = accountId ? accountMap.get(accountId) : undefined;
    const category = categoryPath(transaction.categoryId);
    const detail = [account?.name, category].filter(Boolean).join(' · ');
    return <Pressable key={transaction.id} onPress={() => router.push(`/transaction/${transaction.id}`)} style={({ pressed }) => [styles.drillRow, index > 0 && { borderTopWidth: 1, borderTopColor: palette.border }, pressed && styles.pressed]}><View style={[styles.accountMark, { backgroundColor: `${amountColor}18` }]}><Ionicons name={transaction.type === 'transfer' ? 'swap-horizontal-outline' : incoming || transaction.type === 'refund' ? 'arrow-down-outline' : 'arrow-up-outline'} size={19} color={amountColor} /></View><View style={styles.breakdownName}><AppText variant="bodyMedium" numberOfLines={1} style={{ color: palette.text }}>{transaction.counterpartyName ?? transaction.merchant ?? transaction.notes ?? transaction.type.replaceAll('_', ' ')}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{new Date(transaction.transactionDate).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}{detail ? ` · ${detail}` : ''}</AppText></View><AppText variant="bodyMedium" style={{ color: amountColor }}>{outgoing ? '−' : incoming ? '+' : ''}{formatPeso(transaction.amount)}</AppText><Ionicons name="chevron-forward" size={17} color={palette.muted} /></Pressable>;
  })}</ReportCard>;
}

const blendHex = (color: string, target: string, ratio: number) => {
  const normalize = (value: string) => value.replace('#', '').padEnd(6, '0').slice(0, 6);
  const source = normalize(color);
  const destination = normalize(target);
  const channel = (offset: number) => Math.round(parseInt(source.slice(offset, offset + 2), 16) * (1 - ratio) + parseInt(destination.slice(offset, offset + 2), 16) * ratio).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
};

function CategoryReport({ type, transactions, categories, accounts, spaceId, palette, desktop, viewportWidth }: { type: CategoryType; transactions: Transaction[]; categories: Category[]; accounts: Account[]; spaceId: string | null; palette: Palette; desktop: boolean; viewportWidth: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<CategoryReportItem | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(reportCategoryColors[0]);
  const [chartParent, setChartParent] = useState<CategoryReportItem | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => categoryReportBreakdown(transactions, categories, type, spaceId), [categories, spaceId, transactions, type]);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const rootColors = useMemo(() => new Map(rows.map((row, index) => [row.id, row.id === '__uncategorized__' ? '#8B95A1' : reportCategoryColors[index % reportCategoryColors.length]])), [rows]);
  const chartRows = useMemo(() => chartParent ? categoryReportBreakdown(transactions, categories, type, spaceId, chartParent.id) : rows, [categories, chartParent, rows, spaceId, transactions, type]);
  const chartColors = chartRows.map((row, index) => chartParent ? blendHex(rootColors.get(chartParent.id) ?? selectedColor, index % 2 ? '#FFFFFF' : '#111827', Math.min(0.16 + index * 0.06, 0.42)) : rootColors.get(row.id) ?? row.color);
  const chartTotal = chartRows.reduce((sum, row) => sum + row.amount, 0);
  const selectedIndex = selected ? chartRows.findIndex((row) => row.id === selected.id) : null;
  const transactionById = useMemo(() => new Map(transactions.map((transaction) => [transaction.id, transaction])), [transactions]);
  const selectedTransactions = selected?.transactionIds.map((id) => transactionById.get(id)).filter(Boolean) as Transaction[] | undefined;
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const choose = (row: CategoryReportItem, color: string) => { setSelected(row); setSelectedColor(color); };
  const matchingTransactionCount = new Set(rows.flatMap((row) => row.transactionIds)).size;
  const largest = rows[0]!;
  const visibleRows = rows.filter((row, index) => showAll || index < 7 || expanded.has(row.id) || selected?.id === row.id);
  const donutSize = desktop ? 320 : Math.max(180, Math.min(250, viewportWidth - spacing.xl * 2 - spacing.lg * 2));

  const renderRows = (items: CategoryReportItem[], depth = 0, parentAmount = total, rootColor?: string): React.ReactNode => items.map((row, index) => {
    const color = depth === 0 ? rootColors.get(row.id) ?? row.color : blendHex(rootColor ?? row.color, index % 2 ? '#FFFFFF' : '#111827', Math.min(0.16 + depth * 0.08 + index * 0.04, 0.46));
    const children = row.hasChildren ? categoryReportBreakdown(transactions, categories, type, spaceId, row.id) : [];
    const isExpanded = expanded.has(row.id);
    const percentage = formatReportPercentage(row.amount, parentAmount);
    return <View key={row.id} style={depth > 0 ? [styles.nestedGroup, { marginLeft: Math.min(depth, 3) * spacing.lg, borderLeftColor: `${rootColor ?? color}42` }] : undefined}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: selected?.id === row.id, expanded: row.hasChildren ? isExpanded : undefined }} onPress={() => choose(row, color)} style={({ hovered, pressed }) => [styles.categoryRow, depth > 0 && { backgroundColor: palette.elevated }, selected?.id === row.id && { backgroundColor: `${color}16` }, (hovered || pressed) && styles.pressed]}>
        <View style={[styles.categoryColorMark, { backgroundColor: color }]} />
        <View style={styles.categoryRowBody}>
          <View style={styles.categoryRowTop}><AppText variant="bodyMedium" numberOfLines={1} style={[styles.categoryName, { color: palette.text }]}>{row.name}</AppText><AppText variant="bodyMedium" numberOfLines={1} adjustsFontSizeToFit style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatPeso(row.amount)}</AppText><AppText variant="caption" style={[styles.categoryPercent, { color: palette.muted }]}>{percentage}</AppText>{row.hasChildren && <Pressable accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${row.name}`} hitSlop={10} onPress={(event) => { event.stopPropagation(); toggle(row.id); }} style={styles.chevronButton}><Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={palette.muted} /></Pressable>}</View>
          <View style={[styles.categoryProgressTrack, { backgroundColor: palette.elevated }]}><View style={[styles.categoryProgressFill, { width: `${Math.max(2, Math.min(100, row.amount / Math.max(parentAmount, 1) * 100))}%`, backgroundColor: color }]} /></View>
        </View>
      </Pressable>
      {isExpanded && children.length > 0 && <View style={styles.childrenList}>{renderRows(children, depth + 1, row.amount, rootColor ?? color)}</View>}
    </View>;
  });

  if (!rows.length) return <ReportCard palette={palette}><ReportEmpty icon="pie-chart-outline" title={`No ${type} activity`} body={`No ${type} transactions match the current filters.`} palette={palette} /></ReportCard>;
  return <View style={styles.reportStack}>
    <View style={styles.categorySummaryRow}>
      <View style={[styles.categorySummaryCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.summaryIcon, { backgroundColor: type === 'income' ? colors.incomeWash : colors.expenseWash }]}><Ionicons name={type === 'income' ? 'arrow-down-outline' : 'arrow-up-outline'} size={17} color={type === 'income' ? colors.income : colors.expense} /></View><View style={styles.summaryCopy}><AppText variant="eyebrow" style={{ color: palette.muted }}>TOTAL {type.toUpperCase()}</AppText><AppText variant="h3" numberOfLines={1} adjustsFontSizeToFit style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatPeso(total)}</AppText></View></View>
      <View style={[styles.categorySummaryCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.summaryIcon, { backgroundColor: `${rootColors.get(largest.id) ?? largest.color}1F` }]}><Ionicons name="trophy-outline" size={17} color={rootColors.get(largest.id) ?? largest.color} /></View><View style={styles.summaryCopy}><AppText variant="eyebrow" style={{ color: palette.muted }}>LARGEST CATEGORY</AppText><AppText variant="bodyMedium" numberOfLines={1} style={{ color: palette.text }}>{largest.name}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{formatReportPercentage(largest.amount, total)} of total</AppText></View></View>
      <View style={[styles.categorySummaryCard, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={[styles.summaryIcon, { backgroundColor: palette.elevated }]}><Ionicons name="receipt-outline" size={17} color={colors.blue} /></View><View style={styles.summaryCopy}><AppText variant="eyebrow" style={{ color: palette.muted }}>TRANSACTIONS</AppText><AppText variant="h3" style={{ color: palette.text }}>{matchingTransactionCount}</AppText></View></View>
    </View>
    <ReportCard palette={palette} style={styles.categoryReportCard}>
      <View style={[styles.categoryColumns, !desktop && styles.categoryColumnsMobile]}>
        <View style={[styles.categoryChartColumn, desktop ? styles.categoryChartColumnDesktop : styles.categoryChartColumnMobile]}>
          <View style={styles.categoryChartHeading}>{chartParent ? <Pressable onPress={() => { setChartParent(null); setSelected(null); }} style={styles.backAction}><Ionicons name="arrow-back" size={16} color={colors.mintDeep} /><AppText variant="caption" style={{ color: colors.mintDeep }}>Back to all categories</AppText></Pressable> : <AppText variant="h3" style={{ color: palette.text }}>Category share</AppText>}<AppText variant="caption" numberOfLines={1} style={{ color: palette.muted }}>{chartParent?.name ?? `${rows.length} categories`}</AppText></View>
          <View style={[styles.donutArea, { width: desktop ? 340 : donutSize, minHeight: desktop ? 340 : donutSize }]}><DonutChart size={donutSize} segments={chartRows.map((row, index) => ({ amount: row.amount, color: chartColors[index] ?? row.color, label: row.name }))} selectedIndex={selectedIndex !== null && selectedIndex >= 0 ? selectedIndex : null} onSegmentPress={(index) => { const row = chartRows[index]; if (row) choose(row, chartColors[index] ?? row.color); }} /><View pointerEvents="none" style={styles.donutCenter}><AppText variant="eyebrow" numberOfLines={1} style={{ color: palette.muted }}>{chartParent ? chartParent.name.toUpperCase() : `TOTAL ${type.toUpperCase()}`}</AppText><AppText variant="h2" numberOfLines={1} adjustsFontSizeToFit style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatCompactPeso(chartTotal)}</AppText></View></View>
          {selected && <View style={[styles.chartSelection, { backgroundColor: palette.elevated, borderColor: `${selectedColor}55` }]}><View style={[styles.colorDot, { backgroundColor: selectedColor }]} /><View style={styles.breakdownName}><AppText variant="bodyMedium" numberOfLines={1} style={{ color: palette.text }}>{selected.name}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{formatPeso(selected.amount)} · {formatReportPercentage(selected.amount, chartTotal)}</AppText></View>{selected.hasChildren && <Pressable onPress={() => { setChartParent(selected); setExpanded((current) => new Set(current).add(selected.id)); setSelected(null); }} style={styles.chartDrillButton}><AppText variant="caption" style={{ color: colors.mintDeep }}>View subcategories</AppText><Ionicons name="arrow-forward" size={14} color={colors.mintDeep} /></Pressable>}</View>}
          <View style={styles.compactLegend}>{chartRows.slice(0, 5).map((row, index) => <Pressable key={row.id} onPress={() => choose(row, chartColors[index] ?? row.color)} style={styles.legendItem}><View style={[styles.colorDot, { backgroundColor: chartColors[index] ?? row.color }]} /><AppText variant="caption" numberOfLines={1} style={[styles.legendLabel, { color: palette.muted }]}>{row.name}</AppText><AppText variant="caption" style={{ color: palette.text }}>{formatReportPercentage(row.amount, chartTotal)}</AppText></Pressable>)}</View>
        </View>
        <View style={styles.categoryBreakdownColumn}><View style={styles.breakdownHeading}><View><AppText variant="h3" style={{ color: palette.text }}>Category breakdown</AppText><AppText variant="caption" style={{ color: palette.muted }}>Tap a row for its transactions</AppText></View></View>{renderRows(visibleRows)}{rows.length > 7 && <Pressable onPress={() => setShowAll((current) => !current)} style={[styles.showCategoriesButton, { borderColor: palette.border, backgroundColor: palette.elevated }]}><AppText variant="bodyMedium" style={{ color: colors.mintDeep }}>{showAll ? 'Show Less' : `Show All Categories (${rows.length})`}</AppText><Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={17} color={colors.mintDeep} /></Pressable>}</View>
      </View>
    </ReportCard>
    {selected && selectedTransactions?.length ? <Drilldown title={selected.name} transactions={selectedTransactions} accounts={accounts} categories={categories} palette={palette} onClose={() => setSelected(null)} /> : null}
  </View>;
}

function SpaceReport({ type, transactions, spaces, palette }: { type: CategoryType; transactions: Transaction[]; spaces: Space[]; palette: Palette }) {
  const [selected, setSelected] = useState<SpaceReportItem | null>(null);
  const rows = useMemo(() => spaceReportBreakdown(transactions, spaces, type), [spaces, transactions, type]);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const selectedIndex = selected ? rows.findIndex((row) => row.id === selected.id) : null;
  const transactionById = useMemo(() => new Map(transactions.map((transaction) => [transaction.id, transaction])), [transactions]);
  const selectedTransactions = selected?.transactionIds.map((id) => transactionById.get(id)).filter(Boolean) as Transaction[] | undefined;
  if (!rows.length) return <ReportCard palette={palette}><ReportEmpty icon="grid-outline" title={`No ${type} activity by Space`} body={`No ${type} transactions match the current filters.`} palette={palette} /></ReportCard>;
  return <View style={styles.reportStack}>
    <ReportCard palette={palette} style={styles.donutCard}>
      <View style={styles.donutArea}><DonutChart size={220} segments={rows.map((row) => ({ amount: row.amount, color: row.color }))} selectedIndex={selectedIndex !== null && selectedIndex >= 0 ? selectedIndex : null} onSegmentPress={(index) => setSelected(rows[index] ?? null)} /><View pointerEvents="none" style={styles.donutCenter}><AppText variant="eyebrow" style={{ color: palette.muted }}>TOTAL {type.toUpperCase()}</AppText><AppText variant="h2" style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatCompactPeso(total)}</AppText></View></View>
      <View style={styles.breakdown}><AppText variant="h3" style={{ color: palette.text }}>By Space</AppText>{rows.map((row) => <Pressable key={row.id} accessibilityRole="button" onPress={() => setSelected(row)} style={({ pressed }) => [styles.breakdownRow, selected?.id === row.id && { backgroundColor: palette.elevated }, pressed && styles.pressed]}><View style={[styles.spaceMark, { backgroundColor: `${row.color}1F` }]}><Ionicons name="layers-outline" size={18} color={row.color} /></View><View style={styles.breakdownName}><AppText variant="bodyMedium" style={{ color: palette.text }}>{row.name}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{row.transactionIds.length} {row.transactionIds.length === 1 ? 'transaction' : 'transactions'} · {Math.round(row.amount / Math.max(total, 1) * 100)}%</AppText></View><AppText variant="bodyMedium" style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatPeso(row.amount)}</AppText><Ionicons name="chevron-forward" size={17} color={palette.muted} /></Pressable>)}</View>
    </ReportCard>
    {selected && selectedTransactions?.length ? <Drilldown title={selected.name} transactions={selectedTransactions} palette={palette} onClose={() => setSelected(null)} /> : null}
  </View>;
}

function AccountRows({ accounts, palette, onSelect }: { accounts: (Account & { balanceAsOf: number })[]; palette: Palette; onSelect?: (account: Account) => void }) {
  const max = Math.max(...accounts.map((account) => Math.abs(account.balanceAsOf)), 1);
  return <View>{accounts.map((account, index) => <Pressable key={account.id} onPress={() => onSelect?.(account)} disabled={!onSelect} style={({ pressed }) => [styles.accountRow, index > 0 && { borderTopColor: palette.border, borderTopWidth: 1 }, pressed && styles.pressed]}><View style={[styles.accountMark, { backgroundColor: `${account.accent}1F` }]}><Ionicons name={account.type === 'credit_card' ? 'card-outline' : account.type === 'cash' ? 'cash-outline' : 'business-outline'} size={19} color={account.accent} /></View><View style={styles.accountCopy}><AppText variant="bodyMedium" style={{ color: palette.text }}>{account.name}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{account.institution || account.type.replaceAll('_', ' ')}</AppText><View style={[styles.balanceTrack, { backgroundColor: palette.elevated }]}><View style={[styles.balanceFill, { width: `${Math.max(3, Math.abs(account.balanceAsOf) / max * 100)}%`, backgroundColor: account.accent }]} /></View></View><AppText variant="bodyMedium" style={{ color: account.balanceAsOf < 0 ? colors.expense : palette.background === '#11151B' ? palette.text : colors.neutralAmount }}>{formatPeso(account.balanceAsOf)}</AppText>{onSelect && <Ionicons name="chevron-forward" size={17} color={palette.muted} />}</Pressable>)}</View>;
}

function MobileReportPicker({ visible, selected, onSelect, onClose, palette }: { visible: boolean; selected: ReportKey; onSelect: (key: ReportKey) => void; onClose: () => void; palette: Palette }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalOverlay}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><SafeAreaView edges={['bottom']} style={[styles.mobileSheet, { backgroundColor: palette.card }]}><View style={[styles.sheetHandle, { backgroundColor: palette.border }]} /><View style={styles.sheetHeading}><AppText variant="h3" style={{ color: palette.text }}>Choose a report</AppText><Pressable onPress={onClose}><Ionicons name="close" size={23} color={palette.text} /></Pressable></View><ScrollView>{reportItems.map((item) => <Pressable key={item.key} onPress={() => { onSelect(item.key); onClose(); }} style={[styles.mobileReportRow, selected === item.key && { backgroundColor: palette.elevated }]}><Ionicons name={item.icon} size={21} color={selected === item.key ? colors.mintDeep : palette.muted} /><AppText variant="bodyMedium" style={[styles.navLabel, { color: palette.text }]}>{item.label}</AppText>{selected === item.key && <Ionicons name="checkmark-circle" size={20} color={colors.mintDeep} />}</Pressable>)}</ScrollView></SafeAreaView></View></Modal>;
}

export default function ReportsScreen() {
  const params = useLocalSearchParams<{ report?: string }>();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const dark = useColorScheme() === 'dark';
  const palette = paletteFor(dark);
  const { transactions, categories, accounts, spaces, selectedSpaceId, isLoading } = useFinance();
  const report: ReportKey = isReportKey(params.report) ? params.report : 'overview';
  const [rangeKey, setRangeKey] = useState<AnalyticsRangeKey>('this_month');
  const [customRange, setCustomRange] = useState<AnalyticsCustomRange | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [accountFilterOpen, setAccountFilterOpen] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [payeeSelection, setPayeeSelection] = useState<string | null>(null);

  const range = useMemo(() => resolveAnalyticsDateRange(rangeKey, new Date(), customRange ?? undefined), [customRange, rangeKey]);
  const spaceTransactions = useMemo(() => transactionsInSpace(transactions, selectedSpaceId), [selectedSpaceId, transactions]);
  const accountTransactions = useMemo(() => accountId ? spaceTransactions.filter((transaction) => transaction.accountFromId === accountId || transaction.accountToId === accountId) : spaceTransactions, [accountId, spaceTransactions]);
  const periodTransactions = useMemo(() => transactionsInRange(accountTransactions, range.start, range.end), [accountTransactions, range.end, range.start]);
  const totals = useMemo(() => analyticsTotals(accountTransactions, range), [accountTransactions, range]);
  const series = useMemo(() => spendingTrendSeries(accountTransactions, range), [accountTransactions, range]);
  const relevantAccounts = useMemo(() => accounts.filter((account) => {
    const belongsToSpace = !selectedSpaceId || !account.spaceId || account.spaceId === selectedSpaceId;
    const hasHistory = transactions.some((transaction) => transaction.accountFromId === account.id || transaction.accountToId === account.id);
    return belongsToSpace && (account.isActive || account.balance !== 0 || hasHistory);
  }), [accounts, selectedSpaceId, transactions]);
  const balanceRows = useMemo(() => accountBalancesAsOf(relevantAccounts, transactions, range.end).sort((a, b) => Math.abs(b.balanceAsOf) - Math.abs(a.balanceAsOf)), [range.end, relevantAccounts, transactions]);
  const payees = useMemo(() => payeeBreakdownForTransactions(periodTransactions), [periodTransactions]);
  const payeeTransactions = payeeSelection ? periodTransactions.filter((transaction) => payees.find((item) => item.id === payeeSelection)?.transactionIds.includes(transaction.id)) : [];
  const netWorth = balanceRows.reduce((sum, account) => sum + (account.type === 'credit_card' ? -Math.abs(account.balanceAsOf) : account.balanceAsOf), 0);
  const chartWidth = Math.max(250, Math.min(desktop ? 1080 : width - spacing.xl * 4, desktop ? width - 400 : width - spacing.xl * 4));
  const selectedAccount = accounts.find((account) => account.id === accountId);

  const selectReport = (key: ReportKey) => {
    router.setParams({ report: key });
  };
  const chooseRange = (key: AnalyticsRangeKey, nextCustom?: AnalyticsCustomRange) => { if (key === 'custom' && nextCustom) setCustomRange(nextCustom); setRangeKey(key); setRangeOpen(false); };
  const exportCsv = () => {
    if (Platform.OS !== 'web' || !periodTransactions.length) return;
    const accountMap = new Map(accounts.map((account) => [account.id, account.name]));
    const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [['Date', 'Type', 'Counterparty', 'Amount', 'Currency', 'From account', 'To account', 'Category', 'Notes'], ...periodTransactions.map((transaction) => [transaction.transactionDate, transaction.type, transaction.counterpartyName ?? transaction.merchant ?? '', transaction.amount, transaction.currency, accountMap.get(transaction.accountFromId ?? '') ?? '', accountMap.get(transaction.accountToId ?? '') ?? '', categoryMap.get(transaction.categoryId ?? '') ?? '', transaction.notes ?? ''])];
    const csv = rows.map((row) => row.map(quote).join(',')).join('\n');
    const documentRef = (globalThis as typeof globalThis & { document?: Document }).document;
    if (!documentRef) return;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = documentRef.createElement('a'); anchor.href = url; anchor.download = `moneyyap-${report}-${range.rangeLabel.replaceAll(' ', '-').toLowerCase()}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const commonHeader = <View style={styles.reportHeader}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>{range.rangeLabel}</AppText><AppText variant="h2" style={{ color: palette.text }}>{reportLabel(report)}</AppText></View>{Platform.OS === 'web' && <Button label="Export CSV" icon="download-outline" variant="secondary" disabled={!periodTransactions.length} onPress={exportCsv} style={styles.exportButton} />}</View>;

  const renderReport = () => {
    if (isLoading) return <ReportCard palette={palette}><View style={styles.loading}><ActivityIndicator color={colors.mintDark} /><AppText style={{ color: palette.muted }}>Loading your reports…</AppText></View></ReportCard>;
    if (report === 'expenses' || report === 'income') return <View style={styles.reportStack}>{commonHeader}<CategoryReport type={report === 'income' ? 'income' : 'expense'} transactions={periodTransactions} categories={categories} accounts={accounts} spaceId={selectedSpaceId} palette={palette} desktop={desktop} viewportWidth={width} /></View>;
    if (report === 'expenses_by_space' || report === 'income_by_space') return <View style={styles.reportStack}>{commonHeader}<SpaceReport key={report} type={report === 'income_by_space' ? 'income' : 'expense'} transactions={periodTransactions} spaces={spaces} palette={palette} /></View>;
    if (report === 'overview') return <View style={styles.reportStack}>{commonHeader}<View style={styles.metrics}><MetricCard label="INCOME" amount={totals.income} tone="income" icon="arrow-down" palette={palette} /><MetricCard label="EXPENSES" amount={totals.spending} tone="expense" icon="arrow-up" palette={palette} /><MetricCard label="NET CASH FLOW" amount={totals.netCashFlow} tone={totals.netCashFlow >= 0 ? 'income' : 'expense'} icon="swap-vertical" palette={palette} /><MetricCard label="NET WORTH" amount={netWorth} tone="neutral" icon="diamond-outline" palette={palette} /></View><ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>MONEY IN VS MONEY OUT</AppText><AppText variant="h3" style={{ color: palette.text }}>Cash flow</AppText></View><View style={styles.legendInline}><View style={[styles.colorDot, { backgroundColor: colors.income }]} /><AppText variant="caption" style={{ color: palette.muted }}>Income</AppText><View style={[styles.colorDot, { backgroundColor: colors.expense }]} /><AppText variant="caption" style={{ color: palette.muted }}>Expenses</AppText></View></View>{totals.income || totals.spending ? <CashFlowChart data={series} width={chartWidth} height={220} /> : <ReportEmpty icon="pulse-outline" title="No cash flow yet" body="Transactions in this period will appear here." palette={palette} />}</ReportCard><ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>AS OF {range.rangeLabel.toUpperCase()}</AppText><AppText variant="h3" style={{ color: palette.text }}>Account snapshot</AppText></View><Pressable onPress={() => selectReport('balances')}><AppText variant="bodyMedium" style={{ color: colors.mintDeep }}>View all</AppText></Pressable></View>{balanceRows.length ? <AccountRows accounts={balanceRows.slice(0, 5)} palette={palette} onSelect={(account) => router.push(`/account/${account.id}`)} /> : <ReportEmpty icon="wallet-outline" title="No accounts" body="Add an account to see balances here." palette={palette} />}</ReportCard></View>;
    if (report === 'cash_flow') return <View style={styles.reportStack}>{commonHeader}<View style={styles.metricsThree}><MetricCard label="INCOME" amount={totals.income} tone="income" icon="arrow-down" palette={palette} /><MetricCard label="EXPENSES" amount={totals.spending} tone="expense" icon="arrow-up" palette={palette} /><MetricCard label="NET" amount={totals.netCashFlow} tone={totals.netCashFlow >= 0 ? 'income' : 'expense'} icon="swap-vertical" palette={palette} /></View><ReportCard palette={palette}><View style={styles.legendInline}><View style={[styles.colorDot, { backgroundColor: colors.income }]} /><AppText variant="caption" style={{ color: palette.muted }}>Income</AppText><View style={[styles.colorDot, { backgroundColor: colors.expense }]} /><AppText variant="caption" style={{ color: palette.muted }}>Expenses</AppText></View>{totals.income || totals.spending ? <CashFlowChart data={series} width={chartWidth} height={270} /> : <ReportEmpty icon="pulse-outline" title="No cash flow data" body="Try another date range or add a transaction." palette={palette} />}</ReportCard></View>;
    if (report === 'balances') return <View style={styles.reportStack}>{commonHeader}<ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>BALANCE AT END OF PERIOD</AppText><AppText variant="h3" style={{ color: palette.text }}>{formatPeso(balanceRows.reduce((sum, account) => sum + account.balanceAsOf, 0))}</AppText></View></View>{balanceRows.length ? <AccountRows accounts={balanceRows} palette={palette} onSelect={(account) => router.push(`/account/${account.id}`)} /> : <ReportEmpty icon="wallet-outline" title="No account balances" body="No accounts match the current Space." palette={palette} />}</ReportCard></View>;
    if (report === 'trends') return <View style={styles.reportStack}>{commonHeader}<ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>HISTORICAL SPENDING</AppText><AppText variant="h2" style={{ color: totals.spending ? colors.expense : colors.neutralAmount }}>{formatPeso(totals.spending)}</AppText></View>{totals.spendingChange !== null && <View style={[styles.changePill, { backgroundColor: totals.spendingChange <= 0 ? colors.incomeWash : colors.expenseWash }]}><Ionicons name={totals.spendingChange <= 0 ? 'trending-down' : 'trending-up'} size={16} color={totals.spendingChange <= 0 ? colors.income : colors.expense} /><AppText variant="caption" style={{ color: totals.spendingChange <= 0 ? colors.income : colors.expense }}>{Math.abs(totals.spendingChange).toFixed(0)}% {range.comparisonLabel}</AppText></View>}</View>{totals.spending ? <SpendLineChart data={series} width={chartWidth} height={270} /> : <ReportEmpty icon="analytics-outline" title="No spending trend" body="There are no expenses in this period." palette={palette} />}</ReportCard></View>;
    if (report === 'budget') return <View style={styles.reportStack}>{commonHeader}<ReportCard palette={palette}><ReportEmpty icon="speedometer-outline" title="Budget vs actual" body="Open the live monthly budget to compare category allocations with ledger-based spending, review warnings, and drill into transactions." palette={palette} /><Button label="Open Budgets" icon="speedometer-outline" onPress={() => router.push('/(tabs)/budgets' as never)} /></ReportCard></View>;
    if (report === 'payees') return <View style={styles.reportStack}>{commonHeader}<ReportCard palette={palette}>{payees.length ? payees.map((payee, index) => <Pressable key={payee.id} onPress={() => setPayeeSelection(payee.id)} style={({ pressed }) => [styles.payeeRow, index > 0 && { borderTopWidth: 1, borderTopColor: palette.border }, pressed && styles.pressed]}><View style={[styles.rank, { backgroundColor: palette.elevated }]}><AppText variant="caption" style={{ color: palette.muted }}>{index + 1}</AppText></View><View style={styles.breakdownName}><AppText variant="bodyMedium" style={{ color: palette.text }}>{payee.name}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{payee.transactionIds.length} {payee.transactionIds.length === 1 ? 'transaction' : 'transactions'}</AppText></View><AppText variant="bodyMedium" style={{ color: colors.expense }}>{formatPeso(payee.amount)}</AppText><Ionicons name="chevron-forward" size={17} color={palette.muted} /></Pressable>) : <ReportEmpty icon="people-outline" title="No payees" body="Expense merchants and payees will appear here." palette={palette} />}</ReportCard>{payeeSelection && payeeTransactions.length ? <Drilldown title={payees.find((item) => item.id === payeeSelection)?.name ?? 'Payee'} transactions={payeeTransactions} palette={palette} onClose={() => setPayeeSelection(null)} /> : null}</View>;
    return <View style={styles.reportStack}>{commonHeader}<View style={styles.heroWorth}><AppText variant="eyebrow" style={{ color: palette.muted }}>NET WORTH AS OF {range.rangeLabel.toUpperCase()}</AppText><AppText variant="display" style={{ color: netWorth >= 0 ? colors.income : colors.expense }}>{formatPeso(netWorth)}</AppText><AppText style={{ color: palette.muted }}>Assets less credit card liabilities</AppText></View><ReportCard palette={palette}>{balanceRows.length ? <AccountRows accounts={balanceRows} palette={palette} onSelect={(account) => router.push(`/account/${account.id}`)} /> : <ReportEmpty icon="diamond-outline" title="No net worth data" body="Add accounts to calculate your net worth." palette={palette} />}</ReportCard></View>;
  };

  return <Screen title="Reports" subtitle="A clear view of where your money goes" contentStyle={[styles.wideContent, { backgroundColor: palette.background }]} backgroundColor={palette.background} titleColor={palette.text} subtitleColor={palette.muted} right={!desktop ? <Pressable onPress={() => setReportPickerOpen(true)} style={[styles.mobilePickerButton, { backgroundColor: palette.card, borderColor: palette.border }]}><Ionicons name="pie-chart-outline" size={18} color={colors.mintDeep} /><AppText variant="caption" style={{ color: palette.text }} numberOfLines={1}>{reportLabel(report)}</AppText><Ionicons name="chevron-down" size={16} color={palette.muted} /></Pressable> : undefined}>
    <View style={styles.filterBar}><SpaceSelector /><View style={styles.filterActions}><Chip label={`${range.label} · ${range.rangeLabel}`} icon="calendar-outline" selected onPress={() => setRangeOpen(true)} /><Chip label={selectedAccount?.name ?? 'All accounts'} icon="wallet-outline" selected={Boolean(accountId)} onPress={() => setAccountFilterOpen(true)} /></View></View>
    <View style={styles.reportMain}>{renderReport()}</View>
    <AnalyticsRangeSheet visible={rangeOpen} selectedKey={rangeKey} customRange={customRange} onClose={() => setRangeOpen(false)} onSelect={chooseRange} />
    <SmartSelectSheet visible={accountFilterOpen} title="Filter by account" options={[{ id: '__all__', label: 'All accounts', color: colors.mint }, ...relevantAccounts.map((account) => ({ id: account.id, label: account.name, detail: account.institution ?? account.type.replaceAll('_', ' '), searchText: accountLabel(account), color: account.accent }))]} selectedIds={[accountId ?? '__all__']} onClose={() => setAccountFilterOpen(false)} onSelect={(id) => setAccountId(id === '__all__' ? null : id)} searchPlaceholder="Search accounts" />
    <MobileReportPicker visible={reportPickerOpen} selected={report} onSelect={selectReport} onClose={() => setReportPickerOpen(false)} palette={palette} />
  </Screen>;
}

const styles = StyleSheet.create({
  wideContent: { maxWidth: 1440, minHeight: '100%' },
  filterBar: { gap: spacing.md },
  filterActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  navLabel: { flex: 1 },
  reportMain: { flex: 1, minWidth: 0 },
  reportStack: { gap: spacing.xl },
  reportHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  exportButton: { minHeight: 42 },
  card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.xl, overflow: 'hidden' },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricsThree: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricCard: { flexGrow: 1, flexBasis: 150, minWidth: 145, borderWidth: 1, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.sm },
  metricIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  legendInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  categorySummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  categorySummaryCard: { flex: 1, flexBasis: 190, minWidth: 170, minHeight: 82, borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  categoryReportCard: { padding: spacing.lg },
  categoryColumns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxl },
  categoryColumnsMobile: { flexDirection: 'column', gap: spacing.xl },
  categoryChartColumn: { minWidth: 0, alignItems: 'center', gap: spacing.md },
  categoryChartColumnDesktop: { width: 340, flexBasis: 340, flexShrink: 0, position: 'sticky', top: spacing.lg, alignSelf: 'flex-start' } as never,
  categoryChartColumnMobile: { width: '100%', flexBasis: 'auto' },
  categoryChartHeading: { width: '100%', minHeight: 42, justifyContent: 'center', gap: 2 },
  backAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 24 },
  chartSelection: { width: '100%', minHeight: 52, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chartDrillButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 34, paddingLeft: spacing.sm },
  compactLegend: { width: '100%', gap: spacing.xs },
  legendItem: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendLabel: { flex: 1, minWidth: 0 },
  categoryBreakdownColumn: { flex: 1, width: '100%', minWidth: 0, gap: 3 },
  breakdownHeading: { minHeight: 48, justifyContent: 'center', marginBottom: spacing.xs },
  categoryRow: { minHeight: 54, borderRadius: radii.md, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryColorMark: { width: 6, height: 32, borderRadius: 3 },
  categoryRowBody: { flex: 1, minWidth: 0, gap: 7 },
  categoryRowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryName: { flex: 1, minWidth: 0 },
  categoryPercent: { width: 42, textAlign: 'right', fontFamily: typography.medium },
  chevronButton: { width: 28, height: 28, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  categoryProgressTrack: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden' },
  categoryProgressFill: { height: 4, borderRadius: 2 },
  nestedGroup: { borderLeftWidth: 1, paddingLeft: spacing.xs, marginTop: 2 },
  childrenList: { gap: 2 },
  showCategoriesButton: { minHeight: 44, marginTop: spacing.sm, borderWidth: 1, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  donutCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxxl, flexWrap: 'wrap' },
  donutArea: { width: 240, minHeight: 240, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center', gap: spacing.xs },
  breakdown: { flex: 1, minWidth: 260, gap: spacing.xs },
  breakdownRow: { minHeight: 58, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  breakdownName: { flex: 1, minWidth: 0 },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  spaceMark: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  childRow: { minHeight: 42, marginLeft: spacing.xxxl, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  childGuide: { width: 3, height: 22, borderRadius: 2 },
  divider: { height: 1 },
  drillRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  accountRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  accountMark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, minWidth: 0, gap: 2 },
  balanceTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  balanceFill: { height: 4, borderRadius: 2 },
  payeeRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  heroWorth: { alignItems: 'center', paddingVertical: spacing.huge, gap: spacing.sm },
  changePill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  empty: { alignItems: 'center', paddingVertical: spacing.huge, paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyBody: { textAlign: 'center', maxWidth: 480 },
  loading: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  mobilePickerButton: { maxWidth: 210, minHeight: 40, borderWidth: 1, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 12, 18, 0.5)' },
  mobileSheet: { maxHeight: '84%', borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: spacing.md },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  mobileReportRow: { minHeight: 56, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  pressed: { opacity: 0.72 },
});
