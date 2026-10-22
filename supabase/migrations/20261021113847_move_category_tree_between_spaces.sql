create or replace function public.move_category_tree_to_space(
  category_id uuid,
  destination_space_id uuid,
  destination_parent_id uuid default null,
  category_name text default null,
  category_icon text default null,
  category_color text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  category_workspace_id uuid;
  category_source_space_id uuid;
  category_type text;
  category_system boolean;
  destination_workspace_id uuid;
  destination_archived boolean;
  parent_workspace_id uuid;
  parent_space_id uuid;
  parent_type text;
  moved_category_ids uuid[];
  affected_transaction_ids uuid[];
  moved_category_count integer := 0;
  moved_transaction_count integer := 0;
  category_row record;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select workspace_id, space_id, type, is_system
  into category_workspace_id, category_source_space_id, category_type, category_system
  from public.categories
  where id = category_id;

  if category_workspace_id is null then
    raise exception 'Category not found';
  end if;
  if category_system then
    raise exception 'System categories cannot be moved';
  end if;
  if not exists (
    select 1
    from public.workspace_members
    where workspace_id = category_workspace_id
      and user_id = current_user_id
      and role in ('owner', 'admin')
  ) then
    raise exception 'Only workspace owners and admins can move categories';
  end if;

  select workspace_id, is_archived
  into destination_workspace_id, destination_archived
  from public.spaces
  where id = destination_space_id;

  if destination_workspace_id is distinct from category_workspace_id then
    raise exception 'Destination Space must belong to the same workspace';
  end if;
  if destination_archived then
    raise exception 'Categories cannot be moved to an archived Space';
  end if;
  if destination_space_id is not distinct from category_source_space_id then
    raise exception 'Choose a different destination Space';
  end if;
  if category_name is not null and char_length(trim(category_name)) = 0 then
    raise exception 'Category name cannot be empty';
  end if;

  if destination_parent_id is not null then
    select workspace_id, space_id, type
    into parent_workspace_id, parent_space_id, parent_type
    from public.categories
    where id = destination_parent_id and not is_archived;

    if parent_workspace_id is null then
      raise exception 'Destination parent category not found';
    end if;
    if parent_workspace_id is distinct from category_workspace_id
      or parent_space_id is distinct from destination_space_id
      or parent_type is distinct from category_type then
      raise exception 'Destination parent must use the same workspace, Space, and category type';
    end if;
  end if;

  with recursive category_tree as (
    select id, parent_id
    from public.categories
    where id = category_id
    union all
    select child.id, child.parent_id
    from public.categories child
    join category_tree parent on child.parent_id = parent.id
  )
  select array_agg(id) into moved_category_ids from category_tree;

  if destination_parent_id = any(moved_category_ids) then
    raise exception 'A category cannot be moved under itself or one of its subcategories';
  end if;

  select coalesce(array_agg(distinct transaction_id), '{}'::uuid[])
  into affected_transaction_ids
  from (
    select t.id as transaction_id
    from public.transactions t
    where t.category_id = any(moved_category_ids)
    union
    select split.transaction_id
    from public.transaction_splits split
    where split.category_id = any(moved_category_ids)
  ) affected;

  if exists (
    select 1
    from public.transactions t
    where t.id = any(affected_transaction_ids)
      and t.category_id is not null
      and not (t.category_id = any(moved_category_ids))
  ) or exists (
    select 1
    from public.transaction_splits split
    where split.transaction_id = any(affected_transaction_ids)
      and not (split.category_id = any(moved_category_ids))
  ) then
    raise exception 'This category tree is used in split transactions with categories outside the tree. Move or remove those splits first.';
  end if;

  for category_row in
    with recursive category_tree as (
      select id, 0 as depth
      from public.categories
      where id = category_id
      union all
      select child.id, parent.depth + 1
      from public.categories child
      join category_tree parent on child.parent_id = parent.id
    )
    select id, depth from category_tree order by depth, id
  loop
    if category_row.id = category_id then
      update public.categories
      set space_id = destination_space_id,
          parent_id = destination_parent_id,
          name = coalesce(trim(category_name), name),
          icon = coalesce(category_icon, icon),
          color = coalesce(category_color, color)
      where id = category_row.id;
    else
      update public.categories
      set space_id = destination_space_id
      where id = category_row.id;
    end if;
    moved_category_count := moved_category_count + 1;
  end loop;

  update public.transactions
  set space_id = destination_space_id
  where id = any(affected_transaction_ids);
  get diagnostics moved_transaction_count = row_count;

  update public.classification_rules rule
  set space_id = destination_space_id
  where rule.category_id = any(moved_category_ids);

  return jsonb_build_object(
    'moved_category_count', moved_category_count,
    'moved_transaction_count', moved_transaction_count
  );
end;
$$;

revoke execute on function public.move_category_tree_to_space(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.move_category_tree_to_space(uuid, uuid, uuid, text, text, text) to authenticated;
