import { useCallback, useEffect, useRef, useState } from 'react'
import { Flashlight, FlashlightOff } from 'lucide-react'
import { ICON } from './ui'
import { useT } from '../i18n/copy'

/**
 * Live rear-camera viewfinder. Fills its parent (.viewfinder), sits under the lime
 * brackets, and returns a JPEG through onPhoto. Tracks are stopped on unmount, on
 * capture and while the page is hidden. Calls onUnavailable when no stream can be had
 * (no API, insecure page, permission denied, no camera) so the caller can fall back.
 */
export function LiveCamera({
  onPhoto,
  onUnavailable,
}: {
  onPhoto: (file: File, capturedAt: string) => void
  onUnavailable: () => void
}) {
  const { t } = useT()
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [torchOk, setTorchOk] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  // Latest callback without re-running the camera effect.
  const unavailable = useRef(onUnavailable)
  unavailable.current = onUnavailable

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((tr) => tr.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
    setReady(false)
    setTorchOk(false)
    setTorchOn(false)
  }, [])

  useEffect(() => {
    let alive = true
    let starting = false

    const start = async () => {
      if (starting || stream.current) return
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        unavailable.current()
        return
      }
      starting = true
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        // Unmounted, or the page was hidden, while the permission prompt was open.
        if (!alive || document.hidden) {
          s.getTracks().forEach((tr) => tr.stop())
          return
        }
        stream.current = s
        const v = video.current
        if (v) {
          v.srcObject = s
          try {
            await v.play()
          } catch {
            // Autoplay can be refused; the stream is still attached and autoPlay retries.
          }
        }
        if (!alive || stream.current !== s) return
        const track = s.getVideoTracks()[0]
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined
        setTorchOk(!!caps?.torch)
        setReady(true)
      } catch {
        if (alive) unavailable.current()
      } finally {
        starting = false
      }
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else void start()
    }

    void start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisibility)
      stream.current?.getTracks().forEach((tr) => tr.stop())
      stream.current = null
    }
  }, [stop])

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      setTorchOn(next)
    } catch {
      setTorchOk(false)
    }
  }

  const capture = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const capturedAt = new Date().toISOString()
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height)
    stop()
    canvas.toBlob(
      (blob) => {
        if (blob) onPhoto(new File([blob], `kahati-${Date.now()}.jpg`, { type: 'image/jpeg' }), capturedAt)
        else unavailable.current()
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <>
      <video ref={video} className={`lc-video${ready ? ' on' : ''}`} playsInline muted autoPlay />
      {!ready && <span className="lc-skeleton" aria-hidden="true" />}
      {ready && torchOk && (
        <button
          type="button"
          className="lc-torch"
          aria-pressed={torchOn}
          aria-label={t('scan.torch')}
          onClick={toggleTorch}
        >
          {torchOn ? <FlashlightOff {...ICON} /> : <Flashlight {...ICON} />}
        </button>
      )}
      <button
        type="button"
        className="lc-shutter"
        aria-label={t('scan.shutter')}
        disabled={!ready}
        onClick={capture}
      />
    </>
  )
}
