import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ChatComposer } from '@/components/ChatComposer';
import { BarList } from '@/components/charts';
import { Screen } from '@/components/Screen';
import { SpaceSelector } from '@/components/SpaceSelector';
import { TransactionRow } from '@/components/TransactionRow';
import { AppText, Avatar, Chip, IconCircle, SectionHeader, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { useAuth } from '@/context/AuthContext';
import { categoryTotals, monthToDateTotals, todayTotals, transactionsInSpace } from '@/services/analytics';
import { amountColor, colors, formatCompactPeso, formatPeso, radii, spacing } from '@/theme';

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1024;
  const { transactions, categories, selectedSpaceId } = useFinance();
  const { session } = useAuth();
  const fullName = typeof session?.user.user_metadata.full_name === 'string' && session.user.user_metadata.full_name.trim()
    ? session.user.user_metadata.full_name.trim()
    : session?.user.email?.split('@')[0] ?? 'there';
  const firstName = fullName.split(/\s+/)[0];
  const initials = fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const visibleTransactions = transactionsInSpace(transactions, selectedSpaceId);
  const today = todayTotals(visibleTransactions);
  const month = monthToDateTotals(visibleTransactions);
  const topCategories = categoryTotals(visibleTransactions, categories, new Date(), selectedSpaceId).slice(0, 4);
  const comparisonIsLower = (month.spendingChange ?? 0) <= 0;
  const formatNet = (amount: number, compact = false) => `${amount > 0 ? '+' : ''}${compact ? formatCompactPeso(amount) : formatPeso(amount)}`;
  const hero = <Surface style={[styles.hero, desktop && styles.desktopHero]}>
    <View style={styles.heroTop}><View><AppText variant="caption" style={styles.heroLabel}>TODAY</AppText><AppText variant="display" style={[styles.heroAmount, !today.spending && styles.heroNeutral]}>{formatPeso(today.spending)}</AppText><AppText style={styles.heroDescription}>Spent today</AppText></View><IconCircle name="today-outline" size={38} background="#23303B" color={colors.mint} /></View>
    <View style={styles.heroDivider} />
    <View style={styles.heroBottom}>
      <View><AppText variant="caption" style={styles.heroLabel}>RECEIVED</AppText><AppText variant="h3" style={[styles.heroValue, styles.heroIncome, !today.income && styles.heroNeutral]}>{formatPeso(today.income)}</AppText></View>
      <View style={styles.heroRight}><AppText variant="caption" style={styles.heroLabel}>NET CASH FLOW</AppText><AppText variant="h3" style={[styles.heroValue, { color: today.netCashFlow === 0 ? colors.white : amountColor(today.netCashFlow) }]}>{formatNet(today.netCashFlow)}</AppText></View>
    </View>
    <AppText variant="caption" style={styles.transactionCount}>{today.transactionCount ? `${today.transactionCount} ${today.transactionCount === 1 ? 'transaction' : 'transactions'} today` : 'Nothing recorded yet today.'}</AppText>
  </Surface>;
  const talk = <View style={[styles.talkSection, desktop && styles.desktopTalk]}>
    <View><AppText variant="h3">What happened with your money?</AppText><AppText style={styles.subtle}>Say it naturally. I’ll sort out the details.</AppText></View>
    <ChatComposer onSend={(message) => router.push({ pathname: '/(tabs)/add', params: { message } })} />
    <View style={styles.chips}><Chip label="Log an expense" icon="arrow-up-outline" onPress={() => router.push({ pathname: '/(tabs)/add', params: { message: 'Spent ' } })} /><Chip label="Add income" icon="arrow-down-outline" onPress={() => router.push({ pathname: '/(tabs)/add', params: { message: 'Received ' } })} /></View>
  </View>;
  const monthly = <View style={styles.section}>
    <SectionHeader title="This month" />
    <Surface style={styles.monthCard}>
      <View style={styles.monthMetrics}>
        <View style={styles.monthMetric}><AppText variant="caption" style={styles.monthLabel}>SPENT</AppText><AppText variant="bodyMedium" style={{ color: amountColor(-month.spending) }}>{formatCompactPeso(month.spending)}</AppText></View>
        <View style={styles.monthMetric}><AppText variant="caption" style={styles.monthLabel}>RECEIVED</AppText><AppText variant="bodyMedium" style={{ color: amountColor(month.income) }}>{formatCompactPeso(month.income)}</AppText></View>
        <View style={[styles.monthMetric, styles.monthMetricLast]}><AppText variant="caption" style={styles.monthLabel}>NET</AppText><AppText variant="bodyMedium" style={{ color: amountColor(month.netCashFlow) }}>{formatNet(month.netCashFlow, true)}</AppText></View>
      </View>
      {month.spendingChange !== null && month.comparisonLabel && <View style={[styles.monthComparison, comparisonIsLower ? styles.monthComparisonGood : styles.monthComparisonWarning]}><Ionicons name={comparisonIsLower ? 'arrow-down' : 'arrow-up'} size={13} color={comparisonIsLower ? colors.mintDeep : colors.danger} /><AppText variant="caption" style={{ color: comparisonIsLower ? colors.mintDeep : colors.danger }}>{Math.abs(month.spendingChange).toFixed(0)}% vs {month.comparisonLabel}</AppText></View>}
    </Surface>
  </View>;
  const category = <View style={styles.section}>
    <View style={styles.categoryHeader}><View><AppText variant="h3">Top categories</AppText><AppText variant="caption" style={styles.timeframe}>This month</AppText></View><AppText variant="bodyMedium" style={styles.analyticsAction} onPress={() => router.push('/(tabs)/analytics')}>See analytics</AppText></View>
    <Surface style={styles.categoryCard}>{topCategories.length ? <BarList items={topCategories} total={month.spending} /> : <AppText style={styles.emptyCardText}>No spending categories yet this month.</AppText>}</Surface>
  </View>;
  const recent = <View style={styles.section}><SectionHeader title="Recent activity" action="View all" onAction={() => router.push('/(tabs)/transactions')} /><Surface style={styles.listCard}>{visibleTransactions.length ? visibleTransactions.slice(0, 5).map((item, index) => <View key={item.id}>{index > 0 && <View style={styles.separator} />}<TransactionRow transaction={item} compact onPress={() => router.push(`/transaction/${item.id}`)} /></View>) : <AppText style={styles.emptyCardText}>Your recent activity will appear here.</AppText>}</Surface></View>;
  return (
    <Screen contentStyle={desktop ? styles.wideContent : undefined}>
      <View style={[styles.greeting, desktop && styles.desktopGreeting]}>
        <View><AppText style={styles.hello}>Good morning, {firstName} 👋</AppText><AppText variant="h2">Let’s make money simple.</AppText></View>
        <Avatar initials={initials} />
      </View>

      <SpaceSelector />

      {desktop ? <View style={styles.desktopGrid}><View style={styles.desktopMain}>{hero}{monthly}{recent}</View><View style={styles.desktopSide}>{talk}{category}</View></View> : <>{hero}{talk}{monthly}{category}{recent}</>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wideContent: { maxWidth: 1240 },
  greeting: { minHeight: 72, paddingTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg },
  desktopGreeting: { minHeight: 58, paddingTop: 0 },
  desktopGrid: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xxl },
  desktopMain: { flex: 1.55, minWidth: 0, gap: spacing.xxxl },
  desktopSide: { flex: 1, minWidth: 0, gap: spacing.xxxl },
  hello: { color: colors.slate, marginBottom: 2 },
  hero: { backgroundColor: colors.ink, borderColor: colors.ink, padding: spacing.xl, gap: spacing.md, overflow: 'hidden' },
  desktopHero: { padding: spacing.xxxl, minHeight: 246, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { color: '#9BA7B2', letterSpacing: 0.75 },
  heroAmount: { color: colors.expense, marginTop: spacing.xs },
  heroDescription: { color: colors.mintMist, marginTop: 1 },
  heroDivider: { height: 1, backgroundColor: '#2A3540' },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  heroRight: { alignItems: 'flex-end' },
  heroValue: { color: colors.white, marginTop: 2 },
  heroIncome: { color: colors.income },
  heroNeutral: { color: colors.white },
  transactionCount: { color: '#9BA7B2', marginTop: spacing.xs },
  talkSection: { gap: spacing.md },
  desktopTalk: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: spacing.xl },
  subtle: { color: colors.slate, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { gap: spacing.md },
  monthCard: { padding: spacing.lg, gap: spacing.md },
  monthMetrics: { flexDirection: 'row' },
  monthMetric: { flex: 1, gap: 2, borderRightWidth: 1, borderRightColor: colors.border, paddingRight: spacing.sm },
  monthMetricLast: { borderRightWidth: 0, paddingRight: 0, paddingLeft: spacing.sm },
  monthLabel: { color: colors.slate, letterSpacing: 0.6 },
  monthComparison: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  monthComparisonGood: { backgroundColor: colors.mintWash },
  monthComparisonWarning: { backgroundColor: colors.dangerWash },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeframe: { color: colors.slate, marginTop: 1 },
  analyticsAction: { color: colors.mintDeep },
  categoryCard: { padding: spacing.lg },
  listCard: { paddingHorizontal: spacing.lg },
  emptyCardText: { color: colors.slate, paddingVertical: spacing.sm },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 56 },
});
