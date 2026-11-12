import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { UsageView } from '../api'
import { day } from '../lib/format'
import { reduceMotion } from './motion'
import { useT } from '../i18n/copy'

interface Tip {
  id: string
  x: number // px inside the card
  y: number
  title: string
  body: string
  align: 'left' | 'center' | 'right'
  below: boolean
}

/** Starting width in SVG units; replaced by the box's real aspect so the chart fills the card. */
const BASE_W = 320
const H = 116
// Lines and the outer labels run edge to edge (same width as the tier bar below); the first and
// last points sit just inside, their white ring (POINT_R + 2.5) touching the edges.
const PAD = { l: 7.5, r: 7.5, t: 16, b: 24 }
// Every point is the same size. Measured points are solid dark; the forecast is lime
// with a dark ring, drawn inside the same outer radius.
const POINT_R = 5
const END_RING = 1.25
// White outline behind text so lines running under a label never cut through it.
const HALO = { stroke: '#fff', strokeWidth: 4, strokeLinejoin: 'round' as const, paintOrder: 'stroke' }

/** Forecast chart with hover (desktop) and tap (phone) details on each point. */
export function UsageChart({ u, label }: { u: UsageView; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const { t } = useT()
  const limitLabel = useRef<SVGTextElement>(null)
  const [labelBelow, setLabelBelow] = useState(false)
  // The SVG box has a set height, so its width in SVG units follows the box's aspect ratio:
  // the drawing fills the card edge to edge (no letterboxing) and circles and text never stretch.
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

  const limit = u.lifeline?.limitKwh
  // Just enough headroom for the highest of the forecast range and the lifeline label.
  const maxY = Math.max(limit != null ? limit + 6 : 0, u.forecast.high + 3)
  const x = (d: number) => PAD.l + (d / u.totalDays) * (W - PAD.l - PAD.r)
  const y = (k: number) => H - PAD.b - (k / maxY) * (H - PAD.t - PAD.b)
  const last = u.points[u.points.length - 1]
  const end = { day: u.totalDays, kwh: u.forecast.kwh }
  const solid = u.points.map((p) => `${x(p.day)},${y(p.kwhUsed)}`).join(' ')
  const area = `M${x(0)},${y(0)} ${u.points.map((p) => `L${x(p.day)},${y(p.kwhUsed)}`).join(' ')} L${x(end.day)},${y(end.kwh)} L${x(end.day)},${y(0)} Z`

  // The photo's kWh label sits above-left of its point unless that would put it on the lifeline line.
  const photoLabelLow = limit != null && Math.abs(y(last.kwhUsed) - 7 - y(limit)) < 12

  // Keep the lifeline label clear of the end point: if its measured box would touch
  // the point (with a little room), move the label under the line instead.
  useLayoutEffect(() => {
    const t = limitLabel.current
    if (!t || limit == null) return
    const b = t.getBBox()
    const right = b.width
    const aboveTop = y(limit) - 8 - b.height
    const r = POINT_R + 6
    const hits = right > x(end.day) - r && y(end.kwh) + r > aboveTop && y(end.kwh) - r < y(limit) - 8 + 3
    setLabelBelow(hits)
  }, [label, limit, end.kwh, end.day]) // eslint-disable-line react-hooks/exhaustive-deps

  // Details for each point.
  const points = [
    ...u.points.map((p) => ({
      id: `p${p.day}`,
      cx: x(p.day),
      cy: y(p.kwhUsed),
      r: POINT_R,
      title: t(p.kind === 'bill' ? 'chart.billReading' : 'chart.photo', { d: day(p.date) }),
      body:
        p.kind === 'bill'
          ? t('chart.start')
          : t('chart.used', { n: p.kwhUsed, days: p.day, r: (p.kwhUsed / p.day).toFixed(1) }),
    })),
    {
      id: 'end',
      cx: x(end.day),
      cy: y(end.kwh),
      r: POINT_R,
      title: t('chart.expected', { d: day(u.nextReadDate) }),
      body:
        t('chart.range', { n: Math.round(end.kwh), lo: Math.round(u.forecast.low), hi: Math.round(u.forecast.high) }) +
        (limit != null && end.kwh > limit ? t('chart.over', { n: Math.round(end.kwh - limit), limit }) : ''),
    },
  ]

  function show(p: (typeof points)[number]) {
    const svg = svgRef.current
    const card = ref.current
    if (!svg || !card) return
    // SVG units -> pixels inside the card (handles any scaling of the SVG).
    const m = svg.getScreenCTM()
    if (!m) return
    const pt = new DOMPoint(p.cx, p.cy).matrixTransform(m)
    const box = card.getBoundingClientRect()
    const px = pt.x - box.left
    const py = pt.y - box.top
    setTip({
      id: p.id,
      x: px,
      y: py,
      title: p.title,
      body: p.body,
      align: px < box.width * 0.3 ? 'left' : px > box.width * 0.7 ? 'right' : 'center',
      below: py < box.height * 0.45,
    })
  }

  // Pop the tooltip in.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current || reduceMotion()) return
    gsap.fromTo(tipRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' })
  }, [tip?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Grow the hovered point.
  useGSAP(
    () => {
      gsap.to('.pt', { scale: (_i, el: Element) => (el.getAttribute('data-id') === tip?.id ? 1.45 : 1), transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' })
    },
    { scope: ref, dependencies: [tip?.id] },
  )

  // Draw the real line, then the projection, then pop the end point (once the width is known).
  useGSAP(
    () => {
      if (!measured || reduceMotion()) return
      const line = ref.current!.querySelector<SVGPolylineElement>('.solid')!
      const len = line.getTotalLength()
      gsap
        .timeline({ delay: 0.25 })
        .from('.area', { autoAlpha: 0, duration: 0.6 })
        .fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut', clearProps: 'strokeDasharray,strokeDashoffset' }, 0)
        .from('.dot', { scale: 0, transformOrigin: '50% 50%', duration: 0.3, stagger: 0.15, ease: 'back.out(3)' }, 0.2)
        .from('.proj', { autoAlpha: 0, duration: 0.5 }, '-=0.1')
        .from('.end', { scale: 0, transformOrigin: '50% 50%', duration: 0.45, ease: 'back.out(3)' }, '-=0.2')
        .from('.lbl', { autoAlpha: 0, duration: 0.3, stagger: 0.05 }, '-=0.3')
    },
    { scope: ref, dependencies: [u.householdId, measured] },
  )

  return (
    <div className="card usage-chart" ref={ref} onPointerLeave={() => setTip(null)} onClick={() => setTip(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', width: '100%', height: 'var(--chart-h)', overflow: 'visible' }}
        role="img"
        aria-label={t('chart.aria', { n: Math.round(end.kwh), d: day(u.nextReadDate) })}
      >
        <defs>
          <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#B7F42A" stopOpacity="0.55" />
            <stop offset="1" stopColor="#B7F42A" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path className="area" d={area} fill="url(#fill)" />
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="#231F20" strokeOpacity="0.1" />
        {limit != null && (
          <>
            {/* Quiet reference line: light, thin, full width; the end point's white ring covers the join. */}
            <line x1={0} x2={W} y1={y(limit)} y2={y(limit)} stroke="#231F20" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="1 3.5" strokeLinecap="round" />
            <text ref={limitLabel} className="lbl" x={0} y={labelBelow ? y(limit) + 15 : y(limit) - 8} fontSize="11" fontWeight="500" fill="#5C5859" {...HALO}>{label}</text>
          </>
        )}
        <line x1={x(last.day)} x2={x(last.day)} y1={y(last.kwhUsed)} y2={y(0)} stroke="#231F20" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="1 3.5" strokeLinecap="round" />
        <polyline className="solid" points={solid} fill="none" stroke="#231F20" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" shapeRendering="geometricPrecision" />
        <line className="proj" shapeRendering="geometricPrecision" x1={x(last.day)} y1={y(last.kwhUsed)} x2={x(end.day)} y2={y(end.kwh)} stroke="#231F20" strokeOpacity="0.8" strokeWidth="1.1" strokeDasharray="4 4" strokeLinecap="round" />
        {last.day > 0 && (
          <text className="lbl" x={x(last.day) + (photoLabelLow ? 8 : -8)} y={photoLabelLow ? y(last.kwhUsed) + 16 : y(last.kwhUsed) - 7} fontSize="11" fontWeight="600" textAnchor={photoLabelLow ? 'start' : 'end'} fill="#231F20" {...HALO}>
            {last.kwhUsed} kWh
          </text>
        )}
        {points.map((p) => (
          <g key={p.id}>
            {/* White ring so the dotted and dashed lines pass behind the point, not through it. */}
            <circle className={`${p.id === 'end' ? 'end' : 'dot'} pt`} data-id={p.id} cx={p.cx} cy={p.cy} r={p.r + 2.5} fill="#fff" />
            {p.id === 'end' ? (
              <circle className="end pt" data-id={p.id} cx={p.cx} cy={p.cy} r={p.r - END_RING / 2} fill="#B7F42A" stroke="#231F20" strokeWidth={END_RING} />
            ) : (
              <circle className="dot pt" data-id={p.id} cx={p.cx} cy={p.cy} r={p.r} fill="#231F20" />
            )}
            {/* Bigger invisible target for fingers and the mouse. */}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={26} /* at least 44px on screen, also when the chart shrinks on short phones */
              fill="transparent"
              style={{ cursor: 'pointer' }}
              tabIndex={0}
              role="button"
              aria-label={`${p.title}. ${p.body}`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && show(p)}
              onFocus={() => show(p)}
              onBlur={() => setTip(null)}
              onClick={(e) => {
                e.stopPropagation()
                if (tip?.id === p.id) setTip(null)
                else show(p)
              }}
            />
          </g>
        ))}
        <g fontSize="10.5" fontWeight="500" fill="#5C5859" {...HALO}>
          <text x={0} y={H - 4}>{t('chart.billAxis', { d: day(u.readDate) })}</text>
          {last.day > 0 && <text x={x(last.day)} y={H - 4} textAnchor="middle">{t('chart.photoAxis', { n: last.day })}</text>}
          <text x={W} y={H - 4} textAnchor="end">{day(u.nextReadDate)}</text>
        </g>
      </svg>

      {tip && (
        // Outer box positions (CSS translate); inner box animates (GSAP transform).
        <div className={`chart-tip-anchor ${tip.align}${tip.below ? ' below' : ''}`} style={{ left: tip.x, top: tip.y }}>
          <div ref={tipRef} className="chart-tip" role="tooltip">
            <span className="chart-tip-title">{tip.title}</span>
            <span>{tip.body}</span>
          </div>
        </div>
      )}
    </div>
  )
}
