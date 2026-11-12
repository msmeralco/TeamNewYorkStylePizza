// 2026 lifeline tiers for 4Ps or SWDO-certified households on one Meralco account:
// ERC Res. No. 02, s. 2026 (uniform 100% up to 50 kWh) and Meralco's ERC-approved
// 51 to 100 kWh tiers, effective April 2026 billing (02_product_spec.md, "The 50 kWh line"). Kept as data so a new schedule
// is a one-line change. The backend may send its own tiers; these are the default.

export interface LifelineTier {
  /** Upper bound of the tier in kWh (inclusive). */
  upTo: number
  /** Percent off the bill in this tier. */
  pctOff: number
}

export const LIFELINE_TIERS_2026: LifelineTier[] = [
  { upTo: 50, pctOff: 100 },
  { upTo: 70, pctOff: 35 },
  { upTo: 100, pctOff: 20 },
]

/** Fraction off (0 to 1) for a month's kWh. Above the last tier there is no discount. */
export function lifelineDiscount(kwh: number, tiers: LifelineTier[] = LIFELINE_TIERS_2026): number {
  const t = tiers.find((x) => kwh <= x.upTo)
  return t ? t.pctOff / 100 : 0
}
