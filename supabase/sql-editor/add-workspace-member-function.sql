-- MoneyYap — Enable Add workspace member
-- Run this once in Supabase Dashboard → SQL Editor.
-- The person must first create a MoneyYap account using the email you add.

create or replace function public.add_workspace_member_by_email(member_email text, member_role text default 'member')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_user_id uuid;
  target_workspace_id uuid;
  normalized_email text := lower(trim(member_email));
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address'; end if;
  if member_role not in ('admin', 'member') then raise exception 'Invalid workspace role'; end if;
  select wm.workspace_id into target_workspace_id from public.workspace_members wm where wm.user_id = caller_id and wm.role in ('owner', 'admin') order by wm.created_at limit 1;
  if target_workspace_id is null then raise exception 'Only a workspace owner or admin can add members'; end if;
  select u.id into target_user_id from auth.users u where lower(u.email) = normalized_email limit 1;
  if target_user_id is null then raise exception 'No MoneyYap account found for this email. Ask them to sign up first, then try again.'; end if;
  if target_user_id = caller_id then raise exception 'You are already in this workspace'; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (target_workspace_id, target_user_id, member_role) on conflict (workspace_id, user_id) do nothing;
  insert into public.space_members (space_id, user_id, role) select s.id, target_user_id, member_role from public.spaces s where s.workspace_id = target_workspace_id on conflict (space_id, user_id) do nothing;
  return target_user_id;
end;
$$;

revoke execute on function public.add_workspace_member_by_email(text, text) from public;
grant execute on function public.add_workspace_member_by_email(text, text) to authenticated;

select has_function_privilege('authenticated', 'public.add_workspace_member_by_email(text, text)', 'EXECUTE') as can_add_members;
