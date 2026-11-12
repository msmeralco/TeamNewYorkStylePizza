// Helpers for the end-to-end demo test: call real route handlers like the frontend would.
import type { CompoundState } from "@/types";

export const post = (body: unknown): Request =>
  new Request("http://kahati.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const get = (path: string): Request => new Request(`http://kahati.test${path}`);

/** Parse a response, check the status and the wording rules on the raw text. */
export async function json<T = any>(res: Response, status = 200): Promise<T> {
  const text = await res.text();
  if (res.status !== status) throw new Error(`Expected ${status}, got ${res.status}: ${text}`);
  for (const bad of [/\bovercharged\b/i, /\bowed\b/i, /—/]) {
    if (bad.test(text)) throw new Error(`Response contains forbidden text ${bad}: ${text}`);
  }
  return JSON.parse(text) as T;
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export type State = CompoundState;
