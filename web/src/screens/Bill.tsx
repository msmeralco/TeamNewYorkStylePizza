import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ArrowLeft, ChevronDown, Gauge, Share2, Sparkles, Tag, Landmark, Layers, Network, TrendingDown, UtilityPole, Zap, type LucideIcon } from 'lucide-react'
import { api, type LineKey } from '../api'
import { CountUp, reduceMotion, useReveal } from '../components/motion'
import { BillSkeleton } from '../components/Skeletons'
import { EmptyState, ErrorState, Footnote, ICON, Sheet, toast } from '../components/ui'
import { lineKey, useT } from '../i18n/copy'
import { kwh as kwhText, php, phpWhole } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import { lifelineDiscount } from '../lib/lifeline'

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
    if (tenant) {
      // The link is the source of truth: the share and its lines come from the token, like the tenant view's header.
      const v = await api.getTenantView(params.token!)
      return { householdId: v.householdId, name: v.name, kwh: v.kwh, amount: v.share, lines: v.lines, sample: v.sample, fourPs: undefined /* tenant links never carry the 4Ps flag */, billKwh: v.billKwh }
    }
    return { ...(await api.getShare(params.householdId!, {})), fourPs: undefined as boolean | undefined, billKwh: undefined as number | undefined }
  }, [params.householdId, params.token])
  const nav = useNavigate()
  const [picking, setPicking] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Organizer only: the households A to D for the picker (the tenant view has no picker).
  const { data: month } = useAsync(async () => (tenant ? null : api.getMonth()), [tenant])
  const people = (month?.households ?? []).filter((h) => h.meterKind === 'sub')
  const currentId = tenant ? undefined : params.householdId
  // Remember the household only once its share loaded, so a failed pick is not reopened next time.
  useEffect(() => {
    if (!currentId || !data || data.householdId !== currentId) return
    try { sessionStorage.setItem('kahati-last-bill', currentId) } catch { /* storage unavailable */ }
  }, [currentId, data])
  const ref = useRef<HTMLDivElement>(null)
  useReveal(ref, !!data, data?.householdId)
  useGSAP(
    () => {
      if (!data || reduceMotion()) return
      // One sweep left to right across the whole bar (segments keep their final size).
      gsap.fromTo('.stacked', { clipPath: 'inset(0 100% 0 0 round 3px)' }, { clipPath: 'inset(0 0% 0 0 round 3px)', duration: 0.7, ease: 'power2.inOut', delay: 0.15, clearProps: 'clipPath' })
    },
    { scope: ref, dependencies: [data?.householdId] },
  )

  const back = tenant && (
    <Link to={`/t/${params.token}`} className="icon-btn" aria-label={t('common.back')}>
      <ArrowLeft {...ICON} />
    </Link>
  )
  const picker = !tenant && people.length > 0 && (
    <Sheet open={picking} onClose={() => setPicking(false)}>
      {people.map((p) => (
        <button key={p.id} className="list-row" onClick={() => { setPicking(false); nav(`/bill/${p.id}`) }}>
          <span className="grow">
            <span className="body">{p.name}</span>
            <span className="meta">{p.reading && p.share ? `${kwhText(p.reading.kwh)} · ${php(p.share.amount)}` : '-'}</span>
          </span>
          {p.id === currentId && <span className="chip">{t('usage.showing')}</span>}
        </button>
      ))}
    </Sheet>
  )
  const cls = `screen scrolls${tenant ? ' no-nav' : ''}`

  if (error && (error as { code?: string }).code === 'needs_scan' && !tenant)
    return (
      <div className={cls}>
        <div className="header-row"><h1 className="title">{t('nav.bill')}</h1></div>
        <EmptyState title={t('bill.emptyTitle')} body={t('bill.emptyBody')} label={t(month?.bill ? 'check.scanMeter' : 'home.scanBill')} onScan={() => nav('/scan')} />
      </div>
    )
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
  // Ask Kahati about this bill: next to the title (organizer) or the back button (tenant).
  const askBtn = (
    <Link className={tenant ? 'icon-btn' : 'icon-btn sm'} to={tenant ? `/t/${params.token}/ask` : `/ask/${s.householdId}`} aria-label={t('ask.open')}>
      <Sparkles {...ICON} size={tenant ? ICON.size : 16} />
    </Link>
  )
  async function shareLink() {
    if (sharing) return
    setSharing(true)
    try {
      const { url } = await api.createTenantLink(s.householdId)
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Kahati', text: t('bill.shareText'), url })
        } catch {
          /* user closed the share sheet */
        }
      } else {
        await navigator.clipboard.writeText(url)
        toast(t('bill.linkCopied'))
      }
    } catch {
      toast(t('bill.shareFailed'))
    } finally {
      setSharing(false)
    }
  }
  // Lifeline is per Meralco account: a 4Ps household at or under 50 kWh still gets none when the compound's one account is above it.
  const fourPs = tenant ? s.fourPs : month?.households.find((h) => h.id === s.householdId)?.fourPs
  const accountKwh = tenant ? s.billKwh : month?.bill?.kwh
  // What lifeline would take off this share on the household's own Meralco meter. It covers most charges but not
  // universal charges (in "other"), so the estimate leaves the "other" line out and is said as "about".
  const ownPct = fourPs ? lifelineDiscount(s.kwh) : 0
  const showLifeline = ownPct > 0 && accountKwh !== undefined && lifelineDiscount(accountKwh) < ownPct
  const otherLine = s.lines.find((l) => l.key === 'other')?.amount ?? 0
  const lifelineSave = showLifeline ? Math.round(ownPct * (s.amount - otherLine)) : 0
  const total = s.lines.reduce((a, l) => a + l.amount, 0)
  // Shown lines are rounded to centavos so they add up exactly to the rounded share (largest remainder).
  const shownLines = (() => {
    const cents = s.lines.map((l) => l.amount * 100)
    const floor = cents.map(Math.floor)
    let left = Math.round(s.amount * 100) - floor.reduce((a, c) => a + c, 0)
    const order = cents.map((c, i) => [c - floor[i], i] as const).sort((a, b) => b[0] - a[0])
    for (const [, i] of order) { if (left <= 0) break; floor[i] += 1; left -= 1 }
    return s.lines.map((l, i) => ({ ...l, amount: floor[i] / 100 }))
  })()

  return (
    <div className={cls} ref={ref}>
      {tenant && (
        <div className="row-between">
          {back}
          {askBtn}
        </div>
      )}
      {/* Organizer: same title-to-number gap as Usage, so the amount sits at the kWh number's height. */}
      <div className="stack-lg" style={tenant ? undefined : { gap: 'calc(var(--gap) * 0.6)' }}>
        {tenant ? (
          <h1 className="title">{t('bill.title', { household: s.name })}</h1>
        ) : (
          <div className="header-row">
            {people.length > 0 ? (
              <button className="title title-btn" onClick={() => setPicking(true)} aria-label={t('usage.choose')}>
                <span className="title-text">{t('bill.title', { household: s.name })}</span>
                <ChevronDown size={20} strokeWidth={2} />
              </button>
            ) : (
              <h1 className="title">{t('bill.title', { household: s.name })}</h1>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="icon-btn sm" onClick={shareLink} disabled={sharing} aria-busy={sharing} aria-label={t('bill.shareLink')}>
                <Share2 {...ICON} size={16} />
              </button>
              {askBtn}
            </div>
          </div>
        )}
        <p className="hero-num"><CountUp value={s.amount} format={php} /></p>
      </div>

      <div className="card bill-lines">
        <div className="stacked" aria-hidden>
          {s.lines.map((l) => (
            <div key={l.key} style={{ flex: l.amount / total, background: LINE_STYLE[l.key].color }} />
          ))}
        </div>
        <div className="bill-rows">
          {shownLines.map((l) => {
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

      {showLifeline && (
        <div className="card note bill-lifeline">
          <span className="icon-chip lime"><Tag {...ICON} /></span>
          <div className="stack" style={{ gap: 2 }}>
            <span className="body">{t('bill.lifelineSave', { amount: phpWhole(lifelineSave), pct: Math.round(ownPct * 100) })}</span>
            <span className="support">{t('bill.lifelineNote', { kwh: accountKwh })}</span>
          </div>
        </div>
      )}
      <Footnote>
        {t(tenant && (data as { sample?: boolean } | undefined)?.sample ? 'bill.footer' : 'bill.footerOwn')}
      </Footnote>
      {picker}
    </div>
  )
}
