import { scenarioPayloadFromLink } from '../lib/scenarioLink'
import { buildLabMonth, parseLabLink } from '../lib/labMonth'
import { ApiError, type KahatiApi, type ScenarioImport } from './client'
import type {
  AskAnswer,
  AskPreset,
  Bill,
  BillLine,
  BillScan,
  CheckSummary,
  HouseholdMonth,
  LineKey,
  MeterScan,
  MonthView,
  Reading,
  Share,
  TenantView,
  UsageView,
} from './types'

/**
 * Real backend adapter (see docs/API.md in the repo root).
 *
 * The backend is stateless: it computes from a CompoundState that the client
 * sends with each call. This adapter keeps that state in localStorage, starts
 * from GET /api/sample, and maps the backend's shapes to the screens' types.
 * Front-end household ids A..D and BAU map to backend ids hA..hD and hBautista.
 */

// ---------- backend shapes (subset of src/types/index.ts) ----------

type Lines = Record<LineKey, number>
interface BReading {
  id: string
  meterId: string
  value: number
  capturedAt: string
  source: 'photo' | 'typed' | 'bill'
  confidence: number | null
  confirmed: boolean
  serialRead?: string | null
}
interface BMeter { id: string; householdId: string | null; serial: string; type: string; digits: number }
interface BHousehold { id: string; label: string; displayName: string; fourPs: boolean }
interface BBill {
  id: string; compoundId: string; periodStart: string; periodEnd: string; readDate: string; nextReadDate: string
  kwh: number; amount: number; lines: Lines; fixedCharges: number
  previousReading: number | null; presentReading: number | null
  history: { month: string; kwh: number }[]; accountLast4: string; source: string
}
interface BState {
  compound: { id: string; displayName: string; mode: 'shared' | 'single'; householdIds: string[] }
  households: BHousehold[]
  meters: BMeter[]
  bill: BBill
  previousReadings: BReading[]
  currentReadings: BReading[]
  unmeteredKwh: number
  chargedRates: { householdId: string; perKwh: number }[]
}
interface BShare { householdId: string; kwh: number; amountExact: number; amount: number; breakdown: Lines; fixedPart: number }
interface BSplit { shares: BShare[]; total: number; effectiveRate: number; perKwhValue: number }
interface BCheck {
  status: 'ok' | 'gap'; billKwh: number; readingsKwh: number; missingKwh: number; tolerancePct: number; toleranceKwh: number
  households: { householdId: string; kwh: number; chip: string; flags: string[]; suggestion?: { householdId?: string; from?: string; to: string; message: string } | null }[]
  gapRule: string | null
}
interface BForecast {
  stage: 1 | 2 | 3; readDate: string; kwh: number; low: number; high: number
  points: { date: string; day: number; kwhUsed: number; kind: 'bill' | 'photo' | 'projection' }[]
  rate: { perKwh: number; month: string; isFallback: boolean; note: string | null }
  lifeline: null | { forecastPeso: number; underLinePeso: number; pesoLow?: number; pesoHigh?: number; tiers?: { maxKwh: number; discount: number }[] }
  perKwhValue: number | null
  spike: null | { percentAbove: number }
  actions: string[]
}
interface BTenant {
  household: { id: string; displayName: string; label: string }
  share: BShare
  bill: { kwh: number; amount: number }
  rateCheck: null | { askedAmount: number; aboveBy: number }
  perKwhValue: number
  expiresAt: string
}

const LINE_ORDER: LineKey[] = ['generation', 'transmission', 'systemLoss', 'distribution', 'supplyMetering', 'taxes', 'other']
const toB = (id: string) => (id === 'BAU' ? 'hBautista' : `h${id}`)
const toF = (id: string) => (id === 'hBautista' ? 'BAU' : id.replace(/^h/, ''))
/** Sample persona names used by the design for the tenant view. */
const TENANT_FIRST_NAMES: Record<string, string> = { B: 'Lorna' }
/** The built-in sample's household name behind each persona name: a scenario that renames the household wins. */
const TENANT_SAMPLE_NAMES: Record<string, string> = { B: 'Santos' }
/** The demo tenant link in the design ("/t/demo-santos") mints a real signed link. */
const DEMO_TOKENS: Record<string, string> = { 'demo-santos': 'hB' }
const RATE_SOURCE = 'Meralco rate announcement (team rate table)'
/**
 * Backend error codes (docs/API.md) mapped to the UI's translated err.* keys.
 * Codes not listed pass through; the UI falls back to the backend's English message.
 */
const BACKEND_CODES: Record<string, string> = {
  expired: 'link_expired',
  bad_signature: 'link_expired',
  malformed: 'link_expired',
  missing_reading: 'shares_pending',
  no_usage: 'shares_pending',
  unknown_household: 'unknown_household',
  below_previous: 'reading_below',
  reading_below_base: 'reading_below',
  // Request-shape errors all read the same to a user.
  bad_json: 'bad_request',
  bad_body: 'bad_request',
  bad_household: 'bad_request',
  bad_as_of: 'bad_request',
  bad_own_meter: 'bad_request',
  bad_history: 'bad_request',
  bad_cdd: 'bad_request',
  bad_use_weather: 'bad_request',
  bad_which: 'bad_request',
  // reader_failed, internal, bad_state, negative_kwh, no_meter, no_base_reading
  // and no_last_period pass through and have their own err.* text.
}

