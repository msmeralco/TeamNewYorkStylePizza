import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeatherError, cddForRange, clearWeatherCache, fetchDailyMeans, monthlyCdd } from "./weather";

const NOW = Date.parse("2026-11-12T10:00:00+08:00");

function dates(a: string, b: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(a); t <= Date.parse(b); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function stub(temp: (date: string) => number) {
  const f = vi.fn(async (u: string) => {
    const p = new URL(u).searchParams;
    const time = dates(p.get("start_date")!, p.get("end_date")!);
    return new Response(JSON.stringify({ daily: { time, temperature_2m_mean: time.map(temp) } }));
  });
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => clearWeatherCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchDailyMeans", () => {
  it("uses the archive for old dates with Manila params", async () => {
    const f = stub(() => 28);
    const r = await fetchDailyMeans("2026-09-01", "2026-09-03", NOW);
    expect(r.days).toEqual([
      { date: "2026-09-01", meanC: 28 },
      { date: "2026-09-02", meanC: 28 },
      { date: "2026-09-03", meanC: 28 },
    ]);
    expect(r.note).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    const u = new URL(f.mock.calls[0][0]);
    expect(u.host).toBe("archive-api.open-meteo.com");
    expect(u.searchParams.get("daily")).toBe("temperature_2m_mean");
    expect(u.searchParams.get("timezone")).toBe("Asia/Manila");
    expect(u.searchParams.get("latitude")).toBe("14.5995");
  });

  it("uses the forecast API for the near future and climatology beyond it", async () => {
    const f = stub((d) => (d.startsWith("2025") ? 25 : 30));
    const r = await fetchDailyMeans("2026-11-25", "2026-12-05", NOW);
    // The horizon ends 2026-11-27.
    expect(r.days).toHaveLength(11);
    expect(r.days[0].meanC).toBe(30);
    expect(r.days[10]).toEqual({ date: "2026-12-05", meanC: 25 });
    expect(r.note).toMatch(/last year/);
    const urls = f.mock.calls.map((c) => new URL(c[0]));
    expect(urls.some((u) => u.host === "api.open-meteo.com")).toBe(true);
    const clim = urls.find((u) => u.host.startsWith("archive"))!;
    expect(clim.searchParams.get("start_date")).toBe("2025-11-28");
  });

  it("caches by URL for six hours", async () => {
    const f = stub(() => 28);
    await fetchDailyMeans("2026-09-01", "2026-09-03", NOW);
    await fetchDailyMeans("2026-09-01", "2026-09-03", NOW + 1000);
    expect(f).toHaveBeenCalledTimes(1);
    await fetchDailyMeans("2026-09-01", "2026-09-03", NOW + 7 * 3600 * 1000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("throws WeatherError on HTTP failure, network failure, bad shape and nulls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    await expect(fetchDailyMeans("2026-09-01", "2026-09-02", NOW)).rejects.toBeInstanceOf(WeatherError);
    clearWeatherCache();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(fetchDailyMeans("2026-09-01", "2026-09-02", NOW)).rejects.toBeInstanceOf(WeatherError);
    clearWeatherCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ nope: 1 }))));
    await expect(fetchDailyMeans("2026-09-01", "2026-09-02", NOW)).rejects.toBeInstanceOf(WeatherError);
    clearWeatherCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ daily: { time: ["2026-09-01"], temperature_2m_mean: [null] } }))));
    await expect(fetchDailyMeans("2026-09-01", "2026-09-01", NOW)).rejects.toBeInstanceOf(WeatherError);
  });

  it("aborts after the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(new Error("aborted")));
    })));
    const p = fetchDailyMeans("2026-09-01", "2026-09-02", NOW);
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(8001);
    await assertion;
  });
});

describe("monthlyCdd", () => {
  it("sums cooling degree days per calendar month", async () => {
    stub((d) => (d.startsWith("2026-09") ? 30 : 26));
    const r = await monthlyCdd([{ month: "2026-08", kwh: 191 }, { month: "2026-09", kwh: 185 }], NOW);
    expect(r).toEqual([{ cdd: 31 * 2, kwh: 191 }, { cdd: 30 * 6, kwh: 185 }]);
  });
  it("rejects a bad month", async () => {
    await expect(monthlyCdd([{ month: "nope", kwh: 1 }], NOW)).rejects.toBeInstanceOf(WeatherError);
  });
});

describe("input limits", () => {
  it("rejects old years, long history and long ranges", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(monthlyCdd([{ month: "0050-01", kwh: 1 }])).rejects.toBeInstanceOf(WeatherError);
    await expect(monthlyCdd(Array.from({ length: 25 }, () => ({ month: "2026-01", kwh: 1 })))).rejects.toBeInstanceOf(WeatherError);
    await expect(cddForRange("2026-01-01", "2026-06-01")).rejects.toBeInstanceOf(WeatherError);
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
