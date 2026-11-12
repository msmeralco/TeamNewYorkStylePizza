import { createContext, useContext, useState, type ReactNode } from 'react'
import type { LineKey } from '../api/types'

// Copy from 02_product_spec.md. Filipino is a draft; Clarence checks it.
const en = {
  'bill.title': 'What {household} pays',
  'share.label': 'Your share',
  'scan.confirm': 'Confirm',
  'scan.fix': 'Edit number',
  'check.missing': '{n} kWh missing',
  'usage.line': '50 kWh lifeline line',
  'usage.perkwh': 'Each kWh you save: about ₱{n} off your share',
  'check.typed': 'Typed',
  'check.verified': 'Verified',
  'usage.title': "{household}'s usage",
  'usage.own': 'Own meter',
  'usage.expected': 'Expected by {date} ({low} to {high})',
  'check.second': 'Reading needs a second look',
  'check.gaprule': 'Until it is fixed, the gap is split by kWh.',
  'usage.remind': 'Remind me mid-month',
  'usage.guess': 'Rough guess',
  'usage.spike': 'Your use so far this month is {n}% above your usual.',
  'footer.source': 'Computed by Kahati. Not a Meralco statement.',
  'bill.footer': 'Sample bill. Computed by Kahati. Not a Meralco statement.',
  'line.generation': 'Generation',
  'line.transmission': 'Transmission',
  'line.systemLoss': 'System loss',
  'line.distribution': 'Distribution',
  'line.supplyMetering': 'Supply and metering',
  'line.taxes': 'Taxes',
  'line.other': 'Other charges',
}
type Key = keyof typeof en

const fil: Partial<Record<Key, string>> = {
  'bill.title': 'Ang binabayaran ni {household}',
  'share.label': 'Iyong bahagi',
  'scan.confirm': 'Kumpirmahin',
  'scan.fix': 'Ayusin ang numero',
  'check.missing': '{n} kWh ang kulang',
  'usage.line': '50 kWh na hangganan ng lifeline',
  'usage.perkwh': 'Bawat kWh na matipid mo: mga ₱{n} bawas sa bahagi mo',
  'check.typed': 'Tinype',
  'check.verified': 'Beripikado',
  'usage.title': 'Gamit ni {household}',
  'usage.own': 'Sariling metro',
  'usage.expected': 'Inaasahan sa {date} ({low} hanggang {high})',
  'check.second': 'Kailangang tingnan ulit ang reading',
  'check.gaprule': 'Habang hindi pa naaayos, hinahati ang kulang ayon sa kWh.',
  'usage.remind': 'Paalalahanan ako sa kalagitnaan ng buwan',
  'usage.guess': 'Tantiya lang',
  'usage.spike': 'Ang gamit mo ngayong buwan ay {n}% na mas mataas sa karaniwan.',
  'footer.source': 'Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.',
  'bill.footer': 'Halimbawang bill. Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.',
}

export type Lang = 'en' | 'fil'
type T = (key: Key, vars?: Record<string, string | number>) => string

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T } | null>(null)

function readLang(): Lang {
  try {
    return localStorage.getItem('kahati-lang') === 'fil' ? 'fil' : 'en'
  } catch {
    return 'en'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('kahati-lang', l)
    } catch {
      /* ignore */
    }
  }
  const t: T = (key, vars) => {
    let s = (lang === 'fil' && fil[key]) || en[key]
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    return s
  }
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useT() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useT outside LangProvider')
  return c
}

export const lineKey = (k: LineKey) => `line.${k}` as Key
