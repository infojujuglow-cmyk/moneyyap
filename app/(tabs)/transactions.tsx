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

type Picker = 'type' | 'account' | 'category' | null;

export default function TransactionsScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { transactions, accounts, categories, selectedSpaceId } = useFinance();
  const [query, setQuery] = useState('');
  const [thisMonth, setThisMonth] = useState(true);
  const [type, setType] = useState<TransactionType | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker>(null);

  const filtered = useMemo(() => transactions.filter((item) => {
    const date = new Date(item.transactionDate);
    const now = new Date();
    if (selectedSpaceId && item.spaceId !== selectedSpaceId) return false;
    if (thisMonth && (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear())) return false;
    if (type && item.type !== type) return false;
    if (accountId && item.accountFromId !== accountId && item.accountToId !== accountId) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (query) {
      const category = categories.find((candidate) => candidate.id === item.categoryId)?.name ?? '';
      if (!`${item.merchant ?? ''} ${category} ${item.originalMessage ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()), [accountId, categories, categoryId, query, selectedSpaceId, thisMonth, transactions, type]);

  const selectedAccount = accounts.find((item) => item.id === accountId)?.name;
  const selectedCategory = categories.find((item) => item.id === categoryId)?.name;
  const filterCategoryType = type === 'income' ? 'income' : type === 'expense' || type === 'refund' ? 'expense' : null;
  return (
    <Screen title="Transactions" subtitle={`${filtered.length} entries · everything in one place`} contentStyle={desktop ? styles.wideContent : undefined} right={desktop ? <Button label="Add transaction" icon="add" onPress={() => router.push('/manual-transaction')} /> : <Pressable onPress={() => router.push('/manual-transaction')}><IconCircle name="add" background={colors.mint} /></Pressable>}>
      <SpaceSelector />
      <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.slate} /><TextInput value={query} onChangeText={setQuery} placeholder="Search merchant or message" placeholderTextColor={colors.slate} style={styles.input} />{query.length > 0 && <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={19} color={colors.slate} /></Pressable>}</View>

      <View style={[styles.filters, desktop && styles.desktopFilters]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Chip label={thisMonth ? 'This month' : 'All time'} selected={thisMonth} icon="calendar-outline" onPress={() => setThisMonth((value) => !value)} />
          <Chip label={type ? type.replaceAll('_', ' ') : 'Type'} selected={Boolean(type)} icon="swap-vertical-outline" onPress={() => setPicker(picker === 'type' ? null : 'type')} />
          <Chip label={selectedAccount ?? 'Account'} selected={Boolean(accountId)} icon="wallet-outline" onPress={() => setPicker(picker === 'account' ? null : 'account')} />
          <Chip label={selectedCategory ?? (filterCategoryType ? 'Category' : 'Choose type first')} selected={Boolean(categoryId)} icon="pricetag-outline" onPress={() => setPicker(filterCategoryType ? picker === 'category' ? null : 'category' : 'type')} />
        </ScrollView>
        {picker && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
          <Chip label="All" selected={(picker === 'type' && !type) || (picker === 'account' && !accountId) || (picker === 'category' && !categoryId)} onPress={() => { if (picker === 'type') { setType(null); setCategoryId(null); } if (picker === 'account') setAccountId(null); if (picker === 'category') setCategoryId(null); }} />
          {picker === 'type' && ([['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Internal transfers'], ['credit_card_payment', 'Card payments'], ['refund', 'Refunds']] as [TransactionType, string][]).map(([value, label]) => <Chip key={value} label={label} selected={type === value} onPress={() => { setType(value); setCategoryId(null); }} />)}
          {picker === 'account' && accounts.map((item) => <Chip key={item.id} label={item.name} selected={accountId === item.id} onPress={() => setAccountId(item.id)} />)}
          {picker === 'category' && filterCategoryType && categories.filter((item) => item.type === filterCategoryType && item.spaceId === selectedSpaceId && !item.isArchived).map((item) => <Chip key={item.id} label={item.name} selected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />)}
        </ScrollView>}
      </View>

      {filtered.length ? <Surface style={styles.list}>{desktop && <View style={styles.tableHeader}><View style={styles.titleHeader}><AppText variant="eyebrow" style={styles.headerText}>TRANSACTION</AppText></View><AppText variant="eyebrow" style={styles.detailHeader}>CATEGORY</AppText><AppText variant="eyebrow" style={styles.detailHeader}>ACCOUNT</AppText><AppText variant="eyebrow" style={styles.detailHeader}>SPACE</AppText><AppText variant="eyebrow" style={styles.dateHeader}>DATE</AppText><AppText variant="eyebrow" style={styles.amountHeader}>AMOUNT</AppText></View>}{filtered.map((item, index) => <View key={item.id}>{index > 0 && <View style={[styles.separator, desktop && styles.desktopSeparator]} />}<TransactionRow transaction={item} desktop={desktop} onPress={() => router.push(`/transaction/${item.id}`)} /></View>)}</Surface> : <Surface><EmptyState icon="receipt-outline" title="Nothing here yet" body="Try another filter, or tell MoneyYap about a transaction." /></Surface>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wideContent: { maxWidth: 1240 },
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
  titleHeader: { flex: 1, paddingLeft: 60 },
  detailHeader: { width: '14%', color: colors.slate },
  dateHeader: { width: 105, color: colors.slate },
  amountHeader: { minWidth: 92, textAlign: 'right', color: colors.slate },
  headerText: { color: colors.slate },
});
