// Tenant view: what one household sees from a shared link. Pure, no I/O.
import type { CompoundState, TenantView } from "@/types";
import { addDays } from "./dates";
import { rateCheck } from "./rateCheck";
import { computeSplit } from "./split";

export const TENANT_FOOTER = "Computed by Kahati. Not a Meralco statement.";

export class TenantError extends Error {
  constructor(
    public code: "unknown_household",
    message: string,
    public next: string,
  ) {
    super(message);
    this.name = "TenantError";
  }
}

/** End of the next billing period: nextReadDate + 7 days at 23:59:59 Manila time. */
export function tenantExpiry(nextReadDate: string): string {
  return `${addDays(nextReadDate, 7)}T23:59:59+08:00`;
}

export function buildTenantView(state: CompoundState, householdId: string, _now: Date = new Date()): TenantView {
  const h = state.households.find((x) => x.id === householdId);
  if (!h) throw new TenantError("unknown_household", "That household is not in this compound.", "Pick a household from the list.");
  const split = computeSplit(state);
  const share = split.shares.find((s) => s.householdId === householdId);
  if (!share) throw new TenantError("unknown_household", "That household is not in this compound.", "Pick a household from the list.");
  const { bill } = state;
  return {
    household: { id: h.id, displayName: h.displayName, label: h.label },
    share,
    rateCheck: rateCheck(state, householdId),
    perKwhValue: split.perKwhValue,
    bill: {
      periodStart: bill.periodStart,
      periodEnd: bill.periodEnd,
      kwh: bill.kwh,
      amount: bill.amount,
      accountLast4: bill.accountLast4,
    },
    expiresAt: tenantExpiry(bill.nextReadDate),
    footer: TENANT_FOOTER,
    rateLineVisibleToOrganizer: false,
  };
}
