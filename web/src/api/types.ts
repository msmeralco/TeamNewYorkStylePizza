// Data contracts between the Kahati front end and the backend.
// Shapes follow 02_product_spec.md ("Data we store"). All money is in pesos
// as plain numbers, unrounded; the front end rounds only at display.
// Dates are ISO strings (YYYY-MM-DD) unless named *At (full ISO timestamp).

export type LineKey =
  | 'generation'
  | 'transmission'
  | 'systemLoss'
  | 'distribution'
  | 'supplyMetering'
  | 'taxes'
  | 'other'

export interface BillLine {
  key: LineKey
  amount: number
  /** Fixed per-customer part of this line (split equally, not by kWh). */
  fixed: number
}

export interface Bill {
  id: string
  periodStart: string
  periodEnd: string
  /** Date of meter reading printed on the bill. */
  readDate: string
  nextReadDate: string
  kwh: number
  amount: number
  /** Sum of fixed per-customer charges (sample: 21.38). */
  fixedCharges: number
  lines: BillLine[]
  /** Last 4 digits only. Full account numbers are never stored. */
  accountLast4: string
  presentReading?: number
}

/** What the vision model read off the bill photo, before the user confirms. */
export interface BillScan {
  periodStart: string
  periodEnd: string
  readDate: string
  nextReadDate: string
  kwh: number
  amount: number
  fixedCharges: number
  lines: BillLine[]
  accountLast4: string
  presentReading?: number
  confidence: number
}

export type MeterKind = 'sub' | 'own'
export type ReadingSource = 'photo' | 'typed' | 'bill'

export interface Household {
  id: string
  /** A, B, C, D on a shared meter. */
  label: string
  name: string
  meterKind: MeterKind
  meterSerial: string
  previousReading: number
}

export interface Reading {
  householdId: string
  value: number
  /** kWh since the previous reading, aligned to the bill's read date. */
  kwh: number
  source: ReadingSource
  capturedAt: string
  confidence?: number
  confirmed: boolean
}

export interface MeterScan {
  householdId: string
  value: number
  kwhSinceLast: number
  serial: string
  serialMatches: boolean
  confidence: number
  capturedAt: string
  /** Set when the model's two reads disagree or the value is out of pattern. */
  needsSecondLook: boolean
  /** Why it needs a second look (backend issue codes, e.g. "reads_disagree"). Never names a household. */
  issues?: string[]
  /** Constraint digit correction, e.g. "04572" when "04512" was read. */
  suggestedValue?: number
}

export interface ShareLine {
  key: LineKey
  amount: number
}

export interface Share {
  householdId: string
  kwh: number
  /** Rounded to centavos by largest remainder so shares sum to the bill. */
  amount: number
  lines: ShareLine[]
}

export interface CheckSummary {
  masterKwh: number
  readingsKwh: number
  unmeteredKwh: number
  missingKwh: number
  tolerancePct: number
  toleranceKwh: number
  addsUp: boolean
  /** Readings are pro-rated to this date (the bill's read date). */
  alignedTo: string
  /** True when the gap is being split by kWh until fixed. */
  gapRuleApplied: boolean
}

export interface RateNote {
  chargedRate: number
  billRate: number
  difference: number
}

export interface HouseholdMonth extends Household {
  reading?: Reading
  share?: Share
}

export interface MonthView {
  bill: Bill | null
  households: HouseholdMonth[]
  check: CheckSummary | null
  rateNote: RateNote | null
}

export interface UsagePoint {
  date: string
  /** Days since the bill's read date. */
  day: number
  kwhUsed: number
  kind: 'bill' | 'photo'
}

export interface UsageView {
  householdId: string
  name: string
  mode: 'own' | 'shared'
  /** 1 = rough guess from last bill, 2 = mid-month projection. */
  stage: 1 | 2 | 3
  readDate: string
  nextReadDate: string
  totalDays: number
  points: UsagePoint[]
  forecast: { kwh: number; low: number; high: number }
  /** Own enrolled meter only. */
  lifeline?: {
    limitKwh: number
    pesoAtForecast: number
    pesoUnderLimit: number
    /** Discount tiers; the UI falls back to the 2026 DSWD tiers when absent. */
    tiers?: { upTo: number; pctOff: number }[]
  }
  /** Shared meter only: V / K, pesos off the share per kWh saved. */
  perKwhValue?: number
  rate: { perKwh: number; month: string; source: string; isFallback: boolean; fallbackNote?: string }
  spikePct?: number
  actions: { icon: 'plug' | 'clock' | 'snowflake'; text: string }[]
}

export interface TenantView {
  householdId: string
  name: string
  share: number
  kwh: number
  askedToPay: number | null
  aboveBillRate: number | null
  perKwhValue: number
  expiresAt: string
}
