import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useNavigate, useParams } from 'react-router-dom'
import { Bell, ChevronDown, CircleCheck, Sparkles, Clock, Gauge, Leaf, Plug, Snowflake, Tag, TrendingUp } from 'lucide-react'
import { api } from '../api'
import { UsageChart } from '../components/UsageChart'
import { LifelineBar } from '../components/LifelineBar'
import { CountUp, reduceMotion, useReveal } from '../components/motion'
import { UsageSkeleton } from '../components/Skeletons'
import { ErrorState, ICON, Sheet } from '../components/ui'
import { useT } from '../i18n/copy'
import { day, localMonth, monthName, phpWhole } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const PEOPLE = [
  { id: 'BAU', name: 'Bautista', note: 'usage.own' as const },
  { id: 'A', name: 'Reyes', note: 'usage.shared' as const },
  { id: 'B', name: 'Santos', note: 'usage.shared' as const },
  { id: 'C', name: 'Dela Cruz', note: 'usage.shared' as const },
  { id: 'D', name: 'Garcia', note: 'usage.shared' as const },
]
const ACTION_ICON = { plug: Plug, clock: Clock, snowflake: Snowflake }
const whole = (n: number) => `${Math.round(n)} kWh`

export default function Usage() {
  const { householdId = 'BAU' } = useParams()
  const nav = useNavigate()
  const { t } = useT()
  const { data, error, loading, reload } = useAsync(() => api.getUsage(householdId), [householdId])
  const [picking, setPicking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, !!data, data?.householdId)
  // "Remind me": confirmed in the button itself (no toast over it). The new label fades in place.
  const [remindedFor, setRemindedFor] = useState<string | null>(null)
  const reminded = remindedFor === householdId
  const remindLabel = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    if (!reminded || !remindLabel.current || reduceMotion()) return
    const tw = gsap.fromTo(remindLabel.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' })
    return () => { tw.kill() }
  }, [reminded])

  const picker = (
    <Sheet open={picking} onClose={() => setPicking(false)}>
      {PEOPLE.map((p) => (
        <button key={p.id} className="list-row" onClick={() => { setPicking(false); nav(`/usage/${p.id}`) }}>
          <span className="grow">
            <span className="body">{p.name}</span>
            <span className="meta">{t(p.note)}</span>
          </span>
          {p.id === householdId && <span className="chip">{t('usage.showing')}</span>}
        </button>
      ))}
    </Sheet>
  )

  if (error) return <div className="screen"><h1 className="title">{t('nav.usage')}</h1><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !data) return <UsageSkeleton />
  const u = data!
  const f = u.forecast

  return (
    <div className="screen" ref={ref}>
      <div className="stack" style={{ gap: 'calc(var(--gap) * 0.6)' }}>
        <div className="header-row">
          <button className="title title-btn" onClick={() => setPicking(true)} aria-label={t('usage.choose')}>
            {t('usage.title', { household: u.name })}
            <ChevronDown size={20} strokeWidth={2} />
          </button>
          <button className="icon-btn sm" onClick={() => nav(`/ask/${householdId}`)} aria-label={t('ask.open')}>
            <Sparkles {...ICON} size={16} />
          </button>
        </div>
        {/* Number and its caption read as one unit: a tight 4px gap, the title keeps the wider one. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Badge top lines up with the top of the number's glyphs (0.1259 x font size below its line box). */}
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <p className="hero-num"><CountUp value={f.kwh} format={whole} /></p>
          {u.mode === 'own' ? (
            <span className="chip sm white" style={{ marginTop: 'calc(var(--hero) * 0.1259)' }}><Gauge size={12} strokeWidth={1.75} />{t('usage.own')}</span>
          ) : (
            u.stage === 1 && <span className="chip sm white" style={{ marginTop: 'calc(var(--hero) * 0.1259)' }}>{t('usage.guess')}</span>
          )}
        </div>
        <p className="body" style={{ fontWeight: 500, margin: 0 }}>
          {u.stage === 1
            ? t('usage.next')
            : t('usage.expected', { date: day(u.nextReadDate), low: Math.round(f.low), high: Math.round(f.high) })}
        </p>
        </div>
      </div>

      {u.stage >= 2 && <UsageChart u={u} label={t('usage.line')} />}

      {u.spikePct != null && (
        <div className="card note">
          <span className="icon-chip"><TrendingUp {...ICON} /></span>
          <span className="body">{t('usage.spike', { n: u.spikePct })}</span>
        </div>
      )}

      {u.mode === 'own' && u.lifeline ? (
        <div className="card stack" style={{ gap: 'calc(var(--gap) * 0.6)' }}>
          <div className="note">
            <span className="icon-chip lime"><Tag {...ICON} /></span>
            <div className="stack" style={{ gap: 4 }}>
              <span className="body">
                {/* ₱0 under the line is said as the rule ("100% off"), never "about ₱0". */}
                {t(u.lifeline.pesoUnderLimit < 0.005 ? 'usage.stayUnderFree' : 'usage.stayUnder', { limit: u.lifeline.limitKwh, a: phpWhole(u.lifeline.pesoUnderLimit), b: phpWhole(u.lifeline.pesoAtForecast) })}
              </span>
              {u.rate.isFallback && (
                <span className="support">{t('usage.usingRate', { month: localMonth(u.rate.month) })}</span>
              )}
            </div>
          </div>
          {/* The tiers as a to-scale bar, replacing the "100% off up to 50 kWh..." line. */}
          <LifelineBar forecastKwh={f.kwh} tiers={u.lifeline.tiers} />
        </div>
      ) : (
        u.perKwhValue != null && (
          <div className="card note">
            <span className="icon-chip lime"><Leaf {...ICON} /></span>
            <div className="stack" style={{ gap: 4 }}>
              <span className="body">{t('usage.perkwh', { n: Math.round(u.perKwhValue) })}</span>
              {u.rate.isFallback && (
                <span className="support">
                  {t('rate.fallback', { month: localMonth(u.rate.month), next: monthName(u.nextReadDate) })}
                </span>
              )}
            </div>
          </div>
        )
      )}

      <div className="card list">
        {u.actions.map((a) => {
          const I = ACTION_ICON[a.icon]
          return (
            <div className="list-row" key={a.text}>
              <I {...ICON} size={16} style={{ flex: 'none' }} />
              <span className="tip">{t(`action.${a.icon}`)}</span>
            </div>
          )
        })}
      </div>

      <button
        className={`btn compact${reminded ? ' done' : ''}`}
        onClick={() => setRemindedFor(householdId)}
        aria-disabled={reminded}
        aria-live="polite"
      >
        {reminded ? (
          <span className="btn-label" key="done" ref={remindLabel}><CircleCheck {...ICON} /> {t('usage.reminded')}</span>
        ) : (
          <span className="btn-label" key="ask"><Bell {...ICON} /> {t('usage.remind')}</span>
        )}
      </button>
      {picker}
    </div>
  )
}
