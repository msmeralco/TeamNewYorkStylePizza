// Draws the sample bill in the layout of kahati-hackathon-kit/print/sample_bill_editable_preview.pdf.
// Coordinates are in "layout units" (920 wide, the PDF page at 1.546 px/pt), scaled to a 2481 x 3509 px
// A4 canvas (about 300 dpi). The logo is a generic orange disc with a bolt, not a utility's real mark.
import { type BillValues, billKwh, billTotal, distributionTotal, fmtDate, historyMonths, MONTHS, peso } from "../model";
import { type Ctx, line, rng, text, wrap } from "./common";
import { drawBillClassic } from "./billClassic";
import QRCode from "qrcode";

/** The lab month's QR (compact `#s2=` link) and its label, printed on the bill when present. */
export interface BillQr {
  url: string;
  label: string;
  /** Tiny `#lab=` link: version ~3, printed at ~33 mm with ECL M. */
  small?: boolean;
}

/** Draw a real QR (ECL L: fewer, bigger modules decode best from a whole-bill photo; 4-module quiet zone) into a size x size square. */
function drawQr(ctx: Ctx, url: string, x: number, y: number, size: number, ecl: "L" | "M" = "L") {
  const q = QRCode.create(url, { errorCorrectionLevel: ecl });
  const n = q.modules.size;
  const cell = size / (n + 8);
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (q.modules.get(r, c)) ctx.fillRect(x + (c + 4) * cell, y + (r + 4) * cell, cell + 0.02, cell + 0.02);
  ctx.restore();
}

export const BILL_W = 2481;
export const BILL_H = 3509;
const S = BILL_W / 920;

const DARK = "#3a3a3a";
const INK = "#111";
const GREY = "#444";
const LIGHT = "#666";
const RULE = "#cfcfcf";
const BOX = "#e6e6e6";
const RED = "#c80000";
const A = "arial" as const;

function bar(ctx: Ctx, x: number, y: number, w: number, title: string) {
  ctx.fillStyle = DARK;
  ctx.fillRect(x, y, w, 27);
  text(ctx, title, x + 8, y + 20, { size: 16, weight: 700, family: A, color: "#fff" });
}

/** Text with some bold runs: parts like ["This bill is ", "*2.7% lower*", " vs ..."]. */
function rich(ctx: Ctx, parts: string[], x: number, y: number, size: number) {
  let cx = x;
  for (const p of parts) {
    const bold = p.startsWith("*") && p.endsWith("*");
    const s = bold ? p.slice(1, -1) : p;
    const o = { size, weight: bold ? 700 : 400, family: A, color: INK };
    text(ctx, s, cx, y, o);
    ctx.save();
    ctx.font = `${o.weight} ${size}px Arial, "Liberation Sans", Helvetica, sans-serif`;
    cx += ctx.measureText(s).width;
    ctx.restore();
  }
}

function logo(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = "#f26522";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  // simple lightning bolt
  const p: [number, number][] = [[0.18, -0.72], [-0.38, 0.08], [-0.02, 0.08], [-0.2, 0.74], [0.4, -0.12], [0.04, -0.12], [0.26, -0.72]];
  p.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function qrPlaceholder(ctx: Ctx, x: number, y: number, size: number, seed: string) {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, size, size);
  const n = 25;
  const pad = 10;
  const cell = (size - pad * 2) / n;
  let s = 0;
  for (const ch of seed) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
  const r = rng(s || 3);
  ctx.fillStyle = "#111";
  const finder = (fx: number, fy: number) => fx < 7 && fy < 7;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const inF = finder(i, j) || finder(n - 1 - i, j) || finder(i, n - 1 - j);
      if (!inF && r() < 0.48) ctx.fillRect(x + pad + i * cell, y + pad + j * cell, cell, cell);
    }
  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    const X = x + pad + fx * cell, Y = y + pad + fy * cell;
    ctx.fillRect(X, Y, 7 * cell, 7 * cell);
    ctx.fillStyle = "#fff";
    ctx.fillRect(X + cell, Y + cell, 5 * cell, 5 * cell);
    ctx.fillStyle = "#111";
    ctx.fillRect(X + 2 * cell, Y + 2 * cell, 3 * cell, 3 * cell);
  }
  ctx.restore();
}

