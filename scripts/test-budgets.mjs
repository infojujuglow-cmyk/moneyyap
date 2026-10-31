import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/lib/budgets.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { budgetMonthKey, budgetTone, buildBudgetSnapshot, shiftBudgetMonth } = module.exports;

const categories = [
  { id: 'food', name: 'Food', type: 'expense', icon: 'restaurant', color: '#FF4055', spaceId: 'home', parentId: null, sortOrder: 0, isSystem: false, isArchived: false },
  { id: 'dining', name: 'Dining', type: 'expense', icon: 'cafe', color: '#F5A742', spaceId: 'home', parentId: 'food', sortOrder: 0, isSystem: false, isArchived: false },
  { id: 'salary', name: 'Salary', type: 'income', icon: 'wallet', color: '#00C83A', spaceId: 'home', parentId: null, sortOrder: 0, isSystem: false, isArchived: false },
];
const allocations = [
  { id: 'a1', budgetId: 'budget', categoryId: 'food', amount: 1000, createdAt: '', updatedAt: '' },
  { id: 'a2', budgetId: 'budget', categoryId: 'dining', amount: 500, createdAt: '', updatedAt: '' },
];
const transaction = (changes) => ({
  id: 'transaction', type: 'expense', financialEffect: 'expense', amount: 0, categoryId: null, spaceId: 'home',
  transactionDate: '2026-10-10T12:00:00+08:00', accountFromId: 'bank', accountToId: null, ...changes,
});
const transactions = [
  transaction({ id: 'food-expense', amount: 200, categoryId: 'food' }),
  transaction({ id: 'dining-expense', amount: 450, categoryId: 'dining' }),
  transaction({ id: 'refund', type: 'refund', financialEffect: 'income', amount: 100, categoryId: 'dining', accountFromId: null, accountToId: 'bank' }),
  transaction({ id: 'split', amount: 300, categoryId: 'food' }),
  transaction({ id: 'uncategorized', amount: 80 }),
  transaction({ id: 'transfer', type: 'transfer', financialEffect: 'internal_transfer', amount: 5000, categoryId: null, accountToId: 'cash' }),
  transaction({ id: 'card-payment', type: 'credit_card_payment', financialEffect: 'internal_transfer', amount: 1200, categoryId: null, accountToId: 'card' }),
  transaction({ id: 'income', type: 'income', financialEffect: 'income', amount: 9000, categoryId: 'salary', accountFromId: null, accountToId: 'bank' }),
  transaction({ id: 'previous-month', amount: 999, categoryId: 'food', transactionDate: '2026-09-30T12:00:00+08:00' }),
];
const splits = [{ id: 'split-1', transactionId: 'split', categoryId: 'dining', amount: 200 }];
const month = new Date(2026, 9, 1);
const snapshot = buildBudgetSnapshot(categories, allocations, transactions, splits, month);
const food = snapshot.rows.find((row) => row.id === 'food');
const dining = food.children.find((row) => row.id === 'dining');

assert.equal(snapshot.totalAllocated, 1500, 'direct parent and child allocations are each counted once');
assert.equal(food.allocated, 1500, 'parent rollup includes its own allocation plus child allocations once');
assert.equal(food.directSpent, 300, 'split remainder stays on the transaction category');
assert.equal(dining.spent, 550, 'subcategory spending includes splits and nets refunds');
assert.equal(food.spent, 850, 'parent rollup includes direct and child spending once');
assert.equal(snapshot.totalSpent, 930, 'overall spending includes uncategorized expenses but excludes transfers, card payments, income, and other months');
assert.equal(snapshot.remaining, 570);
assert.equal(dining.tone, 'over');
assert.equal(budgetTone(1000, 799), 'healthy');
assert.equal(budgetTone(1000, 800), 'warning');
assert.equal(budgetTone(1000, 1000), 'over');
assert.equal(budgetTone(0, 1), 'unallocated');
assert.equal(food.transactionIds.length, 4, 'parent drill-down contains direct and descendant transactions without duplicates');
assert.equal(budgetMonthKey(shiftBudgetMonth(month, -1)), '2026-09-01');

const migration = await readFile('supabase/migrations/20261031122041_monthly_budgets.sql', 'utf8');
assert.match(migration, /unique \(workspace_id, month_start\)/, 'one budget per workspace and calendar month is enforced');
assert.match(migration, /enable row level security/g, 'budget tables require RLS');
assert.match(migration, /save_monthly_budget_allocations/, 'allocation changes use one atomic backend operation');
assert.match(migration, /is_workspace_member/, 'budget access follows existing workspace membership');

console.log('budgets: hierarchy, splits, refunds, month filtering, exclusions, thresholds, and totals passed');
