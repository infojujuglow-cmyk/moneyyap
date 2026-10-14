-- Separate financial effect from payment rail, and persist ownership/counterparty intelligence.

create table public.counterparties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 160),
  normalized_name text not null check (char_length(normalized_name) between 1 and 180),
  type text not null default 'unknown' check (type in ('person', 'merchant', 'vendor', 'own_account', 'unknown')),
  identifiers jsonb not null default '{}'::jsonb check (jsonb_typeof(identifiers) = 'object'),
  owned_account_id uuid references public.accounts(id) on delete set null,
  default_category_id uuid references public.categories(id) on delete set null,
  default_classification text check (default_classification in ('expense', 'income', 'internal_transfer', 'adjustment')),
  confidence numeric(4,3) not null default 0.500 check (confidence between 0 and 1),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, normalized_name)
);

create table public.account_identifiers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  kind text not null check (kind in ('account_name', 'account_alias', 'account_last4', 'mobile', 'external_identifier')),
  normalized_value text not null check (char_length(normalized_value) between 1 and 180),
  institution text,
  confidence numeric(4,3) not null default 1.000 check (confidence between 0 and 1),
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, account_id, kind, normalized_value)
);

alter table public.transactions
  add column financial_effect text,
  add column payment_rail text not null default 'unknown',
  add column counterparty_id uuid references public.counterparties(id) on delete set null,
  add column counterparty_name text,
  add column ownership_status text not null default 'unknown',
  add column bank_transaction_label text,
  add column reference_number text,
  add column raw_extraction jsonb,
  add column classification_review_required boolean not null default false;

update public.transactions
set financial_effect = case
  when type = 'expense' then 'expense'
  when type in ('income', 'refund') then 'income'
  when type in ('transfer', 'credit_card_payment') then 'internal_transfer'
  else 'adjustment'
end;

update public.transactions
set ownership_status = case
  when type in ('transfer', 'credit_card_payment') then 'owned'
  else 'external'
end;

-- Legacy AI-created transfers were classified before ownership-aware matching existed.
-- Keep their history intact but require explicit review instead of silently trusting them.
update public.transactions
set classification_review_required = true
where ai_parsed and type in ('transfer', 'credit_card_payment');

alter table public.transactions
  alter column financial_effect set not null,
  add constraint transactions_financial_effect_check check (financial_effect in ('expense', 'income', 'internal_transfer', 'adjustment')),
  add constraint transactions_payment_rail_check check (payment_rail in ('bank_transfer', 'instapay', 'pesonet', 'gcash', 'maya', 'cash', 'debit_card', 'credit_card', 'other', 'unknown')),
  add constraint transactions_ownership_status_check check (ownership_status in ('owned', 'external', 'unknown'));

insert into public.account_identifiers (workspace_id, account_id, kind, normalized_value, institution, confidence)
select workspace_id, id, 'account_name', lower(regexp_replace(name, '[^[:alnum:]]', '', 'g')), institution, 1
from public.accounts
where length(lower(regexp_replace(name, '[^[:alnum:]]', '', 'g'))) > 0
on conflict do nothing;

create index counterparties_workspace_name_idx on public.counterparties(workspace_id, normalized_name);
create index counterparties_owned_account_idx on public.counterparties(owned_account_id) where owned_account_id is not null;
create index account_identifiers_lookup_idx on public.account_identifiers(workspace_id, kind, normalized_value);
create index transactions_counterparty_idx on public.transactions(counterparty_id) where counterparty_id is not null;
create index transactions_financial_effect_idx on public.transactions(workspace_id, financial_effect, transaction_date desc);

create trigger counterparties_set_updated_at before update on public.counterparties for each row execute function public.set_updated_at();
create trigger account_identifiers_set_updated_at before update on public.account_identifiers for each row execute function public.set_updated_at();

create or replace function public.validate_counterparty_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owned_account_id is not null and not exists (
    select 1 from public.accounts where id = new.owned_account_id and workspace_id = new.workspace_id
  ) then raise exception 'Owned counterparty account must belong to the same workspace'; end if;
  if new.default_category_id is not null and not exists (
    select 1 from public.categories where id = new.default_category_id and workspace_id = new.workspace_id
  ) then raise exception 'Counterparty category must belong to the same workspace'; end if;
  return new;
end;
$$;

create trigger validate_counterparty_scope before insert or update on public.counterparties for each row execute function public.validate_counterparty_scope();

create or replace function public.validate_account_identifier_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.accounts where id = new.account_id and workspace_id = new.workspace_id) then
    raise exception 'Account identifier must belong to the same workspace';
  end if;
  return new;
end;
$$;

create trigger validate_account_identifier_scope before insert or update on public.account_identifiers for each row execute function public.validate_account_identifier_scope();

create or replace function public.validate_transaction_classification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.financial_effect is null then
    new.financial_effect = case
      when new.type = 'expense' then 'expense'
      when new.type in ('income', 'refund') then 'income'
      when new.type in ('transfer', 'credit_card_payment') then 'internal_transfer'
      else 'adjustment'
    end;
  end if;
  if new.financial_effect = 'expense' and (new.type <> 'expense' or new.account_from_id is null or new.account_to_id is not null) then
    raise exception 'Expense classification requires one source account and no destination account';
  end if;
  if new.financial_effect = 'income' and (new.type not in ('income', 'refund') or new.account_from_id is not null or new.account_to_id is null) then
    raise exception 'Income classification requires one destination account and no source account';
  end if;
  if new.financial_effect = 'internal_transfer' and (new.type not in ('transfer', 'credit_card_payment') or new.account_from_id is null or new.account_to_id is null) then
    raise exception 'Internal transfers require two owned accounts';
  end if;
  if new.financial_effect = 'internal_transfer' and new.ownership_status <> 'owned' then
    raise exception 'Internal transfers require confirmed owned-account status';
  end if;
  if new.financial_effect = 'adjustment' and ((new.account_from_id is null) = (new.account_to_id is null)) then
    raise exception 'Adjustments require exactly one affected account';
  end if;
  if new.counterparty_id is not null and not exists (
    select 1 from public.counterparties where id = new.counterparty_id and workspace_id = new.workspace_id
  ) then raise exception 'Counterparty must belong to the same workspace'; end if;
  return new;
end;
$$;

create trigger validate_transaction_classification before insert or update on public.transactions for each row execute function public.validate_transaction_classification();

alter table public.counterparties enable row level security;
alter table public.account_identifiers enable row level security;

create policy "workspace members manage counterparties" on public.counterparties for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create policy "workspace members manage account identifiers" on public.account_identifiers for all to authenticated
using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on table public.counterparties to authenticated;
grant select, insert, update, delete on table public.account_identifiers to authenticated;
