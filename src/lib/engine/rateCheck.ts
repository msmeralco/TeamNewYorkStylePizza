// Rate check: compare a charged per-kWh rate with the bill's effective rate. Neutral words only.
import { RATE_CHECK_THRESHOLD } from "@/data/tables";
import type { CompoundState, RateCheck } from "@/types";
import { round2 } from "./money";
import { computeSplit } from "./split";

const peso = (n: number) => `₱${n.toFixed(2)}`;

export function rateCheck(state: CompoundState, householdId: string): RateCheck | null {
  const charged = state.chargedRates.find((c) => c.householdId === householdId);
  if (!charged) return null;
  const split = computeSplit(state);
  const share = split.shares.find((s) => s.householdId === householdId);
  if (!share) return null;

  const askedAmount = charged.perKwh * share.kwh;
  const aboveBy = round2(askedAmount - share.amount);
  const flagged = charged.perKwh > split.effectiveRate * (1 + RATE_CHECK_THRESHOLD);
  const below = charged.perKwh < split.effectiveRate * (1 - RATE_CHECK_THRESHOLD);
  const kwhText = String(Math.round(share.kwh * 100) / 100);
  const message = flagged
    ? aboveBy > 0
      ? `${peso(charged.perKwh)} charged, ${peso(split.effectiveRate)} on the bill. That is ${peso(aboveBy)} above the bill's rate on a ${kwhText} kWh share.`
      : `${peso(charged.perKwh)} charged, ${peso(split.effectiveRate)} on the bill. That is ${peso(Math.abs(aboveBy))} below your share.`
    : below
      ? "The charged rate is below the bill's rate."
      : "The charged rate matches the bill's rate.";

  return {
    householdId,
    chargedRate: charged.perKwh,
    effectiveRate: split.effectiveRate,
    kwh: share.kwh,
    askedAmount,
    shareAmount: share.amount,
    aboveBy,
    flagged,
    message,
  };
}
