// Move a sub-meter reading to the bill's read date. Pure, no I/O.
import type { Reading } from "@/types";

const MS_DAY = 86_400_000;

/** Calendar day number (days since epoch) in Asia/Manila (UTC+8, no DST) for a date or timestamp string. */
export function manilaDay(iso: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / MS_DAY);
  }
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return NaN;
  return Math.floor((t + 8 * 3_600_000) / MS_DAY);
}

/**
 * Pro-rate `curr` to `readDate` using the household's daily rate between its two readings.
 * A reading taken after the read date is pulled back; one taken before is pushed forward.
 * Unrounded. Unchanged when already on the read date or when the rate cannot be worked out.
 */
export function alignToReadDate(prev: Reading, curr: Reading, readDate: string): number {
  const prevDay = manilaDay(prev.capturedAt);
  const currDay = manilaDay(curr.capturedAt);
  const readDay = manilaDay(readDate);
  if ([prevDay, currDay, readDay].some(Number.isNaN)) return curr.value;
  const offset = currDay - readDay;
  if (offset === 0) return curr.value;
  const span = currDay - prevDay;
  if (span <= 0) return curr.value;
  const dailyRate = (curr.value - prev.value) / span;
  return curr.value - dailyRate * offset;
}
