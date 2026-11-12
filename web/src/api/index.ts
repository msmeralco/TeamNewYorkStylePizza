import type { KahatiApi } from './client'
import { createHttpApi } from './http'
import { mockApi } from './mock'

// Set VITE_API_URL (e.g. in .env.local or Vercel env) to use the real backend.
// Without it, the app runs on the mock sample compound.
const baseUrl = import.meta.env.VITE_API_URL as string | undefined

export const api: KahatiApi = baseUrl ? createHttpApi(baseUrl.replace(/\/$/, '')) : mockApi
export const usingMock = !baseUrl

export * from './types'
export { ApiError } from './client'
