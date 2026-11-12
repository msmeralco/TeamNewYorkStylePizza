import { describe, expect, it } from "vitest";
import { sampleCompoundState } from "@/data/sample";
import { buildContextFromState } from "./context";
import { checkAnswer } from "./guard";

const ctx = buildContextFromState(sampleCompoundState(), "hB", "en");
const fil = buildContextFromState(sampleCompoundState(), "hB", "fil");

describe("reserved topic: organizer charges, refunds, rules and authorities", () => {
  const blocked = [
    "Ask your landlord to return the ₱64.73.",
    "You were charged ₱64.73 too much, so ask for it back.",
    "You deserve the money back.",
    "Dapat ibalik ang pera sa iyo.",
    "Maaari mong hingin pabalik ang pera.",
    "You can file a complaint with the ERC.",
    "That violates the law.",
    "Bawal ito.",
    "Report it to the barangay.",
    "Tawagan ang pulis.",
    "Labis ang singil sa iyo.",
    "Sumobra ang bayad mo.",
    "Inaabuso ka.",
    "Nilalamangan ka.",
    "Pinagsasamantalahan ka.",
    "Someone is taking advantage of you.",
    "Someone pockets the difference.",
    "The utility says your rate is fine.",
    "Ayon sa Meralco bill, tama ito.",
    "You pay ₱742.50.",
    "That is fvck wrong.",
  ];
  for (const a of blocked) {
    it(`blocks: ${a}`, () => {
      expect(checkAnswer(a, a.match(/[a-z]+ (ang|ka|ito|mo)\b/i) ? fil : ctx).ok).toBe(false);
    });
  }

  const allowed = [
    "Your share is ₱677.77 because you used 45 of the 180 kWh.",
    "Each kWh you save takes about ₱15 off your share.",
    "Aircon uses a lot of power. Each kWh you save takes about ₱14.94 off your share.",
    "Generation is the biggest part of your share, ₱422.50.",
    "Unplug the rice cooker after cooking and set the fan on a timer at night.",
  ];
  for (const a of allowed) {
    it(`allows: ${a}`, () => {
      const r = checkAnswer(a, ctx);
      expect(r.problems).toEqual([]);
    });
  }
});
