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
  'home.useBuiltIn': 'Use the built-in sample',
  'home.scenarioActive': 'Scenario: {name}',
  'home.loadRestNone': 'This sample has no readings for the rest. Scan the meters or type them.',
  'scenario.loaded': 'Loaded scenario: {name}',
  'scenario.invalid': 'Could not load the scenario: {why}. Kept the current demo.',
  'home.lifelineNote': '{n} are 4Ps under 50 kWh, but lifeline is per Meralco account: {kwh} kWh here.',
  'home.lifelineNote1': '1 is 4Ps under 50 kWh, but lifeline is per Meralco account: {kwh} kWh here.',

  // scan
  'scan.confirm': 'Confirm',
  'scan.fix': 'Edit number',
  'scan.before': 'Before you scan',
  'scan.consentTitle': 'This demo uses a sample bill.',
  'scan.consentBody':
    'The photo is sent to our reader (Google Gemini) to be read, and it is not kept. Kahati keeps the period, kWh, amount, the charge lines and the last 4 digits of the account. Covering the name and address on your phone first is planned, not built yet.',
  'scan.understand': 'I understand',
  'scan.billTitle': 'Scan the bill',
  'scan.period': 'Period',
  'scan.totalKwh': 'Total kWh',
  'scan.amount': 'Amount',
  'scan.account': 'Account',
  'scan.confirmBill': 'Confirm bill',
  'scan.readingBill': 'Reading the bill…',
  'scan.tapBill': 'Point the camera at the bill and press the button.',
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
  'scan.sinceBill': "{n} kWh since the bill's reading",
  'scan.shutter': 'Take photo',
  'scan.torch': 'Flashlight',
  'scan.retake': 'Retake',
  'scan.back': 'Previous step',
  'scan.keepNext': 'Keep and go next',
  'scan.savedReading': 'Saved: {value} ({kwh} kWh). Keep it, or scan again to replace it.',
  'scan.rescanBillNote': "Scanning a new bill clears this month's meter readings.",
  'scan.upload': 'Upload a photo',
  'scan.uploadShort': 'Upload',
  'scan.cameraFallback': 'Camera not available here. Tap the frame to open the camera app.',
  'usage.scan': 'Scan the meter',
  'err.needs_scan': 'Scan the bill and the meters first.',
  'err.needs_own_scan': 'Scan your meter first.',
  'bill.emptyTitle': 'Nothing to split yet',
  'bill.emptyBody': 'Scan the bill and the four sub-meters to see each share.',
  'usage.emptyTitle': 'No readings yet',
  'usage.emptyBody': "Pick a household above, then scan its meter to see this month's forecast.",
  'scan.serialMatch': 'Serial {s} matches {name}',
  'scan.serialNo': "Serial {s} is not {name}'s meter",
  'scan.serialNotRead': 'Serial not read. Check it against the meter.',
  'scan.linesNoAdd': 'The charges do not add up to the total. Type it instead.',
  'scan.linesSpread': 'If you confirm, Kahati spreads the difference across the lines in proportion. Retake for an exact breakdown.',
  'scan.didYouMean': 'Did you mean {a}, not {b}?',
  'scan.readingMeter': 'Reading the meter…',
  'scan.tapMeter': "Point the camera at {name}'s meter and press the button.",
  'scan.sampleMeter': 'Use the sample meter (mock)',
  'scan.step': 'Step {n} of {total}',
  'scan.takePhoto': 'Take a photo',
  'scan.reading': 'Reading',

  // bill
  'bill.title': 'What {household} pays',
  'bill.whatYouPay': 'What you pay for',
  'bill.goHome': 'Go to Home',
  'bill.shareLink': 'Share link',
  'bill.linkCopied': 'Link copied',
  'bill.shareText': "Your share of this month's bill, computed by Kahati.",
  'bill.shareFailed': 'Could not create the link. Try again.',
  'bill.footer': 'Sample bill. Computed by Kahati. Not a Meralco statement.',
  'bill.footerOwn': 'Computed by Kahati. Not a Meralco statement.',
  'bill.lifelineNote': 'No lifeline: it is per Meralco account, and this one used {kwh} kWh.',
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
  'usage.stayUnderFree': 'Stay under {limit} kWh: 100% off instead of about {b}',
  'usage.tiers': '4Ps lifeline: 100% off up to 50 kWh, 35% off from 51 to 70',
  'tier.off': '{n}% off',
  'tier.none': 'No discount',
  'tier.marker': '{n} kWh',
  'tier.aria': '4Ps lifeline discount by kWh: 100% off up to 50, 35% from 51 to 70, 20% from 71 to 100, none above. Expected {n} kWh gets {p}% off.',
  'usage.usingRate': "Using {month}'s rate.",
  'usage.rateRange': 'Range: about {low} to {high}.',
  'usage.perkwh': 'Each kWh you save: about ₱{n} off your share',
  'usage.spike': 'Your use so far this month is {n}% above your usual.',
  'usage.remind': 'Remind me',
  'usage.reminded': 'Reminder set',
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
  'check.emptyTitle': 'Nothing to check yet',
  'check.empty': 'The check runs once the bill and the readings are in.',
  'check.scanMeter': 'Scan the meter',
  'check.addsUp': 'Readings add up',
  'check.missingWord': 'missing',
  'check.extraWord': 'extra',
  'check.ofKwh': '{a} of {b} kWh',
  'check.change': "Change {name}'s reading",
  'check.noReading': 'no reading',
  'check.typed': 'Typed',
  'check.verified': 'Verified',
  'check.serialUnchecked': 'Serial not checked',
  'check.second': 'Reading needs a second look',
  'check.aligned': 'Reading dates aligned to the bill: {d}',
  'check.gaprule': 'Until it is fixed, the gap is split by kWh.',
  'check.tolerance': 'Within {p}% of the bill counts (about {n} kWh)',
  'check.askPhoto': 'Ask for a new photo',
  'check.sent': 'Message ready to send: "{msg}"',
  'check.errSend': 'Could not send.',
  'check.askMessage': 'Kahati: a meter reading needs a second look. Please send me a new photo of your meter.',
  'check.messageReady': 'Message ready to send',
  'check.copied': 'Copied',
  'check.kwhThisMonth': '{name}: kWh this month',
  'check.errSave': 'Could not save.',
  'check.missing': '{n} kWh missing',

  // ask (chat)
  'ask.title': 'Ask Kahati',
  'ask.open': 'Ask Kahati',
  'ask.about': "About {name}'s bill",
  'ask.intro': "Hi! I explain the numbers Kahati worked out for {name}. Tap a question, or type your own.",
  'ask.introNoName': 'Hi! I explain the numbers Kahati worked out for this household. Tap a question, or type your own.',
  'ask.placeholder': 'Ask about this bill',
  'ask.send': 'Send',
  'ask.thinking': 'Kahati is working it out',
  'ask.err': 'Kahati could not answer that. Try a question button.',
  'err.slow_down': 'Too many questions at once. Try a question button.',
  'err.ask_failed': 'Kahati could not answer that right now. Try a question button.',

  // tenant
  'tenant.hi': 'Hi, {name}',
  'tenant.wholeBill': 'Whole bill: {amount} for {kwh}',
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
  'home.useBuiltIn': 'Gamitin ang built-in na sample',
  'home.scenarioActive': 'Scenario: {name}',
  'home.loadRestNone': 'Walang reading ang sample na ito para sa iba. I-scan ang mga meter o i-type ang mga reading.',
  'scenario.loaded': 'Na-load ang scenario: {name}',
  'scenario.invalid': 'Hindi ma-load ang scenario: {why}. Pinanatili ang kasalukuyang demo.',
  'home.lifelineNote': '{n} ang 4Ps na wala pang 50 kWh, pero kada Meralco account ang lifeline: {kwh} kWh dito.',
  'home.lifelineNote1': '1 ang 4Ps na wala pang 50 kWh, pero kada Meralco account ang lifeline: {kwh} kWh dito.',

  'scan.confirm': 'Kumpirmahin',
  'scan.fix': 'Ayusin ang numero',
  'scan.before': 'Bago mag-scan',
  'scan.consentTitle': 'Sample na bill ang gamit ng demo na ito.',
  'scan.consentBody':
    'Ipinapadala ang litrato sa aming tagabasa (Google Gemini) para mabasa, at hindi ito sine-save. Sine-save ng Kahati ang period, kWh, halaga, mga linya ng singil at huling 4 na digit ng account. Ang pagtatakip muna ng pangalan at address sa phone mo ay plano pa lang, hindi pa gawa.',
  'scan.understand': 'Naiintindihan ko',
  'scan.billTitle': 'I-scan ang bill',
  'scan.period': 'Period',
  'scan.totalKwh': 'Kabuuang kWh',
  'scan.amount': 'Halaga',
  'scan.account': 'Account',
  'scan.confirmBill': 'Kumpirmahin ang bill',
  'scan.readingBill': 'Binabasa ang bill…',
  'scan.tapBill': 'Itutok ang camera sa bill at pindutin ang button.',
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
  'scan.sinceBill': '{n} kWh mula sa reading sa bill',
  'scan.shutter': 'Kumuha ng litrato',
  'scan.torch': 'Flashlight',
  'scan.retake': 'Ulitin',
  'scan.back': 'Nakaraang hakbang',
  'scan.keepNext': 'Panatilihin at sunod',
  'scan.savedReading': 'Naka-save: {value} ({kwh} kWh). Panatilihin, o i-scan ulit para palitan.',
  'scan.rescanBillNote': 'Kapag nag-scan ng bagong bill, mabubura ang mga reading ngayong buwan.',
  'scan.upload': 'Mag-upload ng litrato',
  'scan.uploadShort': 'I-upload',
  'scan.cameraFallback': 'Hindi magamit ang camera dito. I-tap ang frame para buksan ang camera app.',
  'usage.scan': 'I-scan ang metro',
  'err.needs_scan': 'I-scan muna ang bill at ang mga metro.',
  'err.needs_own_scan': 'I-scan muna ang metro mo.',
  'bill.emptyTitle': 'Wala pang hahatiin',
  'bill.emptyBody': 'I-scan ang bill at ang apat na sub-metro para makita ang bahagi ng bawat isa.',
  'usage.emptyTitle': 'Wala pang reading',
  'usage.emptyBody': 'Pumili ng sambahayan sa itaas, saka i-scan ang metro nito para makita ang tantiya ngayong buwan.',
  'scan.serialMatch': 'Tugma ang serial {s} kay {name}',
  'scan.serialNo': 'Hindi kay {name} ang metrong may serial {s}',
  'scan.serialNotRead': 'Hindi nabasa ang serial. Ihambing ito sa metro.',
  'scan.linesNoAdd': 'Hindi tugma ang kabuuan ng mga singil sa total. I-type na lang ito.',
  'scan.linesSpread': 'Kapag kinumpirma, hahatiin ng Kahati ang kulang sa mga singil ayon sa laki ng bawat isa. Ulitin ang litrato para sa eksaktong hati.',
  'scan.didYouMean': '{a} ba, hindi {b}?',
  'scan.readingMeter': 'Binabasa ang metro…',
  'scan.tapMeter': 'Itutok ang camera sa metro ni {name} at pindutin ang button.',
  'scan.sampleMeter': 'Gamitin ang sample na metro (mock)',
  'scan.step': 'Hakbang {n} sa {total}',
  'scan.takePhoto': 'Kumuha ng litrato',
  'scan.reading': 'Binabasa',

  'bill.title': 'Bayarin ni {household}',
  'bill.whatYouPay': 'Ang binabayaran mo',
  'bill.goHome': 'Pumunta sa Simula',
  'bill.shareLink': 'Ibahagi ang link',
  'bill.linkCopied': 'Nakopya ang link',
  'bill.shareText': 'Ang bahagi mo sa bill ngayong buwan, kinompyut ng Kahati.',
  'bill.shareFailed': 'Hindi magawa ang link. Subukan ulit.',
  'bill.footer': 'Halimbawang bill. Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.',
  'bill.footerOwn': 'Kinuwenta ng Kahati. Hindi ito pahayag ng Meralco.',
  'bill.lifelineNote': 'Walang lifeline: kada Meralco account ito, at {kwh} kWh ang nagamit ng account na ito.',
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
  'usage.stayUnderFree': 'Hanggang {limit} kWh lang: 100% diskwento imbes na mga {b}',
  'usage.tiers': '4Ps lifeline: 100% bawas hanggang 50 kWh, 35% bawas mula 51 hanggang 70',
  'tier.off': '{n}% bawas',
  'tier.none': 'Walang bawas',
  'tier.marker': '{n} kWh',
  'tier.aria': 'Diskwento ng 4Ps lifeline ayon sa kWh: 100% bawas hanggang 50, 35% mula 51 hanggang 70, 20% mula 71 hanggang 100, wala kapag lampas. Ang inaasahang {n} kWh ay may {p}% bawas.',
  'usage.usingRate': 'Gamit ang rate ng {month}.',
  'usage.rateRange': 'Saklaw: mga {low} hanggang {high}.',
  'usage.perkwh': 'Bawat kWh na matipid mo: mga ₱{n} bawas sa bahagi mo',
  'usage.spike': 'Ang gamit mo ngayong buwan ay {n}% na mas mataas sa karaniwan.',
  'usage.remind': 'Paalala',
  'usage.reminded': 'Naka-set na',
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
  'check.emptyTitle': 'Wala pang susuriin',
  'check.empty': 'Tatakbo ang pagsusuri kapag kumpleto na ang bill at mga reading.',
  'check.scanMeter': 'I-scan ang metro',
  'check.addsUp': 'Tugma ang mga reading',
  'check.missingWord': 'kulang',
  'check.extraWord': 'sobra',
  'check.ofKwh': '{a} sa {b} kWh',
  'check.change': 'Baguhin ang reading ni {name}',
  'check.noReading': 'walang reading',
  'check.typed': 'Tinype',
  'check.verified': 'Beripikado',
  'check.serialUnchecked': 'Hindi nasuri ang serial',
  'check.second': 'Kailangang tingnan ulit ang reading',
  'check.aligned': 'Inihanay sa bill ang petsa ng mga reading: {d}',
  'check.gaprule': 'Habang hindi pa naaayos, hinahati ang kulang ayon sa kWh.',
  'check.tolerance': 'Tanggap kung pasok sa {p}% ng bill (mga {n} kWh)',
  'check.askPhoto': 'Humingi ng bagong litrato',
  'check.sent': 'Handa nang ipadala ang mensahe: "{msg}"',
  'check.errSend': 'Hindi naipadala.',
  'check.askMessage': 'Kahati: kailangang tingnan ulit ang isang reading ng metro. Pakipadala sa akin ang bagong litrato ng metro mo.',
  'check.messageReady': 'Handa nang ipadala ang mensahe',
  'check.copied': 'Nakopya',
  'check.kwhThisMonth': '{name}: kWh ngayong buwan',
  'check.errSave': 'Hindi na-save.',
  'check.missing': '{n} kWh ang kulang',

  'ask.title': 'Magtanong sa Kahati',
  'ask.open': 'Magtanong sa Kahati',
  'ask.about': 'Tungkol sa bill ni {name}',
  'ask.intro': 'Kumusta! Ipinapaliwanag ko ang mga numerong kinuwenta ng Kahati para kay {name}. Pumili ng tanong, o mag-type ng sarili mo.',
  'ask.introNoName': 'Kumusta! Ipinapaliwanag ko ang mga numerong kinuwenta ng Kahati para sa sambahayang ito. Pumili ng tanong, o mag-type ng sarili mo.',
  'ask.placeholder': 'Magtanong tungkol sa bill na ito',
  'ask.send': 'Ipadala',
  'ask.thinking': 'Kinukuwenta ng Kahati',
  'ask.err': 'Hindi ito nasagot ng Kahati. Subukan ang isang button na tanong.',
  'err.slow_down': 'Masyadong maraming tanong nang sabay. Subukan ang isang button na tanong.',
  'err.ask_failed': 'Hindi ito masagot ng Kahati ngayon. Subukan ang isang button na tanong.',

  'tenant.hi': 'Kumusta, {name}',
  'tenant.wholeBill': 'Buong bill: {amount} para sa {kwh}',
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
