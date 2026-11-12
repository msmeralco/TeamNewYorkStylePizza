import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUp, CircleAlert, ShieldCheck, Sparkles } from 'lucide-react'
import gsap from 'gsap'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { api, type AskPreset, type AskPresetId, type AskTurn } from '../api'
import { reduceMotion } from '../components/motion'
import { ICON } from '../components/ui'
import { useErrText, useT } from '../i18n/copy'
import { useAsync } from '../lib/useAsync'

interface Msg {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Out of scope: shown softer. */
  refused?: boolean
  /** Our own error line, never sent back as history. */
  error?: boolean
  /** needs_* errors: where the Scan link goes. */
  scanTo?: string
  scanLabel?: 'check.scanMeter' | 'home.scanBill'
  suggestions?: AskPreset[]
}

gsap.registerPlugin(ScrollToPlugin)

const MAX_CHARS = 500 // contract: free text up to 500 characters
const MAX_HISTORY = 6 // contract: history is at most 6 turns

/**
 * Ask Kahati: a narrow explainer about ONE household's numbers (docs/API.md).
 * Preset questions are answered from templates, instantly and the same every time,
 * so they lead. Free text is optional and goes to the backend's grounded model.
 */
export default function Ask({ tenant = false }: { tenant?: boolean }) {
  const { householdId, token } = useParams()
  const nav = useNavigate()
  const { t, lang } = useT()
  const errText = useErrText()

  const presets = useAsync(() => api.getAskPresets(lang), [lang])
  const who = useAsync(async () => {
    if (tenant) return (await api.getTenantView(token!)).name
    if (householdId === 'BAU') return (await api.getOwnMeter()).name
    const m = await api.getMonth()
    return m.households.find((h) => h.id === householdId)?.name ?? ''
  }, [tenant, token, householdId])
  // The chat waits for the household's name, so the greeting never shows its unnamed form first.
  const ready = !who.loading

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const nextId = useRef(1)
  const list = useRef<HTMLDivElement>(null)
  const dots = useRef<HTMLDivElement>(null)
  const lastKey = useRef('')
  const lastChips = useRef('')
  const head = useRef<HTMLDivElement>(null)
  const foot = useRef<HTMLDivElement>(null)
  const sub = useRef<HTMLSpanElement>(null)

  // Load-in, like the other screens: the header and the input area fade in place on open
  // (0.4s, input 0.1s after); the greeting and chips follow once the name is known (below).
  useLayoutEffect(() => {
    if (reduceMotion()) return
    const els = [head.current, foot.current].filter(Boolean)
    // fromTo (not from) with a revert on cleanup, so a re-run never fades from 0 to 0.
    const tw = gsap.fromTo(els, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, stagger: 0.1, ease: 'power1.out', clearProps: 'opacity,visibility' })
    return () => { tw.revert() }
  }, [])

  // Start over when the household or language changes.
  useEffect(() => {
    setMsgs([])
  }, [householdId, token, lang])

  // The "About <name>'s bill" line arrives with the name: fade it in where it appears.
  const nameText = who.data ?? ''
  useLayoutEffect(() => {
    if (!nameText || !sub.current || reduceMotion()) return
    const tw = gsap.fromTo(sub.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' })
    return () => { tw.kill() }
  }, [nameText])

  // Motion, all in place (nothing slides or bounces):
  // - an answer writes itself in, word by word, as soft fades (at most about a second)
  // - questions, errors and the typing bubble fade in
  // - chips fade in row by row, top to bottom (rows ~45ms apart, all done in ~0.4s), once the answer has finished
  // - the list eases down to the newest message (the scroll moves, items do not)
  useLayoutEffect(() => {
    const el = list.current
    if (!el || !ready) return
    if (reduceMotion()) {
      el.scrollTop = el.scrollHeight
      return
    }
    gsap.to(el, { scrollTo: { y: 'max' }, duration: 0.5, ease: 'power2.out', overwrite: true })

    // When only the preset list arrived (no new message), animate just the chips.
    const key = `${msgs.length}-${pending}`
    const newBubble = lastKey.current !== key
    lastKey.current = key
    const bubbles = el.querySelectorAll<HTMLElement>('.msg')
    const last = newBubble ? bubbles[bubbles.length - 1] : undefined
    let chipsDelay = 0.1
    const words = last?.querySelectorAll('.w') ?? []
    if (words.length) {
      // Spread the words over at most ~0.9s, never slower than 35ms a word.
      const each = Math.min(0.035, 0.9 / words.length)
      gsap.fromTo(words, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, ease: 'power1.out', stagger: each })
      chipsDelay = words.length * each + 0.2
    } else if (last) {
      gsap.fromTo(last, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' })
      chipsDelay = 0.25
    } else {
      chipsDelay = 0
    }
    // Only when the set of chips changed, so a preset reload never replays the fade.
    const chipEls = el.querySelectorAll<HTMLElement>('.ask-chip')
    const chipKey = [...chipEls].map((c) => c.textContent).join('|')
    if (chipEls.length && chipKey !== lastChips.current) {
      // Group by wrapped row (chips on one line fade together), then fade the rows top to bottom.
      const rows = new Map<number, HTMLElement[]>()
      for (const c of chipEls) {
        const top = Math.round(c.offsetTop)
        rows.set(top, [...(rows.get(top) ?? []), c])
      }
      ;[...rows.keys()].sort((a, b) => a - b).forEach((top, i) => {
        gsap.fromTo(rows.get(top)!, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: 'power1.out', delay: chipsDelay + i * 0.045 })
      })
    }
    lastChips.current = chipKey
  }, [msgs.length, pending, presets.data, ready])

  // Typing indicator: three dots breathing in turn.
  useEffect(() => {
    if (!pending || !dots.current || reduceMotion()) return
    const tw = gsap.to(dots.current.children, { opacity: 0.25, duration: 0.45, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.15 })
    return () => {
      tw.kill()
    }
  }, [pending])

  async function send(q: { presetId?: AskPresetId; question?: string; label: string }) {
    if (pending) return
    const history: AskTurn[] = msgs
      .filter((m) => !m.error)
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, text: m.text }))
    setMsgs((cur) => [...cur, { id: nextId.current++, role: 'user', text: q.label }])
    setPending(true)
    try {
      const a = await api.ask({
        ...(tenant ? { tenantToken: token } : { householdId }),
        presetId: q.presetId,
        question: q.question,
        language: lang,
        history,
      })
      setMsgs((cur) => [
        ...cur,
        { id: nextId.current++, role: 'assistant', text: a.answer, refused: a.refused, suggestions: a.suggestions },
      ])
    } catch (e) {
      const needs = ((e as { code?: string } | null)?.code ?? '').startsWith('needs_')
      const scanTo = needs && !tenant ? (householdId === 'BAU' ? '/scan/meter/BAU' : '/scan') : undefined
      // The chip names what gets scanned next: the bill first, then the meters.
      const hasBill = scanTo === '/scan' ? !!(await api.getMonth().catch(() => null))?.bill : true
      const scanLabel = scanTo ? (hasBill ? 'check.scanMeter' : 'home.scanBill') : undefined
      setMsgs((cur) => [...cur, { id: nextId.current++, role: 'assistant', text: errText(e, 'ask.err'), error: true, scanTo, scanLabel }])
    } finally {
      setPending(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const q = draft.trim()
    if (!q || q.length > MAX_CHARS) return
    setDraft('')
    send({ question: q, label: q })
  }

  function back() {
    if (window.history.length > 1) nav(-1)
    else nav(tenant ? `/t/${token}` : `/bill/${householdId}`)
  }

  const name = who.data ?? ''
  const last = msgs[msgs.length - 1]
  // Chips: the presets before the first question, then each answer's suggestions
  // (or the presets again after an error).
  const chips: AskPreset[] =
    msgs.length === 0
      ? presets.data ?? []
      : last && last.role === 'assistant' && !pending
        ? last.error
          ? presets.data ?? []
          : last.suggestions ?? []
        : []

  return (
    <div className="screen no-nav ask">
      <div className="ask-head" ref={head}>
        <button className="icon-btn" onClick={back} aria-label={t('common.back')}>
          <ArrowLeft {...ICON} />
        </button>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h1 className="title ask-title">{t('ask.title')}</h1>
          {name && <span className="support ask-sub" ref={sub}>{t('ask.about', { name })}</span>}
        </div>
      </div>

      <div className="ask-list" ref={list} aria-live="polite" style={ready ? undefined : { visibility: 'hidden' }}>
        <div className="msg bot">
          <span className="msg-mark"><Sparkles size={14} strokeWidth={1.75} /></span>
          <p>{name ? t('ask.intro', { name }) : t('ask.introNoName')}</p>
        </div>

        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'bot'}${m.refused ? ' refused' : ''}${m.error ? ' error' : ''}`}>
            {m.error && <CircleAlert size={15} strokeWidth={1.75} className="msg-icon" />}
            <p>
              {m.role === 'assistant' && !m.error
                ? // Each word is its own span so the answer can fade in word by word, in place.
                  m.text.split(/(\s+)/).map((part, i) => (/^\s+$/.test(part) ? part : <span className="w" key={i}>{part}</span>))
                : m.text}
            </p>
            {m.scanTo && m.scanLabel && <Link className="chip sm" to={m.scanTo}>{t(m.scanLabel)}</Link>}
          </div>
        ))}

        {pending && (
          <div className="msg bot typing" aria-label={t('ask.thinking')}>
            <div className="dots" ref={dots}>
              <i />
              <i />
              <i />
            </div>
          </div>
        )}

        {chips.length > 0 && (
          <div className="ask-chips">
            {chips.map((p) => (
              <button key={p.id} className="ask-chip" onClick={() => send({ presetId: p.id, label: p.question })}>
                {p.question}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ask-foot" ref={foot}>
        <p className="footnote ask-note">
          <ShieldCheck {...ICON} size={14} />
          <span>{t('footer.source')}</span>
        </p>
        <form className="ask-compose" onSubmit={submit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
            placeholder={t('ask.placeholder')}
            aria-label={t('ask.placeholder')}
            enterKeyHint="send"
            maxLength={MAX_CHARS}
          />
          <button className="ask-send" type="submit" disabled={!draft.trim() || pending} aria-label={t('ask.send')}>
            <ArrowUp size={20} strokeWidth={2} />
          </button>
        </form>
      </div>
    </div>
  )
}
