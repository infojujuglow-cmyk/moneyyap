import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import ManualTransactionScreen from '../manual-transaction';
import { Button, EmptyState } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors } from '@/theme';

export default function TransactionEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { transactions } = useFinance();
  if (!transactions.some((transaction) => transaction.id === id)) {
    return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.softWhite }}><EmptyState icon="search-outline" title="Transaction not found" body="It may have already been deleted." action={<Button label="Go back" onPress={() => router.back()} />} /></View>;
  }
  return <ManualTransactionScreen editTransactionId={id} />;
}
