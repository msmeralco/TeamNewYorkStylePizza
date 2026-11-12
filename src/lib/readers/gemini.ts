// Real readers: Gemini REST API over fetch (no SDK). Never logs the image or the API key.
import type { BillScan, LineKey, Lines, MeterScan } from "@/types";
import { LINE_KEYS } from "@/types";
import { ReaderError, type BillReader, type MeterReader, type ReaderImage } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Every configured key, in order: GEMINI_API_KEY first, then the backups GEMINI_API_KEY_2 .. _5
 * and any comma-separated GEMINI_API_KEYS. Duplicates and blanks are dropped.
 */
export function geminiKeys(env: Record<string, string | undefined> = process.env): string[] {
  const list = [
    env.GEMINI_API_KEY,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEY_4,
    env.GEMINI_API_KEY_5,
    ...(env.GEMINI_API_KEYS ?? "").split(","),
  ];
  return [...new Set(list.map((k) => (k ?? "").trim()).filter(Boolean))];
}

/** Default first choice; replaced by the key's own model list after a 404. */
const DEFAULT_MODEL = "gemini-2.5-flash";
/** Ranked Flash models this deployment's key can call, discovered once per server instance. */
let rankedModels: string[] | null = null;

/** The models to try, in order. GEMINI_MODEL pins a single model. */
function modelsToTry(): string[] {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  return rankedModels && rankedModels.length ? rankedModels.slice(0, 3) : [DEFAULT_MODEL];
}

/**
 * Rank model ids like "gemini-3.8-flash" newest first. Within a version, plain "-flash" comes before
 * suffixed variants such as "-flash-lite". Image, audio, live and TTS variants are left out.
 */
export function rankFlashModels(names: string[]): string[] {
  const parsed = names
    .map((n) => n.replace(/^models\//, ""))
    .map((id) => ({ id, m: /^gemini-(\d+(?:\.\d+)*)-flash(-[a-z0-9-]+)?$/.exec(id) }))
    .filter((x): x is { id: string; m: RegExpExecArray } => !!x.m && !/image|tts|audio|live|thinking|exp/.test(x.id));
  const ver = (v: string) => v.split(".").map(Number);
  parsed.sort((a, b) => {
    const va = ver(a.m[1]), vb = ver(b.m[1]);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (vb[i] ?? 0) - (va[i] ?? 0);
      if (d) return d;
    }
    return (a.m[2] ? 1 : 0) - (b.m[2] ? 1 : 0);
  });
  return [...new Set(parsed.map((p) => p.id))];
}

export function pickFlashModel(names: string[]): string | null {
  return rankFlashModels(names)[0] ?? null;
}

/** All model names this key can call with generateContent (follows pagination). */
export async function listModels(key: string): Promise<string[]> {
  const names: string[] = [];
  let token = "";
  for (let page = 0; page < 5; page++) {
    const res = await fetch(`${BASE}?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, {
      headers: { "x-goog-api-key": key },
    });
    if (!res.ok) break;
    const j: any = await res.json();
    for (const m of j?.models ?? []) {
      if ((m?.supportedGenerationMethods ?? []).includes("generateContent")) names.push(String(m.name).replace(/^models\//, ""));
    }
    token = j?.nextPageToken ?? "";
    if (!token) break;
  }
  return names;
}

/** Statuses where another key may succeed: rate limit, bad or blocked key, server trouble. */
const TRY_NEXT_KEY = new Set([401, 403, 429, 500, 502, 503, 504]);
/** Statuses where another model may succeed with the same key. */
const TRY_NEXT_MODEL = new Set([404, 429, 500, 503, 504]);

async function errorText(res: Response): Promise<string> {
  // Google's error text (e.g. "API key not valid", "model not found") never contains the key.
  return res
    .json()
    .then((j: any) => [j?.error?.status, j?.error?.message].filter(Boolean).join(" ").slice(0, 160))
    .catch(() => "");
}

async function callGemini(prompt: string, img: ReaderImage, schema: object): Promise<unknown> {
  const keys = geminiKeys();
  if (keys.length === 0) throw new ReaderError("no_api_key", "The reader is not configured.");
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: img.mimeType, data: img.base64 } }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
  });
  let lastError: ReaderError | null = null;
  let good: Response | null = null;

  keyLoop: for (const key of keys) {
    let models = modelsToTry();
    for (let i = 0; i < models.length; i++) {
      let res: Response;
      try {
        res = await fetch(`${BASE}/${models[i]}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body,
        });
      } catch {
        lastError = new ReaderError("network", "Could not reach the reading service.");
        continue keyLoop;
      }
      if (res.ok) {
        good = res;
        break keyLoop;
      }
      lastError = new ReaderError("http_error", `The reading service returned HTTP ${res.status} (${models[i]}). ${await errorText(res)}`.trim());
      // Retired or unknown model: learn this key's models once and start over with the best ones.
      if (res.status === 404 && !process.env.GEMINI_MODEL && !rankedModels) {
        rankedModels = rankFlashModels(await listModels(key).catch(() => []));
        if (rankedModels.length) {
          models = modelsToTry();
          i = -1;
          continue;
        }
      }
      if (TRY_NEXT_MODEL.has(res.status) && i < models.length - 1) continue;
      if (TRY_NEXT_KEY.has(res.status)) continue keyLoop;
      break keyLoop;
    }
  }
  if (!good) throw lastError ?? new ReaderError("http_error", "The reading service failed.");
  let reply: any;
  try {
    reply = await good.json();
  } catch {
    throw new ReaderError("bad_output", "The reading service sent an unreadable reply.");
  }
  const text = reply?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") throw new ReaderError("bad_output", "The reading service sent no result.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ReaderError("bad_output", "The reading service sent malformed JSON.");
  }
}

