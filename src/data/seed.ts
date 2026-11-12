// Sample compound and households for the demo. Invented names and numbers: say "sample bill".
// Numbers match kahati-hackathon-kit/02_product_spec.md and print/README.md.
import type { Bill, Compound, Household, Meter, Reading } from "@/types";

export const SAMPLE_COMPOUND: Compound = {
  id: "c14",
  displayName: "Compound 14 (sample)",
  mode: "shared",
  householdIds: ["hA", "hB", "hC", "hD"],
};

export const SAMPLE_HOUSEHOLDS: Household[] = [
  { id: "hA", compoundId: "c14", label: "A", displayName: "Reyes", fourPs: false, language: "en" },
  { id: "hB", compoundId: "c14", label: "B", displayName: "Santos", fourPs: true, language: "fil" },
  { id: "hC", compoundId: "c14", label: "C", displayName: "Dela Cruz", fourPs: true, language: "fil" },
  { id: "hD", compoundId: "c14", label: "D", displayName: "Garcia", fourPs: true, language: "en" },
];

export const SAMPLE_METERS: Meter[] = [
  { id: "mMaster", householdId: null, serial: "MM-7781", type: "digital", digits: 5 },
  { id: "mA", householdId: "hA", serial: "SM-0213", type: "digital", digits: 5 },
  { id: "mB", householdId: "hB", serial: "SM-0214", type: "digital", digits: 5 },
  { id: "mC", householdId: "hC", serial: "SM-0215", type: "digital", digits: 5 },
  { id: "mD", householdId: "hD", serial: "SM-0216", type: "digital", digits: 5 },
];

/** Sample bill: 30 Sep to 31 Oct 2026, 180 kWh, ₱2,711.07. */
export const SAMPLE_BILL: Bill = {
  id: "b2026-10",
  compoundId: "c14",
  periodStart: "2026-09-30",
  periodEnd: "2026-10-31",
  readDate: "2026-10-31",
  nextReadDate: "2026-11-30",
  kwh: 180,
  amount: 2711.07,
  lines: {
    generation: 1690.0,
    transmission: 230.0,
    systemLoss: 150.0,
    distribution: 330.0,
    supplyMetering: 70.0, // 5.00 + 19.55 + 16.38 + 29.07; of which 21.38 fixed
    taxes: 190.0,
    other: 51.07, // 0.01 + 26.89 + 23.47 + 0.70
  },
  fixedCharges: 21.38,
  previousReading: 12340,
  presentReading: 12520,
  // Usage history printed on the bill, Nov 2025 to Oct 2026.
  history: [
    { month: "2025-11", kwh: 168 },
    { month: "2025-12", kwh: 172 },
    { month: "2026-01", kwh: 160 },
    { month: "2026-02", kwh: 164 },
    { month: "2026-03", kwh: 190 },
    { month: "2026-04", kwh: 236 },
    { month: "2026-05", kwh: 248 },
    { month: "2026-06", kwh: 214 },
    { month: "2026-07", kwh: 197 },
    { month: "2026-08", kwh: 191 },
    { month: "2026-09", kwh: 185 },
    { month: "2026-10", kwh: 180 },
  ],
  accountLast4: "4821",
  source: "seed",
};

/** Previous month's sub-meter readings (30 Sep). Current props read 03162, 04572, 02238, 05055. */
export const SAMPLE_PREVIOUS_READINGS: Reading[] = [
  { id: "rA0", meterId: "mA", value: 3110, capturedAt: "2026-09-30T09:00:00+08:00", source: "photo", confidence: 0.98, confirmed: true, serialRead: "SM-0213" },
  { id: "rB0", meterId: "mB", value: 4527, capturedAt: "2026-09-30T09:05:00+08:00", source: "photo", confidence: 0.98, confirmed: true, serialRead: "SM-0214" },
  { id: "rC0", meterId: "mC", value: 2200, capturedAt: "2026-09-30T09:10:00+08:00", source: "photo", confidence: 0.98, confirmed: true, serialRead: "SM-0215" },
  { id: "rD0", meterId: "mD", value: 5010, capturedAt: "2026-09-30T09:15:00+08:00", source: "photo", confidence: 0.98, confirmed: true, serialRead: "SM-0216" },
];

