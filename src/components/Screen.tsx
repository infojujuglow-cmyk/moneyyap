import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';
import { AppText } from './ui';

interface ScreenProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  titleColor?: string;
  subtitleColor?: string;
}

export function Screen({ children, title, subtitle, right, scroll = true, contentStyle, backgroundColor, titleColor, subtitleColor }: ScreenProps) {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const content = (
    <View style={[styles.content, desktop && styles.desktopContent, contentStyle]}>
      {(title || right) && <View style={styles.header}><View style={styles.headerCopy}>{title && <AppText variant="h1" style={titleColor ? { color: titleColor } : undefined}>{title}</AppText>}{subtitle && <AppText style={[styles.subtitle, subtitleColor ? { color: subtitleColor } : undefined]}>{subtitle}</AppText>}</View>{right}</View>}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={[styles.safe, backgroundColor ? { backgroundColor } : undefined]}>
      {scroll ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={desktop ? styles.desktopScroll : styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.softWhite },
  scroll: { paddingBottom: 124 },
  content: { paddingHorizontal: spacing.xl, gap: spacing.xxl },
  desktopScroll: { paddingBottom: spacing.huge },
  desktopContent: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: spacing.xxxl, paddingTop: spacing.xxl, gap: spacing.xxxl },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm },
  headerCopy: { gap: spacing.xs, flex: 1 },
  subtitle: { color: colors.slate },
});
