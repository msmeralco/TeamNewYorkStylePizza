import { startedFresh } from './lib/fresh' // must stay first: wipes the saved month before the API loads it
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { Splash } from './components/Splash'
import { ScanOverlay, isScanPath } from './components/ScanOverlay'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import './index.css'
import { api } from './api'
import { useAsync } from './lib/useAsync'
import { inflateScenarioPayload } from './lib/scenarioLink'
import { ScanSkeleton } from './components/Skeletons'
import { LangProvider, useT } from './i18n/copy'
import { BareShell, TabShell } from './components/Shell'
import { ToastHost, toast } from './components/ui'
import Home from './screens/Home'
import ScanBill from './screens/ScanBill'
import ScanMeter from './screens/ScanMeter'
import BillScreen from './screens/Bill'
import Usage from './screens/Usage'
import Check from './screens/Check'
import Tenant from './screens/Tenant'
import Ask from './screens/Ask'

// The lab's QR uses a compressed form (#scenarioz=<base64url(deflate-raw(JSON))>) to fit a phone QR.
// Inflate it into the plain #scenario= form first, then import as usual.
async function inflateScenarioHash() {
  const hit = /(?:^#|&)scenarioz=([^&]*)/.exec(window.location.hash)
  if (!hit) return
  const plain = (await inflateScenarioPayload(hit[1])) ?? '!' // '!' fails validation: the person is told the link is damaged
  try { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#scenario=${plain}`) } catch { /* ignore */ }
}
await inflateScenarioHash()
// A scenario link pasted into an already-open tab only changes the hash; reload so it is imported.
window.addEventListener('hashchange', () => {
  if (/(?:^#|&)(?:scenarioz?|s2)=/.test(window.location.hash) || window.location.hash === '#fresh') window.location.reload()
})

// A lab link (#scenario=...) is imported once, before the first screen reads any state.
// The compact #s2= form is rebuilt from the sample states, so it is read here (async) instead.
const compactHash = /(?:^#|&)s2=/.test(window.location.hash)
const scenarioImport = compactHash ? await importCompactHash() : api.importScenarioFromHash()
async function importCompactHash() {
  const link = window.location.hash
  try { history.replaceState(null, '', window.location.pathname + window.location.search) } catch { /* ignore */ }
  return api.importScenarioLink(link, { force: true })
}

/** Tells the person what the link did, once the splash is gone. */
function ScenarioToast({ ready }: { ready: boolean }) {
  const { t } = useT()
  const shown = useRef(false)
  useEffect(() => {
    if (!ready || shown.current) return
    if (startedFresh && !scenarioImport) {
      shown.current = true
      toast(t('scenario.fresh'))
      return
    }
    if (!scenarioImport) return
    shown.current = true
    toast(scenarioImport.ok ? t('scenario.loaded', { name: scenarioImport.name }) : t('scenario.invalid', { why: scenarioImport.reason }))
  }, [ready, t])
  return null
}

function Root() {
  const [booting, setBooting] = useState(true)
  const done = useCallback(() => setBooting(false), [])
  return (
    <>
      <App ready={!booting} />
      {booting && <Splash onDone={done} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

function App({ ready }: { ready: boolean }) {
  return (
    <LangProvider>
      <BrowserRouter>
        <AppRoutes />
        <ToastHost />
        <ScenarioToast ready={ready} />
      </BrowserRouter>
    </LangProvider>
  )
}

function lastBill() {
  try { return sessionStorage.getItem('kahati-last-bill') || 'B' } catch { return 'B' }
}

/** /scan goes to the next step not yet done, so the bill is never re-confirmed by accident. */
function ScanRedirect() {
  const { data, error } = useAsync(() => api.getMonth(), [])
  // Only consulted once A to D are done.
  const own = useAsync(async () => {
    try {
      const p = (await api.getUsage('BAU')).points.find((x) => x.kind === 'photo')
      return { kwh: p ? p.kwhUsed : null }
    } catch {
      return { kwh: null as number | null }
    }
  }, [])
  if (error) return <Navigate to="/scan/bill" replace />
  if (!data) return <ScanSkeleton />
  if (!data.bill) return <Navigate to="/scan/bill" replace />
  const next = data.households.find((h) => !h.reading)
  if (next) return <Navigate to={`/scan/meter/${next.id}`} replace />
  // A to D are done: Bautista's own meter is the last step. When everything is done, the Scan tab
  // opens the bill step for review (saved values, "Keep and go next", or rescan); it never bounces Home.
  if (own.error || !own.data) return own.error ? <Navigate to="/scan/bill" replace /> : <ScanSkeleton />
  return <Navigate to={own.data.kwh == null ? '/scan/meter/BAU?flow=1' : '/scan/bill'} replace />
}

/** Tabs and tenant pages render normally; scan routes render in a sheet over the last tab. */
function AppRoutes() {
  const loc = useLocation()
  const lastTab = useRef<Location | { pathname: string }>({ pathname: '/' })
  const scanning = isScanPath(loc.pathname)
  if (!scanning) lastTab.current = loc
  return (
    <>
      <Routes location={scanning ? lastTab.current : loc}>
          <Route element={<TabShell />}>
            <Route index element={<Home />} />
            <Route path="bill" element={<Navigate to={`/bill/${lastBill()}`} replace />} />
            <Route path="bill/:householdId" element={<BillScreen />} />
            <Route path="usage" element={<Navigate to="/usage/BAU" replace />} />
            <Route path="usage/:householdId" element={<Usage />} />
            <Route path="check" element={<Check />} />
          </Route>
          <Route element={<BareShell />}>
            <Route path="t/:token" element={<Tenant />} />
            <Route path="t/:token/bill" element={<BillScreen tenant />} />
            <Route path="t/:token/ask" element={<Ask tenant />} />
            <Route path="ask/:householdId" element={<Ask />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ScanOverlay background={lastTab.current}>
        <Route path="scan" element={<ScanRedirect />} />
        <Route path="scan/bill" element={<ScanBill />} />
        <Route path="scan/meter/:householdId" element={<ScanMeter />} />
      </ScanOverlay>
    </>
  )
}
