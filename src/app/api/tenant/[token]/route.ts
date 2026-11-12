import { fail, ok } from "@/lib/http";
import { verifyToken } from "@/lib/token";
import type { TenantView } from "@/types";

export const dynamic = "force-dynamic";

const NEW_LINK = "Ask the organizer for a new link";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    let t = token;
    try {
      t = decodeURIComponent(token);
    } catch {
      /* keep raw */
    }
    const r = verifyToken<TenantView & { exp: string }>(t);
    if (!r.ok) {
      if (r.reason === "bad_signature") return fail(401, "bad_signature", "This link is not valid.", NEW_LINK);
      if (r.reason === "expired") return fail(410, "expired", "This link has expired.", NEW_LINK);
      return fail(400, "malformed", "This link is not complete.", "Check that the whole link was copied, or ask the organizer for a new link");
    }
    const { exp: _exp, ...view } = r.payload;
    return ok(view as TenantView);
  } catch {
    return fail(500, "internal", "Something went wrong on our side.", "Try again.");
  }
}
