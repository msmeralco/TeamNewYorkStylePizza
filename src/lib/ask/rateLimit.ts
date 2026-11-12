// In-memory sliding-window limiter for free-text questions. Per server instance only.
export const ASK_LIMIT = 12;
export const ASK_WINDOW_MS = 60_000;
/** Per server instance, across all callers. */
export const ASK_GLOBAL_LIMIT = 60;

const hits = new Map<string, number[]>();
let globalHits: number[] = [];

/** Returns true when the call is allowed (and records it), false when over the limit. */
export function allowAsk(key: string, now: number = Date.now()): boolean {
  globalHits = globalHits.filter((t) => now - t < ASK_WINDOW_MS);
  if (globalHits.length >= ASK_GLOBAL_LIMIT) return false;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < ASK_WINDOW_MS);
  if (recent.length >= ASK_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  globalHits.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < ASK_WINDOW_MS)) hits.delete(k);
  }
  return true;
}

export function clientKey(req: Request): string {
  // Trusted platform headers first. In x-forwarded-for only the LAST hop is added by our own proxy; earlier hops can be spoofed.
  const trusted = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim();
  if (trusted) return trusted;
  const hops = req.headers.get("x-forwarded-for")?.split(",") ?? [];
  const last = hops[hops.length - 1]?.trim();
  return last || "local";
}

export function resetRateLimitForTests(): void {
  hits.clear();
  globalHits = [];
}