/**
 * Demo clock. The sample bill is dated 31 Oct 2026, so a reading confirmed today
 * would be pro-rated back to that date by the read-date alignment check. While the
 * demo clock is on (the default), confirmed readings are stamped on the bill's read
 * date. Set VITE_DEMO_CLOCK=off for real use with current bills.
 * Bautista's own meter (householdId "BAU") has its own story clock: a confirmed reading
 * is stamped on 2026-11-18 at 08:30 (the story's day-18 photo), so the printed 12552
 * reads as 32 kWh at day 18 and forecasts 53 kWh (51 to 55).
 */
const DEMO_CLOCK = (import.meta.env.VITE_DEMO_CLOCK as string | undefined) !== 'off'

const BAU_DEMO_PHOTO_AT = '2026-11-18T08:30:00+08:00'

const KEY = 'kahati-http-v1'
/** `bau` is Bautista's own-meter state, kept apart from the shared compound. */
interface Local { state: BState | null; billConfirmed: boolean; bau?: BState | null; scenario?: Scenario | null }
/** A lab scenario: replaces GET /api/sample. Both states keep their currentReadings (used by "Load the rest"). */
interface Scenario { v: 1; compound: BState; bau: BState }

// ---------- scenario import (#scenario=<base64url JSON>) ----------

const SCENARIO_HOUSEHOLDS = ['hA', 'hB', 'hC', 'hD']
const SCENARIO_METERS = ['mMaster', 'mA', 'mB', 'mC', 'mD']
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const sameSet = (a: string[], b: string[]) => a.length === b.length && b.every((x) => a.includes(x))

/** True when every number in the value is finite (no NaN or Infinity anywhere). */
function allFinite(x: unknown): boolean {
  if (typeof x === 'number') return Number.isFinite(x)
  if (Array.isArray(x)) return x.every(allFinite)
  if (isObj(x)) return Object.values(x).every(allFinite)
  return true
}

/** Checks one state of a scenario; returns a reason, or null when it is fine. */
function checkState(s: unknown, label: string, compoundId: string, hids: string[], mids: string[]): string | null {
  if (!isObj(s)) return `${label} is missing`
  if (!isObj(s.compound) || typeof s.compound.displayName !== 'string' || !s.compound.displayName.trim()) return `${label} has no name`
  if (s.compound.id !== compoundId) return `${label} must use compound id ${compoundId}`
  for (const k of ['households', 'meters', 'previousReadings'] as const) {
    if (!Array.isArray(s[k]) || (s[k] as unknown[]).length === 0) return `${label} has no ${k}`
  }
  if (s.currentReadings !== undefined && !Array.isArray(s.currentReadings)) return `${label} currentReadings is not a list`
  if (!isObj(s.bill)) return `${label} has no bill`
  const hs = s.households as { id?: unknown; displayName?: unknown; fourPs?: unknown }[]
  const ms = s.meters as { id?: unknown; serial?: unknown; householdId?: unknown }[]
  if (!sameSet(hs.map((h) => String(h?.id)), hids)) return `${label} households must be ${hids.join(', ')}`
  if (!sameSet(ms.map((m) => String(m?.id)), mids)) return `${label} meters must be ${mids.join(', ')}`
  if (hs.some((h) => typeof h.displayName !== 'string' || !h.displayName.trim() || typeof h.fourPs !== 'boolean')) return `${label} households need a name and a 4Ps flag`
  if (ms.some((m) => typeof m.serial !== 'string' || !m.serial.trim())) return `${label} meters need a serial`
  for (const r of [...(s.previousReadings as unknown[]), ...((s.currentReadings as unknown[] | undefined) ?? [])]) {
    if (!isObj(r) || typeof r.value !== 'number' || r.value < 0 || typeof r.meterId !== 'string' || !mids.includes(r.meterId)) {
      return `${label} has a bad reading`
    }
  }
  // Every household meter needs a previous reading (the master has none).
  for (const m of ms) {
    if (m.householdId && !(s.previousReadings as { meterId?: unknown }[]).some((r) => r.meterId === m.id)) {
      return `${label} meter ${String(m.id)} has no previous reading`
    }
  }
  const b = s.bill as { kwh?: unknown; amount?: unknown; lines?: unknown }
  if (typeof b.kwh !== 'number' || b.kwh <= 0 || typeof b.amount !== 'number' || b.amount <= 0) return `${label} bill needs positive kWh and amount`
  const lines = b.lines
  if (!isObj(lines) || LINE_ORDER.some((k) => typeof lines[k] !== 'number')) return `${label} bill lines are incomplete`
  const sum = LINE_ORDER.reduce((t, k) => t + (lines[k] as number), 0)
  if (Math.abs(sum - b.amount) > 0.05) return `${label} bill lines add to ${sum.toFixed(2)}, not ${b.amount}`
  return null
}

