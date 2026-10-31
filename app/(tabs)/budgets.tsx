import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { TransactionRow } from '@/components/TransactionRow';
import { AppText, Button, EmptyState, IconCircle, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { getErrorMessage } from '@/lib/errors';
import {
  budgetMonthKey,
  budgetMonthLabel,
  buildBudgetSnapshot,
  flattenBudgetRows,
  shiftBudgetMonth,
  UNCATEGORIZED_BUDGET_KEY,
  type BudgetCategoryRow,
  type BudgetProgressTone,
} from '@/lib/budgets';
import { supabase } from '@/lib/supabase';
import { loadMonthlyBudget, loadTransactionSplits, saveMonthlyBudget } from '@/services/budgets';
import { colors, formatPeso, radii, shadows, spacing, typography } from '@/theme';
import type { BudgetAllocation, Category, MonthlyBudget, Space, Transaction, TransactionSplit } from '@/types/finance';

const toneColor = (tone: BudgetProgressTone) => tone === 'healthy'
  ? colors.income
  : tone === 'warning'
    ? colors.warning
    : colors.expense;

const percentLabel = (value: number) => !Number.isFinite(value) ? 'No limit' : `${Math.max(0, value * 100).toFixed(value < 1 ? 0 : 0)}%`;

export default function BudgetsScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { categories, isLoading: financeLoading, refreshFinance, spaces, transactions, workspaceId } = useFinance();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [budget, setBudget] = useState<MonthlyBudget | null>(null);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<BudgetCategoryRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revision, setRevision] = useState(0);
  const monthKey = budgetMonthKey(month);

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextBudget, nextSplits] = await Promise.all([
        loadMonthlyBudget(workspaceId, monthKey),
        loadTransactionSplits(transactions.map((transaction) => transaction.id)),
      ]);
      setBudget(nextBudget);
      setSplits(nextSplits);
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to load this budget.'));
    } finally {
      setLoading(false);
    }
  }, [monthKey, transactions, workspaceId]);

  useEffect(() => {
    const task = setTimeout(() => { void reload(); }, 0);
    return () => clearTimeout(task);
  }, [reload, revision]);

  useEffect(() => {
    if (!supabase || !workspaceId) return;
    const refresh = () => setRevision((current) => current + 1);
    const refreshTransactions = () => { void refreshFinance(); refresh(); };
    const channel = supabase
      .channel(`budget-sync-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_budgets', filter: `workspace_id=eq.${workspaceId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_allocations' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `workspace_id=eq.${workspaceId}` }, refreshTransactions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_splits' }, refreshTransactions)
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [refreshFinance, workspaceId]);

  const snapshot = useMemo(
    () => buildBudgetSnapshot(categories, budget?.allocations ?? [], transactions, splits, month),
    [budget?.allocations, categories, month, splits, transactions],
  );
  const visibleRows = useMemo(
    () => snapshot.rows.filter((row) => row.allocated !== 0 || row.spent !== 0),
    [snapshot.rows],
  );
  const alerts = useMemo(
    () => flattenBudgetRows(visibleRows).filter((row) => row.tone === 'warning' || row.tone === 'over' || row.tone === 'unallocated'),
    [visibleRows],
  );

  const saveAllocations = async (allocations: { categoryId: string; amount: number }[]) => {
    if (!workspaceId) return;
    setSaving(true);
    setError(null);
    try {
      await saveMonthlyBudget(workspaceId, monthKey, allocations);
      setBudget(await loadMonthlyBudget(workspaceId, monthKey));
      setEditorOpen(false);
    } catch (reason) {
      const message = getErrorMessage(reason, 'Unable to save this budget.');
      setError(message);
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  };

  const copyPreviousMonth = async () => {
    if (!workspaceId) return;
    setSaving(true);
    setError(null);
    try {
      const previousMonth = shiftBudgetMonth(month, -1);
      const previous = await loadMonthlyBudget(workspaceId, budgetMonthKey(previousMonth));
      const activeCategoryIds = new Set(categories.filter((category) => category.type === 'expense' && !category.isArchived).map((category) => category.id));
      const allocations = (previous?.allocations ?? [])
        .filter((allocation) => activeCategoryIds.has(allocation.categoryId))
        .map((allocation) => ({ categoryId: allocation.categoryId, amount: allocation.amount }));
      if (!allocations.length) throw new Error(`${budgetMonthLabel(previousMonth)} has no allocations to copy.`);
      await saveMonthlyBudget(workspaceId, monthKey, allocations);
      setBudget(await loadMonthlyBudget(workspaceId, monthKey));
    } catch (reason) {
      setError(getErrorMessage(reason, 'Unable to copy the previous budget.'));
    } finally {
      setSaving(false);
    }
  };

  const updateDirectAllocation = async (categoryId: string, amount: number) => {
    const allocationMap = new Map((budget?.allocations ?? []).map((allocation) => [allocation.categoryId, allocation.amount]));
    if (amount > 0) allocationMap.set(categoryId, amount); else allocationMap.delete(categoryId);
    await saveAllocations([...allocationMap].map(([id, value]) => ({ categoryId: id, amount: value })));
    setSelectedRow(null);
  };

  const changeMonth = (offset: number) => {
    setMonth((current) => shiftBudgetMonth(current, offset));
    setSelectedRow(null);
    setExpanded(new Set());
  };

  const pageLoading = loading || financeLoading;
  return (
    <Screen
      title="Budgets"
      subtitle="Plan the month and see every peso update automatically"
      contentStyle={desktop ? styles.desktopContent : undefined}
      right={<Pressable accessibilityLabel="Edit budget allocations" disabled={pageLoading} onPress={() => setEditorOpen(true)} style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}><Ionicons name="create-outline" size={20} color={colors.mintDeep} /><AppText variant="caption" style={styles.headerActionText}>{budget ? 'Edit plan' : 'Set budget'}</AppText></Pressable>}
    >
      <View style={styles.monthBar}>
        <Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><Ionicons name="chevron-back" size={21} color={colors.ink} /></Pressable>
        <View style={styles.monthCopy}><AppText variant="eyebrow" style={styles.muted}>MONTHLY PLAN</AppText><AppText variant="h2">{budgetMonthLabel(month)}</AppText></View>
        <Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}><Ionicons name="chevron-forward" size={21} color={colors.ink} /></Pressable>
      </View>

      {error && <View style={styles.errorBanner}><Ionicons name="alert-circle" size={19} color={colors.danger} /><AppText variant="caption" style={styles.errorText}>{error}</AppText><Pressable onPress={() => setError(null)}><Ionicons name="close" size={18} color={colors.danger} /></Pressable></View>}

      {pageLoading ? <View style={styles.loading}><ActivityIndicator color={colors.mintDeep} /><AppText style={styles.muted}>Loading your budget…</AppText></View> : (
        <>
          <View style={styles.metrics}>
            <BudgetMetric label="MONTHLY BUDGET" value={snapshot.totalAllocated} icon="wallet-outline" color={colors.mintDeep} background={colors.mintWash} />
            <BudgetMetric label="SPENT" value={snapshot.totalSpent} icon="arrow-up-outline" color={colors.expense} background={colors.expenseWash} />
            <BudgetMetric label="REMAINING" value={snapshot.remaining} icon="sparkles-outline" color={snapshot.remaining >= 0 ? colors.income : colors.expense} background={snapshot.remaining >= 0 ? colors.incomeWash : colors.expenseWash} />
          </View>

          <Surface style={styles.overallCard}>
            <View style={styles.overallHeading}><View style={styles.flex}><AppText variant="eyebrow" style={styles.muted}>OVERALL UTILIZATION</AppText><AppText variant="h3">{percentLabel(snapshot.utilization)} used</AppText></View><View style={[styles.statusPill, { backgroundColor: `${toneColor(snapshot.tone)}18` }]}><View style={[styles.statusDot, { backgroundColor: toneColor(snapshot.tone) }]} /><AppText variant="caption" style={{ color: toneColor(snapshot.tone) }}>{snapshot.tone === 'over' ? 'Over budget' : snapshot.tone === 'warning' ? 'Near limit' : snapshot.tone === 'unallocated' ? 'Needs a plan' : 'On track'}</AppText></View></View>
            <BudgetProgress allocated={snapshot.totalAllocated} spent={snapshot.totalSpent} tone={snapshot.tone} large />
            <View style={styles.overallFooter}><AppText variant="caption" style={styles.muted}>{formatPeso(snapshot.totalSpent)} of {formatPeso(snapshot.totalAllocated)}</AppText><AppText variant="caption" style={{ color: snapshot.remaining >= 0 ? colors.income : colors.expense }}>{snapshot.remaining >= 0 ? `${formatPeso(snapshot.remaining)} left` : `${formatPeso(Math.abs(snapshot.remaining))} over`}</AppText></View>
          </Surface>

          {alerts.length > 0 && <View style={styles.alertSection}><AppText variant="h3">Needs attention</AppText><View style={styles.alertGrid}>{alerts.slice(0, 6).map((row) => <Pressable key={row.id} onPress={() => setSelectedRow(row)} style={({ pressed }) => [styles.alertCard, { backgroundColor: row.tone === 'warning' ? colors.warningWash : colors.expenseWash }, pressed && styles.pressed]}><Ionicons name={row.tone === 'warning' ? 'warning-outline' : 'alert-circle-outline'} size={19} color={toneColor(row.tone)} /><View style={styles.flex}><AppText variant="bodyMedium" numberOfLines={1}>{row.name}</AppText><AppText variant="caption" style={{ color: toneColor(row.tone) }}>{row.tone === 'unallocated' ? `${formatPeso(row.spent)} has no allocation` : row.tone === 'warning' ? `${percentLabel(row.utilization)} used` : `${formatPeso(Math.abs(row.remaining))} over budget`}</AppText></View></Pressable>)}</View></View>}

          {!budget ? <EmptyState icon="speedometer-outline" title={`Plan ${budgetMonthLabel(month)}`} body="Set category limits from your existing expense categories. MoneyYap will calculate actual spending from your transaction ledger." action={<View style={styles.emptyActions}><Button label="Set up budget" icon="add" onPress={() => setEditorOpen(true)} /><Button label="Copy previous month" variant="secondary" icon="copy-outline" loading={saving} onPress={() => void copyPreviousMonth()} /></View>} /> : visibleRows.length ? (
            <View style={styles.categorySection}>
              <View style={styles.sectionHeading}><View><AppText variant="h2">Category plan</AppText><AppText style={styles.muted}>Tap a category for transactions and quick adjustments.</AppText></View><Button label="Edit allocations" variant="secondary" icon="create-outline" onPress={() => setEditorOpen(true)} style={styles.compactButton} /></View>
              <View style={styles.categoryList}>{visibleRows.map((row) => <BudgetCategoryCard key={row.id} row={row} depth={0} expanded={expanded} setExpanded={setExpanded} spaces={spaces} onSelect={setSelectedRow} />)}</View>
            </View>
          ) : <EmptyState icon="leaf-outline" title="Budget is ready" body="Add category allocations or record expenses to see your progress here." action={<Button label="Add allocations" icon="add" onPress={() => setEditorOpen(true)} />} />}
        </>
      )}

      <AllocationEditor key={`${monthKey}-${budget?.updatedAt ?? 'new'}-${editorOpen}`} visible={editorOpen} month={month} categories={categories} spaces={spaces} allocations={budget?.allocations ?? []} saving={saving} onClose={() => setEditorOpen(false)} onSave={saveAllocations} />
      <CategoryDetailSheet key={`${selectedRow?.id ?? 'none'}-${budget?.updatedAt ?? 'new'}`} row={selectedRow} transactions={transactions} allocations={budget?.allocations ?? []} saving={saving} onClose={() => setSelectedRow(null)} onAdjust={updateDirectAllocation} />
    </Screen>
  );
}

