-- MoneyYap classification architecture. This migration preserves every existing ID,
-- transaction, account, and membership while generalizing the tenant model.

drop view if exists public.account_balances;

alter table public.households rename to workspaces;
alter table public.household_members rename to workspace_members;
alter table public.workspace_members rename column household_id to workspace_id;
alter table public.accounts rename column household_id to workspace_id;
alter table public.categories rename column household_id to workspace_id;
alter table public.transactions rename column household_id to workspace_id;

alter function public.is_household_member(uuid) rename to is_workspace_member;
alter function public.has_household_role(uuid, text[]) rename to has_workspace_role;
alter function public.create_household_with_owner(text) rename to create_workspace_with_owner_legacy;

-- Keep the original SQL parameter names when replacing renamed functions.
-- PostgreSQL treats a parameter rename as a signature change in CREATE OR REPLACE.
create or replace function public.is_workspace_member(target_household_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_household_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_workspace_role(target_household_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_household_id and user_id = (select auth.uid()) and role = any(allowed_roles)
  );
$$;

create or replace function public.validate_account_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_user_id is not null and not exists (
    select 1 from public.workspace_members where workspace_id = new.workspace_id and user_id = new.owner_user_id
  ) then
    raise exception 'Account owner must be a workspace member';
  end if;
  return new;
end;
$$;

alter table public.workspaces rename constraint households_pkey to workspaces_pkey;
alter table public.workspace_members rename constraint household_members_pkey to workspace_members_pkey;
alter table public.workspace_members rename constraint household_members_household_id_user_id_key to workspace_members_workspace_id_user_id_key;

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  icon text not null default 'layers-outline',
  color text not null default '#35D6A2' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- Existing workspaces receive one neutral, editable Space named after the workspace.
insert into public.spaces (workspace_id, name, icon, color, sort_order, created_by)
select id, name, 'layers-outline', '#35D6A2', 0, created_by
from public.workspaces;

insert into public.space_members (space_id, user_id, role)
select s.id, wm.user_id, wm.role
from public.spaces s
join public.workspace_members wm on wm.workspace_id = s.workspace_id;

alter table public.accounts add column space_id uuid references public.spaces(id) on delete set null;

alter table public.categories add column space_id uuid references public.spaces(id) on delete cascade;
alter table public.categories add column parent_id uuid references public.categories(id) on delete restrict;
alter table public.categories add column sort_order integer not null default 0;
alter table public.categories add column is_archived boolean not null default false;
alter table public.categories add column updated_at timestamptz not null default now();

drop index if exists public.categories_scope_name_unique;

-- Convert global onboarding suggestions into workspace-owned, editable shared categories.
insert into public.categories (workspace_id, space_id, parent_id, name, type, icon, color, sort_order, is_system, is_archived)
select w.id, null, null, c.name, c.type, c.icon, c.color, row_number() over (partition by w.id order by c.name)::integer, false, false
from public.workspaces w
cross join public.categories c
where c.workspace_id is null
  and not exists (
    select 1 from public.categories existing
    where existing.workspace_id = w.id and lower(existing.name) = lower(c.name)
  );

update public.transactions t
set category_id = replacement.id
from public.categories legacy, public.categories replacement
where t.category_id = legacy.id
  and legacy.workspace_id is null
  and replacement.workspace_id = t.workspace_id
  and replacement.space_id is null
  and lower(replacement.name) = lower(legacy.name);

delete from public.categories where workspace_id is null;
alter table public.categories alter column workspace_id set not null;

create unique index categories_scope_parent_name_unique on public.categories (
  workspace_id,
  coalesce(space_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);

alter table public.transactions add column space_id uuid references public.spaces(id) on delete restrict;
update public.transactions t
set space_id = (
  select s.id from public.spaces s
  where s.workspace_id = t.workspace_id
  order by s.sort_order, s.created_at
  limit 1
);
alter table public.transactions alter column space_id set not null;
alter table public.transactions add column ai_confidence numeric(4,3) check (ai_confidence between 0 and 1);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text not null default '#68717D' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (transaction_id, tag_id)
);

create table public.classification_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  merchant_pattern text,
  account_id uuid references public.accounts(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merchant_pattern is not null or account_id is not null),
  check (space_id is not null or category_id is not null or tag_id is not null)
);

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric(16,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now()
);

