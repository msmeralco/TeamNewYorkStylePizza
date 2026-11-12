// Preset questions for Ask Kahati, answered from templates (no AI): instant, stage-proof, same every time.
// Built only from ctx.facts. Wording rules: no "overcharged"/"owed"/"utang", no legal claims, no other
// household's name, never speaks for Meralco, no em dashes. The Filipino is a draft for Clarence to check.
import { RATES } from "@/data/tables";
import { LINE_KEYS, type AskPreset, type AskPresetId, type AskSource, type LineKey } from "@/types";
import type { AskContext, AskLanguage } from "./context";
import { discountFor } from "@/lib/engine/lifeline";

export const ASK_PRESETS: Record<"en" | "fil", AskPreset[]> = {
  en: [
    { id: "why_share", question: "Why is my share this amount?" },
    { id: "what_lines", question: "What am I paying for?" },
    { id: "save_kwh", question: "How much do I save per kWh?" },
    { id: "lifeline", question: "What is the 50 kWh line?" },
    { id: "readings_gap", question: "Why are kWh missing?" },
    { id: "rate_check", question: "Is my rate the same as the bill?" },
  ],
  fil: [
    { id: "why_share", question: "Bakit ganito ang bahagi ko?" },
    { id: "what_lines", question: "Ano ang binabayaran ko?" },
    { id: "save_kwh", question: "Magkano ang matitipid ko bawat kWh?" },
    { id: "lifeline", question: "Ano ang 50 kWh na hangganan?" },
    { id: "readings_gap", question: "Bakit may kulang na kWh?" },
    { id: "rate_check", question: "Pareho ba ang rate ko sa bill?" },
  ],
};

export const ASK_FOOTER: Record<"en" | "fil", string> = {
  en: "Computed by Kahati. Not a Meralco statement.",
  fil: "Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.",
};

// ---------- formatting ----------

