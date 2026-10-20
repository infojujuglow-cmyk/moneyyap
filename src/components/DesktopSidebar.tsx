import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, type ViewStyle, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { useFinance } from '@/context/FinanceContext';
import { amountColor, colors, formatPeso, radii, spacing, typography } from '@/theme';
import type { Account } from '@/types/finance';
import { AppText, Avatar, Wordmark } from './ui';

const mainItems = [
  { label: 'Overview', path: '/(tabs)', icon: 'grid-outline' },
  { label: 'Transactions', path: '/(tabs)/transactions', icon: 'receipt-outline' },
  { label: 'Talk to MoneyYap', path: '/(tabs)/add', icon: 'chatbubble-ellipses-outline' },
  { label: 'Reports', path: '/(tabs)/analytics', icon: 'pie-chart-outline' },
] as const;

const manageItems = [
  { label: 'Spaces', path: '/spaces', icon: 'apps-outline' },
  { label: 'Categories', path: '/categories', icon: 'pricetag-outline' },
  { label: 'Members', path: '/household', icon: 'people-outline' },
] as const;

const interactionTransition = { transitionDuration: '140ms', transitionProperty: 'background-color, opacity' } as unknown as ViewStyle;

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
    return <Pressable key={item.path} accessibilityRole="link" accessibilityState={{ selected }} onPress={() => router.push(item.path as never)} style={({ hovered, pressed }) => [styles.navItem, interactionTransition, selected && styles.navSelected, (hovered || pressed) && !selected && styles.navHover]}>
      {selected && <View style={styles.activeIndicator} />}
      <Ionicons name={item.icon} size={19} color={selected ? colors.mintDeep : colors.slateDark} />
      <AppText variant="bodyMedium" style={[styles.navText, selected && styles.selectedText]}>{item.label}</AppText>
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
    <View style={styles.brand}><Wordmark small /></View>
    <Pressable onPress={() => router.push('/workspaces' as never)} style={({ hovered }) => [styles.workspace, interactionTransition, hovered && styles.navHover]} accessibilityRole="button" accessibilityLabel="Switch workspace">
      <View style={styles.workspaceIcon}><Ionicons name="layers-outline" size={19} color={colors.mintDeep} /></View>
      <View style={styles.workspaceCopy}><AppText variant="caption" style={styles.overline}>WORKSPACE</AppText><AppText variant="bodyMedium" style={styles.workspaceName} numberOfLines={1}>{workspace?.name ?? 'Your workspace'}</AppText></View>
      <Ionicons name="chevron-expand" size={15} color={colors.slate} />
    </Pressable>
    <ScrollView style={styles.navigationScroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.navigation}>
      <View style={styles.accountsPanel}>
        <View style={styles.accountsHeading}>
          <AppText variant="eyebrow" style={styles.accountsLabel}>ACCOUNTS</AppText>
          <Pressable accessibilityLabel="Add account" onPress={() => router.push('/add-account')} style={({ hovered, pressed }) => [styles.addAccount, interactionTransition, (hovered || pressed) && styles.navHover]}>
            <Ionicons name="add" size={17} color={colors.mintDeep} />
          </Pressable>
        </View>
        <View style={styles.accountGroups}>
          {accountGroups.map(({ key, name: institution, accounts: institutionAccounts }) => {
            const collapsed = collapsedInstitutions[key] ?? false;
            return <View key={key} style={styles.institutionGroup}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${institution}, ${institutionAccounts.length} ${institutionAccounts.length === 1 ? 'account' : 'accounts'}`} accessibilityState={{ expanded: !collapsed }} onPress={() => setCollapsedInstitutions((current) => ({ ...current, [key]: !collapsed }))} style={({ hovered, pressed }) => [styles.institutionHeader, !collapsed && styles.institutionHeaderExpanded, interactionTransition, (hovered || pressed) && styles.institutionHeaderHover]}>
                <View style={styles.institutionIcon}><Ionicons name={institution === 'Other accounts' ? 'wallet-outline' : 'business-outline'} size={13} color={colors.mintDeep} /></View>
                <AppText variant="caption" style={styles.institutionName} numberOfLines={1}>{institution}</AppText>
                <View style={styles.institutionCount}><AppText variant="caption" style={styles.institutionCountText}>{institutionAccounts.length}</AppText></View>
                <Ionicons name={collapsed ? 'chevron-forward' : 'chevron-down'} size={14} color={colors.slate} />
              </Pressable>
              {!collapsed && <View style={styles.institutionAccounts}>{institutionAccounts.map((account) => {
                const selected = pathname === `/account/${account.id}`;
                return <Pressable key={account.id} accessibilityRole="link" accessibilityState={{ selected }} onPress={() => router.push(`/account/${account.id}`)} style={({ hovered, pressed }) => [styles.accountItem, interactionTransition, selected && styles.accountSelected, (hovered || pressed) && !selected && styles.navHover]}>
                  {selected && <View style={styles.activeIndicator} />}
                  <View style={[styles.accountIcon, { backgroundColor: `${account.accent}14` }]}><Ionicons name={accountIcon(account)} size={14} color={account.accent} /></View>
                  <View style={styles.accountCopy}><AppText variant="caption" numberOfLines={1} style={[styles.accountName, selected && styles.selectedText]}>{account.name}</AppText><AppText variant="caption" numberOfLines={1} style={[styles.accountBalance, { color: amountColor(account.type === 'credit_card' ? -Math.abs(account.balance) : account.balance) }]}>{account.type === 'credit_card' ? formatPeso(Math.abs(account.balance)) : formatPeso(account.balance)}</AppText></View>
                </Pressable>;
              })}</View>}
            </View>;
          })}
          <View style={styles.accountDivider} />
          <Pressable onPress={() => router.push('/accounts')} style={({ hovered, pressed }) => [styles.manageAccounts, interactionTransition, (hovered || pressed) && styles.navHover]}>
            <Ionicons name="settings-outline" size={15} color={colors.slate} />
            <AppText variant="caption" style={styles.manageAccountsText}>Manage accounts</AppText>
          </Pressable>
        </View>
      </View>
      <AppText variant="eyebrow" style={styles.sectionLabel}>YOUR MONEY</AppText>
      {mainItems.map(navItem)}
      <AppText variant="eyebrow" style={[styles.sectionLabel, styles.manageLabel]}>MANAGE</AppText>
      {manageItems.map(navItem)}
      <View style={styles.spacer} />
      {navItem({ label: 'Settings', path: '/(tabs)/settings', icon: 'settings-outline' })}
    </ScrollView>
    <Pressable onPress={() => router.push('/(tabs)/settings')} style={({ hovered }) => [styles.profile, interactionTransition, hovered && styles.navHover]} accessibilityRole="button">
      <Avatar initials={initials} size={36} />
      <View style={styles.profileCopy}><AppText variant="bodyMedium" style={styles.profileName} numberOfLines={1}>{name}</AppText><AppText variant="caption" style={styles.muted}>View your profile</AppText></View>
      <Ionicons name="chevron-forward" size={15} color={colors.slate} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  sidebar: { width: 288, backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: spacing.md },
  brand: { paddingHorizontal: spacing.sm, paddingTop: spacing.xxl, paddingBottom: spacing.xl },
  workspace: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, backgroundColor: colors.softWhite, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm },
  workspaceIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash },
  workspaceCopy: { flex: 1, minWidth: 0 },
  overline: { color: colors.slate, fontSize: 10, letterSpacing: 0.6 },
  workspaceName: { fontSize: 14, lineHeight: 18 },
  navigationScroll: { flex: 1 },
  navigation: { flexGrow: 1, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  sectionLabel: { color: colors.slate, fontSize: 10, lineHeight: 14, letterSpacing: 1, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  accountsPanel: { backgroundColor: colors.softWhite, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.xs, paddingTop: spacing.md, paddingBottom: spacing.xs, marginBottom: spacing.xl },
  accountsLabel: { color: colors.slate, fontSize: 10, lineHeight: 14, letterSpacing: 1, paddingLeft: spacing.sm },
  accountsHeading: { minHeight: 26, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  addAccount: { width: 26, height: 26, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginTop: -7, marginRight: 2 },
  accountGroups: { gap: spacing.sm },
  institutionGroup: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm, overflow: 'hidden' },
  institutionHeader: { minHeight: 36, paddingHorizontal: spacing.sm, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  institutionHeaderExpanded: { borderBottomWidth: 1, borderBottomColor: colors.border },
  institutionHeaderHover: { backgroundColor: colors.mintWash },
  institutionIcon: { width: 21, height: 21, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash },
  institutionName: { flex: 1, minWidth: 0, color: colors.slateDark, fontFamily: typography.semibold, fontSize: 11.5, lineHeight: 16 },
  institutionCount: { minWidth: 20, height: 19, paddingHorizontal: 5, borderRadius: radii.pill, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  institutionCountText: { color: colors.slate, fontFamily: typography.semibold, fontSize: 10, lineHeight: 14 },
  institutionAccounts: { paddingHorizontal: 3, paddingVertical: 3 },
  accountItem: { minHeight: 42, paddingHorizontal: spacing.sm, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, position: 'relative', overflow: 'hidden' },
  accountSelected: { backgroundColor: colors.mintWash },
  accountIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  accountName: { flex: 1, minWidth: 0, color: colors.slateDark, fontFamily: typography.medium, fontSize: 12, lineHeight: 16 },
  accountBalance: { flexShrink: 0, maxWidth: 94, color: colors.neutralAmount, fontFamily: typography.semibold, fontSize: 11.5, lineHeight: 16, textAlign: 'right' },
  accountDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm, marginTop: spacing.xs },
  manageAccounts: { minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  manageAccountsText: { color: colors.slate, fontSize: 11 },
  manageLabel: { marginTop: spacing.xl },
  navItem: { minHeight: 40, paddingHorizontal: spacing.sm, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2, position: 'relative', overflow: 'hidden' },
  navSelected: { backgroundColor: colors.mintWash },
  navHover: { backgroundColor: colors.surface },
  activeIndicator: { position: 'absolute', left: 0, width: 2, height: 18, borderRadius: 2, backgroundColor: colors.mintDeep },
  selectedText: { color: colors.mintDeep, fontFamily: typography.semibold },
  navText: { color: colors.slateDark, fontFamily: typography.medium, fontSize: 14, lineHeight: 18 },
  spacer: { flex: 1, minHeight: spacing.xl },
  profile: { borderTopWidth: 1, borderTopColor: colors.border, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: 11 },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 14, lineHeight: 18 },
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
