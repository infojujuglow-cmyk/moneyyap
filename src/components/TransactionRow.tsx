import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFinance } from '@/context/FinanceContext';
import { isTransactionReconciled, reconciliationDate } from '@/lib/reconciliation';
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

export function TransactionRow({ transaction, onPress, compact = false, desktop = false, mobileList = false, accountContextId, reconciliationAccountId, onToggleReconciled, reconciliationBusy = false }: { transaction: Transaction; onPress?: () => void; compact?: boolean; desktop?: boolean; mobileList?: boolean; accountContextId?: string; reconciliationAccountId?: string | null; onToggleReconciled?: () => void; reconciliationBusy?: boolean }) {
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
  const direction = accountContextId && transaction.accountToId === accountContextId && transaction.accountFromId !== accountContextId
    ? 'incoming'
    : accountContextId && transaction.accountFromId === accountContextId && transaction.accountToId !== accountContextId
      ? 'outgoing'
      : transaction.financialEffect === 'income'
        ? 'incoming'
        : transaction.financialEffect === 'expense'
          ? 'outgoing'
          : 'neutral';
  const positive = direction === 'incoming';
  const negative = direction === 'outgoing';
  const directionColor = positive ? colors.income : negative ? colors.expense : meta.color;
  const directionBackground = positive ? colors.incomeWash : negative ? colors.expenseWash : meta.background;
  const amountPrefix = positive ? '+' : negative ? '−' : '';
  const title = transaction.counterpartyName ?? transaction.merchant ?? (transaction.classificationReviewRequired ? 'For verification' : meta.label);
  const detail = `${transaction.classificationReviewRequired ? 'For verification · ' : ''}${category ? `${parent ? `${parent.name} › ` : ''}${category.name}` : meta.label}${space ? ` · ${space.name}` : ''}${account ? ` · ${account.name}` : ''}${transaction.paymentRail !== 'unknown' ? ` · via ${transaction.paymentRail.replaceAll('_', ' ')}` : ''} · by ${transaction.createdByName}`;
  const receiver = transaction.type === 'transfer' || transaction.type === 'credit_card_payment'
    ? destinationAccount?.name ?? '—'
    : transaction.counterpartyName ?? transaction.merchant ?? '—';
  const categoryName = category ? `${parent ? `${parent.name} › ` : ''}${category.name}` : transaction.classificationReviewRequired ? 'To verify' : '—';
  const reconciled = isTransactionReconciled(transaction, reconciliationAccountId);
  const reconciledOn = reconciliationDate(transaction, reconciliationAccountId);
  const reconciliationControl = <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: reconciled, disabled: !onToggleReconciled || reconciliationBusy }} accessibilityLabel={reconciled ? `Reconciled${reconciledOn ? ` on ${new Date(reconciledOn).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}. Mark unreconciled` : 'Mark reconciled'} disabled={!onToggleReconciled || reconciliationBusy} hitSlop={8} onPress={(event) => { event.stopPropagation(); onToggleReconciled?.(); }} style={({ pressed }) => [styles.reconciliation, mobileList && styles.mobileReconciliation, reconciled && !mobileList && styles.reconciliationDone, pressed && styles.pressed]}>{reconciliationBusy ? <ActivityIndicator size="small" color={colors.mintDeep} /> : <Ionicons name={reconciled ? 'checkmark-circle' : 'ellipse-outline'} size={mobileList ? 17 : 22} color={reconciled ? colors.mintDeep : colors.slate} />}</Pressable>;
  if (desktop) return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${meta.label}: ${title}${transaction.classificationReviewRequired ? ', for verification' : ''}`} onPress={onPress} style={({ pressed }) => [styles.row, styles.desktopRow, transaction.classificationReviewRequired && styles.verificationRow, pressed && styles.pressed]}>
      {direction !== 'neutral' && <View style={[styles.directionIndicator, transaction.classificationReviewRequired && styles.verificationIndicator, { backgroundColor: directionColor }]} />}
      <View style={styles.typeCell}><IconCircle name={meta.icon} color={directionColor} background={directionBackground} size={36} /></View>
      <View style={styles.accountCell}><AppText variant="caption" numberOfLines={1}>{account?.name ?? '—'}</AppText>{account?.institution && <AppText variant="caption" style={styles.cellMeta} numberOfLines={1}>{account.institution}</AppText>}</View>
      <View style={styles.receiverCell}><AppText variant="caption" numberOfLines={1}>{receiver}</AppText><AppText variant="caption" style={[styles.cellMeta, transaction.classificationReviewRequired && styles.verificationText]} numberOfLines={1}>{transaction.classificationReviewRequired ? 'For verification' : meta.label}</AppText></View>
      <AppText variant="caption" style={[styles.categoryCell, transaction.classificationReviewRequired && !category && styles.verificationText]} numberOfLines={1}>{categoryName}</AppText>
      <AppText variant="caption" style={styles.notesCell} numberOfLines={2}>{transaction.notes?.trim() || '—'}</AppText>
      <AppText variant="caption" style={styles.creatorCell} numberOfLines={1}>{transaction.createdByName}</AppText>
      <View style={styles.amountWrap}><AppText variant="bodyMedium" style={{ color: direction === 'neutral' ? colors.neutralAmount : directionColor }}>{amountPrefix}{formatPeso(transaction.amount)}</AppText></View>
      {reconciliationControl}
    </Pressable>
  );
  const mobileTitle = mobileList && transaction.type === 'transfer'
    ? `${sourceAccount?.name ?? 'Account'} → ${destinationAccount?.name ?? 'Account'}`
    : mobileList && transaction.type === 'credit_card_payment'
      ? `Payment to ${destinationAccount?.name ?? 'credit card'}`
      : title;
  const mobileDetail = `${transaction.classificationReviewRequired ? 'For verification · ' : ''}${categoryName !== '—' ? categoryName : meta.label}${space ? ` · ${space.name}` : ''} · by ${transaction.createdByName}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${mobileTitle}${transaction.classificationReviewRequired ? ', for verification' : ''}`} onPress={onPress} style={({ pressed }) => [styles.row, compact && styles.compact, mobileList && styles.mobileListRow, transaction.classificationReviewRequired && styles.verificationRow, mobileList && transaction.classificationReviewRequired && styles.mobileVerificationRow, pressed && styles.pressed]}>
      {!mobileList && direction !== 'neutral' && <View style={[styles.directionIndicator, transaction.classificationReviewRequired && styles.verificationIndicator, { backgroundColor: directionColor }]} />}
      <IconCircle name={(category?.icon as keyof typeof Ionicons.glyphMap) ?? meta.icon} color={directionColor} background={directionBackground} size={mobileList ? 38 : 44} />
      <View style={styles.copy}>
        <AppText variant="bodyMedium" numberOfLines={1}>{mobileTitle}</AppText>
        <AppText variant="caption" style={[styles.meta, transaction.classificationReviewRequired && styles.verificationText]} numberOfLines={1}>{mobileList ? mobileDetail : detail}</AppText>
      </View>
      <View style={[styles.amountWrap, mobileList && styles.mobileAmountWrap]}>
        <AppText variant="bodyMedium" style={{ color: direction === 'neutral' ? colors.neutralAmount : directionColor }}>
          {amountPrefix}{formatPeso(transaction.amount)}
        </AppText>
        {!mobileList && <AppText variant="caption" style={styles.meta}>{new Date(transaction.transactionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</AppText>}
      </View>
      {reconciliationControl}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, position: 'relative' },
  compact: { minHeight: 64, paddingVertical: spacing.sm },
  mobileListRow: { minHeight: 62, paddingVertical: 9, gap: spacing.sm },
  desktopRow: { minHeight: 74 },
  verificationRow: { backgroundColor: '#FFFAEF', borderRadius: radii.sm, marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm },
  mobileVerificationRow: { marginHorizontal: 0, paddingHorizontal: spacing.xs },
  copy: { flex: 1, gap: 2 },
  typeCell: { width: 52, alignItems: 'center' },
  accountCell: { flex: 0.9, minWidth: 100, gap: 2 },
  receiverCell: { flex: 1.1, minWidth: 120, gap: 2 },
  categoryCell: { width: '14%', minWidth: 100, color: colors.slateDark },
  notesCell: { width: '15%', minWidth: 110, color: colors.slate },
  creatorCell: { width: '10%', minWidth: 88, color: colors.slateDark },
  cellMeta: { color: colors.slate, fontSize: 10 },
  amountWrap: { alignItems: 'flex-end', gap: 2, minWidth: 92 },
  mobileAmountWrap: { minWidth: 84, maxWidth: 112 },
  reconciliation: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  mobileReconciliation: { width: 28, height: 36, borderRadius: 10 },
  reconciliationDone: { backgroundColor: colors.mintWash },
  directionIndicator: { position: 'absolute', left: -spacing.lg, width: 3, height: 32, borderRadius: 3 },
  verificationIndicator: { left: 0 },
  verificationText: { color: '#8A5B0A' },
  meta: { color: colors.slate },
  pressed: { opacity: 0.65, backgroundColor: colors.surface, borderRadius: radii.md },
});
