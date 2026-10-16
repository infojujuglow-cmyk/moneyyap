import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

interface Props {
  value: Date;
  onChange: (value: Date) => void;
}

type PickerMode = 'date' | 'time';

const mergePart = (current: Date, next: Date, mode: PickerMode) => mode === 'date'
  ? new Date(next.getFullYear(), next.getMonth(), next.getDate(), current.getHours(), current.getMinutes(), 0, 0)
  : new Date(current.getFullYear(), current.getMonth(), current.getDate(), next.getHours(), next.getMinutes(), 0, 0);

export function TransactionDateTimeField({ value, onChange }: Props) {
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const change = (mode: PickerMode) => (event: DateTimePickerEvent, next?: Date) => {
    if (Platform.OS === 'android') setPickerMode(null);
    if (event.type === 'set' && next) onChange(mergePart(value, next, mode));
  };

  if (Platform.OS === 'ios') {
    return <View style={styles.section}>
      <View><AppText variant="eyebrow" style={styles.label}>Date and time</AppText><AppText variant="caption" style={styles.hint}>When the transaction actually happened</AppText></View>
      <View style={styles.iosRow}>
        <View style={styles.iosControl}><Ionicons name="calendar-outline" size={19} color={colors.slate} /><DateTimePicker value={value} mode="date" display="compact" onChange={change('date')} themeVariant="light" accentColor={colors.mintDeep} /></View>
        <View style={styles.iosControl}><Ionicons name="time-outline" size={19} color={colors.slate} /><DateTimePicker value={value} mode="time" display="compact" onChange={change('time')} themeVariant="light" accentColor={colors.mintDeep} /></View>
      </View>
    </View>;
  }

  return <View style={styles.section}>
    <View><AppText variant="eyebrow" style={styles.label}>Date and time</AppText><AppText variant="caption" style={styles.hint}>When the transaction actually happened</AppText></View>
    <View style={styles.androidRow}>
      <DateButton icon="calendar-outline" label="Date" value={value.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} onPress={() => setPickerMode('date')} />
      <DateButton icon="time-outline" label="Time" value={value.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} onPress={() => setPickerMode('time')} />
    </View>
    {pickerMode && <DateTimePicker value={value} mode={pickerMode} display="default" onChange={change(pickerMode)} />}
  </View>;
}

function DateButton({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}><Ionicons name={icon} size={19} color={colors.slate} /><View style={styles.buttonText}><AppText variant="caption" style={styles.hint}>{label}</AppText><AppText variant="bodyMedium">{value}</AppText></View><Ionicons name="chevron-down" size={16} color={colors.slate} /></Pressable>;
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm }, label: { color: colors.slate }, hint: { color: colors.slate },
  iosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, iosControl: { minHeight: 52, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  androidRow: { flexDirection: 'row', gap: spacing.sm }, button: { minHeight: 58, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white }, buttonText: { flex: 1, gap: 2 }, pressed: { opacity: 0.72 },
});
