import { geminiKeys } from "@/lib/readers/gemini";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    name: "kahati",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    reader: process.env.READER === "gemini" && geminiKeys().length > 0 ? "gemini" : "mock",
    // How many Gemini keys are configured (the keys themselves are never shown).
    geminiKeys: geminiKeys().length,
    model: process.env.GEMINI_MODEL || "auto (newest Flash the key can use)",
    time: new Date().toISOString(),
  });
}
