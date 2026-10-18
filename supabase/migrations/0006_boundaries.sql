-- 0006_boundaries.sql: loading corporation and ward boundaries (F5) and the ward map (F10).
-- Called only by the server and scripts/seed-boundaries.ts with the service role key.

-- F5: a corporation's boundary from GeoJSON (Polygon or MultiPolygon, WGS 84).
create or replace function set_corporation_boundary(p_id text, p_geojson text)
returns boolean
language sql as $$
  update corporations
  set boundary = st_multi(st_setsrid(st_geomfromgeojson(p_geojson), 4326))::geography
  where id = p_id
  returning true;
$$;

-- F5: a ward from GeoJSON; returns its id.
create or replace function insert_ward(p_name text, p_corporation_id text, p_geojson text)
returns int
language sql as $$
  insert into wards (name, corporation_id, boundary)
  values (p_name, p_corporation_id, st_multi(st_setsrid(st_geomfromgeojson(p_geojson), 4326))::geography)
  returning id;
$$;

-- Removes every ward, so a fresh boundary file can be loaded; issues keep their corporation.
create or replace function clear_wards()
returns void
language sql as $$
  update issues set ward_id = null where ward_id is not null;
  delete from wards;
$$;

-- After loading boundaries: fill in the corporation and ward of issues routed before they existed.
create or replace function backfill_issue_areas()
returns int
language plpgsql as $$
declare
  n int;
begin
  update issues i set corporation_id = c.id
  from corporations c
  where i.agency = 'corporation' and i.corporation_id is null
    and c.boundary is not null and st_covers(c.boundary, i.location);
  update issues i set ward_id = w.id
  from wards w
  where i.ward_id is null and st_covers(w.boundary, i.location);
  get diagnostics n = row_count;
  return n;
end $$;

-- F10: each ward's outline as GeoJSON with its counts, for the shaded ward map.
create or replace function ward_shapes()
returns table (
  id int, name text, corporation_id text,
  open_count bigint, fix_claimed_count bigint, verified_count bigint,
  median_hours_to_fix double precision, geojson jsonb)
language sql stable as $$
  select s.id, s.name, s.corporation_id, s.open_count, s.fix_claimed_count, s.verified_count,
         s.median_hours_to_fix, st_asgeojson(w.boundary::geometry, 5)::jsonb
  from ward_stats s
  join wards w on w.id = s.id
  where w.boundary is not null;
$$;

-- F10: issues by category per ward, so the chart can follow a selected ward.
create or replace view ward_category_stats with (security_invoker = true) as
select i.ward_id, i.category, i.status, count(*)::int as issue_count
from issues i
where i.ward_id is not null
group by i.ward_id, i.category, i.status;

revoke all on ward_category_stats from public, anon, authenticated;
grant select on ward_category_stats to service_role;

revoke execute on function set_corporation_boundary(text, text) from public, anon, authenticated;
revoke execute on function insert_ward(text, text, text) from public, anon, authenticated;
revoke execute on function clear_wards() from public, anon, authenticated;
revoke execute on function backfill_issue_areas() from public, anon, authenticated;
revoke execute on function ward_shapes() from public, anon, authenticated;
grant execute on function set_corporation_boundary(text, text) to service_role;
grant execute on function insert_ward(text, text, text) to service_role;
grant execute on function clear_wards() to service_role;
grant execute on function backfill_issue_areas() to service_role;
grant execute on function ward_shapes() to service_role;
