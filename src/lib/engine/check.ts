// Verification ("Check" screen): do the readings add up to the master bill? Pure, no I/O.
import type { CheckResult, CompoundState, HouseholdCheck } from "@/types";
import { ADD_UP_TOLERANCE, UNMETERED_CAP } from "@/data/tables";
import { householdUsage } from "./readings";
import { alignToReadDate, manilaDay } from "./align";
import { suggestDigitFix, type DigitFixCandidate } from "./digitFix";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STALE_DAYS = 7;
const PATTERN_LIMIT = 0.4;
const GAP_RULE = "Until it is fixed, the gap is split by kWh.";

export interface CheckOptions {
  /** Each household's previous-period kWh, when known. Households not listed skip the pattern flag. */
  previousKwh?: Record<string, number>;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

const tidy = (n: number) => String(Number(n.toFixed(1)));

const normSerial = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

const round1 = (n: number) => Math.round(n * 10) / 10 + 0;

export function checkCompound(state: CompoundState, opts: CheckOptions = {}): CheckResult {
  const { bill } = state;
  const known = new Set(state.households.map((h) => h.id));
  // Meters of households that are not in the state are ignored, like in the split.
  const usage = householdUsage(state).filter((u) => known.has(u.householdId));
  const toleranceKwh = bill.kwh * ADD_UP_TOLERANCE;
  const unmetered = Math.min(Math.max(state.unmeteredKwh || 0, 0), bill.kwh * UNMETERED_CAP);

  // One row per meter; a household with several meters adds them up.
  const kwhById = new Map<string, number>();
  let metered = 0;
  const candidates: DigitFixCandidate[] = [];

  for (const u of usage) {
    let kwh = 0;
    if (u.previous && u.current) {
      kwh = alignToReadDate(u.previous, u.current, bill.readDate) - u.previous.value;
      const meter = state.meters.find((m) => m.id === u.meterId);
      if (meter) candidates.push({ householdId: u.householdId, previous: u.previous, current: u.current, digits: meter.digits });
    }
    kwhById.set(u.householdId, (kwhById.get(u.householdId) ?? 0) + kwh);
    metered += kwh;
  }

  const readingsRaw = metered + unmetered;
  const missingRaw = bill.kwh - readingsRaw;
  const readingsKwh = round1(readingsRaw);
  const missingKwh = round1(missingRaw);
  // Decided on the rounded gap so the headline never looks within tolerance while saying gap.
  const status = Math.abs(missingKwh) > toleranceKwh ? "gap" : "ok";

  // The gap is on aligned kWh, so the digit fix aligns its candidate the same way (see digitFix.ts).
  // Only offered when every reading came from a photo: a typed reading means someone chose that number.
  const anyTypedReading = usage.some((u) => u.current?.source === "typed");
  const fix = anyTypedReading ? null : suggestDigitFix({ candidates, gapKwh: missingRaw, toleranceKwh, readDate: bill.readDate });

  const householdIds = state.households.map((h) => h.id);
  const households: HouseholdCheck[] = householdIds.map((householdId) => {
    const mine = usage.filter((u) => u.householdId === householdId);
    const flags: string[] = [];
    // A household with no usable meter at all counts as a missing reading.
    let anyMissing = mine.length === 0;
    let anyTyped = false;
    if (mine.length === 0) flags.push("Reading needs a second look: no meter is linked yet.");

    for (const u of mine) {
      const meter = state.meters.find((m) => m.id === u.meterId);
      const kwh = u.previous && u.current ? alignToReadDate(u.previous, u.current, bill.readDate) - u.previous.value : 0;
      if (!u.current) {
        anyMissing = true;
        flags.push("Reading needs a second look: no reading yet. Take a photo of the meter.");
        continue;
      }
      if (!u.previous) {
        anyMissing = true;
        flags.push("Reading needs a second look: no previous reading to compare with.");
      }
      if (u.current.source === "typed") anyTyped = true;
      if (u.previous && u.current.value < u.previous.value) {
        flags.push("Reading needs a second look: it is below the previous reading.");
      }
      if (u.current.serialRead && meter && normSerial(u.current.serialRead) !== normSerial(meter.serial)) {
        flags.push("Reading needs a second look: the meter serial does not match.");
      }
      if (u.current.source !== "bill") {
        const cap = manilaDay(u.current.capturedAt);
        const before = u.previous ? new Date(u.current.capturedAt).getTime() < new Date(u.previous.capturedAt).getTime() : false;
        const late = cap - manilaDay(bill.readDate) > STALE_DAYS;
        if (before || late) flags.push("Reading needs a second look: Photo time is outside this billing period.");
      }
      const prevKwh = opts.previousKwh?.[householdId];
      if (prevKwh && prevKwh > 0 && u.previous && mine.length === 1 && Math.abs(kwh - prevKwh) / prevKwh > PATTERN_LIMIT) {
        flags.push("Reading needs a second look: usage is far from the usual pattern.");
      }
    }

    const sug = fix && fix.householdId === householdId ? fix : null;
    return {
      householdId,
      kwh: round1(kwhById.get(householdId) ?? 0),
      chip: anyMissing ? "missing" : anyTyped ? "typed" : "verified",
      flags,
      suggestion: sug ? { from: sug.from, to: sug.to, message: sug.message } : null,
    };
  });

  const headline =
    status === "ok"
      ? `Readings add up: ${tidy(readingsKwh)} of ${tidy(bill.kwh)} kWh`
      : missingKwh > 0
        ? `${tidy(missingKwh)} kWh missing`
        : `${tidy(-missingKwh)} kWh extra`;

  return {
    billId: bill.id,
    status,
    billKwh: bill.kwh,
    readingsKwh,
    missingKwh,
    tolerancePct: ADD_UP_TOLERANCE * 100,
    toleranceKwh,
    households,
    complete: households.every((h) => h.chip !== "missing"),
    alignedTo: `Reading dates aligned to the bill: ${shortDate(bill.readDate)}`,
    gapRule: status === "gap" ? GAP_RULE : null,
    headline,
    detail: status === "gap" ? `Readings add up to ${tidy(readingsKwh)} of ${tidy(bill.kwh)} kWh.` : null,
  };
}
