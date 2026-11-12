import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useNavigate, useParams } from 'react-router-dom'
import { Bell, ChevronDown, ScanLine, CircleCheck, Sparkles, Gauge, Leaf, Tag, TrendingUp } from 'lucide-react'
import { api } from '../api'
import { UsageChart } from '../components/UsageChart'
import { SharedUsageChart } from '../components/SharedUsageChart'
import { LifelineBar } from '../components/LifelineBar'
import { CountUp, reduceMotion, useReveal } from '../components/motion'
import { UsageSkeleton } from '../components/Skeletons'
import { EmptyState, ErrorState, Footnote, ICON, Sheet } from '../components/ui'
import { useT } from '../i18n/copy'
import { LIFELINE_TIERS_2026, lifelineDiscount } from '../lib/lifeline'
import { day, localMonth, monthName, phpWhole } from '../lib/format'
import { useAsync } from '../lib/useAsync'

/** Picker rows: Bautista first, then the compound's households. Names come from the active sample or scenario. */
const PEOPLE_IDS = [
  { id: 'BAU', note: 'usage.own' as const },
  { id: 'A', note: 'usage.shared' as const },
  { id: 'B', note: 'usage.shared' as const },
  { id: 'C', note: 'usage.shared' as const },
  { id: 'D', note: 'usage.shared' as const },
]
const whole = (n: number) => `${Math.round(n)} kWh`

