import type {
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
  /** Demo helpers (mock only; the HTTP adapter may no-op). */
  loadSampleReadings(): Promise<void>
  resetDemo(): Promise<void>
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}
