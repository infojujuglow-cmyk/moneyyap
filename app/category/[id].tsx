import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, Chip } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import type { CategoryType } from '@/types/finance';

const palette = ['#35B987', '#6B70E8', '#D96AA7', '#4E93D8', '#F2A44B', '#7C8B6A'];
const icons = ['pricetag-outline', 'restaurant-outline', 'home-outline', 'car-outline', 'bag-handle-outline', 'wallet-outline'] as const;

export default function CategoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { categories, spaces, addCategory, updateCategory, archiveCategory } = useFinance();
  const existing = categories.find((item) => item.id === id);
  const isNew = id === 'new';
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<CategoryType>(existing?.type ?? 'expense');
  const [spaceId, setSpaceId] = useState<string | null>(existing?.spaceId ?? null);
  const [parentId, setParentId] = useState<string | null>(existing?.parentId ?? null);
  const [icon, setIcon] = useState(existing?.icon ?? 'pricetag-outline');
  const [color, setColor] = useState(existing?.color ?? colors.mintDark);
  const [saving, setSaving] = useState(false);
  const parents = useMemo(() => categories.filter((item) => !item.isArchived && !item.parentId && item.type === type && item.spaceId === spaceId && item.id !== existing?.id), [categories, existing?.id, spaceId, type]);
  const save = async () => { if (!name.trim()) return; setSaving(true); if (isNew) await addCategory({ name: name.trim(), type, spaceId, parentId, icon, color, sortOrder: categories.filter((item) => item.spaceId === spaceId && item.parentId === parentId).length, isArchived: false }); else if (existing) await updateCategory(existing.id, { name: name.trim(), spaceId, parentId, icon, color }); setSaving(false); router.back(); };
  const archive = () => existing && Alert.alert(`Archive ${existing.name}?`, 'It will be hidden from new entries. Existing transactions and analytics history stay intact.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive', style: 'destructive', onPress: async () => { await archiveCategory(existing.id); router.back(); } }]);
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">{isNew ? 'New category' : 'Edit category'}</AppText><View style={styles.close} /></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>NAME</AppText><TextInput value={name} onChangeText={setName} placeholder="e.g. Cami Birthday" placeholderTextColor={colors.slate} style={styles.input} autoFocus={isNew} /></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>TYPE</AppText><View style={styles.wrap}><Chip label="Expense" selected={type === 'expense'} onPress={() => { if (isNew) { setType('expense'); setParentId(null); } }} /><Chip label="Income" selected={type === 'income'} onPress={() => { if (isNew) { setType('income'); setParentId(null); } }} /></View>{!isNew && <AppText variant="caption" style={styles.muted}>Type stays fixed after creation to protect reporting history.</AppText>}</View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>AVAILABLE IN</AppText><View style={styles.wrap}><Chip label="All Spaces" selected={spaceId === null} onPress={() => { setSpaceId(null); setParentId(null); }} />{spaces.filter((item) => !item.isArchived).map((space) => <Chip key={space.id} label={space.name} selected={spaceId === space.id} onPress={() => { setSpaceId(space.id); setParentId(null); }} />)}</View></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>PARENT · OPTIONAL</AppText><View style={styles.wrap}><Chip label="Top level" selected={parentId === null} onPress={() => setParentId(null)} />{parents.map((item) => <Chip key={item.id} label={item.name} selected={parentId === item.id} onPress={() => setParentId(item.id)} />)}</View><AppText variant="caption" style={styles.muted}>MoneyYap displays up to two levels: category and subcategory.</AppText></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>ICON</AppText><View style={styles.wrap}>{icons.map((item) => <Chip key={item} label={item.replace('-outline', '')} icon={item} selected={icon === item} onPress={() => setIcon(item)} />)}</View></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>COLOR</AppText><View style={styles.wrap}>{palette.map((item) => <Pressable accessibilityLabel={`Color ${item}`} key={item} onPress={() => setColor(item)} style={[styles.swatch, { backgroundColor: item }, color === item && styles.selected]} />)}</View></View>
    <Button label={isNew ? 'Create category' : 'Save changes'} icon="checkmark" loading={saving} disabled={!name.trim()} onPress={save} />
    {!isNew && existing?.isArchived && <Button label="Restore category" icon="refresh-outline" onPress={async () => { await updateCategory(existing.id, { isArchived: false }); await Promise.all(categories.filter((item) => item.parentId === existing.id).map((item) => updateCategory(item.id, { isArchived: false }))); router.back(); }} />}
    {!isNew && !existing?.isArchived && <Button label="Archive category" variant="danger" icon="archive-outline" onPress={archive} />}
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 }, header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 }, field: { gap: spacing.md }, label: { color: colors.slate }, muted: { color: colors.slate }, input: { minHeight: 54, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, swatch: { width: 42, height: 42, borderRadius: 21 }, selected: { borderWidth: 4, borderColor: colors.white, outlineWidth: 2, outlineColor: colors.ink } });
