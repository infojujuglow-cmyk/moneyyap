-- Business financial integration foundation.
-- Existing Spaces remain household by default. Nothing becomes externally
-- accessible until an owner/admin explicitly marks a Space as business and
-- creates a scoped integration connection.

begin;

alter table public.spaces
  add column if not exists space_type text not null default 'household'
    check (space_type in ('personal', 'household', 'business')),
  add column if not exists description text,
  add column if not exists currency text not null default 'PHP'
    check (currency ~ '^[A-Z]{3}$'),
  add column if not exists legal_entity_external_id text;

alter table public.transactions
  add column if not exists business_classification text not null default 'operating'
    check (business_classification in (
      'operating', 'owner_capital_contribution', 'owner_withdrawal',
      'owner_loan', 'loan_repayment'
    ));

create or replace function public.validate_business_transaction_classification()
returns trigger
language plpgsql
set search_path = ''
as $$
declare target_space_type text;
begin
  select space_type into target_space_type from public.spaces where id = new.space_id;
  if new.business_classification <> 'operating' and target_space_type is distinct from 'business' then
    raise exception 'Capital classifications are only available in Business Spaces';
  end if;
  if new.business_classification in ('owner_capital_contribution', 'owner_loan')
    and (new.type <> 'income' or new.financial_effect <> 'income') then
    raise exception 'Capital contributions and owner loans must be income cash movements';
  end if;
  if new.business_classification in ('owner_withdrawal', 'loan_repayment')
    and (new.type <> 'expense' or new.financial_effect <> 'expense') then
    raise exception 'Owner withdrawals and loan repayments must be expense cash movements';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_validate_business_classification on public.transactions;
create trigger transactions_validate_business_classification
before insert or update of space_id, type, financial_effect, business_classification
on public.transactions for each row
execute function public.validate_business_transaction_classification();

create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  application_key text not null check (application_key = 'venture_os'),
  display_name text not null default 'Venture OS',
  status text not null default 'active' check (status in ('active', 'revoked')),
  permission_scopes text[] not null default array['financial_summaries:read']::text[],
  credential_hash text not null unique check (credential_hash ~ '^[0-9a-f]{64}$'),
  credential_prefix text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_accessed_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (permission_scopes <@ array['financial_summaries:read','project_costs:read']::text[]),
  check ((status = 'active' and revoked_at is null) or status = 'revoked')
);

create table public.integration_connection_spaces (
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  external_business_id text,
  external_business_name text,
  authorized_at timestamptz not null default now(),
  primary key (connection_id, space_id)
);

create table public.integration_access_logs (
  id bigint generated always as identity primary key,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  request_id uuid not null default gen_random_uuid(),
  endpoint text not null,
  response_status integer not null check (response_status between 100 and 599),
  accessed_at timestamptz not null default now()
);

create table public.external_project_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  source_application text not null check (source_application = 'venture_os'),
  external_business_id text not null,
  external_project_id text not null,
  external_project_name text not null,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_application, external_business_id, external_project_id)
);

create table public.transaction_project_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  project_reference_id uuid not null references public.external_project_references(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, project_reference_id)
);

create table public.project_budget_allocations (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.monthly_budgets(id) on delete cascade,
  project_reference_id uuid not null references public.external_project_references(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_id, project_reference_id)
);

create table public.financial_obligations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete restrict,
  obligation_type text not null check (obligation_type in ('receivable', 'payable')),
  counterparty text not null check (char_length(trim(counterparty)) between 1 and 160),
  original_amount numeric(16,2) not null check (original_amount > 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  issue_date date not null,
  due_date date,
  reference_number text,
  notes text,
  project_reference_id uuid references public.external_project_references(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= issue_date)
);

create table public.financial_obligation_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.financial_obligations(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (obligation_id, transaction_id)
);

