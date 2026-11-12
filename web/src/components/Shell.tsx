import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ChartLine, House, ReceiptText, ScanLine, ShieldCheck } from 'lucide-react'
import gsap from 'gsap'
import { ICON } from './ui'
import { reduceMotion } from './motion'
import { useT } from '../i18n/copy'

const TABS = [
  { to: '/', label: 'nav.home' as const, Icon: House, match: (p: string) => p === '/' },
  { to: '/scan', label: 'nav.scan' as const, Icon: ScanLine, match: (p: string) => p.startsWith('/scan') },
  { to: '/bill', label: 'nav.bill' as const, Icon: ReceiptText, match: (p: string) => p.startsWith('/bill') },
  { to: '/usage', label: 'nav.usage' as const, Icon: ChartLine, match: (p: string) => p.startsWith('/usage') },
  { to: '/check', label: 'nav.check' as const, Icon: ShieldCheck, match: (p: string) => p.startsWith('/check') },
]

// Notch geometry. The bubble (r 28) sits centred 4px below the bar's top edge;
// the notch is concentric with it, 6px wider, with rounded shoulders.
const BUBBLE_R = 28
const BUBBLE_DROP = 4
const NOTCH_R = BUBBLE_R + 6
const FILLET = 14

/** Bar outline with a smooth circular dip centred at cx (y down, top edge at y=0). */
function notchPath(w: number, h: number, cx: number) {
  const cy = BUBBLE_DROP
  const R = NOTCH_R
  const f = FILLET
  // Fillet circle: tangent to y=0 from below, externally tangent to the notch circle.
  const fy = f
  const dx = Math.sqrt((R + f) ** 2 - (fy - cy) ** 2)
  const k = R / (R + f)
  const px = cx - dx * k
  const py = cy + (fy - cy) * k
  const qx = cx + dx * k
  const r2 = (n: number) => n.toFixed(2)
  return [
    `M0,0`,
    `L${r2(cx - dx)},0`,
    `A${f},${f} 0 0 1 ${r2(px)},${r2(py)}`,
    `A${R},${R} 0 0 0 ${r2(qx)},${r2(py)}`,
    `A${f},${f} 0 0 1 ${r2(cx + dx)},0`,
    `L${w},0 L${w},${h} L0,${h} Z`,
  ].join(' ')
}

function BottomNav({ active }: { active: number }) {
  const { t } = useT()
  const navRef = useRef<HTMLElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(390)
  const [H, setH] = useState(76)
  const pos = useRef<{ cx: number } | null>(null)

  useLayoutEffect(() => {
    const el = navRef.current!
    const measure = () => {
      setW(el.clientWidth)
      setH(el.clientHeight)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  // Icons and labels stay in one layout; GSAP moves them, so nothing snaps.
  const icons = useRef<(HTMLSpanElement | null)[]>([])
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  const bubbleIcon = useRef<HTMLSpanElement>(null)
  const prev = useRef<number | null>(null)
  const [shown, setShown] = useState(active) // icon inside the bubble
  const LABEL_DROP = 4

  // Bubble + notch position (also on resize, without animating).
  useLayoutEffect(() => {
    const target = ((active + 0.5) * w) / TABS.length
    const draw = () => {
      pathRef.current?.setAttribute('d', notchPath(w, H, pos.current!.cx))
      if (bubbleRef.current) gsap.set(bubbleRef.current, { x: pos.current!.cx - BUBBLE_R })
      // Icons give way to the bubble: fade and shrink as it comes near, return as it leaves.
      icons.current.forEach((el, i) => {
        if (!el) return
        const iconX = ((i + 0.5) * w) / TABS.length
        const t = Math.min(1, Math.max(0, (Math.abs(iconX - pos.current!.cx) - (BUBBLE_R + 6)) / 18))
        gsap.set(el, { autoAlpha: t, scale: 0.6 + 0.4 * t })
      })
    }
    if (!pos.current || reduceMotion()) {
      pos.current = { cx: target }
      draw()
      return
    }
    const tw = gsap.to(pos.current, { cx: target, duration: 0.55, ease: 'power3.inOut', onUpdate: draw, overwrite: true })
    return () => {
      tw.kill()
    }
  }, [active, w, H])

  // Hand-off between the old and new tab.
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = active
    if (from === null || from === active || reduceMotion()) {
      labels.current.forEach((el, i) => gsap.set(el, { y: i === active ? LABEL_DROP : 0 }))
      setShown(active)
      return
    }
    const tl = gsap.timeline()
    // Labels ease down under the bubble and back up as it leaves (icons follow the bubble in draw()).
    tl.to(labels.current[active], { y: LABEL_DROP, duration: 0.45, ease: 'power3.out' }, 0.1)
      .to(labels.current[from], { y: 0, duration: 0.45, ease: 'power3.out' }, 0)
      // Bubble icon: shrink out, swap at the midpoint, pop back in with a small settle.
      .to(bubbleIcon.current, { scale: 0.4, autoAlpha: 0, duration: 0.16, ease: 'power2.in' }, 0)
      .add(() => setShown(active), 0.2)
      .to(bubbleIcon.current, { scale: 1, autoAlpha: 1, duration: 0.4, ease: 'back.out(2.4)' }, 0.26)
      .fromTo(bubbleRef.current, { y: 0 }, { y: 4, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1 }, 0.4)
    return () => {
      tl.progress(1).kill()
    }
  }, [active])

  const BubbleIcon = TABS[shown].Icon
  return (
    <nav className="nav" aria-label={t('nav.main')} ref={navRef}>
      <svg className="nav-bar" width="100%" height={H} viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none" aria-hidden>
        <path ref={pathRef} fill="var(--ink)" />
      </svg>
      <div className="nav-items">
        {TABS.map(({ to, label, Icon }, i) => (
          <NavLink key={to} to={to} className={`nav-item${i === active ? ' on' : ''}`} aria-current={i === active ? 'page' : undefined}>
            <span className="nav-icon" ref={(el) => { icons.current[i] = el }}>
              <Icon {...ICON} size={22} />
            </span>
            <span className="nav-label" ref={(el) => { labels.current[i] = el }}>{t(label)}</span>
          </NavLink>
        ))}
      </div>
      {/* Above the icons, so it covers any it passes over. */}
      <div className="bubble" ref={bubbleRef} style={{ top: BUBBLE_DROP - BUBBLE_R }} aria-hidden>
        <span ref={bubbleIcon} style={{ display: 'grid' }}>
          <BubbleIcon {...ICON} size={22} />
        </span>
      </div>
    </nav>
  )
}

/** Light screen with the dark bottom bar. */
export function TabShell() {
  const { pathname } = useLocation()
  const active = Math.max(0, TABS.findIndex((t) => t.match(pathname)))
  return (
    <div className="app">
      <Outlet />
      <BottomNav active={active} />
    </div>
  )
}

/** Full-screen, no bar (scan screens, tenant view). */
export function BareShell({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`app${dark ? ' dark' : ''}`}>
      <Outlet />
    </div>
  )
}
