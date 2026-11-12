import { useEffect, useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

export const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Staggers a screen's direct children in once its data is ready, then the
 * rows inside its lists. Pass the screen element as scope.
 */
export function useReveal(scope: RefObject<HTMLElement | null>, ready: boolean, key?: unknown) {
  useGSAP(
    () => {
      if (!ready || !scope.current || reduceMotion()) return
      const kids = Array.from(scope.current.children)
      // Everything is anchored at its final position: fade in only, no movement.
      gsap.from(kids, { autoAlpha: 0, duration: 0.45, stagger: 0.05, ease: 'power1.out', clearProps: 'opacity,visibility' })
      const rows = scope.current.querySelectorAll('.list-row, .kv, .tile')
      if (rows.length)
        gsap.from(rows, { autoAlpha: 0, duration: 0.35, stagger: 0.04, delay: 0.12, ease: 'power1.out', clearProps: 'opacity,visibility' })
    },
    { scope, dependencies: [ready, key] },
  )
}

/** Tweens a number into place. Starts from 0 on first show, then from the previous value. */
export function CountUp({ value, format, duration = 0.9 }: { value: number; format: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion()) {
      el.textContent = format(value)
      from.current = value
      return
    }
    const o = { v: from.current }
    const tw = gsap.to(o, {
      v: value,
      duration,
      ease: 'power3.out',
      onUpdate: () => {
        el.textContent = format(o.v)
      },
      onComplete: () => {
        from.current = value
      },
    })
    return () => {
      tw.kill()
      from.current = o.v
    }
  }, [value, format, duration])
  return <span ref={ref}>{format(from.current)}</span>
}

/** Animates a bar's width (0 → pct) whenever pct changes. */
export function GrowBar({ pct }: { pct: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    gsap.to(ref.current, { width: `${pct}%`, duration: reduceMotion() ? 0 : 0.7, ease: 'power2.inOut', delay: 0.15, overwrite: true })
  }, [pct])
  return (
    <div className="bar">
      <div ref={ref} style={{ width: 0 }} />
    </div>
  )
}
