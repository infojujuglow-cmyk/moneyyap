import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, radii, spacing } from '@/theme';
import type { Transaction } from '@/types/finance';
import { AppText, IconCircle } from './ui';

const typeMeta: Record<Transaction['type'], { icon: keyof typeof Ionicons.glyphMap; color: string; background: string; label: string }> = {
  expense: { icon: 'arrow-up-outline', color: colors.expense, background: colors.expenseWash, label: 'Expense' },
  income: { icon: 'arrow-down-outline', color: colors.income, background: colors.incomeWash, label: 'Income' },
  transfer: { icon: 'swap-horizontal-outline', color: colors.blue, background: colors.blueWash, label: 'Internal transfer' },
  credit_card_payment: { icon: 'card-outline', color: colors.blue, background: colors.blueWash, label: 'Card payment' },
  refund: { icon: 'return-down-back-outline', color: colors.mintDeep, background: colors.mintWash, label: 'Refund' },
};

export function TransactionRow({ transaction, onPress, compact = false, desktop = false }: { transaction: Transaction; onPress?: () => void; compact?: boolean; desktop?: boolean }) {
  const { accounts, categories, spaces } = useFinance();
  const category = categories.find((item) => item.id === transaction.categoryId);
  const parent = categories.find((item) => item.id === category?.parentId);
  const space = spaces.find((item) => item.id === transaction.spaceId);
  const sourceAccount = accounts.find((item) => item.id === transaction.accountFromId);
  const destinationAccount = accounts.find((item) => item.id === transaction.accountToId);
  const account = desktop
    ? transaction.type === 'income' || transaction.type === 'refund' ? destinationAccount : sourceAccount ?? destinationAccount
    : accounts.find((item) => item.id === (transaction.accountFromId ?? transaction.accountToId));
  const meta = typeMeta[transaction.type];
  const positive = transaction.financialEffect === 'income';
  const neutral = transaction.financialEffect === 'internal_transfer' || transaction.financialEffect === 'adjustment';
  const title = transaction.counterpartyName ?? transaction.merchant ?? meta.label;
  const detail = `${category ? `${parent ? `${parent.name} › ` : ''}${category.name}` : meta.label}${space ? ` · ${space.name}` : ''}${account ? ` · ${account.name}` : ''}${transaction.paymentRail !== 'unknown' ? ` · via ${transaction.paymentRail.replaceAll('_', ' ')}` : ''}`;
  const receiver = transaction.type === 'transfer' || transaction.type === 'credit_card_payment'
    ? destinationAccount?.name ?? '—'
    : transaction.counterpartyName ?? transaction.merchant ?? '—';
  const categoryName = category ? `${parent ? `${parent.name} › ` : ''}${category.name}` : '—';
  if (desktop) return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${meta.label}: ${title}`} onPress={onPress} style={({ pressed }) => [styles.row, styles.desktopRow, pressed && styles.pressed]}>
      <View style={styles.typeCell}><IconCircle name={meta.icon} color={meta.color} background={meta.background} size={36} /></View>
      <View style={styles.accountCell}><AppText variant="caption" numberOfLines={1}>{account?.name ?? '—'}</AppText>{account?.institution && <AppText variant="caption" style={styles.cellMeta} numberOfLines={1}>{account.institution}</AppText>}</View>
      <View style={styles.receiverCell}><AppText variant="caption" numberOfLines={1}>{receiver}</AppText><AppText variant="caption" style={styles.cellMeta} numberOfLines={1}>{meta.label}</AppText></View>
      <AppText variant="caption" style={styles.categoryCell} numberOfLines={1}>{categoryName}</AppText>
      <AppText variant="caption" style={styles.dateCell}>{new Date(transaction.transactionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</AppText>
      <View style={styles.amountWrap}><AppText variant="bodyMedium" style={{ color: positive ? colors.income : neutral ? colors.slateDark : colors.expense }}>{positive ? '+' : neutral ? '' : '−'}{formatPeso(transaction.amount)}</AppText></View>
    </Pressable>
  );
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, compact && styles.compact, pressed && styles.pressed]}>
      <IconCircle name={(category?.icon as keyof typeof Ionicons.glyphMap) ?? meta.icon} color={category?.color ?? meta.color} background={category ? `${category.color}18` : meta.background} size={44} />
      <View style={styles.copy}>
        <AppText variant="bodyMedium" numberOfLines={1}>{title}</AppText>
        <AppText variant="caption" style={styles.meta} numberOfLines={1}>{detail}</AppText>
      </View>
      <View style={styles.amountWrap}>
        <AppText variant="bodyMedium" style={{ color: positive ? colors.income : neutral ? colors.slateDark : colors.expense }}>
          {positive ? '+' : neutral ? '' : '−'}{formatPeso(transaction.amount)}
        </AppText>
        <AppText variant="caption" style={styles.meta}>{new Date(transaction.transactionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  compact: { minHeight: 64, paddingVertical: spacing.sm },
  desktopRow: { minHeight: 74 },
  copy: { flex: 1, gap: 2 },
  typeCell: { width: 52, alignItems: 'center' },
  accountCell: { flex: 1, minWidth: 110, gap: 2 },
  receiverCell: { flex: 1.2, minWidth: 130, gap: 2 },
  categoryCell: { width: '18%', minWidth: 110, color: colors.slateDark },
  cellMeta: { color: colors.slate, fontSize: 10 },
  dateCell: { width: 105, color: colors.slateDark },
  amountWrap: { alignItems: 'flex-end', gap: 2, minWidth: 92 },
  meta: { color: colors.slate },
  pressed: { opacity: 0.65, backgroundColor: colors.surface, borderRadius: radii.md },
});
