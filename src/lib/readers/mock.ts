// Deterministic readers for demos and tests. No network.
import { SAMPLE_BILL } from "@/data/seed";
import type { BillScan, MeterScan } from "@/types";
import type { BillReader, MeterReader, ReaderImage } from "./types";

export class MockBillReader implements BillReader {
  async readBill(_img: ReaderImage): Promise<BillScan> {
    const b = SAMPLE_BILL;
    return {
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      readDate: b.readDate,
      nextReadDate: b.nextReadDate,
      kwh: b.kwh,
      amount: b.amount,
      lines: { ...b.lines },
      fixedCharges: b.fixedCharges,
      previousReading: b.previousReading,
      presentReading: b.presentReading,
      history: b.history.map((h) => ({ ...h })),
      accountLast4: b.accountLast4,
      confidence: 0.95,
      provider: "mock",
    };
  }
}

const MOCK_METERS: Record<string, { serial: string; value: number }> = {
  "SM-0213": { serial: "SM-0213", value: 3162 },
  "SM-0214": { serial: "SM-0214", value: 4572 },
  "SM-0215": { serial: "SM-0215", value: 2238 },
  "SM-0216": { serial: "SM-0216", value: 5055 },
  "MM-5520": { serial: "MM-5520", value: 12552 },
  "MM-7781": { serial: "MM-7781", value: 12520 },
};

// Meter ids and the seed's master serial map onto the same props.
const ALIAS: Record<string, string> = {
  mA: "SM-0213",
  mB: "SM-0214",
  mC: "SM-0215",
  mD: "SM-0216",
  mMaster: "MM-7781",
};

export class MockMeterReader implements MeterReader {
  async readMeter(_img: ReaderImage, opts?: { expectedDigits?: number; hint?: string }): Promise<MeterScan> {
    const hint = opts?.hint ?? "";
    const prop = MOCK_METERS[ALIAS[hint] ?? hint] ?? MOCK_METERS["SM-0214"];
    const digits = opts?.expectedDigits ?? 5;
    return {
      value: prop.value,
      digitsText: String(prop.value).padStart(digits, "0"),
      serial: prop.serial,
      confidence: 0.97,
      secondRead: prop.value,
      provider: "mock",
    };
  }
}
