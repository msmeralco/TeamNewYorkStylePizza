import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, CircleAlert, Calendar, Check, Hash, Keyboard, Lock, Zap } from 'lucide-react'
import { api, showDevTools, type BillScan } from '../api'
import { useErrText, useT } from '../i18n/copy'
import { SAMPLE_BILL } from '../api/mock'
import { SCAN_STEPS } from './ScanMeter'
import { Brackets, CameraPanel, ScanBeam, ScanHeader } from '../components/Scan'
import { useReveal } from '../components/motion'
import { ICON } from '../components/ui'
import { day, php } from '../lib/format'
import { notifyChange, useAsync } from '../lib/useAsync'


const CONSENT_KEY = 'kahati-bill-consent'

function BillDrawing() {
  return (
    <svg className="bill-drawing" viewBox="0 0 150 190" aria-hidden style={{ transform: 'rotate(-3deg)' }}>
      <rect x="0" y="0" width="150" height="190" rx="6" fill="#E9E7E3" />
      <rect x="14" y="18" width="70" height="8" rx="3" fill="#B8B4B1" />
      {[38, 48].map((y) => <rect key={y} x="14" y={y} width="110" height="4" rx="2" fill="#CFCBC8" />)}
      <rect x="14" y="62" width="64" height="16" rx="3" fill="#8D8988" />
      {[92, 102, 112, 122, 132, 146].map((y, i) => (
        <rect key={y} x="14" y={y} width={i % 2 ? 100 : 122} height="4" rx="2" fill="#CFCBC8" />
      ))}
    </svg>
  )
}

