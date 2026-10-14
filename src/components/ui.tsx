import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type TextProps, type ViewStyle, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { colors, radii, shadows, spacing, typography } from '@/theme';

type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMedium' | 'caption' | 'eyebrow';

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: TextVariant }) {
  return <Text {...props} style={[styles.text, textStyles[variant], style]} />;
}

export function BrandMark({ size = 44, inverse = false }: { size?: number; inverse?: boolean }) {
  const stroke = inverse ? colors.white : 'url(#moneyYapMarkGradient)';
  return (
    <Svg accessibilityLabel="MoneyYap" width={size} height={size} viewBox="0 0 48 48">
      {!inverse && <Defs><SvgLinearGradient id="moneyYapMarkGradient" x1="8" y1="8" x2="41" y2="43" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor="#57DD8F" /><Stop offset="0.5" stopColor={colors.mint} /><Stop offset="1" stopColor="#12BFA6" /></SvgLinearGradient></Defs>}
      <Path d="M8.5 38V11.2c0-2.5 3-3.7 4.7-1.9l9.7 9.7c.9.9 2.4.9 3.3 0L36 9.2c1.8-1.8 4.8-.5 4.8 2v14.9c0 1.2-.5 2.4-1.4 3.2l-6.5 6.4" fill="none" stroke={stroke} strokeWidth="4.9" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m27.9 29.6 5 5.1V42" fill="none" stroke={stroke} strokeWidth="4.9" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="13.4" cy="33.1" r="1.45" fill={inverse ? colors.white : colors.ink} />
      <Circle cx="18.8" cy="33.1" r="1.45" fill={inverse ? colors.white : colors.ink} />
      <Circle cx="24.2" cy="33.1" r="1.45" fill={inverse ? colors.white : colors.ink} />
    </Svg>
  );
}

export function Wordmark({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <View style={styles.wordmark}>
      <BrandMark size={compact ? 34 : 42} inverse={inverse} />
      {!compact && <AppText style={[styles.wordmarkText, { color: inverse ? colors.white : colors.ink }]}>Money<AppText style={[styles.wordmarkText, { color: inverse ? colors.mintMist : colors.mintDark }]}>Yap</AppText></AppText>}
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); onPress(); }}
      style={({ pressed }) => [styles.button, buttonStyles[variant], pressed && styles.pressed, (disabled || loading) && styles.disabled, style]}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.ink : colors.mintDark} /> : (
        <>
          {icon && <Ionicons name={icon} size={18} color={variant === 'primary' ? colors.ink : variant === 'danger' ? colors.danger : colors.ink} />}
          <AppText variant="bodyMedium" style={{ color: variant === 'danger' ? colors.danger : colors.ink }}>{label}</AppText>
        </>
      )}
    </Pressable>
  );
}

export function Surface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function IconCircle({ name, color = colors.ink, background = colors.surface, size = 42 }: { name: keyof typeof Ionicons.glyphMap; color?: string; background?: string; size?: number }) {
  return <View style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}><Ionicons name={name} size={size * 0.46} color={color} /></View>;
}

export function Chip({ label, selected = false, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      {icon && <Ionicons name={icon} size={14} color={selected ? colors.mintDeep : colors.slate} />}
      <AppText variant="caption" style={{ color: selected ? colors.mintDeep : colors.slateDark }}>{label}</AppText>
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}><AppText variant="h3">{title}</AppText>{action && <Pressable onPress={onAction}><AppText variant="bodyMedium" style={styles.actionText}>{action}</AppText></Pressable>}</View>;
}

export function Avatar({ initials, size = 42, color = colors.mintWash }: { initials: string; size?: number; color?: string }) {
  return <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}><AppText variant="bodyMedium" style={{ color: colors.mintDeep }}>{initials}</AppText></View>;
}

export function EmptyState({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action?: ReactNode }) {
  return <View style={styles.empty}><IconCircle name={icon} size={58} background={colors.mintWash} color={colors.mintDark} /><AppText variant="h3">{title}</AppText><AppText style={styles.emptyBody}>{body}</AppText>{action}</View>;
}

const textStyles = StyleSheet.create({
  display: { fontFamily: typography.bold, fontSize: 36, lineHeight: 42, letterSpacing: -1.2 },
  h1: { fontFamily: typography.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.7 },
  h2: { fontFamily: typography.semibold, fontSize: 24, lineHeight: 31, letterSpacing: -0.45 },
  h3: { fontFamily: typography.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.15 },
  body: { fontFamily: typography.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: typography.semibold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: typography.medium, fontSize: 12, lineHeight: 16 },
  eyebrow: { fontFamily: typography.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 1.1, textTransform: 'uppercase' },
});

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.mint },
  secondary: { backgroundColor: colors.white, borderColor: colors.borderStrong, borderWidth: 1 },
  ghost: { backgroundColor: colors.surface },
  danger: { backgroundColor: colors.dangerWash },
});

const styles = StyleSheet.create({
  text: { color: colors.ink },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wordmarkText: { fontFamily: typography.regular, fontSize: 28, lineHeight: 34, letterSpacing: -1.05 },
  button: { minHeight: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  surface: { backgroundColor: colors.white, borderRadius: radii.lg, borderColor: colors.border, borderWidth: 1, ...shadows.soft },
  iconCircle: { alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 34, borderRadius: radii.pill, paddingHorizontal: 13, backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1 },
  chipSelected: { backgroundColor: colors.mintWash, borderColor: colors.mintMist },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionText: { color: colors.mintDeep },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.huge, paddingHorizontal: spacing.xxxl },
  emptyBody: { color: colors.slate, textAlign: 'center' },
});
