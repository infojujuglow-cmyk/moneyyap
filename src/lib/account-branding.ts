import type { Account, AccountType, AccountVisualType } from '@/types/finance';

export interface AccountProvider {
  key: string;
  name: string;
  mark: string;
  colors: readonly [string, string, ...string[]];
  foreground: string;
}

export const accountProviders: AccountProvider[] = [
  { key: 'bpi', name: 'BPI', mark: 'BPI', colors: ['#A70C2D', '#741024'], foreground: '#FFFFFF' },
  { key: 'bdo', name: 'BDO', mark: 'BDO', colors: ['#123F88', '#08275F'], foreground: '#FFFFFF' },
  { key: 'metrobank', name: 'Metrobank', mark: 'MB', colors: ['#0072BC', '#034D83'], foreground: '#FFFFFF' },
  { key: 'unionbank', name: 'UnionBank', mark: 'UB', colors: ['#F36F21', '#C94D10'], foreground: '#FFFFFF' },
  { key: 'rcbc', name: 'RCBC', mark: 'RCBC', colors: ['#00539B', '#003A70'], foreground: '#FFFFFF' },
  { key: 'security-bank', name: 'Security Bank', mark: 'SB', colors: ['#0067A0', '#034267'], foreground: '#FFFFFF' },
  { key: 'landbank', name: 'LandBank', mark: 'LB', colors: ['#00864A', '#006034'], foreground: '#FFFFFF' },
  { key: 'maya', name: 'Maya', mark: 'M', colors: ['#00C26F', '#007E52'], foreground: '#071D17' },
  { key: 'gcash', name: 'GCash', mark: 'G', colors: ['#1677FF', '#0756CF'], foreground: '#FFFFFF' },
  { key: 'chinabank', name: 'China Bank', mark: 'CBC', colors: ['#D71920', '#9D1118'], foreground: '#FFFFFF' },
  { key: 'pnb', name: 'PNB', mark: 'PNB', colors: ['#003B71', '#002A50'], foreground: '#FFFFFF' },
  { key: 'eastwest', name: 'EastWest', mark: 'EW', colors: ['#7B2D8E', '#542064'], foreground: '#FFFFFF' },
];

const aliases: Record<string, string> = {
  'bank of the philippine islands': 'bpi', 'banco de oro': 'bdo', 'metropolitan bank': 'metrobank',
  'union bank': 'unionbank', 'rizal commercial banking corporation': 'rcbc', 'securitybank': 'security-bank',
  'land bank': 'landbank', 'land bank of the philippines': 'landbank', 'paymaya': 'maya', 'g-cash': 'gcash',
};

export const providerForAccount = (account: Pick<Account, 'providerKey' | 'institution' | 'name'>): AccountProvider => {
  const normalized = account.institution?.trim().toLocaleLowerCase() ?? '';
  const key = account.providerKey || aliases[normalized] || accountProviders.find((item) => normalized.includes(item.key.replace('-', ' ')))?.key;
  const provider = accountProviders.find((item) => item.key === key);
  if (provider) return provider;
  const label = account.institution?.trim() || account.name.trim() || 'Account';
  const mark = label.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase();
  return { key: 'other', name: label, mark, colors: ['#4B5563', '#202733'], foreground: '#FFFFFF' };
};

export const defaultVisualType = (type: AccountType): AccountVisualType =>
  type === 'credit_card' ? 'credit_card' : type === 'ewallet' ? 'ewallet' : type === 'cash' ? 'cash' : type === 'bank' ? 'savings' : 'other';

export const visualTypeLabel: Record<AccountVisualType, string> = {
  debit: 'Debit / ATM', checking: 'Checking', savings: 'Savings', credit_card: 'Credit card', ewallet: 'E-wallet', cash: 'Cash', other: 'Account',
};
