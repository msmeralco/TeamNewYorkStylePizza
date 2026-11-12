# Kahati Lab

Makes a demo month for Kahati. You set up the month, print the props, and load the same month on the phone, so scanning the printed props works with the new numbers. Testing the live reader is a separate tab.

Hosted at https://kahati-lab.vercel.app. It is a separate Vite app inside this repo: it imports nothing from `src/` or `web/`, and its `src/shared/labMonth.ts` is the same file as `web/src/lib/labMonth.ts`. The phone app is https://kahati-app.vercel.app. Sample or invented data only.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5181. Node 18+. It opens on the sample month, ready to print.

## Make a month (main page, three steps)

1. **Set up the month.**
   - **Randomize** gives every sub-meter new last-month and this-month readings (use between the two numbers you set, 20 to 80 kWh by default) and Bautista new read-day and day-18 readings (15 to 45 kWh apart).
   - The **seed** beside it remakes the exact same month ("Use this seed"), so props can be reprinted. The month is named "Lab #<seed>", and that is what the app shows.
   - Options: new serials, and an 18 kWh gap for the Check screen demo. With the gap on, one household's printed meter shows the true reading, but the app gets a last-month reading 18 kWh higher.
   - **Randomize 4Ps** flips the flags at random; the toggles in the table set them one by one.
   - The bill works itself out: kWh = the four meters' use, each charge = the sample's rate per kWh × kWh, plus the fixed ₱5.00 and ₱16.38, and the total = the sum of the charges.
   - Problems show in red next to the field, in plain words.
   - **Advanced** (closed by default) holds the app name, languages, dates, account, the bill's look, manual charges and "Back to the sample month".
2. **Print the props.** Previews of the bill and the five meter faces.
   - Click any picture to show it full screen, to photograph it off the screen. Arrow keys step through them; Esc closes.
   - **Download all (PDF)**: the bill on A4, then each meter at A5 on A4 with crop marks. Print at 100%. There are per-item PNG links too.
   - Underneath: what the app should show (from the live split API).
   - Randomized months travel as just their seed: the bill QR and the step-3 QR hold `https://kahati-app.vercel.app/#lab=<seed>.<min>.<max>.<flags>` (flags: `g` gap, `s` new serials, `p<mask>` 4Ps with bit 0 = A … bit 4 = Bautista). That's a 33 mm version-4 code (ECL M) that scans fast. The app rebuilds the month with `src/shared/labMonth.ts`, an identical copy in `kahati/web/src/lib/labMonth.ts`. If you change it, change both and rerun `node scripts/make-vectors.mjs`. The tiny link is used only when the lab's month equals `buildLabMonth`'s exactly; any hand edit falls back to the full links below.
   - Hand-edited months: the bill carries the month's own QR code in the payment stub ("Kahati lab month: Lab #<seed>"). It is a compact `#s2=` link, so scanning the bill in Kahati can load the month without step 3. It's 44 mm with error correction L, which decodes from a whole-bill photo downscaled to 1,600 px tall, even with a slight tilt and blur.
3. **Load it on the phone.** Scan the QR code with the demo phone, or use **Copy link**. The app says "Loaded scenario: <name>".

## Scenario link

- Bill QR (compact): `<app>/#s2=<base64url(deflate-raw(JSON))>`, JSON `{v:2, n, h:[[name,4ps,lang,serial,prev,cur]×4], o:[…Bautista…], b:[periodStart, periodEnd, readDate, nextReadDate, kwh, amount, [7 lines], fixedCharges, prev, present, [12 history], last4, masterSerial]}`. See `compactScenario` in `src/scenario.ts`.
- Dev only: `window.__lab.decodeBillPhoto(canvas, opts)` checks the bill QR decodes after a photo-like downscale. `POST /__save?name=` writes test images to `test-output/`.