create view public.financial_obligation_balances
with (security_invoker = true)
as
select obligation.*,
  coalesce(sum(payment.amount), 0)::numeric(16,2) as paid_amount,
  greatest(obligation.original_amount - coalesce(sum(payment.amount), 0), 0)::numeric(16,2) as outstanding_amount,
  case
    when obligation.status = 'void' then 'void'
    when coalesce(sum(payment.amount), 0) >= obligation.original_amount then 'paid'
    when coalesce(sum(payment.amount), 0) > 0 then 'partially_paid'
    when obligation.due_date < current_date then 'overdue'
    else 'open'
  end as calculated_status
from public.financial_obligations obligation
left join public.financial_obligation_payments payment on payment.obligation_id = obligation.id
group by obligation.id;

create index integration_connections_workspace_idx on public.integration_connections(workspace_id, status);
create index integration_connection_spaces_space_idx on public.integration_connection_spaces(space_id);
create unique index integration_connection_spaces_external_business_idx
on public.integration_connection_spaces(connection_id, external_business_id)
where external_business_id is not null;
create index integration_access_logs_connection_time_idx on public.integration_access_logs(connection_id, accessed_at desc);
create index external_projects_space_idx on public.external_project_references(space_id, is_active);
create index transaction_project_allocations_transaction_idx on public.transaction_project_allocations(transaction_id);
create index transaction_project_allocations_project_idx on public.transaction_project_allocations(project_reference_id);
create index project_budget_allocations_budget_idx on public.project_budget_allocations(budget_id);
create index obligations_space_due_idx on public.financial_obligations(space_id, status, due_date);
create index obligation_payments_obligation_idx on public.financial_obligation_payments(obligation_id);

create trigger integration_connections_updated_at before update on public.integration_connections
for each row execute function public.set_updated_at();
create trigger external_project_references_updated_at before update on public.external_project_references
for each row execute function public.set_updated_at();
create trigger transaction_project_allocations_updated_at before update on public.transaction_project_allocations
for each row execute function public.set_updated_at();
create trigger project_budget_allocations_updated_at before update on public.project_budget_allocations
for each row execute function public.set_updated_at();
create trigger financial_obligations_updated_at before update on public.financial_obligations
for each row execute function public.set_updated_at();

create or replace function public.validate_integration_space_authorization()
returns trigger language plpgsql set search_path = '' as $$
declare connection_workspace uuid; target_workspace uuid; target_type text;
begin
  select workspace_id into connection_workspace from public.integration_connections where id = new.connection_id;
  select workspace_id, space_type into target_workspace, target_type from public.spaces where id = new.space_id;
  if target_workspace is distinct from connection_workspace then raise exception 'Authorized Space must belong to the connection workspace'; end if;
  if target_type is distinct from 'business' then raise exception 'Only Business Spaces can be authorized for integrations'; end if;
  return new;
end;
$$;
create trigger integration_connection_spaces_validate before insert or update on public.integration_connection_spaces
for each row execute function public.validate_integration_space_authorization();

create or replace function public.validate_external_project_reference()
returns trigger language plpgsql set search_path = '' as $$
declare target_workspace uuid; target_type text;
begin
  select workspace_id, space_type into target_workspace, target_type from public.spaces where id = new.space_id;
  if target_workspace is distinct from new.workspace_id then raise exception 'Project reference Space must belong to its workspace'; end if;
  if target_type is distinct from 'business' then raise exception 'External projects can only be linked to Business Spaces'; end if;
  return new;
end;
$$;
create trigger external_project_references_validate before insert or update on public.external_project_references
for each row execute function public.validate_external_project_reference();

