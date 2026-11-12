// Randomised (invented) bills and meter photos for batch mode.
import { type BillValues, DEFAULT_BILL, r2 } from "./model";
import type { Distortion, MeterSpec } from "./draw/meter";
import { rng } from "./draw/common";

export interface BillRanges {
  kwhMin: number;
  kwhMax: number;
  varyFixed: boolean;
  showBreakdown: boolean;
}

export interface MeterRanges {
  kind: "sub" | "own" | "both";
  glareMax: number;
  tiltMax: number;
  blurMax: number;
  lowLightMax: number;
  ambiguousChance: number; // 0..1
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

// Per-kWh unit costs near the sample's (₱/kWh), each jittered.
const UNIT = { generation: 9.389, transmission: 1.278, systemLoss: 0.833, distributionCharge: 1.833, meteringPerKwh: 0.1086, supplyPerKwh: 0.1615, universal: 0.1494, fitAll: 0.1304 };

export function randomBill(seed: number, rg: BillRanges): BillValues {
  const r = rng(seed);
  const pick = (a: number, b: number) => a + r() * (b - a);
  const int = (a: number, b: number) => Math.floor(pick(a, b + 1));
  const kwh = int(rg.kwhMin, rg.kwhMax);
  const prev = int(1000, 99999 - kwh);
  const j = () => pick(0.85, 1.15);

  // Period: ends on a random day in 2026, about a month long.
  const end = new Date(Date.UTC(2026, int(0, 11), int(1, 28)));
  const start = addDays(end, -int(29, 32));
  const c = {
    remainingBalance: 0,
    generation: r2(kwh * UNIT.generation * j()),
    transmission: r2(kwh * UNIT.transmission * j()),
    systemLoss: r2(kwh * UNIT.systemLoss * j()),
    distributionCharge: r2(kwh * UNIT.distributionCharge * j()),
    fixedMetering: rg.varyFixed ? r2(pick(3, 8)) : 5,
    meteringPerKwh: r2(kwh * UNIT.meteringPerKwh * j()),
    fixedSupply: rg.varyFixed ? r2(pick(12, 22)) : 16.38,
    supplyPerKwh: r2(kwh * UNIT.supplyPerKwh * j()),
    seniorCitizen: r2(kwh * 0.0000556 * j()),
    taxes: 0,
    universal: r2(kwh * UNIT.universal * j()),
    fitAll: r2(kwh * UNIT.fitAll * j()),
    geaAll: r() < 0.5 ? 0 : r2(kwh * 0.0386 * j()),
    lifeline: r2(kwh * 0.0039 * j()),
  };
  c.taxes = r2((c.generation + c.transmission + c.systemLoss + c.distributionCharge) * pick(0.06, 0.09));
  const history = Array.from({ length: 12 }, (_, i) => (i === 11 ? kwh : Math.max(5, Math.round(kwh * pick(0.75, 1.3)))));
  const acct = String(int(10000000, 99999999));
  return {
    ...DEFAULT_BILL,
    customerName: `${["Ramon", "Liza", "Jun", "Marites", "Paolo", "Ana"][int(0, 5)]} ${NAMES[int(0, NAMES.length - 1)]} (sample)`,
    address1: `${int(1, 99)} Sample Compound, Barangay Halimbawa,`,
    accountNo: acct,
    invoiceNo: String(int(10000000, 99999999)),
    avgTemp: Math.round(pick(25, 32) * 10) / 10,
    showBreakdown: rg.showBreakdown,
    layout: "preview",
    meterNo: `MM-${int(1000, 9999)}`,
    periodStart: iso(start),
    periodEnd: iso(end),
    readDate: iso(end),
    nextReadDate: iso(addDays(end, 30)),
    billDate: iso(addDays(end, 3)),
    dueDate: iso(addDays(end, 14)),
    previousReading: prev,
    presentReading: prev + kwh,
    kwhOverride: null,
    multiplier: 1,
    charges: c,
    totalOverride: null,
    history,
  };
}

const NAMES = ["Reyes", "Santos", "Dela Cruz", "Garcia", "Bautista", "Mendoza", "Ramos", "Aquino", "Villanueva", "Castillo"];

export function randomMeter(seed: number, rg: MeterRanges): { spec: MeterSpec; dist: Distortion; previous: number } {
  const r = rng(seed);
  const pick = (a: number, b: number) => a + r() * (b - a);
  const int = (a: number, b: number) => Math.floor(pick(a, b + 1));
  const kind = rg.kind === "both" ? (r() < 0.5 ? "sub" : "own") : rg.kind;
  const value = int(0, 99999);
  const serial = kind === "sub" ? `SM-${String(int(1, 9999)).padStart(4, "0")}` : `MM-${int(1000, 9999)}`;
  const amb = r() < rg.ambiguousChance;
  return {
    spec: { kind, value, tenths: int(0, 9), serial, name: NAMES[int(0, NAMES.length - 1)] },
    dist: {
      glare: r2(pick(0, rg.glareMax)),
      tilt: r2(pick(-rg.tiltMax, rg.tiltMax)),
      blur: r2(pick(0, rg.blurMax)),
      lowLight: r2(pick(0, rg.lowLightMax)),
      ambiguousIndex: amb ? int(0, 4) : -1,
      ambiguousStrength: amb ? r2(pick(0.4, 0.9)) : 0,
      caption: r() < 0.5,
      seed,
    },
    previous: Math.max(0, value - int(5, 120)),
  };
}

export function describeDistortion(d: Distortion) {
  const parts: string[] = [];
  if (d.glare) parts.push(`glare ${d.glare}`);
  if (d.tilt) parts.push(`tilt ${d.tilt}°`);
  if (d.blur) parts.push(`blur ${d.blur}px`);
  if (d.lowLight) parts.push(`low light ${d.lowLight}`);
  if (d.ambiguousIndex >= 0) parts.push(`ambiguous digit ${d.ambiguousIndex + 1} (${d.ambiguousStrength})`);
  return parts.join(", ") || "clean";
}
