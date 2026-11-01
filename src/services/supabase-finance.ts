import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { Account, Category, Counterparty, Space, Tag, Transaction, TransactionReconciliation, WorkspaceMember, WorkspaceSummary } from '@/types/finance';

export interface FinanceSnapshot {
  workspaceId: string;
  accounts: Account[];
  categories: Category[];
  counterparties: Counterparty[];
  members: WorkspaceMember[];
  spaces: Space[];
  tags: Tag[];
  transactions: Transaction[];
}

const mapAccount = (row: Record<string, unknown>): Account => ({
  id: String(row.id), name: String(row.name), type: row.type as Account['type'], institution: row.institution as string | null,
  currency: String(row.currency), openingBalance: Number(row.opening_balance), balance: Number(row.current_balance ?? row.opening_balance),
  ownerUserId: row.owner_user_id as string | null, spaceId: row.space_id as string | null,
  accent: String(row.accent ?? '#35D6A2'), isActive: Boolean(row.is_active),
});

const mapCategory = (row: Record<string, unknown>): Category => ({
  id: String(row.id), name: String(row.name), type: row.type as Category['type'], icon: String(row.icon ?? 'ellipsis-horizontal'),
  color: String(row.color ?? '#68717D'), spaceId: row.space_id as string | null, parentId: row.parent_id as string | null,
  sortOrder: Number(row.sort_order ?? 0), isSystem: Boolean(row.is_system), isArchived: Boolean(row.is_archived),
});

const mapSpace = (row: Record<string, unknown>): Space => ({
  id: String(row.id), name: String(row.name), icon: String(row.icon ?? 'grid-outline'), color: String(row.color ?? '#35D6A2'),
  sortOrder: Number(row.sort_order ?? 0), isArchived: Boolean(row.is_archived), type: (row.space_type ?? 'household') as Space['type'],
  description: row.description as string | null, currency: String(row.currency ?? 'PHP'), legalEntityExternalId: row.legal_entity_external_id as string | null,
});

const mapCounterparty = (row: Record<string, unknown>): Counterparty => ({
  id: String(row.id), name: String(row.display_name), type: row.type as Counterparty['type'],
  defaultCategoryId: row.default_category_id as string | null,
  defaultClassification: row.default_classification as Counterparty['defaultClassification'],
});

const mapTransaction = (row: Record<string, unknown>, reconciliations: TransactionReconciliation[] = []): Transaction => ({
  id: String(row.id), type: row.type as Transaction['type'], amount: Number(row.amount), currency: String(row.currency),
  financialEffect: (row.financial_effect ?? (row.type === 'expense' ? 'expense' : row.type === 'income' || row.type === 'refund' ? 'income' : 'internal_transfer')) as Transaction['financialEffect'],
  paymentRail: (row.payment_rail ?? 'unknown') as Transaction['paymentRail'],
  merchant: row.merchant as string | null, counterpartyId: row.counterparty_id as string | null,
  counterpartyName: row.counterparty_name as string | null, ownershipStatus: (row.ownership_status ?? (row.type === 'transfer' || row.type === 'credit_card_payment' ? 'owned' : 'external')) as Transaction['ownershipStatus'],
  spaceId: String(row.space_id), categoryId: row.category_id as string | null,
  tagIds: ((row.transaction_tags as { tag_id?: string }[] | null) ?? []).map((item) => String(item.tag_id)),
  accountFromId: row.account_from_id as string | null, accountToId: row.account_to_id as string | null,
  paidByUserId: row.paid_by_user_id as string | null, transactionDate: String(row.transaction_date), notes: row.notes as string | null,
  originalMessage: row.original_message as string | null, bankTransactionLabel: row.bank_transaction_label as string | null,
  referenceNumber: row.reference_number as string | null, rawExtraction: row.raw_extraction as Record<string, unknown> | null,
  classificationReviewRequired: Boolean(row.classification_review_required),
  businessClassification: (row.business_classification ?? 'operating') as Transaction['businessClassification'],
  reconciliations,
  aiParsed: Boolean(row.ai_parsed),
  aiConfidence: row.ai_confidence == null ? null : Number(row.ai_confidence), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});

const activeWorkspaceKey = (userId: string) => `moneyyap.active-workspace.${userId}`;

