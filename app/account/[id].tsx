import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { TransactionRow } from '@/components/TransactionRow';
import { AppText, Button, EmptyState, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, spacing } from '@/theme';

export default function AccountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, transactions, spaces, setAccountActive } = useFinance();
  const account = accounts.find((item) => item.id === id);
  if (!account) return <View style={styles.missing}><EmptyState icon="wallet-outline" title="Account not found" body="This account is no longer available." action={<Button label="Go back" onPress={() => router.back()} />} /></View>;
  const activity = transactions.filter((item) => item.accountFromId === account.id || item.accountToId === account.id).slice(0, 8);
  const space = spaces.find((item) => item.id === account.spaceId);
  const remove = () => Alert.alert(
    `Remove ${account.name}?`,
    'It will disappear from new transaction options, but every past transaction and report will stay intact. You can restore it later.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove account', style: 'destructive', onPress: async () => { await setAccountActive(account.id, false); router.back(); } }],
  );
  return <Screen title={account.name} subtitle={account.isActive ? 'Active account' : 'Removed · history preserved'} right={<View style={styles.headerActions}><Pressable onPress={() => router.push({ pathname: '/add-account', params: { edit: account.id } })}><IconCircle name="pencil-outline" /></Pressable><Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable></View>}>
    <Surface style={styles.summary}><View style={[styles.icon, { backgroundColor: `${account.accent}18` }]}><Ionicons name={account.type === 'credit_card' ? 'card-outline' : 'business-outline'} size={26} color={account.accent} /></View><AppText variant="eyebrow" style={styles.muted}>CURRENT BALANCE</AppText><AppText variant="display">{formatPeso(account.type === 'credit_card' ? Math.abs(account.balance) : account.balance)}</AppText><AppText style={styles.muted}>{space ? `${space.name} Space` : 'Available in any Space'} · {account.institution ?? account.type.replace('_', ' ')}</AppText></Surface>
    <View style={styles.section}><SectionHeader title="Recent activity" /><Surface style={styles.list}>{activity.length ? activity.map((item, index) => <View key={item.id}>{index > 0 && <View style={styles.separator} />}<TransactionRow transaction={item} compact onPress={() => router.push(`/transaction/${item.id}`)} /></View>) : <EmptyState icon="receipt-outline" title="No activity yet" body="Transactions linked to this account will appear here." />}</Surface></View>
    {account.isActive ? <Button label="Remove account" variant="danger" icon="archive-outline" onPress={remove} /> : <Button label="Restore account" icon="refresh-outline" onPress={async () => { await setAccountActive(account.id, true); router.back(); }} />}
    <AppText variant="caption" style={styles.help}>{account.isActive ? 'Removing is reversible and never deletes transaction history.' : 'Restoring makes this account available for new transactions again.'}</AppText>
  </Screen>;
}

const styles = StyleSheet.create({
  missing: { flex: 1, justifyContent: 'center', backgroundColor: colors.softWhite },
  summary: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  muted: { color: colors.slate },
  section: { gap: spacing.md },
  list: { paddingHorizontal: spacing.lg },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 56 },
  help: { color: colors.slate, textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
});
