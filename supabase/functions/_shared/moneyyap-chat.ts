export type MoneyYapIntent =
  | 'record_transaction'
  | 'query_finances'
  | 'edit_transaction'
  | 'delete_transaction'
  | 'manage_account'
  | 'manage_category'
  | 'manage_space'
  | 'general_conversation'
  | 'clarification_response';

export type FinanceMetric =
  | 'expense_total'
  | 'income_total'
  | 'net_cash_flow'
  | 'spending_by_category'
  | 'spending_by_account'
  | 'transactions'
  | 'account_balances'
  | 'largest_expenses'
  | 'compare_periods';

export type FinanceDateRange = { start: string; end: string };

export type FinanceQueryContext = {
  metric?: FinanceMetric;
  transactionType?: 'expense' | 'income' | 'internal_transfer' | 'all';
  spaceScope?: 'current' | 'all';
  spaceId?: string | null;
  accountIds?: string[] | 'all';
  categoryId?: string;
  excludeCategoryIds?: string[];
  merchant?: string;
  counterparty?: string;
  dateRange?: FinanceDateRange | null;
  grouping?: 'category' | 'account' | 'month' | 'none';
  comparison?: { first: FinanceDateRange; second: FinanceDateRange } | null;
};

export type FinanceQueryPatch = {
  metric: FinanceMetric | null;
  transaction_type: 'expense' | 'income' | 'internal_transfer' | 'all' | null;
  space_scope: 'current' | 'all' | null;
  space_name: string | null;
  account_scope: 'all' | 'specific' | null;
  account_names: string[];
  category_name: string | null;
  exclude_category_names: string[];
  merchant: string | null;
  counterparty: string | null;
  date_mode: 'unchanged' | 'all_time' | 'this_month' | 'last_month' | 'specific_month' | 'range';
  date_month: number | null;
  date_year: number | null;
  start_date: string | null;
  end_date: string | null;
  grouping: 'category' | 'account' | 'month' | 'none' | null;
  comparison: 'none' | 'previous_period' | null;
};

export type IntentRoute = { intent: MoneyYapIntent; confidence: number };

export type PendingTransactionClarification = {
  kind: 'transaction';
  version: 1;
  original_message: string;
  clarification: Record<string, unknown>;
  raw_transactions: unknown[];
};

export const createPendingTransactionClarification = (
  originalMessage: string,
  clarification: Record<string, unknown>,
  rawTransactions: unknown[],
): PendingTransactionClarification => ({
  kind: 'transaction',
  version: 1,
  original_message: originalMessage,
  clarification,
  raw_transactions: rawTransactions,
});

export const readPendingTransactionClarification = (value: unknown): PendingTransactionClarification | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== 'transaction' || typeof candidate.original_message !== 'string' || !candidate.original_message.trim()) return null;
  return {
    kind: 'transaction',
    version: 1,
    original_message: candidate.original_message.trim(),
    clarification: candidate.clarification && typeof candidate.clarification === 'object' ? candidate.clarification as Record<string, unknown> : {},
    raw_transactions: Array.isArray(candidate.raw_transactions) ? candidate.raw_transactions : [],
  };
};

export const originalMessageForClarification = (
  pending: unknown,
  recentMessages: { role?: unknown; content?: unknown }[],
  currentMessage: string,
) => {
  const structured = readPendingTransactionClarification(pending);
  if (structured) return structured.original_message;
  const previous = [...recentMessages].reverse().find((item) => item.role === 'user' && typeof item.content === 'string' && item.content.trim() !== currentMessage.trim());
  return typeof previous?.content === 'string' ? previous.content : currentMessage;
};

const normalize = (value: string) => value.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

const clampConfidence = (value: number) => Math.max(0, Math.min(1, Number(value) || 0));

export const reconcileIntentRoute = (heuristic: IntentRoute, model: IntentRoute): IntentRoute => {
  const heuristicConfidence = clampConfidence(heuristic.confidence);
  const modelConfidence = clampConfidence(model.confidence);
  if (heuristic.intent === model.intent) return { intent: heuristic.intent, confidence: Math.max(heuristicConfidence, modelConfidence) };

  const recordQueryConflict = (heuristic.intent === 'record_transaction' && model.intent === 'query_finances')
    || (heuristic.intent === 'query_finances' && model.intent === 'record_transaction');
  if (recordQueryConflict && heuristicConfidence >= 0.9) return { intent: heuristic.intent, confidence: heuristicConfidence };
  return { intent: model.intent, confidence: modelConfidence || heuristicConfidence };
};

