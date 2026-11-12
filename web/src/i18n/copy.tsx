import { createContext, useContext, useState, type ReactNode } from 'react'
import type { LineKey } from '../api/types'
import { setFormatLang } from '../lib/format'

// Every user-facing string, in English and Filipino. The Filipino is a draft:
// Clarence checks it (02_product_spec.md). Names (Kahati, Meralco, 4Ps), units
// (kWh, ₱) and household names stay as they are.
const en = {
  // nav
  'nav.home': 'Home',
  'nav.scan': 'Scan',
  'nav.bill': 'Bill',
  'nav.usage': 'Usage',
  'nav.check': 'Check',
  'nav.main': 'Main',

  // common
  'common.tryAgain': 'Try again',
  'common.error': 'Something went wrong.',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.more': 'More',
  'common.loading': 'Loading',
  'common.save': 'Save',
  'common.range': '{a} to {b}',
  'splash.loading': 'Loading Kahati',

  // errors (by code from the API)
  'err.unknown_household': 'Unknown household.',
  'err.reading_below': "This reading is below last month's. Check the number.",
  'err.shares_pending': 'Shares appear once the bill and all readings are in.',
  'err.link_expired': 'This link has expired. Ask the organizer for a new one.',
  'err.offline': 'No connection. Check the Wi-Fi or switch to the hotspot.',
  'err.reader_failed': 'The photo could not be read. Try again, or type it instead.',
  'err.internal': 'Something went wrong on our side. Try again.',
  'err.bad_state': 'The saved data looks wrong. Reset the demo from the Home menu, then try again.',
  'err.bad_request': 'The server could not read that request. Try again.',
  'err.negative_kwh': 'A reading is lower than the one before it. Check it and scan or type it again.',
  'err.no_meter': 'This household has no meter yet. Scan its meter first.',
  'err.no_base_reading': 'There is no starting reading yet. Scan the bill or the meter first.',
  'err.no_last_period': 'There is no earlier bill to forecast from yet.',
  'err.bad_mime': 'That file is not a photo. Take a photo, or type it instead.',
  'err.missing_image': 'No photo was sent. Take a photo, or type it instead.',
  'err.image_too_large': 'The photo is too large. Retake it closer, or type it instead.',
  'err.link_expired_on_issue': "This bill's period has already ended, so the link would expire at once. Scan this month's bill first.",
  'err.no_charged_rate': 'No charged rate was entered for this household. Enter the rate they were asked to pay.',
  'issue.digit_count': 'The number of digits looks wrong.',
  'issue.reads_disagree': 'Two reads of the photo did not match.',
  'issue.serial_mismatch': 'The serial does not match this meter.',
  'issue.low_confidence': 'The photo was hard to read.',
  'issue.previous_mismatch': 'The last reading is from a different meter.',
  'issue.below_previous': "It is lower than last month's.",

  // home
  'home.billTitle': '{month} bill',
  'home.thisMonth': 'This month',
  'home.noBill': 'No bill yet',
  'home.noBillHint': 'Scan the Meralco bill to start the split.',
  'home.scanBill': 'Scan the bill',
  'home.toGo': '{n} of {total} readings to go',
  'home.loadRest': 'Load the rest',
  'home.scanName': 'Scan {name}',
  'home.addsUp': 'Readings add up: {a} of {b} kWh',
  'home.missing': '{n} kWh missing: {a} of {b} kWh',
  'home.noReading': 'No reading yet',
  'home.rateAbove': 'Charged rate is {n} above the bill',
  'home.rateVs': '{a} charged vs {b} on the bill',
  'home.reset': 'Reset the demo',

  // scan
  'scan.confirm': 'Confirm',
  'scan.fix': 'Edit number',
  'scan.before': 'Before you scan',
  'scan.consentTitle': 'Name, address and account number are covered on your phone first.',
  'scan.consentBody':
    'Kahati sends only the covered photo to read the bill. It keeps the period, kWh, amount, the charge lines and the last 4 digits of the account. The photo is not kept.',
  'scan.understand': 'I understand',
  'scan.billTitle': 'Scan the bill',
  'scan.period': 'Period',
  'scan.totalKwh': 'Total kWh',
  'scan.amount': 'Amount',
  'scan.account': 'Account',
  'scan.confirmBill': 'Confirm bill',
  'scan.readingBill': 'Reading the bill…',
  'scan.tapBill': 'Tap the frame to take a photo of the bill.',
  'scan.typeInstead': 'Type it instead',
  'scan.sampleBill': 'Use the sample bill (mock)',
  'scan.typeTitle': 'Type the bill',
  'scan.periodStart': 'Period start',
  'scan.periodEnd': 'Period end (read date)',
  'scan.amountPeso': 'Amount (₱)',
  'scan.last4': 'Last 4 digits of the account',
  'scan.backCamera': 'Back to the camera',
  'scan.errReadBill': 'Could not read the bill.',
  'scan.errSaveBill': 'Could not save the bill.',
  'scan.errReadMeter': 'Could not read the meter.',
  'scan.errSaveReading': 'Could not save the reading.',
  'scan.meterLabel': 'Meter reading (last month {n})',
  'scan.sinceLast': '{n} kWh since last month',
  'scan.serialMatch': 'Serial {s} matches {name}',
  'scan.serialNo': "Serial {s} is not {name}'s meter",
  'scan.didYouMean': 'Did you mean {a}, not {b}?',
  'scan.readingMeter': 'Reading the meter…',
  'scan.tapMeter': "Tap the frame to photograph {name}'s meter.",
  'scan.sampleMeter': 'Use the sample meter (mock)',
  'scan.step': 'Step {n} of {total}',
  'scan.takePhoto': 'Take a photo',
  'scan.reading': 'Reading',

  // bill
  'bill.title': 'What {household} pays',
  'bill.whatYouPay': 'What you pay for',
  'bill.goHome': 'Go to Home',
  'bill.footer': 'Sample bill. Computed by Kahati. Not a Meralco statement.',
  'line.generation': 'Generation',
  'line.transmission': 'Transmission',
  'line.systemLoss': 'System loss',
  'line.distribution': 'Distribution',
  'line.supplyMetering': 'Supply and metering',
  'line.taxes': 'Taxes',
  'line.other': 'Other charges',

  // usage
  'usage.title': "{household}'s usage",
  'usage.own': 'Own meter',
  'usage.shared': 'Shared meter',
  'usage.showing': 'Showing',
  'usage.choose': 'Choose household',
  'usage.expected': 'Expected by {date} ({low} to {high})',
  'usage.next': 'Next month, about the same as last month',
  'usage.guess': 'Rough guess',
  'usage.line': '50 kWh lifeline line',
  'usage.stayUnder': 'Stay under {limit} kWh: about {a} instead of about {b}',
  'usage.tiers': '4Ps lifeline: 100% off up to 50 kWh, 35% off from 51 to 70',
  'tier.off': '{n}% off',
  'tier.none': 'No discount',
  'tier.marker': '{n} kWh',
  'tier.aria': '4Ps lifeline discount by kWh: 100% off up to 50, 35% from 51 to 70, 20% from 71 to 100, none above. Expected {n} kWh gets {p}% off.',
  'usage.usingRate': "Using {month}'s rate.",
  'usage.perkwh': 'Each kWh you save: about ₱{n} off your share',
  'usage.spike': 'Your use so far this month is {n}% above your usual.',
  'usage.remind': 'Remind me mid-month',
  'usage.remindToast': 'We will remind you around the 15th.',
  'rate.fallback': "Using {month}'s rate. {next}'s is announced mid-month.",
  'action.plug': 'Unplug the rice cooker after cooking',
  'action.clock': 'Set the fan on a timer at night',
  'action.snowflake': 'One hour less of aircon a day is about 30 kWh a month',

  // usage chart
  'chart.billReading': '{d} · Bill reading',
  'chart.photo': '{d} · Meter photo',
  'chart.start': 'Start of the month: 0 kWh used',
  'chart.used': '{n} kWh used in {days} days, about {r} kWh a day',
  'chart.expected': '{d} · Expected',
  'chart.range': '{n} kWh ({lo} to {hi})',
  'chart.over': ', about {n} kWh over the {limit} kWh line',
  'chart.billAxis': '{d} bill',
  'chart.photoAxis': 'Day {n} photo',
  'chart.aria': 'Forecast {n} kWh by {d}',

  // check
  'check.title': 'Check',
  'check.empty': 'The check runs once the bill and the readings are in.',
  'check.scanMeter': 'Scan a meter',
  'check.addsUp': 'Readings add up',
  'check.missingWord': 'missing',
  'check.extraWord': 'extra',
  'check.ofKwh': '{a} of {b} kWh',
  'check.change': "Change {name}'s reading",
  'check.noReading': 'no reading',
  'check.typed': 'Typed',
  'check.verified': 'Verified',
  'check.second': 'Reading needs a second look',
  'check.aligned': 'Reading dates aligned to the bill: {d}',
  'check.gaprule': 'Until it is fixed, the gap is split by kWh.',
  'check.tolerance': 'Within {p}% of the bill counts (about {n} kWh)',
  'check.askPhoto': 'Ask for a new photo',
  'check.sent': 'Sent. They will see: "{msg}"',
  'check.errSend': 'Could not send.',
  'check.kwhThisMonth': '{name}: kWh this month',
  'check.errSave': 'Could not save.',
  'check.missing': '{n} kWh missing',

  // tenant
  'tenant.hi': 'Hi, {name}',
  'share.label': 'Your share',
  'tenant.asked': 'You were asked to pay',
  'tenant.above': "Above the bill's rate by",
  'tenant.seePay': 'See what you pay for',
  'tenant.askComp': 'Ask for the computation',
  'tenant.copied': 'Message copied. Paste it to the organizer.',
  'tenant.message':
    "Hi! Kahati computed my share of the bill as {share} for {kwh} kWh, using the bill's own lines. Could we go over the computation together? {link}",
  'footer.source': 'Computed by Kahati. Not a Meralco statement.',
}
type Key = keyof typeof en

