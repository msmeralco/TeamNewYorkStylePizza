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

export function checkCompound(state: CompoundState, opts: CheckOptions = {}): CheckResult {
  const { bill } = state;
  const usage = householdUsage(state);
  const toleranceKwh = bill.kwh * ADD_UP_TOLERANCE;
  const unmetered = Math.min(Math.max(state.unmeteredKwh || 0, 0), bill.kwh * UNMETERED_CAP);

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
    kwhById.set(u.householdId, kwh);
    metered += kwh;
  }

  const readingsKwh = metered + unmetered;
  const missingKwh = bill.kwh - readingsKwh;
  const status = Math.abs(missingKwh) > toleranceKwh ? "gap" : "ok";

  const fix = suggestDigitFix({ candidates, gapKwh: missingKwh, toleranceKwh });

  const households: HouseholdCheck[] = usage.map((u) => {
    const meter = state.meters.find((m) => m.id === u.meterId);
    const flags: string[] = [];
    const kwh = kwhById.get(u.householdId) ?? 0;

    if (!u.current) {
      flags.push("Reading needs a second look: no reading yet. Take a photo of the meter.");
    } else {
      if (u.previous && u.current.value < u.previous.value) {
        flags.push("Reading needs a second look: it is below the previous reading.");
      }
      if (u.current.serialRead && meter && u.current.serialRead !== meter.serial) {
        flags.push("Reading needs a second look: the meter serial does not match.");
      }
      if (u.current.source !== "bill") {
        const cap = manilaDay(u.current.capturedAt);
        const before = u.previous ? new Date(u.current.capturedAt).getTime() < new Date(u.previous.capturedAt).getTime() : false;
        const late = cap - manilaDay(bill.readDate) > STALE_DAYS;
        if (before || late) flags.push("Reading needs a second look: Photo time is outside this billing period.");
      }
      const prevKwh = opts.previousKwh?.[u.householdId];
      if (prevKwh && prevKwh > 0 && u.previous && Math.abs(kwh - prevKwh) / prevKwh > PATTERN_LIMIT) {
        flags.push("Reading needs a second look: usage is far from the usual pattern.");
      }
    }

    const mine = fix && fix.householdId === u.householdId ? fix : null;
    return {
      householdId: u.householdId,
      kwh,
      chip: u.current?.source === "typed" ? "typed" : "verified",
      flags,
      suggestion: mine ? { from: mine.from, to: mine.to, message: mine.message } : null,
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
    alignedTo: `Reading dates aligned to the bill: ${shortDate(bill.readDate)}`,
    gapRule: status === "gap" ? GAP_RULE : null,
    headline,
  };
}
