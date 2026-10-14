import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { AppText, Button, EmptyState, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, spacing } from '@/theme';
import type { Category } from '@/types/finance';

export default function CategoriesScreen() {
  const { categories, spaces, updateCategory } = useFinance();
  const active = categories.filter((item) => !item.isArchived);
  const archived = categories.filter((item) => item.isArchived);
  const scopes: { id: string | null; name: string }[] = [{ id: null, name: 'Shared categories' }, ...spaces.filter((item) => !item.isArchived).map((item) => ({ id: item.id, name: item.name }))];
  const move = async (siblings: Category[], index: number, direction: -1 | 1) => {
    const otherIndex = index + direction;
    if (!siblings[index] || !siblings[otherIndex]) return;
    await Promise.all([updateCategory(siblings[index]!.id, { sortOrder: siblings[otherIndex]!.sortOrder }), updateCategory(siblings[otherIndex]!.id, { sortOrder: siblings[index]!.sortOrder })]);
  };
  return <Screen title="Categories" subtitle="Flexible groups with one level of subcategories" right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
    <Surface style={styles.intro}><IconCircle name="pricetag-outline" background={colors.mintWash} color={colors.mintDark} /><View style={styles.flex}><AppText variant="bodyMedium">Shared or Space-specific</AppText><AppText style={styles.muted}>Transaction type stays separate, so categories can reflect how you actually think.</AppText></View></Surface>
    {scopes.map((scope) => {
      const roots = active.filter((item) => item.spaceId === scope.id && !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
      if (!roots.length) return null;
      return <View key={scope.id ?? 'shared'} style={styles.section}><SectionHeader title={scope.name} /><Surface style={styles.list}>{roots.map((category, index) => <View key={category.id} style={index > 0 && styles.border}><CategoryRow category={category} onMoveUp={() => move(roots, index, -1)} onMoveDown={() => move(roots, index, 1)} disableUp={index === 0} disableDown={index === roots.length - 1} />{active.filter((item) => item.parentId === category.id).sort((a, b) => a.sortOrder - b.sortOrder).map((child) => <CategoryRow key={child.id} category={child} child />)}</View>)}</Surface></View>;
    })}
    {!active.length && <Surface><EmptyState icon="pricetag-outline" title="No categories yet" body="Create your first category to classify spending or income." /></Surface>}
    {archived.length > 0 && <View style={styles.section}><SectionHeader title="Archived" /><Surface style={styles.list}>{archived.filter((item) => !item.parentId).map((item, index) => <Pressable key={item.id} onPress={() => router.push(`/category/${item.id}`)} style={[styles.row, index > 0 && styles.border, styles.archived]}><Ionicons name="archive-outline" size={21} color={colors.slate} /><View style={styles.flex}><AppText variant="bodyMedium">{item.name}</AppText><AppText variant="caption" style={styles.muted}>History preserved</AppText></View><Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable>)}</Surface></View>}
    <Button label="Create a category" icon="add" onPress={() => router.push('/category/new')} />
  </Screen>;
}

function CategoryRow({ category, child = false, onMoveUp, onMoveDown, disableUp, disableDown }: { category: Category; child?: boolean; onMoveUp?: () => void; onMoveDown?: () => void; disableUp?: boolean; disableDown?: boolean }) {
  return <Pressable onPress={() => router.push(`/category/${category.id}`)} style={[styles.row, child && styles.child]}><View style={[styles.categoryIcon, { backgroundColor: `${category.color}18` }]}><Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={18} color={category.color} /></View><View style={styles.flex}><AppText variant="bodyMedium">{category.name}</AppText><AppText variant="caption" style={styles.muted}>{child ? 'Subcategory' : category.type}</AppText></View>{onMoveUp && <View style={styles.order}><Pressable disabled={disableUp} onPress={(event) => { event.stopPropagation(); onMoveUp(); }}><Ionicons name="chevron-up" size={17} color={disableUp ? colors.borderStrong : colors.slate} /></Pressable><Pressable disabled={disableDown} onPress={(event) => { event.stopPropagation(); onMoveDown?.(); }}><Ionicons name="chevron-down" size={17} color={disableDown ? colors.borderStrong : colors.slate} /></Pressable></View>}<Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable>;
}

const styles = StyleSheet.create({ intro: { padding: spacing.lg, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }, flex: { flex: 1 }, muted: { color: colors.slate }, section: { gap: spacing.md }, list: { paddingHorizontal: spacing.lg }, row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, child: { marginLeft: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border }, border: { borderTopWidth: 1, borderTopColor: colors.border }, categoryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, order: { gap: 1 }, archived: { opacity: 0.65 } });
