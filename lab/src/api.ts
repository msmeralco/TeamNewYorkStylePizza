// Talks to the live Kahati reader. See kahati/docs/API.md (POST /api/scan/bill, /api/scan/meter).
import { expectedBillScan, type BillValues, load, printsBreakdown, save } from "./model";
import { expectedMeter, type MeterSpec } from "./draw/meter";

export const DEFAULT_API = "https://kahati.vercel.app";

export interface FieldResult {
  field: string;
  expected: string;
  read: string;
  pass: boolean;
}

export interface RunResult {
  id: string;
  time: string;
  batch: string | null;
  kind: "bill" | "meter";
  label: string;
  conditions: string;
  fields: FieldResult[];
  confidence: number | null;
  provider: string | null;
  ms: number;
  error: string | null;
  note: string | null;
  /** The reader's `scan` object as returned (for inspecting failures). */
  raw?: unknown;
}

/** Downscale and JPEG-encode a canvas for upload (the API caps base64 at 4 MiB). */
export function canvasToJpeg(canvas: HTMLCanvasElement, longSide: number, quality: number): string {
  const k = Math.min(1, longSide / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas");
  c.width = Math.round(canvas.width * k);
  c.height = Math.round(canvas.height * k);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

async function post(base: string, path: string, body: unknown) {
  const t0 = performance.now();
  const res = await fetch(base.replace(/\/$/, "") + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - t0);
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const e = json?.error;
    throw Object.assign(new Error(e ? `${res.status} ${e.code}: ${e.message}` : `HTTP ${res.status}`), { ms });
  }
  return { json, ms };
}

const num = (a: unknown, b: unknown) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.005;
const show = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

function f(field: string, expected: unknown, read: unknown, pass?: boolean): FieldResult {
  const p = pass ?? (typeof expected === "number" ? num(expected, read) : String(expected) === String(read ?? ""));
  return { field, expected: show(expected), read: show(read), pass: p };
}

export function compareBill(b: BillValues, scan: any): FieldResult[] {
  const e = expectedBillScan(b);
  const out: FieldResult[] = [
    f("periodStart", e.periodStart, scan?.periodStart),
    f("periodEnd", e.periodEnd, scan?.periodEnd),
    f("readDate", e.readDate, scan?.readDate),
    f("nextReadDate", e.nextReadDate, scan?.nextReadDate),
    f("kwh", e.kwh, scan?.kwh),
    f("amount", e.amount, scan?.amount),
  ];
  for (const k of Object.keys(e.lines) as (keyof typeof e.lines)[]) {
    if (!printsBreakdown(b) && (k === "distribution" || k === "supplyMetering")) continue;
    out.push(f(`lines.${k}`, e.lines[k], scan?.lines?.[k]));
  }
  if (!printsBreakdown(b)) {
    // Without the breakdown the bill only prints Distribution as one number, so score the two app lines together.
    const d = scan?.lines?.distribution, sm = scan?.lines?.supplyMetering;
    const got = typeof d === "number" ? Math.round((d + (typeof sm === "number" ? sm : 0)) * 100) / 100 : d;
    out.push(f("lines.distribution+supplyMetering", Math.round((e.lines.distribution + e.lines.supplyMetering) * 100) / 100, got));
  }
  out.push(
    ...(printsBreakdown(b) ? [f("fixedCharges", e.fixedCharges, scan?.fixedCharges)] : []),
    f("previousReading", e.previousReading, scan?.previousReading),
    f("presentReading", e.presentReading, scan?.presentReading),
    f("accountLast4", e.accountLast4, scan?.accountLast4),
  );
  const got: { month: string; kwh: number }[] = Array.isArray(scan?.history) ? scan.history : [];
  const hits = e.history.filter((h) => got.some((g) => g.month === h.month && num(g.kwh, h.kwh))).length;
  out.push(f("history (months right)", `${e.history.length}/12`, `${hits}/12`, hits === e.history.length));
  return out;
}

export function compareMeter(m: MeterSpec, scan: any): FieldResult[] {
  const e = expectedMeter(m);
  return [
    f("value", e.value, scan?.value),
    f("digitsText", e.digitsText, scan?.digitsText),
    f("serial", e.serial, scan?.serial),
  ];
}

const uid = () => Math.random().toString(36).slice(2, 10);

export async function runBill(base: string, b: BillValues, jpeg: string, label: string, conditions: string, batch: string | null): Promise<RunResult> {
  const time = new Date().toISOString();
  try {
    const { json, ms } = await post(base, "/api/scan/bill", { imageBase64: jpeg, mimeType: "image/jpeg" });
    const notes = [json?.sanity?.sanityNote, json?.sanity?.linesNote, json?.scan?.missing?.length ? `missing: ${json.scan.missing.join(", ")}` : null].filter(Boolean);
    return {
      id: uid(), time, batch, kind: "bill", label, conditions,
      fields: compareBill(b, json?.scan), confidence: json?.scan?.confidence ?? null, provider: json?.scan?.provider ?? null,
      ms, error: null, note: notes.length ? notes.join(" | ") : null, raw: json?.scan,
    };
  } catch (err: any) {
    return { id: uid(), time, batch, kind: "bill", label, conditions, fields: [], confidence: null, provider: null, ms: err?.ms ?? 0, error: String(err?.message ?? err), note: null };
  }
}

export interface MeterContext {
  id: string;
  householdId: string | null;
  previous: number | null;
}

export async function runMeter(base: string, m: MeterSpec, ctx: MeterContext, jpeg: string, label: string, conditions: string, batch: string | null): Promise<RunResult> {
  const time = new Date().toISOString();
  const body: any = {
    imageBase64: jpeg,
    mimeType: "image/jpeg",
    meter: { id: ctx.id, householdId: ctx.householdId, serial: m.serial, type: "digital", digits: 5 },
  };
  if (ctx.previous != null)
    body.previous = { id: "rPrev", meterId: ctx.id, value: ctx.previous, capturedAt: "2026-10-31", source: "typed", confidence: null, confirmed: true };
  try {
    const { json, ms } = await post(base, "/api/scan/meter", body);
    const v = json?.validation;
    const issues = (v?.issues ?? []).map((i: any) => i.code).join(", ");
    return {
      id: uid(), time, batch, kind: "meter", label, conditions,
      fields: compareMeter(m, json?.scan), confidence: json?.scan?.confidence ?? null, provider: json?.scan?.provider ?? null,
      ms, error: null, note: [json?.serialLine, issues ? `issues: ${issues}` : null, json?.scan?.secondRead != null ? `secondRead ${json.scan.secondRead}` : null].filter(Boolean).join(" | ") || null,
      raw: json?.scan,
    };
  } catch (err: any) {
    return { id: uid(), time, batch, kind: "meter", label, conditions, fields: [], confidence: null, provider: null, ms: err?.ms ?? 0, error: String(err?.message ?? err), note: null };
  }
}

// ---- results store ----
const KEY = "stresslab.results.v1";
export const loadResults = () => load<RunResult[]>(KEY, []);
export const saveResults = (r: RunResult[]) => save(KEY, r.slice(-2000));

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per field (long format), easy to pivot in a spreadsheet. */
export function resultsCsv(rows: RunResult[]) {
  const head = ["time", "run_id", "batch", "kind", "label", "conditions", "field", "expected", "read", "pass", "confidence", "provider", "ms", "error", "note"];
  const out = [head.join(",")];
  for (const r of rows) {
    const base = [r.time, r.id, r.batch ?? "", r.kind, r.label, r.conditions];
    const tail = [r.confidence ?? "", r.provider ?? "", r.ms, r.error ?? "", r.note ?? ""];
    if (!r.fields.length) out.push([...base, "", "", "", "", ...tail].map(csvCell).join(","));
    for (const fr of r.fields) out.push([...base, fr.field, fr.expected, fr.read, fr.pass ? "1" : "0", ...tail].map(csvCell).join(","));
  }
  return out.join("\n");
}

export function summarize(rows: RunResult[]) {
  const done = rows.filter((r) => !r.error);
  const fields = done.flatMap((r) => r.fields);
  const fieldPass = fields.filter((x) => x.pass).length;
  const allPass = done.filter((r) => r.fields.length && r.fields.every((x) => x.pass)).length;
  const byField = new Map<string, { n: number; pass: number }>();
  for (const x of fields) {
    const e = byField.get(x.field) ?? { n: 0, pass: 0 };
    e.n++;
    if (x.pass) e.pass++;
    byField.set(x.field, e);
  }
  return { runs: rows.length, errors: rows.length - done.length, read: done.length, allPass, fields: fields.length, fieldPass, byField };
}
