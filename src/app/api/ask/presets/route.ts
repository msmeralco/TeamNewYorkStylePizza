import { ok } from "@/lib/http";
import { ASK_PRESETS } from "@/lib/ask/presets";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const lang = new URL(req.url).searchParams.get("language") === "fil" ? "fil" : "en";
  return ok({ presets: ASK_PRESETS[lang] });
}
