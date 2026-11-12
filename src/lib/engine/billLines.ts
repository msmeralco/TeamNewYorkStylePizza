// Make a scanned bill's seven lines add up to its printed total.
// Every state endpoint rejects a bill whose lines differ from the amount by more than ₱0.01,
// so a scan with a small rounding or mapping difference is reconciled here, in the open.
import { LINE_KEYS, type Lines } from "@/types";

/** Differences up to this many pesos are absorbed into "Other charges" and disclosed. */
export const LINES_ABSORB_LIMIT = 5;

export interface LinesCheck {
  lines: Lines;
  /** amount − sum of the scanned lines, in pesos (2 dp). */
  difference: number;
  addsUp: boolean;
  adjusted: boolean;
  note: string | null;
}

export function reconcileLines(lines: Lines, amount: number): LinesCheck {
  const sum = LINE_KEYS.reduce((s, k) => s + (Number.isFinite(lines[k]) ? lines[k] : 0), 0);
  const difference = Math.round((amount - sum) * 100) / 100;
  if (Math.abs(difference) < 0.005) return { lines, difference: 0, addsUp: true, adjusted: false, note: null };
  const peso = `₱${Math.abs(difference).toFixed(2)}`;
  if (Math.abs(difference) <= LINES_ABSORB_LIMIT) {
    const fixed = { ...lines, other: Math.round((lines.other + difference) * 100) / 100 };
    return {
      lines: fixed,
      difference,
      addsUp: true,
      adjusted: true,
      note: `The charge lines were ${peso} ${difference > 0 ? "short of" : "over"} the total, so the difference was added to Other charges. Please check it against the bill.`,
    };
  }
  return {
    lines,
    difference,
    addsUp: false,
    adjusted: false,
    note: `The charge lines are ${peso} ${difference > 0 ? "short of" : "over"} the total. Please check each line against the bill before confirming.`,
  };
}