/** For /api/health: the ranked models in use (names only, no keys). */
export function readerModels(): string[] {
  return modelsToTry();
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function numOrNull(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "string" ? Number(x.replace(/[,\s]/g, "")) : x;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function num(x: unknown, what: string): number {
  const n = numOrNull(x);
  if (n === null) throw new ReaderError("bad_output", `Missing or invalid ${what}.`);
  return n;
}
function date(x: unknown, what: string): string {
  const s = typeof x === "string" ? x.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new ReaderError("bad_output", `Missing or invalid ${what}.`);
  }
  return s;
}
function clamp01(x: unknown, fallback = 0.5): number {
  const n = numOrNull(x);
  return n === null ? fallback : Math.min(1, Math.max(0, n));
}

// ---------- Meter ----------

const METER_SCHEMA = {
  type: "OBJECT",
  properties: {
    digits: { type: "STRING", description: "Register digits before any decimal point, digits only, keep leading zeros" },
    serial: { type: "STRING", description: "Serial number printed on the meter, empty if not visible", nullable: true },
    confidence: { type: "NUMBER", description: "0 to 1" },
  },
  required: ["digits", "confidence"],
};

function meterPrompt(expectedDigits?: number): string {
  return (
    "This is a photo of an electricity meter. Read the kWh register digits before any decimal point " +
    "(ignore digits after the decimal point and any red or fractional dial). " +
    (expectedDigits ? `The register normally shows ${expectedDigits} digits. ` : "") +
    "Also read the serial number printed on the meter, and give your confidence from 0 to 1. " +
    "If you cannot see a value, lower the confidence. Reply as JSON."
  );
}

function parseMeter(raw: unknown, expectedDigits?: number): { digitsText: string; value: number; serial: string | null; confidence: number } {
  if (!isObj(raw)) throw new ReaderError("bad_output", "The meter reading was not an object.");
  const d = typeof raw.digits === "number" ? String(Math.trunc(raw.digits)) : typeof raw.digits === "string" ? raw.digits : "";
  let digitsText = d.split(/[.,]/)[0].replace(/\D/g, "");
  if (!digitsText) throw new ReaderError("bad_output", "No digits were read from the meter.");
  if (expectedDigits && digitsText.length < expectedDigits) digitsText = digitsText.padStart(expectedDigits, "0");
  const serial = typeof raw.serial === "string" && raw.serial.trim() ? raw.serial.trim().toUpperCase() : null;
  return { digitsText, value: Number(digitsText), serial, confidence: clamp01(raw.confidence) };
}

export class GeminiMeterReader implements MeterReader {
  async readMeter(img: ReaderImage, opts?: { expectedDigits?: number }): Promise<MeterScan> {
    const prompt = meterPrompt(opts?.expectedDigits);
    const [a, b] = await Promise.all([callGemini(prompt, img, METER_SCHEMA), callGemini(prompt, img, METER_SCHEMA)]);
    const first = parseMeter(a, opts?.expectedDigits);
    const second = parseMeter(b, opts?.expectedDigits);
    return {
      value: first.value,
      digitsText: first.digitsText,
      serial: first.serial ?? second.serial,
      confidence: Math.min(first.confidence, second.confidence),
      secondRead: second.value,
      provider: "gemini",
    };
  }
}

// ---------- Bill ----------

const BILL_SCHEMA = {
  type: "OBJECT",
  properties: {
    periodStart: { type: "STRING", description: "YYYY-MM-DD" },
    periodEnd: { type: "STRING", description: "YYYY-MM-DD" },
    readDate: { type: "STRING", description: "Date of meter reading, YYYY-MM-DD" },
    nextReadDate: { type: "STRING", description: "Next meter reading date, YYYY-MM-DD" },
    kwh: { type: "NUMBER" },
    amount: { type: "NUMBER", description: "Total amount due in pesos" },
    lines: {
      type: "OBJECT",
      properties: Object.fromEntries(LINE_KEYS.map((k) => [k, { type: "NUMBER" }])),
      required: [...LINE_KEYS],
    },
    fixedCharges: { type: "NUMBER", description: "Fixed supply charge plus fixed metering charge" },
    previousReading: { type: "NUMBER", nullable: true },
    presentReading: { type: "NUMBER", nullable: true },
    history: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { month: { type: "STRING", description: "YYYY-MM" }, kwh: { type: "NUMBER" } },
        required: ["month", "kwh"],
      },
    },
    accountLast4: { type: "STRING", description: "ONLY the last 4 digits of the account number" },
    confidence: { type: "NUMBER", description: "0 to 1" },
  },
  required: ["periodStart", "periodEnd", "readDate", "nextReadDate", "kwh", "amount", "lines", "fixedCharges", "accountLast4", "confidence"],
};

