import { describe, expect, it } from "vitest";
import { sampleCompoundState } from "@/data/sample";
import { validateState } from "./validate";
import { POST as splitPost } from "@/app/api/split/route";
import { POST as ratePost } from "@/app/api/rate-check/route";
import { POST as checkPost } from "@/app/api/check/route";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const bad = (mut: (s: Any) => void) => {
  const s: Any = sampleCompoundState();
  mut(s);
  return validateState(s);
};
const req = (body: unknown) =>
  new Request("http://localhost/api/x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("validateState", () => {
  it("accepts the sample and fills defaults", () => {
    const s: Any = sampleCompoundState();
    delete s.unmeteredKwh;
    delete s.chargedRates;
    const v = validateState(s);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.state.unmeteredKwh).toBe(0);
      expect(v.state.chargedRates).toEqual([]);
    }
  });
  it.each([
    ["not an object", () => validateState(null), "needs a state object"],
    ["bad mode", () => bad((s) => (s.compound.mode = "x")), "compound.mode"],
    ["households", () => bad((s) => (s.households = {})), "households"],
    ["meters", () => bad((s) => delete s.meters), "meters"],
    ["kwh zero", () => bad((s) => (s.bill.kwh = 0)), "bill.kwh"],
    ["kwh string", () => bad((s) => (s.bill.kwh = "180")), "bill.kwh"],
    ["amount", () => bad((s) => (s.bill.amount = null)), "bill.amount"],
    ["fixed", () => bad((s) => (s.bill.fixedCharges = -1)), "fixedCharges"],
    ["line", () => bad((s) => delete s.bill.lines.taxes), "lines.taxes"],
    ["date", () => bad((s) => (s.bill.readDate = "2026-02-30")), "readDate"],
    ["next date", () => bad((s) => (s.bill.nextReadDate = "tomorrow")), "nextReadDate"],
    ["reading value", () => bad((s) => (s.currentReadings[0].value = "x")), "currentReadings[0].value"],
    ["reading source", () => bad((s) => (s.previousReadings[1].source = "scan")), "previousReadings[1].source"],
    ["unmetered", () => bad((s) => (s.unmeteredKwh = -1)), "unmeteredKwh"],
    ["rates", () => bad((s) => (s.chargedRates = "no")), "chargedRates"],
  ])("rejects %s", (_n, run, text) => {
    const v = run();
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("bad_state");
      expect(v.message).toContain(text);
      expect(v.next).toBe("Send {state} from GET /api/sample.");
    }
  });
});

describe("routes", () => {
  it.each([
    ["split", splitPost, {}],
    ["rate-check", ratePost, { householdId: "hB" }],
    ["check", checkPost, {}],
  ])("%s returns 400 bad_state for a bad state", async (_n, post, extra) => {
    const s: Any = sampleCompoundState();
    s.bill.kwh = -5;
    const res = await post(req({ state: s, ...extra }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.code).toBe("bad_state");
    expect(j.error.message).toContain("bill.kwh");
    expect(j.error.next).toBe("Send {state} from GET /api/sample.");
  });

  it("returns bad_state when state is missing and bad_json for junk", async () => {
    expect((await (await splitPost(req({}))).json()).error.code).toBe("bad_state");
    const res = await checkPost(req("{nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_json");
  });

  it("rate-check needs a householdId and a charged rate", async () => {
    const state = sampleCompoundState();
    expect((await ratePost(req({ state }))).status).toBe(400);
    const res = await ratePost(req({ state, householdId: "hA" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("no_charged_rate");
  });

  it("works for the sample", async () => {
    const state = sampleCompoundState();
    const sp = await (await splitPost(req({ state }))).json();
    expect(sp.shares.map((x: Any) => x.amount)).toEqual([782.36, 677.77, 573.17, 677.77]);
    const rc = await (await ratePost(req({ state, householdId: "hB" }))).json();
    expect(rc.aboveBy).toBe(64.73);
    const ck = await (await checkPost(req({ state }))).json();
    expect(ck.headline).toBe("Readings add up: 180 of 180 kWh");
    expect(ck.detail).toBeNull();
  });

  it("maps split errors to 422", async () => {
    const state = sampleCompoundState();
    state.currentReadings = state.currentReadings.filter((r) => r.meterId !== "mA");
    const res = await splitPost(req({ state }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("missing_reading");
  });

  it("wraps unexpected errors as 500 internal", async () => {
    const evil: Any = sampleCompoundState();
    Object.defineProperty(evil.households[0], "label", { get() { throw new Error("boom"); }, enumerable: true });
    // Throws while the route spreads/uses the state, after validation passed.
    const state: Any = sampleCompoundState();
    Object.defineProperty(state.bill, "id", { get() { throw new Error("boom"); }, enumerable: true });
    const res = await splitPost({ json: async () => ({ state }) } as unknown as Request);
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.error).toEqual({ code: "internal", message: "Something went wrong on our side.", next: "Try again." });
  });
});

describe("validateState hardening", () => {
  it("rejects negative, fractional and oversize reading values", () => {
    expect(bad((s) => (s.currentReadings[0].value = -5)).ok).toBe(false);
    expect(bad((s) => (s.currentReadings[0].value = 45.5)).ok).toBe(false);
    expect(bad((s) => (s.currentReadings[0].value = 1e21)).ok).toBe(false);
  });
  it("rejects bad amounts, fixed charges and perKwh", () => {
    expect(bad((s) => (s.bill.amount = 0)).ok).toBe(false);
    expect(bad((s) => (s.bill.fixedCharges = 99999)).ok).toBe(false);
    expect(bad((s) => (s.chargedRates = [{ householdId: "hB", perKwh: 1e308 }])).ok).toBe(false);
  });
  it("rejects rolled-over dates and bad serialRead or confidence", () => {
    expect(bad((s) => (s.currentReadings[0].capturedAt = "2026-02-30T10:00:00Z")).ok).toBe(false);
    expect(bad((s) => (s.currentReadings[0].serialRead = 123)).ok).toBe(false);
    expect(bad((s) => (s.currentReadings[0].confidence = 2)).ok).toBe(false);
  });
});
