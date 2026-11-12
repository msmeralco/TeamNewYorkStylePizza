import { describe, expect, it } from "vitest";
import { sampleBautistaState, sampleCompoundState } from "@/data/sample";
import { cddForPeriod, fitCdd, predict } from "./cdd";
import { addDays, daysBetween, monthOf, toManilaDate } from "./dates";
import { forecast } from "./forecast";
import { billAfterLifeline, discountFor, tierLine } from "./lifeline";
import { rateFor } from "./rates";

describe("dates", () => {
  it("counts days and handles timestamps in Manila", () => {
    expect(daysBetween("2026-10-31", "2026-11-18")).toBe(18);
    expect(daysBetween("2026-11-18", "2026-11-30")).toBe(12);
    expect(toManilaDate("2026-11-18T08:30:00+08:00")).toBe("2026-11-18");
    expect(toManilaDate("2026-11-17T20:00:00Z")).toBe("2026-11-18");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(monthOf("2026-11-18T08:30:00+08:00")).toBe("2026-11");
  });
});

describe("rates", () => {
  it("uses the month's row", () => {
    const r = rateFor("2026-10");
    expect(r).toMatchObject({ perKwh: 15.0615, month: "2026-10", isFallback: false, note: null });
  });
  it("falls back to the latest earlier month with a note", () => {
    const r = rateFor("2026-11");
    expect(r.perKwh).toBe(15.0615);
    expect(r.month).toBe("2026-10");
    expect(r.isFallback).toBe(true);
    expect(r.note).toBe("Using October's rate. November's is announced mid-month.");
    expect(r.rangeFactor).toBe(0);
  });
  it("computes the range factor from the table", () => {
    const t = [
      { month: "2026-09", perKwh: 10, source: "", publishedOn: "" },
      { month: "2026-10", perKwh: 11, source: "", publishedOn: "" },
    ];
    expect(rateFor("2026-11", t).rangeFactor).toBeCloseTo(0.1, 10);
  });
});

describe("lifeline", () => {
  it("picks tiers by rounded kWh", () => {
    expect(discountFor(0)).toBe(1);
    expect(discountFor(50)).toBe(1);
    expect(discountFor(50.4)).toBe(1);
    expect(discountFor(51)).toBe(0.35);
    expect(discountFor(70)).toBe(0.35);
    expect(discountFor(71)).toBe(0.2);
    expect(discountFor(100)).toBe(0.2);
    expect(discountFor(101)).toBe(0);
  });
  it("computes the bill", () => {
    expect(billAfterLifeline(53, 15.0615)).toBeCloseTo(518.868675, 6);
    expect(billAfterLifeline(50, 15.0615)).toBe(0);
    expect(tierLine()).toBe("4Ps lifeline: 100% off up to 50 kWh, 35% off from 51 to 70");
  });
});

describe("cdd", () => {
  it("sums degrees above base", () => {
    expect(cddForPeriod([22, 25, 28])).toBe(5);
  });
  it("recovers base and slope from exact points", () => {
    const pts = [0, 10, 20, 30, 40, 50, 60].map((cdd) => ({ cdd, kwh: 80 + 2.5 * cdd }));
    const fit = fitCdd(pts)!;
    expect(fit.base).toBeCloseTo(80, 8);
    expect(fit.perCdd).toBeCloseTo(2.5, 8);
    expect(fit.residualSd).toBeCloseTo(0, 8);
    expect(fit.n).toBe(7);
    expect(predict(fit, 100)).toBeCloseTo(330, 6);
  });
  it("returns null below 6 points or a non-positive slope", () => {
    expect(fitCdd([0, 10, 20, 30, 40].map((cdd) => ({ cdd, kwh: 80 + 2 * cdd })))).toBeNull();
    expect(fitCdd([0, 10, 20, 30, 40, 50].map((cdd) => ({ cdd, kwh: 200 - cdd })))).toBeNull();
  });
});

