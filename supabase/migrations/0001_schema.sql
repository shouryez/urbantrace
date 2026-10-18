-- 0001_schema.sql: tables, enums and indexes (Build Plan, Data model > Schema)

create extension if not exists postgis;
create extension if not exists vector;  -- only needed for F12

create type issue_category as enum ('pothole','garbage','streetlight','waterlogging','water_leak_sewage','power_hazard','other');
create type issue_status as enum ('open','fix_claimed','verified');

create table corporations (
  id text primary key,                 -- 'west', 'east', 'north', 'south', 'central'
  name text not null,                  -- 'Bengaluru West City Corporation'
  email text,
  boundary geography(MultiPolygon, 4326)
);

create table wards (
  id serial primary key,
  name text not null,
  corporation_id text references corporations(id),
  boundary geography(MultiPolygon, 4326)
);

create table issues (
  id bigserial primary key,
  category issue_category not null,
  severity smallint not null check (severity between 1 and 5),
  summary text not null,
  status issue_status not null default 'open',
  location geography(Point, 4326) not null,
  address text,
  agency text,                         -- 'corporation' | 'BWSSB' | 'BESCOM'
  corporation_id text references corporations(id),
  ward_id int references wards(id),
  backer_count int not null default 1,
  complaint_letter text,
  depth_class text,                    -- F13
  embedding vector(768),               -- F12, size must match the embedding model
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index issues_location_gix on issues using gist (location);

create table reports (
  id bigserial primary key,
  issue_id bigint not null references issues(id) on delete cascade,
  photo_path text not null,
  location geography(Point, 4326) not null,
  ai_result jsonb not null,
  user_edited boolean not null default false,
  transcript text,                     -- F9
  device_id text not null,
  created_at timestamptz not null default now(),
  unique (issue_id, device_id)         -- one backing per device per issue
);

create table verifications (
  id bigserial primary key,
  issue_id bigint not null references issues(id) on delete cascade,
  after_photo_path text not null,
  location geography(Point, 4326) not null,
  distance_m real not null,
  ai_verdict jsonb not null,
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table issue_events (
  id bigserial primary key,
  issue_id bigint not null references issues(id) on delete cascade,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- Row level security (Build Plan, Repo, environment and setup > Database security).
-- The anon key may only select from issues, reports, verifications and issue_events.
-- No insert, update or delete policies exist, so every write must use the service role key,
-- which bypasses RLS and is only ever used by Next.js server routes.
alter table corporations   enable row level security;
alter table wards          enable row level security;
alter table issues         enable row level security;
alter table reports        enable row level security;
alter table verifications  enable row level security;
alter table issue_events   enable row level security;

create policy "public read issues"        on issues        for select to anon, authenticated using (true);
create policy "public read reports"       on reports       for select to anon, authenticated using (true);
create policy "public read verifications" on verifications for select to anon, authenticated using (true);
create policy "public read issue_events"  on issue_events  for select to anon, authenticated using (true);

-- Photos bucket: public reads by URL; uploads only from the server with the service role key.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;
