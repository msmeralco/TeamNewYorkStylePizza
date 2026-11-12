import { ApiError, type KahatiApi } from './client'
import type {
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
  households: { householdId: string; kwh: number; chip: string; flags: string[]; suggestion?: { to: string } | null }[]
  gapRule: string | null
}
interface BForecast {
  stage: 1 | 2 | 3; readDate: string; kwh: number; low: number; high: number
  points: { date: string; day: number; kwhUsed: number; kind: 'bill' | 'photo' | 'projection' }[]
  rate: { perKwh: number; month: string; isFallback: boolean; note: string | null }
  lifeline: null | { forecastPeso: number; underLinePeso: number }
  perKwhValue: number | null
  spike: null | { percentAbove: number }
  actions: string[]
}
interface BTenant {
  household: { id: string; displayName: string; label: string }
  share: BShare
  rateCheck: null | { askedAmount: number; aboveBy: number }
  perKwhValue: number
  expiresAt: string
}

const LINE_ORDER: LineKey[] = ['generation', 'transmission', 'systemLoss', 'distribution', 'supplyMetering', 'taxes', 'other']
const toB = (id: string) => (id === 'BAU' ? 'hBautista' : `h${id}`)
const toF = (id: string) => (id === 'hBautista' ? 'BAU' : id.replace(/^h/, ''))
/** Sample persona names used by the design for the tenant view. */
const TENANT_FIRST_NAMES: Record<string, string> = { B: 'Lorna' }
/** The demo tenant link in the design ("/t/demo-santos") mints a real signed link. */
const DEMO_TOKENS: Record<string, string> = { 'demo-santos': 'hB' }
const RATE_SOURCE = 'Meralco rate announcement (team rate table)'

/**
 * Demo clock. The sample bill is dated 31 Oct 2026, so a reading confirmed today
 * would be pro-rated back to that date by the read-date alignment check. While the
 * demo clock is on (the default), confirmed readings are stamped on the bill's read
 * date. Set VITE_DEMO_CLOCK=off for real use with current bills.
 */
const DEMO_CLOCK = (import.meta.env.VITE_DEMO_CLOCK as string | undefined) !== 'off'

const KEY = 'kahati-http-v1'
interface Local { state: BState | null; billConfirmed: boolean }

