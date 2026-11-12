// Stage 3: per-household fit of kWh on cooling degree days. Pure, closed-form OLS. No pre-training.
import { CDD_BASE_C } from "@/data/tables";

export const MIN_CDD_POINTS = 6;

/** Sum over the period's days of max(0, mean temp - base). */
export function cddForPeriod(dailyMeanTemps: number[], base: number = CDD_BASE_C): number {
  return dailyMeanTemps.reduce((s, t) => s + Math.max(0, t - base), 0);
}

export interface CddFit {
  /** Baseline kWh at zero cooling degree days (the intercept). */
  base: number;
  /** Extra kWh per cooling degree day (the slope). */
  perCdd: number;
  residualSd: number;
  n: number;
}

export function fitCdd(points: { cdd: number; kwh: number }[]): CddFit | null {
  const n = points.length;
  if (n < MIN_CDD_POINTS) return null;
  const mx = points.reduce((s, p) => s + p.cdd, 0) / n;
  const my = points.reduce((s, p) => s + p.kwh, 0) / n;
  const sxx = points.reduce((s, p) => s + (p.cdd - mx) ** 2, 0);
  if (!(sxx > 0)) return null;
  const sxy = points.reduce((s, p) => s + (p.cdd - mx) * (p.kwh - my), 0);
  const perCdd = sxy / sxx;
  if (!(perCdd > 0)) return null;
  const base = my - perCdd * mx;
  const sse = points.reduce((s, p) => s + (p.kwh - (base + perCdd * p.cdd)) ** 2, 0);
  const residualSd = Math.sqrt(Math.max(0, sse / (n - 2)));
  return { base, perCdd, residualSd, n };
}

export function predict(fit: CddFit, cdd: number): number {
  return fit.base + fit.perCdd * cdd;
}
