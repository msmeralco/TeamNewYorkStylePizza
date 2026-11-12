// Shared contract between the Kahati backend and the frontend.
// Change these only together with docs/API.md, and say so in the commit ("contract: ...").
//
// Conventions
// - Money is in pesos as a JS number. The engine keeps full precision; values marked
//   "display" are rounded to centavos (2 dp).
// - Dates are ISO strings: "YYYY-MM-DD" for calendar dates, full ISO for timestamps.
// - kWh are numbers (readings are whole kWh; derived values may have decimals).

/** The seven lines Kahati shows. The printed bill groups supply and metering inside distribution. */
export type LineKey =
  | "generation"
  | "transmission"
  | "systemLoss"
  | "distribution"
  | "supplyMetering"
  | "taxes"
  | "other";

export const LINE_KEYS: readonly LineKey[] = [
  "generation",
  "transmission",
  "systemLoss",
  "distribution",
  "supplyMetering",
  "taxes",
  "other",
] as const;

export const LINE_LABELS: Record<LineKey, string> = {
  generation: "Generation",
  transmission: "Transmission",
  systemLoss: "System loss",
  distribution: "Distribution",
  supplyMetering: "Supply and metering",
  taxes: "Taxes",
  other: "Other charges",
};

export type Lines = Record<LineKey, number>;

export type Language = "en" | "fil";

export interface Compound {
  id: string;
  displayName: string;
  /** "shared": several households behind one Meralco meter. "single": one household, own meter. */
  mode: "shared" | "single";
  householdIds: string[];
}

export interface Household {
  id: string;
  compoundId: string;
  /** "A", "B", ... */
  label: string;
  displayName: string;
  /** Self-reported. Shown only to that household; never to the organizer or other households. */
  fourPs: boolean;
  language: Language;
}

export type MeterType = "digital" | "analog_dial";

export interface Meter {
  id: string;
  /** null for the compound's master (Meralco) meter. */
  householdId: string | null;
  serial: string;
  type: MeterType;
  /** Number of digits the register shows (e.g. 5 for 04572). */
  digits: number;
}

export type ReadingSource = "photo" | "typed" | "bill";

export interface Reading {
  id: string;
  meterId: string;
  /** Register value, whole kWh (digits before any decimal point). */
  value: number;
  /** When the photo was taken in the app, or when it was typed. For "bill", the bill's read date. */
  capturedAt: string;
  source: ReadingSource;
  /** 0..1 from the vision model; null for typed or bill readings. */
  confidence: number | null;
  confirmed: boolean;
  /** Serial read from the photo, if any. */
  serialRead?: string | null;
}

export interface Bill {
  id: string;
  compoundId: string;
  periodStart: string;
  periodEnd: string;
  /** Date of meter reading printed on the bill. */
  readDate: string;
  /** Date of next meter reading printed on the bill. */
  nextReadDate: string;
  kwh: number;
  amount: number;
  lines: Lines;
  /** Fixed per-customer charges inside the bill (Meralco Oct 2026: supply 16.38 + metering 5.00). Inside lines.supplyMetering. */
  fixedCharges: number;
  previousReading: number | null;
  presentReading: number | null;
  /** Monthly consumption history printed on the bill, if read and confirmed. month = "YYYY-MM". */
  history: { month: string; kwh: number }[];
  /** Last 4 digits of the account number only. */
  accountLast4: string;
  source: "scan" | "typed" | "seed";
}

export interface Share {
  householdId: string;
  /** kWh used for the split: household kWh + its part of unmetered kWh. */
  kwh: number;
  /** Unrounded peso share. */
  amountExact: number;
  /** Display amount, largest-remainder rounded so all shares add up to the bill. */
  amount: number;
  /** Per-line breakdown (unrounded); the lines add up to amountExact. */
  breakdown: Lines;
  /** Of which the equal split of fixed charges. */
  fixedPart: number;
}

export interface SplitResult {
  billId: string;
  shares: Share[];
  /** Sum of display shares; always equals bill.amount. */
  total: number;
  unmeteredKwh: number;
  /** Bill amount ÷ bill kWh. */
  effectiveRate: number;
  /** Variable part ÷ kWh: what one kWh saved takes off a share on a shared meter. */
  perKwhValue: number;
}

export interface RateCheck {
  householdId: string;
  chargedRate: number;
  effectiveRate: number;
  kwh: number;
  askedAmount: number;
  shareAmount: number;
  /** askedAmount − share, in pesos (display). Positive = above the bill's rate. */
  aboveBy: number;
  /** True when the charged rate is more than 2% above the effective rate. */
  flagged: boolean;
  /** Neutral sentence for the UI. */
  message: string;
}

export interface RateRow {
  /** "YYYY-MM" */
  month: string;
  perKwh: number;
  source: string;
  publishedOn: string;
}

export interface LifelineTier {
  maxKwh: number;
  discount: number; // 1 = 100% off
}

export type ForecastStage = 1 | 2 | 3;

