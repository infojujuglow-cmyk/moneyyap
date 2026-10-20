import type { Transaction } from '@/types/finance';

export const transactionAccountIds = (transaction: Pick<Transaction, 'accountFromId' | 'accountToId'>) =>
  [...new Set([transaction.accountFromId, transaction.accountToId].filter((id): id is string => Boolean(id)))];

export const isTransactionReconciled = (transaction: Transaction, accountId?: string | null) => {
  const accountIds = accountId ? transactionAccountIds(transaction).filter((id) => id === accountId) : transactionAccountIds(transaction);
  if (!accountIds.length) return false;
  const reconciledIds = new Set(transaction.reconciliations.map((item) => item.accountId));
  return accountIds.every((id) => reconciledIds.has(id));
};

export const reconciliationDate = (transaction: Transaction, accountId?: string | null) => {
  const relevant = accountId
    ? transaction.reconciliations.filter((item) => item.accountId === accountId)
    : transaction.reconciliations.filter((item) => transactionAccountIds(transaction).includes(item.accountId));
  if (!relevant.length) return null;
  return relevant.map((item) => item.reconciledAt).sort().at(-1) ?? null;
};
