import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@/theme';
import type { Space, TransactionType } from '@/types/finance';
import { AppText, Button } from './ui';

type ReconciliationFilter = 'all' | 'unreconciled' | 'reconciled';

interface TransactionFiltersSheetProps {
  visible: boolean;
  activeCount: number;
  thisMonth: boolean;
  spaces: Space[];
  selectedSpaceId: string | null;
  forVerificationOnly: boolean;
  verificationCount: number;
  reconciliationFilter: ReconciliationFilter;
  unreconciledCount: number;
  type: TransactionType | null;
  accountLabel: string;
  categoryLabel: string;
  categoryEnabled: boolean;
  onClose: () => void;
  onThisMonthChange: (value: boolean) => void;
  onSpaceChange: (id: string | null) => void;
  onVerificationChange: (value: boolean) => void;
  onReconciliationChange: (value: ReconciliationFilter) => void;
  onTypeChange: (value: TransactionType | null) => void;
  onChooseAccount: () => void;
  onChooseCategory: () => void;
  onReset: () => void;
}

function FilterPill({ label, selected, icon, onPress }: { label: string; selected: boolean; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.pill, selected && styles.pillSelected, pressed && styles.pressed]}>{icon && <Ionicons name={icon} size={15} color={selected ? colors.mintDeep : colors.slate} />}<AppText variant="caption" style={{ color: selected ? colors.mintDeep : colors.slateDark }}>{label}</AppText></Pressable>;
}

export function TransactionFiltersSheet({ visible, activeCount, thisMonth, spaces, selectedSpaceId, forVerificationOnly, verificationCount, reconciliationFilter, unreconciledCount, type, accountLabel, categoryLabel, categoryEnabled, onClose, onThisMonthChange, onSpaceChange, onVerificationChange, onReconciliationChange, onTypeChange, onChooseAccount, onChooseCategory, onReset }: TransactionFiltersSheetProps) {
  const activeSpaces = spaces.filter((space) => !space.isArchived).sort((left, right) => left.sortOrder - right.sortOrder);
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={styles.safe}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}><View><AppText variant="h3">Filters</AppText><AppText variant="caption" style={styles.muted}>{activeCount ? `${activeCount} active` : 'Refine this transaction list'}</AppText></View>{activeCount > 0 ? <Pressable hitSlop={10} onPress={onReset}><AppText variant="bodyMedium" style={styles.reset}>Reset</AppText></Pressable> : <Pressable hitSlop={10} onPress={onClose}><Ionicons name="close" size={23} color={colors.ink} /></Pressable>}</View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.section}><AppText variant="eyebrow" style={styles.label}>DATE</AppText><View style={styles.pills}><FilterPill label="All time" selected={!thisMonth} icon="calendar-clear-outline" onPress={() => onThisMonthChange(false)} /><FilterPill label="This month" selected={thisMonth} icon="calendar-outline" onPress={() => onThisMonthChange(true)} /></View></View>
            <View style={styles.section}><AppText variant="eyebrow" style={styles.label}>SPACE</AppText><View style={styles.pills}><FilterPill label="All Spaces" selected={!selectedSpaceId} icon="apps-outline" onPress={() => onSpaceChange(null)} />{activeSpaces.map((space) => <FilterPill key={space.id} label={space.name} selected={selectedSpaceId === space.id} icon={space.icon as keyof typeof Ionicons.glyphMap} onPress={() => onSpaceChange(space.id)} />)}</View></View>
            <View style={styles.section}><AppText variant="eyebrow" style={styles.label}>REVIEW STATUS</AppText><View style={styles.pills}><FilterPill label="All" selected={!forVerificationOnly} onPress={() => onVerificationChange(false)} /><FilterPill label={`For verification (${verificationCount})`} selected={forVerificationOnly} icon="help-circle-outline" onPress={() => onVerificationChange(true)} /></View></View>
            <View style={styles.section}><AppText variant="eyebrow" style={styles.label}>RECONCILIATION</AppText><View style={styles.pills}><FilterPill label="All" selected={reconciliationFilter === 'all'} onPress={() => onReconciliationChange('all')} /><FilterPill label={`Unreconciled (${unreconciledCount})`} selected={reconciliationFilter === 'unreconciled'} icon="ellipse-outline" onPress={() => onReconciliationChange('unreconciled')} /><FilterPill label="Reconciled" selected={reconciliationFilter === 'reconciled'} icon="checkmark-circle-outline" onPress={() => onReconciliationChange('reconciled')} /></View></View>
            <View style={styles.section}><AppText variant="eyebrow" style={styles.label}>OTHER TRANSACTION TYPES</AppText><View style={styles.pills}><FilterPill label="Card payment" selected={type === 'credit_card_payment'} icon="card-outline" onPress={() => onTypeChange(type === 'credit_card_payment' ? null : 'credit_card_payment')} /><FilterPill label="Refund" selected={type === 'refund'} icon="return-down-back-outline" onPress={() => onTypeChange(type === 'refund' ? null : 'refund')} /></View></View>
            <View style={styles.section}><AppText variant="eyebrow" style={styles.label}>ACCOUNT & CATEGORY</AppText><Pressable onPress={onChooseAccount} style={({ pressed }) => [styles.field, pressed && styles.pressed]}><View style={styles.fieldIcon}><Ionicons name="wallet-outline" size={18} color={colors.mintDeep} /></View><View style={styles.fieldCopy}><AppText variant="caption" style={styles.muted}>ACCOUNT</AppText><AppText variant="bodyMedium" numberOfLines={1}>{accountLabel}</AppText></View><Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable><Pressable disabled={!categoryEnabled} onPress={onChooseCategory} style={({ pressed }) => [styles.field, !categoryEnabled && styles.disabled, pressed && categoryEnabled && styles.pressed]}><View style={styles.fieldIcon}><Ionicons name="pricetag-outline" size={18} color={colors.mintDeep} /></View><View style={styles.fieldCopy}><AppText variant="caption" style={styles.muted}>CATEGORY</AppText><AppText variant="bodyMedium" numberOfLines={1}>{categoryLabel}</AppText></View><Ionicons name="chevron-forward" size={18} color={colors.slate} /></Pressable></View>
          </ScrollView>
          <Button label="Show transactions" icon="checkmark" onPress={onClose} />
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 25, 35, 0.3)' },
  safe: { width: '100%', maxHeight: '90%' },
  sheet: { flexShrink: 1, backgroundColor: colors.softWhite, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.md },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: spacing.sm, marginBottom: -spacing.xs },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  content: { gap: spacing.xl, paddingBottom: spacing.md },
  section: { gap: spacing.sm },
  label: { color: colors.slate },
  muted: { color: colors.slate },
  reset: { color: colors.mintDeep },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { minHeight: 38, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillSelected: { borderColor: colors.mintMist, backgroundColor: colors.mintWash },
  field: { minHeight: 58, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fieldIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.mintWash, alignItems: 'center', justifyContent: 'center' },
  fieldCopy: { flex: 1, minWidth: 0 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