export default function ScanBill() {
  const nav = useNavigate()
  const [consented, setConsented] = useState(() => {
    try {
      return localStorage.getItem(CONSENT_KEY) === '1'
    } catch {
      return false
    }
  })
  const [phase, setPhase] = useState<'idle' | 'reading' | 'read' | 'typing' | 'saving'>('idle')
  const [scan, setScan] = useState<BillScan>()
  const [preview, setPreview] = useState<string>()
  const [err, setErr] = useState<string>()
  const { t } = useT()
  const errText = useErrText()
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, true, `${consented}-${phase === 'typing'}-${!!scan}`)
  // Reached with the back button after the bill was confirmed: show it so it can be kept.
  const month = useAsync(() => api.getMonth(), [])
  const savedBill = !scan && phase === 'idle' ? month.data?.bill ?? null : null

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function read(file: Blob) {
    setErr(undefined)
    setPhase('reading')
    // TODO(privacy): mask name, address and account number on the device before upload.
    try {
      setScan(await api.scanBill(file))
      setPhase('read')
    } catch (e) {
      setErr(errText(e, 'scan.errReadBill'))
      setPhase('idle')
    }
  }

  async function confirm(s: BillScan) {
    setPhase('saving')
    try {
      await api.confirmBill(s.linesAddUp === false ? spreadLines(s) : s)
      notifyChange()
      nav('/scan/meter/A')
    } catch (e) {
      setErr(errText(e, 'scan.errSaveBill'))
      setPhase('read')
    }
  }

  if (!consented) {
    return (
      <div className="screen no-nav" ref={ref}>
        <ScanHeader step={0} total={SCAN_STEPS} title={t('scan.before')} />
        <div className="spacer" />
        <div className="scan-sheet">
          <div className="note">
            <span className="icon-chip lime"><Lock {...ICON} /></span>
            <div className="stack" style={{ gap: 6 }}>
              <span className="body">{t('scan.consentTitle')}</span>
              <span className="support">{t('scan.consentBody')}</span>
            </div>
          </div>
          <button
            className="btn"
            onClick={() => {
              try { localStorage.setItem(CONSENT_KEY, '1') } catch { /* ignore */ }
              setConsented(true)
            }}
          >
            <Check {...ICON} /> {t('scan.understand')}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'typing') return <TypeBill onCancel={() => setPhase('idle')} onDone={confirm} />

  const b = scan ?? savedBill
  const rows = [
    { Icon: Calendar, k: t('scan.period'), v: b ? t('common.range', { a: day(b.periodStart), b: day(b.periodEnd) }) : '–' },
    { Icon: Zap, k: t('scan.totalKwh'), v: b ? String(b.kwh) : '–' },
    { Icon: Banknote, k: t('scan.amount'), v: b ? php(b.amount) : '–' },
    { Icon: Hash, k: t('scan.account'), v: b ? `•••• ${b.accountLast4}` : '–' },
  ]

  return (
    <div className="screen no-nav" ref={ref}>
      <ScanHeader step={1} total={SCAN_STEPS} title={t('scan.billTitle')} />
      <CameraPanel onPhoto={(f) => { setPreview(URL.createObjectURL(f)); read(f) }} disabled={phase === 'reading'} preview={preview}>
        {!preview && <BillDrawing />}
        {phase === 'reading' && <ScanBeam />}
        <Brackets />
      </CameraPanel>

      <div className="scan-sheet">
        {err && <div className="status-line" role="alert">{err}</div>}
        {/* Like the meter step: the read values appear only once the bill has been scanned. */}
        {b && (
          <div className="card" style={{ padding: '4px 20px' }}>
            {rows.map(({ Icon, k, v }) => (
              <div className="kv" key={k}>
                <span className="k"><Icon {...ICON} color="var(--soft-on-white)" />{k}</span>
                <span className="v">{v}</span>
              </div>
            ))}
          </div>
        )}
        {scan && (scan.sanityNote || scan.linesAddUp === false) && (
          <div className="status-line" role="alert">
            <CircleAlert {...ICON} />
            <span>
              {scan.sanityNote ?? t('scan.linesNoAdd')}
              {scan.linesAddUp === false && <> {t('scan.linesSpread')}</>}
            </span>
          </div>
        )}
        {savedBill && (
          <>
            <button className="btn" onClick={() => nav('/scan/meter/A')}>
              <Check {...ICON} /> {t('scan.keepNext')}
            </button>
            <p className="support scan-hint">{t('scan.rescanBillNote')}</p>
          </>
        )}
        {scan && (
          <button className="btn" disabled={phase === 'saving'} onClick={() => confirm(scan)}>
            <Check {...ICON} /> {t('scan.confirmBill')}
          </button>
        )}
        <div className="scan-foot">
          {!scan && (
            <p className="support scan-hint">
              {phase === 'reading' ? t('scan.readingBill') : t('scan.tapBill')}
            </p>
          )}
          <button className="link-btn" onClick={() => setPhase('typing')}>
            <Keyboard {...ICON} /> {t('scan.typeInstead')}
          </button>
          {showDevTools && !scan && (
            <button className="link-btn support" onClick={() => read(new Blob())}>
              {t('scan.sampleBill')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TypeBill({ onCancel, onDone }: { onCancel: () => void; onDone: (s: BillScan) => void }) {
  const [f, setF] = useState({
    periodStart: SAMPLE_BILL.periodStart,
    periodEnd: SAMPLE_BILL.periodEnd,
    kwh: '',
    amount: '',
    last4: '',
  })
  const kwhN = Number(f.kwh)
  const amtN = Number(f.amount)
  const valid = kwhN > 0 && amtN > 0 && /^\d{4}$/.test(f.last4) && f.periodEnd > f.periodStart
  const { t } = useT()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="screen no-nav" style={{ gap: 20 }}>
      <ScanHeader step={1} total={SCAN_STEPS} title={t('scan.typeTitle')} />
      <div className="scan-sheet" style={{ borderRadius: 28 }}>
        <div className="field"><label>{t('scan.periodStart')}</label><input type="date" value={f.periodStart} onChange={set('periodStart')} /></div>
        <div className="field"><label>{t('scan.periodEnd')}</label><input type="date" value={f.periodEnd} onChange={set('periodEnd')} /></div>
        <div className="field"><label>{t('scan.totalKwh')}</label><input inputMode="numeric" value={f.kwh} onChange={set('kwh')} placeholder="180" /></div>
        <div className="field"><label>{t('scan.amountPeso')}</label><input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="2711.07" /></div>
        <div className="field"><label>{t('scan.last4')}</label><input inputMode="numeric" maxLength={4} value={f.last4} onChange={set('last4')} placeholder="4821" /></div>
        <button
          className="btn"
          disabled={!valid}
          onClick={() =>
            onDone({
              // Charge lines are scaled from the sample structure until the backend
              // takes typed lines; the totals are what the user typed.
              ...SAMPLE_BILL,
              periodStart: f.periodStart,
              periodEnd: f.periodEnd,
              readDate: f.periodEnd,
              kwh: kwhN,
              amount: amtN,
              accountLast4: f.last4,
              lines: SAMPLE_BILL.lines.map((l) => ({ ...l, amount: l.fixed + ((l.amount - l.fixed) * (amtN - SAMPLE_BILL.fixedCharges)) / (SAMPLE_BILL.amount - SAMPLE_BILL.fixedCharges) })),
              confidence: 1,
            })
          }
        >
          <Check {...ICON} /> {t('scan.confirmBill')}
        </button>
        <button className="link-btn" onClick={onCancel}>{t('scan.backCamera')}</button>
      </div>
    </div>
  )
}

/**
 * The totals were read but the charge lines do not add up to the amount (usually one line misread).
 * The user has been told: the variable part of each line is scaled so the lines add up to the total,
 * fixed charges stay as read, and centavo rounding goes to "other". A retake gives the exact lines.
 */
function spreadLines(s: BillScan): BillScan {
  const fixed = s.lines.reduce((a, l) => a + (l.fixed ?? 0), 0)
  const variable = s.lines.reduce((a, l) => a + l.amount - (l.fixed ?? 0), 0)
  if (variable <= 0) return s
  const k = (s.amount - fixed) / variable
  const lines = s.lines.map((l) => ({ ...l, amount: Math.round(((l.fixed ?? 0) + (l.amount - (l.fixed ?? 0)) * k) * 100) / 100 }))
  const diff = Math.round((s.amount - lines.reduce((a, l) => a + l.amount, 0)) * 100) / 100
  const other = lines.find((l) => l.key === 'other') ?? lines[lines.length - 1]
  other.amount = Math.round((other.amount + diff) * 100) / 100
  return { ...s, lines, linesAddUp: true }
}