function BudgetMetric({ label, value, icon, color, background }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap; color: string; background: string }) {
  return <Surface style={styles.metricCard}><IconCircle name={icon} size={38} color={color} background={background} /><View style={styles.metricCopy}><AppText variant="eyebrow" style={styles.muted}>{label}</AppText><AppText variant="h2" numberOfLines={1} adjustsFontSizeToFit style={{ color }}>{formatPeso(value)}</AppText></View></Surface>;
}

function BudgetProgress({ allocated, spent, tone, large = false }: { allocated: number; spent: number; tone: BudgetProgressTone; large?: boolean }) {
  const ratio = allocated > 0 ? Math.max(0, Math.min(spent / allocated, 1)) : spent > 0 ? 1 : 0;
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }} style={[styles.progressTrack, large && styles.progressTrackLarge]}><View style={[styles.progressFill, large && styles.progressFillLarge, { width: `${ratio * 100}%`, backgroundColor: toneColor(tone) }]} /></View>;
}

function BudgetCategoryCard({ row, depth, expanded, setExpanded, spaces, onSelect }: { row: BudgetCategoryRow; depth: number; expanded: Set<string>; setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>; spaces: Space[]; onSelect: (row: BudgetCategoryRow) => void }) {
  const isExpanded = expanded.has(row.id);
  const hasChildren = row.children.some((child) => child.allocated !== 0 || child.spent !== 0);
  const space = spaces.find((item) => item.id === row.spaceId);
  const visibleChildren = row.children.filter((child) => child.allocated !== 0 || child.spent !== 0);
  const toggle = () => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
    return next;
  });
  return <View style={[styles.categoryCard, depth > 0 && styles.childCategoryCard]}>
    <Pressable onPress={() => onSelect(row)} style={({ pressed }) => [styles.categoryMain, { paddingLeft: spacing.lg + depth * 18 }, pressed && styles.pressed]}>
      <View style={[styles.categoryIcon, { backgroundColor: `${row.color}18` }]}><Ionicons name={row.icon as keyof typeof Ionicons.glyphMap} size={19} color={row.color} /></View>
      <View style={styles.categoryBody}>
        <View style={styles.categoryTop}><View style={styles.categoryName}><AppText variant="bodyMedium" numberOfLines={1}>{row.name}</AppText>{depth === 0 && space && <AppText variant="caption" style={styles.muted} numberOfLines={1}>{space.name}</AppText>}</View><View style={styles.categoryAmounts}><AppText variant="bodyMedium" style={{ color: row.remaining >= 0 ? colors.neutralAmount : colors.expense }}>{formatPeso(row.spent)}</AppText><AppText variant="caption" style={styles.muted}>of {formatPeso(row.allocated)}</AppText></View>{hasChildren && <Pressable accessibilityLabel={isExpanded ? `Collapse ${row.name}` : `Expand ${row.name}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); toggle(); }} style={styles.chevron}><Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.slate} /></Pressable>}</View>
        <BudgetProgress allocated={row.allocated} spent={row.spent} tone={row.tone} />
        <View style={styles.categoryFooter}><AppText variant="caption" style={{ color: toneColor(row.tone) }}>{row.tone === 'unallocated' ? 'No allocation' : percentLabel(row.utilization)}</AppText><AppText variant="caption" style={{ color: row.remaining >= 0 ? colors.slate : colors.expense }}>{row.remaining >= 0 ? `${formatPeso(row.remaining)} left` : `${formatPeso(Math.abs(row.remaining))} over`}</AppText></View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.borderStrong} />
    </Pressable>
    {isExpanded && visibleChildren.length > 0 && <View style={styles.children}>{visibleChildren.map((child) => <BudgetCategoryCard key={child.id} row={child} depth={depth + 1} expanded={expanded} setExpanded={setExpanded} spaces={spaces} onSelect={onSelect} />)}</View>}
  </View>;
}

function AllocationEditor({ visible, month, categories, spaces, allocations, saving, onClose, onSave }: { visible: boolean; month: Date; categories: Category[]; spaces: Space[]; allocations: BudgetAllocation[]; saving: boolean; onClose: () => void; onSave: (allocations: { categoryId: string; amount: number }[]) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(allocations.map((allocation) => [allocation.categoryId, String(allocation.amount)])));
  const [error, setError] = useState<string | null>(null);
  const activeCategories = useMemo(() => categories.filter((category) => category.type === 'expense' && (!category.isArchived || allocations.some((allocation) => allocation.categoryId === category.id))), [allocations, categories]);
  const grouped = useMemo(() => spaces.filter((space) => !space.isArchived || activeCategories.some((category) => category.spaceId === space.id)).map((space) => ({ space, categories: categoryEditorRows(activeCategories.filter((category) => category.spaceId === space.id)) })).filter((group) => group.categories.length), [activeCategories, spaces]);
  const save = async () => {
    const next = Object.entries(values).flatMap(([categoryId, raw]) => {
      const amount = Number(raw.replaceAll(',', ''));
      if (!raw.trim() || amount === 0) return [];
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter valid positive amounts.');
      return [{ categoryId, amount }];
    });
    setError(null);
    try { await onSave(next); } catch (reason) { setError(getErrorMessage(reason, 'Unable to save allocations.')); }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.editorSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}><View style={styles.flex}><AppText variant="h2">Plan {budgetMonthLabel(month)}</AppText><AppText style={styles.muted}>Set direct allocations. Parent totals include their subcategories once.</AppText></View><Pressable accessibilityLabel="Close" hitSlop={10} onPress={onClose}><Ionicons name="close" size={24} color={colors.ink} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editorContent}>
          {grouped.map(({ space, categories: rows }) => <View key={space.id} style={styles.editorGroup}><View style={styles.editorGroupHeading}><View style={[styles.spaceDot, { backgroundColor: space.color }]} /><AppText variant="eyebrow" style={styles.muted}>{space.name}</AppText></View>{rows.map(({ category, depth }) => <View key={category.id} style={[styles.editorRow, { paddingLeft: spacing.md + depth * 22 }]}><View style={[styles.editorCategoryIcon, { backgroundColor: `${category.color}18` }]}><Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={16} color={category.color} /></View><View style={styles.flex}><AppText variant="bodyMedium" numberOfLines={1}>{category.name}</AppText>{depth > 0 && <AppText variant="caption" style={styles.muted}>Subcategory</AppText>}</View><View style={styles.amountInputWrap}><AppText style={styles.currencyPrefix}>₱</AppText><TextInput accessibilityLabel={`${category.name} allocation`} value={values[category.id] ?? ''} onChangeText={(value) => setValues((current) => ({ ...current, [category.id]: value.replace(/[^0-9.,]/g, '') }))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.slate} style={styles.amountInput} /></View></View>)}</View>)}
          {!grouped.length && <EmptyState icon="pricetag-outline" title="No expense categories" body="Create an expense category first, then return to set its budget." />}
        </ScrollView>
        {error && <AppText variant="caption" style={styles.editorError}>{error}</AppText>}
        <View style={styles.editorActions}><Button label="Cancel" variant="ghost" disabled={saving} onPress={onClose} /><Button label="Save budget" icon="checkmark" loading={saving} onPress={() => void save()} /></View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

function CategoryDetailSheet({ row, transactions, allocations, saving, onClose, onAdjust }: { row: BudgetCategoryRow | null; transactions: Transaction[]; allocations: BudgetAllocation[]; saving: boolean; onClose: () => void; onAdjust: (categoryId: string, amount: number) => Promise<void> }) {
  const [amount, setAmount] = useState(() => String(row ? allocations.find((allocation) => allocation.categoryId === row.id)?.amount ?? 0 : 0));
  const [error, setError] = useState<string | null>(null);
  if (!row) return null;
  const related = transactions.filter((transaction) => row.transactionIds.includes(transaction.id)).sort((left, right) => right.transactionDate.localeCompare(left.transactionDate));
  const save = async () => {
    const parsed = Number(amount.replaceAll(',', ''));
    if (!Number.isFinite(parsed) || parsed < 0) { setError('Enter a valid allocation.'); return; }
    try { await onAdjust(row.id, parsed); } catch (reason) { setError(getErrorMessage(reason, 'Unable to adjust this category.')); }
  };
  const uncategorized = row.id === UNCATEGORIZED_BUDGET_KEY;
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalOverlay}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><SafeAreaView edges={['bottom']} style={styles.detailSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View style={styles.flex}><AppText variant="h2">{row.name}</AppText><AppText style={styles.muted}>{formatPeso(row.spent)} spent · {row.remaining >= 0 ? `${formatPeso(row.remaining)} left` : `${formatPeso(Math.abs(row.remaining))} over`}</AppText></View><Pressable accessibilityLabel="Close" hitSlop={10} onPress={onClose}><Ionicons name="close" size={24} color={colors.ink} /></Pressable></View>{uncategorized ? <View style={styles.quickAdjust}><Ionicons name="information-circle-outline" size={21} color={colors.mintDeep} /><AppText style={styles.flex}>Assign categories to these transactions so their spending is tracked against the right allocation.</AppText></View> : <View style={styles.quickAdjust}><View style={styles.flex}><AppText variant="bodyMedium">Direct allocation</AppText>{row.children.length > 0 && <AppText variant="caption" style={styles.muted}>Subcategory allocations are added separately.</AppText>}</View><View style={styles.amountInputWrap}><AppText style={styles.currencyPrefix}>₱</AppText><TextInput value={amount} onChangeText={(value) => setAmount(value.replace(/[^0-9.,]/g, ''))} keyboardType="decimal-pad" style={styles.amountInput} /></View><Button label="Update" loading={saving} onPress={() => void save()} style={styles.updateButton} /></View>}{error && <AppText variant="caption" style={styles.editorError}>{error}</AppText>}<View style={styles.detailDivider} /><AppText variant="h3">Transactions</AppText><ScrollView style={styles.transactionList} contentContainerStyle={styles.transactionListContent}>{related.length ? related.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} compact mobileList={Platform.OS !== 'web'} onPress={() => { onClose(); router.push(`/transaction/${transaction.id}`); }} />) : <EmptyState icon="receipt-outline" title="No spending yet" body="Matching transactions for this month will appear here." />}</ScrollView></SafeAreaView></View></Modal>;
}

function categoryEditorRows(categories: Category[]) {
  const ids = new Set(categories.map((category) => category.id));
  const children = new Map<string | null, Category[]>();
  categories.forEach((category) => {
    const parentId = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), category]);
  });
  children.forEach((items) => items.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));
  const walk = (parentId: string | null, depth: number): { category: Category; depth: number }[] => (children.get(parentId) ?? []).flatMap((category) => [{ category, depth }, ...walk(category.id, depth + 1)]);
  return walk(null, 0);
}

const styles = StyleSheet.create({
  desktopContent: { maxWidth: 1180 },
  flex: { flex: 1, minWidth: 0 },
  muted: { color: colors.slate },
  pressed: { opacity: 0.7 },
  headerAction: { minHeight: 40, borderRadius: radii.pill, paddingHorizontal: spacing.md, backgroundColor: colors.mintWash, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerActionText: { color: colors.mintDeep },
  monthBar: { minHeight: 70, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, ...shadows.soft },
  monthButton: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  monthCopy: { flex: 1, alignItems: 'center', gap: 2 },
  errorBanner: { minHeight: 48, borderRadius: radii.md, backgroundColor: colors.dangerWash, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  errorText: { flex: 1, color: colors.danger },
  loading: { minHeight: 340, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricCard: { flex: 1, flexBasis: 210, minWidth: 190, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metricCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  overallCard: { padding: spacing.xl, gap: spacing.lg },
  overallHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusPill: { minHeight: 32, borderRadius: radii.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  progressTrack: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.border },
  progressTrackLarge: { height: 12, borderRadius: 6 },
  progressFill: { height: 7, borderRadius: 4 },
  progressFillLarge: { height: 12, borderRadius: 6 },
  overallFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  alertSection: { gap: spacing.md },
  alertGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  alertCard: { flex: 1, flexBasis: 260, minWidth: 230, minHeight: 64, borderRadius: radii.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emptyActions: { gap: spacing.sm, width: '100%', maxWidth: 320 },
  categorySection: { gap: spacing.lg },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  compactButton: { minHeight: 44 },
  categoryList: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.white, ...shadows.soft },
  categoryCard: { borderBottomWidth: 1, borderBottomColor: colors.border },
  childCategoryCard: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.border },
  categoryMain: { minHeight: 94, paddingVertical: spacing.md, paddingRight: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  categoryIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  categoryBody: { flex: 1, minWidth: 0, gap: spacing.sm },
  categoryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  categoryName: { flex: 1, minWidth: 0, gap: 1 },
  categoryAmounts: { alignItems: 'flex-end', minWidth: 90 },
  chevron: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  categoryFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  children: { backgroundColor: '#FCFCFA', borderLeftWidth: 3, borderLeftColor: colors.mintMist, marginLeft: spacing.xl },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18,25,35,0.42)' },
  editorSheet: { width: '100%', maxWidth: Platform.OS === 'web' ? 680 : undefined, maxHeight: '92%', alignSelf: 'center', backgroundColor: colors.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  detailSheet: { width: '100%', maxWidth: Platform.OS === 'web' ? 720 : undefined, height: '88%', alignSelf: 'center', backgroundColor: colors.white, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginVertical: spacing.md },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  editorContent: { paddingBottom: spacing.lg, gap: spacing.xl },
  editorGroup: { gap: spacing.xs },
  editorGroupHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  spaceDot: { width: 9, height: 9, borderRadius: 5 },
  editorRow: { minHeight: 62, borderTopWidth: 1, borderTopColor: colors.border, paddingRight: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editorCategoryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  amountInputWrap: { width: 132, height: 42, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, backgroundColor: colors.softWhite, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  currencyPrefix: { color: colors.slate, fontFamily: typography.semibold },
  amountInput: { flex: 1, height: 42, color: colors.ink, fontFamily: typography.semibold, fontSize: 15, textAlign: 'right', outlineStyle: 'none' } as never,
  editorError: { color: colors.danger, paddingVertical: spacing.sm },
  editorActions: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  quickAdjust: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radii.md },
  updateButton: { minHeight: 42 },
  detailDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  transactionList: { flex: 1, marginTop: spacing.sm },
  transactionListContent: { paddingBottom: spacing.xl },
});
