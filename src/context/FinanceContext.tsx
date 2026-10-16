import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';
import { getActiveWorkspaceId, listAccessibleWorkspaces, loadFinanceSnapshot, rememberActiveWorkspaceId } from '@/services/supabase-finance';
import type { Account, Category, ChatTurnResponse, ConversationMessage, Counterparty, ImageTransactionAnalysis, ParsedTransactionDraft, Space, Tag, Transaction, TransactionImageAttachment, WorkspaceMember, WorkspaceSummary } from '@/types/finance';
import { useAuth } from './AuthContext';

interface FinanceContextValue {
  accounts: Account[];
  categories: Category[];
  counterparties: Counterparty[];
  members: WorkspaceMember[];
  spaces: Space[];
  tags: Tag[];
  transactions: Transaction[];
  workspaceId: string | null;
  availableWorkspaces: WorkspaceSummary[];
  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<string>;
  selectedSpaceId: string | null;
  setSelectedSpaceId: (id: string | null) => void;
  isLoading: boolean;
  refreshFinance: () => Promise<void>;
  lastAdded: Transaction | null;
  parseMessage: (message: string) => Promise<ParsedTransactionDraft>;
  sendChatMessage: (message: string, conversationId?: string | null) => Promise<ChatTurnResponse>;
  loadLatestConversation: () => Promise<{ conversationId: string | null; messages: ConversationMessage[] }>;
  clearConversationClarification: (conversationId: string | null) => Promise<void>;
  parseTransactionImage: (attachment: TransactionImageAttachment, note?: string, conversationId?: string | null) => Promise<ImageTransactionAnalysis>;
  saveDraft: (draft: ParsedTransactionDraft) => Promise<Transaction>;
  rememberOwnAccountMapping: (draft: ParsedTransactionDraft, accountId: string) => Promise<void>;
  updateTransaction: (id: string, changes: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  undoLastAdded: () => Promise<void>;
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (id: string, changes: Partial<Omit<Account, 'id' | 'balance'>>) => Promise<void>;
  setAccountActive: (id: string, isActive: boolean) => Promise<void>;
  addSpace: (space: Omit<Space, 'id'>) => Promise<string>;
  updateSpace: (id: string, changes: Partial<Space>) => Promise<void>;
  archiveSpace: (id: string) => Promise<void>;
  addCategory: (category: Omit<Category, 'id' | 'isSystem'>) => Promise<string>;
  updateCategory: (id: string, changes: Partial<Category>) => Promise<void>;
  archiveCategory: (id: string) => Promise<void>;
  addWorkspaceMember: (email: string) => Promise<void>;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

const mapDraft = (parsed: Record<string, any>, originalMessage: string): ParsedTransactionDraft => ({
  transactionType: parsed.transaction_type, financialEffect: parsed.financial_effect, paymentRail: parsed.payment_rail,
  amount: parsed.amount, currency: parsed.currency, merchant: parsed.merchant,
  counterpartyId: parsed.counterparty_id, counterpartyName: parsed.counterparty_name, counterpartyType: parsed.counterparty_type,
  counterpartyIdentifiers: parsed.counterparty_identifiers ?? {}, ownershipStatus: parsed.ownership_status,
  spaceId: parsed.space_id, categoryId: parsed.category_id, tagIds: parsed.tag_ids ?? [],
  accountFromId: parsed.account_from_id, accountToId: parsed.account_to_id, paidByUserId: parsed.paid_by_user_id,
  transactionDate: parsed.transaction_date, notes: parsed.notes, originalMessage, confidence: parsed.confidence,
  needsConfirmation: parsed.needs_confirmation, confirmationQuestion: parsed.confirmation_question,
  candidateAccountIds: parsed.candidate_account_ids, candidateCategoryIds: parsed.candidate_category_ids,
  candidateSpaceIds: parsed.candidate_space_ids, sourceKind: 'text', referenceNumber: parsed.reference_number,
  bankTransactionLabel: parsed.bank_transaction_label, rawExtraction: parsed.raw_extraction, clarification: parsed.clarification ?? null,
});

const mapConversationMessage = (row: Record<string, any>): ConversationMessage => ({
  id: String(row.id), role: row.role, content: String(row.content), messageType: row.message_type,
  intent: row.intent ?? null, metadata: row.metadata ?? {}, createdAt: String(row.created_at),
});

const applyTransactionToAccountBalances = (items: Account[], transaction: Transaction, direction: 1 | -1 = 1) => items.map((account) => {
  const incoming = transaction.accountToId === account.id ? transaction.amount * direction : 0;
  const outgoing = transaction.accountFromId === account.id ? transaction.amount * direction : 0;
  return incoming || outgoing ? { ...account, balance: account.balance + incoming - outgoing } : account;
});

export function FinanceProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastAdded, setLastAdded] = useState<Transaction | null>(null);
  const clearFinance = useCallback(() => {
    setWorkspaceId(null); setAccounts([]); setCategories([]); setCounterparties([]); setMembers([]); setSpaces([]); setTags([]); setTransactions([]);
    setAvailableWorkspaces([]); setSelectedSpaceId(null); setLastAdded(null);
  }, []);

