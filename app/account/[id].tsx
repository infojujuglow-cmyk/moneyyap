import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { Screen } from '@/components/Screen';
import { TransactionDateHeader } from '@/components/TransactionDateHeader';
import { TransactionRow } from '@/components/TransactionRow';
import { TransactionTypeFilters } from '@/components/TransactionTypeFilters';
import { AppText, Button, Chip, EmptyState, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { getErrorMessage } from '@/lib/errors';
import { accountReconciliationSummary, isTransactionReconciled } from '@/lib/reconciliation';
import { groupTransactionsByDate } from '@/lib/transactionDates';
import { amountColor, colors, formatPeso, radii, spacing, typography } from '@/theme';
import type { TransactionType } from '@/types/finance';

type ReconciliationFilter = 'all' | 'unreconciled' | 'reconciled';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { accounts, categories, transactions, spaces, setAccountActive, setTransactionsReconciled } = useFinance();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TransactionType | null>(null);
  const [thisMonth, setThisMonth] = useState(false);
  const [forVerificationOnly, setForVerificationOnly] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const [reconciliationFilter, setReconciliationFilter] = useState<ReconciliationFilter>('all');
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [unreconcileTransactionId, setUnreconcileTransactionId] = useState<string | null>(null);
  const account = accounts.find((item) => item.id === id);
  if (!account) return <View style={styles.missing}><EmptyState icon="wallet-outline" title="Account not found" body="This account is no longer available." action={<Button label="Go back" onPress={() => router.back()} />} /></View>;
  const allActivity = transactions
    .filter((item) => item.accountFromId === account.id || item.accountToId === account.id)
    .sort((left, right) => new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime());
  const filterCategoryType = type === 'income' ? 'income' : type === 'expense' || type === 'refund' ? 'expense' : null;
  const accountCategoryIds = new Set(allActivity.filter((item) => !type || item.type === type).map((item) => item.categoryId).filter(Boolean));
  const multipleSpaces = new Set(allActivity.map((item) => item.spaceId)).size > 1;
  const categoryOptions = categories.filter((item) => item.type === filterCategoryType && accountCategoryIds.has(item.id));
  const selectedCategory = categories.find((item) => item.id === categoryId);
  const categoryLabel = (category: typeof categories[number]) => {
    const parent = categories.find((item) => item.id === category.parentId);
    const space = spaces.find((item) => item.id === category.spaceId);
    return `${multipleSpaces && space ? `${space.name} · ` : ''}${parent ? `${parent.name} › ` : ''}${category.name}`;
  };
  const verificationCount = allActivity.filter((item) => item.classificationReviewRequired).length;
  const search = query.trim().toLocaleLowerCase();
  const now = new Date();
  const activity = allActivity.filter((item) => {
    if (type && item.type !== type) return false;
    if (thisMonth) {
      const date = new Date(item.transactionDate);
      if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return false;
    }
    if (forVerificationOnly && !item.classificationReviewRequired) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (reconciliationFilter === 'unreconciled' && isTransactionReconciled(item, account.id)) return false;
    if (reconciliationFilter === 'reconciled' && !isTransactionReconciled(item, account.id)) return false;
    if (search) {
      const categoryName = categories.find((candidate) => candidate.id === item.categoryId)?.name ?? '';
      if (!`${item.counterpartyName ?? ''} ${item.merchant ?? ''} ${categoryName} ${item.notes ?? ''} ${item.originalMessage ?? ''} ${item.createdByName}`.toLocaleLowerCase().includes(search)) return false;
    }
    return true;
  });
  const unreconciledMatching = activity.filter((item) => !isTransactionReconciled(item, account.id));
  const reconciledCount = allActivity.filter((item) => isTransactionReconciled(item, account.id)).length;
  const reconciliationSummary = accountReconciliationSummary(transactions, account.id);
  const lastReconciledLabel = reconciliationSummary.lastReconciledAt
    ? new Date(reconciliationSummary.lastReconciledAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never';
  const visibleActivity = desktop ? activity : activity.slice(0, visibleCount);
  const transactionGroups = groupTransactionsByDate(visibleActivity);
  const space = spaces.find((item) => item.id === account.spaceId);
  const addTransaction = () => router.push({ pathname: '/manual-transaction', params: { accountId: account.id, ...(account.spaceId ? { spaceId: account.spaceId } : {}) } });
  const restore = async () => {
    setRestoring(true); setError(null);
    try { await setAccountActive(account.id, true); router.back(); }
    catch (reason) { setError(getErrorMessage(reason, 'Unable to restore this account.')); }
    finally { setRestoring(false); }
  };
  const toggleReconciled = async (transactionId: string) => {
    const transaction = transactions.find((item) => item.id === transactionId);
    if (!transaction || reconcilingId) return;
    if (isTransactionReconciled(transaction, account.id)) {
      setUnreconcileTransactionId(transactionId);
      return;
    }
    setReconcilingId(transactionId); setError(null);
    try { await setTransactionsReconciled([transactionId], true, account.id); }
    catch (reason) { setError(getErrorMessage(reason, 'Unable to update reconciliation.')); }
    finally { setReconcilingId(null); }
  };
  return <Screen title={account.name} subtitle={account.isActive ? `${desktop ? `${account.institution ?? 'Account'} · ` : ''}${account.ownerUserId ? 'Private · only you' : 'Shared with workspace'}` : 'Removed · history preserved'} contentStyle={desktop ? styles.desktopContent : undefined} right={<View style={styles.headerActions}>{account.isActive && (desktop ? <Button label="Add transaction" icon="add" onPress={addTransaction} /> : <Pressable accessibilityLabel={`Add transaction for ${account.name}`} onPress={addTransaction}><IconCircle name="add" background={colors.mint} /></Pressable>)}<Pressable onPress={() => router.push({ pathname: '/add-account', params: { edit: account.id } })}><IconCircle name="pencil-outline" /></Pressable>{!desktop && <Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}</View>}>
    <Surface style={[styles.summary, desktop && styles.desktopSummary]}><View style={[styles.icon, desktop && styles.desktopIcon, { backgroundColor: `${account.accent}18` }]}><Ionicons name={account.type === 'credit_card' ? 'card-outline' : desktop && account.type === 'cash' ? 'cash-outline' : desktop && account.type === 'ewallet' ? 'phone-portrait-outline' : 'business-outline'} size={26} color={account.accent} /></View><View style={desktop && styles.balanceCopy}><AppText variant="eyebrow" style={styles.muted}>CURRENT BALANCE</AppText><AppText variant="display" style={{ color: amountColor(account.type === 'credit_card' ? -Math.abs(account.balance) : account.balance) }}>{formatPeso(account.type === 'credit_card' ? Math.abs(account.balance) : account.balance)}</AppText><AppText style={styles.muted}>{space ? `${space.name} Space` : 'Available in any Space'} · {account.type.replace('_', ' ')}</AppText><View style={styles.lastReconciled}><Ionicons name={reconciliationSummary.fullyReconciled ? 'checkmark-circle' : 'time-outline'} size={15} color={reconciliationSummary.fullyReconciled ? colors.mintDeep : colors.slate} /><AppText variant="caption" style={reconciliationSummary.fullyReconciled ? styles.fullyReconciledText : styles.muted}>{reconciliationSummary.fullyReconciled ? 'Fully reconciled' : 'Last reconciled'} · {lastReconciledLabel}</AppText></View></View>{desktop && <View style={styles.activitySummary}><AppText variant="eyebrow" style={styles.muted}>TRANSACTIONS</AppText><AppText variant="h2">{allActivity.length}</AppText><AppText variant="caption" style={styles.muted}>{reconciledCount} reconciled · {allActivity.length - reconciledCount} remaining</AppText></View>}</Surface>
    <View style={styles.section}><SectionHeader title="Account transactions" /><AppText variant="caption" style={styles.muted}>{activity.length} of {allActivity.length} entries</AppText>
      <TransactionTypeFilters value={type} forVerificationOnly={forVerificationOnly} onChange={(nextType) => { setType(nextType); setForVerificationOnly(false); setCategoryId(null); setCategoryOpen(false); }} />
      <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.slate} /><TextInput value={query} onChangeText={setQuery} placeholder="Search merchant, payer, notes, or message" placeholderTextColor={colors.slate} style={styles.searchInput} />{query.length > 0 && <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.slate} /></Pressable>}</View>
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Chip label={thisMonth ? 'This month' : 'All time'} selected={thisMonth} icon="calendar-outline" onPress={() => setThisMonth((value) => !value)} />
          <Chip label={`For verification (${verificationCount})`} selected={forVerificationOnly} icon="help-circle-outline" onPress={() => { if (!forVerificationOnly) { setThisMonth(false); setType(null); setCategoryId(null); setCategoryOpen(false); } setForVerificationOnly(!forVerificationOnly); }} />
          <Chip label={`Unreconciled (${allActivity.length - reconciledCount})`} selected={reconciliationFilter === 'unreconciled'} icon="ellipse-outline" onPress={() => setReconciliationFilter((value) => value === 'unreconciled' ? 'all' : 'unreconciled')} />
          <Chip label="Reconciled" selected={reconciliationFilter === 'reconciled'} icon="checkmark-circle-outline" onPress={() => setReconciliationFilter((value) => value === 'reconciled' ? 'all' : 'reconciled')} />
          {filterCategoryType && <Chip label={selectedCategory ? categoryLabel(selectedCategory) : 'Category'} selected={Boolean(categoryId)} icon="pricetag-outline" onPress={() => setCategoryOpen((value) => !value)} />}
        </ScrollView>
        {categoryOpen && filterCategoryType && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Chip label="All categories" selected={!categoryId} onPress={() => setCategoryId(null)} />
          {categoryOptions.map((item) => <Chip key={item.id} label={categoryLabel(item)} selected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />)}
        </ScrollView>}
      </View>
      {unreconciledMatching.length > 0 && <View style={styles.reconciliationActions}><Button label={`Reconcile ${unreconciledMatching.length} matching for ${account.name}`} variant="secondary" icon="checkmark-done-outline" onPress={() => setReconcileOpen(true)} /></View>}
      <Surface style={styles.list}>
        {desktop && activity.length > 0 && <View style={styles.tableHeader}><AppText variant="eyebrow" style={styles.typeHeader}>TYPE</AppText><AppText variant="eyebrow" style={styles.accountHeader}>ACCOUNT</AppText><AppText variant="eyebrow" style={styles.receiverHeader}>COUNTERPARTY / DESTINATION</AppText><AppText variant="eyebrow" style={styles.categoryHeader}>CATEGORY</AppText><AppText variant="eyebrow" style={styles.notesHeader}>NOTES</AppText><AppText variant="eyebrow" style={styles.creatorHeader}>ADDED BY</AppText><AppText variant="eyebrow" style={styles.amountHeader}>AMOUNT</AppText><AppText variant="eyebrow" style={styles.statusHeader}>✓</AppText></View>}
        {activity.length ? desktop ? transactionGroups.map((group) => <View key={group.key}><TransactionDateHeader transactionDate={group.transactionDate} />{group.items.map((item, index) => <View key={item.id}>{index > 0 && <View style={[styles.separator, styles.desktopSeparator]} />}<TransactionRow transaction={item} desktop accountContextId={account.id} reconciliationAccountId={account.id} onPress={() => router.push(`/transaction/${item.id}`)} onToggleReconciled={() => void toggleReconciled(item.id)} reconciliationBusy={reconcilingId === item.id} /></View>)}</View>) : visibleActivity.map((item, index) => <View key={item.id}>{index > 0 && <View style={[styles.separator, new Date(item.transactionDate).toDateString() !== new Date(visibleActivity[index - 1]?.transactionDate ?? item.transactionDate).toDateString() && styles.dateSeparator]} />}<TransactionRow transaction={item} compact accountContextId={account.id} reconciliationAccountId={account.id} onPress={() => router.push(`/transaction/${item.id}`)} onToggleReconciled={() => void toggleReconciled(item.id)} reconciliationBusy={reconcilingId === item.id} /></View>) : <EmptyState icon={allActivity.length && reconciliationFilter === 'unreconciled' ? 'checkmark-circle-outline' : allActivity.length ? 'search-outline' : 'receipt-outline'} title={allActivity.length && reconciliationFilter === 'unreconciled' ? 'Account reconciled' : allActivity.length ? 'No matching transactions' : 'No activity yet'} body={allActivity.length && reconciliationFilter === 'unreconciled' ? `Every matching ${account.name} transaction is reconciled.` : allActivity.length ? 'Try another filter or search.' : 'Transactions linked to this account will appear here.'} action={!allActivity.length && desktop && account.isActive ? <Button label="Add first transaction" icon="add" onPress={addTransaction} /> : undefined} />}
      </Surface>
      {visibleActivity.length < activity.length && <Button label={`Show more (${activity.length - visibleActivity.length} remaining)`} variant="secondary" onPress={() => setVisibleCount((count) => count + 50)} />}
    </View>
    {error && <AppText variant="caption" style={styles.error}>{error}</AppText>}
    {account.isActive ? <Button label="Remove account" variant="danger" icon="archive-outline" onPress={() => setRemoveOpen(true)} /> : <Button label="Restore account" icon="refresh-outline" loading={restoring} onPress={restore} />}
    <AppText variant="caption" style={styles.help}>{account.isActive ? 'Removing is reversible and never deletes transaction history.' : 'Restoring makes this account available for new transactions again.'}</AppText>
    <ConfirmActionDialog visible={removeOpen} title={`Remove ${account.name}?`} message="It will disappear from new transaction options, but every past transaction and report will stay intact. You can restore it later." confirmLabel="Remove account" onClose={() => setRemoveOpen(false)} onConfirm={async () => { await setAccountActive(account.id, false); router.back(); }} />
    <ConfirmActionDialog visible={reconcileOpen} title={`Reconcile ${unreconciledMatching.length} transactions?`} message={`This marks only the ${account.name} side of every matching transaction as reconciled. The other side of transfers remains independent.`} confirmLabel="Mark reconciled" confirmVariant="primary" onClose={() => setReconcileOpen(false)} onConfirm={async () => { await setTransactionsReconciled(unreconciledMatching.map((item) => item.id), true, account.id); }} />
    <ConfirmActionDialog visible={Boolean(unreconcileTransactionId)} title="Undo reconciliation?" message={`This transaction was already confirmed for ${account.name}. Marking it unreconciled means it needs to be checked against the bank account again.`} confirmLabel="Mark unreconciled" onClose={() => setUnreconcileTransactionId(null)} onConfirm={async () => { if (!unreconcileTransactionId) return; await setTransactionsReconciled([unreconcileTransactionId], false, account.id); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  missing: { flex: 1, justifyContent: 'center', backgroundColor: colors.softWhite },
  summary: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  desktopSummary: { flexDirection: 'row', alignItems: 'center', padding: spacing.xxl, gap: spacing.xl },
  desktopContent: { maxWidth: 1240 },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  desktopIcon: { marginBottom: 0 },
  balanceCopy: { flex: 1, gap: spacing.xs },
  lastReconciled: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  fullyReconciledText: { color: colors.mintDeep },
  activitySummary: { minWidth: 180, paddingLeft: spacing.xxl, borderLeftWidth: 1, borderLeftColor: colors.border, gap: spacing.xs },
  muted: { color: colors.slate },
  section: { gap: spacing.md },
  search: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  searchInput: { flex: 1, minHeight: 48, fontFamily: typography.regular, fontSize: 15, color: colors.ink },
  filters: { gap: spacing.md, marginHorizontal: -spacing.xl },
  filterRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
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
  reconciliationActions: { alignItems: 'flex-end' },
  help: { color: colors.slate, textAlign: 'center' },
  error: { color: colors.danger },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
});