export interface Forecast {
  householdId: string;
  stage: ForecastStage;
  readDate: string;
  /** Point forecast, kWh by the read date. */
  kwh: number;
  low: number;
  high: number;
  /** "Rough guess" for stage 1. */
  label: string | null;
  /** Points for the chart: day offset from the last bill read date and kWh used. */
  points: { date: string; day: number; kwhUsed: number; kind: "bill" | "photo" | "projection" }[];
  rate: { perKwh: number; month: string; isFallback: boolean; note: string | null; /** Largest month-to-month rate change as a fraction; 0 when the month has its own row. */ rangeFactor?: number };
  /** Own enrolled meter only. */
  lifeline: null | {
    lineKwh: 50;
    forecastPeso: number;
    /** Peso range when the rate is a labelled fallback (rate moves by rangeFactor); display values. */
    pesoLow?: number;
    pesoHigh?: number;
    underLinePeso: number;
    message: string;
    tierLine: string;
    /** The lifeline tier table used (2026 DSWD): up to maxKwh, discount as a fraction (1 = 100% off). */
    tiers?: LifelineTier[];
  };
  /** Shared meter only. */
  perKwhValue: number | null;
  spike: null | { percentAbove: number; message: string };
  actions: string[];
  /** Optional plain note, for example when weather data was unavailable or partly last year's. */
  note?: string;
}

export type CheckStatus = "ok" | "gap";

export interface HouseholdCheck {
  householdId: string;
  kwh: number;
  chip: "verified" | "typed" | "missing";
  /** "Reading needs a second look" flags, never naming the household to others. */
  flags: string[];
  suggestion?: { from: string; to: string; message: string } | null;
}

export interface CheckResult {
  billId: string;
  status: CheckStatus;
  billKwh: number;
  readingsKwh: number;
  missingKwh: number;
  tolerancePct: number;
  toleranceKwh: number;
  households: HouseholdCheck[];
  /** False when any household chip is "missing" (no meter, no current or no previous reading). */
  complete?: boolean;
  alignedTo: string;
  gapRule: string | null;
  headline: string;
  /** On a gap: "Readings add up to 162 of 180 kWh." Null when the readings add up. */
  detail?: string | null;
}

/** Shape the vision readers return before the user confirms. */
export interface MeterScan {
  value: number;
  digitsText: string;
  serial: string | null;
  confidence: number;
  /** Second independent read, to flag disagreement. */
  secondRead: number | null;
  provider: "mock" | "gemini";
  /** Which Gemini model answered, when provider is "gemini". */
  model?: string;
}

export interface BillScan {
  periodStart: string;
  periodEnd: string;
  readDate: string;
  nextReadDate: string;
  kwh: number;
  amount: number;
  lines: Lines;
  fixedCharges: number;
  previousReading: number | null;
  presentReading: number | null;
  history: { month: string; kwh: number }[];
  accountLast4: string;
  confidence: number;
  /** Fields the reader could not find (e.g. "lines.taxes", "fixedCharges"); present only when something is missing. */
  missing?: string[];
  provider: "mock" | "gemini";
  /** Which Gemini model answered, when provider is "gemini". */
  model?: string;
}

/**
 * Everything the engine needs for one compound and one billing period.
 * The API is stateless: the frontend keeps this (e.g. in localStorage) and POSTs it.
 * Start from GET /api/sample.
 */
export interface CompoundState {
  compound: Compound;
  households: Household[];
  meters: Meter[];
  bill: Bill;
  /** Last period's confirmed readings, one per sub-meter. */
  previousReadings: Reading[];
  /** This period's readings, one per sub-meter (may be missing while scanning). */
  currentReadings: Reading[];
  /** Self-declared common-area kWh (capped at 10% of bill kWh). */
  unmeteredKwh: number;
  /** Rate a household was asked to pay, if the organizer charges per kWh. */
  chargedRates: { householdId: string; perKwh: number }[];
}

/** What a tenant sees from a shared link (no account). */
export interface TenantView {
  household: Pick<Household, "id" | "displayName" | "label">;
  share: Share;
  rateCheck: RateCheck | null;
  perKwhValue: number;
  bill: Pick<Bill, "periodStart" | "periodEnd" | "kwh" | "amount" | "accountLast4">;
  expiresAt: string;
  footer: string;
  /** The tenant decides whether the organizer sees the rate line. Defaults to false. */
  rateLineVisibleToOrganizer?: boolean;
}

// ---------- Ask Kahati (grounded explainer chat) ----------

/** Preset questions are answered from templates (no AI), so they are instant and stage-proof. */
export type AskPresetId = "why_share" | "what_lines" | "save_kwh" | "lifeline" | "readings_gap" | "rate_check";

export interface AskPreset {
  id: AskPresetId;
  question: string;
}

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * POST /api/ask. Send either the organizer's {state, householdId} or a tenant's {tenantToken}.
 * Send presetId for a preset question, or question for free text (answered by Gemini, grounded).
 */
export interface AskRequest {
  state?: CompoundState;
  householdId?: string;
  tenantToken?: string;
  presetId?: AskPresetId;
  /** Free text, at most 500 characters. */
  question?: string;
  language?: Language;
  /** The last few turns (at most 6), for follow-up questions. */
  history?: AskTurn[];
}

export type AskSource = "share" | "breakdown" | "rateCheck" | "forecast" | "check" | "lifeline";

export interface AskAnswer {
  answer: string;
  language: Language;
  /** "template" for presets and safe fallbacks; "gemini" for free text that passed the guardrails. */
  provider: "template" | "gemini";
  /** True when the AI answer failed a guardrail and was replaced by a safe answer. */
  fallback: boolean;
  /** True when the question was outside what Kahati answers. */
  refused: boolean;
  /** Which computed results the answer is based on. */
  sources: AskSource[];
  /** Follow-up preset questions to show as buttons. */
  suggestions: AskPreset[];
  footer: string;
  model?: string;
}

export interface ApiError {
  error: { code: string; message: string; next?: string };
}
