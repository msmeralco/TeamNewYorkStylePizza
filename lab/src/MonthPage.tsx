// "Make a month": set up the month, print the props, load it on the phone.
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  type BillValues, CHEAT_KWH, DEFAULT_BILL, DEFAULT_HOUSEHOLDS, DEFAULT_META, DEFAULT_OWN, type HouseholdRow, type MonthMeta, type OwnMeterRow,
  billKwh, billLines, billTotal, householdKwh, peso,
} from "./model";
import { drawBill } from "./draw/bill";
import { type MeterSpec, NO_DISTORTION, digits5, drawMeter } from "./draw/meter";
import { randomizeFromSample } from "./randomize";
import { buildLabMonth, encodeLabLink, type LabMonthOpts } from "./shared/labMonth";
import { buildScenario, encodeCompact, encodeScenario } from "./scenario";
import { getTemplates, postJson } from "./compound";
import { downloadPng, downloadPropsPdf } from "./download";
import { BillFields, useFontsReady } from "./ui";

interface Props {
  hh: HouseholdRow[];
  setHh: (h: HouseholdRow[]) => void;
  own: OwnMeterRow;
  setOwn: (o: OwnMeterRow) => void;
  bill: BillValues;
  setBill: (b: BillValues) => void;
  meta: MonthMeta;
  setMeta: (m: MonthMeta) => void;
  api: string;
  app: string;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MON[m - 1] ?? "?"}`;
};
const okReading = (v: number) => Number.isInteger(v) && v >= 0 && v <= 99999;

/** Plain-words problems, per field. */
function findProblems(hh: HouseholdRow[], own: OwnMeterRow, bill: BillValues, meta: MonthMeta) {
  const row: Record<string, { name?: string; previous?: string; current?: string; serial?: string }> = {};
  const add = (id: string, k: "name" | "previous" | "current" | "serial", msg: string) => ((row[id] ??= {})[k] ??= msg);
  const all = [...hh.map((h) => ({ id: h.id, name: h.name, prev: h.previous, cur: h.current, serial: h.serial.trim() })), { id: own.id, name: own.name, prev: own.readDay, cur: own.day18, serial: own.serial.trim() }];
  for (const r of all) {
    if (!r.name.trim()) add(r.id, "name", "Give this household a name.");
    if (!okReading(r.prev)) add(r.id, "previous", "Readings are whole numbers from 0 to 99999.");
    if (!okReading(r.cur)) add(r.id, "current", "Readings are whole numbers from 0 to 99999.");
    else if (r.cur <= r.prev) add(r.id, "current", "This month must be higher than last month.");
    if (!r.serial) add(r.id, "serial", "Add the serial printed on the meter.");
    else if (all.some((o) => o.id !== r.id && o.serial === r.serial)) add(r.id, "serial", "Another meter has this serial.");
    else if (r.serial === bill.meterNo.trim()) add(r.id, "serial", "This is the main meter's number on the bill.");
  }
  const billMsgs: string[] = [];
  const lines = billLines(bill);
  const linesSum = Math.round(Object.values(lines).reduce((s, v) => s + v, 0) * 100) / 100;
  if (Math.abs(linesSum - billTotal(bill)) > 0.01) billMsgs.push(`The bill's charges add up to ₱${peso(linesSum)}, not the ₱${peso(billTotal(bill))} total.`);
  if (billKwh(bill) !== householdKwh(hh)) billMsgs.push(`The bill says ${billKwh(bill)} kWh but the four meters used ${householdKwh(hh)} kWh.`);
  if (bill.presentReading - bill.previousReading !== billKwh(bill)) billMsgs.push("The main meter's readings on the bill don't match its kWh.");
  const cheatH = hh.find((h) => h.id === meta.cheat);
  if (cheatH && cheatH.current - cheatH.previous <= CHEAT_KWH) billMsgs.push(`The gap demo needs ${cheatH.name} to use more than ${CHEAT_KWH} kWh.`);
  const count = Object.values(row).reduce((s, r) => s + Object.keys(r).length, 0) + billMsgs.length;
  return { row, billMsgs, ok: count === 0 };
}

/** JSON with sorted keys, to compare two states regardless of key order. */
function canon(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
}

