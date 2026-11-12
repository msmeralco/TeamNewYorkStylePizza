import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Routes, useLocation, useNavigate, type Location } from 'react-router-dom'
import gsap from 'gsap'
import { reduceMotion } from './motion'

export const isScanPath = (p: string) => p === '/scan' || p.startsWith('/scan/')

const Ctx = createContext<{ close: () => void }>({ close: () => {} })

/** Close the scan sheet and go back to the tab it was opened from. */
export const useCloseScan = () => useContext(Ctx).close

/**
 * Scan opens as a full-screen sheet that slides up over the current tab and
 * back down when closed, so the tab bar is covered rather than removed.
 * `children` are the scan <Route>s; `background` is the tab underneath.
 */
export function ScanOverlay({ children, background }: { children: ReactNode; background: Location | { pathname: string } }) {
  const loc = useLocation()
  const navigate = useNavigate()
  const open = isScanPath(loc.pathname)
  const [mounted, setMounted] = useState(open)
  const lastScanLoc = useRef<Location | null>(open ? loc : null)
  if (open) lastScanLoc.current = loc
  const sheet = useRef<HTMLDivElement>(null)
  const shade = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(false)

  if (open && !mounted) setMounted(true)

  useLayoutEffect(() => {
    if (!mounted || !sheet.current) return
    const d = reduceMotion() ? 0 : 1
    if (open && !wasOpen.current) {
      wasOpen.current = true
      const tl = gsap.timeline()
      tl.fromTo(shade.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 * d })
        .fromTo(
          sheet.current,
          { yPercent: 100, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
          { yPercent: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, duration: 0.55 * d, ease: 'power3.out' },
          0,
        )
      return
    }
    if (!open && wasOpen.current) {
      wasOpen.current = false
      const tl = gsap.timeline({ onComplete: () => setMounted(false) })
      tl.to(sheet.current, { yPercent: 100, borderTopLeftRadius: 28, borderTopRightRadius: 28, duration: 0.45 * d, ease: 'power3.in' }).to(
        shade.current,
        { autoAlpha: 0, duration: 0.3 * d },
        '-=0.2',
      )
    }
  }, [open, mounted])

  const close = () => navigate(background.pathname)

  if (!mounted || !lastScanLoc.current) return null
  return (
    <Ctx.Provider value={{ close }}>
      <div className="scan-shade" ref={shade} />
      <div className="scan-overlay app dark" ref={sheet}>
        {/* While sliding away it keeps showing the last scan screen. */}
        <Routes location={lastScanLoc.current}>{children}</Routes>
      </div>
    </Ctx.Provider>
  )
}
