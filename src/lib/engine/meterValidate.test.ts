import { describe, expect, it } from "vitest";
import { SAMPLE_METERS, SAMPLE_PREVIOUS_READINGS } from "@/data/seed";
import { MockMeterReader } from "@/lib/readers/mock";
import type { MeterScan } from "@/types";
import { validateMeterScan } from "./meterValidate";

const img = { base64: "x", mimeType: "image/jpeg" };
const meterB = SAMPLE_METERS.find((m) => m.serial === "SM-0214")!;
const prevB = SAMPLE_PREVIOUS_READINGS.find((r) => r.meterId === "mB")!;

describe("mock meter reader", () => {
  it("returns SM-0214 props", async () => {
    const s = await new MockMeterReader().readMeter(img, { hint: "SM-0214", expectedDigits: 5 });
    expect(s.value).toBe(4572);
    expect(s.digitsText).toBe("04572");
    expect(s.serial).toBe("SM-0214");
    expect(s.confidence).toBe(0.97);
    expect(s.secondRead).toBe(4572);
  });
  it("maps the other props and falls back to Santos", async () => {
    const r = new MockMeterReader();
    expect((await r.readMeter(img, { hint: "SM-0213" })).value).toBe(3162);
    expect((await r.readMeter(img, { hint: "SM-0215" })).value).toBe(2238);
    expect((await r.readMeter(img, { hint: "SM-0216" })).value).toBe(5055);
    const mm = await r.readMeter(img, { hint: "MM-5520" });
    expect(mm.value).toBe(12552);
    expect(mm.digitsText).toBe("12552");
    const master = await r.readMeter(img, { hint: "MM-7781", expectedDigits: 5 });
    expect(master.value).toBe(12520);
    expect((await r.readMeter(img, { hint: "mMaster" })).value).toBe(12520);
    expect((await r.readMeter(img, { hint: "nope" })).value).toBe(4572);
    expect((await r.readMeter(img)).value).toBe(4572);
  });
});

describe("validateMeterScan", () => {
  it("golden: 4572 against 4527", async () => {
    const scan = await new MockMeterReader().readMeter(img, { hint: "SM-0214", expectedDigits: 5 });
    const v = validateMeterScan({ scan, meter: meterB, previous: prevB });
    expect(v.kwhSinceLast).toBe(45);
    expect(v.serialMatches).toBe(true);
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  const base: MeterScan = { value: 4572, digitsText: "04572", serial: "SM-0214", confidence: 0.97, secondRead: 4572, provider: "mock" };

  it("flags below previous", () => {
    const v = validateMeterScan({ scan: { ...base, value: 4512, digitsText: "04512", secondRead: 4512 }, meter: meterB, previous: prevB });
    expect(v.ok).toBe(false);
    expect(v.kwhSinceLast).toBeNull();
    const i = v.issues.find((x) => x.code === "below_previous")!;
    expect(i.message).toBe("Reading needs a second look: it is lower than last month's.");
  });

  it("flags serial mismatch", () => {
    const v = validateMeterScan({ scan: { ...base, serial: "SM-0215" }, meter: meterB, previous: prevB });
    expect(v.serialMatches).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain("serial_mismatch");
    expect(v.issues[0].message).toBe("Serial does not match this meter. Reading needs a second look.");
  });

  it("flags digit count, disagreement and low confidence", () => {
    const v = validateMeterScan({
      scan: { ...base, digitsText: "572", secondRead: 4573, confidence: 0.5 },
      meter: meterB,
      previous: prevB,
    });
    expect(v.issues.map((i) => i.code).sort()).toEqual(["digit_count", "low_confidence", "reads_disagree"]);
    expect(v.ok).toBe(false);
  });

  it("works without meter or previous", () => {
    const v = validateMeterScan({ scan: base, meter: null, previous: null });
    expect(v).toEqual({ ok: true, kwhSinceLast: null, serialMatches: null, issues: [] });
  });

  it("messages never use banned words or em dashes", () => {
    const v = validateMeterScan({ scan: { ...base, value: 1, serial: "X", confidence: 0.1, secondRead: 2 }, meter: meterB, previous: prevB });
    for (const i of v.issues) expect(i.message).not.toMatch(/overcharged|owed|—|Santos/i);
  });
});

describe("previous_mismatch", () => {
  it("does not compute kwhSinceLast when the previous reading is for another meter", () => {
    const scan: MeterScan = { value: 4572, digitsText: "04572", serial: "SM-0214", confidence: 0.97, secondRead: 4572, provider: "mock" };
    const v = validateMeterScan({ scan, meter: meterB, previous: { ...prevB, meterId: "mA" } });
    expect(v.kwhSinceLast).toBeNull();
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toEqual(["previous_mismatch"]);
  });
});
