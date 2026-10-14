-- Give every Space independent income and expense category trees.
-- Existing shared or incorrectly typed categories are cloned per actual use and
-- transactions are remapped without changing their historical amounts or dates.

begin;

drop index if exists public.categories_scope_parent_name_unique;

create temporary table category_target_map (
  old_category_id uuid not null,
  space_id uuid not null,
  category_type text not null,
  new_category_id uuid not null,
  primary key (old_category_id, space_id, category_type)
) on commit drop;

do $$
declare
  target record;
  mapped_parent_id uuid;
  mapped_category_id uuid;
begin
  for target in
    with recursive category_tree as (
      select c.id, c.workspace_id, c.space_id, c.parent_id, c.name, c.type, c.icon, c.color,
        c.sort_order, c.is_system, c.is_archived, c.created_at, 0 as depth
      from public.categories c
      where c.parent_id is null
      union all
      select child.id, child.workspace_id, child.space_id, child.parent_id, child.name, child.type,
        child.icon, child.color, child.sort_order, child.is_system, child.is_archived, child.created_at, tree.depth + 1
      from public.categories child
      join category_tree tree on tree.id = child.parent_id
    ),
    lineage as (
      select c.id as descendant_id, c.id as ancestor_id from public.categories c
      union all
      select lineage.descendant_id, parent.parent_id
      from lineage
      join public.categories parent on parent.id = lineage.ancestor_id
      where parent.parent_id is not null
    ),
    desired as (
      select c.id as old_category_id, s.id as target_space_id, c.type as target_type
      from public.categories c
      join public.spaces s on s.workspace_id = c.workspace_id
      where c.space_id is null
      union
      select c.id, c.space_id, c.type
      from public.categories c
      where c.space_id is not null
      union
      select lineage.ancestor_id, transaction_row.space_id,
        case when transaction_row.type = 'refund' then 'expense' else transaction_row.financial_effect end
      from public.transactions transaction_row
      join lineage on lineage.descendant_id = transaction_row.category_id
      where transaction_row.type = 'refund' or transaction_row.financial_effect in ('expense', 'income')
    )
    select tree.*, desired.target_space_id, desired.target_type
    from category_tree tree
    join desired on desired.old_category_id = tree.id
    where desired.target_space_id is not null and desired.target_type in ('expense', 'income')
    order by tree.depth, tree.sort_order, tree.created_at nulls last
  loop
    mapped_parent_id := null;
    if target.parent_id is not null then
      select map.new_category_id into mapped_parent_id
      from category_target_map map
      where map.old_category_id = target.parent_id
        and map.space_id = target.target_space_id
        and map.category_type = target.target_type;
      if mapped_parent_id is null then
        raise exception 'Unable to map parent category % for Space % and type %', target.parent_id, target.target_space_id, target.target_type;
      end if;
    end if;

    mapped_category_id := null;
    if target.space_id = target.target_space_id and target.type = target.target_type then
      mapped_category_id := target.id;
      if target.parent_id is distinct from mapped_parent_id then
        update public.categories set parent_id = mapped_parent_id where id = target.id;
      end if;
    else
      select category.id into mapped_category_id
      from public.categories category
      where category.workspace_id = target.workspace_id
        and category.space_id = target.target_space_id
        and category.type = target.target_type
        and category.parent_id is not distinct from mapped_parent_id
        and lower(category.name) = lower(target.name)
      order by category.created_at
      limit 1;

      if mapped_category_id is null then
        insert into public.categories (workspace_id, space_id, parent_id, name, type, icon, color, sort_order, is_system, is_archived)
        values (target.workspace_id, target.target_space_id, mapped_parent_id, target.name, target.target_type,
          target.icon, target.color, target.sort_order, false, target.is_archived)
        returning id into mapped_category_id;
      end if;
    end if;

    insert into category_target_map (old_category_id, space_id, category_type, new_category_id)
    values (target.id, target.target_space_id, target.target_type, mapped_category_id)
    on conflict (old_category_id, space_id, category_type)
    do update set new_category_id = excluded.new_category_id;
  end loop;
end;
$$;

update public.transactions transaction_row
set category_id = map.new_category_id
from category_target_map map
where transaction_row.category_id = map.old_category_id
  and transaction_row.space_id = map.space_id
  and map.category_type = case when transaction_row.type = 'refund' then 'expense' else transaction_row.financial_effect end
  and transaction_row.category_id is distinct from map.new_category_id;

update public.transaction_splits split
set category_id = map.new_category_id
from public.transactions transaction_row, category_target_map map
where split.transaction_id = transaction_row.id
  and split.category_id = map.old_category_id
  and transaction_row.space_id = map.space_id
  and map.category_type = case when transaction_row.type = 'refund' then 'expense' else transaction_row.financial_effect end
  and split.category_id is distinct from map.new_category_id;

