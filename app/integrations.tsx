import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { Screen } from '@/components/Screen';
import { AppText, Button, EmptyState, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { getErrorMessage } from '@/lib/errors';
import { createVentureOsIntegration, loadIntegrationConnections, revokeIntegrationConnection, rotateIntegrationCredential, type IntegrationConnection } from '@/services/integrations';
import { colors, radii, spacing, typography } from '@/theme';

export default function IntegrationsScreen() {
  const { spaces, workspaceId, availableWorkspaces } = useFinance();
  const currentWorkspace = availableWorkspaces.find((item) => item.id === workspaceId);
  const canManage = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin';
  const businessSpaces = useMemo(() => spaces.filter((item) => item.type === 'business' && !item.isArchived), [spaces]);
  const [selected, setSelected] = useState<string[]>([]);
  const [businessIds, setBusinessIds] = useState<Record<string, string>>({});
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    try { setConnections(await loadIntegrationConnections(workspaceId)); }
    catch (reason) { setError(getErrorMessage(reason, 'Unable to load integrations.')); }
  }, [canManage, workspaceId]);
  useEffect(() => {
    if (!workspaceId || !canManage) return;
    let active = true;
    loadIntegrationConnections(workspaceId).then((items) => { if (active) setConnections(items); }).catch((reason) => { if (active) setError(getErrorMessage(reason, 'Unable to load integrations.')); });
    return () => { active = false; };
  }, [canManage, workspaceId]);
  const create = async () => {
    if (!selected.length || busy) return;
    setBusy(true); setError(null); setRevealedToken(null);
    try {
      const result = await createVentureOsIntegration(selected.map((spaceId) => ({
        spaceId,
        externalBusinessId: businessIds[spaceId],
        externalBusinessName: spaces.find((item) => item.id === spaceId)?.name,
      })));
      setRevealedToken(result.accessToken); setSelected([]); setBusinessIds({}); await refresh();
    } catch (reason) { setError(getErrorMessage(reason, 'Unable to authorize Venture OS.')); }
    finally { setBusy(false); }
  };
  const rotate = async (id: string) => {
    setBusy(true); setError(null); setRevealedToken(null);
    try { setRevealedToken(await rotateIntegrationCredential(id)); await refresh(); }
    catch (reason) { setError(getErrorMessage(reason, 'Unable to rotate the credential.')); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!revokeId) return;
    setBusy(true); setError(null);
    try { await revokeIntegrationConnection(revokeId); await refresh(); }
    catch (reason) { setError(getErrorMessage(reason, 'Unable to revoke the connection.')); }
    finally { setBusy(false); setRevokeId(null); }
  };
  return <Screen title="Business integrations" subtitle="Explicit, read-only financial sharing" right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
    <Surface style={styles.security}><IconCircle name="shield-checkmark-outline" background={colors.mintWash} color={colors.mintDeep} /><View style={styles.flex}><AppText variant="bodyMedium">MoneyYap remains the financial source</AppText><AppText variant="caption" style={styles.muted}>Venture OS receives cash-basis summaries only for the Business Spaces you authorize. Personal and Household Spaces are unavailable.</AppText></View></Surface>
    {!canManage ? <EmptyState icon="lock-closed-outline" title="Owner or admin access required" body="Only workspace owners and admins can authorize an external financial application." /> : <>
      <View style={styles.section}><SectionHeader title="Authorize Venture OS" /><Surface style={styles.list}>{businessSpaces.length ? businessSpaces.map((space, index) => {
        const checked = selected.includes(space.id);
        return <View key={space.id} style={[styles.spaceRow, index > 0 && styles.border]}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setSelected((items) => checked ? items.filter((id) => id !== space.id) : [...items, space.id])} style={styles.spaceChoice}><View style={[styles.checkbox, checked && styles.checked]}>{checked && <Ionicons name="checkmark" size={15} color={colors.white} />}</View><View style={[styles.dot, { backgroundColor: space.color }]} /><View style={styles.flex}><AppText variant="bodyMedium">{space.name}</AppText><AppText variant="caption" style={styles.muted}>{space.currency} · Business Space</AppText></View></Pressable>{checked && <TextInput value={businessIds[space.id] ?? ''} onChangeText={(value) => setBusinessIds((current) => ({ ...current, [space.id]: value }))} placeholder="Venture OS business ID · optional" placeholderTextColor={colors.slate} autoCapitalize="none" style={styles.input} />}</View>;
      }) : <EmptyState icon="briefcase-outline" title="No Business Spaces" body="Edit a Space and change its type to Business before authorizing Venture OS." action={<Button label="Manage Spaces" variant="secondary" onPress={() => router.push('/spaces')} />} />}</Surface>{businessSpaces.length > 0 && <Button label="Create read-only connection" icon="link-outline" loading={busy} disabled={!selected.length} onPress={create} />}</View>
      {revealedToken && <Surface style={styles.tokenCard}><View style={styles.tokenHeading}><Ionicons name="key-outline" size={20} color={colors.warning} /><AppText variant="bodyMedium">Save this credential now</AppText></View><AppText variant="caption" style={styles.muted}>It is shown only once. Store it as a server environment variable in Venture OS. Never put it in browser code.</AppText><TextInput value={revealedToken} editable={false} selectTextOnFocus multiline style={styles.token} /><Button label="I saved it" variant="secondary" onPress={() => setRevealedToken(null)} /></Surface>}
      <View style={styles.section}><SectionHeader title="Connections" /><Surface style={styles.list}>{connections.length ? connections.map((connection, index) => <View key={connection.id} style={[styles.connection, index > 0 && styles.border]}><View style={styles.connectionHeading}><View style={[styles.statusDot, { backgroundColor: connection.status === 'active' ? colors.mintDark : colors.slate }]} /><View style={styles.flex}><AppText variant="bodyMedium">{connection.displayName}</AppText><AppText variant="caption" style={styles.muted}>{connection.status === 'active' ? `${connection.spaces.length} Business Space${connection.spaces.length === 1 ? '' : 's'} · key ${connection.credentialPrefix}…` : 'Revoked'}</AppText></View></View><AppText variant="caption" style={styles.muted}>Last access: {connection.lastAccessedAt ? new Date(connection.lastAccessedAt).toLocaleString('en-PH') : 'Never'}</AppText>{connection.status === 'active' && <View style={styles.actions}><Button label="Rotate key" variant="secondary" icon="refresh-outline" disabled={busy} onPress={() => void rotate(connection.id)} style={styles.flex} /><Button label="Revoke" variant="danger" icon="close-circle-outline" disabled={busy} onPress={() => setRevokeId(connection.id)} style={styles.flex} /></View>}</View>) : <EmptyState icon="link-outline" title="No connections" body="Venture OS cannot access any Space until you create a connection." />}</Surface></View>
    </>}
    {error && <Surface style={styles.errorCard}><AppText variant="caption" style={styles.error}>{error}</AppText></Surface>}
    <ConfirmActionDialog visible={Boolean(revokeId)} title="Revoke Venture OS access?" message="The credential stops working immediately. Existing Venture OS snapshots remain subject to its own retention policy." confirmLabel="Revoke connection" onClose={() => setRevokeId(null)} onConfirm={revoke} />
  </Screen>;
}

const styles = StyleSheet.create({
  security: { padding: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  section: { gap: spacing.md }, flex: { flex: 1 }, muted: { color: colors.slate }, list: { paddingHorizontal: spacing.lg },
  spaceRow: { paddingVertical: spacing.md, gap: spacing.sm }, border: { borderTopWidth: 1, borderTopColor: colors.border },
  spaceChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checked: { borderColor: colors.mintDeep, backgroundColor: colors.mintDeep }, dot: { width: 12, height: 12, borderRadius: 6 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white, color: colors.ink, paddingHorizontal: spacing.md, fontFamily: typography.regular },
  tokenCard: { padding: spacing.lg, gap: spacing.md, borderColor: colors.warning, borderWidth: 1 }, tokenHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  token: { minHeight: 78, borderRadius: radii.md, backgroundColor: colors.surface, color: colors.ink, padding: spacing.md, fontFamily: typography.medium },
  connection: { paddingVertical: spacing.lg, gap: spacing.sm }, connectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, statusDot: { width: 10, height: 10, borderRadius: 5 }, actions: { flexDirection: 'row', gap: spacing.sm },
  errorCard: { padding: spacing.md, backgroundColor: colors.dangerWash }, error: { color: colors.danger },
});
