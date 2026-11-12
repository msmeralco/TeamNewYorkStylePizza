// Builds CompoundState bodies from the editor, starting from GET /api/sample (see kahati/docs/API.md).
import { type BillValues, CHEAT_KWH, billKwh, billLines, billTotal, fixedCharges, historyMonths, type HouseholdRow, type OwnMeterRow } from "./model";

export interface StateOpts {
  name?: string;
  cheat?: string | null;
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error ? `${res.status} ${j.error.code}: ${j.error.message}` : `HTTP ${res.status}`);
  return j;
}

// The sample templates never change during a session; fetch each once (fresh deep copy per use).
const templates = new Map<string, Promise<any>>();
async function template(url: string) {
  if (!templates.has(url)) templates.set(url, getJson(url).catch((e) => { templates.delete(url); throw e; }));
  return structuredClone(await templates.get(url)!);
}

/** Both sample states (fresh copies), the templates buildLabMonth starts from. */
export async function getTemplates(base: string) {
  const [compound, bau] = await Promise.all([template(`${base}/api/sample?which=compound`), template(`${base}/api/sample?which=bautista`)]);
  return { compound, bau };
}

const plusDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export async function buildCompoundState(base: string, hh: HouseholdRow[], b: BillValues, opts: StateOpts = {}) {
  const s = await template(`${base}/api/sample?which=compound`);
  if (opts.name) s.compound = { ...s.compound, displayName: opts.name };
  const months = historyMonths(b);
  s.households = s.households.map((orig: any) => {
    const h = hh.find((x) => x.id === orig.id);
    return h ? { ...orig, displayName: h.name, label: h.label, fourPs: h.fourPs, language: h.language } : orig;
  });
  s.meters = s.meters.map((m: any) => {
    if (m.id === "mMaster") return { ...m, serial: b.meterNo };
    const h = hh.find((x) => x.meterId === m.id);
    return h ? { ...m, serial: h.serial } : m;
  });
  s.bill = {
    ...s.bill,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    readDate: b.readDate,
    nextReadDate: b.nextReadDate,
    kwh: billKwh(b),
    amount: billTotal(b),
    lines: billLines(b),
    fixedCharges: fixedCharges(b),
    previousReading: b.previousReading,
    presentReading: b.presentReading,
    history: months.map((month, i) => ({ month, kwh: b.history[i] })),
    accountLast4: b.accountNo.replace(/\D/g, "").slice(-4),
    source: "typed",
  };
  s.previousReadings = hh.map((h) => ({
    id: `r${h.id.slice(1)}0`, meterId: h.meterId, value: h.previous + (opts.cheat === h.id ? CHEAT_KWH : 0), capturedAt: `${b.periodStart}T09:00:00+08:00`,
    source: "typed", confidence: null, confirmed: true, serialRead: h.serial,
  }));
  s.currentReadings = hh.map((h) => ({
    id: `r${h.id.slice(1)}1`, meterId: h.meterId, value: h.current, capturedAt: `${b.readDate}T09:00:00+08:00`,
    source: "typed", confidence: null, confirmed: true, serialRead: h.serial,
  }));
  return s;
}

export async function buildBautistaState(base: string, o: OwnMeterRow, opts: StateOpts = {}) {
  const s = await template(`${base}/api/sample?which=bautista`);
  if (opts.name) s.compound = { ...s.compound, displayName: `${opts.name} (own meter)` };
  s.households = s.households.map((h: any) => ({ ...h, displayName: o.name, fourPs: o.fourPs, language: o.language }));
  s.meters = s.meters.map((m: any) => ({ ...m, serial: o.serial }));
  const rd = s.bill.readDate;
  s.previousReadings = [{ id: "rBa0", meterId: o.meterId, value: o.readDay, capturedAt: rd, source: "bill", confidence: null, confirmed: true }];
  s.currentReadings = [
    { id: "rBa1", meterId: o.meterId, value: o.day18, capturedAt: `${plusDays(rd, 18)}T08:30:00+08:00`, source: "typed", confidence: null, confirmed: true, serialRead: o.serial },
  ];
  s.bill = { ...s.bill, presentReading: o.readDay, previousReading: o.readDay - s.bill.kwh };
  return s;
}

export async function postJson(base: string, path: string, body: unknown) {
  return getJson(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
