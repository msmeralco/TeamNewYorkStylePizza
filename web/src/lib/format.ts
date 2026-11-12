const peso = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** ₱2,711.07 */
export const php = (n: number) => '₱' + peso.format(Math.round(n * 100) / 100)

/** ₱519 ("about" figures) */
export const phpWhole = (n: number) => '₱' + Math.round(n).toLocaleString('en-PH')

export const kwh = (n: number) => `${Math.round(n)} kWh`

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10-31" -> "31 Oct" */
export function day(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

/** "2026-10-31" -> "October" */
export function monthName(iso: string) {
  return MONTHS_LONG[Number(iso.split('-')[1]) - 1]
}

/** 4572 -> "04572" */
export const meterDigits = (n: number, width = 5) => String(Math.round(n)).padStart(width, '0')
