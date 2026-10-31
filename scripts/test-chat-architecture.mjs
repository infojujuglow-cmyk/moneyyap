import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('supabase/functions/_shared/moneyyap-chat.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { classifyIntentHeuristic, createPendingTransactionClarification, filterFinanceRows, mergeFinanceQueryContext, originalMessageForClarification, readPendingTransactionClarification, reconcileIntentRoute, sumFinanceRows } = module.exports;

assert.equal(classifyIntentHeuristic('Spent 500 on lunch').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('How much did I spend on food?').intent, 'query_finances');
assert.equal(classifyIntentHeuristic('Magkano pa natitira sa groceries budget?').intent, 'query_finances');
assert.equal(classifyIntentHeuristic('Can we still afford a 3000 dinner based on our dining budget?').intent, 'query_finances');
assert.equal(classifyIntentHeuristic('62000 transferred from bizlink to bpi business').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Transfer 62000 from BPI Bizlink to BPI Business').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Cash withdrawal 62000 from bpi business').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Withdraw 5000 from BDO').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Deposit 5000 cash into BPI Business').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Spent 500 cash on lunch').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Received 5000 cash from customer').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Withdraw 10000 with 18 peso fee').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('1k gas using cash').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('500 spent using cash').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Show my expenses this month').intent, 'query_finances');
assert.equal(classifyIntentHeuristic('Paid Meralco 3000').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Kyna Aquino paid 34800 to BDO Mewskin and 52200 to Bizlink for Freshies Avocado stocks').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('I want total food expense for all accounts').intent, 'query_finances');
assert.equal(classifyIntentHeuristic('Transferred 4200 from A to B').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Transfer 4200 from A to B').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('I transferred 4200 from A to B yesterday').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Spent 500 on food').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Paid Meralco 3000').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('Received 50000 from Client X').intent, 'record_transaction');
assert.equal(classifyIntentHeuristic('How much did I transfer from A to B?').intent, 'query_finances');
assert.equal(classifyIntentHeuristic('Show my transfers from A to B').intent, 'query_finances');
assert.equal(classifyIntentHeuristic('How much did I spend on food?').intent, 'query_finances');
assert.equal(
  classifyIntentHeuristic('Transferred 4200 from bizlink to bpi business', { hasFinanceContext: true, hasPendingClarification: true }).intent,
  'record_transaction',
  'a complete transaction statement must start a new record even when older query or clarification context exists',
);
assert.equal(
  classifyIntentHeuristic('1k gas using cash', { hasFinanceContext: true, hasPendingClarification: true }).intent,
  'record_transaction',
  'a complete transaction shorthand must not be hijacked by an older clarification',
);
for (const correction of ['No, Kyna Aquino paid me', "No, it's incoming funds to us"]) {
  assert.equal(classifyIntentHeuristic(correction, { hasPendingClarification: true }).intent, 'clarification_response');
}

const pendingTransaction = createPendingTransactionClarification(
  'Kyna Aquino paid 34800 to BDO Mewskin and 52200 to Bizlink for Freshies Avocado stocks',
  { type: 'account', question: 'Which account received this money?' },
  [{ amount: 34800 }, { amount: 52200 }],
);
assert.equal(readPendingTransactionClarification(pendingTransaction)?.raw_transactions.length, 2);
assert.equal(
  originalMessageForClarification(pendingTransaction, [], 'No, Kyna Aquino paid me'),
  'Kyna Aquino paid 34800 to BDO Mewskin and 52200 to Bizlink for Freshies Avocado stocks',
  'a clarification must replay the original transaction message instead of replacing it',
);
assert.equal(
  originalMessageForClarification(
    { type: 'account', question: 'Which account?' },
    [
      { role: 'user', content: 'ABC Corp paid 20k to BDO and 30k to BPI' },
      { role: 'assistant', content: 'Which BPI account?' },
      { role: 'user', content: 'BPI Business' },
    ],
    'BPI Business',
  ),
  'ABC Corp paid 20k to BDO and 30k to BPI',
  'legacy pending clarifications recover the original user turn from recent messages',
);

const strongRecord = classifyIntentHeuristic('Transferred 4200 from A to B');
assert.deepEqual(
  reconcileIntentRoute(strongRecord, { intent: 'query_finances', confidence: 0.99 }),
  strongRecord,
  'a model disagreement must not overwrite a high-confidence declarative transaction route',
);
const strongQuery = classifyIntentHeuristic('How much did I transfer from A to B?');
assert.deepEqual(
  reconcileIntentRoute(strongQuery, { intent: 'record_transaction', confidence: 0.99 }),
  strongQuery,
  'a model disagreement must not overwrite a high-confidence financial query route',
);

const august = { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' };
const july = { start: '2026-07-01T00:00:00.000Z', end: '2026-08-01T00:00:00.000Z' };
const original = { metric: 'expense_total', transactionType: 'expense', categoryId: 'food', accountIds: 'all', spaceId: 'paita-fam', dateRange: august };
assert.deepEqual(mergeFinanceQueryContext(original, { dateRange: july }), { ...original, dateRange: july });
assert.deepEqual(mergeFinanceQueryContext(original, { accountIds: ['bpi-business'] }), { ...original, accountIds: ['bpi-business'] });

const rows = [
  { id: '1', type: 'expense', financial_effect: 'expense', amount: 500, transaction_date: '2026-08-05T00:00:00.000Z', account_from_id: 'bpi-business', account_to_id: null, category_id: 'food' },
  { id: '2', type: 'expense', financial_effect: 'expense', amount: 180, transaction_date: '2026-08-06T00:00:00.000Z', account_from_id: 'bpi-personal', account_to_id: null, category_id: 'food' },
  { id: '3', type: 'expense', financial_effect: 'expense', amount: 900, transaction_date: '2026-08-07T00:00:00.000Z', account_from_id: 'other-space-account', account_to_id: null, category_id: 'food' },
  { id: '4', type: 'internal_transfer', financial_effect: 'internal_transfer', amount: 10000, transaction_date: '2026-08-08T00:00:00.000Z', account_from_id: 'bpi-business', account_to_id: 'bpi-personal', category_id: null },
  { id: '5', type: 'income', financial_effect: 'income', amount: 50000, transaction_date: '2026-08-09T00:00:00.000Z', account_from_id: null, account_to_id: 'bpi-business', category_id: 'income' },
  { id: '6', type: 'refund', financial_effect: 'income', amount: 80, transaction_date: '2026-08-10T00:00:00.000Z', account_from_id: null, account_to_id: 'bpi-business', category_id: 'food' },
];
const filtered = filterFinanceRows(rows, original, ['bpi-business', 'bpi-personal']);
assert.equal(sumFinanceRows(filtered, 'expense'), 600, 'refunds must reduce deterministic expense totals');
assert.equal(filtered.some((row) => row.financial_effect === 'internal_transfer'), false, 'internal transfers stay out of expense analytics');
assert.equal(sumFinanceRows([rows[3]], 'expense'), 0, 'internal transfers must not increase expenses');
assert.equal(sumFinanceRows([rows[3]], 'income'), 0, 'internal transfers must not increase income');
assert.equal(sumFinanceRows([rows[4], rows[5]], 'income'), 50000, 'refunds must not inflate income totals');

const parsedCard = await readFile('src/components/ParsedCard.tsx', 'utf8');
assert.match(parsedCard, /clarification\?\.type === 'account'/, 'account clarification rendering must be explicitly typed');
assert.match(parsedCard, /clarification\?\.type === 'space'/, 'Space clarification must have its own renderer');
const addScreen = await readFile('app/(tabs)/add.tsx', 'utf8');
assert.match(addScreen, /accountIds: accounts\.map|accountIds: accounts\.filter/, 'account choices must originate from accounts');
assert.doesNotMatch(addScreen, /accountIds: spaces\./, 'Spaces must never be inserted into account choices');
assert.match(addScreen, /selectable/, 'chat text must be selectable for native long-press copy');
assert.match(addScreen, /Share\.share/, 'chat messages must offer a system copy/share action');
assert.match(addScreen, /!draft\.needsConfirmation && !draft\.possibleDuplicate/, 'complete, non-duplicate chat and image transactions must auto-save');
assert.match(addScreen, /Added to MoneyYap/, 'auto-saved transactions must render as a concise chat confirmation');
assert.match(addScreen, /savedEditButton/, 'auto-saved transactions must retain an Edit action');

const migration = await readFile('supabase/migrations/202608200002_conversational_finance.sql', 'utf8');
assert.match(migration, /create table public\.conversations/);
assert.match(migration, /create table public\.conversation_messages/);
assert.match(migration, /query_context jsonb/);
assert.match(migration, /enable row level security/);

console.log('chat architecture: intent, context, deterministic totals, entity separation, clarification, and persistence tests passed');
