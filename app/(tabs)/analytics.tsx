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
import { colors, formatCompactPeso, formatPeso, radii, spacing } from '@/theme';
import type { Account, CategoryType, Space, Transaction } from '@/types/finance';

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

function Drilldown({ title, transactions, palette, onClose }: { title: string; transactions: Transaction[]; palette: Palette; onClose: () => void }) {
  return <ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>UNDERLYING TRANSACTIONS</AppText><AppText variant="h3" style={{ color: palette.text }}>{title}</AppText></View><Pressable accessibilityLabel="Close transaction drill-down" onPress={onClose}><Ionicons name="close-circle" size={25} color={palette.muted} /></Pressable></View>{transactions.map((transaction, index) => {
    const incoming = transaction.financialEffect === 'income';
    const outgoing = transaction.financialEffect === 'expense';
    const amountColor = transaction.type === 'refund' || incoming ? colors.income : outgoing ? colors.expense : palette.background === '#11151B' ? palette.text : colors.neutralAmount;
    return <Pressable key={transaction.id} onPress={() => router.push(`/transaction/${transaction.id}`)} style={({ pressed }) => [styles.drillRow, index > 0 && { borderTopWidth: 1, borderTopColor: palette.border }, pressed && styles.pressed]}><View style={[styles.accountMark, { backgroundColor: `${amountColor}18` }]}><Ionicons name={transaction.type === 'transfer' ? 'swap-horizontal-outline' : incoming || transaction.type === 'refund' ? 'arrow-down-outline' : 'arrow-up-outline'} size={19} color={amountColor} /></View><View style={styles.breakdownName}><AppText variant="bodyMedium" style={{ color: palette.text }}>{transaction.counterpartyName ?? transaction.merchant ?? transaction.type.replaceAll('_', ' ')}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{new Date(transaction.transactionDate).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} · {transaction.type.replaceAll('_', ' ')}</AppText></View><AppText variant="bodyMedium" style={{ color: amountColor }}>{outgoing ? '−' : incoming ? '+' : ''}{formatPeso(transaction.amount)}</AppText><Ionicons name="chevron-forward" size={17} color={palette.muted} /></Pressable>;
  })}</ReportCard>;
}

