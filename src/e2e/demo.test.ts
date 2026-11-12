// Walks the 8-step demo script (05_pitch_and_demo.md) through the real route handlers.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getSample } from "@/app/api/sample/route";
import { POST as postBill } from "@/app/api/scan/bill/route";
import { POST as postMeter } from "@/app/api/scan/meter/route";
import { POST as postSplit } from "@/app/api/split/route";
import { POST as postCheck } from "@/app/api/check/route";
import { POST as postForecast } from "@/app/api/forecast/route";
import { POST as postTenantLink } from "@/app/api/tenant-link/route";
import { GET as getTenant } from "@/app/api/tenant/[token]/route";
import type { Reading } from "@/types";
import { clone, get, json, post, type State } from "./helpers";

const TINY_JPEG = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const CAPTURED = "2026-10-31T09:00:00+08:00";

describe("demo script, end to end", () => {
  let state: State;

  beforeAll(() => {
    vi.stubEnv("READER", "");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-12T10:00:00+08:00"));
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("1. sample compound, this month blank", async () => {
    state = await json<State>(getSample(get("/api/sample?which=compound")));
    expect(state.households).toHaveLength(4);
    expect(state.currentReadings).toHaveLength(4);
    state.currentReadings = [];
  });

  it("2. scan the bill: 180 kWh and 2711.07", async () => {
    const j = await json(await postBill(post({ imageBase64: TINY_JPEG, mimeType: "image/jpeg" })));
    expect(j.scan.kwh).toBe(180);
    expect(j.scan.amount).toBe(2711.07);
    expect(j.sanity.withinBand).toBe(true);
  });

  it("3. scan each sub-meter and build currentReadings", async () => {
    const expected: Record<string, number> = { mA: 3162, mB: 4572, mC: 2238, mD: 5055 };
    const readings: Reading[] = [];
    for (const meter of state.meters.filter((m) => m.householdId)) {
      const previous = state.previousReadings.find((r) => r.meterId === meter.id)!;
      const j = await json(
        await postMeter(post({ imageBase64: TINY_JPEG, mimeType: "image/jpeg", hint: meter.serial, meter, previous })),
      );
      expect(j.scan.value).toBe(expected[meter.id]);
      expect(j.serialLine).toBe(`Serial ${meter.serial} matches`);
      expect(j.validation.ok).toBe(true);
      readings.push({
        id: `r-${meter.id}-new`,
        meterId: meter.id,
        value: j.scan.value,
        capturedAt: CAPTURED,
        source: "photo",
        confidence: j.scan.confidence,
        confirmed: true,
        serialRead: j.scan.serial,
      });
    }
    state.currentReadings = readings;
    expect(readings).toHaveLength(4);
  });

  it("4. shares and the add-up check", async () => {
    const s = await json(await postSplit(post({ state })));
    expect(s.shares.map((x: any) => x.amount)).toEqual([782.36, 677.77, 573.17, 677.77]);
    expect(s.total).toBe(2711.07);
    const c = await json(await postCheck(post({ state })));
    expect(c.headline).toBe("Readings add up: 180 of 180 kWh");
    expect(c.status).toBe("ok");
  });

  it("5. Santos breakdown line by line", async () => {
    const s = await json(await postSplit(post({ state })));
    const hB = s.shares.find((x: any) => x.householdId === "hB");
    const b = hB.breakdown;
    const lines = [b.generation, b.transmission, b.systemLoss, b.distribution, b.supplyMetering, b.taxes, b.other].map(
      (n: number) => Math.round(n * 100) / 100,
    );
    expect(lines).toEqual([422.5, 57.5, 37.5, 82.5, 17.5, 47.5, 12.77]);
    expect(Math.round(lines.reduce((a: number, n: number) => a + n, 0) * 100) / 100).toBe(677.77);
    expect(hB.amount).toBe(677.77);
  });

  it("6. Bautista forecast and the shared-meter per-kWh value", async () => {
    const baut = await json<State>(getSample(get("/api/sample?which=bautista")));
    const f = await json(await postForecast(post({ state: baut, householdId: baut.households[0].id })));
    expect(f.stage).toBe(2);
    expect(f.kwh).toBe(53);
    expect(f.low).toBe(51);
    expect(f.high).toBe(55);
    expect(f.lifeline.message).toContain("Stay under 50 kWh: 100% off instead of about ₱519");

    const fb = await json(await postForecast(post({ state, householdId: "hB" })));
    expect(fb.perKwhValue).toBeCloseTo(14.94, 2);
    expect(fb.lifeline).toBeNull();
  });

  it("7. the cheat: typed 2220 for Dela Cruz", async () => {
    const cheat = clone(state);
    const idx = cheat.currentReadings.findIndex((r) => r.meterId === "mC");
    cheat.currentReadings[idx] = {
      ...cheat.currentReadings[idx],
      value: 2220,
      source: "typed",
      confidence: null,
      serialRead: null,
      capturedAt: CAPTURED,
    };
    const c = await json(await postCheck(post({ state: cheat })));
    expect(c.status).toBe("gap");
    expect(c.headline).toBe("18 kWh missing");
    expect(c.detail).toBe("Readings add up to 162 of 180 kWh.");
    expect(c.households.find((h: any) => h.householdId === "hC").chip).toBe("typed");
    expect(c.alignedTo).toBe("Reading dates aligned to the bill: 31 Oct");
    expect(c.gapRule).toBe("Until it is fixed, the gap is split by kWh.");
    const s = await json(await postSplit(post({ state: cheat })));
    expect(s.total).toBe(2711.07);
  });

  it("8. tenant link and tenant view", async () => {
    const link = await json(await postTenantLink(post({ state, householdId: "hB" })));
    expect(typeof link.token).toBe("string");
    const res = await getTenant(get(`/api/tenant/${link.token}`), { params: Promise.resolve({ token: link.token }) });
    const text = await res.clone().text();
    const v = await json(res);
    expect(v.share.amount).toBe(677.77);
    expect(v.rateCheck.aboveBy).toBe(64.73);
    expect(v.perKwhValue).toBeCloseTo(14.94, 2);
    expect(v.footer).toBe("Computed by Kahati. Not a Meralco statement.");
    expect(text).not.toContain("fourPs");
    expect(JSON.stringify(link.view)).not.toContain("fourPs");
    expect(text).toContain("Computed by Kahati. Not a Meralco statement.");
    expect(text).toContain("677.77");
    expect(text).toContain("64.73");
    expect(text).toContain("14.94");
  });
});
