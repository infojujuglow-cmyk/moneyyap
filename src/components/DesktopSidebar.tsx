import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, radii, spacing } from '@/theme';
import type { Account } from '@/types/finance';
import { AppText, Avatar, Wordmark } from './ui';

const mainItems = [
  { label: 'Overview', path: '/(tabs)', icon: 'grid-outline' },
  { label: 'Transactions', path: '/(tabs)/transactions', icon: 'receipt-outline' },
  { label: 'Talk to MoneyYap', path: '/(tabs)/add', icon: 'chatbubble-ellipses-outline' },
  { label: 'Analytics', path: '/(tabs)/analytics', icon: 'stats-chart-outline' },
] as const;

const manageItems = [
  { label: 'Spaces', path: '/spaces', icon: 'apps-outline' },
  { label: 'Categories', path: '/categories', icon: 'pricetag-outline' },
  { label: 'Members', path: '/household', icon: 'people-outline' },
] as const;

export function DesktopSidebar() {
  const pathname = usePathname();
  const [collapsedInstitutions, setCollapsedInstitutions] = useState<Record<string, boolean>>({});
  const { session } = useAuth();
  const { accounts, availableWorkspaces, workspaceId } = useFinance();
  const workspace = availableWorkspaces.find((item) => item.id === workspaceId);
  const accountGroups = groupAccountsByInstitution(accounts.filter((account) => account.isActive));
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

  const accountIcon = (account: Account): keyof typeof Ionicons.glyphMap => account.type === 'credit_card'
    ? 'card-outline'
    : account.type === 'cash'
      ? 'cash-outline'
      : account.type === 'ewallet'
        ? 'phone-portrait-outline'
        : 'business-outline';

  return <View style={styles.sidebar}>
    <View style={styles.brand}><Wordmark /></View>
    <Pressable onPress={() => router.push('/workspaces' as never)} style={({ hovered }) => [styles.workspace, hovered && styles.navHover]} accessibilityRole="button" accessibilityLabel="Switch workspace">
      <View style={styles.workspaceIcon}><Ionicons name="layers-outline" size={19} color={colors.mintDeep} /></View>
      <View style={styles.workspaceCopy}><AppText variant="caption" style={styles.overline}>WORKSPACE</AppText><AppText variant="bodyMedium" numberOfLines={1}>{workspace?.name ?? 'Your workspace'}</AppText></View>
      <Ionicons name="chevron-expand" size={16} color={colors.slate} />
    </Pressable>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.navigation}>
      <View style={styles.accountsHeading}>
        <AppText variant="eyebrow" style={styles.sectionLabel}>ACCOUNTS</AppText>
        <Pressable accessibilityLabel="Add account" onPress={() => router.push('/add-account')} style={({ hovered, pressed }) => [styles.addAccount, (hovered || pressed) && styles.navHover]}>
          <Ionicons name="add" size={17} color={colors.mintDeep} />
        </Pressable>
      </View>
      <View style={styles.accountGroups}>
        {accountGroups.map(({ key, name: institution, accounts: institutionAccounts }) => {
          const collapsed = collapsedInstitutions[key] ?? false;
          return <View key={key}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: !collapsed }} onPress={() => setCollapsedInstitutions((current) => ({ ...current, [key]: !collapsed }))} style={({ hovered }) => [styles.institutionHeader, hovered && styles.navHover]}>
              <AppText variant="caption" style={styles.institutionName} numberOfLines={1}>{institution}</AppText>
              <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-down'} size={14} color={colors.slate} />
            </Pressable>
            {!collapsed && institutionAccounts.map((account) => {
              const selected = pathname === `/account/${account.id}`;
              return <Pressable key={account.id} accessibilityRole="link" accessibilityState={{ selected }} onPress={() => router.push(`/account/${account.id}`)} style={({ hovered, pressed }) => [styles.accountItem, selected && styles.accountSelected, (hovered || pressed) && !selected && styles.navHover]}>
                <View style={[styles.accountIcon, { backgroundColor: `${account.accent}18` }]}><Ionicons name={accountIcon(account)} size={15} color={account.accent} /></View>
                <View style={styles.accountCopy}><AppText variant="caption" numberOfLines={1} style={selected ? styles.selectedText : styles.accountName}>{account.name}</AppText><AppText variant="caption" numberOfLines={1} style={styles.accountBalance}>{account.type === 'credit_card' ? formatPeso(Math.abs(account.balance)) : formatPeso(account.balance)}</AppText></View>
              </Pressable>;
            })}
          </View>;
        })}
        <Pressable onPress={() => router.push('/accounts')} style={({ hovered, pressed }) => [styles.manageAccounts, (hovered || pressed) && styles.navHover]}>
          <Ionicons name="settings-outline" size={15} color={colors.slate} />
          <AppText variant="caption" style={styles.manageAccountsText}>Manage accounts</AppText>
        </Pressable>
      </View>
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
  sidebar: { width: 276, backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: spacing.md },
  brand: { paddingHorizontal: spacing.md, paddingTop: spacing.xxxl, paddingBottom: spacing.xxxl },
  workspace: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 62, backgroundColor: colors.softWhite, borderColor: colors.border, borderWidth: 1, borderRadius: radii.md, paddingHorizontal: spacing.sm },
  workspaceIcon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash },
  workspaceCopy: { flex: 1, minWidth: 0 },
  overline: { color: colors.slate, fontSize: 10, letterSpacing: 0.6 },
  navigation: { flexGrow: 1, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  sectionLabel: { color: colors.slate, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  accountsHeading: { minHeight: 32, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  addAccount: { width: 28, height: 28, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginTop: -7, marginRight: spacing.xs },
  accountGroups: { gap: spacing.xs, marginBottom: spacing.xxl },
  institutionHeader: { minHeight: 30, paddingHorizontal: spacing.sm, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  institutionName: { flex: 1, color: colors.slateDark },
  accountItem: { minHeight: 48, paddingHorizontal: spacing.sm, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountSelected: { backgroundColor: colors.mintWash },
  accountIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  accountName: { flex: 1, color: colors.slateDark },
  accountBalance: { color: colors.slate, fontSize: 10 },
  manageAccounts: { minHeight: 36, paddingHorizontal: spacing.sm, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  manageAccountsText: { color: colors.slate },
  manageLabel: { marginTop: spacing.xxl },
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

function groupAccountsByInstitution(accounts: Account[]) {
  const grouped = new Map<string, { key: string; name: string; accounts: Account[] }>();
  accounts.forEach((account) => {
    const name = account.institution?.trim() || 'Other accounts';
    const key = name.toLocaleLowerCase();
    const group = grouped.get(key);
    if (group) group.accounts.push(account);
    else grouped.set(key, { key, name, accounts: [account] });
  });
  return [...grouped.values()]
    .map((group) => ({ ...group, accounts: [...group.accounts].sort((left, right) => left.name.localeCompare(right.name)) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