-- Preserve category rules by making formerly shared rules Space-specific.
insert into public.classification_rules (workspace_id, merchant_pattern, account_id, space_id, category_id, tag_id, created_by, priority, is_active)
select rule.workspace_id, rule.merchant_pattern, rule.account_id, map.space_id, map.new_category_id,
  rule.tag_id, rule.created_by, rule.priority, rule.is_active
from public.classification_rules rule
join public.categories old_category on old_category.id = rule.category_id and old_category.space_id is null
join category_target_map map on map.old_category_id = rule.category_id and map.category_type = old_category.type
where not exists (
  select 1 from public.classification_rules existing
  where existing.workspace_id = rule.workspace_id
    and existing.merchant_pattern is not distinct from rule.merchant_pattern
    and existing.account_id is not distinct from rule.account_id
    and existing.space_id = map.space_id
    and existing.category_id = map.new_category_id
    and existing.tag_id is not distinct from rule.tag_id
);

-- Counterparty defaults are advisory. Keep the most-used mapped Space default;
-- classification still verifies Space and type before using it.
update public.counterparties counterparty
set default_category_id = (
  select map.new_category_id
  from category_target_map map
  left join public.transactions transaction_row on transaction_row.counterparty_id = counterparty.id
    and transaction_row.space_id = map.space_id
    and transaction_row.category_id = map.new_category_id
  where map.old_category_id = counterparty.default_category_id
  group by map.new_category_id
  order by count(transaction_row.id) desc, map.new_category_id
  limit 1
)
where counterparty.default_category_id is not null
  and exists (select 1 from category_target_map map where map.old_category_id = counterparty.default_category_id);

-- Remove obsolete shared rules and categories after all durable references move.
delete from public.classification_rules rule
using public.categories category
where rule.category_id = category.id and category.space_id is null;

update public.categories set parent_id = null where space_id is null and parent_id is not null;
delete from public.categories where space_id is null;

alter table public.categories alter column space_id set not null;

create unique index categories_scope_parent_name_unique on public.categories (
  workspace_id,
  space_id,
  type,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);

-- Parent and child must share workspace, Space, and type. Arbitrary depth is
-- supported while recursive cycles remain prohibited.
create or replace function public.validate_category_parent()
returns trigger language plpgsql set search_path = '' as $$
declare parent_workspace uuid; parent_space uuid; parent_type text;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'A category cannot be its own parent'; end if;
  select workspace_id, space_id, type into parent_workspace, parent_space, parent_type
  from public.categories where id = new.parent_id;
  if parent_workspace is distinct from new.workspace_id then raise exception 'Parent category must belong to the same workspace'; end if;
  if parent_space is distinct from new.space_id then raise exception 'Parent and child category Spaces must match'; end if;
  if parent_type is distinct from new.type then raise exception 'Parent and child transaction types must match'; end if;
  if exists (
    with recursive ancestors as (
      select category.id, category.parent_id from public.categories category where category.id = new.parent_id
      union all
      select category.id, category.parent_id from public.categories category join ancestors on category.id = ancestors.parent_id
    )
    select 1 from ancestors where id = new.id
  ) then raise exception 'Category hierarchy cannot contain a cycle'; end if;
  return new;
end;
$$;

create or replace function public.validate_transaction_category_assignment()
returns trigger language plpgsql set search_path = '' as $$
declare category_workspace uuid; category_space uuid; category_type text; category_archived boolean; expected_type text;
begin
  if new.type in ('transfer', 'credit_card_payment') then
    if new.category_id is not null then raise exception 'Transfers and card payments cannot have a category'; end if;
    return new;
  end if;
  if new.category_id is null then return new; end if;
  expected_type := case when new.type = 'income' then 'income' when new.type in ('expense', 'refund') then 'expense' else null end;
  select workspace_id, space_id, type, is_archived into category_workspace, category_space, category_type, category_archived
  from public.categories where id = new.category_id;
  if category_workspace is distinct from new.workspace_id then raise exception 'Category must belong to the transaction workspace'; end if;
  if category_space is distinct from new.space_id then raise exception 'Category must belong to the transaction Space'; end if;
  if expected_type is not null and category_type is distinct from expected_type then raise exception 'Category type does not match transaction type'; end if;
  if category_archived and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then raise exception 'New transactions cannot use an archived category'; end if;
  return new;
end;
$$;

drop trigger if exists validate_transaction_category_assignment on public.transactions;
create trigger validate_transaction_category_assignment before insert or update on public.transactions
for each row execute function public.validate_transaction_category_assignment();

