type JsQR = typeof import('jsqr').default

const MAX_FULL = 2000 // longest side when the whole image is scanned
const MAX_QUAD = 1400 // longest side for each quadrant

type Source = { img: CanvasImageSource; w: number; h: number; close?: () => void }

async function load(file: Blob): Promise<Source | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      return { img: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() }
    } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const el = new Image()
    el.src = url
    await el.decode()
    return { img: el, w: el.naturalWidth, h: el.naturalHeight }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

const isScenario = (text: string) => /#(?:s2|scenarioz?)=/.test(text)

/** Draws a region (source pixels) scaled to fit `max`, then runs jsQR on it. */
function scan(jsQR: JsQR, src: Source, sx: number, sy: number, sw: number, sh: number, max: number): string | null {
  const k = Math.min(1, max / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src.img, sx, sy, sw, sh, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  const hit = jsQR(data.data, w, h, { inversionAttempts: 'dontInvert' })
  return hit && isScenario(hit.data) ? hit.data : null
}

/** Looks for a lab scenario link QR in a photo of a bill. Null when there is none. */
export async function findScenarioLink(file: Blob): Promise<string | null> {
  const src = await load(file)
  const { default: jsQR } = await import('jsqr') // loaded on first scan, not at startup
  if (!src || !src.w || !src.h) return null
  try {
    const full = scan(jsQR, src, 0, 0, src.w, src.h, MAX_FULL)
    if (full) return full
    // A small QR in a corner decodes better when that corner fills the frame. Quadrants overlap a little
    // so a code on a seam is not cut in half.
    const hw = Math.ceil(src.w * 0.55)
    const hh = Math.ceil(src.h * 0.55)
    for (const [x, y] of [[0, 0], [src.w - hw, 0], [0, src.h - hh], [src.w - hw, src.h - hh]]) {
      const hit = scan(jsQR, src, x, y, hw, hh, MAX_QUAD)
      if (hit) return hit
    }
    return null
  } catch {
    return null
  } finally {
    src.close?.()
  }
}
