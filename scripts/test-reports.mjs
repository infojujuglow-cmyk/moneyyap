import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/services/analytics.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { accountBalancesAsOf, cashFlowTotals, categoryReportBreakdown, formatReportPercentage, resolveAnalyticsDateRange, spaceReportBreakdown, spendingTrendSeries } = module.exports;

const transaction = (changes) => ({
  id: 'transaction', type: 'expense', financialEffect: 'expense', amount: 0, categoryId: null,
  accountFromId: null, accountToId: null, transactionDate: '2026-09-10T12:00:00+08:00',
  merchant: null, counterpartyName: null, ...changes,
});

const lastMonth = resolveAnalyticsDateRange('last_month', new Date('2026-10-20T10:00:00+08:00'));
assert.deepEqual(
  [lastMonth.start.getFullYear(), lastMonth.start.getMonth(), lastMonth.start.getDate(), lastMonth.end.getFullYear(), lastMonth.end.getMonth(), lastMonth.end.getDate()],
  [2026, 8, 1, 2026, 9, 1],
  'Last Month must cover the complete prior calendar month',
);

const mixed = [
  transaction({ id: 'expense', amount: 500, categoryId: 'latte', accountFromId: 'bank', spaceId: 'home' }),
  transaction({ id: 'income', type: 'income', financialEffect: 'income', amount: 2000, categoryId: 'salary', accountToId: 'bank', spaceId: 'home' }),
  transaction({ id: 'refund', type: 'refund', financialEffect: 'income', amount: 100, categoryId: 'latte', accountToId: 'bank', spaceId: 'home' }),
  transaction({ id: 'business-expense', amount: 300, categoryId: null, accountFromId: 'bank', spaceId: 'business' }),
  transaction({ id: 'business-income', type: 'income', financialEffect: 'income', amount: 900, categoryId: null, accountToId: 'bank', spaceId: 'business' }),
  transaction({ id: 'transfer', type: 'transfer', financialEffect: 'internal_transfer', amount: 800, accountFromId: 'bank', accountToId: 'cash', spaceId: 'home' }),
  transaction({ id: 'card-payment', type: 'credit_card_payment', financialEffect: 'internal_transfer', amount: 300, accountFromId: 'bank', accountToId: 'card', spaceId: 'home' }),
];
assert.deepEqual(cashFlowTotals(mixed), { spending: 700, income: 2900, netCashFlow: 2200, transactionCount: 7 });

const categories = [
  { id: 'food', name: 'Food', type: 'expense', parentId: null, spaceId: 'home', color: '#FF4055', isArchived: false },
  { id: 'coffee', name: 'Coffee', type: 'expense', parentId: 'food', spaceId: 'home', color: '#F5A742', isArchived: false },
  { id: 'latte', name: 'Latte', type: 'expense', parentId: 'coffee', spaceId: 'home', color: '#8E44AD', isArchived: false },
  { id: 'salary', name: 'Salary', type: 'income', parentId: null, spaceId: 'home', color: '#00C83A', isArchived: false },
];
const homeTransactions = mixed.filter((item) => item.spaceId === 'home');
const expenseRows = categoryReportBreakdown(homeTransactions, categories, 'expense', 'home');
const incomeRows = categoryReportBreakdown(homeTransactions, categories, 'income', 'home');
assert.deepEqual(expenseRows.map((row) => [row.name, row.amount]), [['Food', 400]], 'refunds reduce their expense category');
assert.deepEqual(incomeRows.map((row) => [row.name, row.amount]), [['Salary', 2000]], 'income categories remain separate');
assert.deepEqual(categoryReportBreakdown(homeTransactions, categories, 'expense', 'home', 'food').map((row) => [row.name, row.amount]), [['Coffee', 400]], 'subcategory drill-down preserves nested totals');
assert.deepEqual(categoryReportBreakdown(homeTransactions, categories, 'expense', 'home', 'coffee').map((row) => [row.name, row.amount]), [['Latte', 400]], 'deeper category levels preserve the hierarchy and count transactions once');
assert.equal(formatReportPercentage(1, 500), '<1%', 'small report percentages remain visible');
assert.equal(formatReportPercentage(24, 500), '4.8%', 'single-digit percentages retain one decimal place');
assert.equal(formatReportPercentage(250, 500), '50%', 'large percentages remain compact');

const spaces = [
  { id: 'home', name: 'Paita Fam', color: '#00B77A', icon: 'home', sortOrder: 0, isArchived: false },
  { id: 'business', name: 'Juju Glow', color: '#7C5CFC', icon: 'briefcase', sortOrder: 1, isArchived: false },
];
assert.deepEqual(spaceReportBreakdown(mixed, spaces, 'expense').map((row) => [row.name, row.amount]), [['Paita Fam', 400], ['Juju Glow', 300]], 'expense by Space nets refunds and excludes transfers');
assert.deepEqual(spaceReportBreakdown(mixed, spaces, 'income').map((row) => [row.name, row.amount]), [['Paita Fam', 2000], ['Juju Glow', 900]], 'income by Space excludes refunds and internal transfers');

const accounts = [
  { id: 'bank', name: 'Bank', balance: 1200 },
  { id: 'cash', name: 'Cash', balance: 800 },
];
const laterTransfer = transaction({ id: 'later-transfer', type: 'transfer', financialEffect: 'internal_transfer', amount: 300, accountFromId: 'bank', accountToId: 'cash', transactionDate: '2026-10-15T12:00:00+08:00' });
const asOf = accountBalancesAsOf(accounts, [laterTransfer], new Date('2026-10-01T00:00:00+08:00'));
assert.deepEqual(asOf.map((account) => account.balanceAsOf), [1500, 500], 'as-of balances reverse later account effects');
assert.equal(asOf.reduce((sum, account) => sum + account.balanceAsOf, 0), 2000, 'internal transfers never change total owned balance');

const september = resolveAnalyticsDateRange('last_month', new Date('2026-10-20T10:00:00+08:00'));
const trend = spendingTrendSeries(mixed, september);
assert.equal(trend.reduce((sum, point) => sum + point.income, 0), 2900);
assert.equal(trend.reduce((sum, point) => sum + point.expense, 0), 700);

console.log('reports: date filters, category and Space separation, transfer exclusions, refunds, trends, and as-of balances passed');
