import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleBautistaState, sampleCompoundState } from "@/data/sample";
import { clearWeatherCache } from "@/lib/weather";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/forecast", { method: "POST", body: JSON.stringify(body) }));

function dates(a: string, b: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(a); t <= Date.parse(b); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Temperatures that track the sample bill history, so the fit succeeds. */
function stubWeather() {
  const kwh = new Map(sampleBautistaState().bill.history.map((h) => [h.month, h.kwh]));
  const f = vi.fn(async (u: string) => {
    const p = new URL(u).searchParams;
    const time = dates(p.get("start_date")!, p.get("end_date")!);
    return new Response(JSON.stringify({ daily: { time, temperature_2m_mean: time.map((d) => 24 + ((kwh.get(d.slice(0, 7)) ?? 50) - 50) / 2) } }));
  });
  vi.stubGlobal("fetch", f);
  return f;
}

/** Bautista with no mid-period photo, so stage 3 can apply. */
function noPhoto() {
  const s = sampleBautistaState();
  s.currentReadings = [];
  return s;
}

beforeEach(() => clearWeatherCache());
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/forecast", () => {
  it("golden: Bautista stays stage 2, 53 (51 to 55)", async () => {
    const res = await post({ state: sampleBautistaState(), householdId: "hBautista" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stage).toBe(2);
    expect(j.kwh).toBe(53);
    expect(j.low).toBe(51);
    expect(j.high).toBe(55);
    expect(j.note).toBeUndefined();
  });

  it("400 on bad json", async () => {
    const res = await POST(new Request("http://localhost/api/forecast", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });
  it("400 on missing or incomplete state", async () => {
    expect((await post({ householdId: "x" })).status).toBe(400);
    const res = await post({ state: { compound: {} }, householdId: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.next).toBeTruthy();
  });
  it("400 on missing householdId, bad asOf, bad ownMeter, bad history, bad cdd, bad useWeather", async () => {
    const state = sampleBautistaState();
    expect((await post({ state })).status).toBe(400);
    expect((await post({ state, householdId: "hBautista", asOf: "nope" })).status).toBe(400);
    expect((await post({ state, householdId: "hBautista", ownMeter: "yes" })).status).toBe(400);
    expect((await post({ state, householdId: "hBautista", history: [{ cdd: "a", kwh: 1 }] })).status).toBe(400);
    expect((await post({ state, householdId: "hBautista", nextPeriodCdd: "a" })).status).toBe(400);
    const res = await post({ state, householdId: "hBautista", useWeather: "yes" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_use_weather");
  });
  it("422 on unknown household and missing meter", async () => {
    const res = await post({ state: sampleBautistaState(), householdId: "nobody" });
    expect(res.status).toBe(422);
    const j = await res.json();
    expect(j.error.code).toBe("unknown_household");
    expect(j.error.next).toBeTruthy();
    const s = sampleBautistaState();
    s.meters = [];
    const r2 = await post({ state: s, householdId: "hBautista" });
    expect(r2.status).toBe(422);
    expect((await r2.json()).error.code).toBe("no_meter");
  });
  it("shared compound forecasts without weather", async () => {
    const state = sampleCompoundState();
    const res = await post({ state, householdId: "hB" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stage).toBe(1);
    expect(j.kwh).toBe(45);
    expect(j.label).toBe("Rough guess");
    expect(j.perKwhValue).toBe(14.94);
  });

  it("useWeather with stubbed temperatures gives stage 3", async () => {
    const f = stubWeather();
    const res = await post({ state: noPhoto(), householdId: "hBautista", useWeather: true });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stage).toBe(3);
    expect(j.high).toBeGreaterThanOrEqual(j.low);
    if (j.note) expect(j.note).toMatch(/last year/);
    expect(f).toHaveBeenCalled();
  });

  it("useWeather leaves the stage 2 photo forecast alone", async () => {
    stubWeather();
    const j = await (await post({ state: sampleBautistaState(), householdId: "hBautista", useWeather: true })).json();
    expect(j.stage).toBe(2);
    expect(j.kwh).toBe(53);
  });

  it("falls back with a note when the weather fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const res = await post({ state: noPhoto(), householdId: "hBautista", useWeather: true });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.stage).toBe(1);
    expect(j.note).toBe("Weather unavailable, using last bill's kWh.");
  });

  it("ignores useWeather in a shared compound, even with ownMeter true", async () => {
    const f = stubWeather();
    const state = sampleCompoundState();
    const res = await post({ state, householdId: "hB", useWeather: true, ownMeter: true });
    const j = await res.json();
    expect(f).not.toHaveBeenCalled();
    expect(j.stage).not.toBe(3);
  });

  it("uses the last bill wording when the weather fails at stage 1", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const j = await (await post({ state: noPhoto(), householdId: "hBautista", useWeather: true })).json();
    expect(j.stage).toBe(1);
    expect(j.note).toBe("Weather unavailable, using last bill's kWh.");
  });

  it("skips the weather when a mid-period photo exists", async () => {
    const f = stubWeather();
    await post({ state: sampleBautistaState(), householdId: "hBautista", useWeather: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("does not call the weather without useWeather or with short history", async () => {
    const f = stubWeather();
    await post({ state: noPhoto(), householdId: "hBautista" });
    const s = noPhoto();
    s.bill.history = s.bill.history.slice(0, 5);
    const j = await (await post({ state: s, householdId: "hBautista", useWeather: true })).json();
    expect(f).not.toHaveBeenCalled();
    expect(j.stage).toBe(1);
  });
});
