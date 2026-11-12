// The 50 kWh lifeline line. Tiers are data (src/data/tables.ts), by the whole month's kWh.
import { LIFELINE_TIERS } from "@/data/tables";
import type { LifelineTier } from "@/types";

/** Discount fraction (1 = 100% off) for a month's kWh. Compared with the rounded kWh. */
export function discountFor(kwh: number, tiers: LifelineTier[] = LIFELINE_TIERS): number {
  const k = Math.round(kwh);
  const sorted = [...tiers].sort((a, b) => a.maxKwh - b.maxKwh);
  for (const t of sorted) if (k <= t.maxKwh) return t.discount;
  return 0;
}

/** Bill after lifeline: (1 - discount) * kwh * rate. Unrounded. */
export function billAfterLifeline(kwh: number, rate: number, tiers: LifelineTier[] = LIFELINE_TIERS): number {
  return (1 - discountFor(kwh, tiers)) * kwh * rate;
}

/** "4Ps lifeline: 100% off up to 50 kWh, 35% off from 51 to 70" */
export function tierLine(tiers: LifelineTier[] = LIFELINE_TIERS): string {
  const sorted = [...tiers].sort((a, b) => a.maxKwh - b.maxKwh).slice(0, 2);
  const parts = sorted.map((t, i) => {
    const pct = Math.round(t.discount * 100);
    return i === 0 ? `${pct}% off up to ${t.maxKwh} kWh` : `${pct}% off from ${sorted[i - 1].maxKwh + 1} to ${t.maxKwh}`;
  });
  return `4Ps lifeline: ${parts.join(", ")}`;
}