function barcode(ctx: Ctx, x: number, y: number, w: number, h: number, seed: string) {
  let s = 0;
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const r = rng(s || 5);
  ctx.fillStyle = "#111";
  let p = 0;
  while (p < w) {
    const bw = 0.8 + Math.floor(r() * 3) * 0.9;
    if (p + bw > w) break;
    ctx.fillRect(x + p, y, bw, h);
    p += bw + 0.9 + Math.floor(r() * 3) * 0.9;
  }
}

export function drawBill(canvas: HTMLCanvasElement, b: BillValues, qr: BillQr | null = null) {
  if (b.layout === "classic") return drawBillClassic(canvas, b);
  canvas.width = BILL_W;
  canvas.height = BILL_H;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, BILL_W, BILL_H);
  ctx.scale(S, S);

  const kwh = billKwh(b);
  const charges = billTotal(b);
  const due = charges + b.charges.remainingBalance;
  const c = b.charges;
  const rate = kwh > 0 ? charges / kwh : 0;
  const days = Math.max(1, Math.round((Date.parse(b.periodEnd) - Date.parse(b.periodStart)) / 86400000));
  const n0 = (v: number) => v.toLocaleString("en-US");

  text(ctx, "SAMPLE BILL. For demonstration only. Not a real bill.", 460, 62, { size: 17.5, weight: 700, family: A, color: RED, align: "center" });

  // Customer block
  text(ctx, "Customer name and service address", 44, 80, { size: 11, family: A, color: GREY });
  text(ctx, b.customerName, 44, 106, { size: 19, weight: 700, family: A, color: INK, ls: 0.3 });
  text(ctx, b.address1, 44, 124, { size: 13, family: A, color: INK });
  text(ctx, b.address2, 44, 140, { size: 13, family: A, color: INK });
  text(ctx, "Meter No.", 44, 163, { size: 13, family: A, color: GREY });
  text(ctx, b.meterNo, 113, 163, { size: 15, weight: 700, family: A, color: INK });

  // Utility block
  logo(ctx, 515, 115, 34);
  text(ctx, "Billing Invoice", 573, 92, { size: 22, weight: 700, family: A, color: INK });
  text(ctx, b.utilityName, 573, 113, { size: 16, weight: 700, family: A, color: INK });
  text(ctx, b.utilityAddress, 573, 131, { size: 12, family: A, color: GREY });
  text(ctx, "Billing Invoice No.", 573, 149, { size: 12, family: A, color: GREY });
  text(ctx, b.invoiceNo, 687, 149, { size: 13, weight: 700, family: A, color: INK });
  text(ctx, "Page 1 of 1", 573, 166, { size: 12, family: A, color: GREY });

  // Your electric bill
  bar(ctx, 44, 180, 435, "Your electric bill");
  const lab = { size: 12.5, family: A, color: GREY };
  const val = { size: 18, weight: 700, family: A, color: INK };
  const fields: [string, string][] = [
    ["Billing Period", `${fmtDate(b.periodStart)} to ${fmtDate(b.periodEnd)}`],
    ["Bill Date", fmtDate(b.billDate)],
    ["Date of Meter Reading", fmtDate(b.readDate)],
    ["Electric Meter Number", b.meterNo],
    ["Date of Next Meter Reading", fmtDate(b.nextReadDate)],
    ["Customer Type", "Residential"],
    ["Your rate this month", `₱${rate.toFixed(2)} per kWh`],
  ];
  fields.forEach(([l, v], i) => {
    text(ctx, l, 51, 226 + i * 42.2, lab);
    text(ctx, v, 51, 246 + i * 42.2, { ...val, size: v.length > 24 ? 16.5 : 18 });
  });
  line(ctx, 315, 208, 315, 512, "#999", 1);
  const cx = 396;
  const ctr = { size: 11.5, family: A, color: GREY, align: "center" as const };
  const big = { size: 27, weight: 700, family: A, color: INK, align: "center" as const };
  text(ctx, "Current Reading", cx, 266, ctr);
  text(ctx, n0(b.presentReading), cx, 296, big);
  const sq = (y: number, s: string) => {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 13, y, 26, 26);
    ctx.restore();
    text(ctx, s, cx, y + 19, { size: 16, weight: 700, family: A, color: INK, align: "center" });
  };
  sq(304, "−");
  text(ctx, "Previous Reading", cx, 346, ctr);
  text(ctx, n0(b.previousReading), cx, 375, big);
  sq(384, "=");
  text(ctx, "Actual Consumption", cx, 427, ctr);
  const kStr = n0(kwh);
  ctx.save();
  ctx.font = "700 32px Arial, sans-serif";
  const kw = ctx.measureText(kStr).width;
  ctx.font = "700 14px Arial, sans-serif";
  const uw = ctx.measureText(" kWh").width;
  ctx.restore();
  text(ctx, kStr, cx - (kw + uw) / 2, 462, { size: 32, weight: 700, family: A, color: INK });
  text(ctx, " kWh", cx - (kw + uw) / 2 + kw, 462, { size: 14, weight: 700, family: A, color: INK });

  // Account box
  ctx.fillStyle = BOX;
  ctx.fillRect(495, 180, 385, 124);
  ctx.save();
  ctx.strokeStyle = "#8a8a8a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(495, 180, 385, 124);
  ctx.restore();
  text(ctx, "Customer Account Number", 511, 203, lab);
  text(ctx, b.accountNo, 511, 234, { size: 30, weight: 700, family: A, color: INK });
  text(ctx, "Due Date", 511, 272, lab);
  text(ctx, fmtDate(b.dueDate), 511, 292, { size: 17, weight: 700, family: A, color: INK });
  text(ctx, "Please Pay", 865, 259, { ...lab, align: "right" });
  text(ctx, `₱${peso(due)}`, 865, 290, { size: 30, weight: 700, family: A, color: INK, align: "right" });

  // Bill computation summary
  bar(ctx, 495, 314, 385, "Bill Computation Summary");
  const rows: [string, number, boolean][] = [
    ["Remaining balance from previous bill", c.remainingBalance, false],
    ["Charges for this billing period", charges, true],
    ["Generation", c.generation, false],
    ["Transmission", c.transmission, false],
    ["System Loss", c.systemLoss, false],
    ["Distribution", distributionTotal(b), false],
    ["Senior Citizen", c.seniorCitizen, false],
    ["Government Taxes", c.taxes, false],
    ["Universal Charges", c.universal, false],
    ["FiT-All (Renewable)", c.fitAll, false],
    ["GEA-All (Renewable)", c.geaAll, false],
    ["Lifeline", c.lifeline, false],
  ];
  rows.forEach(([l, v, bold], i) => {
    const y = 357 + i * 21.1;
    text(ctx, l, i < 2 ? 502 : 517, y, { size: 14, weight: bold ? 700 : 400, family: A, color: INK });
    text(ctx, peso(v), 872, y, { size: 14, weight: 700, family: A, color: INK, align: "right" });
    if (i < rows.length - 1) line(ctx, 495, y + 6, 880, y + 6, RULE, 0.8);
  });
  ctx.fillStyle = BOX;
  ctx.fillRect(495, 597, 385, 33);
  line(ctx, 495, 597, 880, 597, "#8a8a8a", 3);
  text(ctx, "Total Amount Due", 502, 619, { size: 16, weight: 700, family: A, color: INK });
  text(ctx, `₱${peso(due)}`, 872, 619, { size: 17, weight: 700, family: A, color: INK, align: "right" });

  // Monthly consumption chart
  bar(ctx, 44, 650, 445, "Your monthly consumption (kWh)");
  text(ctx, "kWh", 44, 695, { size: 9, family: A, color: LIGHT });
  const months = historyMonths(b);
  const endYear = Number(b.periodEnd.slice(0, 4));
  const prevYear = endYear - 1;
  const byCal: { prev?: number; cur?: number }[] = Array.from({ length: 12 }, () => ({}));
  months.forEach((m, i) => {
    const [y, mo] = m.split("-").map(Number);
    if (y === endYear) byCal[mo - 1].cur = b.history[i];
    else byCal[mo - 1].prev = b.history[i];
  });
  const maxV = Math.max(1, ...b.history);
  const base = 846;
  const scale = 150 / maxV;
  byCal.forEach((v, i) => {
    const x = 112 + i * 31.7;
    const vv = v.cur ?? v.prev;
    if (vv != null) {
      ctx.fillStyle = v.cur != null ? "#4a4a4a" : "#c2c2c2";
      ctx.fillRect(x - 6, base - vv * scale, 12, vv * scale);
    }
    text(ctx, MONTHS[i], x, 860, { size: 12.5, weight: 700, family: A, color: INK, align: "center" });
    if (v.prev != null) text(ctx, String(v.prev), x, 878, { size: 14, weight: 700, family: A, color: INK, align: "center" });
    if (v.cur != null) text(ctx, String(v.cur), x, 897, { size: 14, weight: 700, family: A, color: INK, align: "center" });
  });
  ctx.fillStyle = "#c2c2c2";
  ctx.fillRect(46, 874, 5, 5);
  text(ctx, String(prevYear), 57, 880, { size: 10.5, weight: 700, family: A, color: INK });
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(46, 889, 5, 5);
  text(ctx, String(endYear), 57, 895, { size: 10.5, weight: 700, family: A, color: INK });
  line(ctx, 88, 884, 478, 884, RULE, 1);
  line(ctx, 88, 902, 478, 902, RULE, 1);

  // Consumption explained
  bar(ctx, 495, 650, 385, "Your consumption explained");
  const prevK = b.history[10] ?? 0;
  const diff = kwh - prevK;
  const pct = prevK ? Math.abs((diff / prevK) * 100).toFixed(1) : "0.0";
  if (diff === 0) rich(ctx, ["This bill is ", "*the same*", " as the previous billing"], 494, 698, 14);
  else rich(ctx, ["This bill is ", `*${pct}% ${diff < 0 ? "lower" : "higher"} (${diff < 0 ? "−" : "+"}${Math.abs(diff)} kWh)*`, " vs previous billing"], 494, 698, 14);
  text(ctx, "period", 494, 716, { size: 14, family: A, color: INK });
  ctx.save();
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(495, 728, 385, 93);
  ctx.restore();
  text(ctx, "Your typical consumption", 497, 750, { size: 14, weight: 700, family: A, color: INK });
  const typical = Math.round(b.history.reduce((s, v) => s + v, 0) / 12);
  const stat = (x: number, v: string, unit: string, cap: string[]) => {
    ctx.save();
    ctx.font = "700 22px Arial, sans-serif";
    const w1 = ctx.measureText(v).width;
    ctx.font = "700 11px Arial, sans-serif";
    const w2 = unit ? ctx.measureText(" " + unit).width : 0;
    ctx.restore();
    text(ctx, v, x - (w1 + w2) / 2, 780, { size: 22, weight: 700, family: A, color: INK });
    if (unit) text(ctx, " " + unit, x - (w1 + w2) / 2 + w1, 780, { size: 11, weight: 700, family: A, color: INK });
    cap.forEach((cl, i) => text(ctx, cl, x, 797 + i * 12, { size: 10, family: A, color: GREY, align: "center" }));
  };
  stat(557, String(typical), "kWh", ["ave. monthly (last 12", "months)"]);
  stat(692, (kwh / days).toFixed(2), "kWh", ["ave. daily this period"]);
  stat(816, `₱${(charges / days).toFixed(2)}`, "", ["ave. daily cost"]);
  rich(ctx, ["Average temperature this month: ", `*${b.avgTemp.toFixed(1)}°C*`], 494, 846, 14);

  bar(ctx, 495, 857, 385, "Environmental Impact");
  const env: [number, string, string][] = [
    [557, `${n0(kwh)} kWh`, "electricity used"],
    [685, (kwh * 0.00069333).toFixed(4), "tCO2 equivalent"],
    [816, `${Math.round(kwh / 30)} trees`, "offset"],
  ];
  for (const [x, v, cap] of env) {
    text(ctx, v, x, 905, { size: 17, weight: 700, family: A, color: INK, align: "center" });
    text(ctx, cap, x, 920, { size: 10, family: A, color: GREY, align: "center" });
  }

  // Payment stub (with the lab month's QR on the left when there is one)
  const stubBottom = qr ? 1145 : 1135;
  ctx.save();
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(44, 946);
  ctx.lineTo(881, 946);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(44, 946);
  ctx.lineTo(44, stubBottom);
  ctx.lineTo(881, stubBottom);
  ctx.lineTo(881, 946);
  ctx.stroke();
  ctx.restore();
  const para = "Pay the amount below on or before the due date at any accredited payment center or online channel. Bring this page or show the account number.";
  if (qr) {
    // 193 layout units = 44 mm on A4: big enough to decode from a photo of the whole bill
    if (qr.small) drawQr(ctx, qr.url, 49 + (193 - 145) / 2, 949 + (193 - 145) / 2, 145, "M"); // 145 units = 33 mm
    else drawQr(ctx, qr.url, 49, 949, 193);
    text(ctx, qr.label, 258, 969, { size: 13.5, weight: 700, family: A, color: INK });
    text(ctx, "Scan the bill in Kahati: this QR loads the month.", 258, 984, { size: 10.5, family: A, color: GREY });
    text(ctx, "Payment Instruction", 258, 1006, { size: 15, weight: 700, family: A, color: INK });
    wrap(ctx, para, 335, { size: 12, family: A }).forEach((l, i) => text(ctx, l, 258, 1023 + i * 14, { size: 12, family: A, color: INK }));
    barcode(ctx, 260, 1075, 320, 46, b.accountNo + String(due));
    text(ctx, "Barcode placeholder", 258, 1134, { size: 10, family: A, color: LIGHT });
  } else {
    qrPlaceholder(ctx, 58, 974, 132, b.accountNo + b.invoiceNo);
    text(ctx, "Payment Instruction", 212, 983, { size: 17, weight: 700, family: A, color: INK });
    wrap(ctx, para, 365, { size: 13.5, family: A }).forEach((l, i) => text(ctx, l, 212, 1003 + i * 16, { size: 13.5, family: A, color: INK }));
    barcode(ctx, 215, 1045, 320, 59, b.accountNo + String(due));
    text(ctx, "Barcode placeholder", 212, 1116, { size: 10, family: A, color: LIGHT });
  }
  ctx.fillStyle = "#ececec";
  ctx.fillRect(604, 960, 264, 164);
  text(ctx, "Customer Account Number", 617, 977, { size: 11.5, family: A, color: GREY });
  text(ctx, b.accountNo, 617, 1003, { size: 21, weight: 700, family: A, color: INK });
  text(ctx, "Amount Due", 617, 1022, { size: 11.5, family: A, color: GREY });
  text(ctx, `₱${peso(due)}`, 617, 1048, { size: 25, weight: 700, family: A, color: INK });
  text(ctx, "Due Date", 617, 1074, { size: 12.5, family: A, color: GREY });
  text(ctx, fmtDate(b.dueDate), 676, 1074, { size: 14, weight: 700, family: A, color: INK });

  // Optional distribution breakdown (not on the printed prop; adds the fixed 5.00 / 16.38 lines)
  if (b.showBreakdown) {
    const top = qr ? 1160 : 1152, first = qr ? 1203 : 1196, step = qr ? 18 : 19;
    bar(ctx, 44, top, 837, "Distribution charge details");
    const d: [string, string, number][] = [
      ["Distribution Charge", `${n0(kwh)} kWh`, c.distributionCharge],
      ["Fixed Metering Charge (per customer)", "1 month", c.fixedMetering],
      ["Metering Charge per kWh", `${n0(kwh)} kWh`, c.meteringPerKwh],
      ["Fixed Supply Charge (per customer)", "1 month", c.fixedSupply],
      ["Supply Charge per kWh", `${n0(kwh)} kWh`, c.supplyPerKwh],
    ];
    d.forEach(([l, basis, v], i) => {
      const y = first + i * step;
      text(ctx, l, 52, y, { size: 13.5, family: A, color: INK });
      text(ctx, basis, 640, y, { size: 13.5, family: A, color: INK, align: "right" });
      text(ctx, peso(v), 872, y, { size: 13.5, weight: 700, family: A, color: INK, align: "right" });
      line(ctx, 44, y + 5, 881, y + 5, RULE, 0.8);
    });
    text(ctx, "Distribution", 52, first + 5 * step + 2, { size: 13.5, weight: 700, family: A, color: INK });
    text(ctx, peso(distributionTotal(b)), 872, first + 5 * step + 2, { size: 13.5, weight: 700, family: A, color: INK, align: "right" });
  }

  // Diagonal SAMPLE watermark (multiply keeps text dark, tints white areas grey)
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.translate(470, 640);
  ctx.rotate(-0.98);
  text(ctx, "SAMPLE", 0, 65, { size: 185, weight: 700, family: A, color: "#dedede", align: "center" });
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
