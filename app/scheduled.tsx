import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { createElement, useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog';
import { Screen } from '@/components/Screen';
import { SpaceSelector } from '@/components/SpaceSelector';
import { SmartSelectField, SmartSelectSheet, type SmartSelectOption } from '@/components/SmartSelectSheet';
import { AppText, Button, Chip, EmptyState, Surface } from '@/components/ui';
import { useFinance } from '@/context/FinanceContext';
import { useScheduledData } from '@/hooks/useScheduledData';
import { createSchedule, editScheduleFuture, ensureOccurrence, markReminderRead, noonInTimezone, plusDays, projectedOccurrences, projectedTotals, recordOccurrence, setScheduleStatus, todayInTimezone, updateOccurrence, type ScheduledOccurrence, type Schedule, type ScheduleFrequency, type ScheduledType } from '@/services/scheduled';
import { colors, formatPeso, radii, spacing, typography } from '@/theme';
import type { Account, Category } from '@/types/finance';

type Tab = 'upcoming' | 'today' | 'overdue' | 'history';
type Range = 'week' | 'month' | '30days' | 'all';
type Editor = 'create' | 'occurrence' | 'future' | 'record';
type Picker = 'space' | 'from' | 'to' | 'category' | null;
type Item = ReturnType<typeof projectedOccurrences>[number];
type Form = {
  name: string; type: ScheduledType; amount: string; frequency: ScheduleFrequency; startsOn: string; endsOn: string;
  maxOccurrences: string; anchorDay: string; lastDay: boolean; spaceId: string; fromId: string; toId: string;
  categoryId: string; notes: string; mode: 'manual' | 'auto'; reminders: number[];
};
const frequencies: { value: ScheduleFrequency; label: string }[] = [
  { value: 'once', label: 'One-time' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' }, { value: 'semiannual', label: 'Every 6 months' }, { value: 'yearly', label: 'Yearly' },
];
const typeLabels: Record<ScheduledType, string> = { expense: 'Expense', income: 'Income', transfer: 'Internal transfer', credit_card_payment: 'Card payment' };
const dateLabel = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const initialForm = (spaceId: string, today: string): Form => ({
  name: '', type: 'expense', amount: '', frequency: 'once', startsOn: today, endsOn: '', maxOccurrences: '',
  anchorDay: String(Number(today.slice(-2))), lastDay: false, spaceId, fromId: '', toId: '', categoryId: '',
  notes: '', mode: 'manual', reminders: [0, 1],
});
const formFor = (schedule: Schedule, dueOn: string): Form => ({
  name: schedule.name, type: schedule.type, amount: String(schedule.amount), frequency: schedule.frequency,
  startsOn: dueOn, endsOn: schedule.ends_on ?? '', maxOccurrences: schedule.max_occurrences ? String(schedule.max_occurrences) : '',
  anchorDay: String(schedule.anchor_day ?? Number(dueOn.slice(-2))), lastDay: schedule.last_day_of_month,
  spaceId: schedule.space_id, fromId: schedule.account_from_id ?? '', toId: schedule.account_to_id ?? '',
  categoryId: schedule.category_id ?? '', notes: schedule.notes ?? '', mode: schedule.recording_mode, reminders: schedule.reminder_days,
});
const matchingTransactions = (item: Item, transactions: ReturnType<typeof useFinance>['transactions']) =>
  transactions.filter((transaction) => transaction.spaceId === item.schedule.space_id && transaction.type === item.schedule.type &&
    Math.abs(transaction.amount - (item.occurrence?.amount_override ?? item.schedule.amount)) < 0.01 &&
    Math.abs(new Date(transaction.transactionDate).getTime() - new Date(item.dueOn + 'T12:00:00').getTime()) <= 7 * 86400000 &&
    transaction.accountFromId === (item.occurrence?.account_from_override ?? item.schedule.account_from_id) &&
    transaction.accountToId === (item.occurrence?.account_to_override ?? item.schedule.account_to_id)).slice(0, 5);

export default function ScheduledScreen() {
  const params = useLocalSearchParams<{ draft?: string }>();
  const { accounts, categories, spaces, selectedSpaceId, workspaceId, transactions, refreshFinance } = useFinance();
  const { data, loading, error, reload } = useScheduledData(workspaceId);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [range, setRange] = useState<Range>('30days');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [target, setTarget] = useState<Item | null>(null);
  const [form, setForm] = useState<Form>(() => initialForm(selectedSpaceId ?? '', todayInTimezone('Asia/Manila')));
  const [picker, setPicker] = useState<Picker>(null);
  const [datePicker, setDatePicker] = useState<'startsOn' | 'endsOn' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [historyScheduleId, setHistoryScheduleId] = useState<string | null>(null);
  useEffect(() => {
    if (!params.draft) return;
    const task = setTimeout(() => {
      try {
        const draft = JSON.parse(params.draft!) as Record<string, unknown>;
        const start = typeof draft.starts_on === 'string' ? draft.starts_on : todayInTimezone('Asia/Manila');
        const base = initialForm(typeof draft.space_id === 'string' ? draft.space_id : selectedSpaceId ?? '', start);
        setForm({ ...base, name: typeof draft.name === 'string' ? draft.name : '', type: ['expense','income','transfer','credit_card_payment'].includes(String(draft.type)) ? draft.type as ScheduledType : 'expense', amount: draft.amount ? String(draft.amount) : '', frequency: frequencies.some((entry) => entry.value === draft.frequency) ? draft.frequency as ScheduleFrequency : 'once', anchorDay: String(draft.anchor_day ?? start.slice(-2)) });
        setEditor('create'); router.setParams({ draft: undefined });
      } catch { setActionError('Could not read the suggested schedule.'); }
    }, 0);
    return () => clearTimeout(task);
  }, [params.draft, selectedSpaceId]);
  const timezone = data?.timezone ?? 'Asia/Manila';
  const today = todayInTimezone(timezone);
  const horizon = plusDays(today, 366);
  const scopeSchedules = (data?.schedules ?? []).filter((schedule) => !selectedSpaceId || schedule.space_id === selectedSpaceId);
  const all = scopeSchedules.flatMap((schedule) => projectedOccurrences(schedule, data?.occurrences ?? [], horizon)).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const upcoming = all.filter((item) => item.status === 'pending' && item.schedule.status === 'active' && item.dueOn > today);
  const due = all.filter((item) => item.status === 'pending' && item.schedule.status === 'active' && item.dueOn === today);
  const overdue = all.filter((item) => item.status === 'pending' && item.schedule.status === 'active' && item.dueOn < today);
  const history = all.filter((item) => item.status !== 'pending' && (!historyScheduleId || item.schedule.id === historyScheduleId));
  const rangeEnd = range === 'week' ? plusDays(today, 7) : range === '30days' ? plusDays(today, 30) : range === 'month' ? new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10) : horizon;
  const visible = tab === 'upcoming' ? upcoming.filter((item) => item.dueOn <= rangeEnd) : tab === 'today' ? due : tab === 'overdue' ? overdue : history;
  const totals = projectedTotals(all, today, plusDays(today, 30));
  const unread = (data?.reminders ?? []).filter((reminder) => !reminder.read_at && (!selectedSpaceId || data?.schedules.find((schedule) => schedule.id === data.occurrences.find((occurrence) => occurrence.id === reminder.occurrence_id)?.schedule_id)?.space_id === selectedSpaceId));
  const activeAccounts = accounts.filter((account) => account.isActive && (!form.spaceId || !account.spaceId || account.spaceId === form.spaceId));
  const fromAccounts = activeAccounts.filter((account) => form.type !== 'credit_card_payment' || account.type !== 'credit_card');
  const toAccounts = activeAccounts.filter((account) => form.type !== 'credit_card_payment' || account.type === 'credit_card').filter((account) => account.id !== form.fromId);
  const allowedCategories = categories.filter((category) => category.spaceId === form.spaceId && category.type === form.type && !category.isArchived);
  const accountOptions = (items: Account[]): SmartSelectOption[] => items.map((account) => ({ id: account.id, label: account.name, detail: account.institution ?? account.type, group: account.institution ?? 'Other accounts', color: account.accent }));
  const categoryOptions: SmartSelectOption[] = allowedCategories.map((category: Category) => ({ id: category.id, label: category.name, parentId: category.parentId, color: category.color }));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const openCreate = () => { setForm(initialForm(selectedSpaceId ?? spaces.find((space) => !space.isArchived)?.id ?? '', today)); setTarget(null); setEditor('create'); setActionError(null); };
  const openItem = async (item: Item, kind: Editor) => {
    setActionError(null);
    try {
      const occurrence: ScheduledOccurrence = item.occurrence ?? { id: await ensureOccurrence(item.schedule.id, item.number), schedule_id: item.schedule.id, occurrence_number: item.number, original_due_on: item.dueOn, due_on: item.dueOn, status: 'pending', amount_override: null, account_from_override: null, account_to_override: null, category_override: null, notes_override: null, transaction_id: null, recorded_at: null, recorded_automatically: false };
      const base = formFor(item.schedule, item.dueOn);
      setTarget({ ...item, occurrence });
      setForm(kind === 'future'
        ? { ...base, maxOccurrences: item.schedule.max_occurrences ? String(item.schedule.max_occurrences - item.number + 1) : '' }
        : { ...base, amount: String(occurrence.amount_override ?? item.schedule.amount), fromId: occurrence.account_from_override ?? base.fromId,
            toId: occurrence.account_to_override ?? base.toId, categoryId: occurrence.category_override ?? base.categoryId,
            notes: occurrence.notes_override ?? base.notes, startsOn: kind === 'record' ? today : occurrence.due_on });
      setLinkId(null); setEditor(kind);
      if (!item.occurrence) void reload();
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Could not open the occurrence.'); }
  };
  const act = async (task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setActionError(null);
    try { await task(); await Promise.all([reload(), refreshFinance()]); setEditor(null); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Could not save this change.'); }
    finally { setBusy(false); }
  };
  const submit = () => void act(async () => {
    const amount = Number(form.amount);
    if (!form.name.trim() || !Number.isFinite(amount) || amount <= 0 || !form.spaceId || !/^\d{4}-\d{2}-\d{2}$/.test(form.startsOn)) throw new Error('Enter a name, amount, Space, and valid date.');
    if (form.type === 'income' ? !form.toId : !form.fromId) throw new Error('Choose an account.');
    if ((form.type === 'transfer' || form.type === 'credit_card_payment') && (!form.toId || form.toId === form.fromId)) throw new Error('Choose a different destination account.');
    if (editor === 'record' && target?.occurrence) {
      await recordOccurrence(target.occurrence.id, linkId ? { existingTransactionId: linkId } : { amount, fromId: form.fromId || null, toId: form.toId || null, categoryId: form.categoryId || null, when: noonInTimezone(form.startsOn, timezone) });
      return;
    }
    if (editor === 'occurrence' && target?.occurrence) {
      await updateOccurrence(target.occurrence.id, { due_on: form.startsOn, amount_override: amount, account_from_override: form.fromId || null, account_to_override: form.toId || null, category_override: form.categoryId || null, notes_override: form.notes || null, status: 'pending' });
      return;
    }
    if (editor === 'future' && target?.occurrence) {
      await editScheduleFuture(target.occurrence.id, { name: form.name.trim(), type: form.type, amount, frequency: form.frequency, starts_on: form.startsOn, ends_on: form.endsOn || null, max_occurrences: form.maxOccurrences ? Number(form.maxOccurrences) : null, anchor_day: Number(form.anchorDay), last_day_of_month: form.lastDay, account_from_id: form.fromId || null, account_to_id: form.toId || null, category_id: form.categoryId || null, notes: form.notes || null, recording_mode: form.mode, reminder_days: form.reminders });
      return;
    }
    if (!workspaceId) throw new Error('Choose a workspace.');
    const creator = (await import('@/lib/supabase')).supabase?.auth.getUser();
    const user = (await creator)?.data.user;
    if (!user) throw new Error('Sign in first.');
    await createSchedule({ workspace_id: workspaceId, space_id: form.spaceId, created_by: user.id, name: form.name.trim(),
      type: form.type, amount, currency: spaces.find((space) => space.id === form.spaceId)?.currency ?? 'PHP',
      account_from_id: form.type === 'income' ? null : form.fromId, account_to_id: form.type === 'expense' ? null : form.toId,
      category_id: form.type === 'expense' || form.type === 'income' ? form.categoryId || null : null, notes: form.notes.trim() || null,
      frequency: form.frequency, starts_on: form.startsOn, ends_on: form.endsOn || null, max_occurrences: form.frequency === 'once' ? 1 : form.maxOccurrences ? Number(form.maxOccurrences) : null,
      anchor_day: Number(form.anchorDay), last_day_of_month: form.lastDay, timezone, recording_mode: form.mode, reminder_days: form.reminders });
  });
  const matches = target && editor === 'record' ? matchingTransactions(target, transactions) : [];
  const selectOption = (id: string) => {
    if (picker === 'space') setForm((current) => ({ ...current, spaceId: id, fromId: '', toId: '', categoryId: '' }));
    if (picker === 'from') set('fromId', id);
    if (picker === 'to') set('toId', id);
    if (picker === 'category') set('categoryId', id === '__none__' ? '' : id);
  };
  const dateField = (key: 'startsOn' | 'endsOn', label: string) => <View style={styles.field}><AppText variant="eyebrow" style={styles.muted}>{label}</AppText>{Platform.OS === 'web'
    ? createElement('input', { type: 'date', value: form[key], onChange: (event: ChangeEvent<HTMLInputElement>) => set(key, event.target.value), style: webDateInputStyle, 'aria-label': label })
    : <><Pressable onPress={() => setDatePicker(key)} style={styles.dateButton}><Ionicons name="calendar-outline" size={18} color={colors.mintDeep} /><AppText>{form[key] ? dateLabel(form[key]) : 'Choose date'}</AppText></Pressable>{datePicker === key && <DateTimePicker value={new Date((form[key] || today) + 'T12:00:00')} mode="date" display="default" onChange={(_event, value) => { if (Platform.OS === 'android') setDatePicker(null); if (value) set(key, value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0')); }} />}</>}</View>;
  const textField = (key: 'name' | 'amount' | 'maxOccurrences' | 'anchorDay' | 'notes', label: string, numeric = false) =>
    <View style={styles.field}><AppText variant="eyebrow" style={styles.muted}>{label}</AppText><TextInput value={form[key]} onChangeText={(value) => set(key, value)} keyboardType={numeric ? 'decimal-pad' : 'default'} style={[styles.input, key === 'notes' && styles.notes]} multiline={key === 'notes'} placeholder={label} /></View>;
  return <Screen title="Scheduled" subtitle="Plan money movements, then record them when they happen" right={<Button label="New schedule" icon="add" onPress={openCreate} />} contentStyle={styles.content}>
    <SpaceSelector />
    <View style={styles.summary}><Surface style={styles.summaryCard}><AppText variant="caption" style={styles.muted}>NEXT 30 DAYS · EXPENSES</AppText><AppText variant="h2" style={{ color: colors.expense }}>{formatPeso(totals.expenses)}</AppText></Surface><Surface style={styles.summaryCard}><AppText variant="caption" style={styles.muted}>UPCOMING INCOME</AppText><AppText variant="h2" style={{ color: colors.income }}>{formatPeso(totals.income)}</AppText></Surface><Surface style={styles.summaryCard}><AppText variant="caption" style={styles.muted}>OVERDUE</AppText><AppText variant="h2">{overdue.length}</AppText></Surface></View>
    {unread.length > 0 && <Surface style={styles.reminderPanel}><AppText variant="h3">Reminders ({unread.length})</AppText>{unread.slice(0, 3).map((reminder) => { const occurrence = data?.occurrences.find((item) => item.id === reminder.occurrence_id); const schedule = data?.schedules.find((item) => item.id === occurrence?.schedule_id); return <Pressable key={reminder.id} onPress={() => void act(async () => { await markReminderRead(reminder.id); })} style={styles.row}><Ionicons name="notifications-outline" size={18} color={colors.mintDeep} /><AppText style={styles.flex}>{schedule?.name ?? 'Scheduled transaction'} · {reminder.days_before === 0 ? 'Due today' : reminder.days_before === -1 ? 'Recorded in MoneyYap' : `Due in ${reminder.days_before} days`}</AppText><AppText variant="caption" style={styles.muted}>Mark read</AppText></Pressable>; })}</Surface>}
    <View style={styles.tabs}>{([['upcoming','Upcoming'],['today','Due today'],['overdue','Overdue'],['history','History']] as const).map(([key,label]) => <Chip key={key} label={label} selected={tab === key} onPress={() => { setTab(key); if (key !== 'history') setHistoryScheduleId(null); }} />)}</View>
    {tab === 'upcoming' && <View style={styles.tabs}>{([['week','This week'],['month','This month'],['30days','Next 30 days'],['all','All']] as const).map(([key,label]) => <Chip key={key} label={label} selected={range === key} onPress={() => setRange(key)} />)}</View>}
    {loading ? <ActivityIndicator color={colors.mintDeep} /> : error ? <Surface><AppText style={{ color: colors.expense }}>{error}</AppText><Button label="Retry" onPress={() => void reload()} /></Surface> : visible.length ? <View style={styles.list}>{visible.map((item) => { const account = accounts.find((entry) => entry.id === (item.occurrence?.account_from_override ?? item.schedule.account_from_id ?? item.schedule.account_to_id)); const dueState = item.dueOn < today ? 'Overdue' : item.dueOn === today ? 'Due today' : dateLabel(item.dueOn); return <Surface key={item.schedule.id + ':' + item.number} style={styles.card}><View style={styles.row}><View style={styles.icon}><Ionicons name={item.schedule.type === 'income' ? 'arrow-down' : item.schedule.type === 'expense' ? 'arrow-up' : 'swap-horizontal'} size={19} color={item.schedule.type === 'income' ? colors.income : item.schedule.type === 'expense' ? colors.expense : colors.mintDeep} /></View><View style={styles.flex}><AppText variant="bodyMedium">{item.schedule.name}</AppText><AppText variant="caption" style={styles.muted}>{account?.institution ? account.institution + ' · ' : ''}{account?.name ?? 'Account'} · {typeLabels[item.schedule.type]}</AppText></View><AppText variant="bodyMedium" style={{ color: item.schedule.type === 'income' ? colors.income : item.schedule.type === 'expense' ? colors.expense : colors.ink }}>{formatPeso(item.occurrence?.amount_override ?? item.schedule.amount)}</AppText></View><View style={styles.row}><AppText variant="caption" style={{ color: item.dueOn < today ? colors.expense : colors.slateDark }}>{dueState}</AppText><AppText variant="caption" style={styles.muted}>{frequencies.find((entry) => entry.value === item.schedule.frequency)?.label} · {item.schedule.recording_mode === 'auto' ? 'Auto-record' : 'Manual'} · {item.status === 'pending' ? item.schedule.status : item.status}</AppText></View><View style={styles.actions}>{item.status === 'pending' && item.schedule.status === 'active' && <><Button label="Record Now" onPress={() => openItem(item, 'record')} /><Button label="Edit" variant="secondary" onPress={() => openItem(item, 'occurrence')} /><Button label="Skip" variant="ghost" onPress={() => void act(async () => updateOccurrence(item.occurrence?.id ?? await ensureOccurrence(item.schedule.id, item.number), { status: 'skipped' }))} /></>}{item.status === 'recorded' && item.occurrence?.transaction_id && <Button label="View transaction" variant="secondary" onPress={() => router.push(`/transaction/${item.occurrence?.transaction_id}`)} />}{item.status === 'pending' && item.schedule.status === 'active' && item.schedule.frequency !== 'once' && <Button label="Edit future" variant="ghost" onPress={() => openItem(item, 'future')} />}<Button label="History" variant="ghost" onPress={() => { setHistoryScheduleId(item.schedule.id); setTab('history'); }} />{item.schedule.status !== 'cancelled' && <Button label={item.schedule.status === 'active' ? 'Pause' : 'Resume'} variant="ghost" onPress={() => void act(() => setScheduleStatus(item.schedule.id, item.schedule.status === 'active' ? 'paused' : 'active'))} />}{item.schedule.status !== 'cancelled' && <Button label="Cancel" variant="ghost" onPress={() => setCancelId(item.schedule.id)} />}</View></Surface>; })}</View> : <EmptyState icon="calendar-outline" title={tab === 'history' ? 'No history yet' : 'Nothing scheduled here'} body={tab === 'upcoming' ? 'Create a schedule to plan upcoming money movements.' : 'Try another view or date filter.'} action={tab === 'upcoming' ? <Button label="Create schedule" onPress={openCreate} /> : undefined} />}
    {scopeSchedules.some((schedule) => schedule.status !== 'active') && <Surface style={styles.card}><AppText variant="h3">Paused and cancelled schedules</AppText>{scopeSchedules.filter((schedule) => schedule.status !== 'active').map((schedule) => <View key={schedule.id} style={styles.row}><View style={styles.flex}><AppText variant="bodyMedium">{schedule.name}</AppText><AppText variant="caption" style={styles.muted}>{schedule.status} · {frequencies.find((entry) => entry.value === schedule.frequency)?.label}</AppText></View>{schedule.status === 'paused' && <Button label="Resume" variant="secondary" onPress={() => void act(() => setScheduleStatus(schedule.id, 'active'))} />}<Button label="History" variant="ghost" onPress={() => { setHistoryScheduleId(schedule.id); setTab('history'); }} /></View>)}</Surface>}
    {actionError && !editor && <AppText style={{ color: colors.expense }}>{actionError}</AppText>}
    <Modal visible={editor !== null && picker === null} transparent animationType="slide" onRequestClose={() => setEditor(null)}><SafeAreaView edges={['top','bottom']} style={styles.overlay}><ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled"><Surface style={styles.editor}><View style={styles.row}><AppText variant="h2" style={styles.flex}>{editor === 'create' ? 'New schedule' : editor === 'record' ? 'Record transaction' : editor === 'future' ? 'Edit this and future' : 'Edit this occurrence'}</AppText><Pressable onPress={() => setEditor(null)}><Ionicons name="close" size={24} color={colors.slate} /></Pressable></View>{editor === 'record' && <AppText variant="caption" style={styles.muted}>Recording creates a MoneyYap ledger entry. It does not pay a bill or move money at your bank.</AppText>}
      {editor !== 'occurrence' && editor !== 'record' && <><View style={styles.tabs}>{(Object.keys(typeLabels) as ScheduledType[]).map((type) => <Chip key={type} label={typeLabels[type]} selected={form.type === type} onPress={() => setForm((current) => ({ ...current, type, fromId: '', toId: '', categoryId: '' }))} />)}</View>{textField('name','Name or payee')}{editor === 'create' && <SmartSelectField label="Space" value={spaces.find((space) => space.id === form.spaceId)?.name} placeholder="Choose Space" onPress={() => setPicker('space')} />}</>}
      {textField('amount','Amount',true)}{dateField('startsOn',editor === 'record' ? 'Transaction date' : editor === 'occurrence' ? 'Rescheduled due date' : 'Start date')}
      {editor !== 'record' && editor !== 'occurrence' && <><View style={styles.tabs}>{frequencies.map((frequency) => <Chip key={frequency.value} label={frequency.label} selected={form.frequency === frequency.value} onPress={() => set('frequency',frequency.value)} />)}</View>{form.frequency !== 'once' && <><AppText variant="caption" style={styles.muted}>Start date is the first occurrence. The day of month applies to later occurrences.</AppText><View style={styles.two}>{dateField('endsOn','End date (optional)')}{textField('maxOccurrences','Number of occurrences (optional)',true)}</View>{['monthly','quarterly','semiannual','yearly'].includes(form.frequency) && <View style={styles.row}>{textField('anchorDay','Day of month',true)}<Chip label="Last day of month" selected={form.lastDay} onPress={() => set('lastDay',!form.lastDay)} /></View>}</>}{<><View style={styles.tabs}><Chip label="Manual confirmation" selected={form.mode === 'manual'} onPress={() => set('mode','manual')} /><Chip label="Auto-record in MoneyYap" selected={form.mode === 'auto'} onPress={() => set('mode','auto')} /></View><AppText variant="caption" style={styles.muted}>Auto-record adds a ledger entry on the due date. It never executes a bank payment or transfer.</AppText><View style={styles.tabs}>{[0,1,3,7].map((days) => <Chip key={days} label={days === 0 ? 'On due date' : `${days} day${days === 1 ? '' : 's'} before`} selected={form.reminders.includes(days)} onPress={() => set('reminders',form.reminders.includes(days) ? form.reminders.filter((day) => day !== days) : [...form.reminders,days])} />)}</View></>}</>}
      {form.type !== 'income' && <SmartSelectField label={form.type === 'transfer' ? 'From account' : 'Paid from'} value={accounts.find((account) => account.id === form.fromId)?.name} placeholder="Choose account" onPress={() => setPicker('from')} />}
      {form.type !== 'expense' && <SmartSelectField label={form.type === 'credit_card_payment' ? 'Credit card account' : form.type === 'income' ? 'Received in' : 'To account'} value={accounts.find((account) => account.id === form.toId)?.name} placeholder="Choose account" onPress={() => setPicker('to')} />}
      {(form.type === 'expense' || form.type === 'income') && <SmartSelectField label="Category" value={categories.find((category) => category.id === form.categoryId)?.name} placeholder="Choose category" onPress={() => setPicker('category')} />}
      {editor !== 'record' && textField('notes','Notes')}
      {editor === 'record' && matches.length > 0 && <View style={styles.field}><AppText variant="bodyMedium">Possible existing transactions</AppText><AppText variant="caption" style={styles.muted}>Select one to link it instead of creating a duplicate.</AppText>{matches.map((transaction) => <Chip key={transaction.id} label={`${dateLabel(transaction.transactionDate.slice(0,10))} · ${transaction.counterpartyName ?? transaction.merchant ?? transaction.type} · ${formatPeso(transaction.amount)}`} selected={linkId === transaction.id} onPress={() => setLinkId(linkId === transaction.id ? null : transaction.id)} />)}</View>}
      {actionError && <AppText style={{ color: colors.expense }}>{actionError}</AppText>}<View style={styles.actions}><Button label={editor === 'record' ? linkId ? 'Link existing transaction' : 'Record in MoneyYap' : 'Save'} loading={busy} onPress={submit} /><Button label="Cancel" variant="secondary" onPress={() => setEditor(null)} /></View>
    </Surface></ScrollView></SafeAreaView></Modal>
    <SmartSelectSheet visible={picker !== null} title={picker === 'space' ? 'Choose Space' : picker === 'category' ? 'Choose category' : 'Choose account'} options={picker === 'space' ? spaces.filter((space) => !space.isArchived).map((space) => ({ id: space.id, label: space.name })) : picker === 'category' ? [{ id: '__none__', label: 'No category' }, ...categoryOptions] : picker === 'from' ? accountOptions(fromAccounts) : accountOptions(toAccounts)} hierarchical={picker === 'category'} selectedIds={[picker === 'space' ? form.spaceId : picker === 'from' ? form.fromId : picker === 'to' ? form.toId : form.categoryId || '__none__']} onSelect={selectOption} onClose={() => setPicker(null)} />
    <ConfirmActionDialog visible={cancelId !== null} title="Cancel this schedule?" message="Upcoming occurrences will stop. Recorded transactions remain in your ledger." confirmLabel="Cancel schedule" onClose={() => setCancelId(null)} onConfirm={async () => { const id = cancelId; setCancelId(null); if (id) await act(() => setScheduleStatus(id,'cancelled')); }} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { maxWidth: 1080 }, muted: { color: colors.slate }, flex: { flex: 1 }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, summaryCard: { flex: 1, minWidth: 170, gap: spacing.xs }, list: { gap: spacing.md }, card: { gap: spacing.md }, icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.mintWash, alignItems: 'center', justifyContent: 'center' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, reminderPanel: { gap: spacing.sm },
  overlay: { flex: 1, backgroundColor: '#10182099', justifyContent: 'center' }, modalScroll: { padding: spacing.lg, paddingVertical: spacing.xxxl }, editor: { maxWidth: 600, width: '100%', alignSelf: 'center', gap: spacing.lg }, field: { flex: 1, gap: spacing.xs }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.md, color: colors.ink, backgroundColor: colors.white, fontFamily: typography.regular, fontSize: 15 }, notes: { minHeight: 84, paddingTop: spacing.md }, dateButton: { minHeight: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, paddingHorizontal: spacing.md, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, two: { flexDirection: 'row', gap: spacing.md },
});
const webDateInputStyle: CSSProperties = { minHeight: 48, width: '100%', boxSizing: 'border-box', border: `1px solid ${colors.borderStrong}`, borderRadius: radii.md, padding: `0 ${spacing.md}px`, background: colors.white, color: colors.ink, fontFamily: typography.regular, fontSize: 15 };
