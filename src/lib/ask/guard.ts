// Guardrails for Ask Kahati: clean the question, and check an AI answer before it is shown.
// The answer guard FAILS CLOSED: a failed guard only means a template answer is shown instead,
// so the rules are simple and broad rather than clever.
import type { AskContext } from "./context";
import { ASK_FOOTER } from "./presets";

export const MAX_QUESTION_CHARS = 500;
export const MAX_ANSWER_CHARS = 700;

export type QuestionCheck = { ok: true; question: string } | { ok: false; code: "empty" | "too_long" };

/** Trim, drop control characters, and enforce the length limit. */
export function checkQuestion(q: unknown): QuestionCheck {
  if (typeof q !== "string") return { ok: false, code: "empty" };
  // eslint-disable-next-line no-control-regex
  const question = q.replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ").trim();
  if (!question) return { ok: false, code: "empty" };
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, code: "too_long" };
  return { ok: true, question };
}

// ---------- folding ----------

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

/** NFKC, lowercase, drop accents, map leetspeak. Used ONLY for word checks, never for numbers. */
function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch);
}
/** Collapse stretched letters (tangaaa, fuuuck). The banned patterns below are written collapsed: "illegal" is "ilegal". */
const collapse = (s: string) => s.replace(/(\p{L})\1+/gu, "$1");

const INVISIBLE = /[\p{Cf}­͏ᅟᅠㅤ﻿⁠-⁤​-‏]/u;
const NON_LATIN_LETTER = /(?![\p{Script=Latin}])\p{L}/u;
const VULGAR_FRACTION = /[¼-¾⅐-⅟↉⁄]/;

// ---------- banned words (written against collapsed text) ----------

const BANNED: [string, RegExp][] = [
  ["overcharged", /over[\s-]*charg/],
  ["owed", /\bow(?:e|es|ed|ing)\b|utang|\brefund|entitled\s+to|pay\s+you\s+back|ibalik\s+(?:ang\s+)?pera/],
  ["overcharge in Filipino", /sobra\w*(?:\W+\w+){0,3}?\W+\w*singil|\w*singil\w*(?:\W+\w+){0,3}?\W+sobra/],
  ["deception or fraud", /daya|daraya|\bd(?:in|um)aya|budol|gantso|estafa|scam|fraud|swindl|kurap/],
  ["profanity", /fuck|f+c+k|shit|ashole|bitch|paksh|bwise?t|buwise?t/],
  [
    "legal",
    /\bsue(?:d|s)?\b|\bsuing\b|\bkas(?:o(?:ng|han|hin)?|uh(?:an|in))\b|demanda|ilegal|\bunlawful|against\s+the\s+law|labag\s+sa\s+batas|bawal\s+sa\s+batas|lawsuit|report\s+(?:them|him|her)\b|ireklamo|reklamo|lawyer|abogado|\bcourt\b|\bkorte\b|\berc\s+complaint/,
  ],
  ["theft", /nakaw|kawatan|\bthie|\bsteal|\bstole|\brob(?:er\w*|ed|ing|s)?\b|\bburglar/],
  ["cheating", /\bcheat|\brip+(?:ed|ing)?[\s-]*(?:\w+\s+)?of+\b|\bcrok|\bliar|\blying\b|\blie[ds]?\b|\bextort|\bgoug|\bcorupt|\bexploit/],
  ["deception in Filipino", /\bniloko|\blokohin|\bloko\b|manloloko|manlolokong|niloloko|mandaraya|sinungaling|kurakot|buwaya/],
  [
    "insult",
    /\b(?:gago|tanga(?:ng)?(?![a-z])|bobo|ul[ou]l|tarantado|pakyu|siraulo|lintik|(?:pu)?tang\s?ina|bwisit|buwisit|gungong|punyeta|letse|inutil|hinayupak|walang\s?hiya|kupal|ungas|engot|bwakanang|stupid|idiot|moron|bastard|jerk|gredy|sakim|gahaman|fuck|shit|ashole|dumb|damn|crap|bitch|scum)\w*|\b(?:gaga(?:ng)?|hayop|hayup|pota|puta(?:ng)?|leche)\b/,
  ],
];

// ---------- spelled-out numbers ----------

const EN_PIECES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fourty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million", "billion", "trillion", "dozen", "score", "gross", "half", "halves",
];
const EN_SUFFIX = new Set(["", "s", "th", "ths", "st", "nd", "rd"]);
/** Roots that are never part of an ordinary word, so they match as a substring. */
const EN_SUBSTRING =
  /hundred|thousand|million|billion|dozen|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|eleven|twelve|twenty|thirty|fifty|sixty|seventy|eighty|ninety/;

