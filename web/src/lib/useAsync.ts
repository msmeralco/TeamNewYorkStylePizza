import { useCallback, useEffect, useState } from 'react'

// Tiny change bus: after any write, call notifyChange() so open screens refetch.
const listeners = new Set<() => void>()
export function notifyChange() {
  listeners.forEach((l) => l())
}

// Last result per call, so revisiting a tab shows its content at once
// (stale-while-revalidate) instead of flashing a skeleton.
const cache = new Map<string, unknown>()
// Errors too: Bill and Usage show their empty state through a "needs a scan" error, so without this
// they reloaded on every visit while the other tabs showed their cached content at once.
const errors = new Map<string, Error>()

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  reload: () => void
}

/** Runs `fn` on mount, when deps change, and whenever notifyChange() fires. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const key = fn.toString() + JSON.stringify(deps)
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined)
  const [error, setError] = useState<Error | undefined>(() => errors.get(key))
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    listeners.add(reload)
    return () => {
      listeners.delete(reload)
    }
  }, [reload])

  useEffect(() => {
    let alive = true
    setLoading(true)
    if (cache.has(key)) setData(cache.get(key) as T)
    else setData(undefined)
    setError(errors.get(key))
    fn()
      .then((d) => {
        if (!alive) return
        cache.set(key, d)
        errors.delete(key)
        setData(d)
        setError(undefined)
      })
      .catch((e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e))
        errors.set(key, err)
        if (alive) setError(err)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, key])

  return { data, error, loading, reload }
}
