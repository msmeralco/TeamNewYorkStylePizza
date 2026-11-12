# Kahati

Know your bill, manage your usage. IDOL Hackathon 2026, Challenge 2, Team New York Style Pizza.

Kahati shows any household, including those behind someone else's meter, what their electricity bill is made of and what each kWh costs them, and warns an own-meter lifeline household before it crosses 50 kWh.

**All data in this repo is sample data.** Invented households, a sample bill. Computed by Kahati. Not a Meralco statement.

## Run

```bash
npm install
cp .env.example .env.local   # optional: add GEMINI_API_KEY and set READER=gemini
npm run dev                  # http://localhost:3000
npm test
```

## Layout

- `docs/API.md`: the API contract between backend and frontend.
- `src/types/`: shared types.
- `src/lib/engine/`: pure calculation functions (split, breakdown, forecast, checks).
- `src/lib/readers/`: bill and meter readers (mock, Gemini).
- `src/data/`: sample compound, rate table, lifeline tiers.
- `src/app/api/`: Next.js route handlers.

## Libraries and APIs

Next.js, React, TypeScript, Vitest. Google Gemini API (vision) when a key is set. Open-Meteo (temperatures, no key).
