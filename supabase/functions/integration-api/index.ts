import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const VERSION_PREFIX = '/api/integrations/v1';
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Connection = {
  id: string;
  workspace_id: string;
  permission_scopes: string[];
  expires_at: string | null;
  integration_connection_spaces: Array<{
    space_id: string;
    external_business_id: string | null;
    external_business_name: string | null;
  }>;
};

type TransactionRow = {
  id: string;
  type: string;
  financial_effect: string;
  business_classification: string;
  amount: string | number;
  currency: string;
  category_id: string | null;
  account_from_id: string | null;
  account_to_id: string | null;
  transaction_date: string;
  updated_at: string;
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const errorResponse = (requestId: string, status: number, code: string, message: string) =>
  response({ error: { code, message, request_id: requestId } }, status);
const number = (value: unknown) => Number(value ?? 0);
const dateOnly = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('');
};

const pathAfterVersion = (url: URL) => {
  const index = url.pathname.indexOf(VERSION_PREFIX);
  return index < 0 ? null : url.pathname.slice(index + VERSION_PREFIX.length) || '/';
};

const reportingRange = (url: URL) => {
  const now = new Date();
  const defaultFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const defaultTo = now.toISOString().slice(0, 10);
  const from = url.searchParams.get('from') ?? defaultFrom;
  const to = url.searchParams.get('to') ?? defaultTo;
  if (!dateOnly(from) || !dateOnly(to) || from > to) throw new Error('INVALID_DATE_RANGE');
  const duration = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (duration > 366) throw new Error('DATE_RANGE_TOO_LARGE');
  return { from, to };
};

const authenticate = async (request: Request, admin: SupabaseClient): Promise<Connection | null> => {
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token.startsWith('my_live_') || token.length < 40) return null;
  const hash = await sha256(token);
  const { data, error } = await admin
    .from('integration_connections')
    .select('id,workspace_id,permission_scopes,expires_at,integration_connection_spaces(space_id,external_business_id,external_business_name)')
    .eq('credential_hash', hash)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return null;
  return data as Connection;
};

const authorizedSpace = (connection: Connection, spaceId: string) =>
  connection.integration_connection_spaces.find((item) => item.space_id === spaceId) ?? null;
const requireScope = (connection: Connection, scope: 'financial_summaries:read' | 'project_costs:read') => {
  if (!connection.permission_scopes.includes(scope)) throw new Error('INSUFFICIENT_SCOPE');
};

const loadSpaceContext = async (admin: SupabaseClient, connection: Connection, spaceId: string, from: string, to: string) => {
  const authorization = authorizedSpace(connection, spaceId);
  if (!authorization) throw new Error('SPACE_NOT_AUTHORIZED');
  const [{ data: space, error: spaceError }, { data: rawAccounts, error: accountError }] = await Promise.all([
    admin.from('spaces').select('id,name,space_type,description,currency,legal_entity_external_id,updated_at').eq('id', spaceId).eq('workspace_id', connection.workspace_id).eq('space_type', 'business').maybeSingle(),
    admin.from('account_balances').select('id,name,type,institution,currency,current_balance,opening_balance,owner_user_id,is_active,updated_at').eq('workspace_id', connection.workspace_id).eq('space_id', spaceId),
  ]);
  if (spaceError || !space) throw new Error('SPACE_NOT_AUTHORIZED');
  if (accountError) throw accountError;
  const accounts = rawAccounts ?? [];
  const privateAccountIds = new Set(accounts.filter((item) => item.owner_user_id).map((item) => String(item.id)));
  const transactionFields = 'id,type,financial_effect,business_classification,amount,currency,category_id,account_from_id,account_to_id,transaction_date,updated_at';
  const [{ data: rawTransactions, error: transactionError }, { data: laterTransactions, error: laterTransactionError }] = await Promise.all([
    admin.from('transactions').select(transactionFields)
      .eq('workspace_id', connection.workspace_id).eq('space_id', spaceId)
      .gte('transaction_date', `${from}T00:00:00`).lte('transaction_date', `${to}T23:59:59.999`)
      .order('transaction_date'),
    admin.from('transactions').select(transactionFields)
      .eq('workspace_id', connection.workspace_id).eq('space_id', spaceId)
      .gt('transaction_date', `${to}T23:59:59.999`),
  ]);
  if (transactionError) throw transactionError;
  if (laterTransactionError) throw laterTransactionError;
  const publicAccounts = accounts.filter((item) => !item.owner_user_id).map((account) => {
    const laterEffect = ((laterTransactions ?? []) as TransactionRow[]).reduce((sum, item) =>
      sum + (item.account_to_id === account.id ? number(item.amount) : 0) - (item.account_from_id === account.id ? number(item.amount) : 0), 0);
    return { ...account, current_balance: number(account.current_balance) - laterEffect, balance_as_of_date: to };
  });
  const transactions = ((rawTransactions ?? []) as TransactionRow[]).filter((item) =>
    !privateAccountIds.has(item.account_from_id ?? '') && !privateAccountIds.has(item.account_to_id ?? ''));
  const excludedPrivateTransactions = (rawTransactions?.length ?? 0) - transactions.length;
  const sourceUpdatedAt = [space.updated_at, ...accounts.map((item) => item.updated_at), ...transactions.map((item) => item.updated_at)]
    .filter(Boolean).sort().at(-1) ?? new Date().toISOString();
  return {
    authorization,
    space,
    accounts: publicAccounts,
    transactions,
    metadata: {
      currency: space.currency,
      reporting_basis: 'cash',
      source_updated_at: sourceUpdatedAt,
      generated_at: new Date().toISOString(),
      range: { from, to },
      data_completeness: {
        status: privateAccountIds.size || excludedPrivateTransactions ? 'partial' : 'complete',
        private_accounts_excluded: privateAccountIds.size,
        private_account_transactions_excluded: excludedPrivateTransactions,
      },
    },
  };
};

