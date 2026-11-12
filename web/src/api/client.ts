import type {
  AskAnswer,
  AskInput,
  AskPreset,
  Bill,
  BillScan,
  MeterScan,
  MonthView,
  Reading,
  ReadingSource,
  Share,
  TenantView,
  UsageView,
} from './types'

/**
 * Everything the screens need from the backend. The mock adapter implements
 * this against the sample compound; the HTTP adapter calls the real API.
 */
export interface KahatiApi {
  getMonth(): Promise<MonthView>
  scanBill(image: Blob): Promise<BillScan>
  confirmBill(scan: BillScan): Promise<Bill>
  scanMeter(householdId: string, image: Blob): Promise<MeterScan>
  confirmReading(input: {
    householdId: string
    value: number
    source: ReadingSource
    capturedAt: string
    /** Photo reads: the model's confidence and the serial it read. Typed readings omit both. */
    confidence?: number
    serialRead?: string | null
  }): Promise<Reading>
  /** Organizer: throws ApiError code 'needs_scan' until the bill and all four readings are in. `tenant: true` (tenant screens) falls back to the sample split. */
  getShare(householdId: string, opts?: { tenant?: boolean }): Promise<Share & { name: string }>
  /** Throws ApiError code 'needs_scan' until this household's readings exist (Bautista: until his meter is scanned). */
  getUsage(householdId: string): Promise<UsageView>
  requestNewPhoto(householdIds: string[]): Promise<void>
  getTenantView(token: string): Promise<TenantView>
  /** Organizer: a signed tenant link for one household. */
  createTenantLink(householdId: string): Promise<{ url: string; expiresAt: string }>
  /** Ask Kahati: preset buttons for the chat. */
  getAskPresets(language?: 'en' | 'fil'): Promise<AskPreset[]>
  /** Ask Kahati: a grounded answer about one household's numbers. */
  ask(input: AskInput): Promise<AskAnswer>
  /** Demo helper: fills the readings the active sample has. `loaded` counts what it filled; `missing` what is still empty (nothing is invented). */
  loadSampleReadings(): Promise<{ loaded: number; missing: number }>
  /** Digit-fix demo: all readings as photos, one misread at low confidence (built-in sample only). */
  loadMisreadDemo(): Promise<{ ok: boolean; reason?: 'no_bill' | 'not_sample' }>
  resetDemo(): Promise<void>
  /** Bautista's own meter, from the active sample or scenario (serial and the bill's read-day reading). */
  getOwnMeter(): Promise<{ name: string; meterSerial: string; previousReading: number }>
  /** Startup: imports `#scenario=` from the URL hash if present (and removes the hash). Null when there is none. */
  importScenarioFromHash(): ScenarioImport | null
  /** Imports a scenario link (full URL or hash: #s2=, #scenarioz= or #scenario=): validates, stores and resets this month. `unchanged` means that scenario was already active, so nothing was reset. */
  importScenarioLink(link: string, opts?: { force?: boolean }): Promise<ScenarioImport>
  /** Display name of the active lab scenario, or null when the built-in sample is in use. */
  getScenarioName(): string | null
  /** Drops the scenario and resets the demo to the built-in sample. */
  clearScenario(): Promise<void>
}

export type ScenarioImport = { ok: true; name: string; unchanged?: boolean } | { ok: false; reason: string }

export class ApiError extends Error {
  status: number
  /** Stable code the UI translates (err.<code> in i18n/copy.tsx). Includes 'needs_scan' (409): nothing to show until a scan. */
  code?: string
  constructor(message: string, status = 0, code?: string) {
    super(message)
    this.code = code
    this.status = status
  }
}
