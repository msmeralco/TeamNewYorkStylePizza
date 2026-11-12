import type { CompoundState } from "@/types";
import { fail, ok, readJson } from "@/lib/http";
import { checkCompound } from "@/lib/engine/check";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson<{ state?: CompoundState }>(req);
  if (body instanceof Response) return body;
  const s = body?.state;
  if (
    !s || typeof s !== "object" || !s.bill || typeof s.bill.kwh !== "number" ||
    !Array.isArray(s.meters) || !Array.isArray(s.previousReadings) || !Array.isArray(s.currentReadings)
  ) {
    return fail(400, "bad_state", "The request needs a state with a bill, meters and readings.", "Start from GET /api/sample and send {\"state\": ...}.");
  }
  if (s.bill.kwh <= 0) {
    return fail(422, "bad_bill_kwh", "The bill kWh must be above zero.", "Check the bill scan and fix the kWh.");
  }
  return ok(checkCompound(s));
}
