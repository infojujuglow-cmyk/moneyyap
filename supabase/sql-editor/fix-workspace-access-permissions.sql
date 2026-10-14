-- MoneyYap — Fix workspace read/write permissions
-- Run once in Supabase Dashboard → SQL Editor.
-- This lets authenticated workspace members use the RLS helper functions
-- required by Spaces, accounts, categories, and transactions.

begin;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;
grant select, insert, update, delete on table public.accounts to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.transactions to authenticated;
grant select, insert, update, delete on table public.spaces to authenticated;
grant select, insert, update, delete on table public.space_members to authenticated;
grant select, insert, update, delete on table public.tags to authenticated;
grant select, insert, update, delete on table public.transaction_tags to authenticated;
grant select, insert, update, delete on table public.classification_rules to authenticated;
grant select, insert, update, delete on table public.transaction_splits to authenticated;
grant select on table public.account_balances to authenticated;

revoke execute on function public.is_workspace_member(uuid) from public;
revoke execute on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

commit;

select
  has_table_privilege('authenticated', 'public.accounts', 'INSERT') as can_insert_accounts,
  has_table_privilege('authenticated', 'public.spaces', 'INSERT') as can_insert_spaces,
  has_function_privilege('authenticated', 'public.is_workspace_member(uuid)', 'EXECUTE') as can_check_workspace_membership,
  has_function_privilege('authenticated', 'public.has_workspace_role(uuid, text[])', 'EXECUTE') as can_check_workspace_role;
