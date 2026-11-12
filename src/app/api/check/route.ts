import { fail, ok, readJson } from "@/lib/http";
import { checkCompound } from "@/lib/engine/check";
import { validateState } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ state?: unknown }>(req);
    if (body instanceof Response) return body;
    const v = validateState(body?.state);
    if (!v.ok) return fail(400, v.code, v.message, v.next);
    return ok(checkCompound(v.state));
  } catch {
    return fail(500, "internal", "Something went wrong on our side.", "Try again.");
  }
}
