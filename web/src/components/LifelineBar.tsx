import { useRef } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useT } from '../i18n/copy'
import { LIFELINE_TIERS_2026, lifelineDiscount, type LifelineTier } from '../lib/lifeline'
import { reduceMotion } from './motion'

// Soft fills: a pale lime for the free tier, then light warm greys that darken a
// little per tier. Dark text on all of them stays well above 4.5:1.
const FILLS = [
  { bg: 'rgba(183, 244, 42, 0.55)', fg: 'var(--ink)' },
  { bg: '#ECEAE6', fg: 'var(--soft-on-white)' },
  { bg: '#E0DDD9', fg: 'var(--soft-on-white)' },
]
const NONE = { bg: '#D0CDC9', fg: 'var(--ink)' }

/**
 * The 4Ps lifeline discount as a to-scale bar of kWh tiers, with a marker at
 * this month's forecast. Own-meter households only.
 */
export function LifelineBar({ forecastKwh, tiers = LIFELINE_TIERS_2026 }: { forecastKwh: number; tiers?: LifelineTier[] }) {
  const { t } = useT()
  const ref = useRef<HTMLDivElement>(null)
  const last = tiers[tiers.length - 1].upTo
  // Room past the last tier for the "no discount" zone, and for a forecast beyond it.
  const max = Math.max(Math.round(last * 1.5), Math.ceil((forecastKwh * 1.15) / 10) * 10)
  const pct = (kwh: number) => (Math.min(kwh, max) / max) * 100

  const segments = [
    ...tiers.map((tier, i) => ({
      from: i === 0 ? 0 : tiers[i - 1].upTo,
      to: tier.upTo,
      label: t('tier.off', { n: tier.pctOff }),
      short: `${tier.pctOff}%`,
      ...FILLS[Math.min(i, FILLS.length - 1)],
    })),
    { from: last, to: max, label: t('tier.none'), short: t('tier.none'), ...NONE },
  ]
  const ticks = [0, ...tiers.map((x) => x.upTo)]
  const shown = Math.round(forecastKwh)
  const off = Math.round(lifelineDiscount(shown, tiers) * 100)

  // Sweep the bar in from the left (segments keep their size), then show the marker.
  useGSAP(
    () => {
      if (reduceMotion()) return
      gsap
        .timeline({ delay: 0.15 })
        .fromTo('.tier-bar', { clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0% 0 0 round 999px)', duration: 0.7, ease: 'power2.inOut', clearProps: 'clipPath' })
        .from('.tier-marker', { autoAlpha: 0, duration: 0.25, ease: 'power1.out' }, '-=0.2')
    },
    { scope: ref, dependencies: [forecastKwh] },
  )

  return (
    <div className="tier" ref={ref} role="img" aria-label={t('tier.aria', { n: shown, p: off })}>
      <div className="tier-track">
        <div className="tier-marker" style={{ left: `${pct(forecastKwh)}%` }}>
          <span className="tier-marker-label">{t('tier.marker', { n: shown })}</span>
          <i />
        </div>
        <div className="tier-bar">
          {segments.map((s) => {
            const w = ((s.to - s.from) / max) * 100
            return (
              <div key={s.from} className="tier-seg" style={{ width: `${w}%`, background: s.bg, color: s.fg }}>
                {/* Narrow tiers show just the percent. */}
                <span>{w > 22 ? s.label : s.short}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="tier-axis" aria-hidden>
        {ticks.map((k) => (
          <span key={k} style={{ left: `${pct(k)}%` }} className={k === 0 ? 'first' : ''}>
            {k}
          </span>
        ))}
        <span className="last" style={{ left: '100%' }}>kWh</span>
      </div>
    </div>
  )
}
