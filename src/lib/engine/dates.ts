// Calendar-date arithmetic on YYYY-MM-DD strings, in Asia/Manila (UTC+8, no DST).
// No external libs. Dates are treated as calendar dates; timestamps become their Manila date.

const MS_PER_DAY = 86_400_000;
const MANILA_OFFSET_MS = 8 * 3_600_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "YYYY-MM-DD" for a date string or ISO timestamp, as the Manila calendar date. */
export function toManilaDate(input: string): string {
  if (DATE_ONLY.test(input)) return input;
  if (HAS_ZONE.test(input)) {
    const t = Date.parse(input);
    if (Number.isNaN(t)) throw new Error(`Not a date: ${input}`);
    return new Date(t + MANILA_OFFSET_MS).toISOString().slice(0, 10);
  }
  // A timestamp with no zone is taken as Manila local time.
  const head = input.slice(0, 10);
  if (!DATE_ONLY.test(head)) throw new Error(`Not a date: ${input}`);
  return head;
}

function dayNumber(date: string): number {
  const d = toManilaDate(date);
  const t = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  if (Number.isNaN(t)) throw new Error(`Not a date: ${date}`);
  return Math.round(t / MS_PER_DAY);
}

/** Whole calendar days from a to b (b minus a). Negative when b is before a. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

export function addDays(date: string, n: number): string {
  return new Date((dayNumber(date) + n) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** "YYYY-MM" of a date or timestamp (Manila). */
export function monthOf(date: string): string {
  return toManilaDate(date).slice(0, 7);
}

/** "2026-10" -> "October". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** True for a real calendar date in YYYY-MM-DD or an ISO timestamp. */
export function isValidDate(input: unknown): input is string {
  if (typeof input !== "string") return false;
  try {
    const d = toManilaDate(input);
    return new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  } catch {
    return false;
  }
}

/** Epoch ms for a date or timestamp. Date-only and zone-less values are Manila time. */
export function toTimestamp(input: string): number {
  if (DATE_ONLY.test(input)) return Date.parse(`${input}T00:00:00+08:00`);
  if (HAS_ZONE.test(input)) return Date.parse(input);
  return Date.parse(`${input}+08:00`);
}
