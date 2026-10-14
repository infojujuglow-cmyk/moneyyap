import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@/theme';
import { AppText, Button } from './ui';

export interface SmartSelectOption {
  id: string;
  label: string;
  detail?: string;
  searchText?: string;
  color?: string;
  badge?: string;
}

interface SmartSelectSheetProps {
  visible: boolean;
  title: string;
  options: SmartSelectOption[];
  selectedIds: string[];
  onClose: () => void;
  onSelect: (id: string) => void;
  multiple?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}

export function SmartSelectField({ label, value, placeholder, onPress, hint, error }: {
  label: string;
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  hint?: string | null;
  error?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <AppText variant="eyebrow" style={styles.fieldLabel}>{label}</AppText>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.field, error && styles.fieldError, pressed && styles.pressed]}>
        <AppText variant="bodyMedium" numberOfLines={1} style={[styles.fieldValue, !value && styles.placeholder]}>{value || placeholder}</AppText>
        <Ionicons name="chevron-down" size={18} color={colors.slate} />
      </Pressable>
      {hint ? <AppText variant="caption" style={styles.hint}>{hint}</AppText> : null}
    </View>
  );
}

export function SmartSelectSheet({ visible, title, options, selectedIds, onClose, onSelect, multiple = false, searchPlaceholder = 'Search', emptyText = 'No matches found' }: SmartSelectSheetProps) {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 700;
  const [query, setQuery] = useState('');
  const close = () => { setQuery(''); onClose(); };
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return options;
    return options.filter((option) => `${option.label} ${option.detail ?? ''} ${option.searchText ?? ''}`.toLocaleLowerCase().includes(normalized));
  }, [options, query]);

  return (
    <Modal visible={visible} transparent animationType={desktop ? 'fade' : 'slide'} onRequestClose={close}>
      <View style={[styles.overlay, desktop && styles.overlayDesktop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <SafeAreaView edges={desktop ? [] : ['bottom']} style={[styles.safe, desktop && styles.safeDesktop]}>
          <View style={[styles.sheet, desktop && styles.sheetDesktop]}>
            {!desktop && <View style={styles.handle} />}
            <View style={styles.header}>
              <AppText variant="h3">{title}</AppText>
              <Pressable accessibilityLabel="Close" hitSlop={10} onPress={close}><Ionicons name="close" size={23} color={colors.ink} /></Pressable>
            </View>
            <View style={styles.search}>
              <Ionicons name="search" size={19} color={colors.slate} />
              <TextInput autoFocus={desktop} value={query} onChangeText={setQuery} placeholder={searchPlaceholder} placeholderTextColor={colors.slate} style={styles.searchInput} />
              {query ? <Pressable hitSlop={8} onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.slate} /></Pressable> : null}
            </View>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
              {filtered.map((option) => {
                const selected = selectedIds.includes(option.id);
                return (
                  <Pressable key={option.id} onPress={() => { onSelect(option.id); if (!multiple) close(); }} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}>
                    <View style={[styles.dot, { backgroundColor: option.color ?? colors.mintWash }]} />
                    <View style={styles.optionCopy}>
                      <View style={styles.optionTitleRow}><AppText variant="bodyMedium" numberOfLines={1} style={styles.optionTitle}>{option.label}</AppText>{option.badge ? <AppText variant="caption" style={styles.badge}>{option.badge}</AppText> : null}</View>
                      {option.detail ? <AppText variant="caption" numberOfLines={1} style={styles.optionDetail}>{option.detail}</AppText> : null}
                    </View>
                    {selected && <Ionicons name={multiple ? 'checkmark-circle' : 'checkmark'} size={20} color={colors.mintDeep} />}
                  </Pressable>
                );
              })}
              {!filtered.length && <View style={styles.empty}><Ionicons name="search-outline" size={26} color={colors.slate} /><AppText style={styles.optionDetail}>{emptyText}</AppText></View>}
            </ScrollView>
            {multiple && <Button label="Done" onPress={close} />}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { gap: spacing.sm },
  fieldLabel: { color: colors.slate },
  field: { minHeight: 56, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  fieldError: { borderColor: colors.danger },
  fieldValue: { flex: 1 },
  placeholder: { color: colors.slate },
  hint: { color: colors.mintDeep },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 25, 35, 0.32)' },
  overlayDesktop: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  safe: { width: '100%', maxHeight: '86%' },
  safeDesktop: { width: 500, maxHeight: 620 },
  sheet: { flexShrink: 1, backgroundColor: colors.softWhite, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.md },
  sheetDesktop: { borderRadius: radii.xl, borderWidth: 1, borderColor: colors.border, paddingTop: spacing.md },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: spacing.sm, marginBottom: -spacing.sm },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, minHeight: 46, fontFamily: typography.regular, fontSize: 16, color: colors.ink, outlineStyle: 'none' } as never,
  list: { flexShrink: 1 },
  listContent: { gap: spacing.xs, paddingBottom: spacing.sm },
  option: { minHeight: 58, borderRadius: radii.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optionSelected: { backgroundColor: colors.mintWash },
  dot: { width: 34, height: 34, borderRadius: 12 },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionTitle: { flexShrink: 1 },
  optionDetail: { color: colors.slate },
  badge: { color: colors.mintDeep, backgroundColor: colors.mintMist, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.huge },
  pressed: { opacity: 0.72 },
});
