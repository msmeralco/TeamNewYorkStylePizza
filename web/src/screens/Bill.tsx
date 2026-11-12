import { useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ArrowLeft, Gauge, Landmark, Layers, Network, TrendingDown, UtilityPole, Zap, type LucideIcon } from 'lucide-react'
import { api, type LineKey } from '../api'
import { CountUp, reduceMotion, useReveal } from '../components/motion'
import { BillSkeleton } from '../components/Skeletons'
import { ErrorState, Footnote, ICON } from '../components/ui'
import { lineKey, useT } from '../i18n/copy'
import { php } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const LINE_STYLE: Record<LineKey, { Icon: LucideIcon; color: string; ink?: string }> = {
  generation: { Icon: Zap, color: 'var(--lime)' },
  transmission: { Icon: UtilityPole, color: '#5C5859', ink: '#fff' },
  systemLoss: { Icon: TrendingDown, color: '#757172', ink: '#fff' },
  distribution: { Icon: Network, color: '#8E8A8A', ink: '#fff' },
  supplyMetering: { Icon: Gauge, color: '#A6A2A1' },
  taxes: { Icon: Landmark, color: '#BDB9B6' },
  other: { Icon: Layers, color: '#D3D0CC' },
}

export default function BillScreen({ tenant = false }: { tenant?: boolean }) {
  const params = useParams()
  const { t } = useT()
  const { data, error, loading, reload } = useAsync(async () => {
    const id = tenant ? (await api.getTenantView(params.token!)).householdId : params.householdId!
    return api.getShare(id)
  }, [params.householdId, params.token])
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, !!data, data?.householdId)
  useGSAP(
    () => {
      if (!data || reduceMotion()) return
      // One sweep left to right across the whole bar (segments keep their final size).
      gsap.fromTo('.stacked', { clipPath: 'inset(0 100% 0 0 round 3px)' }, { clipPath: 'inset(0 0% 0 0 round 3px)', duration: 1.1, ease: 'power2.inOut', delay: 0.15, clearProps: 'clipPath' })
    },
    { scope: ref, dependencies: [data?.householdId] },
  )

  const back = tenant && (
    <Link to={`/t/${params.token}`} className="icon-btn" aria-label={t('common.back')}>
      <ArrowLeft {...ICON} />
    </Link>
  )
  const cls = `screen${tenant ? ' no-nav' : ''}`

  if (error)
    return (
      <div className={cls}>
        {back}
        <h1 className="title">{t('bill.whatYouPay')}</h1>
        <ErrorState error={error} onRetry={reload} />
        {!tenant && <Link className="btn" to="/">{t('bill.goHome')}</Link>}
      </div>
    )
  if (loading && !data) return <BillSkeleton noNav={tenant} />
  const s = data!
  const total = s.lines.reduce((a, l) => a + l.amount, 0)

  return (
    <div className={cls} ref={ref}>
      {back}
      <div className="stack-lg">
        <h1 className="title">{t('bill.title', { household: s.name })}</h1>
        <p className="hero-num"><CountUp value={s.amount} format={php} /></p>
      </div>

      <div className="card" style={{ padding: '20px 20px 4px' }}>
        <div className="stacked" aria-hidden>
          {s.lines.map((l) => (
            <div key={l.key} style={{ flex: l.amount / total, background: LINE_STYLE[l.key].color }} />
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          {s.lines.map((l) => {
            const st = LINE_STYLE[l.key]
            return (
              <div className="list-row" key={l.key}>
                <span className="icon-chip" style={{ background: st.color, color: st.ink ?? 'var(--ink)', width: 30, height: 30 }}>
                  <st.Icon {...ICON} size={16} />
                </span>
                <span className="grow body">{t(lineKey(l.key))}</span>
                <span className="amount">{php(l.amount)}</span>
              </div>
            )
          })}
        </div>
      </div>

      <Footnote>{t('bill.footer')}</Footnote>
    </div>
  )
}
