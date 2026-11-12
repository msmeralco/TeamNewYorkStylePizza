import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUp, CircleAlert, ShieldCheck, Sparkles } from 'lucide-react'
import gsap from 'gsap'
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
  suggestions?: AskPreset[]
}

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
    if (householdId === 'BAU') return 'Bautista'
    const m = await api.getMonth()
    return m.households.find((h) => h.id === householdId)?.name ?? ''
  }, [tenant, token, householdId])

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const nextId = useRef(1)
  const list = useRef<HTMLDivElement>(null)
  const dots = useRef<HTMLDivElement>(null)

  // Start over when the household or language changes.
  useEffect(() => {
    setMsgs([])
  }, [householdId, token, lang])

  // Keep the newest message in view; fade new messages in place (no movement).
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' })
    const last = el.querySelector('.msg:last-of-type, .ask-chips:last-child')
    if (last && !reduceMotion()) gsap.fromTo(last, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' })
  }, [msgs.length, pending])

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
      setMsgs((cur) => [...cur, { id: nextId.current++, role: 'assistant', text: errText(e, 'ask.err'), error: true }])
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
      <div className="ask-head">
        <button className="icon-btn" onClick={back} aria-label={t('common.back')}>
          <ArrowLeft {...ICON} />
        </button>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <h1 className="title ask-title">{t('ask.title')}</h1>
          {name && <span className="support ask-sub">{t('ask.about', { name })}</span>}
        </div>
      </div>

      <div className="ask-list" ref={list} aria-live="polite">
        <div className="msg bot">
          <span className="msg-mark"><Sparkles size={14} strokeWidth={1.75} /></span>
          <p>{name ? t('ask.intro', { name }) : t('ask.introNoName')}</p>
        </div>

        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'user' : 'bot'}${m.refused ? ' refused' : ''}${m.error ? ' error' : ''}`}>
            {m.error && <CircleAlert size={15} strokeWidth={1.75} className="msg-icon" />}
            <p>{m.text}</p>
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

      <div className="ask-foot">
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
