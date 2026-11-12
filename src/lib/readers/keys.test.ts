import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiMeterReader, geminiKeys } from "./gemini";

const okReply = (obj: object) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

describe("Gemini backup keys", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  it("collects keys in order without blanks or duplicates", () => {
    expect(geminiKeys({ GEMINI_API_KEY: "a", GEMINI_API_KEY_2: "b", GEMINI_API_KEYS: " c, a ,," })).toEqual(["a", "b", "c"]);
    expect(geminiKeys({})).toEqual([]);
  });

  it("falls over to the backup key on a rate limit", async () => {
    process.env.GEMINI_API_KEY = "primary";
    process.env.GEMINI_API_KEY_2 = "backup";
    const used: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const key = (init.headers as Record<string, string>)["x-goog-api-key"];
      used.push(key);
      if (key === "primary") return new Response("quota", { status: 429 });
      return okReply({ digits: "04572", serial: "SM-0214", confidence: 0.95 });
    }));
    const scan = await new GeminiMeterReader().readMeter({ base64: "aGk=", mimeType: "image/jpeg" }, { expectedDigits: 5 });
    expect(scan.value).toBe(4572);
    expect(used.filter((k) => k === "primary").length).toBeGreaterThan(0);
    expect(used).toContain("backup");
  });

  it("does not retry on a bad request", async () => {
    process.env.GEMINI_API_KEY = "primary";
    process.env.GEMINI_API_KEY_2 = "backup";
    const used: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      used.push((init.headers as Record<string, string>)["x-goog-api-key"]);
      return new Response("bad", { status: 400 });
    }));
    await expect(new GeminiMeterReader().readMeter({ base64: "aGk=", mimeType: "image/jpeg" })).rejects.toThrow(/HTTP 400/);
    expect(used.every((k) => k === "primary")).toBe(true);
  });
});
