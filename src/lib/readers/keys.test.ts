import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiMeterReader, geminiKeys, resetReaderStateForTests } from "./gemini";

const okReply = (obj: object) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

describe("Gemini backup keys", () => {
  const saved = { ...process.env };
  beforeEach(() => resetReaderStateForTests());
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

import { pickFlashModel } from "./gemini";

describe("pickFlashModel", () => {
  it("picks the newest plain Flash model", () => {
    expect(pickFlashModel(["models/gemini-2.5-flash", "models/gemini-3.8-flash", "models/gemini-3.8-flash-lite", "models/gemini-3.1-pro", "models/gemini-3.8-flash-image"])).toBe("gemini-3.8-flash");
    expect(pickFlashModel(["models/gemini-3.10-flash", "models/gemini-3.9-flash"])).toBe("gemini-3.10-flash");
    expect(pickFlashModel(["models/gemini-3.1-pro"])).toBeNull();
  });
});

import { rankFlashModels } from "./gemini";

describe("rankFlashModels and model failover", () => {
  it("ranks newest plain Flash first, then its variants", () => {
    expect(rankFlashModels(["gemini-3.8-flash-lite", "models/gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.8-flash-image", "gemini-3.1-pro"])).toEqual(["gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-3.5-flash"]);
  });

  it("learns the key's models and moves to the next model on 503", async () => {
    process.env.GEMINI_API_KEY = "k1";
    delete process.env.GEMINI_API_KEY_2;
    delete process.env.GEMINI_MODEL;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url.replace(/^.*\/models/, ""));
      if (url.includes("?pageSize")) {
        return new Response(JSON.stringify({ models: ["gemini-3.8-flash", "gemini-3.8-flash-lite"].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] })) }), { status: 200 });
      }
      if (url.includes("gemini-2.5-flash:")) return new Response(JSON.stringify({ error: { status: "NOT_FOUND", message: "retired" } }), { status: 404 });
      if (url.includes("gemini-3.8-flash:")) return new Response(JSON.stringify({ error: { status: "UNAVAILABLE", message: "busy" } }), { status: 503 });
      return okReply({ digits: "04572", serial: "SM-0214", confidence: 0.9 });
    }));
    resetReaderStateForTests();
    const { GeminiMeterReader: R } = await import("./gemini");
    const scan = await new R().readMeter({ base64: "aGk=", mimeType: "image/jpeg" }, { expectedDigits: 5 });
    expect(scan.value).toBe(4572);
    expect(calls.some((c) => c.includes("gemini-3.8-flash-lite:"))).toBe(true);
  });
});

describe("hedged requests", () => {
  it("drops a retired model (404) and answers from the next one", async () => {
    process.env.GEMINI_API_KEY = "k1";
    delete process.env.GEMINI_API_KEY_2;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL_FIRST;
    resetReaderStateForTests();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("?pageSize")) {
        return new Response(JSON.stringify({ models: ["gemini-3.8-flash", "gemini-2.5-flash-lite"].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] })) }), { status: 200 });
      }
      if (url.includes("gemini-3.8-flash:")) return new Response(JSON.stringify({ error: { status: "NOT_FOUND", message: "no longer available to new users" } }), { status: 404 });
      return okReply({ digits: "12552", serial: "MM-5520", confidence: 0.95 });
    }));
    const scan = await new GeminiMeterReader().readMeter({ base64: "aGk=", mimeType: "image/jpeg" }, { expectedDigits: 5 });
    expect(scan.value).toBe(12552);
    const again = calls.length;
    await new GeminiMeterReader().readMeter({ base64: "aGk=", mimeType: "image/jpeg" }, { expectedDigits: 5 });
    expect(calls.slice(again).some((u) => u.includes("gemini-3.8-flash:"))).toBe(false);
  });

  it("starts the next model when the first is slow and takes the first answer", async () => {
    process.env.GEMINI_API_KEY = "k1";
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_MODEL_FIRST;
    resetReaderStateForTests();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("?pageSize")) {
        return new Response(JSON.stringify({ models: ["gemini-3.8-flash", "gemini-3.5-flash"].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] })) }), { status: 200 });
      }
      if (url.includes("gemini-3.8-flash:")) {
        return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      }
      return okReply({ digits: "04572", serial: "SM-0214", confidence: 0.95 });
    }));
    const p = new GeminiMeterReader().readMeter({ base64: "aGk=", mimeType: "image/jpeg" }, { expectedDigits: 5 });
    await vi.advanceTimersByTimeAsync(4_500);
    const scan = await p;
    vi.useRealTimers();
    expect(scan.value).toBe(4572);
    expect(scan.model).toBe("gemini-3.5-flash");
  });
});
