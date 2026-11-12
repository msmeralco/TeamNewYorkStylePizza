// POST /api/scan/meter: read a meter photo and validate it. The image is never stored.
import { validateMeterScan } from "@/lib/engine/meterValidate";
import { fail, failWithDetail, ok, readJson } from "@/lib/http";
import { getReaders, ReaderError } from "@/lib/readers";
import type { Meter, Reading } from "@/types";

export const dynamic = "force-dynamic";

const MAX_BASE64_CHARS = 4 * 1024 * 1024;

interface Body {
  imageBase64?: unknown;
  mimeType?: unknown;
  meter?: Meter;
  previous?: Reading;
  hint?: unknown;
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

  const meter = isMeter(body.meter) ? body.meter : null;
  const previous = isReading(body.previous) ? body.previous : null;
  const hint = typeof body.hint === "string" && body.hint ? body.hint : meter?.serial;

  try {
    const scan = await getReaders().meter.readMeter(
      { base64: imageBase64, mimeType },
      { expectedDigits: meter?.digits, hint },
    );
    const validation = validateMeterScan({ scan, meter, previous });
    return ok({ scan, validation, serialLine: serialLine(scan.serial, validation.serialMatches) });
  } catch (e) {
    const msg = e instanceof ReaderError ? "The meter could not be read." : "The meter could not be read right now.";
    console.error("reader_failed", e instanceof ReaderError ? `${e.code}: ${e.message}` : String(e));
    return failWithDetail(502, "reader_failed", msg, "Try again, or type it instead", e instanceof ReaderError ? `${e.code}: ${e.message}` : undefined);
  }
}

function serialLine(serial: string | null, matches: boolean | null): string {
  if (!serial) return "Serial not read. Check it against the meter.";
  if (matches === null) return `Serial ${serial} read`;
  return matches ? `Serial ${serial} matches` : `Serial ${serial} does not match this meter`;
}

function isMeter(m: unknown): m is Meter {
  return !!m && typeof m === "object" && typeof (m as Meter).id === "string" && typeof (m as Meter).serial === "string" && typeof (m as Meter).digits === "number";
}
function isReading(r: unknown): r is Reading {
  return !!r && typeof r === "object" && typeof (r as Reading).meterId === "string" && typeof (r as Reading).value === "number";
}
function missing(): Response {
  return fail(400, "missing_image", "No photo was sent.", "Type it instead");
}
function tooBig(): Response {
  return fail(413, "image_too_large", "The photo is too large.", "Retake the photo closer, or type it instead");
}