export function createHttpApi(baseUrl: string): KahatiApi {
  // ---------- transport ----------
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(baseUrl + path, init)
    } catch {
      throw new ApiError('No connection. Check the Wi-Fi or switch to the hotspot.')
    }
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      let msg = text || `Request failed (${res.status})`
      try {
        const e = JSON.parse(text) as { error?: { message?: string; next?: string } }
        if (e.error?.message) msg = e.error.next ? `${e.error.message} ${e.error.next}` : e.error.message
      } catch {
        /* plain text */
      }
      throw new ApiError(msg, res.status)
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
  async function sample(): Promise<BState> {
    if (!sampleCache) sampleCache = await call<BState>('/api/sample?which=compound')
    return structuredClone(sampleCache)
  }
  /** Working state: the sample compound with this month's readings cleared until scanned. */
  async function state(): Promise<BState> {
    if (!local.state) {
      const s = await sample()
      s.currentReadings = []
      local = { state: s, billConfirmed: false }
      save()
    }
    return local.state!
  }
  const meterOf = (s: BState, hid: string) => s.meters.find((m) => m.householdId === hid)
  const prevOf = (s: BState, meterId: string) => s.previousReadings.find((r) => r.meterId === meterId)
  const currOf = (s: BState, meterId: string) => s.currentReadings.find((r) => r.meterId === meterId)
  const allIn = (s: BState) => s.households.every((h) => { const m = meterOf(s, h.id); return !!m && !!currOf(s, m.id) })

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

  async function tenantFromToken(token: string): Promise<BTenant> {
    const demoHid = DEMO_TOKENS[token]
    if (!demoHid) return call<BTenant>(`/api/tenant/${encodeURIComponent(token)}`)
    // Demo link: use this month's split if complete, else the sample compound.
    const s = await state()
    const src = local.billConfirmed && allIn(s) ? s : await sample()
    const link = await post<{ token: string }>('/api/tenant-link', { state: src, householdId: demoHid })
    return call<BTenant>(`/api/tenant/${encodeURIComponent(link.token)}`)
  }

  // ---------- KahatiApi ----------
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
          id: toF(h.id), label: h.label, name: h.displayName, meterKind: 'sub',
          meterSerial: m?.serial ?? '', previousReading: (m && prevOf(s, m.id)?.value) ?? 0,
          reading: toReading(s, h.id, ck?.kwh),
          share: sh ? toShare(sh) : undefined,
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
      const r = await post<{ scan: BBill & { confidence: number } }>('/api/scan/bill', await toDataUrl(image))
      const sc = r.scan
      return {
        periodStart: sc.periodStart, periodEnd: sc.periodEnd, readDate: sc.readDate, nextReadDate: sc.nextReadDate,
        kwh: sc.kwh, amount: sc.amount, fixedCharges: sc.fixedCharges, lines: billLines(sc),
        accountLast4: sc.accountLast4, presentReading: sc.presentReading ?? undefined, confidence: sc.confidence,
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
      const s = await state()
      const hid = toB(householdId)
      const m = meterOf(s, hid)
      if (!m) throw new ApiError('Unknown household', 404)
      const previous = prevOf(s, m.id)
      const r = await post<{
        scan: { value: number; serial: string | null; confidence: number }
        validation: { ok: boolean; kwhSinceLast: number | null; serialMatches: boolean | null }
      }>('/api/scan/meter', { ...(await toDataUrl(image)), meter: m, previous, hint: m.serial })
      return {
        householdId,
        value: r.scan.value,
        kwhSinceLast: r.validation.kwhSinceLast ?? (previous ? r.scan.value - previous.value : 0),
        serial: r.scan.serial ?? '',
        serialMatches: r.validation.serialMatches === true,
        confidence: r.scan.confidence,
        capturedAt: new Date().toISOString(),
        needsSecondLook: !r.validation.ok,
      }
    },

    async confirmReading({ householdId, value, source, capturedAt }): Promise<Reading> {
      const s = await state()
      const hid = toB(householdId)
      const m = meterOf(s, hid)
      if (!m) throw new ApiError('Unknown household', 404)
      const p = prevOf(s, m.id)
      if (p && value < p.value) throw new ApiError("This reading is below last month's. Check the number.", 422)
      s.currentReadings = s.currentReadings.filter((r) => r.meterId !== m.id)
      s.currentReadings.push({
        id: `r-${m.id}-${Date.now()}`, meterId: m.id, value, source,
        capturedAt: DEMO_CLOCK ? `${s.bill.readDate}T09:00:00+08:00` : capturedAt,
        confidence: source === 'photo' ? 0.95 : null, confirmed: true, serialRead: source === 'photo' ? m.serial : null,
      })
      save()
      return toReading(s, hid)!
    },

    async getShare(householdId) {
      const s = await state()
      const hid = toB(householdId)
      // Tenant view before this month's split exists: show the sample split, like the demo link does.
      const src = local.billConfirmed && allIn(s) ? s : await sample()
      const split = await post<BSplit>('/api/split', { state: src })
      const sh = split.shares.find((x) => x.householdId === hid)
      if (!sh) throw new ApiError('Unknown household', 404)
      const name = src.households.find((h) => h.id === hid)?.displayName ?? householdId
      return { ...toShare(sh), name }
    },

    async getUsage(householdId): Promise<UsageView> {
      const own = householdId === 'BAU'
      const s = own
        ? await call<BState>('/api/sample?which=bautista')
        : await (async () => { const w = await state(); return local.billConfirmed && allIn(w) ? w : sample() })()
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
        lifeline: f.lifeline ? { limitKwh: 50, pesoAtForecast: f.lifeline.forecastPeso, pesoUnderLimit: f.lifeline.underLinePeso } : undefined,
        perKwhValue: f.perKwhValue ?? undefined,
        rate: { perKwh: f.rate.perKwh, month: monthLabel(f.rate.month), source: RATE_SOURCE, isFallback: f.rate.isFallback, fallbackNote: f.rate.note ?? undefined },
        spikePct: f.spike?.percentAbove,
        actions: f.actions.slice(0, 3).map((text) => ({ icon: actionIcon(text), text })),
      }
    },

    // The backend has no messaging; the household is asked in person for now.
    async requestNewPhoto() {},

    async getTenantView(token): Promise<TenantView> {
      const v = await tenantFromToken(token)
      const fid = toF(v.household.id)
      return {
        householdId: fid,
        name: TENANT_FIRST_NAMES[fid] ?? v.household.displayName,
        share: v.share.amount,
        kwh: v.share.kwh,
        askedToPay: v.rateCheck?.askedAmount ?? null,
        aboveBillRate: v.rateCheck?.aboveBy ?? null,
        perKwhValue: v.perKwhValue,
        expiresAt: v.expiresAt,
      }
    },

    async loadSampleReadings() {
      const s = await state()
      const full = await sample()
      for (const r of full.currentReadings) {
        if (!currOf(s, r.meterId)) s.currentReadings.push({ ...r, capturedAt: s.bill.readDate + 'T09:00:00+08:00' })
      }
      save()
    },

    async resetDemo() {
      local = { state: null, billConfirmed: false }
      save()
    },
  }
}
