import { GeminiBillReader, GeminiMeterReader, geminiKeys } from "./gemini";
import { MockBillReader, MockMeterReader } from "./mock";
import type { BillReader, MeterReader } from "./types";

export type { BillReader, MeterReader, ReaderImage } from "./types";
export { ReaderError } from "./types";

/** Gemini only when READER=gemini and at least one key is set (GEMINI_API_KEY or a backup); otherwise the deterministic mock. */
export function getReaders(): { bill: BillReader; meter: MeterReader } {
  if (process.env.READER === "gemini" && geminiKeys().length > 0) {
    return { bill: new GeminiBillReader(), meter: new GeminiMeterReader() };
  }
  return { bill: new MockBillReader(), meter: new MockMeterReader() };
}
