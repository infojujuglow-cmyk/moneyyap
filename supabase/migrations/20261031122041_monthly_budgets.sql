create table public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month_start date not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_budgets_month_start_check check (month_start = date_trunc('month', month_start)::date),
  constraint monthly_budgets_workspace_month_key unique (workspace_id, month_start)
);

create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.monthly_budgets(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_allocations_budget_category_key unique (budget_id, category_id)
);

create index monthly_budgets_workspace_month_idx on public.monthly_budgets(workspace_id, month_start desc);
create index budget_allocations_budget_idx on public.budget_allocations(budget_id);
create index budget_allocations_category_idx on public.budget_allocations(category_id);

create trigger monthly_budgets_set_updated_at
before update on public.monthly_budgets
for each row execute function public.set_updated_at();

create trigger budget_allocations_set_updated_at
before update on public.budget_allocations
for each row execute function public.set_updated_at();

create or replace function public.validate_budget_allocation_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  budget_workspace uuid;
  category_workspace uuid;
  category_type text;
  category_archived boolean;
begin
  select workspace_id into budget_workspace
  from public.monthly_budgets
  where id = new.budget_id;

  select workspace_id, type, is_archived
  into category_workspace, category_type, category_archived
  from public.categories
  where id = new.category_id;

  if budget_workspace is null or category_workspace is null then
    raise exception 'Budget and category are required';
  end if;
  if budget_workspace is distinct from category_workspace then
    raise exception 'Budget category must belong to the same workspace';
  end if;
  if category_type is distinct from 'expense' then
    raise exception 'Budgets can only allocate expense categories';
  end if;
  if category_archived and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then
    raise exception 'New allocations cannot use an archived category';
  end if;
  return new;
end;
$$;

create trigger validate_budget_allocation_scope
before insert or update on public.budget_allocations
for each row execute function public.validate_budget_allocation_scope();

alter table public.monthly_budgets enable row level security;
alter table public.budget_allocations enable row level security;

create policy "workspace members read monthly budgets"
on public.monthly_budgets for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace members create monthly budgets"
on public.monthly_budgets for insert to authenticated
with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id));

create policy "workspace members update monthly budgets"
on public.monthly_budgets for update to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace members delete monthly budgets"
on public.monthly_budgets for delete to authenticated
using (public.is_workspace_member(workspace_id));

create policy "workspace members read budget allocations"
on public.budget_allocations for select to authenticated
using (
  exists (
    select 1 from public.monthly_budgets budget
    where budget.id = budget_id
      and public.is_workspace_member(budget.workspace_id)
  )
);

create policy "workspace members create budget allocations"
on public.budget_allocations for insert to authenticated
with check (
  exists (
    select 1 from public.monthly_budgets budget
    where budget.id = budget_id
      and public.is_workspace_member(budget.workspace_id)
  )
);

create policy "workspace members update budget allocations"
on public.budget_allocations for update to authenticated
using (
  exists (
    select 1 from public.monthly_budgets budget
    where budget.id = budget_id
      and public.is_workspace_member(budget.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.monthly_budgets budget
    where budget.id = budget_id
      and public.is_workspace_member(budget.workspace_id)
  )
);

create policy "workspace members delete budget allocations"
on public.budget_allocations for delete to authenticated
using (
  exists (
    select 1 from public.monthly_budgets budget
    where budget.id = budget_id
      and public.is_workspace_member(budget.workspace_id)
  )
);

create or replace function public.save_monthly_budget_allocations(
  p_workspace_id uuid,
  p_month_start date,
  p_allocations jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_budget_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_month_start is null or p_month_start <> date_trunc('month', p_month_start)::date then
    raise exception 'Budget month must be the first day of a calendar month';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Budget allocations must be an array';
  end if;
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Workspace access required';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as item(category_id uuid, amount numeric)
    group by item.category_id
    having item.category_id is null
      or count(*) > 1
      or count(item.amount) <> count(*)
      or min(item.amount) < 0
      or max(item.amount) > 999999999999.99
  ) then
    raise exception 'Budget allocations contain invalid or duplicate categories';
  end if;

  insert into public.monthly_budgets (workspace_id, month_start, created_by)
  values (p_workspace_id, p_month_start, current_user_id)
  on conflict (workspace_id, month_start)
  do update set updated_at = now()
  returning id into target_budget_id;

  delete from public.budget_allocations allocation
  where allocation.budget_id = target_budget_id
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as item(category_id uuid, amount numeric)
      where item.category_id = allocation.category_id and item.amount > 0
    );

  insert into public.budget_allocations (budget_id, category_id, amount)
  select target_budget_id, item.category_id, item.amount
  from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb)) as item(category_id uuid, amount numeric)
  where item.amount > 0
  on conflict (budget_id, category_id)
  do update set amount = excluded.amount, updated_at = now();

  return target_budget_id;
end;
$$;

revoke execute on function public.save_monthly_budget_allocations(uuid, date, jsonb) from public, anon;
grant execute on function public.save_monthly_budget_allocations(uuid, date, jsonb) to authenticated;

grant select, insert, update, delete on table public.monthly_budgets, public.budget_allocations to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.monthly_budgets;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.budget_allocations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.transaction_splits;
exception when duplicate_object then null;
end $$;
