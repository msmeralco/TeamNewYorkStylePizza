import { GeminiBillReader, GeminiMeterReader } from "./gemini";
import { MockBillReader, MockMeterReader } from "./mock";
import type { BillReader, MeterReader } from "./types";

export type { BillReader, MeterReader, ReaderImage } from "./types";
export { ReaderError } from "./types";

/** Gemini only when READER=gemini and GEMINI_API_KEY is set; otherwise the deterministic mock. */
export function getReaders(): { bill: BillReader; meter: MeterReader } {
  if (process.env.READER === "gemini" && process.env.GEMINI_API_KEY) {
    return { bill: new GeminiBillReader(), meter: new GeminiMeterReader() };
  }
  return { bill: new MockBillReader(), meter: new MockMeterReader() };
}
