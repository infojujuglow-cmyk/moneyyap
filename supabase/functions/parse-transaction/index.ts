import { createClient } from '@supabase/supabase-js';
import { classifyExtractedFacts, enrichExtractedFactsFromMessage, expandFeeFacts, extractStructuredPaymentFacts, type AccountIdentifier, type AccountIdentity, type ExtractedTransactionFacts, type MovementKind } from '../_shared/transaction-classification.ts';
import {
  classifyIntentHeuristic, createPendingTransactionClarification, filterFinanceRows, mergeFinanceQueryContext, originalMessageForClarification, readPendingTransactionClarification, reconcileIntentRoute, resolveDatePatch, sumFinanceRows,
  type FinanceMetric, type FinanceQueryContext, type FinanceQueryPatch, type FinanceTransactionRow, type MoneyYapIntent,
} from '../_shared/moneyyap-chat.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const shortString = (value: unknown, maxLength: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
const normalize = (value: unknown) => String(value ?? '').toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 });

const intentValues: MoneyYapIntent[] = ['record_transaction', 'query_finances', 'edit_transaction', 'delete_transaction', 'manage_account', 'manage_category', 'manage_space', 'general_conversation', 'clarification_response'];
const metricValues: FinanceMetric[] = ['expense_total', 'income_total', 'net_cash_flow', 'spending_by_category', 'spending_by_account', 'transactions', 'account_balances', 'largest_expenses', 'compare_periods'];
const emptyPatch = (): FinanceQueryPatch => ({
  metric: null, transaction_type: null, space_scope: null, space_name: null, account_scope: null, account_names: [], category_name: null,
  exclude_category_names: [], merchant: null, counterparty: null, date_mode: 'unchanged', date_month: null, date_year: null,
  start_date: null, end_date: null, grouping: null, comparison: null,
});

const routerSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: intentValues }, confidence: { type: 'number' }, reply: { type: ['string', 'null'] },
    query_patch: { type: 'object', additionalProperties: false, properties: {
      metric: { type: ['string', 'null'], enum: [...metricValues, null] }, transaction_type: { type: ['string', 'null'], enum: ['expense', 'income', 'internal_transfer', 'all', null] },
      space_scope: { type: ['string', 'null'], enum: ['current', 'all', null] }, space_name: { type: ['string', 'null'] },
      account_scope: { type: ['string', 'null'], enum: ['all', 'specific', null] }, account_names: { type: 'array', items: { type: 'string' } },
      category_name: { type: ['string', 'null'] }, exclude_category_names: { type: 'array', items: { type: 'string' } }, merchant: { type: ['string', 'null'] }, counterparty: { type: ['string', 'null'] },
      date_mode: { type: 'string', enum: ['unchanged', 'all_time', 'this_month', 'last_month', 'specific_month', 'range'] }, date_month: { type: ['number', 'null'] }, date_year: { type: ['number', 'null'] },
      start_date: { type: ['string', 'null'] }, end_date: { type: ['string', 'null'] }, grouping: { type: ['string', 'null'], enum: ['category', 'account', 'month', 'none', null] }, comparison: { type: ['string', 'null'], enum: ['none', 'previous_period', null] },
    }, required: ['metric', 'transaction_type', 'space_scope', 'space_name', 'account_scope', 'account_names', 'category_name', 'exclude_category_names', 'merchant', 'counterparty', 'date_mode', 'date_month', 'date_year', 'start_date', 'end_date', 'grouping', 'comparison'] },
  }, required: ['intent', 'confidence', 'reply', 'query_patch'],
} as const;

const rawTransactionItemSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['create', 'update', 'delete'] }, amount: { type: 'number' }, currency: { type: 'string' }, direction: { type: 'string', enum: ['outgoing', 'incoming', 'unknown'] },
    source_institution: { type: ['string', 'null'] }, source_account_label: { type: ['string', 'null'] }, source_account_last4: { type: ['string', 'null'] }, source_identifier: { type: ['string', 'null'] },
    destination_institution: { type: ['string', 'null'] }, destination_account_label: { type: ['string', 'null'] }, destination_account_last4: { type: ['string', 'null'] }, destination_identifier: { type: ['string', 'null'] },
    recipient_name: { type: ['string', 'null'] }, payment_rail: { type: ['string', 'null'] }, bank_transaction_label: { type: ['string', 'null'] }, note: { type: ['string', 'null'] },
    movement_kind: { type: 'string', enum: ['payment', 'income', 'transfer', 'withdrawal', 'cash_deposit', 'cash_expense', 'cash_income', 'unknown'] }, fee_amount: { type: 'number' },
    transaction_date: { type: 'string' }, confirmation_number: { type: ['string', 'null'] }, transaction_reference: { type: ['string', 'null'] }, confidence: { type: 'number' },
  }, required: ['action', 'amount', 'currency', 'direction', 'source_institution', 'source_account_label', 'source_account_last4', 'source_identifier', 'destination_institution', 'destination_account_label', 'destination_account_last4', 'destination_identifier', 'recipient_name', 'payment_rail', 'bank_transaction_label', 'note', 'movement_kind', 'fee_amount', 'transaction_date', 'confirmation_number', 'transaction_reference', 'confidence'],
} as const;

const rawTransactionsSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    transactions: { type: 'array', minItems: 1, maxItems: 8, items: rawTransactionItemSchema },
  },
  required: ['transactions'],
} as const;

type OpenAIOutput = Record<string, unknown>;
const callStructured = async (key: string, model: string, name: string, schema: unknown, prompt: string): Promise<OpenAIOutput> => {
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, store: false, input: [{ role: 'system', content: prompt }], text: { format: { type: 'json_schema', name, strict: true, schema } } }) });
  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${name} failed (${response.status}:${data?.error?.code ?? 'unknown'})`);
  const output = data.output?.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).find((item: { type: string }) => item.type === 'output_text')?.text;
  if (!output) throw new Error(`OpenAI ${name} returned no output`);
  return JSON.parse(output) as OpenAIOutput;
};

const toExtractedFacts = (parsed: Record<string, unknown>, originalMessage: string, now: Date): ExtractedTransactionFacts => ({
  amount: typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) && parsed.amount > 0 ? parsed.amount : 0,
  currency: typeof parsed.currency === 'string' && /^[A-Z]{3}$/.test(parsed.currency) ? parsed.currency : 'PHP',
  direction: parsed.direction === 'incoming' || parsed.direction === 'outgoing' ? parsed.direction : 'unknown',
  source_institution: shortString(parsed.source_institution, 100),
  source_account_label: shortString(parsed.source_account_label, 120),
  source_account_last4: shortString(parsed.source_account_last4, 4),
  source_identifier: shortString(parsed.source_identifier, 40),
  destination_institution: shortString(parsed.destination_institution, 100),
  destination_account_label: shortString(parsed.destination_account_label, 120),
  destination_account_last4: shortString(parsed.destination_account_last4, 4),
  destination_identifier: shortString(parsed.destination_identifier, 40),
  recipient_name: shortString(parsed.recipient_name, 160),
  payment_rail: shortString(parsed.payment_rail, 60),
  bank_transaction_label: shortString(parsed.bank_transaction_label, 100),
  note: shortString(parsed.note, 300),
  movement_kind: typeof parsed.movement_kind === 'string' ? parsed.movement_kind as MovementKind : 'unknown',
  fee_amount: typeof parsed.fee_amount === 'number' && Number.isFinite(parsed.fee_amount) && parsed.fee_amount > 0 ? parsed.fee_amount : 0,
  original_message: originalMessage,
  transaction_date: Number.isNaN(Date.parse(String(parsed.transaction_date))) ? now.toISOString() : String(parsed.transaction_date),
  confirmation_number: shortString(parsed.confirmation_number, 80),
  transaction_reference: shortString(parsed.transaction_reference, 80),
  evidence: [],
  confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
});

const mergeStructuralWithModel = (structural: ExtractedTransactionFacts, modelFacts: ExtractedTransactionFacts | undefined): ExtractedTransactionFacts => {
  if (!modelFacts) return structural;
  return {
    ...modelFacts,
    ...structural,
    currency: modelFacts.currency || structural.currency,
    payment_rail: structural.payment_rail ?? modelFacts.payment_rail,
    bank_transaction_label: structural.bank_transaction_label ?? modelFacts.bank_transaction_label,
    transaction_date: modelFacts.transaction_date || structural.transaction_date,
    confirmation_number: modelFacts.confirmation_number,
    transaction_reference: modelFacts.transaction_reference,
    fee_amount: Math.max(Number(structural.fee_amount) || 0, Number(modelFacts.fee_amount) || 0),
    evidence: [...modelFacts.evidence, ...structural.evidence],
    confidence: Math.max(structural.confidence, modelFacts.confidence),
  };
};

type Entity = { id: string; name: string; parent_id?: string | null; space_id?: string | null; type?: string; is_active?: boolean; is_archived?: boolean };
const findEntity = (name: string | null, entities: Entity[]) => {
  const needle = normalize(name); if (!needle) return null;
  return entities.find((item) => normalize(item.name) === needle) ?? entities.find((item) => normalize(item.name).includes(needle) || needle.includes(normalize(item.name))) ?? null;
};
const monthNames: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const localQueryPatch = (message: string, accounts: Entity[], categories: Entity[], hasPreviousContext = false): FinanceQueryPatch => {
  const patch = emptyPatch(); const text = normalize(message);
  const explicitMetric = /\b(income|received|earnings|balance|money do i have|net worth|biggest|largest|by account|by category|breakdown|cash flow|expense|expenses|spent|spending|total)\b/.test(text);
  patch.metric = /\bcompare\b/.test(text) ? 'compare_periods' : /\b(income|received|earnings)\b/.test(text) ? 'income_total' : /\b(balance|money do i have|net worth)\b/.test(text) ? 'account_balances' : /\b(biggest|largest)\b/.test(text) ? 'largest_expenses' : /\bby account\b/.test(text) ? 'spending_by_account' : /\bby category|breakdown\b/.test(text) ? 'spending_by_category' : /\bcash flow\b/.test(text) ? 'net_cash_flow' : hasPreviousContext && !explicitMetric ? null : 'expense_total';
  patch.transaction_type = patch.metric === 'income_total' ? 'income' : patch.metric === 'account_balances' || patch.metric === 'net_cash_flow' ? 'all' : patch.metric ? 'expense' : null;
  if (/\ball accounts\b/.test(text)) patch.account_scope = 'all';
  const matchedAccounts = accounts.filter((item) => text.includes(normalize(item.name))).map((item) => item.name); if (matchedAccounts.length) { patch.account_scope = 'specific'; patch.account_names = matchedAccounts; }
  const category = categories.find((item) => text.includes(normalize(item.name))); if (category && /\b(exclude|without|except)\b/.test(text)) patch.exclude_category_names = [category.name]; else if (category) patch.category_name = category.name;
  if (/\bthis month\b/.test(text)) patch.date_mode = 'this_month'; else if (/\blast month\b/.test(text)) patch.date_mode = 'last_month'; else {
    const months = Object.entries(monthNames).filter(([name]) => new RegExp(`\\b${name}\\b`).test(text)); const month = months.at(-1); if (month) { patch.date_mode = 'specific_month'; patch.date_month = month[1]; const year = text.match(/\b20\d{2}\b/); patch.date_year = year ? Number(year[0]) : null; if (months.length > 1) patch.comparison = 'previous_period'; }
  }
  if (/\bacross all spaces|all spaces\b/.test(text)) patch.space_scope = 'all';
  return patch;
};
const expandCategoryIds = (rootId: string | undefined, categories: Entity[]) => { if (!rootId) return []; const result = new Set([rootId]); let changed = true; while (changed) { changed = false; for (const item of categories) if (item.parent_id && result.has(item.parent_id) && !result.has(item.id)) { result.add(item.id); changed = true; } } return [...result]; };
const previousPeriod = (range: { start: string; end: string }) => { const start = new Date(range.start); const end = new Date(range.end); const duration = end.getTime() - start.getTime(); return { start: new Date(start.getTime() - duration).toISOString(), end: start.toISOString() }; };

const executeFinanceQuery = async (supabase: { from: (table: string) => any }, workspaceId: string, context: FinanceQueryContext, accounts: Entity[], categories: Entity[]) => {
  const activeAccounts = accounts.filter((item) => item.is_active !== false && (context.spaceScope === 'all' || !context.spaceId || !item.space_id || item.space_id === context.spaceId));
  const allowedAccountIds = context.accountIds === 'all' || !context.accountIds ? activeAccounts.map((item) => item.id) : context.accountIds;
  if (context.metric === 'account_balances') {
    const { data, error } = await supabase.from('account_balances').select('id,name,current_balance,currency,space_id').eq('workspace_id', workspaceId); if (error) throw error;
    const rows = ((data ?? []) as { id: string; name: string; current_balance: number | string }[]).filter((row) => allowedAccountIds.includes(String(row.id)));
    return { metric: context.metric, amount: rows.reduce((sum, row) => sum + Number(row.current_balance), 0), count: rows.length, breakdown: rows.map((row) => ({ id: String(row.id), label: String(row.name), amount: Number(row.current_balance) })), transactions: [] };
  }
  const rows: FinanceTransactionRow[] = []; const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('transactions').select('id,type,financial_effect,amount,transaction_date,account_from_id,account_to_id,category_id,merchant,counterparty_name,space_id').eq('workspace_id', workspaceId).order('transaction_date', { ascending: false }).range(from, from + pageSize - 1);
    if (context.spaceScope !== 'all' && context.spaceId) query = query.eq('space_id', context.spaceId);
    const { data, error } = await query; if (error) throw error; rows.push(...((data ?? []) as FinanceTransactionRow[])); if (!data || data.length < pageSize) break;
  }
  const categoryScope = new Set(expandCategoryIds(context.categoryId, categories)); const excluded = new Set((context.excludeCategoryIds ?? []).flatMap((id) => expandCategoryIds(id, categories)));
  const categoryFiltered = rows.filter((row) => (!categoryScope.size || Boolean(row.category_id && categoryScope.has(row.category_id))) && !(row.category_id && excluded.has(row.category_id)));
  const filtered = filterFinanceRows(categoryFiltered, { ...context, categoryId: undefined, excludeCategoryIds: [] }, allowedAccountIds);
  const expense = sumFinanceRows(filtered, 'expense'); const income = sumFinanceRows(filtered, 'income');
  let amount = context.metric === 'income_total' ? income : context.metric === 'net_cash_flow' ? income - expense : expense; let breakdown: { id: string; label: string; amount: number }[] = [];
  if (context.metric === 'spending_by_category') {
    const totals = new Map<string, number>(); for (const row of filtered.filter((item) => item.financial_effect === 'expense' || item.type === 'refund')) totals.set(row.category_id ?? 'uncategorized', (totals.get(row.category_id ?? 'uncategorized') ?? 0) + (row.type === 'refund' ? -Number(row.amount) : Number(row.amount)));
    breakdown = [...totals].map(([id, total]) => ({ id, label: categories.find((item) => item.id === id)?.name ?? 'Uncategorized', amount: total })).sort((a, b) => b.amount - a.amount);
  } else if (context.metric === 'spending_by_account') {
    const totals = new Map<string, number>();
    const accountRows = filtered.filter((item) => (item.financial_effect === 'expense' && item.account_from_id) || (item.type === 'refund' && item.account_to_id));
    for (const row of accountRows) {
      const accountId = row.type === 'refund' ? row.account_to_id! : row.account_from_id!;
      totals.set(accountId, (totals.get(accountId) ?? 0) + (row.type === 'refund' ? -Number(row.amount) : Number(row.amount)));
    }
    breakdown = [...totals].map(([id, total]) => ({ id, label: accounts.find((item) => item.id === id)?.name ?? 'Account', amount: total })).sort((a, b) => b.amount - a.amount);
  } else if (context.metric === 'compare_periods' && context.dateRange) {
    const second = context.comparison?.second ?? context.dateRange; const first = context.comparison?.first ?? previousPeriod(second);
    const firstRows = filterFinanceRows(categoryFiltered, { ...context, dateRange: first }, allowedAccountIds); const secondRows = filterFinanceRows(categoryFiltered, { ...context, dateRange: second }, allowedAccountIds);
    const effect = context.transactionType === 'income' ? 'income' : 'expense'; const firstAmount = sumFinanceRows(firstRows, effect); const secondAmount = sumFinanceRows(secondRows, effect);
    amount = secondAmount; breakdown = [{ id: 'first', label: first.start.slice(0, 10), amount: firstAmount }, { id: 'second', label: second.start.slice(0, 10), amount: secondAmount }];
  }
  const transactionRows = (context.metric === 'largest_expenses' ? filtered.filter((row) => row.financial_effect === 'expense').sort((a, b) => Number(b.amount) - Number(a.amount)) : filtered).slice(0, 20);
  return { metric: context.metric, amount, income, expense, count: filtered.length, breakdown, transactions: transactionRows };
};

const describeDateRange = (range: FinanceQueryContext['dateRange'], timeZone: string) => { if (!range) return 'for all recorded time'; const start = new Date(range.start); const end = new Date(new Date(range.end).getTime() - 1); const monthFormat = new Intl.DateTimeFormat('en-PH', { month: 'numeric', year: 'numeric', timeZone }); const sameMonth = monthFormat.format(start) === monthFormat.format(end); return sameMonth ? `in ${start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone })}` : `from ${start.toLocaleDateString('en-PH', { timeZone })} to ${end.toLocaleDateString('en-PH', { timeZone })}`; };
const buildFinanceReply = (context: FinanceQueryContext, result: { amount: number; count: number; breakdown: { label: string; amount: number }[] }, accounts: Entity[], categories: Entity[], timeZone: string) => {
  const category = context.categoryId ? categories.find((item) => item.id === context.categoryId)?.name : null; const accountLabel = context.accountIds === 'all' || !context.accountIds ? 'across all accounts' : context.accountIds.map((id) => accounts.find((item) => item.id === id)?.name).filter(Boolean).join(', '); const time = describeDateRange(context.dateRange, timeZone);
  if (context.metric === 'expense_total') return `You’ve spent ${peso.format(result.amount)}${category ? ` on ${category}` : ''} ${accountLabel} ${time}.`;
  if (context.metric === 'income_total') return `You received ${peso.format(result.amount)}${category ? ` under ${category}` : ''} ${accountLabel} ${time}.`;
  if (context.metric === 'net_cash_flow') return `Your net cash flow ${time} is ${peso.format(result.amount)} ${accountLabel}.`;
  if (context.metric === 'account_balances') return `Your total balance is ${peso.format(result.amount)} across ${result.count} account${result.count === 1 ? '' : 's'}.`;
  if (context.metric === 'spending_by_category' || context.metric === 'spending_by_account') return result.breakdown.length ? `Here’s the breakdown ${time}:\n${result.breakdown.slice(0, 6).map((item) => `${item.label}: ${peso.format(item.amount)}`).join('\n')}` : `I found no matching expenses ${time}.`;
  if (context.metric === 'largest_expenses') return result.count ? `Your largest matching expenses ${time} total ${peso.format(result.amount)}. I found ${result.count} matching transaction${result.count === 1 ? '' : 's'}.` : `I found no matching expenses ${time}.`;
  if (context.metric === 'compare_periods') return result.breakdown.length === 2 ? `${result.breakdown[0].label}: ${peso.format(result.breakdown[0].amount)}\n${result.breakdown[1].label}: ${peso.format(result.breakdown[1].amount)}` : 'I couldn’t build that comparison yet.';
  return `I found ${result.count} matching transaction${result.count === 1 ? '' : 's'} ${time}.`;
};
const managementReply = (intent: MoneyYapIntent) => ({ edit_transaction: 'Open the transaction you want to change, then tap Edit so I update the exact record.', delete_transaction: 'Open the transaction you want to remove, then use Delete so there’s no ambiguity.', manage_account: 'You can manage accounts from Me → Accounts.', manage_category: 'You can manage categories from Me → Categories.', manage_space: 'You can manage Spaces from Me → Spaces.', general_conversation: 'I can record transactions and answer questions using your actual MoneyYap data.', clarification_response: 'I need the original clarification details to continue.', record_transaction: '', query_finances: '' })[intent];

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders }); if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = request.headers.get('Authorization'); if (!authorization) return json({ error: 'Missing authorization' }, 401);
    const supabaseUrl = Deno.env.get('SUPABASE_URL'); const anonKey = Deno.env.get('SUPABASE_ANON_KEY'); const openAIKey = Deno.env.get('OPENAI_API_KEY'); const model = Deno.env.get('OPENAI_MODEL');
    if (!supabaseUrl || !anonKey || !openAIKey || !model) return json({ error: 'Function environment is incomplete' }, 500);
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } }); const { data: { user }, error: userError } = await supabase.auth.getUser(); if (userError || !user) return json({ error: 'Invalid session' }, 401);
    const payload = await request.json().catch(() => null) as { message?: unknown; timezone?: unknown; workspace_id?: unknown; selected_space_id?: unknown; conversation_id?: unknown } | null; const message = typeof payload?.message === 'string' ? payload.message.trim() : ''; const timezone = typeof payload?.timezone === 'string' && payload.timezone.length <= 80 ? payload.timezone : 'Asia/Manila';
    if (!message || message.length > 500) return json({ error: 'Message must be between 1 and 500 characters' }, 400);
    let membershipQuery = supabase.from('workspace_members').select('workspace_id').eq('user_id', user.id);
    if (typeof payload?.workspace_id === 'string') membershipQuery = membershipQuery.eq('workspace_id', payload.workspace_id);
    const { data: memberships, error: membershipError } = await membershipQuery.limit(1); if (membershipError) throw membershipError; const membership = memberships?.[0]; if (!membership) return json({ error: 'Choose a workspace you can access before using MoneyYap chat' }, 403); const workspaceId = String(membership.workspace_id);
    const [accountResult, identifierResult, counterpartyResult, categoryResult, spaceResult, ruleResult, recentTransactionResult] = await Promise.all([
      supabase.from('accounts').select('id,name,type,institution,owner_user_id,space_id,is_active').eq('workspace_id', workspaceId).eq('is_active', true), supabase.from('account_identifiers').select('account_id,kind,normalized_value,institution,confidence').eq('workspace_id', workspaceId),
      supabase.from('counterparties').select('id,display_name,normalized_name,type,identifiers,owned_account_id,default_category_id,default_classification,confidence').eq('workspace_id', workspaceId).eq('created_by', user.id), supabase.from('categories').select('id,name,type,space_id,parent_id,is_archived').eq('workspace_id', workspaceId).eq('is_archived', false),
      supabase.from('spaces').select('id,name,sort_order,is_archived').eq('workspace_id', workspaceId).eq('is_archived', false).order('sort_order'), supabase.from('classification_rules').select('merchant_pattern,account_id,space_id,category_id,priority').eq('workspace_id', workspaceId).eq('is_active', true).order('priority', { ascending: false }).limit(100),
      supabase.from('transactions').select('merchant,category_id,account_from_id,account_to_id').eq('workspace_id', workspaceId).order('transaction_date', { ascending: false }).limit(100),
    ]); for (const result of [accountResult, identifierResult, counterpartyResult, categoryResult, spaceResult, ruleResult, recentTransactionResult]) if (result.error) throw result.error;
    const accounts = (accountResult.data ?? []) as AccountIdentity[] & Entity[]; const categories = (categoryResult.data ?? []) as Entity[]; const spaces = (spaceResult.data ?? []) as Entity[]; const selectedSpaceId = typeof payload?.selected_space_id === 'string' && spaces.some((item) => item.id === payload.selected_space_id) ? payload.selected_space_id : null;
    let conversation: Record<string, unknown> | null = null; if (typeof payload?.conversation_id === 'string') { const { data } = await supabase.from('conversations').select('*').eq('id', payload.conversation_id).eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle(); conversation = data; }
    if (!conversation) { const { data, error } = await supabase.from('conversations').insert({ workspace_id: workspaceId, user_id: user.id, space_id: selectedSpaceId, title: message.slice(0, 80) }).select('*').single(); if (error) throw error; conversation = data; }
    const activeConversation = conversation!; const conversationId = String(activeConversation.id); const previousContext = (activeConversation.query_context ?? {}) as FinanceQueryContext; const pending = activeConversation.pending_clarification as Record<string, unknown> | null; const transactionPending = readPendingTransactionClarification(pending);
    const { error: userMessageError } = await supabase.from('conversation_messages').insert({ conversation_id: conversationId, role: 'user', content: message, message_type: 'text' }); if (userMessageError) throw userMessageError;
    const { data: recentDesc, error: recentError } = await supabase.from('conversation_messages').select('role,content,message_type,intent,metadata,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12); if (recentError) throw recentError; const recent = [...(recentDesc ?? [])].reverse();
    const heuristic = classifyIntentHeuristic(message, { hasPendingClarification: Boolean(pending), hasFinanceContext: Boolean(previousContext.metric) }); let route: { intent: MoneyYapIntent; confidence: number; reply: string | null; query_patch: FinanceQueryPatch } = { ...heuristic, reply: null, query_patch: localQueryPatch(message, accounts, categories, Boolean(previousContext.metric)) };
    try {
      const routed = await callStructured(openAIKey, model, 'moneyyap_intent_route', routerSchema, `You are MoneyYap's intent router. Classify before transaction extraction. Requests for totals, balances, lists, comparisons, or analysis are query_finances. Declarative reports of completed financial activity and imperative commands to record an activity are record_transaction, especially when they contain a concrete amount. Distinguish grammar and requested outcome, not transaction verbs alone: "Transferred 4200 from A to B", "Transfer 4200 from A to B", and "I transferred 4200 from A to B yesterday" record activity; "How much did I transfer from A to B?" and "Show my transfers from A to B" query existing data. A transaction record describes one or more real money movements. A short correction to a pending transaction is clarification_response even when it contains words such as paid, incoming, or outgoing. For a financial-query follow-up, return only changed fields; keep the rest null/unchanged. Never invent a timeframe. "all accounts" means accounts inside the current/default Space; only "all spaces" broadens Space scope. Accounts and Spaces are different.\nCurrent query context: ${JSON.stringify(previousContext)}\nPending clarification: ${JSON.stringify(transactionPending?.clarification ?? pending)}\nPending original transaction: ${JSON.stringify(transactionPending?.original_message ?? null)}\nAccounts: ${JSON.stringify(accounts.map((item) => item.name))}\nSpaces: ${JSON.stringify(spaces.map((item) => item.name))}\nCategories: ${JSON.stringify(categories.map((item) => item.name))}\nRecent window: ${JSON.stringify(recent.map((item) => ({ role: item.role, content: item.content, type: item.message_type })))}\nNew message: ${JSON.stringify(message)}`);
      const modelIntent = intentValues.includes(routed.intent as MoneyYapIntent) ? routed.intent as MoneyYapIntent : heuristic.intent;
      const reconciled = reconcileIntentRoute(heuristic, { intent: modelIntent, confidence: Number(routed.confidence) || 0 });
      route = { ...reconciled, reply: shortString(routed.reply, 600), query_patch: (routed.query_patch ?? route.query_patch) as FinanceQueryPatch };
    } catch (error) { console.warn('intent router fallback', error instanceof Error ? error.message : error); }
    if (pending && heuristic.intent === 'clarification_response') route = { ...route, intent: 'clarification_response', confidence: Math.max(route.confidence, heuristic.confidence) };
    const pendingAssistantWasTransaction = Boolean(pending && recent.some((item) => item.role === 'assistant' && item.message_type === 'clarification' && item.intent === 'record_transaction'));
    const isTransactionClarification = route.intent === 'clarification_response' && Boolean(transactionPending || pendingAssistantWasTransaction);
    let reply = route.reply ?? ''; let transaction: Record<string, unknown> | null = null; let transactions: Record<string, unknown>[] = []; let queryContext: FinanceQueryContext | null = null; let queryResult: Record<string, unknown> | null = null; let clarification: Record<string, unknown> | null = null; let pendingClarificationState: Record<string, unknown> | null = null; let messageType = 'text'; const now = new Date();
    if (route.intent === 'query_finances' || (route.intent === 'clarification_response' && previousContext.metric && !isTransactionClarification)) {
      const patch = route.query_patch ?? localQueryPatch(message, accounts, categories, Boolean(previousContext.metric)); const changes: Partial<FinanceQueryContext> = {}; if (patch.metric) changes.metric = patch.metric; else if (!previousContext.metric) changes.metric = 'expense_total'; if (patch.transaction_type) changes.transactionType = patch.transaction_type; if (patch.space_scope) changes.spaceScope = patch.space_scope;
      const requestedSpace = findEntity(patch.space_name, spaces); const defaultSpace = spaces.find((item) => item.id === selectedSpaceId) ?? spaces[0]; if (patch.space_scope === 'all') changes.spaceId = null; else if (requestedSpace) changes.spaceId = requestedSpace.id; else if (selectedSpaceId) { changes.spaceId = selectedSpaceId; changes.spaceScope = 'current'; } else if (!previousContext.spaceId && defaultSpace) changes.spaceId = defaultSpace.id;
      if (patch.account_scope === 'all') changes.accountIds = 'all'; if (patch.account_scope === 'specific') { const matched = patch.account_names.map((name) => findEntity(name, accounts)).filter((item): item is Entity => Boolean(item)); if (matched.length) changes.accountIds = matched.map((item) => item.id); else clarification = { type: 'account', question: 'Which account should I use for this query?', accountIds: accounts.map((item) => item.id) }; }
      const resolvedMetric = changes.metric ?? previousContext.metric ?? 'expense_total'; const queryCategoryType = patch.transaction_type === 'income' || resolvedMetric === 'income_total' ? 'income' : 'expense'; const querySpaceId = changes.spaceId ?? previousContext.spaceId ?? defaultSpace?.id; const eligibleCategories = categories.filter((item) => item.type === queryCategoryType && (changes.spaceScope === 'all' || !querySpaceId || item.space_id === querySpaceId));
      const category = findEntity(patch.category_name, eligibleCategories); if (category) changes.categoryId = category.id; if (patch.exclude_category_names.length) changes.excludeCategoryIds = patch.exclude_category_names.map((name) => findEntity(name, eligibleCategories)?.id).filter((id): id is string => Boolean(id)); if (patch.merchant) changes.merchant = patch.merchant; if (patch.counterparty) changes.counterparty = patch.counterparty; if (patch.grouping) changes.grouping = patch.grouping;
      changes.dateRange = resolveDatePatch(patch, now, timezone, previousContext.dateRange); queryContext = mergeFinanceQueryContext(previousContext, changes); if (patch.comparison === 'previous_period' && queryContext.dateRange) queryContext.comparison = { first: previousPeriod(queryContext.dateRange), second: queryContext.dateRange };
      if (!clarification) { queryResult = await executeFinanceQuery(supabase, workspaceId, queryContext, accounts, categories); reply = buildFinanceReply(queryContext, queryResult as { amount: number; count: number; breakdown: { label: string; amount: number }[] }, accounts, categories, timezone); messageType = 'finance_answer'; } else { reply = String(clarification.question); messageType = 'clarification'; }
    } else if (route.intent === 'record_transaction' || isTransactionClarification) {
      const originalMessage = isTransactionClarification ? originalMessageForClarification(pending, recent, message) : message;
      const clarificationMessage = isTransactionClarification ? message : null;
      const classifierSpaceId = selectedSpaceId ?? (typeof activeConversation.space_id === 'string' ? activeConversation.space_id : null);
      const classificationContext = { accounts, accountIdentifiers: (identifierResult.data ?? []) as AccountIdentifier[], categories: categories as never, counterparties: counterpartyResult.data ?? [], classificationRules: ruleResult.data ?? [], recentTransactions: recentTransactionResult.data ?? [], selectedSpaceId: classifierSpaceId, defaultSpaceId: spaces[0]?.id ?? null };
      const parsed = await callStructured(openAIKey, model, 'moneyyap_raw_transactions', rawTransactionsSchema, `Extract every distinct financial entry from one English, Tagalog, or Taglish transaction message. Return one array item per amount/account movement; repeat a shared payer, counterparty, purpose, and date on every relevant item. Determine payer and recipient from grammar: "John paid 5000 to BPI Business" means John is the external payer and BPI Business is the incoming destination; "Paid John 5000 from BPI Business" means the user is the payer and BPI Business is the outgoing source. "ABC Corp paid 20k to BDO and 30k to BPI" contains two incoming entries. "I paid 20k to ABC Corp using BDO" is one outgoing entry. Do not classify financial effect beyond raw direction and movement_kind. A withdrawal moves bank money to physical cash; a cash deposit moves physical cash to a bank; a cash purchase is an expense; cash received from an external payer is income. amount is the principal movement amount and fee_amount is a separately stated bank/ATM fee, never their combined total. Transfer/InstaPay/PESONet/send money describe the rail, not ownership. Internal transfer requires two strongly matched owned accounts later. Resolve relative dates from ${now.toISOString()} in ${timezone}. Original message: ${JSON.stringify(originalMessage)}\nLater clarification that must amend the original without dropping its amounts/accounts: ${JSON.stringify(clarificationMessage)}`);
      const parsedItems = Array.isArray(parsed.transactions) ? parsed.transactions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
      const modelFacts = parsedItems.map((item) => toExtractedFacts(item, originalMessage, now));
      const structuralFacts = extractStructuredPaymentFacts(originalMessage, classificationContext, { clarification: clarificationMessage, transactionDate: modelFacts[0]?.transaction_date ?? now.toISOString() });
      const extractedFacts = structuralFacts.length
        ? structuralFacts.map((item, index) => mergeStructuralWithModel(item, modelFacts[index]))
        : modelFacts;
      const parts = extractedFacts.flatMap((extracted, entryIndex) => expandFeeFacts(enrichExtractedFactsFromMessage(extracted, originalMessage, classificationContext)).map((facts) => {
        const classified = classifyExtractedFacts(facts, classificationContext);
        const parsedAction = parsedItems[entryIndex]?.action;
        const draft: Record<string, unknown> = { action: parsedAction === 'update' || parsedAction === 'delete' ? parsedAction : 'create', ...classified, amount: facts.amount, currency: facts.currency, merchant: classified.counterparty_name, tag_ids: [], paid_by_user_id: classified.financial_effect === 'expense' ? user.id : null, transaction_date: facts.transaction_date, notes: facts.note, reference_number: facts.transaction_reference ?? facts.confirmation_number, candidate_space_ids: classified.space_id ? [] : spaces.map((item) => item.id), bank_transaction_label: facts.bank_transaction_label, raw_extraction: facts };
        let partClarification: Record<string, unknown> | null = null;
        if (!facts.amount) { draft.needs_confirmation = true; draft.confirmation_question = 'How much was the transaction?'; partClarification = { type: 'amount', question: draft.confirmation_question }; }
        else if (classified.financial_effect === 'internal_transfer' && classified.candidate_account_ids.length) partClarification = { type: 'account', question: classified.confirmation_question, accountIds: classified.candidate_account_ids };
        else if (classified.ownership_status === 'unknown') partClarification = { type: 'ownership', question: classified.confirmation_question };
        else if (classified.candidate_account_ids.length) partClarification = { type: 'account', question: classified.confirmation_question, accountIds: classified.candidate_account_ids };
        else if (!classified.space_id) partClarification = { type: 'space', question: classified.confirmation_question ?? 'Which Space is this for?', spaceIds: spaces.map((item) => item.id) };
        else if (classified.candidate_category_ids.length && !classified.category_id && facts.movement_kind !== 'fee') partClarification = { type: 'category', question: classified.confirmation_question ?? 'What was this for?', categoryIds: classified.candidate_category_ids };
        draft.clarification = partClarification;
        return { facts, classified, draft, clarification: partClarification };
      }));
      transactions = parts.map((part) => part.draft); transaction = transactions[0] ?? null; clarification = parts.find((part) => part.clarification)?.clarification ?? null;
      const main = parts[0];
      if (clarification) reply = String(clarification.question);
      else if (parts.length > 1 && parts.every((part) => part.classified.financial_effect === 'income')) {
        const total = parts.reduce((sum, part) => sum + part.facts.amount, 0);
        const payer = parts.map((part) => part.classified.counterparty_name).find(Boolean) ?? 'the payer';
        const details = parts.map((part) => `${peso.format(part.facts.amount)} into ${accounts.find((item) => item.id === part.classified.account_to_id)?.name ?? 'your account'}`).join(' and ');
        reply = `Received ${peso.format(total)} from ${payer}: ${details}.`;
      }
      else if (main?.classified.financial_effect === 'internal_transfer' && main.classified.account_from_id && main.classified.account_to_id) {
        const sourceName = accounts.find((item) => item.id === main.classified.account_from_id)?.name ?? 'your source account';
        const destinationName = accounts.find((item) => item.id === main.classified.account_to_id)?.name ?? 'your destination account';
        const fee = parts.find((part) => part.facts.movement_kind === 'fee');
        reply = fee
          ? `Transferred ${peso.format(main.facts.amount)} from ${sourceName} to ${destinationName}, plus recorded ${peso.format(fee.facts.amount)} as Bank/ATM Fees.`
          : `Transferred ${peso.format(main.facts.amount)} from ${sourceName} to ${destinationName}.`;
      } else if (main) reply = `I’ll add this ${main.classified.financial_effect.replaceAll('_', ' ')} for ${peso.format(main.facts.amount)} now. You can edit it anytime.`;
      if (clarification) pendingClarificationState = createPendingTransactionClarification(originalMessage, clarification, extractedFacts);
      messageType = clarification ? 'clarification' : 'transaction_draft';
    } else { reply = route.reply ?? managementReply(route.intent); messageType = route.intent.startsWith('manage_') || route.intent === 'edit_transaction' || route.intent === 'delete_transaction' ? 'management_action' : 'text'; }
    if (clarification && !pendingClarificationState) pendingClarificationState = clarification;
    const metadata = { intent_confidence: route.confidence, query_context: queryContext, query_result: queryResult, clarification, transaction, transactions }; const { error: assistantError } = await supabase.from('conversation_messages').insert({ conversation_id: conversationId, role: 'assistant', content: reply, message_type: messageType, intent: route.intent, metadata }); if (assistantError) throw assistantError;
    const { error: conversationError } = await supabase.from('conversations').update({ query_context: queryContext ?? previousContext, pending_clarification: pendingClarificationState, space_id: selectedSpaceId ?? activeConversation.space_id }).eq('id', conversationId); if (conversationError) throw conversationError;
    const { data: latestDesc } = await supabase.from('conversation_messages').select('id,role,content,message_type,intent,metadata,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20);
    return json({ conversation_id: conversationId, intent: { type: route.intent, confidence: route.confidence }, reply, transaction, transactions, query_context: queryContext, query_result: queryResult, clarification, suggested_actions: route.intent === 'query_finances' ? ['This month', 'Last month', 'By account', 'View transactions'] : [], messages: [...(latestDesc ?? [])].reverse() });
  } catch (error) { console.error('parse-transaction failed', error instanceof Error ? error.message : error); return json({ error: 'Unable to process this MoneyYap message' }, 500); }
});
