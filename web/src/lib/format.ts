const peso = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ₱2,711.07 */
export const php = (n: number) => '₱' + peso.format(Math.round(n * 100) / 100)

/** ₱519 ("about" figures) */
export const phpWhole = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH')

export const kwh = (n: number) => `${Math.round(n)} kWh`

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fil: ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'],
}
const MONTHS_LONG = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fil: ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'],
}

// Set by LangProvider so dates follow the chosen language everywhere.
let lang: 'en' | 'fil' = 'en'
export function setFormatLang(l: 'en' | 'fil') {
  lang = l
}

/** "2026-10-31" -> "31 Oct" / "31 Okt" */
export function day(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[lang][m - 1]}`
}

/** "2026-10-31" -> "October" / "Oktubre" */
export function monthName(iso: string) {
  return MONTHS_LONG[lang][Number(iso.split('-')[1]) - 1]
}

/** "October 2026" (English month name from the API) -> month name in the current language. */
export function localMonth(englishMonth: string) {
  const i = MONTHS_LONG.en.findIndex((m) => englishMonth.startsWith(m))
  return i < 0 ? englishMonth : MONTHS_LONG[lang][i]
}

/** 4572 -> "04572" */
export const meterDigits = (n: number, width = 5) => String(Math.round(n)).padStart(width, '0')
