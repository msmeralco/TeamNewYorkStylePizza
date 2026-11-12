// Rate selection. Kahati never forecasts the rate: it uses the month's row, or the latest earlier one, labelled.
import { RATES } from "@/data/tables";
import type { RateRow } from "@/types";
import { monthName } from "./dates";

export interface RateChoice {
  perKwh: number;
  /** The month of the row actually used. */
  month: string;
  isFallback: boolean;
  note: string | null;
  /** Largest month-to-month change in the table, as a fraction. Applies to peso forecasts only when isFallback. */
  rangeFactor: number;
}

export function largestMonthlyChange(table: RateRow[]): number {
  const rows = [...table].sort((a, b) => a.month.localeCompare(b.month));
  let max = 0;
  for (let i = 1; i < rows.length; i++) {
    max = Math.max(max, Math.abs(rows[i].perKwh - rows[i - 1].perKwh) / rows[i - 1].perKwh);
  }
  return max;
}

export function rateFor(month: string, table: RateRow[] = RATES): RateChoice {
  const rows = [...table].sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length === 0) throw new Error("The rate table is empty.");
  const exact = rows.find((r) => r.month === month);
  const rangeFactor = largestMonthlyChange(rows);
  if (exact) return { perKwh: exact.perKwh, month: exact.month, isFallback: false, note: null, rangeFactor: 0 };
  const earlier = rows.filter((r) => r.month < month);
  if (earlier.length === 0) {
    const first = rows[0];
    return {
      perKwh: first.perKwh,
      month: first.month,
      isFallback: true,
      note: `Using ${monthName(first.month)}'s rate, the earliest in the table.`,
      rangeFactor,
    };
  }
  const used = earlier[earlier.length - 1];
  return {
    perKwh: used.perKwh,
    month: used.month,
    isFallback: true,
    note: `Using ${monthName(used.month)}'s rate. ${monthName(month)}'s is announced mid-month.`,
    rangeFactor,
  };
}
