// labMonth.ts: the Kahati Lab's month generator, shared byte-for-byte with the Kahati app (web/src/lib/labMonth.ts).
//
// A lab month is fully described by `#lab=<seed>.<min>.<max>.<flags>` (see encodeLabLink / parseLabLink).
// buildLabMonth(templates, opts) turns that into the same { v: 1, compound, bau } scenario the lab prints,
// starting from the two GET /api/sample states. Deterministic: its own PRNG, no Math.random, no Date,
// no locale formatting. No imports.
//
// If you change anything here, change it in both copies and regenerate labMonth.vectors.json.

/* eslint-disable @typescript-eslint/no-explicit-any */
type State = any;

export interface LabMonthOpts {
  seed: number;
  minKwh: number;
  maxKwh: number;
  /** 18 kWh gap demo: one household's last-month reading is given 18 kWh too high. */
  gap: boolean;
  /** New random serials (SM-0xxx for sub-meters, MM-xxxx for the own meter). */
  newSerials: boolean;
  /** 4Ps flags in order A, B, C, D, Bautista. */
  fourPs: [boolean, boolean, boolean, boolean, boolean];
}

export const LAB_GAP_KWH = 18;

/** The sample bill's charges for 180 kWh. Per-kWh lines scale with kWh; the fixed 5.00 + 16.38 stay. */
const SAMPLE_KWH = 180;
const SAMPLE_CHARGES = {
  generation: 1690, transmission: 230, systemLoss: 150, distributionCharge: 330,
  fixedMetering: 5, meteringPerKwh: 19.55, fixedSupply: 16.38, supplyPerKwh: 29.07,
  seniorCitizen: 0.01, taxes: 190, universal: 26.89, fitAll: 23.47, geaAll: 0, lifeline: 0.7,
};
const PER_KWH = ["generation", "transmission", "systemLoss", "distributionCharge", "meteringPerKwh", "supplyPerKwh", "seniorCitizen", "taxes", "universal", "fitAll", "geaAll", "lifeline"] as const;
/** The lab's printed account number ends in these 4 digits; the main meter's serial. */
const LAB_ACCOUNT_LAST4 = "5678";
const LAB_MASTER_SERIAL = "MM-7781";
const HOUSEHOLD_IDS = ["hA", "hB", "hC", "hD"] as const;

/** xorshift32, returns [0, 1) in steps of 1e-6. */
export function labRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

