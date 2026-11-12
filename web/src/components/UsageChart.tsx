import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import type { UsageView } from '../api'
import { day } from '../lib/format'
import { reduceMotion } from './motion'

interface Tip {
  id: string
  x: number // px inside the card
  y: number
  title: string
  body: string
  align: 'left' | 'center' | 'right'
  below: boolean
}

const W = 320
const H = 132
const PAD = { l: 8, r: 14, t: 16, b: 24 }

/** Forecast chart with hover (desktop) and tap (phone) details on each point. */
export function UsageChart({ u, label }: { u: UsageView; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  const limit = u.lifeline?.limitKwh
  // Just enough headroom for the highest of the forecast range and the lifeline label.
  const maxY = Math.max(limit != null ? limit + 6 : 0, u.forecast.high + 3)
  const x = (d: number) => PAD.l + (d / u.totalDays) * (W - PAD.l - PAD.r)
  const y = (k: number) => H - PAD.b - (k / maxY) * (H - PAD.t - PAD.b)
  const last = u.points[u.points.length - 1]
  const end = { day: u.totalDays, kwh: u.forecast.kwh }
  const solid = u.points.map((p) => `${x(p.day)},${y(p.kwhUsed)}`).join(' ')
  const area = `M${x(0)},${y(0)} ${u.points.map((p) => `L${x(p.day)},${y(p.kwhUsed)}`).join(' ')} L${x(end.day)},${y(end.kwh)} L${x(end.day)},${y(0)} Z`

  // Details for each point.
  const points = [
    ...u.points.map((p) => ({
      id: `p${p.day}`,
      cx: x(p.day),
      cy: y(p.kwhUsed),
      r: 4,
      title: p.kind === 'bill' ? `${day(p.date)} · Bill reading` : `${day(p.date)} · Meter photo`,
      body:
        p.kind === 'bill'
          ? 'Start of the month: 0 kWh used'
          : `${p.kwhUsed} kWh used in ${p.day} days, about ${(p.kwhUsed / p.day).toFixed(1)} kWh a day`,
    })),
    {
      id: 'end',
      cx: x(end.day),
      cy: y(end.kwh),
      r: 6,
      title: `${day(u.nextReadDate)} · Expected`,
      body:
        `${Math.round(end.kwh)} kWh (${Math.round(u.forecast.low)} to ${Math.round(u.forecast.high)})` +
        (limit != null && end.kwh > limit ? `, about ${Math.round(end.kwh - limit)} kWh over the ${limit} kWh line` : ''),
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

  // Draw the real line, then the projection, then pop the end point.
  useGSAP(
    () => {
      if (reduceMotion()) return
      const line = ref.current!.querySelector<SVGPolylineElement>('.solid')!
      const len = line.getTotalLength()
      gsap
        .timeline({ delay: 0.25 })
        .from('.area', { autoAlpha: 0, duration: 0.6 })
        .fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut' }, 0)
        .from('.dot', { scale: 0, transformOrigin: '50% 50%', duration: 0.3, stagger: 0.15, ease: 'back.out(3)' }, 0.2)
        .from('.proj', { autoAlpha: 0, duration: 0.5 }, '-=0.1')
        .from('.end', { scale: 0, transformOrigin: '50% 50%', duration: 0.45, ease: 'back.out(3)' }, '-=0.2')
        .from('.lbl', { autoAlpha: 0, duration: 0.3, stagger: 0.05 }, '-=0.3')
    },
    { scope: ref, dependencies: [u.householdId] },
  )

  return (
    <div className="card usage-chart" ref={ref} onPointerLeave={() => setTip(null)} onClick={() => setTip(null)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', maxHeight: '22dvh', overflow: 'visible' }}
        role="img"
        aria-label={`Forecast ${Math.round(end.kwh)} kWh by ${day(u.nextReadDate)}`}
      >
        <defs>
          <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#B7F42A" stopOpacity="0.55" />
            <stop offset="1" stopColor="#B7F42A" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path className="area" d={area} fill="url(#fill)" />
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="#231F20" strokeOpacity="0.1" />
        {limit != null && (
          <>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(limit)} y2={y(limit)} stroke="#231F20" strokeWidth="1.5" strokeDasharray="1.5 4" strokeLinecap="round" />
            <text className="lbl" x={PAD.l + 4} y={y(limit) - 8} fontSize="11" fontWeight="600" fill="#231F20">{label}</text>
          </>
        )}
        <line x1={x(last.day)} x2={x(last.day)} y1={y(last.kwhUsed)} y2={y(0)} stroke="#231F20" strokeOpacity="0.15" strokeDasharray="2 3" />
        <polyline className="solid" points={solid} fill="none" stroke="#231F20" strokeWidth="2.25" strokeLinecap="round" />
        <line className="proj" x1={x(last.day)} y1={y(last.kwhUsed)} x2={x(end.day)} y2={y(end.kwh)} stroke="#231F20" strokeWidth="2" strokeDasharray="5 4" />
        {last.day > 0 && (
          <text className="lbl" x={x(last.day) - 6} y={y(last.kwhUsed) - 10} fontSize="11" fontWeight="600" textAnchor="end" fill="#231F20">
            {last.kwhUsed} kWh
          </text>
        )}
        {points.map((p) => (
          <g key={p.id}>
            {p.id === 'end' ? (
              <circle className="end pt" data-id={p.id} cx={p.cx} cy={p.cy} r={p.r} fill="#B7F42A" stroke="#231F20" strokeWidth="1.5" />
            ) : (
              <circle className="dot pt" data-id={p.id} cx={p.cx} cy={p.cy} r={p.r} fill="#231F20" />
            )}
            {/* Bigger invisible target for fingers and the mouse. */}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={16}
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
        <g fontSize="10.5" fontWeight="500" fill="#5C5859">
          <text x={PAD.l} y={H - 4}>{day(u.readDate)} bill</text>
          {last.day > 0 && <text x={x(last.day)} y={H - 4} textAnchor="middle">Day {last.day} photo</text>}
          <text x={W - PAD.r + 8} y={H - 4} textAnchor="end">{day(u.nextReadDate)}</text>
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
