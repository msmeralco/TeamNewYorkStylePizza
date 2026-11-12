import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BillValues, DEFAULT_BILL, DEFAULT_HOUSEHOLDS, DEFAULT_META, DEFAULT_OWN, type HouseholdRow, type MonthMeta, type OwnMeterRow,
  billKwh, billLines, billTotal, computedTotal, deriveBill, fixedCharges, normalizeBill, peso, printsBreakdown,
} from "./model";
import { drawBill } from "./draw/bill";
import { type Distortion, type MeterSpec, NO_DISTORTION, drawMeter } from "./draw/meter";
import { DEFAULT_API, type RunResult, canvasToJpeg, loadResults, resultsCsv, runBill, runMeter, saveResults, summarize } from "./api";
import { downloadA4Pdf, downloadPng, downloadText } from "./download";
import { type BillRanges, type MeterRanges, describeDistortion, randomBill, randomMeter } from "./random";
import { BillFields, Num, Slider, Txt, useFontsReady, usePersist } from "./ui";
import { MonthPage } from "./MonthPage";

type Tab = "month" | "test";
type TestTab = "bill" | "meter" | "results" | "batch";

export interface Settings {
  api: string;
  app: string;
  billLongSide: number;
  meterLongSide: number;
  quality: number;
}
const DEFAULT_SETTINGS: Settings = { api: DEFAULT_API, app: "https://kahati-app.vercel.app", billLongSide: 2400, meterLongSide: 1600, quality: 0.88 };

/** Public build for the judges (VITE_HOSTED=1): only "Make a month"; the reader tools that call Gemini are hidden. */
export const HOSTED = import.meta.env.VITE_HOSTED === "1";

