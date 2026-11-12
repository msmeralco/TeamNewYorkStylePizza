import { isValidDate } from "@/lib/engine/dates";
import { ForecastError, forecast } from "@/lib/engine/forecast";
import { fail, ok, readJson } from "@/lib/http";
import type { CompoundState } from "@/types";

export const dynamic = "force-dynamic";

interface Body {
  state?: CompoundState;
  householdId?: string;
  asOf?: string;
  ownMeter?: boolean;
  history?: { cdd: number; kwh: number }[];
  nextPeriodCdd?: number;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object") {
    return fail(400, "bad_body", "The request body must be a JSON object.", "Send {state, householdId}.");
  }
  const { state, householdId, asOf, ownMeter, history, nextPeriodCdd } = body;
  if (!state || typeof state !== "object" || !state.compound || !state.bill || !Array.isArray(state.households) || !Array.isArray(state.meters)) {
    return fail(400, "bad_state", "The state is missing or incomplete.", "Send the compound state from GET /api/sample.");
  }
  if (state.compound.mode !== "single" && state.compound.mode !== "shared") {
    return fail(400, "bad_state", "The compound mode must be single or shared.", "Send the compound state from GET /api/sample.");
  }
  if (!Array.isArray(state.previousReadings) || !Array.isArray(state.currentReadings)) {
    return fail(400, "bad_state", "The state needs previousReadings and currentReadings lists.", "Send the compound state from GET /api/sample.");
  }
  if (typeof householdId !== "string" || householdId === "") {
    return fail(400, "bad_household", "householdId is required.", "Send the id of one household in the state.");
  }
  if (asOf !== undefined && !isValidDate(asOf)) {
    return fail(400, "bad_as_of", "asOf is not a date.", "Use YYYY-MM-DD, for example 2026-11-18.");
  }
  if (ownMeter !== undefined && typeof ownMeter !== "boolean") {
    return fail(400, "bad_own_meter", "ownMeter must be true or false.", "Send true for a household on its own meter.");
  }
  if (history !== undefined && (!Array.isArray(history) || history.some((p) => !p || !isNum(p.cdd) || !isNum(p.kwh)))) {
    return fail(400, "bad_history", "history must be a list of {cdd, kwh} numbers.", "Send one point per past period.");
  }
  if (nextPeriodCdd !== undefined && !isNum(nextPeriodCdd)) {
    return fail(400, "bad_cdd", "nextPeriodCdd must be a number.", "Send the expected cooling degree days for the period.");
  }
  try {
    return ok(forecast({ state, householdId, asOf, ownMeter, history, nextPeriodCdd }));
  } catch (e) {
    if (e instanceof ForecastError) return fail(e.status, e.code, e.message, e.next);
    return fail(422, "bad_state", "The state could not be read.", "Send the compound state from GET /api/sample.");
  }
}
