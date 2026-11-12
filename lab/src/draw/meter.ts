// Draws meter faces like the printed props in kahati-hackathon-kit/print/ (submeter_*.png, own_meter_bautista.png),
// then applies optional capture distortions (glare, tilt, blur, low light, an ambiguous digit).
import { type Ctx, line, rng, rrect, text } from "./common";
import { DIGIT_SEGS, type DigitStyle, digitAlpha, drawDigit } from "./segments";

export const METER_W = 1747;
export const METER_H = 2481;
const S = METER_W / 1408;

export interface MeterSpec {
  kind: "sub" | "own";
  value: number; // 0..99999
  tenths: number; // sub-meter only, the digit after the dot
  serial: string;
  name: string;
}

export interface Distortion {
  glare: number; // 0..1
  tilt: number; // degrees, -30..30
  blur: number; // px on the final image, 0..15
  lowLight: number; // 0..1
  ambiguousIndex: number; // -1 none, else 0..4 (position in the 5 main digits)
  ambiguousStrength: number; // 0..1
  caption: boolean;
  seed: number;
}

export const NO_DISTORTION: Distortion = { glare: 0, tilt: 0, blur: 0, lowLight: 0, ambiguousIndex: -1, ambiguousStrength: 0.7, caption: true, seed: 1 };

export const digits5 = (v: number) => String(Math.max(0, Math.min(99999, Math.round(v)))).padStart(5, "0");

function wall(ctx: Ctx) {
  const g = ctx.createLinearGradient(0, 0, 1408, 2000);
  g.addColorStop(0, "#d2cdc2");
  g.addColorStop(1, "#b8b0a3");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1408, 2000);
}

function screw(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
  g.addColorStop(0, "#f4f4f4");
  g.addColorStop(1, "#a0a4a8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y);
  ctx.lineTo(x + r * 0.55, y);
  ctx.moveTo(x, y - r * 0.55);
  ctx.lineTo(x, y + r * 0.55);
  ctx.stroke();
  ctx.restore();
}

function barcode(ctx: Ctx, x: number, y: number, w: number, h: number, seed: string, vertical = false) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const r = rng(s || 7);
  ctx.save();
  ctx.fillStyle = "#151515";
  let p = 0;
  const len = vertical ? h : w;
  while (p < len) {
    const bw = 2 + Math.floor(r() * 3) * 2;
    const gap = 2 + Math.floor(r() * 3) * 2;
    if (p + bw > len) break;
    if (vertical) ctx.fillRect(x, y + p, w, bw);
    else ctx.fillRect(x + p, y, bw, h);
    p += bw + gap;
  }
  ctx.restore();
}

