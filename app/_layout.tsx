import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, useFonts } from '@expo-google-fonts/geist';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { DesktopTalkButton } from '@/components/DesktopTalkButton';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { FinanceProvider, useFinance } from '@/context/FinanceContext';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [loaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => undefined); }, [loaded]);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
        <AuthProvider>
          <FinanceProvider>
            <AppNavigator />
          </FinanceProvider>
        </AuthProvider>
    </SafeAreaProvider>
  );
}

function AppNavigator() {
  const { width } = useWindowDimensions();
  const segments = useSegments();
  const { session, isReady } = useAuth();
  const { workspaceId, isLoading } = useFinance();
  const desktop = Platform.OS === 'web' && width >= 1024 && Boolean(session && workspaceId);
  useEffect(() => {
    if (!isReady || isLoading) return;
    const isAuthRoute = segments[0] === '(auth)';
    const isSetupRoute = segments[0] === '(auth)' && segments[1] === 'household-setup';
    if (!session) {
      if (!isAuthRoute) router.replace('/(auth)/welcome');
      return;
    }
    if (!workspaceId) {
      if (!isSetupRoute) router.replace('/(auth)/household-setup');
      return;
    }
    if (isAuthRoute) router.replace('/(tabs)');
  }, [isLoading, isReady, segments, session, workspaceId]);
  return <View style={{ flex: 1, flexDirection: desktop ? 'row' : 'column' }}>
    <StatusBar style="dark" />
    {desktop && <DesktopSidebar />}
    <View style={{ flex: 1, minWidth: 0, position: 'relative' }}>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.softWhite }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
      <Stack.Screen name="manual-transaction" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="add-account" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="add-workspace" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="account/[id]" />
      <Stack.Screen name="space/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="category/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
    {desktop && <DesktopTalkButton />}
    </View>
  </View>;
}