create or replace function public.validate_transaction_project_allocation()
returns trigger language plpgsql set search_path = '' as $$
declare transaction_space uuid; transaction_amount numeric; project_space uuid; allocated numeric;
begin
  select space_id, amount into transaction_space, transaction_amount from public.transactions where id = new.transaction_id;
  select space_id into project_space from public.external_project_references where id = new.project_reference_id and is_active;
  if transaction_space is distinct from project_space then raise exception 'Transaction and external project must use the same Business Space'; end if;
  select coalesce(sum(amount), 0) into allocated from public.transaction_project_allocations
  where transaction_id = new.transaction_id and id is distinct from new.id;
  if allocated + new.amount > transaction_amount then raise exception 'Project allocations cannot exceed the transaction amount'; end if;
  return new;
end;
$$;
create trigger transaction_project_allocations_validate before insert or update on public.transaction_project_allocations
for each row execute function public.validate_transaction_project_allocation();

create or replace function public.validate_project_budget_allocation()
returns trigger language plpgsql set search_path = '' as $$
declare budget_workspace uuid; project_workspace uuid;
begin
  select workspace_id into budget_workspace from public.monthly_budgets where id = new.budget_id;
  select workspace_id into project_workspace from public.external_project_references where id = new.project_reference_id and is_active;
  if budget_workspace is distinct from project_workspace then raise exception 'Budget and external project must use the same workspace'; end if;
  return new;
end;
$$;
create trigger project_budget_allocations_validate before insert or update on public.project_budget_allocations
for each row execute function public.validate_project_budget_allocation();

create or replace function public.validate_financial_obligation()
returns trigger language plpgsql set search_path = '' as $$
declare target_workspace uuid; target_type text; project_space uuid;
begin
  select workspace_id, space_type into target_workspace, target_type from public.spaces where id = new.space_id;
  if target_workspace is distinct from new.workspace_id then raise exception 'Obligation Space must belong to its workspace'; end if;
  if target_type is distinct from 'business' then raise exception 'Receivables and payables are only available in Business Spaces'; end if;
  if new.project_reference_id is not null then
    select space_id into project_space from public.external_project_references where id = new.project_reference_id;
    if project_space is distinct from new.space_id then raise exception 'Obligation project must belong to the same Space'; end if;
  end if;
  return new;
end;
$$;
create trigger financial_obligations_validate before insert or update on public.financial_obligations
for each row execute function public.validate_financial_obligation();

create or replace function public.validate_financial_obligation_payment()
returns trigger language plpgsql set search_path = '' as $$
declare obligation_row public.financial_obligations%rowtype; transaction_row public.transactions%rowtype; already_paid numeric;
begin
  select * into obligation_row from public.financial_obligations where id = new.obligation_id and status <> 'void';
  select * into transaction_row from public.transactions where id = new.transaction_id;
  if obligation_row.id is null or transaction_row.id is null then raise exception 'Obligation and settlement transaction are required'; end if;
  if transaction_row.workspace_id is distinct from obligation_row.workspace_id or transaction_row.space_id is distinct from obligation_row.space_id then
    raise exception 'Settlement transaction must belong to the same workspace and Space';
  end if;
  if obligation_row.obligation_type = 'receivable' and transaction_row.financial_effect <> 'income' then
    raise exception 'Receivable settlements require an income transaction';
  end if;
  if obligation_row.obligation_type = 'payable' and transaction_row.financial_effect <> 'expense' then
    raise exception 'Payable settlements require an expense transaction';
  end if;
  select coalesce(sum(amount), 0) into already_paid from public.financial_obligation_payments
  where obligation_id = new.obligation_id and id is distinct from new.id;
  if already_paid + new.amount > obligation_row.original_amount then raise exception 'Settlement payments cannot exceed the obligation amount'; end if;
  if new.amount > transaction_row.amount then raise exception 'Settlement amount cannot exceed the linked transaction amount'; end if;
  return new;
end;
$$;
create trigger financial_obligation_payments_validate before insert or update on public.financial_obligation_payments
for each row execute function public.validate_financial_obligation_payment();

