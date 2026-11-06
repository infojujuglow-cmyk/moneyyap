import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { providerForAccount, visualTypeLabel } from '@/lib/account-branding';
import { colors, formatPeso, radii, spacing, typography } from '@/theme';
import type { Account } from '@/types/finance';
import { AppText } from './ui';

const mask = (last4: string | null) => last4 ? `••••  ••••  ••••  ${last4}` : '••••  ••••  ••••';

export function ProviderMark({ account, compact = false }: { account: Pick<Account, 'providerKey' | 'institution' | 'name'>; compact?: boolean }) {
  const provider = providerForAccount(account);
  return (
    <View style={[styles.providerMark, compact && styles.providerMarkCompact, { backgroundColor: provider.foreground }]}>
      <AppText style={[styles.providerMarkText, compact && styles.providerMarkTextCompact, { color: provider.colors[0] }]}>{provider.mark}</AppText>
    </View>
  );
}

export function AccountVisualCard({ account }: { account: Account }) {
  const provider = providerForAccount(account);
  const outstanding = Math.abs(Math.min(0, account.balance));
  const availableCredit = account.creditLimit == null ? null : Math.max(0, account.creditLimit - outstanding);
  const isCredit = account.visualType === 'credit_card';
  const isChecking = account.visualType === 'checking';
  const isCash = account.visualType === 'cash';
  const isWallet = account.visualType === 'ewallet';
  const gradients = isCash ? ['#72512D', '#3D2A19', '#17120D'] as const
    : isChecking ? ['#F8F0DF', '#E8D8B8', '#D4BD91'] as const
    : provider.colors;
  const foreground = isChecking ? '#2D2A25' : provider.foreground;
  return (
    <LinearGradient colors={gradients} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, !account.isActive && styles.archived]}>
      <View style={styles.glowOne} /><View style={styles.glowTwo} />
      {isChecking && <View style={styles.checkLines}>{[0, 1, 2].map((line) => <View key={line} style={styles.checkLine} />)}</View>}
      <View style={styles.topRow}>
        <ProviderMark account={account} />
        <View style={styles.typePill}><Ionicons name={isCash ? 'wallet-outline' : isWallet ? 'phone-portrait-outline' : isChecking ? 'document-text-outline' : isCredit ? 'card-outline' : 'business-outline'} size={13} color={foreground} /><AppText variant="caption" style={[styles.typeText, { color: foreground }]}>{visualTypeLabel[account.visualType]}</AppText></View>
      </View>
      <View style={styles.middle}>
        {(account.visualType === 'debit' || isCredit) && <EmvChip />}
        {isWallet && <View style={styles.walletSignal}><Ionicons name="wifi" size={23} color={foreground} /></View>}
        {isCash && <View style={styles.cashIcon}><Ionicons name="cash-outline" size={28} color={foreground} /></View>}
      </View>
      <AppText variant="caption" numberOfLines={1} style={[styles.accountName, { color: foreground }]}>{account.name}</AppText>
      {(account.visualType === 'debit' || isCredit) && <AppText style={[styles.number, { color: foreground }]}>{mask(account.accountLast4)}</AppText>}
      <View style={styles.balanceRow}>
        <View style={styles.balanceBlock}><AppText variant="eyebrow" style={[styles.balanceLabel, { color: foreground }]}>{isCredit ? 'OUTSTANDING' : isChecking ? 'CHECKING BALANCE' : isWallet ? 'WALLET BALANCE' : isCash ? 'CASH BALANCE' : 'AVAILABLE BALANCE'}</AppText><AppText variant="h2" numberOfLines={1} adjustsFontSizeToFit style={[styles.balanceAmount, { color: foreground }]}>{formatPeso(isCredit ? outstanding : account.balance)}</AppText></View>
        {isCredit && account.creditLimit != null && <View style={styles.creditMeta}><AppText variant="caption" style={{ color: foreground }}>Available {formatPeso(availableCredit ?? 0)}</AppText><AppText variant="caption" style={[styles.limit, { color: foreground }]}>Limit {formatPeso(account.creditLimit)}</AppText></View>}
        {!isCredit && account.accountLast4 && account.visualType !== 'debit' && <AppText variant="caption" style={{ color: foreground }}>•••• {account.accountLast4}</AppText>}
      </View>
    </LinearGradient>
  );
}

function EmvChip() {
  return <View style={styles.chip}><View style={styles.chipVertical} /><View style={styles.chipHorizontal} /></View>;
}

const styles = StyleSheet.create({
  card: { minHeight: 218, borderRadius: radii.xl, padding: spacing.xl, overflow: 'hidden', justifyContent: 'space-between' },
  archived: { opacity: 0.6 },
  glowOne: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(255,255,255,0.09)', right: -75, top: -95 },
  glowTwo: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', left: -55, bottom: -92 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 1 },
  providerMark: { minWidth: 52, height: 31, borderRadius: 9, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  providerMarkCompact: { minWidth: 31, width: 31, height: 31, borderRadius: 9, paddingHorizontal: 2 },
  providerMarkText: { fontFamily: typography.bold, fontSize: 13, lineHeight: 17, letterSpacing: -0.3 },
  providerMarkTextCompact: { fontSize: 9, lineHeight: 12 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 27, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.17)' },
  typeText: { fontFamily: typography.semibold },
  middle: { minHeight: 36, justifyContent: 'center', zIndex: 1 },
  chip: { width: 43, height: 32, borderRadius: 7, backgroundColor: '#E8C66B', borderWidth: 1, borderColor: '#AF8A31', overflow: 'hidden' },
  chipVertical: { position: 'absolute', width: 1, top: 0, bottom: 0, left: 20, backgroundColor: '#AF8A31' },
  chipHorizontal: { position: 'absolute', height: 1, left: 0, right: 0, top: 15, backgroundColor: '#AF8A31' },
  walletSignal: { width: 42, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '90deg' }] },
  cashIcon: { width: 48, height: 39, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  accountName: { fontFamily: typography.semibold, opacity: 0.88, zIndex: 1 },
  number: { fontFamily: typography.medium, fontSize: 15, lineHeight: 20, letterSpacing: 1.6, opacity: 0.9, zIndex: 1 },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, zIndex: 1 },
  balanceBlock: { flex: 1, minWidth: 0 },
  balanceLabel: { opacity: 0.7, marginBottom: 2 },
  balanceAmount: { fontFamily: typography.bold, letterSpacing: -0.7 },
  creditMeta: { alignItems: 'flex-end', paddingBottom: 3 },
  limit: { opacity: 0.68 },
  checkLines: { position: 'absolute', left: 20, right: 20, top: 80, gap: 14, opacity: 0.2 },
  checkLine: { height: 1, backgroundColor: '#5C4E38' },
});