const transactionTotals = (transactions: TransactionRow[]) => {
  let operatingIncome = 0;
  let operatingExpense = 0;
  let capitalContributions = 0;
  let ownerWithdrawals = 0;
  let ownerLoans = 0;
  let loanRepayments = 0;
  for (const item of transactions) {
    const amount = number(item.amount);
    if (item.business_classification === 'owner_capital_contribution') capitalContributions += amount;
    else if (item.business_classification === 'owner_withdrawal') ownerWithdrawals += amount;
    else if (item.business_classification === 'owner_loan') ownerLoans += amount;
    else if (item.business_classification === 'loan_repayment') loanRepayments += amount;
    else if (item.type === 'refund') operatingExpense -= amount;
    else if (item.financial_effect === 'income') operatingIncome += amount;
    else if (item.financial_effect === 'expense') operatingExpense += amount;
  }
  return {
    operating_income: operatingIncome,
    operating_expense: operatingExpense,
    operating_result: operatingIncome - operatingExpense,
    capital_contributions: capitalContributions,
    owner_withdrawals: ownerWithdrawals,
    owner_loans: ownerLoans,
    loan_repayments: loanRepayments,
  };
};

const obligationsPayload = async (admin: SupabaseClient, context: Awaited<ReturnType<typeof loadSpaceContext>>) => {
  const { data, error } = await admin.from('financial_obligation_balances').select('id,obligation_type,counterparty,original_amount,paid_amount,outstanding_amount,currency,issue_date,due_date,reference_number,status,calculated_status,project_reference_id,updated_at').eq('space_id', context.space.id);
  if (error) throw error;
  const obligations = data ?? [];
  return {
    receivable_outstanding: obligations.filter((item) => item.obligation_type === 'receivable' && item.calculated_status !== 'void').reduce((sum, item) => sum + number(item.outstanding_amount), 0),
    payable_outstanding: obligations.filter((item) => item.obligation_type === 'payable' && item.calculated_status !== 'void').reduce((sum, item) => sum + number(item.outstanding_amount), 0),
    records: obligations,
  };
};

const budgetsPayload = async (admin: SupabaseClient, connection: Connection, context: Awaited<ReturnType<typeof loadSpaceContext>>, month: string) => {
  const monthStart = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : context.metadata.range.from.slice(0, 7) + '-01';
  const { data: budget, error } = await admin.from('monthly_budgets').select('id,month_start,updated_at,budget_allocations(id,category_id,amount,categories!inner(id,name,parent_id,space_id,type))').eq('workspace_id', connection.workspace_id).eq('month_start', monthStart).maybeSingle();
  if (error) throw error;
  const allocations = ((budget?.budget_allocations ?? []) as Array<Record<string, unknown>>).filter((item) => {
    const category = item.categories as Record<string, unknown> | null;
    return category?.space_id === context.space.id && category?.type === 'expense';
  });
  const allocated = allocations.reduce((sum, item) => sum + number(item.amount), 0);
  const spent = transactionTotals(context.transactions).operating_expense;
  return { month_start: monthStart, allocated, actual: spent, remaining: allocated - spent, utilization: allocated > 0 ? spent / allocated : null, allocations };
};

