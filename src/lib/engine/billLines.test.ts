import { describe, expect, it } from "vitest";
import { SAMPLE_BILL } from "@/data/seed";
import { reconcileLines } from "./billLines";

describe("reconcileLines", () => {
  it("leaves the sample bill alone", () => {
    const r = reconcileLines(SAMPLE_BILL.lines, SAMPLE_BILL.amount);
    expect(r).toMatchObject({ addsUp: true, adjusted: false, difference: 0, note: null });
    expect(r.lines).toEqual(SAMPLE_BILL.lines);
  });
  it("absorbs a small difference into Other charges and says so", () => {
    const r = reconcileLines({ ...SAMPLE_BILL.lines, other: 50.0 }, SAMPLE_BILL.amount);
    expect(r.adjusted).toBe(true);
    expect(r.difference).toBe(1.07);
    expect(r.lines.other).toBe(51.07);
    expect(r.note).toMatch(/₱1\.07 short of the total/);
  });
  it("handles lines over the total", () => {
    const r = reconcileLines({ ...SAMPLE_BILL.lines, taxes: 192 }, SAMPLE_BILL.amount);
    expect(r.difference).toBe(-2);
    expect(r.lines.other).toBe(49.07);
    expect(r.note).toMatch(/over the total/);
  });
  it("does not hide a large difference", () => {
    const r = reconcileLines({ ...SAMPLE_BILL.lines, generation: 1600 }, SAMPLE_BILL.amount);
    expect(r).toMatchObject({ addsUp: false, adjusted: false, difference: 90 });
    expect(r.lines.generation).toBe(1600);
  });
});
