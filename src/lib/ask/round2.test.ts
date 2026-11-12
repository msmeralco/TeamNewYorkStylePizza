import { describe, expect, it } from "vitest";
import { sampleBautistaState, sampleCompoundState } from "@/data/sample";
import { buildTenantView } from "@/lib/engine/tenant";
import { buildContextFromState, buildContextFromTenant } from "./context";
import { checkAnswer } from "./guard";
import { answerPreset } from "./presets";

function gapState() {
  const s = sampleCompoundState();
  const mC = s.meters.find((m) => m.householdId === "hC")!;
  const cur = s.currentReadings.find((r) => r.meterId === mC.id)!;
  cur.value = 2220;
  cur.source = "typed";
  cur.confidence = null;
  return s;
}

describe("why_share in the gap state", () => {
  it("says the kWh-based charges are split over the readings' total (EN and FIL)", () => {
    const en = answerPreset("why_share", buildContextFromState(gapState(), "hB", "en")).answer;
    expect(en).toContain("45 of the 162 kWh the readings add up to");
    expect(en).toContain("18 kWh gap is split by kWh");
    expect(en).not.toContain("of the meter's 180");
    const fil = answerPreset("why_share", buildContextFromState(gapState(), "hB", "fil")).answer;
    expect(fil).toContain("45 sa 162 kWh");
    expect(fil).toContain("18 kWh");
  });
  it("gap preset answers pass the guard", () => {
    for (const l of ["en", "fil"] as const) {
      const ctx = buildContextFromState(gapState(), "hB", l);
      // Templates are reviewed text; the reserved-topic rule applies to free text only.
      const problems = checkAnswer(answerPreset("why_share", ctx).answer, ctx).problems.filter((p) => !p.startsWith("reserved topic"));
      expect(problems).toEqual([]);
    }
  });
});

describe("context", () => {
  it("fact sheet rate line compares with the household's share", () => {
    const ctx = buildContextFromState(sampleCompoundState(), "hB", "en");
    expect(ctx.factSheet).toMatch(/That is ₱64\.73 above this household's share of ₱677\.77\./);
  });
  it("every own-meter household has the lifeline source, 4Ps or not", () => {
    const on = sampleBautistaState();
    const off = sampleBautistaState();
    for (const x of on.households) if (x.id === "hBautista") x.fourPs = true;
    for (const x of off.households) if (x.id === "hBautista") x.fourPs = false;
    const a = buildContextFromState(on, "hBautista", "en").sources;
    const b = buildContextFromState(off, "hBautista", "en").sources;
    expect(a).toContain("lifeline");
    expect(a).toEqual(b);
  });
  it("tenant context carries the fixed charges", () => {
    const view = buildTenantView(sampleCompoundState(), "hB", new Date());
    const ctx = buildContextFromTenant(view, "en");
    expect(ctx.facts.fixedCharges).toBeCloseTo(21.38, 2);
    expect(answerPreset("why_share", ctx).answer).toContain("₱21.38");
  });
});

describe("background facts", () => {
  it("the fact sheet carries the bill-line meanings and typical wattages", () => {
    const ctx = buildContextFromState(sampleCompoundState(), "hB", "en");
    expect(ctx.factSheet).toMatch(/Background, what each bill line means/);
    expect(ctx.factSheet).toMatch(/Aircon \(window, 1 HP\) about 1000 W/);
    expect(ctx.factSheet).not.toMatch(/Reyes|Dela Cruz|Garcia|(is|are|being) (a )?4Ps|fourPs/i);
  });
});
