import { describe, expect, it } from "vitest";
import { sampleCompoundState } from "@/data/sample";
import type { CompoundState, Reading } from "@/types";
import { checkCompound } from "./check";
import { alignToReadDate } from "./align";
import { suggestDigitFix } from "./digitFix";

const rd = (over: Partial<Reading>): Reading => ({
  id: "r", meterId: "m", value: 0, capturedAt: "2026-10-31T09:00:00+08:00",
  source: "photo", confidence: 0.97, confirmed: true, ...over,
});

function withCurrent(meterId: string, patch: Partial<Reading>): CompoundState {
  const s = sampleCompoundState();
  s.currentReadings = s.currentReadings.map((r) => (r.meterId === meterId ? { ...r, ...patch } : r));
  return s;
}

describe("checkCompound golden", () => {
  it("sample adds up", () => {
    const r = checkCompound(sampleCompoundState());
    expect(r.status).toBe("ok");
    expect(r.readingsKwh).toBe(180);
    expect(r.missingKwh).toBe(0);
    expect(r.headline).toBe("Readings add up: 180 of 180 kWh");
    expect(r.toleranceKwh).toBe(9);
    expect(r.tolerancePct).toBe(5);
    expect(r.households.every((h) => h.chip === "verified" && h.flags.length === 0)).toBe(true);
    expect(r.alignedTo).toBe("Reading dates aligned to the bill: 31 Oct");
    expect(r.gapRule).toBeNull();
  });

  it("typed cheat on Dela Cruz opens an 18 kWh gap", () => {
    const r = checkCompound(withCurrent("mC", { value: 2220, source: "typed", confidence: null }));
    expect(r.status).toBe("gap");
    expect(r.readingsKwh).toBe(162);
    expect(r.missingKwh).toBe(18);
    expect(r.headline).toBe("18 kWh missing");
    expect(r.households.find((h) => h.householdId === "hC")?.chip).toBe("typed");
    expect(r.gapRule).toBe("Until it is fixed, the gap is split by kWh.");
    expect(r.households.every((h) => !h.suggestion)).toBe(true);
  });

  it("suggests the digit fix for a low-confidence Santos photo", () => {
    const r = checkCompound(withCurrent("mB", { value: 4512, confidence: 0.6 }));
    expect(r.status).toBe("gap");
    const b = r.households.find((h) => h.householdId === "hB")!;
    expect(b.suggestion).toEqual({ from: "04512", to: "04572", message: "Did you mean 04572, not 04512?" });
    expect(b.flags.some((f) => f.startsWith("Reading needs a second look"))).toBe(true);
  });

  it("says extra when over", () => {
    const r = checkCompound(withCurrent("mA", { value: 3200 }));
    expect(r.headline).toBe("38 kWh extra");
  });

  it("flags an old photo and never names a household", () => {
    const r = checkCompound(withCurrent("mA", { capturedAt: "2025-10-31T09:00:00+08:00" }));
    const a = r.households.find((h) => h.householdId === "hA")!;
    expect(a.flags).toContain("Reading needs a second look: Photo time is outside this billing period.");
    const names = ["Reyes", "Santos", "Dela Cruz", "Garcia"];
    for (const f of r.households.flatMap((h) => h.flags)) {
      for (const n of names) expect(f).not.toContain(n);
      expect(f).not.toContain("—");
    }
  });

  it("flags serial mismatch, missing reading and pattern", () => {
    const s = withCurrent("mA", { serialRead: "SM-9999" });
    s.currentReadings = s.currentReadings.filter((r) => r.meterId !== "mD");
    const r = checkCompound(s, { previousKwh: { hB: 20 } });
    expect(r.households.find((h) => h.householdId === "hA")!.flags.length).toBe(1);
    expect(r.households.find((h) => h.householdId === "hD")!.flags[0]).toMatch(/^Reading needs a second look/);
    expect(r.households.find((h) => h.householdId === "hB")!.flags[0]).toMatch(/usual pattern/);
  });
});

describe("alignToReadDate", () => {
  it("leaves a reading on the read date unchanged", () => {
    expect(alignToReadDate(rd({ value: 1000, capturedAt: "2026-10-01T09:00:00+08:00" }), rd({ value: 1300 }), "2026-10-31")).toBe(1300);
  });

  it("pulls a reading taken 3 days late back proportionally", () => {
    const prev = rd({ value: 1000, capturedAt: "2026-10-04T09:00:00+08:00" });
    const curr = rd({ value: 1300, capturedAt: "2026-11-03T09:00:00+08:00" });
    // 300 kWh over 30 days = 10 per day, 3 days late.
    expect(alignToReadDate(prev, curr, "2026-10-31")).toBe(1270);
  });

  it("uses the Manila calendar date", () => {
    // 23:30 UTC on 30 Oct is 07:30 on 31 Oct in Manila.
    const prev = rd({ value: 1000, capturedAt: "2026-10-01T09:00:00+08:00" });
    const curr = rd({ value: 1300, capturedAt: "2026-10-30T23:30:00Z" });
    expect(alignToReadDate(prev, curr, "2026-10-31")).toBe(1300);
  });
});

