// Suggest a single-digit correction from the add-up constraint. Pure, no I/O.
import type { Reading } from "@/types";

export interface DigitFixCandidate {
  householdId: string;
  previous: Reading;
  current: Reading;
  digits: number;
}

export interface DigitFix {
  householdId: string;
  from: string;
  to: string;
  message: string;
}

/**
 * gapKwh: bill kWh minus readings kWh (positive = short). Only low-confidence or below-previous
 * PHOTO readings are tried. Typed readings never get a suggestion: the answer there is a new photo.
 */
export function suggestDigitFix(input: {
  candidates: DigitFixCandidate[];
  gapKwh: number;
  toleranceKwh: number;
}): DigitFix | null {
  const { candidates, gapKwh, toleranceKwh } = input;
  let best: { fix: DigitFix; remaining: number } | null = null;

  const eligible = candidates.filter(
    (c) =>
      c.current.source === "photo" &&
      ((c.current.confidence ?? 0) < 0.9 || c.current.value < c.previous.value),
  );
  const anyBelow = eligible.some((c) => c.current.value < c.previous.value);
  // Nothing to fix when the total already adds up and no reading goes backwards.
  if (Math.abs(gapKwh) <= toleranceKwh && !anyBelow) return null;

  for (const c of eligible) {
    const from = String(c.current.value).padStart(c.digits, "0");
    if (from.length > c.digits) continue;
    for (let pos = 0; pos < from.length; pos++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === from[pos]) continue;
        const to = from.slice(0, pos) + d + from.slice(pos + 1);
        const delta = Number(to) - c.current.value;
        const newKwh = Number(to) - c.previous.value;
        if (newKwh < 0) continue;
        const remaining = gapKwh - delta;
        if (Math.abs(remaining) > toleranceKwh) continue;
        // Smallest absolute remaining gap wins; ties keep the first found (leftmost digit, lowest value).
        if (best === null || Math.abs(remaining) < Math.abs(best.remaining)) {
          best = {
            remaining,
            fix: { householdId: c.householdId, from, to, message: `Did you mean ${to}, not ${from}?` },
          };
        }
      }
    }
  }
  return best ? best.fix : null;
}
