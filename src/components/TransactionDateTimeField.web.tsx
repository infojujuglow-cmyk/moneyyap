import type { ChangeEvent, CSSProperties } from 'react';
import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, radii, spacing, typography } from '@/theme';

interface Props {
  value: Date;
  onChange: (value: Date) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const dateValue = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const timeValue = (value: Date) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;
const inputStyle: CSSProperties = { minHeight: 54, width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.border}`, borderRadius: radii.md, background: colors.white, color: colors.ink, padding: `0 ${spacing.md}px`, fontFamily: typography.regular, fontSize: 16, colorScheme: 'light', outline: 'none' };

export function TransactionDateTimeField({ value, onChange }: Props) {
  const changeDate = (event: ChangeEvent<HTMLInputElement>) => {
    const [year, month, day] = event.target.value.split('-').map(Number);
    if (year && month && day) onChange(new Date(year, month - 1, day, value.getHours(), value.getMinutes(), 0, 0));
  };
  const changeTime = (event: ChangeEvent<HTMLInputElement>) => {
    const [hour, minute] = event.target.value.split(':').map(Number);
    if (Number.isFinite(hour) && Number.isFinite(minute)) onChange(new Date(value.getFullYear(), value.getMonth(), value.getDate(), hour, minute, 0, 0));
  };

  return <View style={styles.section}>
    <View><AppText variant="eyebrow" style={styles.label}>Date and time</AppText><AppText variant="caption" style={styles.hint}>When the transaction actually happened</AppText></View>
    <View style={styles.row}>
      <View style={styles.field}><AppText variant="caption" style={styles.hint}>Date</AppText>{createElement('input', { type: 'date', value: dateValue(value), onChange: changeDate, style: inputStyle, 'aria-label': 'Transaction date' })}</View>
      <View style={styles.field}><AppText variant="caption" style={styles.hint}>Time</AppText>{createElement('input', { type: 'time', value: timeValue(value), onChange: changeTime, style: inputStyle, 'aria-label': 'Transaction time' })}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({ section: { gap: spacing.sm }, row: { flexDirection: 'row', gap: spacing.sm }, field: { flex: 1, gap: 5 }, label: { color: colors.slate }, hint: { color: colors.slate } });
