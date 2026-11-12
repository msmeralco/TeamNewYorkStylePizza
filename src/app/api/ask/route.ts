import { freeTextAnswer, presetAnswer, templateFallback } from "@/lib/ask/answer";
import { buildContextFromState, buildContextFromTenant, type AskContext } from "@/lib/ask/context";
import { AskError } from "@/lib/ask/errors";
import { checkQuestion } from "@/lib/ask/guard";
import { ASK_PRESETS } from "@/lib/ask/presets";
import { allowAsk, clientKey } from "@/lib/ask/rateLimit";
import { SplitError } from "@/lib/engine/split";
import { fail, ok, readJson } from "@/lib/http";
import { ReaderError } from "@/lib/readers/types";
import { verifyToken } from "@/lib/token";
import { validateState } from "@/lib/validate";
import type { AskPresetId, AskRequest, AskTurn, TenantView } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NEW_LINK = "Ask the organizer for a new link";
const TRY_BUTTON = "Try a question button.";
const PRESET_IDS = new Set<string>(ASK_PRESETS.en.map((p) => p.id));

export async function POST(req: Request) {
  try {
    const body = await readJson<AskRequest>(req);
    if (body instanceof Response) return body;
    if (!body || typeof body !== "object") return fail(400, "bad_request", "The request needs a body.", "Send a JSON object.");

    const language = body.language === "fil" ? "fil" : "en";
    const hasPreset = body.presetId !== undefined && body.presetId !== null;
    const hasQuestion = body.question !== undefined && body.question !== null;
    if (hasPreset === hasQuestion) {
      return fail(400, "bad_request", "Send a presetId or a question, not both and not neither.", TRY_BUTTON);
    }
    let presetId: AskPresetId | null = null;
    let question = "";
    if (hasPreset) {
      if (typeof body.presetId !== "string" || !PRESET_IDS.has(body.presetId)) {
        return fail(400, "bad_request", "That is not a known question button.", "Use an id from GET /api/ask/presets.");
      }
      presetId = body.presetId;
    } else {
      const q = checkQuestion(body.question);
      if (!q.ok) {
        return q.code === "too_long"
          ? fail(400, "bad_request", "The question is too long (500 characters at most).", "Shorten it, or try a question button.")
          : fail(400, "bad_request", "The question is empty.", "Type a question, or try a question button.");
      }
      question = q.question;
    }

    if (body.history !== undefined && body.history !== null && (!Array.isArray(body.history) || body.history.length > 20)) {
      return fail(400, "bad_request", "history must be a list of at most 20 turns.", "Send the last few turns, or leave history out.");
    }
    const history: AskTurn[] = Array.isArray(body.history) ? body.history : [];

    let ctx: AskContext;
    if (typeof body.tenantToken === "string") {
      let t = body.tenantToken;
      try {
        t = decodeURIComponent(t);
      } catch {
        /* keep raw */
      }
      const r = verifyToken<TenantView & { exp: string }>(t);
      if (!r.ok) {
        if (r.reason === "bad_signature") return fail(401, "bad_signature", "This link is not valid.", NEW_LINK);
        if (r.reason === "expired") return fail(410, "expired", "This link has expired.", NEW_LINK);
        return fail(400, "malformed", "This link is not complete.", "Check that the whole link was copied, or ask the organizer for a new link");
      }
      const { exp: _exp, ...view } = r.payload;
      void _exp;
      ctx = buildContextFromTenant(view as TenantView, language);
    } else {
      const v = validateState(body.state);
      if (!v.ok) return fail(400, v.code, v.message, v.next);
      if (typeof body.householdId !== "string") {
        return fail(400, "bad_request", "The request needs a householdId.", "Send {state, householdId}.");
      }
      ctx = buildContextFromState(v.state, body.householdId, language);
    }

    if (presetId) return ok(presetAnswer(ctx, presetId));

    if (!allowAsk(clientKey(req))) {
      return fail(429, "slow_down", "Too many questions in a short time.", TRY_BUTTON);
    }
    try {
      return ok(await freeTextAnswer(ctx, question, history));
    } catch (e) {
      if (e instanceof ReaderError) {
        // Gemini busy, slow or down: answer with the closest template instead of an error.
        console.error(`ask: gemini failed (${e.code}: ${e.message.slice(0, 160)}), question length ${question.length}`);
        return ok(templateFallback(ctx, question));
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof AskError) {
      return fail(e.code === "unknown_household" ? 404 : e.status, e.code, e.message, e.next);
    }
    if (e instanceof SplitError) return fail(422, e.code, e.message, e.next);
    return fail(500, "internal", "Something went wrong on our side.", "Try again.");
  }
}
