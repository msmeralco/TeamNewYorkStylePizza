import { describe, expect, it } from "vitest";
import { LINE_KEYS } from "@/types";
import { SAMPLE_BILL, SAMPLE_CURRENT_READINGS, SAMPLE_PREVIOUS_READINGS, BAUTISTA_READINGS } from "./seed";

describe("seed data", () => {
  it("bill lines add up to the bill amount", () => {
    const sum = LINE_KEYS.reduce((s, k) => s + SAMPLE_BILL.lines[k], 0);
    expect(sum).toBeCloseTo(SAMPLE_BILL.amount, 2);
  });
  it("sub-meter kWh are 52, 45, 38, 45 and add to 180", () => {
    const kwh = SAMPLE_CURRENT_READINGS.map((r, i) => r.value - SAMPLE_PREVIOUS_READINGS[i].value);
    expect(kwh).toEqual([52, 45, 38, 45]);
    expect(kwh.reduce((a, b) => a + b, 0)).toBe(SAMPLE_BILL.kwh);
  });
  it("bill readings match its kWh", () => {
    expect(SAMPLE_BILL.presentReading! - SAMPLE_BILL.previousReading!).toBe(SAMPLE_BILL.kwh);
  });
  it("Bautista used 32 kWh by the day 18 photo", () => {
    expect(BAUTISTA_READINGS[1].value - BAUTISTA_READINGS[0].value).toBe(32);
  });
});
