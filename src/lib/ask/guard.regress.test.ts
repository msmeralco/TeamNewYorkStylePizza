import { describe, expect, it } from "vitest";
import type { AskContext } from "./context";
import { checkAnswer } from "./guard";

const ctx = {
  language: "en",
  householdId: "h1",
  label: "Unit 1",
  displayName: "Unit 1",
  mode: "shared",
  sources: ["share"],
  facts: { periodStart: "2026-09-05", periodEnd: "2026-10-04" },
  allowedNumbers: [677.77, 678, 45, 180, 21.38, 5.345, 5.35, 14.94, 15, 742.5, 64.73, 16.5, 15.06],
  factSheet: "",
  otherNames: ["Reyes", "Dela Cruz", "Garcia"],
} as unknown as AskContext;

const no = (list: string[], c: AskContext = ctx) => list.forEach((a) => expect(checkAnswer(a, c).ok, a).toBe(false));
const yes = (list: string[], c: AskContext = ctx) => list.forEach((a) => expect(checkAnswer(a, c).ok, a).toBe(true));

describe("guard round 2: script and invisible characters", () => {
  it("fails invisible characters and non-Latin letters", () => {
    no([
      "Your sh​are is fine.",
      "Your s­cam",
      "Your sh﻿are",
      "Your s⁠hare",
      "Your share is ㅤfine",
      "A scаm",
      "Τhis is your share",
      "Your share 分",
    ]);
  });
  it("allows accented Latin letters", () => {
    yes(["Ñandito ang bahagi mo: señor, café, ₱677.77."]);
  });
});

describe("guard round 2: numbers in disguise", () => {
  it("fails magnitude suffixes, odd separators, number words and fractions", () => {
    no([
      "Your share is ₱1k.",
      "Your share is ₱1.5M.",
      "Your share is 2b.",
      "Your share is ₱1'000.",
      "Your share is ₱1’000.",
      "Your share is ₱1_000.",
      "Your share is ₱1 000.",
      "Your share is ₱1˙000.",
      "Sandaang piso",
      "Sanlibong piso",
      "Isang daan",
      "Sampung libo",
      "Sandaan",
      "A dozen kWh",
      "Half of it",
      "Fifteen kWh",
      "Seventy-seven pesos",
      "Twentyfive kWh",
      "Hundreds of pesos",
      "Thousands",
      "Labing-apat",
      "Dalawampung piso",
      "Dalawang daan",
      "Limang piso",
      "Tw0 pesos",
      "½ of the bill",
      "Isang piso",
      "one kWh",
    ]);
  });
  it("allows ordinary words that only look like numbers", () => {
    yes([
      "There is one meter for the whole compound.",
      "Isa sa mga linya ay generation.",
      "You use about a quarter of the meter's 180 kWh.",
      "Isang bill ito.",
      "Animo'y mahirap, pero ₱677.77 ito.",
      "Someone, anyone, money and phone are normal words.",
    ]);
  });
});

describe("guard round 2: Meralco", () => {
  it("allows Meralco only as a noun phrase or in the footer", () => {
    no(["Meralco is happy with it.", "Meralco approved it.", "Meralco will send it.", "Meralco said so", "Meralco knows"]);
    yes([
      "This is not a Meralco statement.",
      "Your Meralco bill is ₱677.77.",
      "The Meralco meter is shared.",
      "Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.",
      "The Meralco account is on file.",
    ]);
  });
});

describe("guard round 2: words", () => {
  it("fails insults, profanity and deception in stretched, linked or leet forms", () => {
    no([
      "Ang tangang landlord",
      "Taaangaaa",
      "Bobong landlord",
      "Gagong ito",
      "ulolll",
      "T4ng4",
      "G@go",
      "St0pid",
      "You are an idiot",
      "fuuuck",
      "sh1t",
      "Asshole",
      "That is dumb",
      "Damn",
      "crap",
      "bitch",
      "scum",
      "thief",
      "liar",
      "cheat",
      "He stole it",
      "steal",
      "Dinaya ka",
      "May daya",
      "Budol",
      "Gantso",
      "Estafa ito",
      "Swindled",
      "Over-charged",
      "Over charging",
      "Sobra ang singil",
      "Singil na sobra",
      "Sobrang singil",
      "Maaari kang magsampa ng kaso",
      "You can sue",
      "demanda",
      "illegal",
      "Report them",
      "lawsuit",
      "fr@ud",
    ]);
  });
  it("does not punish ordinary Filipino words", () => {
    yes(["Gagamitin mo ang 45 kWh.", "Ang buwis ay bahagi ng bill.", "Tanggap ko ang ₱677.77."]);
  });
});

