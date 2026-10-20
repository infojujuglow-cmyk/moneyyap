-- A named account is private to its owner. Accounts without an owner stay shared.
-- Keep checks in a non-API schema so linked rows cannot expose private account IDs.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Deleting an owner must never turn their private account into a shared one.
alter table public.accounts drop constraint if exists accounts_owner_user_id_fkey;
alter table public.accounts add constraint accounts_owner_user_id_fkey
  foreign key (owner_user_id) references public.profiles(id) on delete restrict;

create or replace function private.can_access_account(target_account_id uuid, target_workspace_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts a
    join public.workspace_members wm on wm.workspace_id = a.workspace_id
    where a.id = target_account_id
      and a.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
      and (a.owner_user_id is null or a.owner_user_id = (select auth.uid()))
  );
$$;
revoke all on function private.can_access_account(uuid, uuid) from public, anon;
grant execute on function private.can_access_account(uuid, uuid) to authenticated;

-- The view stays security-invoker for account visibility. A checked helper sums
-- every ledger entry so a visible shared account keeps its true balance even
-- when one of its transfers also touches another member's private account.
create or replace function private.account_activity_total(target_account_id uuid, target_workspace_id uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when private.can_access_account(target_account_id, target_workspace_id) then (
    select coalesce(sum(
      case when t.account_to_id = target_account_id then t.amount else 0 end
      - case when t.account_from_id = target_account_id then t.amount else 0 end
    ), 0)
    from public.transactions t
    where t.workspace_id = target_workspace_id
      and (t.account_from_id = target_account_id or t.account_to_id = target_account_id)
  ) else null end;
$$;
revoke all on function private.account_activity_total(uuid, uuid) from public, anon;
grant execute on function private.account_activity_total(uuid, uuid) to authenticated;

drop policy if exists "members read accounts" on public.accounts;
drop policy if exists "members create accounts" on public.accounts;
drop policy if exists "members update accounts" on public.accounts;
drop policy if exists "admins delete accounts" on public.accounts;

create policy "members read shared or own accounts" on public.accounts for select to authenticated
using (public.is_workspace_member(workspace_id) and (owner_user_id is null or owner_user_id = (select auth.uid())));
create policy "members create accounts" on public.accounts for insert to authenticated
with check (public.is_workspace_member(workspace_id));
create policy "members update shared or own accounts" on public.accounts for update to authenticated
using (public.is_workspace_member(workspace_id) and (owner_user_id is null or owner_user_id = (select auth.uid())))
with check (public.is_workspace_member(workspace_id));
create policy "members delete shared or own accounts" on public.accounts for delete to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    owner_user_id = (select auth.uid())
    or (owner_user_id is null and public.has_workspace_role(workspace_id, array['owner','admin']))
  )
);

create or replace function public.validate_account_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'Account workspace cannot be changed';
  end if;
  if new.owner_user_id is not null and not exists (
    select 1 from public.workspace_members
    where workspace_id = new.workspace_id and user_id = new.owner_user_id
  ) then
    raise exception 'Account owner must be a workspace member';
  end if;
  return new;
end;
$$;

drop policy if exists "members read transactions" on public.transactions;
drop policy if exists "members create transactions" on public.transactions;
drop policy if exists "members update transactions" on public.transactions;
drop policy if exists "members delete transactions" on public.transactions;

create policy "members read visible account transactions" on public.transactions for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id, workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id, workspace_id))
);
create policy "members create visible account transactions" on public.transactions for insert to authenticated
with check (
  created_by = (select auth.uid()) and public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id, workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id, workspace_id))
);
create policy "members update visible account transactions" on public.transactions for update to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id, workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id, workspace_id))
)
with check (
  public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id, workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id, workspace_id))
);
create policy "members delete visible account transactions" on public.transactions for delete to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (account_from_id is null or private.can_access_account(account_from_id, workspace_id))
  and (account_to_id is null or private.can_access_account(account_to_id, workspace_id))
);

drop policy if exists "workspace members manage account identifiers" on public.account_identifiers;
create policy "members manage visible account identifiers" on public.account_identifiers for all to authenticated
using (private.can_access_account(account_id, workspace_id))
with check (private.can_access_account(account_id, workspace_id));

drop policy if exists "workspace members manage counterparties" on public.counterparties;
-- Counterparties are learned from transaction history. Keep that learning per
-- member so a private merchant does not appear in another member's suggestions.
alter table public.counterparties drop constraint if exists counterparties_workspace_id_normalized_name_key;
alter table public.counterparties add constraint counterparties_workspace_creator_name_key
  unique (workspace_id, created_by, normalized_name);
create policy "members manage own counterparties" on public.counterparties for all to authenticated
using (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id) and (owned_account_id is null or private.can_access_account(owned_account_id, workspace_id)))
with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id) and (owned_account_id is null or private.can_access_account(owned_account_id, workspace_id)));

drop policy if exists "workspace members manage rules" on public.classification_rules;
create policy "members manage own visible account rules" on public.classification_rules for all to authenticated
using (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id) and (account_id is null or private.can_access_account(account_id, workspace_id)))
with check (created_by = (select auth.uid()) and public.is_workspace_member(workspace_id) and (account_id is null or private.can_access_account(account_id, workspace_id)));

-- Both old policies were permissive; leaving either one would expose tags or splits.
drop policy if exists "workspace members read transaction tags" on public.transaction_tags;
drop policy if exists "workspace members manage transaction tags" on public.transaction_tags;
create policy "members manage visible transaction tags" on public.transaction_tags for all to authenticated
using (exists (select 1 from public.transactions t where t.id = transaction_id))
with check (exists (select 1 from public.transactions t where t.id = transaction_id));

drop policy if exists "workspace members manage splits" on public.transaction_splits;
create policy "members manage visible transaction splits" on public.transaction_splits for all to authenticated
using (exists (select 1 from public.transactions t where t.id = transaction_id))
with check (exists (select 1 from public.transactions t where t.id = transaction_id));

create or replace view public.account_balances with (security_invoker = true) as
select a.*, a.opening_balance + private.account_activity_total(a.id, a.workspace_id) as current_balance
from public.accounts a;

grant select on public.account_balances to authenticated;
