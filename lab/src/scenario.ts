// Scenario link for the Kahati app: `<app>/#scenario=<base64url(JSON)>` (and `#scenarioz=` for deflate-raw).
// JSON: { v: 1, compound: CompoundState, bau: CompoundState }, both built from GET /api/sample templates.
import { type BillValues, billKwh, billLines, billTotal, fixedCharges, type HouseholdRow, type OwnMeterRow } from "./model";
import { type StateOpts, buildBautistaState, buildCompoundState } from "./compound";

export const DEFAULT_APP = "https://kahati-app.vercel.app";

export interface Scenario {
  v: 1;
  compound: any;
  bau: any;
}

export async function buildScenario(api: string, hh: HouseholdRow[], own: OwnMeterRow, bill: BillValues, opts: StateOpts = {}): Promise<Scenario> {
  const [compound, bau] = await Promise.all([buildCompoundState(api, hh, bill, opts), buildBautistaState(api, own, opts)]);
  return { v: 1, compound, bau };
}

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(t)).arrayBuffer();
  return new Uint8Array(out);
}

export async function encodeScenario(s: Scenario) {
  const raw = new TextEncoder().encode(JSON.stringify(s));
  const plain = b64url(raw);
  const z = b64url(await pipe(raw, new CompressionStream("deflate-raw")));
  return { plain, z, jsonLength: raw.length };
}

/** Decode either form; used to check the round trip. */
export async function decodeScenario(hash: string): Promise<Scenario> {
  const m = hash.match(/#?(scenarioz?)=([A-Za-z0-9_-]+)/);
  if (!m) throw new Error("No scenario in link");
  let bytes = unb64url(m[2]);
  if (m[1] === "scenarioz") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export interface Check {
  ok: boolean;
  label: string;
  detail: string;
}

export function validate(hh: HouseholdRow[], own: OwnMeterRow, b: BillValues): Check[] {
  const lines = billLines(b);
  const linesSum = Math.round(Object.values(lines).reduce((s, v) => s + v, 0) * 100) / 100;
  const amount = billTotal(b);
  const kwh = billKwh(b);
  const subSum = hh.reduce((s, h) => s + (h.current - h.previous), 0);
  const serials = [...hh.map((h) => h.serial.trim()), own.serial.trim(), b.meterNo.trim()];
  const dupes = serials.filter((s, i) => serials.indexOf(s) !== i);
  const neg = hh.filter((h) => h.current < h.previous);
  const big = [...hh.flatMap((h) => [h.previous, h.current]), own.readDay, own.day18].filter((v) => v < 0 || v > 99999 || !Number.isInteger(v));
  const fixed = fixedCharges(b);
  return [
    { ok: Math.abs(linesSum - amount) <= 0.01, label: "Bill lines add up to the amount", detail: `lines ₱${linesSum.toFixed(2)} vs amount ₱${amount.toFixed(2)}` },
    { ok: kwh === subSum, label: "Bill kWh equals the sub-meters' kWh", detail: `bill ${kwh} kWh vs sub-meters ${subSum} kWh` },
    { ok: b.presentReading - b.previousReading === kwh, label: "Present − previous reading equals bill kWh", detail: `${b.presentReading} − ${b.previousReading} = ${b.presentReading - b.previousReading}, bill ${kwh}` },
    { ok: dupes.length === 0, label: "Serials are unique", detail: dupes.length ? `repeated: ${[...new Set(dupes)].join(", ")}` : serials.join(", ") },
    { ok: neg.length === 0, label: "No reading goes backwards", detail: neg.length ? neg.map((h) => h.name).join(", ") : "all current ≥ previous" },
    { ok: own.day18 >= own.readDay, label: "Own meter day-18 ≥ read-day", detail: `${own.readDay} → ${own.day18}` },
    { ok: big.length === 0, label: "Readings are whole numbers that fit 5 digits", detail: big.length ? big.join(", ") : "ok" },
    { ok: fixed <= lines.supplyMetering && fixed <= amount, label: "Fixed charges fit inside supply and metering", detail: `fixed ₱${fixed.toFixed(2)}, supply and metering ₱${lines.supplyMetering.toFixed(2)}` },
  ];
}

/**
 * Compact form for the QR printed on the bill: `<app>/#s2=<base64url(deflate-raw(JSON))>`, about 400 chars
 * (QR version ~15 at M) instead of ~1,450, so it decodes from a photo of the whole A4 bill.
 * JSON: { v:2, n, h:[[name,4ps,lang,serial,prev,cur] x4 hA..hD], o:[same for Bautista: readDay, day18],
 *         b:[periodStart,periodEnd,readDate,nextReadDate,kwh,amount,[7 lines],fixedCharges,prev,present,[12 history],last4,masterSerial] }
 */
export function compactScenario(s: Scenario) {
  const c = s.compound, b = c.bill, bau = s.bau;
  const val = (list: any[], m: string) => list.find((r: any) => r.meterId === m)?.value;
  const ser = (st: any, m: string) => st.meters.find((x: any) => x.id === m)?.serial;
  const L = b.lines;
  return {
    v: 2,
    n: c.compound.displayName,
    h: ["hA", "hB", "hC", "hD"].map((id) => {
      const h = c.households.find((x: any) => x.id === id);
      const m = "m" + id.slice(1);
      return [h.displayName, h.fourPs ? 1 : 0, h.language, ser(c, m), val(c.previousReadings, m), val(c.currentReadings, m)];
    }),
    o: (() => {
      const h = bau.households[0];
      return [h.displayName, h.fourPs ? 1 : 0, h.language, ser(bau, "mBautista"), val(bau.previousReadings, "mBautista"), val(bau.currentReadings, "mBautista")];
    })(),
    b: [
      b.periodStart, b.periodEnd, b.readDate, b.nextReadDate, b.kwh, b.amount,
      [L.generation, L.transmission, L.systemLoss, L.distribution, L.supplyMetering, L.taxes, L.other],
      b.fixedCharges, b.previousReading, b.presentReading, b.history.map((x: any) => x.kwh), b.accountLast4, ser(c, "mMaster"),
    ],
  };
}

export async function encodeCompact(s: Scenario) {
  const raw = new TextEncoder().encode(JSON.stringify(compactScenario(s)));
  return b64url(await pipe(raw, new CompressionStream("deflate-raw")));
}
