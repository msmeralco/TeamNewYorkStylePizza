import { buildTenantView, TenantError } from "@/lib/engine/tenant";
import { SplitError } from "@/lib/engine/split";
import { fail, ok, readJson } from "@/lib/http";
import { signToken } from "@/lib/token";
import { validateState } from "@/lib/validate";

export const dynamic = "force-dynamic";

function isHttpUrl(x: unknown): boolean {
  if (typeof x !== "string") return false;
  try {
    const p = new URL(x).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

/**
 * POST /api/tenant-link: the organizer makes a link for one household.
 *
 * The response view leaves out rateCheck: the tenant sees her own rate line through
 * GET /api/tenant/{token}, which returns the full view.
 *
 * The token signature proves Kahati computed the view from the submitted bill and readings,
 * not that the bill or the readings are genuine.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{ state?: unknown; householdId?: unknown; baseUrl?: unknown }>(req);
    if (body instanceof Response) return body;
    const v = validateState(body?.state);
    if (!v.ok) return fail(400, v.code, v.message, v.next);
    if (typeof body.householdId !== "string") {
      return fail(400, "bad_request", "The request needs a householdId.", "Send {state, householdId}.");
    }
    const hasBase = body.baseUrl !== undefined && body.baseUrl !== null && body.baseUrl !== "";
    if (hasBase && !isHttpUrl(body.baseUrl)) {
      return fail(400, "bad_request", "baseUrl must be an http or https address.", "Send a baseUrl like https://kahati.app, or leave it out.");
    }
    const view = buildTenantView(v.state, body.householdId, new Date());
    if (Date.parse(view.expiresAt) <= Date.now()) {
      return fail(422, "link_expired_on_issue", "This bill period has already ended, so a link would expire at once.", "Scan this month's bill first.");
    }
    const token = signToken({ ...view, exp: view.expiresAt });
    const base = (hasBase ? (body.baseUrl as string) : new URL(req.url).origin).replace(/\/+$/, "");
    const { rateCheck: _rateCheck, ...organizerView } = view;
    void _rateCheck;
    return ok({ token, url: `${base}/t/${token}`, expiresAt: view.expiresAt, view: organizerView });
  } catch (e) {
    if (e instanceof TenantError) return fail(404, e.code, e.message, e.next);
    if (e instanceof SplitError) return fail(422, e.code, e.message, e.next);
    return fail(500, "internal", "Something went wrong on our side.", "Try again.");
  }
}
