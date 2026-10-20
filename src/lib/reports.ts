import type { Ionicons } from '@expo/vector-icons';

export type ReportKey =
  | 'overview'
  | 'expenses'
  | 'income'
  | 'expenses_by_space'
  | 'income_by_space'
  | 'cash_flow'
  | 'balances'
  | 'trends'
  | 'budget'
  | 'payees'
  | 'net_worth';

export interface ReportNavigationItem {
  key: ReportKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const primaryReportItems: ReportNavigationItem[] = [
  { key: 'overview', label: 'Overview', icon: 'sparkles-outline' },
  { key: 'expenses', label: 'Expenses by Category', icon: 'pie-chart-outline' },
  { key: 'income', label: 'Income by Category', icon: 'trending-up-outline' },
  { key: 'expenses_by_space', label: 'Expenses by Space', icon: 'grid-outline' },
  { key: 'income_by_space', label: 'Income by Space', icon: 'layers-outline' },
  { key: 'cash_flow', label: 'Cash Flow', icon: 'pulse-outline' },
  { key: 'balances', label: 'Account Balances', icon: 'wallet-outline' },
  { key: 'trends', label: 'Spending Trends', icon: 'analytics-outline' },
  { key: 'budget', label: 'Budget vs Actual', icon: 'speedometer-outline' },
];

export const moreReportItems: ReportNavigationItem[] = [
  { key: 'payees', label: 'Payee Breakdown', icon: 'people-outline' },
  { key: 'net_worth', label: 'Net Worth', icon: 'diamond-outline' },
];

export const reportItems = [...primaryReportItems, ...moreReportItems];

export const isReportKey = (value: unknown): value is ReportKey =>
  typeof value === 'string' && reportItems.some((item) => item.key === value);

export const reportLabel = (key: ReportKey) =>
  reportItems.find((item) => item.key === key)?.label ?? 'Reports';
