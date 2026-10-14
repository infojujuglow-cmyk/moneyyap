import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing } from '@/theme';
import { AppText, Avatar, Wordmark } from './ui';

const mainItems = [
  { label: 'Overview', path: '/(tabs)', icon: 'grid-outline' },
  { label: 'Transactions', path: '/(tabs)/transactions', icon: 'receipt-outline' },
  { label: 'Talk to MoneyYap', path: '/(tabs)/add', icon: 'chatbubble-ellipses-outline' },
  { label: 'Analytics', path: '/(tabs)/analytics', icon: 'stats-chart-outline' },
] as const;

const manageItems = [
  { label: 'Accounts', path: '/accounts', icon: 'wallet-outline' },
  { label: 'Spaces', path: '/spaces', icon: 'apps-outline' },
  { label: 'Categories', path: '/categories', icon: 'pricetag-outline' },
  { label: 'Members', path: '/household', icon: 'people-outline' },
] as const;

export function DesktopSidebar() {
  const pathname = usePathname();
  const { session } = useAuth();
  const { availableWorkspaces, workspaceId } = useFinance();
  const workspace = availableWorkspaces.find((item) => item.id === workspaceId);
  const name = typeof session?.user.user_metadata.full_name === 'string' && session.user.user_metadata.full_name.trim()
    ? session.user.user_metadata.full_name.trim()
    : session?.user.email?.split('@')[0] ?? 'You';
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();

  const navItem = (item: { label: string; path: string; icon: keyof typeof Ionicons.glyphMap }) => {
    const visiblePath = item.path.replace('/(tabs)', '') || '/';
    const selected = pathname === visiblePath || pathname === item.path || (visiblePath !== '/' && pathname.startsWith(`${visiblePath}/`));
    return <Pressable key={item.path} accessibilityRole="link" accessibilityState={{ selected }} onPress={() => router.push(item.path as never)} style={({ hovered, pressed }) => [styles.navItem, selected && styles.navSelected, (hovered || pressed) && !selected && styles.navHover]}>
      <Ionicons name={item.icon} size={20} color={selected ? colors.mintDeep : colors.slateDark} />
      <AppText variant="bodyMedium" style={selected ? styles.selectedText : styles.navText}>{item.label}</AppText>
    </Pressable>;
  };

  return <View style={styles.sidebar}>
    <View style={styles.brand}><Wordmark /></View>
    <Pressable onPress={() => router.push('/workspaces' as never)} style={({ hovered }) => [styles.workspace, hovered && styles.navHover]} accessibilityRole="button" accessibilityLabel="Switch workspace">
      <View style={styles.workspaceIcon}><Ionicons name="layers-outline" size={19} color={colors.mintDeep} /></View>
      <View style={styles.workspaceCopy}><AppText variant="caption" style={styles.overline}>WORKSPACE</AppText><AppText variant="bodyMedium" numberOfLines={1}>{workspace?.name ?? 'Your workspace'}</AppText></View>
      <Ionicons name="chevron-expand" size={16} color={colors.slate} />
    </Pressable>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.navigation}>
      <AppText variant="eyebrow" style={styles.sectionLabel}>YOUR MONEY</AppText>
      {mainItems.map(navItem)}
      <AppText variant="eyebrow" style={[styles.sectionLabel, styles.manageLabel]}>MANAGE</AppText>
      {manageItems.map(navItem)}
      <View style={styles.spacer} />
      {navItem({ label: 'Settings', path: '/(tabs)/settings', icon: 'settings-outline' })}
    </ScrollView>
    <Pressable onPress={() => router.push('/(tabs)/settings')} style={({ hovered }) => [styles.profile, hovered && styles.navHover]} accessibilityRole="button">
      <Avatar initials={initials} size={36} />
      <View style={styles.profileCopy}><AppText variant="bodyMedium" numberOfLines={1}>{name}</AppText><AppText variant="caption" style={styles.muted}>View your profile</AppText></View>
      <Ionicons name="chevron-forward" size={15} color={colors.slate} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  sidebar: { width: 248, backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: spacing.md },
  brand: { paddingHorizontal: spacing.md, paddingTop: spacing.xxxl, paddingBottom: spacing.xxxl },
  workspace: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 62, backgroundColor: colors.softWhite, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.sm },
  workspaceIcon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash },
  workspaceCopy: { flex: 1, minWidth: 0 },
  overline: { color: colors.slate, fontSize: 10, letterSpacing: 0.6 },
  navigation: { flexGrow: 1, paddingTop: spacing.xxxl, paddingBottom: spacing.lg },
  sectionLabel: { color: colors.slate, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  manageLabel: { marginTop: spacing.xxxl },
  navItem: { minHeight: 46, paddingHorizontal: spacing.md, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 3 },
  navSelected: { backgroundColor: colors.mintWash },
  navHover: { backgroundColor: colors.surface },
  selectedText: { color: colors.mintDeep },
  navText: { color: colors.slateDark },
  spacer: { flex: 1, minHeight: spacing.xxxl },
  profile: { borderTopWidth: 1, borderTopColor: colors.border, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  profileCopy: { flex: 1, minWidth: 0 },
  muted: { color: colors.slate },
});
