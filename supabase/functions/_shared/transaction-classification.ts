export type FinancialEffect = 'expense' | 'income' | 'internal_transfer' | 'adjustment';
export type OwnershipStatus = 'owned' | 'external' | 'unknown';
export type MovementKind = 'payment' | 'income' | 'transfer' | 'withdrawal' | 'cash_deposit' | 'cash_expense' | 'cash_income' | 'fee' | 'unknown';

export type AccountIdentity = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  owner_user_id: string | null;
  space_id: string | null;
};

export type AccountIdentifier = {
  account_id: string;
  kind: string;
  normalized_value: string;
  institution: string | null;
  confidence: number;
};

export type ExtractedTransactionFacts = {
  amount: number;
  currency: string;
  direction: 'outgoing' | 'incoming' | 'unknown';
  source_institution: string | null;
  source_account_label: string | null;
  source_account_last4: string | null;
  source_identifier: string | null;
  destination_institution: string | null;
  destination_account_label: string | null;
  destination_account_last4: string | null;
  destination_identifier: string | null;
  recipient_name: string | null;
  payment_rail: string | null;
  bank_transaction_label: string | null;
  note: string | null;
  transaction_date: string;
  confirmation_number: string | null;
  transaction_reference: string | null;
  evidence: string[];
  confidence: number;
  movement_kind?: MovementKind;
  fee_amount?: number;
  original_message?: string;
};

export type ClassificationContext = {
  accounts: AccountIdentity[];
  accountIdentifiers: AccountIdentifier[];
  categories: { id: string; name: string; type: string; space_id: string | null; parent_id: string | null }[];
  counterparties: {
    id: string;
    display_name: string;
    normalized_name: string;
    type: string;
    identifiers: Record<string, unknown> | null;
    owned_account_id: string | null;
    default_category_id: string | null;
    default_classification: string | null;
    confidence: number;
  }[];
  classificationRules: { merchant_pattern: string | null; account_id: string | null; space_id: string | null; category_id: string | null; priority: number }[];
  recentTransactions: { merchant: string | null; category_id: string | null; account_from_id: string | null; account_to_id?: string | null }[];
  selectedSpaceId: string | null;
  defaultSpaceId?: string | null;
};

export type ClassifiedTransaction = {
  transaction_type: 'expense' | 'income' | 'transfer' | 'credit_card_payment' | 'refund';
  financial_effect: FinancialEffect;
  account_from_id: string | null;
  account_to_id: string | null;
  category_id: string | null;
  space_id: string | null;
  counterparty_id: string | null;
  counterparty_name: string | null;
  counterparty_type: 'person' | 'merchant' | 'vendor' | 'own_account' | 'unknown';
  counterparty_identifiers: Record<string, string>;
  ownership_status: OwnershipStatus;
  payment_rail: string;
  confidence: number;
  needs_confirmation: boolean;
  confirmation_question: string | null;
  candidate_account_ids: string[];
  candidate_category_ids: string[];
  field_confidence: {
    amount: number;
    financial_effect: number;
    account: number;
    category: number;
    space: number;
  };
};

const normalize = (value: unknown) => typeof value === 'string'
  ? value.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
  : '';

const normalizeRail = (value: string | null) => {
  const normalized = normalize(value);
  if (normalized.includes('instapay')) return 'instapay';
  if (normalized.includes('pesonet')) return 'pesonet';
  if (normalized.includes('gcash')) return 'gcash';
  if (normalized.includes('maya') || normalized.includes('paymaya')) return 'maya';
  if (normalized.includes('creditcard')) return 'credit_card';
  if (normalized.includes('debitcard')) return 'debit_card';
  if (normalized.includes('cash')) return 'cash';
  if (normalized.includes('transfer') || normalized.includes('bank')) return 'bank_transfer';
  return normalized ? 'other' : 'unknown';
};

const last4 = (value: string | null) => value?.replace(/\D/g, '').slice(-4) || '';