create index spaces_workspace_sort_idx on public.spaces(workspace_id, is_archived, sort_order);
create index space_members_user_idx on public.space_members(user_id);
create index categories_workspace_space_sort_idx on public.categories(workspace_id, space_id, is_archived, sort_order);
create index categories_parent_idx on public.categories(parent_id) where parent_id is not null;
create index transactions_workspace_space_date_idx on public.transactions(workspace_id, space_id, transaction_date desc);
create index tags_workspace_idx on public.tags(workspace_id);
create index classification_rules_match_idx on public.classification_rules(workspace_id, is_active, priority);
create index transaction_splits_transaction_idx on public.transaction_splits(transaction_id);

create trigger spaces_set_updated_at before update on public.spaces for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger classification_rules_set_updated_at before update on public.classification_rules for each row execute function public.set_updated_at();

create or replace function public.validate_space_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.space_id is not null and not exists (
    select 1 from public.spaces s where s.id = new.space_id and s.workspace_id = new.workspace_id
  ) then
    raise exception 'Space must belong to the same workspace';
  end if;
  return new;
end;
$$;

create trigger validate_account_space before insert or update on public.accounts for each row execute function public.validate_space_scope();
create trigger validate_category_space before insert or update on public.categories for each row execute function public.validate_space_scope();

create or replace function public.validate_category_parent()
returns trigger language plpgsql set search_path = '' as $$
declare parent_workspace uuid; parent_space uuid; parent_type text; parent_parent uuid;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'A category cannot be its own parent'; end if;
  select workspace_id, space_id, type, parent_id into parent_workspace, parent_space, parent_type, parent_parent
  from public.categories where id = new.parent_id;
  if parent_workspace is distinct from new.workspace_id then raise exception 'Parent category must belong to the same workspace'; end if;
  if parent_space is distinct from new.space_id then raise exception 'Parent and child category scopes must match'; end if;
  if parent_type is distinct from new.type then raise exception 'Parent and child transaction types must match'; end if;
  if parent_parent is not null then raise exception 'Categories support at most two visible levels'; end if;
  return new;
end;
$$;

create trigger validate_category_parent before insert or update on public.categories for each row execute function public.validate_category_parent();

create or replace function public.validate_transaction_scope()
returns trigger language plpgsql set search_path = '' as $$
declare
  from_workspace uuid;
  from_active boolean;
  to_workspace uuid;
  to_active boolean;
  category_workspace uuid;
  category_space uuid;
  transaction_space_workspace uuid;
  transaction_space_archived boolean;
  destination_type text;
  category_archived boolean;
begin
  if tg_op = 'UPDATE' and (new.workspace_id is distinct from old.workspace_id or new.created_by is distinct from old.created_by) then
    raise exception 'Transaction workspace and creator cannot be changed';
  end if;
  select workspace_id, is_archived into transaction_space_workspace, transaction_space_archived from public.spaces where id = new.space_id;
  if transaction_space_workspace is distinct from new.workspace_id then raise exception 'Transaction Space must belong to its workspace'; end if;
  if transaction_space_archived and (tg_op = 'INSERT' or new.space_id is distinct from old.space_id) then raise exception 'New transactions cannot use an archived Space'; end if;
  if new.account_from_id is not null then
    select workspace_id, is_active into from_workspace, from_active from public.accounts where id = new.account_from_id;
    if from_workspace is distinct from new.workspace_id then raise exception 'Source account must belong to the transaction workspace'; end if;
    if not from_active and (tg_op = 'INSERT' or new.account_from_id is distinct from old.account_from_id) then raise exception 'New transactions cannot use a removed source account'; end if;
  end if;
  if new.account_to_id is not null then
    select workspace_id, type, is_active into to_workspace, destination_type, to_active from public.accounts where id = new.account_to_id;
    if to_workspace is distinct from new.workspace_id then raise exception 'Destination account must belong to the transaction workspace'; end if;
    if not to_active and (tg_op = 'INSERT' or new.account_to_id is distinct from old.account_to_id) then raise exception 'New transactions cannot use a removed destination account'; end if;
  end if;
  if new.type = 'credit_card_payment' and destination_type is distinct from 'credit_card' then
    raise exception 'Credit card payments must target a credit card account';
  end if;
  if new.category_id is not null then
    select workspace_id, space_id, is_archived into category_workspace, category_space, category_archived from public.categories where id = new.category_id;
    if category_workspace is distinct from new.workspace_id then raise exception 'Category must belong to the transaction workspace'; end if;
    if category_space is not null and category_space is distinct from new.space_id then raise exception 'Space-specific category does not match transaction Space'; end if;
    if category_archived and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then raise exception 'New transactions cannot use an archived category'; end if;
  end if;
  if new.paid_by_user_id is not null and not exists (
    select 1 from public.workspace_members where workspace_id = new.workspace_id and user_id = new.paid_by_user_id
  ) then raise exception 'Payer must be a workspace member'; end if;
  return new;
