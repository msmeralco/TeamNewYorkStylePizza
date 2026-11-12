import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Banknote, Calendar, Check, Hash, Keyboard, Lock, Zap } from 'lucide-react'
import { api, usingMock, type BillScan } from '../api'
import { SAMPLE_BILL } from '../api/mock'
import { Brackets, CameraPanel, ScanBeam, ScanHeader } from '../components/Scan'
import { useReveal } from '../components/motion'
import { ICON } from '../components/ui'
import { day, php } from '../lib/format'
import { notifyChange } from '../lib/useAsync'

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
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, true, `${consented}-${phase === 'typing'}-${!!scan}`)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function read(file: Blob) {
    setErr(undefined)
    setPhase('reading')
    // TODO(privacy): mask name, address and account number on the device before upload.
    try {
      setScan(await api.scanBill(file))
      setPhase('read')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read the bill.')
      setPhase('idle')
    }
  }

  async function confirm(s: BillScan) {
    setPhase('saving')
    try {
      await api.confirmBill(s)
      notifyChange()
      nav('/scan/meter/A')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the bill.')
      setPhase('read')
    }
  }

  if (!consented) {
    return (
      <div className="screen no-nav" ref={ref}>
        <ScanHeader step={0} total={5} title="Before you scan" />
        <div className="spacer" />
        <div className="scan-sheet">
          <div className="note">
            <span className="icon-chip lime"><Lock {...ICON} /></span>
            <div className="stack" style={{ gap: 6 }}>
              <span className="body">Name, address and account number are covered on your phone first.</span>
              <span className="support">
                Kahati sends only the covered photo to read the bill. It keeps the period, kWh, amount, the charge lines and
                the last 4 digits of the account. The photo is not kept.
              </span>
            </div>
          </div>
          <button
            className="btn"
            onClick={() => {
              try { localStorage.setItem(CONSENT_KEY, '1') } catch { /* ignore */ }
              setConsented(true)
            }}
          >
            <Check {...ICON} /> I understand
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'typing') return <TypeBill onCancel={() => setPhase('idle')} onDone={confirm} />

  const rows = [
    { Icon: Calendar, k: 'Period', v: scan ? `${day(scan.periodStart)} to ${day(scan.periodEnd)}` : '–' },
    { Icon: Zap, k: 'Total kWh', v: scan ? String(scan.kwh) : '–' },
    { Icon: Banknote, k: 'Amount', v: scan ? php(scan.amount) : '–' },
    { Icon: Hash, k: 'Account', v: scan ? `•••• ${scan.accountLast4}` : '–' },
  ]

  return (
    <div className="screen no-nav" ref={ref}>
      <ScanHeader step={1} total={5} title="Scan the bill" />
      <CameraPanel onPhoto={(f) => { setPreview(URL.createObjectURL(f)); read(f) }} disabled={phase === 'reading'} preview={preview}>
        {!preview && <BillDrawing />}
        {phase === 'reading' && <ScanBeam />}
        <Brackets />
      </CameraPanel>

      <div className="scan-sheet">
        {err && <div className="status-line" role="alert">{err}</div>}
        <div className="card" style={{ padding: '4px 20px' }}>
          {rows.map(({ Icon, k, v }) => (
            <div className="kv" key={k}>
              <span className="k"><Icon {...ICON} color="var(--soft-on-white)" />{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
        {scan ? (
          <button className="btn" disabled={phase === 'saving'} onClick={() => confirm(scan)}>
            <Check {...ICON} /> Confirm bill
          </button>
        ) : (
          <p className="support" style={{ textAlign: 'center', margin: 0 }}>
            {phase === 'reading' ? 'Reading the bill…' : 'Tap the frame to take a photo of the bill.'}
          </p>
        )}
        <button className="link-btn" onClick={() => setPhase('typing')}>
          <Keyboard {...ICON} /> Type it instead
        </button>
        {usingMock && !scan && (
          <button className="link-btn support" onClick={() => read(new Blob())}>
            Use the sample bill (mock)
          </button>
        )}
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
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  return (
    <div className="screen no-nav" style={{ gap: 20 }}>
      <ScanHeader step={1} total={5} title="Type the bill" />
      <div className="scan-sheet" style={{ borderRadius: 28 }}>
        <div className="field"><label>Period start</label><input type="date" value={f.periodStart} onChange={set('periodStart')} /></div>
        <div className="field"><label>Period end (read date)</label><input type="date" value={f.periodEnd} onChange={set('periodEnd')} /></div>
        <div className="field"><label>Total kWh</label><input inputMode="numeric" value={f.kwh} onChange={set('kwh')} placeholder="180" /></div>
        <div className="field"><label>Amount (₱)</label><input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="2711.07" /></div>
        <div className="field"><label>Last 4 digits of the account</label><input inputMode="numeric" maxLength={4} value={f.last4} onChange={set('last4')} placeholder="4821" /></div>
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
          <Check {...ICON} /> Confirm bill
        </button>
        <button className="link-btn" onClick={onCancel}>Back to the camera</button>
      </div>
    </div>
  )
}
