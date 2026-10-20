import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AnalyticsCustomRange, AnalyticsRangeKey } from '@/services/analytics';
import { colors, radii, spacing } from '@/theme';
import { AppText, Button } from './ui';

const options: { key: AnalyticsRangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'custom', label: 'Custom range' },
];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const sameDay = (left: Date | null, right: Date) => Boolean(left && left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate());
const formatDate = (date: Date | null) => date ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select a date';

interface AnalyticsRangeSheetProps {
  visible: boolean;
  selectedKey: AnalyticsRangeKey;
  customRange: AnalyticsCustomRange | null;
  onClose: () => void;
  onSelect: (key: AnalyticsRangeKey, customRange?: AnalyticsCustomRange) => void;
}

export function AnalyticsRangeSheet({ visible, selectedKey, customRange, onClose, onSelect }: AnalyticsRangeSheetProps) {
  const today = startOfDay(new Date());
  const fallbackStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [customMode, setCustomMode] = useState(false);
  const [draftStart, setDraftStart] = useState<Date | null>(customRange?.start ?? fallbackStart);
  const [draftEnd, setDraftEnd] = useState<Date | null>(customRange?.end ?? today);
  const [calendarMonth, setCalendarMonth] = useState(new Date((customRange?.end ?? today).getFullYear(), (customRange?.end ?? today).getMonth(), 1));

  const days = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const leadingDays = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - leadingDays);
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [calendarMonth]);

  const chooseDate = (date: Date) => {
    if (date > today) return;
    if (!draftStart || draftEnd) {
      setDraftStart(date);
      setDraftEnd(null);
      return;
    }
    if (date < draftStart) {
      setDraftStart(date);
      setDraftEnd(draftStart);
      return;
    }
    setDraftEnd(date);
  };

  const inDraftRange = (date: Date) => Boolean(draftStart && draftEnd && date >= draftStart && date <= draftEnd);
  const applyCustomRange = () => {
    if (!draftStart || !draftEnd) return;
    setCustomMode(false);
    onSelect('custom', { start: draftStart, end: draftEnd });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.safe}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {customMode ? (
              <>
                <View style={styles.sheetHeader}><Pressable hitSlop={10} onPress={() => setCustomMode(false)}><Ionicons name="chevron-back" size={24} color={colors.ink} /></Pressable><AppText variant="h3">Custom range</AppText><View style={styles.headerSpacer} /></View>
                <View style={styles.selectedDates}><View style={styles.selectedDate}><AppText variant="caption" style={styles.dateLabel}>START</AppText><AppText variant="bodyMedium">{formatDate(draftStart)}</AppText></View><Ionicons name="arrow-forward" size={18} color={colors.slate} /><View style={styles.selectedDate}><AppText variant="caption" style={styles.dateLabel}>END</AppText><AppText variant="bodyMedium">{formatDate(draftEnd)}</AppText></View></View>
                <View style={styles.calendarHeader}><Pressable hitSlop={10} onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={20} color={colors.ink} /></Pressable><AppText variant="bodyMedium">{calendarMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</AppText><Pressable hitSlop={10} onPress={() => { const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); if (next <= new Date(today.getFullYear(), today.getMonth(), 1)) setCalendarMonth(next); }}><Ionicons name="chevron-forward" size={20} color={calendarMonth >= new Date(today.getFullYear(), today.getMonth(), 1) ? colors.borderStrong : colors.ink} /></Pressable></View>
                <View style={styles.weekdays}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <AppText key={`${day}-${index}`} variant="caption" style={styles.weekday}>{day}</AppText>)}</View>
                <View style={styles.calendar}>{days.map((date) => {
                  const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                  const disabled = date > today;
                  const selected = sameDay(draftStart, date) || sameDay(draftEnd, date);
                  return <Pressable key={date.toISOString()} disabled={disabled} onPress={() => chooseDate(date)} style={[styles.day, inDraftRange(date) && styles.dayInRange, selected && styles.daySelected]}><AppText variant="caption" style={[styles.dayText, !isCurrentMonth && styles.dayMuted, disabled && styles.dayDisabled, selected && styles.daySelectedText]}>{date.getDate()}</AppText></Pressable>;
                })}</View>
                <Button label={draftStart && draftEnd ? 'Apply range' : 'Choose an end date'} disabled={!draftStart || !draftEnd} onPress={applyCustomRange} />
              </>
            ) : (
              <>
                <View style={styles.sheetHeader}><View style={styles.headerSpacer} /><AppText variant="h3">Report period</AppText><Pressable hitSlop={10} onPress={onClose}><Ionicons name="close" size={23} color={colors.ink} /></Pressable></View>
                <View style={styles.optionList}>{options.map((option) => <Pressable key={option.key} onPress={() => { if (option.key === 'custom') { setCustomMode(true); return; } setCustomMode(false); onSelect(option.key); }} style={({ pressed }) => [styles.option, (selectedKey === option.key) && styles.optionSelected, pressed && styles.optionPressed]}><AppText variant="bodyMedium" style={selectedKey === option.key ? styles.optionSelectedText : undefined}>{option.label}</AppText>{selectedKey === option.key && <Ionicons name="checkmark" size={20} color={colors.mintDeep} />}</Pressable>)}</View>
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 25, 35, 0.28)' },
  safe: { width: '100%' },
  sheet: { backgroundColor: colors.softWhite, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.lg },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: spacing.sm, marginBottom: -spacing.sm },
  sheetHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 24 },
  optionList: { gap: spacing.xs },
  option: { minHeight: 50, borderRadius: radii.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionSelected: { backgroundColor: colors.mintWash },
  optionSelectedText: { color: colors.mintDeep },
  optionPressed: { opacity: 0.7 },
  selectedDates: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  selectedDate: { flex: 1, gap: 2 },
  dateLabel: { color: colors.slate, letterSpacing: 0.6 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs },
  weekdays: { flexDirection: 'row' },
  weekday: { width: '14.2857%', textAlign: 'center', color: colors.slate },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  dayInRange: { backgroundColor: colors.mintWash },
  daySelected: { backgroundColor: colors.mint },
  dayText: { color: colors.ink },
  dayMuted: { color: colors.borderStrong },
  dayDisabled: { color: colors.border },
  daySelectedText: { color: colors.ink },
});
