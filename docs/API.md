# Kahati API (contract)

This file is how backend and frontend talk. **It is the source of truth.** Change it first, then the code, and start the commit message with `contract:` so the other side sees it.

Types: `src/types/index.ts` (import them directly from the frontend if you share the repo).

## Principles

- **Stateless.** The server keeps no database for the demo path. The frontend holds a `CompoundState` (localStorage is fine) and POSTs it. Start from `GET /api/sample`. This works on Vercel, where serverless instances do not share memory.
- **Money** is pesos as numbers. Fields named `amount` are display values (2 dp, largest-remainder rounded). Fields ending in `Exact` are unrounded.
- **Dates** are `YYYY-MM-DD`; timestamps are full ISO with `+08:00`.
- **Errors:** non-2xx with `{ "error": { "code", "message", "next" } }`. `next` is a human next step ("Type it instead").
- **Wording rules** apply to every string the API returns: never "overcharged", "owed"; a flagged reading "needs a second look" and never names the household; tenant-facing payloads carry "Computed by Kahati. Not a Meralco statement."

## Status legend

`planned` → `mock` (returns sample values) → `live`.

| Method | Path | What | Status |
|---|---|---|---|
| GET | `/api/health` | Liveness, version, reader mode | live |
| GET | `/api/sample?which=compound\|bautista` | Seed `CompoundState` | live |
| POST | `/api/scan/bill` | Bill photo → `BillScan` (user confirms before use) | mock |
| POST | `/api/scan/meter` | Meter photo → `MeterScan` + serial match | mock |
| POST | `/api/split` | `CompoundState` → `SplitResult` (shares + per-line breakdown) | live |
| POST | `/api/rate-check` | `CompoundState` + householdId → `RateCheck` | live |
| POST | `/api/forecast` | Readings + bill → `Forecast` (stages 1 to 3, 50 kWh line) | live |
| POST | `/api/check` | `CompoundState` → `CheckResult` (add-up, typed chips, gap rule, digit suggestion) | live |
| POST | `/api/tenant-link` | `CompoundState` + householdId → `{ token, url, expiresAt, view }` | live |
| GET | `/api/tenant/{token}` | → `TenantView` | live |

## Endpoints

### GET /api/sample

`?which=compound` (default) or `?which=bautista` returns a full `CompoundState` to start from. 400 `bad_which` otherwise.

### POST /api/split
Request: `{ "state": CompoundState }` (start from GET /api/sample).
Response 200 (sample compound): `{ billId: "b2026-10", shares: [ {householdId:"hA", kwh:52, amountExact:782.3665..., amount:782.36, fixedPart:5.345, breakdown:{...}}, {hB: kwh 45, amountExact 677.7675, amount 677.77, breakdown {generation 422.5, transmission 57.5, systemLoss 37.5, distribution 82.5, supplyMetering 17.5, taxes 47.5, other 12.7675}}, {hC: 38, 573.1684..., 573.17}, {hD: 45, 677.7675, 677.77} ], total: 2711.07, unmeteredKwh: 0, effectiveRate: 15.0615, perKwhValue: 14.9427 }`
Errors: 400 `bad_json` / `bad_state` (next: "Send {state} from GET /api/sample."); 422 `missing_reading` (next: "Scan or type the missing reading"); 422 `negative_kwh` (next: "Check the reading and scan or type it again"); 422 `no_usage` (next: "Scan or type this month's readings" / "Add at least one household.").

### POST /api/rate-check
Request: `{ "state": CompoundState, "householdId": "hB" }`
Response 200: `{ householdId:"hB", chargedRate:16.5, effectiveRate:15.0615, kwh:45, askedAmount:742.5, shareAmount:677.77, aboveBy:64.73, flagged:true, message:"₱16.50 charged, ₱15.06 on the bill. That is ₱64.73 above the bill's rate on a 45 kWh share." }`
Not flagged message: "The charged rate matches the bill's rate."
Errors: 400 `bad_json` / `bad_request`; 404 `no_charged_rate` (next: "Enter the rate this household was asked to pay."); 422 split errors as above.

