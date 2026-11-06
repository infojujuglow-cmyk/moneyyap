import { cashFlowTotals, expenseContribution, isIncome, transactionsInRange } from './analytics';
import type { Category, Transaction } from '@/types/finance';

// Calendar boundaries follow the same local calendar convention as the existing Reports filters.
export const monthWindow = (year: number, month: number, now = new Date()) => {
  const start = new Date(year, month, 1);
  const naturalEnd = new Date(year, month + 1, 1);
  const end = naturalEnd > now ? now < start ? start : now : naturalEnd;
  return { start, end, partial: end < naturalEnd, future: start >= now, label: start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) };
};

export const yearWindow = (year: number, now = new Date(), ytd = false) => {
  const start = new Date(year, 0, 1);
  const naturalEnd = new Date(year + 1, 0, 1);
  const comparableDay = Math.min(now.getDate(), new Date(year, now.getMonth() + 1, 0).getDate());
  const comparableEnd = new Date(year, now.getMonth(), comparableDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  const end = ytd ? (comparableEnd > naturalEnd ? naturalEnd : comparableEnd) : naturalEnd > now ? now : naturalEnd;
  return { start, end: end < start ? start : end, partial: end < naturalEnd, future: start >= now, label: `${year}${ytd ? ' YTD' : ''}` };
};

export const periodSummary = (transactions: Transaction[], period: { start: Date; end: Date }) => {
  const matching = transactionsInRange(transactions, period.start, period.end);
  return { ...cashFlowTotals(matching), transactions: matching };
};

export const change = (current: number, previous: number) => ({
  absolute: current - previous,
  percentage: previous === 0 ? null : (current - previous) / Math.abs(previous) * 100,
});

export const monthlyYearTrend = (transactions: Transaction[], year: number, now = new Date()) =>
  Array.from({ length: 12 }, (_, month) => {
    const period = monthWindow(year, month, now);
    return { ...period, month, ...periodSummary(transactions, period) };
  });

export const yearMonthWithinWindow = (transactions: Transaction[], year: number, month: number, yearEnd: Date) => {
  const start = new Date(year, month, 1);
  if (start >= yearEnd) return null;
  const naturalEnd = new Date(year, month + 1, 1);
  return periodSummary(transactions, { start, end: naturalEnd < yearEnd ? naturalEnd : yearEnd });
};

export interface ComparisonCategory {
  id: string;
  name: string;
  parentId: string | null;
  before: number;
  after: number;
  transactionIds: string[];
  children: ComparisonCategory[];
}

export const compareCategories = (first: Transaction[], second: Transaction[], categories: Category[], effect: 'expense' | 'income'): ComparisonCategory[] => {
  const scoped = categories.filter((item) => item.type === effect);
  const map = new Map(scoped.map((item) => [item.id, item]));
  const direct = new Map<string, { before: number; after: number; ids: string[] }>();
  const add = (items: Transaction[], key: 'before' | 'after') => items.forEach((item) => {
    const value = effect === 'income' ? isIncome(item) ? item.amount : 0 : expenseContribution(item);
    if (!value) return;
    const id = item.categoryId && map.has(item.categoryId) ? item.categoryId : '__uncategorized__';
    const entry = direct.get(id) ?? { before: 0, after: 0, ids: [] };
    entry[key] += value; entry.ids.push(item.id); direct.set(id, entry);
  });
  add(first, 'before'); add(second, 'after');
  const children = new Map<string | null, Category[]>();
  scoped.forEach((item) => children.set(item.parentId, [...(children.get(item.parentId) ?? []), item]));
  const visit = (category: Category, seen: Set<string>): ComparisonCategory | null => {
    if (seen.has(category.id)) return null;
    const descendants = (children.get(category.id) ?? []).map((item) => visit(item, new Set([...seen, category.id]))).filter((item): item is ComparisonCategory => Boolean(item));
    const own = direct.get(category.id) ?? { before: 0, after: 0, ids: [] };
    const before = own.before + descendants.reduce((sum, item) => sum + item.before, 0);
    const after = own.after + descendants.reduce((sum, item) => sum + item.after, 0);
    return before || after ? { id: category.id, name: category.name, parentId: category.parentId, before, after, transactionIds: [...own.ids, ...descendants.flatMap((item) => item.transactionIds)], children: descendants } : null;
  };
  const roots = (children.get(null) ?? []).map((item) => visit(item, new Set())).filter((item): item is ComparisonCategory => Boolean(item));
  const other = direct.get('__uncategorized__');
  if (other && (other.before || other.after)) roots.push({ id: '__uncategorized__', name: 'Uncategorized', parentId: null, before: other.before, after: other.after, transactionIds: other.ids, children: [] });
  return roots.sort((a, b) => b.after - a.after || b.before - a.before);
};
