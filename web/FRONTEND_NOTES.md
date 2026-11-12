# Front-end notes (handoff)

What a new session or teammate needs to keep working on `web/` without re-deciding anything. The kit's `03_branding.md` and `02_product_spec.md` (in the hackathon kit folder) are the source of truth for brand and product; this file records the front-end decisions made on top of them.

## Where things are

- Repo: `github.com/StarRayX/kahati`, branch `main`. Backend (Next.js, `src/`) at the root, front end in `web/`. A teammate (StarRayX) pushes backend work often, sometimes touching `web/src/api/*`.
- Local clone: `C:\Users\Sam Nicole\Projects\kahati`. Dev server: `cd web && npm run dev -- --port 5173 --strictPort`.
- Hackathon kit (specs, designs, brand): `C:\Users\Sam Nicole\OneDrive\Documents\Projects\kahati-hackathon-kit`.

## Design rules (agreed with the team lead; keep them)

Layout
- One screen, no page scrolling, at 375 x 812 and 375 x 667, in English and Filipino. Only the chat's message list scrolls. Short phones (max-height 760px) get a tighter rhythm via CSS variables (`--top`, `--gap`, `--row-y`, `--hero`, `--nav-h`).
- Every screen keeps 12px clear of the lime nav circle, not just the bar (`.screen:not(.no-nav)` padding).
- Screen titles sit in a 40px header row (`.header-row`) so titles and first cards line up across tabs. Home and Check hero cards match exactly (title 35px, card 90px, padding 22px, corner icon centre 35px from the right).
- Corner icons and badges align with the TOP OF THE GLYPHS of the first text line, not the line box: offset = (line-height / 2 - 0.3991) x font size for Inter Tight (0.1259 x size at line-height 1.05). Set per card with `--text-gap` (never name a variable `--ink`: that is the dark colour token).
- Tab bar: 5 tabs inside a 12px side inset; active tab marked by a 50px lime circle (rises 17px) in a smooth notch. Labels stay on one line for every tab. Scan opens as a sheet over the tabs.

Motion (GSAP)
- Calm and in place: things FADE in at their final position. No sliding, no bounce/overshoot, no springs, no shimmer/stagger sweeps on lists of buttons.
- Allowed: the notch and circle gliding between tabs (icons near it fade out of its way), left-to-right reveals of bars (Bill stacked bar, Check bar, Usage tier bar ~0.7s), count-up numbers, the chart line drawing in, chat answers fading in word by word (max ~0.9s), the scan sheet sliding up/down, the splash (K pieces assemble centred, no spring, K glides left, "ahati" feather-wipes in).
- Tab entrances (Home, Bill, Usage, Check) all use `useReveal`: sections fade in place 0.45s, 50ms apart, list rows 0.35s from 0.12s; first visits show the skeleton (fades in after 0.15s) until data arrives. Bar reveals share one timing: 0.7s, power2.inOut, after 0.15s. Scan: the sheet slides up 0.55s and its content fades in from 0.25s (0.4s) as it settles.
- Initial (empty-month) state: Home, Check, Bill and Usage empty states fade in with `useReveal` like the full screens. While loading they show `EmptySkeleton` (same header and card geometry) when the last month seen had no bill, or on first open (`monthLooksEmpty()`, set by `api.getMonth`), otherwise the full-month skeleton. Skeletons stay hidden for 0.5s, then fade in (0.25s), so loads under half a second never show one.
- Ask Kahati load-in: header fades in, input area 0.1s later (0.4s each); the chat stays hidden until the household name is known, then the greeting fades and the chips cascade. Use `fromTo` with `revert()` on cleanup for mount fades: React dev mode runs effects twice, and `gsap.from` would then fade 0 to 0 and pop at the end.
- One agreed exception to "no stagger on buttons": the Ask Kahati question chips fade in row by row, top to bottom (chips on one wrapped line fade together, rows 45ms apart, 0.2s each, all done in about 0.4s), after the greeting or answer.
- Respect `prefers-reduced-motion` everywhere (`reduceMotion()` in `components/motion.tsx`).