const fil: Record<Key, string> = {
  'nav.home': 'Simula',
  'nav.scan': 'I-scan',
  'nav.bill': 'Singil',
  'nav.usage': 'Gamit',
  'nav.check': 'Suri',
  'nav.main': 'Pangunahing menu',

  'common.tryAgain': 'Subukan ulit',
  'common.error': 'May nagkaproblema.',
  'common.back': 'Bumalik',
  'common.close': 'Isara',
  'common.more': 'Iba pa',
  'common.loading': 'Naglo-load',
  'common.save': 'I-save',
  'common.range': '{a} hanggang {b}',
  'splash.loading': 'Naglo-load ang Kahati',

  'err.unknown_household': 'Hindi kilalang sambahayan.',
  'err.reading_below': 'Mas mababa ang reading na ito kaysa noong nakaraang buwan. Tingnan ulit ang numero.',
  'err.shares_pending': 'Lalabas ang mga bahagi kapag kumpleto na ang bill at lahat ng reading.',
  'err.link_expired': 'Nag-expire na ang link na ito. Humingi ng bago sa organizer.',
  'err.offline': 'Walang koneksyon. Tingnan ang Wi-Fi o lumipat sa hotspot.',
  'err.reader_failed': 'Hindi nabasa ang litrato. Subukan ulit, o i-type na lang.',
  'err.internal': 'May nagkaproblema sa amin. Subukan ulit.',
  'err.bad_state': 'Mukhang mali ang naka-save na datos. I-reset ang demo sa menu ng Simula, saka subukan ulit.',
  'err.bad_request': 'Hindi mabasa ng server ang hiling na iyon. Subukan ulit.',
  'err.negative_kwh': 'Mas mababa ang isang reading kaysa sa nauna. Tingnan ito at i-scan o i-type ulit.',
  'err.no_meter': 'Wala pang metro ang sambahayang ito. I-scan muna ang metro nito.',
  'err.no_base_reading': 'Wala pang panimulang reading. I-scan muna ang bill o ang metro.',
  'err.no_last_period': 'Wala pang naunang bill na pagbabatayan ng tantiya.',
  'err.bad_mime': 'Hindi litrato ang file na iyon. Kumuha ng litrato, o i-type na lang.',
  'err.missing_image': 'Walang naipadalang litrato. Kumuha ng litrato, o i-type na lang.',
  'err.image_too_large': 'Masyadong malaki ang litrato. Kunan ulit nang mas malapit, o i-type na lang.',
  'err.link_expired_on_issue': 'Tapos na ang period ng bill na ito, kaya mag-e-expire agad ang link. I-scan muna ang bill ngayong buwan.',
  'err.no_charged_rate': 'Walang nailagay na singil na rate para sa sambahayang ito. Ilagay ang rate na hiningi sa kanila.',
  'issue.digit_count': 'Mukhang mali ang bilang ng digit.',
  'issue.reads_disagree': 'Hindi nagtugma ang dalawang basa ng litrato.',
  'issue.serial_mismatch': 'Hindi tugma ang serial sa metrong ito.',
  'issue.low_confidence': 'Mahirap basahin ang litrato.',
  'issue.previous_mismatch': 'Sa ibang metro galing ang huling reading.',
  'issue.below_previous': 'Mas mababa ito kaysa noong nakaraang buwan.',

  'home.billTitle': 'Bill ng {month}',
  'home.thisMonth': 'Ngayong buwan',
  'home.noBill': 'Wala pang bill',
  'home.noBillHint': 'I-scan ang bill ng Meralco para simulan ang hatian.',
  'home.scanBill': 'I-scan ang bill',
  'home.toGo': '{n} sa {total} na reading ang kulang pa',
  'home.loadRest': 'I-load ang iba',
  'home.scanName': 'I-scan si {name}',
  'home.addsUp': 'Tugma ang mga reading: {a} sa {b} kWh',
  'home.missing': '{n} kWh ang kulang: {a} sa {b} kWh',
  'home.noReading': 'Wala pang reading',
  'home.rateAbove': 'Ang singil ay {n} na mas mataas sa bill',
  'home.rateVs': '{a} ang singil, {b} sa bill',
  'home.reset': 'I-reset ang demo',

  'scan.confirm': 'Kumpirmahin',
  'scan.fix': 'Ayusin ang numero',
  'scan.before': 'Bago mag-scan',
  'scan.consentTitle': 'Tinatakpan muna sa phone mo ang pangalan, address at account number.',
  'scan.consentBody':
    'Ang may-takip na litrato lang ang ipinapadala ng Kahati para basahin ang bill. Itinatago nito ang period, kWh, halaga, mga linya ng singil at huling 4 na digit ng account. Hindi itinatago ang litrato.',
  'scan.understand': 'Naiintindihan ko',
  'scan.billTitle': 'I-scan ang bill',
  'scan.period': 'Period',
  'scan.totalKwh': 'Kabuuang kWh',
  'scan.amount': 'Halaga',
  'scan.account': 'Account',
  'scan.confirmBill': 'Kumpirmahin ang bill',
  'scan.readingBill': 'Binabasa ang bill…',
  'scan.tapBill': 'I-tap ang frame para kunan ng litrato ang bill.',
  'scan.typeInstead': 'I-type na lang',
  'scan.sampleBill': 'Gamitin ang sample na bill (mock)',
  'scan.typeTitle': 'I-type ang bill',
  'scan.periodStart': 'Simula ng period',
  'scan.periodEnd': 'Katapusan ng period (petsa ng reading)',
  'scan.amountPeso': 'Halaga (₱)',
  'scan.last4': 'Huling 4 na digit ng account',
  'scan.backCamera': 'Bumalik sa camera',
  'scan.errReadBill': 'Hindi nabasa ang bill.',
  'scan.errSaveBill': 'Hindi na-save ang bill.',
  'scan.errReadMeter': 'Hindi nabasa ang metro.',
  'scan.errSaveReading': 'Hindi na-save ang reading.',
  'scan.meterLabel': 'Reading ng metro (noong nakaraang buwan: {n})',
  'scan.sinceLast': '{n} kWh mula noong nakaraang buwan',
  'scan.serialMatch': 'Tugma ang serial {s} kay {name}',
  'scan.serialNo': 'Hindi kay {name} ang metrong may serial {s}',
  'scan.didYouMean': '{a} ba, hindi {b}?',
  'scan.readingMeter': 'Binabasa ang metro…',
  'scan.tapMeter': 'I-tap ang frame para kunan ang metro ni {name}.',
  'scan.sampleMeter': 'Gamitin ang sample na metro (mock)',
  'scan.step': 'Hakbang {n} sa {total}',
  'scan.takePhoto': 'Kumuha ng litrato',
  'scan.reading': 'Binabasa',

  'bill.title': 'Ang binabayaran ni {household}',
  'bill.whatYouPay': 'Ang binabayaran mo',
  'bill.goHome': 'Pumunta sa Simula',
  'bill.footer': 'Halimbawang bill. Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.',
  'line.generation': 'Generation',
  'line.transmission': 'Transmission',
  'line.systemLoss': 'System loss',
  'line.distribution': 'Distribution',
  'line.supplyMetering': 'Supply at metering',
  'line.taxes': 'Buwis',
  'line.other': 'Iba pang singil',

  'usage.title': 'Gamit ni {household}',
  'usage.own': 'Sariling metro',
  'usage.shared': 'Hating metro',
  'usage.showing': 'Ipinapakita',
  'usage.choose': 'Pumili ng sambahayan',
  'usage.expected': 'Inaasahan sa {date} ({low} hanggang {high})',
  'usage.next': 'Sa susunod na buwan, halos kapareho ng nakaraang buwan',
  'usage.guess': 'Tantiya lang',
  'usage.line': '50 kWh na hangganan ng lifeline',
  'usage.stayUnder': 'Manatili sa ilalim ng {limit} kWh: mga {a} imbes na mga {b}',
  'usage.tiers': '4Ps lifeline: 100% bawas hanggang 50 kWh, 35% bawas mula 51 hanggang 70',
  'tier.off': '{n}% bawas',
  'tier.none': 'Walang bawas',
  'tier.marker': '{n} kWh',
  'tier.aria': 'Diskwento ng 4Ps lifeline ayon sa kWh: 100% bawas hanggang 50, 35% mula 51 hanggang 70, 20% mula 71 hanggang 100, wala kapag lampas. Ang inaasahang {n} kWh ay may {p}% bawas.',
  'usage.usingRate': 'Gamit ang rate ng {month}.',
  'usage.perkwh': 'Bawat kWh na matipid mo: mga ₱{n} bawas sa bahagi mo',
  'usage.spike': 'Ang gamit mo ngayong buwan ay {n}% na mas mataas sa karaniwan.',
  'usage.remind': 'Ipaalala sa kalagitnaan ng buwan',
  'usage.remindToast': 'Paaalalahanan ka namin bandang ika-15.',
  'rate.fallback': 'Gamit ang rate ng {month}. Iaanunsyo ang sa {next} sa kalagitnaan ng buwan.',
  'action.plug': 'Hugutin ang rice cooker pagkaluto',
  'action.clock': 'I-timer ang bentilador sa gabi',
  'action.snowflake': 'Isang oras na bawas sa aircon kada araw ay mga 30 kWh kada buwan',

  'chart.billReading': '{d} · Reading sa bill',
  'chart.photo': '{d} · Litrato ng metro',
  'chart.start': 'Simula ng buwan: 0 kWh nagamit',
  'chart.used': '{n} kWh nagamit sa {days} araw, mga {r} kWh kada araw',
  'chart.expected': '{d} · Inaasahan',
  'chart.range': '{n} kWh ({lo} hanggang {hi})',
  'chart.over': ', mga {n} kWh lampas sa {limit} kWh na hangganan',
  'chart.billAxis': 'Bill {d}',
  'chart.photoAxis': 'Litrato, araw {n}',
  'chart.aria': 'Tantiya: {n} kWh sa {d}',

  'check.title': 'Suri',
  'check.empty': 'Tatakbo ang pagsusuri kapag kumpleto na ang bill at mga reading.',
  'check.scanMeter': 'Mag-scan ng metro',
  'check.addsUp': 'Tugma ang mga reading',
  'check.missingWord': 'kulang',
  'check.extraWord': 'sobra',
  'check.ofKwh': '{a} sa {b} kWh',
  'check.change': 'Baguhin ang reading ni {name}',
  'check.noReading': 'walang reading',
  'check.typed': 'Tinype',
  'check.verified': 'Beripikado',
  'check.second': 'Kailangang tingnan ulit ang reading',
  'check.aligned': 'Inihanay sa bill ang petsa ng mga reading: {d}',
  'check.gaprule': 'Habang hindi pa naaayos, hinahati ang kulang ayon sa kWh.',
  'check.tolerance': 'Tanggap kung pasok sa {p}% ng bill (mga {n} kWh)',
  'check.askPhoto': 'Humingi ng bagong litrato',
  'check.sent': 'Naipadala. Makikita nila: "{msg}"',
  'check.errSend': 'Hindi naipadala.',
  'check.kwhThisMonth': '{name}: kWh ngayong buwan',
  'check.errSave': 'Hindi na-save.',
  'check.missing': '{n} kWh ang kulang',

  'tenant.hi': 'Kumusta, {name}',
  'share.label': 'Iyong bahagi',
  'tenant.asked': 'Hiningi sa iyo',
  'tenant.above': 'Lampas sa rate ng bill nang',
  'tenant.seePay': 'Tingnan ang binabayaran mo',
  'tenant.askComp': 'Hingin ang kuwenta',
  'tenant.copied': 'Nakopya ang mensahe. I-paste ito sa organizer.',
  'tenant.message':
    'Hi! Kinuwenta ng Kahati ang bahagi ko sa bill: {share} para sa {kwh} kWh, gamit ang mismong mga linya ng bill. Puwede ba nating pag-usapan ang kuwenta? {link}',
  'footer.source': 'Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.',
}