  const applySnapshot = useCallback((snapshot: Awaited<ReturnType<typeof loadFinanceSnapshot>>, resetSpace = true) => {
    if (!snapshot) return;
    setWorkspaceId(snapshot.workspaceId);
    setAccounts(snapshot.accounts); setCategories(snapshot.categories); setCounterparties(snapshot.counterparties); setMembers(snapshot.members);
    setSpaces(snapshot.spaces); setTags(snapshot.tags); setTransactions(snapshot.transactions);
    setSelectedSpaceId((current) => resetSpace || !current || !snapshot.spaces.some((space) => space.id === current) ? null : current);
    setLastAdded(null);
  }, []);

  const switchWorkspace = useCallback(async (id: string) => {
    if (!session?.user.id) throw new Error('Sign in before switching workspaces.');
    if (id === workspaceId) return;
    setIsLoading(true);
    try {
      const snapshot = await loadFinanceSnapshot(id);
      if (!snapshot) throw new Error('Unable to load this workspace.');
      await rememberActiveWorkspaceId(session.user.id, id);
      applySnapshot(snapshot);
      setAvailableWorkspaces(await listAccessibleWorkspaces(session.user.id));
    } finally { setIsLoading(false); }
  }, [applySnapshot, session?.user.id, workspaceId]);

