import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AccountVisualCard, ProviderMark } from '@/components/AccountVisualCard';
import { AppText, Button, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { accountReconciliationSummary } from '@/lib/reconciliation';
import { amountColor, colors, formatPeso, spacing } from '@/theme';
import type { Account } from '@/types/finance';

export default function AccountsScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { accounts, transactions } = useFinance();
  const activeAccounts = accounts.filter((item) => item.isActive);
  const assets = activeAccounts.filter((item) => item.type !== 'credit_card');
  const liabilities = activeAccounts.filter((item) => item.type === 'credit_card');
  const removed = accounts.filter((item) => !item.isActive);
  const netBalance = activeAccounts.reduce((sum, item) => sum + item.balance, 0);
  return (
    <Screen title="Accounts" subtitle="What you have, and what you owe" right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
      <Surface style={styles.netCard}><AppText variant="eyebrow" style={styles.netLabel}>NET ACROSS ACTIVE ACCOUNTS</AppText><AppText variant="display" style={{ color: amountColor(netBalance) }}>{formatPeso(netBalance)}</AppText><AppText style={styles.muted}>Updated from your latest transactions</AppText></Surface>
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
          <View style={styles.institutionHeading}>{institutionAccounts[0] && <ProviderMark account={institutionAccounts[0]} compact />}<AppText variant="eyebrow" style={styles.institutionLabel}>{name}</AppText></View>
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
  const reconciliation = accountReconciliationSummary(transactions, account.id);
  const lastReconciled = reconciliation.lastReconciledAt
    ? new Date(reconciliation.lastReconciledAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  return (
    <Pressable onPress={() => router.push(`/account/${account.id}`)} style={({ pressed }) => [styles.cardWrap, desktop && styles.desktopCardWrap, pressed && styles.pressed]}>
      <AccountVisualCard account={account} />
      <View style={styles.cardMeta}>
        <View style={styles.metaTop}><View style={styles.accountIdentity}><AppText variant="bodyMedium" numberOfLines={1}>{account.name}</AppText><AppText variant="caption" style={styles.muted}>{account.isActive ? (account.ownerUserId ? 'Private account' : 'Shared account') : 'Removed · history preserved'}</AppText></View><Ionicons name="chevron-forward" size={17} color={colors.slate} /></View>
        {account.isActive && reconciliation.transactionCount > 0 && <View style={styles.reconciliationStatus}><Ionicons name={reconciliation.fullyReconciled ? 'checkmark-circle' : 'time-outline'} size={13} color={reconciliation.fullyReconciled ? colors.mintDeep : colors.slate} /><AppText variant="caption" numberOfLines={1} style={reconciliation.fullyReconciled ? styles.reconciledText : styles.muted}>{reconciliation.fullyReconciled ? 'Fully reconciled' : `Last reconciled ${lastReconciled ?? 'never'}`}</AppText></View>}
        {recent && <View style={styles.activity}><AppText variant="caption" style={styles.muted}>Latest</AppText><AppText variant="caption" numberOfLines={1} style={styles.latest}>{recent.merchant ?? recent.type.replaceAll('_', ' ')} · <AppText variant="caption" style={{ color: recent.financialEffect === 'income' ? colors.income : recent.financialEffect === 'expense' ? colors.expense : colors.neutralAmount }}>{formatPeso(recent.amount)}</AppText></AppText></View>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  netCard: { padding: spacing.xl, backgroundColor: colors.mintWash, borderColor: colors.mintMist, gap: spacing.xs },
  netLabel: { color: colors.mintDeep },
  muted: { color: colors.slate },
  group: { gap: spacing.md },
  institutionGroup: { gap: spacing.sm },
  institutionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: spacing.xs },
  institutionLabel: { color: colors.slate },
  cards: { gap: spacing.md },
  desktopCards: { flexDirection: 'row', flexWrap: 'wrap' },
  cardWrap: { borderRadius: 24, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  desktopCardWrap: { width: '48.8%' },
  pressed: { opacity: 0.86, transform: [{ scale: 0.992 }] },
  cardMeta: { padding: spacing.md, gap: spacing.sm },
  metaTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountIdentity: { flex: 1, minWidth: 0 },
  reconciliationStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  reconciledText: { color: colors.mintDeep },
  activity: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  latest: { flex: 1, textAlign: 'right' },
});
