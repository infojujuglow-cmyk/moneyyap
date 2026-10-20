import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { SmartSelectField, SmartSelectSheet } from '@/components/SmartSelectSheet';
import { AppText, Button, Chip } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { getErrorMessage } from '@/lib/errors';
import { colors, radii, spacing, typography } from '@/theme';
import type { Category, CategoryType } from '@/types/finance';

const palette = ['#35B987', '#6B70E8', '#D96AA7', '#4E93D8', '#F2A44B', '#7C8B6A'];
const icons = ['pricetag-outline', 'restaurant-outline', 'home-outline', 'car-outline', 'bag-handle-outline', 'wallet-outline'] as const;

export default function CategoryDetailScreen() {
  const params = useLocalSearchParams<{ id: string; spaceId?: string; type?: string; parentId?: string }>();
  const { categories, spaces, selectedSpaceId, addCategory, updateCategory, archiveCategory, restoreCategory } = useFinance();
  const existing = categories.find((item) => item.id === params.id);
  const isNew = params.id === 'new';
  const initialType: CategoryType = params.type === 'income' ? 'income' : 'expense';
  const initialSpaceId = existing?.spaceId ?? params.spaceId ?? selectedSpaceId ?? spaces.find((space) => !space.isArchived)?.id ?? null;
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<CategoryType>(existing?.type ?? initialType);
  const [spaceId] = useState<string | null>(initialSpaceId);
  const [parentId, setParentId] = useState<string | null>(existing?.parentId ?? params.parentId ?? null);
  const [icon, setIcon] = useState(existing?.icon ?? (type === 'income' ? 'wallet-outline' : 'pricetag-outline'));
  const [color, setColor] = useState(existing?.color ?? colors.mintDark);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSpace = spaces.find((space) => space.id === spaceId);

  const descendantIds = useMemo(() => {
    if (!existing) return new Set<string>();
    const ids = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      categories.forEach((category) => {
        if (!ids.has(category.id) && (category.parentId === existing.id || category.parentId && ids.has(category.parentId))) { ids.add(category.id); changed = true; }
      });
    }
    return ids;
  }, [categories, existing]);
  const parents = useMemo(() => categories.filter((item) => !item.isArchived && item.type === type && item.spaceId === spaceId && item.id !== existing?.id && !descendantIds.has(item.id)), [categories, descendantIds, existing?.id, spaceId, type]);
  const categoryPath = (category: Category) => {
    const names = [category.name];
    let parent = categories.find((item) => item.id === category.parentId);
    while (parent) { names.unshift(parent.name); parent = categories.find((item) => item.id === parent?.parentId); }
    return names.join(' › ');
  };
  const selectedParent = parents.find((item) => item.id === parentId);

  const save = async () => {
    if (!name.trim() || !spaceId || saving) return;
    setSaving(true); setError(null);
    try {
      if (isNew) await addCategory({ name: name.trim(), type, spaceId, parentId, icon, color, sortOrder: categories.filter((item) => item.spaceId === spaceId && item.type === type && item.parentId === parentId).length, isArchived: false });
      else if (existing) await updateCategory(existing.id, { name: name.trim(), parentId, icon, color });
      router.back();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save this category.'); }
    finally { setSaving(false); }
  };
  const restore = async () => {
    if (!existing || saving) return;
    setSaving(true); setError(null);
    try { await restoreCategory(existing.id); router.back(); }
    catch (reason) { setError(getErrorMessage(reason, 'Unable to restore this category.')); }
    finally { setSaving(false); }
  };

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">{isNew ? 'New category' : 'Edit category'}</AppText><View style={styles.close} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.scopeCard}><View style={[styles.scopeIcon, { backgroundColor: type === 'income' ? colors.incomeWash : colors.expenseWash }]}><Ionicons name={type === 'income' ? 'arrow-down' : 'arrow-up'} size={18} color={type === 'income' ? colors.income : colors.expense} /></View><View style={styles.flex}><AppText variant="bodyMedium">{type === 'income' ? 'Income' : 'Expense'} · {selectedSpace?.name ?? 'No Space'}</AppText><AppText variant="caption" style={styles.muted}>This scope stays fixed to protect transaction history.</AppText></View></View>
      <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>Name</AppText><TextInput value={name} onChangeText={setName} placeholder={type === 'income' ? 'e.g. Service Revenue' : 'e.g. Office Supplies'} placeholderTextColor={colors.slate} style={styles.input} autoFocus={isNew} /></View>
      {isNew && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>Type</AppText><View style={styles.wrap}><Chip label="Expense" selected={type === 'expense'} onPress={() => { setType('expense'); setParentId(null); }} /><Chip label="Income" selected={type === 'income'} onPress={() => { setType('income'); setParentId(null); }} /></View></View>}
      <SmartSelectField label="Parent · optional" value={selectedParent ? categoryPath(selectedParent) : null} placeholder="Top level category" onPress={() => setParentPickerOpen(true)} hint="Choose any category in the same Space and type" />
      <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>Icon</AppText><View style={styles.wrap}>{icons.map((item) => <Chip key={item} label={item.replace('-outline', '')} icon={item} selected={icon === item} onPress={() => setIcon(item)} />)}</View></View>
      <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>Color</AppText><View style={styles.wrap}>{palette.map((item) => <Pressable accessibilityLabel={`Color ${item}`} key={item} onPress={() => setColor(item)} style={[styles.swatch, { backgroundColor: item }, color === item && styles.selected]} />)}</View></View>
      {error ? <AppText variant="caption" style={styles.error}>{error}</AppText> : null}
      <Button label={isNew ? 'Create category' : 'Save changes'} icon="checkmark" loading={saving} disabled={!name.trim() || !spaceId} onPress={save} />
      {!isNew && existing?.isArchived && <Button label="Restore category tree" icon="refresh-outline" loading={saving} onPress={restore} />}
      {!isNew && !existing?.isArchived && <Button label="Archive category tree" variant="danger" icon="archive-outline" onPress={() => setArchiveOpen(true)} />}
    </ScrollView>
    <SmartSelectSheet visible={parentPickerOpen} title="Choose a parent" options={[{ id: '__root__', label: 'Top level category', detail: `Directly under ${selectedSpace?.name ?? 'this Space'}` }, ...parents.map((item) => ({ id: item.id, label: categoryPath(item), color: item.color }))]} selectedIds={[parentId ?? '__root__']} onClose={() => setParentPickerOpen(false)} onSelect={(id) => setParentId(id === '__root__' ? null : id)} searchPlaceholder="Search categories" />
    {existing && <ConfirmActionDialog visible={archiveOpen} title={`Archive ${existing.name}?`} message="It and its nested subcategories will be hidden from new entries. Existing transaction history stays intact." confirmLabel="Archive category tree" onClose={() => setArchiveOpen(false)} onConfirm={async () => { await archiveCategory(existing.id); router.back(); }} />}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 }, header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 },
  scopeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md }, scopeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1 },
  field: { gap: spacing.md }, label: { color: colors.slate }, muted: { color: colors.slate }, input: { minHeight: 54, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink, outlineStyle: 'none' } as never, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, swatch: { width: 42, height: 42, borderRadius: 21 }, selected: { borderWidth: 4, borderColor: colors.white, outlineWidth: 2, outlineColor: colors.ink }, error: { color: colors.danger },
});
