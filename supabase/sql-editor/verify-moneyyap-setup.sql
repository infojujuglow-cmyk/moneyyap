-- Run this after the setup script. It should return the MoneyYap tables.
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'profiles', 'workspaces', 'workspace_members', 'spaces', 'space_members',
    'accounts', 'categories', 'tags', 'transactions', 'transaction_tags',
    'classification_rules', 'transaction_splits'
  )
order by tablename;

-- This should return one row, confirming the app can create a first workspace.
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'create_workspace_with_owner';
