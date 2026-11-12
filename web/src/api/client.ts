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
  }): Promise<Reading>
  getShare(householdId: string): Promise<Share & { name: string }>
  getUsage(householdId: string): Promise<UsageView>
  requestNewPhoto(householdIds: string[]): Promise<void>
  getTenantView(token: string): Promise<TenantView>
  /** Ask Kahati: preset buttons for the chat. */
  getAskPresets(language?: 'en' | 'fil'): Promise<AskPreset[]>
  /** Ask Kahati: a grounded answer about one household's numbers. */
  ask(input: AskInput): Promise<AskAnswer>
  /** Demo helpers (mock only; the HTTP adapter may no-op). */
  loadSampleReadings(): Promise<void>
  resetDemo(): Promise<void>
}

export class ApiError extends Error {
  status: number
  /** Stable code the UI translates (err.<code> in i18n/copy.tsx). */
  code?: string
  constructor(message: string, status = 0, code?: string) {
    super(message)
    this.code = code
    this.status = status
  }
}
