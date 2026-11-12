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
