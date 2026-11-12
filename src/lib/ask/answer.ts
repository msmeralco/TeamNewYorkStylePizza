// Orchestrates one Ask Kahati answer: presets from templates, free text from Gemini behind the guard.
import type { AskAnswer, AskPresetId, AskTurn } from "@/types";
import type { AskContext } from "./context";
import { checkAnswer } from "./guard";
import { askGemini, cleanHistory } from "./llm";
import { answerPreset, ASK_FOOTER, suggestionsAfter } from "./presets";

export function refusalText(ctx: AskContext): string {
  return ctx.language === "fil"
    ? "Ang masasagot ko lang ay tungkol sa bill na ito: bakit ganito ang hati mo, ano ang binabayaran, paano makatipid sa kWh, at paano gumagana ang mga check. Subukan ang isa sa mga button sa ibaba."
    : "I can only explain this bill: why your share is what it is, what you are paying for, how to save kWh, and how the checks work. Try one of the buttons below.";
}

/** Pick the closest preset for a fallback answer. Defaults to why_share. */
export function closestPreset(question: string): AskPresetId {
  const q = question.toLowerCase();
  const has = (...w: string[]) => w.some((x) => q.includes(x));
  if (has("rate", "presyo", "per kwh", "singil")) return "rate_check";
  if (has("save", "tipid", "makatipid", "lower", "reduce", "bawasan")) return "save_kwh";
  if (has("lifeline", "50 kwh", "50kwh", "discount", "diskwento")) return "lifeline";
  if (has("missing", "kulang", "reading", "gap")) return "readings_gap";
  if (has("lines", "line", "binabayaran", "generation", "transmission", "paying for", "charges")) return "what_lines";
  return "why_share";
}

function build(ctx: AskContext, base: Omit<AskAnswer, "language" | "footer" | "suggestions">, presetId: AskPresetId | null): AskAnswer {
  return { ...base, language: ctx.language, suggestions: suggestionsAfter(presetId, ctx), footer: ASK_FOOTER[ctx.language] };
}

export function presetAnswer(ctx: AskContext, id: AskPresetId): AskAnswer {
  const r = answerPreset(id, ctx);
  return build(ctx, { answer: r.answer, provider: "template", fallback: false, refused: false, sources: r.sources }, id);
}

/** The closest preset, marked fallback: used when an AI answer fails the guard or Gemini is unavailable. */
export function templateFallback(ctx: AskContext, question: string): AskAnswer {
  const id = closestPreset(question);
  const p = answerPreset(id, ctx);
  return build(ctx, { answer: p.answer, provider: "template", fallback: true, refused: false, sources: p.sources }, id);
}

/** Free text. Throws whatever askGemini throws (the route answers a ReaderError with templateFallback). */
export async function freeTextAnswer(ctx: AskContext, question: string, history: AskTurn[]): Promise<AskAnswer> {
  const turns = cleanHistory(history);
  const r = await askGemini({ ctx, question, history: turns });
  if (!r.inScope) {
    return build(ctx, { answer: refusalText(ctx), provider: "template", fallback: false, refused: true, sources: [] }, null);
  }
  const check = checkAnswer(r.answer, ctx, { question, history: turns });
  if (!check.ok) return templateFallback(ctx, question);
  return build(
    ctx,
    { answer: r.answer, provider: "gemini", fallback: false, refused: false, sources: ctx.sources, ...(r.model ? { model: r.model } : {}) },
    null,
  );
}
