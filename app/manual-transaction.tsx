import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button, AppText, Chip } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import type { ParsedTransactionDraft, PaymentRail, TransactionType } from '@/types/finance';

export default function ManualTransactionScreen() {
  const params = useLocalSearchParams<{ draft?: string }>();
  const { accounts, categories, members, spaces, tags, selectedSpaceId, saveDraft } = useFinance();
  const activeAccounts = accounts.filter((item) => item.isActive);
  const activeSpaces = spaces.filter((item) => !item.isArchived);
  const initialDraft = useMemo(() => {
    if (!params.draft) return null;
    try { return JSON.parse(params.draft) as ParsedTransactionDraft; } catch { return null; }
  }, [params.draft]);
  const initialIncoming = initialDraft?.transactionType === 'income' || initialDraft?.transactionType === 'refund';
  const [type, setType] = useState<TransactionType>(initialDraft?.transactionType ?? 'expense');
  const [amount, setAmount] = useState(initialDraft?.amount ? String(initialDraft.amount) : '');
  const [merchant, setMerchant] = useState(initialDraft?.merchant ?? '');
  const [spaceId, setSpaceId] = useState(initialDraft?.spaceId ?? selectedSpaceId ?? activeSpaces[0]?.id ?? null);
  const [tagIds, setTagIds] = useState<string[]>(initialDraft?.tagIds ?? []);
  const [accountId, setAccountId] = useState(initialIncoming ? initialDraft?.accountToId ?? null : initialDraft?.accountFromId ?? activeAccounts[0]?.id ?? null);
  const [destinationId, setDestinationId] = useState(initialDraft?.accountToId ?? activeAccounts.find((item) => item.id !== activeAccounts[0]?.id)?.id ?? null);
  const [categoryId, setCategoryId] = useState(initialDraft?.categoryId ?? categories.find((item) => item.type === 'expense')?.id ?? null);
  const [paymentRail, setPaymentRail] = useState<PaymentRail>(initialDraft?.paymentRail ?? 'unknown');
  const [transactionDate] = useState(() => initialDraft?.transactionDate ?? new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const movesMoney = type === 'transfer' || type === 'credit_card_payment';
  const valid = Boolean(spaceId) && Number(amount.replace(/,/g, '')) > 0 && (!movesMoney || Boolean(accountId && destinationId && accountId !== destinationId));
  const selectType = (nextType: TransactionType) => {
    setType(nextType);
    if (nextType === 'credit_card_payment') {
      setAccountId(activeAccounts.find((item) => item.type !== 'credit_card')?.id ?? null);
      setDestinationId(activeAccounts.find((item) => item.type === 'credit_card')?.id ?? null);
    }
  };
  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    await saveDraft({
      transactionType: type,
      financialEffect: type === 'expense' ? 'expense' : type === 'income' || type === 'refund' ? 'income' : 'internal_transfer',
      paymentRail,
      amount: Number(amount.replace(/,/g, '')),
      currency: 'PHP',
      merchant: merchant.trim() || null,
      counterpartyId: initialDraft?.counterpartyId ?? null,
      counterpartyName: merchant.trim() || initialDraft?.counterpartyName || null,
      counterpartyType: initialDraft?.counterpartyType ?? 'unknown',
      counterpartyIdentifiers: initialDraft?.counterpartyIdentifiers ?? {},
      ownershipStatus: movesMoney ? 'owned' : 'external',
      spaceId,
      categoryId: type === 'expense' || type === 'refund' ? categoryId : type === 'income' ? categories.find((item) => item.type === 'income')?.id ?? null : null,
      tagIds,
      accountFromId: type === 'income' || type === 'refund' ? null : accountId,
      accountToId: type === 'income' || type === 'refund' ? accountId : movesMoney ? destinationId : null,
      paidByUserId: members[0]?.id ?? null,
      transactionDate,
      notes: initialDraft?.notes ?? null,
      originalMessage: initialDraft?.originalMessage ?? '',
      confidence: initialDraft?.confidence ?? 1,
      needsConfirmation: false,
      sourceKind: initialDraft?.sourceKind,
      referenceNumber: initialDraft?.referenceNumber,
      bankTransactionLabel: initialDraft?.bankTransactionLabel,
      rawExtraction: initialDraft?.rawExtraction,
    });
    setSaving(false);
    router.back();
  };
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">Add manually</AppText><View style={styles.close} /></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>FINANCIAL EFFECT</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>{(['expense', 'income', 'transfer', 'credit_card_payment', 'refund'] as TransactionType[]).map((item) => <Chip key={item} label={item === 'transfer' ? 'Internal transfer' : item === 'credit_card_payment' ? 'Card payment' : item[0]!.toUpperCase() + item.slice(1)} selected={type === item} onPress={() => selectType(item)} />)}</ScrollView></View>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>PAYMENT METHOD / RAIL</AppText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>{(['unknown', 'cash', 'bank_transfer', 'instapay', 'pesonet', 'gcash', 'maya', 'debit_card', 'credit_card'] as PaymentRail[]).map((item) => <Chip key={item} label={item === 'unknown' ? 'Not specified' : item.replaceAll('_', ' ')} selected={paymentRail === item} onPress={() => setPaymentRail(item)} />)}</ScrollView></View>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>SPACE</AppText><View style={styles.wrap}>{activeSpaces.map((item) => <Chip key={item.id} label={item.name} selected={spaceId === item.id} onPress={() => { setSpaceId(item.id); const current = categories.find((category) => category.id === categoryId); if (current?.spaceId && current.spaceId !== item.id) setCategoryId(null); }} />)}</View></View>
        <View style={styles.amountField}><AppText style={styles.currency}>₱</AppText><TextInput value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={colors.borderStrong} keyboardType="decimal-pad" autoFocus style={styles.amountInput} /></View>
        <LabeledInput label={type === 'income' ? 'SOURCE' : 'MERCHANT OR DESCRIPTION'} value={merchant} onChangeText={setMerchant} placeholder={type === 'income' ? 'e.g. Client payment' : 'e.g. Coffee Project'} />
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{type === 'income' || type === 'refund' ? 'DEPOSIT TO' : movesMoney ? 'FROM ACCOUNT' : 'PAID WITH'}</AppText><View style={styles.wrap}>{activeAccounts.filter((item) => type !== 'credit_card_payment' || item.type !== 'credit_card').map((item) => <Chip key={item.id} label={item.name} selected={accountId === item.id} onPress={() => setAccountId(item.id)} />)}</View></View>
        {movesMoney && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>TO ACCOUNT</AppText><View style={styles.wrap}>{activeAccounts.filter((item) => item.id !== accountId && (type !== 'credit_card_payment' || item.type === 'credit_card')).map((item) => <Chip key={item.id} label={item.name} selected={destinationId === item.id} onPress={() => setDestinationId(item.id)} />)}</View></View>}
        {(type === 'expense' || type === 'refund') && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>CATEGORY</AppText><View style={styles.wrap}>{categories.filter((item) => item.type === 'expense' && !item.isArchived && (!item.spaceId || item.spaceId === spaceId)).map((item) => { const parent = categories.find((parentItem) => parentItem.id === item.parentId); return <Chip key={item.id} label={`${parent ? `${parent.name} › ` : ''}${item.name}`} selected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />; })}</View></View>}
        {tags.length > 0 && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>TAGS · OPTIONAL</AppText><View style={styles.wrap}>{tags.map((tag) => <Chip key={tag.id} label={`#${tag.name}`} selected={tagIds.includes(tag.id)} onPress={() => setTagIds((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])} />)}</View></View>}
        <View style={styles.dateRow}><View><AppText variant="eyebrow" style={styles.label}>DATE</AppText><AppText variant="bodyMedium">{new Date(transactionDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</AppText></View><Ionicons name="calendar-outline" size={21} color={colors.slate} /></View>
        <Button label="Save transaction" icon="checkmark" loading={saving} disabled={!valid} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.slate} style={styles.textInput} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 },
  field: { gap: spacing.md },
  label: { color: colors.slate },
  options: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amountField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.borderStrong },
  currency: { fontFamily: typography.semibold, fontSize: 32, color: colors.slate },
  amountInput: { minWidth: 80, fontFamily: typography.bold, fontSize: 52, letterSpacing: -2, color: colors.ink, textAlign: 'center' },
  textInput: { minHeight: 54, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  dateRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: spacing.md },
});
