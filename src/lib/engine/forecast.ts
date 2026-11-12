// Usage forecast in stages (spec: "Forecast, in stages"). Pure: no I/O.
import { LIFELINE_LINE_KWH, SPIKE_THRESHOLD, STAGE2_RANGE, TYPICAL_WATTS } from "@/data/tables";
import type { CompoundState, Forecast, Reading } from "@/types";
import { fitCdd, predict } from "./cdd";
import { daysBetween, monthOf, toManilaDate, toTimestamp } from "./dates";
import { billAfterLifeline, tierLine } from "./lifeline";
import { rateFor } from "./rates";
import { householdUsage } from "./readings";

export interface ForecastInput {
  state: CompoundState;
  householdId: string;
  /** Used only to pick the rate month. Defaults to the photo date. */
  asOf?: string;
  /** Own enrolled meter. Default: compound.mode === "single". */
  ownMeter?: boolean;
  /** Past periods for stage 3: cooling degree days and kWh. */
  history?: { cdd: number; kwh: number }[];
  /** Cooling degree days expected in the period being forecast (stage 3). */
  nextPeriodCdd?: number;
}

export class ForecastError extends Error {
  constructor(public status: number, public code: string, message: string, public next: string) {
    super(message);
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const peso = (x: number) => Math.round(x).toLocaleString("en-US");

function aircon(): string | null {
  const a = TYPICAL_WATTS.find((w) => w.appliance.toLowerCase().startsWith("aircon"));
  if (!a) return null;
  const kwh = Math.round((a.watts / 1000) * 1 * 30);
  return `One hour less of aircon a day is about ${kwh} kWh a month (assumes about ${a.watts / 1000} kW).`;
}

function latestReading(rs: Reading[]): Reading | null {
  if (rs.length === 0) return null;
  return [...rs].sort((a, b) => toTimestamp(a.capturedAt) - toTimestamp(b.capturedAt))[rs.length - 1];
}

export function forecast(input: ForecastInput): Forecast {
  const { state, householdId } = input;
  const { bill, compound } = state;
  const household = state.households.find((h) => h.id === householdId);
  if (!household) {
    throw new ForecastError(422, "unknown_household", "That household is not in this compound.", "Pick a household from the state you sent.");
  }
  const meter = state.meters.find((m) => m.householdId === householdId);
  if (!meter) {
    throw new ForecastError(422, "no_meter", "This household has no meter.", "Add the household's meter to the state.");
  }
  const single = compound.mode === "single";
  const mine = (rs: Reading[]) => rs.filter((r) => r.meterId === meter.id);

  // Base point.
  let baseDate: string;
  let baseValue: number;
  let lastPeriodKwh: number | null = null;
  let lastPeriodDays: number | null = null;
  let latest: Reading | null;
  let targetReadDate: string | null = null;

  if (single) {
    baseDate = toManilaDate(bill.readDate);
    if (bill.presentReading != null) {
      baseValue = bill.presentReading;
    } else {
      const prev = latestReading(mine(state.previousReadings));
      if (!prev) {
        throw new ForecastError(422, "no_base_reading", "The bill's reading on read day is missing.", "Type the present reading from the bill.");
      }
      baseValue = prev.value;
      baseDate = toManilaDate(prev.capturedAt);
    }
    lastPeriodKwh = bill.kwh;
    lastPeriodDays = Math.max(1, daysBetween(bill.periodStart, bill.periodEnd));
    latest = latestReading(mine(state.currentReadings).filter((r) => daysBetween(baseDate, toManilaDate(r.capturedAt)) >= 1));
  } else {
    const u = householdUsage(state).find((x) => x.householdId === householdId);
    if (!u || !u.previous) {
      throw new ForecastError(422, "no_base_reading", "This household has no previous reading.", "Scan or type last period's meter reading.");
    }
    baseDate = toManilaDate(u.previous.capturedAt);
    baseValue = u.previous.value;
    const cur = latestReading(mine(state.currentReadings));
    latest = null;
    if (cur) {
      const curDate = toManilaDate(cur.capturedAt);
      const billRead = toManilaDate(bill.readDate);
      if (daysBetween(baseDate, billRead) > 0 && daysBetween(billRead, curDate) >= 0) {
        // The reading closes the billed period: it is last period's use. Start the new period from it.
        if (cur.value < baseValue) {
          throw new ForecastError(422, "reading_below_base", "The latest reading is lower than the starting reading.", "Check the digits on the photo, or retake it.");
        }
        lastPeriodKwh = cur.value - baseValue;
        lastPeriodDays = Math.max(1, daysBetween(baseDate, curDate));
        baseDate = curDate;
        baseValue = cur.value;
      } else if (daysBetween(baseDate, curDate) >= 1 && daysBetween(curDate, toManilaDate(bill.nextReadDate)) > 0) {
        // A mid-period photo. Last period is not known from this reading alone.
        latest = cur;
        if (daysBetween(curDate, billRead) > 0) targetReadDate = billRead;
      }
    }
  }

  if (latest && latest.value < baseValue) {
    throw new ForecastError(422, "reading_below_base", "The latest reading is lower than the starting reading.", "Check the digits on the photo, or retake it.");
  }

  // A photo taken before the bill's read date belongs to the period that ends on it.
  const readDate = targetReadDate ?? toManilaDate(bill.nextReadDate);
  const photoDate = latest ? toManilaDate(latest.capturedAt) : null;
  const rateMonth = input.asOf ? monthOf(input.asOf) : photoDate ? monthOf(photoDate) : monthOf(bill.readDate);
  const rate = rateFor(rateMonth);

  let stage: 1 | 2 | 3;
  let exactKwh: number;
  let low: number;
  let high: number;
  let label: string | null = null;
  let dailyRate: number | null = null;
  let used = 0;
  let days = 0;

  const fit = input.history && input.nextPeriodCdd != null && Number.isFinite(input.nextPeriodCdd) ? fitCdd(input.history) : null;

  if (latest && photoDate) {
    stage = 2;
    days = daysBetween(baseDate, photoDate);
    used = latest.value - baseValue;
    dailyRate = used / days;
    const daysLeft = Math.max(0, daysBetween(photoDate, readDate));
    const projected = dailyRate * daysLeft;
    exactKwh = used + projected;
    low = used + projected * (1 - STAGE2_RANGE);
    high = used + projected * (1 + STAGE2_RANGE);
  } else if (fit && input.nextPeriodCdd != null) {
    stage = 3;
    exactKwh = Math.max(0, predict(fit, input.nextPeriodCdd));
    low = Math.max(0, exactKwh - 1.5 * fit.residualSd);
    high = exactKwh + 1.5 * fit.residualSd;
  } else {
    stage = 1;
    if (lastPeriodKwh == null) {
      throw new ForecastError(422, "no_last_period", "There is no last period's kWh to start from.", "Scan the bill, or add this period's meter reading.");
    }
    exactKwh = lastPeriodKwh;
    low = exactKwh * 0.9;
    high = exactKwh * 1.1;
    label = "Rough guess";
  }

  const kwh = Math.round(exactKwh);
  const lowR = Math.round(low);
  const highR = Math.round(high);

  const points: Forecast["points"] = [{ date: baseDate, day: 0, kwhUsed: 0, kind: "bill" }];
  if (latest && photoDate) points.push({ date: photoDate, day: days, kwhUsed: used, kind: "photo" });
  points.push({ date: readDate, day: daysBetween(baseDate, readDate), kwhUsed: kwh, kind: "projection" });

  const ownMeter = input.ownMeter ?? single;
  let lifeline: Forecast["lifeline"] = null;
  if (ownMeter && household.fourPs) {
    const forecastPeso = billAfterLifeline(kwh, rate.perKwh);
    const underLinePeso = billAfterLifeline(LIFELINE_LINE_KWH, rate.perKwh);
    lifeline = {
      lineKwh: LIFELINE_LINE_KWH,
      forecastPeso: round2(forecastPeso),
      underLinePeso: round2(underLinePeso),
      message:
        kwh <= LIFELINE_LINE_KWH
          ? `On track to stay under 50 kWh: about ₱${peso(underLinePeso)}`
          : `Stay under 50 kWh: about ₱${peso(underLinePeso)} instead of about ₱${peso(forecastPeso)}`,
      tierLine: tierLine(),
    };
    if (rate.isFallback && rate.rangeFactor > 0) {
      const lo = billAfterLifeline(lowR, rate.perKwh * (1 - rate.rangeFactor));
      const hi = billAfterLifeline(highR, rate.perKwh * (1 + rate.rangeFactor));
      lifeline.pesoLow = round2(lo);
      lifeline.pesoHigh = round2(hi);
      // The rate is not announced yet, so the peso figure is a range. It is shown in the message.
      lifeline.message += ` The rate is not announced yet, so your bill could be about ₱${peso(lo)} to ₱${peso(hi)}.`;
    }
  }

  const perKwhValue = compound.mode === "shared" && bill.kwh > 0 ? round2((bill.amount - bill.fixedCharges) / bill.kwh) : null;

  let spike: Forecast["spike"] = null;
  if (stage === 2 && dailyRate != null && lastPeriodKwh != null && lastPeriodDays != null && lastPeriodKwh > 0) {
    const usual = lastPeriodKwh / lastPeriodDays;
    if (dailyRate > usual * (1 + SPIKE_THRESHOLD)) {
      const pct = Math.round((dailyRate / usual - 1) * 100);
      spike = { percentAbove: pct, message: `Your use so far this month is ${pct}% above your usual.` };
    }
  }

  const actions = ["Unplug the rice cooker after cooking", "Set the fan on a timer at night"];
  const ac = aircon();
  if (ac && kwh >= 100) actions.push(ac);

  return {
    householdId,
    stage,
    readDate,
    kwh,
    low: lowR,
    high: highR,
    label,
    points,
    rate: { perKwh: rate.perKwh, month: rate.month, isFallback: rate.isFallback, note: rate.note, rangeFactor: rate.rangeFactor },
    lifeline,
    perKwhValue,
    spike,
    actions,
  };
}
