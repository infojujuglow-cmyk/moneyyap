import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, IconCircle, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { getErrorMessage } from '@/lib/errors';
import { colors, radii, spacing, typography } from '@/theme';

export default function AddWorkspaceScreen() {
  const { createWorkspace } = useFinance();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true); setError(null);
    try { await createWorkspace(name); router.back(); }
    catch (createError) { setError(getErrorMessage(createError, 'Unable to create this workspace. Please try again.')); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable><AppText variant="h3">New workspace</AppText><View style={styles.close} /></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Surface style={styles.hero}><IconCircle name="layers-outline" size={58} background={colors.mintWash} color={colors.mintDeep} /><AppText variant="h2">Create a fresh money space.</AppText><AppText style={styles.heroText}>It gets its own accounts, Spaces, categories, transactions, analytics, and members.</AppText></Surface>
        <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>WORKSPACE NAME</AppText><TextInput autoFocus value={name} onChangeText={setName} placeholder="e.g. Juju Glow" placeholderTextColor={colors.slate} maxLength={120} returnKeyType="done" onSubmitEditing={submit} style={styles.input} /></View>
        <View style={styles.note}><Ionicons name="swap-horizontal-outline" size={20} color={colors.mintDeep} /><AppText style={styles.noteText}>After creation, MoneyYap will switch to this workspace automatically. You can switch back anytime from Me.</AppText></View>
        {error && <AppText style={styles.error}>{error}</AppText>}
        <Button label="Create workspace" icon="add" loading={saving} disabled={!name.trim()} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.softWhite, paddingTop: Platform.OS === 'ios' ? 52 : 30 },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.border },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.xxl, paddingBottom: 60 },
  hero: { alignItems: 'center', padding: spacing.xxl, gap: spacing.md },
  heroText: { color: colors.slate, textAlign: 'center' },
  field: { gap: spacing.md },
  label: { color: colors.slate },
  input: { minHeight: 58, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 17, color: colors.ink },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, padding: spacing.lg },
  noteText: { flex: 1, color: colors.mintDeep },
  error: { color: colors.danger },
});
