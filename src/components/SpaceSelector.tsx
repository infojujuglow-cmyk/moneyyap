import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet } from 'react-native';
import { useFinance } from '@/context/FinanceContext';
import { spacing } from '@/theme';
import { Chip } from './ui';

export function SpaceSelector({ includeAll = true }: { includeAll?: boolean }) {
  const { spaces, selectedSpaceId, setSelectedSpaceId } = useFinance();
  const active = spaces.filter((item) => !item.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityLabel="Space filter">
      {includeAll && <Chip label="All Spaces" icon="apps-outline" selected={selectedSpaceId === null} onPress={() => setSelectedSpaceId(null)} />}
      {active.map((space) => <Chip key={space.id} label={space.name} icon={space.icon as keyof typeof Ionicons.glyphMap} selected={selectedSpaceId === space.id} onPress={() => setSelectedSpaceId(space.id)} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ row: { gap: spacing.sm, paddingRight: spacing.xl } });
