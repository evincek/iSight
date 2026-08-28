-- 005_merge_category_case.sql
-- One-time data cleanup: fold case- and spacing-variant categories together.
--
-- Must run BEFORE 006_category_case.sql, which adds the unique index that
-- rejects the variants this file merges away. 006 refuses to run while any
-- collision is left, and the merge it tells you to do by hand is this file.
--
-- WHAT COUNTS AS THE SAME CATEGORY
-- Trimmed, inner whitespace collapsed, lowercased — the same key
-- `categoryKey()` uses in src/lib/categories.js, so the database and the app
-- agree about which names are one thing.
--
-- WHICH SPELLING SURVIVES
-- The most used one: the `categories` row with the most transactions filed
-- under it. Ties go to the older row, then alphabetically. The winner is always
-- an existing `categories` row — a spelling that appears only on transactions
-- never wins, because renaming your declared category to match a typo is worse
-- than the typo ("iPhone fund" should not become "iphone fund").
--
-- The winner's budget survives. If the winner has no budget but a loser does,
-- that budget moves onto the winner rather than vanishing.
--
-- Keys with no `categories` row at all are left alone — there is no declared
-- spelling to merge into, and inventing one would be a guess.
--
-- HOW TO RUN IT
--   Phase 1 builds the plan and prints it. Nothing is written to your data.
--   Phase 2 applies exactly the plan Phase 1 built. Read Phase 1's output first.
--   Phase 3 verifies, and must return zero rows before you run 006.
--
-- Safe to re-run: once applied, Phase 1 rebuilds an empty plan and Phase 2
-- matches nothing.


-- ==================================================================== --
-- PHASE 1 — BUILD AND SHOW THE PLAN.  Reads only; writes no app data.  --
-- ==================================================================== --

-- Scratch schema. Not in Supabase's exposed schema list, so the plan is never
-- reachable through the API. This is our own working table, not app data —
-- dropping it is not the `drop table` the README forbids.
create schema if not exists ledger_migration;

-- The two functions the app applies to a category name, as SQL. `category_norm`
-- is normalizeCategory() — trimmed, inner whitespace collapsed, case as typed.
-- `category_key` is categoryKey() — that, lowercased. 006 indexes on
-- `category_key`, so these are the definition of "the same category" for both
-- the database and the app. Collapse before trimming, so a leading tab goes too.
--
-- IMMUTABLE because 006 builds a unique index on `category_key`. Changing either
-- body silently invalidates that index — redefine them only in a new migration
-- that reindexes as well.
--
-- Schema-qualified, and pinned with `set search_path = ''`, for two reasons.
-- A SQL function body is stored as text and re-resolved every time it is
-- planned, against whatever search_path the *caller* happens to have — so an
-- unqualified `category_norm` inside `category_key` fails with "function
-- category_norm(text) does not exist" the moment someone calls it from a
-- session whose path does not include this schema. An expression index whose
-- meaning depends on the caller's path is not really immutable, either. The SET
-- clause also blocks inlining, which keeps the stored index expression and a
-- query's `category_key(...)` as the same node, so the planner can match them.
-- (pg_catalog is searched even under an empty path; qualified here anyway.)
create or replace function public.category_norm(name text) returns text
  language sql immutable strict parallel safe
  set search_path = '' as
$$ select pg_catalog.btrim(pg_catalog.regexp_replace(name, '\s+', ' ', 'g')) $$;

create or replace function public.category_key(name text) returns text
  language sql immutable strict parallel safe
  set search_path = '' as
$$ select pg_catalog.lower(public.category_norm(name)) $$;

drop table if exists ledger_migration.category_merge_plan;

create table ledger_migration.category_merge_plan as
with
-- Normalized display form: trimmed, inner whitespace collapsed, case as typed.
-- Mirrors normalizeCategory() in src/lib/categories.js.
cat as (
  select
    c.user_id,
    c.name,
    c.created_at,
    public.category_norm(c.name) as norm
  from categories c
),
cat_keyed as (
  select user_id, name, created_at, norm, lower(norm) as key from cat
),
-- Usage is counted against the spelling as stored, which is the whole point:
-- that is the text transactions actually carry.
cat_usage as (
  select
    k.*,
    (select count(*) from transactions t
      where t.user_id = k.user_id and t.category = k.name) as tx_count
  from cat_keyed k
),
ranked as (
  select
    u.*,
    row_number() over (
      partition by u.user_id, u.key
      order by u.tx_count desc, u.created_at asc nulls last, u.name asc
    ) as rn
  from cat_usage u
),
winner as (
  select user_id, key, name as keep_from, norm as keep_name
  from ranked
  where rn = 1
),
-- Every distinct category text in play, wherever it is stored. A spelling can
-- live on a transaction or a budget without ever having had a `categories` row.
seen as (
  select user_id, name     as from_name from categories
  union
  select user_id, category as from_name from transactions
  union
  select user_id, category as from_name from budgets
),
seen_keyed as (
  select
    s.user_id,
    s.from_name,
    public.category_key(s.from_name) as key
  from seen s
)
select
  s.user_id,
  s.key                       as category_key,
  s.from_name,
  w.keep_name                 as to_name,
  (s.from_name = w.keep_from) as is_winner,
  exists (
    select 1 from categories c
     where c.user_id = s.user_id and c.name = s.from_name
  )                           as has_category_row,
  (select count(*) from transactions t
    where t.user_id = s.user_id and t.category = s.from_name)::int as tx_rows,
  (select b.amount from budgets b
    where b.user_id = s.user_id and b.category = s.from_name)      as budget_amount,
  null::text                  as budget_action,
  null::timestamptz           as applied_at
