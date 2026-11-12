import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Camera, Check as CheckIcon, CircleCheck, CircleHelp, Keyboard, Ruler, Search, Split, Zap } from 'lucide-react'
import { api, type HouseholdMonth } from '../api'
import { CountUp, GrowBar, useReveal } from '../components/motion'
import { CheckSkeleton } from '../components/Skeletons'
import { EmptyState, ErrorState, Footnote, ICON, toast } from '../components/ui'
import { useErrText } from '../i18n/copy'
import { useT } from '../i18n/copy'
import { day } from '../lib/format'
import { notifyChange, useAsync } from '../lib/useAsync'


/** A photo reading confirmed with no serial read is not "Verified": the meter was not matched. */
const noSerial = (r: { source: string; serialRead?: string | null }) => r.source === 'photo' && !r.serialRead

export default function Check() {
  const nav = useNavigate()
  const { t } = useT()
  const errText = useErrText()
  const { data, error, loading, reload } = useAsync(() => api.getMonth())
  const [editing, setEditing] = useState<string>()
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, !!data)

  if (error) return <div className="screen"><div className="header-row"><h1 className="title">{t('check.title')}</h1></div><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !data) return <CheckSkeleton />
  const m = data!

  if (!m.bill || !m.check) {
    return (
      <div className="screen">
        <div className="header-row"><h1 className="title">{t('check.title')}</h1></div>
        <EmptyState
          title={t('check.emptyTitle')}
          body={t('check.empty')}
          label={m.bill ? t('check.scanMeter') : t('home.scanBill')}
          onScan={() => nav(m.bill ? `/scan/meter/${m.households.find((h) => !h.reading)?.id ?? 'A'}` : '/scan/bill')}
        />
      </div>
    )
  }

  const c = m.check
  async function applySuggestion(h: HouseholdMonth) {
    if (!h.suggestion) return
    try {
      await api.confirmReading({ householdId: h.id, value: h.suggestion.value, source: 'typed', capturedAt: new Date().toISOString() })
      notifyChange()
      reload()
    } catch (e) {
      toast(errText(e, 'check.errSave'))
    }
  }
  const flagged = m.households.filter((h) => h.reading?.source === 'typed').map((h) => h.id)
  const pct = Math.min(100, (c.readingsKwh / c.masterKwh) * 100)

  return (
    <div className="screen scrolls" ref={ref}>
      <div className="header-row"><h1 className="title">{t('check.title')}</h1></div>

      <div className="lime-card" style={{ ['--num' as string]: c.addsUp ? 'calc(var(--hero) * 0.68)' : 'var(--hero)', ['--text-gap' as string]: 'calc(var(--num) * 0.1259)' }}>
        <p className="hero-num" style={{ fontSize: 'var(--num)', paddingRight: 44 }}>
          {c.addsUp ? (
            t('check.addsUp')
          ) : (
            <>
              <CountUp value={Math.abs(c.missingKwh)} format={(n) => `${Math.round(n)} kWh`} />{' '}
              <span style={{ fontSize: 26, fontWeight: 700 }}>{c.missingKwh > 0 ? t('check.missingWord') : t('check.extraWord')}</span>
            </>
          )}
        </p>
        {/* Icon only (no tinted circle). Its outline's top lines up with the top of the text:
            the drawn circle starts 2/24 (check) or 3/24 (search) of the icon's height below its box. */}
        <span
          className="corner"
          style={{
            // Centred on the same vertical line as Home's 34px corner circle (35px from the card's right).
            right: 24,
            width: 22,
            height: 22,
            display: 'grid',
            top: `calc(var(--py) + var(--text-gap) - ${((c.addsUp ? 2 : 3) / 24) * 22}px)`,
          }}
        >
          {c.addsUp ? <CircleCheck size={22} strokeWidth={1.75} /> : <Search size={22} strokeWidth={1.75} />}
        </span>
        <div style={{ marginTop: 16 }}><GrowBar pct={pct} /></div>
        <p className="body" style={{ margin: '12px 0 0', fontWeight: 500 }}>
          {t('check.ofKwh', { a: Math.round(c.readingsKwh), b: c.masterKwh })}
        </p>
      </div>

      <div className="card list">
        {m.households.map((h) =>
          editing === h.id ? (
            <TypeRow key={h.id} h={h} onDone={() => setEditing(undefined)} />
          ) : (
            <button key={h.id} className="list-row" onClick={() => setEditing(h.id)} aria-label={t('check.change', { name: h.name })}>
              <span className="avatar">{h.label}</span>
              {/* Same layout as Home's rows: name over kWh, the status badge where Home shows the price. */}
              <span className="grow">
                <span className="body">{h.name}</span>
                <span className="meta">
                  <Zap size={12} strokeWidth={1.75} />
                  {h.reading ? `${Math.round(h.reading.kwh)} kWh` : t('check.noReading')}
                </span>
                {h.flags?.[0] && <span className="meta">{h.flags[0]}</span>}
                {h.suggestion && (
                  <span
                    className="chip sm"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); applySuggestion(h) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); applySuggestion(h) } }}
                  >
                    {h.suggestion.message}
                  </span>
                )}
              </span>
              {h.reading && !h.suggestion && (
                <span className="chip sm row-badge">
                  {h.reading.source === 'typed' ? <Keyboard size={12} strokeWidth={1.75} /> : noSerial(h.reading) ? <CircleHelp size={12} strokeWidth={1.75} /> : <CircleCheck size={12} strokeWidth={1.75} />}
                  {h.reading.source === 'typed' ? t('check.typed') : noSerial(h.reading) ? t('check.serialUnchecked') : t('check.verified')}
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {/* How the check works: its own card, laid out like Usage's tips card (16px icon, 15px text, dividers).
          The dates row shows in both states; the 5% row returns once it adds up. */}
      <div className="card list">
          <div className="list-row">
            <Calendar {...ICON} size={16} style={{ flex: 'none' }} />
            <span className="tip">{t('check.aligned', { d: day(c.alignedTo) })}</span>
          </div>
          {c.gapRuleApplied && (
            <div className="list-row">
              <Split {...ICON} size={16} style={{ flex: 'none' }} />
              <span className="tip">{t('check.gaprule')}</span>
            </div>
          )}
          {c.addsUp && (
            <div className="list-row">
              <Ruler {...ICON} size={16} style={{ flex: 'none' }} />
              <span className="tip">{t('check.tolerance', { p: c.tolerancePct, n: Math.round(c.toleranceKwh) })}</span>
            </div>
          )}
        </div>

      {!c.addsUp && (
        <button
          className="btn"
          disabled={sending}
          onClick={async () => {
            setSending(true)
            try {
              try { await api.requestNewPhoto(flagged.length ? flagged : m.households.map((h) => h.id)) } catch { /* harmless */ }
              const text = t('check.askMessage')
              if (typeof navigator.share === 'function') {
                try {
                  await navigator.share({ text })
                  toast(t('check.messageReady'))
                } catch { /* share sheet dismissed */ }
              } else {
                await navigator.clipboard.writeText(text)
                toast(t('check.copied'))
              }
            } catch (e) {
              toast(errText(e, 'check.errSend'))
            } finally {
              setSending(false)
            }
          }}
        >
          <Camera {...ICON} /> {t('check.askPhoto')}
        </button>
      )}
      <Footnote>{t('footer.source')}</Footnote>
    </div>
  )
}

/** Type a reading in kWh. It is saved as "Typed", not photo-verified. */
function TypeRow({ h, onDone }: { h: HouseholdMonth; onDone: () => void }) {
  const { t } = useT()
  const errText = useErrText()
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
      setErr(errText(e, 'check.errSave'))
    }
  }
  return (
    <div className="list-row" style={{ flexWrap: 'wrap' }}>
      <span className="avatar">{h.label}</span>
      <div className="field grow">
        <label htmlFor={`kwh-${h.id}`}>{t('check.kwhThisMonth', { name: h.name })}</label>
        <input
          id={`kwh-${h.id}`}
          inputMode="numeric"
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && v && save()}
        />
      </div>
      <button className="icon-btn" style={{ background: 'var(--lime)', alignSelf: 'flex-end', marginBottom: 5 }} disabled={!v} onClick={save} aria-label={t('common.save')}>
        <CheckIcon {...ICON} />
      </button>
      {err && <span className="support" style={{ width: '100%' }}>{err}</span>}
    </div>
  )
}
