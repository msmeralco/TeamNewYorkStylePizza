// Draws the sample bill in the layout of kahati-hackathon-kit/print/sample_bill.png ("Sample Electric Co." prop).
// Coordinates are in "layout units" (1414 wide), scaled to the 2481 x 3509 px A4 canvas (about 300 dpi).
import { type BillValues, billKwh, billTotal, distributionTotal, fmtDate, historyMonths, MONTHS, peso } from "../model";
import { type Ctx, line, rrect, text, wrap } from "./common";

const W = 2481;
const H = 3509;
const S = W / 1414;

const NAVY = "#2c4a62";
const RED = "#b3261e";
const INK = "#1b1f24";
const GREY = "#5b636b";
const RULE = "#d9dde1";
const PANEL = "#eef0f2";

function panel(ctx: Ctx, x: number, y: number, w: number, h: number, title: string) {
  ctx.save();
  rrect(ctx, x, y, w, h, 8);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#c9ced3";
  ctx.lineWidth = 2;
  ctx.stroke();
  rrect(ctx, x, y, w, 45, [8, 8, 0, 0]);
  ctx.fillStyle = NAVY;
  ctx.fill();
  ctx.restore();
  text(ctx, title, x + 19, y + 33, { size: 22, weight: 700, family: "fira", color: "#fff", ls: 2.4 });
}