end;
$$;

create or replace function public.validate_transaction_tag_scope()
returns trigger language plpgsql set search_path = '' as $$
declare transaction_workspace uuid; tag_workspace uuid;
begin
  select workspace_id into transaction_workspace from public.transactions where id = new.transaction_id;
  select workspace_id into tag_workspace from public.tags where id = new.tag_id;
  if transaction_workspace is distinct from tag_workspace then raise exception 'Tag must belong to the transaction workspace'; end if;
  return new;
end;
$$;

create trigger validate_transaction_tag_scope before insert or update on public.transaction_tags for each row execute function public.validate_transaction_tag_scope();

create or replace function public.validate_classification_rule_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.account_id is not null and not exists (select 1 from public.accounts where id = new.account_id and workspace_id = new.workspace_id) then
    raise exception 'Rule account must belong to its workspace';
  end if;
  if new.space_id is not null and not exists (select 1 from public.spaces where id = new.space_id and workspace_id = new.workspace_id) then
    raise exception 'Rule Space must belong to its workspace';
  end if;
  if new.category_id is not null and not exists (select 1 from public.categories where id = new.category_id and workspace_id = new.workspace_id) then
    raise exception 'Rule category must belong to its workspace';
  end if;
  if new.tag_id is not null and not exists (select 1 from public.tags where id = new.tag_id and workspace_id = new.workspace_id) then
    raise exception 'Rule tag must belong to its workspace';
  end if;
  return new;
end;
$$;

create trigger validate_classification_rule_scope before insert or update on public.classification_rules for each row execute function public.validate_classification_rule_scope();

create or replace function public.validate_transaction_split_scope()
returns trigger language plpgsql set search_path = '' as $$
declare transaction_workspace uuid; transaction_space uuid; transaction_amount numeric; category_workspace uuid; category_space uuid; split_total numeric;
begin
  select workspace_id, space_id, amount into transaction_workspace, transaction_space, transaction_amount from public.transactions where id = new.transaction_id;
  select workspace_id, space_id into category_workspace, category_space from public.categories where id = new.category_id;
  if transaction_workspace is distinct from category_workspace then raise exception 'Split category must belong to the transaction workspace'; end if;
  if category_space is not null and category_space is distinct from transaction_space then raise exception 'Split category must match the transaction Space'; end if;
  select coalesce(sum(amount), 0) into split_total from public.transaction_splits where transaction_id = new.transaction_id and id <> new.id;
  if split_total + new.amount > transaction_amount then raise exception 'Split amounts cannot exceed the transaction amount'; end if;
  return new;
end;
$$;

create trigger validate_transaction_split_scope before insert or update on public.transaction_splits for each row execute function public.validate_transaction_split_scope();

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.classification_rules enable row level security;
alter table public.transaction_splits enable row level security;

create policy "workspace members read spaces" on public.spaces for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace members create spaces" on public.spaces for insert to authenticated with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy "workspace members update spaces" on public.spaces for update to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace admins delete unused spaces" on public.spaces for delete to authenticated using (public.has_workspace_role(workspace_id, array['owner','admin']));

