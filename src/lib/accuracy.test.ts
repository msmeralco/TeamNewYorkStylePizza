import { describe, expect, it } from "vitest";
import { formatReport, parseLabels, score, type ReadResult } from "./accuracy";

const HEADER = "file,true_reading,meter_type,lighting,angle,split,notes";

describe("parseLabels", () => {
  it("skips the example row and keeps leading zeros", () => {
    const csv = [
      HEADER,
      "m001.jpg,04572,digital,day,straight,dev,example row: delete before use",
      "m002.jpg,00123,analog_dial,dim,angled,test,glare",
      "m003.jpg,98765,digital,flash,straight,test,",
    ].join("\r\n");
    const rows = parseLabels(csv);
    expect(rows.map((r) => r.file)).toEqual(["m002.jpg", "m003.jpg"]);
    expect(rows[0]).toMatchObject({ true_reading: "00123", meter_type: "analog_dial", split: "test", notes: "glare" });
  });
  it("handles quoted notes with commas and blank lines", () => {
    const rows = parseLabels(`${HEADER}\n\nm9.jpg,00010,digital,day,straight,test,"cracked, dusty"\n`);
    expect(rows).toHaveLength(1);
    expect(rows[0].notes).toBe("cracked, dusty");
  });
  it("rejects a true_reading with anything but digits", () => {
    expect(() => parseLabels(`${HEADER}\nm1.jpg,04572.3,digital,day,straight,test,`)).toThrow(/true_reading/);
    expect(() => parseLabels(`${HEADER}\nm1.jpg,"0457 2",digital,day,straight,test,`)).toThrow(/true_reading/);
  });
  it("keeps duplicate files and lets the caller filter by split", () => {
    const rows = parseLabels(`${HEADER}\nm1.jpg,111,digital,day,straight,test,\nm1.jpg,222,digital,day,straight,dev,\nm2.jpg,333,digital,day,straight,test,`);
    expect(rows).toHaveLength(3);
    expect(rows.filter((x) => x.split === "test").map((x) => x.true_reading)).toEqual(["111", "333"]);
  });
  it("rejects a bad meter type or missing column", () => {
    expect(() => parseLabels(`${HEADER}\nm1.jpg,123,odd,day,straight,test,`)).toThrow(/meter_type/);
    expect(() => parseLabels("file,meter_type\nm1.jpg,digital")).toThrow(/true_reading/);
  });
});

const r = (file: string, truth: string, read: string | null, meter_type: "analog_dial" | "digital" = "digital"): ReadResult => ({
  file,
  truth,
  read,
  meter_type,
});

describe("score", () => {
  it("counts exact matches and splits by type", () => {
    const s = score([
      r("a", "04572", "04572"),
      r("b", "04572", "04573"),
      r("c", "00123", "00123", "analog_dial"),
      r("d", "00123", "00128", "analog_dial"),
    ]);
    expect(s.total).toBe(4);
    expect(s.exact).toBe(2);
    expect(s.pct).toBe(50);
    expect(s.byType).toEqual({ analog_dial: { total: 2, exact: 1 }, digital: { total: 2, exact: 1 } });
    expect(s.misses.map((m) => m.file)).toEqual(["b", "d"]);
  });
  it("zero-pads both sides to the truth length", () => {
    expect(score([r("a", "00123", "123")]).exact).toBe(1);
    expect(score([r("a", "123", "00123")]).exact).toBe(0);
    expect(score([r("a", "04572", "4572")]).exact).toBe(1);
  });
  it("counts nulls as misses", () => {
    const s = score([r("a", "00123", null), r("b", "00123", "00123")]);
    expect(s.exact).toBe(1);
    expect(s.misses).toEqual([r("a", "00123", null)]);
  });
  it("handles an empty set", () => {
    expect(score([])).toMatchObject({ total: 0, exact: 0, pct: 0, misses: [] });
  });
});

describe("formatReport", () => {
  it("prints N of total, per-type lines and misses", () => {
    const results = Array.from({ length: 50 }, (_, i) =>
      r(`m${i}.jpg`, "00100", i < 44 ? "00100" : i === 44 ? null : "00101", i % 2 ? "analog_dial" : "digital"),
    );
    const text = formatReport(score(results));
    expect(text).toContain("44 of 50 (88%)");
    expect(text).toContain("Analog dial: 22 of 25 (88%)");
    expect(text).toContain("Digital: 22 of 25 (88%)");
    expect(text).toContain("below our 90% target");
    expect(text).toContain("m44.jpg (digital): truth 00100, read nothing");
    expect(text).toContain("m45.jpg (analog_dial): truth 00100, read 00101");
  });
  it("omits the target note when met and says none for no misses", () => {
    const text = formatReport(score([r("a", "1", "1")]));
    expect(text).toContain("1 of 1 (100%)");
    expect(text).not.toContain("below");
    expect(text).toContain("Misses: none");
  });
});