/** Decodes and validates a scenario payload (base64url of UTF-8 JSON). */
export function parseScenario(encoded: string): { ok: true; scenario: Scenario } | { ok: false; reason: string } {
  let data: unknown
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
  } catch {
    return { ok: false, reason: 'the link is damaged' }
  }
  return validateScenario(data)
}

/** Validates a scenario object (from a plain link, or rebuilt from the compact form). */
export function validateScenario(data: unknown): { ok: true; scenario: Scenario } | { ok: false; reason: string } {
  if (!isObj(data) || data.v !== 1) return { ok: false, reason: 'unsupported version' }
  if (!allFinite(data)) return { ok: false, reason: 'a number is not valid' }
  const bad =
    checkState(data.compound, 'compound', 'c14', SCENARIO_HOUSEHOLDS, SCENARIO_METERS) ??
    checkState(data.bau, 'Bautista', 'cBautista', ['hBautista'], ['mBautista'])
  if (bad) return { ok: false, reason: bad }
  return { ok: true, scenario: { v: 1, compound: data.compound as unknown as BState, bau: data.bau as unknown as BState } }
}

// ---------- compact scenario (#s2=) ----------

const DAY = 86400000
const str = (x: unknown) => { if (typeof x !== 'string') throw new Error('not text'); return x }
const num = (x: unknown) => { if (typeof x !== 'number') throw new Error('not a number'); return x }
const arr = (x: unknown, n: number) => { if (!Array.isArray(x) || x.length !== n) throw new Error('bad list'); return x as unknown[] }

/**
 * Rebuilds a full scenario from the compact lab form by overwriting fields of the built-in sample states.
 * The compact JSON is {v:2, n, h: 4 household rows, o: own meter row, b: bill row}.
 */
