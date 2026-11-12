import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, CircleAlert, CircleCheck, Pencil } from 'lucide-react'
import { api, showDevTools, type MeterScan } from '../api'
import { Brackets, CameraPanel, ScanBeam, ScanHeader } from '../components/Scan'
import { reduceMotion, useReveal } from '../components/motion'
import { ScanSkeleton } from '../components/Skeletons'
import { ErrorState, ICON } from '../components/ui'
import { useErrText, useT } from '../i18n/copy'
import { meterDigits } from '../lib/format'
import { notifyChange, useAsync } from '../lib/useAsync'

export default function ScanMeter() {
  const { householdId = 'A' } = useParams()
  const nav = useNavigate()
  const { t } = useT()
  const errText = useErrText()
  const month = useAsync(() => api.getMonth(), [])
  const [phase, setPhase] = useState<'idle' | 'reading' | 'read' | 'editing' | 'saving'>('idle')
  const [scan, setScan] = useState<MeterScan>()
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState<string>()
  const [err, setErr] = useState<string>()
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, !!month.data, householdId)
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

  if (month.error) return <div className="screen no-nav"><ErrorState error={month.error} onRetry={month.reload} /></div>
  if (!month.data) return <ScanSkeleton />

  const hs = month.data.households
  const idx = hs.findIndex((h) => h.id === householdId)
  const h = hs[idx]
  if (!h) return <div className="screen no-nav"><ErrorState error={Object.assign(new Error(''), { code: 'unknown_household' })} /></div>

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
      const next = hs.slice(idx + 1).find((x) => !x.reading)
      nav(next ? `/scan/meter/${next.id}` : '/')
    } catch (e) {
      setErr(errText(e, 'scan.errSaveReading'))
      setPhase(source === 'typed' ? 'editing' : 'read')
    }
  }

  const shown = scan ? meterDigits(scan.value) : '-----'
  const typedN = Number(typed)

  return (
    <div className="screen no-nav" ref={ref}>
      <ScanHeader step={idx + 1} total={hs.length} title={h.name} />
      <CameraPanel onPhoto={(f) => { setPreview(URL.createObjectURL(f)); read(f) }} disabled={phase === 'reading'} preview={preview}>
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
            {typed && <p className="support" style={{ margin: 0 }}>{t('scan.sinceLast', { n: typedN - h.previousReading })}</p>}
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
              <span className="body" style={{ fontWeight: 500 }}>{t('scan.sinceLast', { n: scan.kwhSinceLast })}</span>
              <span className="meta" style={{ fontSize: 14 }}>
                {scan.serialMatches ? <CircleCheck size={15} strokeWidth={1.75} /> : <CircleAlert size={15} strokeWidth={1.75} />}
                {t(scan.serialMatches ? 'scan.serialMatch' : 'scan.serialNo', { s: scan.serial, name: h.name })}
              </span>
              {scan.needsSecondLook && <span className="meta"><CircleAlert size={15} strokeWidth={1.75} />{t('check.second')}</span>}
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
