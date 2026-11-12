// Signed, self-contained tokens: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
import { createHmac, timingSafeEqual } from "node:crypto";

// Set TENANT_SECRET in Vercel (Project Settings > Environment Variables). The fallback is for local dev only.
const DEV_SECRET = "kahati-dev-secret-set-TENANT_SECRET-in-vercel";

export function tenantSecret(): string {
  if (process.env.TENANT_SECRET) return process.env.TENANT_SECRET;
  // Never sign or verify with the public dev secret in production: routes surface this as a 500.
  if (process.env.VERCEL_ENV === "production") throw new Error("TENANT_SECRET is not set");
  return DEV_SECRET;
}

export type VerifyResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: "bad_signature" | "expired" | "malformed" };

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

export function signToken(payload: object, secret: string = tenantSecret()): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${mac(body, secret).toString("base64url")}`;
}

export function verifyToken<T extends { exp?: string } = { exp?: string; [k: string]: unknown }>(
  token: string,
  secret: string = tenantSecret(),
  now: Date = new Date(),
): VerifyResult<T> {
  if (typeof token !== "string") return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return { ok: false, reason: "malformed" };
  const given = Buffer.from(parts[1], "base64url");
  const expected = mac(parts[0], secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_signature" };
  let payload: T;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object") return { ok: false, reason: "malformed" };
  if (typeof payload.exp !== "string" || Number.isNaN(Date.parse(payload.exp))) return { ok: false, reason: "malformed" };
  if (Date.parse(payload.exp) <= now.getTime()) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
