import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const analyticsSource = await readFile('src/services/analytics.ts', 'utf8');
const compiled = ts.transpileModule(analyticsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const analyticsModule = { exports: {} };
new Function('exports', 'module', compiled)(analyticsModule.exports, analyticsModule);
const { cashFlowTotals } = analyticsModule.exports;
const transaction = (changes) => ({
  id: crypto.randomUUID(), type: 'expense', financialEffect: 'expense', businessClassification: 'operating', amount: 0,
  transactionDate: '2026-11-01T10:00:00+08:00', ...changes,
});
const mixed = [
  transaction({ amount: 400 }),
  transaction({ type: 'income', financialEffect: 'income', amount: 1500 }),
  transaction({ type: 'transfer', financialEffect: 'internal_transfer', amount: 9000 }),
  transaction({ type: 'income', financialEffect: 'income', businessClassification: 'owner_capital_contribution', amount: 100000 }),
  transaction({ businessClassification: 'owner_withdrawal', amount: 2000 }),
];
assert.deepEqual(cashFlowTotals(mixed), { spending: 400, income: 1500, netCashFlow: 1100, transactionCount: 5 }, 'operating reports exclude transfers and capital movements');

const migration = await readFile('supabase/migrations/20261101092835_business_financial_integration.sql', 'utf8');
assert.match(migration, /space_type text not null default 'household'/, 'existing Spaces default to a non-exportable type');
assert.match(migration, /Only Business Spaces can be authorized for integrations/, 'personal and household Spaces cannot be shared');
assert.match(migration, /credential_hash text not null unique/, 'service credentials are stored only as hashes');
assert.match(migration, /permission_scopes <@ array\[/, 'integration scopes are allow-listed');
assert.match(migration, /enable row level security/g, 'new tenant tables enable RLS');
assert.match(migration, /numeric\(16,2\)/g, 'financial records use decimal-safe database amounts');
assert.match(migration, /Project allocations cannot exceed the transaction amount/, 'project splits cannot over-allocate a transaction');
assert.match(migration, /Settlement payments cannot exceed the obligation amount/, 'obligation settlement prevents double counting');

const api = await readFile('supabase/functions/integration-api/index.ts', 'utf8');
assert.match(api, /request\.method !== 'GET'/, 'external API rejects write methods');
assert.match(api, /privateAccountIds/, 'private-owner accounts are excluded from integration data');
assert.match(api, /SPACE_NOT_AUTHORIZED/, 'Space authorization is enforced per request');
assert.match(api, /INSUFFICIENT_SCOPE/, 'endpoint permission scopes are enforced per request');
assert.match(api, /reporting_basis: 'cash'/, 'responses state the accounting basis');
assert.match(api, /data_completeness/, 'responses report completeness');
assert.match(api, /integration_access_logs/, 'sensitive integration access is logged');
assert.match(api, /laterTransactions/, 'account balances are calculated as of the requested period end');
assert.doesNotMatch(api, /idempotency_key:[^\n]*source_updated_at/, 'source corrections reuse the period idempotency key');

console.log('financial integration: business isolation, capital exclusions, decimal records, authorization, and API privacy passed');