const peso = (n: number) => `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pesoWhole = (n: number) => `₱${Math.round(n).toLocaleString("en-US")}`;
const kwh = (n: number) => String(Number(n.toFixed(1)));

const MONTH_FULL: Record<AskLanguage, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  fil: ["Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"],
};

const MONTHS: Record<AskLanguage, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  fil: ["Ene", "Peb", "Mar", "Abr", "Mayo", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis"],
};

function dateText(iso: string | undefined, lang: AskLanguage): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  return `${Number(m[3])} ${MONTHS[lang][Number(m[2]) - 1]}`;
}

function list(items: string[], lang: AskLanguage): string {
  if (items.length <= 1) return items.join("");
  const and = lang === "fil" ? "at" : "and";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

const LINE_NAME: Record<AskLanguage, Record<LineKey, string>> = {
  en: {
    generation: "generation",
    transmission: "transmission",
    systemLoss: "system loss",
    distribution: "distribution",
    supplyMetering: "supply and metering",
    taxes: "taxes",
    other: "other charges",
  },
  fil: {
    generation: "henerasyon",
    transmission: "transmisyon",
    systemLoss: "system loss",
    distribution: "distribusyon",
    supplyMetering: "supply at metering",
    taxes: "buwis",
    other: "iba pang singil",
  },
};

const LINE_GLOSS: Record<AskLanguage, Record<LineKey, string>> = {
  en: {
    generation: "the cost of producing the electricity",
    transmission: "the cost of carrying it over the main grid",
    systemLoss: "the share of power lost on the way",
    distribution: "the cost of the local lines and poles",
    supplyMetering: "the cost of supply and metering",
    taxes: "taxes on the bill",
    other: "the other charges on the bill",
  },
  fil: {
    generation: "ang gastos sa paggawa ng kuryente",
    transmission: "ang gastos sa pagdadala nito sa malaking linya",
    systemLoss: "ang kuryenteng nawawala sa daan",
    distribution: "ang gastos sa mga lokal na linya at poste",
    supplyMetering: "ang gastos sa supply at metering",
    taxes: "ang buwis sa bill",
    other: "ang iba pang singil sa bill",
  },
};

// ---------- answers ----------

type Answer = { answer: string; sources: AskSource[] };
const T = (ctx: AskContext) => ctx.language === "fil";

/**
 * Own-meter bills are shown gross. When the household has lifeline facts, say so and name the tier, so the
 * October amount never contradicts "50 kWh or less is 100% off". Never states that the household is enrolled.
 */
function grossNote(ctx: AskContext): { lead: { en: string; fil: string }; tail: { en: string; fil: string } } | null {
  const f = ctx.facts;
  if (ctx.mode !== "single" || f.lifelineForecastPeso == null || f.billKwh == null) return null;
  const pct = Math.round(discountFor(f.billKwh) * 100);
  const tail =
    pct >= 100
      ? { en: " On an enrolled meter, 50 kWh or less is 100% off most charges.", fil: " Sa naka-enroll na metro, 100% ang bawas sa halos lahat ng singil kapag 50 kWh o mas mababa." }
      : pct > 0
        ? { en: ` On an enrolled meter, ${kwh(f.billKwh)} kWh is ${pct}% off most charges.`, fil: ` Sa naka-enroll na metro, ${pct}% ang bawas sa halos lahat ng singil sa ${kwh(f.billKwh)} kWh.` }
        : { en: "", fil: "" };
  return { lead: { en: "Before any lifeline discount, ", fil: "Bago ang anumang lifeline discount, " }, tail };
}

function whyShare(ctx: AskContext): Answer {
  const f = ctx.facts;
  const fil = T(ctx);
  const sources: AskSource[] = ["share", "breakdown"];
  if (f.share == null) {
    return {
      answer: fil
        ? "Wala pa akong bahagi na maipapaliwanag. Kunin muna o i-type ang kulang na reading."
        : "There is no share to explain yet. Scan or type the missing readings first.",
      sources,
    };
  }
  if (ctx.mode === "single") {
    const fixed = f.fixedCharges;
    const g = grossNote(ctx);
    const answer = fil
      ? `${g ? g.lead.fil + "ang" : "Ang"} bill mo ay ${peso(f.share)} para sa ${f.billKwh != null ? kwh(f.billKwh) : "iyong"} kWh.` +
        (fixed != null ? ` Sa halagang iyon, ${peso(fixed)} ay nakapirming singil na hindi nagbabago sa gamit mo. Ang iba ay depende sa kWh mo.` : "") +
        (g ? g.tail.fil : "")
      : `${g ? g.lead.en + "your" : "Your"} bill is ${peso(f.share)} for ${f.billKwh != null ? kwh(f.billKwh) : "your"} kWh.` +
        (fixed != null ? ` Of that, ${peso(fixed)} is fixed charges that do not change with your use. The rest depends on your kWh.` : "") +
        (g ? g.tail.en : "");
    return { answer, sources };
  }
  const used = f.kwh != null && f.billKwh != null;
  const fixedTxt =
    f.fixedPart != null
      ? fil
        ? ` Dagdag dito ang pantay na ${peso(f.fixedPart)} mula sa ${f.fixedCharges != null ? `${peso(f.fixedCharges)} na ` : ""}nakapirming singil, na hinahati nang pantay sa mga sambahayan.`
        : ` On top of that is an equal ${peso(f.fixedPart)} part of the ${f.fixedCharges != null ? `${peso(f.fixedCharges)} ` : ""}fixed charges, which are split equally between households.`
      : "";
  const gap = f.checkStatus === "gap" && f.readingsKwh != null && f.missingKwh != null && f.kwh != null;
  let usedTxt = "";
  if (gap) {
    usedTxt = fil
      ? ` Gumamit ka ng ${kwh(f.kwh!)} sa ${kwh(f.readingsKwh!)} kWh na kabuuan ng mga reading; ang ${kwh(Math.abs(f.missingKwh!))} kWh na agwat ay hinahati ayon sa kWh.`
      : ` You used ${kwh(f.kwh!)} of the ${kwh(f.readingsKwh!)} kWh the readings add up to; the ${kwh(Math.abs(f.missingKwh!))} kWh gap is split by kWh.`;
  } else if (used) {
    usedTxt = fil
      ? ` Gumamit ka ng ${kwh(f.kwh!)} sa ${kwh(f.billKwh!)} kWh ng metro, kaya ganoon din kalaki ang bahagi mo sa bawat singil na batay sa kWh.`
      : ` You used ${kwh(f.kwh!)} of the meter's ${kwh(f.billKwh!)} kWh, so you pay that part of each kWh-based charge.`;
  }
  const answer = (fil ? `Ang bahagi mo ay ${peso(f.share)}.` : `Your share is ${peso(f.share)}.`) + usedTxt + fixedTxt;
  return { answer, sources };
}

