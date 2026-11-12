// Builds the sample CompoundState objects served by GET /api/sample.
import type { CompoundState } from "@/types";
import {
  BAUTISTA_BILL, BAUTISTA_COMPOUND, BAUTISTA_HOUSEHOLD, BAUTISTA_METER, BAUTISTA_READINGS,
  SAMPLE_BILL, SAMPLE_CHARGED_RATE, SAMPLE_COMPOUND, SAMPLE_CURRENT_READINGS, SAMPLE_HOUSEHOLDS,
  SAMPLE_METERS, SAMPLE_PREVIOUS_READINGS,
} from "./seed";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export function sampleCompoundState(): CompoundState {
  return clone({
    compound: SAMPLE_COMPOUND,
    households: SAMPLE_HOUSEHOLDS,
    meters: SAMPLE_METERS,
    bill: SAMPLE_BILL,
    previousReadings: SAMPLE_PREVIOUS_READINGS,
    currentReadings: SAMPLE_CURRENT_READINGS,
    unmeteredKwh: 0,
    chargedRates: [SAMPLE_CHARGED_RATE],
  });
}

/** Bautista, own meter. The bill is Bautista's own October bill (read 31 Oct at 12520, next read 30 Nov). */
export function sampleBautistaState(): CompoundState {
  return clone({
    compound: BAUTISTA_COMPOUND,
    households: [BAUTISTA_HOUSEHOLD],
    meters: [BAUTISTA_METER],
    bill: BAUTISTA_BILL,
    previousReadings: [BAUTISTA_READINGS[0]],
    currentReadings: [BAUTISTA_READINGS[1]],
    unmeteredKwh: 0,
    chargedRates: [],
  });
}
