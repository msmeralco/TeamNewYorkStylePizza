import { sampleBautistaState, sampleCompoundState } from "@/data/sample";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const which = new URL(req.url).searchParams.get("which") ?? "compound";
  if (which === "compound") return ok(sampleCompoundState());
  if (which === "bautista") return ok(sampleBautistaState());
  return fail(400, "bad_which", `Unknown sample "${which}".`, "Use which=compound or which=bautista.");
}
