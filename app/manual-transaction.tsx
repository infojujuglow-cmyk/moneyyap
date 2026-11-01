import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { SmartSelectField, SmartSelectSheet, type SmartSelectOption } from '@/components/SmartSelectSheet';
import { TransactionDateTimeField } from '@/components/TransactionDateTimeField';
import { AppText, Button } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { isTransactionReconciled, reconciliationDate, transactionAccountIds } from '@/lib/reconciliation';
import { colors, radii, spacing, typography } from '@/theme';
import type { Account, BusinessClassification, Category, ParsedTransactionDraft, PaymentRail, Transaction, TransactionType } from '@/types/finance';

type Picker = 'space' | 'account' | 'destination' | 'category' | 'rail' | 'tags' | null;
type EntryMode = TransactionType | 'verification';

const transactionTypes: { id: EntryMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'expense', label: 'Expense', icon: 'arrow-up' },
  { id: 'verification', label: 'For verification', icon: 'help-circle-outline' },
  { id: 'income', label: 'Income', icon: 'arrow-down' },
  { id: 'transfer', label: 'Internal transfer', icon: 'swap-horizontal' },
  { id: 'credit_card_payment', label: 'Card payment', icon: 'card-outline' },
  { id: 'refund', label: 'Refund', icon: 'return-down-back' },
];
const capitalOptions: { id: BusinessClassification; label: string; direction: 'income' | 'expense' | 'both' }[] = [
  { id: 'operating', label: 'Operating', direction: 'both' },
  { id: 'owner_capital_contribution', label: 'Owner capital', direction: 'income' },
  { id: 'owner_loan', label: 'Owner loan', direction: 'income' },
  { id: 'owner_withdrawal', label: 'Owner withdrawal', direction: 'expense' },
  { id: 'loan_repayment', label: 'Loan repayment', direction: 'expense' },
];

const railLabels: Record<PaymentRail, string> = {
  unknown: 'Not specified', cash: 'Cash', bank_transfer: 'Bank transfer', instapay: 'InstaPay', pesonet: 'PESONet',
  gcash: 'GCash', maya: 'Maya', debit_card: 'Debit card', credit_card: 'Credit card', other: 'Other',
};

const rails = Object.keys(railLabels) as PaymentRail[];
const normalize = (value?: string | null) => value?.trim().toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '') ?? '';
const groupAccountOptions = (ranked: Account[], suggestedId?: string): SmartSelectOption[] => {
  const institutions = [...new Set(ranked.map((account) => account.institution?.trim() || 'Other accounts'))].sort((left, right) => left.localeCompare(right));
  return institutions.flatMap((institution) => ranked
    .filter((account) => (account.institution?.trim() || 'Other accounts') === institution)
    .map((account) => ({
      id: account.id,
      label: account.name,
      detail: account.type.replaceAll('_', ' '),
      color: account.accent,
      searchText: account.institution ?? '',
      badge: account.id === suggestedId ? 'Suggested' : undefined,
      group: institution,
    })));
};

type CounterpartySuggestion = { id: string | null; name: string; count: number; lastUsedAt: string };

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

