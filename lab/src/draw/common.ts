export type Ctx = CanvasRenderingContext2D;

export interface TextOpts {
  size: number;
  weight?: number;
  family?: "fira" | "noto" | "arial" | "caveat";
  color?: string;
  align?: CanvasTextAlign;
  ls?: number; // letter spacing in px
}

const FAMILY = {
  fira: '"Fira Sans", "Noto Sans", Arial, sans-serif',
  noto: '"Noto Sans", Arial, sans-serif',
  arial: 'Arial, "Liberation Sans", Helvetica, sans-serif',
  caveat: '"Caveat", "Segoe Script", cursive',
};

export function font(o: TextOpts) {
  return `${o.weight ?? 400} ${o.size}px ${FAMILY[o.family ?? "noto"]}`;
}

export function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts) {
  ctx.save();
  ctx.font = font(o);
  ctx.fillStyle = o.color ?? "#1b1f24";
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "alphabetic";
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${o.ls ?? 0}px`;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export function wrap(ctx: Ctx, s: string, maxW: number, o: TextOpts): string[] {
  ctx.save();
  ctx.font = font(o);
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  ctx.restore();
  return lines;
}

export function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, w = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** Seeded PRNG so a variation can be reproduced from its seed. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
