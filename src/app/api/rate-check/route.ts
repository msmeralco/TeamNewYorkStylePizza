import { rateCheck } from "@/lib/engine/rateCheck";
import { SplitError } from "@/lib/engine/split";
import { fail, ok, readJson } from "@/lib/http";
import type { CompoundState } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson<{ state?: CompoundState; householdId?: string }>(req);
  if (body instanceof Response) return body;
  const state = body?.state;
  if (
    !state ||
    !state.bill ||
    !Array.isArray(state.households) ||
    !Array.isArray(state.meters) ||
    !Array.isArray(state.chargedRates) ||
    typeof body.householdId !== "string"
  ) {
    return fail(400, "bad_request", "The request needs state and householdId.", "Send {state, householdId}.");
  }
  try {
    const result = rateCheck(state, body.householdId);
    if (!result) {
      return fail(404, "no_charged_rate", "No charged rate was entered for this household.", "Enter the rate this household was asked to pay.");
    }
    return ok(result);
  } catch (e) {
    if (e instanceof SplitError) return fail(422, e.code, e.message, e.next);
    throw e;
  }
}
