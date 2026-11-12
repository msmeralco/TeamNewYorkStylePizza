// Mock backend for front-end work. It holds the sample compound from
// 02_product_spec.md and computes shares, checks and the forecast with the
// spec's formulas so every screen shows the right demo numbers.
// The real engine lives in the backend; this file only stands in for it.

import { ApiError, type KahatiApi } from './client'
import type {
  Bill,
  BillScan,
  CheckSummary,
  Household,
  MeterScan,
  MonthView,
  Reading,
  Share,
  UsageView,
} from './types'

const CHARGED_RATE = 16.5 // what the organizer charges per kWh (sample)
const TOLERANCE_PCT = 5
const TENANT_TOKENS: Record<string, string> = { 'demo-santos': 'B' }

export const SAMPLE_BILL: BillScan = {
  periodStart: '2026-09-30',
  periodEnd: '2026-10-31',
  readDate: '2026-10-31',
  nextReadDate: '2026-11-30',
  kwh: 180,
  amount: 2711.07,
  fixedCharges: 21.38,
  lines: [
    { key: 'generation', amount: 1690.0, fixed: 0 },
    { key: 'transmission', amount: 230.0, fixed: 0 },
    { key: 'systemLoss', amount: 150.0, fixed: 0 },
    { key: 'distribution', amount: 330.0, fixed: 0 },
    { key: 'supplyMetering', amount: 70.0, fixed: 21.38 },
    { key: 'taxes', amount: 190.0, fixed: 0 },
    { key: 'other', amount: 51.07, fixed: 0 },
  ],
  accountLast4: '4821',
  presentReading: 12520,
  confidence: 0.97,
}

const HOUSEHOLDS: Household[] = [
  { id: 'A', label: 'A', name: 'Reyes', meterKind: 'sub', meterSerial: 'SM-0213', previousReading: 3110 },
  { id: 'B', label: 'B', name: 'Santos', meterKind: 'sub', meterSerial: 'SM-0214', previousReading: 4527 },
  { id: 'C', label: 'C', name: 'Dela Cruz', meterKind: 'sub', meterSerial: 'SM-0215', previousReading: 2200 },
  { id: 'D', label: 'D', name: 'Garcia', meterKind: 'sub', meterSerial: 'SM-0216', previousReading: 5010 },
]
const BAUTISTA: Household = {
  id: 'BAU', label: 'B', name: 'Bautista', meterKind: 'own', meterSerial: 'MM-5520', previousReading: 12520,
}

/** What each printed demo meter reads (print/README.md). */
const METER_FACES: Record<string, number> = { A: 3162, B: 4572, C: 2238, D: 5055 }

interface State {
  bill: Bill | null
  readings: Record<string, Reading>
}

const KEY = 'kahati-demo-v1'
function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch {
    /* storage unavailable */
  }
  return { bill: null, readings: {} }
}
let state: State = load()
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage unavailable */
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nowIso = () => new Date().toISOString()

/** Largest-remainder rounding to centavos so the parts sum to the total. */
function roundToTotal(raw: number[], total: number): number[] {
  const target = Math.round(total * 100)
  const cents = raw.map((v) => Math.floor(v * 100 + 1e-9))
  let missing = target - cents.reduce((a, b) => a + b, 0)
  const order = raw
    .map((v, i) => ({ i, rem: v * 100 - Math.floor(v * 100 + 1e-9) }))
    .sort((a, b) => b.rem - a.rem)
  for (let j = 0; missing > 0 && j < order.length; j++, missing--) cents[order[j].i] += 1
  return cents.map((c) => c / 100)
}

function computeShares(bill: Bill, readings: Reading[]): Share[] {
  const n = HOUSEHOLDS.length
  const u = 0
  const sumK = readings.reduce((a, r) => a + r.kwh, 0) + u
  if (sumK <= 0) return []
  const v = bill.amount - bill.fixedCharges
  const raw = HOUSEHOLDS.map((h) => {
    const k = readings.find((r) => r.householdId === h.id)?.kwh ?? 0
    return bill.fixedCharges / n + (v * (k + u / n)) / sumK
  })
  const rounded = roundToTotal(raw, bill.amount)
  return HOUSEHOLDS.map((h, i) => {
    const k = readings.find((r) => r.householdId === h.id)?.kwh ?? 0
    const w = (k + u / n) / sumK
    return {
      householdId: h.id,
      kwh: k,
      amount: rounded[i],
      lines: bill.lines.map((l) => ({ key: l.key, amount: l.fixed / n + (l.amount - l.fixed) * w })),
    }
  })
}

