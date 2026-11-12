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

/** Bautista's own meter id; his name, serial and read-day reading come from the active sample or scenario. */
const OWN_ID = 'BAU'
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
  const own = householdId === OWN_ID
  const ownMeter = useAsync(() => api.getOwnMeter(), [])
  // Bautista's saved reading: his photo point in the forecast (kWh since the read day); getUsage throws until he has scanned.
  const ownSaved = useAsync(async () => {
    if (!own) return { kwh: null as number | null }
    try {
      const p = (await api.getUsage(OWN_ID)).points.find((x) => x.kind === 'photo')
      return { kwh: p ? p.kwhUsed : null }
    } catch {
      return { kwh: null as number | null }
    }
  }, [own])
  useReveal(ref, own ? !!ownMeter.data : !!month.data, householdId)
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

  if (own && ownMeter.error) return <div className="screen no-nav"><ErrorState error={ownMeter.error} onRetry={ownMeter.reload} /></div>
  if (own && (!ownMeter.data || !ownSaved.data)) return <ScanSkeleton />
  if (!own && month.error) return <div className="screen no-nav"><ErrorState error={month.error} onRetry={month.reload} /></div>
  if (!own && !month.data) return <ScanSkeleton />

  const hs = month.data?.households ?? []
  const idx = own ? 0 : hs.findIndex((h) => h.id === householdId)
  const found: Target | undefined = own ? { id: OWN_ID, ...ownMeter.data! } : hs[idx]
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
      await api.confirmReading({
        householdId: h.id,
        value,
        source,
        capturedAt: scan?.capturedAt ?? new Date().toISOString(),
        ...(source === 'photo' && scan ? { confidence: scan.confidence, serialRead: scan.serial || null } : {}),
      })
      notifyChange()
      if (own) {
        // Bautista's own meter: back to the forecast it just updated.
        nav(`/usage/${OWN_ID}`)
        return
      }
      goNext()
    } catch (e) {
      setErr(errText(e, 'scan.errSaveReading'))
      setPhase(source === 'typed' ? 'editing' : 'read')
    }
  }

  // Steps run in order so each one can be reviewed: a step already done shows its saved reading.
  function goNext() {
    // Bautista is the last step: on to his forecast (or Home when opened on its own).
    if (own) { nav(inFlow ? `/usage/${OWN_ID}` : '/'); return }
    const next = hs[idx + 1]
    // After the last sub-meter, step 6 is Bautista's own meter.
    nav(next ? `/scan/meter/${next.id}` : `/scan/meter/${OWN_ID}?flow=1`)
  }
  const back = own
    ? inFlow ? () => nav(`/scan/meter/${hs[hs.length - 1]?.id ?? 'D'}`) : undefined
    : () => nav(idx > 0 ? `/scan/meter/${hs[idx - 1].id}` : '/scan/bill')
  const ownKwh = ownSaved.data?.kwh
  const saved = scan || phase !== 'idle'
    ? undefined
    : own
      ? ownKwh != null ? { value: h.previousReading + ownKwh, kwh: ownKwh } : undefined
      : hs[idx]?.reading

  const shown = scan ? meterDigits(scan.value) : saved ? meterDigits(saved.value) : '-----'
  const typedN = Number(typed)
  // A household month above this is a wrong meter or a wrong month (e.g. lab props scanned
  // without loading the lab's scenario), never a real reading: block it and say why.
  const MAX_MONTH_KWH = 1000
  const tooHigh = (kwh: number) => kwh > MAX_MONTH_KWH
  const since = (n: number) => (own ? t('scan.sinceBill', { n }) : t('scan.sinceLast', { n }))

  return (
    <div className="screen no-nav" ref={ref}>
      <ScanHeader step={own ? (inFlow ? SCAN_STEPS : 1) : idx + 2} total={own && !inFlow ? 1 : SCAN_STEPS} title={h.name} onBack={back} />
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
            {typed && tooHigh(typedN - h.previousReading) && (
              <p className="status-line" role="alert" style={{ margin: 0 }}>{t('scan.tooHigh', { n: typedN - h.previousReading, prev: meterDigits(h.previousReading) })}</p>
            )}
            <button className="btn" disabled={!typed || tooHigh(typedN - h.previousReading)} onClick={() => save(typedN, 'typed')}>
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
              {tooHigh(scan.kwhSinceLast) && (
                <span className="status-line" role="alert">{t('scan.tooHigh', { n: scan.kwhSinceLast, prev: meterDigits(h.previousReading) })}</span>
              )}
              <span className="meta" style={{ fontSize: 14 }}>
                {scan.serialRead && scan.serialMatches ? <CircleCheck size={15} strokeWidth={1.75} /> : <CircleAlert size={15} strokeWidth={1.75} />}
                {!scan.serialRead
                  ? t('scan.serialNotRead')
                  : t(scan.serialMatches ? 'scan.serialMatch' : 'scan.serialNo', { s: scan.serial, name: h.name })}
              </span>
              {(scan.needsSecondLook || !scan.serialRead) && (
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
            <button className="btn" disabled={phase === 'saving' || (scan.serialRead && !scan.serialMatches) || tooHigh(scan.kwhSinceLast)} onClick={() => save(scan.value, 'photo')}>
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
            {saved && phase === 'idle' && (
              <>
                <p className="support scan-hint">{t('scan.savedReading', { value: meterDigits(saved.value), kwh: saved.kwh })}</p>
                <button className="btn" onClick={goNext}>
                  <Check {...ICON} /> {t('scan.keepNext')}
                </button>
              </>
            )}
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
