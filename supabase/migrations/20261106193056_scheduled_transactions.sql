-- Schedules are projections; only recorded occurrences create ledger transactions.
alter table public.workspaces add column if not exists timezone text not null default 'Asia/Manila';

create table public.scheduled_transactions (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160),
  type text not null check (type in ('expense','income','transfer','credit_card_payment')),
  amount numeric(16,2) not null check (amount > 0),
  currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  account_from_id uuid references public.accounts(id) on delete restrict,
  account_to_id uuid references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  notes text,
  frequency text not null check (frequency in ('once','daily','weekly','biweekly','monthly','quarterly','semiannual','yearly')),
  starts_on date not null,
  ends_on date,
  max_occurrences integer check (max_occurrences is null or max_occurrences > 0),
  anchor_day integer check (anchor_day between 1 and 31),
  last_day_of_month boolean not null default false,
  timezone text not null default 'Asia/Manila',
  recording_mode text not null default 'manual' check (recording_mode in ('manual','auto')),
  reminder_days integer[] not null default array[0,1],
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  next_occurrence_number integer not null default 1,
  next_due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint scheduled_accounts_check check (
    (type='expense' and account_from_id is not null and account_to_id is null)
    or (type='income' and account_from_id is null and account_to_id is not null)
    or (type in ('transfer','credit_card_payment') and account_from_id is not null and account_to_id is not null and account_from_id <> account_to_id)
  ),
  constraint scheduled_category_check check (type in ('expense','income') or category_id is null),
  constraint scheduled_reminders_check check (reminder_days <@ array[0,1,3,7]::integer[])
);
create index scheduled_transactions_workspace_idx on public.scheduled_transactions(workspace_id,space_id,status,next_due_on);
create index scheduled_transactions_due_idx on public.scheduled_transactions(status,next_due_on) where next_due_on is not null;
create index scheduled_transactions_series_idx on public.scheduled_transactions(series_id);
create trigger scheduled_transactions_updated_at before update on public.scheduled_transactions
for each row execute function public.set_updated_at();

create table public.scheduled_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.scheduled_transactions(id) on delete cascade,
  occurrence_number integer not null check (occurrence_number > 0),
  original_due_on date not null,
  due_on date not null,
  status text not null default 'pending' check (status in ('pending','skipped','recorded')),
  amount_override numeric(16,2) check (amount_override > 0),
  account_from_override uuid references public.accounts(id) on delete restrict,
  account_to_override uuid references public.accounts(id) on delete restrict,
  category_override uuid references public.categories(id) on delete restrict,
  notes_override text,
  transaction_id uuid unique references public.transactions(id) on delete set null,
  recorded_at timestamptz,
  recorded_automatically boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, occurrence_number),
  constraint recorded_link_check check ((status='recorded') = (transaction_id is not null))
);
create index scheduled_occurrences_due_idx on public.scheduled_occurrences(status,due_on);
create trigger scheduled_occurrences_updated_at before update on public.scheduled_occurrences
for each row execute function public.set_updated_at();

