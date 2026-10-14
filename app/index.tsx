import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useFinance } from '@/context/FinanceContext';
import { colors } from '@/theme';
import { BrandMark } from '@/components/ui';

export default function Index() {
  const { isReady, session } = useAuth();
  const { workspaceId, isLoading } = useFinance();
  if (!isReady || isLoading) return <View style={styles.loading}><BrandMark size={72} /><ActivityIndicator color={colors.mintDark} /></View>;
  if (!session) return <Redirect href="/(auth)/welcome" />;
  return <Redirect href={workspaceId ? '/(tabs)' : '/(auth)/household-setup'} />;
}

const styles = StyleSheet.create({ loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: colors.softWhite } });