const scoreAccount = (
  account: AccountIdentity,
  identifiers: AccountIdentifier[],
  institution: string | null,
  label: string | null,
  accountLast4: string | null,
  identifier: string | null,
) => {
  const accountName = normalize(account.name);
  const accountInstitution = normalize(account.institution);
  const factInstitution = normalize(institution);
  const factLabel = normalize(label);
  const factIdentifier = normalize(identifier);
  const factLast4 = last4(accountLast4) || last4(identifier);
  const accountAlias = accountInstitution && accountName.startsWith(accountInstitution)
    ? accountName.slice(accountInstitution.length)
    : accountName;
  const institutionMatches = Boolean(factInstitution && accountInstitution && (
    factInstitution.includes(accountInstitution) || accountInstitution.includes(factInstitution)
  ));
  let score = 0;

  if (account.type === 'cash' && ['cash', 'cashonhand', 'physicalcash', 'walletcash'].includes(factLabel)) score = 0.995;

  if (factLabel && accountName && (factLabel === accountName || accountName === `${accountInstitution}${factLabel}` || accountName.includes(factLabel))) {
    score = factLabel === accountName ? 0.95 : institutionMatches ? 0.96 : Math.max(score, factLabel.length >= 5 ? 0.88 : 0.72);
  }
  if (factLabel && accountAlias && factLabel === accountAlias) score = Math.max(score, 0.97);
  if (factInstitution && accountName.includes(factInstitution) && factLabel && accountName.includes(factLabel)) score = Math.max(score, 0.97);
  if (institutionMatches) score = Math.max(score, 0.55);

  for (const owned of identifiers.filter((item) => item.account_id === account.id)) {
    const ownedValue = normalize(owned.normalized_value);
    const ownedInstitution = normalize(owned.institution);
    const identifierInstitutionMatches = !factInstitution || !ownedInstitution || factInstitution.includes(ownedInstitution) || ownedInstitution.includes(factInstitution);
    if (owned.kind === 'account_last4' && factLast4 && last4(owned.normalized_value) === factLast4 && identifierInstitutionMatches) score = Math.max(score, 0.99);
    if (owned.kind === 'mobile' && factIdentifier && ownedValue === factIdentifier) score = Math.max(score, 0.995);
    if ((owned.kind === 'account_alias' || owned.kind === 'account_name') && factLabel && ownedValue === factLabel && identifierInstitutionMatches) score = Math.max(score, 0.98);
    if (owned.kind === 'external_identifier' && factIdentifier && ownedValue === factIdentifier) score = Math.max(score, 0.995);
  }
  return score;
};

