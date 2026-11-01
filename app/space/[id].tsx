import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { AppText, Button, Chip } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/lib/errors';
import type { SpaceType } from '@/types/finance';

const palette = ['#35B987', '#6B70E8', '#D96AA7', '#4E93D8', '#F2A44B', '#7C8B6A'];
const icons = ['grid-outline', 'people-outline', 'person-outline', 'briefcase-outline', 'home-outline', 'sparkles-outline'] as const;
const spaceTypes: { id: SpaceType; label: string; detail: string }[] = [
  { id: 'personal', label: 'Personal', detail: 'Private individual finances' },
  { id: 'household', label: 'Household', detail: 'Shared family finances' },
  { id: 'business', label: 'Business', detail: 'Eligible for authorized business integrations' },
];

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { spaces, addSpace, updateSpace, archiveSpace, workspaceId, isLoading } = useFinance();
  const existing = spaces.find((item) => item.id === id);
  const isNew = id === 'new';
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? 'grid-outline');
  const [color, setColor] = useState(existing?.color ?? colors.mintDark);
  const [spaceType, setSpaceType] = useState<SpaceType>(existing?.type ?? 'household');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? 'PHP');
  const [legalEntityExternalId, setLegalEntityExternalId] = useState(existing?.legalEntityExternalId ?? '');
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoading && !workspaceId) router.replace('/(auth)/household-setup');
  }, [isLoading, workspaceId]);
  const save = async () => {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      if (isNew) await addSpace({ name: name.trim(), icon, color, sortOrder: spaces.length, isArchived: false, type: spaceType, description: description.trim() || null, currency: currency.trim().toUpperCase(), legalEntityExternalId: legalEntityExternalId.trim() || null });
      else if (existing) await updateSpace(existing.id, { name: name.trim(), icon, color, type: spaceType, description: description.trim() || null, currency: currency.trim().toUpperCase(), legalEntityExternalId: legalEntityExternalId.trim() || null });
      router.back();
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save this Space. Please try again.'));
    } finally { setSaving(false); }
  };
  const archive = () => {
    if (!existing) return;
    if (spaces.filter((item) => !item.isArchived).length <= 1) { setError('Create another Space before archiving the last active one.'); return; }
    setError(null);
    setArchiveOpen(true);
  };
  const restore = async () => {
    if (!existing) return;
    setSaving(true); setError(null);
    try { await updateSpace(existing.id, { isArchived: false }); router.back(); }
    catch (reason) { setError(getErrorMessage(reason, 'Unable to restore this Space.')); }
    finally { setSaving(false); }
  };
  if (!workspaceId) return <View style={styles.screen} />;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">{isNew ? 'New Space' : 'Edit Space'}</AppText><View style={styles.close} /></View><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={[styles.preview, { backgroundColor: `${color}18` }]}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={32} color={color} /><AppText variant="h2">{name.trim() || 'Your Space'}</AppText></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>NAME</AppText><TextInput value={name} onChangeText={setName} placeholder="e.g. Studio, Travel, Cami" placeholderTextColor={colors.slate} style={styles.input} autoFocus={isNew} /></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>SPACE TYPE</AppText><View style={styles.typeList}>{spaceTypes.map((item) => <Pressable key={item.id} onPress={() => setSpaceType(item.id)} style={[styles.typeOption, spaceType === item.id && styles.typeSelected]}><View style={styles.typeCopy}><AppText variant="bodyMedium">{item.label}</AppText><AppText variant="caption" style={styles.label}>{item.detail}</AppText></View>{spaceType === item.id && <Ionicons name="checkmark-circle" size={20} color={colors.mintDark} />}</Pressable>)}</View>{spaceType === 'business' && <AppText variant="caption" style={styles.businessNote}>Business Spaces can be shared with Venture OS only after separate owner/admin authorization.</AppText>}</View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>DESCRIPTION · OPTIONAL</AppText><TextInput value={description} onChangeText={setDescription} placeholder="What this Space tracks" placeholderTextColor={colors.slate} style={[styles.input, styles.multiline]} multiline /></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>CURRENCY</AppText><TextInput value={currency} onChangeText={setCurrency} placeholder="PHP" placeholderTextColor={colors.slate} style={styles.input} autoCapitalize="characters" maxLength={3} /></View>
    {spaceType === 'business' && <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>LEGAL ENTITY REFERENCE · OPTIONAL</AppText><TextInput value={legalEntityExternalId} onChangeText={setLegalEntityExternalId} placeholder="Internal or external legal entity ID" placeholderTextColor={colors.slate} style={styles.input} autoCapitalize="none" /><AppText variant="caption" style={styles.label}>A Business Space is not automatically a registered legal entity.</AppText></View>}
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>ICON</AppText><View style={styles.wrap}>{icons.map((item) => <Chip key={item} label={item.replace('-outline', '')} icon={item} selected={icon === item} onPress={() => setIcon(item)} />)}</View></View>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>COLOR</AppText><View style={styles.wrap}>{palette.map((item) => <Pressable accessibilityLabel={`Color ${item}`} key={item} onPress={() => setColor(item)} style={[styles.swatch, { backgroundColor: item }, color === item && styles.selected]} />)}</View></View>
    {error && <AppText style={styles.error}>{error}</AppText>}
    <Button label={isNew ? 'Create Space' : 'Save changes'} icon="checkmark" loading={saving} disabled={!name.trim() || !/^[A-Za-z]{3}$/.test(currency.trim())} onPress={save} />
    {!isNew && existing?.isArchived && <Button label="Restore Space" icon="refresh-outline" loading={saving} onPress={restore} />}
    {!isNew && !existing?.isArchived && <Button label="Archive Space" variant="danger" icon="archive-outline" onPress={archive} />}
  </ScrollView>
    {existing && <ConfirmActionDialog visible={archiveOpen} title={`Archive ${existing.name}?`} message="Existing transactions stay in this Space. It will be hidden from new entries and filters until restored." confirmLabel="Archive Space" onClose={() => setArchiveOpen(false)} onConfirm={async () => { await archiveSpace(existing.id); router.back(); }} />}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 }, header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 }, preview: { minHeight: 130, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, field: { gap: spacing.md }, label: { color: colors.slate }, input: { minHeight: 54, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink }, multiline: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: 'top' }, typeList: { gap: spacing.sm }, typeOption: { minHeight: 62, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, typeSelected: { borderColor: colors.mintDark, backgroundColor: colors.mintWash }, typeCopy: { flex: 1, gap: 2 }, businessNote: { color: colors.mintDeep, backgroundColor: colors.mintWash, borderRadius: radii.sm, padding: spacing.md }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, swatch: { width: 42, height: 42, borderRadius: 21 }, selected: { borderWidth: 4, borderColor: colors.white, outlineWidth: 2, outlineColor: colors.ink }, error: { color: colors.danger } });
