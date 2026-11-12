import { rateCheck } from "@/lib/engine/rateCheck";
import { SplitError } from "@/lib/engine/split";
import { fail, ok, readJson } from "@/lib/http";
import { validateState } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ state?: unknown; householdId?: unknown }>(req);
    if (body instanceof Response) return body;
    const v = validateState(body?.state);
    if (!v.ok) return fail(400, v.code, v.message, v.next);
    if (typeof body?.householdId !== "string") {
      return fail(400, "bad_request", "The request needs state and householdId.", "Send {state, householdId}.");
    }
    const result = rateCheck(v.state, body.householdId);
    if (!result) {
      return fail(404, "no_charged_rate", "No charged rate was entered for this household.", "Enter the rate this household was asked to pay.");
    }
    return ok(result);
  } catch (e) {
    if (e instanceof SplitError) return fail(422, e.code, e.message, e.next);
    return fail(500, "internal", "Something went wrong on our side.", "Try again.");
  }
}