function whatLines(ctx: AskContext): Answer {
  const f = ctx.facts;
  const fil = T(ctx);
  const lang = ctx.language;
  const sources: AskSource[] = ["breakdown"];
  if (!f.lines) {
    return {
      answer: fil ? "Wala pa akong hati ng bill na maipapakita. Kunin muna o i-type ang kulang na reading." : "There is no breakdown to show yet. Scan or type the missing readings first.",
      sources,
    };
  }
  const lines = f.lines;
  const sorted = [...LINE_KEYS].sort((a, b) => lines[b] - lines[a]);
  const top = sorted[0];
  const rest = sorted.slice(1).map((k) => LINE_NAME[lang][k]);
  const total = f.share != null ? ` ng ${peso(f.share)}` : "";
  const totalEn = f.share != null ? ` of your ${peso(f.share)}` : "";
  const g = grossNote(ctx);
  const answer = fil
    ? `${g ? g.lead.fil + "ang" : "Ang"} pinakamalaking bahagi${total} ay ${LINE_NAME.fil[top]} (${peso(lines[top])}), ${LINE_GLOSS.fil[top]}. Ang iba ay ${list(rest, lang)}. Kapag pinagsama ang lahat ng linya, makukuha ang ${ctx.mode === "single" ? "bill mo" : "bahagi mo"}.`
    : `${g ? g.lead.en + "the" : "The"} largest part${totalEn} is ${LINE_NAME.en[top]} (${peso(lines[top])}), ${LINE_GLOSS.en[top]}. The rest is ${list(rest, lang)}. Together the lines add up to your ${ctx.mode === "single" ? "bill" : "share"}.`;
  return { answer, sources };
}

function saveKwh(ctx: AskContext): Answer {
  const f = ctx.facts;
  const fil = T(ctx);
  const sources: AskSource[] = ["share"];
  const per = f.perKwhValue ?? f.effectiveRate;
  if (per == null) {
    return {
      answer: fil
        ? "Wala pa akong halaga bawat kWh. Kunin muna o i-type ang kulang na reading."
        : "There is no per kWh figure yet. Scan or type the missing readings first.",
      sources,
    };
  }
  const own = ctx.mode === "single";
  const row = [...RATES].sort((x, y) => x.month.localeCompare(y.month)).at(-1);
  let answer: string;
  if (own && row) {
    const mi = Number(row.month.slice(5, 7)) - 1;
    answer = fil
      ? `Bawat kWh na matipid mo, mga ${peso(row.perKwh)} ang bawas sa bill sa rate ng ${MONTH_FULL.fil[mi]}, bago ang anumang lifeline na diskwento. Sa metrong naka-enroll, 100% diskwento sa halos lahat ng singil kapag 50 kWh o mas mababa. Hindi nagbabago ang nakapirming singil sa gamit mo.`
      : `Each kWh you save takes about ${peso(row.perKwh)} off the bill at ${MONTH_FULL.en[mi]}'s rate, before any lifeline discount. On an enrolled meter, staying at 50 kWh or less is 100% off most charges. Fixed charges do not change with your use.`;
  } else {
    answer = fil
      ? `Bawat kWh na matipid mo, mga ${pesoWhole(per)} ang bawas sa bahagi mo (${peso(per)} sa bill na ito). Hindi nagbabago ang nakapirming singil sa gamit mo.`
      : `Each kWh you save takes about ${pesoWhole(per)} off your share (${peso(per)} on this bill). Fixed charges do not change with your use.`;
  }
  // The 50 kWh line is only for a household's own meter, so a shared meter never mentions it here.
  if (own && f.lifelineForecastPeso != null && f.lifelineUnderPeso != null && (f.forecastKwh ?? 0) > 50) {
    answer += fil
      ? ` Para sa iyo, ${underLine(f.lifelineUnderPeso, true)} sa halip na mga ${pesoWhole(f.lifelineForecastPeso)} kapag 50 kWh o mas mababa.`
      : ` For you, that is ${underLine(f.lifelineUnderPeso, false)} instead of about ${pesoWhole(f.lifelineForecastPeso)} at 50 kWh or less.`;
    sources.push("lifeline");
  }
  return { answer, sources };
}

