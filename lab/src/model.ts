// Data model for the stress lab. Sample or invented values only.

export interface HouseholdRow {
  id: string; // hA..hD (matches the API's sample ids)
  meterId: string; // mA..mD
  label: string; // A..D
  name: string;
  fourPs: boolean;
  language: "en" | "fil";
  serial: string;
  previous: number;
  current: number;
}

export interface OwnMeterRow {
  id: string; // hBautista
  meterId: string; // mBautista
  name: string;
  serial: string;
  readDay: number; // reading on the bill's read date
  day18: number; // mid-period photo reading
  fourPs: boolean;
  language: "en" | "fil";
}

export interface Charges {
  remainingBalance: number;
  generation: number;
  transmission: number;
  systemLoss: number;
  distributionCharge: number;
  fixedMetering: number;
  meteringPerKwh: number;
  fixedSupply: number;
  supplyPerKwh: number;
  seniorCitizen: number;
  taxes: number;
  universal: number;
  fitAll: number;
  geaAll: number;
  lifeline: number;
}

export interface BillValues {
  customerName: string;
  address1: string;
  address2: string;
  utilityName: string;
  utilityAddress: string;
  invoiceNo: string;
  accountNo: string; // "12345678"
  meterNo: string;
  avgTemp: number;
  /** Print the distribution breakdown (fixed metering 5.00, fixed supply 16.38, per-kWh rows). Not on the printed prop. */
  showBreakdown: boolean;
  /** "preview" = print/sample_bill_editable_preview.pdf (default), "classic" = print/sample_bill.png. */
  layout: "preview" | "classic";
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
  billDate: string;
  readDate: string;
  nextReadDate: string;
  dueDate: string;
  previousReading: number;
  presentReading: number;
  kwhOverride: number | null;
  multiplier: number;
  charges: Charges;
  totalOverride: number | null;
  /** 12 months ending at the period-end month. */
  history: number[];
}

export const DEFAULT_HOUSEHOLDS: HouseholdRow[] = [
  { id: "hA", meterId: "mA", label: "A", name: "Reyes", fourPs: false, language: "en", serial: "SM-0213", previous: 3110, current: 3162 },
  { id: "hB", meterId: "mB", label: "B", name: "Santos", fourPs: true, language: "fil", serial: "SM-0214", previous: 4527, current: 4572 },
  { id: "hC", meterId: "mC", label: "C", name: "Dela Cruz", fourPs: true, language: "fil", serial: "SM-0215", previous: 2200, current: 2238 },
  { id: "hD", meterId: "mD", label: "D", name: "Garcia", fourPs: true, language: "en", serial: "SM-0216", previous: 5010, current: 5055 },
];

export const DEFAULT_OWN: OwnMeterRow = {
  id: "hBautista",
  meterId: "mBautista",
  name: "Bautista",
  serial: "MM-5520",
  readDay: 12520,
  day18: 12552,
  fourPs: true,
  language: "fil",
};

export const DEFAULT_BILL: BillValues = {
  customerName: "Ramon Villanueva (sample)",
  address1: "14 Sample Compound, Barangay Halimbawa,",
  address2: "Quezon City, Metro Manila",
  utilityName: "Meralco",
  utilityAddress: "1 Sample Avenue, Metro Manila",
  invoiceNo: "12345678",
  accountNo: "12345678",
  meterNo: "MM-7781",
  avgTemp: 29.4,
  showBreakdown: true,
  layout: "preview",
  periodStart: "2026-09-30",
  periodEnd: "2026-10-31",
  billDate: "2026-11-03",
  readDate: "2026-10-31",
  nextReadDate: "2026-11-30",
  dueDate: "2026-11-14",
  previousReading: 12340,
  presentReading: 12520,
  kwhOverride: null,
  multiplier: 1,
  charges: {
    remainingBalance: 0,
    generation: 1690,
    transmission: 230,
    systemLoss: 150,
    distributionCharge: 330,
    fixedMetering: 5,
    meteringPerKwh: 19.55,
    fixedSupply: 16.38,
    supplyPerKwh: 29.07,
    seniorCitizen: 0.01,
    taxes: 190,
    universal: 26.89,
    fitAll: 23.47,
    geaAll: 0,
    lifeline: 0.7,
  },
  totalOverride: null,
  history: [168, 172, 160, 164, 190, 236, 248, 214, 197, 191, 185, 180],
};

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function billKwh(b: BillValues): number {
  if (b.kwhOverride != null) return b.kwhOverride;
  return (b.presentReading - b.previousReading) * (b.multiplier || 1);
}

/** The seven lines the app keeps, derived the same way the print README maps them. */
export function billLines(b: BillValues) {
  const c = b.charges;
  return {
    generation: r2(c.generation),
    transmission: r2(c.transmission),
    systemLoss: r2(c.systemLoss),
    distribution: r2(c.distributionCharge),
    supplyMetering: r2(c.fixedMetering + c.meteringPerKwh + c.fixedSupply + c.supplyPerKwh),
    taxes: r2(c.taxes),
    other: r2(c.seniorCitizen + c.universal + c.fitAll + c.geaAll + c.lifeline),
  };
}

