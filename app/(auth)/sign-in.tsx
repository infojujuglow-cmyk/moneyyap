import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, BrandMark, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { colors, radii, spacing, typography } from '@/theme';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setLoading(true); setError(null);
    const message = await signIn(email.trim(), password);
    setLoading(false);
    if (message) setError(message); else router.replace('/');
  };
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.content} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={22} color={colors.ink} /></Pressable><BrandMark size={58} /><AppText variant="h1" style={styles.title}>Welcome back.</AppText><AppText style={styles.subtitle}>Pick up the money conversation where you left it.</AppText></View><View style={styles.form}><Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" /><View style={styles.field}><AppText variant="eyebrow" style={styles.label}>PASSWORD</AppText><View style={styles.password}><TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Your password" placeholderTextColor={colors.slate} style={styles.passwordInput} /><Pressable onPress={() => setShowPassword((value) => !value)}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.slate} /></Pressable></View></View>{error && <AppText style={styles.error}>{error}</AppText>}<Pressable><AppText variant="bodyMedium" style={styles.forgot}>Forgot password?</AppText></Pressable><Button label="Sign in" loading={loading} disabled={!email || password.length < 6} onPress={submit} /></View><Pressable onPress={() => router.replace('/(auth)/sign-up')}><AppText style={styles.switch}>New to MoneyYap? <AppText variant="bodyMedium" style={styles.link}>Create an account</AppText></AppText></Pressable></KeyboardAvoidingView></SafeAreaView>;
}

function Field({ label, ...props }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'email-address' }) { return <View style={styles.field}><AppText variant="eyebrow" style={styles.label}>{label}</AppText><TextInput {...props} autoCapitalize="none" placeholderTextColor={colors.slate} style={styles.input} /></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.softWhite },
  content: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', padding: spacing.xxl, justifyContent: 'space-between' },
  back: { width: 42, height: 42, justifyContent: 'center', marginBottom: spacing.xxl },
  title: { marginTop: spacing.xl },
  subtitle: { color: colors.slate, marginTop: spacing.sm },
  form: { gap: spacing.xl },
  field: { gap: spacing.sm },
  label: { color: colors.slate },
  input: { minHeight: 56, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.lg, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  password: { minHeight: 56, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.lg },
  passwordInput: { flex: 1, minHeight: 54, fontFamily: typography.regular, fontSize: 16, color: colors.ink },
  forgot: { color: colors.mintDeep, textAlign: 'right', marginTop: -spacing.md },
  error: { color: colors.danger, backgroundColor: colors.dangerWash, borderRadius: radii.sm, padding: spacing.md },
  switch: { color: colors.slate, textAlign: 'center' },
  link: { color: colors.mintDeep },
});
