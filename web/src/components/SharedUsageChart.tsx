import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { UsageView } from '../api'
import { day } from '../lib/format'
import { reduceMotion } from './motion'
import { useT } from '../i18n/copy'

const BASE_W = 320
// Shorter than UsageChart's 116: two points need less air. The box height (--chart-h) keeps the same scale.
const H = 80
const PAD = { l: 7.5, r: 7.5, t: 16, b: 24 }
const POINT_R = 5
const END_RING = 1.25
const HALO = { stroke: '#fff', strokeWidth: 4, strokeLinejoin: 'round' as const, paintOrder: 'stroke' }

/**
 * Shared-meter households have one real number (this month's kWh, read on the bill's read date) and one
 * estimate for the next read date. Same look as UsageChart, with exactly those two points and nothing invented.
 */
export function SharedUsageChart({ u, label }: { u: UsageView; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const { t } = useT()
  const [W, setW] = useState(BASE_W)
  const [measured, setMeasured] = useState(false)
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const fit = () => {
      const r = svg.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setW(Math.round((H * r.width) / r.height * 10) / 10)
        setMeasured(true)
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [])

  const limit = u.lifeline?.limitKwh ?? 50
  const f = u.forecast
  // At stage 1 the estimate is "about the same as last month", so this month's actual is the same figure.
  const actual = Math.round(f.kwh)
  const maxY = Math.max(limit + 6, f.high + 3, actual + 3)
  const x0 = PAD.l
  const x1 = W - PAD.r
  const y = (k: number) => H - PAD.b - (k / maxY) * (H - PAD.t - PAD.b)
  const yA = y(actual)
  const yE = y(f.kwh)
  const yL = y(limit)
  // Value labels go on the side of the point away from the lifeline line.
  const below = (k: number) => k <= limit
  // The lifeline label sits on the other side of the line from this month's point (and clear of its ring).
  const lineLow = actual > limit
  const range = f.high - f.low >= 1

  useGSAP(
    () => {
      if (!measured || reduceMotion()) return
      gsap
        .timeline({ delay: 0.25 })
        .from('.dot', { scale: 0, transformOrigin: '50% 50%', duration: 0.3, ease: 'back.out(3)' }, 0.1)
        .from('.proj', { autoAlpha: 0, duration: 0.5 }, 0.3)
        .from('.end', { scale: 0, transformOrigin: '50% 50%', duration: 0.45, ease: 'back.out(3)' }, 0.5)
        .from('.lbl', { autoAlpha: 0, duration: 0.3, stagger: 0.05 }, 0.5)
    },
    { scope: ref, dependencies: [u.householdId, measured] },
  )

  return (
    <div className="card usage-chart" ref={ref}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%', height: 'var(--chart-h)', overflow: 'visible' }}
        role="img"
        aria-label={t('chart.sharedAria', { a: actual, d1: day(u.readDate), n: Math.round(f.kwh), d2: day(u.nextReadDate) })}
      >
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#231F20" strokeOpacity="0.1" />
        <line x1={0} x2={W} y1={yL} y2={yL} stroke="#231F20" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="1 3.5" strokeLinecap="round" />
        <text className="lbl" x={lineLow ? POINT_R * 2 + 6 : 0} y={lineLow ? yL + 17 : yL - 8} fontSize="11" fontWeight="500" fill="#5C5859" {...HALO}>{label}</text>
        <line x1={x0} x2={x0} y1={yA} y2={y(0)} stroke="#231F20" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="1 3.5" strokeLinecap="round" />
        <line x1={x1} x2={x1} y1={yE} y2={y(0)} stroke="#231F20" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="1 3.5" strokeLinecap="round" />
        {range && (
          <line className="proj" x1={x1} x2={x1} y1={y(f.low)} y2={y(f.high)} stroke="#231F20" strokeOpacity="0.8" strokeWidth="1.1" strokeLinecap="round" />
        )}
        <line className="proj" shapeRendering="geometricPrecision" x1={x0} y1={yA} x2={x1} y2={yE} stroke="#231F20" strokeOpacity="0.8" strokeWidth="1.1" strokeDasharray="4 4" strokeLinecap="round" />
        <text className="lbl" x={x0 - POINT_R} y={below(actual) ? yA + 19 : yA - 9} fontSize="11" fontWeight="600" fill="#231F20" {...HALO}>
          {actual} kWh
        </text>
        <text className="lbl" x={x1 + POINT_R} y={below(f.kwh) ? (range ? y(f.low) + 15 : yE + 19) : (range ? y(f.high) - 7 : yE - 9)} fontSize="11" fontWeight="600" textAnchor="end" fill="#231F20" {...HALO}>
          {range ? t('chart.range', { n: Math.round(f.kwh), lo: Math.round(f.low), hi: Math.round(f.high) }) : `${Math.round(f.kwh)} kWh`}
        </text>
        <circle className="dot" cx={x0} cy={yA} r={POINT_R + 2.5} fill="#fff" />
        <circle className="dot" cx={x0} cy={yA} r={POINT_R} fill="#231F20" />
        <circle className="end" cx={x1} cy={yE} r={POINT_R + 2.5} fill="#fff" />
        <circle className="end" cx={x1} cy={yE} r={POINT_R - END_RING / 2} fill="#B7F42A" stroke="#231F20" strokeWidth={END_RING} />
        <g fontSize="10.5" fontWeight="500" fill="#5C5859" {...HALO}>
          <text x={0} y={H - 4}>{day(u.readDate)}</text>
          <text x={W} y={H - 4} textAnchor="end">{day(u.nextReadDate)}</text>
        </g>
      </svg>
    </div>
  )
}
