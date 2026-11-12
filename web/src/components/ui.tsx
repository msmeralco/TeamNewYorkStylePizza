import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ScanLine, CircleAlert, CircleCheck, ShieldCheck } from 'lucide-react'
import gsap from 'gsap'
import { reduceMotion } from './motion'
import { useErrText, useT } from '../i18n/copy'

export const ICON = { size: 18, strokeWidth: 1.75 } as const

export function Footnote({ children }: { children: ReactNode }) {
  return (
    <p className="footnote">
      <ShieldCheck {...ICON} size={16} />
      <span>{children}</span>
    </p>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useT()
  const errText = useErrText()
  return (
    <div className="card state">
      <CircleAlert size={28} strokeWidth={1.75} />
      <div className="body">{errText(error, 'common.error')}</div>
      {onRetry && (
        <button className="btn dark" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  )
}

/** Calm empty state (not an error): a short title, one line, and the primary Scan button. */
export function EmptyState({ title, body, onScan, label }: { title: string; body: string; onScan: () => void; label?: string }) {
  const { t } = useT()
  return (
    <div className="card state empty">
      <h2 className="empty-title">{title}</h2>
      <p className="body">{body}</p>
      {/* Same height as the Usage action buttons (.btn.compact). */}
      <button className="btn compact" onClick={onScan}>
        <span className="btn-label"><ScanLine {...ICON} /> {label ?? t('empty.scan')}</span>
      </button>
    </div>
  )
}

/** Bottom sheet that slides up with GSAP. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const back = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useLayoutEffect(() => {
    if (!mounted || !back.current || !panel.current) return
    const d = reduceMotion() ? 0 : 1
    if (open) {
      gsap.fromTo(back.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 * d })
      gsap.fromTo(panel.current, { yPercent: 100 }, { yPercent: 0, duration: 0.45 * d, ease: 'power3.out' })
    } else {
      gsap.to(panel.current, { yPercent: 100, duration: 0.3 * d, ease: 'power2.in' })
      gsap.to(back.current, { autoAlpha: 0, duration: 0.3 * d, onComplete: () => setMounted(false) })
    }
  }, [open, mounted])

  if (!mounted) return null
  return createPortal(
    <div className="sheet-backdrop" ref={back} onClick={onClose}>
      <div className="sheet" ref={panel} onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="card list">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

// ---- toast ----
let push: ((msg: string) => void) | null = null
export function toast(msg: string) {
  push?.(msg)
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    push = setMsg
    return () => {
      push = null
    }
  }, [])
  useLayoutEffect(() => {
    if (!msg || !ref.current) return
    const el = ref.current
    const tl = gsap
      .timeline()
      // Fades in and out in place (no slide, no bounce).
      .fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' })
      .to(el, { autoAlpha: 0, duration: 0.3, ease: 'power1.in', onComplete: () => setMsg(null) }, '+=2.6')
    return () => {
      tl.kill()
    }
  }, [msg])
  if (!msg) return null
  return (
    <div className="toast" role="status" ref={ref}>
      <CircleCheck {...ICON} />
      {msg}
    </div>
  )
}