function useScenarioLink(p: Props, valid: boolean) {
  const { hh, own, bill, meta, api, app } = p;
  const [state, setState] = useState<{ url: string; qr: string; billUrl: string | null; tiny: boolean; split: any; error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setState((prev) => (prev ? { ...prev, split: null, error: null, billUrl: null } : prev)); // never show last month's shares or QR
    const t = setTimeout(async () => {
      try {
        const scenario = await buildScenario(api, hh, own, bill, { name: meta.name, cheat: meta.cheat });
        const { z } = await encodeScenario(scenario);
        const base = app.replace(/\/$/, "");
        // A pure lab month (nothing hand-edited) travels as just its seed and options: `#lab=7802.20.80.gp14`.
        let tinyUrl: string | null = null;
        if (meta.seed > 0) {
          const opts: LabMonthOpts = {
            seed: meta.seed, minKwh: meta.useMin, maxKwh: meta.useMax, gap: !!meta.cheat, newSerials: meta.newSerials,
            fourPs: [...hh.map((h) => h.fourPs), own.fourPs] as LabMonthOpts["fourPs"],
          };
          if (canon(buildLabMonth(await getTemplates(api), opts)) === canon(scenario)) tinyUrl = `${base}/#lab=${encodeLabLink(opts)}`;
        }
        const url = tinyUrl ?? `${base}/#scenarioz=${z}`;
        const billUrl = tinyUrl ?? `${base}/#s2=${await encodeCompact(scenario)}`;
        const qr = await QRCode.toDataURL(url, tinyUrl ? { errorCorrectionLevel: "M", margin: 4, scale: 12 } : { errorCorrectionLevel: "L", margin: 4, scale: 6 });
        let split: any = null;
        let splitErr: string | null = null;
        if (valid) {
          try {
            split = await postJson(api, "/api/split", { state: scenario.compound });
          } catch (e: any) {
            splitErr = String(e?.message ?? e);
          }
        }
        if (!live) return;
        setError(null);
        setState({ url, qr, billUrl, tiny: !!tinyUrl, split, error: splitErr });
      } catch (e: any) {
        if (live) setError("Could not reach the Kahati server to build the link. Check the internet connection.");
        console.error(e);
      }
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [hh, own, bill, meta.name, meta.cheat, meta.seed, meta.useMin, meta.useMax, meta.newSerials, api, app, valid]);
  return { link: state, linkError: error };
}

function meterSpecs(hh: HouseholdRow[], own: OwnMeterRow): MeterSpec[] {
  return [
    ...hh.map((h) => ({ kind: "sub" as const, value: h.current, tenths: 0, serial: h.serial, name: h.name })),
    { kind: "own" as const, value: own.day18, tenths: 0, serial: own.serial, name: own.name },
  ];
}

export function MonthPage(p: Props) {
  const { hh, setHh, own, setOwn, bill, setBill, meta, setMeta } = p;
  const problems = findProblems(hh, own, bill, meta);
  const { link, linkError } = useScenarioLink(p, problems.ok);
  const [seedText, setSeedText] = useState(String(meta.seed || ""));
  useEffect(() => setSeedText(String(meta.seed || "")), [meta.seed]);
  const [copied, setCopied] = useState<string | null>(null);
  const [bigQr, setBigQr] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null); // 0 = bill, 1..5 = meters

  function apply(seed: number, m: MonthMeta = meta) {
    const r = randomizeFromSample(seed, m, hh, own, bill);
    setHh(r.hh);
    setOwn(r.own);
    setBill(r.bill);
    setMeta(r.meta);
  }
  const randomize = () => apply(1000 + Math.floor(Math.random() * 9000));
  /** Option changes on a lab month re-roll the same seed, so the month stays a pure lab month. */
  const setOption = (patch: Partial<MonthMeta>) => {
    const m = { ...meta, ...patch };
    if (meta.seed > 0) apply(meta.seed, m);
    else setMeta(m);
  };
  const updHh = (i: number, patch: Partial<HouseholdRow>) => setHh(hh.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const sumKwh = householdKwh(hh);
  const cheatH = hh.find((h) => h.id === meta.cheat);

  // ---- step 2 renders ----
  const fonts = useFontsReady();
  const billCanvas = useRef<HTMLCanvasElement>(null);
  const meterCanvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const specs = useMemo(() => meterSpecs(hh, own), [hh, own]);
  const billQr = useMemo(() => (link?.billUrl && problems.ok ? { url: link.billUrl, label: `Kahati lab month: ${meta.name}`, small: link.tiny } : null), [link?.billUrl, problems.ok, meta.name]);
  const propsReady = problems.ok && !!billQr;
  useEffect(() => {
    if (!fonts) return;
    const t = setTimeout(() => {
      if (billCanvas.current) drawBill(billCanvas.current, bill, billQr);
      specs.forEach((s, i) => meterCanvases.current[i] && drawMeter(meterCanvases.current[i]!, s, { ...NO_DISTORTION }));
    }, 250);
    return () => clearTimeout(t);
  }, [fonts, bill, specs, billQr]);
  const fileBase = meta.seed ? `lab-${meta.seed}` : "lab-sample";

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied("Link copied");
    } catch {
      setCopied("Copying was blocked. Use “Open the link” and copy it from the address bar.");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  const expected = link?.split?.shares as { householdId: string; amount: number; kwh: number }[] | undefined;
  const nameOf = (id: string) => hh.find((h) => h.id === id)?.name ?? id;

  return (
    <div className="steps">
      {/* ---------------- STEP 1 ---------------- */}
      <section className="step">
        <div className="stephead">
          <span className="num">1</span>
          <div>
            <h2>Set up the month</h2>
            <p className="help">Press Randomize for new readings, or type them in. The bill works itself out from the meters.</p>
          </div>
        </div>
        <div className="row randomrow">
          <button className="primary big" onClick={randomize}>Randomize</button>
          <label className="seed">
            Seed
            <input value={seedText} placeholder="none" onChange={(e) => setSeedText(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && seedText && apply(Number(seedText))} />
          </label>
          <button disabled={!seedText} onClick={() => apply(Number(seedText))} title="Make the same month again from this seed">Use this seed</button>
          <button onClick={() => { setHh(hh.map((h) => ({ ...h, fourPs: Math.random() < 0.5 }))); setOwn({ ...own, fourPs: Math.random() < 0.5 }); }}>Randomize 4Ps</button>
        </div>
        <div className="row options">
          <span>Each household uses</span>
          <input type="number" value={meta.useMin} onChange={(e) => setOption({ useMin: +e.target.value })} />
          <span>to</span>
          <input type="number" value={meta.useMax} onChange={(e) => setOption({ useMax: +e.target.value })} />
          <span>kWh</span>
          <label className="check"><input type="checkbox" checked={meta.newSerials} onChange={(e) => setOption({ newSerials: e.target.checked })} /> new serials</label>
          <label className="check">
            <input type="checkbox" checked={!!meta.cheat} onChange={(e) => (meta.seed > 0 ? setOption({ cheat: e.target.checked ? "pending" : null }) : setMeta({ ...meta, cheat: e.target.checked ? (hh.find((h) => h.current - h.previous > CHEAT_KWH)?.id ?? hh[0].id) : null }))} />
            add an {CHEAT_KWH} kWh gap (Check screen demo)
          </label>
        </div>

        <table className="month">
          <thead>
            <tr><th></th><th>Name</th><th>4Ps</th><th>Last month</th><th>This month</th><th>kWh used</th><th>Serial</th></tr>
          </thead>
          <tbody>
            <tr className="mainrow">
              <td className="lab" title="Main meter">M</td>
              <td>Main meter (on the bill)<div className="note">The organizer's Meralco meter. Its reading comes from the bill; the app doesn't scan it.</div></td>
              <td></td>
              <td className="ro">{bill.previousReading}</td>
              <td className="ro">{bill.presentReading}</td>
              <td className="kwh">{billKwh(bill)}<div className="note">= A + B + C + D</div></td>
              <td className="ro">{bill.meterNo}</td>
            </tr>
            {hh.map((h, i) => {
              const pr = problems.row[h.id] ?? {};
              return (
                <tr key={h.id}>
                  <td className="lab">{h.label}</td>
                  <td><input value={h.name} onChange={(e) => updHh(i, { name: e.target.value })} />{pr.name && <div className="err">{pr.name}</div>}</td>
                  <td><Toggle on={h.fourPs} onChange={(v) => updHh(i, { fourPs: v })} /></td>
                  <td><input type="number" value={h.previous} onChange={(e) => updHh(i, { previous: +e.target.value })} />{pr.previous && <div className="err">{pr.previous}</div>}</td>
                  <td><input type="number" value={h.current} onChange={(e) => updHh(i, { current: +e.target.value })} />{pr.current && <div className="err">{pr.current}</div>}</td>
                  <td className="kwh">{h.current - h.previous}{meta.cheat === h.id && <div className="note">app gets {CHEAT_KWH} kWh less</div>}</td>
                  <td><input value={h.serial} onChange={(e) => updHh(i, { serial: e.target.value })} />{pr.serial && <div className="err">{pr.serial}</div>}</td>
                </tr>
              );
            })}
            <tr className="sep"><td colSpan={7}>Separate household with its own Meralco meter (forecast demo). Not part of the bill above.</td></tr>
            <tr className="ownrow">
              <td className="lab" title="Own meter">★</td>
              <td><input value={own.name} onChange={(e) => setOwn({ ...own, name: e.target.value })} />{problems.row[own.id]?.name && <div className="err">{problems.row[own.id].name}</div>}</td>
              <td><Toggle on={own.fourPs} onChange={(v) => setOwn({ ...own, fourPs: v })} /></td>
              <td><input type="number" value={own.readDay} onChange={(e) => setOwn({ ...own, readDay: +e.target.value })} />{problems.row[own.id]?.previous && <div className="err">{problems.row[own.id].previous}</div>}<div className="note">on the bill date</div></td>
              <td><input type="number" value={own.day18} onChange={(e) => setOwn({ ...own, day18: +e.target.value })} />{problems.row[own.id]?.current && <div className="err">{problems.row[own.id].current}</div>}<div className="note">day 18 photo</div></td>
              <td className="kwh">{own.day18 - own.readDay}</td>
              <td><input value={own.serial} onChange={(e) => setOwn({ ...own, serial: e.target.value })} />{problems.row[own.id]?.serial && <div className="err">{problems.row[own.id].serial}</div>}</td>
            </tr>
          </tbody>
        </table>

        <p className="billline">
          Bill: <b>{billKwh(bill)} kWh</b> = A + B + C + D · <b>₱{peso(billTotal(bill))}</b> · {short(bill.periodStart)} to {short(bill.periodEnd)}
          {meta.seed ? <span className="muted"> · {meta.name}</span> : null}
        </p>
        {problems.billMsgs.map((m) => <p key={m} className="err">{m}</p>)}
        {cheatH && (
          <p className="note">
            Gap demo: the app gets {cheatH.name}'s last month as {cheatH.previous + CHEAT_KWH} instead of {cheatH.previous}. The printed meter shows the true {digits5(cheatH.current)}, so the Check screen should say “{CHEAT_KWH} kWh missing”.
          </p>
        )}

        <details className="advanced">
          <summary>Advanced</summary>
          <div className="row">
            <label className="field"><span>Name the app shows (“Loaded scenario: …”)</span><input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></label>
            {hh.map((h, i) => (
              <label key={h.id} className="field"><span>{h.name} language</span>
                <select value={h.language} onChange={(e) => updHh(i, { language: e.target.value as "en" | "fil" })}><option value="en">English</option><option value="fil">Filipino</option></select>
              </label>
            ))}
            <label className="field"><span>{own.name} language</span>
              <select value={own.language} onChange={(e) => setOwn({ ...own, language: e.target.value as "en" | "fil" })}><option value="en">English</option><option value="fil">Filipino</option></select>
            </label>
            {meta.cheat && (
              <label className="field"><span>Gap demo household</span>
                <select value={meta.cheat} onChange={(e) => setMeta({ ...meta, cheat: e.target.value })}>{hh.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
              </label>
            )}
          </div>
          <label className="field check">
            <input type="checkbox" checked={meta.autoBill} onChange={(e) => setMeta({ ...meta, autoBill: e.target.checked })} />
            <span>Work the bill out from the meters (recommended). Each charge = the sample's rate per kWh × {sumKwh} kWh, plus the fixed ₱5.00 and ₱16.38.</span>
          </label>
          <BillFields bill={bill} setBill={setBill} readingsLocked={meta.autoBill} chargesLocked={meta.autoBill} />
          <div className="row">
            <button onClick={() => { setHh(DEFAULT_HOUSEHOLDS); setOwn(DEFAULT_OWN); setBill(DEFAULT_BILL); setMeta(DEFAULT_META); }}>Back to the sample month</button>
          </div>
        </details>
      </section>

      {/* ---------------- STEP 2 ---------------- */}
      <section className="step">
        <div className="stephead">
          <span className="num">2</span>
          <div>
            <h2>Print the props</h2>
            <p className="help">Download everything as one PDF and print it at 100% (“Actual size”) on matte paper.</p>
          </div>
        </div>
        <div className="props">
          <figure className="billprev">
            <canvas ref={billCanvas} className="paper zoomable" onClick={() => setViewer(0)} title="Click for full screen" />
            <figcaption><a href="#" onClick={(e) => { e.preventDefault(); billCanvas.current && downloadPng(billCanvas.current, `${fileBase}-bill.png`); }}>bill.png</a></figcaption>
          </figure>
          <div className="meters">
            {specs.map((s, i) => (
              <figure key={i}>
                <canvas ref={(el) => (meterCanvases.current[i] = el)} className="paper zoomable" onClick={() => setViewer(i + 1)} title="Click for full screen" />
                <figcaption>
                  {s.kind === "own" ? `${s.name}'s own meter` : `${hh[i]?.label} ${s.name}`} · {digits5(s.value)} ·{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); const c = meterCanvases.current[i]; c && downloadPng(c, `${fileBase}-meter-${s.serial}.png`); }}>png</a>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <p className="muted">Click any picture to show it full screen (to photograph it off the screen). Arrow keys go to the next one, Esc closes.</p>
        {viewer != null && (
          <Viewer
            sources={[billCanvas.current, ...meterCanvases.current.slice(0, specs.length)]}
            index={viewer}
            onIndex={setViewer}
            onClose={() => setViewer(null)}
          />
        )}
        <div className="row">
          <button
            className="primary big"
            disabled={!propsReady}
            onClick={() => billCanvas.current && downloadPropsPdf(billCanvas.current, meterCanvases.current.filter(Boolean) as HTMLCanvasElement[], `${fileBase}-props.pdf`)}
          >
            Download all (PDF)
          </button>
          {!problems.ok ? <span className="err">Fix the red notes in step 1 first.</span> : !billQr && <span className="muted">Adding the month's QR code to the bill…</span>}
        </div>
        <p className="expected">
          {!problems.ok ? null : expected ? (
            <>
              The app should show: {expected.map((s) => `${nameOf(s.householdId)} ₱${peso(s.amount)}`).join(" · ")} <span className="muted">(total ₱{peso(link!.split.total)})</span>
              {cheatH && <> · Check screen: “{CHEAT_KWH} kWh missing”</>}
            </>
          ) : link?.error ? (
            <span className="err">Couldn't work out the shares: {link.error}</span>
          ) : (
            <span className="muted">Working out what the app should show…</span>
          )}
        </p>
      </section>

      {/* ---------------- STEP 3 ---------------- */}
      <section className="step">
        <div className="stephead">
          <span className="num">3</span>
          <div>
            <h2>Load it on the phone</h2>
            <p className="help">Scan this with the demo phone. The app will say “Loaded scenario: {meta.name}”.</p>
          </div>
        </div>
        {!problems.ok ? (
          <p className="err">Fix the red notes in step 1 first, so the app accepts this month.</p>
        ) : linkError ? (
          <p className="err">{linkError}</p>
        ) : link ? (
          <div className="load">
            <img className="qrbig" src={link.qr} alt="QR code that loads this month in the app" onClick={() => setBigQr(true)} title="Click for full screen" />
            <div>
              <button className="primary big" onClick={copyLink}>Copy link</button>
              {copied && <p className="ok">{copied}</p>}
              <p className="muted">Click the code to show it full screen. Or <a href={link.url} target="_blank" rel="noreferrer">open the link</a> on this computer.</p>
            </div>
            {bigQr && (
              <div className="qrfull" onClick={() => setBigQr(false)}>
                <img src={link.qr} alt="QR code, full screen" />
              </div>
            )}
          </div>
        ) : (
          <p className="muted">Making the code…</p>
        )}
      </section>
    </div>
  );
}

/** Full-screen view of one prop, drawn from its full-resolution canvas. */
function Viewer({ sources, index, onIndex, onClose }: { sources: (HTMLCanvasElement | null)[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const n = sources.length;
  useEffect(() => {
    const el = box.current;
    el?.requestFullscreen?.().catch(() => {}); // falls back to the fixed overlay
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") onIndex((index + 1) % n);
      else if (e.key === "ArrowLeft") onIndex((index - 1 + n) % n);
    };
    const onFs = () => !document.fullscreenElement && onClose();
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [index, n, onClose, onIndex]);
  useEffect(() => () => void (document.fullscreenElement && document.exitFullscreen().catch(() => {})), []);
  useEffect(() => {
    const src = sources[index];
    const c = canvas.current;
    if (!src || !c) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const k = Math.min(window.innerWidth / src.width, window.innerHeight / src.height);
      c.style.width = `${Math.floor(src.width * k)}px`;
      c.style.height = `${Math.floor(src.height * k)}px`;
      c.width = Math.round(src.width * k * dpr);
      c.height = Math.round(src.height * k * dpr);
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, c.width, c.height);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [index, sources]);
  return (
    <div ref={box} className="viewer" onClick={onClose}>
      <canvas ref={canvas} />
      <span className="viewer-hint">{index + 1} / {n} · arrows for next · click or Esc to close</span>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={"toggle" + (on ? " on" : "")} onClick={() => onChange(!on)}>
      <span />
      <b>{on ? "Yes" : "No"}</b>
    </button>
  );
}