export const classifyIntentHeuristic = (message: string, options: { hasPendingClarification?: boolean; hasFinanceContext?: boolean } = {}): IntentRoute => {
  const text = normalize(message);
  if (!text) return { intent: 'general_conversation', confidence: 0.4 };

  if (/\b(delete|remove|erase|undo)\b/.test(text) && /\b(transaction|expense|income|entry|payment)\b/.test(text)) return { intent: 'delete_transaction', confidence: 0.96 };
  if (/\b(edit|change|correct|update|palitan|baguhin)\b/.test(text) && /\b(transaction|expense|income|entry|payment|amount|category)\b/.test(text)) return { intent: 'edit_transaction', confidence: 0.95 };
  if (/\b(add|create|edit|rename|remove|delete|manage)\b/.test(text) && /\b(account|bank|wallet|credit card)\b/.test(text)) return { intent: 'manage_account', confidence: 0.91 };
  if (/\b(add|create|edit|rename|remove|delete|manage)\b/.test(text) && /\b(category|subcategory)\b/.test(text)) return { intent: 'manage_category', confidence: 0.91 };
  if (/\b(add|create|edit|rename|remove|delete|manage)\b/.test(text) && /\bspace\b/.test(text)) return { intent: 'manage_space', confidence: 0.91 };

  const queryLanguage = /\b(how much|how many|total|show|list|biggest|largest|compare|comparison|breakdown|spending|expenses|expense|income|transfers|balance|balances|net worth|cash flow|money do i have|magkano|kabuuan)\b/;
  const questionShape = /^(how|what|which|when|where|who|show|list|compare|total|magkano|ilan)\b/;
  const explicitDataRequest = /^(?:i want|give me|tell me|can you show|could you show)\b.*\b(?:total|balance|balances|net worth|cash flow|breakdown|expenses|income|transfers|spending)\b/;
  const recordVerb = /\b(spend|spent|pay|paid|buy|bought|receive|received|earn|earned|get paid|got paid|transfer|transferred|send|sent|withdraw|withdrawal|withdrew|deposit|deposited|nagbayad|gumastos|natanggap)\b/;
  const amount = /(?:\bphp\b|\bp\s?\d|\b\d+(?:[,.]\d+)?\s?(?:k|m)?\b)/;
  const explicitPaymentContext = /\b(?:using|use|with|via|from)\s+(?:cash|cash on hand|gcash|maya|e[ -]?wallet|wallet|credit card|debit card|card)\b/;
  const transactionShorthand = amount.test(text) && explicitPaymentContext.test(text);
  const followUp = Boolean(options.hasFinanceContext && /^(how about|what about|only|exclude|include|instead|and for|last month|this month|july|august|september|october|november|december|january|february|march|april|may|june)\b/.test(text));

  if (followUp || questionShape.test(text) || explicitDataRequest.test(text)) return { intent: 'query_finances', confidence: followUp ? 0.97 : 0.96 };
  if (recordVerb.test(text) && amount.test(text)) return { intent: 'record_transaction', confidence: 0.97 };
  if (transactionShorthand) return { intent: 'record_transaction', confidence: 0.95 };
  if (options.hasPendingClarification && text.split(' ').length <= 8) return { intent: 'clarification_response', confidence: 0.94 };
  if (recordVerb.test(text)) return { intent: 'record_transaction', confidence: 0.9 };
  if (queryLanguage.test(text)) return { intent: 'query_finances', confidence: 0.88 };
  return { intent: 'general_conversation', confidence: 0.55 };
};

const timeZoneOffsetMs = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).reduce<Record<string, number>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant.getTime();
};

const zonedStartOfMonth = (year: number, month: number, timeZone: string) => {
  const guess = new Date(Date.UTC(year, month - 1, 1));
  let result = new Date(guess.getTime() - timeZoneOffsetMs(guess, timeZone));
  result = new Date(guess.getTime() - timeZoneOffsetMs(result, timeZone));
  return result;
};

