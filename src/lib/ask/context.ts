// Builds the grounded context for Ask Kahati: one household's computed numbers, and nothing else.
// Privacy: the 4Ps flag and other households' names and kWh never go into factSheet (which is sent to Gemini).
import { ADD_UP_TOLERANCE, LIFELINE_TIERS } from "@/data/tables";
import { LINE_KEYS, LINE_LABELS, type AskSource, type CompoundState, type LineKey, type TenantView } from "@/types";
import { checkCompound } from "@/lib/engine/check";
import { forecast } from "@/lib/engine/forecast";
import { round2 } from "@/lib/engine/money";
import { rateCheck } from "@/lib/engine/rateCheck";
import { computeSplit, SplitError } from "@/lib/engine/split";
import { AskError } from "./errors";

export type AskLanguage = "en" | "fil";

export interface AskFacts {
  share?: number;
  kwh?: number;
  billKwh?: number;
  billAmount?: number;
  fixedCharges?: number;
  fixedPart?: number;
  periodStart?: string;
  periodEnd?: string;
  lines?: Record<LineKey, number>;
  perKwhValue?: number;
  effectiveRate?: number;
  chargedRate?: number;
  askedAmount?: number;
  aboveBy?: number;
  forecastKwh?: number;
  forecastLow?: number;
  forecastHigh?: number;
  readDate?: string;
  nextReadDate?: string;
  lifelineForecastPeso?: number;
  lifelineUnderPeso?: number;
  checkStatus?: "ok" | "gap";
  readingsKwh?: number;
  missingKwh?: number;
  toleranceKwh?: number;
  /** This household's own reading was typed, not photographed. */
  typed?: boolean;
}

export interface AskContext {
  language: AskLanguage;
  householdId: string;
  label: string;
  displayName: string;
  mode: "shared" | "single";
  sources: AskSource[];
  facts: AskFacts;
  allowedNumbers: number[];
  factSheet: string;
  /** Names of the OTHER households. For the guard only; never sent anywhere. */
  otherNames: string[];
}

const LIFELINE_BOUNDS = LIFELINE_TIERS.flatMap((t) => [t.maxKwh, Math.round(t.discount * 100)]);
const FIXED_NUMBERS = [0, 1, 5, 50, 51, ...LIFELINE_BOUNDS, 71, 100];

function numbersIn(v: unknown, out: number[]): void {
  if (typeof v === "number" && Number.isFinite(v)) {
    out.push(v, Math.abs(v), round2(v), Math.round(v), Math.round(v * 10) / 10);
    out.push(round2(Math.abs(v)), Math.round(Math.abs(v)));
  } else if (typeof v === "string") {
    // Calendar dates: the year and day are legitimate to mention.
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) out.push(Number(m[1]), Number(m[3]));
  } else if (v && typeof v === "object") {
    for (const x of Object.values(v)) numbersIn(x, out);
  }
}

export function allowedFrom(facts: AskFacts): number[] {
  const out: number[] = [...FIXED_NUMBERS];
  numbersIn(facts, out);
  return [...new Set(out.map((n) => Math.round(n * 10000) / 10000))].sort((a, b) => a - b);
}

