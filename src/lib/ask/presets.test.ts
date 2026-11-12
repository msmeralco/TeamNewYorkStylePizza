import { describe, expect, it } from "vitest";
import { sampleBautistaState, sampleCompoundState } from "@/data/sample";
import { buildTenantView } from "@/lib/engine/tenant";
import type { AskPresetId, CompoundState } from "@/types";
import { buildContextFromState, buildContextFromTenant, type AskContext } from "./context";
import { ASK_FOOTER, ASK_PRESETS, answerPreset, suggestionsAfter } from "./presets";

const IDS: AskPresetId[] = ["why_share", "what_lines", "save_kwh", "lifeline", "readings_gap", "rate_check"];
const BANNED = /overcharged|owed|utang|sinisingil nang sobra|scam|illegal|\bsue\b|kaso|meralco says|sabi ng meralco/i;
const NAMES = ["Reyes", "Santos", "Dela Cruz", "Garcia", "Bautista"];

function gapState(): CompoundState {
  const s = sampleCompoundState();
  const mC = s.meters.find((m) => m.householdId === "hC")!;
  const cur = s.currentReadings.find((r) => r.meterId === mC.id)!;
  cur.value = 2220;
  cur.source = "typed";
  cur.confidence = null;
  return s;
}

function selfCheck(text: string, ctx: AskContext) {
  expect(text.length).toBeGreaterThan(10);
  expect(text).not.toContain("—");
  expect(text).not.toMatch(BANNED);
  for (const n of ctx.otherNames) expect(text).not.toContain(n);
  // The general rule may name 4Ps; no answer may say a household is 4Ps.
  expect(text).not.toMatch(/(is|are|being) (a )?4Ps|fourPs/i);
}

describe("ASK_PRESETS and footer", () => {
  it("has the six presets in order in both languages", () => {
    for (const l of ["en", "fil"] as const) expect(ASK_PRESETS[l].map((p) => p.id)).toEqual(IDS);
    expect(ASK_PRESETS.en[0].question).toBe("Why is my share this amount?");
    expect(ASK_PRESETS.fil[5].question).toBe("Pareho ba ang rate ko sa bill?");
  });
  it("has the footers", () => {
    expect(ASK_FOOTER.en).toBe("Computed by Kahati. Not a Meralco statement.");
    expect(ASK_FOOTER.fil).toBe("Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.");
  });
});

describe("shared compound, Santos (en)", () => {
  const ctx = buildContextFromState(sampleCompoundState(), "hB", "en");
  it("why_share", () => {
    const a = answerPreset("why_share", ctx).answer;
    expect(a).toContain("₱677.77");
    expect(a).toContain("45");
    expect(a).toContain("180");
    expect(a).toContain("₱21.38");
    expect(a).toContain("₱5.35");
    expect(a).toContain("split equally");
  });
  it("what_lines", () => {
    const a = answerPreset("what_lines", ctx).answer;
    expect(a).toContain("generation (₱422.50)");
    expect(a).toContain("taxes");
  });
  it("save_kwh has no 50 kWh cliff on a shared meter", () => {
    const a = answerPreset("save_kwh", ctx).answer;
    expect(a).toContain("about ₱15");
    expect(a).toContain("₱14.94");
    expect(a).not.toContain("50");
  });
  it("lifeline explains there is no line on a shared meter", () => {
    const a = answerPreset("lifeline", ctx).answer;
    expect(a).toContain("shared meter");
    expect(a).toContain("no 50 kWh line");
  });
  it("readings_gap on the clean sample", () => {
    const a = answerPreset("readings_gap", ctx).answer;
    expect(a).toContain("add up");
    expect(a).toContain("180 of 180");
  });
  it("rate_check in neutral words", () => {
    const a = answerPreset("rate_check", ctx).answer;
    expect(a).toBe("You were asked ₱16.50 per kWh. The bill works out to ₱15.06 per kWh, so ₱742.50 is ₱64.73 above the bill's rate on a 45 kWh share. Landlords may bill some costs separately. Ask to see the master bill.");
  });
  it("every answer passes the self-check, with sources", () => {
    for (const id of IDS) {
      const r = answerPreset(id, ctx);
      selfCheck(r.answer, ctx);
      expect(r.sources.length).toBeGreaterThan(0);
    }
  });
});

describe("readings gap with a typed reading", () => {
  const ctx = buildContextFromState(gapState(), "hB", "en");
  it("says 18 kWh missing and the gap is split by kWh, without naming anyone", () => {
    const a = answerPreset("readings_gap", ctx).answer;
    expect(a).toContain("18 kWh");
    expect(a).toContain("missing");
    expect(a).toContain("162 of 180");
    expect(a).toContain("split by kWh");
    expect(a).not.toContain("Dela Cruz");
    selfCheck(a, ctx);
  });
  it("tells the typing household its reading is typed", () => {
    const c = buildContextFromState(gapState(), "hC", "en");
    expect(answerPreset("readings_gap", c).answer).toContain("typed");
  });
  it("Filipino gap answer", () => {
    const c = buildContextFromState(gapState(), "hB", "fil");
    const a = answerPreset("readings_gap", c).answer;
    expect(a).toContain("18 kWh");
    expect(a).toContain("hinahati ang kulang ayon sa kWh");
    selfCheck(a, c);
  });
});

