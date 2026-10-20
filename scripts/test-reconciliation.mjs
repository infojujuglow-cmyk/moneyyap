import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/lib/reconciliation.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { isTransactionReconciled, reconciliationDate, transactionAccountIds } = module.exports;

const transfer = {
  accountFromId: 'bank-a', accountToId: 'bank-b',
  reconciliations: [{ accountId: 'bank-a', reconciledAt: '2026-10-20T10:00:00.000Z', reconciledBy: 'user' }],
};
assert.deepEqual(transactionAccountIds(transfer), ['bank-a', 'bank-b']);
assert.equal(isTransactionReconciled(transfer, 'bank-a'), true, 'the source account leg can be reconciled independently');
assert.equal(isTransactionReconciled(transfer, 'bank-b'), false, 'the destination account leg remains unreconciled');
assert.equal(isTransactionReconciled(transfer), false, 'a transfer is not generally reconciled until both account legs are reconciled');

const fullyReconciled = { ...transfer, reconciliations: [...transfer.reconciliations, { accountId: 'bank-b', reconciledAt: '2026-10-21T10:00:00.000Z', reconciledBy: 'user' }] };
assert.equal(isTransactionReconciled(fullyReconciled), true);
assert.equal(reconciliationDate(fullyReconciled), '2026-10-21T10:00:00.000Z');

const expense = { accountFromId: 'bank-a', accountToId: null, reconciliations: transfer.reconciliations };
assert.equal(isTransactionReconciled(expense), true, 'a one-account transaction is reconciled when its only leg is reconciled');

const migration = await readFile('supabase/migrations/20261020050000_transaction_reconciliation.sql', 'utf8');
assert.match(migration, /primary key \(transaction_id, account_id\)/, 'reconciliation must be stored per transaction and account');
assert.match(migration, /enable row level security/, 'reconciliation rows must use RLS');
assert.match(migration, /private\.can_access_account/, 'private account ownership must be enforced');
assert.match(migration, /set_transaction_reconciliations/, 'bulk account and general reconciliation must use one database transaction');
assert.match(migration, /prune_stale_transaction_reconciliations/, 'editing transaction accounts must remove stale reconciliation legs');

console.log('reconciliation: per-account legs, general status, RLS, bulk updates, and account-edit cleanup passed');
