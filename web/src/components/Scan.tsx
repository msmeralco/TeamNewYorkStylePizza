import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useCloseScan } from './ScanOverlay'
import { ChevronLeft, ImageUp, RotateCcw, X } from 'lucide-react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ICON } from './ui'
import { useT } from '../i18n/copy'
import { LiveCamera } from './LiveCamera'

export function ScanHeader({ step, total, title, onBack }: { step: number; total: number; title: string; onBack?: () => void }) {
  const close = useCloseScan()
  const { t } = useT()
  return (
    // 8px between the step dashes / close row and the title (was 16px).
    <div className="stack-lg" style={{ gap: 8 }}>
      <div className="row-between">
        {onBack ? (
          <button className="icon-btn" aria-label={t('scan.back')} onClick={onBack}>
            <ChevronLeft {...ICON} />
          </button>
        ) : (
          // Keeps the step dashes in the same place when there is no back button.
          <span aria-hidden style={{ width: 40, height: 40, flex: 'none' }} />
        )}
        <div className="dashes" aria-label={t('scan.step', { n: step, total })}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < step ? 'on' : ''} />
          ))}
        </div>
        <button className="icon-btn" aria-label={t('common.close')} onClick={close}>
          <X {...ICON} />
        </button>
      </div>
      <h1 className="title">{title}</h1>
    </div>
  )
}

/** Lime beam sweeping the frame while the model reads the photo. */
export function ScanBeam() {
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useT()
  useGSAP(() => {
    gsap.fromTo(ref.current, { top: '18%' }, { top: '82%', duration: 1.1, ease: 'sine.inOut', repeat: -1, yoyo: true })
  })
  return <div className="scan-beam" ref={ref} aria-label={t('scan.reading')} />
}

export function Brackets() {
  return (
    <div className="brackets">
      <i />
      <i />
      <i />
      <i />
    </div>
  )
}

/**
 * Viewfinder with a live rear camera (in-app capture, so the capture time is ours and
 * an old gallery photo cannot be passed off). If the camera cannot start it falls back
 * to a tappable frame that opens the phone's camera app.
 */
export function CameraPanel({
  onPhoto,
  disabled,
  preview,
  children,
}: {
  onPhoto: (file: File, capturedAt: string) => void
  disabled?: boolean
  preview?: string
  children: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const { t } = useT()
  const [mode, setMode] = useState<'live' | 'frozen' | 'fallback'>('live')
  const [frozen, setFrozen] = useState<string>()

  const setFrame = (url?: string) => {
    setFrozen((old) => {
      if (old) URL.revokeObjectURL(old)
      return url
    })
  }
  const latest = useRef<string | undefined>(undefined)
  latest.current = frozen
  useEffect(() => () => { if (latest.current) URL.revokeObjectURL(latest.current) }, [])

  const fallback = useCallback(() => setMode('fallback'), [])
  const upload = useRef<HTMLInputElement>(null)

  if (mode === 'fallback') {
    return (
      <button
        className="viewfinder"
        disabled={disabled}
        onClick={() => input.current?.click()}
        aria-label={t('scan.takePhoto')}
      >
        {preview && <img src={preview} alt="" />}
        {children}
        {!preview && <span className="lc-hint">{t('scan.cameraFallback')}</span>}
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onPhoto(f, new Date().toISOString())
            e.target.value = ''
          }}
        />
      </button>
    )
  }

  return (
    <div className={`viewfinder${mode === 'live' ? ' is-live' : ''}`}>
      {mode === 'live' && (
        <LiveCamera
          onUnavailable={fallback}
          onPhoto={(f, at) => {
            setFrame(URL.createObjectURL(f))
            setMode('frozen')
            onPhoto(f, at)
          }}
        />
      )}
      {mode === 'live' && !disabled && (
        <>
          <button
            type="button"
            className="lc-upload"
            aria-label={t('scan.upload')}
            onClick={() => upload.current?.click()}
          >
            <ImageUp {...ICON} /> {t('scan.uploadShort')}
          </button>
          {/* No capture attribute: phones offer the photo library as well as the camera. */}
          <input
            ref={upload}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              setFrame(URL.createObjectURL(f))
              setMode('frozen')
              onPhoto(f, new Date(f.lastModified || Date.now()).toISOString())
            }}
          />
        </>
      )}
      {mode === 'frozen' && frozen && <img className="lc-frozen" src={frozen} alt="" />}
      {children}
      {mode === 'frozen' && !disabled && (
        <button
          type="button"
          className="lc-retake"
          onClick={() => {
            setFrame(undefined)
            setMode('live')
          }}
        >
          <RotateCcw {...ICON} /> {t('scan.retake')}
        </button>
      )}
    </div>
  )
}