describe("Bautista, own meter", () => {
  const ctx = buildContextFromState(sampleBautistaState(), "hBautista", "en");
  it("lifeline says 100% off most charges instead of about ₱519", () => {
    const a = answerPreset("lifeline", ctx).answer;
    expect(a).toContain("100% off most charges instead of about ₱519");
    expect(a).toContain("53 kWh");
    expect(a).toContain("51 to 55");
    selfCheck(a, ctx);
  });
  it("save_kwh adds the 50 kWh change on an own meter", () => {
    const a = answerPreset("save_kwh", ctx).answer;
    expect(a).toContain("50 kWh or less");
    expect(a).toContain("₱519");
  });
  it("save_kwh on an own meter uses October's rate, not the share or the compound's rate", () => {
    const en = answerPreset("save_kwh", ctx).answer;
    expect(en).toContain("about ₱15.06 off the bill at October's rate, before any lifeline discount");
    expect(en).toContain("staying at 50 kWh or less is 100% off most charges");
    expect(en).not.toMatch(/your share|14\.94/);
    const fil = answerPreset("save_kwh", buildContextFromState(sampleBautistaState(), "hBautista", "fil")).answer;
    expect(fil).toContain("₱15.06");
    expect(fil).toContain("Oktubre");
    expect(fil).not.toMatch(/bahagi mo|14\.94/);
    selfCheck(en, ctx);
    selfCheck(fil, ctx);
  });
  it("rate_check says no rate was entered", () => {
    const a = answerPreset("rate_check", ctx).answer;
    expect(a).toContain("No per-kWh rate was entered");
  });
  it("readings_gap does not talk about sub-meters adding up", () => {
    expect(answerPreset("readings_gap", ctx).answer).toContain("own meter");
  });
  it("why_share for a single meter", () => {
    const a = answerPreset("why_share", ctx).answer;
    expect(a).toContain("Before any lifeline discount, your bill is ₱858.17 for 56 kWh");
    expect(a).toContain("56 kWh is 35% off most charges");
    expect(a).toContain("₱21.38");
  });
});

describe("no rate check, tenant context", () => {
  it("organizer did not enter a rate", () => {
    const s = sampleCompoundState();
    s.chargedRates = [];
    const ctx = buildContextFromState(s, "hB", "en");
    const a = answerPreset("rate_check", ctx).answer;
    expect(a).toContain("The organizer did not enter a per-kWh rate");
    selfCheck(a, ctx);
  });
  it("tenant context answers all presets in both languages", () => {
    const view = buildTenantView(sampleCompoundState(), "hB");
    for (const l of ["en", "fil"] as const) {
      const ctx = buildContextFromTenant(view, l);
      for (const id of IDS) {
        const r = answerPreset(id, ctx);
        selfCheck(r.answer, { ...ctx, otherNames: NAMES.filter((n) => n !== "Santos") });
      }
    }
    const t = answerPreset("why_share", buildContextFromTenant(view, "en")).answer;
    expect(t).toContain("₱677.77");
  });
});

describe("Filipino templates", () => {
  const ctx = buildContextFromState(sampleCompoundState(), "hB", "fil");
  it("answers all six, short and without banned words", () => {
    for (const id of IDS) {
      const r = answerPreset(id, ctx);
      selfCheck(r.answer, ctx);
      expect(r.answer).not.toMatch(/\bYour\b|\bYou\b/);
    }
    expect(answerPreset("why_share", ctx).answer).toContain("₱677.77");
    expect(answerPreset("save_kwh", ctx).answer).toContain("₱14.94");
  });
  it("Bautista lifeline in Filipino", () => {
    const c = buildContextFromState(sampleBautistaState(), "hBautista", "fil");
    const a = answerPreset("lifeline", c).answer;
    expect(a).toContain("100% diskwento");
    expect(a).not.toContain("₱0");
    expect(a).toContain("₱519");
  });
});

describe("missing facts are handled", () => {
  it("answers politely with an empty context", () => {
    const base = buildContextFromState(sampleCompoundState(), "hB", "en");
    const empty: AskContext = { ...base, facts: {}, sources: [] };
    for (const id of IDS) {
      const r = answerPreset(id, empty);
      selfCheck(r.answer, empty);
    }
  });
});

describe("suggestionsAfter", () => {
  const ctx = buildContextFromState(sampleCompoundState(), "hB", "en");
  it("gives 3 other presets", () => {
    for (const id of [null, ...IDS] as (AskPresetId | null)[]) {
      const s = suggestionsAfter(id, ctx);
      expect(s).toHaveLength(3);
      expect(new Set(s.map((x) => x.id)).size).toBe(3);
      if (id) expect(s.map((x) => x.id)).not.toContain(id);
      for (const x of s) expect(x.question).toBe(ASK_PRESETS.en.find((p) => p.id === x.id)!.question);
    }
  });
  it("skips readings and rate presets that do not apply", () => {
    const single = buildContextFromState(sampleBautistaState(), "hBautista", "fil");
    const ids = suggestionsAfter("why_share", single).map((x) => x.id);
    expect(ids).not.toContain("readings_gap");
    expect(ids).not.toContain("rate_check");
    expect(suggestionsAfter("why_share", single)[0].question).toBe(ASK_PRESETS.fil.find((p) => p.id === ids[0])!.question);
  });
});

describe("regressions: rate check sign and single-mode kWh", () => {
  for (const lang of ["en", "fil"] as const) {
    it(`rate_check never prints a negative peso or calls a non-positive amount higher (${lang})`, () => {
      const ctx = buildContextFromState(gapState(), "hB", lang);
      const a = answerPreset("rate_check", ctx).answer;
      expect(a).not.toContain("₱-");
      expect(a).not.toMatch(/above|mas mataas/i);
      selfCheck(a, ctx);
    });
    it(`why_share in own-meter mode uses the bill kWh (${lang})`, () => {
      const ctx = buildContextFromState(sampleBautistaState(), "hBautista", lang);
      const a = answerPreset("why_share", ctx).answer;
      expect(a).toContain("56 kWh");
      expect(a).not.toContain("32 kWh");
      expect(ctx.factSheet).not.toContain("used for the split");
    });
  }
});