/** This month's readings (31 Oct), all photo-verified: 52, 45, 38, 45 kWh = 180. */
export const SAMPLE_CURRENT_READINGS: Reading[] = [
  { id: "rA1", meterId: "mA", value: 3162, capturedAt: "2026-10-31T09:00:00+08:00", source: "photo", confidence: 0.97, confirmed: true, serialRead: "SM-0213" },
  { id: "rB1", meterId: "mB", value: 4572, capturedAt: "2026-10-31T09:05:00+08:00", source: "photo", confidence: 0.97, confirmed: true, serialRead: "SM-0214" },
  { id: "rC1", meterId: "mC", value: 2238, capturedAt: "2026-10-31T09:10:00+08:00", source: "photo", confidence: 0.97, confirmed: true, serialRead: "SM-0215" },
  { id: "rD1", meterId: "mD", value: 5055, capturedAt: "2026-10-31T09:15:00+08:00", source: "photo", confidence: 0.97, confirmed: true, serialRead: "SM-0216" },
];

/** What Santos (Lorna) was asked to pay, for the rate check: ₱16.50/kWh × 45 = ₱742.50. */
export const SAMPLE_CHARGED_RATE = { householdId: "hB", perKwh: 16.5 };

// ---- Own-meter sample (Usage screen): Bautista, 4Ps, own enrolled meter ----

export const BAUTISTA_COMPOUND: Compound = {
  id: "cBautista",
  displayName: "Bautista (sample)",
  mode: "single",
  householdIds: ["hBautista"],
};

export const BAUTISTA_HOUSEHOLD: Household = {
  id: "hBautista",
  compoundId: "cBautista",
  label: "A",
  displayName: "Bautista",
  fourPs: true,
  language: "fil",
};

export const BAUTISTA_METER: Meter = {
  id: "mBautista",
  householdId: "hBautista",
  serial: "MM-5520",
  type: "digital",
  digits: 5,
};

/**
 * Bautista's own small October bill: 48 kWh, 30 Sep to 31 Oct 2026. The compound bill's per-kWh lines
 * scaled by 48/180 (the 21.38 fixed charge stays inside supplyMetering), each rounded to centavos;
 * "other" takes the rounding remainder so the lines add up exactly to the amount.
 */
export const BAUTISTA_BILL: Bill = {
  id: "bBautista2026-10",
  compoundId: "cBautista",
  periodStart: "2026-09-30",
  periodEnd: "2026-10-31",
  readDate: "2026-10-31",
  nextReadDate: "2026-11-30",
  kwh: 48,
  amount: 738.63,
  lines: {
    generation: 450.67,
    transmission: 61.33,
    systemLoss: 40.0,
    distribution: 88.0,
    supplyMetering: 34.35, // 12.97 variable + 21.38 fixed
    taxes: 50.67,
    other: 13.61, // scaled 13.62, less 0.01 rounding remainder
  },
  fixedCharges: 21.38,
  previousReading: 12472,
  presentReading: 12520,
  history: [
    { month: "2025-11", kwh: 52 },
    { month: "2025-12", kwh: 55 },
    { month: "2026-01", kwh: 47 },
    { month: "2026-02", kwh: 44 },
    { month: "2026-03", kwh: 50 },
    { month: "2026-04", kwh: 58 },
    { month: "2026-05", kwh: 62 },
    { month: "2026-06", kwh: 56 },
    { month: "2026-07", kwh: 51 },
    { month: "2026-08", kwh: 49 },
    { month: "2026-09", kwh: 46 },
    { month: "2026-10", kwh: 48 },
  ],
  accountLast4: "7731",
  source: "seed",
};

/** Read-day reading printed on the bill (31 Oct) and the day-18 photo (18 Nov): 32 kWh used. */
export const BAUTISTA_READINGS: Reading[] = [
  { id: "rBa0", meterId: "mBautista", value: 12520, capturedAt: "2026-10-31", source: "bill", confidence: null, confirmed: true },
  { id: "rBa1", meterId: "mBautista", value: 12552, capturedAt: "2026-11-18T08:30:00+08:00", source: "photo", confidence: 0.97, confirmed: true, serialRead: "MM-5520" },
];

export const BAUTISTA_NEXT_READ_DATE = "2026-11-30";
export const BAUTISTA_LAST_READ_DATE = "2026-10-31";
