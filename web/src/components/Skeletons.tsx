import { useRef, type CSSProperties, type ReactNode } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { reduceMotion } from './motion'

/** One grey block. */
export function Sk({ w = '100%', h = 16, r = 8, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <span className="sk" style={{ width: w, height: h, borderRadius: r, ...style }} />
}

/** Screen wrapper that pulses its blocks with a travelling GSAP wave. */
function SkScreen({ children, dark, noNav }: { children: ReactNode; dark?: boolean; noNav?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (reduceMotion()) return
      // Fade in after a beat: fast loads never show a skeleton at all.
      gsap.from(ref.current, { autoAlpha: 0, duration: 0.25, delay: 0.15 })
      gsap.fromTo('.sk', { opacity: 1 }, { opacity: 0.45, duration: 0.7, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: { each: 0.06 } })
    },
    { scope: ref },
  )
  return (
    <div ref={ref} className={`screen${noNav ? ' no-nav' : ''}${dark ? ' sk-dark' : ''}`} aria-busy="true" aria-label="Loading">
      {children}
    </div>
  )
}

const rows = (n: number, chip = false, avatar = 38) =>
  Array.from({ length: n }, (_, i) => (
    <div className="list-row" key={i}>
      <Sk w={avatar} h={avatar} r={avatar} />
      <span className="grow">
        <Sk w="45%" h={15} />
        {chip ? <Sk w={70} h={20} r={10} /> : <Sk w="25%" h={11} />}
      </span>
      {!chip && <Sk w={64} h={15} />}
    </div>
  ))

export function HomeSkeleton() {
  return (
    <SkScreen>
      <Sk w={190} h={34.5} />
      <Sk h={124} r={20} />
      <Sk w={220} h={16} />
      <div className="card list">{rows(4)}</div>
      <Sk h={70} r={20} />
    </SkScreen>
  )
}

export function BillSkeleton({ noNav }: { noNav?: boolean }) {
  return (
    <SkScreen noNav={noNav}>
      <div className="stack-lg">
        <Sk w={230} h={34.5} />
        <Sk w={180} h={46} />
      </div>
      <div className="card" style={{ padding: '20px 20px 4px' }}>
        <Sk h={10} r={4} />
        <div style={{ marginTop: 10 }}>{rows(7, false, 30)}</div>
      </div>
    </SkScreen>
  )
}

export function UsageSkeleton() {
  return (
    <SkScreen>
      <Sk w={220} h={34.5} />
      <div className="row-between"><Sk w={150} h={46} /><Sk w={100} h={28} r={14} /></div>
      <Sk w={210} h={16} />
      <Sk h={160} r={20} />
      <Sk h={86} r={20} />
      <div className="card list">{rows(2, false, 24)}</div>
      <Sk h={54} r={16} />
    </SkScreen>
  )
}

export function CheckSkeleton() {
  return (
    <SkScreen>
      <Sk w={110} h={34.5} />
      <Sk h={128} r={20} />
      <div className="card list">
        {rows(4, true)}
        <div className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <Sk w="75%" h={13} />
          <Sk w="65%" h={13} />
        </div>
      </div>
      <Sk h={54} r={16} />
    </SkScreen>
  )
}

export function TenantSkeleton() {
  return (
    <SkScreen noNav>
      <Sk w={150} h={34.5} />
      <Sk h={124} r={20} />
      <div className="tiles"><Sk h={120} r={20} /><Sk h={120} r={20} /></div>
      <Sk h={70} r={20} />
      <div className="spacer" />
      <Sk h={54} r={16} />
    </SkScreen>
  )
}

export function ScanSkeleton() {
  return (
    <SkScreen dark noNav>
      <Sk w={110} h={4} />
      <Sk w={150} h={34.5} />
      <Sk h="auto" r={24} style={{ flex: 1 }} />
      <Sk h={150} r={20} />
      <Sk h={54} r={16} />
    </SkScreen>
  )
}
