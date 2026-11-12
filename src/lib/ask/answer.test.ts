import { describe, expect, it } from "vitest";
import { sampleCompoundState } from "@/data/sample";
import { closestPreset, presetAnswer, refusalText } from "./answer";
import { buildContextFromState } from "./context";
import { checkAnswer } from "./guard";
import { allowAsk, ASK_GLOBAL_LIMIT, ASK_LIMIT, clientKey, resetRateLimitForTests } from "./rateLimit";

describe("closestPreset", () => {
  it("picks by keyword and defaults to why_share", () => {
    expect(closestPreset("is the rate fair?")).toBe("rate_check");
    expect(closestPreset("paano makatipid")).toBe("save_kwh");
    expect(closestPreset("does the 50 kWh thing apply")).toBe("lifeline");
    expect(closestPreset("bakit kulang")).toBe("readings_gap");
    expect(closestPreset("what is generation")).toBe("what_lines");
    expect(closestPreset("hello")).toBe("why_share");
  });
});

describe("answers", () => {
  const ctx = buildContextFromState(sampleCompoundState(), "hB", "en");
  it("preset answers pass the guard and carry footer and suggestions", () => {
    const a = presetAnswer(ctx, "why_share");
    expect(checkAnswer(a.answer, ctx).ok).toBe(true);
    expect(a.footer).toContain("Computed by Kahati");
    expect(a.suggestions).toHaveLength(3);
  });
  it("refusal text is clean in both languages", () => {
    for (const lang of ["en", "fil"] as const) {
      const c = buildContextFromState(sampleCompoundState(), "hB", lang);
      expect(checkAnswer(refusalText(c), c).ok).toBe(true);
    }
  });
});

describe("rate limiter", () => {
  it("allows 12 per 60 s then recovers", () => {
    resetRateLimitForTests();
    for (let i = 0; i < ASK_LIMIT; i++) expect(allowAsk("k", 1000 + i)).toBe(true);
    expect(allowAsk("k", 2000)).toBe(false);
    expect(allowAsk("k", 61_500)).toBe(true);
  });
  it("has a global cap of 60 per minute across keys", () => {
    resetRateLimitForTests();
    for (let i = 0; i < ASK_GLOBAL_LIMIT; i++) expect(allowAsk("k" + i, 1000 + i)).toBe(true);
    expect(allowAsk("another", 2000)).toBe(false);
    expect(allowAsk("another", 62_000)).toBe(true);
  });
  it("keys on trusted headers, then the LAST x-forwarded-for hop", () => {
    const h = (o: Record<string, string>) => new Request("http://x", { headers: o });
    expect(clientKey(h({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe("1.1.1.1");
    expect(clientKey(h({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientKey(h({}))).toBe("local");
  });
});
