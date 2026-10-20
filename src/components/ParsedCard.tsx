import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, radii, spacing } from '@/theme';
import type { ParsedTransactionDraft } from '@/types/finance';
import { AppText, Button, IconCircle } from './ui';

export function ParsedCard({ draft, status = 'draft', saving = false, onConfirm, onEdit, onUndo, onOwnershipSelect, onAccountSelect, onCategorySelect, onSpaceSelect }: { draft: ParsedTransactionDraft; status?: 'draft' | 'saved'; saving?: boolean; onConfirm?: () => void; onEdit?: () => void; onUndo?: () => void; onOwnershipSelect?: (ownership: 'external' | 'owned') => void; onAccountSelect?: (accountId: string) => void; onCategorySelect?: (categoryId: string) => void; onSpaceSelect?: (spaceId: string) => void }) {
  const { accounts, categories, members, spaces } = useFinance();
  const category = categories.find((item) => item.id === draft.categoryId);
  const account = accounts.find((item) => item.id === draft.accountFromId);
  const destination = accounts.find((item) => item.id === draft.accountToId);
  const member = members.find((item) => item.id === draft.paidByUserId);
  const space = spaces.find((item) => item.id === draft.spaceId);
  const parent = categories.find((item) => item.id === category?.parentId);
  const label = draft.financialEffect === 'internal_transfer' ? 'internal transfer' : (draft.financialEffect ?? draft.transactionType).replaceAll('_', ' ');
  const amountTone = draft.financialEffect === 'income' ? styles.incomeAmount : draft.financialEffect === 'expense' ? styles.expenseAmount : styles.neutralAmount;
  const clarification = draft.clarification ?? (draft.ownershipStatus === 'unknown'
    ? { type: 'ownership' as const, question: draft.confirmationQuestion ?? 'Is this a payment or one of your own accounts?' }
    : draft.candidateAccountIds?.length
      ? { type: 'account' as const, question: draft.confirmationQuestion ?? 'Which account should I use?', accountIds: draft.candidateAccountIds }
      : draft.candidateSpaceIds?.length
        ? { type: 'space' as const, question: draft.confirmationQuestion ?? 'Which Space is this for?', spaceIds: draft.candidateSpaceIds }
        : draft.candidateCategoryIds?.length
          ? { type: 'category' as const, question: draft.confirmationQuestion ?? 'What was this for?', categoryIds: draft.candidateCategoryIds }
          : draft.needsConfirmation && draft.amount <= 0
            ? { type: 'amount' as const, question: draft.confirmationQuestion ?? 'How much was the transaction?' }
            : null);
  const hasCandidates = Boolean(clarification?.type === 'ownership' || clarification?.type === 'account' && clarification.accountIds.length || clarification?.type === 'category' && clarification.categoryIds.length || clarification?.type === 'space' && clarification.spaceIds.length);
  return (
    <View style={[styles.card, status === 'saved' && styles.savedCard]}>
      <View style={styles.statusRow}>
        <IconCircle name={draft.needsConfirmation ? 'help' : 'checkmark'} size={status === 'saved' ? 26 : 30} background={draft.needsConfirmation ? colors.warningWash : colors.mintWash} color={draft.needsConfirmation ? colors.warning : colors.mintDark} />
        <View style={styles.statusCopy}><AppText variant="bodyMedium">{draft.needsConfirmation ? 'One quick check' : status === 'saved' ? `${label} saved` : `Looks like ${label}`}</AppText>{draft.sourceKind === 'image' && <AppText variant="caption" style={styles.imageSource}>Read from image · review required</AppText>}</View>
      </View>
      {draft.possibleDuplicate && <View style={styles.duplicate}><Ionicons name="copy-outline" size={18} color={colors.warning} /><AppText variant="caption" style={styles.duplicateText}>Possible duplicate: a similar recent transaction already exists.</AppText></View>}
      {draft.needsConfirmation ? (
        <View style={styles.questionWrap}>
          <AppText variant="h3">{clarification?.question ?? draft.confirmationQuestion ?? 'Please review the missing transaction details.'}</AppText>
          {clarification?.type === 'ownership' && <View style={styles.ownershipActions}><Button label="Payment / expense" variant="secondary" icon="arrow-up-outline" onPress={() => onOwnershipSelect?.('external')} style={styles.flex} /><Button label="My own account" variant="secondary" icon="swap-horizontal-outline" onPress={() => onOwnershipSelect?.('owned')} style={styles.flex} /></View>}
          <View style={styles.options}>{clarification?.type === 'account' && clarification.accountIds.map((id) => {
            const candidate = accounts.find((item) => item.id === id);
            return candidate ? <Pressable key={id} onPress={() => onAccountSelect?.(id)} style={styles.option}><Ionicons name={candidate.type === 'credit_card' ? 'card-outline' : 'wallet-outline'} size={19} color={candidate.accent} /><AppText variant="bodyMedium">{candidate.name}</AppText><Ionicons name="chevron-forward" size={17} color={colors.slate} /></Pressable> : null;
          })}{clarification?.type === 'category' && clarification.categoryIds.map((id) => {
            const candidate = categories.find((item) => item.id === id);
            const candidateParent = categories.find((item) => item.id === candidate?.parentId);
            return candidate ? <Pressable key={id} onPress={() => onCategorySelect?.(id)} style={styles.option}><Ionicons name={candidate.icon as keyof typeof Ionicons.glyphMap} size={19} color={candidate.color} /><AppText variant="bodyMedium">{candidateParent ? `${candidateParent.name} › ` : ''}{candidate.name}</AppText><Ionicons name="chevron-forward" size={17} color={colors.slate} /></Pressable> : null;
          })}{clarification?.type === 'space' && clarification.spaceIds.map((id) => {
            const candidate = spaces.find((item) => item.id === id);
            return candidate ? <Pressable key={id} onPress={() => onSpaceSelect?.(id)} style={styles.option}><Ionicons name={candidate.icon as keyof typeof Ionicons.glyphMap} size={19} color={candidate.color} /><AppText variant="bodyMedium">{candidate.name}</AppText><Ionicons name="chevron-forward" size={17} color={colors.slate} /></Pressable> : null;
          })}</View>
          {!hasCandidates && <Button label="Review manually" variant="secondary" icon="create-outline" onPress={() => onEdit?.()} />}
        </View>
      ) : (
        <>
          <View style={styles.amountRow}><View><AppText variant="display" style={[amountTone, status === 'saved' && styles.savedAmount]}>{formatPeso(draft.amount)}</AppText><AppText style={styles.merchant}>{draft.counterpartyName ? `${draft.financialEffect === 'expense' ? 'Paid to ' : draft.financialEffect === 'income' ? 'Received from ' : ''}${draft.counterpartyName}` : draft.merchant ?? label}</AppText></View><AppText variant="caption" style={styles.confidence}>{Math.round(draft.confidence * 100)}% match</AppText></View>
          <View style={[styles.details, status === 'saved' && styles.savedDetails]}>
            <Detail icon="grid-outline" label="Space" value={space?.name ?? 'Not set'} />
            {draft.financialEffect !== 'internal_transfer' && <Detail icon="pricetag-outline" label="Category" value={category ? `${parent ? `${parent.name} › ` : ''}${category.name}` : 'Not categorized'} />}
            <Detail icon="wallet-outline" label={draft.transactionType === 'income' ? 'To' : 'Account'} value={draft.transactionType === 'income' ? destination?.name ?? 'Not set' : account?.name ?? 'Not set'} />
            {(draft.transactionType === 'transfer' || draft.transactionType === 'credit_card_payment') && <Detail icon="arrow-forward-outline" label="To" value={destination?.name ?? 'Not set'} />}
            {draft.paymentRail && draft.paymentRail !== 'unknown' && <Detail icon="git-network-outline" label="Via" value={draft.paymentRail.replaceAll('_', ' ')} />}
            <Detail icon="calendar-outline" label="Date" value={new Date(draft.transactionDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} />
            {member && <Detail icon="person-outline" label="By" value={member.fullName} />}
            {draft.referenceNumber && <Detail icon="document-text-outline" label="Reference" value={draft.referenceNumber} />}
          </View>
          {Boolean(draft.evidence?.length) && <View style={styles.evidence}><AppText variant="eyebrow" style={styles.evidenceTitle}>FOUND IN IMAGE</AppText>{draft.evidence!.slice(0, 3).map((item) => <View key={item} style={styles.evidenceLine}><Ionicons name="scan-outline" size={15} color={colors.slate} /><AppText variant="caption" style={styles.evidenceText}>{item}</AppText></View>)}</View>}
          <View style={[styles.actions, status === 'saved' && styles.savedActions]}>{status === 'saved' ? <><Button label="Undo" variant="ghost" onPress={() => onUndo?.()} style={styles.savedFlexButton} /><Button label="Edit" variant="secondary" onPress={() => onEdit?.()} style={styles.savedFlexButton} /></> : <><Button label="Edit" variant="secondary" onPress={() => onEdit?.()} style={styles.flex} /><Button label="Save" icon="checkmark" loading={saving} onPress={() => onConfirm?.()} style={styles.flex} /></>}</View>
        </>
      )}
    </View>
  );
}

function Detail({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return <View style={styles.detail}><Ionicons name={icon} size={16} color={colors.slate} /><AppText variant="caption" style={styles.detailLabel}>{label}</AppText><AppText variant="bodyMedium" style={styles.detailValue}>{value}</AppText></View>;
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  savedCard: { gap: spacing.md, padding: spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusCopy: { flex: 1 },
  imageSource: { color: colors.slate, marginTop: 1 },
  duplicate: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.warningWash, padding: spacing.md, borderRadius: radii.sm },
  duplicateText: { flex: 1, color: colors.slateDark },
  questionWrap: { gap: spacing.lg },
  options: { gap: spacing.sm },
  ownershipActions: { flexDirection: 'row', gap: spacing.sm },
  option: { minHeight: 52, borderRadius: radii.md, backgroundColor: colors.surface, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  savedAmount: { fontSize: 32, lineHeight: 38, letterSpacing: -1 },
  expenseAmount: { color: colors.expense },
  incomeAmount: { color: colors.income },
  neutralAmount: { color: colors.neutralAmount },
  merchant: { color: colors.slate, textTransform: 'capitalize' },
  confidence: { color: colors.mintDeep, backgroundColor: colors.mintWash, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  details: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  savedDetails: { gap: spacing.sm, paddingTop: spacing.md },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailLabel: { width: 62, color: colors.slate },
  detailValue: { flex: 1, textAlign: 'right' },
  evidence: { gap: spacing.sm, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radii.sm },
  evidenceTitle: { color: colors.slate },
  evidenceLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  evidenceText: { flex: 1, color: colors.slateDark },
  actions: { flexDirection: 'row', gap: spacing.sm },
  savedActions: { marginTop: -spacing.xs },
  savedFlexButton: { flex: 1, minHeight: 44, paddingHorizontal: spacing.md },
  flex: { flex: 1 },
});
