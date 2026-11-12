// POST /api/scan/bill: read a (masked) bill photo. The image is never stored.
import { RATES } from "@/data/tables";
import { fail, failWithDetail, ok, readJson } from "@/lib/http";
import { getReaders, ReaderError } from "@/lib/readers";
import { reconcileLines } from "@/lib/engine/billLines";

export const dynamic = "force-dynamic";
// Two reads plus a possible model lookup can take longer than the default limit.
export const maxDuration = 60;

const MAX_BASE64_CHARS = 4 * 1024 * 1024;
const BAND = 0.35;

interface Body {
  imageBase64?: unknown;
  mimeType?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BASE64_CHARS + 4096) return tooBig();

  const body = await readJson<Body>(req);
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object") return missing();

  const raw = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const imageBase64 = raw.replace(/^data:[^,]*,/, "").trim();
  if (!imageBase64) return missing();
  if (imageBase64.length > MAX_BASE64_CHARS) return tooBig();
  const mimeType = typeof body.mimeType === "string" && body.mimeType ? body.mimeType : "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    return fail(400, "bad_mime", "That file is not a photo.", "Type it instead");
  }

  try {
    const raw = await getReaders().bill.readBill({ base64: imageBase64, mimeType });
    const lines = reconcileLines(raw.lines, raw.amount);
    const scan = { ...raw, lines: lines.lines };
    const fixedNote = raw.fixedChargesNote ?? null;
    // The web shows linesNote on the confirm card, so the fixed-charge warning rides along with it.
    const linesNote = [fixedNote, lines.note].filter(Boolean).join(" ") || null;
    return ok({
      scan,
      sanity: {
        ...sanity(scan.amount, scan.kwh, scan.periodEnd),
        linesAddUp: lines.addsUp,
        linesAdjustedBy: lines.adjusted ? lines.difference : 0,
        linesNote,
        fixedChargesOk: fixedNote === null,
        fixedChargesNote: fixedNote,
        sanityNote: linesNote ?? (withinBandNote(scan.amount, scan.kwh, scan.periodEnd)),
      },
    });
  } catch (e) {
    const msg = e instanceof ReaderError ? "The bill could not be read." : "The bill could not be read right now.";
    console.error("reader_failed", e instanceof ReaderError ? `${e.code}: ${e.message}` : String(e));
    return failWithDetail(502, "reader_failed", msg, "Try again, or type it instead", e instanceof ReaderError ? `${e.code}: ${e.message}` : undefined);
  }
}

function withinBandNote(amount: number, kwh: number, periodEnd: string): string | null {
  const s = sanity(amount, kwh, periodEnd);
  return s.withinBand ? null : s.note;
}

function sanity(amount: number, kwh: number, periodEnd: string) {
  const month = /^\d{4}-\d{2}/.test(periodEnd) ? periodEnd.slice(0, 7) : "";
  const sorted = [...RATES].sort((a, b) => a.month.localeCompare(b.month));
  const row = sorted.filter((r) => r.month <= month).at(-1);
  if (!(kwh > 0) || !row) {
    return { effectiveRate: 0, withinBand: false, note: "Could not check the rate. Please confirm the numbers.", rateMonth: null };
  }
  const effectiveRate = amount / kwh;
  const diff = (effectiveRate - row.perKwh) / row.perKwh;
  const withinBand = Math.abs(diff) <= BAND;
  const used = row.month === month ? `${row.month} rate` : `${row.month} rate (the latest before this bill)`;
  const note = withinBand
    ? `About ₱${effectiveRate.toFixed(2)} per kWh, close to Meralco's ${used} of ₱${row.perKwh.toFixed(4)}.`
    : `About ₱${effectiveRate.toFixed(2)} per kWh, far from Meralco's ${used} of ₱${row.perKwh.toFixed(4)}. Please check the kWh and the total.`;
  return { effectiveRate, withinBand, note, rateMonth: row.month };
}

function missing(): Response {
  return fail(400, "missing_image", "No photo was sent.", "Type it instead");
}
function tooBig(): Response {
  return fail(413, "image_too_large", "The photo is too large.", "Retake the photo closer, or type it instead");
}
