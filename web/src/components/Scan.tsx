import { useRef, type ReactNode } from 'react'
import { useCloseScan } from './ScanOverlay'
import { X } from 'lucide-react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ICON } from './ui'
import { useT } from '../i18n/copy'

export function ScanHeader({ step, total, title }: { step: number; total: number; title: string }) {
  const close = useCloseScan()
  const { t } = useT()
  return (
    <div className="stack-lg">
      <div className="row-between">
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
 * Tappable viewfinder that opens the phone camera (in-app capture, so the
 * capture time is ours and an old gallery photo cannot be passed off).
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
  return (
    <button
      className="viewfinder"
      disabled={disabled}
      onClick={() => input.current?.click()}
      aria-label={t('scan.takePhoto')}
    >
      {preview && <img src={preview} alt="" />}
      {children}
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