create or replace function public.create_venture_os_integration(p_space_mappings jsonb)
returns table (connection_id uuid, access_token text)
language plpgsql security definer set search_path = ''
as $$
declare target_workspace uuid; generated_token text; new_connection uuid; mapping jsonb; target_space uuid;
begin
  if jsonb_typeof(p_space_mappings) <> 'array' or jsonb_array_length(p_space_mappings) = 0 then
    raise exception 'Choose at least one Business Space';
  end if;
  select s.workspace_id into target_workspace
  from public.spaces s where s.id = (p_space_mappings->0->>'space_id')::uuid;
  if target_workspace is null or not public.has_workspace_role(target_workspace, array['owner','admin']) then
    raise exception 'Only workspace owners and admins can authorize integrations';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_space_mappings) item
    left join public.spaces s on s.id = (item->>'space_id')::uuid
    where s.workspace_id is distinct from target_workspace or s.space_type <> 'business' or s.is_archived
  ) then raise exception 'Every authorized Space must be an active Business Space in the same workspace'; end if;
  generated_token := 'my_live_' || encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.integration_connections (
    workspace_id, application_key, display_name, permission_scopes,
    credential_hash, credential_prefix, created_by
  ) values (
    target_workspace, 'venture_os', 'Venture OS',
    array['financial_summaries:read','project_costs:read'],
    encode(extensions.digest(generated_token, 'sha256'), 'hex'), left(generated_token, 16), (select auth.uid())
  ) returning id into new_connection;
  for mapping in select * from jsonb_array_elements(p_space_mappings) loop
    target_space := (mapping->>'space_id')::uuid;
    insert into public.integration_connection_spaces (
      connection_id, space_id, external_business_id, external_business_name
    ) values (
      new_connection, target_space, nullif(trim(mapping->>'external_business_id'), ''), nullif(trim(mapping->>'external_business_name'), '')
    );
  end loop;
  return query select new_connection, generated_token;
end;
$$;

create or replace function public.rotate_integration_credential(p_connection_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare generated_token text; target_workspace uuid;
begin
  select workspace_id into target_workspace from public.integration_connections where id = p_connection_id and status = 'active';
  if target_workspace is null or not public.has_workspace_role(target_workspace, array['owner','admin']) then raise exception 'Integration not found or not authorized'; end if;
  generated_token := 'my_live_' || encode(extensions.gen_random_bytes(32), 'hex');
  update public.integration_connections set credential_hash = encode(extensions.digest(generated_token, 'sha256'), 'hex'), credential_prefix = left(generated_token, 16)
  where id = p_connection_id;
  return generated_token;
end;
$$;

create or replace function public.revoke_integration_connection(p_connection_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_workspace uuid;
begin
  select workspace_id into target_workspace from public.integration_connections where id = p_connection_id;
  if target_workspace is null or not public.has_workspace_role(target_workspace, array['owner','admin']) then raise exception 'Integration not found or not authorized'; end if;
  update public.integration_connections set status = 'revoked', revoked_at = now() where id = p_connection_id;
end;
$$;

alter table public.integration_connections enable row level security;
alter table public.integration_connection_spaces enable row level security;
alter table public.integration_access_logs enable row level security;
alter table public.external_project_references enable row level security;
alter table public.transaction_project_allocations enable row level security;
alter table public.project_budget_allocations enable row level security;
alter table public.financial_obligations enable row level security;
alter table public.financial_obligation_payments enable row level security;

create policy integration_connections_select on public.integration_connections for select to authenticated
using (public.has_workspace_role(workspace_id, array['owner','admin']));
create policy integration_spaces_select on public.integration_connection_spaces for select to authenticated
using (exists (select 1 from public.integration_connections c where c.id = connection_id and public.has_workspace_role(c.workspace_id, array['owner','admin'])));
create policy integration_logs_select on public.integration_access_logs for select to authenticated
using (exists (select 1 from public.integration_connections c where c.id = connection_id and public.has_workspace_role(c.workspace_id, array['owner','admin'])));

create policy project_references_select on public.external_project_references for select to authenticated using (public.is_workspace_member(workspace_id));
create policy project_references_insert on public.external_project_references for insert to authenticated with check (created_by = (select auth.uid()) and public.has_workspace_role(workspace_id, array['owner','admin']));
create policy project_references_update on public.external_project_references for update to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin'])) with check (public.has_workspace_role(workspace_id, array['owner','admin']));
create policy project_references_delete on public.external_project_references for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy transaction_project_allocations_select on public.transaction_project_allocations for select to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
);
create policy transaction_project_allocations_insert on public.transaction_project_allocations for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
);
create policy transaction_project_allocations_update on public.transaction_project_allocations for update to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
) with check (exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id)));
create policy transaction_project_allocations_delete on public.transaction_project_allocations for delete to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
);