describe("guard round 2: dashes, markup, links", () => {
  it("fails dash variants", () => {
    no(["a — b", "a ― b", "a ⸺ b", "a ⸻ b", "a ﹘ b", "a – b"]);
  });
  it("fails HTML, protocol-relative and markdown links", () => {
    no(["<b>Your share</b>", "< script >x", "Your share is </p>", "See //evil", "See [here](x)", "kahati.com", "Visit www.x.y", "mail a@b.co"]);
    yes(["Your share is ₱677.77, which is 45 kWh."]);
  });
});

describe("guard round 2: typed names", () => {
  const tenant = { ...ctx, otherNames: [], factSheet: "Household: Santos (household B)." } as unknown as AskContext;
  const t = (q: string, a: string) => checkAnswer(a, tenant, { question: q }).ok;
  it("only flags words capitalized in the middle of the question", () => {
    expect(t("how can I use less aircon?", "Aircon uses a lot of power. Each kWh you save takes about ₱14.94 off your share.")).toBe(true);
    expect(t("why is my bill so high?", "High usage raises your share.")).toBe(true);
    expect(t("Paano makatipid sa electric fan?", "Electric fan ay mas matipid.")).toBe(true);
    expect(t("Did Mario use more than me?", "Mario is not on your bill.")).toBe(false);
    expect(t("did reyes use more?", "reyes is not on your bill.")).toBe(true);
    expect(t("Did Reyes use more?", "REYES is not shown.")).toBe(false);
    expect(t("Did Reyes use more?", "Reyés is not shown.")).toBe(false);
  });
  it("tolerates malformed history and question", () => {
    const bad = [null, { role: "user", text: 5 }, "x", 3] as unknown as { text: string }[];
    expect(checkAnswer("Your share is ₱677.77.", ctx, { question: "q", history: bad }).ok).toBe(true);
    expect(checkAnswer("Your share is ₱677.77.", ctx, { question: 5, history: "bad" }).ok).toBe(true);
  });
});

describe("guard round 3: look-alikes, spacing, variants, name false positives", () => {
  const t = (q: string, a: string) => checkAnswer(a, ctx, { question: q }).ok;
  it("fails look-alike Latin letters", () => {
    no(["scɑm", "frɑud", "ıdiot", "Gɑrcia used more.", "Garcıa used more.", "ʀeyes used more", "MeraIco says so."]);
  });
  it("fails spaced or punctuated letters", () => {
    no(["s c a m", "s-c-a-m", "s.c.a.m", "sc-am", "frau d", "o v e r c h a r g e d", "t a n g a", "D-A-Y-A", "M e r a l c o says", "R e y e s used more", "R-e-y-e-s", "R_e_y_e_s", "Re-yes"]);
  });
  it("fails profanity and legal variants", () => {
    no(["bullshit", "f*ck", "fck", "f u c k", "ulul", "kasuhan", "nandaraya", "kurap", "They lied.", "bwiset", "hayup", "pakshet"]);
  });
  it("still allows normal text", () => {
    yes(["Your share is ₱677.77.", "Meralco bill: your share is ₱677.77.", "Each kWh you save takes about ₱14.94 off your share."]);
  });
  it("does not punish capitalised common words", () => {
    expect(t("Should I unplug the TV?", "A TV on standby uses power. Your share is ₱677.77.")).toBe(true);
    expect(t("Is my AC the problem?", "An AC uses a lot of power.")).toBe(true);
    expect(t("Is the October bill high?", "The October bill is ₱677.77.")).toBe(true);
    expect(t("Paano makatipid sa Aircon?", "Linisin ang filter ng aircon.")).toBe(true);
    expect(t("Should I turn off the Wi-Fi router?", "A Wi-Fi router uses little power.")).toBe(true);
    expect(t("Did Mario use more than me?", "Mario is not on your bill.")).toBe(false);
  });
});
