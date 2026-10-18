# UrbanTrace: End-to-End Build Plan

Oct 18, 2026 · @Shourya

## Overview

UrbanTrace is an open source web app that traces a civic issue from a photo report to a verified fix, using an open weight AI model we host ourselves. It is built by team Code Not Found for the MLH Hacktoberfest Hack Day challenge, Best Open-Source AI Project, in the domain Climate, sustainability and civic impact.

**Pitch:** a resident snaps a photo of a pothole or garbage pile. The model reads it, merges it with nearby reports of the same problem, routes it to the right authority with a drafted complaint, and closes it only when an after photo proves the repair.

**Team Code Not Found:** Shourya Pratap Singh Chouhan, Daksh Bhatt, Shreya Singh Chouhan, Devansh Jain.

**What sets it apart from existing reporting apps:**

- **Open and self hostable.** No paid AI API, so any residents' association, campus or ward office can run it, and photos are not sent to an AI vendor.
- **Merged reports.** Forty reports of one pothole become one issue with forty backers.
- **Proof of fix.** An issue is closed only when the model confirms an after photo shows the repair.

**Scope rule for this plan:** it builds exactly the features we committed to in the idea form and the 6 slide deck, nothing more. The Feature scope section lists them, and every later section refers back to that list.

## Feature scope

We build 17 features in four tiers, in this order: each tier is a working demo without the next one. Tiers 1 and 2 are the hack day promise; tiers 3 and 4 are the roadmap we named in the form and deck.

| # | Feature | What it does | Tier |
| --- | --- | --- | --- |
| F1 | Photo report | Camera capture and GPS location from any phone browser, no app install; drop a pin by hand if GPS fails | 1 Core loop |
| F2 | AI reading | Model returns issue type, severity 1 to 5 and a one line description as fixed schema JSON; the user can correct it | 1 Core loop |
| F3 | Public map | Every issue as a pin coloured by status (Open, Fix claimed, Verified) with its backer count, plus a list view | 1 Core loop |
| F4 | Duplicate merge | A report of the same type within 30 m joins the existing issue as a backer instead of a new ticket | 2 Differentiator |
| F5 | Routing | Matches the issue to the responsible body: one of the five city corporations, BWSSB or BESCOM | 2 Differentiator |
| F6 | Complaint letter | Model drafts a formal complaint addressed to that body, ready to copy, download or email | 2 Differentiator |
| F7 | Fix verification | An after photo of the same spot is compared with the original; the issue closes only if the model confirms the repair | 2 Differentiator |
| F8 | Issue trail | A timeline on each issue: Reported, Merged, Routed, Fix claimed, Verified | 2 Differentiator |
| F9 | Voice reports | Speak the report; Whisper transcribes it and the text feeds F2 | 3 Stretch |
| F10 | Ward dashboard | Open and verified counts, and time to verified fix, per corporation and ward | 3 Stretch |
| F11 | Face and plate blurring | Open detection models blur faces and number plates before a photo is stored or shown | 3 Stretch |
| F12 | Embedding matching | An open embedding model catches duplicates that F4 misses when the model labels them differently | 3 Stretch |
| F13 | Pothole depth | Open depth estimation gives each pothole a rough size and depth class | 3 Stretch |
| F14 | Open dataset | Publish the blurred, labelled photos as an open dataset | 3 Stretch |
| F15 | Email or SMS alerts | Notify backers when their issue changes status, and send complaints by email | 4 Future integration |
| F16 | Grievance portal | Submit complaints to official grievance portals where they offer an API | 4 Future integration |
| F17 | Rainfall priority | Use public rainfall data to raise the priority of waterlogging reports | 4 Future integration |

The issue categories follow from the routing in F5: pothole, garbage, streetlight, waterlogging, water leak or sewage, power line hazard, and other.

## Architecture and tech stack

The browser never talks to a model: every AI call goes from the Next.js server to Ollama on the same machine, and Supabase stores the results and pushes live updates to every open map.

&#91;embedded content: system architecture · 6 components, dashed = stretch\]

The highlighted box is the open weight model at the centre of the project; the dashed service is only needed for the stretch features F9, F11 and F13.

| Layer | Choice | Licence |
| --- | --- | --- |
| Framework | Next.js (App Router, TypeScript) | MIT |
| Styling | Tailwind CSS v4 | MIT |
| Motion | Motion (`motion/react`) and Lenis | MIT, MIT |
| Map | Leaflet with leaflet.markercluster, used directly in a client component | BSD 2-Clause, MIT |
| Charts | Recharts (F10) | MIT |
| Icons | Lucide | ISC |
| Validation and images | Zod, sharp | MIT, Apache 2.0 |
| Model runtime | Ollama | MIT |
| Database | Supabase: PostgreSQL, PostGIS, Storage, Realtime | Apache 2.0; PostgreSQL License; GPL 2.0 |
| Stretch service | FastAPI, faster-whisper | MIT, MIT |
| Map data | OpenStreetMap tiles and Nominatim | ODbL data, with attribution |

These licences are from memory; confirm each in its repository before the README goes out. We use Leaflet directly rather than the React Leaflet wrapper, because that wrapper's licence should be checked against the open source requirement first.

## Data model

Five tables in PostgreSQL with PostGIS hold everything, and one database function does the 30 m merge so it is atomic. Photos live in a Supabase Storage bucket; the tables store only their paths.

| Table | Holds | Used by |
| --- | --- | --- |
| corporations, wards | Name, contact email and boundary polygon of each city corporation and ward | F5, F10 |
| issues | One row per real world problem: category, severity, summary, status, location, routing, backer count, letter | F2 to F8 |
| reports | Every individual photo report, with the raw AI JSON, linked to its issue | F1, F2, F4 |
| verifications | Each after photo, its distance from the issue and the model's verdict | F7 |
| issue\_events | The trail: reported, merged, routed, fix\_claimed, verified, verification\_failed | F8 |

