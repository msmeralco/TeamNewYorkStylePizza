import { addDays, daysBetween, isValidDate, toManilaDate, toTimestamp } from "@/lib/engine/dates";
import { ForecastError, forecast } from "@/lib/engine/forecast";
import { fail, ok, readJson } from "@/lib/http";
import { cddForRange, monthlyCdd } from "@/lib/weather";
import type { CompoundState } from "@/types";

export const dynamic = "force-dynamic";

interface Body {
  state?: CompoundState;
  householdId?: string;
  asOf?: string;
  ownMeter?: boolean;
  history?: { cdd: number; kwh: number }[];
  nextPeriodCdd?: number;
  useWeather?: boolean;
}

const MAX_HISTORY = 24;
const DEADLINE_MS = 8000;

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object") {
    return fail(400, "bad_body", "The request body must be a JSON object.", "Send {state, householdId}.");
  }
  const { state, householdId, asOf, ownMeter, history, nextPeriodCdd, useWeather } = body;
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
  if (useWeather !== undefined && typeof useWeather !== "boolean") {
    return fail(400, "bad_use_weather", "useWeather must be true or false.", "Send true to use temperatures for stage 3.");
  }
  try {
    let h = history;
    let cdd = nextPeriodCdd;
    let note: string | undefined;
    // Bill history is the whole main meter's, so it only fits a household that is the whole meter.
    const own = state.compound.mode === "single" && ownMeter !== false;
    const past = state.bill.history;
    const meter = state.meters.find((m) => m.householdId === householdId);
    // Same rule as forecast(): a reading at least 1 day after the base date counts as a photo.
    let baseDate = toManilaDate(state.bill.readDate);
    if (meter && state.bill.presentReading == null) {
      const prevs = state.previousReadings.filter((r) => r.meterId === meter.id).sort((a, b) => toTimestamp(a.capturedAt) - toTimestamp(b.capturedAt));
      if (prevs.length > 0) baseDate = toManilaDate(prevs[prevs.length - 1].capturedAt);
    }
    const hasPhoto = !!meter && state.currentReadings.some((r) => r.meterId === meter.id && daysBetween(baseDate, toManilaDate(r.capturedAt)) >= 1);
    let weatherFailed = false;
    if (useWeather && own && !hasPhoto && Array.isArray(past) && past.length >= 6 && past.length <= MAX_HISTORY) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const nextStart = addDays(toManilaDate(state.bill.readDate), 1);
        const nextEnd = toManilaDate(state.bill.nextReadDate);
        const deadline = new Promise<never>((_, rej) => {
          timer = setTimeout(() => rej(new Error("deadline")), DEADLINE_MS);
          timer.unref?.();
        });
        let hist: Awaited<ReturnType<typeof monthlyCdd>>;
        let next: Awaited<ReturnType<typeof cddForRange>>;
        try {
          [hist, next] = await Promise.race([Promise.all([monthlyCdd(past), cddForRange(nextStart, nextEnd)]), deadline]);
        } finally {
          clearTimeout(timer);
        }
        h = hist;
        cdd = next.cdd;
        if (next.note) note = next.note;
      } catch {
        h = history;
        cdd = nextPeriodCdd;
        weatherFailed = true;
      }
    }
    const f = forecast({ state, householdId, asOf, ownMeter, history: h, nextPeriodCdd: cdd });
    if (weatherFailed) {
      f.note = f.stage === 2 ? "Weather unavailable, using the photo-based forecast." : "Weather unavailable, using last bill's kWh.";
    } else if (note && f.stage === 3) f.note = note;
    return ok(f);
  } catch (e) {
    if (e instanceof ForecastError) return fail(e.status, e.code, e.message, e.next);
    return fail(422, "bad_state", "The state could not be read.", "Send the compound state from GET /api/sample.");
  }
}
