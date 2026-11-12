# Kahati (web)

Phone-first React + TypeScript front end for Kahati, IDOL Hackathon 2026, Challenge 2. Built with Vite.

## Run

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173 at phone width. On Vercel, deploy it as its own project with **Root Directory** set to `web`. Without `VITE_API_URL` the app runs on a **mock backend** holding the sample compound (sample data only, no real households).

To use the real backend, set `VITE_API_URL=https://kahati.vercel.app` in `.env.local` or in Vercel's environment variables (then redeploy). The API allows cross-origin calls.

With the real backend, `src/api/http.ts` keeps the compound's state in the browser (localStorage) and sends it to the stateless endpoints in `../docs/API.md`. "Reset demo" in the Home menu clears it. A demo clock stamps confirmed readings on the sample bill's read date (31 Oct) so the read-date alignment does not pro-rate them; set `VITE_DEMO_CLOCK=off` for real, current bills.

Note for the demo: after the step 7 cheat (Dela Cruz typed at 20 kWh), the gap rule splits the missing 18 kWh by kWh, so Lorna's share reads ₱752.48 until the reading is fixed. Re-scan or retype Dela Cruz (02238) before step 8 to show ₱677.77.

## Screens and routes

| Route | Screen |
|---|---|
| `/` | Home (organizer) |
| `/scan/bill` | Scan bill (consent, camera, "Type it instead") |
| `/scan/meter/:householdId` | Scan meter (serial match, confirm, edit) |
| `/bill/:householdId` | What a household pays |
| `/usage/:householdId` | Usage: own meter (`BAU`) or shared meter (`A` to `D`) |
| `/check` | Verification (tap a row to type a reading) |
| `/t/:token` | Tenant view, no bar (`/t/demo-santos`) |

## Backend contract

The front end talks only to `src/api/client.ts` (`KahatiApi`). Types are in `src/api/types.ts`. HTTP calls live in `src/api/http.ts`, wired to the endpoints in `../docs/API.md`.

- Money: pesos as unrounded numbers. Shares already rounded by largest remainder.
- Dates: `YYYY-MM-DD`; timestamps ISO.
- Uploads: photos are downscaled in the browser and sent as base64 JSON.
- Errors: the API returns `{error:{message,next}}`; the adapter shows "message next" to the user.

## Libraries

React, React Router, lucide-react (icons), Inter Tight (Google Fonts).
