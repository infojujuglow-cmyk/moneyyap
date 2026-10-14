import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, BrandMark, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { colors, radii, spacing, typography } from '@/theme';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setLoading(true); setError(null);
    const message = await signUp(fullName.trim(), email.trim(), password);
    setLoading(false);
    if (message) setError(message); else router.replace('/(auth)/household-setup');
  };
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={22} color={colors.ink} /></Pressable><BrandMark size={58} /><AppText variant="h1" style={styles.title}>Let’s get acquainted.</AppText><AppText style={styles.subtitle}>A few basics, then you can start tracking by talking.</AppText><View style={styles.form}><Field label="YOUR NAME" value={fullName} onChangeText={setFullName} placeholder="What should MoneyYap call you?" /><Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" email /><Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="At least 8 characters" secure />{error && <AppText style={styles.error}>{error}</AppText>}<View style={styles.promise}><Ionicons name="shield-checkmark-outline" size={20} color={colors.mintDeep} /><AppText style={styles.promiseText}>Your information is protected with workspace-level access controls.</AppText></View><Button label="Continue" loading={loading} disabled={!fullName.trim() || !email.includes('@') || password.length < 8} onPress={submit} /></View><Pressable onPress={() => router.replace('/(auth)/sign-in')}><AppText style={styles.switch}>Already have an account? <AppText variant="bodyMedium" style={styles.link}>Sign in</AppText></AppText></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function Field({ label, email, secure, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; email?: boolean; secure?: boolean }) { return <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{label}</AppText><TextInput {...props} keyboardType={email ? 'email-address' : 'default'} autoCapitalize={email ? 'none' : 'words'} secureTextEntry={secure} placeholderTextColor={colors.slate} style={styles.input} /></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.softWhite },
  flex: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', padding: spacing.xxl, paddingBottom: 48 },
  back: { width: 42, height: 42, justifyContent: 'center', marginBottom: spacing.xxl },
  title: { marginTop: spacing.xl },
  subtitle: { color: colors.slate, marginTop: spacing.sm },
  form: { gap: spacing.xl, marginTop: spacing.xxxl, marginBottom: spacing.xxxl },
  field: { gap: spacing.sm },
  label: { color: colors.slate },
  input: { minHeight: 56, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  promise: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.mintWash, borderRadius: radii.md, padding: spacing.md },
  promiseText: { flex: 1, color: colors.mintDeep },
  error: { color: colors.danger, backgroundColor: colors.dangerWash, borderRadius: radii.sm, padding: spacing.md },
  switch: { color: colors.slate, textAlign: 'center' },
  link: { color: colors.mintDeep },
});