create policy project_budget_allocations_select on public.project_budget_allocations for select to authenticated using (
  exists (select 1 from public.monthly_budgets b where b.id = budget_id and public.is_workspace_member(b.workspace_id))
);
create policy project_budget_allocations_manage on public.project_budget_allocations for all to authenticated using (
  exists (select 1 from public.monthly_budgets b where b.id = budget_id and public.is_workspace_member(b.workspace_id))
) with check (created_by = (select auth.uid()) and exists (select 1 from public.monthly_budgets b where b.id = budget_id and public.is_workspace_member(b.workspace_id)));

create policy obligations_select on public.financial_obligations for select to authenticated using (public.is_workspace_member(workspace_id));
create policy obligations_insert on public.financial_obligations for insert to authenticated with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy obligations_update on public.financial_obligations for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy obligations_delete on public.financial_obligations for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin']));
create policy obligation_payments_select on public.financial_obligation_payments for select to authenticated using (
  exists (select 1 from public.financial_obligations o where o.id = obligation_id and public.is_workspace_member(o.workspace_id))
);
create policy obligation_payments_insert on public.financial_obligation_payments for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (select 1 from public.financial_obligations o where o.id = obligation_id and public.is_workspace_member(o.workspace_id))
);
create policy obligation_payments_delete on public.financial_obligation_payments for delete to authenticated using (
  exists (select 1 from public.financial_obligations o where o.id = obligation_id and public.is_workspace_member(o.workspace_id))
);

revoke all on table public.integration_connections, public.integration_connection_spaces, public.integration_access_logs from anon, authenticated;
grant select (id, workspace_id, application_key, display_name, status, permission_scopes, credential_prefix, created_by, last_accessed_at, revoked_at, expires_at, created_at, updated_at)
on public.integration_connections to authenticated;
grant select on public.integration_connection_spaces, public.integration_access_logs to authenticated;
grant all on public.integration_connections, public.integration_connection_spaces, public.integration_access_logs to service_role;

revoke all on table public.external_project_references, public.transaction_project_allocations, public.project_budget_allocations, public.financial_obligations, public.financial_obligation_payments from anon;
grant select, insert, update, delete on public.external_project_references, public.transaction_project_allocations, public.project_budget_allocations, public.financial_obligations to authenticated;
grant select, insert, delete on public.financial_obligation_payments to authenticated;
grant select on public.financial_obligation_balances to authenticated;

revoke all on function public.create_venture_os_integration(jsonb), public.rotate_integration_credential(uuid), public.revoke_integration_connection(uuid) from public, anon;
grant execute on function public.create_venture_os_integration(jsonb), public.rotate_integration_credential(uuid), public.revoke_integration_connection(uuid) to authenticated;

revoke all on function public.validate_business_transaction_classification(), public.validate_integration_space_authorization(), public.validate_external_project_reference(), public.validate_transaction_project_allocation(), public.validate_project_budget_allocation(), public.validate_financial_obligation(), public.validate_financial_obligation_payment() from public, anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.integration_connections;
  alter publication supabase_realtime add table public.integration_connection_spaces;
exception when duplicate_object then null;
end $$;

commit;
