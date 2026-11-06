alter table public.accounts
  add column if not exists provider_key text,
  add column if not exists visual_type text,
  add column if not exists account_last4 text,
  add column if not exists credit_limit numeric(18, 2);

alter table public.accounts
  drop constraint if exists accounts_visual_type_check,
  add constraint accounts_visual_type_check check (
    visual_type is null or visual_type in ('debit', 'checking', 'savings', 'credit_card', 'ewallet', 'cash', 'other')
  ),
  drop constraint if exists accounts_last4_check,
  add constraint accounts_last4_check check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
  drop constraint if exists accounts_credit_limit_check,
  add constraint accounts_credit_limit_check check (credit_limit is null or credit_limit >= 0);

comment on column public.accounts.provider_key is 'Non-sensitive provider identifier used for account branding.';
comment on column public.accounts.visual_type is 'Presentation subtype; accounting behavior continues to use accounts.type.';
comment on column public.accounts.account_last4 is 'Optional final four digits only. Full account or card numbers must never be stored here.';
comment on column public.accounts.credit_limit is 'Optional credit limit used only for display and available-credit calculation.';

update public.accounts
set visual_type = case type
  when 'credit_card' then 'credit_card'
  when 'ewallet' then 'ewallet'
  when 'cash' then 'cash'
  when 'bank' then 'savings'
  else 'other'
end
where visual_type is null;

update public.accounts
set provider_key = case
  when lower(trim(institution)) in ('bpi', 'bank of the philippine islands') then 'bpi'
  when lower(trim(institution)) in ('bdo', 'banco de oro') then 'bdo'
  when lower(trim(institution)) like 'metrobank%' or lower(trim(institution)) like 'metropolitan bank%' then 'metrobank'
  when lower(trim(institution)) in ('unionbank', 'union bank') then 'unionbank'
  when lower(trim(institution)) in ('rcbc', 'rizal commercial banking corporation') then 'rcbc'
  when lower(replace(trim(institution), ' ', '')) = 'securitybank' then 'security-bank'
  when lower(trim(institution)) in ('landbank', 'land bank', 'land bank of the philippines') then 'landbank'
  when lower(trim(institution)) in ('maya', 'paymaya') then 'maya'
  when lower(trim(institution)) in ('gcash', 'g-cash') then 'gcash'
  when lower(trim(institution)) in ('chinabank', 'china bank') then 'chinabank'
  when lower(trim(institution)) = 'pnb' then 'pnb'
  when lower(replace(trim(institution), ' ', '')) = 'eastwest' then 'eastwest'
  else provider_key
end
where provider_key is null and institution is not null;

drop view if exists public.account_balances;
create view public.account_balances with (security_invoker = true) as
select a.*, a.opening_balance + private.account_activity_total(a.id, a.workspace_id) as current_balance
from public.accounts a;

grant select on public.account_balances to authenticated;
