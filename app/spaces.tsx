import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppText, Button, EmptyState, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, spacing } from '@/theme';

export default function SpacesScreen() {
  const { spaces, transactions, updateSpace } = useFinance();
  const active = spaces.filter((item) => !item.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  const archived = spaces.filter((item) => item.isArchived);
  const move = async (index: number, direction: -1 | 1) => {
    const otherIndex = index + direction;
    if (!active[index] || !active[otherIndex]) return;
    await Promise.all([updateSpace(active[index]!.id, { sortOrder: active[otherIndex]!.sortOrder }), updateSpace(active[otherIndex]!.id, { sortOrder: active[index]!.sortOrder })]);
  };
  return <Screen title="Spaces" subtitle="One workspace, organized your way" right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
    <Surface style={styles.intro}><IconCircle name="grid-outline" background={colors.mintWash} color={colors.mintDark} /><View style={styles.flex}><AppText variant="bodyMedium">Every transaction belongs to one Space</AppText><AppText style={styles.muted}>Use any names you like—projects, people, homes, or businesses.</AppText></View></Surface>
    <View style={styles.section}><SectionHeader title="Active Spaces" /><Surface style={styles.list}>{active.length ? active.map((space, index) => <Pressable key={space.id} onPress={() => router.push(`/space/${space.id}`)} style={[styles.row, index > 0 && styles.border]}><View style={[styles.spaceIcon, { backgroundColor: `${space.color}18` }]}><Ionicons name={space.icon as keyof typeof Ionicons.glyphMap} size={21} color={space.color} /></View><View style={styles.flex}><AppText variant="bodyMedium">{space.name}</AppText><AppText variant="caption" style={styles.muted}>{transactions.filter((item) => item.spaceId === space.id).length} transactions</AppText></View><View style={styles.order}><Pressable disabled={index === 0} onPress={(event) => { event.stopPropagation(); move(index, -1); }}><Ionicons name="chevron-up" size={18} color={index === 0 ? colors.borderStrong : colors.slate} /></Pressable><Pressable disabled={index === active.length - 1} onPress={(event) => { event.stopPropagation(); move(index, 1); }}><Ionicons name="chevron-down" size={18} color={index === active.length - 1 ? colors.borderStrong : colors.slate} /></Pressable></View><Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable>) : <EmptyState icon="grid-outline" title="No active Spaces" body="Create one to start organizing transactions." />}</Surface></View>
    {archived.length > 0 && <View style={styles.section}><SectionHeader title="Archived" /><Surface style={styles.list}>{archived.map((space, index) => <Pressable key={space.id} onPress={() => router.push(`/space/${space.id}`)} style={[styles.row, index > 0 && styles.border, styles.archived]}><Ionicons name="archive-outline" size={22} color={colors.slate} /><View style={styles.flex}><AppText variant="bodyMedium">{space.name}</AppText><AppText variant="caption" style={styles.muted}>History preserved</AppText></View><Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable>)}</Surface></View>}
    <Button label="Create a Space" icon="add" onPress={() => router.push('/space/new')} />
  </Screen>;
}

const styles = StyleSheet.create({ intro: { padding: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }, flex: { flex: 1 }, muted: { color: colors.slate }, section: { gap: spacing.md }, list: { paddingHorizontal: spacing.lg }, row: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, border: { borderTopWidth: 1, borderTopColor: colors.border }, spaceIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, order: { gap: 2 }, archived: { opacity: 0.65 } });