export function distributionTotal(b: BillValues) {
  const c = b.charges;
  return r2(c.distributionCharge + c.fixedMetering + c.meteringPerKwh + c.fixedSupply + c.supplyPerKwh);
}

export function computedTotal(b: BillValues) {
  const c = b.charges;
  return r2(
    c.generation + c.transmission + c.systemLoss + distributionTotal(b) + c.seniorCitizen + c.taxes + c.universal + c.fitAll + c.geaAll + c.lifeline,
  );
}

/** True when the printed bill shows the fixed metering / fixed supply lines. */
export const printsBreakdown = (b: BillValues) => b.layout === "classic" || b.showBreakdown;

/** Merge a stored bill (possibly from an older version) over the defaults. */
export function normalizeBill(b: Partial<BillValues>): BillValues {
  return { ...DEFAULT_BILL, ...b, charges: { ...DEFAULT_BILL.charges, ...(b.charges ?? {}) } };
}

/** "Charges for this billing period" (the bill amount the app keeps). */
export function billTotal(b: BillValues) {
  return b.totalOverride != null ? b.totalOverride : computedTotal(b);
}

export function fixedCharges(b: BillValues) {
  return r2(b.charges.fixedMetering + b.charges.fixedSupply);
}

/** "YYYY-MM" for each of the 12 history slots, oldest first, ending at periodEnd's month. */
export function historyMonths(b: BillValues): string[] {
  const [y, m] = b.periodEnd.split("-").map(Number);
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** What the reader should return for a generated bill. */
export function expectedBillScan(b: BillValues) {
  const months = historyMonths(b);
  return {
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    readDate: b.readDate,
    nextReadDate: b.nextReadDate,
    kwh: billKwh(b),
    amount: billTotal(b),
    lines: billLines(b),
    fixedCharges: fixedCharges(b),
    previousReading: b.previousReading,
    presentReading: b.presentReading,
    accountLast4: b.accountNo.replace(/\D/g, "").slice(-4),
    history: months.map((month, i) => ({ month, kwh: b.history[i] })),
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${MON[m - 1]} ${y}`;
}
export const MONTHS = MON;

export function peso(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Keep the bill's readings consistent with the households: bill kWh = sum of sub-meter kWh. */
export function syncBillFromHouseholds(b: BillValues, hh: HouseholdRow[]): BillValues {
  const sum = hh.reduce((s, h) => s + Math.max(0, h.current - h.previous), 0);
  return { ...b, kwhOverride: null, presentReading: b.previousReading + sum, history: [...b.history.slice(0, 11), sum] };
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}

// ---------------- month set-up (the main flow) ----------------

export interface MonthMeta {
  seed: number;
  name: string; // shown by the app as "Loaded scenario: <name>"
  useMin: number;
  useMax: number;
  newSerials: boolean;
  /** Household whose last-month reading the app gets 18 kWh too high (gap demo), or null. */
  cheat: string | null;
  /** Work the bill out from the households' kWh automatically. */
  autoBill: boolean;
}

export const CHEAT_KWH = 18;

export const DEFAULT_META: MonthMeta = { seed: 0, name: "Lab sample", useMin: 20, useMax: 80, newSerials: false, cheat: null, autoBill: true };

const PER_KWH_KEYS = [
  "generation", "transmission", "systemLoss", "distributionCharge", "meteringPerKwh", "supplyPerKwh",
  "seniorCitizen", "taxes", "universal", "fitAll", "geaAll", "lifeline",
] as const;

/** Per-kWh rates taken from the sample bill (180 kWh). */
export const SAMPLE_RATES: Record<(typeof PER_KWH_KEYS)[number], number> = Object.fromEntries(
  PER_KWH_KEYS.map((k) => [k, DEFAULT_BILL.charges[k] / 180]),
) as Record<(typeof PER_KWH_KEYS)[number], number>;

export const householdKwh = (hh: HouseholdRow[]) => hh.reduce((s, h) => s + (h.current - h.previous), 0);

/** Bill kWh = the households' use; every per-kWh line = sample rate × kWh; fixed 5.00 + 16.38 kept; amount = sum of lines. */
export function deriveBill(b: BillValues, hh: HouseholdRow[]): BillValues {
  const kwh = Math.max(0, householdKwh(hh));
  const charges = { ...b.charges, remainingBalance: 0 };
  for (const k of PER_KWH_KEYS) charges[k] = r2(SAMPLE_RATES[k] * kwh);
  const history = [...b.history];
  history[11] = kwh;
  return { ...b, kwhOverride: null, totalOverride: null, multiplier: 1, presentReading: b.previousReading + kwh, charges, history };
}