/** What staying under 50 kWh gives: "100% off" when that is ₱0 (never "about ₱0"), otherwise an estimate. */
function underLine(peso: number, fil: boolean): string {
  if (peso < 0.005) return fil ? "100% diskwento sa halos lahat ng singil" : "100% off most charges";
  return `${fil ? "mga" : "about"} ${pesoWhole(peso)}`;
}

function lifeline(ctx: AskContext): Answer {
  const f = ctx.facts;
  const fil = T(ctx);
  if (ctx.mode === "single" && f.lifelineForecastPeso != null && f.lifelineUnderPeso != null && f.forecastKwh != null) {
    const date = dateText(f.readDate, ctx.language);
    const range = f.forecastLow != null && f.forecastHigh != null ? ` (${f.forecastLow} ${fil ? "hanggang" : "to"} ${f.forecastHigh})` : "";
    const on = f.forecastKwh <= 50;
    const answer = fil
      ? `Sa sariling metro, 100% ang diskwento sa halos lahat ng singil kapag 50 kWh o mas mababa (hindi kasama ang universal charges). Tinatayang ${f.forecastKwh} kWh ang gamit mo${date ? ` sa ${date}` : ""}${range}. ` +
        (on
          ? `Kung mananatili ka roon, mga ${pesoWhole(f.lifelineForecastPeso)} ang bill mo.`
          : `Kapag nanatili ka sa ilalim ng 50 kWh, ${underLine(f.lifelineUnderPeso, true)} ito sa halip na mga ${pesoWhole(f.lifelineForecastPeso)}. Mula 51 hanggang 70 kWh, 35% na lang ang diskwento.`)
      : `On your own meter, 50 kWh or less gives 100% off most charges (not universal charges). You are forecast at about ${f.forecastKwh} kWh${date ? ` by ${date}` : ""}${range}. ` +
        (on
          ? `If you stay there, your bill is about ${pesoWhole(f.lifelineForecastPeso)}.`
          : `Staying under 50 kWh is ${underLine(f.lifelineUnderPeso, false)} instead of about ${pesoWhole(f.lifelineForecastPeso)}. From 51 to 70 kWh the discount is 35%.`);
    return { answer, sources: ["lifeline", "forecast"] };
  }
  if (ctx.mode === "shared") {
    return {
      answer: fil
        ? "Para ang lifeline sa mga sambahayang 4Ps o may sertipikong mababa ang kita mula sa SWDO ng lungsod o munisipyo, at nasa iisang Meralco account at metro nito. Sa sariling metro na naka-enroll, 100% ang diskwento sa halos lahat ng singil kapag 50 kWh o mas mababa ang gamit sa buwan. Sa shared na metro, ang hangganan ay binabasa sa kabuuang kWh ng metro, kaya walang 50 kWh na hangganan para sa iisang sambahayan."
        : "Lifeline is for 4Ps households or households certified low-income by their city or municipal social welfare office (SWDO). It sits on one Meralco account and its meter. On a household's own enrolled meter, staying at 50 kWh or less gives 100% off most charges. On a shared meter the line is read on the whole meter's kWh, so there is no 50 kWh line for one household. A sub-metered tenant without their own account cannot claim it.",
      sources: ["lifeline"],
    };
  }
  return {
    answer: fil
      ? "Sa sariling metro na naka-enroll, 100% ang diskwento sa halos lahat ng singil kapag 50 kWh o mas mababa sa buwan, 35% mula 51 hanggang 70 kWh, at 20% hanggang 100 kWh. Para ito sa mga sambahayang 4Ps o SWDO-certified. Wala pa akong tantiya ng gamit mo para sa buwang ito."
      : "On a household's own enrolled meter (4Ps or SWDO-certified), 50 kWh or less in a month gives 100% off most charges, 51 to 70 kWh gives 35% off, and up to 100 kWh gives 20% off. There is no usage forecast for this month yet.",
    sources: ["lifeline"],
  };
}

