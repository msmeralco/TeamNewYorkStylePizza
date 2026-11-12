import { describe, expect, it } from "vitest";
import { largestRemainder, round2 } from "./money";

describe("money", () => {
  it("round2", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(782.3666)).toBe(782.37);
  });
  it("largestRemainder sums to total and beats plain rounding", () => {
    const exact = [782.3666666667, 677.7675, 573.1683333333, 677.7675];
    expect(exact.map(round2).reduce((a, b) => a + b, 0)).toBeCloseTo(2711.08, 5);
    expect(largestRemainder(exact, 2711.07)).toEqual([782.36, 677.77, 573.17, 677.77]);
  });
  it("ties go to original order", () => {
    expect(largestRemainder([1 / 3, 1 / 3, 1 / 3], 1)).toEqual([0.34, 0.33, 0.33]);
  });
});