function lcdBg(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#c6d1b8");
  g.addColorStop(1, "#dfe6d2");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function lcdDigits(ctx: Ctx, digits: string, x0: number, y: number, pitch: number, st: DigitStyle, d: Distortion, dotAfter = -1) {
  for (let i = 0; i < digits.length; i++) {
    const x = x0 + i * pitch + (dotAfter >= 0 && i > dotAfter ? pitch * 0.25 : 0);
    drawDigit(ctx, x, y, st, Object.fromEntries(DIGIT_SEGS["8"].map((s) => [s, 0.07])), "#1d221c");
    const amb = i === d.ambiguousIndex ? d.ambiguousStrength : 0;
    drawDigit(ctx, x, y, st, digitAlpha(digits[i], amb), "#1f241e");
  }
}

function glare(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, strength: number, r: () => number) {
  if (strength <= 0) return;
  ctx.save();
  ctx.translate(cx + (r() - 0.5) * rx * 0.8, cy + (r() - 0.5) * ry * 0.6);
  ctx.rotate(-0.4 + r() * 0.3);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.98 * strength)})`);
  g.addColorStop(0.35, `rgba(255,255,255,${0.75 * strength})`);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSub(ctx: Ctx, m: MeterSpec, d: Distortion, r: () => number) {
  wall(ctx);
  if (d.caption) text(ctx, `Sample sub-meter, drawn for demo. ${m.name}`, 34, 56, { size: 20, family: "arial", color: "#333" });

  // cables
  ctx.fillStyle = "#1e1f21";
  for (const [a, b] of [[607, 665], [743, 800]]) {
    ctx.beginPath();
    ctx.moveTo(a, 1690);
    ctx.lineTo(b, 1690);
    ctx.bezierCurveTo(b, 1800, b + (a < 700 ? -20 : 40), 1900, b + (a < 700 ? -30 : 60), 2000);
    ctx.lineTo(a + (a < 700 ? -45 : 20), 2000);
    ctx.bezierCurveTo(a + (a < 700 ? -30 : 20), 1900, a, 1800, a, 1690);
    ctx.fill();
  }
  // terminal cover
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  const tg = ctx.createLinearGradient(362, 0, 1046, 0);
  tg.addColorStop(0, "#a6aab0");
  tg.addColorStop(0.15, "#c3c6cb");
  tg.addColorStop(0.85, "#c3c6cb");
  tg.addColorStop(1, "#a2a6ac");
  rrect(ctx, 362, 1100, 684, 603, [0, 0, 60, 60]);
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.restore();
  line(ctx, 362, 1150, 1046, 1150, "#8e9298", 2);
  screw(ctx, 704, 1190, 19);
  rrect(ctx, 562, 1662, 285, 31, 15);
  ctx.fillStyle = "#2a2c2f";
  ctx.fill();
  ctx.save();
  ctx.translate(704, 1403);
  ctx.rotate(-0.025);
  ctx.fillStyle = "#efe3c4";
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 4;
  ctx.fillRect(-182, -55, 364, 110);
  ctx.shadowBlur = 0;
  text(ctx, m.name, 0, 22, { size: 56, family: "caveat", weight: 500, color: "#1f3550", align: "center" });
  ctx.restore();

  // brackets
  for (const x of [238, 1104]) {
    rrect(ctx, x, 610, 67, 123, 8);
    ctx.fillStyle = "#8f949a";
    ctx.fill();
    screw(ctx, x + 33, 670, 16);
  }
  ctx.save();
  ctx.strokeStyle = "#c9cccf";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(1137, 686);
  ctx.quadraticCurveTo(1190, 790, 1190, 890);
  ctx.stroke();
  ctx.restore();
  rrect(ctx, 1167, 890, 46, 32, 4);
  ctx.fillStyle = "#8a8f95";
  ctx.fill();

  // body
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  rrect(ctx, 285, 237, 839, 915, 50);
  ctx.fillStyle = "#393e43";
  ctx.fill();
  ctx.restore();
  rrect(ctx, 318, 271, 772, 847, 30);
  const fg = ctx.createLinearGradient(318, 271, 1090, 1118);
  fg.addColorStop(0, "#f7f7f8");
  fg.addColorStop(1, "#dfe1e4");
  ctx.fillStyle = fg;
  ctx.fill();
  text(ctx, "DIGITAL KILOWATT HOUR METER", 704, 353, { size: 38, weight: 700, family: "arial", color: "#3d4349", align: "center", ls: 1.5 });

  // blue band + LCD
  const bg = ctx.createLinearGradient(318, 0, 1090, 0);
  bg.addColorStop(0, "#3c74b0");
  bg.addColorStop(1, "#2260a3");
  ctx.fillStyle = bg;
  ctx.fillRect(318, 390, 772, 190);
  rrect(ctx, 347, 407, 581, 156, 8);
  ctx.fillStyle = "#202224";
  ctx.fill();
  lcdBg(ctx, 358, 418, 558, 134);
  const st: DigitStyle = { w: 64, h: 98, t: 15, slant: 0.12, gap: 2 };
  lcdDigits(ctx, digits5(m.value) + String(m.tenths % 10), 372, 434, 84, st, d, 4);
  // decimal point
  ctx.fillStyle = "#1f241e";
  ctx.fillRect(372 + 5 * 84 - 3, 520, 14, 14);
  text(ctx, "kWh", 1008, 505, { size: 56, weight: 700, family: "arial", color: "#fff", align: "center" });

  // LEDs and labels
  ctx.save();
  ctx.fillStyle = "rgba(230,120,120,0.35)";
  ctx.beginPath();
  ctx.arc(494, 647, 28, 0, Math.PI * 2);
  ctx.fill();
  const lg = ctx.createRadialGradient(489, 641, 2, 494, 647, 16);
  lg.addColorStop(0, "#ff9a9a");
  lg.addColorStop(1, "#d62b2b");
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(494, 647, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5c1311";
  ctx.beginPath();
  ctx.arc(913, 647, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  text(ctx, "PULSE", 494, 697, { size: 22, family: "arial", color: "#333", align: "center" });
  text(ctx, "POWER", 913, 697, { size: 22, family: "arial", color: "#333", align: "center" });
  text(ctx, "1600 imp/kWh", 704, 657, { size: 26, family: "arial", color: "#333", align: "center" });

  ctx.save();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.strokeRect(376, 733, 656, 53);
  ctx.restore();
  for (const x of [552, 733, 866]) line(ctx, x, 733, x, 786, "#333", 2);
  for (const [x, s] of [[464, "10(60)A"], [642, "1 PHASE"], [799, "60Hz"], [949, "220V"]] as const)
    text(ctx, s, x, 770, { size: 28, family: "arial", color: "#222", align: "center" });
  barcode(ctx, 495, 818, 412, 66, m.serial);
  text(ctx, `No. ${m.serial}`, 704, 942, { size: 54, weight: 700, family: "arial", color: "#151515", align: "center" });
  text(ctx, "CLASS 1 SINGLE PHASE TWO WIRE", 704, 1008, { size: 24, family: "arial", color: "#444", align: "center" });
  text(ctx, "Electronic watt-hour meter", 704, 1052, { size: 20, family: "arial", color: "#555", align: "center" });

  // glass sheen
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(318, 271);
  ctx.lineTo(720, 271);
  ctx.lineTo(500, 1118);
  ctx.lineTo(318, 1118);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  glare(ctx, 640, 485, 260, 110, d.glare, r);
}

function drawOwn(ctx: Ctx, m: MeterSpec, d: Distortion, r: () => number) {
  wall(ctx);
  if (d.caption) text(ctx, `Sample household meter, drawn for demo. ${m.name}`, 34, 56, { size: 20, family: "arial", color: "#333" });
  // pole
  const pg = ctx.createLinearGradient(657, 0, 752, 0);
  pg.addColorStop(0, "#8e9399");
  pg.addColorStop(0.45, "#c9cdd1");
  pg.addColorStop(1, "#80858b");
  ctx.fillStyle = pg;
  ctx.fillRect(657, 1340, 95, 660);
  rrect(ctx, 644, 1390, 121, 38, 4);
  ctx.fill();
  // plate
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  const plg = ctx.createLinearGradient(238, 0, 1171, 0);
  plg.addColorStop(0, "#a3a8ae");
  plg.addColorStop(0.15, "#c2c5c9");
  plg.addColorStop(0.85, "#c2c5c9");
  plg.addColorStop(1, "#9ea3a9");
  rrect(ctx, 238, 237, 933, 1115, 30);
  ctx.fillStyle = plg;
  ctx.fill();
  ctx.restore();
  for (const [x, y] of [[285, 285], [1123, 285], [285, 1303], [1123, 1303]]) screw(ctx, x, y, 15);

  const cx = 704, cy = 760;
  const ring = (rad: number, c1: string, c2: string) => {
    const g = ctx.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  };
  ring(447, "#9aa0a6", "#6f757b");
  ring(428, "#eceeef", "#b9bdc1");
  ring(392, "#f6f7f7", "#dcdfe1");
  ring(352, "#fbfbfa", "#f2f2f0");
  // orange lower half
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 352, 0, Math.PI * 2);
  ctx.clip();
  const og = ctx.createLinearGradient(400, 715, 1000, 1110);
  og.addColorStop(0, "#f2a85c");
  og.addColorStop(0.6, "#ec8a2e");
  og.addColorStop(1, "#e3863a");
  ctx.fillStyle = og;
  ctx.fillRect(340, 715, 730, 420);
  ctx.restore();
  line(ctx, 362, 716, 1046, 716, "#d8701f", 3);

  rrect(ctx, 623, 431, 162, 41, 6);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ctx, `RF MESH ID ${m.serial.replace(/\D/g, "").slice(-4)}`, 704, 459, { size: 19, weight: 700, family: "arial", color: "#444", align: "center" });

  rrect(ctx, 481, 495, 447, 173, 12);
  ctx.fillStyle = "#333638";
  ctx.fill();
  lcdBg(ctx, 495, 509, 419, 146);
  const st: DigitStyle = { w: 66, h: 104, t: 16, slant: 0.12, gap: 2 };
  lcdDigits(ctx, digits5(m.value), 503, 529, 82, st, d);

  ctx.fillStyle = "#d94040";
  ctx.beginPath();
  ctx.arc(509, 685, 8, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, "1000 imp/kWh", 525, 692, { size: 18, family: "arial", color: "#555" });
  text(ctx, "kWh", 884, 692, { size: 25, weight: 700, family: "arial", color: "#333", align: "center" });
  ctx.fillStyle = "#9ea3a8";
  ctx.beginPath();
  ctx.arc(990, 666, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#dfe1e3";
  ctx.beginPath();
  ctx.arc(990, 666, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(990, 666, 16, 0, Math.PI * 2);
  ctx.fill();

  // barcode sticker
  rrect(ctx, 385, 666, 64, 207, 4);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#bbb";
  ctx.stroke();
  barcode(ctx, 398, 678, 38, 182, m.serial, true);
  ctx.save();
  ctx.translate(442, 770);
  ctx.rotate(-Math.PI / 2);
  text(ctx, m.serial, 0, 0, { size: 11, family: "arial", color: "#444", align: "center" });
  ctx.restore();

  text(ctx, "SAMPLE AX-1", 722, 762, { size: 32, weight: 700, family: "arial", color: "#3c3c3c", align: "center" });
  text(ctx, "FORM 2S CL200 240V 3W TA 30 Kh 1.0", 722, 800, { size: 20, family: "arial", color: "#3c3c3c", align: "center" });
  text(ctx, "SAMPLE ELECTRIC CO.", 722, 840, { size: 28, weight: 700, family: "arial", color: "#3c3c3c", align: "center", ls: 1 });
  text(ctx, m.serial, 722, 930, { size: 76, weight: 700, family: "arial", color: "#2b2b2b", align: "center" });
  text(ctx, "60 Hz CLASS 0.5 DEMO PROP, NOT A UTILITY METER", 722, 975, { size: 19, family: "arial", color: "#2b2b2b", align: "center" });

  // dome sheen
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 372, Math.PI * 1.08, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();

  // seal and name label
  rrect(ctx, 680, 1180, 48, 38, 5);
  ctx.fillStyle = "#83888e";
  ctx.fill();
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(704, 1218);
  ctx.quadraticCurveTo(700, 1250, 672, 1280);
  ctx.stroke();
  ctx.fillStyle = "#8d9298";
  ctx.beginPath();
  ctx.arc(671, 1287, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(941, 1280);
  ctx.rotate(-0.03);
  ctx.fillStyle = "#efe3c4";
  ctx.fillRect(-133, -55, 266, 110);
  text(ctx, m.name, 0, 20, { size: 50, family: "caveat", weight: 500, color: "#1f3550", align: "center" });
  ctx.restore();

  glare(ctx, 704, 590, 230, 100, d.glare, r);
}

/** Render a meter photo (clean prop plus distortions) into `canvas` at 1747 x 2481. */
export function drawMeter(canvas: HTMLCanvasElement, m: MeterSpec, d: Distortion) {
  const r = rng(d.seed * 7919 + 13);
  const off = document.createElement("canvas");
  off.width = METER_W;
  off.height = METER_H;
  const o = off.getContext("2d")!;
  o.scale(S, S);
  if (m.kind === "sub") drawSub(o, m, d, r);
  else drawOwn(o, m, d, r);

  canvas.width = METER_W;
  canvas.height = METER_H;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#c4bdb1";
  ctx.fillRect(0, 0, METER_W, METER_H);
  ctx.save();
  ctx.translate(METER_W / 2, METER_H * 0.4);
  const rad = (d.tilt * Math.PI) / 180;
  ctx.rotate(rad);
  ctx.transform(1, 0, Math.tan(rad) * 0.35, 1, 0, 0); // a bit of shear so it reads as camera angle, not just rotation
  const k = 1 + Math.abs(Math.sin(rad)) * 0.6;
  ctx.scale(k, k);
  if (d.blur > 0) ctx.filter = `blur(${d.blur}px)`;
  ctx.drawImage(off, -METER_W / 2, -METER_H * 0.4);
  ctx.restore();

  if (d.lowLight > 0) {
    const L = d.lowLight;
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgba(${Math.round(255 - 170 * L)},${Math.round(255 - 180 * L)},${Math.round(255 - 200 * L)},1)`;
    ctx.fillRect(0, 0, METER_W, METER_H);
    const v = ctx.createRadialGradient(METER_W / 2, METER_H * 0.38, METER_W * 0.2, METER_W / 2, METER_H * 0.45, METER_W * 1.0);
    v.addColorStop(0, "rgba(255,255,255,1)");
    v.addColorStop(1, `rgba(${Math.round(255 - 200 * L)},${Math.round(255 - 200 * L)},${Math.round(255 - 200 * L)},1)`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, METER_W, METER_H);
    ctx.restore();
    // sensor noise
    const img = ctx.getImageData(0, 0, METER_W, METER_H);
    const px = img.data;
    const amp = 60 * L;
    for (let i = 0; i < px.length; i += 4) {
      const n = (r() - 0.5) * amp;
      px[i] += n;
      px[i + 1] += n;
      px[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }
}

/** The digits the reader should return. */
export function expectedMeter(m: MeterSpec) {
  return { value: Math.round(m.value), digitsText: digits5(m.value), serial: m.serial };
}
