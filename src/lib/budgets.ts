import type { BudgetAllocation, Category, Transaction, TransactionSplit } from '@/types/finance';

export const UNCATEGORIZED_BUDGET_KEY = '__uncategorized__';

export type BudgetProgressTone = 'healthy' | 'warning' | 'over' | 'unallocated';

export interface BudgetCategoryRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  spaceId: string | null;
  parentId: string | null;
  directAllocated: number;
  directSpent: number;
  allocated: number;
  spent: number;
  remaining: number;
  utilization: number;
  tone: BudgetProgressTone;
  directTransactionIds: string[];
  transactionIds: string[];
  children: BudgetCategoryRow[];
}

export interface BudgetSnapshot {
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  utilization: number;
  tone: BudgetProgressTone;
  rows: BudgetCategoryRow[];
  actualByCategory: Map<string, number>;
}

export const budgetMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

export const budgetMonthLabel = (date: Date) =>
  date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

export const shiftBudgetMonth = (date: Date, offset: number) =>
  new Date(date.getFullYear(), date.getMonth() + offset, 1);

export const budgetTone = (allocated: number, spent: number): BudgetProgressTone => {
  if (allocated <= 0) return spent > 0 ? 'unallocated' : 'healthy';
  const utilization = spent / allocated;
  if (utilization >= 1) return 'over';
  if (utilization >= 0.8) return 'warning';
  return 'healthy';
};

const isInMonth = (value: string, month: Date) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === month.getFullYear()
    && date.getMonth() === month.getMonth();
};

const amountEntriesForTransaction = (transaction: Transaction, splits: TransactionSplit[]) => {
  if (transaction.type !== 'refund' && transaction.financialEffect !== 'expense') return [];
  const sign = transaction.type === 'refund' ? -1 : 1;
  const transactionSplits = splits.filter((split) => split.transactionId === transaction.id);
  if (!transactionSplits.length) return [{ categoryId: transaction.categoryId ?? UNCATEGORIZED_BUDGET_KEY, amount: sign * transaction.amount }];
  const entries = transactionSplits.map((split) => ({ categoryId: split.categoryId, amount: sign * split.amount }));
  const splitTotal = transactionSplits.reduce((sum, split) => sum + split.amount, 0);
  const remainder = Math.max(0, transaction.amount - splitTotal);
  if (remainder > 0.005) entries.push({ categoryId: transaction.categoryId ?? UNCATEGORIZED_BUDGET_KEY, amount: sign * remainder });
  return entries;
};

export const budgetActuals = (transactions: Transaction[], splits: TransactionSplit[], month: Date) => {
  const amounts = new Map<string, number>();
  const transactionIds = new Map<string, Set<string>>();
  transactions.filter((transaction) => isInMonth(transaction.transactionDate, month)).forEach((transaction) => {
    amountEntriesForTransaction(transaction, splits).forEach(({ categoryId, amount }) => {
      amounts.set(categoryId, (amounts.get(categoryId) ?? 0) + amount);
      const ids = transactionIds.get(categoryId) ?? new Set<string>();
      ids.add(transaction.id);
      transactionIds.set(categoryId, ids);
    });
  });
  return { amounts, transactionIds };
};

const unique = <T,>(items: T[]) => [...new Set(items)];

export const buildBudgetSnapshot = (
  categories: Category[],
  allocations: BudgetAllocation[],
  transactions: Transaction[],
  splits: TransactionSplit[],
  month: Date,
): BudgetSnapshot => {
  const expenseCategories = categories.filter((category) => category.type === 'expense');
  const allocationByCategory = new Map(allocations.map((allocation) => [allocation.categoryId, allocation.amount]));
  const { amounts: actualByCategory, transactionIds } = budgetActuals(transactions, splits, month);
  const categoryIds = new Set(expenseCategories.map((category) => category.id));
  const childrenByParent = new Map<string | null, Category[]>();
  expenseCategories.forEach((category) => {
    const parentId = category.parentId && categoryIds.has(category.parentId) ? category.parentId : null;
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), category]);
  });
  childrenByParent.forEach((children) => children.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));

  const buildRow = (category: Category, lineage = new Set<string>()): BudgetCategoryRow => {
    if (lineage.has(category.id)) throw new Error('Category hierarchy contains a cycle.');
    const nextLineage = new Set(lineage).add(category.id);
    const children = (childrenByParent.get(category.id) ?? []).map((child) => buildRow(child, nextLineage));
    const directAllocated = allocationByCategory.get(category.id) ?? 0;
    const directSpent = actualByCategory.get(category.id) ?? 0;
    const allocated = directAllocated + children.reduce((sum, child) => sum + child.allocated, 0);
    const spent = directSpent + children.reduce((sum, child) => sum + child.spent, 0);
    const directTransactionIds = [...(transactionIds.get(category.id) ?? [])];
    const allTransactionIds = unique([...directTransactionIds, ...children.flatMap((child) => child.transactionIds)]);
    return {
      id: category.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      spaceId: category.spaceId,
      parentId: category.parentId,
      directAllocated,
      directSpent,
      allocated,
      spent,
      remaining: allocated - spent,
      utilization: allocated > 0 ? spent / allocated : spent > 0 ? Infinity : 0,
      tone: budgetTone(allocated, spent),
      directTransactionIds,
      transactionIds: allTransactionIds,
      children,
    };
  };

  const rows = (childrenByParent.get(null) ?? []).map((category) => buildRow(category));
  const uncategorizedSpent = actualByCategory.get(UNCATEGORIZED_BUDGET_KEY) ?? 0;
  if (uncategorizedSpent || transactionIds.get(UNCATEGORIZED_BUDGET_KEY)?.size) {
    rows.push({
      id: UNCATEGORIZED_BUDGET_KEY,
      name: 'Uncategorized',
      icon: 'help-circle-outline',
      color: '#68717D',
      spaceId: null,
      parentId: null,
      directAllocated: 0,
      directSpent: uncategorizedSpent,
      allocated: 0,
      spent: uncategorizedSpent,
      remaining: -uncategorizedSpent,
      utilization: uncategorizedSpent > 0 ? Infinity : 0,
      tone: budgetTone(0, uncategorizedSpent),
      directTransactionIds: [...(transactionIds.get(UNCATEGORIZED_BUDGET_KEY) ?? [])],
      transactionIds: [...(transactionIds.get(UNCATEGORIZED_BUDGET_KEY) ?? [])],
      children: [],
    });
  }

  const totalAllocated = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  const totalSpent = [...actualByCategory.values()].reduce((sum, amount) => sum + amount, 0);
  return {
    totalAllocated,
    totalSpent,
    remaining: totalAllocated - totalSpent,
    utilization: totalAllocated > 0 ? totalSpent / totalAllocated : totalSpent > 0 ? Infinity : 0,
    tone: budgetTone(totalAllocated, totalSpent),
    rows,
    actualByCategory,
  };
};

export const flattenBudgetRows = (rows: BudgetCategoryRow[]): BudgetCategoryRow[] =>
  rows.flatMap((row) => [row, ...flattenBudgetRows(row.children)]);
