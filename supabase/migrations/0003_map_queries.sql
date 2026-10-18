-- 0003_map_queries.sql: read queries for the public map (F3)

-- Issues inside the visible map area, newest first, with plain lat/lng for the pins and the
-- first report's photo for the issue card. Filters are optional (null = any).
create or replace function issues_in_bbox(
  p_min_lng double precision, p_min_lat double precision,
  p_max_lng double precision, p_max_lat double precision,
  p_status issue_status default null,
  p_category issue_category default null,
  p_corporation text default null,
  p_limit int default 500)
returns table (
  id bigint, category issue_category, severity smallint, summary text, status issue_status,
  lat double precision, lng double precision, address text, corporation_id text,
  backer_count int, created_at timestamptz, photo_path text)
language sql stable as $$
  select i.id, i.category, i.severity, i.summary, i.status,
         st_y(i.location::geometry), st_x(i.location::geometry),
         i.address, i.corporation_id, i.backer_count, i.created_at,
         (select r.photo_path from reports r where r.issue_id = i.id order by r.created_at limit 1)
  from issues i
  where i.location && st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::geography
    and (p_status is null or i.status = p_status)
    and (p_category is null or i.category = p_category)
    and (p_corporation is null or i.corporation_id = p_corporation)
  order by i.created_at desc
  limit least(p_limit, 1000);
$$;

-- Called only by the server, like submit_report.
revoke execute on function issues_in_bbox(double precision, double precision, double precision, double precision, issue_status, issue_category, text, int) from public, anon, authenticated;
grant execute on function issues_in_bbox(double precision, double precision, double precision, double precision, issue_status, issue_category, text, int) to service_role;

-- Realtime: push issue inserts and updates to every open map. Clients receive only what the
-- anon select policy on issues allows.
alter publication supabase_realtime add table issues;
