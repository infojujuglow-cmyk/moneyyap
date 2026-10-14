import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppText, Button, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { getErrorMessage } from '@/lib/errors';
import { colors, spacing } from '@/theme';

export default function WorkspacesScreen() {
  const { availableWorkspaces, workspaceId, switchWorkspace } = useFinance();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectWorkspace = async (id: string) => {
    if (id === workspaceId || switchingId) return;
    setSwitchingId(id); setError(null);
    try { await switchWorkspace(id); }
    catch (switchError) { setError(getErrorMessage(switchError, 'Unable to switch workspace. Please try again.')); }
    finally { setSwitchingId(null); }
  };

  return (
    <Screen title="Workspaces" subtitle="Separate money worlds, one MoneyYap" right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
      <Surface style={styles.intro}>
        <IconCircle name="layers-outline" background={colors.mintWash} color={colors.mintDark} />
        <View style={styles.flex}><AppText variant="bodyMedium">Switch without mixing data</AppText><AppText style={styles.muted}>Accounts, Spaces, members, transactions, and analytics stay inside their workspace.</AppText></View>
      </Surface>

      <View style={styles.section}>
        <SectionHeader title="Your workspaces" />
        <Surface style={styles.list}>
          {availableWorkspaces.map((workspace, index) => {
            const selected = workspace.id === workspaceId;
            const switching = workspace.id === switchingId;
            return (
              <Pressable key={workspace.id} disabled={Boolean(switchingId)} onPress={() => selectWorkspace(workspace.id)} style={({ pressed }) => [styles.row, index > 0 && styles.border, pressed && styles.pressed]}>
                <View style={[styles.workspaceIcon, selected && styles.workspaceIconSelected]}><Ionicons name="layers-outline" size={21} color={selected ? colors.mintDeep : colors.slateDark} /></View>
                <View style={styles.flex}><AppText variant="bodyMedium">{workspace.name}</AppText><AppText variant="caption" style={styles.muted}>{workspace.role === 'owner' ? 'Owner' : workspace.role === 'admin' ? 'Admin' : 'Member'}</AppText></View>
                {switching ? <ActivityIndicator color={colors.mintDeep} /> : selected ? <View style={styles.current}><Ionicons name="checkmark" size={14} color={colors.mintDeep} /><AppText variant="caption" style={styles.currentText}>Current</AppText></View> : <Ionicons name="chevron-forward" size={18} color={colors.slate} />}
              </Pressable>
            );
          })}
        </Surface>
        {error && <AppText style={styles.error}>{error}</AppText>}
      </View>

      <Button label="Add workspace" icon="add" onPress={() => router.push('/add-workspace' as never)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { padding: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  flex: { flex: 1 },
  muted: { color: colors.slate },
  section: { gap: spacing.md },
  list: { paddingHorizontal: spacing.lg },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.65 },
  workspaceIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  workspaceIconSelected: { backgroundColor: colors.mintWash },
  current: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: colors.mintWash, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  currentText: { color: colors.mintDeep },
  error: { color: colors.danger },
});
