-- 0002_submit_report.sql: the atomic 30 m merge (Build Plan, Data model > The merge function, F4)

create or replace function submit_report(
  p_category issue_category, p_severity int, p_summary text,
  p_lng double precision, p_lat double precision,
  p_photo_path text, p_ai jsonb, p_device text,
  p_force_new boolean default false,       -- user tapped "No, it's different"
  p_target_issue_id bigint default null)   -- user confirmed a match (F12) or came from "I see this too";
                                           -- the server checks the report is within 30 m of it first
returns table (out_issue_id bigint, out_merged boolean)
language plpgsql as $$
declare
  pt geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  match_id bigint;
begin
  if p_target_issue_id is not null then
    match_id := p_target_issue_id;
  elsif not p_force_new then
    select i.id into match_id from issues i
    where i.category = p_category and i.status <> 'verified'
      and st_dwithin(i.location, pt, 30)
    order by st_distance(i.location, pt)
    limit 1;
  end if;

  if match_id is not null and exists (
    select 1 from reports r where r.issue_id = match_id and r.device_id = p_device) then
    out_issue_id := match_id; out_merged := true; return next; return;  -- same person, no double count
  end if;

  if match_id is null then
    insert into issues (category, severity, summary, location)
    values (p_category, p_severity, p_summary, pt)
    returning id into match_id;
    insert into issue_events (issue_id, kind) values (match_id, 'reported');
    out_merged := false;
  else
    update issues set backer_count = backer_count + 1,
                      severity = greatest(severity, p_severity)
    where id = match_id;
    insert into issue_events (issue_id, kind) values (match_id, 'merged');
    out_merged := true;
  end if;

  insert into reports (issue_id, photo_path, location, ai_result, device_id)
  values (match_id, p_photo_path, pt, p_ai, p_device);
  out_issue_id := match_id;
  return next;
end $$;

-- Only the server (service role) may call the merge; Postgres grants execute to public by default.
revoke execute on function submit_report(issue_category, int, text, double precision, double precision, text, jsonb, text, boolean, bigint) from public, anon, authenticated;
grant execute on function submit_report(issue_category, int, text, double precision, double precision, text, jsonb, text, boolean, bigint) to service_role;
