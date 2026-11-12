// Money helpers. The engine keeps full precision; these are for display rounding.

/** Round to centavos (2 dp), tolerant of float noise such as 1.005. */
export function round2(n: number): number {
  return Math.round(n * 100 + (n >= 0 ? 1e-7 : -1e-7)) / 100;
}

/**
 * Round each value down to the centavo, then give the missing centavos one each to the
 * largest cut-off remainders (ties: original order) so the results sum exactly to total.
 */
export function largestRemainder(values: number[], total: number): number[] {
  const totalCents = Math.round(total * 100);
  const scaled = values.map((v) => v * 100);
  const floors = scaled.map((s) => Math.floor(s + 1e-7));
  const rems = scaled.map((s, i) => s - floors[i]);
  let missing = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = rems.map((_, i) => i).sort((a, b) => rems[b] - rems[a] || a - b);
  const out = [...floors];
  for (let j = 0; missing > 0 && order.length > 0; j = (j + 1) % order.length, missing--) out[order[j]] += 1;
  for (let j = order.length - 1; missing < 0 && order.length > 0; j = (j - 1 + order.length) % order.length, missing++) out[order[j]] -= 1;
  return out.map((c) => c / 100);
}
