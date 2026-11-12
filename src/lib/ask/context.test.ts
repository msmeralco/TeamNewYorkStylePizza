import { describe, expect, it } from "vitest";
import { sampleBautistaState, sampleCompoundState } from "@/data/sample";
import { buildTenantView } from "@/lib/engine/tenant";
import { buildContextFromState, buildContextFromTenant } from "./context";
import { AskError } from "./errors";

const NAMES = ["Reyes", "Santos", "Dela Cruz", "Garcia"];

describe("buildContextFromState (sample compound, Santos)", () => {
  const ctx = buildContextFromState(sampleCompoundState(), "hB", "en");
  const f = ctx.facts;
  it("matches the golden numbers", () => {
    expect(f.share).toBe(677.77);
    expect(f.kwh).toBe(45);
    expect(f.billKwh).toBe(180);
    expect(f.fixedCharges).toBe(21.38);
    expect(f.fixedPart).toBeCloseTo(5.345, 6);
    expect(f.lines!.generation).toBeCloseTo(422.5, 6);
    expect(f.perKwhValue).toBe(14.94);
    expect(f.effectiveRate).toBeCloseTo(15.0615, 4);
    expect(f.chargedRate).toBe(16.5);
    expect(f.askedAmount).toBeCloseTo(742.5, 6);
    expect(f.aboveBy).toBe(64.73);
    expect(ctx.mode).toBe("shared");
    expect(ctx.label).toBe("B");
    expect(ctx.displayName).toBe("Santos");
    expect(f.checkStatus).toBe("ok");
    expect(f.readingsKwh).toBe(180);
    expect(f.typed).toBe(false);
  });
  it("allows display forms of its numbers", () => {
    for (const n of [677.77, 678, 14.94, 15, 5.35, 21.38, 45, 180, 50, 51, 70, 100, 35, 20, 5, 0, 64.73, 742.5, 15.06, 16.5, 9]) {
      expect(ctx.allowedNumbers, String(n)).toContain(n);
    }
  });
  it("lists the other households for the guard only", () => {
    expect([...ctx.otherNames].sort()).toEqual(["Dela Cruz", "Garcia", "Reyes"]);
  });
  it("keeps other names, other kWh and the 4Ps flag out of the fact sheet", () => {
    const sheet = ctx.factSheet.toLowerCase();
    for (const n of ["reyes", "dela cruz", "garcia"]) expect(sheet).not.toContain(n);
    expect(sheet).not.toMatch(/(is|are|being) (a )?4ps|fourps/);
    expect(sheet).not.toContain("fourps");
    for (const bad of ["52 kwh", "38 kwh", "573.17", "782.36"]) expect(sheet).not.toContain(bad);
    expect(sheet).toContain("677.77");
  });
  it("carries the lifeline text on a shared meter without a forecast", () => {
    expect(f.forecastKwh).toBeUndefined();
    expect(f.lifelineForecastPeso).toBeUndefined();
  });
});

describe("buildContextFromState (typed reading, gap)", () => {
  const state = sampleCompoundState();
  const mC = state.meters.find((m) => m.householdId === "hC")!;
  const cur = state.currentReadings.find((r) => r.meterId === mC.id)!;
  cur.value = 2220;
  cur.source = "typed";
  cur.confidence = null;

  it("shows the gap to Santos without naming Dela Cruz", () => {
    const ctx = buildContextFromState(state, "hB", "en");
    expect(ctx.facts.checkStatus).toBe("gap");
    expect(ctx.facts.missingKwh).toBe(18);
    expect(ctx.facts.readingsKwh).toBe(162);
    expect(ctx.facts.typed).toBe(false);
    expect(ctx.factSheet).not.toContain("Dela Cruz");
    expect(ctx.factSheet).toContain("18 kWh are missing");
  });
  it("flags typed only for the household that typed", () => {
    expect(buildContextFromState(state, "hC", "en").facts.typed).toBe(true);
  });
});

describe("buildContextFromState (Bautista, own meter)", () => {
  const ctx = buildContextFromState(sampleBautistaState(), "hBautista", "fil");
  it("has the forecast and lifeline facts", () => {
    expect(ctx.mode).toBe("single");
    expect(ctx.language).toBe("fil");
    expect(ctx.facts.forecastKwh).toBe(53);
    expect(ctx.facts.forecastLow).toBe(51);
    expect(ctx.facts.forecastHigh).toBe(55);
    expect(ctx.facts.lifelineForecastPeso).toBeGreaterThan(518);
    expect(ctx.facts.lifelineForecastPeso).toBeLessThan(520);
    expect(ctx.facts.lifelineUnderPeso).toBe(0);
    expect(ctx.facts.checkStatus).toBeUndefined();
    expect(ctx.allowedNumbers).toContain(519);
    expect(ctx.sources).toContain("lifeline");
    expect(ctx.otherNames).toEqual([]);
  });
  it("never writes the 4Ps flag into the fact sheet", () => {
    expect(ctx.factSheet.toLowerCase()).not.toMatch(/(is|are|being) (a )?4ps|fourps/);
  });
});

describe("errors", () => {
  it("throws unknown_household", () => {
    try {
      buildContextFromState(sampleCompoundState(), "nope", "en");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AskError);
      expect((e as AskError).code).toBe("unknown_household");
    }
  });
  it("throws missing_reading when a reading is missing", () => {
    const s = sampleCompoundState();
    s.currentReadings = s.currentReadings.filter((r) => r.meterId !== s.meters.find((m) => m.householdId === "hC")!.id);
    try {
      buildContextFromState(s, "hB", "en");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AskError);
      expect((e as AskError).code).toBe("missing_reading");
    }
  });
});

describe("buildContextFromTenant", () => {
  const view = buildTenantView(sampleCompoundState(), "hB");
  const ctx = buildContextFromTenant(view, "en");
  it("has the golden numbers in shared mode", () => {
    expect(ctx.mode).toBe("shared");
    expect(ctx.facts.share).toBe(677.77);
    expect(ctx.facts.aboveBy).toBe(64.73);
    expect(ctx.facts.perKwhValue).toBe(14.94);
    expect(ctx.facts.billKwh).toBe(180);
    expect(ctx.facts.fixedPart).toBeCloseTo(5.345, 6);
    expect(ctx.sources).toContain("rateCheck");
  });
  it("leaks no other household into the fact sheet", () => {
    expect(ctx.otherNames).toEqual([]);
    const sheet = ctx.factSheet;
    for (const n of NAMES.filter((x) => x !== "Santos")) expect(sheet).not.toContain(n);
    expect(sheet.toLowerCase()).not.toMatch(/(is|are|being) (a )?4ps|fourps/);
  });
});

describe("4Ps privacy", () => {
  it("fact sheet is identical whether or not the own-meter household is 4Ps", () => {
    const on = sampleBautistaState();
    const off = sampleBautistaState();
    const h = (st: typeof on, v: boolean) => {
      for (const x of st.households) if (x.id === "hBautista") x.fourPs = v;
    };
    h(on, true);
    h(off, false);
    const a = buildContextFromState(on, "hBautista", "en").factSheet;
    const b = buildContextFromState(off, "hBautista", "en").factSheet;
    expect(a).toBe(b);
    expect(a).not.toMatch(/519/);
  });
});