/** True when the whole token is number words glued together (sevenhundred, twentyfive, hundreds). A lone "one" is handled apart. */
function isEnglishNumberToken(t: string): boolean {
  if (/^ones?$/.test(t)) return false;
  const memo = new Map<string, boolean>();
  const full = (s: string): boolean => {
    if (s === "") return true;
    const hit = memo.get(s);
    if (hit !== undefined) return hit;
    const r = EN_PIECES.some((p) => s.startsWith(p) && full(s.slice(p.length)));
    memo.set(s, r);
    return r;
  };
  for (let end = t.length; end >= 3; end--) if (EN_SUFFIX.has(t.slice(end)) && full(t.slice(0, end))) return true;
  return false;
}

const FIL_WHOLE = new Set(["dalawa", "tatlo", "apat", "lima", "anim", "pito", "walo", "siyam", "sampu", "daan", "raan", "daang", "raang", "libo", "libong"]);
// dalawang, tatlong, limang, pitong, walong, sampung, dalawampu, dalawampung ...
const FIL_LINKED = /^(?:dalawa|tatlo|lima|pito|walo|sampu)(?:ng|n|ngpu|ngpung)?$/;
// sandaan, sangdaan, isandaan, dalawandaan, sanlibo, sanlibong, tatlongdaan ...
const FIL_PREFIXED = /^(?:(?:i?sa)(?:ng|n)|(?:dalawa|tatlo|apat|lima|anim|pito|walo|siyam|sampu)(?:ng|n)?)-?(?:(?:da|ra)a(?:ng|n)|libo(?:ng)?)$/;
const FIL_TENS = /^(?:dalawampu|tatlumpu|apatnapu|limampu|animnapu|pitumpu|walumpu|siyamnapu|singkwenta|kwarenta|sesenta|setenta|otsenta|nobenta|beinte|siyentos?|labin|labing)/;
// "one", "isa", "isang" and Spanish money words are ordinary words; they count only next to a money or unit word.
const MONEY = "(?:pesos?|piso|php|kwh|kilowatt\\w*|centavos?|sentimo)";
const ONE_AS_QUANTITY = new RegExp(
  `\\b(?:one|isa|isang|uno|dos|tres|kwatro|singko|sais|siyete|otso|nuwebe|diyes|onse|dose|bente|trenta|siyento|mil)\\s+(?:\\S+\\s+){0,2}${MONEY}\\b|₱\\s*(?:one|isa|isang)\\b`,
);

function hasNumberWord(wordText: string): boolean {
  if (ONE_AS_QUANTITY.test(wordText) || EN_SUBSTRING.test(wordText)) return true;
  if (/milyon|kalahati/.test(wordText)) return true;
  for (const t of wordText.match(/\p{L}+/gu) ?? []) {
    if (isEnglishNumberToken(t) || FIL_WHOLE.has(t) || FIL_LINKED.test(t) || FIL_PREFIXED.test(t) || FIL_TENS.test(t)) return true;
  }
  return false;
}

// ---------- numbers ----------

const MAGNITUDE_SUFFIX = /\d(?:[.,]\d+)?[ \t]?(?:k|m|b|mil|thou)(?![\p{L}\p{N}])/iu;
/** Digit groups written with a separator other than a plain comma: 1 000, 1'000, 1_000, 1.000,00. */
const GROUPED = /(?<!\d)\d{1,3}(?:[     ]\d{3})+(?!\d)|\d[ '’ʼ`´˙_٬]\d|\d{1,3}(?:\.\d{3})+,\d+|\d{1,3}(?:\.\d{3}){2,}/;

/** Every digit group in the string values of the facts (dates such as 2026-10-05 give 2026, 10, 5). */
function numbersFromStrings(x: unknown, out: number[]): void {
  if (typeof x === "string") {
    for (const m of x.match(/\d+/g) ?? []) out.push(Number(m));
  } else if (Array.isArray(x)) {
    for (const v of x) numbersFromStrings(v, out);
  } else if (x && typeof x === "object") {
    for (const v of Object.values(x)) numbersFromStrings(v, out);
  }
}

/** List numbering 1., 2., 3. is dropped only when two or more consecutive numbered lines start at 1 and are followed by a letter. */
function stripListNumbers(text: string): string {
  const re = /^[ \t]*(\d{1,2})[.)][ \t]+(?=\p{L})/gmu;
  const hits = [...text.matchAll(re)];
  if (hits.length < 2 || hits.some((m, i) => Number(m[1]) !== i + 1)) return text;
  return text.replace(re, "");
}