/** "YYYY-MM-DD" + n days, without Date. */
function plusDays(iso: string, n: number) {
  let [y, m, d] = iso.split("-").map(Number);
  const dim = (yy: number, mm: number) => [31, (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  d += n;
  while (d > dim(y, m)) {
    d -= dim(y, m);
    m++;
    if (m > 12) (m = 1), y++;
  }
  return `${y}-${pad(m, 2)}-${pad(d, 2)}`;
}

/** The 12 "YYYY-MM" months ending at periodEnd's month, oldest first. */
function historyMonths(periodEnd: string) {
  const [y, m] = periodEnd.split("-").map(Number);
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const k = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(k / 12)}-${pad((k % 12) + 1, 2)}`);
  }
  return out;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function buildLabMonth(templates: { compound: State; bau: State }, opts: LabMonthOpts): { v: 1; compound: State; bau: State } {
  const c: State = clone(templates.compound);
  const bau: State = clone(templates.bau);
  const r = labRng(opts.seed * 2654435761 + 97);
  const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
  const lo = Math.max(1, Math.min(opts.minKwh, opts.maxKwh));
  const hi = Math.max(opts.minKwh, opts.maxKwh);
  const used = new Set<string>([LAB_MASTER_SERIAL]);
  const serial = (prefix: string, digits: number, min: number, max: number) => {
    for (;;) {
      const s = `${prefix}${pad(int(min, max), digits)}`;
      if (!used.has(s)) return used.add(s), s;
    }
  };

  // 1. Readings and serials (this exact order of random draws).
  const hh = HOUSEHOLD_IDS.map((id, i) => {
    const meterId = "m" + id.slice(1);
    const tplSerial = c.meters.find((m: State) => m.id === meterId).serial as string;
    const previous = int(1000, 98000);
    const current = previous + int(lo, hi);
    return { id, meterId, fourPs: opts.fourPs[i], previous, current, serial: opts.newSerials ? serial("SM-0", 3, 100, 999) : tplSerial };
  });
  const readDay = int(1000, 98000);
  const day18 = readDay + int(15, 45);
  const ownSerial = opts.newSerials ? serial("MM-", 4, 1000, 9999) : (bau.meters[0].serial as string);
  const kwh = hh.reduce((s, h) => s + h.current - h.previous, 0);
  const history = Array.from({ length: 12 }, (_, i) => (i === 11 ? kwh : Math.max(10, Math.round(kwh * (0.8 + r() * 0.45)))));
  const billPrevious = int(10000, 90000);
  const withGap = hh.filter((h) => h.current - h.previous > LAB_GAP_KWH);
  const gapId = opts.gap ? (withGap[int(0, 3)] ?? withGap[0])?.id ?? null : null;

  // 2. The bill: per-kWh lines = sample rate x kWh, fixed charges kept, amount = sum of lines.
  const ch: Record<string, number> = { ...SAMPLE_CHARGES };
  for (const k of PER_KWH) ch[k] = r2((SAMPLE_CHARGES[k] / SAMPLE_KWH) * kwh);
  const distTotal = r2(ch.distributionCharge + ch.fixedMetering + ch.meteringPerKwh + ch.fixedSupply + ch.supplyPerKwh);
  const amount = r2(ch.generation + ch.transmission + ch.systemLoss + distTotal + ch.seniorCitizen + ch.taxes + ch.universal + ch.fitAll + ch.geaAll + ch.lifeline);
  const name = `Lab #${opts.seed}`;
  const b = c.bill;
  const months = historyMonths(b.periodEnd);

  // 3. Compound state (template + edits).
  c.compound = { ...c.compound, displayName: name };
  c.households = c.households.map((orig: State) => {
    const h = hh.find((x) => x.id === orig.id);
    return h ? { ...orig, fourPs: h.fourPs } : orig;
  });
  c.meters = c.meters.map((m: State) => {
    if (m.id === "mMaster") return { ...m, serial: LAB_MASTER_SERIAL };
    const h = hh.find((x) => x.meterId === m.id);
    return h ? { ...m, serial: h.serial } : m;
  });
  c.bill = {
    ...b,
    kwh,
    amount,
    lines: {
      generation: r2(ch.generation),
      transmission: r2(ch.transmission),
      systemLoss: r2(ch.systemLoss),
      distribution: r2(ch.distributionCharge),
      supplyMetering: r2(ch.fixedMetering + ch.meteringPerKwh + ch.fixedSupply + ch.supplyPerKwh),
      taxes: r2(ch.taxes),
      other: r2(ch.seniorCitizen + ch.universal + ch.fitAll + ch.geaAll + ch.lifeline),
    },
    fixedCharges: r2(ch.fixedMetering + ch.fixedSupply),
    previousReading: billPrevious,
    presentReading: billPrevious + kwh,
    history: months.map((month, i) => ({ month, kwh: history[i] })),
    accountLast4: LAB_ACCOUNT_LAST4,
    source: "typed",
  };
  c.previousReadings = hh.map((h) => ({
    id: `r${h.id.slice(1)}0`, meterId: h.meterId, value: h.previous + (gapId === h.id ? LAB_GAP_KWH : 0), capturedAt: `${b.periodStart}T09:00:00+08:00`,
    source: "typed", confidence: null, confirmed: true, serialRead: h.serial,
  }));
  c.currentReadings = hh.map((h) => ({
    id: `r${h.id.slice(1)}1`, meterId: h.meterId, value: h.current, capturedAt: `${b.readDate}T09:00:00+08:00`,
    source: "typed", confidence: null, confirmed: true, serialRead: h.serial,
  }));

  // 4. Bautista (own meter) state.
  bau.compound = { ...bau.compound, displayName: `${name} (own meter)` };
  bau.households = bau.households.map((h: State) => ({ ...h, fourPs: opts.fourPs[4] }));
  bau.meters = bau.meters.map((m: State) => ({ ...m, serial: ownSerial }));
  const rd = bau.bill.readDate as string;
  const ownMeterId = bau.meters[0].id as string;
  bau.previousReadings = [{ id: "rBa0", meterId: ownMeterId, value: readDay, capturedAt: rd, source: "bill", confidence: null, confirmed: true }];
  bau.currentReadings = [
    { id: "rBa1", meterId: ownMeterId, value: day18, capturedAt: `${plusDays(rd, 18)}T08:30:00+08:00`, source: "typed", confidence: null, confirmed: true, serialRead: ownSerial },
  ];
  bau.bill = { ...bau.bill, presentReading: readDay, previousReading: readDay - bau.bill.kwh };

  return { v: 1, compound: c, bau };
}

/** "<seed>.<min>.<max>.<flags>": flags = "g" (gap) + "s" (new serials) + "p" + 4Ps mask (bit 0 = A … bit 4 = Bautista). */
export function encodeLabLink(o: LabMonthOpts) {
  const mask = o.fourPs.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
  return `${o.seed}.${o.minKwh}.${o.maxKwh}.${o.gap ? "g" : ""}${o.newSerials ? "s" : ""}p${mask}`;
}

/** Parses the part after "#lab=". Returns null if it isn't a lab month. */
export function parseLabLink(v: string): LabMonthOpts | null {
  const m = /^(\d{1,9})\.(\d{1,4})\.(\d{1,4})\.(g?)(s?)p(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const mask = Number(m[6]);
  if (mask > 31) return null;
  return {
    seed: Number(m[1]),
    minKwh: Number(m[2]),
    maxKwh: Number(m[3]),
    gap: m[4] === "g",
    newSerials: m[5] === "s",
    fourPs: [0, 1, 2, 3, 4].map((i) => (mask & (1 << i)) !== 0) as LabMonthOpts["fourPs"],
  };
}
