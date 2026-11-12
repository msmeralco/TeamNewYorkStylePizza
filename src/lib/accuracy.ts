// Meter-reading accuracy harness (pure). See 04_data_prep.md "How we report accuracy".
export type MeterKind = "analog_dial" | "digital";

export interface LabelRow {
  file: string;
  true_reading: string;
  meter_type: MeterKind;
  lighting: string;
  angle: string;
  split: string;
  notes: string;
}

export interface ReadResult {
  file: string;
  truth: string;
  read: string | null;
  meter_type: MeterKind;
}

export interface Score {
  total: number;
  exact: number;
  pct: number;
  byType: { analog_dial: { total: number; exact: number }; digital: { total: number; exact: number } };
  misses: ReadResult[];
}

/** Split one CSV line, honouring double quotes. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Parse the labels CSV. Skips blank lines and the example row (notes start "example row"). */
export function parseLabels(csv: string): LabelRow[] {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const need of ["file", "true_reading", "meter_type"]) {
    if (col(need) < 0) throw new Error(`Labels CSV is missing the "${need}" column.`);
  }
  const rows: LabelRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "") : "");
    const notes = get("notes");
    if (/^example row/i.test(notes)) continue;
    const file = get("file");
    if (!file) continue;
    const type = get("meter_type");
    if (type !== "analog_dial" && type !== "digital") {
      throw new Error(`Bad meter_type "${type}" for ${file}. Use analog_dial or digital.`);
    }
    // Keep leading zeros: the reading stays a string.
    const truth = get("true_reading");
    if (!truth) throw new Error(`No true_reading for ${file}.`);
    if (!/^\d+$/.test(truth)) throw new Error(`Bad true_reading "${truth}" for ${file}. Use digits only.`);
    rows.push({
      file,
      true_reading: truth,
      meter_type: type,
      lighting: get("lighting"),
      angle: get("angle"),
      split: get("split"),
      notes,
    });
  }
  return rows;
}

/** Exact match of every digit after zero-padding both to the truth length. A null read is a miss. */
export function isExact(truth: string, read: string | null): boolean {
  if (read === null) return false;
  const t = truth.replace(/\D/g, "");
  const r = read.replace(/\D/g, "");
  if (!t || !r) return false;
  return r.padStart(t.length, "0") === t.padStart(t.length, "0");
}

export function score(results: ReadResult[]): Score {
  const byType = { analog_dial: { total: 0, exact: 0 }, digital: { total: 0, exact: 0 } };
  const misses: ReadResult[] = [];
  let exact = 0;
  for (const r of results) {
    const ok = isExact(r.truth, r.read);
    byType[r.meter_type].total++;
    if (ok) {
      exact++;
      byType[r.meter_type].exact++;
    } else misses.push(r);
  }
  const total = results.length;
  return { total, exact, pct: total ? Math.round((exact / total) * 1000) / 10 : 0, byType, misses };
}

const fmtPct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "n/a");

export function formatReport(s: Score, target = 90): string {
  const out: string[] = [];
  out.push(`Exact match, every digit: ${s.exact} of ${s.total} (${fmtPct(s.exact, s.total)})`);
  const a = s.byType.analog_dial;
  const d = s.byType.digital;
  out.push(`Analog dial: ${a.exact} of ${a.total} (${fmtPct(a.exact, a.total)})`);
  out.push(`Digital: ${d.exact} of ${d.total} (${fmtPct(d.exact, d.total)})`);
  if (s.total > 0 && s.pct < target) out.push(`This is below our ${target}% target. The confirm step is the safety net.`);
  out.push("");
  if (s.misses.length === 0) out.push("Misses: none");
  else {
    out.push(`Misses (${s.misses.length}):`);
    for (const m of s.misses) out.push(`  ${m.file} (${m.meter_type}): truth ${m.truth}, read ${m.read ?? "nothing"}`);
  }
  return out.join("\n");
}
