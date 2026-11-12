export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    name: "kahati",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    reader: process.env.READER === "gemini" && process.env.GEMINI_API_KEY ? "gemini" : "mock",
    time: new Date().toISOString(),
  });
}
