-- 0008_wards_accounts.sql: ward profiles (the 369 wards of the 2025 delimitation, their zone,
-- division, assembly constituency and population), the published contacts of each city corporation,
-- their officers and the area's MLAs; and user accounts (profiles, reports linked to a user).
-- Loaded by scripts/seed-wards.ts with the service role key. Run after 0001 to 0007.

-- Ward facts from the GBA ward delimitation 2025 (OpenCity, public domain).
alter table wards
  add column if not exists ward_no int,
  add column if not exists name_kn text,
  add column if not exists zone text,          -- 'Zone1' or 'Zone2' within the corporation
  add column if not exists zone_name text,     -- e.g. 'Rajarajeshwarinagar'
  add column if not exists division text,      -- revenue division (RO)
  add column if not exists subdivision text,   -- revenue sub-division (ARO)
  add column if not exists assembly_no int,
  add column if not exists assembly text,
  add column if not exists population int,     -- 2011 census, as published with the delimitation
  add column if not exists area_km2 double precision;
create unique index if not exists wards_corporation_ward_no on wards (corporation_id, ward_no);

-- What each corporation publishes on its official website.
create table if not exists corporation_offices (
  corporation_id text primary key references corporations(id),
  address text,
  phones text[] not null default '{}',
  helpline text,
  website text,
  budget_crore numeric,         -- 2026-27 budget outlay, as reported
  ward_grant_note text,         -- per ward allocation, as reported, or null when not published
  sources text[] not null default '{}',
  as_of date
);

create table if not exists officers (
  id serial primary key,
  corporation_id text not null references corporations(id),
  zone text,                    -- null for corporation level; 'Zone1' or 'Zone2'
  role text not null,
  name text not null,
  email text,
  source text,
  as_of date
);
create index if not exists officers_corporation on officers (corporation_id, zone);

create table if not exists mlas (
  assembly_no int primary key,
  constituency text not null,
  name text not null,
  party text,
  source text,
  as_of date
);

alter table corporation_offices enable row level security;
alter table officers enable row level security;
alter table mlas enable row level security;
-- Public facts, readable by anyone; written only by the service role.
drop policy if exists "corporation offices are public" on corporation_offices;
create policy "corporation offices are public" on corporation_offices for select using (true);
drop policy if exists "officers are public" on officers;
create policy "officers are public" on officers for select using (true);
drop policy if exists "mlas are public" on mlas;
create policy "mlas are public" on mlas for select using (true);

-- After loading wards: each corporation's boundary is the union of its wards.
create or replace function corporation_boundaries_from_wards()
returns int
language plpgsql as $$
declare
  n int;
begin
  update corporations c
  set boundary = u.g
  from (
    select corporation_id, st_multi(st_union(boundary::geometry))::geography as g
    from wards where boundary is not null group by corporation_id
  ) u
  where u.corporation_id = c.id;
  get diagnostics n = row_count;
  update wards set area_km2 = round((st_area(boundary) / 1e6)::numeric, 2) where boundary is not null;
  return n;
end $$;

-- Ward tallies for the ward directory and ward pages.
create or replace function ward_issue_counts()
returns table (ward_id int, open_count bigint, verified_count bigint, recurring_count bigint, accessibility_count bigint)
language sql stable as $$
  select i.ward_id,
         count(*) filter (where i.status <> 'verified'),
         count(*) filter (where i.status = 'verified'),
         count(*) filter (where i.recurrence_of is not null),
         count(*) filter (where i.accessibility <> 'none' and i.status <> 'verified')
  from issues i where i.ward_id is not null group by i.ward_id;
$$;

revoke execute on function corporation_boundaries_from_wards() from public, anon, authenticated;
revoke execute on function ward_issue_counts() from public, anon, authenticated;
grant execute on function corporation_boundaries_from_wards() to service_role;
grant execute on function ward_issue_counts() to service_role;

-- Accounts: Supabase Auth users with a display name; reports remember who filed them.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
drop policy if exists "a user reads their own profile" on profiles;
create policy "a user reads their own profile" on profiles for select using (auth.uid() = id);

alter table reports add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists reports_user on reports (user_id);
