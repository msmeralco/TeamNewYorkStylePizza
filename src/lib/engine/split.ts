// Fair share split and the "What you pay for" breakdown. Pure, no I/O.
import { UNMETERED_CAP } from "@/data/tables";
import { LINE_KEYS, type CompoundState, type Lines, type Share, type SplitResult } from "@/types";
import { largestRemainder } from "./money";
import { householdUsage } from "./readings";

export class SplitError extends Error {
  constructor(
    public code: "missing_reading" | "negative_kwh" | "no_usage" | "bad_bill",
    message: string,
    public next: string,
  ) {
    super(message);
    this.name = "SplitError";
  }
}

export function computeSplit(state: CompoundState): SplitResult {
  const { bill, households } = state;
  const N = households.length;
  if (N === 0) throw new SplitError("no_usage", "There are no households to split between.", "Add at least one household.");

  if (!Number.isFinite(bill.kwh) || bill.kwh <= 0 || !Number.isFinite(bill.amount) || !Number.isFinite(bill.fixedCharges)) {
    throw new SplitError("bad_bill", "The bill kWh must be above zero and the amounts must be numbers.", "Check the bill scan and fix the numbers.");
  }

  // A household may have several meters: add them up. Meters of unknown households are ignored.
  const usage = householdUsage(state);
  const kOf = new Map<string, number>();
  for (const h of households) {
    const mine = usage.filter((x) => x.householdId === h.id);
    if (mine.length === 0 || mine.some((u) => u.kwh === null)) {
      throw new SplitError("missing_reading", "A reading is missing, so the bill cannot be split yet.", "Scan or type the missing reading");
    }
    if (mine.some((u) => (u.kwh as number) < 0)) {
      throw new SplitError("negative_kwh", "A reading is lower than last month's.", "Check the reading and scan or type it again");
    }
    kOf.set(h.id, mine.reduce((a, u) => a + (u.kwh as number), 0));
  }

  const F = bill.fixedCharges;
  const V = bill.amount - F;
  const unmetered = Math.min(Math.max(state.unmeteredKwh || 0, 0), UNMETERED_CAP * bill.kwh);
  const D = [...kOf.values()].reduce((a, b) => a + b, 0) + unmetered;
  if (D <= 0) throw new SplitError("no_usage", "No usage was recorded this period.", "Scan or type this month's readings");

  const raw = households.map((h) => {
    const kwh = (kOf.get(h.id) as number) + unmetered / N;
    const f = kwh / D;
    const breakdown = {} as Lines;
    for (const key of LINE_KEYS) {
      breakdown[key] = key === "supplyMetering" ? (bill.lines[key] - F) * f + F / N : bill.lines[key] * f;
    }
    return { householdId: h.id, kwh, amountExact: F / N + V * f, breakdown };
  });

  const rounded = largestRemainder(raw.map((r) => r.amountExact), bill.amount);
  const shares: Share[] = raw.map((r, i) => ({ ...r, amount: rounded[i], fixedPart: F / N }));

  return {
    billId: bill.id,
    shares,
    total: rounded.reduce((a, b) => a + b, 0),
    unmeteredKwh: unmetered,
    effectiveRate: bill.amount / bill.kwh,
    perKwhValue: V / bill.kwh,
  };
}
