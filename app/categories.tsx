import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SmartSelectField, SmartSelectSheet } from '@/components/SmartSelectSheet';
import { AppText, Button, EmptyState, IconCircle, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import type { Category, CategoryType } from '@/types/finance';

export default function CategoriesScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 900;
  const { categories, spaces, selectedSpaceId, setSelectedSpaceId, updateCategory } = useFinance();
  const activeSpaces = spaces.filter((space) => !space.isArchived);
  const [spaceId, setSpaceId] = useState(selectedSpaceId ?? activeSpaces[0]?.id ?? null);
  const [type, setType] = useState<CategoryType>('expense');
  const [query, setQuery] = useState('');
  const [spacePickerOpen, setSpacePickerOpen] = useState(false);
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const scoped = useMemo(() => categories.filter((category) => category.spaceId === spaceId && category.type === type), [categories, spaceId, type]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleIds = useMemo(() => {
    if (!normalizedQuery) return null;
    const result = new Set<string>();
    scoped.forEach((category) => {
      if (!category.name.toLocaleLowerCase().includes(normalizedQuery)) return;
      result.add(category.id);
      let parent = scoped.find((item) => item.id === category.parentId);
      while (parent) { result.add(parent.id); parent = scoped.find((item) => item.id === parent?.parentId); }
    });
    return result;
  }, [normalizedQuery, scoped]);
  const active = scoped.filter((category) => !category.isArchived && (!visibleIds || visibleIds.has(category.id)));
  const archived = scoped.filter((category) => category.isArchived && (!normalizedQuery || category.name.toLocaleLowerCase().includes(normalizedQuery)));
  const roots = active.filter((category) => !category.parentId || !active.some((item) => item.id === category.parentId)).sort((a, b) => a.sortOrder - b.sortOrder);

  const move = async (category: Category, direction: -1 | 1) => {
    const siblings = active.filter((item) => item.parentId === category.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((item) => item.id === category.id);
    const other = siblings[index + direction];
    if (!other) return;
    await Promise.all([updateCategory(category.id, { sortOrder: other.sortOrder }), updateCategory(other.id, { sortOrder: category.sortOrder })]);
  };
  const add = (parentId?: string) => {
    if (!spaceId) return;
    const params = new URLSearchParams({ spaceId, type });
    if (parentId) params.set('parentId', parentId);
    router.push(`/category/new?${params.toString()}`);
  };
  const chooseSpace = (nextSpaceId: string) => { setSpaceId(nextSpaceId); setSelectedSpaceId(nextSpaceId); setQuery(''); };

  return (
    <Screen title="Categories" subtitle="Independent category trees for every Space" contentStyle={desktop ? styles.wide : undefined} right={<Pressable onPress={() => router.back()}><IconCircle name="close" /></Pressable>}>
      <View style={[styles.controls, desktop && styles.controlsDesktop]}>
        <View style={styles.spaceControl}><SmartSelectField label="Space" value={selectedSpace?.name} placeholder="Choose a Space" onPress={() => setSpacePickerOpen(true)} /></View>
        <View style={styles.tabs}>
          {(['expense', 'income'] as CategoryType[]).map((item) => <Pressable key={item} onPress={() => { setType(item); setQuery(''); }} style={[styles.tab, type === item && styles.tabSelected]}><Ionicons name={item === 'expense' ? 'arrow-up' : 'arrow-down'} size={17} color={type === item ? colors.mintDeep : colors.slate} /><AppText variant="bodyMedium" style={type === item ? styles.tabTextSelected : styles.muted}>{item === 'expense' ? 'Expenses' : 'Income'}</AppText></Pressable>)}
        </View>
      </View>

      <View style={styles.search}><Ionicons name="search" size={19} color={colors.slate} /><TextInput value={query} onChangeText={setQuery} placeholder={`Search ${type} categories`} placeholderTextColor={colors.slate} style={styles.searchInput} />{query ? <Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.slate} /></Pressable> : null}</View>

      <View style={styles.sectionHeader}><View><AppText variant="h3">{type === 'expense' ? 'Expense categories' : 'Income categories'}</AppText><AppText variant="caption" style={styles.muted}>{selectedSpace?.name ?? 'Choose a Space'} · {scoped.filter((item) => !item.isArchived).length} active</AppText></View><Button label="Add category" icon="add" onPress={() => add()} disabled={!spaceId} style={styles.addButton} /></View>

      {roots.length ? <Surface style={styles.list}>{roots.map((category, index) => <CategoryBranch key={category.id} category={category} categories={active} depth={0} first={index === 0} onAdd={add} onMove={move} />)}</Surface> : <Surface><EmptyState icon={type === 'expense' ? 'cart-outline' : 'wallet-outline'} title={query ? 'No matching categories' : `No ${type} categories yet`} body={query ? 'Try a different search.' : `Create the first ${type} category for ${selectedSpace?.name ?? 'this Space'}.`} action={!query ? <Button label="Create category" icon="add" onPress={() => add()} disabled={!spaceId} /> : undefined} /></Surface>}

      {archived.length > 0 && <View style={styles.archivedSection}><AppText variant="h3">Archived</AppText><Surface style={styles.list}>{archived.map((category, index) => <Pressable key={category.id} onPress={() => router.push(`/category/${category.id}`)} style={[styles.row, index > 0 && styles.border]}><Ionicons name="archive-outline" size={20} color={colors.slate} /><View style={styles.flex}><AppText variant="bodyMedium">{category.name}</AppText><AppText variant="caption" style={styles.muted}>History preserved</AppText></View><Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable>)}</Surface></View>}

      <SmartSelectSheet visible={spacePickerOpen} title="Choose a Space" options={activeSpaces.map((space) => ({ id: space.id, label: space.name, color: space.color }))} selectedIds={spaceId ? [spaceId] : []} onClose={() => setSpacePickerOpen(false)} onSelect={chooseSpace} searchPlaceholder="Search Spaces" />
    </Screen>
  );
}

function CategoryBranch({ category, categories, depth, first, onAdd, onMove }: { category: Category; categories: Category[]; depth: number; first: boolean; onAdd: (parentId: string) => void; onMove: (category: Category, direction: -1 | 1) => void }) {
  const children = categories.filter((item) => item.parentId === category.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const siblings = categories.filter((item) => item.parentId === category.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((item) => item.id === category.id);
  return <View>
    <Pressable onPress={() => router.push(`/category/${category.id}`)} style={[styles.row, !first && styles.border, { paddingLeft: Math.min(depth, 4) * 24 }]}>
      {depth > 0 && <View style={styles.branchLine} />}
      <View style={[styles.categoryIcon, { backgroundColor: `${category.color}18` }]}><Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={18} color={category.color} /></View>
      <View style={styles.flex}><AppText variant="bodyMedium">{category.name}</AppText><AppText variant="caption" style={styles.muted}>{children.length ? `${children.length} subcategor${children.length === 1 ? 'y' : 'ies'}` : depth ? 'Subcategory' : 'Category'}</AppText></View>
      <Pressable accessibilityLabel={`Add subcategory to ${category.name}`} hitSlop={8} onPress={(event) => { event.stopPropagation(); onAdd(category.id); }} style={styles.rowAction}><Ionicons name="add" size={18} color={colors.mintDeep} /></Pressable>
      <View style={styles.order}><Pressable disabled={index === 0} onPress={(event) => { event.stopPropagation(); onMove(category, -1); }}><Ionicons name="chevron-up" size={16} color={index === 0 ? colors.borderStrong : colors.slate} /></Pressable><Pressable disabled={index === siblings.length - 1} onPress={(event) => { event.stopPropagation(); onMove(category, 1); }}><Ionicons name="chevron-down" size={16} color={index === siblings.length - 1 ? colors.borderStrong : colors.slate} /></Pressable></View>
      <Ionicons name="chevron-forward" size={18} color={colors.slate} />
    </Pressable>
    {children.map((child, childIndex) => <CategoryBranch key={child.id} category={child} categories={categories} depth={depth + 1} first={childIndex === 0} onAdd={onAdd} onMove={onMove} />)}
  </View>;
}

const styles = StyleSheet.create({
  wide: { maxWidth: 980 }, controls: { gap: spacing.lg }, controlsDesktop: { flexDirection: 'row', alignItems: 'flex-end' }, spaceControl: { flex: 1 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radii.md, backgroundColor: colors.surface }, tab: { minHeight: 48, flex: 1, minWidth: 130, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, tabSelected: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, tabTextSelected: { color: colors.mintDeep },
  search: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }, searchInput: { flex: 1, minHeight: 48, fontFamily: typography.regular, fontSize: 16, color: colors.ink, outlineStyle: 'none' } as never,
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, addButton: { minHeight: 44 },
  list: { paddingHorizontal: spacing.lg }, row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, border: { borderTopWidth: 1, borderTopColor: colors.border }, branchLine: { width: 10, height: 1, backgroundColor: colors.borderStrong }, categoryIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 }, rowAction: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.mintWash, alignItems: 'center', justifyContent: 'center' }, order: { gap: 1 }, muted: { color: colors.slate }, archivedSection: { gap: spacing.md },
});