export default function App() {
  const [tabRaw, setTab] = usePersist<Tab>("stresslab.tab2", "month");
  const tab: Tab = HOSTED ? "month" : tabRaw;
  const [testTab, setTestTab] = usePersist<TestTab>("stresslab.testTab", "meter");
  const [settingsRaw, setSettings] = usePersist<Settings>("stresslab.settings", DEFAULT_SETTINGS);
  const settings = HOSTED ? DEFAULT_SETTINGS : { ...DEFAULT_SETTINGS, ...settingsRaw };
  // the month on the main page
  const [hh, setHh] = usePersist<HouseholdRow[]>("stresslab.month.households", DEFAULT_HOUSEHOLDS);
  const [own, setOwn] = usePersist<OwnMeterRow>("stresslab.month.own", DEFAULT_OWN);
  const [bill, setBill] = usePersist<BillValues>("stresslab.month.bill", DEFAULT_BILL);
  const [meta, setMeta] = usePersist<MonthMeta>("stresslab.month.meta", DEFAULT_META);
  useEffect(() => setBill((b) => normalizeBill(b)), []); // eslint-disable-line
  // keep the bill worked out from the households' kWh
  useEffect(() => {
    if (meta.autoBill) setBill((b) => deriveBill(b, hh));
  }, [hh, meta.autoBill]); // eslint-disable-line
  // a separate bill for the reader tests
  const [testBill, setTestBill] = usePersist<BillValues>("stresslab.test.bill", DEFAULT_BILL);
  const [results, setResults] = useState<RunResult[]>(() => loadResults());
  useEffect(() => saveResults(results), [results]);
  const addResult = (r: RunResult) => setResults((prev) => [...prev, r]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <strong>Kahati Lab</strong>
          <span>{HOSTED ? "Make a test month for Kahati: randomize, print or show the props, then scan the QR with the phone." : "Make a demo month: print the props, load it on the phone. Sample data only."}</span>
        </div>
        {!HOSTED && (
          <nav>
            <button className={tab === "month" ? "on" : ""} onClick={() => setTab("month")}>Make a month</button>
            <button className={tab === "test" ? "on" : ""} onClick={() => setTab("test")}>Test the reader</button>
          </nav>
        )}
        {!HOSTED && <details className="settings">
          <summary>Settings</summary>
          <label>App address <input value={settings.app} onChange={(e) => setSettings({ ...settings, app: e.target.value.trim() })} /></label>
          <label>API address <input value={settings.api} onChange={(e) => setSettings({ ...settings, api: e.target.value.trim() })} /></label>
          <label>Bill upload size (px) <input type="number" value={settings.billLongSide} onChange={(e) => setSettings({ ...settings, billLongSide: +e.target.value })} /></label>
          <label>Meter upload size (px) <input type="number" value={settings.meterLongSide} onChange={(e) => setSettings({ ...settings, meterLongSide: +e.target.value })} /></label>
          <label>JPEG quality <input type="number" step="0.01" min="0.3" max="1" value={settings.quality} onChange={(e) => setSettings({ ...settings, quality: +e.target.value })} /></label>
          <button onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset</button>
        </details>}
      </header>
      <main>
        {tab === "month" && (
          <MonthPage hh={hh} setHh={setHh} own={own} setOwn={setOwn} bill={bill} setBill={setBill} meta={meta} setMeta={setMeta} api={settings.api} app={settings.app} />
        )}
        {!HOSTED && tab === "test" && (
          <>
            <nav className="subnav">
              {(["bill", "meter", "results", "batch"] as TestTab[]).map((t) => (
                <button key={t} className={testTab === t ? "on" : ""} onClick={() => setTestTab(t)}>
                  {{ bill: "Bill", meter: "Meters", results: `Results (${results.length})`, batch: "Batch" }[t]}
                </button>
              ))}
            </nav>
            <p className="muted">Send generated images to the live reader and score what comes back. This does not change the month on the main page.</p>
            {testTab === "bill" && <BillTab bill={testBill} setBill={setTestBill} settings={settings} onResult={addResult} />}
            {testTab === "meter" && <MeterTab hh={hh} own={own} settings={settings} onResult={addResult} />}
            {testTab === "results" && <ResultsTab results={results} setResults={setResults} />}
            {testTab === "batch" && <BatchTab settings={settings} onResult={addResult} results={results} />}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------- Bill ----------------
function BillTab({ bill, setBill, settings, onResult }: { bill: BillValues; setBill: (b: BillValues) => void; settings: Settings; onResult: (r: RunResult) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fonts = useFontsReady();
  const [last, setLast] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (fonts && canvas.current) drawBill(canvas.current, bill);
  }, [bill, fonts]);
  const lines = billLines(bill);

  async function send() {
    if (!canvas.current) return;
    setBusy(true);
    const jpeg = canvasToJpeg(canvas.current, settings.billLongSide, settings.quality);
    const r = await runBill(settings.api, bill, jpeg, `bill ${billKwh(bill)} kWh ₱${peso(billTotal(bill))}`, `upload ${settings.billLongSide}px q${settings.quality}`, null);
    onResult(r);
    setLast(r);
    setBusy(false);
  }

  return (
    <section className="split">
      <div className="form">
        <h2>Bill to test (separate from the month on the main page)</h2>
        <BillFields bill={bill} setBill={setBill} />
        <div className="expect">
          <b>The reader should return:</b> kWh {billKwh(bill)}, amount ₱{peso(billTotal(bill))}, fixed ₱{peso(fixedCharges(bill))}{!printsBreakdown(bill) && " (not printed, so not scored)"}, lines{" "}
          {Object.entries(lines).map(([k, v]) => `${k} ${peso(v)}`).join(", ")}.
          {bill.totalOverride != null && Math.abs(bill.totalOverride - computedTotal(bill)) > 0.005 && (
            <span className="warn"> Total is overridden, so the lines do not add up to it (a stress case).</span>
          )}
        </div>
        <div className="row">
          <button onClick={() => canvas.current && downloadPng(canvas.current, `sample-bill-${bill.periodEnd}-${billKwh(bill)}kwh.png`)}>Download PNG</button>
          <button onClick={() => canvas.current && downloadA4Pdf(canvas.current, `sample-bill-${bill.periodEnd}-${billKwh(bill)}kwh.pdf`)}>Download A4 PDF</button>
          <button className="primary" disabled={busy} onClick={send}>{busy ? "Reading…" : "Send to reader"}</button>
          <button onClick={() => setBill({ ...randomBill(Date.now() % 1e9, { kwhMin: 60, kwhMax: 500, varyFixed: false, showBreakdown: bill.showBreakdown }), layout: bill.layout })}>Randomise</button>
          <button onClick={() => setBill(DEFAULT_BILL)}>Reset to sample</button>
        </div>
        {last && <ResultCard r={last} />}
      </div>
      <div className="preview">
        <canvas ref={canvas} className="paper" />
      </div>
    </section>
  );
}

// ---------------- Meters ----------------
function MeterTab({ hh, own, settings, onResult }: { hh: HouseholdRow[]; own: OwnMeterRow; settings: Settings; onResult: (r: RunResult) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fonts = useFontsReady();
  const sources = useMemo(
    () => [
      ...hh.map((h) => ({ key: h.id, label: `${h.label} ${h.name} (${h.serial}) current`, spec: { kind: "sub" as const, value: h.current, tenths: 0, serial: h.serial, name: h.name }, meterId: h.meterId, householdId: h.id, previous: h.previous as number | null })),
      ...hh.map((h) => ({ key: h.id + "p", label: `${h.label} ${h.name} (${h.serial}) previous`, spec: { kind: "sub" as const, value: h.previous, tenths: 0, serial: h.serial, name: h.name }, meterId: h.meterId, householdId: h.id, previous: null as number | null })),
      { key: "own18", label: `${own.name} (${own.serial}) day 18`, spec: { kind: "own" as const, value: own.day18, tenths: 0, serial: own.serial, name: own.name }, meterId: own.meterId, householdId: own.id, previous: own.readDay as number | null },
      { key: "ownRd", label: `${own.name} (${own.serial}) read day`, spec: { kind: "own" as const, value: own.readDay, tenths: 0, serial: own.serial, name: own.name }, meterId: own.meterId, householdId: own.id, previous: null },
    ],
    [hh, own],
  );
  const [srcKey, setSrcKey] = usePersist("stresslab.meterSrc", "hA");
  const src = sources.find((s) => s.key === srcKey) ?? sources[0];
  const [spec, setSpec] = useState<MeterSpec>(src.spec);
  useEffect(() => setSpec(src.spec), [src.key, src.spec.value, src.spec.serial, src.spec.name]); // eslint-disable-line
  const [dist, setDist] = usePersist<Distortion>("stresslab.dist", NO_DISTORTION);
  const [last, setLast] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendPrev, setSendPrev] = useState(true);

  useEffect(() => {
    if (fonts && canvas.current) drawMeter(canvas.current, spec, dist);
  }, [spec, dist, fonts]);

  async function send() {
    if (!canvas.current) return;
    setBusy(true);
    const jpeg = canvasToJpeg(canvas.current, settings.meterLongSide, settings.quality);
    const r = await runMeter(
      settings.api, spec, { id: src.meterId, householdId: src.householdId, previous: sendPrev ? src.previous : null }, jpeg,
      `${spec.serial} ${String(spec.value).padStart(5, "0")}`, describeDistortion(dist), null,
    );
    onResult(r);
    setLast(r);
    setBusy(false);
  }

  function downloadAllClean() {
    const c = document.createElement("canvas");
    sources.filter((s) => !s.key.endsWith("p") && s.key !== "ownRd").forEach((s, i) => {
      setTimeout(() => {
        drawMeter(c, s.spec, { ...NO_DISTORTION });
        downloadPng(c, `meter-${s.spec.serial}-${String(s.spec.value).padStart(5, "0")}.png`);
      }, i * 400);
    });
  }

  return (
    <section className="split">
      <div className="form">
        <h2>Meter</h2>
        <label className="field wide">
          <span>Start from</span>
          <select value={src.key} onChange={(e) => setSrcKey(e.target.value)}>
            {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <div className="row">
          <label className="field">
            <span>Type</span>
            <select value={spec.kind} onChange={(e) => setSpec({ ...spec, kind: e.target.value as "sub" | "own" })}>
              <option value="sub">Sub-meter (glass type)</option>
              <option value="own">Household meter (round)</option>
            </select>
          </label>
          <Num label="Reading (5 digits)" value={spec.value} onChange={(v) => setSpec({ ...spec, value: Math.max(0, Math.min(99999, v ?? 0)) })} />
          {spec.kind === "sub" && <Num label="Tenths digit" value={spec.tenths} onChange={(v) => setSpec({ ...spec, tenths: Math.max(0, Math.min(9, v ?? 0)) })} />}
          <Txt label="Serial" value={spec.serial} onChange={(v) => setSpec({ ...spec, serial: v })} />
          <Txt label="Name label" value={spec.name} onChange={(v) => setSpec({ ...spec, name: v })} />
        </div>
        <h3>Capture conditions</h3>
        <div className="sliders">
          <Slider label="Glare" value={dist.glare} min={0} max={1} step={0.05} onChange={(v) => setDist({ ...dist, glare: v })} />
          <Slider label="Tilt (°)" value={dist.tilt} min={-30} max={30} step={1} onChange={(v) => setDist({ ...dist, tilt: v })} />
          <Slider label="Blur (px)" value={dist.blur} min={0} max={15} step={0.5} onChange={(v) => setDist({ ...dist, blur: v })} />
          <Slider label="Low light" value={dist.lowLight} min={0} max={1} step={0.05} onChange={(v) => setDist({ ...dist, lowLight: v })} />
          <label className="field">
            <span>Ambiguous digit</span>
            <select value={dist.ambiguousIndex} onChange={(e) => setDist({ ...dist, ambiguousIndex: +e.target.value })}>
              <option value={-1}>None</option>
              {[0, 1, 2, 3, 4].map((i) => <option key={i} value={i}>Digit {i + 1}</option>)}
            </select>
          </label>
          {dist.ambiguousIndex >= 0 && <Slider label="Ambiguity" value={dist.ambiguousStrength} min={0.1} max={1} step={0.05} onChange={(v) => setDist({ ...dist, ambiguousStrength: v })} />}
          <Slider label="Seed (glare spot, noise)" value={dist.seed} min={1} max={50} step={1} onChange={(v) => setDist({ ...dist, seed: v })} />
          <label className="field"><span>Corner caption</span><input type="checkbox" checked={dist.caption} onChange={(e) => setDist({ ...dist, caption: e.target.checked })} /></label>
        </div>
        <div className="expect">
          <b>The reader should return:</b> {String(spec.value).padStart(5, "0")} ({spec.value}), serial {spec.serial}. Conditions: {describeDistortion(dist)}.
          {dist.ambiguousIndex >= 0 && " The ambiguous digit is still the true digit, drawn with segments of its look-alike half-lit."}
        </div>
        <label className="field"><span>Send previous reading ({src.previous ?? "none"}) for validation</span><input type="checkbox" checked={sendPrev} onChange={(e) => setSendPrev(e.target.checked)} /></label>
        <div className="row">
          <button onClick={() => canvas.current && downloadPng(canvas.current, `meter-${spec.serial}-${String(spec.value).padStart(5, "0")}.png`)}>Download PNG</button>
          <button className="primary" disabled={busy} onClick={send}>{busy ? "Reading…" : "Send to reader"}</button>
          <button onClick={() => setDist(NO_DISTORTION)}>Clear conditions</button>
          <button onClick={downloadAllClean}>Download all 5 clean props</button>
        </div>
        {last && <ResultCard r={last} />}
      </div>
      <div className="preview">
        <canvas ref={canvas} className="paper" />
      </div>
    </section>
  );
}

// ---------------- Results ----------------
function ResultCard({ r }: { r: RunResult }) {
  if (r.error) return <div className="card bad">Reader error: {r.error} ({r.ms} ms)</div>;
  const pass = r.fields.filter((f) => f.pass).length;
  return (
    <div className={"card " + (pass === r.fields.length ? "good" : "bad")}>
      <div>
        <b>{pass}/{r.fields.length} fields match</b> · confidence {r.confidence ?? "—"} · {r.provider ?? "?"} · {r.ms} ms
      </div>
      {r.note && <div className="muted">{r.note}</div>}
      <table className="cmp">
        <thead><tr><th>Field</th><th>Generated</th><th>Read</th><th></th></tr></thead>
        <tbody>
          {r.fields.map((f) => (
            <tr key={f.field} className={f.pass ? "" : "miss"}>
              <td>{f.field}</td><td>{f.expected}</td><td>{f.read}</td><td>{f.pass ? "PASS" : "FAIL"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.raw != null && (
        <details>
          <summary>Raw reader output</summary>
          <pre className="out">{JSON.stringify(r.raw, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function Summary({ rows }: { rows: RunResult[] }) {
  const s = summarize(rows);
  if (!s.runs) return <p className="muted">No runs yet.</p>;
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
  return (
    <div className="summary">
      <div><b>{pct(s.allPass, s.read)}</b> of images read with every field right ({s.allPass} of {s.read})</div>
      <div><b>{pct(s.fieldPass, s.fields)}</b> of fields right ({s.fieldPass} of {s.fields})</div>
      <div>{s.errors} request error{s.errors === 1 ? "" : "s"} (not counted above)</div>
      <details>
        <summary>Per field</summary>
        <table className="cmp">
          <tbody>
            {[...s.byField.entries()].map(([k, v]) => <tr key={k}><td>{k}</td><td>{v.pass}/{v.n}</td><td>{pct(v.pass, v.n)}</td></tr>)}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function ResultsTab({ results, setResults }: { results: RunResult[]; setResults: (r: RunResult[]) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "bill" | "meter">("all");
  const rows = results.filter((r) => filter === "all" || r.kind === filter);
  return (
    <section>
      <h2>Results</h2>
      <div className="row">
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All</option><option value="bill">Bills</option><option value="meter">Meters</option>
        </select>
        <button disabled={!results.length} onClick={() => downloadText(resultsCsv(rows), `stresslab-results-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`)}>Export CSV</button>
        <button disabled={!results.length} onClick={() => confirm(`Delete all ${results.length} stored results from this browser?`) && setResults([])}>Clear</button>
      </div>
      <Summary rows={rows} />
      <table className="grid results">
        <thead><tr><th>Time</th><th>Batch</th><th>Kind</th><th>Generated</th><th>Conditions</th><th>Fields</th><th>Conf.</th><th>ms</th></tr></thead>
        <tbody>
          {[...rows].reverse().map((r) => {
            const pass = r.fields.filter((f) => f.pass).length;
            return [
              <tr key={r.id} className={"clickable " + (r.error ? "bad" : pass === r.fields.length ? "good" : "bad")} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td>{r.time.slice(5, 19).replace("T", " ")}</td><td>{r.batch ?? ""}</td><td>{r.kind}</td><td>{r.label}</td><td>{r.conditions}</td>
                <td>{r.error ? "error" : `${pass}/${r.fields.length}`}</td><td>{r.confidence ?? ""}</td><td>{r.ms}</td>
              </tr>,
              open === r.id && <tr key={r.id + "x"}><td colSpan={8}><ResultCard r={r} /></td></tr>,
            ];
          })}
        </tbody>
      </table>
    </section>
  );
}

// ---------------- Batch ----------------
function BatchTab({ settings, onResult, results }: { settings: Settings; onResult: (r: RunResult) => void; results: RunResult[] }) {
  const [n, setN] = usePersist("stresslab.batch.n", 10);
  const [kind, setKind] = usePersist<"bill" | "meter" | "both">("stresslab.batch.kind", "meter");
  const [delay, setDelay] = usePersist("stresslab.batch.delay", 1500);
  const [seed0, setSeed0] = usePersist("stresslab.batch.seed", 1000);
  const [br, setBr] = usePersist<BillRanges>("stresslab.batch.bill2", { kwhMin: 50, kwhMax: 600, varyFixed: false, showBreakdown: false });
  const [mr, setMr] = usePersist<MeterRanges>("stresslab.batch.meter", { kind: "both", glareMax: 0.5, tiltMax: 15, blurMax: 3, lowLightMax: 0.5, ambiguousChance: 0.2 });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const stop = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fonts = useFontsReady();

  async function start() {
    if (!canvas.current || !fonts) return;
    const id = `B${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}`;
    setBatchId(id);
    setRunning(true);
    setProgress(0);
    stop.current = false;
    for (let i = 0; i < n && !stop.current; i++) {
      const seed = seed0 + i;
      const doBill = kind === "bill" || (kind === "both" && i % 2 === 0);
      if (doBill) {
        const b = randomBill(seed, br);
        drawBill(canvas.current, b);
        const jpeg = canvasToJpeg(canvas.current, settings.billLongSide, settings.quality);
        onResult(await runBill(settings.api, b, jpeg, `bill ${billKwh(b)} kWh ₱${peso(billTotal(b))}`, `seed ${seed}`, id));
      } else {
        const { spec, dist, previous } = randomMeter(seed, mr);
        drawMeter(canvas.current, spec, dist);
        const jpeg = canvasToJpeg(canvas.current, settings.meterLongSide, settings.quality);
        const mid = spec.kind === "sub" ? "mX" : "mBautista";
        onResult(await runMeter(settings.api, spec, { id: mid, householdId: null, previous }, jpeg, `${spec.serial} ${String(spec.value).padStart(5, "0")}`, `seed ${seed}; ${describeDistortion(dist)}`, id));
      }
      setProgress(i + 1);
      if (i < n - 1 && !stop.current) await new Promise((res) => setTimeout(res, delay));
    }
    setRunning(false);
  }

  const mine = results.filter((r) => r.batch === batchId);
  return (
    <section className="split">
      <div className="form">
        <h2>Batch</h2>
        <p className="muted">Generates N invented variations, sends each to the live reader one at a time, and scores what comes back. Every request uses the team's Gemini quota, so start small.</p>
        <div className="row">
          <Num label="Variations (N)" value={n} onChange={(v) => setN(Math.max(1, Math.min(500, v ?? 1)))} />
          <label className="field"><span>What</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="meter">Meters</option><option value="bill">Bills</option><option value="both">Both (alternating)</option>
            </select>
          </label>
          <Num label="Delay between calls (ms)" value={delay} onChange={(v) => setDelay(Math.max(0, v ?? 0))} />
          <Num label="First seed" value={seed0} onChange={(v) => setSeed0(v ?? 1)} />
        </div>
        {kind !== "meter" && (
          <>
            <h3>Bill ranges</h3>
            <div className="row">
              <Num label="kWh min" value={br.kwhMin} onChange={(v) => setBr({ ...br, kwhMin: v ?? 1 })} />
              <Num label="kWh max" value={br.kwhMax} onChange={(v) => setBr({ ...br, kwhMax: v ?? 1 })} />
              <label className="field"><span>Print distribution breakdown</span><input type="checkbox" checked={br.showBreakdown} onChange={(e) => setBr({ ...br, showBreakdown: e.target.checked })} /></label>
              <label className="field"><span>Vary the fixed 5.00 / 16.38</span><input type="checkbox" checked={br.varyFixed} onChange={(e) => setBr({ ...br, varyFixed: e.target.checked })} /></label>
            </div>
          </>
        )}
        {kind !== "bill" && (
          <>
            <h3>Meter ranges (each image picks a random value up to the max)</h3>
            <div className="row">
              <label className="field"><span>Meter type</span>
                <select value={mr.kind} onChange={(e) => setMr({ ...mr, kind: e.target.value as MeterRanges["kind"] })}>
                  <option value="both">Both</option><option value="sub">Sub-meter</option><option value="own">Household meter</option>
                </select>
              </label>
            </div>
            <div className="sliders">
              <Slider label="Glare max" value={mr.glareMax} min={0} max={1} step={0.05} onChange={(v) => setMr({ ...mr, glareMax: v })} />
              <Slider label="Tilt max (°)" value={mr.tiltMax} min={0} max={30} step={1} onChange={(v) => setMr({ ...mr, tiltMax: v })} />
              <Slider label="Blur max (px)" value={mr.blurMax} min={0} max={15} step={0.5} onChange={(v) => setMr({ ...mr, blurMax: v })} />
              <Slider label="Low light max" value={mr.lowLightMax} min={0} max={1} step={0.05} onChange={(v) => setMr({ ...mr, lowLightMax: v })} />
              <Slider label="Chance of an ambiguous digit" value={mr.ambiguousChance} min={0} max={1} step={0.05} onChange={(v) => setMr({ ...mr, ambiguousChance: v })} />
            </div>
          </>
        )}
        <div className="row">
          {!running ? <button className="primary" disabled={!fonts} onClick={start}>Run {n}</button> : <button onClick={() => (stop.current = true)}>Stop after this one</button>}
          {(running || progress > 0) && <span>{progress}/{n} done {batchId && `· batch ${batchId}`}</span>}
        </div>
        {batchId && (
          <>
            <h3>This batch (measured)</h3>
            <Summary rows={mine} />
            <p className="muted">These are generated images, not real photos. Do not quote this as the reading-accuracy figure: that comes only from the held-out real meter photos.</p>
          </>
        )}
      </div>
      <div className="preview">
        <canvas ref={canvas} className="paper" />
        <p className="muted">Last image sent.</p>
      </div>
    </section>
  );
}