Look
- Soft over harsh: thin lines, muted fills. Usage chart lines 1.25px (actual) / 1.1px dashed at 80% (forecast), reference lines dotted at 45%. Chart points one size (5 units), white ring behind each. Check bar 6px at 85% ink. Tier bar: pale lime, light warm greys, rounded.
- Type scale (use the class, not inline sizes): titles 30px (26px short phones; Ask 24px); hero numbers `--hero`; buttons 17px (16px short), 54px tall (48px short), compact secondary buttons (`.btn.compact`) 16px and 44px tall; body and text links 16px; status lines and tip rows 15px with 16px icons; `.support`, footnotes, Ask chips 14px; `.meta` and chips 13px; small badges (`.chip.sm`) and chart/tier labels 12px. Tab labels are the one 11px exception.
- Spacing: screen padding `--top`/24px, screen gap `--gap`, cards 20px all round (12px 16px on short phones), list cards 4px 20px, hero cards 22px.
- Tap areas at least 44px, grown with an invisible `::after` so nothing on screen moves.
- Tooltips: translucent white, soft shadow, dark title with a lime dot.
- No borders or card shadows (branding), lime never as text on white.

Copy
- Every string lives in `i18n/copy.tsx` (en + fil). The Filipino copy was reviewed and approved on 2026-11-12; new or changed Filipino strings still need a check before release. Keep bill line names (Generation, Transmission, ...) as printed on the Meralco bill. Wording rules from the spec apply ("needs a second look", never "overcharged", every tenant screen says "Not a Meralco statement").

## How changes were verified

- `npx tsc -b` and `npm run build`; also `VITE_API_URL=https://kahati.vercel.app npx vite build --outDir <tmp>` for the live adapter.
- Geometry in a hidden same-origin iframe (375 x 812 / 667): overflow (`scrollHeight - clientHeight`), gaps to the nav circle, glyph-top alignment via canvas `measureText`, per-frame sampling for animations (no movement, monotonic reveals). Set `kahati-lang` in localStorage before loading the iframe and restore it after (it is shared with the user's tab).

## Gotchas

- Write files atomically (write a temp file, then rename). The Vite dev server once cached an empty `index.css` read mid-write and the whole app lost its styles; `touch src/index.css` makes it re-read.
- The user often has the Browser pane open and navigates while checks run; prefer hidden iframes over driving their tab.
- lucide-react v1 icon names: `House` (not Home), `ChartLine`, `CircleCheck`.
- GSAP clears the CSS `translate` property; position with an outer element and animate an inner one.
- When the Browser pane is hidden, requestAnimationFrame is paused, so the splash never ends and blocks clicks. In-page, import `gsap` from the same Vite deps URL the app uses and call `gsap.ticker.tick()` in a setTimeout loop to drive it.
- To test against the live backend without touching the mock server: `VITE_API_URL=https://kahati.vercel.app npx vite --port 5174 --strictPort` (its own origin, so its localStorage is separate).

## Git workflow

- Before committing: `git fetch`; if `origin/main` moved, commit, then `git rebase origin/main`, rebuild both modes, push.
- Conventional Commits, subject 50 characters or fewer, no Co-authored-by or AI trailers.

## Open items

- Uncommitted at handoff time (see `git status`): GSAP chat animations and the no-shimmer chip fade, faster tier bar, softer Check bar (6px, 85%), Check icon without the tint and aligned, Home/Check header alignment, 50px nav circle, Filipino Bill title "Bayarin ni {name}", skeleton header rows.
- Ask Kahati: tested against the live backend on 2026-11-12 (all six presets in en and fil, Gemini free text with history, off-topic refusal, BAU own meter, `/t/demo-santos/ask` tenant token, bad token, unknown household, 501-character question). Chat UI passed at 375 x 812 (en) and 375 x 667 (fil) with no page overflow. Mock answers are still English only.
- Real-phone camera test (iPhone and Android) on a deployed HTTPS link.
