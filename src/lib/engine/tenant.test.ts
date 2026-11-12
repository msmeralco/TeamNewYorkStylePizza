import { describe, expect, it } from "vitest";
import { sampleCompoundState } from "@/data/sample";
import { POST } from "@/app/api/tenant-link/route";
import { GET } from "@/app/api/tenant/[token]/route";
import { signToken } from "@/lib/token";
import { buildTenantView, TENANT_FOOTER } from "./tenant";

const post = (body: unknown) =>
  POST(new Request("http://localhost:3000/api/tenant-link", { method: "POST", body: JSON.stringify(body) }));
const get = (token: string) => GET(new Request("http://x/api/tenant/" + token), { params: Promise.resolve({ token }) });

describe("buildTenantView", () => {
  const v = buildTenantView(sampleCompoundState(), "hB", new Date("2026-11-12"));
  it("matches the golden numbers", () => {
    expect(v.share.amount).toBe(677.77);
    expect(v.rateCheck!.askedAmount).toBeCloseTo(742.5, 2);
    expect(v.rateCheck!.aboveBy).toBe(64.73);
    expect(v.perKwhValue).toBeCloseTo(14.94, 2);
    expect(v.footer).toBe("Computed by Kahati. Not a Meralco statement.");
    expect(v.footer).toBe(TENANT_FOOTER);
    expect(v.rateLineVisibleToOrganizer).toBe(false);
  });
  it("expires 7 days after the next read date, end of day Manila", () => {
    expect(v.expiresAt).toBe("2026-12-07T23:59:59+08:00");
  });
  it("never carries the 4Ps flag and limits household fields", () => {
    expect(JSON.stringify(v).toLowerCase()).not.toContain("fourps");
    expect(Object.keys(v.household).sort()).toEqual(["displayName", "id", "label"]);
    expect(Object.keys(v.bill).sort()).toEqual(["accountLast4", "amount", "fixedCharges", "kwh", "periodEnd", "periodStart"]);
  });
  it("throws for an unknown household", () => {
    expect(() => buildTenantView(sampleCompoundState(), "nope", new Date())).toThrow();
  });
});

describe("tenant link routes", () => {
  it("the signed link carries the breakdown lines, which add up to Lorna's share", async () => {
    const res = await post({ state: sampleCompoundState(), householdId: "hB" });
    const { token } = await res.json();
    const j = await (await get(token)).json();
    const lines = Object.values(j.share.breakdown) as number[];
    expect(Object.keys(j.share.breakdown).sort()).toEqual(
      ["distribution", "generation", "other", "supplyMetering", "systemLoss", "taxes", "transmission"],
    );
    expect(lines.reduce((x, y) => x + y, 0)).toBeCloseTo(j.share.amountExact, 6);
    expect(Math.round(j.share.amountExact * 100) / 100).toBeCloseTo(j.share.amount, 2);
    expect(j.share.amount).toBe(677.77);
  });
  it("creates a link and the token resolves to the view", async () => {
    const res = await post({ state: sampleCompoundState(), householdId: "hB", baseUrl: "https://kahati.app/" });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.url).toBe(`https://kahati.app/t/${j.token}`);
    expect(j.expiresAt).toBe(j.view.expiresAt);
    expect("rateCheck" in j.view).toBe(false);
    expect(JSON.stringify(j.view)).not.toContain("aboveBy");
    expect(JSON.stringify(j).toLowerCase()).not.toContain("fourps");
    const g = await get(j.token);
    expect(g.status).toBe(200);
    const view = await g.json();
    expect(view).toEqual({ ...j.view, rateCheck: view.rateCheck });
    expect(view.exp).toBeUndefined();
    expect(view.rateCheck.aboveBy).toBe(64.73);
    expect(view.share.amount).toBe(677.77);
    expect(view.footer).toBe(TENANT_FOOTER);
  });
  it("falls back to the request origin", async () => {
    const j = await (await post({ state: sampleCompoundState(), householdId: "hA" })).json();
    expect(j.url.startsWith("http://localhost:3000/t/")).toBe(true);
    expect("rateCheck" in j.view).toBe(false);
  });
  it("validates input", async () => {
    expect((await post({ householdId: "hB" })).status).toBe(400);
    expect((await post({ state: sampleCompoundState(), householdId: "zz" })).status).toBe(404);
    expect((await POST(new Request("http://x", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("rejects bad state with bad_state, not 500", async () => {
    const noDate = sampleCompoundState() as any;
    delete noDate.bill.nextReadDate;
    const r1 = await post({ state: noDate, householdId: "hB" });
    expect(r1.status).toBe(400);
    expect((await r1.json()).error.code).toBe("bad_state");
    const badRate = sampleCompoundState() as any;
    badRate.chargedRates = [{ householdId: "hB", perKwh: "abc" }];
    const r2 = await post({ state: badRate, householdId: "hB" });
    expect(r2.status).toBe(400);
    expect((await r2.json()).error.code).toBe("bad_state");
    const nullHh = sampleCompoundState() as any;
    nullHh.households = [null];
    expect((await post({ state: nullHh, householdId: "hB" })).status).toBe(400);
  });
  it("rejects a non-http baseUrl", async () => {
    const r = await post({ state: sampleCompoundState(), householdId: "hB", baseUrl: "javascript:alert(1)//" });
    expect(r.status).toBe(400);
  });
  it("refuses a link that would already be expired", async () => {
    const s = sampleCompoundState();
    s.bill.nextReadDate = "2020-01-01";
    const r = await post({ state: s, householdId: "hB" });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe("link_expired_on_issue");
  });
  it("401, 410, 400 on bad tokens", async () => {
    const j = await (await post({ state: sampleCompoundState(), householdId: "hB" })).json();
    const tok = j.token as string;
    const tampered = tok.slice(0, -2) + (tok.endsWith("AA") ? "BB" : "AA");
    const r1 = await get(tampered);
    expect(r1.status).toBe(401);
    expect((await r1.json()).error.next).toBe("Ask the organizer for a new link");
    const r2 = await get(signToken({ exp: "2020-01-01T00:00:00+08:00" }));
    expect(r2.status).toBe(410);
    expect((await r2.json()).error.next).toBe("Ask the organizer for a new link");
    expect((await get("garbage")).status).toBe(400);
  });
});