function extractNumbers(text: string): number[] {
  const cleaned = stripListNumbers(text);
  const found = cleaned.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) ?? [];
  return found.map((s) => Number(s.replace(/,/g, ""))).filter((n) => Number.isFinite(n));
}

// ---------- links and markup ----------

const URL_LIKE = [
  /\bhttps?:\/\//i,
  /\bwww\./i,
  /\]\s*\(/,
  /\b[a-z][a-z0-9+.-]*:\/\//i,
  /\b(?:javascript|data|mailto|file|vbscript):/i,
  /\b[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/i,
  /\w@\w/,
  /\b(?:dot|punto)\s*(?:com|net|org|ph|app|io|co|dev)\b/i,
  /[[(]\s*dot\s*[\])]/i,
];

/** Join neighbouring word fragments when either is 2 letters or fewer ("frau d", "o v e r"). */
function squashShort(s: string): string {
  const toks = s.match(/\p{L}+/gu) ?? [];
  const out: string[] = [];
  let prevShort = false;
  for (const t of toks) {
    const short = t.length <= 2;
    if (out.length && (short || prevShort)) out[out.length - 1] += t;
    else out.push(t);
    prevShort = short;
  }
  return out.join(" ");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- names ----------

const COMMON = new Set(
  (
    "the and but for you your yours are was were not what why how when where who which that this these those with from have has had can could would should will shall may might must " +
    "say said tell please ignore forget stop start give show explain describe answer pretend act rules rule instructions instruction previous above below system prompt " +
    "my mine our ours his her him she they them their there here yes also just only any all some more most less much many very too then than into onto about over under " +
    "share bill kwh peso pesos meter reading readings rate check lifeline save power electricity household kahati meralco compound unit month period " +
    "did does do doing done is am be been being it its if so no of in on to by as at or up out get got paid pay use used need make per whom whose ask asked told think know see look want like going go come " +
    "ako ikaw siya kami tayo kayo sila ang ng sa na at ay mo ko niya namin natin ninyo nila ito iyan iyon ano bakit paano saan sino kailan hindi huwag pakisabi sabihin " +
    "ok lorna " +
    "january february march april may june july august september october november december enero pebrero marso abril mayo hunyo hulyo agosto setyembre oktubre nobyembre disyembre " +
    "monday tuesday wednesday thursday friday saturday sunday lunes martes miyerkules huwebes biyernes sabado linggo christmas pasko easter undas semana santa bagong taon " +
    "aircon ac tv led pc router bulb bulbs ref refrigerator fridge freezer fan electric washing machine washer dryer microwave oven rice cooker plantsa iron laptop phone charger heater television wifi fi wi lights light lamp ilaw kuryente inverter"
  ).split(/\s+/),
);

const NAME_PARTICLES = new Set(["dela", "de", "del", "san", "los", "las", "ang", "mga", "van", "von", "bin"]);
const wordRe = (w: string) => new RegExp("(?<![\\p{L}\\p{N}])" + escapeRe(w) + "(?![\\p{L}\\p{N}])", "u");

/** Words typed in the question or history that are capitalized in the MIDDLE of a sentence (likely proper nouns), folded. */
function typedProperNouns(texts: string[], skip: Set<string>): string[] {
  const out = new Set<string>();
  for (const t of texts) {
    if (!/\p{Ll}/u.test(t)) continue; // ALL CAPS: every word would look like a name
    for (const m of t.matchAll(/\p{L}[\p{L}'’-]*/gu)) {
      const raw = m[0].replace(/['’]s$/i, "");
      if (raw.length < 2 || !/^\p{Lu}/u.test(raw)) continue;
      if (raw.length <= 4 && raw === raw.toUpperCase()) continue; // TV, AC, LED, PC
      if (raw.includes("-") && raw.split("-").some((p) => p.length <= 2)) continue; // Wi-Fi
      const before = t.slice(0, m.index).replace(/[\s"'“”‘’([{«¿¡-]+$/u, "");
      if (before === "" || /[.!?:;\n]$/.test(before)) continue; // sentence start
      const w = fold(raw);
      if (w.length < 2 || COMMON.has(w) || skip.has(w)) continue;
      out.add(w);
    }
  }
  return [...out];
}

/**
 * Roots that mark the reserved topic, matched on folded text (lowercase, no accents, leetspeak mapped).
 * Over-matching is fine: the answer falls back to a template.
 */
const RESERVED_TOPIC = new RegExp(
  [
    // who charges and what was asked
    "landlord", "landlady", "organi[sz]er", "owner", "kasera", "kasero", "may[\\s-]?ari", "nagpapaupa", "may[\\s-]?bahay", "renter",
    "charged\\s+you", "charging\\s+you", "asked\\s+(?:you\\s+)?to\\s+pay", "siningil", "sinisingil", "hinihingi", "pinapabayad",
    // refunds and getting money back
    "refund", "\\bback\\b", "ibalik", "isauli", "pabalik", "bawiin", "too\\s+much", "deserve", "hingin", "return\\s+the",
    // overcharge and exploitation
    "sobra", "sumobra", "labis", "abuso", "abuse", "lamang", "samantal", "advantage", "profit", "pocket", "kumikita", "exploit", "unfair", "hindi\\s+patas", "dapat\\s+(?:lang|ka)",
    // rules, legal and authorities
    "\\berc\\b", "complain", "reklamo", "report", "sumbong", "police", "pulis", "barangay", "\\blaw\\b", "batas", "legal", "violat", "allowed", "bawal", "rules?\\b", "regulat", "authorit", "court", "hukuman", "attorney", "abogado",
    // attributions to anyone official
    "says", "said", "confirm", "agree", "sabi", "ayon\\s+sa", "according\\s+to", "utility",
  ].join("|"),
  "i",
);

export function checkAnswer(
  answer: string,
  ctx: AskContext,
  user?: { question?: unknown; history?: unknown },
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const text = typeof answer === "string" ? answer : "";
  if (!text.trim()) problems.push("empty answer");
  if (text.length > MAX_ANSWER_CHARS) problems.push(`answer longer than ${MAX_ANSWER_CHARS} characters`);

  // 1. Script and invisible characters.
  if (INVISIBLE.test(text)) problems.push("invisible or format character");
  if (NON_LATIN_LETTER.test(text)) problems.push("letters outside the Latin script");
  // Fail closed on look-alike Latin letters (ɑ, ı, ʀ, ſ): only A-Z with accents (ñ, é) are allowed.
  if ((text.match(/\p{L}/gu) ?? []).some((ch) => !/^[A-Za-z]/.test(ch.normalize("NFD")))) problems.push("unusual letter");
  if (/(?:(?<![\p{L}\p{N}])\p{L}[\s._*-]+){2,}\p{L}(?![\p{L}\p{N}])/u.test(text) || /\p{L}\*+\p{L}/u.test(text)) problems.push("spaced or masked letters");
  if (VULGAR_FRACTION.test(text)) problems.push("fraction character");

  const nf = text.normalize("NFKC");
  const word = fold(text);
  const wc = collapse(word);
  // Disguise variants: v1 drops joiners between letters (s-c-a-m, R_e_y_e_s); v2 also joins fragments of 2 letters or fewer (frau d).
  const v1 = word.replace(/(?<=\p{L})[-._*·]+(?=\p{L})/gu, "");
  const v2 = squashShort(v1);

  // 2. Numbers: digits only, and only numbers from the facts.
  if (/(?![0-9])\p{Nd}/u.test(nf)) problems.push("non-ASCII digits");
  if (MAGNITUDE_SUFFIX.test(nf)) problems.push("number with a magnitude suffix");
  if (GROUPED.test(nf)) problems.push("number with grouped digits not in the facts");
  if (hasNumberWord(word)) problems.push("number written as words");
  const allowed = [...(ctx.allowedNumbers ?? [])];
  numbersFromStrings(ctx.facts, allowed);
  for (const n of extractNumbers(nf)) {
    if (!allowed.some((a) => Math.abs(a - n) <= 0.01 + 1e-9)) problems.push("number not in the facts: " + n);
  }

  // 3. Meralco: only as a noun phrase (Meralco bill, rate, meter, account, statement, announcement), or inside the footer.
  let noFooter = word;
  for (const f of Object.values(ASK_FOOTER)) noFooter = noFooter.split(fold(f)).join(" ");
  const OK_MERALCO = /meral[ck]o(?:['’]s)?\W+(?:\p{L}+\W+)?(?:bills?|rates?|meter|account|statement|announcement)(?!\p{L})/gu;
  const hasMeralco = (x: string) => {
    const rest = x.replace(OK_MERALCO, " ");
    return /meral[ck]o/.test(rest) || /meral[ck]o/.test(rest.replace(/i/g, "l"));
  };
  const nfv1 = noFooter.replace(/(?<=\p{L})[-._*·]+(?=\p{L})/gu, "");
  if ([noFooter, nfv1, squashShort(nfv1.replace(OK_MERALCO, " "))].some(hasMeralco)) problems.push("speaks for Meralco");
  for (const m of noFooter.matchAll(/meral[ck]o/g)) {
    const after = noFooter.slice((m.index ?? 0) + m[0].length);
    if (!/^(?:['’]s)?\W+(?:\p{L}+\W+)?(?:bills?|rates?|meter|account|statement|announcement)(?!\p{L})/u.test(after)) {
      problems.push("speaks for Meralco");
      break;
    }
  }

  // 4. Words.
  for (const [label, re] of BANNED) if (re.test(wc) || re.test(collapse(v1))) problems.push("banned word: " + label);

  // Reserved topic: what the organizer charged, refunds, blame, rules and authorities. Free text never
  // discusses these; the rate_check template does, in reviewed wording. Fail closed on broad roots.
  for (const x of [word, v1]) {
    if (RESERVED_TOPIC.test(x)) {
      problems.push("reserved topic (organizer charges, refunds, rules or authorities)");
      break;
    }
  }
  for (const n of [ctx.facts?.askedAmount, ctx.facts?.aboveBy, ctx.facts?.chargedRate]) {
    if (typeof n !== "number") continue;
    if (extractNumbers(nf).some((x) => Math.abs(x - Math.abs(n)) <= 0.01 + 1e-9)) {
      problems.push("rate-check number in free text");
      break;
    }
  }
  if (/\b(?:f+[uv]+c?k+\w*|phuck\w*|biatch\w*|wtf|stfu)\b/.test(wc)) problems.push("banned word: profanity");
  if (/scam|fraud|overcharg|swindl|budol|estafa|fuck|bitch|shit/.test(collapse(v2))) problems.push("banned word: disguised");

  // 5. Dashes.
  if (/[—―⸺⸻﹘]/.test(nf) || /\s–\s/.test(nf)) problems.push("contains a dash");

  // 6. Markup and links.
  if (/<\s*\/?\s*[a-z]/i.test(nf) || /&#?\w+;/.test(nf)) problems.push("contains markup");
  if (/\/\/\S/.test(nf) || /\]\s*\(/.test(nf) || /\[[^\]]*\]\s*\[/.test(nf)) problems.push("contains a link");
  if (URL_LIKE.some((re) => re.test(nf))) problems.push("contains a URL or link");

  // 7. Names.
  const ownWords = new Set(fold(ctx.factSheet ?? "").match(/\p{L}+/gu) ?? []);
  for (const w of fold(`${ctx.displayName ?? ""} ${ctx.label ?? ""}`).match(/\p{L}+/gu) ?? []) ownWords.add(w);
  let hitOther = false;
  for (const name of ctx.otherNames ?? []) {
    const n = fold(String(name)).trim();
    if (!n) continue;
    const squashed = n.replace(/[^\p{L}\p{N}]+/gu, "");
    const tokens = (n.match(/\p{L}{3,}/gu) ?? []).filter((t) => !NAME_PARTICLES.has(t) && !COMMON.has(t) && !ownWords.has(t));
    if (wordRe(n).test(word) || (squashed.length >= 3 && wordRe(squashed).test(word)) || tokens.some((t) => wordRe(t).test(word))) hitOther = true;
    if (squashed.length >= 3 && wordRe(squashed).test(v1)) hitOther = true;
    if (squashed.length >= 5 && v2.includes(squashed)) hitOther = true;
  }
  if (hitOther) problems.push("mentions another household");

  const turns: unknown[] = Array.isArray(user?.history) ? (user!.history as unknown[]) : [];
  const typedTexts = [user?.question, ...turns.map((t) => (t && typeof t === "object" ? (t as { text?: unknown }).text : undefined))].filter(
    (x): x is string => typeof x === "string",
  );
  for (const w of typedProperNouns(typedTexts, ownWords)) {
    if (wordRe(w).test(word)) {
      problems.push("repeats a name from the question");
      break;
    }
  }

  return { ok: problems.length === 0, problems };
}
