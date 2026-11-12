import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleAlert, CircleCheck, Ellipsis, FlaskConical, Languages, RotateCcw, ScanLine, TrendingUp, Zap } from 'lucide-react'
import { api } from '../api'
import { CountUp, useReveal } from '../components/motion'
import { HomeSkeleton } from '../components/Skeletons'
import { EmptyState, ErrorState, ICON, Sheet, toast } from '../components/ui'
import { useT } from '../i18n/copy'
import { day, kwh, monthName, php } from '../lib/format'
import { notifyChange, useAsync } from '../lib/useAsync'

export default function Home() {
  const { data, error, loading, reload } = useAsync(() => api.getMonth())
  const { lang, setLang, t } = useT()
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState(false)
  // Read on each render: clearing the scenario re-renders Home through notifyChange().
  const scenario = api.getScenarioName()
  const stateKey = data ? `${!!data.bill}-${data.households.filter((h) => h.reading).length}` : ''
  useReveal(ref, !!data, stateKey)

  if (error) return <div className="screen"><h1 className="title">Kahati</h1><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !data) return <HomeSkeleton />
  const m = data!

  const header = (title: string) => (
    <div className="header-row">
      <h1 className="title">{title}</h1>
      <button className="icon-btn ghost sm" aria-label={t('common.more')} onClick={() => setMenu(true)}>
        <Ellipsis {...ICON} size={16} />
      </button>
    </div>
  )

  const sheet = (
    <Sheet open={menu} onClose={() => setMenu(false)}>
      <button className="list-row" onClick={() => { setLang(lang === 'en' ? 'fil' : 'en'); setMenu(false) }}>
        <span className="icon-chip"><Languages {...ICON} /></span>
        <span className="grow body">{lang === 'en' ? 'Filipino' : 'English'}</span>
      </button>
      {scenario && (
        <button className="list-row" onClick={async () => { await api.clearScenario(); notifyChange(); setMenu(false) }}>
          <span className="icon-chip"><FlaskConical {...ICON} /></span>
          <span className="grow">
            <span className="body">{t('home.useBuiltIn')}</span>
            <span className="meta">{t('home.scenarioActive', { name: scenario })}</span>
          </span>
        </button>
      )}
      <button className="list-row" onClick={async () => { await api.resetDemo(); notifyChange(); setMenu(false) }}>
        <span className="icon-chip"><RotateCcw {...ICON} /></span>
        <span className="grow body">{t('home.reset')}</span>
      </button>
    </Sheet>
  )

  // Empty: no bill yet this month.
  if (!m.bill) {
    return (
      <div className="screen scrolls" ref={ref}>
        {header(t('home.thisMonth'))}
        <EmptyState title={t('home.noBill')} body={t('home.noBillHint')} label={t('home.scanBill')} onScan={() => nav('/scan/bill')} />
        {sheet}
      </div>
    )
  }

  const bill = m.bill
  const missing = m.households.filter((h) => !h.reading)
  const check = m.check
  // 4Ps households at or under 50 kWh who still get no lifeline: it is per Meralco account, and this compound has one.
  const lifelineN = missing.length === 0 ? m.households.filter((h) => h.fourPs && h.reading && h.reading.kwh <= 50).length : 0

  return (
    <div className="screen scrolls" ref={ref}>
      {header(t('home.billTitle', { month: monthName(bill.periodEnd) }))}

      <div className="hero" style={{ ['--text-gap' as string]: 'calc(var(--hero) * 0.1259)' }}>
        <p className="hero-num"><CountUp value={bill.amount} format={php} /></p>
        <p className="body" style={{ margin: '10px 0 0', fontWeight: 500 }}>
          {bill.kwh} kWh · {t('common.range', { a: day(bill.periodStart), b: day(bill.periodEnd) })}
        </p>
        <span className="icon-chip lime corner"><Zap {...ICON} /></span>
      </div>

      {missing.length > 0 ? (
        <>
          <div className="row-between">
            <span className="status-line"><CircleAlert {...ICON} />{t('home.toGo', { n: missing.length, total: m.households.length })}</span>
            <button className="text-link" onClick={async () => { const r = await api.loadSampleReadings(); notifyChange(); if (r.loaded === 0 && r.missing > 0) toast(t('home.loadRestNone')) }}>
              {t('home.loadRest')}
            </button>
          </div>
          <button className="btn" onClick={() => nav(`/scan/meter/${missing[0].id}`)}>
            <ScanLine {...ICON} /> {t('home.scanName', { name: missing[0].name })}
          </button>
        </>
      ) : (
        check && (
          <Link to="/check" className="status-line">
            {check.addsUp ? <CircleCheck {...ICON} /> : <CircleAlert {...ICON} />}
            {check.addsUp
              ? t('home.addsUp', { a: Math.round(check.readingsKwh), b: check.masterKwh })
              : t('home.missing', { n: Math.round(check.missingKwh), a: Math.round(check.readingsKwh), b: check.masterKwh })}
          </Link>
        )
      )}

      <div className="card list">
        {m.households.map((h) => (
          <Link key={h.id} to={`/bill/${h.id}`} className="list-row">
            <span className="avatar">{h.label}</span>
            <span className="grow">
              <span className="body">{h.name}</span>
              <span className="meta">
                <Zap size={12} strokeWidth={1.75} />
                {h.reading ? kwh(h.reading.kwh) : t('home.noReading')}
              </span>
            </span>
            <span className="amount">{h.share ? <CountUp value={h.share.amount} format={php} /> : '–'}</span>
          </Link>
        ))}
      </div>

      {lifelineN > 0 && (
        <p className="support">{t(lifelineN === 1 ? 'home.lifelineNote1' : 'home.lifelineNote', { n: lifelineN, kwh: bill.kwh })}</p>
      )}

      {missing.length === 0 && m.rateNote && (
        <div className="card note">
          <span className="icon-chip lime"><TrendingUp {...ICON} /></span>
          <div className="stack" style={{ gap: 4 }}>
            <span className="body">{t('home.rateAbove', { n: php(m.rateNote.difference) })}</span>
            <span className="support">
              {t('home.rateVs', { a: php(m.rateNote.chargedRate), b: php(m.rateNote.billRate) })}
            </span>
          </div>
        </div>
      )}
      {sheet}
    </div>
  )
}