function computeCheck(bill: Bill, readings: Reading[]): CheckSummary {
  const readingsKwh = readings.reduce((a, r) => a + r.kwh, 0)
  const missing = bill.kwh - readingsKwh
  const tol = (bill.kwh * TOLERANCE_PCT) / 100
  const addsUp = Math.abs(missing) <= tol
  return {
    masterKwh: bill.kwh,
    readingsKwh,
    unmeteredKwh: 0,
    missingKwh: missing,
    tolerancePct: TOLERANCE_PCT,
    toleranceKwh: tol,
    addsUp,
    alignedTo: bill.readDate,
    gapRuleApplied: !addsUp,
  }
}

function month(): MonthView {
  const bill = state.bill
  const readings = Object.values(state.readings)
  const allIn = bill && readings.length === HOUSEHOLDS.length
  const shares = allIn ? computeShares(bill, readings) : []
  const billRate = bill ? bill.amount / bill.kwh : 0
  return {
    bill,
    households: HOUSEHOLDS.map((h) => ({
      ...h,
      reading: state.readings[h.id],
      share: shares.find((s) => s.householdId === h.id),
    })),
    check: bill && readings.length ? computeCheck(bill, readings) : null,
    rateNote:
      bill && CHARGED_RATE > billRate * 1.02
        ? { chargedRate: CHARGED_RATE, billRate, difference: CHARGED_RATE - billRate }
        : null,
  }
}

function lifelineDiscount(kwh: number): number {
  if (kwh <= 50) return 1
  if (kwh <= 70) return 0.35
  if (kwh <= 100) return 0.2
  return 0
}

const ACTIONS: UsageView['actions'] = [
  { icon: 'plug', text: 'Unplug the rice cooker after cooking' },
  { icon: 'clock', text: 'Set the fan on a timer at night' },
]