const BILL_PROMPT =
  "This is a Meralco electricity bill. Extract the fields as JSON. Dates are YYYY-MM-DD. " +
  "Map the charges into exactly seven lines in pesos: generation, transmission, systemLoss, " +
  "distribution (the distribution charge only), supplyMetering (all supply charges plus all metering charges), " +
  "taxes, and other (universal charges, FIT-All, lifeline and senior citizen subsidies). " +
  "fixedCharges is the fixed supply charge plus the fixed metering charge. " +
  "history is the monthly kWh usage chart if printed, month as YYYY-MM. " +
  "Return ONLY the last 4 digits of the account number as accountLast4. Do not return the name or address. " +
  "Give a confidence from 0 to 1.";

function parseBill(raw: unknown): BillScan {
  if (!isObj(raw)) throw new ReaderError("bad_output", "The bill reading was not an object.");
  const rawLines: Record<string, unknown> = isObj(raw.lines) ? raw.lines : {};
  const lines = {} as Lines;
  const missing: string[] = [];
  for (const k of LINE_KEYS as readonly LineKey[]) {
    const v = rawLines[k];
    if (v === undefined || v === null || v === "") {
      lines[k] = 0;
      missing.push(`lines.${k}`);
    } else lines[k] = num(v, `line ${k}`);
  }
  const fixedCharges =
    raw.fixedCharges === undefined || raw.fixedCharges === null || raw.fixedCharges === "" ? null : num(raw.fixedCharges, "fixed charges");
  if (fixedCharges === null) missing.push("fixedCharges");
  const history: { month: string; kwh: number }[] = [];
  if (Array.isArray(raw.history)) {
    for (const h of raw.history) {
      if (isObj(h) && typeof h.month === "string" && /^\d{4}-\d{2}$/.test(h.month.trim()) && numOrNull(h.kwh) !== null) {
        history.push({ month: h.month.trim(), kwh: numOrNull(h.kwh) as number });
      }
    }
  }
  const digits = String(raw.accountLast4 ?? "").replace(/\D/g, "");
  if (digits.length < 4) throw new ReaderError("bad_output", "Missing or invalid account digits.");
  return {
    periodStart: date(raw.periodStart, "period start"),
    periodEnd: date(raw.periodEnd, "period end"),
    readDate: date(raw.readDate, "read date"),
    nextReadDate: date(raw.nextReadDate, "next read date"),
    kwh: num(raw.kwh, "kWh"),
    amount: num(raw.amount, "amount"),
    lines,
    fixedCharges: fixedCharges ?? 0,
    previousReading: numOrNull(raw.previousReading),
    presentReading: numOrNull(raw.presentReading),
    history,
    accountLast4: digits.slice(-4),
    confidence: missing.length ? Math.min(clamp01(raw.confidence), 0.5) : clamp01(raw.confidence),
    ...(missing.length ? { missing } : {}),
    provider: "gemini",
  };
}

export class GeminiBillReader implements BillReader {
  async readBill(img: ReaderImage): Promise<BillScan> {
    return parseBill(await callGemini(BILL_PROMPT, img, BILL_SCHEMA));
  }
}
