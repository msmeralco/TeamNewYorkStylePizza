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
