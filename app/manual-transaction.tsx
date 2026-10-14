import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SmartSelectField, SmartSelectSheet, type SmartSelectOption } from '@/components/SmartSelectSheet';
import { AppText, Button } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import type { Account, Category, ParsedTransactionDraft, PaymentRail, Transaction, TransactionType } from '@/types/finance';

type Picker = 'space' | 'account' | 'destination' | 'category' | 'rail' | 'tags' | null;

const transactionTypes: { id: TransactionType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'expense', label: 'Expense', icon: 'arrow-up' },
  { id: 'income', label: 'Income', icon: 'arrow-down' },
  { id: 'transfer', label: 'Internal transfer', icon: 'swap-horizontal' },
  { id: 'credit_card_payment', label: 'Card payment', icon: 'card-outline' },
  { id: 'refund', label: 'Refund', icon: 'return-down-back' },
];

const railLabels: Record<PaymentRail, string> = {
  unknown: 'Not specified', cash: 'Cash', bank_transfer: 'Bank transfer', instapay: 'InstaPay', pesonet: 'PESONet',
  gcash: 'GCash', maya: 'Maya', debit_card: 'Debit card', credit_card: 'Credit card', other: 'Other',
};

const rails = Object.keys(railLabels) as PaymentRail[];
const normalize = (value?: string | null) => value?.trim().toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '') ?? '';
const accountDetail = (account: Account) => [account.institution, account.type.replaceAll('_', ' ')].filter(Boolean).join(' · ');

function rankByHistory<T>(items: T[], transactions: Transaction[], selectedSpaceId: string | null, merchant: string, idForTransaction: (transaction: Transaction) => string | null, idForItem: (item: T) => string) {
  const merchantKey = normalize(merchant);
  const scores = new Map<string, number>();
  transactions.forEach((transaction, index) => {
    if (selectedSpaceId && transaction.spaceId !== selectedSpaceId) return;
    const id = idForTransaction(transaction);
    if (!id) return;
    const recency = Math.max(1, 120 - index);
    const transactionMerchant = normalize(transaction.counterpartyName || transaction.merchant);
    const merchantMatch = merchantKey && transactionMerchant === merchantKey ? 10000 : merchantKey && transactionMerchant.includes(merchantKey) ? 2500 : 0;
    scores.set(id, (scores.get(id) ?? 0) + recency + merchantMatch);
  });
  return [...items].sort((left, right) => (scores.get(idForItem(right)) ?? 0) - (scores.get(idForItem(left)) ?? 0));
}

