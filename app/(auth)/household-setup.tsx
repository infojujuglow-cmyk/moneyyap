import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, Avatar, BrandMark, Button } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/lib/errors';

export default function HouseholdSetupScreen() {
  const { createWorkspace } = useFinance();
  const [name, setName] = useState('My workspace');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setLoading(true); setError(null);
    try { await createWorkspace(name); router.replace('/(tabs)'); }
    catch (createError) { setError(getErrorMessage(createError, 'Unable to create your workspace. Please try again.')); }
    finally { setLoading(false); }
  };
  return <SafeAreaView style={styles.safe}><View style={styles.content}><BrandMark size={58} /><View style={styles.copy}><AppText variant="h1">Set up your money workspace.</AppText><AppText style={styles.subtitle}>This is the secure container for your Spaces, accounts, and members.</AppText></View><View style={styles.people}><View style={styles.person}><Avatar initials="YOU" size={70} /><AppText variant="bodyMedium">You</AppText><AppText variant="caption" style={styles.muted}>Owner</AppText></View><View style={styles.link}><Ionicons name="add" size={20} color={colors.mintDeep} /></View><View style={styles.person}><View style={styles.invite}><Ionicons name="person-add-outline" size={25} color={colors.slate} /></View><AppText variant="bodyMedium">Invite later</AppText><AppText variant="caption" style={styles.muted}>Optional</AppText></View></View><View style={styles.field}><AppText variant="eyebrow" style={styles.label}>WORKSPACE NAME</AppText><TextInput value={name} onChangeText={setName} style={styles.input} />{error && <AppText style={styles.error}>{error}</AppText>}</View><View style={styles.bottom}><View style={styles.note}><Ionicons name="eye-outline" size={19} color={colors.mintDeep} /><AppText style={styles.noteText}>Only workspace members can see its accounts and transactions.</AppText></View><Button label="Create workspace" loading={loading} disabled={!name.trim()} onPress={submit} /></View></View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.softWhite },
  content: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.xxl, gap: spacing.xxxl },
  copy: { gap: spacing.md },
  subtitle: { color: colors.slate },
  people: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  person: { alignItems: 'center', gap: spacing.xs },
  link: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintWash },
  invite: { width: 70, height: 70, borderRadius: 35, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.slate },
  field: { gap: spacing.sm },
  label: { color: colors.slate },
  input: { minHeight: 56, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  error: { color: colors.danger },
  bottom: { marginTop: 'auto', gap: spacing.xl },
  note: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.mintWash, padding: spacing.md, borderRadius: radii.md },
  noteText: { flex: 1, color: colors.mintDeep },
});
