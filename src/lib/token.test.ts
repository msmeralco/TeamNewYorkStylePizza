import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signToken, tenantSecret, verifyToken } from "./token";

afterEach(() => vi.unstubAllEnvs());

const S = "secret-1";
const future = "2099-01-01T00:00:00+08:00";

describe("token", () => {
  it("round trips", () => {
    const t = signToken({ a: 1, exp: future }, S);
    expect(verifyToken(t, S)).toEqual({ ok: true, payload: { a: 1, exp: future } });
  });
  it("rejects tampered payload and wrong secret", () => {
    const t = signToken({ a: 1, exp: future }, S);
    const [, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ a: 2, exp: future })).toString("base64url") + "." + sig;
    expect(verifyToken(forged, S)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyToken(t, "other")).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("rejects expired", () => {
    const t = signToken({ exp: "2020-01-01T00:00:00+08:00" }, S);
    expect(verifyToken(t, S, new Date("2026-11-12"))).toEqual({ ok: false, reason: "expired" });
    expect(verifyToken(t, S, new Date("2019-01-01")).ok).toBe(true);
  });
  it("flags malformed input", () => {
    for (const t of ["", "abc", "a.b.c", "a b.c", "!!.??"]) expect(verifyToken(t, S)).toEqual({ ok: false, reason: "malformed" });
    const body = Buffer.from("not json").toString("base64url");
    const sig = createHmac("sha256", S).update(body).digest("base64url");
    expect(verifyToken(`${body}.${sig}`, S)).toEqual({ ok: false, reason: "malformed" });
    expect(verifyToken(signToken({ x: 1 }, S), S)).toEqual({ ok: false, reason: "malformed" });
  });
  it("refuses the dev secret in production", () => {
    vi.stubEnv("TENANT_SECRET", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => tenantSecret()).toThrow();
    vi.stubEnv("TENANT_SECRET", "real");
    expect(tenantSecret()).toBe("real");
  });
});
