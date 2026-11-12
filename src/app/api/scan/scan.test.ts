import { afterEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_METERS, SAMPLE_PREVIOUS_READINGS } from "@/data/seed";
import { POST as postBill } from "./bill/route";
import { POST as postMeter } from "./meter/route";

const req = (body: unknown) =>
  new Request("http://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/scan/bill", () => {
  it("returns the mock scan and a within-band sanity check", async () => {
    vi.stubEnv("READER", "");
    const res = await postBill(req({ imageBase64: "AAAA", mimeType: "image/jpeg" }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.scan.kwh).toBe(180);
    expect(j.scan.accountLast4).toBe("4821");
    expect(j.sanity.withinBand).toBe(true);
    expect(j.sanity.effectiveRate).toBeCloseTo(15.0615, 2);
  });
  it("400 on missing image, bad json", async () => {
    const r = await postBill(req({ mimeType: "image/jpeg" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.next).toBe("Type it instead");
    expect((await postBill(req("{nope"))).status).toBe(400);
  });
  it("413 on a huge image", async () => {
    const r = await postBill(req({ imageBase64: "A".repeat(4 * 1024 * 1024 + 10), mimeType: "image/jpeg" }));
    expect(r.status).toBe(413);
    expect((await r.json()).error.next).toBe("Retake the photo closer, or type it instead");
  });
  it("502 when the reader fails", async () => {
    vi.stubEnv("READER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const r = await postBill(req({ imageBase64: "AAAA", mimeType: "image/jpeg" }));
    vi.unstubAllGlobals();
    expect(r.status).toBe(502);
    expect((await r.json()).error.next).toBe("Try again, or type it instead");
  });
});

describe("POST /api/scan/meter", () => {
  const meter = SAMPLE_METERS.find((m) => m.serial === "SM-0214")!;
  const previous = SAMPLE_PREVIOUS_READINGS.find((r) => r.meterId === "mB")!;

  it("reads, validates and builds the serial line", async () => {
    vi.stubEnv("READER", "");
    const res = await postMeter(req({ imageBase64: "AAAA", mimeType: "image/jpeg", meter, previous }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.scan.digitsText).toBe("04572");
    expect(j.validation).toMatchObject({ ok: true, kwhSinceLast: 45, serialMatches: true });
    expect(j.serialLine).toBe("Serial SM-0214 matches");
  });
  it("flags a mismatch when the hint points at another meter", async () => {
    const res = await postMeter(req({ imageBase64: "AAAA", mimeType: "image/jpeg", meter, previous, hint: "SM-0215" }));
    const j = await res.json();
    expect(j.validation.issues.map((i: { code: string }) => i.code)).toContain("serial_mismatch");
    expect(j.serialLine).toBe("Serial SM-0215 does not match this meter");
  });
  it("400 and 413", async () => {
    expect((await postMeter(req({}))).status).toBe(400);
    expect((await postMeter(req({ imageBase64: "A".repeat(4 * 1024 * 1024 + 10) }))).status).toBe(413);
  });
});