function readingsGap(ctx: AskContext): Answer {
  const f = ctx.facts;
  const fil = T(ctx);
  const sources: AskSource[] = ["check"];
  if (ctx.mode === "single") {
    return {
      answer: fil
        ? `Sariling metro mo ito, kaya walang sub-meter na pagsasamahin.${f.billKwh != null ? ` Ang ${kwh(f.billKwh)} kWh sa bill ang ginagamit.` : ""}`
        : `This is your own meter, so there are no sub-meters to add up.${f.billKwh != null ? ` The bill's ${kwh(f.billKwh)} kWh is what counts.` : ""}`,
      sources: ["share"],
    };
  }
  const tol = f.toleranceKwh != null ? kwh(f.toleranceKwh) : null;
  const typed = f.typed
    ? fil
      ? " Tinype ang reading mo, kaya may tatak itong Tinype hangga't hindi pa kumpirmado ng litrato."
      : " Your reading was typed, so it shows as Typed until a photo confirms it."
    : "";
  if (f.checkStatus && f.readingsKwh != null && f.billKwh != null) {
    if (f.checkStatus === "ok") {
      return {
        answer: fil
          ? `Tugma ang mga reading: ${kwh(f.readingsKwh)} sa ${kwh(f.billKwh)} kWh ng bill${tol ? `, sa loob ng 5% (${tol} kWh)` : ""}. Walang kulang na kWh.${typed}`
          : `The readings add up: ${kwh(f.readingsKwh)} of ${kwh(f.billKwh)} kWh on the bill${tol ? `, within the 5% (${tol} kWh) tolerance` : ""}. No kWh are missing.${typed}`,
        sources,
      };
    }
    const gap = f.missingKwh ?? f.billKwh - f.readingsKwh;
    const n = kwh(Math.abs(gap));
    return {
      answer: fil
        ? `Ang mga reading ay ${kwh(f.readingsKwh)} sa ${kwh(f.billKwh)} kWh ng bill, kaya ${n} kWh ang ${gap >= 0 ? "kulang" : "sobra"}. Maaaring dahil ito sa reading na uulitin, sirang sub-meter, o koneksyong walang metro. Ipinapakita lang ito ng Kahati at hindi hinuhulaan ang dahilan. Habang hindi pa naaayos, hinahati ang kulang ayon sa kWh.${typed}`
        : `The readings add up to ${kwh(f.readingsKwh)} of ${kwh(f.billKwh)} kWh on the bill, so ${n} kWh ${gap >= 0 ? "are missing" : "are extra"}. It can come from a reading to retake, a faulty sub-meter or an unmetered connection. Kahati shows the gap and does not guess the cause. Until it is fixed, the gap is split by kWh.${typed}`,
      sources,
    };
  }
  const bill = f.billKwh != null ? kwh(f.billKwh) : null;
  return {
    answer: fil
      ? `Dapat pagsama-samahin ng mga reading ng sub-meter ang ${bill ? `${bill} kWh ng bill` : "kWh ng bill"}, sa loob ng mga 5%${tol ? ` (${tol} kWh)` : ""}. Kapag kulang, hinahati ang kulang ayon sa kWh hangga't hindi pa naaayos.`
      : `The sub-meter readings must add up to the bill's ${bill ? `${bill} kWh` : "kWh"}, within about 5%${tol ? ` (${tol} kWh)` : ""}. When they fall short, the gap is split by kWh until it is fixed.`,
    sources,
  };
}