  const createWorkspace = useCallback(async (name: string) => {
    if (!supabase || !session?.user.id) throw new Error('Sign in before creating a workspace.');
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Enter a workspace name.');
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('create_workspace_with_owner', { workspace_name: normalizedName });
      if (error) throw error;
      const id = String(data);
      const snapshot = await loadFinanceSnapshot(id);
      if (!snapshot) throw new Error('The workspace was created but could not be loaded.');
      await rememberActiveWorkspaceId(session.user.id, id);
      applySnapshot(snapshot);
      setAvailableWorkspaces(await listAccessibleWorkspaces(session.user.id));
      return id;
    } finally { setIsLoading(false); }
  }, [applySnapshot, session?.user.id]);

  const refreshFinance = useCallback(async () => {
    if (!supabase || !session) { clearFinance(); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const accessible = await listAccessibleWorkspaces(session.user.id);
      setAvailableWorkspaces(accessible);
      const activeWorkspaceId = await getActiveWorkspaceId(session.user.id, accessible);
      if (!activeWorkspaceId) { clearFinance(); return; }
      const snapshot = await loadFinanceSnapshot(activeWorkspaceId);
      if (!snapshot) { clearFinance(); return; }
      applySnapshot(snapshot, false);
    } finally { setIsLoading(false); }
  }, [applySnapshot, clearFinance, session]);

  useEffect(() => {
    const task = setTimeout(() => { void refreshFinance(); }, 0);
    return () => clearTimeout(task);
  }, [refreshFinance]);

  const sendChatMessage = useCallback(async (message: string, conversationId?: string | null): Promise<ChatTurnResponse> => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase. Add your project settings and restart the app.');
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { data, error } = await supabase.functions.invoke('parse-transaction', { body: { message, timezone, workspace_id: workspaceId, selected_space_id: selectedSpaceId, conversation_id: conversationId ?? null } });
    if (error) throw error;
    const drafts = Array.isArray(data.transactions)
      ? data.transactions.map((item: Record<string, any>) => mapDraft(item, message))
      : data.transaction ? [mapDraft(data.transaction, message)] : [];
    return {
      conversationId: String(data.conversation_id), intent: data.intent, reply: String(data.reply ?? ''),
      draft: drafts[0] ?? null, drafts, clarification: data.clarification ?? null,
      queryContext: data.query_context ?? null, queryResult: data.query_result ?? null,
      suggestedActions: Array.isArray(data.suggested_actions) ? data.suggested_actions.map(String) : [],
      messages: Array.isArray(data.messages) ? data.messages.map(mapConversationMessage) : [],
    };
  }, [selectedSpaceId, workspaceId]);

  const parseMessage = useCallback(async (message: string) => {
    const result = await sendChatMessage(message);
    if (!result.draft) throw new Error(result.reply || 'That message is not a transaction-entry request.');
    return result.draft;
  }, [sendChatMessage]);

  const loadLatestConversation = useCallback(async () => {
    if (!supabase || !workspaceId || !session?.user.id) return { conversationId: null, messages: [] };
    const { data: conversation, error } = await supabase.from('conversations').select('id').eq('workspace_id', workspaceId).eq('user_id', session.user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!conversation) return { conversationId: null, messages: [] };
    const { data: rows, error: messageError } = await supabase.from('conversation_messages').select('id,role,content,message_type,intent,metadata,created_at').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(20);
    if (messageError) throw messageError;
    return { conversationId: String(conversation.id), messages: [...(rows ?? [])].reverse().map(mapConversationMessage) };
  }, [session, workspaceId]);

  const clearConversationClarification = useCallback(async (conversationId: string | null) => {
    if (!supabase || !conversationId) return;
    const { error } = await supabase.from('conversations').update({ pending_clarification: null }).eq('id', conversationId);
    if (error) throw error;
  }, []);

  const parseTransactionImage = useCallback(async (attachment: TransactionImageAttachment, note = '', conversationId?: string | null): Promise<ImageTransactionAnalysis> => {
    if (!supabase) {
      throw new Error('Live image analysis needs the secure Supabase connection. Add the project URL and anon key to .env, then sign in and try again.');
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { data, error } = await supabase.functions.invoke('parse-transaction-image', {
      body: {
        image_base64: attachment.base64,
        mime_type: attachment.mimeType,
        timezone,
        workspace_id: workspaceId,
        selected_space_id: selectedSpaceId,
        conversation_id: conversationId ?? null,
        note: note.trim().slice(0, 300),
      },
    });
    if (error) throw error;
    const sourceSummary = String(data.source_summary ?? 'Transaction image');
    const drafts = ((data.transactions ?? []) as Record<string, unknown>[]).map((parsed) => ({
      transactionType: parsed.transaction_type,
      financialEffect: parsed.financial_effect,
      paymentRail: parsed.payment_rail,
      amount: parsed.amount,
      currency: parsed.currency,
      merchant: parsed.merchant,
      counterpartyId: parsed.counterparty_id,
      counterpartyName: parsed.counterparty_name,
      counterpartyType: parsed.counterparty_type,
      counterpartyIdentifiers: parsed.counterparty_identifiers ?? {},
      ownershipStatus: parsed.ownership_status,
      spaceId: parsed.space_id,
      categoryId: parsed.category_id,
      tagIds: parsed.tag_ids ?? [],
      accountFromId: parsed.account_from_id,
      accountToId: parsed.account_to_id,
      paidByUserId: parsed.paid_by_user_id,
      transactionDate: parsed.transaction_date,
      notes: parsed.notes,
      originalMessage: `[Image] ${sourceSummary}`,
      confidence: parsed.confidence,
      needsConfirmation: parsed.needs_confirmation,
      confirmationQuestion: parsed.confirmation_question ?? undefined,
      candidateAccountIds: parsed.candidate_account_ids,
      candidateCategoryIds: parsed.candidate_category_ids,
      candidateSpaceIds: parsed.candidate_space_ids,
      sourceKind: 'image' as const,
      referenceNumber: parsed.reference_number,
      bankTransactionLabel: parsed.bank_transaction_label,
      rawExtraction: parsed.raw_extraction,
      evidence: parsed.evidence ?? [],
      possibleDuplicate: Boolean(parsed.possible_duplicate),
      clarification: parsed.clarification ?? null,
    })) as ParsedTransactionDraft[];
    return {
      documentKind: data.document_kind ?? 'unknown',
      sourceSummary,
      warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
      drafts,
      conversationId: data.conversation_id ? String(data.conversation_id) : conversationId ?? null,
      messages: Array.isArray(data.messages) ? data.messages.map(mapConversationMessage) : [],
    };
  }, [selectedSpaceId, workspaceId]);

  const saveDraft = useCallback(async (draft: ParsedTransactionDraft) => {
    if (!supabase || !workspaceId || !session?.user.id) throw new Error('Create a workspace before saving transactions.');
    const now = new Date().toISOString();
    const fallbackSpaceId = selectedSpaceId ?? spaces.find((item) => !item.isArchived)?.id;
    if (!draft.spaceId && !fallbackSpaceId) throw new Error('Choose a Space before saving.');
    const referenceNote = draft.referenceNumber ? `Reference: ${draft.referenceNumber}` : null;
    const persistedNotes = [draft.notes?.trim() || null, referenceNote].filter((item): item is string => Boolean(item)).join('\n') || null;
    const financialEffect = draft.financialEffect ?? (draft.transactionType === 'expense' ? 'expense' : draft.transactionType === 'income' || draft.transactionType === 'refund' ? 'income' : 'internal_transfer');
    const transactionSpaceId = draft.spaceId ?? fallbackSpaceId!;
    const expectedCategoryType = draft.transactionType === 'income' ? 'income' : draft.transactionType === 'expense' || draft.transactionType === 'refund' ? 'expense' : null;
    if (!expectedCategoryType && draft.categoryId) throw new Error('Transfers and card payments cannot have a category.');
    if (draft.categoryId) {
      const category = categories.find((item) => item.id === draft.categoryId);
      if (!category || category.isArchived || category.spaceId !== transactionSpaceId || category.type !== expectedCategoryType) throw new Error('Choose an active category that matches this transaction type and Space.');
    }
    if (draft.ownershipStatus === 'unknown') throw new Error('Confirm whether this is a payment or a transfer to your own account.');
    if (financialEffect === 'internal_transfer') {
      if (!draft.accountFromId || !draft.accountToId || draft.accountFromId === draft.accountToId) throw new Error('An internal transfer needs two different owned accounts.');
      if (!accounts.some((item) => item.id === draft.accountFromId) || !accounts.some((item) => item.id === draft.accountToId)) throw new Error('Both internal-transfer accounts must belong to this workspace.');
    }
    const transactionType = financialEffect === 'internal_transfer'
      ? draft.transactionType === 'credit_card_payment' ? 'credit_card_payment' : 'transfer'
      : financialEffect === 'income' ? draft.transactionType === 'refund' ? 'refund' : 'income'
      : 'expense';
    const accountFromId = financialEffect === 'income' ? null : draft.accountFromId;
    const accountToId = financialEffect === 'expense' ? null : draft.accountToId;
    let counterpartyId = draft.counterpartyId ?? null;
    const normalizedCounterpartyName = draft.counterpartyName?.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '') ?? '';
    if (!counterpartyId && normalizedCounterpartyName) {
      const { data: existing } = await supabase.from('counterparties').select('id').eq('workspace_id', workspaceId).eq('normalized_name', normalizedCounterpartyName).maybeSingle();
      if (existing?.id) counterpartyId = String(existing.id);
      else {
        const { data: created, error: counterpartyError } = await supabase.from('counterparties').insert({
          workspace_id: workspaceId, display_name: draft.counterpartyName, normalized_name: normalizedCounterpartyName,
          type: draft.counterpartyType ?? (financialEffect === 'internal_transfer' ? 'own_account' : 'unknown'),
          identifiers: draft.counterpartyIdentifiers ?? {}, owned_account_id: financialEffect === 'internal_transfer' ? accountToId : null,
          default_category_id: draft.categoryId, default_classification: financialEffect,
          confidence: draft.confidence, created_by: session.user.id,
        }).select('id').single();
        if (counterpartyError) throw counterpartyError;
        counterpartyId = String(created.id);
      }
    }
    if (counterpartyId) {
      const { error: intelligenceError } = await supabase.from('counterparties').update({
        type: financialEffect === 'internal_transfer' ? 'own_account' : draft.counterpartyType ?? 'unknown',
        identifiers: draft.counterpartyIdentifiers ?? {}, owned_account_id: financialEffect === 'internal_transfer' ? accountToId : null,
        default_category_id: draft.categoryId, default_classification: financialEffect,
        confidence: Math.max(draft.confidence, 0.9),
      }).eq('id', counterpartyId).eq('workspace_id', workspaceId);
      if (intelligenceError) throw intelligenceError;
    }
    const transaction: Transaction = {
      id: '', type: transactionType, financialEffect, paymentRail: draft.paymentRail ?? 'unknown', amount: draft.amount, currency: draft.currency,
      merchant: draft.merchant, counterpartyId, counterpartyName: draft.counterpartyName ?? draft.merchant,
      ownershipStatus: financialEffect === 'internal_transfer' ? 'owned' : draft.ownershipStatus ?? 'external',
      spaceId: transactionSpaceId, categoryId: financialEffect === 'internal_transfer' ? null : draft.categoryId, tagIds: draft.tagIds,
      accountFromId, accountToId, paidByUserId: draft.paidByUserId,
      transactionDate: draft.transactionDate, notes: persistedNotes, originalMessage: draft.originalMessage || null,
      bankTransactionLabel: draft.bankTransactionLabel ?? null, referenceNumber: draft.referenceNumber ?? null,
      rawExtraction: draft.rawExtraction ?? null,
      classificationReviewRequired: false,
      aiParsed: Boolean(draft.originalMessage), aiConfidence: draft.originalMessage ? draft.confidence : null, createdAt: now, updatedAt: now,
    };
    {
      const { data, error } = await supabase.from('transactions').insert({
        workspace_id: workspaceId, space_id: transaction.spaceId, created_by: session.user.id, paid_by_user_id: transaction.paidByUserId,
        type: transaction.type, financial_effect: transaction.financialEffect, payment_rail: transaction.paymentRail,
        counterparty_id: transaction.counterpartyId, counterparty_name: transaction.counterpartyName, ownership_status: transaction.ownershipStatus,
        bank_transaction_label: transaction.bankTransactionLabel, reference_number: transaction.referenceNumber, raw_extraction: transaction.rawExtraction,
        classification_review_required: false,
        amount: transaction.amount, currency: transaction.currency, merchant: transaction.merchant,
        category_id: transaction.categoryId, account_from_id: transaction.accountFromId, account_to_id: transaction.accountToId,
        transaction_date: transaction.transactionDate, notes: transaction.notes, original_message: transaction.originalMessage,
        ai_parsed: transaction.aiParsed, ai_confidence: transaction.aiConfidence,
      }).select('*').single();
      if (error) throw error;
      transaction.id = String(data.id); transaction.createdAt = String(data.created_at); transaction.updatedAt = String(data.updated_at);
      if (transaction.tagIds.length) {
        const { error: tagError } = await supabase.from('transaction_tags').insert(transaction.tagIds.map((tagId) => ({ transaction_id: transaction.id, tag_id: tagId })));
        if (tagError) throw tagError;
      }
    }
    setTransactions((items) => [transaction, ...items]);
    if (counterpartyId && transaction.counterpartyName) {
      const nextCounterparty: Counterparty = {
        id: counterpartyId,
        name: transaction.counterpartyName,
        type: financialEffect === 'internal_transfer' ? 'own_account' : draft.counterpartyType ?? 'unknown',
        defaultCategoryId: draft.categoryId,
        defaultClassification: financialEffect,
      };
      setCounterparties((items) => items.some((item) => item.id === counterpartyId)
        ? items.map((item) => item.id === counterpartyId ? nextCounterparty : item)
        : [...items, nextCounterparty]);
    }
    setAccounts((items) => applyTransactionToAccountBalances(items, transaction));
    setLastAdded(transaction);
    return transaction;
  }, [accounts, categories, selectedSpaceId, session, spaces, workspaceId]);

  const rememberOwnAccountMapping = useCallback(async (draft: ParsedTransactionDraft, accountId: string) => {
    if (!supabase || !workspaceId || !session?.user.id) throw new Error('MoneyYap is not connected to Supabase.');
    const raw = draft.rawExtraction ?? {};
    const candidates = [
      ['account_alias', raw.destination_account_label],
      ['account_last4', raw.destination_account_last4],
      ['external_identifier', raw.destination_identifier],
    ] as const;
    const rows = candidates.flatMap(([kind, value]) => {
      if (typeof value !== 'string' || !value.trim()) return [];
      const normalizedValue = value.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
      if (!normalizedValue) return [];
      return [{ workspace_id: workspaceId, account_id: accountId, kind, normalized_value: normalizedValue,
        institution: typeof raw.destination_institution === 'string' ? raw.destination_institution : null,
        confidence: 1, confirmed_by: session.user.id }];
    });
    if (rows.length) {
      const { error } = await supabase.from('account_identifiers').upsert(rows, { onConflict: 'workspace_id,account_id,kind,normalized_value' });
      if (error) throw error;
    }
  }, [session, workspaceId]);

  const updateTransaction = useCallback(async (id: string, changes: Partial<Transaction>) => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
    {
      const payload: Record<string, unknown> = {};
      const fields: [keyof Transaction, string][] = [
        ['amount', 'amount'], ['merchant', 'merchant'], ['type', 'type'], ['financialEffect', 'financial_effect'], ['paymentRail', 'payment_rail'],
        ['counterpartyId', 'counterparty_id'], ['counterpartyName', 'counterparty_name'], ['ownershipStatus', 'ownership_status'],
        ['spaceId', 'space_id'], ['categoryId', 'category_id'], ['accountFromId', 'account_from_id'], ['accountToId', 'account_to_id'],
        ['transactionDate', 'transaction_date'], ['notes', 'notes'], ['bankTransactionLabel', 'bank_transaction_label'],
        ['referenceNumber', 'reference_number'], ['rawExtraction', 'raw_extraction'],
        ['classificationReviewRequired', 'classification_review_required'],
      ];
      fields.forEach(([source, target]) => { if (changes[source] !== undefined) payload[target] = changes[source]; });
      const { error } = await supabase.from('transactions').update(payload).eq('id', id);
      if (error) throw error;
      if (changes.tagIds) {
        const { error: deleteError } = await supabase.from('transaction_tags').delete().eq('transaction_id', id);
        if (deleteError) throw deleteError;
        if (changes.tagIds.length) {
          const { error: insertError } = await supabase.from('transaction_tags').insert(changes.tagIds.map((tagId) => ({ transaction_id: id, tag_id: tagId })));
          if (insertError) throw insertError;
        }
      }
    }
    setTransactions((items) => items.map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item));
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
    const deletedTransaction = transactions.find((item) => item.id === id);
    { const { error } = await supabase.from('transactions').delete().eq('id', id); if (error) throw error; }
    setTransactions((items) => items.filter((item) => item.id !== id));
    if (deletedTransaction) setAccounts((items) => applyTransactionToAccountBalances(items, deletedTransaction, -1));
    setLastAdded((item) => item?.id === id ? null : item);
  }, [transactions]);

  const addAccount = useCallback(async (account: Omit<Account, 'id'>) => {
    if (!supabase || !workspaceId) throw new Error('Create a workspace before adding an account.');
    let id: string;
    {
      const { data, error } = await supabase.from('accounts').insert({
        workspace_id: workspaceId, space_id: account.spaceId, owner_user_id: account.ownerUserId, name: account.name, type: account.type,
        institution: account.institution, currency: account.currency, opening_balance: account.openingBalance, accent: account.accent, is_active: account.isActive,
      }).select('id').single();
      if (error) throw error;
      id = String(data.id);
    }
    setAccounts((items) => [...items, { ...account, id }]);
  }, [workspaceId]);

  const setAccountActive = useCallback(async (id: string, isActive: boolean) => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
    { const { error } = await supabase.from('accounts').update({ is_active: isActive }).eq('id', id); if (error) throw error; }
    setAccounts((items) => items.map((item) => item.id === id ? { ...item, isActive } : item));
  }, []);

  const updateAccount = useCallback(async (id: string, changes: Partial<Omit<Account, 'id' | 'balance'>>) => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
    const payload: Record<string, unknown> = {};
    const fields: [keyof Omit<Account, 'id' | 'balance'>, string][] = [
      ['name', 'name'], ['type', 'type'], ['institution', 'institution'], ['currency', 'currency'],
      ['openingBalance', 'opening_balance'], ['ownerUserId', 'owner_user_id'], ['spaceId', 'space_id'],
      ['accent', 'accent'], ['isActive', 'is_active'],
    ];
    fields.forEach(([source, target]) => { if (changes[source] !== undefined) payload[target] = changes[source]; });
    if (!Object.keys(payload).length) return;
    const { error } = await supabase.from('accounts').update(payload).eq('id', id);
    if (error) throw error;
    await refreshFinance();
  }, [refreshFinance]);

  const addSpace = useCallback(async (space: Omit<Space, 'id'>) => {
    if (!supabase || !workspaceId || !session?.user.id) throw new Error('Create a workspace before adding a Space.');
    let id: string;
    {
      const { data, error } = await supabase.from('spaces').insert({ workspace_id: workspaceId, created_by: session.user.id, name: space.name, icon: space.icon, color: space.color, sort_order: space.sortOrder, is_archived: space.isArchived }).select('id').single();
      if (error) throw error; id = String(data.id);
    }
    await refreshFinance();
    return id;
  }, [refreshFinance, session, workspaceId]);

  const updateSpace = useCallback(async (id: string, changes: Partial<Space>) => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
    {
      const payload: Record<string, unknown> = {};
      if (changes.name !== undefined) payload.name = changes.name; if (changes.icon !== undefined) payload.icon = changes.icon;
      if (changes.color !== undefined) payload.color = changes.color; if (changes.sortOrder !== undefined) payload.sort_order = changes.sortOrder;
      if (changes.isArchived !== undefined) payload.is_archived = changes.isArchived;
      const { error } = await supabase.from('spaces').update(payload).eq('id', id); if (error) throw error;
    }
    setSpaces((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  }, []);

  const archiveSpace = useCallback(async (id: string) => {
    await updateSpace(id, { isArchived: true });
    setSelectedSpaceId((selected) => selected === id ? null : selected);
  }, [updateSpace]);

  const addCategory = useCallback(async (category: Omit<Category, 'id' | 'isSystem'>) => {
    if (!supabase || !workspaceId) throw new Error('Create a workspace before adding a category.');
    let id: string;
    {
      const { data, error } = await supabase.from('categories').insert({ workspace_id: workspaceId, space_id: category.spaceId, parent_id: category.parentId, name: category.name, type: category.type, icon: category.icon, color: category.color, sort_order: category.sortOrder, is_archived: category.isArchived, is_system: false }).select('id').single();
      if (error) throw error; id = String(data.id);
    }
    setCategories((items) => [...items, { ...category, id, isSystem: false }]);
    return id;
  }, [workspaceId]);

  const updateCategory = useCallback(async (id: string, changes: Partial<Category>) => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
    {
      const payload: Record<string, unknown> = {};
      if (changes.name !== undefined) payload.name = changes.name; if (changes.icon !== undefined) payload.icon = changes.icon;
      if (changes.color !== undefined) payload.color = changes.color; if (changes.spaceId !== undefined) payload.space_id = changes.spaceId;
      if (changes.parentId !== undefined) payload.parent_id = changes.parentId; if (changes.sortOrder !== undefined) payload.sort_order = changes.sortOrder;
      if (changes.isArchived !== undefined) payload.is_archived = changes.isArchived;
      const { error } = await supabase.from('categories').update(payload).eq('id', id); if (error) throw error;
    }
    setCategories((items) => items.map((item) => item.id === id ? { ...item, ...changes } : item));
  }, []);

  const archiveCategory = useCallback(async (id: string) => {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      categories.forEach((item) => { if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); changed = true; } });
    }
    await Promise.all([...ids].map((categoryId) => updateCategory(categoryId, { isArchived: true })));
  }, [categories, updateCategory]);

  const addWorkspaceMember = useCallback(async (email: string) => {
    if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
    if (!workspaceId) throw new Error('Choose a workspace before adding a member.');
    const { error } = await supabase.rpc('add_workspace_member_to_workspace', { member_email: email.trim(), member_role: 'member', target_workspace_id: workspaceId });
    if (error) throw error;
    await refreshFinance();
  }, [refreshFinance, workspaceId]);

  const value = useMemo<FinanceContextValue>(() => ({
    accounts, categories, counterparties, members, spaces, tags, transactions, workspaceId, availableWorkspaces, switchWorkspace, createWorkspace, selectedSpaceId, setSelectedSpaceId,
    isLoading, refreshFinance, lastAdded, parseMessage, sendChatMessage, loadLatestConversation, clearConversationClarification,
    parseTransactionImage, saveDraft, rememberOwnAccountMapping, updateTransaction, deleteTransaction,
    undoLastAdded: async () => { if (lastAdded) await deleteTransaction(lastAdded.id); }, addAccount, updateAccount, setAccountActive,
    addSpace, updateSpace, archiveSpace, addCategory, updateCategory, archiveCategory, addWorkspaceMember,
  }), [accounts, addAccount, addCategory, addSpace, addWorkspaceMember, archiveCategory, archiveSpace, availableWorkspaces, categories, clearConversationClarification, counterparties, createWorkspace, deleteTransaction, isLoading, lastAdded, loadLatestConversation, members, parseMessage, parseTransactionImage, refreshFinance, rememberOwnAccountMapping, saveDraft, selectedSpaceId, sendChatMessage, setAccountActive, spaces, switchWorkspace, tags, transactions, updateAccount, updateCategory, updateSpace, updateTransaction, workspaceId]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used inside FinanceProvider');
  return context;
};