**Status lifecycle:** an issue starts as `open`, becomes `fix_claimed` while an after photo is being checked, then `verified` if it passes or back to `open` if it fails. These three states are the three pin colours on the map.

### Schema

```sql
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
```

### The merge function (F4)

The app calls this once per report. It finds an unverified issue of the same category within 30 m, nearest first; if there is one it adds a backer, otherwise it creates a new issue.

```sql
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
```

The output columns are named `out_issue_id` and `out_merged` on purpose: naming them `issue_id` would clash with the `reports.issue_id` column inside the function. A report near a verified issue creates a fresh issue, so a pothole that returns is tracked again.

## AI pipeline

One open weight model, Gemma 4 E4B served by Ollama, does the three core AI jobs: read the photo, draft the complaint and verify the fix. It is pulled as `gemma4:e4b`, a 9.6 GB download that takes text and image input ([source](https://www.itechguides.com/?p=331053)). Every call asks for JSON that matches a fixed schema, so the app never parses free text.

### Models

| Model | Job | Feature | Licence |
| --- | --- | --- | --- |
| Gemma 4 E4B (`gemma4:e4b`) | Read photo, draft letter, verify fix | F2, F6, F7 | Apache 2.0 |
| Qwen3-VL (tag to confirm on ollama.com) | Benchmarked against Gemma; the better one ships | F2, F7 | Apache 2.0, confirm for the size used |
| Gemma 4 E2B (`gemma4:e2b`) | Fallback if E4B is too slow on our laptop | F2, F6, F7 | Apache 2.0 |
| Whisper, run with faster-whisper | Voice to text | F9 | MIT |
| A face detector and a number plate detector | Find regions to blur | F11 | Confirm per model before use |
| nomic-embed-text, via Ollama | Text embeddings of each issue summary | F12 | Confirm on the model card |
| Depth Anything V2 Small | Relative depth of a pothole | F13 | Confirm on the model card; larger sizes are non commercial |

### Calling Ollama

All calls go from Next.js route handlers on the server to Ollama on `localhost:11434`; the browser never talks to the model. Photos are resized to 1024 px on the long side before sending, which keeps each call fast.

```ts
// lib/ai/ollama.ts
export async function askVision<T>(system: string, user: string, images: string[], schema: object): Promise<T> {
  const res = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.VISION_MODEL,      // 'gemma4:e4b'
      stream: false,
      format: schema,                        // structured output: JSON schema
      options: { temperature: 0 },
      keep_alive: '30m',                     // keep the model loaded between reports
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user, images },   // base64 strings, no data: prefix
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json();
  return JSON.parse(data.message.content) as T;
}
```

Every reply is checked with a Zod schema. If it fails, the call is retried once; if it fails again, the user picks the category by hand and the report still goes through.

### Job 1: read the photo (F2)

```json
{
  "type": "object",
  "properties": {
    "is_civic_issue": { "type": "boolean" },
    "category": { "enum": ["pothole", "garbage", "streetlight", "waterlogging", "water_leak_sewage", "power_hazard", "other"] },
    "severity": { "type": "integer", "minimum": 1, "maximum": 5 },
    "summary": { "type": "string", "maxLength": 120 }
  },
  "required": ["is_civic_issue", "category", "severity", "summary"]
}
```

System prompt, in short:

- You inspect street photos from Bengaluru for a civic reporting app.
- Set `is_civic_issue` to false for anything that is not a public infrastructure problem, such as a selfie or an indoor photo.
- Severity: 1 cosmetic, 2 minor inconvenience, 3 slows traffic or walking, 4 risk of injury or vehicle damage, 5 immediate danger.
- Summary: one plain sentence a city engineer could act on, describing only what is visible.

If `is_civic_issue` is false, the app asks the user to retake the photo instead of filing it.

### Job 2: draft the complaint (F6)

Input is text only: category, severity, summary, address, the responsible body's name, backer count, the issue link and today's date. Output schema is `{ subject, body }`. The prompt asks for a formal, polite letter under 180 words that cites the location and backer count and asks for a repair, with no invented facts such as dates of earlier complaints.

### Job 3: verify the fix (F7)

The before and after photos go in one message, in that order.

```json
{
  "type": "object",
  "properties": {
    "same_location": { "type": "boolean" },
    "issue_resolved": { "type": "boolean" },
    "confidence": { "enum": ["low", "medium", "high"] },
    "reason": { "type": "string", "maxLength": 160 }
  },
  "required": ["same_location", "issue_resolved", "confidence", "reason"]
}
```

**Pass rule:** the after photo's GPS is within 50 m of the issue, and the model says `same_location` true, `issue_resolved` true and confidence medium or high. The GPS check is plain code, so the model alone cannot close an issue. If the model handles two images poorly in testing, stitch them side by side into one image with sharp and send that instead.

## Feature build specs

Each feature below lists what to build, in order, with the endpoint or file it lives in. Reporting is two calls on purpose: `analyze` reads the photo and checks for duplicates, then `submit` files it, so the user can correct the AI and see a match before anything is saved.

### F1 Photo report

1. Capture with `<input type="file" accept="image/*" capture="environment">`, which opens the rear camera on phones; show a preview from an object URL.
2. Get location with `navigator.geolocation.getCurrentPosition` and `enableHighAccuracy: true`. Phones only allow this on HTTPS, so the dev server runs behind a tunnel.
3. If permission is denied or accuracy is worse than 50 m, show a draggable pin on a small map and use where the user drops it.
4. `POST /api/reports/analyze` with the photo and coordinates. The server corrects orientation with sharp `rotate()`, resizes to 1600 px, re-encodes as JPEG at quality 80 (sharp drops EXIF metadata, including the phone's own GPS tag), and uploads to the `photos` bucket at `reports/<uuid>.jpg`.
5. Look up a street address with OpenStreetMap's Nominatim reverse geocoder from the server, cached, at most one request a second as its usage policy asks.
6. Give each browser an anonymous `device_id` (a random UUID kept in localStorage, wrapped in try/catch) so one person cannot back the same issue twice.

### F2 AI reading

1. Inside `analyze`, run Job 1 on a 1024 px copy and return the JSON with the photo path.
2. Show a result card: category chip (tap to change), severity meter (drag to change) and an editable summary. Set `user_edited` if anything changed.
3. `POST /api/reports/submit` calls `submit_report` and returns the issue id and whether it merged.

### F3 Public map

1. Leaflet used directly in a client component, loaded on the client only with `next/dynamic` and `ssr: false`, since Leaflet needs `window`.
2. OpenStreetMap tiles with a CSS filter on the tile layer for the dark look (invert, hue rotate, lowered brightness), so we need no extra tile provider.
3. `GET /api/issues?bbox=` returns GeoJSON for the visible area; refetch on pan, debounced 300 ms.
4. Pins are `L.divIcon` HTML: a circle in the status colour with the backer count inside. Cluster them with leaflet.markercluster when zoomed out.
5. Subscribe to Supabase Realtime on `issues`, so a new or merged report drops onto every open map live. This is what makes the demo work on the big screen.
6. Filters for category, status and corporation; a list panel beside the map (a bottom sheet on phones) stays in sync with it.

### F4 Duplicate merge

1. During `analyze`, query unverified issues of the same category within 30 m. If one exists, show it before submitting: its photo, backer count and two buttons, "Yes, add my support" and "No, it's different". "No" sets the force new flag, so a separate issue is created.
2. `submit_report` does the real merge in the database, so two people reporting at once cannot create two issues.
3. After a merge, the success screen counts the backer number up by one and links to the issue.

### F5 Routing

1. Agency by category, in code: pothole, garbage, streetlight, waterlogging and other go to the city corporation; water leak or sewage goes to BWSSB; power line hazard goes to BESCOM.
2. For corporation issues, find the corporation and ward with `st_covers(boundary, point)` and save them on the issue.
3. Load boundary GeoJSON for the five corporations and their wards with a seed script using `st_geomfromgeojson`. Finding an official source for these files is an open task; confirm the corporation names, contact emails and ward count from official pages at the same time.
4. Fallback when boundaries are missing: route by category only, and let the user pick their corporation from a list of five.
5. Insert a `routed` event naming the body.

### F6 Complaint letter

1. Generate after a new issue is created, without blocking the success screen, and store it on the issue.
2. On the issue page, "Refresh letter" regenerates it with the current backer count.
3. Actions: copy, print or save as PDF through a print stylesheet, and an email button that opens a `mailto:` link with the subject, body and the body's address filled in. F15 later replaces `mailto:` with real sending.

### F7 Fix verification

1. The issue page has "Submit fix photo", which opens `/issue/[id]/verify` with the same camera and GPS capture as F1.
2. `POST /api/issues/[id]/verify` sets status to `fix_claimed`, logs the event, measures the distance with `st_distance`, then runs Job 3.
3. Apply the pass rule. Pass sets `verified` and `verified_at`; fail sets the issue back to `open` and logs `verification_failed` with the model's reason.
4. Allow one verification in progress per issue at a time.

### F8 Issue trail

1. Read `issue_events` for the issue, oldest first.
2. Draw a vertical timeline, one icon per kind; a merged event shows the running backer count, routed shows the body's name, a failed verification shows the reason.

### F9 Voice reports

1. A small Python FastAPI service in `services/ml` runs faster-whisper with the multilingual `small` model on port 8001.
2. The report screen records up to 30 s with `MediaRecorder`; `/api/voice` forwards the audio and returns a transcript.
3. The photo is still required, because merging and verification need it. The transcript goes into Job 1 as extra context and is saved in `reports.transcript`.

### F10 Ward dashboard

1. A SQL view per corporation and ward: open, fix claimed and verified counts, plus median hours from `created_at` to `verified_at`.
2. `/dashboard`: corporation cards with those numbers, a ward map shaded by open issues, and a bar chart of issues by category (Recharts).
3. Without ward boundaries, show corporation level only.

### F11 Face and plate blurring

1. Add a `/blur` endpoint to `services/ml`: run the face detector and the plate detector, then Gaussian blur each box.
2. Call it in the F1 pipeline before upload, so only the blurred photo is ever stored and every later step uses it.

### F12 Embedding matching

1. On issue creation, embed `"<category>: <summary>"` with nomic-embed-text through Ollama's `/api/embed` and store the vector.
2. During `analyze`, also search unverified issues within 30 m of any category, ordered by cosine distance (`embedding <=> $1`). Below a threshold tuned on the test photos, ask "Is this the same as issue #128?" with both photos side by side.
3. If the user says yes, `submit_report` takes an optional target issue id and merges into it.

### F13 Pothole depth

1. For potholes only, a `/depth` endpoint in `services/ml` runs Depth Anything V2 Small.
2. The model gives relative depth, not centimetres, so compare the pothole area with the road around it and store a class: shallow, moderate or deep. Label it "estimated" in the UI.

### F14 Open dataset

1. Requires F11 first. Add a consent checkbox to the report form: allow this blurred photo in the open dataset.
2. An export script writes consented photos with category, severity, summary and before and after pairs, rounds coordinates to 3 decimals (about 100 m) and drops device ids.
3. Publish on Hugging Face Datasets with a datasheet and an open data licence such as CC BY 4.0.

### F15 to F17 Future integrations

- **F15 Email or SMS alerts:** an optional email field on the report, Nodemailer through an SMTP provider for email, an SMS gateway for texts; send on every status change.
- **F16 Grievance portal:** one adapter function per portal, `submitComplaint(issue)`, built only where a portal publishes an API. Which portals do is still to be researched.
- **F17 Rainfall priority:** pull a public rainfall feed for Bengaluru; after heavy rain, waterlogging issues move up the list and dashboard. The data source is still to be chosen.

## Design language

The look is **"asphalt and road markings"**: dark asphalt surfaces, road marking yellow for action, green only for a verified fix, orange only for an open problem. It carries over the palette and the dotted trace motif from our submission deck, so the app and the pitch feel like one product.

### Principles

- **Colour means status.** Yellow is for things you can do, orange is open, green is verified. Never use green or orange as decoration.
- **One motif, used everywhere:** the dotted trace path from a pin to a check mark. It is the scroll progress line, the loading indicator, the section dividers and the issue trail.
- **Data in mono.** Counts, severities, distances and issue numbers use the mono font so they read like a dashboard.
- **Dark first.** The app is dark by default; light tokens exist for the print view and users who prefer light mode.

### Colour tokens

| Token | Hex | Use |
| --- | --- | --- |
| `asphalt-950` | #0E1013 | Page background |
| `asphalt-900` | #15181C | Section background, phone frames |
| `asphalt-800` | #1D2127 | Cards |
| `asphalt-700` | #2B3038 | Raised cards, inputs, hover states |
| `slate-500` | #5E6773 | Borders, secondary text on light |
| `mist-300` | #A9B0B9 | Secondary text on dark |
| `chalk-50` | #F1F3F2 | Primary text on dark, light theme background |
| `marking-400` | #F5B700 | Primary buttons, focus ring, trace dots, links |
| `marking-100` | #FFF1C2 | Highlight tint in the light theme |
| `alert-500` | #E2512B | Open status, severity 4 and 5 |
| `verified-500` | #1E9E63 | Verified status, success states |
| `verified-100` | #DDF3E7 | Verified tint, map park blocks in mockups |

### Type

| Role | Font | Size and weight |
| --- | --- | --- |
| Display (hero, big stats) | Bricolage Grotesque | 72, 56 or 40 px, weight 700, tracking -2% |
| Headings | Bricolage Grotesque | 32 px / 22 px, weight 600 |
| Body | Inter | 16 px, weight 400, line height 1.6 |
| Small and captions | Inter | 14 px / 12 px, weight 500 |
| Kicker labels | Inter | 12 px, weight 700, uppercase, tracking 18% |
| Data and codes | JetBrains Mono | 14 to 40 px, weight 500 |

All three fonts are under the SIL Open Font License and load through `next/font/google`, so there is no layout shift.

### Shape, depth and texture

- Radius: 20 px for cards, 14 px for photos, 999 px for pills and buttons.
- Borders: 1 px at 6% white on dark cards. No drop shadows on dark; depth comes from a lighter surface (`asphalt-700`) and a soft yellow glow on focus or hover.
- Glass panels over the map: `asphalt-900` at 72% opacity with a 16 px backdrop blur.
- A 3% film grain overlay on the page background so large dark areas do not look flat.
- Icons: Lucide (ISC licence), 1.75 px stroke, one icon per category.

### Tailwind theme

```css
/* app/globals.css, Tailwind v4 */
@import "tailwindcss";

@theme {
  --color-asphalt-950: #0E1013;
  --color-asphalt-900: #15181C;
  --color-asphalt-800: #1D2127;
  --color-asphalt-700: #2B3038;
  --color-slate-500: #5E6773;
  --color-mist-300: #A9B0B9;
  --color-chalk-50: #F1F3F2;
  --color-marking-400: #F5B700;
  --color-marking-100: #FFF1C2;
  --color-alert-500: #E2512B;
  --color-verified-500: #1E9E63;
  --color-verified-100: #DDF3E7;

  --font-display: var(--font-bricolage);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-jetbrains);

  --radius-card: 20px;
  --radius-photo: 14px;
  --ease-out-expo: cubic-bezier(0.22, 1, 0.36, 1);
}
```

### Components

| Component | What it looks like | Used on |
| --- | --- | --- |
| `IssueCard` | Photo at 16:10 with the status pill over its corner, category chip, two line summary, a meta row of backers, distance and age in mono, and the severity meter | Map list, landing, dashboard |
| `StatusPill` | Icon plus word, filled in the status colour; never colour alone | Everywhere |
| `SeverityMeter` | Five lane dash segments; filled ones are yellow, turning orange at 4 and 5 | Result card, issue card |
| `CategoryChip` | Lucide icon plus label on `asphalt-700`; the selected one gets a yellow border | Report, filters |
| `BackerCount` | Mono number that rolls up digit by digit when it changes | Issue card, pins, success screen |
| `TraceTimeline` | Vertical dotted trace; each event is a node that fills when reached | Issue page |
| `BeforeAfter` | Two photos with a draggable divider and a verdict stamp | Issue page, landing |
| `PhoneFrame` | Rounded `asphalt-900` frame for app screens shown on the landing page | Landing |
| `MapPin` | Status coloured circle with the backer count; pulses once when new | Map |
| `BottomSheet` | Glass panel that drags up over the map on phones | Map, issue preview |
| `ScanLoader` | A yellow scan line sweeping over the photo while the model reads it | Report, verify |
| Buttons | Primary: yellow fill, dark text. Secondary: 1 px chalk outline. Ghost: text only | Everywhere |

**Accessibility:** yellow text is used only on dark backgrounds, focus rings are 2 px yellow with a 2 px offset, every status carries a word and an icon, and all motion respects `prefers-reduced-motion` (see Motion and scroll animation).

## Pages and UI flows

Six routes cover all 17 features: a scroll driven landing page that tells the story, and five app screens built for phones first. Navigation is a glass top bar on desktop and, on phones, a bottom tab bar with a raised yellow camera button in the middle for Report.

| Route | Purpose | Features |
| --- | --- | --- |
| `/` | Landing page: the story, live numbers and a live map preview | Shows all |
| `/report` | Five step report wizard | F1, F2, F4, F9, F11, F12, F13, F14 consent |
| `/map` | Full screen public map with list and filters | F3, F4 |
| `/issue/[id]` | Issue page: photos, trail, letter, back it, submit fix | F5, F6, F7, F8, F13 |
| `/issue/[id]/verify` | After photo capture and verdict | F7 |
| `/dashboard` | Corporation and ward dashboard | F10, F17 later |

### Landing page `/`

Eight full height sections, each one idea, connected by a single dotted trace line that draws itself down the page as you scroll (motion details under Motion and scroll animation).

1. **Hero.** Headline "Every pothole, traced to its fix." with the subline "Snap it. We route it. It closes only with proof." Behind it, a dark street grid map drifts slowly; in front, the trace runs from an orange pin to a green check. Two buttons: Report an issue (yellow) and See the live map (outline). Below, three live counters from the database: issues reported, people backing them, fixes verified.
2. **The problem.** Three stat tiles (5 corporations, the ward count, 3+ agencies) and four problem cards from the deck: unclear who to tell, duplicates hide scale, no proof of repair, closed paid AI tools.
3. **How it works.** A phone frame pinned in place while five steps scroll past beside it: Snap, Understand, Merge, Route, Verify. The phone screen changes to match each step.
4. **Forty reports, one issue.** Forty small dots scattered across a map gather into one pin that shows 40.
5. **Proof of fix.** A before and after pair on a draggable slider; a "Verified fixed" stamp lands when the after side is revealed.
6. **Open at every layer.** The architecture as five glowing nodes inside a dashed "runs on our machine" boundary, the sample JSON typing itself out, and licence chips.
7. **Live map.** A strip of the real map with real pins, and the three newest issue cards.
8. **Footer call to action.** "Seen a pothole today?" with the Report button, links to GitHub, the licence and (after F14) the open dataset. Team Code Not Found and all four member names.

### Report `/report`

One screen, five steps, with the dotted trace across the top filling in as you go.

1. **Capture.** Big camera button; the photo fills the screen once taken. Optional mic button for a voice note (F9).
2. **Locate.** Shows the GPS fix with an accuracy ring on a small map; if it is poor, the pin becomes draggable.
3. **AI reading.** The scan line sweeps the photo while the model works, then the result card slides up: category chip, severity meter, summary, estimated depth for potholes (F13), all editable.
4. **Same problem?** Only appears when F4 or F12 finds a match: the existing issue's photo beside yours, its backer count, and two buttons, "Yes, add my support" or "No, it's different". Also holds the dataset consent box (F14).
5. **Done.** A pin drops onto a small map with a spring bounce, the backer count rolls up, and the routed body is named with a button to the complaint letter.

### Map `/map`

Full screen map with status coloured pins. A glass filter bar sits at the top (category, status, corporation). On desktop, a list of issue cards sits on the left and highlights the pin under the cursor; on phones, the list lives in a bottom sheet with three snap heights. Tapping a pin opens a preview card with a button to the issue page.

### Issue `/issue/[id]`

Top to bottom: the photo as a wide hero with the status pill, title line (category, issue number, address), the meta row (backers, severity, age, depth class), the action bar ("I see this too" and "Submit fix photo"), the routing card naming the responsible body, the complaint letter in a paper style card with copy, print and email, the before and after slider once a fix is claimed, and the issue trail.

### Verify `/issue/[id]/verify`

The original photo is shown faded behind the camera view as a guide to match the angle. After capture, both photos sit side by side while the scan line sweeps across them, then a verdict card: green "Verified fixed" with the model's reason, or orange "Not verified yet" with the reason and a retake button.

### Dashboard `/dashboard`

Five corporation cards across the top with open, fix claimed and verified counts and median time to fix in mono. Below, the ward map shaded by open issues, and a bar chart of issues by category. Clicking a ward filters the cards and chart to it.

## Motion and scroll animation

The landing page is scroll driven: a smooth scroll layer, background layers that move at different speeds, sticky sections whose content changes with scroll progress, and one dotted trace that draws itself down the page. App screens use quicker, quieter motion so they stay fast to use. Two open source libraries do all of it: Motion (`motion/react`, MIT, formerly Framer Motion) and Lenis (MIT) for smooth scrolling.

### Timing rules

| Kind | Duration | Easing |
| --- | --- | --- |
| Micro: hover, press, toggle | 150 ms | ease out |
| Standard: panels, sheets, step changes | 300 ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Reveal: content entering on scroll | 600 ms, children staggered 60 ms | same curve |
| Physical: pin drop, stamp, sheet snap | spring, stiffness 400, damping 22 | spring |
| Scroll linked | follows scroll, smoothed with `useSpring` (stiffness 120, damping 30) | none |

Only `transform` and `opacity` animate. Nothing animates layout properties, blur or SVG filters, so it holds 60 frames a second on a mid range Android phone.

### Page wide scroll effects (landing only)

- **Smooth scroll:** Lenis wraps the landing page only, with `lerp: 0.1`. App screens keep native scrolling so the map and bottom sheet stay responsive.
- **Parallax background, three layers:** a street grid drawn in `asphalt-700` lines moves at 0.3 times scroll speed; lane dash marks move at 0.6 times; the grain overlay stays still. Each is a `motion.div` with `y = useTransform(scrollY, …)`.
- **Section glow:** a large, faint yellow radial gradient sits behind whichever section is in view and slides to the next one.
- **Scroll trace:** a dotted line down the left edge on desktop fills with yellow dots as you scroll, starting at an orange pin and ending at a green check by the footer.

```tsx
// components/motion/ScrollTrace.tsx
'use client';
import { motion, useScroll, useSpring } from 'motion/react';

const d = 'M12 0 C 4 250, 20 500, 12 1000';

export function ScrollTrace() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <svg className="pointer-events-none fixed left-6 top-0 hidden h-screen w-6 md:block"
         viewBox="0 0 24 1000" preserveAspectRatio="none" aria-hidden>
      <defs>
        <mask id="trace-mask">
          <motion.path d={d} stroke="white" strokeWidth={8} fill="none" style={{ pathLength: progress }} />
        </mask>
      </defs>
      {/* grey dots underneath, yellow dots revealed by the mask */}
      <path d={d} stroke="#2B3038" strokeWidth={3} strokeDasharray="0 14" strokeLinecap="round"
            fill="none" vectorEffect="non-scaling-stroke" />
      <path d={d} stroke="#F5B700" strokeWidth={3} strokeDasharray="0 14" strokeLinecap="round"
            fill="none" vectorEffect="non-scaling-stroke" mask="url(#trace-mask)" />
    </svg>
  );
}
```

### Effects by landing section

| Section | On load or entering view | Linked to scroll |
| --- | --- | --- |
| 1 Hero | Headline words rise 24 px and fade in, 60 ms apart; trace draws from pin to check over 1.6 s; counters roll up | Hero scales to 0.94 and fades as section 2 slides over it |
| 2 Problem | Stat numbers count up once; four cards rise 40 px, staggered | Cards tilt up to 4 degrees toward the pointer on desktop |
| 3 How it works | Step list fades in | Section is 500vh tall with the phone sticky; scroll progress picks the step (0 to 4), the phone screen crossfades, the active step lights up |
| 4 Forty to one | Map fades in | Section is 300vh with a sticky map; forty dots move from scattered spots to the centre, then a pin springs in showing 40 |
| 5 Proof of fix | Photos fade in | The slider divider moves from right to left with scroll (the user can also drag it); under 15 percent, the green stamp springs in at 1.4 scale and minus 8 degrees, settling to 1 |
| 6 Open stack | The JSON types itself out, 12 ms a character | Nodes light up one by one; the dashed boundary runs a slow marching ants loop |
| 7 Live map | Pins drop in one by one | The newest issue cards scroll sideways as you scroll down |
| 8 Footer | Headline letters reveal from a mask | The trace reaches the green check |

The sticky sections share one pattern:

```tsx
const ref = useRef<HTMLElement>(null);
const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
const [step, setStep] = useState(0);
useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(4, Math.floor(v * 5))));

return (
  <section ref={ref} className="relative h-[500vh]">
    <div className="sticky top-0 grid h-screen items-center md:grid-cols-2">
      <StepList active={step} />
      <PhoneFrame><AnimatePresence mode="wait"><Screen key={step} step={step} /></AnimatePresence></PhoneFrame>
    </div>
  </section>
);
```

### App screen motion

- **Report wizard:** steps slide 24 px sideways and fade; the scan line sweeps over the photo every 1.2 s while the model works; the result card springs up from the bottom; the success pin drops with a spring and a yellow ring bursts once around it.
- **Map:** new pins from Realtime drop in and pulse once; the bottom sheet uses `drag="y"` with snap points at 15, 50 and 90 percent of the screen; list hover and pin highlight are linked both ways.
- **Issue page:** trail nodes fill one after another on first view; the backer count rolls when someone backs it; the letter card unfolds on open.
- **Verify:** the verdict card flips in; a pass turns the status pill from yellow to green with a 300 ms colour cross fade.
- **Everywhere:** buttons lift 2 px on hover and press to 0.97 scale; cards lift 4 px with a border going to 30 percent yellow; skeletons use a slow shimmer, not spinners.

### Reduced motion and performance

- `useReducedMotion()` switches off Lenis, parallax, sticky scroll effects and springs. Sections show their final state, and only 150 ms opacity fades remain.
- Sticky elements get `will-change: transform`; the map and dashboard charts load lazily; photos use `next/image` with blur placeholders.
- Test on a real mid range Android phone over the tunnel, not only on a laptop.

## Repo, environment and setup

One public GitHub repo holds the Next.js app, the database migrations, the scripts and the small Python service for the stretch models. All writes go through server routes using the Supabase service key; the browser only reads.

### Repo structure

```
urbantrace/
├─ app/
│  ├─ page.tsx                      # landing (wrapped in Lenis)
│  ├─ report/page.tsx
│  ├─ map/page.tsx
│  ├─ issue/[id]/page.tsx
│  ├─ issue/[id]/verify/page.tsx
│  ├─ dashboard/page.tsx
│  └─ api/                          # route handlers, listed below
├─ components/
│  ├─ ui/                           # Button, StatusPill, SeverityMeter, CategoryChip, BackerCount
│  ├─ issue/                        # IssueCard, TraceTimeline, BeforeAfter, LetterCard
│  ├─ map/                          # MapView, MapPin, BottomSheet, Filters
│  ├─ report/                       # Capture, Locate, ResultCard, SameProblem, Done
│  ├─ landing/                      # one file per landing section
│  └─ motion/                       # ScrollTrace, Parallax, Reveal, ScanLoader, SmoothScroll
├─ lib/
│  ├─ ai/ollama.ts  ai/prompts.ts  ai/schemas.ts
│  ├─ routing.ts                    # category to agency, point to corporation
│  ├─ images.ts                     # sharp: rotate, resize, strip metadata
│  ├─ geocode.ts                    # Nominatim, cached
│  └─ supabase/server.ts  supabase/client.ts
├─ supabase/migrations/
│  ├─ 0001_schema.sql  0002_submit_report.sql  0003_dashboard_views.sql
├─ scripts/
│  ├─ seed-boundaries.ts  seed-demo.ts  benchmark.ts  export-dataset.ts
├─ services/ml/                     # FastAPI: /transcribe (F9), /blur (F11), /depth (F13)
├─ bench/photos/  bench/labels.csv  # test set for the model benchmark
├─ README.md  LICENSE  .env.example
```

### API routes

| Method and path | Does | Features |
| --- | --- | --- |
| `POST /api/reports/analyze` | Clean and store the photo, run Job 1, geocode, find duplicates | F1, F2, F4, F11, F12, F13 |
| `POST /api/reports/submit` | Call `submit_report`, then route and queue the letter for a new issue | F4, F5, F6 |
| `GET /api/issues?bbox=&status=&category=` | Issues in view as GeoJSON | F3 |
| `GET /api/issues/[id]` | One issue with its reports, verifications and events | F8 |
| `POST /api/issues/[id]/letter` | Regenerate the complaint letter | F6 |
| `POST /api/issues/[id]/verify` | After photo, GPS check, Job 3, status change | F7 |
| `POST /api/voice` | Forward audio to the speech service | F9 |
| `GET /api/stats` | Counters for the landing page and dashboard | F10 |

"I see this too" on the issue page opens `/report?target=<id>`, so every backing still comes with a photo and a location.

### Environment

```bash
# .env.local
OLLAMA_URL=http://localhost:11434
VISION_MODEL=gemma4:e4b
EMBED_MODEL=nomic-embed-text
ML_SERVICE_URL=http://localhost:8001
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only, never sent to the browser
NOMINATIM_USER_AGENT="UrbanTrace/0.1 (team email)"
```

### Setup

```bash
# 1. App
npx create-next-app@latest urbantrace --ts --tailwind --app --eslint
cd urbantrace
npm i motion lenis leaflet leaflet.markercluster \
      @supabase/supabase-js @supabase/ssr zod sharp lucide-react recharts
npm i -D @types/leaflet @types/leaflet.markercluster

# 2. Models
ollama pull gemma4:e4b
ollama pull gemma4:e2b            # fallback
ollama pull nomic-embed-text      # F12

# 3. Database: create a Supabase project, enable PostGIS, run the migrations in order

# 4. HTTPS for phones, so camera GPS works
cloudflared tunnel --url http://localhost:3000

# 5. Stretch model service (F9, F11, F13)
cd services/ml
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn faster-whisper opencv-python transformers torch pillow
uvicorn main:app --port 8001
```

**Database security:** turn on row level security for every table. The anon key may only select from `issues`, `reports`, `verifications` and `issue_events`; all inserts and updates run on the server with the service key. The `photos` bucket allows public reads, which is safe once F11 blurs faces and plates before upload.

## Build phases

The build runs in six phases, and no polish or stretch work starts until the 90 second demo runs end to end. The four workstreams from our deck (AI, Backend, Frontend, Delivery) run in parallel inside each phase, with no fixed owners; pick them up as a team.

&#91;embedded content: build roadmap · 6 phases, 5 gates\]

Each diamond is a gate: the phase is done only when its gate passes.

### Phase 0: Setup

- [ ] Delivery: public repo with LICENSE, README stub, `.env.example`
- [ ] AI: install Ollama, pull `gemma4:e4b`, `gemma4:e2b`, `nomic-embed-text` and the Qwen3-VL tag
- [ ] Backend: Supabase project, PostGIS on, migrations 0001 and 0002 run, `photos` bucket, row level security
- [ ] Backend: Cloudflare tunnel tested from a phone
- [ ] Frontend: Next.js app, Tailwind theme tokens, the three fonts, base `Button`, `StatusPill`, `CategoryChip`
- [ ] Delivery: shoot and label 30 to 40 test photos, including before and after pairs and non issues

### Phase 1: Core loop, F1 to F3

- [ ] Frontend: report steps Capture and Locate, with the manual pin fallback
- [ ] Backend: `analyze` route with sharp clean up, storage upload, Nominatim lookup
- [ ] AI: Job 1 prompt and schema, Zod check, retry; run the benchmark and pick the model
- [ ] Frontend: result card with editable category, severity and summary; `ScanLoader`
- [ ] Backend: `submit` route and `GET /api/issues` as GeoJSON
- [ ] Frontend: map page with status pins, clustering, filters, list, bottom sheet, Realtime updates

### Phase 2: Differentiators, F4 to F8

- [ ] Backend: duplicate check in `analyze`; "Same problem?" step wired to `submit_report`
- [ ] Backend: routing by category and boundary; boundary seed script or the pick list fallback
- [ ] AI: Job 2 letter prompt; Frontend: letter card with copy, print and email
- [ ] AI: Job 3 verify prompt and pass rule; Backend: verify route; Frontend: verify page and verdict card
- [ ] Frontend: issue page with `TraceTimeline` and `BeforeAfter`
- [ ] Delivery: run the demo script on a real phone

### Phase 3: Design and motion

- [ ] Frontend: all eight landing sections, Lenis, parallax layers, `ScrollTrace`
- [ ] Frontend: sticky How it works and Forty to one sections; scroll linked before and after slider
- [ ] Frontend: app screen motion listed under Motion and scroll animation: step slides, pin drops, rolling counts, sheet snapping
- [ ] Delivery: reduced motion check and a mid range Android phone check

### Phase 4: Stretch, F9 to F14

- [ ] AI: Python service with `/transcribe`, `/blur`, `/depth`
- [ ] Frontend: voice note button (F9) and depth class display (F13)
- [ ] Backend: blurring in the upload pipeline (F11), then embeddings and the confirm step (F12)
- [ ] Backend and Frontend: dashboard view and page (F10)
- [ ] Delivery: dataset consent box, export script and Hugging Face upload (F14)

### Phase 5: Ship

- [ ] Tests listed under Testing, benchmark and demo pass
- [ ] Seed demo data, finish the README with the benchmark table, record the backup video, rehearse, submit

### If you build it in one day

Do all of phase 0 before the day. On the day, build phases 1 and 2, then only the landing hero and the How it works section from phase 3, and spend the last hour on phase 5. Leave phase 4 for after the event.

## Testing, benchmark and demo

The model is chosen by a benchmark on our own photos, not by reputation, and the demo is rehearsed with printed photos so it works indoors.

### Model benchmark

1. Shoot 30 to 40 photos around campus and nearby roads: every category, several before and after pairs, and about five non issues (a selfie, a classroom) to test rejection.
2. Label them in `bench/labels.csv` (file, category, severity, is\_civic\_issue) and `bench/pairs.csv` (before, after, fixed).
3. `scripts/benchmark.ts` runs Gemma 4 E4B and Qwen3-VL on every photo and pair and prints the table below. Keep the model with the higher category accuracy; if they tie, keep the faster one. Run E2B too, so the fallback's accuracy is known.
4. Use the same photos to tune the F12 similarity threshold.

| Measure | How it is scored | Target |
| --- | --- | --- |
| Category accuracy | Model category equals label | Highest wins |
| Severity | Within 1 of the label | Report it |
| Non issue rejection | `is_civic_issue` false on the non issues | All rejected |
| Verification accuracy | Verdict matches `fixed` on the pairs | Report it |
| Speed | Median seconds per call on our laptop | Fast enough for a live demo |

### Tests

- **Database, against `submit_report`:** same category 20 m apart merges; 40 m apart does not; a different category does not; the same device twice does not add a backer; a report next to a verified issue creates a new issue.
- **Unit:** the category to agency map, the verification pass rule (including GPS over 50 m failing even when the model says fixed), and the Zod schemas against bad model output.
- **End to end on a real phone through the tunnel:** report, merge, letter, verify, and the map updating live on a second screen.
- **Design checks:** reduced motion on, landing page on a mid range Android phone, map legibility in the dark theme, keyboard focus visible on every control.

### Demo data

`scripts/seed-demo.ts` adds about 25 issues across Bengaluru using the benchmark photos, in mixed statuses, so the map and dashboard look alive. Say in the pitch that these are seeded.

### Demo script, 90 seconds

The venue will not have a pothole, so bring two printed photos: a pothole and the same road repaired. Both are photographed at the venue, so their GPS points match.

1. Open on the landing page and scroll through the How it works section (15 s).
2. A judge photographs the pothole print on their phone; the scan line runs and the result card shows pothole and its severity (20 s).
3. Submit; the pin drops onto the big screen map live (10 s).
4. A teammate photographs the same print; the app finds the match and the count goes to 2 (15 s).
5. Open the issue: routed to the city corporation, with the drafted letter (10 s).
6. Photograph the repaired print with Submit fix photo; the verdict comes back and the pin turns green (20 s).

Record this as a backup video the day before, in case the venue Wi-Fi or the laptop fails.

## Risks and fallbacks

Every risk below has a fallback that keeps the core loop demoable; the first three are the ones named in our deck.

| Risk | Fallback |
| --- | --- |
| Model too slow on our laptop | Switch `VISION_MODEL` to `gemma4:e2b`, or run the same open model in Ollama on a rented GPU |
| Phone GPS blocked without HTTPS | Test the tunnel in the first session; the draggable manual pin always works |
| Ward or corporation boundary files missing | Route by category only and let the user pick their corporation |
| Model returns invalid JSON | Zod check, one retry, then the user picks the category by hand |
| Model is weak at comparing two images | Stitch before and after into one image; the 50 m GPS check still applies |
| Venue Wi-Fi drops, so the tunnel fails | The model and app run locally; demo from the laptop with a manual pin, and keep the backup video ready |
| Nominatim rate limit or outage | Cache every lookup; show coordinates when no address comes back |
| Scroll effects stutter on phones | Turn off parallax and the scroll trace below 768 px wide |
| Faces or plates in photos before F11 ships | Demo only with our own photos without people in them |
| Two different problems within 30 m | The "No, it's different" button and the F12 confirm step keep them separate |

## Submission checklist

The challenge needs a public GitHub repo under an open source licence with open weight AI central to the project; confirm the final rules in OrganizerHQ before submitting.

- [ ] Public GitHub repo created with a LICENSE file (MIT or Apache 2.0) in the first commit
- [ ] README: what UrbanTrace does, screenshots, the architecture diagram, setup steps, the models and their licences, and the benchmark results
- [ ] `.env.example` committed; no keys in the repo
- [ ] Model benchmark run and the winning model named in the README
- [ ] Tiers 1 and 2 (F1 to F8) working end to end on a real phone
- [ ] Demo data seeded and labelled as seeded in the pitch
- [ ] Two printed photos for the demo: a pothole and the repaired road
- [ ] Backup demo video recorded
- [ ] Pitch rehearsed to 90 seconds
- [ ] Submission made in OrganizerHQ under Best Open-Source AI Project, with the repo link and team Code Not Found