create table public.scheduled_reminders (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.scheduled_occurrences(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  days_before integer not null check (days_before in (-1,0,1,3,7)),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (occurrence_id,user_id,days_before)
);
create index scheduled_reminders_user_idx on public.scheduled_reminders(user_id,read_at,created_at desc);

create or replace function private.schedule_date(p_start date,p_frequency text,p_number integer,p_anchor integer,p_last_day boolean)
returns date language plpgsql immutable set search_path='' as $$
declare month_start date; months_between integer; days_in_month integer;
begin
  if p_number < 1 then raise exception 'Occurrence number must be positive'; end if;
  if p_number=1 then return p_start; end if;
  if p_frequency='once' then return case when p_number=1 then p_start else null end; end if;
  if p_frequency='daily' then return p_start + (p_number-1); end if;
  if p_frequency='weekly' then return p_start + 7*(p_number-1); end if;
  if p_frequency='biweekly' then return p_start + 14*(p_number-1); end if;
  months_between := case p_frequency when 'monthly' then 1 when 'quarterly' then 3 when 'semiannual' then 6 when 'yearly' then 12 else null end;
  if months_between is null then raise exception 'Unsupported frequency'; end if;
  month_start := (date_trunc('month',p_start)::date + make_interval(months=>months_between*(p_number-1)))::date;
  days_in_month := extract(day from (month_start + interval '1 month - 1 day'))::integer;
  return month_start + (case when p_last_day then days_in_month else least(coalesce(p_anchor,extract(day from p_start)::integer),days_in_month) end)-1;
end;
$$;

create or replace function public.validate_scheduled_transaction()
returns trigger language plpgsql set search_path='' as $$
declare target_space uuid; category_type text; category_space uuid; source_type text; destination_type text; account_workspace uuid; account_owner uuid; workspace_timezone text;
begin
  if tg_op='UPDATE' then
    if new.workspace_id<>old.workspace_id or new.created_by<>old.created_by or new.series_id<>old.series_id then
      raise exception 'Schedule ownership cannot change';
    end if;
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone'; end if;
  select timezone into workspace_timezone from public.workspaces where id=new.workspace_id;
  if new.timezone is distinct from workspace_timezone then raise exception 'Schedule timezone must match workspace timezone'; end if;
  if new.frequency='once' and new.max_occurrences is not null and new.max_occurrences<>1 then raise exception 'One-time schedules have one occurrence'; end if;
  if tg_op='INSERT' and new.recording_mode='auto' and new.starts_on<(now() at time zone new.timezone)::date then raise exception 'Auto-record schedules must start today or later'; end if;
  select workspace_id into target_space from public.spaces where id=new.space_id and not is_archived;
  if target_space is distinct from new.workspace_id then raise exception 'Choose an active Space in this workspace'; end if;
  if new.category_id is not null then
    select type,space_id into category_type,category_space from public.categories where id=new.category_id and not is_archived;
    if category_type is distinct from new.type or category_space is distinct from new.space_id then raise exception 'Category must match type and Space'; end if;
  end if;
  if new.account_from_id is not null then
    select workspace_id,owner_user_id,type into account_workspace,account_owner,source_type from public.accounts where id=new.account_from_id and is_active;
    if account_workspace is distinct from new.workspace_id or (account_owner is not null and account_owner<>new.created_by) then raise exception 'Source account is unavailable'; end if;
  end if;
  if new.account_to_id is not null then
    select workspace_id,owner_user_id,type into account_workspace,account_owner,destination_type from public.accounts where id=new.account_to_id and is_active;
    if account_workspace is distinct from new.workspace_id or (account_owner is not null and account_owner<>new.created_by) then raise exception 'Destination account is unavailable'; end if;
  end if;
  if new.type='credit_card_payment' and destination_type is distinct from 'credit_card' then raise exception 'Card payment needs a credit card destination'; end if;
  if new.type='credit_card_payment' and source_type='credit_card' then raise exception 'Card payment source must be bank or cash'; end if;
  if tg_op='UPDATE' then
    if old.status='cancelled' and new.status<>'cancelled' then raise exception 'Cancelled schedules cannot be resumed'; end if;
  end if;
  if tg_op='INSERT' then new.next_due_on:=new.starts_on; new.next_occurrence_number:=1; end if;
  return new;
end;
$$;
create trigger scheduled_transactions_validate before insert or update on public.scheduled_transactions
for each row execute function public.validate_scheduled_transaction();

create or replace function public.validate_scheduled_occurrence()
returns trigger language plpgsql set search_path='' as $$
declare template public.scheduled_transactions%rowtype; target_workspace uuid; target_owner uuid; category_type text; category_space uuid;
begin
  select * into template from public.scheduled_transactions where id=new.schedule_id;
  if not found then raise exception 'Schedule not found'; end if;
  if tg_op='UPDATE' then
    if new.schedule_id<>old.schedule_id or new.occurrence_number<>old.occurrence_number or new.original_due_on<>old.original_due_on then raise exception 'Occurrence identity cannot change'; end if;
  end if;
  if tg_op='UPDATE' then
    if current_user <> 'postgres' and (new.status='recorded' or old.status='recorded') then raise exception 'Recorded occurrences are managed by the recording function'; end if;
  elsif current_user <> 'postgres' and new.status='recorded' then
    raise exception 'Recorded occurrences are managed by the recording function';
  end if;
  if new.account_from_override is not null then
    select workspace_id,owner_user_id into target_workspace,target_owner from public.accounts where id=new.account_from_override and is_active;
    if target_workspace is distinct from template.workspace_id or (target_owner is not null and target_owner<>template.created_by) then raise exception 'Source override is unavailable'; end if;
  end if;
  if new.account_to_override is not null then
    select workspace_id,owner_user_id into target_workspace,target_owner from public.accounts where id=new.account_to_override and is_active;
    if target_workspace is distinct from template.workspace_id or (target_owner is not null and target_owner<>template.created_by) then raise exception 'Destination override is unavailable'; end if;
  end if;
  if new.category_override is not null then
    select type,space_id into category_type,category_space from public.categories where id=new.category_override and not is_archived;
    if category_type is distinct from template.type or category_space is distinct from template.space_id then raise exception 'Category override must match type and Space'; end if;
  end if;
  return new;
end;
$$;
create trigger scheduled_occurrences_validate before insert or update on public.scheduled_occurrences
for each row execute function public.validate_scheduled_occurrence();

alter table public.scheduled_transactions enable row level security;
alter table public.scheduled_occurrences enable row level security;
alter table public.scheduled_reminders enable row level security;
revoke all on public.scheduled_transactions,public.scheduled_occurrences,public.scheduled_reminders from anon,authenticated;
grant select,insert,update(status) on public.scheduled_transactions to authenticated;
grant select,update(due_on,status,amount_override,account_from_override,account_to_override,category_override,notes_override) on public.scheduled_occurrences to authenticated;
grant select,update(read_at) on public.scheduled_reminders to authenticated;

create or replace function private.can_access_schedule(p_schedule_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.scheduled_transactions s
    where s.id=p_schedule_id and public.is_workspace_member(s.workspace_id)
      and (s.account_from_id is null or private.can_access_account(s.account_from_id,s.workspace_id))
      and (s.account_to_id is null or private.can_access_account(s.account_to_id,s.workspace_id)));
$$;
revoke all on function private.can_access_schedule(uuid) from public,anon;
grant execute on function private.can_access_schedule(uuid) to authenticated;

create or replace function private.can_access_occurrence(p_occurrence_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.scheduled_occurrences o
    join public.scheduled_transactions s on s.id=o.schedule_id
    where o.id=p_occurrence_id and private.can_access_schedule(s.id)
      and (o.account_from_override is null or private.can_access_account(o.account_from_override,s.workspace_id))
      and (o.account_to_override is null or private.can_access_account(o.account_to_override,s.workspace_id)));
$$;
revoke all on function private.can_access_occurrence(uuid) from public,anon;
grant execute on function private.can_access_occurrence(uuid) to authenticated;

create policy scheduled_select on public.scheduled_transactions for select to authenticated using (
  public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id,workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id,workspace_id)));
