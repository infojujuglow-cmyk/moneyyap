import { Platform } from 'react-native';

export const colors = {
  mint: '#35D6A2',
  mintDark: '#13A975',
  mintDeep: '#087A59',
  mintWash: '#E8FAF4',
  mintMist: '#D7F5EA',
  ink: '#121923',
  slate: '#68717D',
  slateDark: '#414A56',
  softWhite: '#FAFAF7',
  white: '#FFFFFF',
  surface: '#F4F5F2',
  border: '#E8EAE7',
  borderStrong: '#DDE1DD',
  danger: '#E35D6A',
  dangerWash: '#FFF0F1',
  expense: '#C85363',
  expenseWash: '#FDECEF',
  income: '#18865E',
  incomeWash: '#E7F8EE',
  warning: '#F5A742',
  warningWash: '#FFF7E8',
  blue: '#5B7CFA',
  blueWash: '#EEF1FF',
} as const;

export const typography = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;

export const shadows = {
  soft: Platform.select({
    ios: { shadowColor: colors.ink, shadowOpacity: 0.055, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 2 },
    default: {},
  }),
  lift: Platform.select({
    ios: { shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
    android: { elevation: 8 },
    default: {},
  }),
} as const;

export const formatPeso = (amount: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits }).format(amount);

export const formatCompactPeso = (amount: number) => {
  if (Math.abs(amount) >= 1_000_000) return `₱${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `₱${(amount / 1_000).toFixed(amount >= 100_000 ? 0 : 1)}k`;
  return formatPeso(amount);
};
