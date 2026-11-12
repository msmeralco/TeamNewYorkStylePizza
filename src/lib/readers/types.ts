// Contracts for the vision readers. Images are passed in memory and never stored.
import type { BillScan, MeterScan } from "@/types";

export interface ReaderImage {
  base64: string;
  mimeType: string;
}

export interface BillReader {
  readBill(img: ReaderImage): Promise<BillScan>;
}

export interface MeterReader {
  /** `hint` is the expected serial or meter id; only the mock uses it. */
  readMeter(img: ReaderImage, opts?: { expectedDigits?: number; hint?: string }): Promise<MeterScan>;
}

export type ReaderErrorCode = "http_error" | "bad_output" | "no_api_key" | "network";

/** Thrown by a reader on HTTP failure or output that cannot be used. Never carries the image or key. */
export class ReaderError extends Error {
  readonly code: ReaderErrorCode;
  constructor(code: ReaderErrorCode, message: string) {
    super(message);
    this.name = "ReaderError";
    this.code = code;
  }
}