const peso = (n: number) => `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kwhText = (n: number) => String(Number(n.toFixed(1)));

/** Plain-language facts for the LLM. No other household's name or kWh, no 4Ps flag. */
export function factSheetOf(c: { displayName: string; label: string; mode: "shared" | "single"; facts: AskFacts }): string {
  const f = c.facts;
  const L: string[] = [];
  L.push(`Household: ${c.displayName} (household ${c.label}).`);
  L.push(
    c.mode === "shared"
      ? "Meter: one Meralco meter shared by several households, split by each household's kWh from its sub-meter."
      : "Meter: this household's own meter.",
  );
  if (f.periodStart && f.periodEnd) L.push(`Billing period: ${f.periodStart} to ${f.periodEnd}.`);
  if (f.billAmount != null && f.billKwh != null) L.push(`Whole bill: ${peso(f.billAmount)} for ${kwhText(f.billKwh)} kWh.`);
  if (f.share != null) L.push(`This household's share: ${peso(f.share)}.`);
  if (f.kwh != null) {
    L.push(
      c.mode === "single"
        ? `This household's kWh used so far this period${f.readDate ? ` (since the bill's read date, ${f.readDate})` : ""}: ${kwhText(f.kwh)}. This is not the kWh of the bill.`
        : `This household's kWh used for the split: ${kwhText(f.kwh)}.`,
    );
  }
  if (f.fixedCharges != null) L.push(`Fixed charges in the bill: ${peso(f.fixedCharges)}, split equally between households.`);
  if (f.fixedPart != null) L.push(`This household's equal part of the fixed charges: ${peso(f.fixedPart)}.`);
  if (f.lines) {
    const lines = f.lines;
    L.push("Share by bill line: " + LINE_KEYS.map((k) => `${LINE_LABELS[k]} ${peso(lines[k])}`).join(", ") + ".");
  }
  if (f.perKwhValue != null) L.push(`Each kWh saved takes about ${peso(f.perKwhValue)} off this share.`);
  if (f.effectiveRate != null) L.push(`The bill's average rate: ${peso(f.effectiveRate)} per kWh.`);
  if (f.chargedRate != null) {
    L.push(
      `Rate this household was asked to pay: ${peso(f.chargedRate)} per kWh${f.askedAmount != null ? `, which is ${peso(f.askedAmount)} for its kWh` : ""}.`,
    );
    if (f.aboveBy != null) {
      L.push(`That is ${peso(Math.abs(f.aboveBy))} ${f.aboveBy > 0 ? "above" : "below"} this household's share of ${peso(f.share ?? f.askedAmount! - f.aboveBy)}.`);
    }
  } else {
    L.push("No per-kWh rate was entered, so there is no rate check.");
  }
  if (f.forecastKwh != null) {
    L.push(`Usage forecast by ${f.readDate ?? "the next read date"}: about ${f.forecastKwh} kWh (range ${f.forecastLow} to ${f.forecastHigh} kWh).`);
  }
  // Identical for every own-meter household, so the text never reveals enrollment (the 4Ps flag).
  // Household-specific lifeline pesos stay in the local template answers only.
  if (c.mode === "shared") {
    L.push("Lifeline: on a shared meter there is no 50 kWh line for one household. The line applies on a household's own enrolled meter.");
  } else {
    L.push(
      "Lifeline: the discount applies on an enrolled own meter: 100% off up to 50 kWh, 35% off from 51 to 70 kWh, 20% off up to 100 kWh. Do not say whether this household is enrolled.",
    );
  }
  if (f.checkStatus) {
    const gap = f.missingKwh ?? 0;
    L.push(
      f.checkStatus === "ok"
        ? `Readings check: the sub-meter readings add up to ${kwhText(f.readingsKwh ?? 0)} of ${kwhText(f.billKwh ?? 0)} kWh, within the ${kwhText(f.toleranceKwh ?? 0)} kWh tolerance (${Math.round(ADD_UP_TOLERANCE * 100)}%).`
        : `Readings check: the sub-meter readings add up to ${kwhText(f.readingsKwh ?? 0)} of ${kwhText(f.billKwh ?? 0)} kWh, so ${kwhText(Math.abs(gap))} kWh ${gap >= 0 ? "are missing" : "are extra"}. Until it is fixed, the gap is split by kWh. The cause is not known.`,
    );
  }
  if (f.typed) L.push("This household's reading was typed, not photographed.");
  return L.join("\n");
}

function finish(base: Omit<AskContext, "allowedNumbers" | "factSheet">): AskContext {
  return { ...base, allowedNumbers: allowedFrom(base.facts), factSheet: factSheetOf(base) };
}

