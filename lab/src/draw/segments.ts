import type { Ctx } from "./common";

export type Seg = "a" | "b" | "c" | "d" | "e" | "f" | "g";
export const DIGIT_SEGS: Record<string, Seg[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

/** The digit each digit is most easily confused with, for the "ambiguous digit" option. */
export const CONFUSABLE: Record<string, string> = {
  "0": "8", "1": "7", "2": "3", "3": "9", "4": "9", "5": "6", "6": "8", "7": "1", "8": "0", "9": "8",
};

export interface DigitStyle {
  w: number;
  h: number;
  t: number; // stroke thickness
  slant: number; // horizontal shift per unit height (italic)
  gap: number;
}

/** Draw one 7-segment digit. `alpha` per segment, 0 means off. */
export function drawDigit(ctx: Ctx, x: number, y: number, st: DigitStyle, alpha: Partial<Record<Seg, number>>, color: string) {
  const { w, h, t, slant, gap } = st;
  const sk = (px: number, py: number): [number, number] => [px + (y + h - py) * slant, py];
  const hseg = (yc: number) => {
    const x0 = x + gap, x1 = x + w - gap;
    return [sk(x0, yc), sk(x0 + t / 2, yc - t / 2), sk(x1 - t / 2, yc - t / 2), sk(x1, yc), sk(x1 - t / 2, yc + t / 2), sk(x0 + t / 2, yc + t / 2)];
  };
  const vseg = (xc: number, y0: number, y1: number) => [
    sk(xc, y0), sk(xc + t / 2, y0 + t / 2), sk(xc + t / 2, y1 - t / 2), sk(xc, y1), sk(xc - t / 2, y1 - t / 2), sk(xc - t / 2, y0 + t / 2),
  ];
  const mid = y + h / 2;
  const polys: Record<Seg, [number, number][]> = {
    a: hseg(y + t / 2),
    g: hseg(mid),
    d: hseg(y + h - t / 2),
    f: vseg(x + t / 2, y + gap, mid - gap),
    b: vseg(x + w - t / 2, y + gap, mid - gap),
    e: vseg(x + t / 2, mid + gap, y + h - gap),
    c: vseg(x + w - t / 2, mid + gap, y + h - gap),
  };
  ctx.save();
  ctx.fillStyle = color;
  for (const k of Object.keys(polys) as Seg[]) {
    const a = alpha[k] ?? 0;
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    const p = polys[k];
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Segment alphas for a digit, optionally made ambiguous: segments that would turn it into its
 * confusable twin are drawn half-lit, and segments the twin lacks are drawn faded.
 */
export function digitAlpha(d: string, ambiguous = 0): Partial<Record<Seg, number>> {
  const on = new Set(DIGIT_SEGS[d] ?? []);
  const out: Partial<Record<Seg, number>> = {};
  for (const s of on) out[s] = 1;
  if (ambiguous > 0) {
    const alt = new Set(DIGIT_SEGS[CONFUSABLE[d]] ?? []);
    for (const s of alt) if (!on.has(s)) out[s] = 0.75 * ambiguous;
    for (const s of on) if (!alt.has(s)) out[s] = 1 - 0.55 * ambiguous;
  }
  return out;
}
