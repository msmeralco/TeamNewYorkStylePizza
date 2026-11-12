import { StrictMode, useCallback, useRef, useState } from 'react'
import { Splash } from './components/Splash'
import { ScanOverlay, isScanPath } from './components/ScanOverlay'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, type Location } from 'react-router-dom'
import './index.css'
import { LangProvider } from './i18n/copy'
import { BareShell, TabShell } from './components/Shell'
import { ToastHost } from './components/ui'
import Home from './screens/Home'
import ScanBill from './screens/ScanBill'
import ScanMeter from './screens/ScanMeter'
import BillScreen from './screens/Bill'
import Usage from './screens/Usage'
import Check from './screens/Check'
import Tenant from './screens/Tenant'

function Root() {
  const [booting, setBooting] = useState(true)
  const done = useCallback(() => setBooting(false), [])
  return (
    <>
      <App />
      {booting && <Splash onDone={done} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

function App() {
  return (
    <LangProvider>
      <BrowserRouter>
        <AppRoutes />
        <ToastHost />
      </BrowserRouter>
    </LangProvider>
  )
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
            <Route path="bill" element={<Navigate to="/bill/B" replace />} />
            <Route path="bill/:householdId" element={<BillScreen />} />
            <Route path="usage" element={<Navigate to="/usage/BAU" replace />} />
            <Route path="usage/:householdId" element={<Usage />} />
            <Route path="check" element={<Check />} />
          </Route>
          <Route element={<BareShell />}>
            <Route path="t/:token" element={<Tenant />} />
            <Route path="t/:token/bill" element={<BillScreen tenant />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ScanOverlay background={lastTab.current}>
        <Route path="scan" element={<Navigate to="/scan/bill" replace />} />
        <Route path="scan/bill" element={<ScanBill />} />
        <Route path="scan/meter/:householdId" element={<ScanMeter />} />
      </ScanOverlay>
    </>
  )
}
