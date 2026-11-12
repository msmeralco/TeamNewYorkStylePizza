import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import wordmarkRaw from '../assets/kahati_wordmark.svg?raw'
import { reduceMotion } from './motion'

// Inline the wordmark without its own <style>, so CSS can colour the pieces.
const wordmark = wordmarkRaw
  .replace(/<\?xml[^>]*>/, '')
  .replace(/<defs>[\s\S]*?<\/defs>/, '')

/**
 * Loading screen: the four pieces of the K (four kitchens, one meter) fly in
 * and lock together, the letters follow, then the screen lifts away.
 * Waits for fonts so the first screen does not jump.
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = root.current!
    const svg = el.querySelector('svg')!
    const k = Array.from(svg.querySelectorAll(':scope > g > path'))
    const letters = svg.querySelector(':scope > g > g')
    if (reduceMotion()) {
      const id = setTimeout(onDone, 300)
      return () => clearTimeout(id)
    }

    const ctx = gsap.context(() => {
      // Each piece comes from its own corner: top arm, bottom arm, stem cap, stem.
      const from = [
        { x: 16, y: -16, rotation: 25 },
        { x: 16, y: 16, rotation: -25 },
        { x: -6, y: -18, rotation: 0 },
        { x: -6, y: 18, rotation: 0 },
      ]
      // The K assembles in the middle of the screen, then glides left to its
      // place in the wordmark while "ahati" is revealed behind it by a soft,
      // feathered wipe (a mask whose gradient edge travels left to right).
      const NS = 'http://www.w3.org/2000/svg'
      const [vx, vy, vw, vh] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number)
      const start = 20.5 // just left of where the letters begin in the viewBox
      const end = vx + vw
      const FEATHER = 14 // width of the soft edge, in viewBox units (letters span ~66)
      const mk = (tag: string, attrs: Record<string, string | number>) => {
        const el = document.createElementNS(NS, tag)
        for (const [k2, v] of Object.entries(attrs)) el.setAttribute(k2, String(v))
        return el
      }
      const defs = mk('defs', {})
      const grad = mk('linearGradient', { id: 'kahati-feather', gradientUnits: 'userSpaceOnUse', x1: start - FEATHER, x2: start, y1: 0, y2: 0 })
      grad.append(mk('stop', { offset: 0, 'stop-color': '#fff' }), mk('stop', { offset: 1, 'stop-color': '#000' }))
      const mask = mk('mask', { id: 'kahati-wipe', maskUnits: 'userSpaceOnUse', x: vx - 2, y: vy - 2, width: vw + 4, height: vh + 4 })
      mask.append(mk('rect', { x: vx - 2, y: vy - 2, width: vw + 4, height: vh + 4, fill: 'url(#kahati-feather)' }))
      defs.append(grad, mask)
      svg.prepend(defs)
      letters?.setAttribute('mask', 'url(#kahati-wipe)')
      const edge = { x: start }
      const moveEdge = () => {
        grad.setAttribute('x1', String(edge.x - FEATHER))
        grad.setAttribute('x2', String(edge.x))
      }

      gsap.set(svg, { autoAlpha: 1, xPercent: 37.5 }) // K centred on screen
      const tl = gsap.timeline()
      tl.from(k, {
        x: (i) => from[i].x,
        y: (i) => from[i].y,
        rotation: (i) => from[i].rotation,
        transformOrigin: '50% 50%',
        autoAlpha: 0,
        duration: 0.7,
        ease: 'power3.out', // no overshoot
        stagger: 0.09,
      })
        // K glides left to its place in the wordmark...
        .to(svg, { xPercent: 0, duration: 0.75, ease: 'power3.inOut' }, '+=0.1')
        // ...and the letters feather in behind it, slightly after it starts moving.
        .to(edge, { x: end + FEATHER, duration: 0.6, ease: 'sine.inOut', onUpdate: moveEdge }, '<0.15')
        .add(() => {}, '+=0.35')

      Promise.all([tl.then(), document.fonts?.ready ?? Promise.resolve()]).then(() => {
        if (cancelled) return
        ctx.add(() => {
          gsap
            .timeline({ onComplete: onDone })
            .to(svg, { scale: 0.92, autoAlpha: 0, duration: 0.35, ease: 'power2.in' })
            .to(el, { yPercent: -100, duration: 0.6, ease: 'power3.inOut' }, '-=0.1')
        })
      })
    }, el)
    let cancelled = false
    return () => {
      cancelled = true
      ctx.revert()
    }
  }, [onDone])

  return (
    <div className="splash" ref={root} role="status" aria-label="Loading Kahati">
      <div style={{ visibility: 'visible' }} dangerouslySetInnerHTML={{ __html: wordmark }} />
    </div>
  )
}
