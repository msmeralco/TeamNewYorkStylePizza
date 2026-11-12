import { useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Leaf, MessageCircle, ReceiptText, ShieldCheck, TrendingUp } from 'lucide-react'
import { api } from '../api'
import { CountUp, useReveal } from '../components/motion'
import { TenantSkeleton } from '../components/Skeletons'
import { ErrorState, Footnote, ICON, toast } from '../components/ui'
import { useT } from '../i18n/copy'
import { php } from '../lib/format'
import { useAsync } from '../lib/useAsync'

export default function Tenant() {
  const { token = '' } = useParams()
  const { t } = useT()
  const { data, error, loading, reload } = useAsync(() => api.getTenantView(token), [token])
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, !!data)

  if (error) return <div className="screen no-nav"><ErrorState error={error} onRetry={reload} /></div>
  if (loading && !data) return <TenantSkeleton />
  const v = data!

  async function askForComputation() {
    const text =
      `Hi! Kahati computed my share of the bill as ${php(v.share)} for ${v.kwh} kWh, ` +
      `using the bill's own lines. Could we go over the computation together? ` +
      `${window.location.origin}/t/${token}/bill`
    try {
      if (navigator.share) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast('Message copied. Paste it to the organizer.')
      }
    } catch {
      /* user closed the share sheet */
    }
  }

  return (
    <div className="screen no-nav" ref={ref}>
      <h1 className="title">Hi, {v.name}</h1>

      <div className="hero">
        <p className="support" style={{ margin: 0, color: 'var(--white)', fontWeight: 600 }}>{t('share.label')}</p>
        <p className="hero-num lime" style={{ fontSize: 'calc(var(--hero) * 1.18)', marginTop: 6 }}><CountUp value={v.share} format={php} /></p>
        <span className="icon-chip lime corner"><ShieldCheck {...ICON} /></span>
      </div>

      {v.askedToPay != null && v.aboveBillRate != null && v.aboveBillRate > 0.005 && (
        <div className="tiles">
          <div className="tile">
            <span className="icon-chip"><ReceiptText {...ICON} size={16} /></span>
            <span className="support" style={{ fontSize: 14 }}>You were asked to pay</span>
            <span className="num">{php(v.askedToPay)}</span>
          </div>
          <div className="tile">
            <span className="icon-chip"><TrendingUp {...ICON} size={16} /></span>
            <span className="support" style={{ fontSize: 14 }}>Above the bill's rate by</span>
            <span className="num">{php(v.aboveBillRate)}</span>
          </div>
        </div>
      )}

      <div className="card note">
        <span className="icon-chip lime"><Leaf {...ICON} /></span>
        <span className="body">{t('usage.perkwh', { n: Math.round(v.perKwhValue) })}</span>
      </div>

      <div className="spacer" />
      <Footnote>{t('footer.source')}</Footnote>
      <div className="stack">
        <Link className="btn" to={`/t/${token}/bill`}>
          <ReceiptText {...ICON} /> See what you pay for
        </Link>
        <button className="link-btn" onClick={askForComputation}>
          <MessageCircle {...ICON} /> Ask for the computation
        </button>
      </div>
    </div>
  )
}