create or replace function public.validate_transaction_split_scope()
returns trigger language plpgsql set search_path = '' as $$
declare transaction_workspace uuid; transaction_space uuid; transaction_amount numeric; transaction_type text;
  category_workspace uuid; category_space uuid; category_type text; split_total numeric; expected_type text;
begin
  select workspace_id, space_id, amount, type into transaction_workspace, transaction_space, transaction_amount, transaction_type
  from public.transactions where id = new.transaction_id;
  select workspace_id, space_id, type into category_workspace, category_space, category_type
  from public.categories where id = new.category_id;
  expected_type := case when transaction_type = 'income' then 'income' when transaction_type in ('expense', 'refund') then 'expense' else null end;
  if expected_type is null then raise exception 'Transfers and card payments cannot have category splits'; end if;
  if transaction_workspace is distinct from category_workspace then raise exception 'Split category must belong to the transaction workspace'; end if;
  if category_space is distinct from transaction_space then raise exception 'Split category must match the transaction Space'; end if;
  if category_type is distinct from expected_type then raise exception 'Split category type does not match transaction type'; end if;
  select coalesce(sum(amount), 0) into split_total from public.transaction_splits where transaction_id = new.transaction_id and id <> new.id;
  if split_total + new.amount > transaction_amount then raise exception 'Split amounts cannot exceed the transaction amount'; end if;
  return new;
end;
$$;

create or replace function public.seed_default_categories_for_space()
returns trigger language plpgsql security definer set search_path = '' as $$
declare food_id uuid := gen_random_uuid(); transportation_id uuid := gen_random_uuid();
begin
  if exists (select 1 from public.categories where space_id = new.id) then return new; end if;
  insert into public.categories (id, workspace_id, space_id, name, type, icon, color, sort_order, is_system)
  values
    (food_id, new.workspace_id, new.id, 'Food', 'expense', 'restaurant-outline', '#F2A44B', 0, false),
    (transportation_id, new.workspace_id, new.id, 'Transportation', 'expense', 'car-outline', '#4E93D8', 1, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Shopping', 'expense', 'bag-handle-outline', '#D96AA7', 2, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Bills & Utilities', 'expense', 'flash-outline', '#6B70E8', 3, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Health', 'expense', 'medkit-outline', '#D96A6A', 4, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Education', 'expense', 'school-outline', '#7C8B6A', 5, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Entertainment', 'expense', 'film-outline', '#8B6BD9', 6, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Other Expense', 'expense', 'ellipsis-horizontal', '#68717D', 99, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Salary', 'income', 'wallet-outline', '#13A975', 0, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Business Income', 'income', 'storefront-outline', '#35B987', 1, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Investment Income', 'income', 'trending-up-outline', '#4E93D8', 2, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Gifts Received', 'income', 'gift-outline', '#D96AA7', 3, false),
    (gen_random_uuid(), new.workspace_id, new.id, 'Other Income', 'income', 'ellipsis-horizontal', '#68717D', 99, false);
  insert into public.categories (workspace_id, space_id, parent_id, name, type, icon, color, sort_order, is_system)
  values
    (new.workspace_id, new.id, food_id, 'Groceries', 'expense', 'basket-outline', '#35B987', 0, false),
    (new.workspace_id, new.id, food_id, 'Restaurants', 'expense', 'restaurant-outline', '#F2A44B', 1, false),
    (new.workspace_id, new.id, food_id, 'Coffee', 'expense', 'cafe-outline', '#A57B47', 2, false),
    (new.workspace_id, new.id, transportation_id, 'Fuel', 'expense', 'speedometer-outline', '#4E93D8', 0, false),
    (new.workspace_id, new.id, transportation_id, 'Ride Hailing', 'expense', 'car-outline', '#4E93D8', 1, false);
  return new;
end;
$$;

drop trigger if exists seed_default_categories_for_space on public.spaces;
create trigger seed_default_categories_for_space after insert on public.spaces
for each row execute function public.seed_default_categories_for_space();

create or replace function public.create_workspace_with_owner(workspace_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_workspace_id uuid; new_space_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if char_length(trim(workspace_name)) not between 1 and 120 then raise exception 'Workspace name must be 1 to 120 characters'; end if;
  insert into public.workspaces (name, created_by) values (trim(workspace_name), current_user_id) returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, current_user_id, 'owner');
  insert into public.spaces (workspace_id, name, icon, color, created_by)
  values (new_workspace_id, trim(workspace_name), 'layers-outline', '#35D6A2', current_user_id)
  returning id into new_space_id;
  insert into public.space_members (space_id, user_id, role) values (new_space_id, current_user_id, 'owner');
  return new_workspace_id;
end;
$$;

grant execute on function public.create_workspace_with_owner(text) to authenticated;

commit;
