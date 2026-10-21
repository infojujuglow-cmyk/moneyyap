import { Platform, StyleSheet, type ViewStyle, View } from 'react-native';
import { colors, spacing } from '@/theme';
import { AppText } from './ui';

const webStickyStyle = Platform.select<ViewStyle>({
  web: { position: 'sticky' as never, top: 0, zIndex: 2 },
  default: {},
});

export function TransactionDateHeader({ transactionDate, compact = false }: { transactionDate: string; compact?: boolean }) {
  const date = new Date(transactionDate);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const dayLabel = isToday ? 'Today' : date.toLocaleDateString('en-PH', { weekday: 'long' });
  const compactDateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  const dateLabel = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <View style={[styles.header, compact && styles.compactHeader, !compact && webStickyStyle]}>
      <AppText variant="eyebrow" style={[styles.label, compact && styles.compactLabel]}>{compact ? compactDateLabel : `${dayLabel} · ${dateLabel}`}</AppText>
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
  compactHeader: { minHeight: 34, marginHorizontal: 0, paddingHorizontal: 0, backgroundColor: colors.softWhite, borderTopWidth: 0, borderBottomColor: colors.border, borderBottomWidth: 1 },
  compactLabel: { color: colors.ink, letterSpacing: 0.45 },
});
