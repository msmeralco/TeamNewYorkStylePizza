// Input hardening for the stateless API: check a CompoundState before the engine touches it.
import { LINE_KEYS, type CompoundState } from "@/types";

export type StateValidation =
  | { ok: true; state: CompoundState }
  | { ok: false; code: "bad_state"; message: string; next: string };

const NEXT = "Send {state} from GET /api/sample.";
const SOURCES = ["photo", "typed", "bill"];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function isIsoDate(x: unknown): boolean {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [y, m, d] = x.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function isDateTime(x: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return isIsoDate(x);
  return /^\d{4}-\d{2}-\d{2}T/.test(x) && isIsoDate(x.slice(0, 10)) && Number.isFinite(Date.parse(x));
}

function checkReadings(list: unknown, name: string, digitsOf: Map<string, number>): string | null {
  if (!Array.isArray(list)) return `${name} must be an array.`;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!isObj(r)) return `${name}[${i}] must be an object.`;
    if (typeof r.meterId !== "string") return `${name}[${i}].meterId must be a string.`;
    if (!isNum(r.value) || !Number.isInteger(r.value) || r.value < 0) return `${name}[${i}].value must be a whole number, zero or more.`;
    const digits = digitsOf.get(r.meterId) ?? 12;
    if (r.value >= 10 ** digits) return `${name}[${i}].value has more digits than the meter shows (${digits}).`;
    if (r.serialRead !== undefined && r.serialRead !== null && typeof r.serialRead !== "string") return `${name}[${i}].serialRead must be a string.`;
    if (r.confidence !== undefined && r.confidence !== null && (!isNum(r.confidence) || r.confidence < 0 || r.confidence > 1)) return `${name}[${i}].confidence must be a number from 0 to 1.`;
    if (typeof r.capturedAt !== "string" || !isDateTime(r.capturedAt)) return `${name}[${i}].capturedAt must be a date like 2026-10-31 or a full ISO timestamp.`;
    if (typeof r.source !== "string" || !SOURCES.includes(r.source)) return `${name}[${i}].source must be photo, typed or bill.`;
  }
  return null;
}

function problem(x: unknown): string | null {
  if (!isObj(x)) return "The request needs a state object.";
  const { compound, households, meters, bill } = x;
  if (!isObj(compound)) return "state.compound must be an object.";
  if (compound.mode !== "shared" && compound.mode !== "single") return "state.compound.mode must be shared or single.";
  if (!Array.isArray(households)) return "state.households must be an array.";
  for (let i = 0; i < households.length; i++) {
    const h = households[i];
    if (!isObj(h) || typeof h.id !== "string") return `state.households[${i}] must be an object with a string id.`;
  }
  if (new Set(households.map((h) => (h as { id: string }).id)).size !== households.length) return "state.households has a duplicate id.";
  if (!Array.isArray(meters)) return "state.meters must be an array.";
  for (let i = 0; i < meters.length; i++) {
    const m = meters[i];
    if (!isObj(m) || typeof m.id !== "string") return `state.meters[${i}] must be an object with a string id.`;
    if (m.householdId !== null && typeof m.householdId !== "string") return `state.meters[${i}].householdId must be a string or null.`;
    if (!Number.isInteger(m.digits) || (m.digits as number) < 1 || (m.digits as number) > 12) return `state.meters[${i}].digits must be a whole number from 1 to 12.`;
    if (m.serial !== undefined && m.serial !== null && typeof m.serial !== "string") return `state.meters[${i}].serial must be a string.`;
  }
  if (new Set(meters.map((m) => (m as { id: string }).id)).size !== meters.length) return "state.meters has a duplicate id.";
  if (!isObj(bill)) return "state.bill must be an object.";
  if (!isNum(bill.kwh) || bill.kwh <= 0 || bill.kwh > 1e7) return "state.bill.kwh must be a number above zero.";
  if (!isNum(bill.amount) || bill.amount <= 0 || bill.amount > 1e9) return "state.bill.amount must be a number above zero.";
  if (!isNum(bill.fixedCharges) || bill.fixedCharges < 0) return "state.bill.fixedCharges must be a number, zero or more.";
  if (bill.fixedCharges > bill.amount) return "state.bill.fixedCharges cannot be more than state.bill.amount.";
  if (!isObj(bill.lines)) return "state.bill.lines must be an object.";
  for (const k of LINE_KEYS) {
    if (!isNum(bill.lines[k]) || Math.abs(bill.lines[k] as number) > 1e9) return `state.bill.lines.${k} must be a number.`;
  }
  if ((bill.lines.supplyMetering as number) < bill.fixedCharges) return "state.bill.lines.supplyMetering cannot be less than state.bill.fixedCharges.";
  if (!isIsoDate(bill.readDate)) return "state.bill.readDate must be a date like 2026-10-31.";
  if (!isIsoDate(bill.nextReadDate)) return "state.bill.nextReadDate must be a date like 2026-11-30.";
  const digitsOf = new Map<string, number>(meters.map((m) => [(m as { id: string }).id, (m as { digits: number }).digits]));
  const prev = checkReadings(x.previousReadings, "state.previousReadings", digitsOf);
  if (prev) return prev;
  const cur = checkReadings(x.currentReadings, "state.currentReadings", digitsOf);
  if (cur) return cur;
  if (x.unmeteredKwh !== undefined && x.unmeteredKwh !== null && (!isNum(x.unmeteredKwh) || x.unmeteredKwh < 0)) {
    return "state.unmeteredKwh must be a number, zero or more.";
  }
  if (x.chargedRates !== undefined && x.chargedRates !== null) {
    if (!Array.isArray(x.chargedRates)) return "state.chargedRates must be an array.";
    for (let i = 0; i < x.chargedRates.length; i++) {
      const c = x.chargedRates[i];
      if (!isObj(c) || typeof c.householdId !== "string" || !isNum(c.perKwh) || c.perKwh < 0 || c.perKwh > 1e4) {
        return `state.chargedRates[${i}] needs a householdId and a perKwh of zero or more.`;
      }
    }
  }
  return null;
}

/** Validate an unknown value as a CompoundState. Fills unmeteredKwh (0) and chargedRates ([]) when missing. */
export function validateState(x: unknown): StateValidation {
  const message = problem(x);
  if (message) return { ok: false, code: "bad_state", message, next: NEXT };
  const s = x as CompoundState;
  return {
    ok: true,
    state: {
      ...s,
      unmeteredKwh: isNum(s.unmeteredKwh) ? s.unmeteredKwh : 0,
      chargedRates: Array.isArray(s.chargedRates) ? s.chargedRates : [],
    },
  };
}
