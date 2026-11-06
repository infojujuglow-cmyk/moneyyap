import { supabase } from '@/lib/supabase';
import type { TransactionType } from '@/types/finance';

export type ScheduleFrequency = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type RecordingMode = 'manual' | 'auto';
export type ScheduleStatus = 'active' | 'paused' | 'cancelled';
export type OccurrenceStatus = 'pending' | 'skipped' | 'recorded';
export type ScheduledType = Exclude<TransactionType, 'refund'>;
export interface Schedule {
  id: string; series_id: string; workspace_id: string; space_id: string; created_by: string;
  name: string; type: ScheduledType; amount: number; currency: string;
  account_from_id: string | null; account_to_id: string | null; category_id: string | null; notes: string | null;
  frequency: ScheduleFrequency; starts_on: string; ends_on: string | null; max_occurrences: number | null;
  anchor_day: number | null; last_day_of_month: boolean; timezone: string;
  recording_mode: RecordingMode; reminder_days: number[]; status: ScheduleStatus;
  next_occurrence_number: number; next_due_on: string | null; created_at: string;
}
export interface ScheduledOccurrence {
  id: string; schedule_id: string; occurrence_number: number; original_due_on: string; due_on: string;
  status: OccurrenceStatus; amount_override: number | null;
  account_from_override: string | null; account_to_override: string | null; category_override: string | null;
  notes_override: string | null; transaction_id: string | null; recorded_at: string | null;
  recorded_automatically: boolean;
}
export interface ScheduledReminder {
  id: string; occurrence_id: string; days_before: number; created_at: string; read_at: string | null;
}
export interface ScheduledData { schedules: Schedule[]; occurrences: ScheduledOccurrence[]; reminders: ScheduledReminder[]; timezone: string }

const parseDate = (date: string) => {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const next = parseDate(date); next.setUTCDate(next.getUTCDate() + days); return isoDate(next);
};
export const todayInTimezone = (timezone: string, now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '01';
  return part('year') + '-' + part('month') + '-' + part('day');
};

