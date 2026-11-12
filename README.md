# Kahati

**Know your bill, manage your usage.** IDOL Hackathon 2026, Challenge 2, Team New York Style Pizza.

Kahati shows any household, including the ones behind someone else's meter, what their electricity bill is made of and what each kWh costs them. A household on its own enrolled meter is warned before it crosses the 50 kWh line where the lifeline discount drops.

| | |
|---|---|
| App (phone browser) | https://kahati-app.vercel.app |
| API | https://kahati.vercel.app ([contract](docs/API.md)) |
| Tenant view example | https://kahati-app.vercel.app/t/demo-santos |

> **All data in this repo is sample data.** Invented households and a sample bill, drawn as printable props. Computed by Kahati. Not a Meralco statement.

## Who it is for

```mermaid
flowchart LR
    M["One Meralco meter<br/>(the organizer's account)"] --> SM1["Sub-meter A<br/>Reyes"]
    M --> SM2["Sub-meter B<br/>Santos (Lorna)"]
    M --> SM3["Sub-meter C<br/>Dela Cruz"]
    M --> SM4["Sub-meter D<br/>Garcia"]
    O["Own enrolled meter<br/>Bautista"]
    SM2 -.->|"no Meralco account,<br/>Meralco's app cannot reach her"| L["Lorna sees her share,<br/>its lines and what each kWh costs"]
    O -.-> B["Bautista sees the forecast<br/>and the 50 kWh line"]
```

- **Shared meter (the way in):** tenants pay through someone else's account. Kahati splits the bill fairly, shows each household what it pays for, and checks the readings against the bill.
- **Own meter:** the same engine gives one household its bill breakdown, a usage forecast and the lifeline warning.

## How it works

```mermaid
flowchart LR
    subgraph Phone["Phone browser"]
        UI["web/ (Vite + React)<br/>7 screens + Ask Kahati<br/>state kept in the browser"]
    end
    subgraph API["kahati.vercel.app (Next.js API, stateless)"]
        R["Readers<br/>bill + meter"]
        E["Engine<br/>split, breakdown, rate check,<br/>forecast, verification"]
        A["Ask Kahati<br/>templates + guard"]
    end
    G["Google Gemini<br/>(vision + text)"]
    W["Open-Meteo<br/>(temperatures)"]

    UI -- "photo (downscaled, JPEG)" --> R
    R -- "reads twice" --> G
    UI -- "CompoundState (JSON)" --> E
    E -- "stage 3 forecast" --> W
    UI -- "question" --> A
    A -- "only this household's facts" --> G
    E -- "shares, lines, forecast, checks" --> UI
```

The API keeps no database. The app holds the month's state (bill, readings) in the browser and sends it with every call, so any server instance can answer and nothing about a household is stored on the server. Photos are read and discarded.

## The demo path

```mermaid
flowchart TD
    S1["1 · Scan the sample bill<br/>180 kWh, ₱2,711.07, •••• 4821"] --> S2["2-5 · Scan four sub-meters<br/>serial must match each household"]
    S2 --> S6["6 · Scan Bautista's own meter<br/>12552 on day 18"]
    S6 --> H["Home: four shares<br/>Readings add up: 180 of 180 kWh"]
    H --> BL["Bill: what Santos pays<br/>₱677.77 in seven lines"]
    BL --> U["Usage: Bautista 53 kWh (51 to 55)<br/>stay under 50 kWh: 100% off instead of about ₱519"]
    U --> C["Check: type 20 kWh for Dela Cruz<br/>Typed chip + 18 kWh missing"]
    C --> T["Tenant link: Lorna's share<br/>₱742.50 asked, ₱64.73 above the bill's rate"]
    T --> Q["Ask Kahati: why is my share this amount?"]
```

## The split

```mermaid
flowchart LR
    B["Bill total B = ₱2,711.07<br/>fixed charges F = ₱21.38"] --> F["F ÷ N households<br/>₱5.345 each"]
    B --> V["V = B − F = ₱2,689.69"]
    K["household kWh k<br/>meter kWh K = 180"] --> X["V × k ÷ K"]
    V --> X
    F --> SUM["share = F ÷ N + V × k ÷ K"]
    X --> SUM
    SUM --> LR["rounded by largest remainder<br/>so shares add up to the bill exactly"]
```

| Household | kWh | Share |
|---|---|---|
| Reyes | 52 | ₱782.36 |
| Santos (Lorna) | 45 | ₱677.77 |
| Dela Cruz | 38 | ₱573.17 |
| Garcia | 45 | ₱677.77 |
| **Total** | **180** | **₱2,711.07** |

Each household's share is also broken into the bill's seven lines (generation, transmission, system loss, distribution, supply and metering, taxes, other). Plain rounding would give ₱2,711.08; largest-remainder rounding keeps the total exact. Each kWh saved on the shared meter takes about ₱15 (₱14.94) off a share.

## How nobody fakes a share

The realistic cheat is under-reporting kWh to pay less, which pushes cost onto the neighbours. Every check is anchored to the bill Meralco already prints.

```mermaid
flowchart TD
    P["New reading"] --> Q1{"Photo taken in the app?"}
    Q1 -- "typed" --> T1["Typed chip, seen by everyone"]
    Q1 -- "photo" --> Q2{"Serial matches this household's meter?"}
    Q2 -- "no" --> F1["Reading needs a second look"]
    Q2 -- "yes" --> Q3{"Two reads agree, not below last month?"}
    Q3 -- "no" --> F1
    Q3 -- "yes" --> OK["Verified"]
    T1 --> ADD
    OK --> ADD{"All readings add up to the bill's kWh<br/>within 5% (about 9 kWh)?"}
    ADD -- "yes" --> GOOD["Readings add up: 180 of 180 kWh"]
    ADD -- "no" --> GAP["18 kWh missing<br/>gap split by kWh until fixed<br/>digit correction may suggest the misread digit"]
```

