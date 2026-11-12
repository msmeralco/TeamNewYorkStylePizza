import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiBillReader, GeminiMeterReader } from "./gemini";
import { getReaders } from "./index";
import { MockBillReader } from "./mock";
import { ReaderError } from "./types";

const img = { base64: "AAAA", mimeType: "image/jpeg" };

function geminiReply(obj: unknown, rawText?: string): Response {
  const text = rawText ?? JSON.stringify(obj);
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GeminiMeterReader", () => {
  it("reads twice and fills secondRead", async () => {
    const replies = [
      { digits: "04572", serial: "sm-0214", confidence: 0.96 },
      { digits: "04572.3", serial: "SM-0214", confidence: 0.9 },
    ];
    const fetchMock = vi.fn(async () => geminiReply(replies.shift()));
    vi.stubGlobal("fetch", fetchMock);
    const s = await new GeminiMeterReader().readMeter(img, { expectedDigits: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(s).toEqual({ value: 4572, digitsText: "04572", serial: "SM-0214", confidence: 0.9, secondRead: 4572, provider: "gemini" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const sent = JSON.parse(init.body as string);
    expect(sent.generationConfig.responseMimeType).toBe("application/json");
    expect(sent.generationConfig.responseSchema).toBeTruthy();
    expect(sent.contents[0].parts[1].inline_data.data).toBe("AAAA");
  });

  it("reports disagreement through secondRead", async () => {
    const replies = [{ digits: "04572", confidence: 0.9 }, { digits: "04512", confidence: 0.9 }];
    vi.stubGlobal("fetch", vi.fn(async () => geminiReply(replies.shift())));
    const s = await new GeminiMeterReader().readMeter(img);
    expect(s.value).toBe(4572);
    expect(s.secondRead).toBe(4512);
  });

  it("throws ReaderError on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiReply(null, "{not json")));
    await expect(new GeminiMeterReader().readMeter(img)).rejects.toBeInstanceOf(ReaderError);
  });

  it("throws ReaderError on HTTP error without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    const err = await new GeminiMeterReader().readMeter(img).catch((e) => e);
    expect(err).toBeInstanceOf(ReaderError);
    expect(err.code).toBe("http_error");
    expect(err.message).not.toContain("test-key");
  });

  it("throws when there are no digits", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiReply({ digits: "", confidence: 0.9 })));
    await expect(new GeminiMeterReader().readMeter(img)).rejects.toMatchObject({ code: "bad_output" });
  });
});

describe("GeminiBillReader", () => {
  const good = {
    periodStart: "2026-09-30",
    periodEnd: "2026-10-31",
    readDate: "2026-10-31",
    nextReadDate: "2026-11-30",
    kwh: 180,
    amount: "2,711.07",
    lines: { generation: 1690, transmission: 230, systemLoss: 150, distribution: 330, supplyMetering: 70, taxes: 190, other: 51.07 },
    fixedCharges: 21.38,
    previousReading: 12340,
    presentReading: 12520,
    history: [{ month: "2026-10", kwh: 180 }, { month: "bad", kwh: 1 }],
    accountLast4: "1234 5678 4821",
    confidence: 0.9,
  };

  it("parses and coerces a good bill, keeping only the last 4 account digits", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiReply(good)));
    const b = await new GeminiBillReader().readBill(img);
    expect(b.kwh).toBe(180);
    expect(b.amount).toBe(2711.07);
    expect(b.accountLast4).toBe("4821");
    expect(b.history).toEqual([{ month: "2026-10", kwh: 180 }]);
    expect(b.provider).toBe("gemini");
    expect(b.lines.supplyMetering).toBe(70);
  });

  it("rejects malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiReply(null, "```json {")));
    await expect(new GeminiBillReader().readBill(img)).rejects.toBeInstanceOf(ReaderError);
  });

  it("rejects a bill with a bad date", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => geminiReply({ ...good, periodStart: "Sept 30" })));
    await expect(new GeminiBillReader().readBill(img)).rejects.toMatchObject({ code: "bad_output" });
  });

  it("uses GEMINI_MODEL when set", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-x");
    const fetchMock = vi.fn(async () => geminiReply(good));
    vi.stubGlobal("fetch", fetchMock);
    await new GeminiBillReader().readBill(img);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain("/models/gemini-x:generateContent");
  });
});

describe("mock bill reader and getReaders", () => {
  it("golden: mock bill", async () => {
    const b = await new MockBillReader().readBill(img);
    expect(b.kwh).toBe(180);
    expect(b.amount).toBe(2711.07);
    expect(b.accountLast4).toBe("4821");
    expect(b.confidence).toBe(0.95);
    expect(b.provider).toBe("mock");
  });

  it("selects the reader from env", () => {
    vi.stubEnv("READER", "");
    expect(getReaders().bill).toBeInstanceOf(MockBillReader);
    vi.stubEnv("READER", "gemini");
    expect(getReaders().bill).toBeInstanceOf(GeminiBillReader);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(getReaders().bill).toBeInstanceOf(MockBillReader);
  });
});