const projectCostsPayload = async (admin: SupabaseClient, context: Awaited<ReturnType<typeof loadSpaceContext>>) => {
  const { data: projects, error } = await admin.from('external_project_references').select('id,external_business_id,external_project_id,external_project_name,updated_at').eq('space_id', context.space.id).eq('source_application', 'venture_os').eq('is_active', true);
  if (error) throw error;
  const ids = (projects ?? []).map((item) => item.id);
  if (!ids.length) return { projects: [] };
  const [{ data: allocations, error: allocationError }, { data: budgetAllocations, error: budgetError }] = await Promise.all([
    admin.from('transaction_project_allocations').select('project_reference_id,transaction_id,amount,transactions!inner(transaction_date,type,financial_effect,business_classification)').in('project_reference_id', ids),
    admin.from('project_budget_allocations').select('project_reference_id,amount,monthly_budgets!inner(month_start)').in('project_reference_id', ids),
  ]);
  if (allocationError) throw allocationError;
  if (budgetError) throw budgetError;
  const visibleTransactionIds = new Set(context.transactions.map((item) => item.id));
  return { projects: (projects ?? []).map((project) => {
    const actual = (allocations ?? []).filter((item) => item.project_reference_id === project.id && visibleTransactionIds.has(String(item.transaction_id))).reduce((sum, item) => {
      const transaction = item.transactions as unknown as TransactionRow;
      if (transaction?.business_classification !== 'operating') return sum;
      if (transaction?.type === 'refund') return sum - number(item.amount);
      return transaction?.financial_effect === 'expense' ? sum + number(item.amount) : sum;
    }, 0);
    const approved = (budgetAllocations ?? []).filter((item) => item.project_reference_id === project.id).reduce((sum, item) => sum + number(item.amount), 0);
    return { ...project, approved_budget: approved, actual_spending: actual, remaining_budget: approved - actual, utilization: approved > 0 ? actual / approved : null };
  }) };
};

