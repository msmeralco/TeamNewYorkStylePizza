// Pure checks on a scanned meter reading. Messages never name a household.
import type { Meter, MeterScan, Reading } from "@/types";

export interface MeterIssue {
  code: "below_previous" | "digit_count" | "reads_disagree" | "serial_mismatch" | "low_confidence" | "previous_mismatch";
  message: string;
}

export interface MeterValidation {
  ok: boolean;
  kwhSinceLast: number | null;
  serialMatches: boolean | null;
  issues: MeterIssue[];
}

export const MIN_CONFIDENCE = 0.8;

const norm = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

export function validateMeterScan(input: {
  scan: MeterScan;
  meter: Meter | null;
  previous: Reading | null;
  /** Monthly kWh history; accepted for callers that have it, not used for a flag. */
  history?: number[];
}): MeterValidation {
  const { scan, meter, previous } = input;
  const issues: MeterIssue[] = [];

  let kwhSinceLast: number | null = null;
  if (previous && meter && previous.meterId !== meter.id) {
    issues.push({ code: "previous_mismatch", message: "The last reading belongs to a different meter. Reading needs a second look." });
  } else if (previous) {
    if (scan.value < previous.value) {
      issues.push({ code: "below_previous", message: "Reading needs a second look: it is lower than last month's." });
    } else {
      kwhSinceLast = scan.value - previous.value;
    }
  }

  if (meter && scan.digitsText.length !== meter.digits) {
    issues.push({
      code: "digit_count",
      message: `Reading needs a second look: expected ${meter.digits} digits, saw ${scan.digitsText.length}.`,
    });
  }

  if (scan.secondRead !== null && scan.secondRead !== scan.value) {
    issues.push({ code: "reads_disagree", message: "Two reads of the photo did not match. Reading needs a second look." });
  }

  let serialMatches: boolean | null = null;
  if (meter && scan.serial) {
    serialMatches = norm(scan.serial) === norm(meter.serial);
    if (!serialMatches) {
      issues.push({ code: "serial_mismatch", message: "Serial does not match this meter. Reading needs a second look." });
    }
  }

  if (scan.confidence < MIN_CONFIDENCE) {
    issues.push({ code: "low_confidence", message: "The photo was hard to read. Reading needs a second look." });
  }

  return { ok: issues.length === 0, kwhSinceLast, serialMatches, issues };
}
