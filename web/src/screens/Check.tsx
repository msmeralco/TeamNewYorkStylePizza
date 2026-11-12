import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Camera, Check as CheckIcon, CircleCheck, Keyboard, Ruler, Search, Split } from 'lucide-react'
import { api, type HouseholdMonth } from '../api'
import { CountUp, GrowBar, useReveal } from '../components/motion'
import { CheckSkeleton } from '../components/Skeletons'
import { ErrorState, ICON, toast } from '../components/ui'
import { useT } from '../i18n/copy'
import { day } from '../lib/format'
import { notifyChange, useAsync } from '../lib/useAsync'

export default function Check() {
  const { t } = useT()
  const { data, error, loading, reload } = useAsync(() => api.getMonth())
  const [editing, setEditing] = useState<string>()
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, !!data)

  if (error) return <div className="screen"><h1 className="title">Check</h1><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !data) return <CheckSkeleton />
  const m = data!

  if (!m.bill || !m.check) {
    return (
      <div className="screen">
        <h1 className="title">Check</h1>
        <div className="card state">
          <span className="body">The check runs once the bill and the readings are in.</span>
          <Link className="btn" to={m.bill ? `/scan/meter/${m.households.find((h) => !h.reading)?.id ?? 'A'}` : '/scan/bill'}>
            {m.bill ? 'Scan a meter' : 'Scan the bill'}
          </Link>
        </div>
      </div>
    )
  }

  const c = m.check
  const flagged = m.households.filter((h) => h.reading?.source === 'typed').map((h) => h.id)
  const pct = Math.min(100, (c.readingsKwh / c.masterKwh) * 100)

  return (
    <div className="screen" ref={ref}>
      <h1 className="title">Check</h1>

      <div className="lime-card">
        <p className="hero-num" style={{ fontSize: c.addsUp ? 'calc(var(--hero) * 0.68)' : 'var(--hero)', paddingRight: 44 }}>
          {c.addsUp ? (
            'Readings add up'
          ) : (
            <>
              <CountUp value={Math.abs(c.missingKwh)} format={(n) => `${Math.round(n)} kWh`} />{' '}
              <span style={{ fontSize: 26, fontWeight: 700 }}>{c.missingKwh > 0 ? 'missing' : 'extra'}</span>
            </>
          )}
        </p>
        <span className="icon-chip corner" style={{ background: 'rgba(35,31,32,0.08)' }}>
          {c.addsUp ? <CircleCheck {...ICON} /> : <Search {...ICON} />}
        </span>
        <div style={{ marginTop: 16 }}><GrowBar pct={pct} /></div>
        <p className="body" style={{ margin: '12px 0 0', fontWeight: 500 }}>
          {Math.round(c.readingsKwh)} of {c.masterKwh} kWh
        </p>
      </div>

      <div className="card list">
        {m.households.map((h) =>
          editing === h.id ? (
            <TypeRow key={h.id} h={h} onDone={() => setEditing(undefined)} />
          ) : (
            <button key={h.id} className="list-row" onClick={() => setEditing(h.id)} aria-label={`Change ${h.name}'s reading`}>
              <span className="avatar">{h.label}</span>
              <span className="grow">
                <span className="body">
                  {h.name} · {h.reading ? `${Math.round(h.reading.kwh)} kWh` : 'no reading'}
                </span>
                {h.reading && (
                  <span className="chip">
                    {h.reading.source === 'typed' ? <Keyboard size={13} strokeWidth={1.75} /> : <CircleCheck size={13} strokeWidth={1.75} />}
                    {h.reading.source === 'typed' ? t('check.typed') : t('check.verified')}
                  </span>
                )}
              </span>
            </button>
          ),
        )}
        <div className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="status-line" style={{ fontSize: 14 }}>
            <Calendar {...ICON} size={16} />
            Reading dates aligned to the bill: {day(c.alignedTo)}
          </span>
          {c.gapRuleApplied && (
            <span className="status-line" style={{ fontSize: 14 }}>
              <Split {...ICON} size={16} />
              {t('check.gaprule')}
            </span>
          )}
          <span className="status-line" style={{ fontSize: 14 }}>
            <Ruler {...ICON} size={16} />
            Within {c.tolerancePct}% of the bill counts (about {Math.round(c.toleranceKwh)} kWh)
          </span>
        </div>
      </div>

      {!c.addsUp && (
        <button
          className="btn"
          disabled={sending}
          onClick={async () => {
            setSending(true)
            try {
              await api.requestNewPhoto(flagged.length ? flagged : m.households.map((h) => h.id))
              toast(`Sent. They will see: "${t('check.second')}"`)
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Could not send.')
            } finally {
              setSending(false)
            }
          }}
        >
          <Camera {...ICON} /> Ask for a new photo
        </button>
      )}
    </div>
  )
}

/** Type a reading in kWh. It is saved as "Typed", not photo-verified. */
function TypeRow({ h, onDone }: { h: HouseholdMonth; onDone: () => void }) {
  const [v, setV] = useState(h.reading ? String(Math.round(h.reading.kwh)) : '')
  const [err, setErr] = useState<string>()
  const save = async () => {
    try {
      await api.confirmReading({
        householdId: h.id,
        value: h.previousReading + Number(v),
        source: 'typed',
        capturedAt: new Date().toISOString(),
      })
      notifyChange()
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.')
    }
  }
  return (
    <div className="list-row" style={{ flexWrap: 'wrap' }}>
      <span className="avatar">{h.label}</span>
      <div className="field grow">
        <label htmlFor={`kwh-${h.id}`}>{h.name}: kWh this month</label>
        <input
          id={`kwh-${h.id}`}
          inputMode="numeric"
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && v && save()}
        />
      </div>
      <button className="icon-btn" style={{ background: 'var(--lime)', alignSelf: 'flex-end', marginBottom: 5 }} disabled={!v} onClick={save} aria-label="Save">
        <CheckIcon {...ICON} />
      </button>
      {err && <span className="support" style={{ width: '100%' }}>{err}</span>}
    </div>
  )
}
