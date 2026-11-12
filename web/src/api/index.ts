import type { KahatiApi } from './client'
import { createHttpApi } from './http'
import { mockApi } from './mock'

// Set VITE_API_URL (e.g. in .env.local or Vercel env) to use the real backend.
// Without it, the app runs on the mock sample compound.
const baseUrl = import.meta.env.VITE_API_URL as string | undefined

const base: KahatiApi = baseUrl ? createHttpApi(baseUrl.replace(/\/$/, '')) : mockApi

const EMPTY_KEY = 'kahati-month-empty'
/**
 * Whether the last month the app loaded had no bill yet. True before any month has loaded (a new
 * user's initial state). Loading screens use it to show a skeleton shaped like what will appear.
 */
export const monthLooksEmpty = () => {
  try { return localStorage.getItem(EMPTY_KEY) !== '0' } catch { return true }
}

export const api: KahatiApi = {
  ...base,
  async getMonth() {
    const m = await base.getMonth()
    try { localStorage.setItem(EMPTY_KEY, m.bill ? '0' : '1') } catch { /* storage unavailable */ }
    return m
  },
}
export const usingMock = !baseUrl
/** Shortcut buttons like "Use the sample bill (mock)": local dev server only, never in a deployed build. */
export const showDevTools = usingMock && import.meta.env.DEV

export * from './types'
export { ApiError } from './client'
