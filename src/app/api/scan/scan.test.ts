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
    expect(j.sanity.rateMonth).toBe("2026-10");
    expect(j.sanity.note).toContain("2026-10 rate");
  });
  it("always includes rateMonth, null when unknown", async () => {
    vi.stubEnv("READER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "k");
    const bill = {
      periodStart: "2000-01-01", periodEnd: "2000-01-31", readDate: "2000-01-31", nextReadDate: "2000-02-28",
      kwh: 180, amount: 2711.07, fixedCharges: 21.38, accountLast4: "4821", confidence: 0.9,
      lines: { generation: 1690, transmission: 230, systemLoss: 150, distribution: 330, supplyMetering: 70, taxes: 190, other: 51.07 },
    };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(bill) }] } }] }), { status: 200 })));
    const j = await (await postBill(req({ imageBase64: "AAAA", mimeType: "image/jpeg" }))).json();
    vi.unstubAllGlobals();
    expect("rateMonth" in j.sanity).toBe(true);
    expect(j.sanity.rateMonth).toBeNull();
  });
  it("400 on missing image, bad json", async () => {
    vi.stubEnv("READER", "");
    const r = await postBill(req({ mimeType: "image/jpeg" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.next).toBe("Type it instead");
    expect((await postBill(req("{nope"))).status).toBe(400);
  });
  it("413 on a huge image", async () => {
    vi.stubEnv("READER", "");
    const r = await postBill(req({ imageBase64: "A".repeat(4 * 1024 * 1024 + 10), mimeType: "image/jpeg" }));
    expect(r.status).toBe(413);
    expect((await r.json()).error.next).toBe("Retake the photo closer, or type it instead");
  });
  it("falls back to the latest earlier rate row and says so", async () => {
    vi.stubEnv("READER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "k");
    const bill = {
      periodStart: "2026-11-30", periodEnd: "2026-12-31", readDate: "2026-12-31", nextReadDate: "2027-01-30",
      kwh: 180, amount: 2711.07, fixedCharges: 21.38, accountLast4: "4821", confidence: 0.9,
      lines: { generation: 1690, transmission: 230, systemLoss: 150, distribution: 330, supplyMetering: 70, taxes: 190, other: 51.07 },
    };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(bill) }] } }] }), { status: 200 })));
    const r = await postBill(req({ imageBase64: "AAAA", mimeType: "image/jpeg" }));
    vi.unstubAllGlobals();
    const j = await r.json();
    expect(j.sanity.rateMonth).toBe("2026-10");
    expect(j.sanity.note).toContain("the latest before this bill");
  });
  it("returns a sanityNote when the fixed charges look wrong", async () => {
    vi.stubEnv("READER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "k");
    const bill = {
      periodStart: "2026-09-30", periodEnd: "2026-10-31", readDate: "2026-10-31", nextReadDate: "2026-11-30",
      kwh: 180, amount: 2711.07, fixedCharges: 107.8, accountLast4: "5678", confidence: 0.9,
      lines: { generation: 1690, transmission: 230, systemLoss: 150, distribution: 330, supplyMetering: 70, taxes: 190, other: 51.07 },
    };
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(bill) }] } }] }), { status: 200 })));
    const j = await (await postBill(req({ imageBase64: "AAAA", mimeType: "image/jpeg" }))).json();
    vi.unstubAllGlobals();
    expect(j.scan.fixedCharges).toBe(21.38);
    expect(j.sanity.fixedChargesOk).toBe(false);
    expect(j.sanity.sanityNote).toContain("The fixed charges look wrong (₱107.80). Check them against the bill before confirming.");
    expect(j.sanity.linesNote).toBe(j.sanity.sanityNote);
  });
  it("sanityNote is null on a clean scan", async () => {
    vi.stubEnv("READER", "");
    const j = await (await postBill(req({ imageBase64: "AAAA", mimeType: "image/jpeg" }))).json();
    expect(j.sanity.fixedChargesOk).toBe(true);
    expect(j.sanity.sanityNote).toBeNull();
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
    vi.stubEnv("READER", "");
    const res = await postMeter(req({ imageBase64: "AAAA", mimeType: "image/jpeg", meter, previous, hint: "SM-0215" }));
    const j = await res.json();
    expect(j.validation.issues.map((i: { code: string }) => i.code)).toContain("serial_mismatch");
    expect(j.serialLine).toBe("Serial SM-0215 does not match this meter");
  });
  it("400 and 413", async () => {
    vi.stubEnv("READER", "");
    expect((await postMeter(req({}))).status).toBe(400);
    expect((await postMeter(req({ imageBase64: "A".repeat(4 * 1024 * 1024 + 10) }))).status).toBe(413);
  });
  it("ignores a meter or reading without an id", async () => {
    vi.stubEnv("READER", "");
    const { id: _a, ...noId } = meter;
    const { meterId: _b, ...noMeterId } = previous;
    const res = await postMeter(req({ imageBase64: "AAAA", mimeType: "image/jpeg", meter: noId, previous: noMeterId }));
    const j = await res.json();
    expect(j.validation.kwhSinceLast ?? null).toBeNull();
  });
});
