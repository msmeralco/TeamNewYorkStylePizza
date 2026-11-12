// Daily mean temperatures from Open-Meteo (free, no key) for forecast stage 3.
import { MANILA } from "@/data/tables";
import { cddForPeriod } from "@/lib/engine/cdd";
import { addDays, daysBetween, toManilaDate } from "@/lib/engine/dates";

export const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const TIMEOUT_MS = 8000;
/** Open-Meteo serves up to 16 days: today plus 15. */
export const HORIZON_DAYS = 15;
/** The archive lags real time by about five days; newer past days come from the forecast API. */
export const ARCHIVE_LAG_DAYS = 6;

export interface DailyMean {
  date: string;
  meanC: number;
}

export class WeatherError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "WeatherError";
  }
}

export const MAX_HISTORY = 24;
export const MAX_RANGE_DAYS = 62;
export const MAX_CACHE = 200;
const MIN_YEAR = 1940;

const cache = new Map<string, { at: number; days: DailyMean[] }>();

function remember(u: string, at: number, days: DailyMean[]): void {
  if (cache.size >= MAX_CACHE) {
    for (const [k, v] of cache) if (at - v.at >= CACHE_TTL_MS) cache.delete(k);
    while (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  cache.set(u, { at, days });
}

export function clearWeatherCache(): void {
  cache.clear();
}

function url(base: string, start: string, end: string): string {
  const q = new URLSearchParams({
    latitude: String(MANILA.latitude),
    longitude: String(MANILA.longitude),
    timezone: MANILA.timezone,
    daily: "temperature_2m_mean",
    start_date: start,
    end_date: end,
  });
  return `${base}?${q.toString()}`;
}

async function fetchUrl(u: string, now: number): Promise<DailyMean[]> {
  const hit = cache.get(u);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.days;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let json: unknown;
  try {
    const res = await fetch(u, { signal: ctl.signal });
    if (!res.ok) throw new WeatherError(`Open-Meteo answered ${res.status}.`);
    json = await res.json();
  } catch (e) {
    if (e instanceof WeatherError) throw e;
    throw new WeatherError(ctl.signal.aborted ? "Open-Meteo timed out." : "Open-Meteo could not be reached.", e);
  } finally {
    clearTimeout(timer);
  }
  const daily = (json as { daily?: { time?: unknown; temperature_2m_mean?: unknown } } | null)?.daily;
  const time = daily?.time;
  const temps = daily?.temperature_2m_mean;
  if (!Array.isArray(time) || !Array.isArray(temps) || time.length !== temps.length) {
    throw new WeatherError("Open-Meteo sent an unexpected shape.");
  }
  const days: DailyMean[] = [];
  for (let i = 0; i < time.length; i++) {
    const t = temps[i];
    if (typeof time[i] !== "string" || typeof t !== "number" || !Number.isFinite(t)) {
      throw new WeatherError("Open-Meteo sent incomplete temperatures.");
    }
    days.push({ date: time[i] as string, meanC: t });
  }
  remember(u, now, days);
  return days;
}

function oneYearEarlier(date: string): string {
  const y = Number(date.slice(0, 4)) - 1;
  const md = date.slice(4);
  // 29 Feb has no match a year earlier: use 28 Feb.
  return `${y}${md === "-02-29" ? "-02-28" : md}`;
}

export interface DailyMeans {
  days: DailyMean[];
  /** Set when any day came from last year's same calendar days. */
  note: string | null;
}

/** Daily mean temperature (C) for every date from start to end inclusive (Manila dates). */
export async function fetchDailyMeans(start: string, end: string, nowMs: number = Date.now()): Promise<DailyMeans> {
  const s = toManilaDate(start);
  const e = toManilaDate(end);
  if (daysBetween(s, e) < 0) throw new WeatherError("The end date is before the start date.");
  const today = toManilaDate(new Date(nowMs).toISOString());
  const archiveEnd = addDays(today, -ARCHIVE_LAG_DAYS);
  const horizonEnd = addDays(today, HORIZON_DAYS);

  const byDate = new Map<string, number>();
  let usedClimatology = false;
  const take = async (base: string, a: string, b: string) => {
    for (const d of await fetchUrl(url(base, a, b), nowMs)) byDate.set(d.date, d.meanC);
  };

  // Past days: archive, up to its lag.
  if (daysBetween(s, archiveEnd) >= 0) {
    await take(ARCHIVE_URL, s, daysBetween(e, archiveEnd) >= 0 ? e : archiveEnd);
  }
  // Recent past and near future: forecast API.
  const recentStart = daysBetween(s, addDays(archiveEnd, 1)) > 0 ? addDays(archiveEnd, 1) : s;
  const recentEnd = daysBetween(e, horizonEnd) >= 0 ? e : horizonEnd;
  if (daysBetween(recentStart, recentEnd) >= 0 && daysBetween(recentStart, e) >= 0) await take(FORECAST_URL, recentStart, recentEnd);
  // Beyond the horizon: the same calendar days a year earlier.
  const farStart = daysBetween(s, addDays(horizonEnd, 1)) > 0 ? addDays(horizonEnd, 1) : s;
  if (daysBetween(farStart, e) >= 0 && daysBetween(horizonEnd, e) > 0) {
    usedClimatology = true;
    const clim = await fetchUrl(url(ARCHIVE_URL, oneYearEarlier(farStart), oneYearEarlier(e)), nowMs);
    const climBy = new Map(clim.map((d) => [d.date, d.meanC]));
    for (let d = farStart; daysBetween(d, e) >= 0; d = addDays(d, 1)) {
      const m = climBy.get(oneYearEarlier(d));
      if (m === undefined) throw new WeatherError("Last year's temperatures are incomplete.");
      byDate.set(d, m);
    }
  }

  const days: DailyMean[] = [];
  for (let d = s; daysBetween(d, e) >= 0; d = addDays(d, 1)) {
    const m = byDate.get(d);
    if (m === undefined) throw new WeatherError(`No temperature for ${d}.`);
    days.push({ date: d, meanC: m });
  }
  return {
    days,
    note: usedClimatology ? "Days past the 16-day weather forecast use last year's temperatures for the same dates." : null,
  };
}

/** Cooling degree days for the inclusive date range. */
export async function cddForRange(start: string, end: string, nowMs?: number): Promise<{ cdd: number; note: string | null }> {
  if (daysBetween(toManilaDate(start), toManilaDate(end)) + 1 > MAX_RANGE_DAYS) throw new WeatherError("The date range is too long.");
  const { days, note } = await fetchDailyMeans(start, end, nowMs);
  return { cdd: cddForPeriod(days.map((d) => d.meanC)), note };
}

function monthBounds(month: string): { first: string; last: string } {
  const first = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  const last = addDays(next.toISOString().slice(0, 10), -1);
  return { first, last };
}

/** Cooling degree days for each bill-history calendar month, paired with its kWh. */
export async function monthlyCdd(
  history: { month: string; kwh: number }[],
  nowMs: number = Date.now(),
): Promise<{ cdd: number; kwh: number }[]> {
  if (history.length === 0) return [];
  if (history.length > MAX_HISTORY) throw new WeatherError("Too many months of history.");
  for (const h of history) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(h.month) || Number(h.month.slice(0, 4)) < MIN_YEAR) throw new WeatherError(`Not a month: ${h.month}`);
  }
  const bounds = history.map((h) => monthBounds(h.month));
  const first = bounds.map((b) => b.first).sort()[0];
  const last = bounds.map((b) => b.last).sort().reverse()[0];
  const { days } = await fetchDailyMeans(first, last, nowMs);
  return history.map((h, i) => {
    const { first: f, last: l } = bounds[i];
    const temps = days.filter((d) => d.date >= f && d.date <= l).map((d) => d.meanC);
    return { cdd: cddForPeriod(temps), kwh: h.kwh };
  });
}
