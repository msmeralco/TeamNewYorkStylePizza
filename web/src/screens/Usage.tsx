import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bell, ChevronDown, Clock, Gauge, Leaf, Plug, Snowflake, Tag, TrendingUp } from 'lucide-react'
import { api } from '../api'
import { UsageChart } from '../components/UsageChart'
import { CountUp, useReveal } from '../components/motion'
import { UsageSkeleton } from '../components/Skeletons'
import { ErrorState, ICON, Sheet, toast } from '../components/ui'
import { useT } from '../i18n/copy'
import { day, phpWhole } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const PEOPLE = [
  { id: 'BAU', name: 'Bautista', note: 'Own meter' },
  { id: 'A', name: 'Reyes', note: 'Shared meter' },
  { id: 'B', name: 'Santos', note: 'Shared meter' },
  { id: 'C', name: 'Dela Cruz', note: 'Shared meter' },
  { id: 'D', name: 'Garcia', note: 'Shared meter' },
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

  const picker = (
    <Sheet open={picking} onClose={() => setPicking(false)}>
      {PEOPLE.map((p) => (
        <button key={p.id} className="list-row" onClick={() => { setPicking(false); nav(`/usage/${p.id}`) }}>
          <span className="grow">
            <span className="body">{p.name}</span>
            <span className="meta">{p.note}</span>
          </span>
          {p.id === householdId && <span className="chip">Showing</span>}
        </button>
      ))}
    </Sheet>
  )

  if (error) return <div className="screen"><h1 className="title">Usage</h1><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !data) return <UsageSkeleton />
  const u = data!
  const f = u.forecast

  return (
    <div className="screen" ref={ref}>
      <div className="stack" style={{ gap: 'calc(var(--gap) * 0.6)' }}>
        <button className="title title-btn" onClick={() => setPicking(true)} aria-label="Choose household">
          {t('usage.title', { household: u.name })}
          <ChevronDown size={20} strokeWidth={2} />
        </button>
        <div className="row-between">
          <p className="hero-num"><CountUp value={f.kwh} format={whole} /></p>
          {u.mode === 'own' ? (
            <span className="chip white"><Gauge size={14} strokeWidth={1.75} />{t('usage.own')}</span>
          ) : (
            u.stage === 1 && <span className="chip white">{t('usage.guess')}</span>
          )}
        </div>
        <p className="body" style={{ fontWeight: 500, margin: 0 }}>
          {u.stage === 1
            ? 'Next month, about the same as last month'
            : t('usage.expected', { date: day(u.nextReadDate), low: Math.round(f.low), high: Math.round(f.high) })}
        </p>
      </div>

      {u.stage >= 2 && <UsageChart u={u} label={t('usage.line')} />}

      {u.spikePct != null && (
        <div className="card note">
          <span className="icon-chip"><TrendingUp {...ICON} /></span>
          <span className="body">{t('usage.spike', { n: u.spikePct })}</span>
        </div>
      )}

      {u.mode === 'own' && u.lifeline ? (
        <div className="card note">
          <span className="icon-chip lime"><Tag {...ICON} /></span>
          <div className="stack" style={{ gap: 4 }}>
            <span className="body">
              Stay under {u.lifeline.limitKwh} kWh: about {phpWhole(u.lifeline.pesoUnderLimit)} instead of about{' '}
              {phpWhole(u.lifeline.pesoAtForecast)}
            </span>
            <span className="support" style={{ fontSize: 14 }}>
              4Ps lifeline: 100% off up to 50 kWh, 35% off from 51 to 70
              {u.rate.isFallback ? `. Using ${u.rate.month.split(' ')[0]}'s rate.` : ''}
            </span>
          </div>
        </div>
      ) : (
        u.perKwhValue != null && (
          <div className="card note">
            <span className="icon-chip lime"><Leaf {...ICON} /></span>
            <div className="stack" style={{ gap: 4 }}>
              <span className="body">{t('usage.perkwh', { n: Math.round(u.perKwhValue) })}</span>
              {u.rate.isFallback && u.rate.fallbackNote && (
                <span className="support" style={{ fontSize: 14 }}>{u.rate.fallbackNote}</span>
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
              <I {...ICON} style={{ flex: 'none' }} />
              <span className="body" style={{ fontWeight: 500 }}>{a.text}</span>
            </div>
          )
        })}
      </div>

      <button className="btn" onClick={() => toast('We will remind you around the 15th.')}>
        <Bell {...ICON} /> {t('usage.remind')}
      </button>
      {picker}
    </div>
  )
}