from seen_keyed s
join winner w on w.user_id = s.user_id and w.key = s.key
-- Keep the whole group whenever any spelling in it changes, so the plan shows
-- what is being kept next to what is being folded into it.
where exists (
  select 1
    from seen_keyed s2
    join winner w2 on w2.user_id = s2.user_id and w2.key = s2.key
   where s2.user_id = s.user_id
     and s2.key = s.key
     and s2.from_name <> w2.keep_name
);

-- Budget decisions. The winner keeps its own budget; otherwise the budget on
-- the most-used losing spelling moves across; any remaining duplicate is
-- dropped. Values are never summed — two spellings are one plan recorded twice,
-- and adding them would invent headroom.
update ledger_migration.category_merge_plan p
   set budget_action = 'keep'
 where p.budget_amount is not null
   and p.is_winner;

update ledger_migration.category_merge_plan p
   set budget_action = 'move to winner'
 where p.budget_amount is not null
   and not p.is_winner
   and not exists (
     select 1 from ledger_migration.category_merge_plan w
      where w.user_id = p.user_id
        and w.category_key = p.category_key
        and w.is_winner
        and w.budget_amount is not null
   )
   and p.from_name = (
     select q.from_name
       from ledger_migration.category_merge_plan q
      where q.user_id = p.user_id
        and q.category_key = p.category_key
        and q.budget_amount is not null
        and not q.is_winner
      order by q.tx_rows desc, q.from_name asc
      limit 1
   );

update ledger_migration.category_merge_plan p
   set budget_action = 'drop (duplicate budget row)'
 where p.budget_amount is not null
   and p.budget_action is null;

-- ---- THE PLAN. Read this before running Phase 2. ----
select
  left(user_id::text, 8)     as "user",
  category_key,
  from_name                  as spelling,
  to_name                    as becomes,
  case
    when is_winner and from_name = to_name then 'keep'
    when is_winner                         then 'keep, rename to ' || quote_literal(to_name)
    when has_category_row                  then 'merge into ' || quote_literal(to_name) || ', delete category row'
    else                                        'retag to ' || quote_literal(to_name)
  end                        as category_action,
  tx_rows                    as transactions,
  budget_amount,
  coalesce(budget_action, '—') as budget_action
from ledger_migration.category_merge_plan
order by user_id, category_key, is_winner desc, tx_rows desc, from_name;

-- Snapshot, per the README. Re-run these after Phase 2: both must be unchanged.
-- The merge only ever rewrites category *text* — it never touches an amount and
-- never deletes a transaction.
select count(*) as transaction_count, coalesce(sum(amount), 0) as transaction_sum
  from transactions;


-- ==================================================================== --
-- PHASE 2 — APPLY THE PLAN.  Destructive. Run only after reading above. --
-- ==================================================================== --
-- Everything below is one transaction: it all lands, or none of it does.

begin;

-- 1. Transactions move to the surviving spelling.
update transactions t
   set category = p.to_name
  from ledger_migration.category_merge_plan p
 where t.user_id  = p.user_id
   and t.category = p.from_name
   and p.from_name <> p.to_name;

-- 2. Budgets. Drop the redundant rows first so the unique (user_id, category)
--    constraint is free, then move the survivor onto the winning spelling.
delete from budgets b
 using ledger_migration.category_merge_plan p
 where b.user_id  = p.user_id
   and b.category = p.from_name
   and p.budget_action = 'drop (duplicate budget row)';

update budgets b
   set category = p.to_name
  from ledger_migration.category_merge_plan p
 where b.user_id  = p.user_id
   and b.category = p.from_name
   and p.budget_action in ('keep', 'move to winner')
   and p.from_name <> p.to_name;

-- 3. Categories. Losing rows go before the winner is renamed, so the rename
--    cannot collide with a row that is on its way out.
delete from categories c
 using ledger_migration.category_merge_plan p
 where c.user_id = p.user_id
   and c.name    = p.from_name
   and p.has_category_row
   and not p.is_winner;

update categories c
   set name = p.to_name
  from ledger_migration.category_merge_plan p
 where c.user_id = p.user_id
   and c.name    = p.from_name
   and p.is_winner
   and p.from_name <> p.to_name;

update ledger_migration.category_merge_plan
   set applied_at = now()
 where applied_at is null;

commit;


-- ==================================================================== --
-- PHASE 3 — VERIFY.  Both queries must return zero rows before 006.    --
-- ==================================================================== --

-- (a) No case-variant categories left.
select user_id, public.category_key(name) as key, string_agg(quote_literal(name), ', ' order by name) as names
  from categories
 group by user_id, public.category_key(name)
having count(*) > 1;

-- (b) No transaction or budget still carrying a variant spelling of a live
--     category. Rows here mean the merge missed something — do not run 006.
select 'transaction' as found_in, t.user_id, t.category
  from transactions t
 where exists (
   select 1 from categories c
    where c.user_id = t.user_id
      and public.category_key(c.name) = public.category_key(t.category)
      and c.name <> t.category
 )
union all
select 'budget', b.user_id, b.category
  from budgets b
 where exists (
   select 1 from categories c
    where c.user_id = b.user_id
      and public.category_key(c.name) = public.category_key(b.category)
      and c.name <> b.category
 );

-- The plan table is kept as the record of what was merged — there are no
-- backups on the free tier, and it is the only trace of the old spellings.
-- Drop it once you are satisfied:
--   drop table ledger_migration.category_merge_plan;
