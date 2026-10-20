import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing, typography } from '@/theme';
import { AppText, Button } from './ui';

export interface SmartSelectOption {
  id: string;
  label: string;
  parentId?: string | null;
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
  hierarchical?: boolean;
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

export function SmartSelectSheet({ visible, title, options, selectedIds, onClose, onSelect, multiple = false, hierarchical = false, searchPlaceholder = 'Search', emptyText = 'No matches found' }: SmartSelectSheetProps) {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 700;
  const [query, setQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const close = () => { setQuery(''); setExpandedIds(new Set()); onClose(); };
  const searching = query.trim().length > 0;
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized) return options.filter((option) => `${option.label} ${option.detail ?? ''} ${option.searchText ?? ''}`.toLocaleLowerCase().includes(normalized)).map((option) => ({ option, depth: 0, childCount: 0 }));
    if (!hierarchical) return options.map((option) => ({ option, depth: 0, childCount: 0 }));
    const byId = new Map(options.map((option) => [option.id, option]));
    const children = new Map<string, SmartSelectOption[]>();
    options.forEach((option) => {
      if (option.parentId && byId.has(option.parentId)) children.set(option.parentId, [...(children.get(option.parentId) ?? []), option]);
    });
    const rows: { option: SmartSelectOption; depth: number; childCount: number }[] = [];
    const seen = new Set<string>();
    const addBranch = (option: SmartSelectOption, depth: number) => {
      if (seen.has(option.id)) return;
      seen.add(option.id);
      const childOptions = children.get(option.id) ?? [];
      rows.push({ option, depth, childCount: childOptions.length });
      if (expandedIds.has(option.id)) childOptions.forEach((child) => addBranch(child, depth + 1));
    };
    options.filter((option) => !option.parentId || !byId.has(option.parentId)).forEach((option) => addBranch(option, 0));
    return rows;
  }, [expandedIds, hierarchical, options, query]);
  const choose = (id: string) => { onSelect(id); if (!multiple) close(); };

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
              {visibleOptions.map(({ option, depth, childCount }) => {
                const selected = selectedIds.includes(option.id);
                const hasChildren = childCount > 0;
                const expanded = expandedIds.has(option.id);
                return (
                  <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={hasChildren && !searching ? `${option.label}, ${expanded ? 'collapse' : 'expand'} subcategories` : `Choose ${option.label}`} accessibilityState={hasChildren && !searching ? { expanded } : { selected }} onPress={() => hasChildren && !searching ? setExpandedIds((current) => { const next = new Set(current); if (next.has(option.id)) next.delete(option.id); else next.add(option.id); return next; }) : choose(option.id)} style={({ pressed }) => [styles.option, selected && styles.optionSelected, hierarchical && !searching && { paddingLeft: spacing.md + Math.min(depth, 4) * spacing.lg }, pressed && styles.pressed]}>
                    <View style={[styles.dot, { backgroundColor: option.color ?? colors.mintWash }]} />
                    <View style={styles.optionCopy}>
                      <View style={styles.optionTitleRow}><AppText variant="bodyMedium" numberOfLines={1} style={styles.optionTitle}>{option.label}</AppText>{option.badge ? <AppText variant="caption" style={styles.badge}>{option.badge}</AppText> : null}</View>
                      {hasChildren && !searching ? <AppText variant="caption" style={styles.optionDetail}>{childCount} {childCount === 1 ? 'subcategory' : 'subcategories'}</AppText> : option.detail && (!hierarchical || searching || depth >= 4) ? <AppText variant="caption" numberOfLines={1} style={styles.optionDetail}>{option.detail}</AppText> : null}
                    </View>
                    {hasChildren && !searching ? <View style={styles.parentActions}><Pressable accessibilityRole="button" accessibilityLabel={`Choose ${option.label} directly`} onPress={(event) => { event.stopPropagation(); choose(option.id); }} style={styles.chooseParent}><AppText variant="caption" style={styles.chooseParentText}>{selected ? 'Selected' : 'Choose'}</AppText></Pressable><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.slate} /></View> : selected ? <Ionicons name={multiple ? 'checkmark-circle' : 'checkmark'} size={20} color={colors.mintDeep} /> : null}
                  </Pressable>
                );
              })}
              {!visibleOptions.length && <View style={styles.empty}><Ionicons name="search-outline" size={26} color={colors.slate} /><AppText style={styles.optionDetail}>{emptyText}</AppText></View>}
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
  parentActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chooseParent: { minHeight: 34, paddingHorizontal: spacing.sm, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white, justifyContent: 'center' },
  chooseParentText: { color: colors.mintDeep },
  optionDetail: { color: colors.slate },
  badge: { color: colors.mintDeep, backgroundColor: colors.mintMist, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.huge },
  pressed: { opacity: 0.72 },
});