function rateCheckAnswer(ctx: AskContext): Answer {
  const f = ctx.facts;
  const fil = T(ctx);
  const sources: AskSource[] = ["rateCheck"];
  if (f.chargedRate == null) {
    const eff = f.effectiveRate != null ? peso(f.effectiveRate) : null;
    const who = ctx.mode === "shared";
    return {
      answer: fil
        ? `${who ? "Hindi naglagay ng rate bawat kWh ang organizer" : "Walang inilagay na rate bawat kWh"}, kaya walang maihahambing.${eff ? ` Ang bill ay lumalabas na ${eff} bawat kWh.` : ""}`
        : `${who ? "The organizer did not enter a per-kWh rate" : "No per-kWh rate was entered"}, so there is nothing to compare.${eff ? ` The bill works out to ${eff} per kWh.` : ""}`,
      sources: eff ? ["share"] : sources,
    };
  }
  const charged = peso(f.chargedRate);
  const eff = f.effectiveRate != null ? peso(f.effectiveRate) : null;
  const above = f.effectiveRate != null && f.chargedRate > f.effectiveRate * 1.02;
  const below = f.effectiveRate != null && f.chargedRate < f.effectiveRate * 0.98;
  const kwhPart = f.kwh != null ? ` on a ${kwh(f.kwh)} kWh share` : "";
  let answer: string;
  if (above && eff && f.askedAmount != null && f.aboveBy != null && f.aboveBy <= 0) {
    const by = peso(Math.abs(f.aboveBy));
    const sh = f.share != null ? peso(f.share) : null;
    answer = fil
      ? `Hiningi sa iyo ang ${charged} bawat kWh. Ang bill ay lumalabas na ${eff} bawat kWh. Ang ${peso(f.askedAmount)} ay ${by} na mas mababa${sh ? ` sa bahagi mo na ${sh}` : " sa bahagi mo"}.`
      : `You were asked ${charged} per kWh. The bill works out to ${eff} per kWh. ${peso(f.askedAmount)} is ${by} below your share${sh ? ` of ${sh}` : ""}.`;
  } else if (above && eff && f.askedAmount != null && f.aboveBy != null) {
    answer = fil
      ? `Hiningi sa iyo ang ${charged} bawat kWh. Ang bill ay lumalabas na ${eff} bawat kWh, kaya ang ${peso(f.askedAmount)} ay ${peso(f.aboveBy)} na mas mataas sa rate ng bill${f.kwh != null ? ` sa bahaging ${kwh(f.kwh)} kWh` : ""}. Puwedeng singilin nang hiwalay ng may-ari ang ilang gastos. Hingin ang master bill.`
      : `You were asked ${charged} per kWh. The bill works out to ${eff} per kWh, so ${peso(f.askedAmount)} is ${peso(f.aboveBy)} above the bill's rate${kwhPart}. Landlords may bill some costs separately. Ask to see the master bill.`;
  } else if (below && eff) {
    answer = fil
      ? `Hiningi sa iyo ang ${charged} bawat kWh. Ang bill ay lumalabas na ${eff} bawat kWh, kaya mas mababa ang hiningi sa rate ng bill.`
      : `You were asked ${charged} per kWh. The bill works out to ${eff} per kWh, so the rate asked is below the bill's rate.`;
  } else {
    answer = fil
      ? `Hiningi sa iyo ang ${charged} bawat kWh${eff ? ` at ang bill ay lumalabas na ${eff} bawat kWh` : ""}. Pareho ang rate na hiningi sa rate ng bill.`
      : `You were asked ${charged} per kWh${eff ? ` and the bill works out to ${eff} per kWh` : ""}. The charged rate matches the bill's rate.`;
  }
  return { answer, sources };
}

export function answerPreset(id: AskPresetId, ctx: AskContext): Answer {
  switch (id) {
    case "why_share":
      return whyShare(ctx);
    case "what_lines":
      return whatLines(ctx);
    case "save_kwh":
      return saveKwh(ctx);
    case "lifeline":
      return lifeline(ctx);
    case "readings_gap":
      return readingsGap(ctx);
    case "rate_check":
      return rateCheckAnswer(ctx);
  }
}

// ---------- follow-ups ----------

const FOLLOW: Record<AskPresetId, AskPresetId[]> = {
  why_share: ["what_lines", "save_kwh", "rate_check", "readings_gap", "lifeline"],
  what_lines: ["why_share", "save_kwh", "lifeline", "rate_check", "readings_gap"],
  save_kwh: ["lifeline", "why_share", "what_lines", "rate_check", "readings_gap"],
  lifeline: ["save_kwh", "why_share", "what_lines", "rate_check", "readings_gap"],
  readings_gap: ["why_share", "rate_check", "what_lines", "save_kwh", "lifeline"],
  rate_check: ["why_share", "what_lines", "save_kwh", "readings_gap", "lifeline"],
};

const START: AskPresetId[] = ["why_share", "what_lines", "save_kwh", "rate_check", "readings_gap", "lifeline"];

export function suggestionsAfter(id: AskPresetId | null, ctx: AskContext): AskPreset[] {
  const order = id ? FOLLOW[id] : START;
  const relevant = (p: AskPresetId) => {
    if (p === "readings_gap") return ctx.mode === "shared";
    if (p === "rate_check") return ctx.facts.chargedRate != null;
    return true;
  };
  const ranked = [...order.filter(relevant), ...order.filter((p) => !relevant(p))].filter((p) => p !== id);
  const byId = new Map(ASK_PRESETS[ctx.language].map((p) => [p.id, p]));
  return ranked.slice(0, 3).map((p) => ({ ...(byId.get(p) as AskPreset) }));
}
