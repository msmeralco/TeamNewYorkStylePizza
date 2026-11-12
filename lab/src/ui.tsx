// Shared small inputs, hooks and the full bill form (used by Advanced and by the reader tests).
import { useEffect, useState } from "react";
import { type BillValues, type Charges, computedTotal, historyMonths, load, peso, save } from "./model";

export function usePersist<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => load(key, init));
  useEffect(() => save(key, v), [key, v]);
  return [v, setV] as const;
}

export function useFontsReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all(
      ["400 20px 'Noto Sans'", "700 20px 'Fira Sans'", "800 20px 'Fira Sans'", "600 20px 'Fira Sans'", "500 20px 'Caveat'"].map((f) => document.fonts.load(f)),
    ).finally(() => setReady(true));
  }, []);
  return ready;
}

export function Num({ value, onChange, step = 1, label, nullable }: { value: number | null; onChange: (v: number | null) => void; step?: number; label?: string; nullable?: boolean }) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <input
        type="number"
        step={step}
        value={value ?? ""}
        placeholder={nullable ? "auto" : ""}
        onChange={(e) => onChange(e.target.value === "" ? (nullable ? null : 0) : Number(e.target.value))}
      />
    </label>
  );
}

export function Txt({ value, onChange, label, type = "text" }: { value: string; onChange: (v: string) => void; label: string; type?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{label} <b>{value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  );
}

export const CHARGE_FIELDS: [keyof Charges, string][] = [
  ["remainingBalance", "Remaining balance"],
  ["generation", "Generation"],
  ["transmission", "Transmission"],
  ["systemLoss", "System loss"],
  ["distributionCharge", "Distribution charge"],
  ["fixedMetering", "Fixed metering (per customer)"],
  ["meteringPerKwh", "Metering per kWh"],
  ["fixedSupply", "Fixed supply (per customer)"],
  ["supplyPerKwh", "Supply per kWh"],
  ["seniorCitizen", "Senior citizen subsidy"],
  ["taxes", "Government taxes"],
  ["universal", "Universal charges"],
  ["fitAll", "FiT-All (renewable)"],
  ["geaAll", "GEA-All (renewable)"],
  ["lifeline", "Lifeline subsidy"],
];

/** Every bill field. `readingsLocked` hides the readings and kWh (the main flow works them out). */
export function BillFields({ bill, setBill, readingsLocked = false, chargesLocked = false }: { bill: BillValues; setBill: (b: BillValues) => void; readingsLocked?: boolean; chargesLocked?: boolean }) {
  const set = (patch: Partial<BillValues>) => setBill({ ...bill, ...patch });
  const setC = (k: keyof Charges, v: number) => setBill({ ...bill, charges: { ...bill.charges, [k]: v } });
  const months = historyMonths(bill);
  return (
    <>
      <h3>On the bill</h3>
      <div className="row">
        <Txt label="Customer name" value={bill.customerName} onChange={(v) => set({ customerName: v })} />
        <Txt label="Address line 1" value={bill.address1} onChange={(v) => set({ address1: v })} />
        <Txt label="Address line 2" value={bill.address2} onChange={(v) => set({ address2: v })} />
        <Txt label="Account no." value={bill.accountNo} onChange={(v) => set({ accountNo: v })} />
        <Txt label="Main meter no." value={bill.meterNo} onChange={(v) => set({ meterNo: v })} />
        <Txt label="Billing invoice no." value={bill.invoiceNo} onChange={(v) => set({ invoiceNo: v })} />
        <Txt label="Utility name" value={bill.utilityName} onChange={(v) => set({ utilityName: v })} />
        <Txt label="Utility address" value={bill.utilityAddress} onChange={(v) => set({ utilityAddress: v })} />
        <Num label="Avg temperature (°C)" step={0.1} value={bill.avgTemp} onChange={(v) => set({ avgTemp: v ?? 0 })} />
      </div>
      <h3>Dates</h3>
      <div className="row">
        <Txt type="date" label="Period start" value={bill.periodStart} onChange={(v) => set({ periodStart: v })} />
        <Txt type="date" label="Period end" value={bill.periodEnd} onChange={(v) => set({ periodEnd: v })} />
        <Txt type="date" label="Read date" value={bill.readDate} onChange={(v) => set({ readDate: v })} />
        <Txt type="date" label="Next read date" value={bill.nextReadDate} onChange={(v) => set({ nextReadDate: v })} />
        <Txt type="date" label="Bill date" value={bill.billDate} onChange={(v) => set({ billDate: v })} />
        <Txt type="date" label="Due date" value={bill.dueDate} onChange={(v) => set({ dueDate: v })} />
      </div>
      <h3>Main meter readings</h3>
      <div className="row">
        <Num label="Previous reading" value={bill.previousReading} onChange={(v) => set({ previousReading: v ?? 0, ...(readingsLocked ? { presentReading: (v ?? 0) + (bill.presentReading - bill.previousReading) } : {}) })} />
        {!readingsLocked && (
          <>
            <Num label="Present reading" value={bill.presentReading} onChange={(v) => set({ presentReading: v ?? 0 })} />
            <Num label="kWh (blank = present − previous)" value={bill.kwhOverride} nullable onChange={(v) => set({ kwhOverride: v })} />
            <Num label="Multiplier" value={bill.multiplier} onChange={(v) => set({ multiplier: v ?? 1 })} />
          </>
        )}
      </div>
      <h3>Charges (₱){chargesLocked && " (worked out from kWh)"}</h3>
      <div className="row">
        {CHARGE_FIELDS.filter(([k]) => !chargesLocked || k === "fixedMetering" || k === "fixedSupply").map(([k, l]) => (
          <Num key={k} label={l} step={0.01} value={bill.charges[k]} onChange={(v) => setC(k, v ?? 0)} />
        ))}
      </div>
      {!chargesLocked && (
        <div className="row">
          <Num label={`Charges for this period (blank = computed ₱${peso(computedTotal(bill))})`} step={0.01} value={bill.totalOverride} nullable onChange={(v) => set({ totalOverride: v })} />
        </div>
      )}
      <h3>Usage history (kWh)</h3>
      <div className="row hist">
        {months.map((m, i) => (
          <Num key={m} label={m} value={bill.history[i]} onChange={(v) => set({ history: bill.history.map((x, j) => (j === i ? v ?? 0 : x)) })} />
        ))}
      </div>
      <h3>Look</h3>
      <div className="row">
        <label className="field">
          <span>Bill layout</span>
          <select value={bill.layout} onChange={(e) => set({ layout: e.target.value as BillValues["layout"] })}>
            <option value="preview">Billing invoice (sample_bill_editable_preview.pdf)</option>
            <option value="classic">Sample Electric Co. (sample_bill.png)</option>
          </select>
        </label>
        {bill.layout === "preview" && (
          <label className="field check">
            <input type="checkbox" checked={bill.showBreakdown} onChange={(e) => set({ showBreakdown: e.target.checked })} />
            <span>Print the distribution details (the fixed 5.00 and 16.38 rows). Keep this on so the app can read the fixed charges.</span>
          </label>
        )}
      </div>
    </>
  );
}
