// The seeded "Randomize" for a demo month: new readings (and optionally serials) that stay consistent.
import { rng } from "./draw/common";
import { type BillValues, CHEAT_KWH, DEFAULT_BILL, DEFAULT_HOUSEHOLDS, DEFAULT_OWN, type HouseholdRow, type MonthMeta, type OwnMeterRow, deriveBill } from "./model";

// Mirrors src/shared/labMonth.ts (the version the app runs). The lab only uses the tiny `#lab=` link when the
// month built here is identical to buildLabMonth's, so any drift falls back to the full link instead of breaking.

/** A lab month always starts from the sample (names, serials, dates), keeping the current 4Ps flags and the bill's look. */
export function randomizeFromSample(seed: number, meta: MonthMeta, hh: HouseholdRow[], own: OwnMeterRow, bill: BillValues) {
  const baseHh = DEFAULT_HOUSEHOLDS.map((d) => ({ ...d, fourPs: hh.find((h) => h.id === d.id)?.fourPs ?? d.fourPs }));
  const baseOwn = { ...DEFAULT_OWN, fourPs: own.fourPs };
  const baseBill = { ...DEFAULT_BILL, layout: bill.layout, showBreakdown: bill.showBreakdown };
  return randomizeMonth(seed, { ...meta, autoBill: true }, baseHh, baseOwn, baseBill);
}

export function randomizeMonth(seed: number, meta: MonthMeta, hh: HouseholdRow[], own: OwnMeterRow, bill: BillValues) {
  const r = rng(seed * 2654435761 + 97);
  const int = (a: number, b: number) => Math.floor(a + r() * (b - a + 1));
  const lo = Math.max(1, Math.min(meta.useMin, meta.useMax));
  const hi = Math.max(meta.useMin, meta.useMax);
  const used = new Set<string>([bill.meterNo]);
  const serial = (prefix: string, digits: number, min: number, max: number) => {
    for (;;) {
      const s = `${prefix}${String(int(min, max)).padStart(digits, "0")}`;
      if (!used.has(s)) return used.add(s), s;
    }
  };
  const newHh = hh.map((h) => {
    const previous = int(1000, 98000);
    const current = previous + int(lo, hi);
    return { ...h, previous, current, serial: meta.newSerials ? serial("SM-0", 3, 100, 999) : h.serial };
  });
  const readDay = int(1000, 98000);
  const newOwn = { ...own, readDay, day18: readDay + int(15, 45), serial: meta.newSerials ? serial("MM-", 4, 1000, 9999) : own.serial };
  const sum = newHh.reduce((s, h) => s + h.current - h.previous, 0);
  const history = Array.from({ length: 12 }, (_, i) => (i === 11 ? sum : Math.max(10, Math.round(sum * (0.8 + r() * 0.45)))));
  const newBill = deriveBill({ ...bill, previousReading: int(10000, 90000), history }, newHh);
  // the cheat goes on a household that used more than the gap
  const cheat = meta.cheat ? (newHh.filter((h) => h.current - h.previous > CHEAT_KWH)[int(0, 3)] ?? newHh.find((h) => h.current - h.previous > CHEAT_KWH))?.id ?? null : null;
  return { hh: newHh, own: newOwn, bill: newBill, meta: { ...meta, seed, name: `Lab #${seed}`, cheat } };
}