describe("forecast: Bautista (own meter, stage 2)", () => {
  const f = forecast({ state: sampleBautistaState(), householdId: "hBautista" });
  it("projects 53 kWh with a 51 to 55 range", () => {
    expect(f.stage).toBe(2);
    expect(f.readDate).toBe("2026-11-30");
    expect(f.kwh).toBe(53);
    expect(f.low).toBe(51);
    expect(f.high).toBe(55);
    expect(f.label).toBeNull();
    expect(f.points.map((p) => [p.kind, p.day, p.kwhUsed])).toEqual([
      ["bill", 0, 0],
      ["photo", 18, 32],
      ["projection", 30, 53],
    ]);
  });
  it("labels the fallback rate", () => {
    expect(f.rate).toMatchObject({ perKwh: 15.0615, month: "2026-10", isFallback: true, note: "Using October's rate. November's is announced mid-month." });
  });
  it("shows the 50 kWh line", () => {
    expect(f.lifeline).toMatchObject({
      lineKwh: 50,
      forecastPeso: 518.87,
      underLinePeso: 0,
      message: "Stay under 50 kWh: 100% off instead of about ₱519",
      tierLine: "4Ps lifeline: 100% off up to 50 kWh, 35% off from 51 to 70",
    });
    expect(f.perKwhValue).toBeNull();
  });
  it("has no spike and two plain actions", () => {
    expect(f.spike).toBeNull();
    expect(f.actions).toHaveLength(2);
  });
  it("warns on a spike", () => {
    const s = sampleBautistaState();
    s.currentReadings[0].value = 12520 + 180; // 10 kWh a day against about 5.8 usual
    const g = forecast({ state: s, householdId: "hBautista" });
    expect(g.spike?.percentAbove).toBe(72);
    expect(g.spike?.message).toBe("Your use so far this month is 72% above your usual.");
    expect(g.actions.some((a) => a.includes("about 30 kWh a month (assumes about 1 kW)"))).toBe(true);
  });
  it("falls back to stage 1 without a photo", () => {
    const s = sampleBautistaState();
    s.currentReadings = [];
    const g = forecast({ state: s, householdId: "hBautista" });
    expect(g.stage).toBe(1);
    expect(g.label).toBe("Rough guess");
    expect(g.kwh).toBe(180);
    expect(g.low).toBe(162);
    expect(g.high).toBe(198);
  });
});

describe("forecast: shared compound", () => {
  it("gives the per-kWh value and no lifeline for Santos", () => {
    const f = forecast({ state: sampleCompoundState(), householdId: "hB" });
    expect(f.perKwhValue).toBe(14.94);
    expect(f.lifeline).toBeNull();
    expect(f.stage).toBe(1);
    expect(f.kwh).toBe(45);
    expect(f.points[0]).toMatchObject({ date: "2026-10-31", day: 0 });
    expect(f.points[f.points.length - 1]).toMatchObject({ date: "2026-11-30", day: 30 });
  });
  const rolled = (value: number, at: string) => {
    const s = sampleCompoundState();
    s.previousReadings = s.currentReadings;
    s.currentReadings = [{ ...s.currentReadings[1], id: "rB2", value, capturedAt: at }];
    return s;
  };
  it("reaches stage 2 on a rolled-over shared state", () => {
    const f = forecast({ state: rolled(4602, "2026-11-18T09:00:00+08:00"), householdId: "hB" });
    expect(f.stage).toBe(2);
    expect(f.kwh).toBe(50);
    expect(f.low).toBe(48);
    expect(f.high).toBe(52);
  });
  it("projects a pre-read-date photo only to the read date", () => {
    const s = sampleCompoundState();
    s.currentReadings = [{ ...s.currentReadings[1], value: 4550, capturedAt: "2026-10-15T09:00:00+08:00" }];
    const f = forecast({ state: s, householdId: "hB" });
    expect(f.stage).toBe(2);
    expect(f.readDate).toBe("2026-10-31");
    expect(f.kwh).toBe(48);
  });
  it("rejects an unknown household", () => {
    expect(() => forecast({ state: sampleCompoundState(), householdId: "nope" })).toThrow();
  });
});

describe("rates: before the table", () => {
  it("labels the earliest row honestly", () => {
    const r = rateFor("2026-09");
    expect(r.month).toBe("2026-10");
    expect(r.note).toBe("Using October's rate, the earliest in the table.");
  });
});

describe("forecast: stage 3", () => {
  it("uses the fit when there is no photo", () => {
    const s = sampleBautistaState();
    s.currentReadings = [];
    const history = [0, 10, 20, 30, 40, 50].map((cdd) => ({ cdd, kwh: 40 + 2 * cdd }));
    const f = forecast({ state: s, householdId: "hBautista", history, nextPeriodCdd: 25 });
    expect(f.stage).toBe(3);
    expect(f.kwh).toBe(90);
    expect(f.low).toBe(90);
    expect(f.high).toBe(90);
  });
});