export default function ManualTransactionScreen({ editTransactionId }: { editTransactionId?: string } = {}) {
  const params = useLocalSearchParams<{ draft?: string; accountId?: string; spaceId?: string }>();
  const { width, height } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 700;
  const { accounts, categories, counterparties, members, spaces, tags, transactions, selectedSpaceId, setSelectedSpaceId, saveDraft, updateTransaction, setTransactionsReconciled, deleteTransaction } = useFinance();
  const editingTransaction = transactions.find((transaction) => transaction.id === editTransactionId);
  const activeAccounts = useMemo(() => accounts.filter((item) => item.isActive || item.id === editingTransaction?.accountFromId || item.id === editingTransaction?.accountToId), [accounts, editingTransaction]);
  const activeSpaces = useMemo(() => spaces.filter((item) => !item.isArchived || item.id === editingTransaction?.spaceId), [editingTransaction, spaces]);
  const initialDraft = useMemo(() => {
    if (editingTransaction) return {
      transactionType: editingTransaction.type,
      financialEffect: editingTransaction.financialEffect,
      paymentRail: editingTransaction.paymentRail,
      amount: editingTransaction.amount,
      currency: editingTransaction.currency,
      merchant: editingTransaction.merchant,
      counterpartyId: editingTransaction.counterpartyId,
      counterpartyName: editingTransaction.counterpartyName,
      counterpartyType: editingTransaction.ownershipStatus === 'owned' ? 'own_account' as const : 'unknown' as const,
      ownershipStatus: editingTransaction.ownershipStatus,
      spaceId: editingTransaction.spaceId,
      categoryId: editingTransaction.categoryId,
      tagIds: editingTransaction.tagIds,
      accountFromId: editingTransaction.accountFromId,
      accountToId: editingTransaction.accountToId,
      paidByUserId: editingTransaction.paidByUserId,
      transactionDate: editingTransaction.transactionDate,
      notes: editingTransaction.notes,
      originalMessage: editingTransaction.originalMessage ?? '',
      confidence: editingTransaction.aiConfidence ?? 1,
      needsConfirmation: false,
      referenceNumber: editingTransaction.referenceNumber,
      bankTransactionLabel: editingTransaction.bankTransactionLabel,
      rawExtraction: editingTransaction.rawExtraction,
      classificationReviewRequired: editingTransaction.classificationReviewRequired,
      businessClassification: editingTransaction.businessClassification,
    } satisfies ParsedTransactionDraft;
    if (!params.draft) return null;
    try { return JSON.parse(params.draft) as ParsedTransactionDraft; } catch { return null; }
  }, [editingTransaction, params.draft]);
  const initialIncoming = initialDraft?.transactionType === 'income' || initialDraft?.transactionType === 'refund';
  const [type, setType] = useState<TransactionType>(initialDraft?.transactionType ?? 'expense');
  const [forVerification, setForVerification] = useState(Boolean(initialDraft?.classificationReviewRequired && initialDraft.transactionType === 'expense'));
  const [categoryMustBeChosen, setCategoryMustBeChosen] = useState(false);
  const [amount, setAmount] = useState(initialDraft?.amount ? String(initialDraft.amount) : '');
  const [merchant, setMerchant] = useState(initialDraft?.merchant ?? initialDraft?.counterpartyName ?? '');
  const [counterpartyId, setCounterpartyId] = useState(initialDraft?.counterpartyId ?? null);
  const [matchedCounterpartyName, setMatchedCounterpartyName] = useState(initialDraft?.counterpartyId ? initialDraft.counterpartyName ?? initialDraft.merchant ?? null : null);
  const initialAccount = accounts.find((account) => account.id === params.accountId);
  const [spaceId, setSpaceId] = useState(initialDraft?.spaceId ?? params.spaceId ?? initialAccount?.spaceId ?? selectedSpaceId ?? activeSpaces[0]?.id ?? null);
  const [tagIds, setTagIds] = useState<string[]>(initialDraft?.tagIds ?? []);
  const [accountId, setAccountId] = useState(initialIncoming ? initialDraft?.accountToId ?? params.accountId ?? null : initialDraft?.accountFromId ?? params.accountId ?? null);
  const [destinationId, setDestinationId] = useState(initialDraft?.accountToId ?? null);
  const [categoryId, setCategoryId] = useState(initialDraft?.categoryId ?? null);
  const [paymentRail, setPaymentRail] = useState<PaymentRail>(initialDraft?.paymentRail ?? 'unknown');
  const [businessClassification, setBusinessClassification] = useState<BusinessClassification>(initialDraft?.businessClassification ?? 'operating');
  const [notes, setNotes] = useState(initialDraft?.notes ?? '');
  const [transactionDate, setTransactionDate] = useState(() => {
    const parsed = initialDraft?.transactionDate ? new Date(initialDraft.transactionDate) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  });
  const [picker, setPicker] = useState<Picker>(null);
  const [moreOpen, setMoreOpen] = useState(Boolean(initialDraft?.notes || initialDraft?.paymentRail && initialDraft.paymentRail !== 'unknown' || initialDraft?.tagIds?.length || initialDraft?.businessClassification && initialDraft.businessClassification !== 'operating' || editingTransaction?.reconciliations.length));
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reconciliationBusyAccountId, setReconciliationBusyAccountId] = useState<string | null>(null);
  const [unreconcileAccountId, setUnreconcileAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const movesMoney = type === 'transfer' || type === 'credit_card_payment';
  const spaceAccounts = useMemo(() => activeAccounts.filter((account) => !account.spaceId || account.spaceId === spaceId || account.id === accountId || account.id === destinationId), [accountId, activeAccounts, destinationId, spaceId]);
  const sourceAccounts = useMemo(() => spaceAccounts.filter((account) => type !== 'credit_card_payment' || account.type !== 'credit_card'), [spaceAccounts, type]);
  const rankedAccounts = useMemo(() => rankByHistory(sourceAccounts, transactions, spaceId, merchant, (transaction) => type === 'income' || type === 'refund' ? transaction.accountToId : transaction.accountFromId, (account) => account.id), [merchant, sourceAccounts, spaceId, transactions, type]);
  const effectiveAccountId = accountId && sourceAccounts.some((account) => account.id === accountId) ? accountId : rankedAccounts[0]?.id ?? null;
  const destinationAccounts = useMemo(() => spaceAccounts.filter((account) => account.id !== effectiveAccountId && (type !== 'credit_card_payment' || account.type === 'credit_card')), [effectiveAccountId, spaceAccounts, type]);
  const categoryType = type === 'income' ? 'income' : 'expense';
  const availableCategories = useMemo(() => categories.filter((category) => (!category.isArchived || category.id === editingTransaction?.categoryId) && category.type === categoryType && category.spaceId === spaceId), [categories, categoryType, editingTransaction, spaceId]);
  const rankedDestinations = useMemo(() => rankByHistory(destinationAccounts, transactions, spaceId, merchant, (transaction) => transaction.accountToId, (account) => account.id), [destinationAccounts, merchant, spaceId, transactions]);
  const rankedCategories = useMemo(() => rankByHistory(availableCategories, transactions, spaceId, merchant, (transaction) => transaction.categoryId, (category) => category.id), [availableCategories, merchant, spaceId, transactions]);
  const effectiveDestinationId = destinationId && destinationAccounts.some((account) => account.id === destinationId) ? destinationId : rankedDestinations[0]?.id ?? null;
  const effectiveCategoryId = categoryId && availableCategories.some((category) => category.id === categoryId) ? categoryId : forVerification || categoryMustBeChosen ? null : rankedCategories[0]?.id ?? null;
  const selectedAccount = accounts.find((account) => account.id === effectiveAccountId);
  const selectedDestination = accounts.find((account) => account.id === effectiveDestinationId);
  const selectedCategory = categories.find((category) => category.id === effectiveCategoryId);
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const availableCapitalOptions = capitalOptions.filter((item) => item.direction === 'both' || item.direction === type);
  const categoryLabel = (category?: Category | null) => {
    if (!category) return null;
    const path = [category.name];
    const seen = new Set([category.id]);
    let parentId = category.parentId;
    while (parentId && !seen.has(parentId)) {
      const parent = categories.find((item) => item.id === parentId);
      if (!parent) break;
      path.unshift(parent.name);
      seen.add(parent.id);
      parentId = parent.parentId;
    }
    return path.join(' › ');
  };
  const originalMatch = useMemo(() => {
    if (type !== 'refund' || !normalize(merchant)) return null;
    return transactions.find((transaction) => transaction.spaceId === spaceId && transaction.financialEffect === 'expense' && normalize(transaction.counterpartyName || transaction.merchant) === normalize(merchant)) ?? null;
  }, [merchant, spaceId, transactions, type]);
  const counterpartySuggestions = useMemo(() => {
    if (movesMoney) return [];
    const byName = new Map<string, CounterpartySuggestion>();
    counterparties.forEach((counterparty) => {
      const key = normalize(counterparty.name);
      if (key) byName.set(key, { id: counterparty.id, name: counterparty.name, count: 0, lastUsedAt: '' });
    });
    transactions.forEach((transaction) => {
      if (transaction.spaceId !== spaceId) return;
      const matchesType = type === 'income'
        ? transaction.type === 'income'
        : type === 'expense'
          ? transaction.financialEffect === 'expense'
          : type === 'refund'
            ? transaction.financialEffect === 'expense' || transaction.type === 'refund'
            : false;
      if (!matchesType) return;
      const name = transaction.counterpartyName?.trim() || transaction.merchant?.trim();
      const key = normalize(name);
      if (!name || !key) return;
      const current = byName.get(key);
      const transactionTime = new Date(transaction.transactionDate).getTime();
      const currentTime = current?.lastUsedAt ? new Date(current.lastUsedAt).getTime() : -Infinity;
      byName.set(key, {
        id: transaction.counterpartyId ?? current?.id ?? null,
        name: transactionTime >= currentTime ? name : current!.name,
        count: (current?.count ?? 0) + 1,
        lastUsedAt: transactionTime >= currentTime ? transaction.transactionDate : current!.lastUsedAt,
      });
    });
    return [...byName.values()].sort((left, right) => right.count - left.count || (right.lastUsedAt ? new Date(right.lastUsedAt).getTime() : 0) - (left.lastUsedAt ? new Date(left.lastUsedAt).getTime() : 0) || left.name.localeCompare(right.name));
  }, [counterparties, movesMoney, spaceId, transactions, type]);
  const parsedAmount = Number(amount.replace(/,/g, ''));
  const needsCategory = type === 'expense' || type === 'income' || type === 'refund';
  const valid = Boolean(spaceId && effectiveAccountId && parsedAmount > 0 && (!needsCategory || forVerification || effectiveCategoryId) && (!movesMoney || effectiveDestinationId && effectiveAccountId !== effectiveDestinationId));

  const selectType = (nextMode: EntryMode) => {
    const nextType = nextMode === 'verification' ? 'expense' : nextMode;
    const sameFinancialType = nextType === type;
    setCategoryMustBeChosen(forVerification && nextMode === 'expense');
    setType(nextType); setForVerification(nextMode === 'verification'); setError(null);
    if (!capitalOptions.some((item) => item.id === businessClassification && (item.direction === 'both' || item.direction === nextType))) setBusinessClassification('operating');
    if (sameFinancialType) return;
    const contextualAccountId = initialAccount?.isActive ? initialAccount.id : null;
    const contextIsCardDestination = nextType === 'credit_card_payment' && initialAccount?.type === 'credit_card';
    setAccountId(contextIsCardDestination ? null : contextualAccountId);
    setDestinationId(contextIsCardDestination ? contextualAccountId : null);
    setCategoryId(null); setCounterpartyId(null); setMatchedCounterpartyName(null);
  };
  const selectSpace = (nextSpaceId: string) => {
    if (effectiveAccountId) setAccountId(effectiveAccountId);
    if (movesMoney && effectiveDestinationId) setDestinationId(effectiveDestinationId);
    setSpaceId(nextSpaceId); setSelectedSpaceId(nextSpaceId);
    setCategoryId(null);
  };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true); setError(null);
    try {
      const draft: ParsedTransactionDraft = {
        transactionType: type,
        financialEffect: type === 'expense' ? 'expense' : type === 'income' || type === 'refund' ? 'income' : 'internal_transfer',
        paymentRail, amount: parsedAmount, currency: editingTransaction?.currency ?? 'PHP', merchant: type === 'income' ? null : merchant.trim() || null,
        counterpartyId, counterpartyName: merchant.trim() || null,
        counterpartyType: initialDraft?.counterpartyType ?? (movesMoney ? 'own_account' : type === 'expense' || type === 'refund' ? 'merchant' : 'unknown'),
        counterpartyIdentifiers: initialDraft?.counterpartyIdentifiers ?? {}, ownershipStatus: movesMoney ? 'owned' : 'external',
        spaceId, categoryId: needsCategory ? effectiveCategoryId : null, tagIds,
        accountFromId: type === 'income' || type === 'refund' ? null : effectiveAccountId,
        accountToId: type === 'income' || type === 'refund' ? effectiveAccountId : movesMoney ? effectiveDestinationId : null,
        paidByUserId: editingTransaction?.paidByUserId ?? members[0]?.id ?? null, transactionDate: transactionDate.toISOString(), notes: notes.trim() || null,
        originalMessage: initialDraft?.originalMessage ?? '', confidence: initialDraft?.confidence ?? 1, needsConfirmation: false,
        classificationReviewRequired: forVerification,
        businessClassification: selectedSpace?.type === 'business' ? businessClassification : 'operating',
        sourceKind: initialDraft?.sourceKind, referenceNumber: initialDraft?.referenceNumber,
        bankTransactionLabel: initialDraft?.bankTransactionLabel, rawExtraction: initialDraft?.rawExtraction,
      };
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, {
          type: draft.transactionType,
          financialEffect: draft.financialEffect,
          paymentRail: draft.paymentRail,
          amount: draft.amount,
          merchant: type === 'income' ? null : draft.merchant,
          counterpartyId: draft.counterpartyId ?? null,
          counterpartyName: draft.counterpartyName ?? null,
          ownershipStatus: draft.ownershipStatus ?? (movesMoney ? 'owned' : 'external'),
          spaceId: draft.spaceId!,
          categoryId: draft.categoryId,
          tagIds: draft.tagIds,
          accountFromId: draft.accountFromId,
          accountToId: draft.accountToId,
          paidByUserId: draft.paidByUserId,
          transactionDate: draft.transactionDate,
          notes: draft.notes,
          classificationReviewRequired: forVerification,
          businessClassification: draft.businessClassification ?? 'operating',
        });
      } else await saveDraft(draft);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this transaction.');
    } finally { setSaving(false); }
  };
  const remove = () => setDeleteOpen(true);
  const duplicate = () => {
    if (!editingTransaction || !valid) return;
    const duplicateDraft: ParsedTransactionDraft = {
      transactionType: type,
      financialEffect: type === 'expense' ? 'expense' : type === 'income' || type === 'refund' ? 'income' : 'internal_transfer',
      paymentRail,
      amount: parsedAmount,
      currency: editingTransaction.currency,
      merchant: type === 'income' ? null : merchant.trim() || null,
      counterpartyId,
      counterpartyName: merchant.trim() || null,
      counterpartyType: movesMoney ? 'own_account' : type === 'expense' || type === 'refund' ? 'merchant' : 'unknown',
      ownershipStatus: movesMoney ? 'owned' : 'external',
      spaceId,
      categoryId: needsCategory ? effectiveCategoryId : null,
      tagIds,
      accountFromId: type === 'income' || type === 'refund' ? null : effectiveAccountId,
      accountToId: type === 'income' || type === 'refund' ? effectiveAccountId : movesMoney ? effectiveDestinationId : null,
      paidByUserId: editingTransaction.paidByUserId,
      transactionDate: new Date().toISOString(),
      notes: notes.trim() || null,
      originalMessage: '',
      confidence: 1,
      needsConfirmation: false,
      classificationReviewRequired: forVerification,
      businessClassification: selectedSpace?.type === 'business' ? businessClassification : 'operating',
    };
    router.replace({ pathname: '/manual-transaction', params: { draft: JSON.stringify(duplicateDraft) } });
  };
  const reconciliationAccounts = editingTransaction ? transactionAccountIds(editingTransaction).map((id) => accounts.find((account) => account.id === id)).filter((account): account is Account => Boolean(account)) : [];
  const toggleReconciliation = async (reconciliationAccountId: string) => {
    if (!editingTransaction || reconciliationBusyAccountId) return;
    if (isTransactionReconciled(editingTransaction, reconciliationAccountId)) {
      setUnreconcileAccountId(reconciliationAccountId);
      return;
    }
    setReconciliationBusyAccountId(reconciliationAccountId); setError(null);
    try { await setTransactionsReconciled([editingTransaction.id], true, reconciliationAccountId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update reconciliation.'); }
    finally { setReconciliationBusyAccountId(null); }
  };
  const confirmUnreconcile = async () => {
    if (!editingTransaction || !unreconcileAccountId) return;
    setReconciliationBusyAccountId(unreconcileAccountId); setError(null);
    try { await setTransactionsReconciled([editingTransaction.id], false, unreconcileAccountId); }
    finally { setReconciliationBusyAccountId(null); }
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
  const accountOptions = groupAccountOptions(rankedAccounts, suggestedAccountId);
  const destinationOptions = groupAccountOptions(rankedDestinations, suggestedDestinationId);
  const availableCategoryIds = new Set(availableCategories.map((category) => category.id));
  const suggestedCategoryAncestors = new Set<string>();
  let suggestedParentId = categories.find((category) => category.id === suggestedCategoryId)?.parentId;
  while (suggestedParentId && availableCategoryIds.has(suggestedParentId) && !suggestedCategoryAncestors.has(suggestedParentId)) {
    suggestedCategoryAncestors.add(suggestedParentId);
    suggestedParentId = categories.find((category) => category.id === suggestedParentId)?.parentId ?? null;
  }
  const categoryOptions: SmartSelectOption[] = [
    ...(forVerification ? [{ id: '__clear_category__', label: 'Leave uncategorized', detail: 'Choose a category later' }] : []),
    ...rankedCategories.map((category) => {
      const path = categoryLabel(category)!;
      const parentId = category.parentId && availableCategoryIds.has(category.parentId) ? category.parentId : null;
      const label = category.parentId && !parentId ? path : category.name;
      return { id: category.id, parentId, label, detail: path !== label ? path : undefined, color: category.color, searchText: path, badge: category.id === suggestedCategoryId ? 'Suggested' : suggestedCategoryAncestors.has(category.id) ? 'Suggested inside' : undefined };
    }),
  ];
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
    if (picker === 'category') setCategoryId(id === '__clear_category__' ? null : id);
    if (picker === 'rail') setPaymentRail(id as PaymentRail);
    if (picker === 'tags') setTagIds((current) => current.includes(id) ? current.filter((tagId) => tagId !== id) : [...current, id]);
  };

  return (
    <View style={[styles.backdrop, desktop && styles.backdropDesktop]}>
      <KeyboardAvoidingView style={[styles.keyboard, desktop && styles.keyboardDesktop, desktop && { height: Math.min(820, height - spacing.huge) }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView edges={desktop ? [] : ['top', 'bottom']} style={[styles.card, desktop && styles.cardDesktop]}>
          <View style={styles.header}><View><AppText variant="h3">{editingTransaction ? 'Edit transaction' : 'Add manually'}</AppText><AppText variant="caption" style={styles.muted}>{editingTransaction ? 'Update transaction details' : 'Record a transaction'}</AppText></View><View style={styles.headerActions}>{editingTransaction && <Pressable accessibilityLabel="Delete transaction" onPress={remove} style={[styles.close, styles.delete]}><Ionicons name="trash-outline" size={20} color={colors.danger} /></Pressable>}<Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={22} color={colors.ink} /></Pressable></View></View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {transactionTypes.map((item) => { const selected = item.id === 'verification' ? forVerification : type === item.id && !forVerification; return <Pressable key={item.id} onPress={() => selectType(item.id)} style={({ pressed }) => [styles.typeOption, selected && styles.typeSelected, pressed && styles.pressed]}><Ionicons name={item.icon} size={17} color={selected ? colors.mintDeep : colors.slate} /><AppText variant="caption" style={selected ? styles.typeTextSelected : styles.muted}>{item.label}</AppText></Pressable>; })}
            </ScrollView>
            {forVerification ? <View style={styles.reviewWarning}><Ionicons name="help-circle-outline" size={19} color={colors.warning} /><AppText variant="caption" style={styles.reviewWarningText}>Records this as an expense now. Add the merchant or category when you remember. Select Expense and save to clear this flag.</AppText></View> : editingTransaction?.classificationReviewRequired && editingTransaction.type !== 'expense' && <View style={styles.reviewWarning}><Ionicons name="alert-circle-outline" size={19} color={colors.warning} /><AppText variant="caption" style={styles.reviewWarningText}>Confirm the transaction type and accounts before saving this older AI-classified transaction.</AppText></View>}
            <Pressable onPress={() => setPicker('space')} style={({ pressed }) => [styles.spacePill, pressed && styles.pressed]}><View style={[styles.spaceDot, { backgroundColor: selectedSpace?.color ?? colors.mint }]} /><AppText variant="caption" style={styles.spaceName}>{selectedSpace?.name ?? 'Choose space'}</AppText><Ionicons name="chevron-down" size={14} color={colors.slate} /></Pressable>
            <View style={styles.amountBlock}><AppText variant="eyebrow" style={styles.muted}>Amount</AppText><View style={styles.amountField}><AppText style={styles.currency}>₱</AppText><TextInput value={amount} onChangeText={setAmount} placeholder="0" placeholderTextColor={colors.borderStrong} keyboardType="decimal-pad" autoFocus style={styles.amountInput} /></View></View>
            <CounterpartyInput label={forVerification ? 'Merchant / description · optional' : labels.description} value={merchant} onChangeText={(value) => { setMerchant(value); if (normalize(value) !== normalize(matchedCounterpartyName)) { setCounterpartyId(null); setMatchedCounterpartyName(null); } }} placeholder={forVerification ? 'Add later if unknown' : labels.descriptionPlaceholder} suggestions={counterpartySuggestions} onSelect={(suggestion) => { setMerchant(suggestion.name); setCounterpartyId(suggestion.id); setMatchedCounterpartyName(suggestion.name); }} />
            <SmartSelectField label={labels.account} value={selectedAccount?.name} placeholder="Choose an account" onPress={() => setPicker('account')} hint={!accountId && selectedAccount?.id === suggestedAccountId ? 'Suggested from recent activity' : null} />
            {movesMoney && <SmartSelectField label={labels.destination} value={selectedDestination?.name} placeholder="Choose an account" onPress={() => setPicker('destination')} hint={!destinationId && selectedDestination?.id === suggestedDestinationId ? 'Suggested from recent activity' : null} />}
            {needsCategory && <SmartSelectField label={forVerification ? 'Category · optional' : type === 'refund' ? 'Original category' : 'Category'} value={categoryLabel(selectedCategory)} placeholder={forVerification ? 'Add later if unknown' : 'Choose a category'} onPress={() => setPicker('category')} hint={forVerification ? 'Leave blank until you can verify it' : categoryMustBeChosen && !categoryId ? 'Choose the correct category to mark this verified' : originalMatch?.categoryId === effectiveCategoryId ? 'Matched from the original transaction' : !categoryId && selectedCategory?.id === suggestedCategoryId ? 'Suggested from similar transactions' : null} />}
            <TransactionDateTimeField value={transactionDate} onChange={setTransactionDate} />
            <LabeledInput label="Notes · optional" value={notes} onChangeText={setNotes} placeholder="Add a note" multiline />
            <Pressable onPress={() => setMoreOpen((current) => !current)} style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}><View style={styles.moreTitle}><Ionicons name="options-outline" size={19} color={colors.slateDark} /><AppText variant="bodyMedium">More details</AppText></View><Ionicons name={moreOpen ? 'chevron-up' : 'chevron-down'} size={19} color={colors.slate} /></Pressable>
            {moreOpen && <View style={styles.moreDetails}>
              {selectedSpace?.type === 'business' && (type === 'income' || type === 'expense') && <View style={styles.classificationField}><View><AppText variant="eyebrow" style={styles.muted}>BUSINESS CLASSIFICATION</AppText><AppText variant="caption" style={styles.muted}>Capital and owner financing stay outside operating results.</AppText></View><View style={styles.classificationOptions}>{availableCapitalOptions.map((item) => <Pressable key={item.id} onPress={() => setBusinessClassification(item.id)} style={[styles.classificationOption, businessClassification === item.id && styles.classificationSelected]}><AppText variant="caption" style={businessClassification === item.id ? styles.classificationSelectedText : styles.muted}>{item.label}</AppText></Pressable>)}</View></View>}
              {editingTransaction && <View style={styles.reconciliationPanel}><View style={styles.reconciliationHeading}><View><AppText variant="eyebrow" style={styles.muted}>RECONCILIATION</AppText><AppText variant="caption" style={styles.muted}>Tracked independently for each linked account</AppText></View>{isTransactionReconciled(editingTransaction) && <View style={styles.reconciledPill}><Ionicons name="checkmark-circle" size={15} color={colors.mintDeep} /><AppText variant="caption" style={styles.reconciledText}>Fully reconciled</AppText></View>}</View>{reconciliationAccounts.map((account) => { const reconciled = isTransactionReconciled(editingTransaction, account.id); const reconciledAt = reconciliationDate(editingTransaction, account.id); return <Pressable key={account.id} accessibilityRole="checkbox" accessibilityState={{ checked: reconciled }} onPress={() => void toggleReconciliation(account.id)} style={({ pressed }) => [styles.reconciliationRow, pressed && styles.pressed]}><View style={[styles.reconciliationIcon, reconciled && styles.reconciliationIconDone]}><Ionicons name={reconciled ? 'checkmark' : 'ellipse-outline'} size={18} color={reconciled ? colors.mintDeep : colors.slate} /></View><View style={styles.reconciliationCopy}><AppText variant="bodyMedium">{account.name}</AppText><AppText variant="caption" style={styles.muted}>{reconciled && reconciledAt ? `Reconciled ${new Date(reconciledAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not reconciled'}</AppText></View>{reconciliationBusyAccountId === account.id ? <AppText variant="caption" style={styles.muted}>Saving…</AppText> : <AppText variant="caption" style={reconciled ? styles.unreconcileText : styles.reconcileText}>{reconciled ? 'Undo' : 'Mark reconciled'}</AppText>}</Pressable>; })}</View>}
              <SmartSelectField label="Payment method / rail" value={railLabels[paymentRail]} placeholder="Not specified" onPress={() => setPicker('rail')} hint="Separate from the financial account above" />
              {tags.length > 0 && <SmartSelectField label="Tags · optional" value={tagIds.length ? `${tagIds.length} selected` : null} placeholder="Choose tags" onPress={() => setPicker('tags')} />}
              {editingTransaction?.originalMessage && <View style={styles.original}><AppText variant="eyebrow" style={styles.muted}>Original message</AppText><AppText>“{editingTransaction.originalMessage}”</AppText></View>}
            </View>}
          </ScrollView>
          <View style={styles.footer}>{error ? <AppText variant="caption" style={styles.error}>{error}</AppText> : null}{editingTransaction && <Button label="Duplicate transaction" variant="secondary" icon="copy-outline" disabled={!valid || saving} onPress={duplicate} />}<Button label={editingTransaction ? 'Save changes' : forVerification ? 'Save for verification' : 'Save transaction'} icon="checkmark" loading={saving} disabled={!valid} onPress={submit} /></View>
        </SafeAreaView>
      </KeyboardAvoidingView>
      <SmartSelectSheet visible={picker !== null} title={sheetConfig.title} options={sheetConfig.options} selectedIds={sheetConfig.ids} searchPlaceholder={sheetConfig.placeholder} multiple={picker === 'tags'} hierarchical={picker === 'category'} onClose={() => setPicker(null)} onSelect={handleSheetSelect} />
      {editingTransaction && <ConfirmActionDialog visible={deleteOpen} title="Delete this transaction?" message="It will be removed from your workspace history and analytics." confirmLabel="Delete transaction" onClose={() => setDeleteOpen(false)} onConfirm={async () => { await deleteTransaction(editingTransaction.id); router.back(); }} />}
      {editingTransaction && <ConfirmActionDialog visible={Boolean(unreconcileAccountId)} title="Undo reconciliation?" message={`This will mark the ${accounts.find((account) => account.id === unreconcileAccountId)?.name ?? 'selected account'} side of this transaction as unreconciled. Only continue if you need to correct a confirmed reconciliation.`} confirmLabel="Mark unreconciled" onClose={() => setUnreconcileAccountId(null)} onConfirm={confirmUnreconcile} />}
    </View>
  );
}

function LabeledInput({ label, value, onChangeText, placeholder, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean }) {
  return <View style={styles.field}><AppText variant="eyebrow" style={styles.muted}>{label}</AppText><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.slate} multiline={multiline} style={[styles.textInput, multiline && styles.multiline]} /></View>;
}

function CounterpartyInput({ label, value, onChangeText, placeholder, suggestions, onSelect }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; suggestions: CounterpartySuggestion[]; onSelect: (suggestion: CounterpartySuggestion) => void }) {
  const [open, setOpen] = useState(false);
  const query = normalize(value);
  const visible = suggestions.filter((item) => !query || normalize(item.name).includes(query)).slice(0, 6);
  return <View style={styles.field}>
    <AppText variant="eyebrow" style={styles.muted}>{label}</AppText>
    <View style={styles.counterpartyInputWrap}><Ionicons name="business-outline" size={19} color={colors.slate} /><TextInput value={value} onFocus={() => setOpen(true)} onChangeText={(next) => { onChangeText(next); setOpen(true); }} placeholder={placeholder} placeholderTextColor={colors.slate} autoCapitalize="words" autoCorrect={false} style={styles.counterpartyInput} />{value ? <Pressable accessibilityLabel="Clear name" onPress={() => { onChangeText(''); setOpen(true); }}><Ionicons name="close-circle" size={19} color={colors.slate} /></Pressable> : null}</View>
    {open && visible.length > 0 && <View style={styles.counterpartySuggestions}>{visible.map((item, index) => <Pressable key={`${item.id ?? normalize(item.name)}-${item.name}`} onPress={() => { onSelect(item); setOpen(false); }} style={({ pressed }) => [styles.counterpartySuggestion, index > 0 && styles.counterpartyBorder, pressed && styles.pressed]}><View style={styles.counterpartyIcon}><Ionicons name="business" size={17} color={colors.mintDeep} /></View><View style={styles.counterpartyText}><AppText variant="bodyMedium">{item.name}</AppText><AppText variant="caption" style={styles.muted}>{item.count ? `${item.count === 1 ? 'Used once' : `Used ${item.count} times`} · Last ${new Date(item.lastUsedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : 'Saved name'}</AppText></View><Ionicons name="arrow-forward" size={16} color={colors.slate} /></Pressable>)}</View>}
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.softWhite },
  backdropDesktop: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl, backgroundColor: 'rgba(18, 25, 35, 0.16)' },
  keyboard: { flex: 1, width: '100%' },
  keyboardDesktop: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 580 },
  card: { flex: 1, backgroundColor: colors.softWhite },
  cardDesktop: { borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  header: { minHeight: 68, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.white },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  delete: { backgroundColor: colors.dangerWash },
  scroll: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxxl },
  typeRow: { gap: spacing.sm, paddingRight: spacing.xl },
  typeOption: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  typeSelected: { backgroundColor: colors.mintWash, borderColor: colors.mintMist },
  typeTextSelected: { color: colors.mintDeep },
  reviewWarning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.warningWash, borderRadius: radii.md, padding: spacing.md },
  reviewWarningText: { flex: 1, color: colors.slateDark },
  spacePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.surface },
  spaceDot: { width: 8, height: 8, borderRadius: 4 },
  spaceName: { color: colors.slateDark },
  amountBlock: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  amountField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  currency: { fontFamily: typography.semibold, fontSize: 30, color: colors.slate, marginRight: 4 },
  amountInput: { minWidth: 90, maxWidth: '80%', fontFamily: typography.bold, fontSize: 54, lineHeight: 64, letterSpacing: -2.2, color: colors.neutralAmount, textAlign: 'center', outlineStyle: 'none' } as never,
  field: { gap: spacing.sm },
  textInput: { minHeight: 56, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: typography.regular, fontSize: 16, color: colors.ink, outlineStyle: 'none' } as never,
  counterpartyInputWrap: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md }, counterpartyInput: { flex: 1, minHeight: 54, fontFamily: typography.regular, fontSize: 16, color: colors.ink, outlineStyle: 'none' } as never,
  counterpartySuggestions: { marginTop: -spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white, overflow: 'hidden' }, counterpartySuggestion: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md }, counterpartyBorder: { borderTopWidth: 1, borderTopColor: colors.border }, counterpartyIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash }, counterpartyText: { flex: 1, gap: 2 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  moreToggle: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  moreTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  moreDetails: { gap: spacing.xl },
  classificationField: { gap: spacing.sm },
  classificationOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  classificationOption: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  classificationSelected: { borderColor: colors.mintDark, backgroundColor: colors.mintWash },
  classificationSelectedText: { color: colors.mintDeep },
  reconciliationPanel: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white, padding: spacing.md, gap: spacing.sm },
  reconciliationHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingBottom: spacing.xs },
  reconciledPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.pill, backgroundColor: colors.mintWash, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  reconciledText: { color: colors.mintDeep },
  reconciliationRow: { minHeight: 56, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  reconciliationIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  reconciliationIconDone: { backgroundColor: colors.mintWash },
  reconciliationCopy: { flex: 1, minWidth: 0 },
  reconcileText: { color: colors.mintDeep },
  unreconcileText: { color: colors.slate },
  original: { gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, padding: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  muted: { color: colors.slate }, error: { color: colors.danger, textAlign: 'center' }, pressed: { opacity: 0.72 },
});