describe("suggestDigitFix", () => {
  const prev = rd({ value: 4527 });
  it("never suggests for typed readings", () => {
    const cur = rd({ value: 4512, source: "typed", confidence: null });
    expect(suggestDigitFix({ candidates: [{ householdId: "hB", previous: prev, current: cur, digits: 5 }], gapKwh: 60, toleranceKwh: 9 })).toBeNull();
  });
  it("ignores confident readings that add up", () => {
    const cur = rd({ value: 4572 });
    expect(suggestDigitFix({ candidates: [{ householdId: "hB", previous: prev, current: cur, digits: 5 }], gapKwh: 0, toleranceKwh: 9 })).toBeNull();
  });
  it("returns null when no single digit closes the gap", () => {
    const cur = rd({ value: 4540, confidence: 0.5 });
    expect(suggestDigitFix({ candidates: [{ householdId: "hB", previous: prev, current: cur, digits: 5 }], gapKwh: 500, toleranceKwh: 9 })).toBeNull();
  });
});

describe("check hardening", () => {
  it("cheat result has detail", () => {
    const r = checkCompound(withCurrent("mC", { value: 2220, source: "typed", confidence: null }));
    expect(r.detail).toBe("Readings add up to 162 of 180 kWh.");
    expect(checkCompound(sampleCompoundState()).detail).toBeNull();
  });

  it("missing reading gets the missing chip", () => {
    const s = sampleCompoundState();
    s.currentReadings = s.currentReadings.filter((r) => r.meterId !== "mD");
    const r = checkCompound(s);
    const d = r.households.find((h) => h.householdId === "hD")!;
    expect(d.chip).toBe("missing");
    expect(d.kwh).toBe(0);
    expect(r.status).toBe("gap");
  });

  it("rounds kWh to one decimal and keeps integers", () => {
    const s = sampleCompoundState();
    s.currentReadings = s.currentReadings.map((r) => (r.meterId === "mA" ? { ...r, capturedAt: "2026-11-02T09:00:00+08:00" } : r));
    const r = checkCompound(s);
    for (const n of [r.readingsKwh, r.missingKwh, ...r.households.map((h) => h.kwh)]) expect(n).toBe(Math.round(n * 10) / 10);
    expect(checkCompound(sampleCompoundState()).households.map((h) => h.kwh)).toEqual([52, 45, 38, 45]);
  });

  it("sums a household with two meters into one row", () => {
    const s = sampleCompoundState();
    s.meters.push({ id: "mB2", householdId: "hB", serial: "SM-B2", type: "digital", digits: 5 });
    s.previousReadings.push(rd({ meterId: "mB2", value: 100, capturedAt: "2026-10-01T09:00:00+08:00" }));
    s.currentReadings.push(rd({ meterId: "mB2", value: 110 }));
    const r = checkCompound(s);
    expect(r.households.filter((h) => h.householdId === "hB")).toHaveLength(1);
    expect(r.households.find((h) => h.householdId === "hB")!.kwh).toBe(55);
    expect(r.readingsKwh).toBe(190);
  });

  it("digit fix still finds the Santos fix", () => {
    const r = checkCompound(withCurrent("mB", { value: 4512, confidence: 0.6 }));
    expect(r.households.find((h) => h.householdId === "hB")!.suggestion?.to).toBe("04572");
  });
});

describe("check cheat state and serial formats", () => {
  it("offers no digit fix when another household is typed, even with live confidence below 0.9", () => {
    const s = sampleCompoundState();
    s.currentReadings = s.currentReadings.map((r) =>
      r.meterId === "mB" ? { ...r, value: 4592, confidence: 0.6 } : r.meterId === "mC" ? { ...r, value: 2202, source: "typed" as const } : r,
    );
    const r = checkCompound(s);
    expect(r.status).toBe("gap");
    for (const h of r.households) expect(h.suggestion).toBeNull();
  });
  it("does not flag a serial that differs only by spaces, hyphens or case", () => {
    for (const serial of ["SM 0214", "SM0214", "sm-0214"]) {
      const r = checkCompound(withCurrent("mB", { serialRead: serial }));
      expect(r.households.find((h) => h.householdId === "hB")!.flags).toEqual([]);
    }
  });
});

describe("suggestDigitFix odd values", () => {
  it.each([-5, 1e21, 45.5])("never suggests a fix for value %s", (value) => {
    const prev = { id: "p", meterId: "mB", value: 4400, capturedAt: "2026-09-30", source: "photo" as const, confidence: 1, confirmed: true };
    const cur = { id: "c", meterId: "mB", value, capturedAt: "2026-10-31", source: "photo" as const, confidence: 0.5, confirmed: false };
    expect(suggestDigitFix({ candidates: [{ householdId: "hB", previous: prev, current: cur, digits: 5 }], gapKwh: 60, toleranceKwh: 9 })).toBeNull();
  });
});

describe("checkCompound missing readings", () => {
  it("a current reading with no previous reading is missing and not complete", () => {
    const s = sampleCompoundState();
    s.previousReadings = s.previousReadings.filter((r) => r.meterId !== "mB");
    const r = checkCompound(s);
    const hB = r.households.find((h) => h.householdId === "hB")!;
    expect(hB.chip).toBe("missing");
    expect(hB.flags[0].startsWith("Reading needs a second look")).toBe(true);
    expect(r.complete).toBe(false);
  });
  it("a household with no meter is missing", () => {
    const s = sampleCompoundState();
    s.meters = s.meters.filter((m) => m.householdId !== "hC");
    const r = checkCompound(s);
    expect(r.households.find((h) => h.householdId === "hC")!.chip).toBe("missing");
    expect(r.complete).toBe(false);
  });
  it("the sample is complete", () => {
    expect(checkCompound(sampleCompoundState()).complete).toBe(true);
  });
});
