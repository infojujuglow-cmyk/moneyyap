import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet } from 'react-native';
import type { TransactionType } from '@/types/finance';
import { spacing } from '@/theme';
import { Chip } from './ui';

const typeFilters: { value: TransactionType | null; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: null, label: 'All', icon: 'list-outline' },
  { value: 'expense', label: 'Expense', icon: 'arrow-up-outline' },
  { value: 'income', label: 'Income', icon: 'arrow-down-outline' },
  { value: 'transfer', label: 'Internal Transfer', icon: 'swap-horizontal-outline' },
  { value: 'credit_card_payment', label: 'Card Payment', icon: 'card-outline' },
  { value: 'refund', label: 'Refund', icon: 'return-down-back-outline' },
];

export function TransactionTypeFilters({ value, forVerificationOnly, onChange }: {
  value: TransactionType | null;
  forVerificationOnly: boolean;
  onChange: (value: TransactionType | null) => void;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
    {typeFilters.map((option) => <Chip key={option.value ?? 'all'} label={option.label} icon={option.icon} selected={value === option.value && !forVerificationOnly} onPress={() => onChange(option.value)} />)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginHorizontal: -spacing.xl },
  row: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.sm },
});
