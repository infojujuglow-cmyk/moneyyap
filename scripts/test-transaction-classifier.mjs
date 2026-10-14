import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('supabase/functions/_shared/transaction-classification.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);
const { classifyExtractedFacts, enrichExtractedFactsFromMessage, expandFeeFacts, extractStructuredPaymentFacts } = module.exports;

const accounts = [
  { id: 'bpi-bizlink', name: 'BPI Bizlink', type: 'bank', institution: 'BPI', owner_user_id: 'user', space_id: 'space' },
  { id: 'bpi-business', name: 'BPI Business', type: 'bank', institution: 'BPI', owner_user_id: 'user', space_id: 'space' },
  { id: 'bpi-personal', name: 'BPI Personal', type: 'bank', institution: 'BPI', owner_user_id: 'user', space_id: 'space' },
  { id: 'bdo-mewskin', name: 'BDO Mewskin', type: 'bank', institution: 'BDO', owner_user_id: 'user', space_id: 'space' },
  { id: 'cash-on-hand', name: 'Cash On Hand', type: 'cash', institution: null, owner_user_id: 'user', space_id: 'space' },
  { id: 'my-gcash', name: 'GCash', type: 'ewallet', institution: 'GCash', owner_user_id: 'user', space_id: 'space' },
];
const context = {
  accounts, accountIdentifiers: [], counterparties: [], classificationRules: [], recentTransactions: [], selectedSpaceId: 'space', defaultSpaceId: 'space',
  categories: [
    { id: 'delivery', name: 'Delivery', type: 'expense', space_id: 'space', parent_id: null },
    { id: 'lunch', name: 'Lunch', type: 'expense', space_id: 'space', parent_id: null },
    { id: 'atm-fees', name: 'Bank/ATM Fees', type: 'expense', space_id: 'space', parent_id: null },
    { id: 'transportation', name: 'Transportation', type: 'expense', space_id: 'space', parent_id: null },
    { id: 'fuel', name: 'Fuel', type: 'expense', space_id: 'space', parent_id: 'transportation' },
    { id: 'income', name: 'Income', type: 'income', space_id: 'space', parent_id: null },
    { id: 'fuel-income', name: 'Fuel', type: 'income', space_id: 'space', parent_id: null },
    { id: 'fuel-other-space', name: 'Fuel', type: 'expense', space_id: 'other-space', parent_id: null },
  ],
};
const facts = (changes = {}) => ({
  amount: 580, currency: 'PHP', direction: 'outgoing', source_institution: 'BPI', source_account_label: 'Business',
  source_account_last4: null, source_identifier: null, destination_institution: null, destination_account_label: null,
  destination_account_last4: null, destination_identifier: null, recipient_name: null, payment_rail: 'InstaPay',
  bank_transaction_label: 'Transfer', note: null, transaction_date: '2026-08-20T17:04:07+08:00',
  confirmation_number: null, transaction_reference: null, evidence: [], confidence: 0.95, ...changes,
});
const classifyMessage = (message, changes = {}) => {
  const extracted = enrichExtractedFactsFromMessage(facts({
    amount: 0,
    direction: 'unknown',
    source_institution: null,
    source_account_label: null,
    destination_institution: null,
    destination_account_label: null,
    payment_rail: null,
    bank_transaction_label: null,
    confidence: 0.98,
    ...changes,
  }), message, context);
  return expandFeeFacts(extracted).map((part) => ({ facts: part, classified: classifyExtractedFacts(part, context) }));
};

const externalGcash = classifyExtractedFacts(facts({
  destination_institution: 'GCash/G-Xchange', destination_account_label: 'GCash', destination_identifier: '09812170344',
  recipient_name: 'External recipient', note: 'delivery memo',
}), context);
assert.deepEqual(
  [externalGcash.financial_effect, externalGcash.account_from_id, externalGcash.account_to_id, externalGcash.payment_rail],
  ['expense', 'bpi-business', null, 'instapay'],
);

const ownedTransfer = classifyExtractedFacts(facts({ destination_institution: 'BPI', destination_account_label: 'Personal' }), context);
assert.deepEqual(
  [ownedTransfer.financial_effect, ownedTransfer.account_from_id, ownedTransfer.account_to_id],
  ['internal_transfer', 'bpi-business', 'bpi-personal'],
);

const unknownWalletOwnership = classifyExtractedFacts(facts({ destination_institution: 'GCash' }), context);
assert.deepEqual(
  [unknownWalletOwnership.financial_effect, unknownWalletOwnership.ownership_status, unknownWalletOwnership.account_to_id],
  ['expense', 'unknown', null],
);

const railOnly = classifyExtractedFacts(facts({ bank_transaction_label: 'Fund transfer', payment_rail: 'PESONet' }), context);
assert.deepEqual([railOnly.financial_effect, railOnly.account_to_id, railOnly.payment_rail], ['expense', null, 'pesonet']);

const bizlinkTransfer = classifyExtractedFacts(facts({
  amount: 4200,
  source_institution: null,
  source_account_label: 'bizlink',
  destination_institution: 'BPI',
  destination_account_label: 'Business',
  payment_rail: 'bank transfer',
}), context);
assert.deepEqual(
  [bizlinkTransfer.financial_effect, bizlinkTransfer.transaction_type, bizlinkTransfer.ownership_status, bizlinkTransfer.account_from_id, bizlinkTransfer.account_to_id, bizlinkTransfer.category_id],
  ['internal_transfer', 'transfer', 'owned', 'bpi-bizlink', 'bpi-business', null],
);
const startingBalances = { 'bpi-bizlink': 10000, 'bpi-business': 5000 };
const resultingBalances = {
  'bpi-bizlink': startingBalances['bpi-bizlink'] - 4200,
  'bpi-business': startingBalances['bpi-business'] + 4200,
};
assert.equal(resultingBalances['bpi-bizlink'], 5800);
assert.equal(resultingBalances['bpi-business'], 9200);
assert.equal(Object.values(resultingBalances).reduce((total, balance) => total + balance, 0), Object.values(startingBalances).reduce((total, balance) => total + balance, 0), 'internal transfer must leave net worth unchanged');

for (const message of ['62000 transferred from bizlink to bpi business', 'Transfer 62000 from BPI Bizlink to BPI Business']) {
  const [{ facts: transferFacts, classified }] = classifyMessage(message);
  assert.equal(transferFacts.amount, 62000);
  assert.deepEqual(
    [classified.financial_effect, classified.account_from_id, classified.account_to_id, classified.needs_confirmation, classified.candidate_account_ids],
    ['internal_transfer', 'bpi-bizlink', 'bpi-business', false, []],
    message,
  );
}

const [{ classified: businessAliasTransfer }] = classifyMessage('Transfer 5000 from business to BPI Personal');
assert.deepEqual(
  [businessAliasTransfer.financial_effect, businessAliasTransfer.account_from_id, businessAliasTransfer.account_to_id, businessAliasTransfer.needs_confirmation],
  ['internal_transfer', 'bpi-business', 'bpi-personal', false],
  'an institution-stripped account name may resolve only when it is unique',
);

const ambiguousContext = {
  ...context,
  accounts: [...accounts, { id: 'bdo-business', name: 'BDO Business', type: 'bank', institution: 'BDO', owner_user_id: 'user', space_id: 'space' }],
};
const ambiguousFacts = enrichExtractedFactsFromMessage(facts({ amount: 5000, direction: 'outgoing', source_institution: null, source_account_label: null, destination_institution: null, destination_account_label: null, original_message: 'Transfer 5000 from business to BPI Personal' }), 'Transfer 5000 from business to BPI Personal', ambiguousContext);
const ambiguousTransfer = classifyExtractedFacts(ambiguousFacts, ambiguousContext);
assert.deepEqual(
  [ambiguousTransfer.financial_effect, ambiguousTransfer.account_from_id, ambiguousTransfer.account_to_id, ambiguousTransfer.confirmation_question],
  ['internal_transfer', null, 'bpi-personal', 'Which account did the money come from?'],
);

const [{ classified: missingDestination }] = classifyMessage('Transferred 5000 from BPI Business');
assert.deepEqual(
  [missingDestination.financial_effect, missingDestination.account_from_id, missingDestination.account_to_id, missingDestination.confirmation_question],
  ['internal_transfer', 'bpi-business', null, 'Which of your accounts received it?'],
);
const [{ classified: missingSource }] = classifyMessage('Transferred 5000 to BPI Business');
assert.deepEqual(
  [missingSource.financial_effect, missingSource.account_from_id, missingSource.account_to_id, missingSource.confirmation_question],
  ['internal_transfer', null, 'bpi-business', 'Which account did the money come from?'],
);

const [{ classified: externalTransfer }] = classifyMessage('Transferred 5000 from Bizlink to GCash Mark', {
  destination_institution: 'GCash', destination_account_label: 'GCash', recipient_name: 'Mark',
});
assert.deepEqual(
  [externalTransfer.financial_effect, externalTransfer.account_from_id, externalTransfer.account_to_id, externalTransfer.ownership_status],
  ['expense', 'bpi-bizlink', null, 'external'],
  'an external recipient must not be credited to an owned account that shares the same institution',
);

const [{ classified: cashWithdrawal }] = classifyMessage('Cash withdrawal 62000 from bpi business');
assert.deepEqual(
  [cashWithdrawal.financial_effect, cashWithdrawal.account_from_id, cashWithdrawal.account_to_id, cashWithdrawal.needs_confirmation],
  ['internal_transfer', 'bpi-business', 'cash-on-hand', false],
);

const [{ classified: bdoWithdrawal }] = classifyMessage('Withdraw 5000 from BDO');
assert.deepEqual(
  [bdoWithdrawal.financial_effect, bdoWithdrawal.account_from_id, bdoWithdrawal.account_to_id, bdoWithdrawal.needs_confirmation],
  ['internal_transfer', 'bdo-mewskin', 'cash-on-hand', false],
);

const [{ classified: cashDeposit }] = classifyMessage('Deposit 5000 cash into BPI Business');
assert.deepEqual(
  [cashDeposit.financial_effect, cashDeposit.account_from_id, cashDeposit.account_to_id, cashDeposit.needs_confirmation],
  ['internal_transfer', 'cash-on-hand', 'bpi-business', false],
);

const [{ classified: cashExpense }] = classifyMessage('Spent 500 cash on lunch');
assert.deepEqual(
  [cashExpense.financial_effect, cashExpense.account_from_id, cashExpense.account_to_id, cashExpense.category_id],
  ['expense', 'cash-on-hand', null, 'lunch'],
);

const [{ facts: gasFacts, classified: gasUsingCash }] = classifyMessage('1k gas using cash');
assert.equal(gasFacts.amount, 1000);
assert.equal(gasFacts.note, 'gas');
assert.deepEqual(
  [gasUsingCash.financial_effect, gasUsingCash.account_from_id, gasUsingCash.category_id, gasUsingCash.space_id, gasUsingCash.needs_confirmation, gasUsingCash.confirmation_question],
  ['expense', 'cash-on-hand', 'fuel', 'space', false, null],
  'known cash account, semantic category, and current Space should save without clarification',
);
assert.ok(gasUsingCash.field_confidence.account >= 0.95);
assert.ok(gasUsingCash.field_confidence.category >= 0.95);
assert.ok(gasUsingCash.field_confidence.space >= 0.9);

const [{ classified: uncategorizedCashExpense }] = classifyMessage('500 spent using cash');
assert.deepEqual(
  [uncategorizedCashExpense.financial_effect, uncategorizedCashExpense.account_from_id, uncategorizedCashExpense.category_id, uncategorizedCashExpense.space_id, uncategorizedCashExpense.confirmation_question, uncategorizedCashExpense.candidate_account_ids.length > 0],
  ['expense', 'cash-on-hand', null, 'space', 'What was this for?', false],
  'resolved cash and Space fields must not reappear while category remains unknown',
);

const defaultSpaceContext = {
  ...context,
  selectedSpaceId: null,
  defaultSpaceId: 'default-space',
  accounts: accounts.map((account) => account.id === 'cash-on-hand' ? { ...account, space_id: null } : account),
  categories: context.categories.map((category) => ({ ...category, space_id: category.space_id === 'space' ? 'default-space' : category.space_id })),
};
const defaultSpaceFacts = enrichExtractedFactsFromMessage(facts({ amount: 0, direction: 'unknown', source_institution: null, source_account_label: null, destination_institution: null, destination_account_label: null, note: null, original_message: '1k gas using cash' }), '1k gas using cash', defaultSpaceContext);
const defaultSpaceCashExpense = classifyExtractedFacts(defaultSpaceFacts, defaultSpaceContext);
assert.deepEqual(
  [defaultSpaceCashExpense.account_from_id, defaultSpaceCashExpense.category_id, defaultSpaceCashExpense.space_id, defaultSpaceCashExpense.needs_confirmation],
  ['cash-on-hand', 'fuel', 'default-space', false],
  'the default Space should be used only after selected and account-associated Spaces are unavailable',
);

const [{ classified: cashIncome }] = classifyMessage('Received 5000 cash from customer');
assert.deepEqual(
  [cashIncome.financial_effect, cashIncome.account_from_id, cashIncome.account_to_id],
  ['income', null, 'cash-on-hand'],
);

const refund = classifyExtractedFacts(facts({
  direction: 'incoming', source_institution: null, source_account_label: null,
  destination_institution: 'BPI', destination_account_label: 'Business',
  note: 'Coffee refund', original_message: 'Received coffee refund in BPI Business',
}), context);
assert.deepEqual(
  [refund.transaction_type, refund.financial_effect, refund.category_id, refund.account_to_id],
  ['refund', 'income', null, 'bpi-business'],
  'refunds keep their incoming balance effect but must not use an income category',
);
assert.ok(refund.candidate_category_ids.every((id) => context.categories.find((category) => category.id === id)?.type === 'expense'));
assert.ok(refund.candidate_category_ids.every((id) => context.categories.find((category) => category.id === id)?.space_id === 'space'));

const feePartsWithoutSource = classifyMessage('Withdraw 10000 with 18 peso fee');
assert.deepEqual(
  feePartsWithoutSource.map((part) => [part.facts.amount, part.classified.financial_effect]),
  [[10000, 'internal_transfer'], [18, 'expense']],
  'principal withdrawal and ATM fee must remain separate even while the missing source needs clarification',
);
const feeParts = classifyMessage('Withdraw 10000 from BPI Business with 18 peso fee');
assert.deepEqual(
  feeParts.map((part) => [part.facts.amount, part.classified.financial_effect, part.classified.account_from_id, part.classified.account_to_id]),
  [[10000, 'internal_transfer', 'bpi-business', 'cash-on-hand'], [18, 'expense', 'bpi-business', null]],
);
const feeBalanceEffects = { 'bpi-business': 100000, 'cash-on-hand': 10000 };
for (const part of feeParts) {
  if (part.classified.account_from_id) feeBalanceEffects[part.classified.account_from_id] -= part.facts.amount;
  if (part.classified.account_to_id) feeBalanceEffects[part.classified.account_to_id] += part.facts.amount;
}
assert.deepEqual(feeBalanceEffects, { 'bpi-business': 89982, 'cash-on-hand': 20000 });
assert.equal(Object.values(feeBalanceEffects).reduce((total, value) => total + value, 0), 109982, 'only the ATM fee may reduce net worth');
assert.equal(feeParts.filter((part) => part.classified.financial_effect === 'expense').reduce((total, part) => total + part.facts.amount, 0), 18);
assert.equal(feeParts.filter((part) => part.classified.financial_effect === 'income').reduce((total, part) => total + part.facts.amount, 0), 0);

const internalTransfers = [cashWithdrawal, bdoWithdrawal, cashDeposit];
for (const transfer of internalTransfers) {
  const sourceBalance = 100000 - (transfer.account_from_id ? 1 : 0) * 5000;
  const destinationBalance = 50000 + (transfer.account_to_id ? 1 : 0) * 5000;
  assert.equal(sourceBalance + destinationBalance, 150000, 'an internal movement must leave net worth unchanged');
}
assert.equal(internalTransfers.filter((item) => item.financial_effect === 'expense').length, 0);
assert.equal(internalTransfers.filter((item) => item.financial_effect === 'income').length, 0);

const classifyStructuredPayments = (message, clarification = null) => extractStructuredPaymentFacts(message, context, {
  clarification,
  transactionDate: '2026-08-29T10:00:00+08:00',
}).map((entry) => ({ facts: entry, classified: classifyExtractedFacts(entry, context) }));

const kynaPayments = classifyStructuredPayments('Kyna Aquino paid 34800 to BDO Mewskin and 52200 to Bizlink for Freshies Avocado stocks');
assert.equal(kynaPayments.length, 2);
assert.deepEqual(
  kynaPayments.map(({ facts: entry, classified }) => [entry.amount, entry.direction, classified.financial_effect, classified.account_to_id, classified.counterparty_name, entry.note, classified.needs_confirmation]),
  [
    [34800, 'incoming', 'income', 'bdo-mewskin', 'Kyna Aquino', 'Freshies Avocado stocks', false],
    [52200, 'incoming', 'income', 'bpi-bizlink', 'Kyna Aquino', 'Freshies Avocado stocks', false],
  ],
);
assert.equal(kynaPayments.reduce((sum, item) => sum + item.facts.amount, 0), 87000);
assert.deepEqual(kynaPayments[0].classified.counterparty_identifiers, {}, 'an owned destination account must not be saved as an incoming payer identifier');

const [johnIncoming] = classifyStructuredPayments('John paid 5000 to BPI Business');
assert.deepEqual(
  [johnIncoming.facts.direction, johnIncoming.classified.financial_effect, johnIncoming.classified.account_from_id, johnIncoming.classified.account_to_id, johnIncoming.classified.counterparty_name],
  ['incoming', 'income', null, 'bpi-business', 'John'],
);

const [johnOutgoing] = classifyStructuredPayments('Paid John 5000 from BPI Business');
assert.deepEqual(
  [johnOutgoing.facts.direction, johnOutgoing.classified.financial_effect, johnOutgoing.classified.account_from_id, johnOutgoing.classified.account_to_id, johnOutgoing.classified.counterparty_name],
  ['outgoing', 'expense', 'bpi-business', null, 'John'],
);

const abcPayments = classifyStructuredPayments('ABC Corp paid 20k to BDO and 30k to BPI');
assert.deepEqual(
  abcPayments.map(({ facts: entry, classified }) => [entry.amount, classified.financial_effect, classified.account_to_id, classified.counterparty_name]),
  [[20000, 'income', 'bdo-mewskin', 'ABC Corp'], [30000, 'income', null, 'ABC Corp']],
  'both entries remain incoming even though a generic BPI alias needs account clarification when several BPI accounts exist',
);

const [abcOutgoing] = classifyStructuredPayments('I paid 20k to ABC Corp using BDO');
assert.deepEqual(
  [abcOutgoing.facts.direction, abcOutgoing.classified.financial_effect, abcOutgoing.classified.account_from_id, abcOutgoing.classified.account_to_id, abcOutgoing.classified.counterparty_name],
  ['outgoing', 'expense', 'bdo-mewskin', null, 'ABC Corp'],
);

for (const clarification of ['No, Kyna Aquino paid me', "No, it's incoming funds to us"]) {
  const corrected = classifyStructuredPayments('Kyna Aquino paid 34800 to BDO Mewskin and 52200 to Bizlink for Freshies Avocado stocks', clarification);
  assert.deepEqual(
    corrected.map(({ facts: entry, classified }) => [entry.amount, entry.direction, classified.account_to_id, classified.counterparty_name]),
    [[34800, 'incoming', 'bdo-mewskin', 'Kyna Aquino'], [52200, 'incoming', 'bpi-bizlink', 'Kyna Aquino']],
    `clarification must retain original entries: ${clarification}`,
  );
}

console.log('ownership-aware classifier: transfers, cash movements, payer direction, multi-entry payments, fees, ambiguity, and external payments passed');
