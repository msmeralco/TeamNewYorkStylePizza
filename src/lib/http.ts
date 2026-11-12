// Small helpers shared by every route handler.
import type { ApiError } from "@/types";

export function ok<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function fail(status: number, code: string, message: string, next?: string): Response {
  const body: ApiError = { error: { code, message, ...(next ? { next } : {}) } };
  return Response.json(body, { status });
}

/** Parse a JSON body, returning a 400 Response on bad JSON. */
export async function readJson<T = unknown>(req: Request): Promise<T | Response> {
  try {
    return (await req.json()) as T;
  } catch {
    return fail(400, "bad_json", "The request body is not valid JSON.", "Send a JSON body.");
  }
}