export type Lang = 'en' | 'fil'
export type TKey = Key
type T = (key: Key, vars?: Record<string, string | number>) => string

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: T; hasKey: (k: string) => k is Key } | null>(null)

function readLang(): Lang {
  try {
    return localStorage.getItem('kahati-lang') === 'fil' ? 'fil' : 'en'
  } catch {
    return 'en'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = readLang()
    setFormatLang(l)
    return l
  })
  const setLang = (l: Lang) => {
    setFormatLang(l)
    setLangState(l)
    try {
      localStorage.setItem('kahati-lang', l)
    } catch {
      /* ignore */
    }
  }
  const t: T = (key, vars) => {
    let s = (lang === 'fil' ? fil[key] : en[key]) ?? en[key] ?? key
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
    return s
  }
  const hasKey = (k: string): k is Key => k in en
  return <Ctx.Provider value={{ lang, setLang, t, hasKey }}>{children}</Ctx.Provider>
}

export function useT() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useT outside LangProvider')
  return c
}

export const lineKey = (k: LineKey) => `line.${k}` as Key

/**
 * Error text in the current language. Coded errors map to `err.*`. Uncoded ones
 * (for example the backend's own "message next" text, which is English) are shown
 * as they are in English, and as the Filipino fallback in Filipino.
 */
export function useErrText() {
  const { t, hasKey, lang } = useT()
  return (e: unknown, fallback: Key) => {
    const code = (e as { code?: string } | null)?.code
    if (code && hasKey(`err.${code}`)) return t(`err.${code}` as Key)
    const msg = e instanceof Error ? e.message : ''
    if (lang === 'en' && msg) return msg
    return t(fallback)
  }
}
