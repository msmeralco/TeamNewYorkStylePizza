import { computeSplit, SplitError } from "@/lib/engine/split";
import { fail, ok, readJson } from "@/lib/http";
import type { CompoundState } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson<{ state?: CompoundState }>(req);
  if (body instanceof Response) return body;
  const state = body?.state;
  if (!state || !state.bill || !Array.isArray(state.households) || !Array.isArray(state.meters)) {
    return fail(400, "bad_state", "The request needs a state object.", "Send {state} from GET /api/sample.");
  }
  try {
    return ok(computeSplit(state));
  } catch (e) {
    if (e instanceof SplitError) return fail(422, e.code, e.message, e.next);
    throw e;
  }
}
