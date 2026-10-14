-- MoneyYap — allow signed-in users to create their first workspace.
-- Run once in Supabase Dashboard → SQL Editor, then retry in the app.

begin;

grant usage on schema public to authenticated;
revoke execute on function public.create_workspace_with_owner(text) from public;
grant execute on function public.create_workspace_with_owner(text) to authenticated;

commit;

-- Expected result: can_execute = true
select has_function_privilege(
  'authenticated',
  'public.create_workspace_with_owner(text)',
  'EXECUTE'
) as can_execute;
