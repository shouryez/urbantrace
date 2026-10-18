// Server only: daily rainfall for Bengaluru from Open-Meteo (open data, CC BY 4.0, no key),
// cached in the weather_daily table. Weather data by Open-Meteo.com.
import { supabaseAdmin } from "@/lib/supabase/server";

const LAT = 12.9716;
const LNG = 77.5946;
const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

let memo: { at: number; data: Map<string, number> } | null = null;

type OpenMeteoDaily = { daily?: { time?: string[]; precipitation_sum?: (number | null)[] } };

async function fetchOpenMeteo(url: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return out;
    const data = (await res.json()) as OpenMeteoDaily;
    data.daily?.time?.forEach((d, i) => {
      const mm = data.daily?.precipitation_sum?.[i];
      if (typeof mm === "number") out.set(d, mm);
    });
  } catch {
    // offline: the caller works with what is cached
  }
  return out;
}

/** Rainfall in mm per day (YYYY-MM-DD) for the last `days` days up to today. */
export async function rainByDay(days = 180): Promise<Map<string, number>> {
  if (memo && Date.now() - memo.at < 3 * 3_600_000 && memo.data.size >= Math.min(days, 90)) return memo.data;
  const db = supabaseAdmin();
  const from = dayKey(Date.now() - days * DAY);
  const { data: rows } = await db.from("weather_daily").select("day, precipitation_mm, fetched_at").gte("day", from);
  const have = new Map<string, number>();
  let stale = false;
  for (const r of rows ?? []) {
    have.set(r.day as string, r.precipitation_mm as number);
    // Recent days are revised as observations come in, so refetch them after a few hours.
    if (Date.now() - new Date(r.day as string).getTime() < 3 * DAY && Date.now() - new Date(r.fetched_at as string).getTime() > 3 * 3_600_000) stale = true;
  }
  const missing = days - have.size > 2 || stale || !have.has(dayKey(Date.now() - DAY));

  if (missing) {
    // The forecast API covers the last 92 days; older days come from the archive API.
    const recent = await fetchOpenMeteo(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&daily=precipitation_sum&timezone=Asia%2FKolkata&past_days=92&forecast_days=1`,
    );
    let older = new Map<string, number>();
    if (days > 90) {
      older = await fetchOpenMeteo(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LNG}&start_date=${from}&end_date=${dayKey(Date.now() - 88 * DAY)}&daily=precipitation_sum&timezone=Asia%2FKolkata`,
      );
    }
    const fresh = new Map([...older, ...recent]);
    if (fresh.size) {
      const upserts = [...fresh].map(([day, mm]) => ({ day, precipitation_mm: mm, fetched_at: new Date().toISOString() }));
      await db.from("weather_daily").upsert(upserts);
      for (const [d, mm] of fresh) have.set(d, mm);
    }
  }
  const sorted = new Map([...have].filter(([d]) => d >= from && d <= dayKey(Date.now())).sort(([a], [b]) => a.localeCompare(b)));
  memo = { at: Date.now(), data: sorted };
  return sorted;
}

/** Total rain over the last `n` days. */
export async function recentRainMm(n = 3): Promise<number> {
  const rain = await rainByDay(30).catch(() => new Map<string, number>());
  let total = 0;
  for (let k = 0; k < n; k++) total += rain.get(dayKey(Date.now() - k * DAY)) ?? 0;
  return Math.round(total * 10) / 10;
}