function niceStep(max: number) {
  const raw = max / 2.4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

export function drawBillClassic(canvas: HTMLCanvasElement, b: BillValues) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.scale(S, S);

  const kwh = billKwh(b);
  const total = billTotal(b);
  const due = total + b.charges.remainingBalance;
  const c = b.charges;
  const rate = kwh > 0 ? total / kwh : 0;
  const kwhStr = `${kwh.toLocaleString("en-US")} kWh`;
  const gea = c.geaAll !== 0;

  ctx.save();
  ctx.strokeStyle = RED;
  ctx.lineWidth = 3.5;
  ctx.strokeRect(82, 55, 1250, 70);
  ctx.restore();
  text(ctx, "SAMPLE BILL. For demonstration only. Not a real bill.", 707, 102, { size: 30, weight: 700, family: "fira", color: RED, align: "center" });

  rrect(ctx, 82, 147, 73, 72, 9);
  ctx.fillStyle = NAVY;
  ctx.fill();
  text(ctx, "SE", 118.5, 197, { size: 30, weight: 800, family: "fira", color: "#fff", align: "center" });
  text(ctx, "Sample Electric Co.", 175, 190, { size: 44, weight: 600, family: "fira", color: NAVY });
  text(ctx, "Invented utility for a hackathon demo", 175, 215, { size: 19, color: GREY });
  text(ctx, "ELECTRIC BILL", 1332, 185, { size: 34, weight: 700, family: "fira", color: NAVY, align: "right", ls: 2 });
  text(ctx, "Page 1 of 1", 1332, 214, { size: 19, color: GREY, align: "right" });
  line(ctx, 82, 238, 1332, 238, NAVY, 3);

  text(ctx, b.customerName, 82, 288, { size: 26, weight: 700, family: "fira" });
  const addr = `${b.address1} ${b.address2}`.replace(/,\s*$/, "");
  let as = 21;
  ctx.save();
  for (; as > 14; as -= 0.5) {
    ctx.font = `400 ${as}px "Noto Sans", Arial, sans-serif`;
    if (ctx.measureText(addr).width <= 640) break;
  }
  ctx.restore();
  text(ctx, addr, 82, 320, { size: as });
  text(ctx, `Meter No.: ${b.meterNo}     Customer type: Residential`, 82, 352, { size: 19, color: GREY });

  panel(ctx, 82, 372, 630, 446, "BILL SUMMARY");
  const lab = { size: 18, color: GREY };
  const val = { size: 21, weight: 700, family: "fira" as const };
  text(ctx, "Billing period", 101, 451, lab);
  wrap(ctx, `${fmtDate(b.periodStart)} to ${fmtDate(b.periodEnd)}`, 280, val).slice(0, 2).forEach((l, i) => text(ctx, l, 101, 480 + i * 29, val));
  text(ctx, "Bill date", 411, 451, lab);
  text(ctx, fmtDate(b.billDate), 411, 480, val);
  text(ctx, "Date of meter reading", 101, 544, lab);
  text(ctx, fmtDate(b.readDate), 101, 572, val);
  text(ctx, "Meter number", 411, 544, lab);
  text(ctx, b.meterNo, 411, 572, val);
  text(ctx, "Date of next meter reading", 101, 607, lab);
  text(ctx, fmtDate(b.nextReadDate), 101, 635, val);
  text(ctx, "Customer type", 411, 607, lab);
  text(ctx, "Residential", 411, 635, val);
  const boxes: [number, string, string][] = [
    [101, "Current reading", String(b.presentReading)],
    [310, "Previous reading", String(b.previousReading)],
    [518, "Actual consumption", kwhStr],
  ];
  for (const [x, l, v] of boxes) {
    rrect(ctx, x, 655, 174, 86, 6);
    ctx.fillStyle = PANEL;
    ctx.fill();
    text(ctx, l, x + 87, 682, { ...lab, align: "center" });
    text(ctx, v, x + 87, 726, { size: v.length > 8 ? 32 : 38, weight: 700, family: "fira", align: "center" });
  }
  text(ctx, "−", 292, 712, { size: 34, weight: 700, family: "fira", align: "center" });
  text(ctx, "=", 501, 712, { size: 34, weight: 700, family: "fira", align: "center" });
  line(ctx, 82, 757, 712, 757, RULE, 1.5);
  text(ctx, "Your rate this month", 101, 800, { size: 20, color: GREY });
  text(ctx, `₱${rate.toFixed(2)} per kWh`, 692, 800, { size: 31, weight: 700, family: "fira", align: "right" });

  panel(ctx, 82, 838, 630, 145, "METERING INFORMATION");
  const mh = { size: 17, color: GREY, align: "center" as const };
  text(ctx, "Meter number", 148, 916, mh);
  text(ctx, "Previous reading", 288, 905, mh);
  text(ctx, fmtDate(b.periodStart), 288, 927, mh);
  text(ctx, "Current reading", 433, 905, mh);
  text(ctx, fmtDate(b.periodEnd), 433, 927, mh);
  text(ctx, "Multiplier", 550, 916, mh);
  text(ctx, "Registered", 654, 916, mh);
  line(ctx, 82, 940, 712, 940, RULE, 1.5);
  const mv = { size: 23, weight: 700, family: "fira" as const, align: "center" as const };
  text(ctx, b.meterNo, 148, 969, mv);
  text(ctx, String(b.previousReading), 288, 969, mv);
  text(ctx, String(b.presentReading), 433, 969, mv);
  text(ctx, String(b.multiplier), 550, 969, mv);
  text(ctx, kwhStr, 654, 969, { ...mv, size: kwhStr.length > 8 ? 20 : 23 });

  ctx.save();
  rrect(ctx, 750, 263, 582, 280, 9);
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();
  text(ctx, "Account no.", 787, 306, lab);
  text(ctx, b.accountNo, 787, 362, { size: 29, weight: 700, family: "fira" });
  text(ctx, "Due date", 1075, 306, lab);
  text(ctx, fmtDate(b.dueDate), 1075, 362, { size: 29, weight: 700, family: "fira" });
  line(ctx, 752, 393, 1330, 393, RULE, 1.5);
  text(ctx, "Total amount due", 787, 434, lab);
  text(ctx, `₱${peso(due)}`, 787, 510, { size: 56, weight: 800, family: "fira" });

  panel(ctx, 750, 562, 582, 430, "BILL COMPUTATION SUMMARY");
  const sum: [string, string][] = [
    ["Remaining balance from previous bill", `₱${peso(c.remainingBalance)}`],
    ["Generation", peso(c.generation)],
    ["Transmission", peso(c.transmission)],
    ["System Loss", peso(c.systemLoss)],
    ["Distribution (Sample Electric Co.)", peso(distributionTotal(b))],
    ["Senior Citizen", peso(c.seniorCitizen)],
    ["Government Taxes", peso(c.taxes)],
    ["Universal Charges", peso(c.universal)],
    ["FIT-All (Renewable)", peso(c.fitAll)],
    ...(gea ? ([["GEA-All (Renewable)", peso(c.geaAll)]] as [string, string][]) : []),
    ["Lifeline", peso(c.lifeline)],
  ];
  const step = gea ? 31 : 34;
  sum.forEach(([l, v], i) => {
    const y = 632 + i * step;
    text(ctx, l, 767, y, { size: 20 });
    text(ctx, v, 1312, y, { size: 20, align: "right" });
    if (i < sum.length - 1) line(ctx, 752, y + 9, 1330, y + 9, RULE, 1);
  });
  line(ctx, 752, 948, 1330, 948, NAVY, 2.5);
  text(ctx, "Total amount due", 767, 982, { size: 27, weight: 800, family: "fira" });
  text(ctx, `₱${peso(due)}`, 1312, 982, { size: 27, weight: 800, family: "fira", align: "right" });

  panel(ctx, 82, 1010, 1250, 565, "HOW YOUR BILL WAS COMPUTED");
  text(ctx, "Rate components", 101, 1078, lab);
  text(ctx, "Charge", 424, 1078, lab);
  text(ctx, "Basis", 1106, 1078, { ...lab, align: "right" });
  text(ctx, "Amount (₱)", 1312, 1078, { ...lab, align: "right" });
  line(ctx, 84, 1087, 1330, 1087, RULE, 1);
  const k = kwhStr;
  const rows: [string, string, string, number][] = [
    ["Generation", "Generation Charge", k, c.generation],
    ["Transmission", "Transmission Charge", k, c.transmission],
    ["System Loss", "System Loss Charge", k, c.systemLoss],
    ["Distribution", "Distribution Charge", k, c.distributionCharge],
    ["", "Fixed Metering Charge (per customer)", "1 month", c.fixedMetering],
    ["", "Metering Charge per kWh", k, c.meteringPerKwh],
    ["", "Fixed Supply Charge (per customer)", "1 month", c.fixedSupply],
    ["", "Supply Charge per kWh", k, c.supplyPerKwh],
    ["Senior Citizen", "Senior Citizen Subsidy", k, c.seniorCitizen],
    ["Government Taxes", "Taxes on this bill", "", c.taxes],
    ["Universal Charges", "Universal Charges", k, c.universal],
    ["FIT-All (Renewable)", "FIT-All (Renewable)", k, c.fitAll],
    ...(gea ? ([["GEA-All (Renewable)", "GEA-All (Renewable)", k, c.geaAll]] as [string, string, string, number][]) : []),
    ["Lifeline", "Lifeline Subsidy", k, c.lifeline],
  ];
  const rs = gea ? 32 : 34.3;
  rows.forEach(([g, ch, basis, amt], i) => {
    const y = 1110 + i * rs;
    if (g) text(ctx, g, 101, y, { size: 19, weight: 700, family: "fira" });
    text(ctx, ch, 424, y, { size: 20 });
    if (basis) text(ctx, basis, 1106, y, { size: 20, align: "right" });
    text(ctx, peso(amt), 1312, y, { size: 20, align: "right" });
    if (i < rows.length - 1) line(ctx, rows[i + 1][0] ? 84 : 424, y + 9, 1330, y + 9, RULE, 1);
  });
  text(ctx, "(Sample Electric Co.)", 101, 1110 + 3 * rs + 27, { size: 19, weight: 700, family: "fira" });
  text(ctx, peso(distributionTotal(b)), 101, 1110 + 3 * rs + 53, { size: 19, color: "#333" });
  line(ctx, 84, 1528, 1330, 1528, NAVY, 2.5);
  text(ctx, "Charges for this billing period", 101, 1563, { size: 28, weight: 800, family: "fira" });
  text(ctx, peso(total), 1312, 1563, { size: 28, weight: 800, family: "fira", align: "right" });

  panel(ctx, 82, 1592, 1250, 345, "YOUR MONTHLY CONSUMPTION (KWH)");
  const months = historyMonths(b);
  const endYear = Number(b.periodEnd.slice(0, 4));
  const prevYear = endYear - 1;
  const LIGHT = "#b9c4ce";
  ctx.fillStyle = LIGHT;
  ctx.fillRect(195, 1647, 16, 16);
  text(ctx, String(prevYear), 218, 1663, { size: 19, color: "#333" });
  ctx.fillStyle = NAVY;
  ctx.fillRect(293, 1647, 16, 16);
  text(ctx, String(endYear), 316, 1663, { size: 19, color: "#333" });
  const maxV = Math.max(1, ...b.history);
  const st = niceStep(Math.max(maxV, 200));
  const scale = Math.min(0.45, 115 / maxV);
  const base = 1800;
  for (let t = 0; t * st <= maxV + st * 0.3 && t < 6; t++) {
    const y = base - t * st * scale;
    if (t > 0 && y < 1675) break;
    line(ctx, 197, y, 1303, y, "#e3e6e9", 1);
    text(ctx, String(t * st), 187, y + 6, { size: 17, color: GREY, align: "right" });
  }
  const byCal: { prev?: number; cur?: number; latest?: boolean }[] = Array.from({ length: 12 }, () => ({}));
  months.forEach((m, i) => {
    const [y, mo] = m.split("-").map(Number);
    if (y === endYear) byCal[mo - 1].cur = b.history[i];
    else byCal[mo - 1].prev = b.history[i];
    if (i === 11) byCal[mo - 1].latest = true;
  });
  text(ctx, String(prevYear), 165, 1849, { size: 17, color: GREY, align: "center" });
  text(ctx, String(endYear), 165, 1876, { size: 17, color: GREY, align: "center" });
  byCal.forEach((v, i) => {
    const x = 240 + i * 92.4;
    const vv = v.cur ?? v.prev;
    if (vv != null) {
      ctx.fillStyle = v.cur != null ? NAVY : LIGHT;
      ctx.fillRect(x - 18, base - vv * scale, 36, vv * scale);
    }
    text(ctx, MONTHS[i], x, 1823, { size: 19, color: "#333", align: "center" });
    text(ctx, v.prev != null ? String(v.prev) : "-", x, 1849, { size: 17, color: GREY, align: "center" });
    text(ctx, v.cur != null ? String(v.cur) : "-", x, 1876, {
      size: 17, color: v.latest ? INK : GREY, weight: v.latest ? 700 : 400, family: v.latest ? "fira" : "noto", align: "center",
    });
  });
  const prevK = b.history[10];
  const diff = kwh - prevK;
  const days = Math.max(1, Math.round((Date.parse(b.periodEnd) - Date.parse(b.periodStart)) / 86400000));
  const pct = prevK ? Math.abs((diff / prevK) * 100).toFixed(1) : "0";
  const cmp = diff === 0 ? "the same as the previous billing period" : `${Math.abs(diff)} kWh (${pct}%) ${diff < 0 ? "lower" : "higher"} than the previous billing period`;
  text(ctx, `This bill: ${kwhStr}, ${cmp}. Average use: ${(kwh / days).toFixed(1)} kWh per day.`, 101, 1923, { size: 18, color: GREY });
  text(ctx, "Sample Electric Co. is invented. Names, numbers and account are made up for a demo.", 82, 1972, { size: 18, color: GREY });
  text(ctx, "Page 1 of 1", 1332, 1972, { size: 18, color: GREY, align: "right" });

  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.translate(720, 1190);
  ctx.rotate(-0.58);
  text(ctx, "SAMPLE BILL", 0, 90, { size: 255, weight: 800, family: "fira", color: "#ececec", align: "center" });
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
