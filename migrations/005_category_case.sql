-- 005_category_case.sql
-- Category names are case-insensitively unique per user.
--
-- 001 gave `categories` a plain `unique (user_id, name)`, which lets "Food" and
-- "food" coexist as two separate categories — two budget rows, two slices in
-- the analytics breakdown, for one thing. This adds a unique index over
-- `lower(name)` so the database rejects the second spelling.
--
-- The original `categories_user_id_name_key` constraint STAYS. It is redundant
-- (this index is strictly stricter), but the seeding upsert in useLedgerData.js
-- targets `on conflict (user_id, name)`, and Postgres only matches a conflict
-- target against a plain-column unique index — never an expression index.
-- Dropping it would break first-run seeding.
--
-- Safe to re-run. Reads and reports; changes no existing row.

-- Collisions have to be merged by hand: the name in `categories` is also the
-- text stored on every transaction and budget row, so picking a winner here
-- would silently orphan the loser's history. Fail loudly with the list instead
-- of letting `create unique index` fail with a row the message doesn't name.
do $$
declare dupes text;
begin
  select string_agg(format('user %s: %s', user_id, names), E'\n')
    into dupes
  from (
    select user_id, lower(name) as key, string_agg(quote_literal(name), ', ' order by name) as names
    from categories
    group by user_id, lower(name)
    having count(*) > 1
  ) c;

  if dupes is not null then
    raise exception
      'Case-variant categories must be merged before this migration can run:%s%s',
      E'\n', dupes
      using hint = 'In the app, move each transaction to the spelling you are keeping, then delete the other category row.';
  end if;
end $$;

create unique index if not exists categories_user_lower_name_key
  on categories (user_id, lower(name));
