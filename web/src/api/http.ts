import { ApiError, type KahatiApi } from './client'

/**
 * Real backend adapter. Endpoint paths are a proposal; align them with the
 * backend team and change only this file.
 */
export function createHttpApi(baseUrl: string): KahatiApi {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(baseUrl + path, init)
    } catch {
      throw new ApiError('No connection. Check the Wi-Fi or switch to the hotspot.')
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ApiError(text || `Request failed (${res.status})`, res.status)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }
  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const upload = (image: Blob): RequestInit => {
    const form = new FormData()
    form.append('image', image)
    return { method: 'POST', body: form }
  }

  return {
    getMonth: () => call('/month'),
    scanBill: (image) => call('/bill/scan', upload(image)),
    confirmBill: (scan) => call('/bill', json(scan)),
    scanMeter: (id, image) => call(`/households/${id}/scan`, upload(image)),
    confirmReading: (input) => call(`/households/${input.householdId}/readings`, json(input)),
    getShare: (id) => call(`/households/${id}/share`),
    getUsage: (id) => call(`/households/${id}/usage`),
    requestNewPhoto: (ids) => call('/check/request-photo', json({ householdIds: ids })),
    getTenantView: (token) => call(`/t/${encodeURIComponent(token)}`),
    loadSampleReadings: async () => {},
    resetDemo: async () => {},
  }
}
