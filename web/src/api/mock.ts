// Mock backend for front-end work. It holds the sample compound from
// 02_product_spec.md and computes shares, checks and the forecast with the
// spec's formulas so every screen shows the right demo numbers.
// The real engine lives in the backend; this file only stands in for it.

import { ApiError, type KahatiApi } from './client'
import { LIFELINE_TIERS_2026, lifelineDiscount } from '../lib/lifeline'
import type {
  AskAnswer,
  AskPreset,
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
  linesAddUp: true,
  sanityNote: null,
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
/** Bautista's printed own meter (MM-5520); the sample photo also reads 12552. */
const BAUTISTA_FACE = 12552
/** Story day of Bautista's mid-month photo (18 Nov, 18 days after the 31 Oct read). */
const BAUTISTA_PHOTO_DAY = 18

interface State {
  bill: Bill | null
  readings: Record<string, Reading>
  /** Bautista's confirmed own-meter reading (kept apart from the shared compound's readings). */
  bau?: number
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

const needsOwnScan = () => new ApiError('Scan your meter first.', 409, 'needs_own_scan')
const needsScan = () => new ApiError('Scan the bill and the meters first.', 409, 'needs_scan')
const sampleReadings = (): Reading[] =>
  HOUSEHOLDS.map((x) => ({
    householdId: x.id, value: METER_FACES[x.id], kwh: METER_FACES[x.id] - x.previousReading,
    source: 'photo', capturedAt: nowIso(), confirmed: true,
  }))

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


const ACTIONS: UsageView['actions'] = [
  { icon: 'plug', text: 'Unplug the rice cooker after cooking' },
  { icon: 'clock', text: 'Set the fan on a timer at night' },
]


const ASK_PRESETS: Record<'en' | 'fil', AskPreset[]> = {
  en: [
    { id: 'why_share', question: 'Why is my share this amount?' },
    { id: 'what_lines', question: 'What am I paying for?' },
    { id: 'save_kwh', question: 'How much do I save per kWh?' },
    { id: 'lifeline', question: 'What is the 50 kWh line?' },
    { id: 'readings_gap', question: 'Why are kWh missing?' },
    { id: 'rate_check', question: 'Is my rate the same as the bill?' },
  ],
  fil: [
    { id: 'why_share', question: 'Bakit ganito ang bahagi ko?' },
    { id: 'what_lines', question: 'Ano ang binabayaran ko?' },
    { id: 'save_kwh', question: 'Magkano ang matitipid ko bawat kWh?' },
    { id: 'lifeline', question: 'Ano ang 50 kWh na hangganan?' },
    { id: 'readings_gap', question: 'Bakit may kulang na kWh?' },
    { id: 'rate_check', question: 'Pareho ba ang rate ko sa bill?' },
  ],
}
const MOCK_FOOTER = 'Computed by Kahati. Not a Meralco statement.'

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
    state = { ...state, bill: { id: 'bill-2026-10', ...rest }, readings: {} }
    save()
    return state.bill!
  },

  async scanMeter(householdId) {
    await wait(1500)
    if (householdId === BAUTISTA.id) {
      return {
        householdId,
        value: BAUTISTA_FACE,
        kwhSinceLast: BAUTISTA_FACE - BAUTISTA.previousReading,
        serial: BAUTISTA.meterSerial,
        serialMatches: true,
        serialRead: true,
        confidence: 0.95,
        capturedAt: nowIso(),
        needsSecondLook: false,
      } satisfies MeterScan
    }
    const h = HOUSEHOLDS.find((x) => x.id === householdId)
    if (!h) throw new ApiError('Unknown household', 404, 'unknown_household')
    const value = METER_FACES[h.id]
    return {
      householdId,
      value,
      kwhSinceLast: value - h.previousReading,
      serial: h.meterSerial,
      serialMatches: true,
      serialRead: true,
      confidence: 0.95,
      capturedAt: nowIso(),
      needsSecondLook: false,
    } satisfies MeterScan
  },

  async confirmReading({ householdId, value, source, capturedAt }) {
    await wait(250)
    if (householdId === BAUTISTA.id) {
      if (value < BAUTISTA.previousReading) {
        throw new ApiError("This reading is below last month's. Check the number.", 422, 'reading_below')
      }
      state.bau = value
      save()
      return {
        householdId,
        value,
        kwh: value - BAUTISTA.previousReading,
        source,
        capturedAt,
        confirmed: true,
      } satisfies Reading
    }
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

  async getShare(householdId, opts) {
    await wait(200)
    const m = month()
    const h = m.households.find((x) => x.id === householdId)
    if (!h) throw new ApiError('Unknown household', 404, 'unknown_household')
    if (!h.share) {
      // Tenant screens fall back to the sample split; the organizer has nothing until the scans are in.
      if (!opts?.tenant) throw needsScan()
      const bill = m.bill ?? { ...SAMPLE_BILL, id: 'sample' }
      const sample = computeShares(bill, sampleReadings()).find((x) => x.householdId === householdId)!
      return { ...sample, name: h.name }
    }
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
      // Empty until his meter has been scanned and confirmed.
      if (state.bau === undefined) throw needsOwnScan()
      const rate = SAMPLE_BILL.amount / SAMPLE_BILL.kwh // 15.0615
      const totalDays = 30
      const photo = { day: BAUTISTA_PHOTO_DAY, kwhUsed: (state.bau ?? BAUTISTA_FACE) - BAUTISTA.previousReading }
      const daily = photo.kwhUsed / photo.day
      const toCome = daily * (totalDays - photo.day)
      const kwh = photo.kwhUsed + toCome
      const shown = Math.round(kwh)
      const low = kwh - 0.1 * toCome
      const high = kwh + 0.1 * toCome
      // Range line: the kWh band times the rate band (Sep to Oct rates), after the lifeline discount.
      const rateLo = 14.7424
      const peso = (k: number, r: number) => Math.round(k) * r * (1 - lifelineDiscount(Math.round(k)))
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
          { date: '2026-11-18', day: photo.day, kwhUsed: photo.kwhUsed, kind: 'photo' },
        ],
        forecast: { kwh, low, high },
        lifeline: {
          limitKwh: 50,
          pesoAtForecast: shown * rate * (1 - lifelineDiscount(shown)),
          pesoUnderLimit: 50 * rate * (1 - lifelineDiscount(50)),
          pesoLow: peso(low, rateLo),
          pesoHigh: peso(high, rate),
          tiers: LIFELINE_TIERS_2026,
        },
        rate: { perKwh: rate, ...rateMeta },
        actions: ACTIONS,
      }
    }
    const m = month()
    const h = m.households.find((x) => x.id === householdId)
    if (!h) throw new ApiError('Unknown household', 404, 'unknown_household')
    if (!m.bill || !h.share) throw needsScan()
    const last = h.reading?.kwh ?? 45
    const bill = m.bill
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
    const share = h.share ?? computeShares(bill, sampleReadings()).find((s) => s.householdId === id)!
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
      billKwh: 180,
      billAmount: 2711.07,
    }
  },

  // Mock limitation: every household gets the same demo link (the mock only knows "demo-santos").
  async createTenantLink() {
    await wait(300)
    if (!state.bill || Object.keys(state.readings).length < HOUSEHOLDS.length) throw needsScan()
    const next = state.bill.nextReadDate
    const d = new Date(`${next}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 7)
    return { url: `${window.location.origin}/t/demo-santos`, expiresAt: d.toISOString().slice(0, 10) }
  },

  async getAskPresets(language = 'en') {
    await wait(150)
    return ASK_PRESETS[language]
  },

  async ask({ householdId, tenantToken, presetId, question, language = 'en' }): Promise<AskAnswer> {
    await wait(600)
    if (!tenantToken) {
      if (householdId === BAUTISTA.id) {
        if (state.bau === undefined) throw needsOwnScan()
      } else if (!state.bill || Object.keys(state.readings).length < HOUSEHOLDS.length) {
        throw needsScan()
      }
    }
    const lang = language
    const p = ASK_PRESETS[lang]
    const answers: Record<string, string> = {
      why_share: "Your share is ₱677.77. You used 45 of the meter's 180 kWh, so you pay a quarter of each kWh-based charge, plus an equal ₱5.35 part of the ₱21.38 fixed charges.",
      what_lines: "Most of your ₱677.77 is generation (₱422.50), the cost of producing the electricity. The rest is transmission, system loss, distribution, supply and metering, taxes and other charges.",
      save_kwh: "Each kWh you save takes about ₱15 off your share (₱14.94 on this bill).",
      lifeline: "On a household's own enrolled meter, staying at 50 kWh or less gives 100% off. On a shared meter there is no 50 kWh line for one household.",
      readings_gap: "The sub-meter readings must add up to the bill's 180 kWh within about 9 kWh. When they fall short, the gap is split by kWh until a new photo fixes it.",
      rate_check: "You were asked ₱16.50 per kWh. The bill works out to ₱15.06 per kWh, so ₱742.50 is ₱64.73 above the bill's rate on a 45 kWh share.",
    }
    const id = presetId ?? 'why_share'
    return {
      answer: presetId ? answers[id] : `(mock) Sample answer to: "${question ?? ''}". The real backend answers from your own numbers.`,
      language: lang,
      provider: 'template',
      fallback: false,
      refused: false,
      sources: ['share', 'breakdown'],
      suggestions: p.filter((x) => x.id !== id).slice(0, 3),
      footer: MOCK_FOOTER,
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
    state = { bill: null, readings: {}, bau: undefined }
    save()
  },
}

export const OWN_METER_HOUSEHOLD = BAUTISTA
