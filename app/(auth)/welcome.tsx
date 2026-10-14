import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText, BrandMark, Button, Wordmark } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  return <SafeAreaView style={styles.safe}><View style={[styles.content, desktop && styles.desktopContent]}>
    <Wordmark />
    <View style={desktop ? styles.desktopBody : styles.mobileBody}>
      <View style={[styles.visual, desktop && styles.desktopVisual]}><LinearGradient colors={[colors.mintMist, colors.softWhite]} style={styles.gradient}><View style={styles.orb}><BrandMark size={92} /></View><View style={styles.chatUser}><AppText variant="bodyMedium" style={styles.chatUserText}>Paid ₱1,850 for Meralco.</AppText></View><View style={styles.chatReply}><View style={styles.check}><Ionicons name="checkmark" size={16} color={colors.mintDeep} /></View><View><AppText variant="bodyMedium">Got it. Logged.</AppText><AppText variant="caption" style={styles.muted}>Bills · Today</AppText></View></View></LinearGradient></View>
      <View style={desktop ? styles.desktopRight : styles.mobileRight}><View style={styles.copy}><AppText variant="display">Money conversations, made simple.</AppText><AppText style={styles.body}>Your calm finance companion. Just say what happened—we’ll track, understand, and organize the rest.</AppText></View><View style={styles.actions}><Button label="Create my account" onPress={() => router.push('/(auth)/sign-up')} /><Button label="I already have an account" variant="secondary" onPress={() => router.push('/(auth)/sign-in')} /></View><AppText variant="caption" style={styles.privacy}><Ionicons name="lock-closed-outline" size={12} /> Private by default. Your financial data is workspace-only.</AppText></View>
    </View>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.softWhite },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg },
  desktopContent: { width: '100%', maxWidth: 1220, alignSelf: 'center', paddingHorizontal: spacing.huge, paddingVertical: spacing.xxxl },
  mobileBody: { flex: 1, justifyContent: 'space-between' },
  desktopBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.huge },
  desktopRight: { flex: 1, gap: spacing.xxxl },
  mobileRight: { gap: spacing.xxl },
  visual: { height: 270, borderRadius: 32, overflow: 'hidden', marginVertical: spacing.xl },
  desktopVisual: { flex: 1.15, height: 440, marginVertical: 0 },
  gradient: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  orb: { position: 'absolute', width: 170, height: 170, borderRadius: 85, backgroundColor: '#FFFFFF90', alignItems: 'center', justifyContent: 'center', top: 8, right: -24 },
  chatUser: { alignSelf: 'flex-end', backgroundColor: colors.mintDark, borderRadius: radii.lg, borderBottomRightRadius: 5, padding: spacing.md, marginTop: 58 },
  chatUserText: { color: colors.white },
  chatReply: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radii.lg, borderBottomLeftRadius: 5, padding: spacing.md, marginTop: spacing.md },
  check: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.mintWash, alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.slate },
  copy: { gap: spacing.md },
  body: { color: colors.slate, maxWidth: 350 },
  actions: { gap: spacing.md },
  privacy: { color: colors.slate, textAlign: 'center' },
});
