import { Platform, StyleSheet, type ViewStyle, View } from 'react-native';
import { colors, spacing } from '@/theme';
import { AppText } from './ui';

const webStickyStyle = Platform.select<ViewStyle>({
  web: { position: 'sticky' as never, top: 0, zIndex: 2 },
  default: {},
});

export function TransactionDateHeader({ transactionDate }: { transactionDate: string }) {
  const date = new Date(transactionDate);
  const today = new Date();
  const dayLabel = date.toDateString() === today.toDateString()
    ? 'Today'
    : date.toLocaleDateString('en-PH', { weekday: 'long' });
  const dateLabel = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={[styles.header, webStickyStyle]}>
      <AppText variant="eyebrow" style={styles.label}>{dayLabel} · {dateLabel}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 38,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderStrong,
  },
  label: { color: colors.slateDark, letterSpacing: 0.65 },
});
