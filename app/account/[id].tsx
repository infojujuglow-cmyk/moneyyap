import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TransactionRow } from '@/components/TransactionRow';
import { AppText, Button, EmptyState, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, spacing } from '@/theme';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { accounts, transactions, spaces, setAccountActive } = useFinance();
  const account = accounts.find((item) => item.id === id);
  if (!account) return <View style={styles.missing}><EmptyState icon="wallet-outline" title="Account not found" body="This account is no longer available." action={<Button label="Go back" onPress={() => router.back()} />} /></View>;
  const allActivity = transactions
    .filter((item) => item.accountFromId === account.id || item.accountToId === account.id)
    .sort((left, right) => new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime());
  const activity = desktop ? allActivity : allActivity.slice(0, 8);
  const space = spaces.find((item) => item.id === account.spaceId);
  const addTransaction = () => router.push({ pathname: '/manual-transaction', params: { accountId: account.id, ...(account.spaceId ? { spaceId: account.spaceId } : {}) } });
  const remove = () => Alert.alert(
    `Remove ${account.name}?`,
    'It will disappear from new transaction options, but every past transaction and report will stay intact. You can restore it later.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove account', style: 'destructive', onPress: async () => { await setAccountActive(account.id, false); router.back(); } }],
  );
  return <Screen title={account.name} subtitle={account.isActive ? `${desktop ? `${account.institution ?? 'Account'} · ` : ''}${account.ownerUserId ? 'Private · only you' : 'Shared with workspace'}` : 'Removed · history preserved'} contentStyle={desktop ? styles.desktopContent : undefined} right={<View style={styles.headerActions}>{account.isActive && desktop && <Button label="Add transaction" icon="add" onPress={addTransaction} />}<Pressable onPress={() => router.push({ pathname: '/add-account', params: { edit: account.id } })}><IconCircle name="pencil-outline" /></Pressable>{!desktop && <Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}</View>}>
    <Surface style={[styles.summary, desktop && styles.desktopSummary]}><View style={[styles.icon, desktop && styles.desktopIcon, { backgroundColor: `${account.accent}18` }]}><Ionicons name={account.type === 'credit_card' ? 'card-outline' : desktop && account.type === 'cash' ? 'cash-outline' : desktop && account.type === 'ewallet' ? 'phone-portrait-outline' : 'business-outline'} size={26} color={account.accent} /></View><View style={desktop && styles.balanceCopy}><AppText variant="eyebrow" style={styles.muted}>CURRENT BALANCE</AppText><AppText variant="display">{formatPeso(account.type === 'credit_card' ? Math.abs(account.balance) : account.balance)}</AppText><AppText style={styles.muted}>{space ? `${space.name} Space` : 'Available in any Space'} · {account.type.replace('_', ' ')}</AppText></View>{desktop && <View style={styles.activitySummary}><AppText variant="eyebrow" style={styles.muted}>TRANSACTIONS</AppText><AppText variant="h2">{allActivity.length}</AppText><AppText variant="caption" style={styles.muted}>All recorded activity</AppText></View>}</Surface>
    <View style={styles.section}><SectionHeader title={desktop ? 'Account transactions' : 'Recent activity'} />
      <Surface style={styles.list}>
        {desktop && activity.length > 0 && <View style={styles.tableHeader}><AppText variant="eyebrow" style={styles.typeHeader}>TYPE</AppText><AppText variant="eyebrow" style={styles.accountHeader}>ACCOUNT</AppText><AppText variant="eyebrow" style={styles.receiverHeader}>COUNTERPARTY / DESTINATION</AppText><AppText variant="eyebrow" style={styles.categoryHeader}>CATEGORY</AppText><AppText variant="eyebrow" style={styles.notesHeader}>NOTES</AppText><AppText variant="eyebrow" style={styles.dateHeader}>DATE</AppText><AppText variant="eyebrow" style={styles.amountHeader}>AMOUNT</AppText></View>}
        {activity.length ? activity.map((item, index) => <View key={item.id}>{index > 0 && <View style={[styles.separator, desktop && styles.desktopSeparator]} />}<TransactionRow transaction={item} compact={!desktop} desktop={desktop} accountContextId={account.id} onPress={() => router.push(`/transaction/${item.id}`)} /></View>) : <EmptyState icon="receipt-outline" title="No activity yet" body="Transactions linked to this account will appear here." action={desktop && account.isActive ? <Button label="Add first transaction" icon="add" onPress={addTransaction} /> : undefined} />}
      </Surface>
    </View>
    {account.isActive ? <Button label="Remove account" variant="danger" icon="archive-outline" onPress={remove} /> : <Button label="Restore account" icon="refresh-outline" onPress={async () => { await setAccountActive(account.id, true); router.back(); }} />}
    <AppText variant="caption" style={styles.help}>{account.isActive ? 'Removing is reversible and never deletes transaction history.' : 'Restoring makes this account available for new transactions again.'}</AppText>
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
  activitySummary: { minWidth: 180, paddingLeft: spacing.xxl, borderLeftWidth: 1, borderLeftColor: colors.border, gap: spacing.xs },
  muted: { color: colors.slate },
  section: { gap: spacing.md },
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
  help: { color: colors.slate, textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
});
