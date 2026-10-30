import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFinance } from '@/context/FinanceContext';
import { colors, radii, shadows, spacing } from '@/theme';

export function DesktopQuickActions() {
  const pathname = usePathname();
  const { accounts } = useFinance();
  const isTalkScreen = pathname === '/add' || pathname === '/(tabs)/add';
  const isManualTransactionScreen = pathname === '/manual-transaction';
  const accountPathMatch = pathname.match(/^\/account\/([^/]+)\/?$/);
  const accountId = accountPathMatch?.[1] ? decodeURIComponent(accountPathMatch[1]) : null;
  const account = accountId ? accounts.find((item) => item.id === accountId && item.isActive) : null;
  const addTransaction = () => router.push(account
    ? { pathname: '/manual-transaction', params: { accountId: account.id, ...(account.spaceId ? { spaceId: account.spaceId } : {}) } }
    : '/manual-transaction');

  if (isTalkScreen || isManualTransactionScreen) return null;

  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction manually"
        accessibilityHint="Open the manual transaction form"
        onPress={addTransaction}
        style={({ hovered, pressed }) => [
          styles.button,
          styles.manualButton,
          hovered && styles.hovered,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="add" size={26} color={colors.ink} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Talk to MoneyYap"
        accessibilityHint="Open the MoneyYap conversation"
        onPress={() => router.push('/(tabs)/add')}
        style={({ hovered, pressed }) => [
          styles.button,
          styles.talkButton,
          hovered && styles.hovered,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="chatbubble-ellipses" size={22} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    position: 'absolute',
    right: spacing.xxxl,
    bottom: spacing.xxxl,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    ...shadows.lift,
  },
  manualButton: { backgroundColor: colors.white, borderColor: colors.borderStrong },
  talkButton: { backgroundColor: colors.mint, borderColor: colors.mintDark },
  hovered: { transform: [{ translateY: -2 }] },
  pressed: { opacity: 0.82, transform: [{ scale: 0.94 }] },
});