const bestAccountMatch = (
  accounts: AccountIdentity[],
  identifiers: AccountIdentifier[],
  institution: string | null,
  label: string | null,
  accountLast4: string | null,
  identifier: string | null,
) => {
  const ranked = accounts
    .map((account) => ({ account, score: scoreAccount(account, identifiers, institution, label, accountLast4, identifier) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score <= 0) return null;
  const second = ranked[1];
  const tied = Boolean(best.score > 0 && second && second.score >= best.score - 0.04);
  const uniquelyResolvablePartial = !tied && best.score >= 0.7 && best.score < 0.9 && (!second || second.score < 0.5);
  return {
    ...best,
    score: uniquelyResolvablePartial ? 0.9 : best.score,
    ambiguous: tied,
    candidateIds: tied ? ranked.filter((item) => item.score >= best.score - 0.04).map((item) => item.account.id) : best.score > 0 ? [best.account.id] : [],
  };
};

const normalizeWords = (value: unknown) => typeof value === 'string'
  ? value.toLocaleLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
  : '';

const cleanAccountReference = (value: string) => value
  .replace(/\b(?:today|yesterday|tomorrow|on|at|via|using|with|plus)\b.*$/i, '')
  .replace(/\b(?:and)?\s*(?:php|peso|pesos|atm)?\s*\d[\d,.]*\s*(?:peso|pesos|atm)?\s*fees?\b.*$/i, '')
  .trim();

const resolveAccountReference = (reference: string, context: ClassificationContext) => {
  const cleaned = cleanAccountReference(reference);
  if (!cleaned) return null;
  const match = bestAccountMatch(context.accounts, context.accountIdentifiers, null, cleaned, null, null);
  return match && !match.ambiguous && match.score >= 0.82 ? match.account : null;
};

const applyResolvedAccount = (facts: ExtractedTransactionFacts, side: 'source' | 'destination', account: AccountIdentity | null) => {
  if (!account) return facts;
  return side === 'source'
    ? { ...facts, source_account_label: account.name, source_institution: account.institution }
    : { ...facts, destination_account_label: account.name, destination_institution: account.institution };
};

const parseAmount = (value: string) => {
  const match = value.match(/(?:₱|\bphp\b|\bp(?=\s?\d))?\s*(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/i);
  if (!match) return 0;
  const base = Number(match[1].replace(/,/g, ''));
  const multiplier = match[2]?.toLocaleLowerCase() === 'm' ? 1_000_000 : match[2]?.toLocaleLowerCase() === 'k' ? 1_000 : 1;
  return Number.isFinite(base) ? base * multiplier : 0;
};

const amountTokenPattern = '(?:₱\\s*|\\bphp\\s*|\\bp(?=\\s?\\d)\\s*)?\\d[\\d,]*(?:\\.\\d+)?\\s*[km]?';

const baseStructuredFacts = (
  message: string,
  transactionDate: string,
  changes: Partial<ExtractedTransactionFacts>,
): ExtractedTransactionFacts => ({
  amount: 0,
  currency: 'PHP',
  direction: 'unknown',
  source_institution: null,
  source_account_label: null,
  source_account_last4: null,
  source_identifier: null,
  destination_institution: null,
  destination_account_label: null,
  destination_account_last4: null,
  destination_identifier: null,
  recipient_name: null,
  payment_rail: null,
  bank_transaction_label: null,
  note: null,
  transaction_date: transactionDate,
  confirmation_number: null,
  transaction_reference: null,
  evidence: ['natural_language_structure'],
  confidence: 0.98,
  original_message: message,
  ...changes,
});

const purposeFromMessage = (message: string) => {
  const match = message.match(/\s+for\s+(.+)$/i);
  return match?.[1]?.trim().replace(/[.?!]+$/, '') || null;
};

const withoutPurpose = (message: string) => message.replace(/\s+for\s+.+$/i, '').trim();

const applyClarifiedDirection = (
  entries: ExtractedTransactionFacts[],
  clarification: string | null | undefined,
): ExtractedTransactionFacts[] => {
  if (!clarification?.trim()) return entries;
  const words = normalizeWords(clarification);
  const incoming = /\b(?:incoming|received|receive|paid me|paid us|to me|to us)\b/.test(words);
  const outgoing = /\b(?:outgoing|i paid|we paid|paid by me|paid by us)\b/.test(words);
  const payer = clarification
    .replace(/^\s*no\s*[,—-]?\s*/i, '')
    .match(/^(.+?)\s+paid\s+(?:me|us)\b/i)?.[1]?.trim() ?? null;
  if (!incoming && !outgoing && !payer) return entries;
  const direction: ExtractedTransactionFacts['direction'] = incoming || payer ? 'incoming' : 'outgoing';
  const movementKind: MovementKind = incoming || payer ? 'income' : 'payment';
  return entries.map((entry): ExtractedTransactionFacts => ({
    ...entry,
    direction,
    movement_kind: movementKind,
    recipient_name: payer || entry.recipient_name,
    evidence: [...entry.evidence, 'clarification_direction'],
    confidence: Math.max(entry.confidence, 0.99),
  }));
};

/**
 * Extracts high-confidence payer/payee structures before the probabilistic model
 * output is classified. It intentionally handles semantic roles and repeated
 * amount/destination clauses, while leaving less structured language to the LLM.
 */
export const extractStructuredPaymentFacts = (
  message: string,
  context: ClassificationContext,
  options: { clarification?: string | null; transactionDate?: string } = {},
): ExtractedTransactionFacts[] => {
  const original = message.trim();
  const transactionDate = options.transactionDate ?? new Date().toISOString();
  const purpose = purposeFromMessage(original);
  const body = withoutPurpose(original);

  const incomingMatch = body.match(/^\s*(.+?)\s+(?:paid|pays)\s+(.+)$/i);
  if (incomingMatch && !/^(?:i|we|ako|kami|the user|user)$/i.test(incomingMatch[1].trim())) {
    const payer = incomingMatch[1].trim();
    const clausePattern = new RegExp(
      `(${amountTokenPattern})\\s+to\\s+(.+?)(?=\\s*(?:,?\\s+and\\s+|,\\s*)${amountTokenPattern}\\s+to\\s+|$)`,
      'gi',
    );
    const entries = [...incomingMatch[2].matchAll(clausePattern)].map((match) => {
      const destinationReference = match[2].trim().replace(/[.?!]+$/, '');
      let facts = baseStructuredFacts(original, transactionDate, {
        amount: parseAmount(match[1]),
        direction: 'incoming',
        recipient_name: payer,
        destination_account_label: destinationReference,
        note: purpose,
        movement_kind: 'income',
      });
      facts = applyResolvedAccount(facts, 'destination', resolveAccountReference(destinationReference, context));
      return facts;
    }).filter((entry) => entry.amount > 0);
    if (entries.length) return applyClarifiedDirection(entries, options.clarification);
  }

  const outgoingMatch = body.match(/^\s*(?:(?:i|we|ako|kami)\s+)?(?:paid|pay)\s+(.+)$/i);
  if (!outgoingMatch) return [];
  const tail = outgoingMatch[1].trim();
  const sourceReference = tail.match(/\b(?:from|using|with)\s+(.+?)$/i)?.[1]?.trim() ?? null;
  const paymentBody = tail.replace(/\s+\b(?:from|using|with)\s+.+$/i, '').trim();
  const clausePattern = new RegExp(
    `(${amountTokenPattern})\\s+to\\s+(.+?)(?=\\s*(?:,?\\s+and\\s+|,\\s*)${amountTokenPattern}\\s+to\\s+|$)`,
    'gi',
  );
  const repeated = [...paymentBody.matchAll(clausePattern)];
  const makeOutgoing = (amount: number, counterparty: string) => {
    let facts = baseStructuredFacts(original, transactionDate, {
      amount,
      direction: 'outgoing',
      recipient_name: counterparty.trim().replace(/[.?!]+$/, ''),
      note: purpose,
      movement_kind: 'payment',
    });
    if (sourceReference) facts = applyResolvedAccount(facts, 'source', resolveAccountReference(sourceReference, context));
    return facts;
  };
  if (repeated.length) {
    return applyClarifiedDirection(
      repeated.map((match) => makeOutgoing(parseAmount(match[1]), match[2])).filter((entry) => entry.amount > 0),
      options.clarification,
    );
  }

  const amountMatch = new RegExp(amountTokenPattern, 'i').exec(paymentBody);
  if (!amountMatch) return [];
  const beforeAmount = paymentBody.slice(0, amountMatch.index).replace(/^to\s+/i, '').trim();
  const afterAmount = paymentBody.slice(amountMatch.index + amountMatch[0].length).trim();
  const afterCounterparty = afterAmount.match(/^to\s+(.+)$/i)?.[1]?.trim() ?? '';
  const counterparty = beforeAmount || afterCounterparty;
  if (!counterparty) return [];
  return applyClarifiedDirection([makeOutgoing(parseAmount(amountMatch[0]), counterparty)], options.clarification);
};

const parseFeeAmount = (value: string) => {
  const match = value.match(/(?:₱|\bphp\b|\bp(?=\s?\d))?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:peso|pesos)?\s*(?:atm\s*)?fees?\b/i)
    ?? value.match(/\b(?:atm\s*)?fees?\s*(?:of\s*)?(?:₱|php|p)?\s*(\d[\d,]*(?:\.\d+)?)/i);
  return match ? Number(match[1].replace(/,/g, '')) || 0 : 0;
};

const extractCashPurpose = (words: string) => words
  .replace(/\b\d+(?:\.\d+)?[km]?\b/g, ' ')
  .replace(/\b(?:php|peso|pesos|spent|spend|paid|pay|purchase|purchased|bought|buy|using|use|with|from|cash|on|for|today|yesterday)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const enrichExtractedFactsFromMessage = (
  input: ExtractedTransactionFacts,
  message: string,
  context: ClassificationContext,
): ExtractedTransactionFacts => {
  const words = normalizeWords(message);
  const messageAmount = parseAmount(message);
  const messageFee = parseFeeAmount(message);
  const extractedFee = Math.max(Number(input.fee_amount) || 0, messageFee);
  const extractedAmount = input.amount > 0 ? input.amount : messageAmount;
  let facts: ExtractedTransactionFacts = {
    ...input,
    original_message: message,
    amount: messageAmount > 0 && extractedFee > 0 && Math.abs(extractedAmount - messageAmount - extractedFee) < 0.005 ? messageAmount : extractedAmount,
    fee_amount: extractedFee,
  };
  const cashAccounts = context.accounts.filter((account) => account.type === 'cash');
  const cashAccount = cashAccounts.length === 1 ? cashAccounts[0] : null;
  const withdrawal = /\b(?:cash\s+withdrawal|withdraw|withdrew|withdrawn)\b/.test(words);
  const cashDeposit = /\b(?:deposit|deposited|depositing)\b/.test(words) && /\bcash\b/.test(words);
  const cashIncome = /\b(?:receive|received|earn|earned|got paid|get paid)\b/.test(words) && /\bcash\b/.test(words);
  const transfer = /\b(?:transfer|transferred|send|sent)\b/.test(words);
  const cashExpenseVerb = /\b(?:spend|spent|pay|paid|buy|bought|purchase|purchased)\b/.test(words);
  const explicitCashMethod = /\b(?:using|use|with|from)\s+cash\b/.test(words) || /\bcash\s+(?:payment|purchase|expense)\b/.test(words);
  const cashExpense = /\bcash\b/.test(words) && (cashExpenseVerb || explicitCashMethod) && !cashIncome && !transfer;

  if (withdrawal) {
    facts = { ...facts, movement_kind: 'withdrawal', direction: 'outgoing', payment_rail: facts.payment_rail ?? 'cash', bank_transaction_label: facts.bank_transaction_label ?? 'Cash withdrawal' };
    facts = applyResolvedAccount(facts, 'destination', cashAccount);
    const sourceReference = words.match(/\bfrom\s+(.+)$/)?.[1];
    if (sourceReference) facts = applyResolvedAccount(facts, 'source', resolveAccountReference(sourceReference, context));
  } else if (cashDeposit) {
    facts = { ...facts, movement_kind: 'cash_deposit', direction: 'outgoing', payment_rail: facts.payment_rail ?? 'cash', bank_transaction_label: facts.bank_transaction_label ?? 'Cash deposit' };
    facts = applyResolvedAccount(facts, 'source', cashAccount);
    const destinationReference = words.match(/\b(?:into|to)\s+(.+)$/)?.[1];
    if (destinationReference) facts = applyResolvedAccount(facts, 'destination', resolveAccountReference(destinationReference, context));
  } else if (cashExpense) {
    facts = { ...facts, movement_kind: 'cash_expense', direction: 'outgoing', payment_rail: 'cash' };
    facts = applyResolvedAccount(facts, 'source', cashAccount);
    const purpose = words.match(/\b(?:on|for)\s+(.+?)(?:\s+(?:using|with)\s+cash)?$/)?.[1] ?? extractCashPurpose(words);
    if (purpose && !facts.note) facts.note = purpose;
  } else if (cashIncome) {
    facts = { ...facts, movement_kind: 'cash_income', direction: 'incoming', payment_rail: 'cash' };
    facts = applyResolvedAccount(facts, 'destination', cashAccount);
    const payer = words.match(/\bfrom\s+(.+)$/)?.[1];
    if (payer && !facts.recipient_name) facts.recipient_name = payer;
  } else if (transfer) {
    facts = { ...facts, movement_kind: 'transfer', direction: 'outgoing' };
    const references = words.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/);
    if (references) {
      facts = applyResolvedAccount(facts, 'source', resolveAccountReference(references[1], context));
      facts = applyResolvedAccount(facts, 'destination', resolveAccountReference(references[2], context));
    } else {
      const sourceReference = words.match(/\bfrom\s+(.+)$/)?.[1];
      const destinationReference = words.match(/\bto\s+(.+)$/)?.[1];
      if (sourceReference) facts = applyResolvedAccount(facts, 'source', resolveAccountReference(sourceReference, context));
      if (destinationReference) facts = applyResolvedAccount(facts, 'destination', resolveAccountReference(destinationReference, context));
    }
  }
  return facts;
};

export const expandFeeFacts = (facts: ExtractedTransactionFacts): ExtractedTransactionFacts[] => {
  const feeAmount = Math.max(0, Number(facts.fee_amount) || 0);
  const main = { ...facts, fee_amount: 0 };
  if (!feeAmount) return [main];
  return [main, {
    ...main,
    amount: feeAmount,
    direction: 'outgoing',
    destination_institution: null,
    destination_account_label: null,
    destination_account_last4: null,
    destination_identifier: null,
    recipient_name: 'Bank/ATM Fees',
    movement_kind: 'fee',
    payment_rail: 'cash',
    bank_transaction_label: 'ATM fee',
    note: 'Bank/ATM Fees',
    confirmation_number: null,
    transaction_reference: null,
  }];
};

const counterpartyIdentifiers = (facts: ExtractedTransactionFacts) => {
  const incoming = facts.direction === 'incoming';
  const institution = incoming ? facts.source_institution : facts.destination_institution;
  const accountLast4 = incoming ? facts.source_account_last4 : facts.destination_account_last4;
  const identifier = incoming ? facts.source_identifier : facts.destination_identifier;
  const accountLabel = incoming ? facts.source_account_label : facts.destination_account_label;
  const identifiers: Record<string, string> = {};
  if (institution) identifiers.bank = institution;
  if (accountLast4) identifiers.accountLast4 = last4(accountLast4);
  if (identifier) identifiers.externalIdentifier = identifier.replace(/\s/g, '').slice(-32);
  if (accountLabel) identifiers.accountName = accountLabel;
  return identifiers;
};

const findCounterparty = (facts: ExtractedTransactionFacts, context: ClassificationContext) => {
  const name = normalize(facts.recipient_name ?? (facts.direction === 'incoming' ? facts.source_account_label : facts.destination_account_label));
  const identifier = normalize(facts.direction === 'incoming' ? facts.source_identifier : facts.destination_identifier);
  const destinationLast4 = last4(facts.direction === 'incoming' ? facts.source_account_last4 : facts.destination_account_last4)
    || last4(facts.direction === 'incoming' ? facts.source_identifier : facts.destination_identifier);
  return context.counterparties.find((item) => {
    const identifiers = item.identifiers ?? {};
    const savedIdentifier = normalize(identifiers.externalIdentifier);
    const savedLast4 = last4(String(identifiers.accountLast4 ?? ''));
    if (name && item.normalized_name === name) {
      if (identifier && savedIdentifier && identifier !== savedIdentifier) return false;
      if (destinationLast4 && savedLast4 && destinationLast4 !== savedLast4) return false;
      return true;
    }
    if (identifier && normalize(identifiers.externalIdentifier) === identifier) return true;
    return Boolean(destinationLast4 && savedLast4 === destinationLast4);
  }) ?? null;
};

type CategoryMatch = { id: string; confidence: number; source: 'counterparty' | 'rule' | 'history' | 'explicit' | 'semantic' };

const categoryAliases: Record<string, string[]> = {
  fuel: ['gas', 'gasoline', 'petrol', 'diesel', 'fuel station', 'petron', 'shell', 'caltex', 'seaoil', 'unioil'],
  'grabtaxi': ['grab', 'taxi', 'cab', 'ride hailing', 'angkas', 'joyride'],
  transportation: ['transport', 'commute', 'fare', 'toll', 'parking', 'bus', 'train', 'jeepney', 'tricycle'],
  groceries: ['grocery', 'groceries', 'supermarket', 'market', 'palengke'],
  restaurants: ['restaurant', 'dining', 'lunch', 'dinner', 'breakfast', 'meal', 'eat out'],
  coffee: ['coffee', 'cafe', 'café'],
  'billsutilities': ['bill', 'utility', 'utilities', 'electricity', 'power', 'water', 'internet', 'mobile load', 'meralco', 'maynilad'],
  shopping: ['shopping', 'clothes', 'clothing', 'shoes', 'retail'],
  delivery: ['delivery', 'shipping', 'courier', 'lalamove', 'spx', 'jnt', 'ninjavan'],
  income: ['income', 'salary', 'payroll', 'wage', 'earnings', 'commission'],
};

const includesPhrase = (text: string, phrase: string) => Boolean(phrase && ` ${text} `.includes(` ${phrase} `));

const chooseCategory = (facts: ExtractedTransactionFacts, counterparty: ReturnType<typeof findCounterparty>, context: ClassificationContext, categoryType: 'expense' | 'income' | null): CategoryMatch | null => {
  if (!categoryType || !context.selectedSpaceId) return null;
  const valid = (id: string | null) => context.categories.find((item) => item.id === id && item.type === categoryType && item.space_id === context.selectedSpaceId);
  if (counterparty?.default_category_id && valid(counterparty.default_category_id)) return { id: counterparty.default_category_id, confidence: Math.max(0.9, counterparty.confidence || 0), source: 'counterparty' };

  const semanticText = normalizeWords([facts.recipient_name, facts.destination_account_label, facts.note, facts.original_message].filter(Boolean).join(' '));
  const compactText = normalize(semanticText);
  const rule = context.classificationRules.find((item) => item.category_id && item.merchant_pattern && compactText.includes(normalize(item.merchant_pattern)) && valid(item.category_id));
  if (rule?.category_id) return { id: rule.category_id, confidence: 0.98, source: 'rule' };

  const knownName = normalize(facts.recipient_name ?? facts.destination_account_label);
  if (knownName) {
    const recent = context.recentTransactions.find((item) => normalize(item.merchant) === knownName && valid(item.category_id));
    if (recent?.category_id) return { id: recent.category_id, confidence: 0.92, source: 'history' };
  }

  const eligible = context.categories.filter((item) => item.type === categoryType && item.space_id === context.selectedSpaceId);
  const ranked = eligible.map((item) => {
    const categoryName = normalizeWords(item.name);
    const compactName = normalize(item.name);
    const parent = item.parent_id ? context.categories.find((candidate) => candidate.id === item.parent_id) : null;
    const fullPath = normalizeWords([parent?.name, item.name].filter(Boolean).join(' '));
    let confidence = 0;
    let source: CategoryMatch['source'] = 'semantic';
    if (includesPhrase(semanticText, categoryName) || compactText === compactName || fullPath && includesPhrase(semanticText, fullPath)) {
      confidence = item.parent_id ? 0.99 : 0.97;
      source = 'explicit';
    }
    for (const alias of categoryAliases[compactName] ?? []) {
      const normalizedAlias = normalizeWords(alias);
      if (includesPhrase(semanticText, normalizedAlias)) confidence = Math.max(confidence, item.parent_id ? 0.96 : 0.9);
    }
    return { id: item.id, confidence, source };
  }).filter((item) => item.confidence > 0).sort((left, right) => right.confidence - left.confidence);
  const best = ranked[0];
  const second = ranked[1];
  if (best && best.confidence >= 0.88 && (!second || second.confidence < best.confidence - 0.03)) return best;
  if (categoryType === 'income') {
    const genericIncome = eligible.find((item) => !item.parent_id && normalize(item.name) === 'income');
    if (genericIncome) return { id: genericIncome.id, confidence: 0.9, source: 'semantic' };
  }
  return null;
};

const inferMovementKind = (facts: ExtractedTransactionFacts): MovementKind => {
  if (facts.movement_kind) return facts.movement_kind;
  const semanticText = normalizeWords([facts.bank_transaction_label, facts.note, facts.original_message].filter(Boolean).join(' '));
  const originalText = normalizeWords(facts.original_message);
  if (/\b(?:cash withdrawal|withdraw|withdrew)\b/.test(semanticText)) return 'withdrawal';
  if (/\b(?:cash deposit|deposit cash|deposited cash)\b/.test(semanticText)) return 'cash_deposit';
  if (/\b(?:transfer|transferred|send money)\b/.test(originalText)) return 'transfer';
  return facts.direction === 'incoming' ? 'income' : 'unknown';
};

export const classifyExtractedFacts = (inputFacts: ExtractedTransactionFacts, context: ClassificationContext): ClassifiedTransaction => {
  const movementKind = inferMovementKind(inputFacts);
  const cashAccounts = context.accounts.filter((account) => account.type === 'cash');
  const cashAccount = cashAccounts.length === 1 ? cashAccounts[0] : null;
  let facts = inputFacts;
  if (cashAccount && movementKind === 'withdrawal' && !facts.destination_account_label && !facts.destination_identifier && !facts.destination_account_last4) {
    facts = { ...facts, destination_account_label: cashAccount.name, destination_institution: cashAccount.institution };
  } else if (cashAccount && movementKind === 'cash_deposit' && !facts.source_account_label && !facts.source_identifier && !facts.source_account_last4) {
    facts = { ...facts, source_account_label: cashAccount.name, source_institution: cashAccount.institution };
  } else if (cashAccount && movementKind === 'cash_expense' && !facts.source_account_label) {
    facts = { ...facts, source_account_label: cashAccount.name, source_institution: cashAccount.institution };
  } else if (cashAccount && movementKind === 'cash_income' && !facts.destination_account_label) {
    facts = { ...facts, destination_account_label: cashAccount.name, destination_institution: cashAccount.institution };
  }
  const source = bestAccountMatch(context.accounts, context.accountIdentifiers, facts.source_institution, facts.source_account_label, facts.source_account_last4, facts.source_identifier);
  const destination = bestAccountMatch(context.accounts, context.accountIdentifiers, facts.destination_institution, facts.destination_account_label, facts.destination_account_last4, facts.destination_identifier);
  const counterparty = findCounterparty(facts, context);
  const direction = facts.direction;
  const movementText = normalizeWords([facts.note, facts.original_message, facts.bank_transaction_label].filter(Boolean).join(' '));
  const isRefund = direction === 'incoming' && /\b(refund|refunded|reimbursement|reimbursed|cashback|chargeback)\b/.test(movementText);
  const sourceOwned = Boolean(source && !source.ambiguous && source.score >= 0.82);
  const destinationOwned = Boolean(destination && !destination.ambiguous && destination.score >= 0.90) || Boolean(counterparty?.type === 'own_account' && counterparty.owned_account_id);
  const destinationAccount = counterparty?.type === 'own_account' && counterparty.owned_account_id
    ? context.accounts.find((item) => item.id === counterparty.owned_account_id) ?? destination?.account
    : destination?.account;
  const hasExternalRecipient = Boolean(counterparty?.type !== 'own_account' && facts.recipient_name && normalize(facts.recipient_name) !== normalize(destinationAccount?.name));
  const differentOwnedAccounts = Boolean(sourceOwned && destinationOwned && !hasExternalRecipient && source?.account.id !== destinationAccount?.id);
  const expectsOwnedMovement = movementKind === 'transfer' || movementKind === 'withdrawal' || movementKind === 'cash_deposit';
  const hasSourceEvidence = Boolean(facts.source_institution || facts.source_account_label || facts.source_account_last4 || facts.source_identifier);
  const hasDestinationEvidence = Boolean(facts.destination_institution || facts.destination_account_label || facts.destination_account_last4 || facts.destination_identifier);
  const hasMissingOrAmbiguousOwnedSide = (!sourceOwned && (!hasSourceEvidence || source?.ambiguous))
    || (!destinationOwned && (!hasDestinationEvidence || destination?.ambiguous));
  const destinationPossiblyOwned = Boolean(!hasExternalRecipient && destination && (destination.ambiguous || destination.score >= 0.5 && (destination.score < 0.9 || !sourceOwned)));

  let financialEffect: FinancialEffect;
  let ownershipStatus: OwnershipStatus;
  let transactionType: ClassifiedTransaction['transaction_type'];
  let accountFromId: string | null = null;
  let accountToId: string | null = null;

  if (direction === 'incoming') {
    financialEffect = 'income'; ownershipStatus = 'external'; transactionType = isRefund ? 'refund' : 'income';
    accountToId = destinationOwned ? destinationAccount?.id ?? null : sourceOwned ? source?.account.id ?? null : null;
  } else if (differentOwnedAccounts) {
    financialEffect = 'internal_transfer'; ownershipStatus = 'owned';
    accountFromId = source!.account.id; accountToId = destinationAccount!.id;
    transactionType = destinationAccount?.type === 'credit_card' ? 'credit_card_payment' : 'transfer';
  } else if (expectsOwnedMovement && !hasExternalRecipient && hasMissingOrAmbiguousOwnedSide) {
    financialEffect = 'internal_transfer'; ownershipStatus = 'unknown'; transactionType = 'transfer';
    accountFromId = sourceOwned ? source!.account.id : null;
    accountToId = destinationOwned ? destinationAccount?.id ?? null : null;
  } else {
    financialEffect = 'expense'; transactionType = 'expense'; accountFromId = sourceOwned ? source!.account.id : null;
    ownershipStatus = destinationPossiblyOwned ? 'unknown' : 'external';
  }

  const spaceId = context.selectedSpaceId ?? source?.account.space_id ?? destinationAccount?.space_id ?? context.defaultSpaceId ?? null;
  const categoryType = transactionType === 'refund' || financialEffect === 'expense' ? 'expense' : transactionType === 'income' ? 'income' : null;
  const categoryMatch = chooseCategory(facts, counterparty, { ...context, selectedSpaceId: spaceId }, categoryType);
  const categoryId = categoryMatch?.id ?? null;
  const candidateCategories = categoryType && spaceId
    ? context.categories.filter((item) => item.type === categoryType && item.space_id === spaceId).map((item) => item.id)
    : [];

  let question: string | null = null;
  let candidates: string[] = [];
  if (financialEffect === 'internal_transfer' && !accountFromId) {
    question = 'Which account did the money come from?';
    candidates = source?.ambiguous && source.candidateIds.length
      ? source.candidateIds
      : context.accounts.filter((item) => item.id !== accountToId).map((item) => item.id);
  } else if (financialEffect === 'internal_transfer' && !accountToId) {
    question = 'Which of your accounts received it?';
    candidates = destination?.ambiguous && destination.candidateIds.length
      ? destination.candidateIds
      : context.accounts.filter((item) => item.id !== accountFromId).map((item) => item.id);
  } else if (ownershipStatus === 'unknown') {
    question = 'Is this payment to someone else, or a transfer to one of your own accounts?';
    candidates = context.accounts.filter((item) => item.id !== accountFromId).map((item) => item.id);
  } else if ((financialEffect === 'expense' && !accountFromId) || (financialEffect === 'income' && !accountToId)) {
    question = financialEffect === 'income' ? 'Which account received this money?' : 'Which account did you pay with?';
    candidates = context.accounts.map((item) => item.id);
  } else if (!spaceId) {
    question = 'Which Space is this for?';
  } else if (categoryType && !categoryId && movementKind !== 'fee') {
    question = transactionType === 'refund' ? 'Which original expense category should this refund reduce?' : financialEffect === 'expense' ? 'What was this for?' : 'What kind of income was this?';
  }

  const baseConfidence = Math.max(0, Math.min(1, Number(facts.confidence) || 0));
  const ownershipConfidence = financialEffect === 'internal_transfer'
    ? Math.min(source?.score ?? 0, destination?.score ?? 0)
    : sourceOwned || destinationOwned ? 0.88 : 0.62;
  const accountConfidence = financialEffect === 'internal_transfer'
    ? Math.min(source?.score ?? 0, destination?.score ?? 0)
    : financialEffect === 'income' ? destination?.score ?? source?.score ?? 0 : source?.score ?? 0;
  const spaceConfidence = context.selectedSpaceId ? 1
    : source?.account.space_id || destinationAccount?.space_id ? 0.96
      : context.defaultSpaceId ? 0.9 : 0;
  const effectConfidence = movementKind === 'withdrawal' || movementKind === 'cash_deposit' || movementKind === 'cash_expense' || movementKind === 'cash_income'
    ? 0.98 : financialEffect === 'internal_transfer' && differentOwnedAccounts ? 0.98 : Math.max(0.82, baseConfidence);

  return {
    transaction_type: transactionType,
    financial_effect: financialEffect,
    account_from_id: accountFromId,
    account_to_id: accountToId,
    category_id: categoryId,
    space_id: spaceId,
    counterparty_id: counterparty?.id ?? null,
    counterparty_name: facts.recipient_name ?? facts.destination_account_label,
    counterparty_type: ownershipStatus === 'owned' ? 'own_account' : counterparty?.type === 'person' || counterparty?.type === 'merchant' || counterparty?.type === 'vendor' ? counterparty.type : 'unknown',
    counterparty_identifiers: counterpartyIdentifiers(facts),
    ownership_status: ownershipStatus,
    payment_rail: normalizeRail(facts.payment_rail ?? facts.bank_transaction_label),
    confidence: Math.min(baseConfidence, ownershipConfidence),
    needs_confirmation: Boolean(question),
    confirmation_question: question,
    candidate_account_ids: candidates,
    candidate_category_ids: categoryId ? [] : candidateCategories,
    field_confidence: {
      amount: baseConfidence,
      financial_effect: effectConfidence,
      account: accountConfidence,
      category: categoryMatch?.confidence ?? 0,
      space: spaceConfidence,
    },
  };
};

export const normalizeIdentifierValue = normalize;