/** An .ics with one event on the 15th at 9:00 Manila time (written in UTC). Unknown or past period: the next 15th. */
function downloadReminder(periodDate?: string) {
  const now = new Date()
  let y = now.getFullYear()
  let m = now.getMonth()
  const p = periodDate ? new Date(periodDate) : null
  if (p && !Number.isNaN(p.getTime())) {
    const cand = new Date(p.getFullYear(), p.getMonth(), 15, 23, 59)
    if (cand >= now) { y = p.getFullYear(); m = p.getMonth() }
    else if (now.getDate() > 15) m += 1
  } else if (now.getDate() > 15) m += 1
  const d = new Date(y, m, 15)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}15`
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kahati//Reminder//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:kahati-${ymd}@kahati`,
    `DTSTAMP:${stamp}`,
    // 9:00 to 9:30 Manila (UTC+8) is 01:00Z to 01:30Z the same day.
    `DTSTART:${ymd}T010000Z`,
    `DTEND:${ymd}T013000Z`,
    'SUMMARY:Kahati: take a meter photo',
    `DESCRIPTION:Open Kahati to scan your meter: ${window.location.origin}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'kahati-reminder.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Usage() {
  const { householdId = 'BAU' } = useParams()
  const nav = useNavigate()
  const { t } = useT()
  const { data, error, loading, reload } = useAsync(() => api.getUsage(householdId), [householdId])
  // For the empty state's button label: the bill comes first, then the meters.
  const { data: month } = useAsync(() => api.getMonth(), [])
  const { data: own } = useAsync(() => api.getOwnMeter(), [])
  const [picking, setPicking] = useState(false)
  const [claiming, setClaiming] = useState(false)
  // Until a name is known the row shows its household letter (Bautista: the own-meter label), never a stale sample name.
  const PEOPLE = PEOPLE_IDS.map((p) => ({
    ...p,
    name: p.id === 'BAU' ? (own?.name || t('usage.own')) : (month?.households.find((h) => h.id === p.id)?.name || p.id),
  }))
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

  if ((error as { code?: string } | undefined)?.code?.startsWith('needs_')) {
    const own = householdId === 'BAU'
    // This household has its reading but the month is incomplete: say what is missing, not "No readings yet".
    const waiting = !own && !!month?.households.find((h) => h.id === householdId)?.reading
    const nextMissing = month?.households.find((h) => !h.reading)
    // No household name until there is data: the title stays neutral and the picker chooses whose meter.
    return (
      <div className="screen">
        <div className="header-row">
          <button className="title title-btn" onClick={() => setPicking(true)} aria-label={t('usage.choose')}>
            {t('nav.usage')}
            <ChevronDown size={20} strokeWidth={2} />
          </button>
        </div>
        <EmptyState
          title={t(waiting ? 'usage.waitTitle' : 'usage.emptyTitle')}
          body={t(waiting ? 'usage.waitBody' : 'usage.emptyBody')}
          // Same rule as Home, Check and Bill: "Scan the bill" until the month has a bill, then "Scan the meter".
          // An own-meter household has no shared bill to scan first: it always goes to its own meter.
          label={t(own || month?.bill ? 'check.scanMeter' : 'home.scanBill')}
          onScan={() => nav(own ? '/scan/meter/BAU' : !month?.bill ? '/scan' : waiting && nextMissing ? `/scan/meter/${nextMissing.id}` : '/scan')}
        />
        {picker}
      </div>
    )
  }
  if (error) return <div className="screen"><h1 className="title">{t('nav.usage')}</h1><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !data) return <UsageSkeleton />
  const u = data!
  const f = u.forecast

  return (
    <div className={`screen ${u.mode === 'own' ? 'own' : 'shared scrolls'}`} ref={ref}>
      <div className="stack" style={{ gap: 'calc(var(--gap) * 0.6)' }}>
        <div className="header-row">
          <button className="title title-btn" onClick={() => setPicking(true)} aria-label={t('usage.choose')}>
            <span className="title-text">{t('usage.title', { household: u.name })}</span>
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

      {u.stage >= 2 ? <UsageChart u={u} label={t('usage.line')} /> : u.mode === 'shared' && <SharedUsageChart u={u} label={t('usage.line')} />}

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
                <span className="support">
                  {t('usage.usingRate', { month: localMonth(u.rate.month) })}
                  {/* The range is dropped on short phones (index.css) so the chart can stay readable. */}
                  {u.lifeline.pesoLow != null && u.lifeline.pesoHigh != null && (
                    <span className="rate-range"> {t('usage.rateRange', { low: phpWhole(u.lifeline.pesoLow), high: phpWhole(u.lifeline.pesoHigh) })}</span>
                  )}
                </span>
              )}
            </div>
          </div>
          {/* The tiers as a to-scale bar, replacing the "100% off up to 50 kWh..." line. */}
          <LifelineBar forecastKwh={f.kwh} tiers={u.lifeline.tiers} />
        </div>
      ) : u.mode === 'shared' ? (
        <>
          {/* A what-if only: the lifeline sits on one Meralco account and its meter, so a shared meter can't claim it. */}
          <div className="card stack" style={{ gap: 'calc(var(--gap) * 0.6)' }}>
            <div className="note whatif">
              <span className="icon-chip lime"><Tag {...ICON} /></span>
              <div className="stack" style={{ gap: 4 }}>
                <span className="body" style={{ fontWeight: 600 }}>{t('usage.whatIfTitle')}</span>
                <span className="support">
                  {(() => {
                    const kwh = Math.round(f.kwh)
                    const pct = Math.round(lifelineDiscount(kwh, u.lifeline?.tiers ?? LIFELINE_TIERS_2026) * 100)
                    return pct > 0 ? t('usage.whatIf', { kwh, pct }) : t('usage.whatIfNone', { kwh })
                  })()}
                </span>
              </div>
            </div>
            <LifelineBar forecastKwh={f.kwh} tiers={u.lifeline?.tiers} />
          </div>
          {u.perKwhValue != null && (
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
          )}
        </>
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

      <div className="btn-row">
        {u.mode === 'shared' && (
          <button className="btn compact" onClick={() => setClaiming(true)}>
            <span className="btn-label"><Tag {...ICON} size={16} /> {t('usage.claim')}</span>
          </button>
        )}
        {u.mode === 'own' && (
          <button className="btn compact" onClick={() => nav('/scan/meter/BAU')}>
            <span className="btn-label"><ScanLine {...ICON} size={16} /> {t('usage.scan')}</span>
          </button>
        )}
        <button
          className={`btn compact${reminded ? ' done' : ' dark'}`}
          onClick={() => { if (reminded) return; downloadReminder(u.readDate); setRemindedFor(householdId) }}
          aria-disabled={reminded}
          aria-live="polite"
        >
          {reminded ? (
            <span className="btn-label" key="done" ref={remindLabel}><CircleCheck {...ICON} size={16} /> {t('usage.reminded')}</span>
          ) : (
            <span className="btn-label" key="ask"><Bell {...ICON} size={16} /> {t('usage.remind')}</span>
          )}
        </button>
      </div>
      <div className="usage-foot" style={{ marginTop: 'calc(var(--gap) * -0.5)' }}><Footnote>{t('footer.source')}</Footnote></div>
      {picker}
      <Sheet open={claiming} onClose={() => setClaiming(false)}>
        <ol className="claim">
          {[1, 2].map((n) => <li key={n} className="body">{t(`claim.${n}` as 'claim.1')}</li>)}
        </ol>
        <p className="support claim-foot">{t('claim.foot')}</p>
      </Sheet>
    </div>
  )
}