export const monthDateRange = (year: number, month: number, timeZone: string): FinanceDateRange => ({
  start: zonedStartOfMonth(year, month, timeZone).toISOString(),
  end: zonedStartOfMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, timeZone).toISOString(),
});

export const resolveDatePatch = (patch: FinanceQueryPatch, now: Date, timeZone: string, previous: FinanceDateRange | null | undefined): FinanceDateRange | null | undefined => {
  if (patch.date_mode === 'unchanged') return previous;
  if (patch.date_mode === 'all_time') return null;
  const local = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const currentYear = Number(local.find((item) => item.type === 'year')?.value);
  const currentMonth = Number(local.find((item) => item.type === 'month')?.value);
  if (patch.date_mode === 'this_month') return monthDateRange(currentYear, currentMonth, timeZone);
  if (patch.date_mode === 'last_month') return monthDateRange(currentMonth === 1 ? currentYear - 1 : currentYear, currentMonth === 1 ? 12 : currentMonth - 1, timeZone);
  if (patch.date_mode === 'specific_month' && patch.date_month && patch.date_month >= 1 && patch.date_month <= 12) return monthDateRange(patch.date_year ?? currentYear, patch.date_month, timeZone);
  if (patch.date_mode === 'range' && patch.start_date && patch.end_date) {
    const start = new Date(patch.start_date); const end = new Date(patch.end_date);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start < end) return { start: start.toISOString(), end: end.toISOString() };
  }
  return previous;
};

export const mergeFinanceQueryContext = (
  previous: FinanceQueryContext,
  changes: Partial<FinanceQueryContext>,
): FinanceQueryContext => {
  const next: FinanceQueryContext = { ...previous };
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  return next;
};

export type FinanceTransactionRow = {
  id: string;
  type?: 'expense' | 'income' | 'transfer' | 'credit_card_payment' | 'refund';
  financial_effect: 'expense' | 'income' | 'internal_transfer' | 'adjustment';
  amount: number | string;
  transaction_date: string;
  account_from_id: string | null;
  account_to_id: string | null;
  category_id: string | null;
  merchant?: string | null;
  counterparty_name?: string | null;
};

export const filterFinanceRows = (rows: FinanceTransactionRow[], context: FinanceQueryContext, allowedAccountIds?: string[]) => {
  const allowed = allowedAccountIds ? new Set(allowedAccountIds) : null;
  const excluded = new Set(context.excludeCategoryIds ?? []);
  const requestedAccounts = context.accountIds === 'all' || !context.accountIds ? allowed : new Set(context.accountIds);
  const textNeedle = normalize(context.counterparty ?? context.merchant ?? '');
  return rows.filter((row) => {
    if (context.dateRange && (row.transaction_date < context.dateRange.start || row.transaction_date >= context.dateRange.end)) return false;
    if (context.categoryId && row.category_id !== context.categoryId) return false;
    if (row.category_id && excluded.has(row.category_id)) return false;
    if (context.transactionType === 'income' && (row.financial_effect !== 'income' || row.type === 'refund')) return false;
    if (context.transactionType === 'expense' && row.financial_effect !== 'expense' && row.type !== 'refund') return false;
    if (context.transactionType === 'internal_transfer' && row.financial_effect !== 'internal_transfer') return false;
    if (requestedAccounts) {
      const accountId = row.financial_effect === 'income' ? row.account_to_id : row.account_from_id;
      if (!accountId || !requestedAccounts.has(accountId)) return false;
    }
    if (textNeedle && !normalize(`${row.counterparty_name ?? ''} ${row.merchant ?? ''}`).includes(textNeedle)) return false;
    return true;
  });
};

export const sumFinanceRows = (rows: FinanceTransactionRow[], effect: 'expense' | 'income') => rows.reduce((total, row) => {
  if (effect === 'income') return row.financial_effect === 'income' && row.type !== 'refund' ? total + Number(row.amount) : total;
  if (row.type === 'refund') return total - Number(row.amount);
  return row.financial_effect === 'expense' ? total + Number(row.amount) : total;
}, 0);
