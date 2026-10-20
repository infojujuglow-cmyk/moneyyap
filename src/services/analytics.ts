import type { Account, Category, CategoryType, MonthlyPoint, Space, Transaction } from '@/types/finance';

export const isSpend = (transaction: Transaction) => transaction.financialEffect === 'expense';
export const isRefund = (transaction: Transaction) => transaction.type === 'refund';
export const isIncome = (transaction: Transaction) => transaction.financialEffect === 'income' && !isRefund(transaction);
export const expenseContribution = (transaction: Transaction) => isRefund(transaction) ? -transaction.amount : isSpend(transaction) ? transaction.amount : 0;

export const formatReportPercentage = (amount: number, total: number) => {
  if (total <= 0 || amount <= 0) return '0%';
  const percentage = amount / total * 100;
  if (percentage < 1) return '<1%';
  return `${percentage < 10 ? percentage.toFixed(1) : Math.round(percentage)}%`;
};

export type AnalyticsRangeKey = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'last_6_months' | 'custom';
export type AnalyticsGrouping = 'three_hour' | 'day' | 'week' | 'month';

export interface AnalyticsCustomRange {
  start: Date;
  end: Date;
}

export interface AnalyticsDateRange {
  key: AnalyticsRangeKey;
  label: string;
  start: Date;
  end: Date;
  comparisonStart: Date;
  comparisonEnd: Date;
  grouping: AnalyticsGrouping;
  rangeLabel: string;
  comparisonLabel: string;
}

export interface CashFlowTotals {
  spending: number;
  income: number;
  netCashFlow: number;
  transactionCount: number;
}

export interface MonthToDateTotals extends CashFlowTotals {
  previousSpending: number;
  spendingChange: number | null;
  comparisonLabel: string | null;
}

export const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const startOfNextLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
export const startOfLocalMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const startOfLocalWeek = (date: Date) => {
  const start = startOfLocalDay(date);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
};

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
const addMonths = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());