const logAccess = async (admin: SupabaseClient, connection: Connection, spaceId: string | null, endpoint: string, status: number, requestId: string) => {
  await Promise.all([
    admin.from('integration_access_logs').insert({ connection_id: connection.id, space_id: spaceId, endpoint, response_status: status, request_id: requestId }),
    admin.from('integration_connections').update({ last_accessed_at: new Date().toISOString() }).eq('id', connection.id),
  ]);
};

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method !== 'GET') return errorResponse(requestId, 405, 'method_not_allowed', 'This integration API is read-only.');
  const url = new URL(request.url);
  const path = pathAfterVersion(url);
  if (!path) return errorResponse(requestId, 404, 'not_found', 'Unknown integration API route.');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return errorResponse(requestId, 503, 'service_unavailable', 'Integration service is not configured.');
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const connection = await authenticate(request, admin);
  if (!connection) return errorResponse(requestId, 401, 'unauthorized', 'A valid active integration credential is required.');
  let responseStatus = 200;
  let requestedSpaceId: string | null = null;
  try {
    if (path === '/health') {
      const body = { status: 'ok', api_version: 'v1', access_mode: 'read_only', server_time: new Date().toISOString(), authorized_space_count: connection.integration_connection_spaces.length };
      await logAccess(admin, connection, null, path, 200, requestId);
      return response(body);
    }
    if (path === '/spaces') {
      requireScope(connection, 'financial_summaries:read');
      const ids = connection.integration_connection_spaces.map((item) => item.space_id);
      const { data, error } = await admin.from('spaces').select('id,name,description,currency,legal_entity_external_id,updated_at').in('id', ids).eq('space_type', 'business').eq('is_archived', false);
      if (error) throw error;
      const body = { spaces: (data ?? []).map((space) => ({ id: space.id, name: space.name, type: 'business', currency: space.currency, authorized: true, source_updated_at: space.updated_at, legal_entity_external_id: space.legal_entity_external_id, mapping: authorizedSpace(connection, space.id), reporting_basis: 'cash', open_in_moneyyap_url: null })), source_updated_at: (data ?? []).map((item) => item.updated_at).sort().at(-1) ?? null };
      await logAccess(admin, connection, null, path, 200, requestId);
      return response(body);
    }
    const match = path.match(/^\/spaces\/([^/]+)\/(summary|accounts|budgets|cashflow|obligations|project-costs|metrics)$/);
    if (!match || !UUID.test(match[1])) {
      responseStatus = 404;
      throw new Error('NOT_FOUND');
    }
    requestedSpaceId = match[1];
    const endpoint = match[2];
    requireScope(connection, endpoint === 'project-costs' ? 'project_costs:read' : 'financial_summaries:read');
    const range = reportingRange(url);
    const context = await loadSpaceContext(admin, connection, requestedSpaceId, range.from, range.to);
    const totals = transactionTotals(context.transactions);
    const availableCash = context.accounts.filter((item) => item.is_active && item.type !== 'credit_card').reduce((sum, item) => sum + number(item.current_balance), 0);
    let body: Record<string, unknown>;
    if (endpoint === 'summary') {
      const obligations = await obligationsPayload(admin, context);
      body = { space: { id: context.space.id, name: context.space.name }, ...totals, available_cash: availableCash, receivable_outstanding: obligations.receivable_outstanding, payable_outstanding: obligations.payable_outstanding, metadata: context.metadata };
    } else if (endpoint === 'accounts') {
      body = { accounts: context.accounts.map(({ owner_user_id: _owner, opening_balance: _opening, ...account }) => account), metadata: context.metadata };
    } else if (endpoint === 'budgets') {
      body = { budget: await budgetsPayload(admin, connection, context, url.searchParams.get('month') ?? ''), metadata: context.metadata };
    } else if (endpoint === 'obligations') {
      body = { ...(await obligationsPayload(admin, context)), metadata: context.metadata };
    } else if (endpoint === 'project-costs') {
      body = { ...(await projectCostsPayload(admin, context)), metadata: context.metadata };
    } else if (endpoint === 'cashflow') {
      const buckets = new Map<string, ReturnType<typeof transactionTotals>>();
      for (const item of context.transactions) {
        const key = item.transaction_date.slice(0, 7);
        const current = buckets.get(key) ?? transactionTotals([]);
        const addition = transactionTotals([item]);
        for (const field of Object.keys(current) as Array<keyof typeof current>) current[field] += addition[field];
        buckets.set(key, current);
      }
      body = { buckets: [...buckets].map(([period, values]) => ({ period, ...values })), metadata: context.metadata };
    } else {
      const obligations = await obligationsPayload(admin, context);
      const budget = await budgetsPayload(admin, connection, context, '');
      const projectCosts = await projectCostsPayload(admin, context);
      const observedAt = new Date().toISOString();
      const quality = context.metadata.data_completeness.status;
      const metricRows: Array<[string, string, number, string?]> = [
        ['income', 'Cash inflows from operating income', totals.operating_income],
        ['expenses', 'Cash outflows for operating expenses', totals.operating_expense],
        ['operating_result', 'Cash-basis operating result', totals.operating_result],
        ['cash_balance', 'Available cash', availableCash],
        ['receivables', 'Outstanding receivables', obligations.receivable_outstanding],
        ['payables', 'Outstanding payables', obligations.payable_outstanding],
        ['budget_planned', 'Planned budget', budget.allocated],
        ['budget_actual', 'Budget actual spending', budget.actual],
        ['cash_inflow', 'External cash inflow', totals.operating_income + totals.capital_contributions + totals.owner_loans],
        ['cash_outflow', 'External cash outflow', totals.operating_expense + totals.owner_withdrawals + totals.loan_repayments],
        ...projectCosts.projects.map((project) => ['project_spend', `Project spend · ${project.external_project_name}`, project.actual_spending, project.external_project_id] as [string, string, number, string]),
      ];
      body = { space_id: context.space.id, metrics: metricRows.map(([key, name, value, externalProjectId]) => ({
        key,
        name,
        unit: context.space.currency,
        value: number(value).toFixed(2),
        currency: context.space.currency,
        period_start: range.from,
        period_end: range.to,
        observed_at: observedAt,
        source_updated_at: context.metadata.source_updated_at,
        aggregation: 'latest',
        reporting_basis: 'cash',
        data_quality_status: quality,
        // Stable for one metric/period so a corrected MoneyYap value replaces
        // the cached Venture OS snapshot instead of creating a duplicate.
        idempotency_key: [context.space.id, key, externalProjectId ?? 'space', range.from, range.to].join(':'),
        ...(externalProjectId ? { external_project_id: externalProjectId } : {}),
      })), metadata: context.metadata };
    }
    await logAccess(admin, connection, requestedSpaceId, path, 200, requestId);
    return response(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
    if (message === 'INVALID_DATE_RANGE') responseStatus = 400;
    else if (message === 'DATE_RANGE_TOO_LARGE') responseStatus = 400;
    else if (message === 'SPACE_NOT_AUTHORIZED') responseStatus = 403;
    else if (message === 'INSUFFICIENT_SCOPE') responseStatus = 403;
    else if (message === 'NOT_FOUND') responseStatus = 404;
    else responseStatus = responseStatus === 200 ? 500 : responseStatus;
    await logAccess(admin, connection, requestedSpaceId, path, responseStatus, requestId);
    const publicMessage = message === 'INVALID_DATE_RANGE' ? 'Use valid from/to dates in YYYY-MM-DD format.'
      : message === 'DATE_RANGE_TOO_LARGE' ? 'Date ranges may not exceed 366 days.'
      : message === 'SPACE_NOT_AUTHORIZED' ? 'This connection is not authorized for the requested Business Space.'
      : message === 'INSUFFICIENT_SCOPE' ? 'This connection does not have the required read scope.'
      : message === 'NOT_FOUND' ? 'Unknown integration API route.'
      : 'The financial integration request could not be completed.';
    return errorResponse(requestId, responseStatus, message.toLowerCase(), publicMessage);
  }
});
