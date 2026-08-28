-- 006_category_case.sql
-- Category names are uniquely identified per user by `category_key(name)`:
-- trimmed, inner whitespace collapsed, lowercased.
--
-- Run 005_merge_category_case.sql first. It folds the existing variants
-- together — the merge the guard below otherwise demands — and it defines
-- `category_key`, which this file indexes on. Running this without it fails
-- with "function public.category_key(text) does not exist", which is the
-- correct outcome: the index cannot be built on an unmerged table anyway.
--
-- A near-miss worth naming: "function category_norm(text) does not exist,
-- CONTEXT: SQL function category_key during inlining" means `category_key`
-- exists but its body cannot see `category_norm` — 005's function block was
-- run partially, or under a search_path that no longer applies. Re-run 005
-- from the top; both definitions are `create or replace` and idempotent.
--
-- 001 gave `categories` a plain `unique (user_id, name)`, which lets "Food" and
-- "food" coexist as two separate categories — two budget rows, two slices in
-- the analytics breakdown, for one thing. This adds a unique index over
-- `category_key(name)` so the database rejects the second spelling.
--
-- Keying on the same expression the app uses (categoryKey() in
-- src/lib/categories.js) means the two never disagree about which names are one
-- category. An index on `lower(name)` alone would not: the app treats
-- "Rent  Money" and "Rent Money" as one, and the database would have allowed
-- both.
--
-- The original `categories_user_id_name_key` constraint STAYS. It is redundant
-- (this index is strictly stricter), but the seeding upsert in useLedgerData.js
-- targets `on conflict (user_id, name)`, and Postgres only matches a conflict
-- target against a plain-column unique index — never an expression index.
-- Dropping it would break first-run seeding.
--
-- Safe to re-run. Reads and reports; changes no existing row.

-- Collisions have to be merged first: the name in `categories` is also the text
-- stored on every transaction and budget row, so picking a winner here would
-- silently orphan the loser's history. Fail loudly with the list instead of
-- letting `create unique index` fail with a row the message doesn't name.
do $$
declare dupes text;
begin
  select string_agg(format('user %s: %s', user_id, names), E'\n')
    into dupes
  from (
    select user_id, public.category_key(name) as key, string_agg(quote_literal(name), ', ' order by name) as names
    from categories
    group by user_id, public.category_key(name)
    having count(*) > 1
  ) c;

  if dupes is not null then
    raise exception
      'Categories differing only in case or spacing must be merged before this migration can run:%',
      E'\n' || dupes
      using hint = 'Run 005_merge_category_case.sql — Phase 1 shows the plan, Phase 2 applies it.';
  end if;
end $$;

-- Supersedes the `lower(name)` index this file created before it keyed on
-- `category_key`. Dropping it is a no-op on a database that never had it.
drop index if exists categories_user_lower_name_key;

create unique index if not exists categories_user_norm_name_key
  on categories (user_id, public.category_key(name));
