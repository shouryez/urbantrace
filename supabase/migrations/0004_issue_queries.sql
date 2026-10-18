-- 0004_issue_queries.sql: queries for duplicates (F4), routing (F5), the issue page (F8) and
-- fix verification (F7). All are called only by the server with the service role key.

-- The five city corporations, so issues can reference them before boundaries are seeded.
-- Names and contact emails must be confirmed from official pages (open task in the plan).
insert into corporations (id, name) values
  ('west',    'Bengaluru West City Corporation'),
  ('east',    'Bengaluru East City Corporation'),
  ('north',   'Bengaluru North City Corporation'),
  ('south',   'Bengaluru South City Corporation'),
  ('central', 'Bengaluru Central City Corporation')
on conflict (id) do nothing;

-- F4: unverified issues of any category near a point, nearest first. The app shows the one
-- matching the chosen category in the "Same problem?" step.
create or replace function nearby_unverified_issues(
  p_lng double precision, p_lat double precision,
  p_radius_m double precision default 30, p_limit int default 5)
returns table (
  id bigint, category issue_category, summary text, backer_count int,
  distance_m double precision, photo_path text)
language sql stable as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select i.id, i.category, i.summary, i.backer_count,
         st_distance(i.location, pt.g),
         (select r.photo_path from reports r where r.issue_id = i.id order by r.created_at limit 1)
  from issues i, pt
  where i.status <> 'verified' and st_dwithin(i.location, pt.g, p_radius_m)
  order by st_distance(i.location, pt.g)
  limit least(p_limit, 20);
$$;

-- F5: the corporation and ward covering a point; nulls when boundaries are not seeded yet.
create or replace function locate_point(p_lng double precision, p_lat double precision)
returns table (corporation_id text, ward_id int)
language sql stable as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select
    (select c.id from corporations c, pt where c.boundary is not null and st_covers(c.boundary, pt.g) limit 1),
    (select w.id from wards w, pt where w.boundary is not null and st_covers(w.boundary, pt.g) limit 1);
$$;

-- F8: one issue with plain lat/lng.
create or replace function issue_detail(p_id bigint)
returns table (
  id bigint, category issue_category, severity smallint, summary text, status issue_status,
  lat double precision, lng double precision, address text, agency text, corporation_id text,
  ward_id int, backer_count int, complaint_letter text, depth_class text,
  created_at timestamptz, verified_at timestamptz)
language sql stable as $$
  select i.id, i.category, i.severity, i.summary, i.status,
         st_y(i.location::geometry), st_x(i.location::geometry),
         i.address, i.agency, i.corporation_id, i.ward_id, i.backer_count, i.complaint_letter,
         i.depth_class, i.created_at, i.verified_at
  from issues i where i.id = p_id;
$$;

-- F4 target and F7: metres from an issue to a point.
create or replace function distance_to_issue(p_id bigint, p_lng double precision, p_lat double precision)
returns double precision
language sql stable as $$
  select st_distance(i.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)
  from issues i where i.id = p_id;
$$;

revoke execute on function nearby_unverified_issues(double precision, double precision, double precision, int) from public, anon, authenticated;
revoke execute on function locate_point(double precision, double precision) from public, anon, authenticated;
revoke execute on function issue_detail(bigint) from public, anon, authenticated;
revoke execute on function distance_to_issue(bigint, double precision, double precision) from public, anon, authenticated;
grant execute on function nearby_unverified_issues(double precision, double precision, double precision, int) to service_role;
grant execute on function locate_point(double precision, double precision) to service_role;
grant execute on function issue_detail(bigint) to service_role;
grant execute on function distance_to_issue(bigint, double precision, double precision) to service_role;
