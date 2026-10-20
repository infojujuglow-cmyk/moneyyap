import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ChatComposer } from '@/components/ChatComposer';
import { ParsedCard } from '@/components/ParsedCard';
import { AppText, BrandMark, Chip } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { pickTransactionImage, type TransactionImageSource } from '@/services/image-attachments';
import { colors, formatPeso, radii, spacing } from '@/theme';
import type { ConversationMessage, ImageTransactionAnalysis, ParsedTransactionDraft, Transaction, TransactionImageAttachment } from '@/types/finance';

const examples = ['How much did I spend on Food?', 'Spent ₱850 on dinner using Maya', 'Show spending by account'];

export default function AddScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const params = useLocalSearchParams<{ message?: string }>();
  const { sendChatMessage, loadLatestConversation, clearConversationClarification, parseTransactionImage, saveDraft, rememberOwnAccountMapping, deleteTransaction, accounts, categories, spaces, workspaceId } = useFinance();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<TransactionImageAttachment | null>(null);
  const [analysis, setAnalysis] = useState<ImageTransactionAnalysis | null>(null);
  const [drafts, setDrafts] = useState<ParsedTransactionDraft[]>([]);
  const [saved, setSaved] = useState<Record<number, Transaction>>({});
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    loadLatestConversation().then((result) => {
      if (!cancelled) { setConversationId(result.conversationId); setMessages(result.messages); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [loadLatestConversation, workspaceId]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { showSubscription.remove(); hideSubscription.remove(); };
  }, []);

  const copyChatMessage = async (content: string) => {
    try {
      await Share.share({ message: content }, { dialogTitle: 'Copy MoneyYap message' });
    } catch {
      // A dismissed system share sheet is not an app error.
    }
  };

  const handleSend = useCallback(async (message: string) => {
    setUserMessage(message);
    setAttachment(null);
    setDrafts([]);
    setSaved({});
    setAnalysis(null);
    setError(null);
    setLoading(true);
    try {
      const result = await sendChatMessage(message, conversationId);
      setConversationId(result.conversationId);
      setMessages(result.messages);
      setSuggestedActions(result.suggestedActions);
      setUserMessage(null);
      if (result.drafts.length) {
        setDrafts(result.drafts);
        if (result.drafts.every((draft) => !draft.needsConfirmation && !draft.possibleDuplicate)) {
          const savedTransactions: Record<number, Transaction> = {};
          for (const [index, draft] of result.drafts.entries()) savedTransactions[index] = await saveDraft(draft);
          setSaved(savedTransactions);
          await clearConversationClarification(result.conversationId);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'I couldn’t read that. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [clearConversationClarification, conversationId, saveDraft, sendChatMessage]);

  useEffect(() => {
    if (params.message && handled.current !== params.message) {
      handled.current = params.message;
      handleSend(params.message);
    }
  }, [handleSend, params.message]);

  const analyzeImage = async (source: TransactionImageSource) => {
    try {
      const selected = await pickTransactionImage(source);
      if (!selected) return;
      setDrafts([]); setSaved({}); setAnalysis(null); setError(null); setSuggestedActions([]);
      setAttachment(selected);
      setUserMessage(source === 'camera' ? 'Photographed a receipt' : 'Sent a transaction image');
      setLoading(true);
      const result = await parseTransactionImage(selected, '', conversationId);
      setAnalysis(result);
      if (result.conversationId) setConversationId(result.conversationId);
      if (result.messages?.length) setMessages(result.messages);
      setUserMessage(null);
      setDrafts(result.drafts);
      if (!result.drafts.length) setError('I couldn’t find a completed transaction in that image. Try cropping around the amount, merchant, and date.');
      else if (result.drafts.every((draft) => !draft.needsConfirmation && !draft.possibleDuplicate)) {
        const savedTransactions: Record<number, Transaction> = {};
        for (const [index, draft] of result.drafts.entries()) savedTransactions[index] = await saveDraft(draft);
        setSaved(savedTransactions);
        await clearConversationClarification(result.conversationId ?? conversationId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'I couldn’t analyze that image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openAttachmentMenu = () => {
    if (loading) return;
    if (Platform.OS === 'web') {
      analyzeImage('library');
      return;
    }
    Alert.alert('Add a transaction image', 'MoneyYap can read a screenshot, bank confirmation, or receipt.', [
      { text: 'Choose from Photos', onPress: () => analyzeImage('library') },
      { text: 'Take a photo', onPress: () => analyzeImage('camera') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const updateDraft = (index: number, next: ParsedTransactionDraft) => {
    setDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? next : item));
  };

  const chooseAccount = async (index: number, accountId: string) => {
    const draft = drafts[index];
    if (!draft) return;
    const incoming = draft.transactionType === 'income' || draft.transactionType === 'refund';
    const choosingDestination = !incoming && (draft.transactionType === 'transfer' || draft.transactionType === 'credit_card_payment') && Boolean(draft.accountFromId) && !draft.accountToId;
    const account = accounts.find((item) => item.id === accountId);
    const inferredSpaceId = draft.spaceId ?? account?.spaceId ?? null;
    const accountFromId = incoming ? null : choosingDestination ? draft.accountFromId : accountId;
    const accountToId = incoming || choosingDestination ? accountId : draft.accountToId;
    const stillMissingAccount = incoming ? !accountToId : draft.financialEffect === 'internal_transfer' || draft.transactionType === 'transfer' || draft.transactionType === 'credit_card_payment' ? !accountFromId || !accountToId : !accountFromId;
    const resolvedInternalTransfer = draft.financialEffect === 'internal_transfer' && Boolean(accountFromId && accountToId && accountFromId !== accountToId);
    const missingCategory = (draft.financialEffect === 'expense' || draft.financialEffect === 'income') && !draft.categoryId && draft.rawExtraction?.movement_kind !== 'fee';
    const remainingCandidates = stillMissingAccount ? accounts
      .filter((item) => item.isActive && item.id !== accountFromId && (!inferredSpaceId || !item.spaceId || item.spaceId === inferredSpaceId))
      .filter((item) => draft.transactionType !== 'credit_card_payment' || (accountFromId ? item.type === 'credit_card' : item.type !== 'credit_card'))
      .map((item) => item.id) : undefined;
    const confirmed: ParsedTransactionDraft = {
      ...draft,
      accountFromId,
      accountToId,
      ownershipStatus: resolvedInternalTransfer ? 'owned' : draft.ownershipStatus,
      spaceId: inferredSpaceId,
      needsConfirmation: !inferredSpaceId || stillMissingAccount || missingCategory,
      confirmationQuestion: !inferredSpaceId ? 'Which Space is this for?' : stillMissingAccount ? 'Which account should I use?' : missingCategory ? 'What was this for?' : undefined,
      candidateAccountIds: remainingCandidates,
      candidateCategoryIds: !stillMissingAccount && missingCategory ? categories.filter((item) => item.type === (draft.transactionType === 'refund' ? 'expense' : draft.financialEffect === 'income' ? 'income' : 'expense') && item.spaceId === inferredSpaceId && !item.isArchived).map((item) => item.id) : undefined,
      candidateSpaceIds: !inferredSpaceId ? spaces.filter((item) => !item.isArchived).map((item) => item.id) : undefined,
      clarification: !inferredSpaceId
        ? { type: 'space', question: 'Which Space is this for?', spaceIds: spaces.filter((item) => !item.isArchived).map((item) => item.id) }
        : stillMissingAccount
          ? { type: 'account', question: 'Which account should I use?', accountIds: remainingCandidates ?? [] }
          : missingCategory
            ? { type: 'category', question: 'What was this for?', categoryIds: categories.filter((item) => item.type === (draft.transactionType === 'refund' ? 'expense' : draft.financialEffect === 'income' ? 'income' : 'expense') && item.spaceId === inferredSpaceId && !item.isArchived).map((item) => item.id) }
            : null,
      confidence: Math.max(draft.confidence, 0.92),
    };
    await clearConversationClarification(conversationId);
    if (confirmed.financialEffect === 'internal_transfer' && confirmed.accountToId && confirmed.ownershipStatus === 'owned') {
      await rememberOwnAccountMapping(confirmed, confirmed.accountToId);
    }
    updateDraft(index, confirmed);
    if (confirmed.sourceKind !== 'image' && !confirmed.needsConfirmation) {
      const transaction = await saveDraft(confirmed);
      setSaved((items) => ({ ...items, [index]: transaction }));
    }
  };

  const chooseSpace = async (index: number, spaceId: string) => {
    const draft = drafts[index];
    if (!draft) return;
    const requiresSource = draft.transactionType === 'expense' || draft.transactionType === 'transfer' || draft.transactionType === 'credit_card_payment';
    const requiresDestination = draft.transactionType === 'income' || draft.transactionType === 'refund' || draft.transactionType === 'transfer' || draft.transactionType === 'credit_card_payment';
    const missingAccount = (requiresSource && !draft.accountFromId) || (requiresDestination && !draft.accountToId);
    const missingCategory = (draft.financialEffect === 'expense' || draft.financialEffect === 'income') && !draft.categoryId && draft.rawExtraction?.movement_kind !== 'fee';
    const candidates = accounts
      .filter((item) => item.isActive && (!item.spaceId || item.spaceId === spaceId))
      .filter((item) => draft.transactionType !== 'credit_card_payment' || (draft.accountFromId ? item.type === 'credit_card' : item.type !== 'credit_card'));
    const confirmed = {
      ...draft,
      spaceId,
      needsConfirmation: missingAccount || missingCategory,
      confirmationQuestion: missingAccount ? 'Which account should I use?' : missingCategory ? 'What was this for?' : undefined,
      candidateSpaceIds: undefined,
      candidateAccountIds: missingAccount ? candidates.map((item) => item.id) : undefined,
      candidateCategoryIds: !missingAccount && missingCategory ? categories.filter((item) => item.type === (draft.transactionType === 'refund' ? 'expense' : draft.financialEffect === 'income' ? 'income' : 'expense') && item.spaceId === spaceId && !item.isArchived).map((item) => item.id) : undefined,
      clarification: missingAccount
        ? { type: 'account' as const, question: 'Which account should I use?', accountIds: candidates.map((item) => item.id) }
        : missingCategory
          ? { type: 'category' as const, question: 'What was this for?', categoryIds: categories.filter((item) => item.type === (draft.transactionType === 'refund' ? 'expense' : draft.financialEffect === 'income' ? 'income' : 'expense') && item.spaceId === spaceId && !item.isArchived).map((item) => item.id) }
          : null,
      confidence: Math.max(draft.confidence, 0.92),
    };
    await clearConversationClarification(conversationId);
    updateDraft(index, confirmed);
    if (confirmed.sourceKind !== 'image' && !confirmed.needsConfirmation) {
      const transaction = await saveDraft(confirmed);
      setSaved((items) => ({ ...items, [index]: transaction }));
    }
  };

  const chooseCategory = async (index: number, categoryId: string) => {
    const draft = drafts[index];
    if (!draft) return;
    const confirmed = { ...draft, categoryId, candidateCategoryIds: undefined, needsConfirmation: false, confirmationQuestion: undefined, clarification: null, confidence: Math.max(draft.confidence, 0.92) };
    await clearConversationClarification(conversationId);
    updateDraft(index, confirmed);
    if (confirmed.sourceKind !== 'image') {
      const transaction = await saveDraft(confirmed);
      setSaved((items) => ({ ...items, [index]: transaction }));
    }
  };

  const chooseOwnership = async (index: number, ownership: 'external' | 'owned') => {
    const draft = drafts[index];
    if (!draft) return;
    if (ownership === 'external') {
      const missingSource = !draft.accountFromId;
      const missingSpace = !draft.spaceId;
      const missingCategory = !draft.categoryId;
      updateDraft(index, {
        ...draft, transactionType: 'expense', financialEffect: 'expense', ownershipStatus: 'external', accountToId: null,
        needsConfirmation: missingSource || missingSpace || missingCategory,
        confirmationQuestion: missingSource ? 'Which account did you pay with?' : missingSpace ? 'Which Space is this for?' : missingCategory ? 'What was this for?' : undefined,
        candidateAccountIds: missingSource ? accounts.filter((item) => item.isActive).map((item) => item.id) : undefined,
        candidateSpaceIds: !missingSource && missingSpace ? spaces.filter((item) => !item.isArchived).map((item) => item.id) : undefined,
        candidateCategoryIds: !missingSource && !missingSpace && missingCategory ? categories.filter((item) => item.type === 'expense' && item.spaceId === draft.spaceId && !item.isArchived).map((item) => item.id) : undefined,
        clarification: missingSource
          ? { type: 'account', question: 'Which account did you pay with?', accountIds: accounts.filter((item) => item.isActive).map((item) => item.id) }
          : missingSpace
            ? { type: 'space', question: 'Which Space is this for?', spaceIds: spaces.filter((item) => !item.isArchived).map((item) => item.id) }
            : missingCategory
              ? { type: 'category', question: 'What was this for?', categoryIds: categories.filter((item) => item.type === 'expense' && item.spaceId === draft.spaceId && !item.isArchived).map((item) => item.id) }
              : null,
      });
      await clearConversationClarification(conversationId);
      return;
    }
    const missingSource = !draft.accountFromId;
    updateDraft(index, {
      ...draft, transactionType: 'transfer', financialEffect: 'internal_transfer', ownershipStatus: 'owned', categoryId: null,
      needsConfirmation: true,
      confirmationQuestion: missingSource ? 'Which account did the money come from?' : 'Which of your accounts received it?',
      candidateAccountIds: accounts.filter((item) => item.isActive && item.id !== draft.accountFromId).map((item) => item.id),
      candidateCategoryIds: undefined,
      clarification: { type: 'account', question: missingSource ? 'Which account did the money come from?' : 'Which of your accounts received it?', accountIds: accounts.filter((item) => item.isActive && item.id !== draft.accountFromId).map((item) => item.id) },
    });
    await clearConversationClarification(conversationId);
  };

  const saveAt = async (index: number) => {
    const draft = drafts[index];
    if (!draft || saved[index]) return;
    setSavingIndex(index);
    setError(null);
    try {
      const transaction = await saveDraft(draft);
      setSaved((items) => ({ ...items, [index]: transaction }));
      await clearConversationClarification(conversationId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That transaction could not be saved.');
    } finally {
      setSavingIndex(null);
    }
  };

  const undoAt = async (index: number) => {
    const transaction = saved[index];
    if (!transaction) return;
    setError(null);
    try {
      await deleteTransaction(transaction.id);
      setSaved((items) => { const next = { ...items }; delete next[index]; return next; });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to undo this transaction.');
    }
  };

  const reset = () => {
    setConversationId(null);
    setMessages([]);
    setSuggestedActions([]);
    setUserMessage(null);
    setAttachment(null);
    setAnalysis(null);
    setDrafts([]);
    setSaved({});
    setError(null);
  };
  const editDraft = (draft: ParsedTransactionDraft) => router.push({
    pathname: '/manual-transaction',
    params: { draft: JSON.stringify(draft) },
  });
  const savedTransactions = drafts.reduce<Transaction[]>((items, _draft, index) => {
    const transaction = saved[index];
    if (transaction) items.push(transaction);
    return items;
  }, []);
  const allSaved = drafts.length > 0 && savedTransactions.length === drafts.length;
  const savedReply = (() => {
    const transaction = savedTransactions.length === 1 ? savedTransactions[0] : null;
    if (transaction) {
      const verb = transaction.financialEffect === 'income' ? 'received from' : transaction.financialEffect === 'internal_transfer' ? 'moved between your accounts' : 'paid to';
      const counterparty = transaction.counterpartyName ? ` ${verb} ${transaction.counterpartyName}` : transaction.financialEffect === 'internal_transfer' ? ` ${verb}` : '';
      return `Added ${formatPeso(transaction.amount)}${counterparty}.`;
    }
    return `Added ${savedTransactions.length} transactions totaling ${formatPeso(savedTransactions.reduce((total, item) => total + item.amount, 0))}.`;
  })();

  return (
    <KeyboardAvoidingView style={[styles.screen, desktop && styles.desktopScreen]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
      <View style={[styles.header, desktop && styles.desktopHeader]}><View style={styles.brand}>{!desktop && <BrandMark size={37} />}<View><AppText variant="h3">{desktop ? 'Talk to MoneyYap' : <>Money<AppText variant="h3" style={styles.brandAccent}>Yap</AppText></>}</AppText><View style={styles.online}><View style={styles.onlineDot} /><AppText variant="caption" style={styles.onlineText}>Ready to listen</AppText></View></View></View><Pressable onPress={() => router.push('/manual-transaction')} style={styles.manual}><Ionicons name="create-outline" size={18} color={colors.ink} /><AppText variant="caption">Manual</AppText></Pressable></View>
      <ScrollView contentContainerStyle={[styles.conversation, desktop && styles.desktopConversation]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!messages.length && !userMessage && !attachment ? <View style={styles.welcome}><View style={styles.markLarge}><BrandMark size={74} /></View><AppText variant="h1" style={styles.center}>Just talk. We track.</AppText><AppText style={styles.welcomeBody}>Record what happened—or ask a question about your actual MoneyYap data.</AppText><Pressable onPress={openAttachmentMenu} style={styles.scanButton}><Ionicons name="scan-outline" size={20} color={colors.mintDeep} /><AppText variant="bodyMedium" style={styles.scanText}>Scan a receipt or screenshot</AppText></Pressable><View style={styles.examples}>{examples.map((example) => <Chip key={example} label={example} onPress={() => handleSend(example)} />)}</View></View> : (
          <>
            {messages.map((item) => {
              const isUserMessage = item.role === 'user';
              return (
                <View key={item.id} style={isUserMessage ? styles.userBubble : styles.assistantBubble}>
                  <AppText selectable style={isUserMessage ? styles.userText : styles.assistantText}>{item.content}</AppText>
                  {item.intent === 'query_finances' && <AppText variant="caption" style={styles.answerSource}>Calculated from MoneyYap transactions</AppText>}
                  <Pressable accessibilityRole="button" accessibilityLabel="Copy this chat message" accessibilityHint="Opens the system actions where you can copy the message" hitSlop={8} onPress={() => { void copyChatMessage(item.content); }} style={[styles.copyAction, isUserMessage ? styles.copyActionUser : styles.copyActionAssistant]}>
                    <Ionicons name="copy-outline" size={13} color={isUserMessage ? '#E1FFF4' : colors.mintDeep} />
                    <AppText variant="caption" style={[styles.copyText, isUserMessage ? styles.copyTextUser : styles.copyTextAssistant]}>Copy</AppText>
                  </Pressable>
                </View>
              );
            })}
            {(userMessage || attachment) && <View style={[styles.userBubble, attachment && styles.imageBubble]}>
              {attachment && <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} resizeMode="cover" />}
              <AppText style={styles.userText}>{userMessage}</AppText><View style={styles.bubbleMeta}><AppText variant="caption" style={styles.userMeta}>Now</AppText><Ionicons name="checkmark-done" size={13} color="#E1FFF4" /></View>
            </View>}
            {loading && <View style={styles.thinking}><ActivityIndicator color={colors.mintDark} /><View><AppText style={styles.thinkingText}>{attachment ? 'Reading the image…' : 'Making sense of that…'}</AppText>{attachment && <AppText variant="caption" style={styles.thinkingDetail}>Checking amount, merchant, date, account, and duplicates</AppText>}</View></View>}
            {analysis && !allSaved && <View style={styles.analysisSummary}><Ionicons name="sparkles-outline" size={19} color={colors.mintDeep} /><View style={styles.summaryCopy}><AppText variant="bodyMedium">{analysis.sourceSummary}</AppText><AppText variant="caption" style={styles.summaryMeta}>{drafts.length} transaction{drafts.length === 1 ? '' : 's'} found · Review before saving</AppText>{analysis.warnings.map((warning) => <AppText key={warning} variant="caption" style={styles.warning}>• {warning}</AppText>)}</View></View>}
            {error && <View style={styles.error}><Ionicons name="alert-circle-outline" size={20} color={colors.danger} /><AppText style={styles.errorText}>{error}</AppText></View>}
            {!allSaved && drafts.map((draft, index) => <View key={`${draft.transactionDate}-${index}`} style={styles.draftWrap}>{drafts.length > 1 && <AppText variant="eyebrow" style={styles.draftLabel}>TRANSACTION {index + 1} OF {drafts.length}</AppText>}<ParsedCard draft={draft} status={saved[index] ? 'saved' : 'draft'} saving={savingIndex === index} onConfirm={() => saveAt(index)} onOwnershipSelect={(ownership) => chooseOwnership(index, ownership)} onAccountSelect={(accountId) => chooseAccount(index, accountId)} onCategorySelect={(categoryId) => chooseCategory(index, categoryId)} onSpaceSelect={(spaceId) => chooseSpace(index, spaceId)} onUndo={() => undoAt(index)} onEdit={() => saved[index] ? router.push(`/transaction/${saved[index]!.id}`) : editDraft(draft)} /></View>)}
            {allSaved && <View style={[styles.assistantBubble, styles.savedReply]}><View style={styles.savedReplyHeader}><Ionicons name="checkmark-circle" size={18} color={colors.mintDeep} /><AppText variant="bodyMedium" style={styles.savedReplyTitle}>Added to MoneyYap</AppText></View><AppText style={styles.assistantText}>{savedReply}</AppText><View style={styles.savedEditRow}>{savedTransactions.map((transaction, index) => <Pressable key={transaction.id} onPress={() => router.push(`/transaction/${transaction.id}`)} style={styles.savedEditButton}><Ionicons name="create-outline" size={15} color={colors.mintDeep} /><AppText variant="caption" style={styles.savedEditText}>{savedTransactions.length === 1 ? 'Edit' : `Edit ${index + 1}`}</AppText></Pressable>)}</View></View>}
            {suggestedActions.length > 0 && !drafts.length && <View style={styles.suggestions}>{suggestedActions.map((action) => <Chip key={action} label={action} onPress={() => action === 'View transactions' ? router.push('/(tabs)/transactions') : handleSend(action)} />)}</View>}
            {allSaved && <Pressable onPress={reset} style={styles.addAnother}><Ionicons name="add-circle-outline" size={19} color={colors.mintDeep} /><AppText variant="bodyMedium" style={styles.addAnotherText}>Add another</AppText></Pressable>}
          </>
        )}
      </ScrollView>
      <View style={[styles.composer, keyboardVisible ? styles.composerKeyboard : styles.composerResting, desktop && styles.desktopComposer]}><View style={desktop && styles.desktopComposerInner}><ChatComposer onSend={handleSend} onAttach={openAttachmentMenu} placeholder="Tell MoneyYap anything…" /></View></View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'android' ? 36 : 54 },
  desktopScreen: { paddingTop: 0 },
  header: { height: 62, paddingHorizontal: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  desktopHeader: { height: 86, paddingHorizontal: spacing.xxxl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandAccent: { color: colors.mintDark },
  online: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mintDark },
  onlineText: { color: colors.slate },
  manual: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  conversation: { flexGrow: 1, padding: spacing.xl, paddingBottom: spacing.xl, gap: spacing.lg },
  desktopConversation: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: spacing.xxxl, paddingTop: spacing.xxxl },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 480, gap: spacing.md },
  markLarge: { width: 112, height: 112, borderRadius: 36, backgroundColor: colors.mintWash, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  center: { textAlign: 'center' },
  welcomeBody: { color: colors.slate, textAlign: 'center', maxWidth: 330 },
  scanButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, borderWidth: 1, borderColor: colors.mintMist, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  scanText: { color: colors.mintDeep },
  examples: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  userBubble: { alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: colors.mintDark, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  assistantBubble: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: colors.white, borderRadius: 20, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  assistantText: { color: colors.ink },
  answerSource: { color: colors.mintDeep, marginTop: spacing.xs },
  copyAction: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs, paddingVertical: 2 },
  copyActionUser: { marginRight: 3 },
  copyActionAssistant: { marginRight: 1 },
  copyText: { fontSize: 11 },
  copyTextUser: { color: '#E1FFF4' },
  copyTextAssistant: { color: colors.mintDeep },
  imageBubble: { width: 268, maxWidth: '92%', padding: 7 },
  attachmentImage: { width: '100%', height: 210, borderRadius: 15, backgroundColor: colors.surface },
  userText: { color: colors.white, paddingHorizontal: 5, paddingTop: 3 },
  bubbleMeta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingBottom: 2 },
  userMeta: { color: '#D7F5EA' },
  thinking: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md },
  thinkingText: { color: colors.slateDark },
  thinkingDetail: { color: colors.slate, marginTop: 2 },
  analysisSummary: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, padding: spacing.md },
  summaryCopy: { flex: 1, gap: 2 },
  summaryMeta: { color: colors.mintDeep },
  warning: { color: colors.warning, marginTop: 3 },
  error: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.dangerWash, padding: spacing.md, borderRadius: radii.md },
  errorText: { flex: 1, color: colors.danger },
  draftWrap: { gap: spacing.sm },
  draftLabel: { color: colors.slate, paddingLeft: spacing.xs },
  savedReply: { gap: spacing.sm },
  savedReplyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  savedReplyTitle: { color: colors.mintDeep },
  savedEditRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  savedEditButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.mintWash, borderRadius: radii.pill, paddingHorizontal: spacing.md },
  savedEditText: { color: colors.mintDeep },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  addAnother: { alignSelf: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  addAnotherText: { color: colors.mintDeep },
  composer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, backgroundColor: colors.softWhite },
  composerKeyboard: { paddingBottom: spacing.sm },
  composerResting: { paddingBottom: 96 },
  desktopComposer: { paddingBottom: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.border },
  desktopComposerInner: { width: '100%', maxWidth: 836, alignSelf: 'center' },
});
