import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppText, Button, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, spacing } from '@/theme';
import type { Account } from '@/types/finance';

export default function AccountsScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { accounts, transactions } = useFinance();
  const activeAccounts = accounts.filter((item) => item.isActive);
  const assets = activeAccounts.filter((item) => item.type !== 'credit_card');
  const liabilities = activeAccounts.filter((item) => item.type === 'credit_card');
  const removed = accounts.filter((item) => !item.isActive);
  return (
    <Screen title="Accounts" subtitle="What you have, and what you owe" right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
      <Surface style={styles.netCard}><AppText variant="eyebrow" style={styles.netLabel}>NET ACROSS ACTIVE ACCOUNTS</AppText><AppText variant="display">{formatPeso(activeAccounts.reduce((sum, item) => sum + item.balance, 0))}</AppText><AppText style={styles.muted}>Updated from your latest transactions</AppText></Surface>
      <AccountGroup title="Your money" accounts={assets} transactions={transactions} desktop={desktop} />
      {liabilities.length > 0 && <AccountGroup title="Credit cards" accounts={liabilities} transactions={transactions} desktop={desktop} />}
      {removed.length > 0 && <AccountGroup title="Removed accounts" accounts={removed} transactions={transactions} desktop={desktop} />}
      <Button label="Add an account" icon="add" onPress={() => router.push('/add-account')} />
    </Screen>
  );
}

function AccountGroup({ title, accounts, transactions, desktop }: { title: string; accounts: Account[]; transactions: ReturnType<typeof useFinance>['transactions']; desktop: boolean }) {
  const institutions = groupAccountsByInstitution(accounts);
  return (
    <View style={styles.group}>
      <SectionHeader title={title} />
      {institutions.map(({ name, accounts: institutionAccounts }) => (
        <View key={name} style={styles.institutionGroup}>
          <AppText variant="eyebrow" style={styles.institutionLabel}>{name}</AppText>
          <View style={[styles.cards, desktop && styles.desktopCards]}>{institutionAccounts.map((account) => <AccountCard key={account.id} account={account} transactions={transactions} desktop={desktop} />)}</View>
        </View>
      ))}
    </View>
  );
}

function groupAccountsByInstitution(accounts: Account[]) {
  const grouped = new Map<string, { name: string; accounts: Account[] }>();
  for (const account of accounts) {
    const name = account.institution?.trim() || 'Other accounts';
    const key = name.toLocaleLowerCase();
    const group = grouped.get(key);
    if (group) group.accounts.push(account);
    else grouped.set(key, { name, accounts: [account] });
  }
  return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function AccountCard({ account, transactions, desktop }: { account: Account; transactions: ReturnType<typeof useFinance>['transactions']; desktop: boolean }) {
  const recent = transactions.find((item) => item.accountFromId === account.id || item.accountToId === account.id);
  return (
    <Pressable onPress={() => router.push(`/account/${account.id}`)} style={desktop && styles.desktopCardWrap}>
      <Surface style={[styles.card, !account.isActive ? styles.archived : {}]}>
        <View style={styles.accountTop}>
          <View style={[styles.institution, { backgroundColor: `${account.accent}18` }]}><Ionicons name={account.type === 'credit_card' ? 'card-outline' : account.type === 'cash' ? 'cash-outline' : account.type === 'ewallet' ? 'phone-portrait-outline' : 'business-outline'} size={22} color={account.accent} /></View>
          <View style={styles.accountCopy}><AppText variant="bodyMedium">{account.name}</AppText><AppText variant="caption" style={styles.muted}>{account.isActive ? `${account.type === 'credit_card' ? 'Credit card · liability' : account.type.replace('_', ' ')} · ${account.ownerUserId ? 'Private' : 'Shared'}` : 'Removed · history preserved'}</AppText></View>
          <View style={styles.balance}><AppText variant="h3" style={account.type === 'credit_card' ? styles.owed : undefined}>{account.type === 'credit_card' ? formatPeso(Math.abs(account.balance)) : formatPeso(account.balance)}</AppText><Ionicons name="chevron-forward" size={16} color={colors.slate} /></View>
        </View>
        {recent && <View style={styles.activity}><AppText variant="caption" style={styles.muted}>Latest activity</AppText><AppText variant="caption">{recent.merchant ?? recent.type.replaceAll('_', ' ')} · {formatPeso(recent.amount)}</AppText></View>}
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  netCard: { padding: spacing.xl, backgroundColor: colors.mintWash, borderColor: colors.mintMist, gap: spacing.xs },
  netLabel: { color: colors.mintDeep },
  muted: { color: colors.slate },
  group: { gap: spacing.md },
  institutionGroup: { gap: spacing.sm },
  institutionLabel: { color: colors.slate, marginLeft: spacing.xs },
  cards: { gap: spacing.md },
  desktopCards: { flexDirection: 'row', flexWrap: 'wrap' },
  desktopCardWrap: { width: '49%' },
  card: { padding: spacing.lg, gap: spacing.lg },
  accountTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  institution: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, gap: 2 },
  balance: { alignItems: 'flex-end' },
  owed: { color: colors.slateDark },
  activity: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between' },
  archived: { opacity: 0.65 },
});
