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
| GET | `/api/sample?which=compound\|bautista` | Seed `CompoundState` | planned |
| POST | `/api/scan/bill` | Bill photo → `BillScan` (user confirms before use) | planned |
| POST | `/api/scan/meter` | Meter photo → `MeterScan` + serial match | planned |
| POST | `/api/split` | `CompoundState` → `SplitResult` (shares + per-line breakdown) | planned |
| POST | `/api/rate-check` | `CompoundState` + householdId → `RateCheck` | planned |
| POST | `/api/forecast` | Readings + bill → `Forecast` (stages 1 to 3, 50 kWh line) | planned |
| POST | `/api/check` | `CompoundState` → `CheckResult` (add-up, typed chips, gap rule, digit suggestion) | planned |
| POST | `/api/tenant-link` | `CompoundState` + householdId → `{ token, url, expiresAt }` | planned |
| GET | `/api/tenant/{token}` | → `TenantView` | planned |

Details for each endpoint (request, response, sample payload with the sample compound) are added here as each one lands.

## Golden sample values (the frontend can test against these)

- Bill: 30 Sep to 31 Oct 2026, 180 kWh, ₱2,711.07, account •••• 4821.
- Shares: Reyes ₱782.36, Santos ₱677.77, Dela Cruz ₱573.17, Garcia ₱677.77 (total ₱2,711.07).
- Santos breakdown: Generation 422.50, Transmission 57.50, System loss 37.50, Distribution 82.50, Supply and metering 17.50, Taxes 47.50, Other charges 12.77.
- Rate check (Santos): ₱16.50 charged vs ₱15.06 on the bill, asked ₱742.50, ₱64.73 above.
- Per kWh saved on the shared meter: ₱14.94 ("about ₱15").
- Bautista forecast: 53 kWh by 30 Nov (51 to 55); staying under 50 kWh: about ₱0 instead of about ₱519.
- Check with Dela Cruz typed 20: "18 kWh missing", 162 of 180 kWh, chip "typed".
