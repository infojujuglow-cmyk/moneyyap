create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_user_id uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  type text not null check (type in ('cash', 'bank', 'credit_card', 'ewallet', 'other')),
  institution text,
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(16,2) not null default 0,
  accent text not null default '#35D6A2' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('expense', 'income')),
  icon text not null default 'ellipsis-horizontal',
  color text not null default '#68717D' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  check ((household_id is null and is_system) or household_id is not null)
);

create unique index categories_scope_name_unique on public.categories (coalesce(household_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  paid_by_user_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('expense', 'income', 'transfer', 'credit_card_payment', 'refund')),
  amount numeric(16,2) not null check (amount > 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  merchant text,
  category_id uuid references public.categories(id) on delete set null,
  account_from_id uuid references public.accounts(id) on delete restrict,
  account_to_id uuid references public.accounts(id) on delete restrict,
  transaction_date timestamptz not null,
  notes text,
  original_message text,
  ai_parsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_from_id is null or account_to_id is null or account_from_id <> account_to_id),
  check (
    (type = 'expense' and account_from_id is not null and account_to_id is null)
    or (type in ('income', 'refund') and account_from_id is null and account_to_id is not null)
    or (type in ('transfer', 'credit_card_payment') and account_from_id is not null and account_to_id is not null)
  )
);

create index household_members_user_id_idx on public.household_members(user_id);
create index accounts_household_active_idx on public.accounts(household_id, is_active);
create index transactions_household_date_idx on public.transactions(household_id, transaction_date desc);
create index transactions_household_type_idx on public.transactions(household_id, type);
create index transactions_account_from_idx on public.transactions(account_from_id) where account_from_id is not null;
create index transactions_account_to_idx on public.transactions(account_to_id) where account_to_id is not null;
create index transactions_category_idx on public.transactions(category_id) where category_id is not null;
create index transactions_paid_by_idx on public.transactions(paid_by_user_id) where paid_by_user_id is not null;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger households_set_updated_at before update on public.households for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_household_member(target_household_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.has_household_role(target_household_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = (select auth.uid()) and role = any(allowed_roles)
  );
$$;

create or replace function public.validate_transaction_scope()
returns trigger language plpgsql set search_path = '' as $$
declare
  from_household uuid;
  to_household uuid;
  category_household uuid;
  destination_type text;
begin
  if tg_op = 'UPDATE' and (new.household_id is distinct from old.household_id or new.created_by is distinct from old.created_by) then
    raise exception 'Transaction household and creator cannot be changed';
  end if;
  if new.account_from_id is not null then
    select household_id into from_household from public.accounts where id = new.account_from_id;
    if from_household is distinct from new.household_id then raise exception 'Source account must belong to the transaction household'; end if;
  end if;
  if new.account_to_id is not null then
    select household_id, type into to_household, destination_type from public.accounts where id = new.account_to_id;
    if to_household is distinct from new.household_id then raise exception 'Destination account must belong to the transaction household'; end if;
  end if;
  if new.type = 'credit_card_payment' and destination_type is distinct from 'credit_card' then
    raise exception 'Credit card payments must target a credit card account';
  end if;
  if new.category_id is not null then
    select household_id into category_household from public.categories where id = new.category_id;
    if category_household is not null and category_household is distinct from new.household_id then raise exception 'Category must be system-wide or belong to the household'; end if;
  end if;
  if new.paid_by_user_id is not null and not exists (select 1 from public.household_members where household_id = new.household_id and user_id = new.paid_by_user_id) then
    raise exception 'Payer must be a household member';
  end if;
  return new;
end;
$$;

create trigger validate_transaction_scope before insert or update on public.transactions for each row execute function public.validate_transaction_scope();

create or replace function public.validate_account_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_user_id is not null and not exists (select 1 from public.household_members where household_id = new.household_id and user_id = new.owner_user_id) then
    raise exception 'Account owner must be a household member';
  end if;
  return new;
end;
$$;

create trigger validate_account_owner before insert or update on public.accounts for each row execute function public.validate_account_owner();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy "profiles readable by self and household peers" on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.household_members mine
    join public.household_members peer on peer.household_id = mine.household_id
    where mine.user_id = (select auth.uid()) and peer.user_id = profiles.id
  )
);
create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read households" on public.households for select to authenticated using (public.is_household_member(id));
create policy "users create households" on public.households for insert to authenticated with check (created_by = (select auth.uid()));
create policy "owners and admins update households" on public.households for update to authenticated using (public.has_household_role(id, array['owner','admin'])) with check (public.has_household_role(id, array['owner','admin']));
create policy "owners delete households" on public.households for delete to authenticated using (public.has_household_role(id, array['owner']));