function buildCompact(json: string, compoundSample: BState, bauSample: BState): { ok: true; scenario: Scenario } | { ok: false; reason: string } {
  try {
    const d = JSON.parse(json) as unknown
    if (!isObj(d) || d.v !== 2) return { ok: false, reason: 'unsupported version' }
    const n = str(d.n)
    const h = arr(d.h, 4).map((r) => arr(r, 6))
    const o = arr(d.o, 6)
    const b = arr(d.b, 13)
    const [periodStart, periodEnd, readDate, nextReadDate] = [str(b[0]), str(b[1]), str(b[2]), str(b[3])]
    const lineVals = arr(b[6], 7).map(num)
    const hist = arr(b[10], 12).map(num)
    const masterSerial = str(b[12])

    const c = structuredClone(compoundSample)
    c.compound.displayName = n
    ;['A', 'B', 'C', 'D'].forEach((l, i) => {
      const row = h[i]
      const hh = c.households.find((x) => x.id === 'h' + l) as (BHousehold & { language?: string }) | undefined
      const m = c.meters.find((x) => x.id === 'm' + l)
      const p = c.previousReadings.find((x) => x.meterId === 'm' + l)
      const k = c.currentReadings.find((x) => x.meterId === 'm' + l)
      if (!hh || !m || !p || !k) throw new Error('sample shape')
      hh.displayName = str(row[0]); hh.fourPs = !!row[1]; hh.language = str(row[2])
      const serial = str(row[3])
      m.serial = serial
      Object.assign(p, { value: num(row[4]), capturedAt: periodStart + 'T09:00:00+08:00', source: 'typed', confidence: null, confirmed: true, serialRead: serial })
      Object.assign(k, { value: num(row[5]), capturedAt: readDate + 'T09:00:00+08:00', source: 'typed', confidence: null, confirmed: true, serialRead: serial })
    })
    const master = c.meters.find((x) => x.id === 'mMaster')
    if (!master) throw new Error('sample shape')
    master.serial = masterSerial
    const [ey, em] = periodEnd.split('-').map(Number)
    const history = hist.map((kwh, i) => {
      const t = ey * 12 + (em - 1) - (11 - i)
      return { month: Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0'), kwh }
    })
    Object.assign(c.bill, {
      periodStart, periodEnd, readDate, nextReadDate, kwh: num(b[4]), amount: num(b[5]),
      lines: Object.fromEntries(LINE_ORDER.map((k, i) => [k, lineVals[i]])) as Lines,
      fixedCharges: num(b[7]), previousReading: num(b[8]), presentReading: num(b[9]), history, accountLast4: str(b[11]),
    })

    const a = structuredClone(bauSample)
    a.compound.displayName = n + ' (own meter)'
    const bh = a.households.find((x) => x.id === 'hBautista') as (BHousehold & { language?: string }) | undefined
    const bm = a.meters.find((x) => x.id === 'mBautista')
    const bp = a.previousReadings.find((x) => x.meterId === 'mBautista')
    const bk = a.currentReadings.find((x) => x.meterId === 'mBautista')
    if (!bh || !bm || !bp || !bk) throw new Error('sample shape')
    const bserial = str(o[3])
    const readDay = num(o[4])
    bh.displayName = str(o[0]); bh.fourPs = !!o[1]; bh.language = str(o[2])
    bm.serial = bserial
    a.bill.presentReading = readDay
    a.bill.previousReading = readDay - a.bill.kwh
    Object.assign(bp, { value: readDay, capturedAt: a.bill.readDate, source: 'bill', confidence: null, confirmed: true })
    const day18 = new Date(Date.parse(a.bill.readDate.slice(0, 10) + 'T00:00:00Z') + 18 * DAY).toISOString().slice(0, 10)
    Object.assign(bk, { value: num(o[5]), capturedAt: day18 + 'T08:30:00+08:00', source: 'typed', confidence: null, confirmed: true, serialRead: bserial })

    return validateScenario({ v: 1, compound: c, bau: a })
  } catch {
    return { ok: false, reason: 'the link is damaged' }
  }
}

const withReadings = (s: BState): BState => ({ ...s, currentReadings: s.currentReadings ?? [] })

export function createHttpApi(baseUrl: string): KahatiApi {
  // ---------- transport ----------
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(baseUrl + path, init)
    } catch {
      throw new ApiError('No connection. Check the Wi-Fi or switch to the hotspot.', 0, 'offline')
    }
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      let msg = text || `Request failed (${res.status})`
      let code: string | undefined
      try {
        const e = JSON.parse(text) as { error?: { code?: string; message?: string; next?: string } }
        if (e.error?.message) msg = e.error.next ? `${e.error.message} ${e.error.next}` : e.error.message
        code = e.error?.code ? (BACKEND_CODES[e.error.code] ?? e.error.code) : undefined
      } catch {
        // Not JSON: the host's own error page (e.g. a function timeout during a slow photo read).
        // Show a translated message instead of the host's raw text.
        code = path.includes('/api/scan/') ? 'reader_failed' : 'internal'
        msg = code === 'reader_failed'
          ? 'The photo could not be read right now. Try again, or type it instead.'
          : 'Something went wrong on our side. Try again.'
      }
      throw new ApiError(msg, res.status, code)
    }
    return (text ? JSON.parse(text) : undefined) as T
  }
  const post = <T>(path: string, body: unknown) =>
    call<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  // ---------- local state ----------
  let local: Local = { state: null, billConfirmed: false }
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) local = JSON.parse(raw) as Local
  } catch {
    /* storage unavailable */
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(local))
    } catch {
      /* storage unavailable */
    }
  }
  let sampleCache: BState | null = null
  /** The built-in compound sample (GET /api/sample), whatever scenario is active. */
  async function builtInCompound(): Promise<BState> {
    if (!sampleCache) sampleCache = await call<BState>('/api/sample?which=compound')
    return structuredClone(sampleCache)
  }
  /** The active scenario's compound, else GET /api/sample. */
  async function sample(): Promise<BState> {
    if (local.scenario) return structuredClone(local.scenario.compound)
    return builtInCompound()
  }
  /** Working state: the sample compound with this month's readings cleared until scanned. */
  async function state(): Promise<BState> {
    if (!local.state) {
      const s = await sample()
      s.currentReadings = []
      local = { ...local, state: s, billConfirmed: false }
      save()
    }
    return local.state!
  }
  let bauCache: BState | null = null
  /** The active scenario's Bautista state, else GET /api/sample?which=bautista (with its seeded day-18 reading). */
  async function builtInBau(): Promise<BState> {
    if (!bauCache) bauCache = await call<BState>('/api/sample?which=bautista')
    return structuredClone(bauCache)
  }
  async function bauSample(): Promise<BState> {
    if (local.scenario) return structuredClone(local.scenario.bau)
    return builtInBau()
  }
  /** Bautista's own-meter state: starts from GET /api/sample?which=bautista, then persists. */
  async function bauState(): Promise<BState> {
    if (!local.bau) {
      // The bill's read-day reading stays (it is in previousReadings); the seeded day-18 photo
      // reading is dropped, so the forecast only appears after a real scan and confirmReading.
      local.bau = { ...(await bauSample()), currentReadings: [] }
      save()
    } else if (local.bau.currentReadings.some((r) => !r.id.startsWith('r-'))) {
      // State saved before this rule: drop the seeded reading (real ones are ids "r-<meter>-<time>").
      local.bau.currentReadings = local.bau.currentReadings.filter((r) => r.id.startsWith('r-'))
      save()
    }
    return local.bau
  }
  const meterOf = (s: BState, hid: string) => s.meters.find((m) => m.householdId === hid)
  const prevOf = (s: BState, meterId: string) => s.previousReadings.find((r) => r.meterId === meterId)
  const currOf = (s: BState, meterId: string) => s.currentReadings.find((r) => r.meterId === meterId)
  const allIn = (s: BState) => s.households.every((h) => { const m = meterOf(s, h.id); return !!m && !!currOf(s, m.id) })
  /** The organizer's compound is ready once the bill is confirmed and all four readings are in. */
  const ready = (s: BState) => local.billConfirmed && allIn(s)
  const needsScan = () => new ApiError('Scan the bill and the meters first.', 409, 'needs_scan')
  /** The working compound if ready, else the sample (tenant paths only), else needs_scan. */
  async function usable(s: BState, fallbackToSample: boolean): Promise<BState> {
    if (ready(s)) return s
    if (fallbackToSample) return sample()
    throw needsScan()
  }
  /** Bautista has a usable forecast once his own meter has a reading beyond the bill's. */
  const needsOwnScan = () => new ApiError('Scan your meter first.', 409, 'needs_own_scan')
  const bauScanned = (s: BState) => s.currentReadings.length > 0

  // ---------- mappers ----------
  const billLines = (b: { lines: Lines; fixedCharges: number }): BillLine[] =>
    LINE_ORDER.map((key) => ({ key, amount: b.lines[key], fixed: key === 'supplyMetering' ? b.fixedCharges : 0 }))
  const linesRecord = (lines: BillLine[]): Lines =>
    Object.fromEntries(LINE_ORDER.map((k) => [k, lines.find((l) => l.key === k)?.amount ?? 0])) as Lines
  const toBill = (b: BBill): Bill => ({
    id: b.id, periodStart: b.periodStart, periodEnd: b.periodEnd, readDate: b.readDate, nextReadDate: b.nextReadDate,
    kwh: b.kwh, amount: b.amount, fixedCharges: b.fixedCharges, lines: billLines(b), accountLast4: b.accountLast4,
    presentReading: b.presentReading ?? undefined,
  })
  const toShare = (s: BShare): Share => ({
    householdId: toF(s.householdId), kwh: s.kwh, amount: s.amount,
    lines: LINE_ORDER.map((key) => ({ key, amount: s.breakdown[key] })),
  })
  const toReading = (s: BState, hid: string, kwh?: number): Reading | undefined => {
    const m = meterOf(s, hid)
    const c = m && currOf(s, m.id)
    const p = m && prevOf(s, m.id)
    if (!c) return undefined
    return {
      householdId: toF(hid), value: c.value, kwh: kwh ?? (p ? c.value - p.value : 0), source: c.source,
      capturedAt: c.capturedAt, confidence: c.confidence ?? undefined, confirmed: c.confirmed,
      serialRead: c.serialRead ?? null,
    }
  }
  const monthLabel = (ym: string) =>
    new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const actionIcon = (t: string): UsageView['actions'][number]['icon'] =>
    /aircon/i.test(t) ? 'snowflake' : /timer|hour|night/i.test(t) ? 'clock' : 'plug'
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

  /** Downscale a phone photo before upload (the API rejects bodies over about 4 MB). */
  async function toDataUrl(image: Blob): Promise<{ imageBase64: string; mimeType: string }> {
    try {
      const bmp = await createImageBitmap(image)
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bmp.width * scale)
      canvas.height = Math.round(bmp.height * scale)
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
      return { imageBase64: canvas.toDataURL('image/jpeg', 0.85), mimeType: 'image/jpeg' }
    } catch {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new ApiError('Could not read the photo. Type it instead.'))
        r.readAsDataURL(image)
      })
      return { imageBase64: dataUrl, mimeType: image.type || 'image/jpeg' }
    }
  }

  /**
   * Source for the demo tenant link: this month's state only when the bill is confirmed, all
   * readings are in AND they add up (so the tenant sees a complete, consistent view with its
   * rate tiles); otherwise the sample compound.
   */
  /** The demo link uses this month only when it is complete and adds up; otherwise (or if the check fails) the sample. */
  async function demoSource(): Promise<{ src: BState; isSample: boolean }> {
    const s = await state()
    if (ready(s)) {
      try {
        const c = await post<BCheck>('/api/check', { state: s })
        if (c.status === 'ok') return { src: s, isSample: false }
      } catch { /* fall back to the sample */ }
    }
    return { src: await sample(), isSample: true }
  }

  async function tenantFromToken(token: string): Promise<{ v: BTenant; isSample: boolean }> {
    const demoHid = DEMO_TOKENS[token]
    if (!demoHid) return { v: await call<BTenant>(`/api/tenant/${encodeURIComponent(token)}`), isSample: false }
    const { src, isSample } = await demoSource()
    const link = await post<{ token: string }>('/api/tenant-link', { state: src, householdId: demoHid })
    return { v: await call<BTenant>(`/api/tenant/${encodeURIComponent(link.token)}`), isSample }
  }

  // ---------- KahatiApi ----------
  /** Validates a plain payload and makes it the active scenario, restarting this month's progress.
   * With skipSame, the scenario already active is left alone (re-importing would wipe progress). */
  function applyScenario(r: ReturnType<typeof parseScenario>, skipSame: boolean): ScenarioImport {
    if (!r.ok) return r
    const compound = withReadings(r.scenario.compound)
    const bau = withReadings(r.scenario.bau)
    const name = compound.compound.displayName
    if (skipSame && local.scenario && JSON.stringify(local.scenario.compound) === JSON.stringify(compound) && JSON.stringify(local.scenario.bau) === JSON.stringify(bau)) {
      return { ok: true, name, unchanged: true }
    }
    // This month's progress restarts from the scenario: no readings yet, bill not confirmed.
    local = {
      scenario: { v: 1, compound, bau },
      state: { ...structuredClone(compound), currentReadings: [] },
      billConfirmed: false,
      bau: { ...structuredClone(bau), currentReadings: [] },
    }
    save()
    return { ok: true, name }
  }

  return {
    async getMonth(): Promise<MonthView> {
      const s = await state()
      const bill = local.billConfirmed ? s.bill : null
      const anyReading = s.currentReadings.length > 0
      const check = bill && anyReading ? await post<BCheck>('/api/check', { state: s }) : null
      const split = bill && allIn(s) ? await post<BSplit>('/api/split', { state: s }) : null
      const households: HouseholdMonth[] = s.households.map((h) => {
        const m = meterOf(s, h.id)
        const ck = check?.households.find((x) => x.householdId === h.id)
        const sh = split?.shares.find((x) => x.householdId === h.id)
        return {
          id: toF(h.id), label: h.label, name: h.displayName, meterKind: 'sub', fourPs: h.fourPs,
          meterSerial: m?.serial ?? '', previousReading: (m && prevOf(s, m.id)?.value) ?? 0,
          reading: toReading(s, h.id, ck?.kwh),
          share: sh ? toShare(sh) : undefined,
          flags: ck?.flags,
          suggestion: ck?.suggestion ? { value: Number(ck.suggestion.to), message: ck.suggestion.message } : null,
        }
      })
      const summary: CheckSummary | null = check && bill ? {
        masterKwh: check.billKwh, readingsKwh: check.readingsKwh, unmeteredKwh: s.unmeteredKwh,
        missingKwh: check.missingKwh, tolerancePct: check.tolerancePct, toleranceKwh: check.toleranceKwh,
        addsUp: check.status === 'ok', alignedTo: bill.readDate, gapRuleApplied: check.gapRule !== null,
      } : null
      const billRate = bill ? bill.amount / bill.kwh : 0
      const charged = s.chargedRates[0]?.perKwh
      return {
        bill: bill ? toBill(bill) : null,
        households,
        check: summary,
        rateNote: bill && charged && charged > billRate * 1.02
          ? { chargedRate: charged, billRate, difference: charged - billRate } : null,
      }
    },

    async scanBill(image): Promise<BillScan> {
      const r = await post<{
        scan: BBill & { confidence: number }
        sanity?: { linesAddUp?: boolean; linesNote?: string | null; withinBand?: boolean; note?: string | null }
      }>('/api/scan/bill', await toDataUrl(image))
      const sc = r.scan
      const sn = r.sanity
      return {
        periodStart: sc.periodStart, periodEnd: sc.periodEnd, readDate: sc.readDate, nextReadDate: sc.nextReadDate,
        kwh: sc.kwh, amount: sc.amount, fixedCharges: sc.fixedCharges, lines: billLines(sc),
        accountLast4: sc.accountLast4, presentReading: sc.presentReading ?? undefined, confidence: sc.confidence,
        linesAddUp: sn?.linesAddUp ?? true,
        sanityNote: sn?.linesNote ?? (sn?.withinBand === false ? (sn.note ?? null) : null),
      }
    },

    async confirmBill(scan): Promise<Bill> {
      const s = await state()
      s.bill = {
        ...s.bill,
        id: `bill-${scan.periodEnd.slice(0, 7)}`,
        periodStart: scan.periodStart, periodEnd: scan.periodEnd, readDate: scan.readDate, nextReadDate: scan.nextReadDate,
        kwh: scan.kwh, amount: scan.amount, fixedCharges: scan.fixedCharges, lines: linesRecord(scan.lines),
        accountLast4: scan.accountLast4, presentReading: scan.presentReading ?? s.bill.presentReading,
        source: 'scan',
      }
      s.currentReadings = []
      local.billConfirmed = true
      save()
      return toBill(s.bill)
    },

    async scanMeter(householdId, image): Promise<MeterScan> {
      const s = householdId === 'BAU' ? await bauState() : await state()
      const hid = toB(householdId)
      const m = meterOf(s, hid)
      if (!m) throw new ApiError('Unknown household', 404, 'unknown_household')
      const previous = prevOf(s, m.id)
      const r = await post<{
        scan: { value: number; serial: string | null; confidence: number }
        validation: { ok: boolean; kwhSinceLast: number | null; serialMatches: boolean | null; issues?: { code: string }[] }
      }>('/api/scan/meter', { ...(await toDataUrl(image)), meter: m, previous, hint: m.serial })
      return {
        householdId,
        value: r.scan.value,
        kwhSinceLast: r.validation.kwhSinceLast ?? (previous ? r.scan.value - previous.value : 0),
        serial: r.scan.serial ?? '',
        serialMatches: r.validation.serialMatches === true,
        serialRead: !!r.scan.serial,
        confidence: r.scan.confidence,
        capturedAt: new Date().toISOString(),
        needsSecondLook: !r.validation.ok,
        issues: r.validation.issues?.map((i) => i.code),
      }
    },

    async confirmReading({ householdId, value, source, capturedAt, confidence, serialRead }): Promise<Reading> {
      const own = householdId === 'BAU'
      const s = own ? await bauState() : await state()
      const hid = toB(householdId)
      const m = meterOf(s, hid)
      if (!m) throw new ApiError('Unknown household', 404, 'unknown_household')
      const p = prevOf(s, m.id)
      if (p && value < p.value) throw new ApiError("This reading is below last month's. Check the number.", 422, 'reading_below')
      s.currentReadings = s.currentReadings.filter((r) => r.meterId !== m.id)
      s.currentReadings.push({
        id: `r-${m.id}-${Date.now()}`, meterId: m.id, value, source,
        capturedAt: DEMO_CLOCK ? (own ? BAU_DEMO_PHOTO_AT : `${s.bill.readDate}T09:00:00+08:00`) : capturedAt,
        confidence: source === 'photo' ? (confidence ?? null) : null, confirmed: true,
        serialRead: source === 'photo' ? (serialRead ?? null) : null,
      })
      save()
      return toReading(s, hid)!
    },

    async getShare(householdId, opts) {
      const s = await state()
      const hid = toB(householdId)
      // Organizer: needs_scan until this month's split exists. Tenant view: the sample split, like the demo link.
      const src = await usable(s, !!opts?.tenant)
      const split = await post<BSplit>('/api/split', { state: src })
      const sh = split.shares.find((x) => x.householdId === hid)
      if (!sh) throw new ApiError('Unknown household', 404, 'unknown_household')
      const name = src.households.find((h) => h.id === hid)?.displayName ?? householdId
      return { ...toShare(sh), name }
    },

    async getUsage(householdId): Promise<UsageView> {
      const own = householdId === 'BAU'
      const s = own ? await bauState() : await usable(await state(), false)
      if (own && !bauScanned(s)) throw needsOwnScan()
      const hid = toB(householdId)
      const f = await post<BForecast>('/api/forecast', { state: s, householdId: hid })
      const h = s.households.find((x) => x.id === hid)
      return {
        householdId,
        name: h?.displayName ?? householdId,
        mode: own ? 'own' : 'shared',
        stage: f.stage,
        readDate: s.bill.readDate,
        nextReadDate: s.bill.nextReadDate,
        totalDays: days(s.bill.readDate, s.bill.nextReadDate),
        points: f.points.filter((p) => p.kind !== 'projection').map((p) => ({ ...p, kind: p.kind as 'bill' | 'photo' })),
        forecast: { kwh: f.kwh, low: f.low, high: f.high },
        lifeline: f.lifeline ? {
          limitKwh: 50, pesoAtForecast: f.lifeline.forecastPeso, pesoUnderLimit: f.lifeline.underLinePeso,
          pesoLow: f.lifeline.pesoLow, pesoHigh: f.lifeline.pesoHigh,
          // The backend's tier table (ERC 2026) feeds the Usage tier bar.
          tiers: f.lifeline.tiers?.map((t) => ({ upTo: t.maxKwh, pctOff: Math.round(t.discount * 100) })),
        } : undefined,
        perKwhValue: f.perKwhValue ?? undefined,
        rate: { perKwh: f.rate.perKwh, month: monthLabel(f.rate.month), source: RATE_SOURCE, isFallback: f.rate.isFallback, fallbackNote: f.rate.note ?? undefined },
        spikePct: f.spike?.percentAbove,
        actions: f.actions.slice(0, 3).map((text) => ({ icon: actionIcon(text), text })),
      }
    },

    // The backend has no messaging; the household is asked in person for now.
    async requestNewPhoto() {},

    async getTenantView(token): Promise<TenantView> {
      const { v, isSample } = await tenantFromToken(token)
      const fid = toF(v.household.id)
      return {
        householdId: fid,
        name: v.household.displayName === TENANT_SAMPLE_NAMES[fid] ? TENANT_FIRST_NAMES[fid] : v.household.displayName,
        share: v.share.amount,
        kwh: v.share.kwh,
        askedToPay: v.rateCheck?.askedAmount ?? null,
        aboveBillRate: v.rateCheck?.aboveBy ?? null,
        perKwhValue: v.perKwhValue,
        expiresAt: v.expiresAt,
        billKwh: v.bill.kwh,
        billAmount: v.bill.amount,
        lines: LINE_ORDER.map((key) => ({ key, amount: v.share.breakdown[key] })),
        sample: isSample,
      }
    },

    async createTenantLink(householdId): Promise<{ url: string; expiresAt: string }> {
      const src = await usable(await state(), false)
      const r = await post<{ url: string; expiresAt: string }>('/api/tenant-link', {
        state: src, householdId: toB(householdId), baseUrl: window.location.origin,
      })
      return { url: r.url, expiresAt: r.expiresAt }
    },

    async getAskPresets(language = 'en'): Promise<AskPreset[]> {
      const r = await call<{ presets: AskPreset[] }>(`/api/ask/presets?language=${language}`)
      return r.presets
    },

    async ask({ householdId, tenantToken, presetId, question, language, history }): Promise<AskAnswer> {
      const base = { presetId, question, language, history }
      if (tenantToken) {
        // The design's demo link mints a real signed link first, like getTenantView does.
        const demoHid = DEMO_TOKENS[tenantToken]
        let token = tenantToken
        if (demoHid) {
          const { src } = await demoSource()
          token = (await post<{ token: string }>('/api/tenant-link', { state: src, householdId: demoHid })).token
        }
        return post<AskAnswer>('/api/ask', { ...base, tenantToken: token })
      }
      if (!householdId) throw new ApiError('Pick a household first.', 400, 'bad_request')
      const own = householdId === 'BAU'
      const s = own ? await bauState() : await usable(await state(), false)
      if (own && !bauScanned(s)) throw needsOwnScan()
      return post<AskAnswer>('/api/ask', { ...base, state: s, householdId: toB(householdId) })
    },

    async loadSampleReadings() {
      const s = await state()
      const full = await sample()
      let loaded = 0
      for (const r of full.currentReadings) {
        if (!currOf(s, r.meterId)) {
          s.currentReadings.push({ ...r, capturedAt: s.bill.readDate + 'T09:00:00+08:00' })
          loaded++
        }
      }
      // Bautista too: the sample's day-18 photo reading, stamped like a real scan on his story clock.
      const b = await bauState()
      const bm = meterOf(b, 'hBautista')
      const seeded = (await bauSample()).currentReadings.find((r) => r.meterId === bm?.id)
      if (bm && seeded && !currOf(b, bm.id)) {
        b.currentReadings.push({
          ...seeded, id: `r-${bm.id}-${Date.now()}`,
          capturedAt: DEMO_CLOCK ? BAU_DEMO_PHOTO_AT : new Date().toISOString(),
        })
        loaded++
      }
      save()
      // Nothing is invented: whoever the sample has no reading for stays empty.
      const missing = s.households.filter((h) => { const m = meterOf(s, h.id); return !m || !currOf(s, m.id) }).length
      return { loaded, missing }
    },

    /**
     * Demo of the digit fix: every reading arrives as a photo (none typed), and Santos's photo comes in as
     * 04542 at low confidence instead of 04572. That leaves a 30 kWh gap that one digit closes, so Check
     * offers "Did you mean 04572, not 04542?". Built-in sample month only (its numbers make the fix unique).
     */
    async loadMisreadDemo(): Promise<{ ok: boolean; reason?: 'no_bill' | 'not_sample' }> {
      if (!local.billConfirmed) return { ok: false, reason: 'no_bill' }
      const s = await state()
      const base = await builtInCompound()
      if (local.scenario || s.bill.kwh !== base.bill.kwh) return { ok: false, reason: 'not_sample' }
      const at = s.bill.readDate + 'T09:00:00+08:00'
      s.currentReadings = base.currentReadings.map((r) =>
        r.meterId === 'mB'
          ? { ...r, id: `r-mB-misread`, value: 4542, confidence: 0.62, source: 'photo' as const, capturedAt: at }
          : { ...r, source: 'photo' as const, capturedAt: at },
      )
      save()
      return { ok: true }
    },

    async resetDemo() {
      local = { state: null, billConfirmed: false, bau: null, scenario: local.scenario ?? null }
      save()
    },

    async getOwnMeter() {
      const b = await bauState()
      const m = meterOf(b, 'hBautista')
      return {
        name: b.households.find((h) => h.id === 'hBautista')?.displayName ?? '',
        meterSerial: m?.serial ?? '',
        previousReading: (m && prevOf(b, m.id)?.value) ?? b.bill.presentReading ?? 0,
      }
    },

    importScenarioFromHash(): ScenarioImport | null {
      const hit = /(?:^#|&)scenario=([^&]*)/.exec(window.location.hash)
      if (!hit) return null
      // Drop the hash first so a reload never re-imports (also when the scenario turns out invalid).
      try { history.replaceState(null, '', window.location.pathname + window.location.search) } catch { /* ignore */ }
      return applyScenario(parseScenario(hit[1]), false)
    },

    async importScenarioLink(link: string, opts?: { force?: boolean }): Promise<ScenarioImport> {
      const p = await scenarioPayloadFromLink(link)
      if (p == null) return { ok: false, reason: 'no scenario in the link' }
      let r: ReturnType<typeof parseScenario>
      if (p.kind === 'plain') r = parseScenario(p.payload)
      else if (p.kind === 'lab') {
        // Tiny lab link: rebuild the month from its seed with the generator the lab uses (labMonth.ts).
        const o = parseLabLink(p.value)
        if (!o) r = { ok: false, reason: 'the link is damaged' }
        else {
          try {
            r = validateScenario(buildLabMonth({ compound: await builtInCompound(), bau: await builtInBau() } as never, o))
          } catch { r = { ok: false, reason: 'could not reach Kahati to read the link' } }
        }
      }
      else if (p.json == null) r = { ok: false, reason: 'the link is damaged' }
      else {
        try { r = buildCompact(p.json, await builtInCompound(), await builtInBau()) } catch { r = { ok: false, reason: 'could not reach Kahati to read the link' } }
      }
      return applyScenario(r, !opts?.force)
    },

    getScenarioName() {
      return local.scenario?.compound.compound.displayName ?? null
    },

    async clearScenario() {
      local = { state: null, billConfirmed: false, bau: null, scenario: null }
      save()
    },
  }
}
