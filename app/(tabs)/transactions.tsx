import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SpaceSelector } from '@/components/SpaceSelector';
import { TransactionRow } from '@/components/TransactionRow';
import { AppText, Button, Chip, EmptyState, IconCircle, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import type { TransactionType } from '@/types/finance';

type Picker = 'account' | 'category' | null;

const typeFilters: { value: TransactionType | null; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: null, label: 'All', icon: 'list-outline' },
  { value: 'expense', label: 'Expense', icon: 'arrow-up-outline' },
  { value: 'income', label: 'Income', icon: 'arrow-down-outline' },
  { value: 'transfer', label: 'Internal Transfer', icon: 'swap-horizontal-outline' },
  { value: 'credit_card_payment', label: 'Card Payment', icon: 'card-outline' },
  { value: 'refund', label: 'Refund', icon: 'return-down-back-outline' },
];

export default function TransactionsScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { transactions, accounts, categories, selectedSpaceId } = useFinance();
  const [query, setQuery] = useState('');
  const [thisMonth, setThisMonth] = useState(false);
  const [forVerificationOnly, setForVerificationOnly] = useState(false);
  const [type, setType] = useState<TransactionType | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);

  const filtered = useMemo(() => transactions.filter((item) => {
    const date = new Date(item.transactionDate);
    const now = new Date();
    if (selectedSpaceId && item.spaceId !== selectedSpaceId) return false;
    if (forVerificationOnly && !item.classificationReviewRequired) return false;
    if (thisMonth && (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false;
    if (type && item.type !== type) return false;
    if (accountId && item.accountFromId !== accountId && item.accountToId !== accountId) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (query) {
      const category = categories.find((candidate) => candidate.id === item.categoryId)?.name ?? '';
      if (!`${item.counterpartyName ?? ''} ${item.merchant ?? ''} ${category} ${item.notes ?? ''} ${item.originalMessage ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()), [accountId, categories, categoryId, forVerificationOnly, query, selectedSpaceId, thisMonth, transactions, type]);

  const verificationCount = transactions.filter((item) => item.classificationReviewRequired && (!selectedSpaceId || item.spaceId === selectedSpaceId)).length;

  const selectedAccount = accounts.find((item) => item.id === accountId)?.name;
  const selectedCategory = categories.find((item) => item.id === categoryId)?.name;
  const filterCategoryType = type === 'income' ? 'income' : type === 'expense' || type === 'refund' ? 'expense' : null;
  return (
    <Screen title="Transactions" subtitle={`${filtered.length} entries · everything in one place`} contentStyle={desktop ? styles.wideContent : undefined} right={desktop ? <Button label="Add transaction" icon="add" onPress={() => router.push('/manual-transaction')} /> : <Pressable onPress={() => router.push('/manual-transaction')}><IconCircle name="add" background={colors.mint} /></Pressable>}>
      <SpaceSelector />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilterScroll} contentContainerStyle={styles.typeFilterRow}>
        {typeFilters.map((option) => <Chip key={option.value ?? 'all'} label={option.label} icon={option.icon} selected={type === option.value && !forVerificationOnly} onPress={() => { setType(option.value); setCategoryId(null); setForVerificationOnly(false); setPicker(null); }} />)}
      </ScrollView>
      <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.slate} /><TextInput value={query} onChangeText={setQuery} placeholder="Search merchant, payer, notes, or message" placeholderTextColor={colors.slate} style={styles.input} />{query.length > 0 && <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.slate} /></Pressable>}</View>

      <View style={[styles.filters, desktop && styles.desktopFilters]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Chip label={thisMonth ? 'This month' : 'All time'} selected={thisMonth} icon="calendar-outline" onPress={() => setThisMonth((value) => !value)} />
          <Chip label={`For verification (${verificationCount})`} selected={forVerificationOnly} icon="help-circle-outline" onPress={() => { if (!forVerificationOnly) { setThisMonth(false); setType(null); setCategoryId(null); } setForVerificationOnly(!forVerificationOnly); setPicker(null); }} />
          <Chip label={selectedAccount ?? 'Account'} selected={Boolean(accountId)} icon="wallet-outline" onPress={() => setPicker(picker === 'account' ? null : 'account')} />
          <Chip label={selectedCategory ?? (filterCategoryType ? 'Category' : 'Choose type first')} selected={Boolean(categoryId)} icon="pricetag-outline" onPress={() => { if (filterCategoryType) setPicker(picker === 'category' ? null : 'category'); }} />
        </ScrollView>
        {picker && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
          <Chip label="All" selected={(picker === 'account' && !accountId) || (picker === 'category' && !categoryId)} onPress={() => { if (picker === 'account') setAccountId(null); if (picker === 'category') setCategoryId(null); }} />
          {picker === 'account' && accounts.map((item) => <Chip key={item.id} label={item.name} selected={accountId === item.id} onPress={() => setAccountId(item.id)} />)}
          {picker === 'category' && filterCategoryType && categories.filter((item) => item.type === filterCategoryType && item.spaceId === selectedSpaceId && !item.isArchived).map((item) => <Chip key={item.id} label={item.name} selected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />)}
        </ScrollView>}
      </View>

      {filtered.length ? <Surface style={styles.list}>{desktop && <View style={styles.tableHeader}><AppText variant="eyebrow" style={styles.typeHeader}>TYPE</AppText><AppText variant="eyebrow" style={styles.accountHeader}>ACCOUNT</AppText><AppText variant="eyebrow" style={styles.receiverHeader}>COUNTERPARTY / DESTINATION</AppText><AppText variant="eyebrow" style={styles.categoryHeader}>CATEGORY</AppText><AppText variant="eyebrow" style={styles.notesHeader}>NOTES</AppText><AppText variant="eyebrow" style={styles.dateHeader}>DATE</AppText><AppText variant="eyebrow" style={styles.amountHeader}>AMOUNT</AppText></View>}{filtered.map((item, index) => <View key={item.id}>{index > 0 && <View style={[styles.separator, desktop && styles.desktopSeparator]} />}<TransactionRow transaction={item} desktop={desktop} onPress={() => router.push(`/transaction/${item.id}`)} /></View>)}</Surface> : <Surface><EmptyState icon={forVerificationOnly ? 'checkmark-circle-outline' : 'receipt-outline'} title={forVerificationOnly ? 'All caught up' : 'Nothing here yet'} body={forVerificationOnly ? 'No transactions need verification in this view.' : 'Try another filter, or tell MoneyYap about a transaction.'} /></Surface>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wideContent: { maxWidth: 1240 },
  typeFilterScroll: { flexGrow: 0, marginHorizontal: -spacing.xl },
  typeFilterRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.sm },
  search: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  input: { flex: 1, minHeight: 48, fontFamily: typography.regular, fontSize: 15, color: colors.ink },
  filters: { gap: spacing.md, marginHorizontal: -spacing.xl },
  desktopFilters: { marginHorizontal: -spacing.xl },
  filterRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  optionRow: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 56 },
  desktopSeparator: { marginLeft: 0 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border },
  typeHeader: { width: 52, textAlign: 'center', color: colors.slate },
  accountHeader: { flex: 0.9, minWidth: 100, color: colors.slate },
  receiverHeader: { flex: 1.1, minWidth: 120, color: colors.slate },
  categoryHeader: { width: '14%', minWidth: 100, color: colors.slate },
  notesHeader: { width: '15%', minWidth: 110, color: colors.slate },
  dateHeader: { width: 100, color: colors.slate },
  amountHeader: { minWidth: 92, textAlign: 'right', color: colors.slate },
});
