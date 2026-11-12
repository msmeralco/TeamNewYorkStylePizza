import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { Splash } from './components/Splash'
import { ScanOverlay, isScanPath } from './components/ScanOverlay'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import './index.css'
import { api } from './api'
import { useAsync } from './lib/useAsync'
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
  let plain = '!'
  try {
    const b64 = hit[1].replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
    const utf8 = new TextEncoder().encode(json)
    let s = ''
    for (const b of utf8) s += String.fromCharCode(b)
    plain = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } catch {
    /* '!' fails validation, so the person is told the link is damaged */
  }
  try { history.replaceState(null, '', `${window.location.pathname}${window.location.search}#scenario=${plain}`) } catch { /* ignore */ }
}
await inflateScenarioHash()

// A lab link (#scenario=...) is imported once, before the first screen reads any state.
const scenarioImport = api.importScenarioFromHash()

/** Tells the person what the link did, once the splash is gone. */
function ScenarioToast({ ready }: { ready: boolean }) {
  const { t } = useT()
  const shown = useRef(false)
  useEffect(() => {
    if (!ready || shown.current || !scenarioImport) return
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
  if (error) return <Navigate to="/scan/bill" replace />
  if (!data) return <ScanSkeleton />
  if (!data.bill) return <Navigate to="/scan/bill" replace />
  const next = data.households.find((h) => !h.reading)
  return <Navigate to={next ? `/scan/meter/${next.id}` : '/scan/meter/BAU?flow=1'} replace />
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
