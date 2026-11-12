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
| POST | `/api/tenant-link` | `CompoundState` + householdId → `{ token, url, expiresAt }` | planned |
| GET | `/api/tenant/{token}` | → `TenantView` | planned |

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

Request: {state, householdId, asOf?, ownMeter?, history?, nextPeriodCdd?}. Response: Forecast {householdId, stage, readDate, kwh, low, high, label, points, rate, lifeline, perKwhValue, spike, actions}. Sample Bautista: stage 2, kwh 53 (51 to 55), rate 15.0615 (2026-10, fallback, note "Using October's rate. November's is announced mid-month."), lifeline message "Stay under 50 kWh: about ₱0 instead of about ₱519". Sample Santos (hB): stage 1 "Rough guess", kwh 45, perKwhValue 14.94, lifeline null, points 2026-10-31 (day 0) to 2026-11-30 (day 30). Errors: 400 bad_body, bad_state (incl. compound.mode not single or shared), bad_household, bad_as_of, bad_own_meter, bad_history, bad_cdd; 422 unknown_household, no_meter, no_base_reading, reading_below_base, no_last_period. Each has a "next" step. When the rate is a fallback and the table has more than one row, lifeline.message gets an appended peso range sentence (also in lifeline.pesoLow and pesoHigh).

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
  "headline": "Readings add up: 180 of 180 kWh"
}
```
Gap example (Dela Cruz typed 2220): status "gap", readingsKwh 162, missingKwh 18, headline "18 kWh missing", hC chip "typed", gapRule "Until it is fixed, the gap is split by kWh.", no suggestion. Over-reporting gives "N kWh extra".
Digit fix example (Santos photo 4512, confidence 0.6): hB.suggestion = {"from":"04512","to":"04572","message":"Did you mean 04572, not 04512?"}.
Flags (all start "Reading needs a second look", never name a household): below previous reading, serial mismatch, "Photo time is outside this billing period." (captured before the previous reading or more than 7 days after the read date), missing reading, usage over 40% from previous-period kWh (only when provided).

Errors:
- 400 bad_json: body is not JSON. next: "Send a JSON body."
- 400 bad_state: state missing or lacks bill, meters or readings. next: start from GET /api/sample.
- 422 bad_bill_kwh: bill.kwh is 0 or negative. next: check the bill scan.

Engine exports: checkCompound(state, opts?: {previousKwh?: Record<householdId, number>}), alignToReadDate(prev, curr, readDate) -> number (also exports manilaDay), suggestDigitFix({candidates, gapKwh, toleranceKwh}) -> {householdId, from, to, message} | null.


## Golden sample values (the frontend can test against these)

- Bill: 30 Sep to 31 Oct 2026, 180 kWh, ₱2,711.07, account •••• 4821.
- Shares: Reyes ₱782.36, Santos ₱677.77, Dela Cruz ₱573.17, Garcia ₱677.77 (total ₱2,711.07).
- Santos breakdown: Generation 422.50, Transmission 57.50, System loss 37.50, Distribution 82.50, Supply and metering 17.50, Taxes 47.50, Other charges 12.77.
- Rate check (Santos): ₱16.50 charged vs ₱15.06 on the bill, asked ₱742.50, ₱64.73 above.
- Per kWh saved on the shared meter: ₱14.94 ("about ₱15").
- Bautista forecast: 53 kWh by 30 Nov (51 to 55); staying under 50 kWh: about ₱0 instead of about ₱519.
- Check with Dela Cruz typed 20: "18 kWh missing", 162 of 180 kWh, chip "typed".
