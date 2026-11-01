import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { Screen } from '@/components/Screen';
import { SmartSelectSheet } from '@/components/SmartSelectSheet';
import { SpaceSelector } from '@/components/SpaceSelector';
import { TransactionDateHeader } from '@/components/TransactionDateHeader';
import { TransactionFiltersSheet } from '@/components/TransactionFiltersSheet';
import { TransactionRow } from '@/components/TransactionRow';
import { TransactionTypeFilters } from '@/components/TransactionTypeFilters';
import { AppText, Button, Chip, EmptyState, IconCircle, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { getErrorMessage } from '@/lib/errors';
import { isTransactionReconciled } from '@/lib/reconciliation';
import { groupTransactionsByDate } from '@/lib/transactionDates';
import { colors, radii, spacing, typography } from '@/theme';
import type { TransactionType } from '@/types/finance';

type Picker = 'account' | 'category' | null;
type ReconciliationFilter = 'all' | 'unreconciled' | 'reconciled';

const mobileTypeTabs: { label: string; value: TransactionType | null }[] = [
  { label: 'All', value: null },
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
  { label: 'Transfer', value: 'transfer' },
];

function MobileTransactionActions({ visible, matchingCount, onClose, onReconcile }: { visible: boolean; matchingCount: number; onClose: () => void; onReconcile: () => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.actionOverlay}><Pressable style={StyleSheet.absoluteFill} onPress={onClose} /><SafeAreaView edges={['bottom']} style={styles.actionSafe}><View style={styles.actionSheet}><View style={styles.actionHandle} /><View style={styles.actionHeading}><AppText variant="h3">Transaction actions</AppText><Pressable hitSlop={10} onPress={onClose}><Ionicons name="close" size={23} color={colors.ink} /></Pressable></View><Pressable disabled={!matchingCount} onPress={onReconcile} style={({ pressed }) => [styles.actionRow, !matchingCount && styles.actionDisabled, pressed && styles.pressed]}><View style={styles.actionIcon}><Ionicons name="checkmark-done-outline" size={20} color={colors.mintDeep} /></View><View style={styles.actionCopy}><AppText variant="bodyMedium">Reconcile matching</AppText><AppText variant="caption" style={styles.muted}>{matchingCount ? `Mark ${matchingCount} visible ${matchingCount === 1 ? 'transaction' : 'transactions'} as reconciled` : 'No unreconciled transactions in this view'}</AppText></View><Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable></View></SafeAreaView></View></Modal>;
}

export default function TransactionsScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { transactions, accounts, categories, spaces, selectedSpaceId, setSelectedSpaceId, setTransactionsReconciled } = useFinance();
  const [query, setQuery] = useState('');
  const [thisMonth, setThisMonth] = useState(false);
  const [forVerificationOnly, setForVerificationOnly] = useState(false);
  const [type, setType] = useState<TransactionType | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [reconciliationFilter, setReconciliationFilter] = useState<ReconciliationFilter>('all');
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [unreconcileTransactionId, setUnreconcileTransactionId] = useState<string | null>(null);
  const [reconciliationError, setReconciliationError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const filtered = useMemo(() => transactions.filter((item) => {
    const date = new Date(item.transactionDate);
    const now = new Date();
    if (selectedSpaceId && item.spaceId !== selectedSpaceId) return false;
    if (forVerificationOnly && !item.classificationReviewRequired) return false;
    if (thisMonth && (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false;
    if (type && item.type !== type) return false;
    if (accountId && item.accountFromId !== accountId && item.accountToId !== accountId) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (reconciliationFilter === 'unreconciled' && isTransactionReconciled(item)) return false;
    if (reconciliationFilter === 'reconciled' && !isTransactionReconciled(item)) return false;
    if (query) {
      const category = categories.find((candidate) => candidate.id === item.categoryId)?.name ?? '';
      if (!`${item.counterpartyName ?? ''} ${item.merchant ?? ''} ${category} ${item.notes ?? ''} ${item.originalMessage ?? ''} ${item.createdByName}`.toLowerCase().includes(query.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()), [accountId, categories, categoryId, forVerificationOnly, query, reconciliationFilter, selectedSpaceId, thisMonth, transactions, type]);

  const verificationCount = transactions.filter((item) => item.classificationReviewRequired && (!selectedSpaceId || item.spaceId === selectedSpaceId)).length;
  const transactionGroups = groupTransactionsByDate(filtered);
  const unreconciledMatching = filtered.filter((item) => !isTransactionReconciled(item));
  const unreconciledCount = transactions.filter((item) => (!selectedSpaceId || item.spaceId === selectedSpaceId) && !isTransactionReconciled(item)).length;

  const toggleReconciled = async (id: string) => {
    const transaction = transactions.find((item) => item.id === id);
    if (!transaction || reconcilingId) return;
    if (isTransactionReconciled(transaction)) {
      setUnreconcileTransactionId(id);
      return;
    }
    setReconcilingId(id); setReconciliationError(null);
    try { await setTransactionsReconciled([id], true); }
    catch (reason) { setReconciliationError(getErrorMessage(reason, 'Unable to update reconciliation.')); }
    finally { setReconcilingId(null); }
  };

  const selectedAccount = accounts.find((item) => item.id === accountId)?.name;
  const selectedCategory = categories.find((item) => item.id === categoryId)?.name;
  const filterCategoryType = type === 'income' ? 'income' : type === 'expense' || type === 'refund' ? 'expense' : null;
  const advancedFilterCount = [thisMonth, forVerificationOnly, reconciliationFilter !== 'all', Boolean(selectedSpaceId), Boolean(accountId), Boolean(categoryId), type === 'credit_card_payment' || type === 'refund'].filter(Boolean).length;
  const relevantAccounts = accounts.filter((account) => account.isActive && (!selectedSpaceId || !account.spaceId || account.spaceId === selectedSpaceId));
  const relevantCategories = categories.filter((category) => !category.isArchived && Boolean(filterCategoryType) && category.type === filterCategoryType && (!selectedSpaceId || category.spaceId === selectedSpaceId));
  const mobileDateHeaderIndices = transactionGroups.map((_, index) => index * 2);
  return (
    <Screen scroll={desktop} compactHeader={!desktop} title="Transactions" subtitle={desktop ? `${filtered.length} entries · everything in one place` : `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}`} contentStyle={desktop ? styles.wideContent : styles.mobileContent} right={desktop ? <Button label="Add transaction" icon="add" onPress={() => router.push('/manual-transaction')} /> : <Pressable accessibilityLabel="Add transaction" onPress={() => router.push('/manual-transaction')}><IconCircle name="add" size={40} background={colors.mint} /></Pressable>}>
      {desktop ? <>
        <SpaceSelector />
        <TransactionTypeFilters value={type} forVerificationOnly={forVerificationOnly} onChange={(nextType) => { setType(nextType); setCategoryId(null); setForVerificationOnly(false); setPicker(null); }} />
        <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.slate} /><TextInput value={query} onChangeText={setQuery} placeholder="Search merchant, payer, notes, or message" placeholderTextColor={colors.slate} style={styles.input} />{query.length > 0 && <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.slate} /></Pressable>}</View>
        <View style={[styles.filters, styles.desktopFilters]}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}><Chip label={thisMonth ? 'This month' : 'All time'} selected={thisMonth} icon="calendar-outline" onPress={() => setThisMonth((value) => !value)} /><Chip label={`For verification (${verificationCount})`} selected={forVerificationOnly} icon="help-circle-outline" onPress={() => { if (!forVerificationOnly) { setThisMonth(false); setType(null); setCategoryId(null); } setForVerificationOnly(!forVerificationOnly); setPicker(null); }} /><Chip label={`Unreconciled (${unreconciledCount})`} selected={reconciliationFilter === 'unreconciled'} icon="ellipse-outline" onPress={() => setReconciliationFilter((value) => value === 'unreconciled' ? 'all' : 'unreconciled')} /><Chip label="Reconciled" selected={reconciliationFilter === 'reconciled'} icon="checkmark-circle-outline" onPress={() => setReconciliationFilter((value) => value === 'reconciled' ? 'all' : 'reconciled')} /><Chip label={selectedAccount ?? 'Account'} selected={Boolean(accountId)} icon="wallet-outline" onPress={() => setPicker(picker === 'account' ? null : 'account')} /><Chip label={selectedCategory ?? (filterCategoryType ? 'Category' : 'Choose type first')} selected={Boolean(categoryId)} icon="pricetag-outline" onPress={() => { if (filterCategoryType) setPicker(picker === 'category' ? null : 'category'); }} /></ScrollView>{picker && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}><Chip label="All" selected={(picker === 'account' && !accountId) || (picker === 'category' && !categoryId)} onPress={() => { if (picker === 'account') setAccountId(null); if (picker === 'category') setCategoryId(null); }} />{picker === 'account' && accounts.map((item) => <Chip key={item.id} label={item.name} selected={accountId === item.id} onPress={() => setAccountId(item.id)} />)}{picker === 'category' && filterCategoryType && categories.filter((item) => item.type === filterCategoryType && item.spaceId === selectedSpaceId && !item.isArchived).map((item) => <Chip key={item.id} label={item.name} selected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />)}</ScrollView>}</View>
        <View style={styles.reconciliationActions}>{reconciliationError && <AppText variant="caption" style={styles.reconciliationError}>{reconciliationError}</AppText>}{unreconciledMatching.length > 0 && <Button label={`Reconcile ${unreconciledMatching.length} matching`} variant="secondary" icon="checkmark-done-outline" onPress={() => setReconcileOpen(true)} />}</View>
        {filtered.length ? <Surface style={styles.list}><View style={styles.tableHeader}><AppText variant="eyebrow" style={styles.typeHeader}>TYPE</AppText><AppText variant="eyebrow" style={styles.accountHeader}>ACCOUNT</AppText><AppText variant="eyebrow" style={styles.receiverHeader}>COUNTERPARTY / DESTINATION</AppText><AppText variant="eyebrow" style={styles.categoryHeader}>CATEGORY</AppText><AppText variant="eyebrow" style={styles.notesHeader}>NOTES</AppText><AppText variant="eyebrow" style={styles.creatorHeader}>ADDED BY</AppText><AppText variant="eyebrow" style={styles.amountHeader}>AMOUNT</AppText><AppText variant="eyebrow" style={styles.statusHeader}>✓</AppText></View>{transactionGroups.map((group) => <View key={group.key}><TransactionDateHeader transactionDate={group.transactionDate} />{group.items.map((item, index) => <View key={item.id}>{index > 0 && <View style={[styles.separator, styles.desktopSeparator]} />}<TransactionRow transaction={item} desktop onPress={() => router.push(`/transaction/${item.id}`)} onToggleReconciled={() => void toggleReconciled(item.id)} reconciliationBusy={reconcilingId === item.id} /></View>)}</View>)}</Surface> : <Surface><EmptyState icon={forVerificationOnly || reconciliationFilter === 'unreconciled' ? 'checkmark-circle-outline' : 'receipt-outline'} title={forVerificationOnly || reconciliationFilter === 'unreconciled' ? 'All caught up' : 'Nothing here yet'} body={forVerificationOnly ? 'No transactions need verification in this view.' : reconciliationFilter === 'unreconciled' ? 'Every transaction in this view is reconciled.' : 'Try another filter, or add a transaction.'} /></Surface>}
      </> : <>
        <View style={styles.mobileStickyFilters}>
          <View style={styles.mobileTabs}>{mobileTypeTabs.map((option) => { const selected = type === option.value && !forVerificationOnly; return <Pressable key={option.label} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { setType(option.value); setForVerificationOnly(false); setCategoryId(null); }} style={({ pressed }) => [styles.mobileTab, selected && styles.mobileTabSelected, pressed && styles.pressed]}><AppText variant="caption" style={[styles.mobileTabText, selected && styles.mobileTabTextSelected]}>{option.label}</AppText></Pressable>; })}</View>
          <View style={styles.mobileToolbar}><View style={styles.mobileSearch}><Ionicons name="search-outline" size={18} color={colors.slate} /><TextInput value={query} onChangeText={setQuery} placeholder="Search transactions" placeholderTextColor={colors.slate} style={styles.mobileInput} />{query.length > 0 && <Pressable hitSlop={8} onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.slate} /></Pressable>}</View><Pressable accessibilityLabel={`Filters${advancedFilterCount ? `, ${advancedFilterCount} active` : ''}`} onPress={() => setFilterOpen(true)} style={({ pressed }) => [styles.toolbarButton, advancedFilterCount > 0 && styles.toolbarButtonActive, pressed && styles.pressed]}><Ionicons name="options-outline" size={20} color={advancedFilterCount ? colors.mintDeep : colors.slateDark} />{advancedFilterCount > 0 && <View style={styles.filterBadge}><AppText variant="caption" style={styles.filterBadgeText}>{advancedFilterCount}</AppText></View>}</Pressable><Pressable accessibilityLabel="Transaction actions" onPress={() => setActionsOpen(true)} style={({ pressed }) => [styles.toolbarButton, pressed && styles.pressed]}><Ionicons name="ellipsis-horizontal" size={21} color={colors.slateDark} /></Pressable></View>
          {reconciliationError && <View style={styles.mobileError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><AppText variant="caption" style={styles.reconciliationError}>{reconciliationError}</AppText></View>}
        </View>
        <ScrollView style={styles.mobileList} contentContainerStyle={styles.mobileListContent} stickyHeaderIndices={filtered.length ? mobileDateHeaderIndices : undefined} showsVerticalScrollIndicator={false}>
          {filtered.length ? transactionGroups.flatMap((group) => [
            <View key={`${group.key}-header`} style={styles.mobileStickyDate}><TransactionDateHeader compact transactionDate={group.transactionDate} /></View>,
            <View key={`${group.key}-rows`} style={styles.mobileRows}>{group.items.map((item, index) => <View key={item.id}>{index > 0 && <View style={styles.mobileSeparator} />}<TransactionRow transaction={item} mobileList onPress={() => router.push(`/transaction/${item.id}`)} onToggleReconciled={() => void toggleReconciled(item.id)} reconciliationBusy={reconcilingId === item.id} /></View>)}</View>,
          ]) : <View style={styles.mobileEmpty}><EmptyState icon={forVerificationOnly || reconciliationFilter === 'unreconciled' ? 'checkmark-circle-outline' : 'receipt-outline'} title={forVerificationOnly || reconciliationFilter === 'unreconciled' ? 'All caught up' : 'Nothing here yet'} body={forVerificationOnly ? 'No transactions need verification in this view.' : reconciliationFilter === 'unreconciled' ? 'Every transaction in this view is reconciled.' : 'Try another filter, or add a transaction.'} /></View>}
        </ScrollView>
      </>}
      {!desktop && <TransactionFiltersSheet visible={filterOpen} activeCount={advancedFilterCount} thisMonth={thisMonth} spaces={spaces} selectedSpaceId={selectedSpaceId} forVerificationOnly={forVerificationOnly} verificationCount={verificationCount} reconciliationFilter={reconciliationFilter} unreconciledCount={unreconciledCount} type={type} accountLabel={selectedAccount ?? 'All accounts'} categoryLabel={selectedCategory ?? (filterCategoryType ? 'All categories' : 'Choose Expense, Income, or Refund first')} categoryEnabled={Boolean(filterCategoryType)} onClose={() => setFilterOpen(false)} onThisMonthChange={setThisMonth} onSpaceChange={setSelectedSpaceId} onVerificationChange={(value) => { setForVerificationOnly(value); if (value) { setType(null); setCategoryId(null); } }} onReconciliationChange={setReconciliationFilter} onTypeChange={(value) => { setType(value); setForVerificationOnly(false); setCategoryId(null); }} onChooseAccount={() => { setFilterOpen(false); setPicker('account'); }} onChooseCategory={() => { setFilterOpen(false); setPicker('category'); }} onReset={() => { setThisMonth(false); setForVerificationOnly(false); setReconciliationFilter('all'); setSelectedSpaceId(null); setAccountId(null); setCategoryId(null); setType(null); }} />}
      {!desktop && <SmartSelectSheet visible={picker === 'account'} title="Filter by account" options={[{ id: '__all__', label: 'All accounts', color: colors.mint }, ...relevantAccounts.map((account) => ({ id: account.id, label: account.name, detail: account.institution ?? account.type.replaceAll('_', ' '), color: account.accent }))]} selectedIds={[accountId ?? '__all__']} onClose={() => setPicker(null)} onSelect={(id) => setAccountId(id === '__all__' ? null : id)} searchPlaceholder="Search accounts" />}
      {!desktop && <SmartSelectSheet visible={picker === 'category'} title="Filter by category" options={[{ id: '__all__', label: 'All categories', color: colors.mint }, ...relevantCategories.map((category) => ({ id: category.id, label: category.name, parentId: category.parentId, color: category.color }))]} selectedIds={[categoryId ?? '__all__']} onClose={() => setPicker(null)} onSelect={(id) => setCategoryId(id === '__all__' ? null : id)} hierarchical searchPlaceholder="Search categories" />}
      {!desktop && <MobileTransactionActions visible={actionsOpen} matchingCount={unreconciledMatching.length} onClose={() => setActionsOpen(false)} onReconcile={() => { setActionsOpen(false); setReconcileOpen(true); }} />}
      <ConfirmActionDialog visible={reconcileOpen} title={`Reconcile ${unreconciledMatching.length} transactions?`} message="This marks every matching transaction as reconciled for all of its linked accounts. Undoing a confirmed reconciliation later requires confirmation." confirmLabel="Mark reconciled" confirmVariant="primary" onClose={() => setReconcileOpen(false)} onConfirm={async () => { await setTransactionsReconciled(unreconciledMatching.map((item) => item.id), true); }} />
      <ConfirmActionDialog visible={Boolean(unreconcileTransactionId)} title="Undo reconciliation?" message="This transaction is already reconciled across its linked accounts. Marking it unreconciled means those account records need to be checked again." confirmLabel="Mark unreconciled" onClose={() => setUnreconcileTransactionId(null)} onConfirm={async () => { if (!unreconcileTransactionId) return; await setTransactionsReconciled([unreconcileTransactionId], false); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wideContent: { maxWidth: 1240 },
  mobileContent: { flex: 1, gap: 0, backgroundColor: colors.white },
  mobileStickyFilters: { gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.white, zIndex: 3 },
  mobileTabs: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: radii.md, backgroundColor: colors.surface },
  mobileTab: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  mobileTabSelected: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  mobileTabText: { color: colors.slate, fontSize: 11 },
  mobileTabTextSelected: { color: colors.mintDeep },
  mobileToolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mobileSearch: { flex: 1, minHeight: 44, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  mobileInput: { flex: 1, minHeight: 42, fontFamily: typography.regular, fontSize: 14, color: colors.ink },
  toolbarButton: { width: 44, height: 44, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  toolbarButtonActive: { borderColor: colors.mintMist, backgroundColor: colors.mintWash },
  filterBadge: { position: 'absolute', top: -5, right: -5, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.mintDeep, borderWidth: 2, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { color: colors.white, fontSize: 9, lineHeight: 11 },
  mobileError: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.sm, backgroundColor: colors.dangerWash, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  mobileList: { flex: 1, marginHorizontal: -spacing.xl, backgroundColor: colors.white },
  mobileListContent: { paddingBottom: 112 },
  mobileStickyDate: { paddingTop: spacing.sm, paddingHorizontal: spacing.xl, backgroundColor: colors.softWhite, zIndex: 2 },
  mobileRows: { paddingHorizontal: spacing.xl, backgroundColor: colors.white },
  mobileSeparator: { height: 1, marginLeft: 46, backgroundColor: colors.border },
  mobileEmpty: { backgroundColor: colors.white },
  search: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  input: { flex: 1, minHeight: 48, fontFamily: typography.regular, fontSize: 15, color: colors.ink },
  filters: { gap: spacing.md, marginHorizontal: -spacing.xl },
  desktopFilters: { marginHorizontal: -spacing.xl },
  filterRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  optionRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 56 },
  desktopSeparator: { marginLeft: 0 },
  dateSeparator: { height: 2, backgroundColor: colors.borderStrong, marginLeft: 0 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  typeHeader: { width: 52, textAlign: 'center', color: colors.slate },
  accountHeader: { flex: 0.9, minWidth: 100, color: colors.slate },
  receiverHeader: { flex: 1.1, minWidth: 120, color: colors.slate },
  categoryHeader: { width: '14%', minWidth: 100, color: colors.slate },
  notesHeader: { width: '15%', minWidth: 110, color: colors.slate },
  creatorHeader: { width: '10%', minWidth: 88, color: colors.slate },
  amountHeader: { minWidth: 92, textAlign: 'right', color: colors.slate },
  statusHeader: { width: 38, textAlign: 'center', color: colors.slate },
  reconciliationActions: { alignItems: 'flex-end', gap: spacing.sm },
  reconciliationError: { color: colors.danger },
  actionOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.28)' },
  actionSafe: { width: '100%' },
  actionSheet: { gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.white },
  actionHandle: { width: 38, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.borderStrong },
  actionHeading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md },
  actionDisabled: { opacity: 0.48 },
  actionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash },
  actionCopy: { flex: 1, gap: 2 },
  muted: { color: colors.slate },
  pressed: { opacity: 0.72 },
});