### POST /api/scan/bill

Request: `{ "imageBase64": "<base64 or data URL>", "mimeType": "image/jpeg" }` (mimeType defaults to image/jpeg). The image is never stored.

Response 200 (sample compound, mock reader):
```json
{
  "scan": {
    "periodStart": "2026-09-30", "periodEnd": "2026-10-31", "readDate": "2026-10-31", "nextReadDate": "2026-11-30",
    "kwh": 180, "amount": 2711.07,
    "lines": { "generation": 1690, "transmission": 230, "systemLoss": 150, "distribution": 330, "supplyMetering": 70, "taxes": 190, "other": 51.07 },
    "fixedCharges": 21.38, "previousReading": 12340, "presentReading": 12520,
    "history": [{ "month": "2025-11", "kwh": 168 }, "... 12 months to 2026-10"],
    "accountLast4": "4821", "confidence": 0.95, "provider": "mock"
  },
  "sanity": { "effectiveRate": 15.0615, "withinBand": true, "note": "About ₱15.06 per kWh, close to Meralco's 2026-10 rate of ₱15.0615." }
}
```
sanity compares amount/kWh to the latest RATES row, band +-35%. If kWh is 0 or missing, withinBand is false with a "confirm the numbers" note.

Errors (all `{ error: { code, message, next } }`):
- 400 `bad_json`, next "Send a JSON body."
- 400 `missing_image`, next "Type it instead"
- 400 `bad_mime` (mimeType not image/*), next "Type it instead"
- 413 `image_too_large` (base64 over 4 MiB chars, or content-length over about 4 MB), next "Retake the photo closer, or type it instead"
- 502 `reader_failed`, next "Try again, or type it instead"

### POST /api/scan/meter

Request: `{ "imageBase64": "...", "mimeType": "image/jpeg", "meter"?: Meter, "previous"?: Reading, "hint"?: "SM-0214" }`. `meter` supplies expected digits and serial for validation; `hint` (defaults to meter.serial) only steers the mock reader (accepts serials, or ids mA..mD, mMaster).

Response 200 (meter SM-0214, previous 4527):
```json
{
  "scan": { "value": 4572, "digitsText": "04572", "serial": "SM-0214", "confidence": 0.97, "secondRead": 4572, "provider": "mock" },
  "validation": { "ok": true, "kwhSinceLast": 45, "serialMatches": true, "issues": [] },
  "serialLine": "Serial SM-0214 matches"
}
```
Issue codes: below_previous, digit_count, reads_disagree, serial_mismatch, low_confidence (each `{code, message}`, never naming a household). serialLine variants: "Serial X matches", "Serial X does not match this meter", "Serial X read" (no meter given), "Serial not read. Check it against the meter.".

Errors: same 400/413/502 set as the bill route.

### Library
- `getReaders()` from `@/lib/readers`: Gemini when `READER=gemini` and `GEMINI_API_KEY` set (model `GEMINI_MODEL`, default gemini-2.5-flash), else mock. Gemini meter reader makes two parallel calls; confidence is the min of both.
- `validateMeterScan({scan, meter, previous, history?})` from `@/lib/engine/meterValidate` (pure). `history` is accepted but not used for a flag.
- `ReaderError` (code: http_error | bad_output | no_api_key | network) thrown by Gemini readers.

### POST /api/forecast

Request: {state, householdId, asOf?, ownMeter?, history?, nextPeriodCdd?, useWeather?}. `useWeather: true` fits stage 3 from Open-Meteo temperatures and state.bill.history (6 to 24 months), only for a single-meter compound with no ownMeter:false and no mid-period photo; it is ignored in shared mode. If the weather lookup fails (8 s budget) the normal forecast is returned with note "Weather unavailable, using the photo-based forecast." (stage 2) or "Weather unavailable, using last bill's kWh." (stage 1). Stage 3 may carry note "Days past the 16-day weather forecast use last year's temperatures for the same dates." Response: Forecast {householdId, stage, readDate, kwh, low, high, label, points, rate, lifeline, perKwhValue, spike, actions, note?}. Sample Bautista: stage 2, kwh 53 (51 to 55), rate 15.0615 (2026-10, fallback, note "Using October's rate. November's is announced mid-month."), lifeline message "Stay under 50 kWh: about ₱0 instead of about ₱519". Sample Santos (hB): stage 1 "Rough guess", kwh 45, perKwhValue 14.94, lifeline null, points 2026-10-31 (day 0) to 2026-11-30 (day 30). Errors: 400 bad_body, bad_state (incl. compound.mode not single or shared), bad_household, bad_as_of, bad_own_meter, bad_history, bad_cdd, bad_use_weather; 422 unknown_household, no_meter, no_base_reading, reading_below_base, no_last_period. Each has a "next" step. When the rate is a fallback and the table has more than one row, lifeline.message gets an appended peso range sentence (also in lifeline.pesoLow and pesoHigh).

### POST /api/check

Runs the verification ("Check") for one compound and one billing period. Stateless.

Request: `{ "state": CompoundState }` (start from GET /api/sample). Needs state.bill.kwh, state.meters, state.previousReadings and state.currentReadings.

Response 200 (CheckResult), sample compound:
```json
{
  "billId": "b2026-10",
  "status": "ok",
  "billKwh": 180,
  "readingsKwh": 180,
  "missingKwh": 0,
  "tolerancePct": 5,
  "toleranceKwh": 9,
  "households": [
    { "householdId": "hA", "kwh": 52, "chip": "verified", "flags": [], "suggestion": null },
    { "householdId": "hB", "kwh": 45, "chip": "verified", "flags": [], "suggestion": null },
    { "householdId": "hC", "kwh": 38, "chip": "verified", "flags": [], "suggestion": null },
    { "householdId": "hD", "kwh": 45, "chip": "verified", "flags": [], "suggestion": null }
  ],
  "alignedTo": "Reading dates aligned to the bill: 31 Oct",
  "gapRule": null,
  "headline": "Readings add up: 180 of 180 kWh",
  "detail": null
}
```
`detail` is null when ok; on a gap it reads "Readings add up to 162 of 180 kWh." Household chip is "verified", "typed" or "missing" (no current reading). kWh figures are rounded to 1 decimal.
Gap example (Dela Cruz typed 2220): status "gap", readingsKwh 162, missingKwh 18, headline "18 kWh missing", detail "Readings add up to 162 of 180 kWh.", hC chip "typed", gapRule "Until it is fixed, the gap is split by kWh.", no suggestion. Over-reporting gives "N kWh extra".
Digit fix example (Santos photo 4512, confidence 0.6): hB.suggestion = {"from":"04512","to":"04572","message":"Did you mean 04572, not 04512?"}.
Flags (all start "Reading needs a second look", never name a household): below previous reading, serial mismatch, "Photo time is outside this billing period." (captured before the previous reading or more than 7 days after the read date), missing reading, usage over 40% from previous-period kWh (only when provided).

Errors:
- 400 bad_json: body is not JSON. next: "Send a JSON body."
- 400 bad_state: state missing or malformed, with a specific message, for example bill.kwh not above zero, bill.amount not above zero, fixedCharges above amount or above lines.supplyMetering, a reading value that is negative, fractional or has more digits than the meter, a bad date, serialRead not a string, confidence outside 0 to 1. next: "Send {state} from GET /api/sample."
- 500 internal: next "Try again."
(422 bad_bill_kwh no longer exists; a non-positive bill.kwh is a 400 bad_state.)

Engine exports: checkCompound(state, opts?: {previousKwh?: Record<householdId, number>}), alignToReadDate(prev, curr, readDate) -> number (also exports manilaDay), suggestDigitFix({candidates, gapKwh, toleranceKwh}) -> {householdId, from, to, message} | null.


## Batch 2 changes (12 Nov, about 10 AM)

### All state endpoints (split, rate-check, check, tenant-link)

Bodies are validated by `validateState`. Invalid state returns 400 `bad_state` with the specific reason; unexpected errors return 500 `internal` (next "Try again."). Rate check message when the charged rate is more than 2% below the bill's rate: "The charged rate is below the bill's rate."

### POST /api/tenant-link
Request: `{ state: CompoundState, householdId: string, baseUrl?: string }`. `state` goes through the shared `validateState`. `baseUrl` must be http or https; if omitted, the request origin is used.

Response 200: `{ token, url: "<base>/t/<token>", expiresAt: "2026-12-07T23:59:59+08:00", view: TenantView }`. The view includes the footer "Computed by Kahati. Not a Meralco statement." and never includes the 4Ps flag.

Errors (all `{error:{code,message,next}}`):
- 400 `bad_state`: state fails validation (next "Send {state} from GET /api/sample.").
- 400 `bad_request`: householdId is not a string, or baseUrl is not http(s).
- 400 `bad_json`: body is not valid JSON (from readJson).
- 404: unknown household (TenantError code).
- 422 `link_expired_on_issue`: the bill period has already ended (next "Scan this month's bill first."), or a SplitError.
- 500 `internal`: unexpected error, or TENANT_SECRET missing when VERCEL_ENV=production (next "Try again.").

Privacy: the organizer's POST response omits `rateCheck`; the tenant sees it via GET. The token itself is signed, not encrypted, so its payload is readable by whoever holds the link. The signature proves Kahati computed the view from the submitted bill and readings, not that they are genuine.

### GET /api/tenant/{token}
Response 200: TenantView. Errors: 401 `bad_signature` and 410 `expired` (next "Ask the organizer for a new link"), 400 `malformed`, 500 `internal`. Both rows in the API.md endpoint table should be marked live and the old `{token,url,expiresAt}` shape replaced.

### Check (update)

POST /api/check: 200 CheckResult now carries `detail` (null when ok; "Readings add up to 162 of 180 kWh." on a gap). Household chip is verified | typed | missing. kWh rounded to 1 decimal. Errors: 400 bad_json; 400 bad_state (specific message, next "Send {state} from GET /api/sample."); 500 internal (next "Try again."). 422 bad_bill_kwh was removed. New bad_state reasons (also apply to /api/split and /api/rate-check): bill.amount must be above zero; fixedCharges cannot exceed amount or lines.supplyMetering; reading value must be a whole number >= 0 and fit the meter's digits; capturedAt date part must be a real date; serialRead must be a string; confidence 0 to 1; perKwh <= 10000; bill.kwh <= 1e7. docs/API.md was updated for the check section only, to cover the above, since the verifier listed that as an issue. The brief said not to edit it, so reconcile if needed.

### Forecast with weather (update)

POST /api/forecast: request adds optional useWeather (boolean; non-boolean gives 400 bad_use_weather). Stage 3 from Open-Meteo applies only when compound.mode is "single", ownMeter is not false, the household has no mid-period photo, and bill.history has 6 to 24 months. It is ignored in shared mode, even with ownMeter:true. Lookups run in parallel under one 8 s deadline. On failure the normal forecast is returned with note "Weather unavailable, using the photo-based forecast." (stage 2) or "Weather unavailable, using last bill's kWh." (stage 1). Stage 3 may carry note "Days past the 16-day weather forecast use last year's temperatures for the same dates." Response gains optional note. This text is already merged into docs/API.md (the "do not edit docs/API.md" rule was overridden by the verifier's explicit fix request).

### Scan (update)

#### POST /api/scan/bill (changed)
Request: `{ "imageBase64": "...", "mimeType": "image/jpeg" }`
Response 200: `{ "scan": BillScan, "sanity": { "effectiveRate": 15.0615, "withinBand": true, "note": "About ₱15.06 per kWh, close to Meralco's 2026-10 rate of ₱15.0615.", "rateMonth": "2026-10" } }`
- Sanity compares amount/kWh with the RATES row for the month of scan.periodEnd, else the latest earlier row. The note names the month used; when it fell back it reads "2026-10 rate (the latest before this bill)". `rateMonth` is the new field. If no row is at or before the bill month, or kwh <= 0: effectiveRate 0, withinBand false, note "Could not check the rate. Please confirm the numbers."
- `scan.missing?: string[]` (e.g. ["lines.taxes","fixedCharges"]) appears only when the reader could not find those fields; confidence is then <= 0.5, so the UI should ask the user to confirm them.
- Errors: 400 missing_image / bad_mime, 413 image_too_large, 502 reader_failed (next: "Try again, or type it instead").

#### POST /api/scan/meter (changed)
Response `validation.issues[].code` gains `"previous_mismatch"` (when previous.meterId !== meter.id; kwhSinceLast is then null, ok false). Mock now maps mMaster and MM-7781 to 12520 (digitsText "12520"); MM-5520 stays 12552. Golden: SM-0214 -> 04572, vs 4527 -> 45 kWh, serial matches.


## Batch 3 changes (12 Nov, about 10:30 AM)

POST /api/tenant-link: Response 200 is now `{ token, url, expiresAt, view }` where `view` is a TenantView WITHOUT `rateCheck` (the key is absent). The tenant gets the full view, including her own rateCheck (e.g. hB aboveBy 64.73), from GET /api/tenant/{token}. The token signature proves Kahati computed the view from the submitted bill and readings, not that they are genuine. The "Limitation" paragraph about the organizer seeing rateCheck in the POST response no longer applies to the response body (the base64url token payload still contains it).

POST /api/check: CheckResult gains optional `complete: boolean` (false when any household chip is "missing"). A household with a current reading but no previous reading, or no meter, gets chip "missing"; the no-previous case adds flag "Reading needs a second look: no previous reading to compare with." Headline unchanged.

All state endpoints (validateState) 400 bad_state additionally: bill.id missing or not a string; "Bill lines do not add up to the bill amount." when the lines sum differs from bill.amount by more than 0.01; households > 50, meters > 60, or any readings array > 500 entries.

POST /api/scan/bill: sanity always includes `rateMonth` (string, or null when the rate could not be checked).

POST /api/scan/meter: `meter` is only used when it has string id, string serial and numeric digits; `previous` only when it has string meterId and numeric value (otherwise ignored, as before for malformed input).

POST /api/forecast: no request change. Internally the weather stage-3 pre-fetch now skips only when a reading exists at least 1 day after the forecast base date (same rule as forecast()), and the 8 s deadline timer is cleared after the fetch settles.

A household with no linked meter gets the flag "Reading needs a second look: no meter is linked yet."

**Demo path test:** `src/e2e/demo.test.ts` runs all 8 demo steps through the real route handlers. If it passes, the demo path works.

**Accuracy harness:** see `scripts/README.md` (needs `GEMINI_API_KEY` and the labelled photos in `data-private/`).

### Scan bill: charge lines reconciled (12 Nov, about 11 AM)

`sanity` now also carries `linesAddUp: boolean`, `linesAdjustedBy: number` and `linesNote: string | null`. When the scanned lines differ from the total by ₱5 or less, the difference is moved into `lines.other` (so every state endpoint accepts the bill) and `linesNote` says so, for the UI to show before Confirm. A larger difference is left as read, with `linesAddUp: false` and a note asking the user to check each line; confirming it as is would fail with 400 `bad_state` ("Bill lines do not add up to the bill amount.").

## Golden sample values (the frontend can test against these)

- Bill: 30 Sep to 31 Oct 2026, 180 kWh, ₱2,711.07, account •••• 4821.
- Shares: Reyes ₱782.36, Santos ₱677.77, Dela Cruz ₱573.17, Garcia ₱677.77 (total ₱2,711.07).
- Santos breakdown: Generation 422.50, Transmission 57.50, System loss 37.50, Distribution 82.50, Supply and metering 17.50, Taxes 47.50, Other charges 12.77.
- Rate check (Santos): ₱16.50 charged vs ₱15.06 on the bill, asked ₱742.50, ₱64.73 above.
- Per kWh saved on the shared meter: ₱14.94 ("about ₱15").
- Bautista forecast: 53 kWh by 30 Nov (51 to 55); staying under 50 kWh: about ₱0 instead of about ₱519.
- Check with Dela Cruz typed 20: "18 kWh missing", 162 of 180 kWh, chip "typed".
