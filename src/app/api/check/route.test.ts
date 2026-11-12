import { describe, expect, it } from "vitest";
import { sampleCompoundState } from "@/data/sample";
import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/check", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/check", () => {
  it("returns the check result", async () => {
    const res = await post({ state: sampleCompoundState() });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.status).toBe("ok");
    expect(j.headline).toBe("Readings add up: 180 of 180 kWh");
  });
  it("400 on missing state", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error.next).toBeTruthy();
  });
  it("400 on bad json", async () => {
    const res = await POST(new Request("http://localhost/api/check", { method: "POST", body: "{" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/check hardening", () => {
  it("400 bad_state on huge digits", async () => {
    const s = sampleCompoundState();
    s.meters[0].digits = 1e7;
    const res = await post({ state: s });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("bad_state");
  });
  it("400 bad_state on garbage capturedAt", async () => {
    const s = sampleCompoundState();
    s.currentReadings[0].capturedAt = "garbage";
    expect((await post({ state: s })).status).toBe(400);
  });
  it("400 on duplicate household id", async () => {
    const s = sampleCompoundState();
    s.households.push({ ...s.households[0] });
    expect((await post({ state: s })).status).toBe(400);
  });
  it("household with no meter gets a missing row", async () => {
    const s = sampleCompoundState();
    s.households.push({ ...s.households[0], id: "hNew" });
    const j = await (await post({ state: s })).json();
    const row = j.households.find((h: { householdId: string }) => h.householdId === "hNew");
    expect(row.chip).toBe("missing");
    expect(row.kwh).toBe(0);
  });
});
