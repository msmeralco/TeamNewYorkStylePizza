# Kahati (web)

Phone-first React + TypeScript front end for Kahati, IDOL Hackathon 2026, Challenge 2. Built with Vite.

## Run

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173 at phone width. On Vercel, deploy it as its own project with **Root Directory** set to `web`. Without `VITE_API_URL` the app runs on a **mock backend** holding the sample compound (sample data only, no real households).

To use the real backend, set `VITE_API_URL` in `.env.local` or in Vercel's environment variables.

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

The front end talks only to `src/api/client.ts` (`KahatiApi`). Types are in `src/api/types.ts`. HTTP paths are proposed in `src/api/http.ts`; change only that file to match the backend.

- Money: pesos as unrounded numbers. Shares already rounded by largest remainder.
- Dates: `YYYY-MM-DD`; timestamps ISO.
- Uploads: `multipart/form-data`, field `image`.
- Errors: non-2xx with a plain-text message (shown to the user as is).

## Libraries

React, React Router, lucide-react (icons), Inter Tight (Google Fonts).