Also: reading dates are aligned to the bill's read date, self-declared common-area use is capped and shown, the bill's own rate is checked against Meralco's published rate, and two people see every reading. Kahati shows a gap and never guesses its cause; it reports nothing to Meralco.

## The forecast, in stages

```mermaid
flowchart LR
    S1["Stage 1<br/>bill day<br/>next month about this month<br/>(labelled rough guess)"] --> S2["Stage 2<br/>one mid-month photo<br/>daily rate to the read date<br/>± 10% on the kWh still to come"]
    S2 --> S3["Stage 3<br/>after about 6 bills<br/>kWh = base + extra per hot degree<br/>(cooling degree days, Open-Meteo)"]
    S3 -.-> S4["Stage 4 (road ahead)<br/>SARIMAX after about 24 months"]
```

Bautista: 32 kWh by day 18, so 1.78 kWh a day, 12 days left, 53 kWh by 30 Nov (51 to 55). The lifeline tiers (2026, DSWD) are 100% off up to 50 kWh, 35% to 70, 20% to 100. Pesos use the published Meralco rate from a team-updated table; before a month's rate is announced, last month's rate is used and labelled. Kahati never forecasts the rate.

## Ask Kahati (grounded chat)

```mermaid
flowchart TD
    Q["Question"] --> P{"Preset button?"}
    P -- "yes" --> TPL["Template answer from the computed numbers"]
    P -- "no" --> G["Gemini, given only this household's facts,<br/>bill line meanings and typical wattages"]
    G --> S{"In scope?"}
    S -- "no" --> REF["Polite refusal"]
    S -- "yes" --> GUARD{"Guard passes?"}
    GUARD -- "pass" --> ANS["Answer"]
    GUARD -- "fail" --> TPL
    G -- "busy or slow" --> TPL
    TPL --> FOOT["Computed by Kahati. Not a Meralco statement."]
    ANS --> FOOT
    REF --> FOOT
```

The guard lets an answer through only if every number comes from the household's facts, it names no other household, makes no blame, legal or Meralco claims, has no links, and uses Latin script only. Preset answers are instant and the same every time.

What the organizer charged, refunds, rules and authorities are never discussed in free text; they stay on the reviewed rate-check template. The 4Ps flag and other households' names and kWh are never sent to Gemini.

## Reading the photos

```mermaid
sequenceDiagram
    participant App
    participant API as /api/scan/meter
    participant G as Gemini
    App->>App: live camera, shutter, downscale to 1600 px JPEG
    App->>API: photo + registered meter + last reading
    par read 1
        API->>G: preferred Flash model
    and read 2
        API->>G: preferred Flash model
    end
    Note over API,G: no answer in 4 s: ask the next model too, first answer wins.<br/>Backup key on rate limits. Retired models dropped. Gives up at 45 s.
    G-->>API: digits, serial, confidence (twice)
    API->>API: validate: serial, digit count, reads agree, not below last month
    API-->>App: reading + kWh since last + any second-look reasons
    App->>App: a person confirms every number
```

Reading accuracy is measured on held-out real meter photos with `scripts/accuracy.ts` (exact match of every digit, reported as N of 50). The printed demo props never count toward that figure. See [`scripts/README.md`](scripts/README.md).

## Run it

Backend (this folder):

```bash
npm install
cp .env.example .env.local   # optional: add GEMINI_API_KEY and set READER=gemini
npm run dev                  # http://localhost:3000
npm test
```

Front end: see [`web/README.md`](web/README.md). Without `VITE_API_URL` it runs on a built-in mock of the sample compound.

Environment variables (backend, set in Vercel):

| Variable | Purpose |
|---|---|
| `READER` | `gemini` for real reading; anything else uses the mock reader |
| `GEMINI_API_KEY`, `GEMINI_API_KEY_2` to `_5` | Main key and automatic backups |
| `GEMINI_MODEL_FIRST` | Preferred model; others are still tried |
| `GEMINI_MODEL` | Pins a single model (no failover across models) |
| `TENANT_SECRET` | Signs tenant links (required in production) |

## Layout

```
docs/API.md          the API contract between backend and front end
src/app/api/         route handlers: sample, scan/bill, scan/meter, split, rate-check,
                     forecast, check, tenant-link, tenant/{token}, ask, ask/presets, health
src/lib/engine/      pure calculations: split, breakdown, rate check, forecast, verification
src/lib/readers/     bill and meter readers (mock, Gemini with key and model failover)
src/lib/ask/         Ask Kahati: context, templates, guard, Gemini call
src/data/            sample compound, rate table, lifeline tiers, typical wattages
src/e2e/             the 8-step demo path through the real route handlers
scripts/accuracy.ts  reading-accuracy harness for held-out photos
web/                 the phone-first front end (its own package.json)
```

## Libraries and APIs

Next.js, React, TypeScript, Vitest; Vite, React Router, GSAP, lucide-react, Inter Tight (front end). Google Gemini API (reading photos, Ask Kahati). Open-Meteo (temperatures, no key). Hosted on Vercel.

## What Kahati asks of Meralco

Nothing new. Its only input is the bill Meralco already prints: no API, no data request, no staff time. It never asks Meralco to verify, approve or discount anything.