export const noonInTimezone = (date: string, timezone: string): string => {
  const base = Date.parse(`${date}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const zonedParts = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const value = (name: string) => Number(parts.find((part) => part.type === name)?.value ?? 0);
    return Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'));
  };
  const first = base - (zonedParts(base) - base);
  return new Date(base - (zonedParts(first) - first)).toISOString();
};

export const occurrenceDate = (schedule: Pick<Schedule, 'starts_on' | 'frequency' | 'anchor_day' | 'last_day_of_month'>, number: number): string | null => {
  if (!Number.isInteger(number) || number < 1) throw new Error('Invalid occurrence number');
  const start = parseDate(schedule.starts_on);
  const offset = number - 1;
  if (number === 1) return schedule.starts_on;
  if (schedule.frequency === 'once') return number === 1 ? schedule.starts_on : null;
  if (schedule.frequency === 'daily') return addDays(schedule.starts_on, offset);
  if (schedule.frequency === 'weekly') return addDays(schedule.starts_on, offset * 7);
  if (schedule.frequency === 'biweekly') return addDays(schedule.starts_on, offset * 14);
  const months = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 }[schedule.frequency] ?? 1;
  const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months * offset, 1));
  const last = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const day = schedule.last_day_of_month ? last : Math.min(schedule.anchor_day ?? start.getUTCDate(), last);
  return isoDate(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day)));
};

export const projectedOccurrences = (schedule: Schedule, persisted: ScheduledOccurrence[], through: string) => {
  const byNumber = new Map(persisted.filter((item) => item.schedule_id === schedule.id).map((item) => [item.occurrence_number, item]));
  const result: { schedule: Schedule; occurrence: ScheduledOccurrence | null; number: number; dueOn: string; status: OccurrenceStatus }[] = [];
  for (let number = 1; number <= 5000; number++) {
    if (schedule.max_occurrences && number > schedule.max_occurrences) break;
    const originalDue = occurrenceDate(schedule, number);
    if (!originalDue || schedule.ends_on && originalDue > schedule.ends_on || originalDue > through) break;
    const occurrence = byNumber.get(number) ?? null;
    // A materialized row missing from the query is hidden by RLS (for example,
    // because this occurrence uses another member's private account).
    if (!occurrence && number < schedule.next_occurrence_number) continue;
    if (!occurrence && schedule.status === 'cancelled') continue;
    result.push({ schedule, occurrence, number, dueOn: occurrence?.due_on ?? originalDue, status: occurrence?.status ?? 'pending' });
  }
  return result;
};

export const projectedTotals = (items: ReturnType<typeof projectedOccurrences>, start: string, end: string) =>
  items.filter((item) => item.status === 'pending' && item.schedule.status === 'active' && item.dueOn >= start && item.dueOn <= end)
    .reduce((totals, item) => {
      const amount = Number(item.occurrence?.amount_override ?? item.schedule.amount);
      if (item.schedule.type === 'expense') totals.expenses += amount;
      if (item.schedule.type === 'income') totals.income += amount;
      return totals;
    }, { expenses: 0, income: 0 });

export const projectedAccountCashFlow = (items: ReturnType<typeof projectedOccurrences>, accountId: string, start: string, end: string) =>
  items.filter((item) => item.status === 'pending' && item.schedule.status === 'active' && item.dueOn >= start && item.dueOn <= end)
    .reduce((totals, item) => {
      const amount = Number(item.occurrence?.amount_override ?? item.schedule.amount);
      if ((item.occurrence?.account_from_override ?? item.schedule.account_from_id) === accountId) totals.outgoing += amount;
      if ((item.occurrence?.account_to_override ?? item.schedule.account_to_id) === accountId) totals.incoming += amount;
      return totals;
    }, { outgoing: 0, incoming: 0 });

const requireConnection = () => {
  if (!supabase) throw new Error('Connect MoneyYap to Supabase first.');
  return supabase;
};
export const loadScheduledData = async (workspaceId: string): Promise<ScheduledData> => {
  const db = requireConnection();
  const [scheduleResult, timezoneResult] = await Promise.all([
    db.from('scheduled_transactions').select('*').eq('workspace_id', workspaceId).order('starts_on'),
    db.from('workspaces').select('timezone').eq('id', workspaceId).single(),
  ]);
  if (scheduleResult.error) throw scheduleResult.error;
  if (timezoneResult.error) throw timezoneResult.error;
  const schedules = (scheduleResult.data ?? []) as Schedule[];
  if (!schedules.length) return { schedules, occurrences: [], reminders: [], timezone: timezoneResult.data.timezone ?? 'Asia/Manila' };
  const { data, error } = await db.from('scheduled_occurrences').select('*').in('schedule_id', schedules.map((item) => item.id)).order('due_on');
  if (error) throw error;
  const occurrences = (data ?? []) as ScheduledOccurrence[];
  if (!occurrences.length) return { schedules, occurrences, reminders: [], timezone: timezoneResult.data.timezone ?? 'Asia/Manila' };
  const { data: reminderRows, error: reminderError } = await db.from('scheduled_reminders').select('id,occurrence_id,days_before,created_at,read_at').in('occurrence_id', occurrences.map((item) => item.id)).order('created_at', { ascending: false });
  if (reminderError) throw reminderError;
  return { schedules, occurrences, reminders: (reminderRows ?? []) as ScheduledReminder[], timezone: timezoneResult.data.timezone ?? 'Asia/Manila' };
};
export const createSchedule = async (payload: Omit<Schedule, 'id' | 'series_id' | 'next_occurrence_number' | 'next_due_on' | 'created_at' | 'status'>) => {
  const db = requireConnection();
  const { data, error } = await db.from('scheduled_transactions').insert(payload).select('id').single();
  if (error) throw error;
  return String(data.id);
};
export const ensureOccurrence = async (scheduleId: string, number: number) => {
  const { data, error } = await requireConnection().rpc('ensure_scheduled_occurrence', { p_schedule_id: scheduleId, p_number: number });
  if (error) throw error;
  return String(data);
};
export const updateOccurrence = async (id: string, changes: Partial<Pick<ScheduledOccurrence, 'due_on' | 'status' | 'amount_override' | 'account_from_override' | 'account_to_override' | 'category_override' | 'notes_override'>>) => {
  const { data, error } = await requireConnection().from('scheduled_occurrences').update(changes).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Occurrence could not be updated.');
};
export const setScheduleStatus = async (id: string, status: ScheduleStatus) => {
  const { data, error } = await requireConnection().from('scheduled_transactions').update({ status }).eq('id', id).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Schedule could not be updated.');
};
export const recordOccurrence = async (id: string, changes: { amount?: number; fromId?: string | null; toId?: string | null; categoryId?: string | null; when?: string; existingTransactionId?: string } = {}) => {
  const { data, error } = await requireConnection().rpc('record_scheduled_occurrence', {
    p_id: id, p_amount: changes.amount ?? null, p_from: changes.fromId ?? null, p_to: changes.toId ?? null,
    p_category: changes.categoryId ?? null, p_when: changes.when ?? null, p_existing: changes.existingTransactionId ?? null,
  });
  if (error) throw error;
  return String(data);
};
export const editScheduleFuture = async (id: string, changes: Record<string, unknown>) => {
  const { data, error } = await requireConnection().rpc('edit_scheduled_future', { p_occurrence_id: id, p_changes: changes });
  if (error) throw error;
  return String(data);
};
export const markReminderRead = async (id: string) => {
  const { error } = await requireConnection().from('scheduled_reminders').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};
export const plusDays = addDays;
