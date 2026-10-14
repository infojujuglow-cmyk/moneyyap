import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useState } from 'react';
import { Screen } from '@/components/Screen';
import { AppText, Avatar, Button, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useFinance } from '@/context/FinanceContext';
import { colors, formatPeso, spacing } from '@/theme';

export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const { accounts, members, spaces, workspaceId, availableWorkspaces } = useFinance();
  const [helpfulNudges, setHelpfulNudges] = useState(true);
  const activeAccounts = accounts.filter((item) => item.isActive);
  const assetBalance = activeAccounts.filter((item) => item.type !== 'credit_card').reduce((sum, item) => sum + item.balance, 0);
  const fullName = typeof session?.user.user_metadata.full_name === 'string' && session.user.user_metadata.full_name.trim()
    ? session.user.user_metadata.full_name.trim()
    : session?.user.email?.split('@')[0] ?? 'You';
  const initials = fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const currentWorkspace = availableWorkspaces.find((item) => item.id === workspaceId);
  return (
    <Screen title="Your MoneyYap" subtitle="Calm, private, and built for your life">
      <Surface style={styles.profile}><Avatar initials={initials} size={58} /><View style={styles.profileCopy}><AppText variant="h3">{fullName}</AppText><AppText style={styles.muted}>{currentWorkspace ? `${currentWorkspace.role[0]?.toUpperCase()}${currentWorkspace.role.slice(1)} · ${currentWorkspace.name}` : 'MoneyYap member'}</AppText></View><IconCircle name="create-outline" size={38} /></Surface>

      <View style={styles.section}><SectionHeader title="Money & workspace" /><Surface style={styles.menu}>
        <SettingsRow icon="layers-outline" title="Workspaces" detail={currentWorkspace ? `${currentWorkspace.name} · ${availableWorkspaces.length} available` : 'Add or switch workspace'} onPress={() => router.push('/workspaces' as never)} />
        <SettingsRow icon="wallet-outline" title="Accounts" detail={`${activeAccounts.length} active · ${formatPeso(assetBalance)}`} onPress={() => router.push('/accounts')} />
        <SettingsRow icon="grid-outline" title="Spaces" detail={`${spaces.filter((item) => !item.isArchived).length} active · organize life your way`} onPress={() => router.push('/spaces')} />
        <SettingsRow icon="people-outline" title="Members" detail={members.map((item) => item.fullName).join(' & ')} onPress={() => router.push('/household')} />
        <SettingsRow icon="pricetag-outline" title="Categories" detail="Shared or specific to a Space" onPress={() => router.push('/categories')} />
      </Surface></View>

      <View style={styles.section}><SectionHeader title="Preferences" /><Surface style={styles.menu}>
        <SettingsRow icon="notifications-outline" title="Helpful nudges" detail="Weekly summary and unusual spend" right={<Switch value={helpfulNudges} onValueChange={setHelpfulNudges} trackColor={{ true: colors.mint, false: colors.borderStrong }} thumbColor={colors.white} />} />
        <SettingsRow icon="cash-outline" title="Currency" detail="Philippine Peso (PHP)" />
        <SettingsRow icon="language-outline" title="Language" detail="English · Tagalog · Taglish" />
      </Surface></View>

      <View style={styles.section}><SectionHeader title="Privacy & support" /><Surface style={styles.menu}>
        <SettingsRow icon="shield-checkmark-outline" title="Privacy & security" detail="Your workspace data stays yours" />
        <SettingsRow icon="help-circle-outline" title="Help center" detail="Get answers or send feedback" />
        <SettingsRow icon="document-text-outline" title="About MoneyYap" detail="Version 1.0.0" />
      </Surface></View>

      <Button label="Sign out" variant="ghost" icon="log-out-outline" onPress={() => signOut()} />
      <AppText variant="caption" style={styles.tagline}>Money conversations, made simple.</AppText>
    </Screen>
  );
}

function SettingsRow({ icon, title, detail, onPress, right }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress?: () => void; right?: React.ReactNode }) {
  const content = <><IconCircle name={icon} size={40} /><View style={styles.flex}><AppText variant="bodyMedium">{title}</AppText><AppText variant="caption" style={styles.muted}>{detail}</AppText></View>{right ?? <Ionicons name="chevron-forward" size={18} color={colors.slate} />}</>;
  if (right) return <View style={styles.row}>{content}</View>;
  return <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable>;
}

const styles = StyleSheet.create({
  profile: { padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileCopy: { flex: 1 },
  muted: { color: colors.slate },
  section: { gap: spacing.md },
  menu: { paddingHorizontal: spacing.lg },
  row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  flex: { flex: 1 },
  pressed: { opacity: 0.62 },
  tagline: { color: colors.slate, textAlign: 'center', paddingBottom: spacing.lg },
});