create policy "members read membership" on public.household_members for select to authenticated using (public.is_household_member(household_id));
create policy "admins manage membership inserts" on public.household_members for insert to authenticated with check (public.has_household_role(household_id, array['owner','admin']));
create policy "admins manage membership updates" on public.household_members for update to authenticated using (public.has_household_role(household_id, array['owner','admin'])) with check (public.has_household_role(household_id, array['owner','admin']));
create policy "owners and admins remove members" on public.household_members for delete to authenticated using (public.has_household_role(household_id, array['owner','admin']) or user_id = (select auth.uid()));

create policy "members read accounts" on public.accounts for select to authenticated using (public.is_household_member(household_id));
create policy "members create accounts" on public.accounts for insert to authenticated with check (public.is_household_member(household_id));
create policy "members update accounts" on public.accounts for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "admins delete accounts" on public.accounts for delete to authenticated using (public.has_household_role(household_id, array['owner','admin']));

create policy "members read categories and everyone reads system categories" on public.categories for select to authenticated using (household_id is null or public.is_household_member(household_id));
create policy "members create household categories" on public.categories for insert to authenticated with check (household_id is not null and not is_system and public.is_household_member(household_id));
create policy "members update household categories" on public.categories for update to authenticated using (household_id is not null and not is_system and public.is_household_member(household_id)) with check (household_id is not null and not is_system and public.is_household_member(household_id));
create policy "admins delete household categories" on public.categories for delete to authenticated using (household_id is not null and not is_system and public.has_household_role(household_id, array['owner','admin']));

create policy "members read transactions" on public.transactions for select to authenticated using (public.is_household_member(household_id));
create policy "members create transactions" on public.transactions for insert to authenticated with check (created_by = (select auth.uid()) and public.is_household_member(household_id));
create policy "members update transactions" on public.transactions for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members delete transactions" on public.transactions for delete to authenticated using (public.is_household_member(household_id));

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
revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.has_household_role(uuid, text[]) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.has_household_role(uuid, text[]) to authenticated;

create or replace function public.create_household_with_owner(household_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_household_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(household_name)) not between 1 and 120 then raise exception 'Household name must be 1 to 120 characters'; end if;
  insert into public.households (name, created_by) values (trim(household_name), current_user_id) returning id into new_household_id;
  insert into public.household_members (household_id, user_id, role) values (new_household_id, current_user_id, 'owner');
  return new_household_id;
end;
$$;

revoke execute on function public.create_household_with_owner(text) from public;
grant execute on function public.create_household_with_owner(text) to authenticated;

insert into public.categories (id, household_id, name, type, icon, color, is_system) values
  ('10000000-0000-4000-8000-000000000001', null, 'Groceries', 'expense', 'basket-outline', '#35B987', true),
  ('10000000-0000-4000-8000-000000000002', null, 'Bills & Utilities', 'expense', 'flash-outline', '#6B70E8', true),
  ('10000000-0000-4000-8000-000000000003', null, 'Food & Dining', 'expense', 'restaurant-outline', '#F2A44B', true),
  ('10000000-0000-4000-8000-000000000004', null, 'Transport', 'expense', 'car-outline', '#4E93D8', true),
  ('10000000-0000-4000-8000-000000000005', null, 'Shopping', 'expense', 'bag-handle-outline', '#D96AA7', true),
  ('10000000-0000-4000-8000-000000000006', null, 'Home', 'expense', 'home-outline', '#7C8B6A', true),
  ('10000000-0000-4000-8000-000000000007', null, 'Income', 'income', 'wallet-outline', '#13A975', true),
  ('10000000-0000-4000-8000-000000000008', null, 'Other', 'expense', 'ellipsis-horizontal', '#68717D', true)
on conflict (id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.transactions;
  alter publication supabase_realtime add table public.accounts;
exception when duplicate_object then null;
end $$;