function CategoryReport({ type, transactions, categories, spaceId, palette }: { type: CategoryType; transactions: Transaction[]; categories: Parameters<typeof categoryReportBreakdown>[1]; spaceId: string | null; palette: Palette }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<CategoryReportItem | null>(null);
  const rows = useMemo(() => categoryReportBreakdown(transactions, categories, type, spaceId), [categories, spaceId, transactions, type]);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const selectedIndex = selected ? rows.findIndex((row) => row.id === selected.id) : null;
  const transactionById = useMemo(() => new Map(transactions.map((transaction) => [transaction.id, transaction])), [transactions]);
  const selectedTransactions = selected?.transactionIds.map((id) => transactionById.get(id)).filter(Boolean) as Transaction[] | undefined;
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  if (!rows.length) return <ReportCard palette={palette}><ReportEmpty icon="pie-chart-outline" title={`No ${type} activity`} body={`No ${type} transactions match the current filters.`} palette={palette} /></ReportCard>;
  return <View style={styles.reportStack}>
    <ReportCard palette={palette} style={styles.donutCard}>
      <View style={styles.donutArea}><DonutChart size={220} segments={rows.map((row) => ({ amount: row.amount, color: row.color }))} selectedIndex={selectedIndex !== null && selectedIndex >= 0 ? selectedIndex : null} onSegmentPress={(index) => setSelected(rows[index] ?? null)} /><View pointerEvents="none" style={styles.donutCenter}><AppText variant="eyebrow" style={{ color: palette.muted }}>TOTAL {type.toUpperCase()}</AppText><AppText variant="h2" style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatCompactPeso(total)}</AppText></View></View>
      <View style={styles.breakdown}><AppText variant="h3" style={{ color: palette.text }}>Breakdown</AppText>{rows.map((row) => {
        const children = row.hasChildren ? categoryReportBreakdown(transactions, categories, type, spaceId, row.id) : [];
        return <View key={row.id}><Pressable accessibilityRole="button" onPress={() => setSelected(row)} style={({ pressed }) => [styles.breakdownRow, selected?.id === row.id && { backgroundColor: palette.elevated }, pressed && styles.pressed]}><View style={[styles.colorDot, { backgroundColor: row.color }]} /><View style={styles.breakdownName}><AppText variant="bodyMedium" style={{ color: palette.text }}>{row.name}</AppText><AppText variant="caption" style={{ color: palette.muted }}>{Math.round(row.amount / Math.max(total, 1) * 100)}%</AppText></View><AppText variant="bodyMedium" style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatPeso(row.amount)}</AppText>{row.hasChildren && <Pressable accessibilityLabel={`${expanded.has(row.id) ? 'Collapse' : 'Expand'} ${row.name}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); toggle(row.id); }}><Ionicons name={expanded.has(row.id) ? 'chevron-up' : 'chevron-down'} size={18} color={palette.muted} /></Pressable>}</Pressable>
          {expanded.has(row.id) && children.map((child) => <Pressable key={child.id} onPress={() => setSelected(child)} style={({ pressed }) => [styles.childRow, pressed && styles.pressed]}><View style={[styles.childGuide, { backgroundColor: row.color }]} /><AppText style={[styles.breakdownName, { color: palette.muted }]}>{child.name}</AppText><AppText variant="caption" style={{ color: type === 'income' ? colors.income : colors.expense }}>{formatPeso(child.amount)} · {Math.round(child.amount / Math.max(row.amount, 1) * 100)}%</AppText></Pressable>)}
        </View>;
      })}</View>
    </ReportCard>
    {selected && selectedTransactions?.length ? <Drilldown title={selected.name} transactions={selectedTransactions} palette={palette} onClose={() => setSelected(null)} /> : null}
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
    if (report === 'expenses' || report === 'income') return <View style={styles.reportStack}>{commonHeader}<CategoryReport type={report === 'income' ? 'income' : 'expense'} transactions={periodTransactions} categories={categories} spaceId={selectedSpaceId} palette={palette} /></View>;
    if (report === 'expenses_by_space' || report === 'income_by_space') return <View style={styles.reportStack}>{commonHeader}<SpaceReport key={report} type={report === 'income_by_space' ? 'income' : 'expense'} transactions={periodTransactions} spaces={spaces} palette={palette} /></View>;
    if (report === 'overview') return <View style={styles.reportStack}>{commonHeader}<View style={styles.metrics}><MetricCard label="INCOME" amount={totals.income} tone="income" icon="arrow-down" palette={palette} /><MetricCard label="EXPENSES" amount={totals.spending} tone="expense" icon="arrow-up" palette={palette} /><MetricCard label="NET CASH FLOW" amount={totals.netCashFlow} tone={totals.netCashFlow >= 0 ? 'income' : 'expense'} icon="swap-vertical" palette={palette} /><MetricCard label="NET WORTH" amount={netWorth} tone="neutral" icon="diamond-outline" palette={palette} /></View><ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>MONEY IN VS MONEY OUT</AppText><AppText variant="h3" style={{ color: palette.text }}>Cash flow</AppText></View><View style={styles.legendInline}><View style={[styles.colorDot, { backgroundColor: colors.income }]} /><AppText variant="caption" style={{ color: palette.muted }}>Income</AppText><View style={[styles.colorDot, { backgroundColor: colors.expense }]} /><AppText variant="caption" style={{ color: palette.muted }}>Expenses</AppText></View></View>{totals.income || totals.spending ? <CashFlowChart data={series} width={chartWidth} height={220} /> : <ReportEmpty icon="pulse-outline" title="No cash flow yet" body="Transactions in this period will appear here." palette={palette} />}</ReportCard><ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>AS OF {range.rangeLabel.toUpperCase()}</AppText><AppText variant="h3" style={{ color: palette.text }}>Account snapshot</AppText></View><Pressable onPress={() => selectReport('balances')}><AppText variant="bodyMedium" style={{ color: colors.mintDeep }}>View all</AppText></Pressable></View>{balanceRows.length ? <AccountRows accounts={balanceRows.slice(0, 5)} palette={palette} onSelect={(account) => router.push(`/account/${account.id}`)} /> : <ReportEmpty icon="wallet-outline" title="No accounts" body="Add an account to see balances here." palette={palette} />}</ReportCard></View>;
    if (report === 'cash_flow') return <View style={styles.reportStack}>{commonHeader}<View style={styles.metricsThree}><MetricCard label="INCOME" amount={totals.income} tone="income" icon="arrow-down" palette={palette} /><MetricCard label="EXPENSES" amount={totals.spending} tone="expense" icon="arrow-up" palette={palette} /><MetricCard label="NET" amount={totals.netCashFlow} tone={totals.netCashFlow >= 0 ? 'income' : 'expense'} icon="swap-vertical" palette={palette} /></View><ReportCard palette={palette}><View style={styles.legendInline}><View style={[styles.colorDot, { backgroundColor: colors.income }]} /><AppText variant="caption" style={{ color: palette.muted }}>Income</AppText><View style={[styles.colorDot, { backgroundColor: colors.expense }]} /><AppText variant="caption" style={{ color: palette.muted }}>Expenses</AppText></View>{totals.income || totals.spending ? <CashFlowChart data={series} width={chartWidth} height={270} /> : <ReportEmpty icon="pulse-outline" title="No cash flow data" body="Try another date range or add a transaction." palette={palette} />}</ReportCard></View>;
    if (report === 'balances') return <View style={styles.reportStack}>{commonHeader}<ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>BALANCE AT END OF PERIOD</AppText><AppText variant="h3" style={{ color: palette.text }}>{formatPeso(balanceRows.reduce((sum, account) => sum + account.balanceAsOf, 0))}</AppText></View></View>{balanceRows.length ? <AccountRows accounts={balanceRows} palette={palette} onSelect={(account) => router.push(`/account/${account.id}`)} /> : <ReportEmpty icon="wallet-outline" title="No account balances" body="No accounts match the current Space." palette={palette} />}</ReportCard></View>;
    if (report === 'trends') return <View style={styles.reportStack}>{commonHeader}<ReportCard palette={palette}><View style={styles.cardHeading}><View><AppText variant="eyebrow" style={{ color: palette.muted }}>HISTORICAL SPENDING</AppText><AppText variant="h2" style={{ color: totals.spending ? colors.expense : colors.neutralAmount }}>{formatPeso(totals.spending)}</AppText></View>{totals.spendingChange !== null && <View style={[styles.changePill, { backgroundColor: totals.spendingChange <= 0 ? colors.incomeWash : colors.expenseWash }]}><Ionicons name={totals.spendingChange <= 0 ? 'trending-down' : 'trending-up'} size={16} color={totals.spendingChange <= 0 ? colors.income : colors.expense} /><AppText variant="caption" style={{ color: totals.spendingChange <= 0 ? colors.income : colors.expense }}>{Math.abs(totals.spendingChange).toFixed(0)}% {range.comparisonLabel}</AppText></View>}</View>{totals.spending ? <SpendLineChart data={series} width={chartWidth} height={270} /> : <ReportEmpty icon="analytics-outline" title="No spending trend" body="There are no expenses in this period." palette={palette} />}</ReportCard></View>;
    if (report === 'budget') return <View style={styles.reportStack}>{commonHeader}<ReportCard palette={palette}><ReportEmpty icon="speedometer-outline" title="Budgets aren’t set up yet" body="MoneyYap doesn’t have budget allocations in this workspace yet. When budgets are added, actual category spending will be compared here without changing your transaction data." palette={palette} /></ReportCard></View>;
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