export const mockApi: KahatiApi = {
  async getMonth() {
    await wait(250)
    return month()
  },

  async scanBill() {
    await wait(1600)
    return { ...SAMPLE_BILL }
  },

  async confirmBill(scan) {
    await wait(300)
    const { confidence: _c, ...rest } = scan
    void _c
    state = { bill: { id: 'bill-2026-10', ...rest }, readings: {} }
    save()
    return state.bill!
  },

  async scanMeter(householdId) {
    await wait(1500)
    const h = HOUSEHOLDS.find((x) => x.id === householdId)
    if (!h) throw new ApiError('Unknown household', 404, 'unknown_household')
    const value = METER_FACES[h.id]
    return {
      householdId,
      value,
      kwhSinceLast: value - h.previousReading,
      serial: h.meterSerial,
      serialMatches: true,
      confidence: 0.95,
      capturedAt: nowIso(),
      needsSecondLook: false,
    } satisfies MeterScan
  },

  async confirmReading({ householdId, value, source, capturedAt }) {
    await wait(250)
    const h = HOUSEHOLDS.find((x) => x.id === householdId)
    if (!h) throw new ApiError('Unknown household', 404, 'unknown_household')
    if (value < h.previousReading) {
      throw new ApiError("This reading is below last month's. Check the number.", 422, 'reading_below')
    }
    const r: Reading = {
      householdId,
      value,
      kwh: value - h.previousReading,
      source,
      capturedAt,
      confirmed: true,
    }
    state.readings[householdId] = r
    save()
    return r
  },

  async getShare(householdId) {
    await wait(200)
    const m = month()
    const h = m.households.find((x) => x.id === householdId)
    if (!h) throw new ApiError('Unknown household', 404, 'unknown_household')
    if (!h.share) throw new ApiError('Shares appear once the bill and all readings are in.', 409, 'shares_pending')
    return { ...h.share, name: h.name }
  },

  async getUsage(householdId) {
    await wait(250)
    const rateMeta = {
      month: 'October 2026',
      source: 'Meralco rate announcement (team rate table)',
      isFallback: true,
      fallbackNote: "Using October's rate. November's is announced mid-month.",
    }
    if (householdId === BAUTISTA.id) {
      const rate = SAMPLE_BILL.amount / SAMPLE_BILL.kwh // 15.0615
      const totalDays = 30
      const photo = { day: 18, kwhUsed: 32 }
      const daily = photo.kwhUsed / photo.day
      const toCome = daily * (totalDays - photo.day)
      const kwh = photo.kwhUsed + toCome
      const shown = Math.round(kwh)
      return {
        householdId,
        name: BAUTISTA.name,
        mode: 'own',
        stage: 2,
        readDate: '2026-10-31',
        nextReadDate: '2026-11-30',
        totalDays,
        points: [
          { date: '2026-10-31', day: 0, kwhUsed: 0, kind: 'bill' },
          { date: '2026-11-18', day: 18, kwhUsed: 32, kind: 'photo' },
        ],
        forecast: { kwh, low: kwh - 0.1 * toCome, high: kwh + 0.1 * toCome },
        lifeline: {
          limitKwh: 50,
          pesoAtForecast: shown * rate * (1 - lifelineDiscount(shown)),
          pesoUnderLimit: 50 * rate * (1 - lifelineDiscount(50)),
        },
        rate: { perKwh: rate, ...rateMeta },
        actions: ACTIONS,
      }
    }
    const m = month()
    const h = m.households.find((x) => x.id === householdId)
    if (!h) throw new ApiError('Unknown household', 404, 'unknown_household')
    const last = h.reading?.kwh ?? 45
    const bill = m.bill ?? { ...SAMPLE_BILL, id: 'sample' }
    return {
      householdId,
      name: h.name,
      mode: 'shared',
      stage: 1,
      readDate: '2026-10-31',
      nextReadDate: '2026-11-30',
      totalDays: 30,
      points: [{ date: '2026-10-31', day: 0, kwhUsed: 0, kind: 'bill' }],
      forecast: { kwh: last, low: last, high: last },
      perKwhValue: (bill.amount - bill.fixedCharges) / bill.kwh,
      rate: { perKwh: bill.amount / bill.kwh, ...rateMeta },
      actions: ACTIONS,
    }
  },

  async requestNewPhoto() {
    await wait(400)
  },

  async getTenantView(token) {
    await wait(300)
    const id = TENANT_TOKENS[token]
    if (!id) throw new ApiError('This link has expired. Ask the organizer for a new one.', 404, 'link_expired')
    const m = month()
    const h = m.households.find((x) => x.id === id)!
    // A tenant link only exists once the split is done; show the sample split if not.
    const bill = m.bill ?? { ...SAMPLE_BILL, id: 'sample' }
    const share =
      h.share ??
      computeShares(
        bill,
        HOUSEHOLDS.map((x) => ({
          householdId: x.id, value: METER_FACES[x.id], kwh: METER_FACES[x.id] - x.previousReading,
          source: 'photo', capturedAt: nowIso(), confirmed: true,
        })),
      ).find((s) => s.householdId === id)!
    const asked = share.kwh * CHARGED_RATE
    return {
      householdId: id,
      name: 'Lorna',
      share: share.amount,
      kwh: share.kwh,
      askedToPay: asked,
      aboveBillRate: asked - share.amount,
      perKwhValue: (bill.amount - bill.fixedCharges) / bill.kwh,
      expiresAt: bill.nextReadDate,
    }
  },

  async loadSampleReadings() {
    await wait(300)
    for (const h of HOUSEHOLDS) {
      if (state.readings[h.id]) continue
      const value = METER_FACES[h.id]
      state.readings[h.id] = {
        householdId: h.id, value, kwh: value - h.previousReading,
        source: 'photo', capturedAt: nowIso(), confirmed: true,
      }
    }
    save()
  },

  async resetDemo() {
    state = { bill: null, readings: {} }
    save()
  },
}

export const OWN_METER_HOUSEHOLD = BAUTISTA
