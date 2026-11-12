import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Check, CircleAlert, CircleCheck, Pencil } from 'lucide-react'
import { api, showDevTools, type MeterScan } from '../api'
import { Brackets, CameraPanel, ScanBeam, ScanHeader } from '../components/Scan'
import { reduceMotion, useReveal } from '../components/motion'
import { ScanSkeleton } from '../components/Skeletons'
import { ErrorState, ICON } from '../components/ui'
import { useErrText, useT, type TKey } from '../i18n/copy'
import { meterDigits } from '../lib/format'
import { notifyChange, useAsync } from '../lib/useAsync'

/** Scan tab sequence: the bill, the four sub-meters, then Bautista's own meter. */
export const SCAN_STEPS = 6

/** Bautista's own meter (printed prop MM-5520); the bill's read-day reading was 12520. */
const OWN = { id: 'BAU', name: 'Bautista', meterSerial: 'MM-5520', previousReading: 12520 }
type Target = { id: string; name: string; meterSerial: string; previousReading: number }

export default function ScanMeter() {
  const { householdId = 'A' } = useParams()
  // ?flow=1: Bautista reached as step 6 of the Scan tab sequence (not from his Usage screen).
  const inFlow = new URLSearchParams(useLocation().search).get('flow') === '1'
  const nav = useNavigate()
  const { t, hasKey } = useT()
  const errText = useErrText()
  const month = useAsync(() => api.getMonth(), [])
  const [phase, setPhase] = useState<'idle' | 'reading' | 'read' | 'editing' | 'saving'>('idle')
  const [scan, setScan] = useState<MeterScan>()
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState<string>()
  const [err, setErr] = useState<string>()
  const ref = useRef<HTMLDivElement>(null)
  const own = householdId === OWN.id
  useReveal(ref, own || !!month.data, householdId)
  // Digits fade in one by one, in place, when a reading arrives.
  useGSAP(
    () => {
      if (!scan || reduceMotion()) return
      gsap.from('.digits span', { autoAlpha: 0, duration: 0.3, stagger: 0.07, ease: 'power1.out' })
      gsap.from('.scan-sheet .card', { autoAlpha: 0, duration: 0.35, ease: 'power1.out' })
    },
    { scope: ref, dependencies: [scan?.value, scan?.capturedAt] },
  )

  // Reset when moving to the next household.
  useEffect(() => {
    setPhase('idle'); setScan(undefined); setTyped(''); setPreview(undefined); setErr(undefined)
  }, [householdId])

  if (!own && month.error) return <div className="screen no-nav"><ErrorState error={month.error} onRetry={month.reload} /></div>
  if (!own && !month.data) return <ScanSkeleton />

  const hs = month.data?.households ?? []
  const idx = own ? 0 : hs.findIndex((h) => h.id === householdId)
  const found: Target | undefined = own ? OWN : hs[idx]
  if (!found) return <div className="screen no-nav"><ErrorState error={Object.assign(new Error(''), { code: 'unknown_household' })} /></div>
  const h: Target = found

  async function read(file: Blob) {
    setErr(undefined)
    setPhase('reading')
    try {
      setScan(await api.scanMeter(h.id, file))
      setPhase('read')
    } catch (e) {
      setErr(errText(e, 'scan.errReadMeter'))
      setPhase('idle')
    }
  }

  async function save(value: number, source: 'photo' | 'typed') {
    setPhase('saving')
    setErr(undefined)
    try {
      await api.confirmReading({ householdId: h.id, value, source, capturedAt: scan?.capturedAt ?? new Date().toISOString() })
      notifyChange()
      if (own) {
        // Bautista's own meter: back to the forecast it just updated.
        nav(`/usage/${OWN.id}`)
        return
      }
      const next = hs.slice(idx + 1).find((x) => !x.reading)
      // After the last sub-meter, step 6 is Bautista's own meter.
      nav(next ? `/scan/meter/${next.id}` : `/scan/meter/${OWN.id}?flow=1`)
    } catch (e) {
      setErr(errText(e, 'scan.errSaveReading'))
      setPhase(source === 'typed' ? 'editing' : 'read')
    }
  }

  const shown = scan ? meterDigits(scan.value) : '-----'
  const typedN = Number(typed)
  const since = (n: number) => (own ? t('scan.sinceBill', { n }) : t('scan.sinceLast', { n }))

  return (
    <div className="screen no-nav" ref={ref}>
      <ScanHeader step={own ? (inFlow ? SCAN_STEPS : 1) : idx + 2} total={own && !inFlow ? 1 : SCAN_STEPS} title={h.name} />
      <CameraPanel key={householdId} onPhoto={(f) => { setPreview(URL.createObjectURL(f)); read(f) }} disabled={phase === 'reading'} preview={preview}>
        <div style={{ position: 'relative' }}>
          <div className="digits">
            {shown.split('').map((d, i) => <span key={i}>{d === '-' ? '' : d}</span>)}
          </div>
          <div className="serial">{scan?.serial ?? h.meterSerial}</div>
        </div>
        {phase === 'reading' && <ScanBeam />}
        <Brackets />
      </CameraPanel>

      <div className="scan-sheet">
        {err && <div className="status-line" role="alert"><CircleAlert {...ICON} />{err}</div>}

        {phase === 'editing' ? (
          <>
            <div className="field">
              <label>{t('scan.meterLabel', { n: meterDigits(h.previousReading) })}</label>
              <input inputMode="numeric" autoFocus value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
            </div>
            {typed && <p className="support" style={{ margin: 0 }}>{since(typedN - h.previousReading)}</p>}
            <button className="btn" disabled={!typed} onClick={() => save(typedN, 'typed')}>
              <Check {...ICON} /> {t('scan.confirm')}
            </button>
            <div className="scan-foot">
              <button className="link-btn" onClick={() => setPhase(scan ? 'read' : 'idle')}>{t('common.back')}</button>
            </div>
          </>
        ) : scan ? (
          <>
            <div className="card stack" style={{ gap: 6 }}>
              <span className="hero-num">{meterDigits(scan.value)}</span>
              <span className="body" style={{ fontWeight: 500 }}>{since(scan.kwhSinceLast)}</span>
              <span className="meta" style={{ fontSize: 14 }}>
                {scan.serialMatches ? <CircleCheck size={15} strokeWidth={1.75} /> : <CircleAlert size={15} strokeWidth={1.75} />}
                {t(scan.serialMatches ? 'scan.serialMatch' : 'scan.serialNo', { s: scan.serial, name: h.name })}
              </span>
              {scan.needsSecondLook && (
                <span className="meta" style={{ alignItems: 'flex-start' }}>
                  <CircleAlert size={15} strokeWidth={1.75} style={{ flex: 'none', marginTop: 1 }} />
                  <span>
                    {t('check.second')}
                    {/* The specific reasons; the serial line above already covers a serial mismatch. */}
                    {(scan.issues ?? [])
                      .filter((c) => c !== 'serial_mismatch' && hasKey(`issue.${c}`))
                      .map((c) => ` ${t(`issue.${c}` as TKey)}`)
                      .join('')}
                  </span>
                </span>
              )}
              {scan.suggestedValue != null && (
                <button className="chip" onClick={() => setScan({ ...scan, value: scan.suggestedValue!, kwhSinceLast: scan.suggestedValue! - h.previousReading, suggestedValue: undefined })}>
                  {t('scan.didYouMean', { a: meterDigits(scan.suggestedValue), b: meterDigits(scan.value) })}
                </button>
              )}
            </div>
            <button className="btn" disabled={phase === 'saving' || !scan.serialMatches} onClick={() => save(scan.value, 'photo')}>
              <Check {...ICON} /> {t('scan.confirm')}
            </button>
            <div className="scan-foot">
              <button className="link-btn" onClick={() => { setTyped(String(scan.value)); setPhase('editing') }}>
                <Pencil {...ICON} /> {t('scan.fix')}
              </button>
            </div>
          </>
        ) : (
          <div className="scan-foot">
            <p className="support scan-hint">
              {phase === 'reading' ? t('scan.readingMeter') : t('scan.tapMeter', { name: h.name })}
            </p>
            <button className="link-btn" onClick={() => setPhase('editing')}>
              <Pencil {...ICON} /> {t('scan.typeInstead')}
            </button>
            {showDevTools && (
              <button className="link-btn support" onClick={() => read(new Blob())}>{t('scan.sampleMeter')}</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