create policy scheduled_insert on public.scheduled_transactions for insert to authenticated with check (
  created_by=(select auth.uid()) and public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id,workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id,workspace_id)));
create policy scheduled_update on public.scheduled_transactions for update to authenticated using (
  created_by=(select auth.uid()) and public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id,workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id,workspace_id)))
  with check (created_by=(select auth.uid()) and public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id,workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id,workspace_id)));
create policy occurrence_select on public.scheduled_occurrences for select to authenticated using (private.can_access_occurrence(id));
create policy occurrence_insert on public.scheduled_occurrences for insert to authenticated with check (private.can_access_schedule(schedule_id));
create policy occurrence_update on public.scheduled_occurrences for update to authenticated using (private.can_access_occurrence(id)) with check (private.can_access_occurrence(id));
create policy reminder_select on public.scheduled_reminders for select to authenticated using (user_id=(select auth.uid()) and private.can_access_occurrence(occurrence_id));
create policy reminder_read on public.scheduled_reminders for update to authenticated using (user_id=(select auth.uid()) and private.can_access_occurrence(occurrence_id)) with check (user_id=(select auth.uid()));

-- Generate a bounded horizon. Unique occurrence numbers and row locks make retries safe.
create or replace function private.materialize_schedules(p_horizon date,p_workspace uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.scheduled_transactions%rowtype; due date; made integer:=0; n integer;
begin
  for s in select * from public.scheduled_transactions where status='active' and next_due_on<=p_horizon and (p_workspace is null or workspace_id=p_workspace) for update skip locked loop
    n:=0;
    while s.next_due_on is not null and s.next_due_on<=p_horizon and n<5000 loop
      if (s.ends_on is not null and s.next_due_on>s.ends_on) or (s.max_occurrences is not null and s.next_occurrence_number>s.max_occurrences) then
        s.next_due_on:=null; exit;
      end if;
      insert into public.scheduled_occurrences(schedule_id,occurrence_number,original_due_on,due_on)
      values(s.id,s.next_occurrence_number,s.next_due_on,s.next_due_on) on conflict(schedule_id,occurrence_number) do nothing;
      made:=made+1; n:=n+1;
      s.next_occurrence_number:=s.next_occurrence_number+1;
      s.next_due_on:=private.schedule_date(s.starts_on,s.frequency,s.next_occurrence_number,s.anchor_day,s.last_day_of_month);
    end loop;
    update public.scheduled_transactions set next_occurrence_number=s.next_occurrence_number,next_due_on=s.next_due_on where id=s.id;
  end loop;
  return made;
end;
$$;
revoke all on function private.materialize_schedules(date,uuid) from public,anon,authenticated;

create or replace function private.prepare_new_schedule()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.materialize_schedules((now()+interval '45 days')::date,new.workspace_id);
  return new;
end;
$$;
create trigger scheduled_transactions_prepare after insert on public.scheduled_transactions
for each row execute function private.prepare_new_schedule();

create or replace function public.ensure_scheduled_occurrence(p_schedule_id uuid,p_number integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.scheduled_transactions%rowtype; due date; result_id uuid;
begin
  if auth.uid() is null or not private.can_access_schedule(p_schedule_id) then raise exception 'Schedule access denied'; end if;
  select * into s from public.scheduled_transactions where id=p_schedule_id;
  if s.status<>'active' then raise exception 'Schedule is not active'; end if;
  if p_number<1 or p_number>5000 or (s.max_occurrences is not null and p_number>s.max_occurrences) then raise exception 'Occurrence is outside the schedule'; end if;
  due:=private.schedule_date(s.starts_on,s.frequency,p_number,s.anchor_day,s.last_day_of_month);
  if due is null or (s.ends_on is not null and due>s.ends_on) then raise exception 'Occurrence is outside the schedule'; end if;
  insert into public.scheduled_occurrences(schedule_id,occurrence_number,original_due_on,due_on)
  values(s.id,p_number,due,due) on conflict(schedule_id,occurrence_number) do nothing;
  select id into result_id from public.scheduled_occurrences where schedule_id=s.id and occurrence_number=p_number;
  return result_id;
end;
$$;
revoke all on function public.ensure_scheduled_occurrence(uuid,integer) from public,anon;
grant execute on function public.ensure_scheduled_occurrence(uuid,integer) to authenticated;

-- One atomic path for manual and automatic recording. The unique transaction link
-- and locked occurrence prevent duplicate ledger entries from retries or devices.
create or replace function private.post_scheduled_occurrence(p_id uuid,p_actor uuid,p_auto boolean,p_amount numeric default null,p_from uuid default null,p_to uuid default null,p_category uuid default null,p_when timestamptz default null,p_existing uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.scheduled_occurrences%rowtype; s public.scheduled_transactions%rowtype; result_id uuid; from_id uuid; to_id uuid; category_id uuid; entered_at timestamptz; target_owner uuid; target_active boolean;
begin
  select * into o from public.scheduled_occurrences where id=p_id for update;
  if not found then raise exception 'Occurrence not found'; end if;
  select * into s from public.scheduled_transactions where id=o.schedule_id;
  if o.status='recorded' then return o.transaction_id; end if;
  if o.status='skipped' or s.status='cancelled' then raise exception 'This occurrence cannot be recorded'; end if;
  if p_auto and (s.status<>'active' or s.recording_mode<>'auto' or o.due_on>(now() at time zone s.timezone)::date) then raise exception 'Auto-recording is not due'; end if;
  if p_actor is not null and (not exists(select 1 from public.workspace_members where workspace_id=s.workspace_id and user_id=p_actor)
    or (s.account_from_id is not null and not private.can_access_account(s.account_from_id,s.workspace_id))
    or (s.account_to_id is not null and not private.can_access_account(s.account_to_id,s.workspace_id))) then raise exception 'Schedule access denied'; end if;
  if not exists(select 1 from public.workspace_members where workspace_id=s.workspace_id and user_id=s.created_by) then raise exception 'Schedule creator no longer belongs to workspace'; end if;
  if p_existing is not null then
    select id into result_id from public.transactions where id=p_existing and workspace_id=s.workspace_id and space_id=s.space_id and type=s.type and created_by=p_actor
      and amount=coalesce(o.amount_override,s.amount)
      and account_from_id is not distinct from coalesce(o.account_from_override,s.account_from_id)
      and account_to_id is not distinct from coalesce(o.account_to_override,s.account_to_id)
      and abs((transaction_date::date-o.due_on))<=7;
    if result_id is null then raise exception 'Existing transaction does not match this schedule'; end if;
    if exists(select 1 from public.scheduled_occurrences where transaction_id=result_id and id<>p_id) then raise exception 'Transaction is already linked to another schedule'; end if;
  else
    from_id:=coalesce(p_from,o.account_from_override,s.account_from_id);
    to_id:=coalesce(p_to,o.account_to_override,s.account_to_id);
    category_id:=coalesce(p_category,o.category_override,s.category_id);
    if from_id is not null then
      select owner_user_id,is_active into target_owner,target_active from public.accounts where id=from_id and workspace_id=s.workspace_id;
      if not coalesce(target_active,false) or (target_owner is not null and target_owner<>coalesce(p_actor,s.created_by)) then raise exception 'Source account unavailable'; end if;
    end if;
    if to_id is not null then
      select owner_user_id,is_active into target_owner,target_active from public.accounts where id=to_id and workspace_id=s.workspace_id;
      if not coalesce(target_active,false) or (target_owner is not null and target_owner<>coalesce(p_actor,s.created_by)) then raise exception 'Destination account unavailable'; end if;
    end if;
    entered_at:=coalesce(p_when,case when p_auto then o.due_on::timestamp at time zone s.timezone else now() end);
    insert into public.transactions(workspace_id,space_id,created_by,type,financial_effect,ownership_status,amount,currency,merchant,counterparty_name,category_id,account_from_id,account_to_id,transaction_date,notes,original_message,ai_parsed)
    values(s.workspace_id,s.space_id,coalesce(p_actor,s.created_by),s.type,
      case s.type when 'expense' then 'expense' when 'income' then 'income' else 'internal_transfer' end,
      case when s.type in ('transfer','credit_card_payment') then 'owned' else 'external' end,
      coalesce(p_amount,o.amount_override,s.amount),s.currency,case when s.type='income' then null else s.name end,s.name,
      category_id,from_id,to_id,entered_at,coalesce(o.notes_override,s.notes),
      case when p_auto then 'Automatically recorded in MoneyYap from a schedule; external payment not confirmed.' else 'Recorded from a MoneyYap schedule.' end,false)
    returning id into result_id;
  end if;
  update public.scheduled_occurrences set status='recorded',transaction_id=result_id,recorded_at=now(),recorded_automatically=p_auto where id=p_id;
  return result_id;
end;
$$;
revoke all on function private.post_scheduled_occurrence(uuid,uuid,boolean,numeric,uuid,uuid,uuid,timestamptz,uuid) from public,anon,authenticated;

create or replace function public.record_scheduled_occurrence(p_id uuid,p_amount numeric default null,p_from uuid default null,p_to uuid default null,p_category uuid default null,p_when timestamptz default null,p_existing uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare schedule_id uuid;
begin
  select o.schedule_id into schedule_id from public.scheduled_occurrences o where o.id=p_id;
  if schedule_id is null or not private.can_access_occurrence(p_id) then raise exception 'Schedule access denied'; end if;
  return private.post_scheduled_occurrence(p_id,auth.uid(),false,p_amount,p_from,p_to,p_category,p_when,p_existing);
end;
$$;
revoke all on function public.record_scheduled_occurrence(uuid,numeric,uuid,uuid,uuid,timestamptz,uuid) from public,anon;
grant execute on function public.record_scheduled_occurrence(uuid,numeric,uuid,uuid,uuid,timestamptz,uuid) to authenticated;

-- Split a recurrence from one occurrence forward. Earlier and recorded rows stay
-- attached to the original template; the new template keeps the same series ID.
create or replace function public.edit_scheduled_future(p_occurrence_id uuid,p_changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare o public.scheduled_occurrences%rowtype; s public.scheduled_transactions%rowtype; next_id uuid; next_start date; next_max integer;
begin
  select * into o from public.scheduled_occurrences where id=p_occurrence_id for update;
  if not found then raise exception 'Occurrence not found'; end if;
  select * into s from public.scheduled_transactions where id=o.schedule_id for update;
  if auth.uid() is null or s.created_by<>auth.uid() or not private.can_access_schedule(s.id) then raise exception 'Only the schedule creator can edit future occurrences'; end if;
  if o.status='recorded' or exists(select 1 from public.scheduled_occurrences where schedule_id=s.id and occurrence_number>=o.occurrence_number and status='recorded') then raise exception 'Recorded future occurrences must remain on their original schedule'; end if;
  if s.status='cancelled' then raise exception 'Cancelled schedule cannot be edited'; end if;
  next_start:=coalesce((p_changes->>'starts_on')::date,o.due_on);
  if next_start<o.due_on then raise exception 'The new series cannot start before the selected occurrence'; end if;
  next_max:=case when p_changes ? 'max_occurrences' then (p_changes->>'max_occurrences')::integer when s.max_occurrences is null then null else s.max_occurrences-o.occurrence_number+1 end;
  if next_max is not null and next_max<1 then raise exception 'No occurrences remain'; end if;
  delete from public.scheduled_occurrences where schedule_id=s.id and occurrence_number>=o.occurrence_number and status<>'recorded';
  update public.scheduled_transactions set
    status=case when o.occurrence_number=1 then 'cancelled' else status end,
    ends_on=case when o.occurrence_number=1 then ends_on else least(coalesce(ends_on,o.original_due_on-1),o.original_due_on-1) end,
    max_occurrences=case when o.occurrence_number=1 then max_occurrences else o.occurrence_number-1 end,
    next_due_on=case when o.occurrence_number>1 and s.next_due_on<o.original_due_on then s.next_due_on else null end where id=s.id;
  insert into public.scheduled_transactions(series_id,workspace_id,space_id,created_by,name,type,amount,currency,
    account_from_id,account_to_id,category_id,notes,frequency,starts_on,ends_on,max_occurrences,anchor_day,last_day_of_month,timezone,recording_mode,reminder_days)
  values(s.series_id,s.workspace_id,s.space_id,s.created_by,
    coalesce(p_changes->>'name',s.name),coalesce(p_changes->>'type',s.type),coalesce((p_changes->>'amount')::numeric,s.amount),s.currency,
    case when p_changes ? 'account_from_id' then (p_changes->>'account_from_id')::uuid else s.account_from_id end,
    case when p_changes ? 'account_to_id' then (p_changes->>'account_to_id')::uuid else s.account_to_id end,
    case when p_changes ? 'category_id' then (p_changes->>'category_id')::uuid else s.category_id end,
    case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
    coalesce(p_changes->>'frequency',s.frequency),next_start,
    case when p_changes ? 'ends_on' then (p_changes->>'ends_on')::date else s.ends_on end,next_max,
    coalesce((p_changes->>'anchor_day')::integer,s.anchor_day),coalesce((p_changes->>'last_day_of_month')::boolean,s.last_day_of_month),s.timezone,
    coalesce(p_changes->>'recording_mode',s.recording_mode),
    case when p_changes ? 'reminder_days' then array(select reminder.day_text::integer from jsonb_array_elements_text(p_changes->'reminder_days') as reminder(day_text)) else s.reminder_days end)
  returning id into next_id;
  return next_id;
end;
$$;
revoke all on function public.edit_scheduled_future(uuid,jsonb) from public,anon;
grant execute on function public.edit_scheduled_future(uuid,jsonb) to authenticated;

create or replace function private.process_scheduled_transactions()
returns integer language plpgsql security definer set search_path='' as $$
declare item record; processed integer:=0; user_row record; threshold integer; local_today date;
begin
  perform private.materialize_schedules((now() + interval '45 days')::date);
  for item in select o.id,o.due_on,o.status,s.id as schedule_id,s.workspace_id,s.timezone,s.recording_mode,s.reminder_days,s.account_from_id,s.account_to_id,o.account_from_override,o.account_to_override
    from public.scheduled_occurrences o join public.scheduled_transactions s on s.id=o.schedule_id
    where s.status='active' and o.status='pending'
      and ((s.recording_mode='auto' and o.due_on<=(now() at time zone s.timezone)::date)
        or (o.due_on between (now() at time zone s.timezone)::date and ((now() at time zone s.timezone)::date+7)))
    order by o.due_on limit 1000 loop
    local_today:=(now() at time zone item.timezone)::date;
    if item.recording_mode='auto' and item.due_on<=local_today then
      begin
        perform private.post_scheduled_occurrence(item.id,null,true); processed:=processed+1;
        for user_row in select wm.user_id from public.workspace_members wm where wm.workspace_id=item.workspace_id
          and (coalesce(item.account_from_override,item.account_from_id) is null or exists(select 1 from public.accounts a where a.id=coalesce(item.account_from_override,item.account_from_id) and (a.owner_user_id is null or a.owner_user_id=wm.user_id)))
          and (coalesce(item.account_to_override,item.account_to_id) is null or exists(select 1 from public.accounts a where a.id=coalesce(item.account_to_override,item.account_to_id) and (a.owner_user_id is null or a.owner_user_id=wm.user_id))) loop
          insert into public.scheduled_reminders(occurrence_id,user_id,days_before) values(item.id,user_row.user_id,-1) on conflict do nothing;
        end loop;
        continue;
      exception when others then raise warning 'Scheduled occurrence % could not auto-record: %',item.id,sqlerrm; end;
    end if;
    foreach threshold in array item.reminder_days loop
      if item.due_on-local_today=threshold then
        for user_row in select wm.user_id from public.workspace_members wm where wm.workspace_id=item.workspace_id
          and (coalesce(item.account_from_override,item.account_from_id) is null or exists(select 1 from public.accounts a where a.id=coalesce(item.account_from_override,item.account_from_id) and (a.owner_user_id is null or a.owner_user_id=wm.user_id)))
          and (coalesce(item.account_to_override,item.account_to_id) is null or exists(select 1 from public.accounts a where a.id=coalesce(item.account_to_override,item.account_to_id) and (a.owner_user_id is null or a.owner_user_id=wm.user_id))) loop
          insert into public.scheduled_reminders(occurrence_id,user_id,days_before)
          values(item.id,user_row.user_id,threshold) on conflict do nothing;
        end loop;
      end if;
    end loop;
  end loop;
  return processed;
end;
$$;
revoke all on function private.process_scheduled_transactions() from public,anon,authenticated;

-- Keep history truthful if a linked ledger transaction is later deleted.
create or replace function private.unlink_deleted_scheduled_transaction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.scheduled_occurrences set status='pending',transaction_id=null,recorded_at=null,recorded_automatically=false where transaction_id=old.id;
  return old;
end;
$$;
create trigger scheduled_transaction_deleted before delete on public.transactions
for each row execute function private.unlink_deleted_scheduled_transaction();

-- Cron is server-side and works when every app is closed. On installations where
-- pg_cron is not enabled, enable Supabase Cron before applying this migration.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('moneyyap-scheduled-transactions','*/15 * * * *','select private.process_scheduled_transactions()');
