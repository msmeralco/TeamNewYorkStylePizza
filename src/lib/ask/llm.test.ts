import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetReaderStateForTests } from "@/lib/readers/gemini";
import type { AskTurn } from "@/types";
import type { AskContext } from "./context";
import { askGemini } from "./llm";

const ctx = {
  language: "en",
  householdId: "h1",
  label: "Unit 1",
  displayName: "Unit 1",
  mode: "shared",
  sources: ["share"],
  facts: {},
  allowedNumbers: [677.77],
  factSheet: "FACT-SHEET-MARKER: your share is 677.77 pesos for 45 of 180 kWh.",
  otherNames: ["Reyes", "Dela Cruz"],
} as unknown as AskContext;

function reply(obj: unknown): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "gemini-test-flash");
  resetReaderStateForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("askGemini", () => {
  it("returns the model's answer and sends a text-only prompt with the fact sheet", async () => {
    const fetchMock = vi.fn(async () => reply({ answer: "Your share is 677.77 pesos.", inScope: true }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await askGemini({ ctx, question: "Why this amount?", history: [] });
    expect(out).toEqual({ answer: "Your share is 677.77 pesos.", inScope: true, model: "gemini-test-flash" });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.contents[0].parts).toHaveLength(1);
    const text: string = sent.contents[0].parts[0].text;
    expect(text).toContain("Ask Kahati");
    expect(text).toContain("FACT-SHEET-MARKER");
    expect(text).toContain("Why this amount?");
    expect(text).not.toContain("Reyes");
    expect(text).not.toContain("Dela Cruz");
    expect(sent.generationConfig.responseSchema.required).toEqual(["answer", "inScope"]);
  });

  it("passes through inScope false", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answer: "I can only explain this bill.", inScope: false })));
    const out = await askGemini({ ctx, question: "Who won the game?", history: [] });
    expect(out.inScope).toBe(false);
  });

  it("caps history at the last 6 turns of 500 characters", async () => {
    const fetchMock = vi.fn(async () => reply({ answer: "ok", inScope: true }));
    vi.stubGlobal("fetch", fetchMock);
    const history: AskTurn[] = Array.from({ length: 9 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `T${i}-` + "x".repeat(800) }));
    await askGemini({ ctx, question: "q", history });
    const text: string = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).contents[0].parts[0].text;
    expect(text).not.toContain("T0-");
    expect(text).not.toContain("T2-");
    expect(text).toContain("T3-");
    expect(text).toContain("T8-");
    expect(text).not.toContain("x".repeat(501));
    expect(text).toContain("x".repeat(490));
  });

  it("throws when the reply has no answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ inScope: true })));
    await expect(askGemini({ ctx, question: "q", history: [] })).rejects.toThrow();
  });
});
