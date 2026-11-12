// Plain data tables. The team updates RATES each month from Meralco's public announcement.
// Kahati never forecasts the rate.
import type { LifelineTier, RateRow } from "@/types";

/** Meralco typical-household rate, one row per month, with source and date. */
export const RATES: RateRow[] = [
  {
    month: "2026-09",
    perKwh: 14.7424,
    source: "Derived: October's ₱15.0615 minus the ₱0.3191 increase reported by PhilStar (14 Oct 2026)",
    publishedOn: "2026-09-14",
  },
  {
    month: "2026-10",
    perKwh: 15.0615,
    source: "PhilStar, Meralco October 2026 rate announcement",
    publishedOn: "2026-10-14",
  },
  // Add 2026-11 when Meralco announces it (mid-month).
];

/** 2026 lifeline tiers as published by DSWD (24 Feb 2026). */
export const LIFELINE_TIERS: LifelineTier[] = [
  { maxKwh: 50, discount: 1.0 },
  { maxKwh: 70, discount: 0.35 },
  { maxKwh: 100, discount: 0.2 },
];

export const LIFELINE_LINE_KWH = 50 as const;

/** Rate check flags a charged rate more than this fraction above the bill's effective rate. */
export const RATE_CHECK_THRESHOLD = 0.02;

/** Readings must add up to the master kWh within this fraction. Disclosed to everyone. */
export const ADD_UP_TOLERANCE = 0.05;

/** Self-declared unmetered (common-area) kWh is capped at this fraction of the bill's kWh. */
export const UNMETERED_CAP = 0.1;

/** A household's use more than this fraction away from its usual is flagged / warned. */
export const SPIKE_THRESHOLD = 0.4;

/** Stage 2 range: ± this fraction of the projected (still to come) kWh. */
export const STAGE2_RANGE = 0.1;

/** Cooling degree day base temperature (°C) for the stage 3 fit. */
export const CDD_BASE_C = 24;

/** Typical wattages. Only to make actions concrete; never a forecast input. Each value is "typical". */
export const TYPICAL_WATTS: { appliance: string; watts: number; note: string }[] = [
  { appliance: "Aircon (window, 1 HP)", watts: 1000, note: "typical" },
  { appliance: "Electric fan (stand)", watts: 50, note: "typical" },
  { appliance: "Rice cooker (cooking)", watts: 600, note: "typical" },
  { appliance: "Rice cooker (keep warm)", watts: 50, note: "typical" },
  { appliance: "Refrigerator (average draw)", watts: 100, note: "typical" },
  { appliance: "LED bulb", watts: 9, note: "typical" },
  { appliance: "TV (LED, 32 inch)", watts: 50, note: "typical" },
];

/** Manila, for Open-Meteo. */
export const MANILA = { latitude: 14.5995, longitude: 120.9842, timezone: "Asia/Manila" };
