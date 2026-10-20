-- Reconciliation belongs to an account leg. This lets the two sides of an
-- internal transfer be reconciled independently while still supporting an
-- overall transaction status in the general transaction list.
create table if not exists public.transaction_reconciliations (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reconciled_at timestamptz not null default now(),
  reconciled_by uuid not null references public.profiles(id) on delete restrict,
  primary key (transaction_id, account_id)
);

create index if not exists transaction_reconciliations_workspace_account_idx
  on public.transaction_reconciliations (workspace_id, account_id, reconciled_at desc);
create index if not exists transaction_reconciliations_reconciled_by_idx
  on public.transaction_reconciliations (reconciled_by);

alter table public.transaction_reconciliations enable row level security;
revoke all on table public.transaction_reconciliations from anon;
grant select, insert, update, delete on table public.transaction_reconciliations to authenticated;

drop policy if exists "members read visible reconciliations" on public.transaction_reconciliations;
drop policy if exists "members create visible reconciliations" on public.transaction_reconciliations;
drop policy if exists "members update visible reconciliations" on public.transaction_reconciliations;
drop policy if exists "members delete visible reconciliations" on public.transaction_reconciliations;

create policy "members read visible reconciliations" on public.transaction_reconciliations for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and private.can_access_account(account_id, workspace_id)
  and exists (
    select 1 from public.transactions transaction_row
    where transaction_row.id = transaction_id
      and transaction_row.workspace_id = workspace_id
      and (transaction_row.account_from_id = account_id or transaction_row.account_to_id = account_id)
  )
);

create policy "members create visible reconciliations" on public.transaction_reconciliations for insert to authenticated
with check (
  reconciled_by = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  and private.can_access_account(account_id, workspace_id)
  and exists (
    select 1 from public.transactions transaction_row
    where transaction_row.id = transaction_id
      and transaction_row.workspace_id = workspace_id
      and (transaction_row.account_from_id = account_id or transaction_row.account_to_id = account_id)
  )
);

create policy "members update visible reconciliations" on public.transaction_reconciliations for update to authenticated
using (
  public.is_workspace_member(workspace_id)
  and private.can_access_account(account_id, workspace_id)
  and exists (
    select 1 from public.transactions transaction_row
    where transaction_row.id = transaction_id
      and transaction_row.workspace_id = workspace_id
      and (transaction_row.account_from_id = account_id or transaction_row.account_to_id = account_id)
  )
)
with check (
  reconciled_by = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  and private.can_access_account(account_id, workspace_id)
  and exists (
    select 1 from public.transactions transaction_row
    where transaction_row.id = transaction_id
      and transaction_row.workspace_id = workspace_id
      and (transaction_row.account_from_id = account_id or transaction_row.account_to_id = account_id)
  )
);

create policy "members delete visible reconciliations" on public.transaction_reconciliations for delete to authenticated
using (
  public.is_workspace_member(workspace_id)
  and private.can_access_account(account_id, workspace_id)
  and exists (
    select 1 from public.transactions transaction_row
    where transaction_row.id = transaction_id
      and transaction_row.workspace_id = workspace_id
      and (transaction_row.account_from_id = account_id or transaction_row.account_to_id = account_id)
  )
);

create or replace function public.set_transaction_reconciliations(
  p_transaction_ids uuid[],
  p_reconciled boolean,
  p_account_id uuid default null
)
returns table (transaction_id uuid, account_id uuid, reconciled_at timestamptz)
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(array_length(p_transaction_ids, 1), 0) = 0 then
    return;
  end if;

  if p_reconciled then
    return query
      insert into public.transaction_reconciliations as reconciliation
        (transaction_id, account_id, workspace_id, reconciled_at, reconciled_by)
      select transaction_row.id, linked_account.account_id, transaction_row.workspace_id, now(), (select auth.uid())
      from public.transactions transaction_row
      cross join lateral (
        values (transaction_row.account_from_id), (transaction_row.account_to_id)
      ) as linked_account(account_id)
      where transaction_row.id = any(p_transaction_ids)
        and linked_account.account_id is not null
        and (p_account_id is null or linked_account.account_id = p_account_id)
      on conflict on constraint transaction_reconciliations_pkey do update
        set reconciled_at = excluded.reconciled_at,
            reconciled_by = excluded.reconciled_by
      returning reconciliation.transaction_id, reconciliation.account_id, reconciliation.reconciled_at;
  else
    return query
      delete from public.transaction_reconciliations as reconciliation
      where reconciliation.transaction_id = any(p_transaction_ids)
        and (p_account_id is null or reconciliation.account_id = p_account_id)
      returning reconciliation.transaction_id, reconciliation.account_id, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.set_transaction_reconciliations(uuid[], boolean, uuid) from public;
revoke all on function public.set_transaction_reconciliations(uuid[], boolean, uuid) from anon;
grant execute on function public.set_transaction_reconciliations(uuid[], boolean, uuid) to authenticated;

create or replace function public.prune_stale_transaction_reconciliations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.transaction_reconciliations reconciliation
  where reconciliation.transaction_id = new.id
    and reconciliation.account_id is distinct from new.account_from_id
    and reconciliation.account_id is distinct from new.account_to_id;
  return new;
end;
$$;

drop trigger if exists transactions_prune_stale_reconciliations on public.transactions;
create trigger transactions_prune_stale_reconciliations
before update of account_from_id, account_to_id on public.transactions
for each row execute function public.prune_stale_transaction_reconciliations();

revoke all on function public.prune_stale_transaction_reconciliations() from public;
revoke all on function public.prune_stale_transaction_reconciliations() from anon;
revoke all on function public.prune_stale_transaction_reconciliations() from authenticated;
