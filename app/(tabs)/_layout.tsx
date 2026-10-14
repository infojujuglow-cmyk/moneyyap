import { Ionicons } from '@expo/vector-icons';
import { Slot, Tabs } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors, shadows, typography } from '@/theme';

const icons = {
  index: ['home', 'home-outline'],
  transactions: ['receipt', 'receipt-outline'],
  add: ['add', 'add'],
  analytics: ['stats-chart', 'stats-chart-outline'],
  settings: ['person', 'person-outline'],
} as const;

export default function TabLayout() {
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web' && width >= 1024) return <Slot />;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: route.name !== 'add',
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.slate,
        tabBarLabelStyle: { fontFamily: typography.medium, fontSize: 10, marginTop: 2 },
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ focused, color }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          if (route.name === 'add') return <View style={styles.addButton}><Ionicons name="add" size={31} color={colors.ink} /></View>;
          return <Ionicons name={pair[focused ? 0 : 1]} size={22} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="add" options={{ title: 'Talk' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="settings" options={{ title: 'Me' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { position: 'absolute', height: 84, paddingTop: 8, paddingBottom: 14, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border, ...shadows.soft },
  tabItem: { paddingTop: 4 },
  addButton: { width: 58, height: 58, marginTop: -27, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint, borderWidth: 5, borderColor: colors.softWhite, ...shadows.lift },
});
