-- 0005_stretch.sql: embedding matching (F12), dashboard views (F10) and dataset consent (F14).
-- Functions and views are read only by the server with the service role key.

-- F12: unverified issues of any category within 30 m, closest meaning first (cosine distance of
-- the "<category>: <summary>" embeddings). The app asks "Is this the same?" below a threshold.
create or replace function similar_unverified_issues(
  p_lng double precision, p_lat double precision, p_embedding vector(768),
  p_radius_m double precision default 30, p_limit int default 3)
returns table (
  id bigint, category issue_category, summary text, backer_count int,
  distance_m double precision, cosine_distance double precision, photo_path text)
language sql stable
set search_path = public, extensions
as $$
  with pt as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select i.id, i.category, i.summary, i.backer_count,
         st_distance(i.location, pt.g),
         i.embedding <=> p_embedding,
         (select r.photo_path from reports r where r.issue_id = i.id order by r.created_at limit 1)
  from issues i, pt
  where i.status <> 'verified' and i.embedding is not null
    and st_dwithin(i.location, pt.g, p_radius_m)
  order by i.embedding <=> p_embedding
  limit least(p_limit, 10);
$$;

revoke execute on function similar_unverified_issues(double precision, double precision, vector, double precision, int)
  from public, anon, authenticated;
grant execute on function similar_unverified_issues(double precision, double precision, vector, double precision, int)
  to service_role;

-- F10: open, fix claimed and verified counts and the median hours from report to verified fix,
-- per corporation and per ward. Wards stay empty until ward boundaries are seeded.
create or replace view corporation_stats with (security_invoker = true) as
select c.id, c.name,
       count(i.id) filter (where i.status = 'open')        as open_count,
       count(i.id) filter (where i.status = 'fix_claimed') as fix_claimed_count,
       count(i.id) filter (where i.status = 'verified')    as verified_count,
       percentile_cont(0.5) within group (order by extract(epoch from i.verified_at - i.created_at) / 3600)
         filter (where i.verified_at is not null)           as median_hours_to_fix
from corporations c
left join issues i on i.corporation_id = c.id
group by c.id, c.name;

create or replace view ward_stats with (security_invoker = true) as
select w.id, w.name, w.corporation_id,
       count(i.id) filter (where i.status = 'open')        as open_count,
       count(i.id) filter (where i.status = 'fix_claimed') as fix_claimed_count,
       count(i.id) filter (where i.status = 'verified')    as verified_count,
       percentile_cont(0.5) within group (order by extract(epoch from i.verified_at - i.created_at) / 3600)
         filter (where i.verified_at is not null)           as median_hours_to_fix
from wards w
left join issues i on i.ward_id = w.id
group by w.id, w.name, w.corporation_id;

-- Issues by category, split by corporation so the chart can follow a selected card.
-- corporation_id is null for BWSSB, BESCOM and unassigned issues.
create or replace view category_stats with (security_invoker = true) as
select i.corporation_id, i.category, i.status, count(*)::int as issue_count
from issues i
group by i.corporation_id, i.category, i.status;

revoke all on corporation_stats, ward_stats, category_stats from public, anon, authenticated;
grant select on corporation_stats, ward_stats, category_stats to service_role;

-- F14: consent to include the blurred photo in the open dataset, per report and per after photo.
alter table reports add column if not exists dataset_consent boolean not null default false;
alter table verifications add column if not exists dataset_consent boolean not null default false;

-- F14: a report's location as numbers, for the dataset export script (rounded there).
create or replace function report_point(p_id bigint)
returns table (lat double precision, lng double precision)
language sql stable as $$
  select st_y(r.location::geometry), st_x(r.location::geometry) from reports r where r.id = p_id;
$$;

revoke execute on function report_point(bigint) from public, anon, authenticated;
grant execute on function report_point(bigint) to service_role;