create policy "workspace members read space membership" on public.space_members for select to authenticated using (
  exists (select 1 from public.spaces s where s.id = space_id and public.is_workspace_member(s.workspace_id))
);
create policy "workspace admins manage space membership" on public.space_members for all to authenticated using (
  exists (select 1 from public.spaces s where s.id = space_id and public.has_workspace_role(s.workspace_id, array['owner','admin']))
) with check (
  exists (select 1 from public.spaces s where s.id = space_id and public.has_workspace_role(s.workspace_id, array['owner','admin']))
);

create policy "workspace members manage tags" on public.tags for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace members read transaction tags" on public.transaction_tags for select to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
);
create policy "workspace members manage transaction tags" on public.transaction_tags for all to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
) with check (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
);
create policy "workspace members manage rules" on public.classification_rules for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "workspace members manage splits" on public.transaction_splits for all to authenticated using (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
) with check (
  exists (select 1 from public.transactions t where t.id = transaction_id and public.is_workspace_member(t.workspace_id))
);

create or replace view public.account_balances with (security_invoker = true) as
select
  a.*,
  a.opening_balance + coalesce(sum(
    case when t.account_to_id = a.id then t.amount else 0 end
    - case when t.account_from_id = a.id then t.amount else 0 end
  ), 0) as current_balance
from public.accounts a
left join public.transactions t on t.account_from_id = a.id or t.account_to_id = a.id
group by a.id;

grant select on public.account_balances to authenticated;

drop function public.create_workspace_with_owner_legacy(text);

create or replace function public.create_workspace_with_owner(workspace_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_workspace_id uuid;
  new_space_id uuid;
  food_id uuid := gen_random_uuid();
  transportation_id uuid := gen_random_uuid();
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(workspace_name)) not between 1 and 120 then raise exception 'Workspace name must be 1 to 120 characters'; end if;

  insert into public.workspaces (name, created_by) values (trim(workspace_name), current_user_id) returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, current_user_id, 'owner');
  insert into public.spaces (workspace_id, name, icon, color, created_by)
  values (new_workspace_id, trim(workspace_name), 'layers-outline', '#35D6A2', current_user_id)
  returning id into new_space_id;
  insert into public.space_members (space_id, user_id, role) values (new_space_id, current_user_id, 'owner');

  insert into public.categories (id, workspace_id, name, type, icon, color, sort_order, is_system)
  values
    (food_id, new_workspace_id, 'Food', 'expense', 'restaurant-outline', '#F2A44B', 0, false),
    (transportation_id, new_workspace_id, 'Transportation', 'expense', 'car-outline', '#4E93D8', 1, false),
    (gen_random_uuid(), new_workspace_id, 'Bills & Utilities', 'expense', 'flash-outline', '#6B70E8', 2, false),
    (gen_random_uuid(), new_workspace_id, 'Shopping', 'expense', 'bag-handle-outline', '#D96AA7', 3, false),
    (gen_random_uuid(), new_workspace_id, 'Income', 'income', 'wallet-outline', '#13A975', 4, false),
    (gen_random_uuid(), new_workspace_id, 'Other', 'expense', 'ellipsis-horizontal', '#68717D', 99, false);
  insert into public.categories (workspace_id, parent_id, name, type, icon, color, sort_order, is_system)
  values
    (new_workspace_id, food_id, 'Groceries', 'expense', 'basket-outline', '#35B987', 0, false),
    (new_workspace_id, food_id, 'Restaurants', 'expense', 'restaurant-outline', '#F2A44B', 1, false),
    (new_workspace_id, food_id, 'Coffee', 'expense', 'cafe-outline', '#A57B47', 2, false),
    (new_workspace_id, transportation_id, 'Fuel', 'expense', 'speedometer-outline', '#4E93D8', 0, false),
    (new_workspace_id, transportation_id, 'Grab / Taxi', 'expense', 'car-outline', '#4E93D8', 1, false);

  return new_workspace_id;
end;
$$;

revoke execute on function public.create_workspace_with_owner(text) from public;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles, public.workspaces, public.workspace_members, public.accounts, public.categories, public.transactions, public.spaces, public.space_members, public.tags, public.transaction_tags, public.classification_rules, public.transaction_splits to authenticated;
grant select on table public.account_balances to authenticated;
grant execute on function public.create_workspace_with_owner(text) to authenticated;

revoke execute on function public.is_workspace_member(uuid) from public;
revoke execute on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
