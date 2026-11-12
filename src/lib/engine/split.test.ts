import { describe, expect, it } from "vitest";
import { sampleCompoundState } from "@/data/sample";
import { computeSplit, SplitError } from "./split";
import { rateCheck } from "./rateCheck";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("computeSplit golden", () => {
  const r = computeSplit(sampleCompoundState());
  it("amounts", () => {
    expect(r.shares.map((s) => s.amount)).toEqual([782.36, 677.77, 573.17, 677.77]);
    expect(r.total).toBeCloseTo(2711.07, 10);
    expect(r.shares[0].amountExact).toBeCloseTo(782.3666, 3);
    expect(r.shares[1].amountExact).toBeCloseTo(677.7675, 10);
    expect(r.shares[2].amountExact).toBeCloseTo(573.1684, 3);
    expect(r.shares[3].amountExact).toBeCloseTo(677.7675, 10);
  });
  it("Santos breakdown", () => {
    const s = r.shares[1];
    expect(s.breakdown.generation).toBeCloseTo(422.5, 8);
    expect(s.breakdown.transmission).toBeCloseTo(57.5, 8);
    expect(s.breakdown.systemLoss).toBeCloseTo(37.5, 8);
    expect(s.breakdown.distribution).toBeCloseTo(82.5, 8);
    expect(s.breakdown.supplyMetering).toBeCloseTo(17.5, 8);
    expect(s.breakdown.taxes).toBeCloseTo(47.5, 8);
    expect(s.breakdown.other).toBeCloseTo(12.7675, 8);
    expect(s.fixedPart).toBeCloseTo(5.345, 10);
    expect(sum(Object.values(s.breakdown))).toBeCloseTo(s.amountExact, 8);
  });
  it("rates", () => {
    expect(r.effectiveRate).toBeCloseTo(15.0615, 4);
    expect(r.perKwhValue.toFixed(2)).toBe("14.94");
  });
});

describe("computeSplit cases", () => {
  it("one household gets the whole bill", () => {
    const st = sampleCompoundState();
    st.households = [st.households[0]];
    const r = computeSplit(st);
    expect(r.shares[0].amount).toBe(2711.07);
    expect(r.total).toBe(2711.07);
  });
  it("caps unmetered at 10% of bill kWh", () => {
    const st = sampleCompoundState();
    st.unmeteredKwh = 30;
    const r = computeSplit(st);
    expect(r.unmeteredKwh).toBe(18);
    expect(r.shares[1].kwh).toBeCloseTo(49.5, 10);
    expect(r.total).toBeCloseTo(2711.07, 10);
  });
  it("gap still sums to the bill", () => {
    const st = sampleCompoundState();
    st.currentReadings.find((x) => x.meterId === "mC")!.value = 2220;
    const r = computeSplit(st);
    expect(r.total).toBeCloseTo(2711.07, 10);
    expect(sum(r.shares.map((s) => s.amountExact))).toBeCloseTo(2711.07, 8);
  });
  it("missing reading throws SplitError", () => {
    const st = sampleCompoundState();
    st.currentReadings = st.currentReadings.filter((x) => x.meterId !== "mA");
    expect(() => computeSplit(st)).toThrow(SplitError);
  });
  it("negative kWh throws SplitError", () => {
    const st = sampleCompoundState();
    st.currentReadings.find((x) => x.meterId === "mA")!.value = 3000;
    expect(() => computeSplit(st)).toThrow(SplitError);
  });
});

describe("rateCheck", () => {
  it("flags Santos at 16.50", () => {
    const c = rateCheck(sampleCompoundState(), "hB")!;
    expect(c.askedAmount).toBeCloseTo(742.5, 10);
    expect(c.aboveBy).toBe(64.73);
    expect(c.flagged).toBe(true);
    expect(c.message).toBe("₱16.50 charged, ₱15.06 on the bill. That is ₱64.73 above the bill's rate on a 45 kWh share.");
  });
  it("null without a charged rate", () => {
    expect(rateCheck(sampleCompoundState(), "hA")).toBeNull();
  });
  it("not flagged when close", () => {
    const st = sampleCompoundState();
    st.chargedRates = [{ householdId: "hB", perKwh: 15.06 }];
    const c = rateCheck(st, "hB")!;
    expect(c.flagged).toBe(false);
    expect(c.message).toBe("The charged rate matches the bill's rate.");
  });
});
