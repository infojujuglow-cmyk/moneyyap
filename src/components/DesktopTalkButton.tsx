import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, shadows, spacing } from '@/theme';
import { AppText } from './ui';

export function DesktopTalkButton() {
  const pathname = usePathname();
  const isTalkScreen = pathname === '/add' || pathname === '/(tabs)/add';

  if (isTalkScreen) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Talk to MoneyYap"
      accessibilityHint="Open the MoneyYap conversation"
      onPress={() => router.push('/(tabs)/add')}
      style={({ hovered, pressed }) => [
        styles.button,
        hovered && styles.hovered,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.icon}>
        <Ionicons name="chatbubble-ellipses" size={20} color={colors.ink} />
      </View>
      <View>
        <AppText variant="bodyMedium">Talk to MoneyYap</AppText>
        <AppText variant="caption" style={styles.caption}>Ask or record anything</AppText>
      </View>
      <Ionicons name="arrow-forward" size={17} color={colors.mintDeep} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: spacing.xxxl,
    bottom: spacing.xxxl,
    zIndex: 20,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.mintMist,
    borderRadius: radii.lg,
    ...shadows.lift,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  caption: { color: colors.slate, marginTop: 1 },
  hovered: { borderColor: colors.mint, transform: [{ translateY: -2 }] },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
