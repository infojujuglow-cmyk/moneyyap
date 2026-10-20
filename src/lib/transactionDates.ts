export interface TransactionDateGroup<T> {
  key: string;
  transactionDate: string;
  items: T[];
}

export function transactionDateKey(transactionDate: string) {
  return new Date(transactionDate).toDateString();
}

export function groupTransactionsByDate<T extends { transactionDate: string }>(transactions: T[]) {
  return transactions.reduce<TransactionDateGroup<T>[]>((groups, transaction) => {
    const key = transactionDateKey(transaction.transactionDate);
    const currentGroup = groups.at(-1);

    if (currentGroup?.key === key) {
      currentGroup.items.push(transaction);
    } else {
      groups.push({ key, transactionDate: transaction.transactionDate, items: [transaction] });
    }

    return groups;
  }, []);
}