- Plain: `<app>/#scenario=<base64url(JSON)>`, no padding. This is what "Copy link" gives.
- Compressed: `<app>/#scenarioz=<base64url(deflate-raw(JSON))>`, used by the QR code. The plain link is about 6 KB, too big for a phone to scan; compressed it's about 1.4 KB (QR version 27).
- JSON: `{ "v": 1, "compound": CompoundState, "bau": CompoundState }`. Both start from `GET /api/sample?which=compound` and `?which=bautista`, with only the editable fields changed. Fixed ids: households `hA` to `hD` and `hBautista`, meters `mMaster`, `mA` to `mD` and `mBautista`, compounds `c14` and `cBautista`. `currentReadings` carry your "current" values (the app clears them; scans fill them in).
- Checks before the link is made (shown next to the field):
  - the bill lines add up to the amount
  - bill kWh equals the sum of the sub-meters' current minus previous
  - present minus previous reading equals bill kWh
  - serials are unique (sub-meters, the master `MM-…` and Bautista's)
  - no reading goes backwards
  - readings are whole numbers that fit in 5 digits
  - fixed charges fit inside the supply and metering line
- The panel also re-decodes both forms and shows whether the round trip is identical.
- App base URL: *Reader settings → App base* (default `https://kahati-app.vercel.app`).

## Test the reader (second tab)

These tools don't change the month on the main page.

**Bill.** Two layouts: *Editable preview* (default, `print/sample_bill_editable_preview.pdf`) and *Classic* (`print/sample_bill.png`, with the full "How your bill was computed" table). Both are A4, 2481 x 3509 px (about 300 dpi). Every value can be edited: names and address, account, invoice and meter numbers, dates, readings, kWh (or an override), every charge line, the total (computed, or overridden to make a bill whose lines don't add up), the 12-month history and the temperature. "SAMPLE BILL" stays on the banner and as the diagonal watermark.
- *Download PNG* or *Download A4 PDF*. Print the PDF at 100% ("Actual size").
- The preview prop prints Distribution as one number (400.00). *Print the distribution breakdown* (on by default) adds a "Distribution charge details" block at the bottom with the fixed metering (5.00), fixed supply (16.38) and per-kWh rows, so the reader can see the fixed charges. With it off, the reader score combines `lines.distribution + lines.supplyMetering` and skips `fixedCharges`. The classic layout always prints them.
- The logo is a generic orange disc with a lightning bolt, not a copy of a real utility mark. The utility name is editable (default as on the prop).

**Meters.** Draws the glass-type sub-meter (5 digits plus a tenths digit, `No. SM-0213` and so on) or the round household meter (`MM-5520`), as in the print props. Start from a household's reading or type any value. Capture conditions:
- glare (a bright spot over the LCD), tilt (rotation plus a little shear), blur, low light (darker, vignette, sensor noise)
- one ambiguous digit: the true digit with its look-alike's extra segments half lit (5 vs 6, 3 vs 9, 8 vs 0 and so on). The expected answer stays the true digit.
- the corner caption on or off, and a seed that moves the glare spot and noise

Download PNG (1747 x 2481, A5 at 300 dpi). There is also a button to download all five clean props.

**Send to reader** (Bill and Meters, optional). Sends a JPEG of the image (downscaled to the long side set under *Reader settings*, to stay under the API's 4 MiB limit) to `POST /api/scan/bill` or `/api/scan/meter`, then shows generated versus read, PASS or FAIL per field, plus confidence, provider, time, the API's notes (sanity, missing fields, serial line, validation issues) and the raw `scan` object.
- Bill fields: period start and end, read date, next read date, kWh, amount, the seven lines, fixed charges, previous and present readings, account last 4, history (all 12 months right).
- Meter fields: value, digitsText (5 digits), serial. The meter request includes the meter and, optionally, the previous reading, so the API's validation runs too.

**Results.** Every run is kept in localStorage (the last 2000). Filter by bills or meters, click a row for the field table, export CSV (one row per field: time, run id, batch, kind, generated label, conditions, field, expected, read, pass, confidence, provider, ms, error, note) or clear.

**Batch** (optional). Generates N randomised variations (seeded, so a seed reproduces an image) and runs them one at a time with a delay between calls. For bills: a kWh range, an optional distribution breakdown, an optional varied fixed charge. For meters: the meter type and a maximum for each capture condition, plus a chance of an ambiguous digit. It reports only what it measured: the share of images with every field right, the share of fields right, and per-field results, with request errors counted separately.

These are generated images. Don't quote a batch figure as Kahati's reading accuracy: that number comes only from the held-out real meter photos (see `kahati-hackathon-kit/04_data_prep.md`).

## Notes

- Each run is a Gemini call on the team's key, so keep batches small and the delay at a second or more.
- The API base URL is editable under *Reader settings* (for example, a local `http://localhost:3000`).
- No API keys are used or stored here: the app only calls the public endpoints.
- **Hosted for the judges:** https://kahati-lab.vercel.app (Vercel project `kahati-lab`, separate from `kahati` and `kahati-app`). It is the `--mode hosted` build: "Make a month" only, no reader tools or settings, so visitors can't use the Gemini quota.
  - Redeploy from this folder with `vercel deploy --prod --yes </dev/null`. `vercel.json` runs `npm run build:hosted`.
  - `npm run dev:hosted` previews hosted mode locally on port 5182.
  - `.env.local` (written by `vercel link`) holds a Vercel login token. It is git-ignored and in `.vercelignore`; never commit or share it.

## Files

- `src/scenario.ts`, `src/ScenarioPanel.tsx`: scenario JSON, checks, link encoding, QR code, expected shares
- `src/draw/bill.ts`, `src/draw/billClassic.ts`: bill renderers (canvas)
- `src/draw/meter.ts`, `src/draw/segments.ts`: meter renderer, 7-segment digits, capture conditions
- `src/model.ts`: bill, household and own-meter values, sample defaults, and what the reader should return
- `src/api.ts`: reader calls, field comparison, results store, CSV
- `src/compound.ts`: builds `CompoundState` bodies for split, check and forecast
- `src/random.ts`: randomised bills and meters for batch mode
- `src/App.tsx`: the UI
