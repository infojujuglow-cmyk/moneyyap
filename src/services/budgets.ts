import { supabase } from '@/lib/supabase';
import type { BudgetAllocation, MonthlyBudget, TransactionSplit } from '@/types/finance';

const mapAllocation = (row: Record<string, unknown>): BudgetAllocation => ({
  id: String(row.id),
  budgetId: String(row.budget_id),
  categoryId: String(row.category_id),
  amount: Number(row.amount),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

const mapBudget = (row: Record<string, unknown>, allocations: BudgetAllocation[]): MonthlyBudget => ({
  id: String(row.id),
  workspaceId: String(row.workspace_id),
  monthStart: String(row.month_start),
  createdBy: String(row.created_by),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  allocations,
});

export const loadMonthlyBudget = async (workspaceId: string, monthStart: string): Promise<MonthlyBudget | null> => {
  if (!supabase) return null;
  const { data: budgetRow, error } = await supabase
    .from('monthly_budgets')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('month_start', monthStart)
    .maybeSingle();
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code ?? '')) throw new Error('Apply the monthly budgets migration, then refresh MoneyYap.');
    throw error;
  }
  if (!budgetRow) return null;
  const { data: allocationRows, error: allocationError } = await supabase
    .from('budget_allocations')
    .select('*')
    .eq('budget_id', budgetRow.id)
    .order('created_at');
  if (allocationError) throw allocationError;
  const allocations = (allocationRows ?? []).map((row) => mapAllocation(row));
  return mapBudget(budgetRow, allocations);
};

export const saveMonthlyBudget = async (
  workspaceId: string,
  monthStart: string,
  allocations: { categoryId: string; amount: number }[],
) => {
  if (!supabase) throw new Error('MoneyYap is not connected to Supabase.');
  const payload = allocations
    .filter((allocation) => Number.isFinite(allocation.amount) && allocation.amount > 0)
    .map((allocation) => ({ category_id: allocation.categoryId, amount: Math.round(allocation.amount * 100) / 100 }));
  const { data, error } = await supabase.rpc('save_monthly_budget_allocations', {
    p_workspace_id: workspaceId,
    p_month_start: monthStart,
    p_allocations: payload,
  });
  if (error) {
    if (['42883', 'PGRST202'].includes(error.code ?? '')) throw new Error('Apply the monthly budgets migration, then refresh MoneyYap.');
    throw error;
  }
  return String(data);
};

export const loadTransactionSplits = async (transactionIds: string[]): Promise<TransactionSplit[]> => {
  if (!supabase || !transactionIds.length) return [];
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let index = 0; index < transactionIds.length; index += pageSize) {
    const { data, error } = await supabase
      .from('transaction_splits')
      .select('id,transaction_id,category_id,amount')
      .in('transaction_id', transactionIds.slice(index, index + pageSize));
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows.map((row) => ({
    id: String(row.id),
    transactionId: String(row.transaction_id),
    categoryId: String(row.category_id),
    amount: Number(row.amount),
  }));
};
