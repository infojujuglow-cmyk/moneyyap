import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, Chip, EmptyState } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, radii, spacing, typography } from '@/theme';
import type { FinancialEffect, PaymentRail } from '@/types/finance';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions, accounts, categories, spaces, tags, updateTransaction, deleteTransaction } = useFinance();
  const transaction = transactions.find((item) => item.id === id);
  const [merchant, setMerchant] = useState(transaction?.merchant ?? '');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [accountId, setAccountId] = useState(transaction?.accountFromId ?? transaction?.accountToId ?? null);
  const [destinationId, setDestinationId] = useState(transaction?.accountToId ?? null);
  const [financialEffect, setFinancialEffect] = useState<FinancialEffect>(transaction?.financialEffect ?? 'expense');
  const [paymentRail, setPaymentRail] = useState<PaymentRail>(transaction?.paymentRail ?? 'unknown');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? null);
  const [spaceId, setSpaceId] = useState(transaction?.spaceId ?? null);
  const [tagIds, setTagIds] = useState(transaction?.tagIds ?? []);
  const [saving, setSaving] = useState(false);
  if (!transaction) return <View style={styles.missing}><EmptyState icon="search-outline" title="Transaction not found" body="It may have already been deleted." action={<Button label="Go back" onPress={() => router.back()} />} /></View>;
  const save = async () => {
    setSaving(true);
    const isIncoming = financialEffect === 'income';
    const isInternal = financialEffect === 'internal_transfer';
    const nextType = isInternal ? accounts.find((item) => item.id === destinationId)?.type === 'credit_card' ? 'credit_card_payment' : 'transfer' : isIncoming ? transaction.type === 'refund' ? 'refund' : 'income' : 'expense';
    await updateTransaction(transaction.id, {
      merchant: merchant.trim() || null, amount: Number(amount.replace(/,/g, '')), spaceId: spaceId!,
      type: nextType, financialEffect, paymentRail, ownershipStatus: isInternal ? 'owned' : 'external', classificationReviewRequired: false,
      categoryId: isInternal ? null : categoryId, tagIds,
      accountFromId: isIncoming ? null : accountId, accountToId: isIncoming ? accountId : isInternal ? destinationId : null,
    });
    setSaving(false);
    router.back();
  };
  const remove = () => Alert.alert('Delete this transaction?', 'It will be removed from your workspace history and analytics.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTransaction(transaction.id); router.back(); } }]);
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">Edit transaction</AppText><Pressable onPress={remove} style={styles.close}><Ionicons name="trash-outline" size={21} color={colors.danger} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.typeBadge}><Ionicons name="sparkles-outline" size={14} color={colors.mintDeep} /><AppText variant="caption" style={styles.typeText}>{transaction.aiParsed ? 'Added by MoneyYap' : 'Manual entry'} · editable classification</AppText></View>
        {transaction.classificationReviewRequired && <View style={styles.reviewWarning}><Ionicons name="alert-circle-outline" size={20} color={colors.warning} /><AppText style={styles.reviewWarningText}>This older AI-created transfer predates ownership matching. Confirm whether it was an expense or an internal transfer, then save.</AppText></View>}
        <AppText variant="caption" style={styles.date}>{new Date(transaction.transactionDate).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</AppText>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>FINANCIAL EFFECT</AppText><View style={styles.wrap}><Chip label="Expense" selected={financialEffect === 'expense'} onPress={() => setFinancialEffect('expense')} /><Chip label="Income" selected={financialEffect === 'income'} onPress={() => setFinancialEffect('income')} /><Chip label="Internal transfer" selected={financialEffect === 'internal_transfer'} onPress={() => setFinancialEffect('internal_transfer')} /></View></View>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>PAYMENT METHOD / RAIL</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>{(['unknown', 'cash', 'bank_transfer', 'instapay', 'pesonet', 'gcash', 'maya', 'debit_card', 'credit_card'] as PaymentRail[]).map((item) => <Chip key={item} label={item === 'unknown' ? 'Not specified' : item.replaceAll('_', ' ')} selected={paymentRail === item} onPress={() => setPaymentRail(item)} />)}</ScrollView></View>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>AMOUNT</AppText><View style={styles.amount}><AppText variant="h2" style={financialEffect === 'expense' ? styles.expenseAmount : financialEffect === 'income' ? styles.incomeAmount : undefined}>₱</AppText><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={[styles.amountInput, financialEffect === 'expense' ? styles.expenseAmount : financialEffect === 'income' ? styles.incomeAmount : undefined]} /></View></View>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>MERCHANT OR DESCRIPTION</AppText><TextInput value={merchant} onChangeText={setMerchant} style={styles.input} /></View>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>SPACE</AppText><View style={styles.wrap}>{spaces.filter((item) => !item.isArchived || item.id === transaction.spaceId).map((item) => <Chip key={item.id} label={item.name} selected={spaceId === item.id} onPress={() => { setSpaceId(item.id); const current = categories.find((category) => category.id === categoryId); if (current?.spaceId && current.spaceId !== item.id) setCategoryId(null); }} />)}</View></View>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{financialEffect === 'income' ? 'DEPOSIT TO' : financialEffect === 'internal_transfer' ? 'FROM ACCOUNT' : 'PAID WITH'}</AppText><View style={styles.wrap}>{accounts.filter((item) => item.isActive || item.id === accountId).map((item) => <Chip key={item.id} label={item.isActive ? item.name : `${item.name} · removed`} selected={accountId === item.id} onPress={() => setAccountId(item.id)} />)}</View></View>
        {financialEffect === 'internal_transfer' && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>TO OWN ACCOUNT</AppText><View style={styles.wrap}>{accounts.filter((item) => (item.isActive || item.id === destinationId) && item.id !== accountId).map((item) => <Chip key={item.id} label={item.isActive ? item.name : `${item.name} · removed`} selected={destinationId === item.id} onPress={() => setDestinationId(item.id)} />)}</View></View>}
        {(financialEffect === 'expense' || financialEffect === 'income') && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>CATEGORY</AppText><View style={styles.wrap}>{categories.filter((item) => item.type === financialEffect && (!item.isArchived || item.id === transaction.categoryId) && (!item.spaceId || item.spaceId === spaceId)).map((item) => { const parent = categories.find((candidate) => candidate.id === item.parentId); return <Chip key={item.id} label={`${parent ? `${parent.name} › ` : ''}${item.name}`} selected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />; })}</View></View>}
        {tags.length > 0 && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>TAGS</AppText><View style={styles.wrap}>{tags.map((tag) => <Chip key={tag.id} label={`#${tag.name}`} selected={tagIds.includes(tag.id)} onPress={() => setTagIds((current) => current.includes(tag.id) ? current.filter((tagId) => tagId !== tag.id) : [...current, tag.id])} />)}</View></View>}
        {transaction.originalMessage && <View style={styles.original}><AppText variant="eyebrow" style={styles.label}>ORIGINAL MESSAGE</AppText><AppText>“{transaction.originalMessage}”</AppText></View>}
        <Button label={`Save ${formatPeso(Number(amount) || 0)}`} icon="checkmark" loading={saving} disabled={!Number(amount) || !spaceId || !accountId || (financialEffect === 'internal_transfer' && (!destinationId || destinationId === accountId))} onPress={save} />
        <Button label="Delete transaction" variant="danger" icon="trash-outline" onPress={remove} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 },
  missing: { flex: 1, justifyContent: 'center', backgroundColor: colors.softWhite },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 },
  typeBadge: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.mintWash, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  typeText: { color: colors.mintDeep, textTransform: 'capitalize' },
  date: { color: colors.slate, textAlign: 'center', marginTop: -spacing.md },
  field: { gap: spacing.md },
  label: { color: colors.slate },
  amount: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderBottomWidth: 1, borderBottomColor: colors.borderStrong },
  amountInput: { flex: 1, fontFamily: typography.semibold, fontSize: 30, color: colors.ink, paddingLeft: spacing.sm },
  expenseAmount: { color: colors.expense },
  incomeAmount: { color: colors.income },
  input: { minHeight: 54, backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  original: { gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, padding: spacing.lg },
  reviewWarning: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.warningWash, borderRadius: radii.md, padding: spacing.lg },
  reviewWarningText: { flex: 1, color: colors.slateDark },
});