export default function ManualTransactionScreen() {
  const params = useLocalSearchParams<{ draft?: string }>();
  const { width, height } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 700;
  const { accounts, categories, members, spaces, tags, transactions, selectedSpaceId, setSelectedSpaceId, saveDraft } = useFinance();
  const activeAccounts = useMemo(() => accounts.filter((item) => item.isActive), [accounts]);
  const activeSpaces = useMemo(() => spaces.filter((item) => !item.isArchived), [spaces]);
  const initialDraft = useMemo(() => {
    if (!params.draft) return null;
    try { return JSON.parse(params.draft) as ParsedTransactionDraft; } catch { return null; }
  }, [params.draft]);
  const initialIncoming = initialDraft?.transactionType === 'income' || initialDraft?.transactionType === 'refund';
  const [type, setType] = useState<TransactionType>(initialDraft?.transactionType ?? 'expense');
  const [amount, setAmount] = useState(initialDraft?.amount ? String(initialDraft.amount) : '');
  const [merchant, setMerchant] = useState(initialDraft?.merchant ?? initialDraft?.counterpartyName ?? '');
  const [spaceId, setSpaceId] = useState(initialDraft?.spaceId ?? selectedSpaceId ?? activeSpaces[0]?.id ?? null);
  const [tagIds, setTagIds] = useState<string[]>(initialDraft?.tagIds ?? []);
  const [accountId, setAccountId] = useState(initialIncoming ? initialDraft?.accountToId ?? null : initialDraft?.accountFromId ?? null);
  const [destinationId, setDestinationId] = useState(initialDraft?.accountToId ?? null);
  const [categoryId, setCategoryId] = useState(initialDraft?.categoryId ?? null);
  const [paymentRail, setPaymentRail] = useState<PaymentRail>(initialDraft?.paymentRail ?? 'unknown');
  const [notes, setNotes] = useState(initialDraft?.notes ?? '');
  const [transactionDate] = useState(() => initialDraft?.transactionDate ?? new Date().toISOString());
  const [picker, setPicker] = useState<Picker>(null);
  const [moreOpen, setMoreOpen] = useState(Boolean(initialDraft?.notes || initialDraft?.paymentRail && initialDraft.paymentRail !== 'unknown' || initialDraft?.tagIds?.length));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const movesMoney = type === 'transfer' || type === 'credit_card_payment';
  const spaceAccounts = useMemo(() => activeAccounts.filter((account) => !account.spaceId || account.spaceId === spaceId), [activeAccounts, spaceId]);
  const sourceAccounts = useMemo(() => spaceAccounts.filter((account) => type !== 'credit_card_payment' || account.type !== 'credit_card'), [spaceAccounts, type]);
  const rankedAccounts = useMemo(() => rankByHistory(sourceAccounts, transactions, spaceId, merchant, (transaction) => type === 'income' || type === 'refund' ? transaction.accountToId : transaction.accountFromId, (account) => account.id), [merchant, sourceAccounts, spaceId, transactions, type]);
  const effectiveAccountId = accountId && sourceAccounts.some((account) => account.id === accountId) ? accountId : rankedAccounts[0]?.id ?? null;
  const destinationAccounts = useMemo(() => spaceAccounts.filter((account) => account.id !== effectiveAccountId && (type !== 'credit_card_payment' || account.type === 'credit_card')), [effectiveAccountId, spaceAccounts, type]);
  const categoryType = type === 'income' ? 'income' : 'expense';
  const availableCategories = useMemo(() => categories.filter((category) => !category.isArchived && category.type === categoryType && category.spaceId === spaceId), [categories, categoryType, spaceId]);
  const rankedDestinations = useMemo(() => rankByHistory(destinationAccounts, transactions, spaceId, merchant, (transaction) => transaction.accountToId, (account) => account.id), [destinationAccounts, merchant, spaceId, transactions]);
  const rankedCategories = useMemo(() => rankByHistory(availableCategories, transactions, spaceId, merchant, (transaction) => transaction.categoryId, (category) => category.id), [availableCategories, merchant, spaceId, transactions]);
  const effectiveDestinationId = destinationId && destinationAccounts.some((account) => account.id === destinationId) ? destinationId : rankedDestinations[0]?.id ?? null;
  const effectiveCategoryId = categoryId && availableCategories.some((category) => category.id === categoryId) ? categoryId : rankedCategories[0]?.id ?? null;
  const selectedAccount = accounts.find((account) => account.id === effectiveAccountId);
  const selectedDestination = accounts.find((account) => account.id === effectiveDestinationId);
  const selectedCategory = categories.find((category) => category.id === effectiveCategoryId);
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const categoryLabel = (category?: Category | null) => {
    if (!category) return null;
    const parent = categories.find((item) => item.id === category.parentId);
    return parent ? `${parent.name} › ${category.name}` : category.name;
  };
  const originalMatch = useMemo(() => {
    if (type !== 'refund' || !normalize(merchant)) return null;
    return transactions.find((transaction) => transaction.spaceId === spaceId && transaction.financialEffect === 'expense' && normalize(transaction.counterpartyName || transaction.merchant) === normalize(merchant)) ?? null;
  }, [merchant, spaceId, transactions, type]);
  const parsedAmount = Number(amount.replace(/,/g, ''));
  const needsCategory = type === 'expense' || type === 'income' || type === 'refund';
  const valid = Boolean(spaceId && effectiveAccountId && parsedAmount > 0 && (!needsCategory || effectiveCategoryId) && (!movesMoney || effectiveDestinationId && effectiveAccountId !== effectiveDestinationId));

  const selectType = (nextType: TransactionType) => {
    setType(nextType); setError(null);
    setAccountId(null); setDestinationId(null); setCategoryId(null);
  };
  const selectSpace = (nextSpaceId: string) => {
    setSpaceId(nextSpaceId); setSelectedSpaceId(nextSpaceId);
    setAccountId(null); setDestinationId(null); setCategoryId(null);
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      await saveDraft({
        transactionType: type,
        financialEffect: type === 'expense' ? 'expense' : type === 'income' || type === 'refund' ? 'income' : 'internal_transfer',
        paymentRail, amount: parsedAmount, currency: 'PHP', merchant: merchant.trim() || null,
        counterpartyId: initialDraft?.counterpartyId ?? null, counterpartyName: merchant.trim() || initialDraft?.counterpartyName || null,
        counterpartyType: initialDraft?.counterpartyType ?? (movesMoney ? 'own_account' : 'unknown'),
        counterpartyIdentifiers: initialDraft?.counterpartyIdentifiers ?? {}, ownershipStatus: movesMoney ? 'owned' : 'external',
        spaceId, categoryId: needsCategory ? effectiveCategoryId : null, tagIds,
        accountFromId: type === 'income' || type === 'refund' ? null : effectiveAccountId,
        accountToId: type === 'income' || type === 'refund' ? effectiveAccountId : movesMoney ? effectiveDestinationId : null,
        paidByUserId: members[0]?.id ?? null, transactionDate, notes: notes.trim() || null,
        originalMessage: initialDraft?.originalMessage ?? '', confidence: initialDraft?.confidence ?? 1, needsConfirmation: false,
        sourceKind: initialDraft?.sourceKind, referenceNumber: initialDraft?.referenceNumber,
        bankTransactionLabel: initialDraft?.bankTransactionLabel, rawExtraction: initialDraft?.rawExtraction,
      });
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this transaction.');
    } finally { setSaving(false); }
  };

  const labels = {
    description: type === 'income' ? 'Received from' : type === 'refund' ? 'Refunded from' : 'Merchant / description',
    descriptionPlaceholder: type === 'income' ? 'e.g. Client payment' : type === 'refund' ? 'e.g. Coffee Project' : movesMoney ? 'Optional description' : 'e.g. Coffee Project',
    account: type === 'income' ? 'Received in' : type === 'refund' ? 'Refunded to' : type === 'transfer' ? 'From account' : type === 'credit_card_payment' ? 'Paid from' : 'Paid with',
    destination: type === 'credit_card_payment' ? 'Credit card account' : 'To account',
  };
  const suggestedAccountId = rankedAccounts[0]?.id;
  const suggestedDestinationId = rankedDestinations[0]?.id;
  const suggestedCategoryId = rankedCategories[0]?.id;
  const accountOptions: SmartSelectOption[] = rankedAccounts.map((account) => ({ id: account.id, label: account.name, detail: accountDetail(account), color: account.accent, searchText: account.institution ?? '', badge: account.id === suggestedAccountId ? 'Suggested' : undefined }));
  const destinationOptions: SmartSelectOption[] = rankedDestinations.map((account) => ({ id: account.id, label: account.name, detail: accountDetail(account), color: account.accent, searchText: account.institution ?? '', badge: account.id === suggestedDestinationId ? 'Suggested' : undefined }));
  const categoryOptions: SmartSelectOption[] = rankedCategories.map((category) => ({ id: category.id, label: categoryLabel(category)!, color: category.color, searchText: categories.find((parent) => parent.id === category.parentId)?.name ?? '', badge: category.id === suggestedCategoryId ? 'Suggested' : undefined }));
  const spaceOptions: SmartSelectOption[] = activeSpaces.map((space) => ({ id: space.id, label: space.name, color: space.color }));
  const railOptions: SmartSelectOption[] = rails.map((rail) => ({ id: rail, label: railLabels[rail], detail: rail === 'unknown' ? 'Keep the payment network unspecified' : undefined }));
  const tagOptions: SmartSelectOption[] = tags.map((tag) => ({ id: tag.id, label: `#${tag.name}`, color: tag.color }));
  const sheetConfig = picker === 'space' ? { title: 'Choose a space', options: spaceOptions, ids: spaceId ? [spaceId] : [], placeholder: 'Search spaces' }
    : picker === 'account' ? { title: labels.account, options: accountOptions, ids: effectiveAccountId ? [effectiveAccountId] : [], placeholder: 'Search accounts' }
      : picker === 'destination' ? { title: labels.destination, options: destinationOptions, ids: effectiveDestinationId ? [effectiveDestinationId] : [], placeholder: 'Search accounts' }
        : picker === 'category' ? { title: 'Choose a category', options: categoryOptions, ids: effectiveCategoryId ? [effectiveCategoryId] : [], placeholder: 'Search categories' }
          : picker === 'rail' ? { title: 'Payment method / rail', options: railOptions, ids: [paymentRail], placeholder: 'Search payment methods' }
            : { title: 'Choose tags', options: tagOptions, ids: tagIds, placeholder: 'Search tags' };
  const handleSheetSelect = (id: string) => {
    if (picker === 'space') selectSpace(id);
    if (picker === 'account') { setAccountId(id); if (destinationId === id) setDestinationId(null); }
    if (picker === 'destination') setDestinationId(id);
    if (picker === 'category') setCategoryId(id);
    if (picker === 'rail') setPaymentRail(id as PaymentRail);
    if (picker === 'tags') setTagIds((current) => current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]);
  };

  return (
    <View style={[styles.backdrop, desktop && styles.backdropDesktop]}>
      <KeyboardAvoidingView style={[styles.keyboard, desktop && styles.keyboardDesktop, desktop && { height: Math.min(820, height - spacing.huge) }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={desktop ? [] : ['top', 'bottom']} style={[styles.card, desktop && styles.cardDesktop]}>
          <View style={styles.header}><View><AppText variant="h3">Add manually</AppText><AppText variant="caption" style={styles.muted}>Record a transaction</AppText></View><Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={22} color={colors.ink} /></Pressable></View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {transactionTypes.map((item) => { const selected = type === item.id; return <Pressable key={item.id} onPress={() => selectType(item.id)} style={({ pressed }) => [styles.typeOption, selected && styles.typeSelected, pressed && styles.pressed]}><Ionicons name={item.icon} size={17} color={selected ? colors.mintDeep : colors.slate} /><AppText variant="caption" style={selected ? styles.typeTextSelected : styles.muted}>{item.label}</AppText></Pressable>; })}
            </ScrollView>
            <Pressable onPress={() => setPicker('space')} style={({ pressed }) => [styles.spacePill, pressed && styles.pressed]}><View style={[styles.spaceDot, { backgroundColor: selectedSpace?.color ?? colors.mint }]} /><AppText variant="caption" style={styles.spaceName}>{selectedSpace?.name ?? 'Choose space'}</AppText><Ionicons name="chevron-down" size={14} color={colors.slate} /></Pressable>
            <View style={styles.amountBlock}><AppText variant="eyebrow" style={styles.muted}>Amount</AppText><View style={styles.amountField}><AppText style={styles.currency}>₱</AppText><TextInput value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={colors.borderStrong} keyboardType="decimal-pad" autoFocus style={styles.amountInput} /></View></View>
            <LabeledInput label={labels.description} value={merchant} onChangeText={setMerchant} placeholder={labels.descriptionPlaceholder} />
            <SmartSelectField label={labels.account} value={selectedAccount?.name} placeholder="Choose an account" onPress={() => setPicker('account')} hint={!accountId && selectedAccount?.id === suggestedAccountId ? 'Suggested from recent activity' : null} />
            {movesMoney && <SmartSelectField label={labels.destination} value={selectedDestination?.name} placeholder="Choose an account" onPress={() => setPicker('destination')} hint={!destinationId && selectedDestination?.id === suggestedDestinationId ? 'Suggested from recent activity' : null} />}
            {needsCategory && <SmartSelectField label={type === 'refund' ? 'Original category' : 'Category'} value={categoryLabel(selectedCategory)} placeholder="Choose a category" onPress={() => setPicker('category')} hint={originalMatch?.categoryId === effectiveCategoryId ? 'Matched from the original transaction' : !categoryId && selectedCategory?.id === suggestedCategoryId ? 'Suggested from similar transactions' : null} />}
            <Pressable onPress={() => setMoreOpen((current) => !current)} style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}><View style={styles.moreTitle}><Ionicons name="options-outline" size={19} color={colors.slateDark} /><AppText variant="bodyMedium">More details</AppText></View><Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={19} color={colors.slate} /></Pressable>
            {moreOpen && <View style={styles.moreDetails}>
              <SmartSelectField label="Payment method / rail" value={railLabels[paymentRail]} placeholder="Not specified" onPress={() => setPicker('rail')} hint="Separate from the financial account above" />
              {tags.length > 0 && <SmartSelectField label="Tags · optional" value={tagIds.length ? `${tagIds.length} selected` : null} placeholder="Choose tags" onPress={() => setPicker('tags')} />}
              <LabeledInput label="Notes · optional" value={notes} onChangeText={setNotes} placeholder="Add a note" multiline />
              <View style={styles.dateRow}><View><AppText variant="eyebrow" style={styles.muted}>Date</AppText><AppText variant="bodyMedium">{new Date(transactionDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</AppText></View><Ionicons name="calendar-outline" size={20} color={colors.slate} /></View>
            </View>}
          </ScrollView>
          <View style={styles.footer}>{error ? <AppText variant="caption" style={styles.error}>{error}</AppText> : null}<Button label="Save transaction" icon="checkmark" loading={saving} disabled={!valid} onPress={submit} /></View>
        </SafeAreaView>
      </KeyboardAvoidingView>
      <SmartSelectSheet visible={picker !== null} title={sheetConfig.title} options={sheetConfig.options} selectedIds={sheetConfig.ids} searchPlaceholder={sheetConfig.placeholder} multiple={picker === 'tags'} onClose={() => setPicker(null)} onSelect={handleSheetSelect} />
    </View>
  );
}

function LabeledInput({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <View style={styles.field}><AppText variant="eyebrow" style={styles.muted}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.slate} multiline={multiline} style={[styles.textInput, multiline && styles.multiline]} /></View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.softWhite },
  backdropDesktop: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: 'rgba(18, 25, 35, 0.16)' },
  keyboard: { flex: 1, width: '100%' },
  keyboardDesktop: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 580 },
  card: { flex: 1, backgroundColor: colors.softWhite },
  cardDesktop: { borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  header: { minHeight: 68, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  typeRow: { gap: spacing.sm, paddingRight: spacing.xl },
  typeOption: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  typeSelected: { backgroundColor: colors.mintWash, borderColor: colors.mintMist },
  typeTextSelected: { color: colors.mintDeep },
  spacePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.surface },
  spaceDot: { width: 8, height: 8, borderRadius: 4 },
  spaceName: { color: colors.slateDark },
  amountBlock: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  amountField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  currency: { fontFamily: typography.semibold, fontSize: 30, color: colors.slate, marginRight: 4 },
  amountInput: { minWidth: 90, maxWidth: '80%', fontFamily: typography.bold, fontSize: 54, lineHeight: 64, letterSpacing: -2.2, color: colors.ink, textAlign: 'center', outlineStyle: 'none' } as never,
  field: { gap: spacing.sm },
  textInput: { minHeight: 56, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: typography.regular, fontSize: 16, color: colors.ink, outlineStyle: 'none' } as never,
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  moreToggle: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  moreTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  moreDetails: { gap: spacing.xl },
  dateRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  muted: { color: colors.slate }, error: { color: colors.danger, textAlign: 'center' }, pressed: { opacity: 0.72 },
});