export const listAccessibleWorkspaces = async (userId: string): Promise<WorkspaceSummary[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from('workspace_members').select('workspace_id,role,created_at,workspaces(id,name,created_at)').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).flatMap((membership: Record<string, unknown>) => {
    const relation = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces;
    const workspace = relation && typeof relation === 'object' ? relation as Record<string, unknown> : null;
    if (!workspace?.id || !workspace.name) return [];
    return [{
      id: String(workspace.id),
      name: String(workspace.name),
      role: membership.role as WorkspaceSummary['role'],
      createdAt: String(workspace.created_at ?? membership.created_at ?? ''),
    }];
  }).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
};

export const getActiveWorkspaceId = async (userId: string, accessible?: WorkspaceSummary[]): Promise<string | null> => {
  if (!supabase) return null;
  const workspaces = accessible ?? await listAccessibleWorkspaces(userId);
  const storedId = await AsyncStorage.getItem(activeWorkspaceKey(userId));
  if (storedId && workspaces.some((workspace) => workspace.id === storedId)) return storedId;
  const fallbackId = workspaces[0]?.id ?? null;
  if (fallbackId) await AsyncStorage.setItem(activeWorkspaceKey(userId), fallbackId);
  return fallbackId;
};

export const rememberActiveWorkspaceId = async (userId: string, workspaceId: string) => {
  if (!supabase) return;
  const { data: membership, error: memberError } = await supabase.from('workspace_members').select('workspace_id').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (memberError) throw memberError;
  if (!membership) throw new Error('You do not have access to this workspace.');
  await AsyncStorage.setItem(activeWorkspaceKey(userId), workspaceId);
};

export const loadFinanceSnapshot = async (knownWorkspaceId: string): Promise<FinanceSnapshot | null> => {
  if (!supabase) return null;
  const workspaceId = knownWorkspaceId;
  if (!workspaceId) return null;
  const [accountResult, categoryResult, transactionResult, counterpartyResult, memberResult, spaceResult, tagResult, reconciliationResult] = await Promise.all([
    supabase.from('account_balances').select('*').eq('workspace_id', workspaceId),
    supabase.from('categories').select('*').eq('workspace_id', workspaceId).order('sort_order'),
    supabase.from('transactions').select('*,transaction_tags(tag_id)').eq('workspace_id', workspaceId).order('transaction_date', { ascending: false }),
    supabase.from('counterparties').select('id,display_name,type,default_category_id,default_classification').eq('workspace_id', workspaceId).order('display_name'),
    supabase.from('workspace_members').select('user_id,role,profiles(full_name)').eq('workspace_id', workspaceId),
    supabase.from('spaces').select('*').eq('workspace_id', workspaceId).order('sort_order'),
    supabase.from('tags').select('*').eq('workspace_id', workspaceId).order('name'),
    supabase.from('transaction_reconciliations').select('transaction_id,account_id,reconciled_at,reconciled_by').eq('workspace_id', workspaceId),
  ]);
  for (const result of [accountResult, categoryResult, transactionResult, counterpartyResult, memberResult, spaceResult, tagResult]) if (result.error) throw result.error;
  if (reconciliationResult.error && !['42P01', 'PGRST205'].includes(reconciliationResult.error.code ?? '')) throw reconciliationResult.error;
  const reconciliationsByTransaction = new Map<string, TransactionReconciliation[]>();
  (reconciliationResult.data ?? []).forEach((row) => {
    const transactionId = String(row.transaction_id);
    const reconciliation = { accountId: String(row.account_id), reconciledAt: String(row.reconciled_at), reconciledBy: String(row.reconciled_by) };
    reconciliationsByTransaction.set(transactionId, [...(reconciliationsByTransaction.get(transactionId) ?? []), reconciliation]);
  });
  return {
    workspaceId,
    accounts: (accountResult.data ?? []).map((row) => mapAccount(row)),
    categories: (categoryResult.data ?? []).map((row) => mapCategory(row)),
    transactions: (transactionResult.data ?? []).map((row) => mapTransaction(row, reconciliationsByTransaction.get(String(row.id)) ?? [])),
    counterparties: (counterpartyResult.data ?? []).map((row) => mapCounterparty(row)),
    spaces: (spaceResult.data ?? []).map((row) => mapSpace(row)),
    tags: (tagResult.data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), color: String(row.color) })),
    members: (memberResult.data ?? []).map((row: Record<string, unknown>) => {
      const profile = row.profiles as { full_name?: string } | null;
      const fullName = profile?.full_name ?? 'Workspace member';
      return { id: String(row.user_id), fullName, initials: fullName.split(' ').map((part) => part[0]).join('').slice(0, 2), role: row.role as WorkspaceMember['role'] };
    }),
  };
};
