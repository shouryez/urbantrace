-- 0007_intelligence.sql: the civic intelligence layer.
-- Multi-issue cases from photo, video and voice; incidents and alerts with a root cause graph;
-- recurrence and segment history; explainable priority; assignment; multi-check verification;
-- crowd evidence; accessibility; citizen fix confirmation; rainfall cache.
-- Everything is written by the server with the service role key; anon can read incidents.

-- Two more kinds of problem the video investigator and accessibility mode need.
-- (New enum values are not used elsewhere in this script, so it runs in one transaction.)
alter type issue_category add value if not exists 'drainage';   -- open or blocked storm water drain
alter type issue_category add value if not exists 'footpath';   -- broken or obstructed footpath

-- Incidents: one underlying problem behind many issues (cluster), or a sudden burst (alert).
create table if not exists incidents (
  id bigserial primary key,
  kind text not null check (kind in ('cluster', 'alert')),
  status text not null default 'active' check (status in ('active', 'resolved')),
  title text not null,
  root_cause text,                          -- a node of the causal graph in lib/intel/causal.ts
  graph jsonb,                              -- nodes and edges drawn on the incident page
  explanation text,
  confidence real,                          -- 0 to 1, computed in code
  center geography(Point, 4326) not null,
  radius_m real not null,
  report_count int not null default 0,
  issue_count int not null default 0,
  categories jsonb,
  first_at timestamptz,
  last_at timestamptz,
  scenario jsonb,                           -- "what happens if we don't fix this" (model scenario)
  signature text unique,                    -- stable key, so re-detection updates the same incident
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists incidents_center_gix on incidents using gist (center);

alter table issues
  add column if not exists accessibility text not null default 'none' check (accessibility in ('none', 'partial', 'major')),
  add column if not exists priority real,
  add column if not exists priority_factors jsonb,
  add column if not exists stage text not null default 'reported',
  add column if not exists assignment jsonb,
  add column if not exists case_file jsonb,
  add column if not exists scenario jsonb,
  add column if not exists evidence jsonb,
  add column if not exists road_class text,
  add column if not exists segment_key text,
  add column if not exists recurrence_of bigint references issues(id) on delete set null,
  add column if not exists repair_lasted_days int,
  add column if not exists incident_id bigint references incidents(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
create index if not exists issues_segment_idx on issues (segment_key);
create index if not exists issues_incident_idx on issues (incident_id);

-- A voice only report ("just talk") has no photo yet.
alter table reports alter column photo_path drop not null;
alter table reports
  add column if not exists media jsonb,                 -- {kind: photo|video|voice, frames: [...], frame_times: [...]}
  add column if not exists extraction jsonb,            -- the full AI case extraction
  add column if not exists language text,               -- the reporter's language (ISO code)
  add column if not exists summary_local text,          -- the summary in that language
  add column if not exists severity_opinion smallint,   -- the reporter's own severity, when they corrected it
  add column if not exists gps_accuracy_m real,
  add column if not exists duration_claim_days int;     -- "it has been here for 3 months"

alter table verifications
  add column if not exists checks jsonb,                -- location, segment, scene, issue gone, timestamp, residual
  add column if not exists score real,                  -- 0 to 100
  add column if not exists outcome text check (outcome in ('verified', 'partial', 'failed'));

-- "You verify": people who backed an issue confirm whether it is really fixed.
create table if not exists citizen_confirmations (
  issue_id bigint not null references issues(id) on delete cascade,
  device_id text not null,
  fixed boolean not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (issue_id, device_id)
);

-- Daily rainfall for Bengaluru from Open-Meteo, cached.
create table if not exists weather_daily (
  day date primary key,
  precipitation_mm real not null,
  fetched_at timestamptz not null default now()
);

-- AI summaries of map zones ("what's wrong around me"), cached per grid cell.
create table if not exists zone_summaries (
  cell text primary key,
  summary text not null,
  stats jsonb,
  updated_at timestamptz not null default now()
);

alter table incidents enable row level security;
alter table citizen_confirmations enable row level security;
alter table weather_daily enable row level security;
alter table zone_summaries enable row level security;
create policy "incidents are public" on incidents for select to anon, authenticated using (true);

-- Live incident alerts on every open map.
alter publication supabase_realtime add table incidents;

-- The map query, now with priority, accessibility, stage, incident and recurrence.
drop function if exists issues_in_bbox(double precision, double precision, double precision, double precision, issue_status, issue_category, text, int);
create function issues_in_bbox(
  p_min_lng double precision, p_min_lat double precision,
  p_max_lng double precision, p_max_lat double precision,
  p_status issue_status default null,
  p_category issue_category default null,
  p_corporation text default null,
  p_limit int default 500)
returns table (
  id bigint, category issue_category, severity smallint, summary text, status issue_status,
  lat double precision, lng double precision, address text, corporation_id text,
  backer_count int, created_at timestamptz, photo_path text,
  verified_at timestamptz, accessibility text, priority real, stage text,
  incident_id bigint, recurrence_of bigint, segment_key text)
language sql stable as $$
  select i.id, i.category, i.severity, i.summary, i.status,
         st_y(i.location::geometry), st_x(i.location::geometry),
         i.address, i.corporation_id, i.backer_count, i.created_at,
         (select r.photo_path from reports r where r.issue_id = i.id and r.photo_path is not null order by r.created_at limit 1),
         i.verified_at, i.accessibility, i.priority, i.stage, i.incident_id, i.recurrence_of, i.segment_key
  from issues i
  where i.location && st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    and (p_status is null or i.status = p_status)
    and (p_category is null or i.category = p_category)
    and (p_corporation is null or i.corporation_id = p_corporation)
  order by i.created_at desc
  limit least(p_limit, 2000);
$$;

drop function if exists issue_detail(bigint);
create function issue_detail(p_id bigint)
returns table (
  id bigint, category issue_category, severity smallint, summary text, status issue_status,
  lat double precision, lng double precision, address text, agency text, corporation_id text,
  ward_id int, backer_count int, complaint_letter text, depth_class text,
  created_at timestamptz, verified_at timestamptz,
  accessibility text, priority real, priority_factors jsonb, stage text, assignment jsonb,
  case_file jsonb, scenario jsonb, evidence jsonb, road_class text, segment_key text,
  recurrence_of bigint, repair_lasted_days int, incident_id bigint)
language sql stable as $$
  select i.id, i.category, i.severity, i.summary, i.status,
         st_y(i.location::geometry), st_x(i.location::geometry),
         i.address, i.agency, i.corporation_id, i.ward_id, i.backer_count, i.complaint_letter,
         i.depth_class, i.created_at, i.verified_at,
         i.accessibility, i.priority, i.priority_factors, i.stage, i.assignment,
         i.case_file, i.scenario, i.evidence, i.road_class, i.segment_key,
         i.recurrence_of, i.repair_lasted_days, i.incident_id
  from issues i where i.id = p_id;
$$;

-- An incident's centre as numbers.
create or replace function incident_points()
returns table (id bigint, lat double precision, lng double precision)
language sql stable as $$
  select n.id, st_y(n.center::geometry), st_x(n.center::geometry) from incidents n;
$$;

-- Saves an incident found by the clustering code; the signature keeps its id stable.
create or replace function upsert_incident(
  p_signature text, p_kind text, p_title text, p_root_cause text, p_graph jsonb, p_explanation text,
  p_confidence real, p_lng double precision, p_lat double precision, p_radius_m real,
  p_report_count int, p_issue_count int, p_categories jsonb, p_first_at timestamptz, p_last_at timestamptz,
  p_issue_ids bigint[])
returns bigint
language plpgsql as $$
declare
  v_id bigint;
begin
  insert into incidents (signature, kind, title, root_cause, graph, explanation, confidence, center, radius_m,
                         report_count, issue_count, categories, first_at, last_at)
  values (p_signature, p_kind, p_title, p_root_cause, p_graph, p_explanation, p_confidence,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m,
          p_report_count, p_issue_count, p_categories, p_first_at, p_last_at)
  on conflict (signature) do update set
    title = excluded.title, root_cause = excluded.root_cause, graph = excluded.graph,
    explanation = coalesce(excluded.explanation, incidents.explanation), confidence = excluded.confidence,
    center = excluded.center, radius_m = excluded.radius_m, report_count = excluded.report_count,
    issue_count = excluded.issue_count, categories = excluded.categories,
    first_at = excluded.first_at, last_at = excluded.last_at, status = 'active', updated_at = now()
  returning id into v_id;
  update issues set incident_id = v_id where id = any(p_issue_ids) and (incident_id is null or incident_id <> v_id);
  return v_id;
end $$;

-- F7 recurrence: verified issues of the same category near a point, newest repair first.
create or replace function verified_nearby(
  p_lng double precision, p_lat double precision, p_category issue_category, p_radius_m double precision default 40)
returns table (id bigint, verified_at timestamptz, distance_m double precision, recurrence_of bigint)
language sql stable as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select i.id, i.verified_at, st_distance(i.location, pt.g), i.recurrence_of
  from issues i, pt
  where i.status = 'verified' and i.category = p_category and st_dwithin(i.location, pt.g, p_radius_m)
  order by i.verified_at desc nulls last;
$$;

revoke execute on function issues_in_bbox(double precision, double precision, double precision, double precision, issue_status, issue_category, text, int) from public, anon, authenticated;
revoke execute on function issue_detail(bigint) from public, anon, authenticated;
revoke execute on function incident_points() from public, anon, authenticated;
revoke execute on function upsert_incident(text, text, text, text, jsonb, text, real, double precision, double precision, real, int, int, jsonb, timestamptz, timestamptz, bigint[]) from public, anon, authenticated;
revoke execute on function verified_nearby(double precision, double precision, issue_category, double precision) from public, anon, authenticated;
grant execute on function issues_in_bbox(double precision, double precision, double precision, double precision, issue_status, issue_category, text, int) to service_role;
grant execute on function issue_detail(bigint) to service_role;
grant execute on function incident_points() to service_role;
grant execute on function upsert_incident(text, text, text, text, jsonb, text, real, double precision, double precision, real, int, int, jsonb, timestamptz, timestamptz, bigint[]) to service_role;
grant execute on function verified_nearby(double precision, double precision, issue_category, double precision) to service_role;