const formatShortDate = (date: Date) => date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const formatRangeLabel = (start: Date, end: Date) => {
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate()) return formatShortDate(start);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) return `${start.toLocaleDateString('en-PH', { month: 'short' })} ${start.getDate()}–${end.getDate()}`;
  if (start.getFullYear() === end.getFullYear()) return `${formatShortDate(start)} – ${formatShortDate(end)}`;
  return `${start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

const analyticsRangeMeta: Record<Exclude<AnalyticsRangeKey, 'custom'>, Pick<AnalyticsDateRange, 'label' | 'comparisonLabel'>> = {
  today: { label: 'Today', comparisonLabel: 'vs yesterday' },
  yesterday: { label: 'Yesterday', comparisonLabel: 'vs previous day' },
  this_week: { label: 'This week', comparisonLabel: 'vs same period last week' },
  this_month: { label: 'This month', comparisonLabel: 'vs same period last month' },
  last_month: { label: 'Last month', comparisonLabel: 'vs previous month' },
  last_30_days: { label: 'Last 30 days', comparisonLabel: 'vs previous 30 days' },
  last_6_months: { label: 'Last 6 months', comparisonLabel: 'vs previous 6 months' },
};

export const resolveAnalyticsDateRange = (
  key: AnalyticsRangeKey,
  now = new Date(),
  customRange?: AnalyticsCustomRange,
): AnalyticsDateRange => {
  const currentMoment = new Date(now);
  const todayStart = startOfLocalDay(currentMoment);
  let start = todayStart;
  let end = currentMoment;
  let comparisonStart = addDays(todayStart, -1);
  let comparisonEnd = new Date(comparisonStart.getTime() + (currentMoment.getTime() - todayStart.getTime()));
  let grouping: AnalyticsGrouping = 'three_hour';
  let label = analyticsRangeMeta.today.label;
  let comparisonLabel = analyticsRangeMeta.today.comparisonLabel;
  let displayEnd = currentMoment;

  if (key === 'yesterday') {
    start = addDays(todayStart, -1);
    end = todayStart;
    comparisonStart = addDays(start, -1);
    comparisonEnd = start;
    grouping = 'three_hour';
    label = analyticsRangeMeta.yesterday.label;
    comparisonLabel = analyticsRangeMeta.yesterday.comparisonLabel;
    displayEnd = new Date(end.getTime() - 1);
  } else if (key === 'this_week') {
    start = startOfLocalWeek(currentMoment);
    end = currentMoment;
    comparisonStart = addDays(start, -7);
    comparisonEnd = new Date(comparisonStart.getTime() + (end.getTime() - start.getTime()));
    grouping = 'day';
    label = analyticsRangeMeta.this_week.label;
    comparisonLabel = analyticsRangeMeta.this_week.comparisonLabel;
  } else if (key === 'this_month') {
    start = startOfLocalMonth(currentMoment);
    end = currentMoment;
    comparisonStart = new Date(currentMoment.getFullYear(), currentMoment.getMonth() - 1, 1);
    comparisonEnd = new Date(comparisonStart.getTime() + (end.getTime() - start.getTime()));
    grouping = 'day';
    label = analyticsRangeMeta.this_month.label;
    comparisonLabel = analyticsRangeMeta.this_month.comparisonLabel;
  } else if (key === 'last_month') {
    start = new Date(currentMoment.getFullYear(), currentMoment.getMonth() - 1, 1);
    end = new Date(currentMoment.getFullYear(), currentMoment.getMonth(), 1);
    comparisonStart = new Date(currentMoment.getFullYear(), currentMoment.getMonth() - 2, 1);
    comparisonEnd = start;
    grouping = 'day';
    label = analyticsRangeMeta.last_month.label;
    comparisonLabel = analyticsRangeMeta.last_month.comparisonLabel;
    displayEnd = new Date(end.getTime() - 1);
  } else if (key === 'last_30_days') {
    start = addDays(todayStart, -29);
    end = currentMoment;
    comparisonEnd = start;
    comparisonStart = addDays(start, -30);
    grouping = 'day';
    label = analyticsRangeMeta.last_30_days.label;
    comparisonLabel = analyticsRangeMeta.last_30_days.comparisonLabel;
  } else if (key === 'last_6_months') {
    start = new Date(currentMoment.getFullYear(), currentMoment.getMonth() - 5, 1);
    end = currentMoment;
    comparisonEnd = start;
    comparisonStart = new Date(start.getFullYear(), start.getMonth() - 6, 1);
    grouping = 'month';
    label = analyticsRangeMeta.last_6_months.label;
    comparisonLabel = analyticsRangeMeta.last_6_months.comparisonLabel;
  } else if (key === 'custom' && customRange) {
    const normalizedStart = startOfLocalDay(customRange.start);
    const requestedEnd = startOfNextLocalDay(customRange.end);
    start = normalizedStart;
    end = requestedEnd > currentMoment ? currentMoment : requestedEnd;
    if (end <= start) end = startOfNextLocalDay(start);
    comparisonEnd = start;
    comparisonStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const durationDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
    grouping = durationDays <= 2 ? 'three_hour' : durationDays <= 90 ? 'day' : durationDays <= 365 ? 'week' : 'month';
    label = 'Custom range';
    comparisonLabel = 'vs previous period';
    displayEnd = requestedEnd > currentMoment ? currentMoment : customRange.end;
  }

  return { key, label, start, end, comparisonStart, comparisonEnd, grouping, rangeLabel: formatRangeLabel(start, displayEnd), comparisonLabel };
};

export const transactionsInRange = (transactions: Transaction[], start: Date, endExclusive: Date) =>
  transactions.filter((item) => {
    const itemDate = new Date(item.transactionDate);
    return !Number.isNaN(itemDate.getTime()) && itemDate >= start && itemDate < endExclusive;
  });

export const cashFlowTotals = (transactions: Transaction[]): CashFlowTotals => {
  const spending = transactions.reduce((sum, item) => sum + expenseContribution(item), 0);
  const income = transactions.filter(isIncome).reduce((sum, item) => sum + item.amount, 0);
  return { spending, income, netCashFlow: income - spending, transactionCount: transactions.length };
};

export const todayTransactions = (transactions: Transaction[], date = new Date()) =>
  transactionsInRange(transactions, startOfLocalDay(date), startOfNextLocalDay(date));

export const todayTotals = (transactions: Transaction[], date = new Date()) =>
  cashFlowTotals(todayTransactions(transactions, date));

export const monthToDateTransactions = (transactions: Transaction[], date = new Date()) =>
  transactionsInRange(transactions, startOfLocalMonth(date), startOfNextLocalDay(date));

export const monthToDateTotals = (transactions: Transaction[], date = new Date()): MonthToDateTotals => {
  const current = cashFlowTotals(monthToDateTransactions(transactions, date));
  const previousMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const previousMonthLastDay = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
  const equivalentDay = Math.min(date.getDate(), previousMonthLastDay);
  const previousEndExclusive = new Date(previousMonth.getFullYear(), previousMonth.getMonth(), equivalentDay + 1);
  const previous = cashFlowTotals(transactionsInRange(transactions, previousMonth, previousEndExclusive));
  const spendingChange = previous.spending > 0 ? ((current.spending - previous.spending) / previous.spending) * 100 : null;
  const monthLabel = previousMonth.toLocaleDateString('en-PH', { month: 'short' });
  return {
    ...current,
    previousSpending: previous.spending,
    spendingChange,
    comparisonLabel: spendingChange === null ? null : `${monthLabel} 1–${equivalentDay}`,
  };
};

export const analyticsTotals = (transactions: Transaction[], range: AnalyticsDateRange) => {
  const current = cashFlowTotals(transactionsInRange(transactions, range.start, range.end));
  const previous = cashFlowTotals(transactionsInRange(transactions, range.comparisonStart, range.comparisonEnd));
  return { ...current, previousSpending: previous.spending, spendingChange: previous.spending > 0 ? ((current.spending - previous.spending) / previous.spending) * 100 : null };
};

export const currentMonthTransactions = (transactions: Transaction[], date = new Date()) =>
  transactions.filter((item) => {
    const itemDate = new Date(item.transactionDate);
    return itemDate.getMonth() === date.getMonth() && itemDate.getFullYear() === date.getFullYear();
  });

export const transactionsInSpace = (transactions: Transaction[], spaceId: string | null) =>
  spaceId ? transactions.filter((item) => item.spaceId === spaceId) : transactions;

export const monthlyTotals = (transactions: Transaction[], date = new Date()) => {
  const totals = monthToDateTotals(transactions, date);
  return { spending: totals.spending, previousSpending: totals.previousSpending, income: totals.income, change: totals.spendingChange ?? 0 };
};

export const categoryTotalsForTransactions = (transactions: Transaction[], categories: Category[], spaceId: string | null = null) => {
  const current = transactions.filter((item) => isSpend(item) || isRefund(item));
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const rootId = (categoryId: string | null) => {
    let category = categoryId ? categoryMap.get(categoryId) : undefined;
    while (category?.parentId) category = categoryMap.get(category.parentId);
    return category?.id ?? categoryId;
  };
  return categories
    .filter((category) => category.type === 'expense' && !category.parentId && !category.isArchived && (spaceId === null || category.spaceId === spaceId))
    .map((category) => ({ ...category, amount: current.filter((item) => rootId(item.categoryId) === category.id).reduce((sum, item) => sum + expenseContribution(item), 0) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
};

export const incomeCategoryTotalsForTransactions = (transactions: Transaction[], categories: Category[], spaceId: string | null = null) => {
  const current = transactions.filter(isIncome);
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const rootId = (categoryId: string | null) => {
    let category = categoryId ? categoryMap.get(categoryId) : undefined;
    while (category?.parentId) category = categoryMap.get(category.parentId);
    return category?.id ?? categoryId;
  };
  return categories
    .filter((category) => category.type === 'income' && !category.parentId && !category.isArchived && (spaceId === null || category.spaceId === spaceId))
    .map((category) => ({ ...category, amount: current.filter((item) => rootId(item.categoryId) === category.id).reduce((sum, item) => sum + item.amount, 0) }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
};

export interface CategoryReportItem {
  id: string;
  name: string;
  color: string;
  amount: number;
  parentId: string | null;
  hasChildren: boolean;
  transactionIds: string[];
}

export interface SpaceReportItem {
  id: string;
  name: string;
  color: string;
  amount: number;
  transactionIds: string[];
}

const categoryTransactionAmount = (transaction: Transaction, type: CategoryType) =>
  type === 'income' ? isIncome(transaction) ? transaction.amount : 0 : expenseContribution(transaction);

export const categoryReportBreakdown = (
  transactions: Transaction[],
  categories: Category[],
  type: CategoryType,
  spaceId: string | null = null,
  parentId: string | null = null,
): CategoryReportItem[] => {
  const scopedCategories = categories.filter((category) => category.type === type && (spaceId === null || category.spaceId === spaceId));
  const categoryMap = new Map(scopedCategories.map((category) => [category.id, category]));
  const childrenByParent = new Map<string | null, Category[]>();
  scopedCategories.forEach((category) => childrenByParent.set(category.parentId, [...(childrenByParent.get(category.parentId) ?? []), category]));
  const descendantIds = (categoryId: string) => {
    const ids = new Set([categoryId]);
    const queue = [categoryId];
    while (queue.length) {
      const current = queue.shift()!;
      (childrenByParent.get(current) ?? []).forEach((child) => {
        if (!ids.has(child.id)) { ids.add(child.id); queue.push(child.id); }
      });
    }
    return ids;
  };
  const reportTransactions = transactions.filter((transaction) => categoryTransactionAmount(transaction, type) !== 0);
  const rows = (childrenByParent.get(parentId) ?? []).map((category) => {
    const ids = descendantIds(category.id);
    const matching = reportTransactions.filter((transaction) => Boolean(transaction.categoryId && ids.has(transaction.categoryId)));
    return {
      id: category.id,
      name: category.name,
      color: category.color,
      amount: matching.reduce((sum, transaction) => sum + categoryTransactionAmount(transaction, type), 0),
      parentId: category.parentId,
      hasChildren: (childrenByParent.get(category.id) ?? []).length > 0,
      transactionIds: matching.map((transaction) => transaction.id),
    };
  }).filter((item) => item.amount > 0);
  if (parentId === null) {
    const uncategorized = reportTransactions.filter((transaction) => !transaction.categoryId || !categoryMap.has(transaction.categoryId));
    const amount = uncategorized.reduce((sum, transaction) => sum + categoryTransactionAmount(transaction, type), 0);
    if (amount > 0) rows.push({ id: '__uncategorized__', name: 'Uncategorized', color: '#9AA3AD', amount, parentId: null, hasChildren: false, transactionIds: uncategorized.map((transaction) => transaction.id) });
  } else {
    const direct = reportTransactions.filter((transaction) => transaction.categoryId === parentId);
    const amount = direct.reduce((sum, transaction) => sum + categoryTransactionAmount(transaction, type), 0);
    if (amount > 0) rows.push({ id: `__direct__:${parentId}`, name: 'Directly categorized', color: categoryMap.get(parentId)?.color ?? '#9AA3AD', amount, parentId, hasChildren: false, transactionIds: direct.map((transaction) => transaction.id) });
  }
  return rows.sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
};

export const spaceReportBreakdown = (
  transactions: Transaction[],
  spaces: Space[],
  type: CategoryType,
): SpaceReportItem[] => {
  const spaceMap = new Map(spaces.map((space) => [space.id, space]));
  const grouped = new Map<string, SpaceReportItem>();
  transactions.forEach((transaction) => {
    const amount = categoryTransactionAmount(transaction, type);
    if (amount === 0) return;
    const id = transaction.spaceId || '__unassigned__';
    const space = transaction.spaceId ? spaceMap.get(transaction.spaceId) : undefined;
    const current = grouped.get(id) ?? {
      id,
      name: space?.name ?? 'Unassigned Space',
      color: space?.color ?? '#9AA3AD',
      amount: 0,
      transactionIds: [],
    };
    current.amount += amount;
    current.transactionIds.push(transaction.id);
    grouped.set(id, current);
  });
  return [...grouped.values()]
    .filter((item) => item.amount > 0)
    .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
};

export interface PayeeReportItem {
  id: string;
  name: string;
  amount: number;
  transactionIds: string[];
}

export const payeeBreakdownForTransactions = (transactions: Transaction[]): PayeeReportItem[] => {
  const grouped = new Map<string, PayeeReportItem>();
  transactions.filter((transaction) => isSpend(transaction) || isRefund(transaction)).forEach((transaction) => {
    const name = transaction.counterpartyName?.trim() || transaction.merchant?.trim() || 'Unknown payee';
    const id = name.toLocaleLowerCase();
    const current = grouped.get(id) ?? { id, name, amount: 0, transactionIds: [] };
    current.amount += expenseContribution(transaction);
    current.transactionIds.push(transaction.id);
    grouped.set(id, current);
  });
  return [...grouped.values()].filter((item) => item.amount > 0).sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name));
};

export const accountBalanceEffect = (transaction: Transaction, accountId: string) =>
  (transaction.accountToId === accountId ? transaction.amount : 0) - (transaction.accountFromId === accountId ? transaction.amount : 0);

export const accountBalancesAsOf = (accounts: Account[], transactions: Transaction[], endExclusive: Date) => accounts.map((account) => {
  const laterEffect = transactions.reduce((sum, transaction) => {
    const date = new Date(transaction.transactionDate);
    return !Number.isNaN(date.getTime()) && date >= endExclusive ? sum + accountBalanceEffect(transaction, account.id) : sum;
  }, 0);
  return { ...account, balanceAsOf: account.balance - laterEffect };
});

export const categoryTotals = (transactions: Transaction[], categories: Category[], date = new Date(), spaceId: string | null = null) =>
  categoryTotalsForTransactions(monthToDateTransactions(transactions, date), categories, spaceId);

const withAxisVisibility = (items: MonthlyPoint[]) => {
  const labelInterval = items.length <= 7 ? 1 : items.length <= 14 ? 2 : items.length <= 31 ? 5 : items.length <= 90 ? 14 : 1;
  return items.map((item, index) => ({ ...item, showLabel: index === 0 || index === items.length - 1 || index % labelInterval === 0 }));
};

export const spendingTrendSeries = (transactions: Transaction[], range: AnalyticsDateRange): MonthlyPoint[] => {
  const periodTransactions = transactionsInRange(transactions, range.start, range.end);
  const totals = (start: Date, end: Date) => {
    const bucket = periodTransactions.filter((item) => {
      const itemDate = new Date(item.transactionDate);
      return itemDate >= start && itemDate < end;
    });
    return {
      income: bucket.filter(isIncome).reduce((sum, item) => sum + item.amount, 0),
      expense: bucket.reduce((sum, item) => sum + expenseContribution(item), 0),
    };
  };

  if (range.grouping === 'three_hour') {
    const firstBucket = startOfLocalDay(range.start);
    const bucketCount = Math.max(1, Math.ceil((range.end.getTime() - firstBucket.getTime()) / (3 * 60 * 60 * 1000)));
    return withAxisVisibility(Array.from({ length: bucketCount }, (_, index) => {
      const start = new Date(firstBucket.getTime() + index * 3 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
      return { label: start.toLocaleTimeString('en-PH', { hour: 'numeric' }), ...totals(start, end) };
    }));
  }

  if (range.grouping === 'day') {
    const firstBucket = startOfLocalDay(range.start);
    const bucketCount = Math.max(1, Math.ceil((range.end.getTime() - firstBucket.getTime()) / (24 * 60 * 60 * 1000)));
    return withAxisVisibility(Array.from({ length: bucketCount }, (_, index) => {
      const start = addDays(firstBucket, index);
      const end = addDays(start, 1);
      const label = range.key === 'this_week'
        ? start.toLocaleDateString('en-PH', { weekday: 'short' })
        : start.toLocaleDateString('en-PH', { month: bucketCount > 14 ? 'short' : undefined, day: 'numeric' });
      return { label, ...totals(start, end) };
    }));
  }

  if (range.grouping === 'week') {
    const firstBucket = startOfLocalWeek(range.start);
    const bucketCount = Math.max(1, Math.ceil((range.end.getTime() - firstBucket.getTime()) / (7 * 24 * 60 * 60 * 1000)));
    return withAxisVisibility(Array.from({ length: bucketCount }, (_, index) => {
      const start = addDays(firstBucket, index * 7);
      const end = addDays(start, 7);
      return { label: formatShortDate(start), ...totals(start, end) };
    }));
  }

  const firstBucket = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const bucketCount = Math.max(1, (range.end.getFullYear() - firstBucket.getFullYear()) * 12 + range.end.getMonth() - firstBucket.getMonth() + 1);
  return withAxisVisibility(Array.from({ length: bucketCount }, (_, index) => {
    const start = new Date(firstBucket.getFullYear(), firstBucket.getMonth() + index, 1);
    const end = addMonths(start, 1);
    return { label: start.toLocaleDateString('en-PH', { month: 'short' }), ...totals(start, end) };
  }));
};

export const monthlySeries = (transactions: Transaction[], count = 6): MonthlyPoint[] => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const items = currentMonthTransactions(transactions, date);
    return {
      label: date.toLocaleDateString('en-PH', { month: 'short' }),
      income: items.filter(isIncome).reduce((sum, item) => sum + item.amount, 0),
      expense: items.reduce((sum, item) => sum + expenseContribution(item), 0),
    };
  });
};