export function buildContextFromState(state: CompoundState, householdId: string, language: AskLanguage): AskContext {
  const h = state.households.find((x) => x.id === householdId);
  if (!h) throw new AskError("unknown_household", "That household is not in this compound.", "Pick a household from the list.");

  let split;
  try {
    split = computeSplit(state);
  } catch (e) {
    if (e instanceof SplitError && e.code === "missing_reading") {
      throw new AskError("missing_reading", e.message, e.next);
    }
    throw e;
  }
  const share = split.shares.find((s) => s.householdId === householdId);
  if (!share) throw new AskError("unknown_household", "That household is not in this compound.", "Pick a household from the list.");

  const { bill, compound } = state;
  const mode = compound.mode;
  const sources: AskSource[] = ["share", "breakdown"];
  const facts: AskFacts = {
    share: share.amount,
    kwh: share.kwh,
    billKwh: bill.kwh,
    billAmount: bill.amount,
    fixedCharges: bill.fixedCharges,
    fixedPart: share.fixedPart,
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    lines: { ...share.breakdown },
    perKwhValue: round2(split.perKwhValue),
    effectiveRate: split.effectiveRate,
    readDate: bill.readDate,
    nextReadDate: bill.nextReadDate,
  };

  const rc = rateCheck(state, householdId);
  if (rc) {
    facts.chargedRate = rc.chargedRate;
    facts.askedAmount = rc.askedAmount;
    facts.aboveBy = rc.aboveBy;
    sources.push("rateCheck");
  }

  if (mode === "single") {
    // Every own-meter household gets the same source list, so the response shape never reveals 4Ps enrollment.
    sources.push("lifeline");
    try {
      const f = forecast({ state, householdId });
      facts.forecastKwh = f.kwh;
      facts.forecastLow = f.low;
      facts.forecastHigh = f.high;
      facts.readDate = f.readDate;
      sources.push("forecast");
      if (f.lifeline) {
        facts.lifelineForecastPeso = f.lifeline.forecastPeso;
        facts.lifelineUnderPeso = f.lifeline.underLinePeso;
      }
    } catch {
      // No forecast possible yet (for example no base reading). Answers fall back to general text.
    }
  } else {
    try {
      const c = checkCompound(state);
      facts.checkStatus = c.status;
      facts.readingsKwh = c.readingsKwh;
      facts.missingKwh = c.missingKwh;
      facts.toleranceKwh = c.toleranceKwh;
      facts.typed = c.households.find((x) => x.householdId === householdId)?.chip === "typed";
      sources.push("check");
    } catch {
      // Check not available; the readings answer stays general.
    }
  }
  if (facts.toleranceKwh == null) facts.toleranceKwh = bill.kwh * ADD_UP_TOLERANCE;

  return finish({
    language,
    householdId,
    label: h.label,
    displayName: h.displayName,
    mode,
    sources,
    facts,
    otherNames: state.households.filter((x) => x.id !== householdId).map((x) => x.displayName),
  });
}

export function buildContextFromTenant(view: TenantView, language: AskLanguage): AskContext {
  const { share, bill, rateCheck: rc } = view;
  const sources: AskSource[] = ["share", "breakdown"];
  const facts: AskFacts = {
    share: share.amount,
    kwh: share.kwh,
    billKwh: bill.kwh,
    billAmount: bill.amount,
    fixedCharges: bill.fixedCharges,
    fixedPart: share.fixedPart,
    periodStart: bill.periodStart,
    periodEnd: bill.periodEnd,
    lines: { ...share.breakdown },
    perKwhValue: round2(view.perKwhValue),
    effectiveRate: bill.kwh > 0 ? bill.amount / bill.kwh : undefined,
    toleranceKwh: bill.kwh * ADD_UP_TOLERANCE,
  };
  if (rc) {
    facts.effectiveRate = rc.effectiveRate;
    facts.chargedRate = rc.chargedRate;
    facts.askedAmount = rc.askedAmount;
    facts.aboveBy = rc.aboveBy;
    sources.push("rateCheck");
  }
  return finish({
    language,
    householdId: view.household.id,
    label: view.household.label,
    displayName: view.household.displayName,
    mode: "shared",
    sources,
    facts,
    otherNames: [],
  });
}
