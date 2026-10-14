-- MoneyYap — Conversational finance architecture upgrade
-- Run this once in Supabase Dashboard → SQL Editor on the existing project.

-- Persist MoneyYap conversations and keep financial query state separate from raw messages.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete set null,
  title text not null default 'Money conversation' check (char_length(trim(title)) between 1 and 120),
  query_context jsonb not null default '{}'::jsonb check (jsonb_typeof(query_context) = 'object'),
  pending_clarification jsonb check (pending_clarification is null or jsonb_typeof(pending_clarification) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (char_length(content) between 1 and 4000),
  message_type text not null default 'text' check (message_type in ('text', 'finance_answer', 'transaction_draft', 'clarification', 'management_action', 'error')),
  intent text check (intent is null or intent in ('record_transaction', 'query_finances', 'edit_transaction', 'delete_transaction', 'manage_account', 'manage_category', 'manage_space', 'general_conversation', 'clarification_response')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index conversations_user_updated_idx on public.conversations(user_id, workspace_id, updated_at desc);
create index conversation_messages_recent_idx on public.conversation_messages(conversation_id, created_at desc);

create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

create or replace function public.validate_conversation_scope()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.user_id <> (select auth.uid()) then raise exception 'A conversation must belong to the signed-in user'; end if;
  if not public.is_workspace_member(new.workspace_id) then raise exception 'Conversation workspace is not accessible'; end if;
  if new.space_id is not null and not exists (
    select 1 from public.spaces where id = new.space_id and workspace_id = new.workspace_id
  ) then raise exception 'Conversation Space must belong to its workspace'; end if;
  if tg_op = 'UPDATE' and (new.workspace_id is distinct from old.workspace_id or new.user_id is distinct from old.user_id) then
    raise exception 'Conversation owner and workspace cannot be changed';
  end if;
  return new;
end;
$$;

create trigger validate_conversation_scope before insert or update on public.conversations
for each row execute function public.validate_conversation_scope();

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

create policy "users manage their conversations" on public.conversations for all to authenticated
using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

create policy "users read their conversation messages" on public.conversation_messages for select to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid()) and public.is_workspace_member(c.workspace_id)
));

create policy "users create their conversation messages" on public.conversation_messages for insert to authenticated
with check (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid()) and public.is_workspace_member(c.workspace_id)
));

create policy "users update their conversation messages" on public.conversation_messages for update to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid()) and public.is_workspace_member(c.workspace_id)
)) with check (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid()) and public.is_workspace_member(c.workspace_id)
));

create policy "users delete their conversation messages" on public.conversation_messages for delete to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid()) and public.is_workspace_member(c.workspace_id)
));

grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.conversation_messages to authenticated;
