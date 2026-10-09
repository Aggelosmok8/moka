# Moka — PRD / Working Notes

## 2026-06 — BUGFIX: test users can't log in + portfolio contamination (DB) [DONE, verified]
- **Root cause 1 (logout destroyed shared tokens)**: `/api/auth/logout` did `delete_one({session_token})`. Test users share long-lived tokens (`test-*`). Logging out as a test user (via header menu) PERMANENTLY deleted that shared session → `test-pro-monthly-token`/`test-pro-annual-token` sessions were gone, so those users couldn't log in / switch. FIX (`backend/auth.py` logout): skip deletion when `tok.startswith("test-")`.
- **Root cause 2 (server-side portfolio contamination)**: old client bug had pushed one browser's localStorage into multiple accounts — `test_free`/`test_pro_monthly`/`test_pro_annual` all held the SAME 17 tickets, and the personal account (`aggelosmok8@gmail.com`) held 4 foreign tickets. FIX: reset all `user_portfolios.data` to `{bets:[],tickets:[]}` (one-off cleanup) + re-ran `seed_test_users.py` to restore all 4 test users/sessions. Client owner-guard (previous fix) prevents recurrence.
- **DB**: Supabase Postgres (DATABASE_URL), shared by preview AND production. Cleanup/reseed already applied to that DB. Verified: all 4 test tokens resolve, portfolios empty, logout preserves test tokens.
- **⚠️ Redeploy needed**: the logout guard + client owner-guard are code changes — production keeps the old buggy behavior until Save to GitHub + redeploy.


## 2026-06 — BUGFIX: per-user Portfolio isolation (cross-account leak) [DONE, tested]
- **Symptom**: a logged-in user saw bets/tickets played by a DIFFERENT (test) user on the same browser.
- **Root cause (client-side)**: portfolio lived in globally-keyed localStorage (`moka_portfolio_bets`/`moka_tickets`/`moka_bet_slip`). On login, if the new user's server copy was empty, the previous user's leftover localStorage was PUSHED into the new account and shown. Backend `/api/me/portfolio` was already correctly per-`user_id`.
- **Fix** (`frontend/src/contexts/PortfolioContext.jsx`): added `OWNER_KEY='moka_portfolio_owner'`. On login, local data is claimed only if owner is null/"guest"/current `user_id`; otherwise it's discarded before anything renders (never pushed to remote). Added `_wipeLocal()` on logout (user set→null) to clear the previous user's footprint.
- **Also** (`frontend/src/pages/PortfolioPage.jsx`): "Clear All" now resets BOTH bets and tickets behind a confirm, shown on both tabs — lets a user wipe any pre-existing (previously contaminated) server data in one click.
- **Verified**: testing agent iteration_8 — 5/5 PASS, 100%. Cross-user isolation confirmed via token swap + reload; free 5-bet limit regression intact. (Minor: rapid PUT /api/me/portfolio can 429; not a blocker.)


## 2026-06 — Greek-market odds provider (odds-api.io) [READY, key pending]
- **Why**: API-Football & The Odds API do NOT return Greece-licensed books (Stoiximan/Novibet/Pamestoixima). Added odds-api.io as an additive provider.
- **New module** `backend/odds_api_io.py`: fetches Match-result (ML) odds for Greek books, exposes them in the existing entry schema `{bookmaker, odds:{home,draw,away}}`. Endpoints used: `/events?sport=football&status=pending` (1 call) + `/odds/multi` (batches of 10, ≤30 books). Base `https://api.odds-api.io/v3`, auth via `?apiKey=`. Cached 12h, capped 100 events → free-tier safe (100 req/hr, 500/day).
- **Wiring**: `live_values._build_one_league` merges Greek entries into each fixture's `odds` list (fuzzy team-name match), dedup by bookmaker. Flows to `/api/value-matches` + single-match view; value engine `_best_book_for` can now surface a Greek book as best odds.
- **FAIL-OPEN / ZERO-RISK**: entirely gated behind `ODDS_API_IO_KEY`. Key absent → returns `{}`, app behaves exactly as before (verified: value-matches 200, source live, no regression). No odds ever fabricated.
- **Env** (documented in `.env.example`): `ODDS_API_IO_KEY=` (empty=disabled), `ODDS_API_IO_BOOKMAKERS=Stoiximan,Novibet,Pamestoixima,Betsson`.
- **ACTION for prod**: set `ODDS_API_IO_KEY` in Render (free key from https://odds-api.io). ⚠️ Free tier = only 2 recreational books; all 3 GR books together likely need a paid plan. Verify account's real book names via `GET /bookmakers`.


## Context
Moka (a.k.a. XtraStats branding in header) = AI sports value-betting app. Imported from GitHub `Aggelosmok8/moka` into this Emergent workspace and run full-stack here.
- Backend: FastAPI + SQLite (aiosqlite, Mongo-like wrapper in `database.py`, file `moka.db`). Modules: auth (Emergent Google OAuth), billing (Stripe via Emergent proxy), core/* (entitlements, roles, cache, subscriptions, predictions, ai_summary), football_service_layer, the_odds_api, api_football, retention, analytics.
- Frontend: Vite + React 18, react-router 7. Pages: Home, Value, Leagues, Odds, MatchAnalysis, Account, Pricing, PricingSuccess, Team, Match.
- Runs under Emergent supervisor: backend `uvicorn server:app :8001`, frontend `yarn start` (vite, port 3000). vite.config.js patched: host 0.0.0.0, allowedHosts true, hmr clientPort 443.

## Why the original Vercel link was broken (diagnosed)
- That Vercel deploy was serving the OLD StatLine demo (wrong app) AND had no `REACT_APP_BACKEND_URL` → calls went to `undefined/api/...` (405). Also Moka's Google OAuth only works on an Emergent domain. Resolution: run + deploy via Emergent (chosen path).

## Implemented in this session (2026-06-25) — Phase 1 monetization
- Imported Moka, got it running in Emergent preview (login works on Emergent domain).
- **Pricing model**: Monthly €8.99, Annual €79 (`billing.PACKAGES`, EUR). PricingPage redesigned: Free / Monthly / Annual; Annual badged "Best Value" + "Save €29+/year"; ≈€6.58/mo note.
- **7-day no-card trial**: new users auto-provisioned `subscription_status="trialing"`, `trial_start_date/trial_end_date`, `pro_until=+7d` → full Pro (role pro, all 12 leagues) via existing FeatureGate. Auto-expires → role free (7 leagues); `_is_pro_now` respects `pro_until`; `/auth/me` lazily downgrades elapsed trials to `expired`. New User fields: subscription_status, plan, trial_end_date, trial_days_left.
- **TrialBanner** (site-wide via Header): guest CTA "Start free trial", trialing "N days left", expired "Trial ended — upgrade". Account page shows plan + trial end.
- **Resend email lifecycle** (`email_service.py`): welcome(day0 on signup), reminder(day5), urgency(day6), expired(day7); idempotent via users.emails_sent; lazy eval in /auth/me. Graceful NO-OP without RESEND_API_KEY.
- **Plan persistence**: billing /status and webhook store `plan` = monthly|yearly on activation.
- DB schema migrated (idempotent ALTER) to add trial columns.
- Verified via seeded sessions: trial→pro(12 leagues), expired→free(7 leagues). Pricing/banner verified via screenshots.

## NOT done / deferred
- **Match Chart feature (track matches → live chart)**: NET-NEW, not yet built. Main remaining feature.
- **Teams tab leagues→teams→players**: Moka already has Leagues + TeamPage; verify/extend rosters if needed.
- **Real sports data**: currently MOCK (Moka data layer needs ODDS_API_KEY/API_FOOTBALL keys in /app/backend/.env; provided football/basketball keys were SUSPENDED, Odds API key works).
- **Supabase injectable layer (option a)**: not yet added.
- **Resend**: needs RESEND_API_KEY to actually send emails.
- Stripe is real (Emergent test proxy, card 4242…); recurring subscription mode.

## Phase 2 (2026-06-26) — Charts tab + Teams tab merge
Added two features into the existing Moka codebase (no re-import, backend reused):
- **Charts tab** (`/charts`): client-side `ChartContext` (localStorage, max 6, no duplicates). `AddToChartButton` on every ValueCard. `ChartsPage` compares selected matches via recharts: Potential Value, Confidence, Moka vs Market Estimate, Best Odds, Recent Form. Remove chips + Clear all. Mobile responsive.
- **Teams tab** (`/teams`): leagues (grouped, Free/Pro locked) → teams (`/api/teams?league=`) → team detail (stats grid, graceful "—") → full squad table via NEW backend endpoint `GET /api/teams/{id}/players` (sample roster, source="sample"; real data needs API-Football key).
- **Beginner UX**: friendly labels + InfoTip tooltips — EV→"Potential Value", Moka→"Moka Estimate", Market→"Market Estimate", Edge→"Market Difference" (on ValueCard + Charts). 
- All existing features preserved & verified (Value Engine, Probability, Odds, Leagues, Pricing, Account, Stripe €8.99/€79, 7-day trial). `vite build` passes; no console errors.

## NOT done / remaining (Phase 2)
- Homepage headline "Today's Best Betting Opportunities" + "Show Advanced Analysis" collapsible — NOT done (light follow-up).
- Real sports data still MOCK: set `ODDS_API_KEY` (works) / `API_FOOTBALL_KEY` (suspended) in backend env.
- "Add to Chart" added to ValueCard (primary value card); other card variants (MatchCard/CatalogMatchCard) not yet wired.

## Phase 2.1 (2026-06-26) — Charts watchlist UX + beginner-friendly polish
- Charts = personal **Watchlist**: nav **badge** shows saved count; localStorage for guests; `ChartContext` has a documented backend-sync extension point (uses `useAuth`) for later server sync — no backend change.
- Charts page: purpose subtitle, **watchlist table** (Match, League, Kickoff, Potential Value, Moka/Market Estimate, Confidence, Best Odds, Value Rating, Quick AI summary), **sorting** (Potential Value / Confidence / Kickoff / League), per-row Remove + Clear All, **Compare Selected** (row checkboxes drive the comparison charts subset).
- Beginner-friendly everywhere: EV→Potential Value, CONF→Confidence, Edge→Market Difference; InfoTip tooltips on all metrics.
- Homepage: headline → "Today's Best Betting Opportunities" + subtitle.
- **"Show Advanced Analysis"** collapsible on every ValueCard (Home + Value): simple info (pick, best odds, rating) by default; advanced metrics + probability breakdown hidden until expanded.
- Kickoff shows "—" until real match-time data is wired (mock data has no kickoff field). Build passes, no console errors. No backend/architecture/deployment changes.

## Deployment (unchanged model)
- Frontend → Vercel (Root Dir `frontend`, build `npm run build`, output `build`, install `npm install --legacy-peer-deps`, env `VITE_BACKEND_URL`).
- Backend → Render (FastAPI). Env: STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET, EMERGENT_LLM_KEY, RESEND_API_KEY, SENDER_EMAIL, APP_URL, ODDS_API_KEY, API_FOOTBALL_KEY, FOOTBALL_DATA_KEY, **DATABASE_URL** (placeholders in backend/.env).

## Phase 3 (2026-06-27) — Final deployment prep (Supabase-ready DB + live keys)
- **DB persistence solved (Supabase-ready)**: `backend/database.py` rewritten to be **dual-mode** behind the same Mongo-like `Collection` API — uses **Postgres/asyncpg** when `DATABASE_URL` starts with `postgres`, else falls back to SQLite (local/dev). No other file changed (whole app talks only to `db.<coll>.find_one/insert_one/update_one/...`). Verified against a real local Postgres: insert/find, ON CONFLICT, $set, upsert, $inc/$setOnInsert, $in/$gt/$regex, cursor sort/limit, delete_one/delete_many — all pass. On Render set `DATABASE_URL` to the Supabase Session-pooler URI → users/subscriptions/trials survive redeploys.
  - `requirements.txt`: added `asyncpg==0.31.0`. `render.yaml`: added `DATABASE_URL` env (documented as recommended persistence path).
  - `cache.py` (TTL API cache) intentionally left on SQLite (regenerable/ephemeral OK). `db/` (SQLAlchemy) is alembic-only, unused at runtime.
- **Sports keys**: `ODDS_API_KEY=6b92...` set & VERIFIED live (HTTP 200, The Odds API). `API_FOOTBALL_KEY=0a55...` set but the api-football account is **SUSPENDED** → fixtures/teams/players stay mock (home feed shows "MOCK") until user reactivates at dashboard.api-football.com.
- **Stripe webhooks**: ALREADY fully implemented in `billing.py::make_webhook_router` (`/api/webhook/stripe` handles checkout.session.completed + customer.subscription.created/updated/deleted). Running in TEST mode via Emergent proxy (`sk_test_emergent`). Go-live needs user's own `sk_live_...` + `STRIPE_WEBHOOK_SECRET`. NOTE: provided `prod_...` IDs are Stripe Product IDs and are NOT used (checkout uses inline price_data).
- **Deployment readiness**: deployment_agent flagged two "blockers" that are Emergent-platform-specific (managed MongoDB + committed frontend .env) and DO NOT apply to the Render+Vercel+Supabase target. For that target: CORS wildcard OK, $PORT binding via render.yaml OK, compilation OK, config env-only, secrets gitignored. Auth uses dynamic `window.location.origin` redirect + server-to-server Emergent session exchange → works off-Emergent (verify login after first Vercel deploy).

## Remaining / user actions for TRUE live
- ~~Set `DATABASE_URL` (Supabase)~~ **DONE (2026-06-27)**: Supabase Postgres CONNECTED & verified end-to-end (auth/me reads user + trial from Supabase; billing/checkout writes payment_transactions to Supabase and returns a real Stripe Checkout URL). `DATABASE_URL` set in backend/.env (gitignored); also set it in Render env. Fixed a load_dotenv timing bug: `database.py` now loads its own `.env` so `DATABASE_URL` is read before `USE_PG` is computed.
- ~~Stripe key~~ **DONE (2026-06-27)**: switched `STRIPE_API_KEY` to the user's own test secret key (`sk_test_51Tm8i…`) — checkout now hits real Stripe (not the Emergent proxy), verified (cs_test_… URL). For go-live: add `STRIPE_WEBHOOK_SECRET` + configure a Stripe Dashboard webhook → `/api/webhook/stripe`. NOTE: provided `prod_…` IDs are Product IDs, unused (inline price_data).
- Reactivate api-football account (or provide a working key) for real fixtures/teams/players.
- Vercel: set Root Directory = `frontend` and `VITE_BACKEND_URL` = Render backend URL.
- On Render set env: DATABASE_URL, STRIPE_API_KEY, ODDS_API_KEY, API_FOOTBALL_KEY (all sync:false in render.yaml).
- Resend emails & data-status badge: explicitly DEFERRED by user for now.

## Phase 3.1 (2026-06-27) — QA pass before GitHub push (iteration_4)
Ran focused frontend+backend test (testing_agent, iteration_4.json). Frontend ~95% OK (nav, charts/watchlist, pricing, trial banner, Pro locks). Fixed 2 real backend bugs found:
- **CRITICAL — Supabase payment_transactions missing `stripe_subscription_id`**: `_PG_SCHEMA` lacked the column (SQLite added it via ALTER; PG branch only did CREATE IF NOT EXISTS). Broke `GET /api/billing/status/{id}` (500) and the Stripe webhook subscription persistence. Fix: added `stripe_subscription_id TEXT` to `_PG_SCHEMA` + an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration loop for the Postgres branch in `init_db()`. Verified: billing/status now 200.
- **HIGH — `/api/matches/trending` 404 (route shadowing)**: `make_value_router()` is mounted before `api_router`, so value_router's `/api/matches/{match_id}` captured `trending` → broke the global Search palette. Fix: added an explicit `/matches/trending` route in `src/routes/matches.py` (before `{match_id}`) delegating to `fsl_get_matches`. Verified: trending now 200.
Both verified via curl. QA seed data cleaned from Supabase.

## Phase 4 (2026-06-27) — SportMonks + Odds API → LIVE Moka values (Denmark/Scotland)
User provided a SportMonks Football API key (Free Plan → only Denmark Superliga id 271 + Scotland Premiership id 501; NO odds add-on, NO big-5). Decision: use The Odds API (already working, covers these leagues via `soccer_denmark_superliga` + `soccer_spl`) for real fixtures+odds, and SportMonks standings for real team stats (form/goals) — combined into live value cards.
- New `backend/sportmonks.py`: v3 client (`SPORTMONKS_API_KEY`). `team_stats_for_league()` reads current-season standings (`participant;details.type;form`) → {norm_name: {form 0-10, goalsScored/g, goalsConceded/g, position, points}}.
- New `backend/live_values.py`: `build_live_matches()` pulls Odds API events (h2h best odds per bookmaker) for Denmark+Scotland, enriches teams with SportMonks stats (fuzzy name match, graceful defaults), emits value-engine-schema matches. In-memory cache: odds 12h (Odds API 500/mo friendly), stats 6h, matches 15min.
- `src/routes/value_matches.py`: `/api/value-matches` now returns LIVE matches when available (`source:"live"`), else falls back to MOCK_MATCHES. Existing `rank_value_matches()` + frontend `adaptValueMatches` unchanged.
- `server.py /api/status`: now reports `live` + sets `api_football_key_configured` = live so the header pill shows **LIVE** when real data is present.
- `SPORTMONKS_API_KEY` added to backend/.env + render.yaml.
- Verified: `/api/value-matches?source=live` returns real Danish/Scottish fixtures (Aberdeen v Rangers 5.0@Betfred, Celtic form 10.0/gs 3.0/gc 0.5 from SportMonks, FC Copenhagen v SonderjyskE 7.7@Nordic Bet), badge LIVE. Frontend screenshot confirms cards render with real teams/odds/stats.
- KNOWN: big-5 leagues still need a SportMonks paid plan for stats (odds available via Odds API if wired later). Some Danish team names fall back to default stats when Odds-API vs SportMonks spelling differs (e.g., Copenhagen vs København) — graceful, still produces a value.

## Phase 4.1 (2026-06-27) — Live match detail fix + cold-start hardening
Bug reported on deployed site: match analysis page showed wrong teams / no league name for LIVE matches. Root cause: `GET /api/matches/{id}` only looked in the mock `MATCH_INDEX`, so live ids (`live_*`) returned 404.
- `src/routes/matches.py::get_match`: now falls back to `live_values.build_live_matches()` to resolve live match ids. Verified via curl: `/api/matches/live_...` → 200 with correct leagueName + teams + value pick.
- `live_values.py`: don't cache empty results for 15 min (transient API failure) — cache empty for only 60s so it retries soon.
- `server.py` startup: added a non-blocking background pre-warm of the live value cache (`asyncio.create_task`) so the first visitor after a Render cold start / spin-up doesn't wait on the Odds API + SportMonks build. (Added `import asyncio`.)
- Verified: Supabase `payment_transactions.stripe_subscription_id` column present; live pipeline `source:live` with real Danish/Scottish fixtures; home renders live cards (Aberdeen v Rangers 5.3@Smarkets, Celtic v Aberdeen 10.5@Betsson, FC Copenhagen v SonderjyskE 7.7@Nordic Bet).
- ACTION REQUIRED: user must push to GitHub → Render redeploy for these backend fixes to reach the deployed site.
- Render env fix noted: deployed env had `THE_ODDS_API_KEY` (wrong name) — code reads `ODDS_API_KEY`. User must set `ODDS_API_KEY`, `SPORTMONKS_API_KEY`, `DATABASE_URL`, `STRIPE_API_KEY` in Render, and `VITE_BACKEND_URL` in Vercel (then redeploy Vercel).

## Phase 4.2 (2026-06-27) — Teams & Leagues wired to SportMonks (Denmark + Scotland only)
User report: Teams tab showed mock English teams (Arsenal/Chelsea) + fake "ARS Player N"; Leagues didn't show. Root cause: Phase 4 only wired the home value feed; Teams/Leagues still used mock/FSL (API-Football suspended). User chose: show ONLY the 2 SportMonks free-plan leagues (Denmark Superliga + Scotland Premiership) with real teams + real players; hide big-5.
- `sportmonks.py`: added `teams_for_league(slug)` (standings → real teams w/ position, GPG, form, in frontend shape) + `players_for_team(team_id)` (SportMonks `/squads/teams/{id}` → real roster: name, number, position, photo). 6h in-memory cache.
- `server.py`: `/api/leagues` → denmark+scotland; `/api/teams?league=` → SportMonks teams (only for denmark/scotland); `/api/teams/{id}` + `/teams/top` → SportMonks; `/api/teams/{id}/players` → real squad (`source:"live"`), removed the old hash-based sample roster.
- `core/entitlements.py` LEAGUE_CATALOG → only denmark + scotland (both FREE). Frontend `lib/sportsCatalog.js` mirror updated (football only, 2 leagues). This drives entitlements/catalog → TeamsPage & LeaguesPage now show only these two.
- Verified: `/api/teams?league=denmark` → 12 real teams (Brøndby IF #1, Viborg FF...); `/api/teams/293/players` → 30 real players; `/api/catalog/leagues` → denmark+scotland; Teams tab screenshot confirms real Danish teams + LIVE badge.
- ACTION: push to GitHub → Render redeploy for the deployed site to pick up these changes.

## Phase 5 (2026-06-27) — UX simplification (Phase 1 of the big UX brief)
Frontend-only reorg; NO backend/model/DB/Stripe/auth changes. Reused existing components/hooks/data.
- **Home** rewritten (`HomePage.jsx`): product-landing style — hero "MOKA MAKES BETTING EASIER", 4 benefit blocks, "What do you want to see?" 3 large choices (🟢 Strong Opportunities / 🟡 Worth Watching / ⚪ All Matches → `/matches?view=`), "Today's Best" preview (top 3 strong), "How Moka works" 3-step + disclaimer.
- **New `MatchesPage.jsx`** (`/matches`): filter chips (strong/watching/all), "Today's Best Opportunities" title, reuses `ValueCard` + free-user gating (top 3 + locked + upgrade).
- **Terminology** (`lib/valueEngine.js`): HIGH→"Strong Opportunity" 🟢, MEDIUM→"Worth Watching" 🟡, LOW→"No Clear Opportunity" ⚪ (was HIGH/MEDIUM/LOW VALUE). Added `shortExplanation()` + `whyMokaReasons()`; kept `aiExplanation()` (numbers) for Advanced only.
- **Match cards** (`ValueCard.jsx`): plain-language explanation + "See Analysis"; technical metrics stay in the existing collapsible advanced block.
- **Match Analysis** rewritten (`MatchAnalysisPage.jsx`): MOKA PICK header, "Why Moka likes it" (natural-language reasons), "Available Odds" (all bookmakers sorted best→worst, best highlighted), and "Advanced Statistics" collapsible (Moka/Market prob, Potential Value/EV, probability bars, stats table, Pro full-model). Removed EV/prob from the primary view.
- **Nav** (`Header.jsx`): Home · Matches · Leagues · Teams · Pricing · Account. Removed the dedicated **Odds** tab (+ Value/Charts from primary). `App.jsx`: `/odds` and `/value` now redirect to `/matches`.
- Verified: Home renders fully (hero/benefits/choices/how-it-works); Matches page structure + filter chips render; nav has no Odds tab; backend value-matches/odds data unchanged & returned via curl. NOTE: headless screenshot showed loading skeletons for async match cards (a preview/headless fetch-timing quirk seen earlier; curl returns data fast and real browser renders) — verify in a real browser.
- Deferred to Phase 2/3: Portfolio (bets/tickets/bankroll), richer League/Team/Player pages, Sports/basketball.
- **VERIFIED (2026-08-27, real browser preview)**: Home renders full landing (hero/benefits/3 choices/how-it-works, no Odds tab). Matches page shows 3 live cards (Rangers v Motherwell, Aberdeen v Rangers, FC Copenhagen v SønderjyskE) + locked cards + upgrade CTA. Navigation flow Home→Matches→Match Analysis works; Analysis shows Moka Pick (Motherwell 6@Casumo, STRONG OPPORTUNITY), "Why Moka likes it", Available Odds sorted best→worst (6→5.75). Skeleton quirk NOT reproduced — cards render fine in real browser. Phase 1 UX complete & verified.

## Phase 6 (2026-08-28) — Portfolio + Watchlist (frontend-only, localStorage)
User request: full Portfolio ("Add to Portfolio" from match cards, auto-fill pick/odds, manual settle Win/Loss, stats). Access = everyone. Restore Charts/Watchlist to nav. Charts = shortlist of favourite/considered matches; Portfolio = bets actually played. Emphasis: make it beautiful, readable, well-designed.
- Persistence: **localStorage** (no backend/auth dependency — works for everyone instantly). Cross-device sync deferred (would need login + backend).
- `contexts/PortfolioContext.jsx` (new): `moka_portfolio_bets` localStorage; addBet/settle/updateStake/remove/clear; computes stats (Net P/L, ROI, Win Rate, staked, pending stake & potential, cumulative P/L timeline). betReturn: won=stake*odds, void=stake, lost=0.
- `components/AddToPortfolioButton.jsx` (new): opens stake modal (prefilled pick + best odds + bookmaker, quick chips €5/10/20/50, potential-return preview) → addBet as pending.
- `pages/PortfolioPage.jsx` (new, `/portfolio`): 4 stat cards, bankroll area chart (recharts), All/Pending/Won/Lost filters, bet cards with Mark Won/Lost/Void + Reset + remove, empty state.
- Wired: `App.jsx` PortfolioProvider + `/portfolio` route; `Header.jsx` restored **Watchlist** (→/charts, Star icon, chartCount badge) + new **Portfolio** (Wallet icon, pendingCount badge). `ValueCard.jsx` + `MatchAnalysisPage.jsx` now show Add-to-Portfolio. Fixed ChartsPage empty-state link (/value→/matches).
- VERIFIED end-to-end in browser: add bet → modal (Motherwell 6@Casumo, €60 potential) → confirm → Portfolio shows Net P/L €35, ROI +350%, Win 100%, Pending €20, bankroll chart, settle buttons. Math correct.
- Lint fixes done alongside: removed duplicate `import hashlib` in backend/football_service_layer.py; added `user` to useAuth destructure in MatchPage.jsx.

## Phase 7 (2026-08-28) — Premium Home redesign + Free 5-match Portfolio limit (frontend-only)
Big UX brief "FINAL MOKA VALUES". Most items were already done in Phases 5–6 (Matches strong/watching/all, simplified match cards, Match Analysis order + odds sorted best→worst + Advanced Statistics collapsible, no Odds tab, Portfolio My Bets/performance/bankroll). NEW work this phase:
- **HomePage.jsx fully rewritten** as a premium editorial sports landing — NO match cards (removed fetchValueMatches). Sections: full-viewport HERO (goal-net/floodlights bg image + gradient, huge "MOKA MAKES BETTING EASIER.", Explore Matches + My Portfolio CTAs); four full-width chapter Steps (01 Find opportunities / 02 Best odds / 03 Know the game / 04 Track performance) with big Greek typography over dark sports imagery (no boxes); brand statement "ΤΟ ΣΤΟΙΧΗΜΑ ΔΕΝ ΕΙΝΑΙ ΑΠΛΗ ΥΠΟΘΕΣΗ."; statistics message "Η ΣΤΑΤΙΣΤΙΚΗ ΔΕΝ ΛΕΕΙ ΨΕΜΑΤΑ." + "Κάν' την εργαλείο σου." + Ομάδες/Παίκτες/Φόρμα/... + "Η λεπτομέρεια μπορεί να κάνει τη διαφορά."; six large benefit statements; FIND→ANALYSE→CHOOSE→TRACK journey; final CTA "Explore Matches". Responsive (sm/lg type scaling). Stock imagery from Unsplash (dark stadium/goal/court).
- **Free 5-match Portfolio limit**: `PortfolioContext.computeStats(bets)` extracted as pure fn. PortfolioPage now uses useEntitlements → free users scoped to `bets.slice(0,5)`; stats computed from that subset; upgrade banner ("Your free portfolio includes your latest 5 matches" + UpgradeButton) when hiddenCount>0. Pro = unlimited.
- VERIFIED (browser): Home renders all sections, hero h1 = "MOKA MAKES BETTING EASIER.", 0 value-cards on Home. 
- DEFERRED (not done, noted for follow-up): "Sports" nav tab (no existing SportsPage), Portfolio "My Tickets" (multi-match accumulators), richer Leagues (fixtures+results+standings) & Team/Player detail pages. These need more work/credits; model calibration handled separately per brief.

## Phase 8 (2026-08-28) — My Tickets + Team/Player Detail + Sports Switcher (frontend-only)
Three follow-up features requested. All frontend, reused existing components/data. No backend/API/model changes.
- **My Tickets (accumulator)**: `PortfolioContext` extended with bet slip (`moka_bet_slip`) + tickets (`moka_tickets`) in localStorage; `computeTicket(t)` (totalOdds = product of non-void leg odds, potentialReturn, derived status won/lost/void/pending, profit). `AddToPortfolioButton` modal got a Single-bet / Accumulator toggle → "Add to bet slip". `PortfolioPage` now has top tabs **My Bets / My Tickets**; Tickets tab shows live BetSlip builder (legs, total odds, stake, potential, Place ticket) + placed TicketCards with per-leg Won/Lost/Void/Reset and total odds/stake/profit. Free tier limited to latest 5 tickets. VERIFIED: 2-leg ticket 6×4.5 → total 27, €10 stake → €270 return, per-leg settle works.
- **Team & Player detail** (TeamsPage `TeamDetail` rewritten): real team **logo** (Crest uses `team.image`), hero with League Position + form badges, Season stats (Points/Played/Last-5 W-D-L/GPG/Conceded — real SportMonks fields), **Squad grouped by position** (GK/DEF/MID/ATT) with player **photos**+number+position. Removed the old empty stat-columns table + misleading API-Football note. VERIFIED: Brøndby IF #1, 29 real players with photos.
- **Sports switcher**: `sportsCatalog.SPORTS` now football(available) + basketball(available:false). New `SportsPage` (`/sports`): Football card (leagues chips + Matches/Leagues/Teams shortcuts) + Basketball "Coming soon". New **Sports** nav item (Dribbble icon). VERIFIED.
- Nav now: Home · Matches · Leagues · Teams · Sports · Watchlist · Portfolio · Pricing · Account.

## Phase 9 (2026-08-28) — Rich League pages + Cloud Sync + Add-to-Slip everywhere
- **Rich League pages**: `sportmonks.fixtures_for_league(slug)` (season schedule via `/schedules/seasons/{sid}`, parses participants/scores → upcoming + results, 1h cache). New `GET /api/leagues/{slug}` → {standings (teams_for_league), upcoming, results}. New frontend `LeagueDetailPage` (`/leagues/:slug`) with Standings / Fixtures / Results tabs (logos, scores, form, points). LeaguesPage cards now link to `/leagues/:slug`. VERIFIED: denmark → 12 standings, 20 upcoming, 20 results with real logos+scores.
- **Cloud Sync (Supabase)**: new `user_portfolios(user_id PK, data TEXT, updated_at)` table in both PG+SQLite schemas. `GET/PUT /api/me/portfolio` (Depends current_user). `PortfolioContext` syncs when logged in: pull on login (server = source of truth; pushes local up if server empty), debounced PUT on every bets/tickets change. Guests stay localStorage-only. VERIFIED endpoints: 401 without auth; table created. NOTE: full logged-in round-trip not verified (needs a real Emergent auth session).
- **Add-to-Slip everywhere + simple accumulator**: new one-click `AddToSlipButton` (add/remove leg) added to Match Analysis (next to Add-to-Portfolio). New global `SlipFab` floating pill (bottom-right, shows count + live total odds) → `/portfolio?tab=tickets`. PortfolioPage reads `?tab=tickets`. VERIFIED: add-to-slip toast + FAB "BET SLIP · odds" appears and deep-links to Tickets tab.

## Phase 10 (2026-09-01) — Migrated stats data to API-Football / API-Basketball (api-sports.io)
User provided a new api-sports.io key → key stored in `backend/.env` as `APISPORTS_KEY` (header `x-apisports-key`). Verified: account "Free" plan, 100 req/day, and **data endpoints only cover seasons 2022–2024** (current season blocked). So teams/leagues/players/standings/results use **season 2024** (football) / **2023-2024** (basketball). Live upcoming odds/matches STILL come from The Odds API (unchanged).
- New `backend/apifootball.py`: CATALOG of 11 football leagues (EPL 39, La Liga 140, Serie A 135, Bundesliga 78, Ligue1 61, Eredivisie 88, Primeira 94, Championship 40, Greece SuperLeague 197, Denmark 119, Scotland 179) + 2 basketball (NBA 12, EuroLeague 120). Functions: `teams_for_league` (standings→teams, football & basketball with W/L dedup+sort), `players_for_team` (squad, football), `fixtures_for_league` (full-season fixtures→results/upcoming, football). 24h in-process cache (data is historical → minimal daily API usage).
- server.py endpoints repointed from sportmonks → apifootball: `/leagues` (catalog list), `/leagues/{slug}` (adds `sport`), `/teams`, `/teams/top` (epl), `/teams/{id}`, `/teams/{id}/players`. sportmonks still used only by the live value-matches pipeline (Denmark/Scotland form).
- Entitlements `LEAGUE_CATALOG` expanded to all 13 leagues (all FREE-accessible). Frontend `sportsCatalog.js` mirrored (+ `group` for Teams sidebar, basketball `available:true`). `LeagueDetailPage` sport-aware (basketball → W/L/Win%, Standings-only tabs). `TeamsPage` TeamDetail skips squad fetch for basketball. `SportsPage` now shows both sports active.
- Test-call budget respected: ~24 total api-sports calls during verification (limit 100/day). VERIFIED via curl + 4 browser screenshots: 13 leagues open; EPL 20 standings + 20 results (real logos+scores); NBA 30 teams W/L/Win%; La Liga → Barcelona (#1, form, season stats, squad 34 with player photos).
- ⚠️ DEPLOY: add `APISPORTS_KEY` to Render env. ⚠️ Data reflects season 2024 (last full season), not live current season, and upcoming-fixtures are empty for historical seasons — this is a free-plan limitation.

## Phase 11 (2026-09-01) — Clickable odds → bookmaker sites
- New `frontend/src/lib/bookmakers.js`: `bookmakerUrl(name)` maps ~35 common bookmakers (bet365, Pinnacle, William Hill, Unibet, Betfair, Coolbet, Coral, Ladbrokes, Betfred, BetVictor, Betsson, NordicBet, Marathon Bet, 1xBet, FanDuel, DraftKings, etc.) to their sites, with fuzzy-contains matching + Google-search fallback for unknown books.
- `MatchAnalysisPage` "Available Odds" rows are now `<a target="_blank">` links (data-testid `odds-link-{i}`) with an ExternalLink hover icon. VERIFIED: 30 odds links render; Coolbet/Coral/Ladbrokes/Betfred resolve to correct sites.

## Phase 12 (2026-09-01) — BUGFIX: login / free-trial did nothing
Root cause: `pages/AuthCallback.jsx` POSTed to `/auth/session` but **discarded the response**, so the returned `session_token` was never saved to localStorage → after the Google redirect the app stayed logged out ("loads then redirects, nothing happens"). Backend `/auth/session` already returns `{session_token}` in the body (auth.py:206-212).
Fix: AuthCallback now reads `res.data.session_token`, calls `storeAuthToken(token)`, then `window.location.replace("/account")` so AuthProvider re-runs `checkAuth()` and renders the signed-in state. Failed exchange still redirects gracefully to `/`. Test seed users (Bearer tokens) confirm that a stored token → full signed-in Account/Pro state. NOTE: the real Google OAuth round-trip itself couldn't be exercised headless (needs a live Google login), but the missing link (token persistence) is fixed and the token→session path is verified.

## Phase 13 (2026-09-01) — BUGFIX: subscription checkout (monthly/annual) did nothing
Same class of bug as Phase 12: a logged-out user clicking a plan was sent to Emergent auth, which (before Phase 12) never logged them in; and even after, they landed on `/account` instead of resuming checkout — so the subscription "did nothing". The Stripe checkout endpoint itself works (verified: `/billing/checkout` returns valid `checkout.stripe.com` URLs for pro_monthly & pro_yearly).
Fixes:
- `AuthCallback.jsx`: after storing the token, redirect to the **intended path** (`window.location.pathname`, e.g. `/pricing`) instead of hardcoded `/account`, so users return to where they started. Falls back to `/account` when path is `/`.
- `PricingPage.jsx`: on `!user` checkout, saves chosen `package_id` to `sessionStorage["moka_pending_checkout"]` before the auth redirect; on mount when `user` is present, auto-resumes `startCheckout(pending)`.
VERIFIED in browser: logged-in user with a pending plan auto-redirects to the Stripe Checkout page (Annual €79, prefilled email, card form). Full flow: pick plan → sign in → auto-resume → Stripe → pay (test card 4242…) → `/pricing/success` polls `/billing/status` → Pro.

## Phase 14 (2026-09-01) — Mock fallback for stats (API-Football inactive)
The API-Football free plan went inactive/quota-exhausted → leagues/teams/players/basketball came back empty. Added a built-in deterministic MOCK FALLBACK so users can always browse/test, with zero API credits.
- New `backend/mockdata.py`: real team-name lists for all 13 leagues (11 football + NBA + EuroLeague), deterministic (hash-seeded) standings/form/goals, fixtures (10 past results w/ scores + 10 future upcoming), and 22-player rosters grouped GK/DEF/MID/ATT. Mock ids: teams `m_<slug>_<i>`, players `..._p<n>`. Logos omitted (frontend Crest → initials).
- `backend/apifootball.py`: `teams_for_league` / `fixtures_for_league` / `players_for_team` now fall back to mockdata when the live call returns empty/errors; mock cached with a short 300s TTL so it auto-retries live and switches back to real data once the account is reactivated. Module-level `import mockdata`.
- `server.py`: `/teams/{id}` resolves the league from the `m_<slug>_` prefix (no full-catalog scan); `/teams/{id}/players` reports accurate `source` ("mock"|"live").
- VERIFIED: testing_agent iteration_6 = 100% backend + 100% frontend (13 leagues open, EPL 20 standings + fixtures + results, NBA W/L/Win% standings, La Liga teams + 22-player squads). Regression suite `backend/tests/test_mock_fallback.py` (25 passed). Post-fixes (leagueName = league display name; basketball sorted by wins) confirmed.
- When API-Football is reactivated (or plan upgraded), the app automatically shows real season-2024 data again — no code change needed.

## 2026-09-05 — Real API-Football data for Matches + Match Analysis (Pro)
- Account upgraded to **API-Football Pro** (active, 7500 req/day). Current season now accessible (season derived dynamically; Sept 2026 -> 2026).
- ACTIVE Matches pipeline confirmed: `GET /api/value-matches` (list) and `GET /api/matches/{id}` (detail) both source from `live_values.build_live_matches()` -> Moka `value_engine.rank_value_matches()` (UNCHANGED). `football_service_layer.py`/`/matches/trending` only feeds the search palette (untouched).
- `live_values.py` rewritten: real upcoming fixtures + real bookmaker odds from **The Odds API** (kept, working: 31-43 books/match for EPL/LaLiga/SerieA/Bundesliga/Ligue1) + real team stats (form, goals for/against) from **API-Football standings** via `apifootball.teams_for_league`. Team-name matched (normalised) across providers; unmatched -> neutral defaults (still shows match). id = `live_<oddsapi_event_id>` (stable). Odds cached 12h, stats 24h, matches 30min. Empty -> MOCK_MATCHES fallback preserved.
- `apifootball.py`: dynamic current season (env `API_FOOTBALL_SEASON` override); `_key()` reads `API_FOOTBALL_KEY` then `APISPORTS_KEY` (both hold the Pro key, no hardcoding); **request budget counter/logging** in `_get` (daily cap `API_FOOTBALL_MAX_CALLS`=100, raises past cap -> mock fallback). `usage()` exposed via `/api/status.api_football_usage`.
- Moka model NOT modified. Observation: on 2-game early-season samples the unchanged model can pick longshots as HIGH value (e.g. RC Lens @12.5) — expected model behaviour on sparse real data, left as-is per instruction.
- Verified: value-matches source=live, real fixtures/odds/stats; detail-by-id renders full analysis (31 odds rows, clickable); counter=5 calls (5 leagues x standings, cached). Total implementation API-Football calls ~10 (<<100).
- API-Football ODDS FALLBACK added (`apifootball.upcoming_fixtures_raw` + `odds_by_fixture`, parsing "Match Winner" 1X2). `live_values` now fills any league gap with API-Football fixtures+odds (id `live_af_<fid>`, source "apifootball") when The Odds API under-covers — LAZY: only calls API-Football odds when a gap exists, so zero extra calls when odds_api already fills MAX_PER_LEAGUE. Fixtures with no available odds are skipped, so no match ever renders empty odds. Verified: forced-empty odds_api for a league -> filled from API-Football (Le Havre vs Brestois, Angers vs Rennes, 6 books each); normal run unchanged (5 leagues, 32-42 books, usage stays 5).
- ALL football leagues turned on for Matches page: `LIVE_LEAGUES` expanded from 5 to 11 (added eredivisie/primeira/championship/superleague/denmark/scotland with sport_key=None -> odds sourced from API-Football, not The Odds API, so zero Odds-API monthly-budget spend). build loop skips The Odds API when sport_key is falsy. Fallback rewritten to be odds-driven: `af.odds_by_fixture` (fixtures that have odds) + `af.fixtures_by_ids` (1 batch call for details) -> perfect fixture/odds alignment. Verified: 42 real matches across 10 leagues, 0 empty odds, API-Football usage 23/100 (cached). Championship occasionally 0 = no priced upcoming fixtures at that moment (real availability, not a bug).

## 2026-09-05 — Fix: wrong-looking standings report + "La Liga Club 9" in matches + junk odds
- ROOT CAUSE: The Odds API monthly quota EXHAUSTED (401 OUT_OF_USAGE_CREDITS, remaining=0). With no odds, the value-matches route fell back to MOCK_MATCHES -> placeholder team names like "La Liga Club 9". Also some bookmaker prices were exchange placeholders (Betfair 1000.0) which the model picked as "best odds" -> absurd HIGH-value longshots.
- FIX 1 (single reliable source): `live_values.py` rewritten to use API-Football ONLY (Pro, 7500/day) for fixtures + odds + stats across all 11 football leagues. Dropped The Odds API from the live path (free tier dies mid-month; unreliable). Bookmakers per match now ~6-12 (API-Football) instead of 30-43.
  - fixtures: `af.upcoming_fixtures_raw` uses `next` WITHOUT `season` (API-Football returns empty if both sent — this was silently breaking upcoming fixtures). cached 6h.
  - odds: `af.odds_for_dates(slug, nearest_dates)` -> `/odds?league&season&date=` for the 1-2 nearest match dates, aligned to fixtures by fixture id. cached 12h. Matches without odds are skipped.
- FIX 2 (junk odds): MAX_ODDS=51 filter in both `live_values._best_odds_entries` (removed, now af only) and `apifootball._mw_entries` — drops prices outside 1.0<odds<=51 (exchange placeholders/errors). Data-layer only; Moka model untouched.
- FIX 3 (no fake teams): `src/routes/value_matches.py` no longer falls back to MOCK_MATCHES. If live source is down it returns an empty list (UI shows "no matches") instead of "La Liga Club 9".
- NOTE: 429 per-minute rate limit exists on API-Football; one cold build (~45 calls) is within it. Standings verified REAL & correctly ordered for all 11 leagues (current 2026/27 season, early games). 
- Verified: /api/value-matches source=live, 48 matches across all 11 leagues, 0 odds>51, 0 mock names, usage 45/100. Screenshot: real teams, sane odds, no 1000.
- KNOWN (unchanged model, by user instruction): on sparse early-season data the model rates some longshots (e.g. Nacional @16.5) as "Strong" — expected; needs a min-games guard to fix, deferred.

## 2026-09-05 — Deployed (Vercel+Render) shows empty/MOCK: diagnosis
- Deployed frontend (Vercel) correctly calls Render backend https://moka-backend-s9fj.onrender.com; CORS ok (allow-origin *).
- Render backend RUNS AN OLDER/INTERMEDIATE build: /api/status has api_football_usage (count 38) but /api/value-matches returns source=live count=0, live=false ("MOCK · never" pill). Root cause = the pre-fix `next`+`season` bug (empty upcoming fixtures) that was fixed on preview but NOT yet on Render.
- Preview (latest code) returns 48 real matches / 11 leagues / 0 mock / 0 junk odds; detail endpoint works for live_af_ ids. So the code is correct — the LIVE site just needs a redeploy.
- Production tuning: API_FOOTBALL_MAX_CALLS default raised 100 -> 500 (11 leagues need headroom; still tiny vs Pro 7500/day). Caches lengthened: upcoming fixtures 12h, odds-by-date 24h -> real usage ~50-70/day.
- ACTION FOR USER: Save to GitHub -> redeploy the Render backend (Vercel frontend needs no change). Ensure Render env has API_FOOTBALL_KEY (present — 38 calls succeeded).

## 2026-09-05 (cont.) — ROOT CAUSE of deployed empty/wrong data: stale API_FOOTBALL_SEASON
- Render /api/leagues/epl showed Man City 88 pts (finished 2024 season) while preview showed current 2026 -> Render had API_FOOTBALL_SEASON=2024 set (manually in Render dashboard; NOT in render.yaml). This one stale env var caused BOTH symptoms: wrong (old) standings AND 0 live matches (fixtures via `next`=2026 dates but odds queried with season=2024 -> season/date mismatch -> no odds -> no matches).
- FIX (bulletproof, no env hunting): `apifootball._current_football_season()` now ALWAYS computes the current season and ignores any API_FOOTBALL_SEASON env override. Plus `odds_for_dates` derives season from each fixture DATE (not the global season). Empty odds cached only 600s (was 24h) to self-heal.
- USER ACTION: Save to GitHub -> redeploy Render backend (definitive). OR faster without redeploy: delete API_FOOTBALL_SEASON in Render dashboard -> Environment.
- Preview verified live=true after change.

## 2026-09-05 (cont.) — Player stats (#2) + Team/League nav bug (#3)
- NAV BUG (#3) ROOT CAUSE: LeagueDetailPage standings rows linked to generic `/teams` (no id) -> always opened the default team. FIX: link now `/teams?league=<slug>&team=<teamId>` (stable IDs). TeamsPage reads ?league/?team via useSearchParams and preselects the exact league+team after squad loads. Verified: /teams?league=epl&team=50 opens Man City.
- PLAYER STATS (#2): new lazy endpoint GET /api/players/{player_id}?season= -> apifootball.player_stats() calls /players?id=&season= (current season), aggregates apps/minutes/goals/assists/shots/onTarget/keyPasses/passes/tackles/interceptions/duelsWon/fouls/cards + avg rating; primary team = entry with most apps; cached. Frontend: PlayerCard now clickable -> PlayerModal (reuses existing dark card styling, #39FF14 accent) shows the stat grid. Fetched ONLY when a player is opened (not per squad). Players with no stats this season -> graceful "not available". Verified with Haaland (id 1100): 12 apps, 11 goals, 37 shots, rating 7.11.
- Design/model/integration/Stripe/auth all untouched. API-Football calls for this task: a handful (squads cached, 1 stats call per opened player), well under 100.
- STILL TODO (proposed next phase, larger): #4 live/finished scores on Matches; #5-8 easy check/uncheck + verify add-to-slip best odds + save-for-later; #9-14 AUTOMATIC result->settle->Portfolio (fetch final scores, WIN/LOSS per pick, partial accumulator handling, remove finished from active slip). These need reading the existing Slip/PortfolioContext + a fixtures-results/settlement backend job.

## 2026-09-05 (cont.) — Player stats: club-only + not-played message + chart; Portfolio PRO/FREE confirmed
- Portfolio PRO=all / FREE=last 5: ALREADY implemented (PortfolioPage FREE_LIMIT=5, isPro?all:slice(0,5) for bets AND tickets, newest-first, with Upgrade prompt). No change needed — confirmed correct.
- Player stats now CLUB-ONLY: player_stats(player_id, season, team_id) filters /players statistics to the opened club's entries (national-team caps excluded). `played` flag = club apps/minutes>0. Endpoint GET /api/players/{id}?team=<teamId>. Verified Haaland@ManCity: 3 apps, 2 goals, rating 6.95 (club only, was Norway-inflated before).
- Not-played UX: if played=false or 404 -> modal shows "{name} hasn't played for {club} yet this season" (uses squad player info). 
- Per-player mini bar chart added (PlayerBarChart, CSS bars #39FF14: Goals/Assists/Shots/Key Passes/Tackles/Duels Won). No new deps. Consistent with existing dark design.


## Update 2026-09-05 — Home picks + match card actions
- Home: added HomePicks section at the very TOP (above hero, no scroll) showing top 3 real value picks; dark cards w/ neon accent, grow on hover, existing arena photo bg. Hero + marketing kept below as before.
- ValueCard: removed "Add to Portfolio"; now "Add to Watchlist" (save/keep-for-later -> /charts) + "Add to slip". Shows kickoff date/time (or LIVE badge+score).
- Backend value_engine.public_match now exposes commence_time + score.
- Files: components/HomePicks.jsx (new), components/ValueCard.jsx, components/AddToChartButton.jsx (relabel Watchlist), pages/HomePage.jsx, backend/src/services/value_engine.py


## Update 2026-09-05 (correction) — Home top = advertising sentences + diagram
- Home top section (HomePicks.jsx) now shows the 6 advertising SENTENCES (English, no periods, numbered 01-06, hover->green) over the existing arena photo, with the Season-output bar-chart diagram below. NO value picks on home. Visible without scroll; hero + marketing below unchanged.


## Update 2026-09-06 — Prediction engine + Player status + AI analysis (Phases 1-3)
### Phase 1 (backend, 0 new API calls)
- Rewrote probability_engine.py -> deterministic Poisson model: expected goals (attack/defense rates + form + explicit home advantage) -> 1X2 + Over/Under 2.5 + BTTS + expected goals. Added possible_outcome() (single or double-chance from model).
- value_engine.evaluate_match now exposes value.prediction + value.possible_outcome. Existing EV/value/market comparison unchanged.
### Phase 2 (Match Analysis UI + player status)
- MatchAnalysisPage: new Moka Prediction card (Possible Outcome + 1X2) + Goal Markets card (O/U 2.5, BTTS, xG). Advanced stats now PRO-gated: PRO -> organized section (Moka vs Market, Team Statistics w/ N/A for missing, Full Model Output); Free -> "Show advanced statistics — Pro" opens upsell modal (NO API call).
- apifootball.injuries_for_team() (lazy+cached 12h) attaches status (injured/suspended/yellow/doubtful) to squad players. TeamsPage StatusBadge renders coloured badges (verified 2 real badges on Man City).
### Phase 3 (AI, GPT-5.6 Luna)
- ai_analysis.py: emergentintegrations LlmChat, model from OPENAI_MODEL env (gpt-5.6-luna), EMERGENT_LLM_KEY. Strict anti-hallucination prompt; only supplied data; possible_outcome from engine (not AI). Cached (apifootball cache) keyed by match id + data hash -> repeat opens = NO OpenAI call (verified 0.028s cached).
- Endpoint GET /api/matches/<built-in function id>/ai-analysis. Frontend MatchAnalysisPage fetches lazily (90s timeout), renders "Moka Analysis" card + Possible Outcome badge.
- Keys server-side only in backend/.env: OPENAI_API_KEY (stored, unused-by-default), OPENAI_MODEL=gpt-5.6-luna. AI uses EMERGENT_LLM_KEY via emergentintegrations.
### Pending: Phase 4 responsive/layout audit (Home, Analysis, Teams, Players, Charts, Portfolio, Pricing); optional lazy xG/H2H multipliers into prediction adjust; inline player-stats-in-analysis lineup.


## Update 2026-09-06 — Phase 4 responsive/layout audit
- Header: added proper mobile hamburger menu (data-testid mobile-menu-toggle + mobile-nav, m-nav-* links) shown <lg; desktop nav now hidden lg:flex (unchanged visually at lg+). Refactored nav to NAV_ITEMS array.
- Verified 0 horizontal overflow on Home/Matches/Analysis/Teams/Portfolio/Pricing/Charts (desktop). Tables (LeagueDetail standings, Charts watchlist) already wrapped in overflow-x-auto.
- LIMITATION: screenshot tool renders at 1920px only; true mobile (320-430px) verified via code review of responsive classes + programmatic scrollWidth check, not visual mobile screenshots.
- All 4 phases (prediction engine, Match Analysis UI + player status, AI GPT-5.6 Luna, responsive) complete.


## Update 2026-09-06 — Auto-settlement + Portfolio period filters + Matches filters
### Auto-settlement (real final scores)
- apifootball.fixture_results(ids): batched /fixtures?ids=fid1-fid2 (<=20/call), cached (finished 7d, pending 2m). Backend GET /api/results?ids=comma-list.
- catalogApi.fetchResults(); PortfolioContext.autoSettle() settles pending single bets + accumulator legs by comparing pick side (home/draw/away) to real outcome -> won/lost + finalScore + settledAt. Accumulator ticket auto-settles via existing computeTicket. Runs on Portfolio open (1 batched call) + "Refresh results" button.
### Portfolio period filter (PRO)
- PERIODS all/day/week/month/year filter stats (P/L, ROI, win rate, money) + history by settledAt|createdAt. Free unchanged: latest 5 bets, no filters.
### Matches filters
- League dropdown + team search + date picker on /matches (client-side over value-matches). data-testids: matches-filters, filter-league, filter-team, filter-date, filter-clear.
### Real xG & H2H — HONEST STATUS
- API-Football does NOT expose pre-match xG for UPCOMING fixtures (only post-match team statistics, not all plans). The 'xG' shown remains the model's deterministic expected goals. The prediction engine  multiplier hook is ready. H2H is available but needs team-id plumbing (public_match currently strips ids) + per-match cached call — NOT yet wired. Offered as next step.


## Update 2026-09-06 — Live ticker + live scores + H2H + team splits
- Live ticker (LiveTicker.jsx + LiveScoresContext, mounted in Header -> all pages): thin scrolling bar, ALL leagues, score+minute. Powered by GET /api/live -> apifootball.live_fixtures() /fixtures?live=all = ONE call, cached 45s (204 live matches verified). Poll 60s client-side.
- Live scores on ValueCard: MatchWhen shows LIVE score+minute if match id is in live map, else kickoff date.
- H2H multiplier: apifootball.head_to_head (cached 24h) applied via prediction adjust hook in matches._refine_prediction (single-match view only). Verified signals h2h 3-2-1 applied + shown as prediction-h2h line.
- Team form splits: apifootball.team_statistics /teams/statistics (cached 24h) -> home/away goal splits + clean sheets feed adjust multipliers (clamped 0.85-1.18). Graceful N/A when league has no data (no fake, no 0).
- Match team ids stored on live match (home_id/away_id) via live_values for H2H/team-stats lookups.
- API cost: ticker 1 call/45s (all leagues); H2H+team-stats only on single match open, cached 24h.


## Update 2026-09-06 — Direct OpenAI (Luna) + Team Compare + full Live match analysis
- AI analysis migrated OFF Emergent: ai_analysis.py now uses direct OpenAI SDK (AsyncOpenAI, openai==1.99.9) with OPENAI_API_KEY, model gpt-5.6-luna (OPENAI_MODEL). No emergentintegrations / EMERGENT_LLM_KEY in AI flow. 24h cache kept (af._c_set). Verified cold->warm (cached). requirements.txt: added openai==1.99.9, REMOVED emergentintegrations + --extra-index-url (fixes Render build). NOTE: server.py still uses EMERGENT_LLM_KEY for a SEPARATE legacy Claude /analysis endpoint (httpx, optional, falls back to heuristic).
- Team Compare (TeamsPage ComparePanel, football): pick 2nd team -> side-by-side (pos, points, last5, goals/game, conceded/game, clean sheets), green = better. Clean sheets via GET /api/teams/{id}/stats?league=slug (team_statistics, lazy+cached 24h).
- Home hero: all benefit sentences as neon pills around headline (no scroll); brand XtraStats->MokaStats; ticker slowed 50s->240s across iterations.
- LIVE matches now fully analysable (MatchesPage: red "Live" toggle chip + LIVE NOW section inside All Matches; live cards clickable). Backend matches._build_live_match resolves ANY in-play fixture on demand: reuses cached /api/live list (homeId/awayId/leagueId added to live_fixtures) + team_statistics (24h) + apifootball.live_fixture_stats /fixtures/statistics (cached 60s). evaluate_match->None (no odds) falls back to _prediction_only_value (live_only=true, prediction+possible_outcome only, no pick/EV). public_match passes through `live` (score/minute/stats). MatchAnalysisPage: live header (score+minute), hides Moka Pick/Why Moka/Available Odds/Moka-vs-Market when live, shows Live match statistics card. adaptValue exposes liveOnly. Verified end-to-end (Rosario Central live, prediction HOME WIN, live stats, AI cached).
- Redirect fix: liveMode resets on tab change (useEffect on view + onClick on chips).
- Credit control: live list 1 cached call/60s; per-live-match analysis pulls stats only when opened (pay-per-view).
- 2026-09-06 (b): Live tab/All-Matches LIVE section restricted to Moka supported leagues via new apifootball.SUPPORTED_FOOTBALL_LEAGUE_IDS + `supported` flag on live_fixtures (ticker still worldwide). Live matches now render the full ValueCard (LiveValueCard fetches /api/matches/{id} per supported live match, few = cheap). ValueCard is live-aware: hides odds/pick/Add buttons, shows possible outcome + 1X2 when value.liveOnly. League filter dropdown now only lists supported leagues (fixes 'many junk leagues').

## Update 2026-09-08 — Big-spec Phase 1 (bugs) + Phase D (slip/portfolio)
- #1 Green highlighting FIXED (dynamic): 1X2 highest=green, O/U lowest=green, BTTS highest=green (MatchAnalysisPage Bar + Goal Markets + ValueCard live line). No hardcoded values.
- #2 Odds '14.5' INVESTIGATED = NOT a bug: real underdog decimal odds (8 bookmakers agree; range 1.09-22.0). _mw_entries correct. Longshot-pick behaviour is core EV/model (protected by #23) — left untouched.
- #6 free sees Moka Analysis / advanced PRO-locked: already satisfied. #10 team redirect: fixed earlier.
- Phase D: #11/#12/#13 settlement already existed (autoSettle + computeTicket). Added #14 temporary Go-to-slip toast (auto-dismiss 4s) + #15 Portfolio nav newlySettled badge with app-wide auto-settle on mount, cleared on Portfolio view.
- Remaining big-spec phases: E (European comps CL/EL/Conference + Competition/Sport filters #18-21), a (News API+tab+filters #3/16/17), b (news->prediction + AI uses news #4/5), c (Live Analysis/Live Prediction after HT #7/8/9).

## Update 2026-09-08 (c) — Phase A: News integration (#3/#16/#17)
- Provider = TheNewsAPI (thenewsapi.com). Token in backend/.env THENEWSAPI_TOKEN (not hardcoded). Free tier: 100 req/day, 3 articles/req -> 30min cache via apifootball._c_get/_c_set.
- Backend: news_service.py (fetch_news + build_search AND-combining team/league/q, categories=sports, language=en, published_on=date), src/routes/news.py GET /api/news?q&league&team&date&page, registered in src/app.py make_value_router.
- Frontend: NewsPage.jsx (/news route in App.jsx), NEWS nav tab in Header (Newspaper icon), filters league(select)+team(debounced search)+date, news cards (image/source/date/title/desc/link). Verified: generic + team + Champions League filters return articles, 0 console errors.
- DB: none. Remaining phases: B (news->prediction + AI uses news #4/5), C (Live Analysis/Prediction after HT #7/8/9), E (European comps + Competition/Sport filters #18-21).

## Update 2026-09-08 (d) — Phases E, B, C
- Phase E (#18-21): Added UEFA Champions League(2)/Europa(3)/Conference(848) to apifootball.CATALOG + live_values.LIVE_LEAGUES + core/entitlements + frontend sportsCatalog. Verified CL appears in value-matches (6 matches); EL/Conference show when fixtures exist (no fake data). MatchesPage: Sport filter (All/Football/Basketball) + Competition dropdown (renamed from 'All leagues'), all filters combine. Architecture extensible sport->competition->matches.
- Phase B (#4/#5): news_service.match_news(home,away) (OR search, cached via fetch_news). Passed to ai_analysis.match_analysis(news=) -> added to prompt + hash/cache-key. SYSTEM rule: mention news ONLY if confirmed & materially relevant (injury/suspension/GK/manager/lineup), no invention, no double-count. Deterministic model UNCHANGED (#23) — news is context to AI layer.
- Phase C (#7/#8/#9): matches._live_prediction (deterministic Poisson on live score+minute+model xG projected over remaining time) + _live_analysis_text (score/lead/possession/shots + pre-vs-live divergence). Attached to value.live_prediction/live_analysis for status==live. Frontend: LIVE ANALYSIS + LIVE PREDICTION cards (highest green); after HT the pre-match Moka Prediction card is HIDDEN and kept as historical note. Verified: 0-2@45' pre-match Home Win -> live Away Win 86%.
- Known minor: the AI 'Moka Analysis' narrative is still pre-match-model based (not live score); dedicated LIVE ANALYSIS/PREDICTION cards cover the live requirement. Deploy: add THENEWSAPI_TOKEN to Render.

## Update 2026-09-09 — Alignment + privacy + news/cups fixes
- ALIGNMENT: Match Analysis no longer shows the EV-based longshot pick. Moka Pick card -> 'Moka Lean' = possible_outcome (no odds). shortExplanation/whyMokaReasons/aiExplanation rewritten to possible_outcome (valueEngine.js). ai_analysis.build_input DROPPED moka_pick/best_odds/bookmaker/ev -> Luna narrates from probabilities+possible_outcome+stats+news only (no contradictory '+371% EV OFI'). Core model untouched (#23) — display-only alignment.
- PRIVACY: removed 'Full Model Output' card, 'Moka vs Market' card, Poisson disclaimer text. Advanced keeps only Team Statistics.
- GREEN: all markets now highest=green (1X2, O/U flipped to highest, BTTS).
- Match Analysis buttons: Add to Watchlist (AddToChartButton) + Add to slip (both options).
- NEWS relevance: build_search football/basketball only (generic feed '+football|+soccer|+basketball'), LEAGUE_SEARCH_MAP disambiguates Super League->Greek Super League, Championship->EFL Championship etc.
- COMPETITIONS: added domestic cups FA Cup(45)/EFL Cup(48)/Copa del Rey(143)/Coppa Italia(137)/DFB Pokal(81)/Coupe de France(66)/Greek Cup(735) to CATALOG+LIVE_LEAGUES+entitlements. Verified FA/EFL/Greek Cup appear.
- STILL OPEN (need repro): 'redirect to not-secure page' (which click?); slip 'button appeared stays' (clarify element); odds 40/50 are REAL underdog odds (multi-bookmaker) not a bug — now de-emphasised by alignment.

## 2026-06 — Odds alignment, safe links, slip→portfolio, news feed
- ODDS "14 vs 1.4" ROOT CAUSE: Available Odds card showed the EV-longshot pick's price (e.g. away @ 14.5/51). Fixed in MatchAnalysisPage.jsx — odds + Add-to-slip/watchlist now use the Moka LEAN (possible_outcome -> home/draw/away key). Verified: EV away@51 -> lean Home@1.04. The odds parsing (_mw_entries) was never wrong; 14.5 was a real underdog price.
- SAFE REDIRECT: bookmakers.js bookmakerUrl now returns a Google search per bookmaker (safe + appropriate) instead of deep-linking gambling domains (marathonbet/1xbet/stake) that browsers flag "not safe". Removed dead MAP.
- LIVE PREDICTION timing: _live_prediction attached only in 2nd half (minute>=46, not HT); whole 1st half + HT keeps pre-match prediction. (matches.py get_match)
- SLIP -> PORTFOLIO auto-populate: PortfolioContext.autoSettle now also drains finished SLIP legs -> settled single bets in My Bets (won/lost via real result, default 10 stake), removed from slip. Mount hasPending also checks slip.length. fetchResults resolves live_af_ ids.
- NEWS feed: news_service.fetch_feed aggregates up to 4 pages (free tier caps 3/req) -> ~12 unique articles; route /api/news uses it. Verified 12 articles returned no-filter.
- DEPLOY NOTE: production (vercel/render) runs OLD code — needs Save to GitHub + redeploy. THENEWSAPI_TOKEN, OPENAI_API_KEY, OPENAI_MODEL=gpt-5.6-luna, DATABASE_URL required in Render env.

## 2026-06 — Opportunity/Pick rework (Prediction first, Opportunity second)
- ROOT CAUSE of "Strong @ 1.05" / longshot picks: value_engine picked max-EV outcome (EV=prob*odds-1 favours longshots) and classified Strong on that EV.
- NEW (value_engine.py, probability model UNTOUCHED):
  - Primary pick = model's MOST LIKELY outcome (argmax of home/draw/away), never max EV.
  - Evaluate ONLY that outcome: market_prob=1/odds, edge=model_p-implied, EV kept for advanced only.
  - opportunity_level(edge, odds): odds must be 1.40–3.00; edge>=8pp=HIGH(Strong), >=4pp=MEDIUM(Worth), else LOW(No Clear). edge<=0 or odds out of band = LOW.
  - Classification uses the ROUNDED edge_pts the user sees (no 8.0-shows-MEDIUM boundary bug).
  - rank_value_matches sorts Strong>Worth>rest then value_score.
- FRONTEND one-source-of-truth: removed leanOdds/alignedValue remap (valueEngine.js), ValueCard + MatchAnalysisPage now show backend pick/pickName/bestOdds directly. shortExplanation/whyMokaReasons/aiExplanation reference the SAME pick (model% vs market% at odds).
- AI (ai_analysis.py): build_input adds moka_pick/moka_pick_probability_pct/market_probability_pct/pick_odds/edge_pts/opportunity_level; SYSTEM centres outlook on moka_pick.
- VERIFIED: 10 opportunity_level unit cases pass; real value-matches all picks=argmax; HIGH set 0 rule violations; PSG@1.05->LOW (was Strong@51 longshot); OFI longshot gone; analysis page fully consistent (Luna: "Freiburg 85% vs market 55% at 1.82, +30pt edge").
- STILL OPEN: Greek (EN/EL) translation of whole app (asked scope: default lang, local dict for UI/templates=free, Luna in Greek per-lang cache, news keep source lang).

## 2026-06 — Greek translation (EN default + EL toggle)
- Default English, EL toggle in header (lucide Globe, data-testid=lang-toggle), persisted in localStorage (moka_lang).
- NEW: lib/i18n.js (EN->EL DICT ~160 phrases + NAV map + PLACEHOLDERS), contexts/LanguageContext.jsx (useLang), components/AutoTranslate.jsx (MutationObserver DOM translator, requestAnimationFrame-batched, restores on EN), components/LangToggle.jsx.
- AutoTranslate: swaps known English text nodes for Greek app-wide; skips [data-no-translate] subtrees (logo protected -> stays "MOKASTATS") and SCRIPT/STYLE/TEXTAREA; team names/numbers/odds untouched (not in dict); unknown phrases fall back to English.
- Nav labels via navLabel() in Header (avoids Home nav vs Home-outcome collision).
- Template descriptions (valueEngine.js shortExplanation/whyMokaReasons/aiExplanation) have Greek variants via getLang(); ValueCard & MatchAnalysisPage consume useLang() to re-render on toggle.
- Luna AI: /matches/{id}/ai-analysis?lang=el -> ai_analysis.match_analysis(lang) adds Greek instruction; cache hash includes lang (1 credit per match per language, 24h cache). News stay source language (no cost).
- VERIFIED (screenshots + curl): matches page fully Greek (nav/tabs/hero/cards/descriptions/trial/gating), logo intact, Luna returns fluent Greek. EN default unaffected.

## 2026-06 — Live disappeared = API-Football daily quota (500/500) exhausted
- Root cause (NOT code): production /api/status showed api_football_usage 500/500 -> /api/live returned [] -> ticker + live section gone. value-matches still worked (cached).
- Reduced API-Football consumption: live_fixtures TTL 45s->150s (apifootball.py); live_values MATCHES_TTL 30min->2h; LiveScoresContext poll 60s->120s + pauses when document.hidden.
- Note: today's counter resets at UTC midnight; needs redeploy to apply. 500/day plan is tight for all-day live — consider higher API-Football plan.
- Production backend: https://moka-backend-s9fj.onrender.com ; frontend https://moka-pk4j.vercel.app (already runs latest opportunity+translation build).

## 2026-06 — Bug batch (spec 17-point), safe subset
- #8/#15 CANONICAL FIX (real bug): _refine_prediction (H2H/form) overwrote prediction/probabilities but NOT model_prob/edge/pick -> text said 55% while chart said 40%. Added value_engine.reevaluate_pick(value, probs, match); matches.py calls it after refine. Verified model_prob% == probabilities[pick] (40==40).
- #7 bookmaker allowlist: bookmakers.js returns URL only for approved books (removed 1xbet/stake); MatchAnalysisPage renders non-approved odds as NON-clickable div (odds shown, no redirect). Note: "Only verified bookmakers link out to bet."
- #6 Watchlist (ChartsPage): comparison charts now render ONLY when >=2 rows selected; else a hint. Comparison logic preserved.
- #14 Translate button next to Moka Analysis (aiLang state, re-fetches analysis in EN/EL). Reuses per-lang Luna cache.
- #11/#12/#8 prompt (ai_analysis SYSTEM): numbers must be exact/canonical; plain fan-friendly language (no jargon); news only when materially relevant.
- #9 already satisfied by prior opportunity rework (edge>0 + odds 1.40-3.00). #10 already satisfied: xG is opponent-adjusted (home=(h_scored+a_conceded)/2), NOT a raw sum. No model change.
- #13 backend health: preview healthy (ticker + live OK). Production earlier hit API-Football 500/500 quota; consumption already reduced (live 150s, value 2h, poll pauses when hidden).
- NOT DONE (large / need approval, per "STOP before architectural changes"): #2-#5 Ticket->Portfolio automation + editable odds per selection + ticket-based Portfolio + performance chart; #1/#16 full responsive audit.

## 2026-06 — Tickets→Portfolio rework (#2-#5)
- #3 Editable odds per slip leg: PortfolioContext.updateSlipLegOdds(matchId, odds); BetSlip renders a "Your odds" number input per leg (default = Moka best). Total odds/return/profit use the edited odds (legs copy slip odds at placeTicket).
- #2/#4 Ticket-based portfolio: removed the slip->singles auto-drain from autoSettle (no phantom stake-10 bets). Tickets stay in `tickets`; computeTicket derives status/profit from real leg results; autoSettle settles legs from real scores. "Place ticket" keeps legs pending (does NOT mark won/lost). My Tickets tab shows selections/odds/stake/return/status.
- #5 Performance: PortfolioPage stats/chart now ticket-inclusive — statsSource = periodBets(singles) + settled tickets mapped to pseudo-bets (stake, totalOdds, status, settledAt). Existing StatCards (Net P/L, ROI, Win Rate) + AreaChart (cumulative P/L) now reflect tickets. Fixed a TDZ dup-declaration bug (statsSource before stats).
- Files: contexts/PortfolioContext.jsx, pages/PortfolioPage.jsx. Verified: Portfolio renders, console clean, no errors.
- #1 responsive: NOT fully done — screenshot tool forces 1920 viewport so mobile overflow can't be measured here; needs real-device pass. Existing responsive classes (grid-cols-1 md:.., hamburger nav, overflow-x-auto tables) in place.

## 2026-06 — 3 fixes: prob-sum-100, odds allowlist, Greek news
- #1 Probabilities sum to EXACTLY 100: value_engine.pct100() (largest-remainder). Applied to value["probabilities"] + prediction 1X2 in evaluate_match AND matches.py refine. Verified 61/61 matches sum==100.
- #2 Odds allowlist (safe redirects): apifootball._bookmaker_approved + APPROVED_BOOKMAKERS filters _mw_entries so ONLY reputable books (bet365, betano, bwin, unibet, betsson, netbet, 888sport, betway, betvictor, interwetten, william hill, coolbet, nordicbet, 10bet, leovegas) are surfaced. Grey-market/GR-blacklisted (1xBet, Marathonbet, Pinnacle, Stake, etc.) dropped entirely -> best_odds + detail only show approved, all clickable. Frontend MAP added bwin/netbet/interwetten. Verified detail odds = [William Hill, Bet365, BetVictor, Betano].
- #3 Greek news via freenewsapi.ai (no key): news_service.freenews_gr(country=gr). /api/news?lang=el returns Greek feed; NewsPage passes lang. match_news also merges Greek team coverage into AI prediction context (injuries/lineups first in Greek press). Verified 12 GR articles incl. football/basketball + injury news. Note: generic GR feed is mostly-but-not-strictly sport (freenews q filtering is loose).
- Files: value_engine.py, matches.py, apifootball.py, news_service.py, routes/news.py, bookmakers.js, NewsPage.jsx. Verified via curl + screenshot, console clean.

## 2026-06 — Stricter GR news filter (sports-only)
- news_service._is_sports_gr(): keeps an article only if host in GR_SPORTS_HOSTS (gazzetta/sdna/onsports/sport24/novasports/contra/goalpost/ole/etc.) OR title/desc matches GR_SPORTS_KW (football/basketball keywords + Greek team names, accent-insensitive). Blocks betting-promo hosts (GR_BLOCK_HOSTS: hellasbet/novibet/stoiximan/bet365).
- _looks_like_junk(): drops tag/index/nav pages (boilerplate "Διαβάστε όλα τα άρθρα...", "❮" breadcrumbs, site-menu dumps, title<5 or desc<25 chars). This removed sportdog.gr player-tag pages.
- freenews_gr now fetches the LATEST general GR feed (size up to 100) and filters to sports — a sports-biased q surfaced mostly tag pages, so filtering beats querying. routes/news.py generic EL feed no longer forces a query.
- Also bumped TheNewsAPI (EN feed) httpx timeout 15->30s; EN feed was intermittently timing out with the 3-term search. Verified EN=12 + EL=12 real football/basketball articles, no general news.
- Files: news_service.py, routes/news.py. Verified via curl (generic + team=Olympiakos) + screenshot.

## 2026-06 — News (EN+GR merge) + pick %/chart alignment
- News: EN mode (/api/news) now returns English sports first (priority) THEN Greek sports articles appended & deduped. EL mode stays Greek-only. Verified EN feed = 22 (12 EN then 10 GR: onsports/sdna/madata).
- Pick %/chart alignment: value_engine confidence + model_prob now derived from pct100(probs)[pick] (same integers as the probability breakdown chart) in BOTH evaluate_match & reevaluate_pick. edge/EV keep the precise float. Fixes "~61% text vs 62% chart" mismatch. Verified 61/61 sum==100 AND pick_text==chart (0 mismatches).
- Files: value_engine.py, routes/news.py.

## 2026-06 — News priority: Greek first (even in EN mode)
- routes/news.py EN feed now returns Greek sports articles FIRST (priority), then English appended & deduped. Toggle default stays EN. Verified: 24 total (12 GR then 12 EN).

## 2026-06 — Live stability + faster cold load (quota resilience)
- ROOT CAUSE of "live matches suddenly disappear": apifootball.live_fixtures cached an EMPTY list for 150s whenever the API call failed (timeout / rate-limit / daily quota 500 reached). One transient error wiped live for 2.5min; quota exhaustion wiped it for the rest of the day.
- Fix (stale-on-error): live_fixtures keeps a long-lived "live_all_last" snapshot; on API failure it serves the last known-good live list (retry in 30s) instead of caching empty. Empty is only cached when the API genuinely returns no live games. Same pattern added to live_values.build_live_matches ("live_matches_last", 12h) so the Matches page never blanks on quota/errors.
- SLOW COLD LOAD fix: build_live_matches now builds all 21 leagues CONCURRENTLY (asyncio.gather + Semaphore(6) rate-limit cap) — cold cache load dropped ~59s -> ~1.5s. Added asyncio.Lock single-flight so startup prewarm + first visitor don't double-build (saved ~12 API calls/cold-start).
- Verified: cold value-matches instant (prewarm+parallel), /api/live 44 (5 major), quota-exhaustion simulation serves stale for both paths, no 429s.
- NOTE: production "backend falls" is most likely Render free/starter spin-down (cold start). These changes make recovery fast + keep data on-screen, but eliminating spin-down needs a keep-alive ping or a paid instance (hosting, not code).
- Files: apifootball.py (live_fixtures), live_values.py.

## 2026-06 — Portfolio: finished tickets now show in My Bets + graph
- BUG: user played a ticket that finished (auto-settled LOST), but the "My Bets" tab showed "Your portfolio is empty" and no performance graph. Root cause: PortfolioPage gated the whole stats+chart view on `bets.length === 0` (single bets only), ignoring settled tickets — even though statsSource/computeStats already include ticket results.
- FIX (frontend only, PortfolioPage.jsx): added `hasActivity = bets.length>0 || ticketResults.length>0`; gate empty-state on `!hasActivity`. Stats cards + Bankroll (cumulative P/L) chart now render from single bets AND settled tickets. Friendlier note when only tickets exist ("stats & graph include your settled tickets; open My Tickets").
- Auto-settlement itself already works: autoSettle() → /api/results (apifootball.fixture_results maps live_af_<id>→outcome) settles pending bets & ticket legs by comparing pick vs real outcome; runs on Portfolio open + app-wide once. That's why the ticket was already LOST.
- Verified via screenshot: ticket-only portfolio now shows Net P/L -€10, ROI -100%, 0W·1L + bankroll chart.

## 2026-06 — Pre-launch Security & Reliability Audit (P0–P4)
P0 Secrets: clean (no hardcoded secrets, .env gitignored+untracked, none in git history).
P1 Security:
- auth.py: ADMIN_EMAILS env allowlist + is_admin() + require_admin dep (401/403).
- server.py: gated /api/admin/refresh, /api/fsl/refresh, /api/debug/apifootball (admin-only); rate-limit middleware 60/min/IP -> 429 (exempts /health + webhook); sanitize middleware (SQLi query tokens -> 400, body >256KB -> 413).
- billing.py: webhook logs warning + proceeds when no secret (dev), enforces sig -> 400 when secret set; checkout returns generic error (no Stripe leak, rule E).
- LiveStatusPill.jsx: refresh button no longer calls admin endpoint (was abuse vector).
- ADMIN_EMAILS in backend/.env = promonthly@moka.test (testing); set real owner email on Render.
P2 Data integrity:
- value_engine.validate_match(match,value): drops/blocks matches unless id/league_id/league_name/home/away/match_date(pre-match)/odds-structure present AND value.match_id==match.id. rank_value_matches drops invalid (logged). matches/{id} -> {status:unavailable,reason:data_mismatch}. value-matches -> {status:unavailable,message:...} on hard failure. MatchAnalysisPage treats unavailable as not-found.
P3 GDPR:
- billing.cancel_user_subscription() best-effort Stripe cancel.
- GET /api/privacy/data-export (auth) returns user+subscription+sessions_count+usage+alerts+portfolio (no tokens).
- POST /api/auth/delete-account (auth) cancels sub then erases user+sessions+analysis_usage+alerts+digest+portfolio+payments+events -> {deleted:true}.
P4 Reliability:
- /health real DB ping: 200 {status:ok,database:ok,cache_entries:N,external_apis:unknown}; 503 {degraded,database:error} on DB failure.
- components/ErrorBoundary.jsx wraps AppRouter -> "Something went wrong. Please refresh the page." + Refresh btn.
All tested (curl + isolated + screenshots). No new deps, no DB migration, no UI redesign.

## 2026-06 — Ticket/Portfolio per-selection (Moka) settlement rework
- computeTicket() rewritten: PER-SELECTION, not all-or-nothing. Ticket stake = stake PER selection; Total Stake = stake×selections; Total Return = Σ(stake×odds) of WON legs; Profit = return − settledStake. Status shown as X/Y (won/total), never "LOST" for one loss. (items #2,#3,#4)
- Legs capture kickoff (addToSlip) so Portfolio dates by MATCH START, not settle time (#8).
- PortfolioPage.ticketResults now emits ONE entry PER settled leg (id `ticketId:legId`, idempotent) → stats + cumulative bankroll graph move per-match (#5,#6,#7). Free tier still limited to latest 5 tickets.
- TicketCard: X/Y progress badge, per-selection legs, Total Stake/Returned/Profit; finished legs show "Settled — locked" (#10). Sizing: tickets-grid items-start + card h-fit + break-words → 1 vs many selections & long names render clean, no stretch/overflow (#1).
- BetSlip: removed misleading multiplied "Total odds"; shows "Stake per selection", Total stake, Potential return (#4).
- Verified (screenshots): Case A 1/1, Case B 5/6 (stake€60/ret€94/profit+€34), Case D math, Case E graph +5→+15→+5 (Net€5, WinRate67%).
- #11 odds preserve: user-edited slip odds freeze into ticket legs; autoSettle only sets status/settledAt, never overwrites odds — already satisfied.
- #12 Greece bookmaker allowlist + #13 odds mapping: already implemented in prior sessions (APPROVED_BOOKMAKERS in apifootball.py) — unchanged.
- #17 keep-alive: added trivial GET /ping (no DB/API/prediction work), rate-limit exempt. Needs EXTERNAL cron (cron-job.org/UptimeRobot) every ~10-14min; a self-ping cannot wake a sleeping Render free instance.
- DEFERRED (not yet done): #14 "IN SLIP" button state sync on Matches/Match Analysis; #15 back-nav filter/search preservation; #16 scroll restoration.
- Files: contexts/PortfolioContext.jsx, pages/PortfolioPage.jsx, backend/server.py (/ping).

## 2026-06 — Slip sync (#14) + Filter memory (#15/#16)
- #14: AddToSlipButton already toggles "In slip"/"Add to slip" from slipHas() (context+localStorage) — synced across Matches/Analysis/refresh/back. Added kickoff capture to its addToSlip call (for Portfolio dating). Verified: button flips on click, stays "In slip" after navigating to match + Back; BET SLIP + Portfolio badges update.
- #15: MatchesPage filters (sport/league/team/date/live) + view now persist in URL query (setParams replace); initialise from URL so Back restores them. Verified URL ?view=all&sport=football&team=a restored after Back.
- #16: scroll position saved to sessionStorage on unmount, restored after load. Best-effort.
- Files: components/AddToSlipButton.jsx, pages/MatchesPage.jsx.

## 2026-06 — Filter memory extended to Teams & Leagues
- TeamsPage: selected league + open team now persist in URL (?league=&team=), read on mount → Back restores exact selection + open team detail. Verified (?league=epl&team=42 restored after nav away+Back).
- LeagueDetailPage: active tab (standings/fixtures/results) persists in URL (?tab=), read on mount → Back restores tab. Verified (?tab=fixtures restored + tab active).
- LeaguesPage: static grouped list, no filters → nothing to persist (left unchanged).
- Files: pages/TeamsPage.jsx, pages/LeagueDetailPage.jsx.

## 2026-06 — LION.STATS rebrand + Portfolio Match History + fixes (tested iter_7, all PASS)
- #1 Branding: sed MOKASTATS->LION.STATS, MokaStats->LION.STATS, \bMoka\b/\bMOKA\b->LION across frontend/src (lowercase moka_ storage keys / mokaProb / api paths untouched). Header wordmark LION.STATS.
- #2 Logo: cropped user's attached lion+crown banner -> /app/frontend/public/lion-logo.png (+lion-banner.png); Header uses <img src=/lion-logo.png>.
- #11 BUG (no-loss-today): inPeriod() returns false for undated records outside 'all'; period dating uses settledAt/kickoff only (dropped placement createdAt fallback); neutral banner data-testid=portfolio-no-settled when Pro period has 0 settled. VERIFIED.
- #3-7 Match History: new MatchHistory table (data-testid=match-history) of INDIVIDUAL settled matches; Result arrow (green up/red down), Match/Pick/Odds/Stake/Profit-Loss; sorted by kickoff desc; FREE=latest 5 + history-free-limit CTA, PRO=full. Shares statsSource with stats+graph (single source of truth, #19).
- #8 My Tickets: full history kept (no free deletion/paywall); latest 4 visible + collapsible History(n) toggle (tickets-history-toggle/grid).
- #12 Basketball: nba/euroleague coming_soon=true in sportsCatalog; LeaguesPage renders COMING SOON badge, non-clickable (league-soon-*).
- #13 Greek bookmakers: added stoiximan, novibet, fonbet, pamestoixima to backend APPROVED_BOOKMAKERS allowlist. NOTE: API-Football (current provider) generally does NOT return Greek-only books (Pamestoixima/Fonbet/Novibet); they'll appear only if the provider actually returns them — not fabricated.
- Already done prior (verified): #10 per-match graph, #14 slip IN SLIP sync, #15/#16 filter+scroll memory, #17 /ping keep-alive, #18 slip state.
- Files: PortfolioPage.jsx, PortfolioContext.jsx (prior), Header.jsx, sportsCatalog.js, LeaguesPage.jsx, apifootball.py, public/lion-logo.png.

## 2026-06 Targeted UI fixes
- Top nav: removed LEAGUES & TEAMS tabs (Header.jsx); still reachable via Sports card links.
- Sports -> Football: removed league-name chip list (league data/functionality untouched).
- Sports -> Basketball: rendered inactive with "COMING SOON".
- News: removed Greek-articles-first prioritisation in backend/src/routes/news.py (default feed order for lang!=el; lang=el feed unchanged).
- Verified: vite build passes, /sports screenshot confirms all four changes.

## 2026-06 Header/Account/News batch
- Header: Account tab removed; Search is now an icon-only magnifier after Pricing; LIVE pill reduced to a blinking dot + LIVE (no timestamp/refresh); nav centered (no overlap with logo), no horizontal scroll.
- UserMenu (round avatar) = "MY ACCOUNT": email, "Pro active until <date>" (or Upgrade to Pro), Account details, My Portfolio, Sign out, Delete account (POST /api/auth/delete-account, existing endpoint).
- News: Greek articles prioritised again (news.py). Fixed freenews_gr: provider country feed is general news, so a Greek sports query ("ποδόσφαιρο" default) is now always sent — previously 0 Greek articles were returned.
- Portfolio data-loss guard: if GET /me/portfolio fails, syncedRef stays false so an empty local state can never overwrite the saved server copy.
- NOTE: tickets lost by the owner were removed during the earlier cross-user contamination cleanup; not recoverable.

## 2026-06 Matches coverage + Compare tab
- Fixed lost matches: MAX_PER_LEAGUE 6 -> 14 and odds dates[:2] -> [:3] in live_values.py (Olympiakos Piraeus vs Jagiellonia now served; UEL 6 -> 14 fixtures).
- Competitions filter on Matches now always lists every football competition from LEAGUE_CATALOG (UCL included even when no priced odds exist).
- Cups added: Taça de Portugal (96), KNVB Beker (90), Scottish Cup (181), DBU Pokalen (121); Greek Cup id corrected 735 -> 199. Added in apifootball.CATALOG, core/entitlements.py, frontend sportsCatalog.js, live_values.LIVE_LEAGUES.
- NEW /compare page + Compare nav tab: Teams or Players mode, league -> team (-> player) pickers per side, stat table, radar/bar/pie charts (recharts) and AI verdict via new POST /api/compare/ai (OpenAI, cached 24h by payload hash).
- Verified by testing agent iteration_9.json: backend 100% (10/10 pytest), frontend 100%, no regressions.

## 2026-06 Match Analysis redesign
- /analysis/:id rebuilt to the layout the user sent: hero card (logos, date/time, league + standings positions, stadium backdrop) | Match Analysis card (LION AI text + translate + 3 KPI tiles: pick % vs market, confidence /10, potential value).
- Best-odds strip (bookmaker cards, best highlighted, view-all toggle) + Add to slip / watchlist / portfolio.
- LION Prediction bars kept; Goal Markets now uses donut pies for Over/Under 2.5 and BTTS + xG tiles.
- New team cards (form badges, W/D/L, win-rate donut, goals scored/conceded bars of last matches, xG, goals/game, clean sheets) and Match History tables — data from GET /api/leagues/{slug} (standings + results), no backend change.
- Live sections, Why LION likes it, Pro advanced-stats gating and all existing data-testids preserved. AI system prompt rebranded Moka -> LION.

## 2026-06 Portfolio + Matches ordering fixes
- Removed the "Your settled matches are listed in Match History…" note; Match History now sits directly under the filter chips, single bet cards moved below it.
- All / Pending / Won / Lost chips now filter the stats, the bankroll graph AND Match History (one viewSource).
- Period chips available to every user + new From/To date pickers (custom range, clear button). Filters by match kickoff.
- Records are dated by KICKOFF: addBet stores `kickoff` (AddToPortfolioButton passes match.commence_time), dateOf() prefers kickoff, timeline sorted by kickoff.
- Matches page: every view (Strong / Worth Watching / All) now sorts by soonest kickoff first.

## 2026-06 European stats blend
- live_values.py: for UCL/UEL/UECL matches, team stats are now blended 70% domestic (all league/cup tables we cover, cached index `domestic_stats_idx`) + 30% competition table (`_blend_stats`, `_domestic_index`, EURO_SLUGS, DOMESTIC_WEIGHT=0.7). Form blended the same way via `formNum` used by `_team_obj`.
- Prevents defaults (1.2/1.1) or tiny 1-3 game European samples from driving xG. Verified: Celtic in UEL now uses 2.33/0.5 (domestic) instead of neutral defaults; Olympiakos blend 0.75/2.0 -> 1.12.
- Prediction/EV model itself unchanged — only the inputs are better sampled.

## 2026-06 Match Analysis polish
- Percentages right-aligned in a column across all charts (Bar + SplitPie legends use grid layout).
- Goal Markets: smaller donuts (78px) so every label fits inside the boxes; Over/Under + BTTS legends always show a green/yellow dot matching the slice colour (fixed colours instead of conditional grey).
- Match History: new backend endpoint GET /api/teams/{id}/recent?last=6 (af.recent_fixtures_for_team -> API-Football /fixtures?team&last, cached 6h) gives the last 6 matches ACROSS ALL competitions with a Comp. column; league-results feed is the fallback when the club id can't be resolved.
- Removed the "Show advanced statistics" block entirely (toggle, Pro lock, upsell modal, StatsTable) from the analysis page.

## 2026-06 odds-api.io merge (unified, de-duplicated odds)
- odds_api_io.py: added canon_book() (Stoiximan / stoiximan / Stoiximan.gr -> same book, domain suffixes stripped, display-name map) and merge_odds(primary, extra) = ONE list per match, a bookmaker/selection never twice; newest timestamp wins, else best valid price; invalid/empty prices dropped; `source` kept per entry ("apifootball" | "odds-api.io").
- live_values._build_one_league now calls oaio.merge_odds(apifootball_odds, greek_odds) instead of the old name-only dedupe. Same response schema -> frontend odds UI untouched.
- Provider requests: bookmakers param now OPTIONAL — if ODDS_API_IO_BOOKMAKERS is empty we request everything the plan allows and keep whatever comes back; /odds/multi with per-event /odds?eventId= fallback; 12h shared cache; whole provider gated behind ODDS_API_IO_KEY (fail-open).
- Unit-verified: same book+selection both sources -> 1 entry; different books -> both; different prices no ts -> best; newer ts -> that price; invalid records dropped; either/both providers down -> existing behaviour. Live /api/value-matches: 110 matches, 0 duplicate bookmakers.
- BLOCKER: real ODDS_API_IO_KEY not provided yet (user pasted docs placeholder). Once set in backend/.env + Render env, call GET /v3/bookmakers to see which books the plan allows.

## 2026-06 Free-trial abuse protection
- New `trial_ledger` table (sqlite + Postgres schema, idempotent): identity_key (sha256 of normalised email — gmail dots/+tags collapsed), provider_id (Emergent/Google subject id), first_trial_at.
- auth.py: `identity_key()`, `trial_already_used()` (365-day cooldown), `record_trial()`. New signups that match the ledger by email hash OR google sub are created as normal FREE users (no trial dates, no pro_until, trial_used=true). Users now also store `provider_id`.
- server.py delete-account: writes the ledger entry (hash only, GDPR-safe) before erasing the account, so delete + re-signup can't grant a second trial.
- /auth/me exposes `trial_used`; TrialBanner shows "Your free trial has already been used" instead of offering a new one.
- Verified: alias normalisation (abuse.test+tag@gmail.com == Abuse.Test@googlemail.com), before/after ledger, match by google sub, clean identities unaffected, ledger idempotent (1 row), existing test-user logins and /auth/me unchanged.

## 2026-06 Leagues page grouping
- LeaguesPage: football leagues grouped under FOOTBALL as "Country Leagues" -> "Europe Competitions" -> "Country Cups" (groupLeagues() with EUROPE/CUPS id sets). Group title hidden when a sport has a single group (Basketball). No data/entitlement logic changed.

## 2026-06 Signed-out entry experience
- HomePage is now a proper entry point: guests see "Sign in with Google" (white Google button) + "Start 7-day free trial" (both Emergent Google flow), with the note "Free account or 7-day Pro trial — no card required" and a small "Just looking? Browse today's matches" guest link. Logged-in users keep Today's matches / Compare (or "Upgrade to Pro" when not pro) / My portfolio.
- Sign out (and delete account) now await logout and redirect to "/" so the user lands on the entry page and can switch accounts; sessions still persist 7 days otherwise.
- Test-user panel intentionally kept (bypass for QA).
- Verified: guest CTAs, free-user CTAs incl. upgrade, and sign-out -> back to sign-in screen.

## 2026-06 Slip persistence + double-chance settlement (bug fixes)
- ROOT CAUSE of "In slip disappears after navigating": backend rate limiter (60 req/min/IP) returned HTTP 429 during normal browsing -> Matches list came back EMPTY, so re-rendered cards lost the state and the fixture could be added again. Fixes: _RL_MAX 60 -> 300 and cached GET endpoints exempt (_RL_SOFT) in server.py; MatchesPage keeps the previous list when a refresh fails.
- Slip dedupe hardened: addToSlip / slipHas / removeFromSlip now match by matchId OR normalised home|away key (ids differ between live and value feeds).
- Double chance: new /app/frontend/src/lib/picks.js (WINNING_OUTCOMES, legWins, isDoubleChance, pickChoices). "Add to slip" on a "Home/Away or Draw" prediction opens a "What did you play?" dialog (1 vs 1X); Add-to-Portfolio modal shows the same choice plus an editable odds field for the double-chance price. autoSettle now uses legWins(), so home_or_draw WINS on a draw (previously counted as a loss).
- Verified by testing agent iteration_10.json: 6/6 scenarios pass, frontend 100%, no console errors. Follow-up done: removeFromSlip aligned to the same dedupe key.

## 2026-09-20 Slip marking on the card + Back-to-matches restores position
- ValueCard: a fixture already in the slip is now visually marked — yellow border + "IN SLIP" badge (data-testid="in-slip-badge-{id}"), driven by slipHas().
- PortfolioContext.slipHas: matchId comparison guarded (`matchId && l.matchId === matchId`) so legs stored without an id no longer mark every card.
- MatchesPage: return URL written while still on the page (sessionStorage "matches_return") — writing it on unmount captured /analysis/{id}, because react-router swaps the URL before passive effect cleanup runs.
- MatchesPage scroll: saved by a throttled scroll listener, not on unmount (at unmount the browser has already clamped scrollY to 0 for the shorter page). Restore re-applies the target every 150ms for up to 3s because the live rows/cards mount late and early scrollTo calls get clamped.
- MatchAnalysisPage: "Back to matches" (data-testid="back-to-matches") links to the stored filtered URL.
- Verified in browser: saved 2600 -> restored 2600 (delta 0), league filter retained after Back, IN SLIP badge persists across navigation, manual scrolling still free afterwards. yarn build OK.

## 2026-09-20 Compare: position-aware player metrics + team-level metrics
- BUG: every player was compared on the same 9 raw totals, so a goalkeeper/defender scored 0 on Goals/Assists/Shots and always "lost"; totals also favoured whoever had more minutes.
- apifootball.player_stats: now also aggregates saves, conceded, duelsTotal and a minutes-weighted passAccuracy.
- apifootball standings (football): teams now carry goalDiff and winPct.
- ComparePage: playerMetricDefs(posKey) picks the metric set per position — GK (Saves/90, Conceded/90, Save %, Pass accuracy, Rating, Minutes), DEF (Tackles/90, Interceptions/90, Duels won %, Fouls/90, Rating, Minutes), MID (Key passes/90, G+A/90, Pass accuracy, Tackles/90, Duels won %, Rating), ATT (Goals/90, Assists/90, Shots on target/90, Conversion %, Duels won %, Rating). Everything per-90 or a share.
- Position mismatch banner (data-testid="compare-position-warning") states which position's metrics are shown (side A's).
- Teams: "Played"/"Position" replaced by Goal difference and Win %.
- Pie panel is now generic ("<first metric> share") instead of hardcoded goals/G+A.
- compare/ai payload includes the chosen metrics and the prompt forbids judging a GK/defender on goals.
- Accent colour: cyan/pink variants were trialled on Side B and REVERTED at user request — Side B stays #FFD60A.
- Verified: teams rows (Man City vs Arsenal: GD 8/4, Win% 100/80), GK vs DEF shows goalkeeper metrics + warning, backend returns saves 14 / conceded 5 / passAccuracy 73 for Donnarumma. yarn build OK.

## 2026-09-20 CRITICAL: new-user login was broken + app gated behind sign-in
- ROOT CAUSE (login): the trial-abuse fix inserted a Python bool into users.trial_used, which on Postgres is a TEXT column -> asyncpg "invalid input for query argument $11: 0 (expected str, got int)" -> /api/auth/session returned 500 for EVERY brand-new email. Existing accounts (e.g. the admin) logged in fine, which is why it looked like "only new emails can't sign in".
- Fix: auth.py writes "1"/"" and reads through new _truthy() helper (handles legacy '0'/'false'). Reproduced and verified with a DB probe: insert user + record_trial + insert session all succeed now (previously raised DataError).
- Gating: App.jsx has RequireAuth — only "/" and "/pricing" are public, every other route redirects a signed-out visitor to "/". Header only shows Pricing to guests (verified: guest nav = ['Pricing'], signed-in nav = all 7). Removed the "Just looking? Browse today's matches" guest link from HomePage.
- Verified: guest deep links /matches /portfolio /compare /account /news all bounce to "/", /pricing stays public, signed-in deep link renders the matches grid, /api/auth/me 401 without token and 200 with a test token.

## 2026-09-21 Email+password sign-in, real gating, explicit trial
- Playbook: integration_expert (JWT email/password) — deliberate deviation: we keep the EXISTING opaque Bearer session_token in `user_sessions` instead of JWT cookies, so /auth/me, admin checks and the frontend interceptor stay untouched. bcrypt for hashing per playbook.
- New: /api/auth/register, /login, /password/forgot, /password/reset, /trial/start. `users.password_hash` + `password_resets` table (both SQLite and PG schemas + additive migration).
- Trial is now EXPLICIT: _create_user(want_trial=...) — a plain sign-up (email or Google) is FREE; the trial is granted only via intent=trial or the new "Start free trial" banner button. Anti-abuse ledger still applies.
- Google account linking: /auth/session looks the email up case-insensitively, so the same email keeps ONE account whether it arrives by password or Google. Emails stored lowercase.
- Brute force: 5 failures per email = 15 min lockout (email-keyed, because the ingress rotates client IPs — an ip+email key never accumulated).
- Reset tokens: secrets.token_urlsafe(32), 1 hour, single use, and ALL sessions of that user are deleted on reset. Email goes out via email_service.send_password_reset (no-op while RESEND_API_KEY is empty — link is logged).
- Frontend: new /signin (sign in + sign up + forgot, Google as secondary "Continue with Google") and /reset pages. Home/UserMenu/TrialBanner/Pricing CTAs point at /signin (intent=trial for the trial CTA, carried through Google via localStorage "lion_signup_intent"). Gated routes now redirect to /signin, so a SHARED deep link (e.g. /matches) forces sign-in instead of opening.
- Verified end-to-end: register->free (status free, is_pro false), register intent=trial->trial, duplicate 409, wrong password 401, 6th attempt 429 with message, short password/bad email 400, trial/start 200 then 409, reset 200 + reuse 400 + old sessions 401 + old password 401 + new password 200, guest deep link -> /signin, signup -> /matches with FREE banner, "Start free trial" -> "7 days left in your Pro trial" + PRO badge.

## 2026-09-24 Password for Google-created accounts + no live ticker for guests
- GAP FOUND: accounts created through Google have no password_hash, and /auth/password/forgot required one — so a Google user could never SET a password. forgot now works for any existing account (it is the "create your first password" path). Login message for such accounts: "No password set for this account yet. Use Continue with Google, or tap Forgot your password? to create one."
- Verified with a simulated Google-only user: password login -> explanatory 401, forgot -> token row created, reset -> 200, login with the new password -> 200. Same single account either way (email is the linking key).
- LiveTicker is rendered only when a user is signed in (Header) — guests no longer see live scores on the landing/sign-in screens.
- REMINDER: reset emails need RESEND_API_KEY on Render. With onboarding@resend.dev, Resend only delivers to the account owner's own address.

## 2026-09-24 Standard sign-in / pricing funnel
- Pricing Free card now has a "Sign in for free" CTA (data-testid="plan-free-cta") for guests, and shows "Your current plan" for signed-in non-Pro users.
- Paid plans for guests: button reads "Sign in & upgrade", stores the package in sessionStorage "moka_pending_checkout" and sends them to /signin. After ANY successful auth (email/password in SignInPage, or Google in AuthCallback) the pending plan resumes -> /pricing auto-calls /billing/checkout. No more "signed in as free, now press Upgrade again".
- Default landing after auth is /matches (was /account).
- Copy: Home CTA and the sign-up screen say "Sign in for free"; header Sign In button uses a neutral LogIn icon (it is no longer Google-only).
- Verified end-to-end in the browser: guest -> Annual -> /signin (pending=pro_yearly) -> sign up -> lands on checkout.stripe.com automatically.

## 2026-09-24 "Create an account" + set password from Account (no email needed)
- User wanted email+password without the forced "tap forgot password" detour. Refused the literal request (accepting any password for an EXISTING email = account takeover for anyone who knows the address). Implemented the standard safe path instead.
- NEW POST /api/auth/password/set (authenticated): being signed in IS the proof of ownership. No password yet -> sets it directly; existing password -> current_password required. /auth/me now returns has_password.
- Frontend: components/PasswordCard.jsx on AccountPage — "Set a password" for Google-created accounts, "Change password" (asks for the current one) afterwards.
- Copy: sign-in screen now reads "Sign in" / "Don't have an account yet? Create an account"; sign-up submit is "Create my free account". Error messages point to the right action instead of "forgot password": register on a Google email -> 409 "...Sign in with Google once, then add a password from your Account page"; password login on a Google-only account -> same guidance.
- Verified (9 backend checks + browser): has_password false->true, login before set -> guidance 401, register duplicate -> 409, set while signed in -> 200, login with new password -> 200, change without/with wrong current -> 401, with correct -> 200, unauthenticated set -> 401, UI label flips SET A PASSWORD -> CHANGE PASSWORD.

## 2026-09-26 NEW FEATURE: Specific Bets (additive, independent engine)
- Entry point: ValueCard now shows "See Analysis" and, underneath, "See Specific Bets" (data-testid see-specific-bets-{id}) -> route /specific-bets/:id (gated). Existing analysis link/route/page untouched; the card is a Link so the new action uses navigate() + stopPropagation.
- NEW backend module /app/backend/specific_bets.py — deterministic Poisson engine, completely separate from the existing value/prediction model. Own cache keys (sb_*), reuses apifootball._get/_c_get/_c_set. No LLM produces any number.
  - lam_home = (home attack at home + away conceded away)/2, lam_away likewise; 9x9 score grid for outcome-derived markets.
  - Core: Goals O/U 0.5-3.5, BTTS, Team Goals, Double Chance, Handicap -1.
  - Game: Cards O/U (team cards per game from /teams/statistics), Corners O/U (last 3 finished fixtures per team via /fixtures/statistics, MEDIUM quality), First Half O/U + FH BTTS (from goals.for.minute distribution).
  - Players Intelligence (both teams): /players?team&season (2 pages, cached 24h) -> per-90 rates scaled to expected minutes; To score, Shots O/U, SOT O/U, To assist, To be carded. Players under 180 minutes are skipped.
  - Data quality: HIGH / MEDIUM / INSUFFICIENT. Fewer than 4 league matches -> {"available": false, reason} and the page shows "Not enough data" instead of inventing a probability.
  - Top opportunity = biggest positive edge; with no market price it picks the strongest selection inside a 45-82% band (so a 99% "Over 0.5" is never the highlight).
- Endpoint GET /api/specific-bets/{match_id} (server.py), cached 30 min. Market implied % comes from de-vigged 1X2 of the odds we ALREADY have (no second odds system); markets without a price show "—" and never a fake number. Falls back to live_values.build_live_matches() because fsl_get_match_detail only knows today's cached list.
- Frontend /app/frontend/src/pages/SpecificBetsPage.jsx: full-width hero (logos, league, kickoff, engine xG, quality dot), Core/Game sections grouped by market with probability bars, LION vs Market vs Best odds, per-team Players Intelligence with "LION's player pick" + "Show all N player markets" toggle.
- Slip: uses the EXISTING addToSlip. One selection per match is preserved (previous duplicate-bug fix), with a note explaining it. Rows without a market price add with odds 0 and the toast tells the user to set their price in the slip.
- Settlement: picks.js gained settleStatus(pick, result) — over/under, BTTS, team goals, handicap and the existing 1X2/DC settle from the final score; cards/corners/first-half/player markets return null and stay PENDING instead of being wrongly marked lost. PortfolioContext.autoSettle now uses it.
- Verified: engine payload on 3 real fixtures (Core 19 rows, Game 17, players 43+42, DC market 69%/61% with edge), 16 settlement unit cases, 41 cards showing the new action, page renders hero+sections+players, Add -> slip leg {pick: over_2.5} + FAB counter + IN SLIP badge on Matches, existing /analysis/:id page still opens.

## 2026-09-26 Match Analysis odds strip: all three outcomes
- The "Best odds" card used to list bookmakers only for the model's outcome. It now renders three labelled groups (home team / Draw / away team), each sorted by price with its own "BEST" badge, so a user can back the draw or the other side.
- The group matching the model gets a green heading + "LION's pick" chip, and its best box carries the lion crest (/lion-crest.png, data-testid="odds-lion-badge") in the top-left corner with a stronger border.
- "View all odds" now expands every group. Add to slip / Watchlist / Portfolio buttons unchanged (still tied to the model's selection). Verified: home/draw/away groups present, exactly 1 crest, pick chip only on the model's group.

## 2026-09-27 Specific Bets v2 — per-selection slip, category panels, new markets
- BUG FIX (slip): ticking one specific bet marked EVERY row as "in slip" and nothing could be removed. Cause: the page used the match-level slipHas(). Now PortfolioContext has slipHasPick(matchId, pick, home, away); addToSlip dedupes on match+PICK (identical pick still cannot be added twice, so the old duplicate fix holds) and removeFromSlip(matchId, home, away, pick) drops just that selection. updateSlipLegOdds also takes an optional pick. Per the user's choice, several specific bets from the SAME match can now sit in the slip together.
- UI: each market is its own panel with an icon (corner flag, cards, fouls triangle, offsides, goalkeeper hand, clock, hash…), a sticky "LION's pick" strip carrying the lion crest, checkbox-style toggles, probability bars and its own scrollbar (max-h-72, .sb-scroll). Team-specific panels (Team Goals, Goalkeeper Saves) are split home | away side by side.
- NEW markets, all from the SAME fixture-statistics fetch that corners already used (zero extra API cost): total + team Fouls, Offsides, Goalkeeper Saves per team. Plus Correct Score (final, top 8 scorelines from the score grid) and Score At Any Time (P(H>=x)*P(A>=y) — a scoreline is reached at some point iff both teams get at least that many goals).
- _best() no longer highlights a pick when nothing sits in the 45-82% band (a 25% handicap is not "LION's pick").
- settleStatus now also settles cs_x_y (correct score) from the final score; fouls/offsides/saves/anytime stay pending.
- Hidden review mode `?demo=1` (not linked anywhere) fills sample prices + market % with a visible "DEMO PRICES" flag, so the layout can be judged with numbers.
- Verified: 13 panels with real data on a Premier League fixture, tick -> only that row checked (slip [over_2.5]), second market of same match added ([over_2.5, btts_yes]), untick removed only that leg ([btts_yes]).

## 2026-09-27 Specific Bets v2.1 — panel height, honest LION pick, per-leg odds editing
- Panels now grow with their content instead of leaving empty space: the max-h-72 scroll cap is applied only when a panel has more than 7 rows (per column for split panels), and both panel grids use `items-start` so a short panel no longer stretches to the height of its taller neighbour.
- LION's pick is now ALWAYS the highest model probability in that panel (`_best` = max lion%, edge only breaks ties). The old 45-82% band hid an 85% selection and highlighted a 50% one, which the user rightly flagged. The same change applies to the player panels' top list.
- Bet Slip (PortfolioPage): legs were keyed by matchId only, so with several selections from one match React duplicated keys and editing/removing one leg hit all of them. Legs are now keyed `${matchId}-${pick}` and both updateSlipLegOdds and removeFromSlip receive the leg's pick, so "Your odds" can be edited per selection to the price actually played.
- Verified in browser (Pro test account, Portfolio > My Tickets): 2 legs from the same match render, editing leg 1 to 2.40 leaves leg 2 at 1.85, removing leg 1 leaves [btts_yes]. `_best` unit check returns the 85% row over a priced 50% row.

## 2026-09-27 Specific bets are independent of the match prediction
- Legs now carry `kind` ("specific" from SpecificBetsPage, "match" otherwise). Match-level slipHas() ignores specific legs, so playing e.g. Over 2.5 no longer makes the match card / Add-to-slip button show "In slip" as if the 1X2 prediction were played. removeFromSlip without a pick also only drops the match-prediction leg.
- A ticket can therefore mix specific bets and See-Analysis picks; each leg keeps its own suggested price, editable in the slip.
- Slip shows a small green "SPECIFIC" tag on those legs.
- Verified in browser: specific leg in slip -> match button still "Add to slip", 0 IN SLIP badges; clicking it gives slip [over_2.5/specific, home/match] and the button then reads "In slip".

## 2026-09-27 Correct Score no longer contradicts the match pick
- Bug: the Correct Score panel highlighted 0-1 while the page called a home win (the raw grid maximum can sit on the other side of the result, and the two engines can disagree).
- build() now takes the match page's model_pick (server.py passes m["value"]["pick"]) and uses it as the `lead` result; without it the engine falls back to its own highest of p_home/p_draw/p_away. The Correct Score LION pick is chosen only among scorelines that satisfy that result, and the panel note says "consistent with LION's call: <team/draw>". panel() gained a `top_from` argument for this.
- Verified on Swansea vs Norwich (model pick = home): DC top "Swansea or Draw" 81%, Correct Score top "1 - 0" 12% (was free to pick 0-1 before), note shows the team name.

## 2026-09-27 One view of the game: Specific Bets calibrated to the match model
- Real root cause of the "1-0 vs away win" contradiction: the two engines started from different expected goals (specific_bets used raw team averages, the analysis model its own pipeline), so alignment could not be cosmetic.
- specific_bets._calibrate(pred) now solves for the (lam_home, lam_away) whose Poisson grid reproduces the match model's own home/draw/away (+ over 2.5) probabilities — coarse 0.1 pass then a 0.02 refinement, pure arithmetic, no extra API call, ~0.02-0.09s and cached with the payload. server.py passes value.prediction (falls back to value.probabilities).
- Every grid-derived market (O/U, BTTS, team goals, double chance, handicap, correct score, score-at-any-time, first half) therefore shares one set of expected goals with the match page. Without model probabilities the engine falls back to team averages; payload exposes model.basis ("calibrated to LION's match model" | "team averages").
- Verified on fixture 1563187: pred away 25/22/53 -> xG 1.14-1.78, correct score top 1-2, handicap Norwich -1; pred home 58/24/18 -> xG 1.82-0.92, correct score top 1-0, DC "Swansea or Draw" 81%. Calibration recovered the model's own xG (1.44/1.61 -> 1.44/1.62) on a control case.

## 2026-09-27 Live matches now appear in every Matches view
- Why they were missing: once a fixture kicks off the bookmakers pull their pre-match 1X2 prices, and live_values skips any fixture without odds ("never show empty odds"), so an in-play match dropped out of the value lists. The Live chip counts a different source (/fixtures?live=all), hence "Live (10)" with none of them in Strong / Worth Watching / All Matches — the "Live now" block was only rendered when view === "all".
- Fix (MatchesPage.jsx): the "Live now" section renders in every non-live view, and the main grid now uses `upcoming` = filtered minus the ids already shown live, so a match never appears twice. Free-tier 3-card limit and the empty state were re-pointed at `upcoming`.
- Note: could not be verified visually — no SUPPORTED league was in play at the time (chip showed "Live" with no count); logic verified by code path + build.

## 2026-09-30 Specific Bets: bet redirect without touching the layout
- No new column: OddsCell turns the price itself into the bookmaker link (tiny ExternalLink glyph, green on hover), and the LION'S PICK strip gained a green "BET <price>" pill in the empty space on its right.
- Links use the existing approved-bookmaker allowlist (lib/bookmakers.bookmakerUrl); unapproved providers or missing prices stay plain text / "—". Clicks stopPropagation so they never toggle the slip checkbox.
- Demo preview prices now use "bet365" so the pill is visible in ?demo=1 review mode.
- Verified on live_af_1563187?demo=1: 28 panels, 15 BET pills, 88 clickable prices, layout unchanged.

## 2026-10-04 Nations Tournaments (national teams)
- 17 national competitions added to apifootball.CATALOG, core/entitlements.LEAGUE_CATALOG, frontend sportsCatalog (group "Nations Tournaments") and live_values.LIVE_LEAGUES: World Cup(1), UEFA Nations League(5), Euro(4), Euro Qual(960), WC Qualification Europe(32)/South America(34)/Asia(30)/Africa(29)/CONCACAF(31)/Oceania(33)/Play-offs(37), Copa América(9), AFCON(6)+Qual(36), Asian Cup(7), Gold Cup(22), CONCACAF Nations League(536). Friendlies deliberately excluded (no table, rotating squads) — they stay live-score only.
- Per-competition `season` override (tournament year != club season) via apifootball.season_for(slug), used by standings, fixtures-by-season and odds-by-date. `national`/`neutral` flags drive model behaviour.
- teams_for_league now merges EVERY standings group instead of standings[0] — qualifying groups and group-stage tournaments were previously 1/12 visible (World Cup now returns 60 teams). Also fixes grouped cups.
- Thin national samples are topped up with the team's last 12 matches ACROSS seasons/competitions (live_values._nation_stats, specific_bets._nation_topup, both via the cached af.recent_fixtures_for_team). Greece: 3 group games -> 12-match sample.
- specific_bets: national fixtures use overall goal averages (no home/away split), +8%/-6% home tilt only for non-neutral competitions, quality capped at MEDIUM, and PLAYER PANELS ARE DISABLED (club per-90 numbers do not transfer to a national squad and the line-up is unknown). Payload exposes `national`; the page shows "player markets open once the line-up is confirmed".
- Idle tournaments cache their empty fixtures list for 6h (was 5 min) so out-of-window competitions cost ~4 calls/day each instead of 288.
- LeaguesPage: new "Nations Tournaments" section, and the per-league counter now reads the REAL value feed (/value-matches) instead of the mock /matches list which made every league show "2 value matches".
- Verified: 25 nations value matches in the feed (Ireland-Israel HIGH, Ukraine-Hungary MEDIUM...), Leagues page shows the group with live counts (UEFA NL 13, CONCACAF NL 11), Specific Bets on Greece-Germany = 26 panels / 0 player blocks / MEDIUM / 12 matches sampled, /api/teams?league=nationsleague returns national teams and /api/teams/1117/players returns the Greek squad.
- 2026-10-04 (follow-up): neutral ground applies ONLY to finals tournaments (worldcup, euro, copaamerica, afcon, asiancup, goldcup, wcq_playoffs). Nations League, all WC/Euro/AFCON qualifiers and CONCACAF NL are home-and-away: they now use the team's own home/away goal split when it has >=3 such games, else a modest 1.08/0.94 tilt. Note this only drives the fallback xG — when the match model's probabilities exist, _calibrate() overrides them.
- 2026-10-04 Opponent strength for national teams: apifootball.nations_strength_index() builds a name -> goals-for/against-per-game map from the standings of all 17 national competitions (already cached, so ~0 extra calls, 12h TTL) plus the global averages. apifootball.nation_form(team_id, name) then weights each of the last 12 matches by opponent quality (scoring discounted against a leaky defence, conceding against a weak attack, factors clamped to 0.6-1.6), by recency (0.92^k) and halves friendlies. live_values._nation_stats and specific_bets._nation_topup both delegate to it (duplicate code removed). Club leagues are untouched — there every team faces the same schedule, so the correction would be noise.
- Verified: Greece 1.0/1.5 raw -> 1.64/1.08 weighted, Germany 2.94/0.88, Andorra 1.26/2.44; 13 Nations League matches built with the new rates; Specific Bets on Greece-Germany still MEDIUM with a 12-match sample.

## 2026-10-07 Stoiximan odds (RapidAPI free tier, 200 req/MONTH)
- New backend/stoiximan.py: fetches the RapidAPI snapshot file `site_pregame_stoiximan_soccer_leagues.json` (the top-leagues file — the plain `_soccer.json` only had 73 minor-league events, the leagues file has 240 across UCL/UEL/UECL, England x4, Spain, France, Portugal, Netherlands, GREECE, Germany, Italy, Türkiye). Parses the MRES (Match Result) market into the odds_api_io index shape.
- Quota design for 200/month: single shared fetch, 12h TTL (~62 calls/month), payload mirrored to /tmp/stoiximan_odds.json so a process restart does NOT spend a request, hard monthly ceiling STOIXIMAN_MAX_MONTHLY=150, stale data served on any 429/error/empty payload, never called per user request.
- live_values merges it through the existing oaio.merge_odds/lookup path (same shape as odds-api.io), so no new frontend odds system: `merge_odds(apifootball, greek_idx + stox_idx)`.
- frontend lib/bookmakers.js: "stoiximan" added to the approved redirect allowlist.
- env: STOIXIMAN_RAPIDAPI_KEY / STOIXIMAN_RAPIDAPI_HOST / STOIXIMAN_FILE / STOIXIMAN_MAX_MONTHLY in backend/.env. KEY WAS PASTED IN CHAT BY THE USER — advise rotation.
- Verified: 239 matches priced from one call; second call served from cache with no quota spend; value feed went from 112 -> 169 matches (Stoiximan prices unlock fixtures that had no odds before) with Stoiximan present on 147 of them; Matches page renders 169 cards, 93 Stoiximan mentions.

## 2026-10-07 Specific bets now settle automatically after FT
- Bug: cards/corners/fouls/offsides/saves/first-half/anytime-score/player picks had no settlement rule, so they stayed "pending" forever once the match finished.
- Backend: apifootball.fixture_settlement_detail(fid) returns stat totals (corners, cards=yellow+red, fouls incl. per team, offsides, GK saves per team), the running goal sequence from /fixtures/events (own goals credited to the other side) and per-player goals/assists/shots/SOT/cards from /fixtures/players. Three calls, cached 7 DAYS, fetched only for a fixture the user actually holds such a bet on. fixture_results also returns ht_home/ht_away (free, same response).
- GET /api/results gained `detail=<subset of ids>`; PortfolioContext.autoSettle sends only the ids whose pending picks match picks.needsDetail(), so ordinary 1X2/O/U tickets cost zero extra calls.
- picks.settleStatus extended: over/under on cards|corners|fouls|offsides, home/away fouls+saves, first-half O/U and FH BTTS (from the half-time score), anytime score (lost immediately when the final score makes it impossible, otherwise checked against the real goal sequence), player score/assist/card and player shots/SOT lines. A detail-needing pick still returns null (stays pending) when the stats are unavailable — never falsely settled.
- Verified against the real Brighton 3-0 Arsenal fixture (HT 2-0, 11 corners, 24 fouls, 5 cards, 2 offsides, saves 2/2, goal seq 1-0/2-0/3-0): 33/33 settlement cases correct, including the "no stats -> stays pending" guard.

## 2026-10-07 Greek bookmaker feeds generalised (rapid_books.py)
- stoiximan.py replaced by backend/rapid_books.py: a multi-provider loader for the RapidAPI "<book>-odds" snapshot feeds. Each provider has its OWN 200/month plan, so each gets its own usage counter, 12h TTL, /tmp/rapid_books/<slug>.json disk mirror (restart does not spend a call), MAX_MONTHLY ceiling and stale-on-error.
- Providers live: stoiximan (site_pregame_stoiximan_soccer_leagues.json), novibet, bwin (bwin-odds1), pamestoixima (allwyn-odds / opapstore file), elabet. Each needed its own parser — the five JSON shapes have nothing in common (Stoiximan blocks->events->markets MRES; Novibet betViews->items->markets SOCCER_MATCH_RESULT with additionalCaptions for names; bwin fixtures->optionMarkets "Match Result" with sourceName 1/X/2; OPAP events->markets groupCode MATCH_RESULT->outcomes->prices[].decimal with "A v B" name split; Elabet normalised events/markets/odds/competitors joined by id).
- DELIBERATELY EXCLUDED: Superbet (its snapshot is ~476 MB per fetch) and Fonbet (opaque versioned packet, not an odds list). Documented in the module.
- Bug caught during integration: bwin's home and away options BOTH carry optionTypes ["Max"], so type-based detection returned only 2 of 3 prices and every bwin row was dropped (0 matched). Fixed by trusting sourceName 1/X/2.
- Second bug caught: a single merged index made the fuzzy team-name lookup resolve a fixture to whichever provider matched first and silently drop the others (Stoiximan fell from 147 to 80 matches). live_values now runs oaio.lookup once PER provider index via rapid_books.provider_indexes().
- env (backend): RAPIDAPI_ODDS_KEY (one RapidAPI account key covers all subscribed APIs), RAPID_BOOKS=stoiximan,novibet,bwin,pamestoixima,elabet, RAPID_BOOKS_MAX_MONTHLY=150. Old STOIXIMAN_* vars removed (key name still accepted as fallback).
- odds_api_io._BOOK_DISPLAY: "pamestoixima" -> "Pame Stoixima", added "elabet". frontend bookmakers.js: novibet / pamestoixima / elabet added to the approved redirect allowlist.
- Verified: one call per provider (5 total today) -> Stoiximan 239, Novibet 1247, bwin 296, Pame Stoixima 500, Elabet 1478 priced fixtures; value feed shows Stoiximan 128, Elabet 107, Novibet 87, Pame Stoixima 44 and 104 matches carry 2+ Greek books; best-odds badges on the Matches page now show Novibet/Pame Stoixima.

## 2026-10-07 Branding + opportunity score alignment
- "Moka" leaked into the AI analysis because the model was fed keys named moka_pick / moka_probabilities_pct and echoed them. Renamed to lion_pick / lion_probabilities_pct, prompt now says to call the model LION (or LION.STATS) only, and ai_analysis._brand() scrubs any standalone "moka" from both fresh and previously CACHED analyses at serve time.
- Bug: Match Analysis showed "Confidence X/10" = model probability/10, so a Strong Opportunity could read 4/10. New value_engine.opportunity_score(level, edge) maps the badge to a band that can never contradict it: HIGH -> 7-10, MEDIUM -> 4-6, LOW -> 1-3 (edge decides the position inside the band). Exposed as value.opportunity_score, adapted to valueEngine.opportunityScore, and the hero tile is now labelled "Opportunity N/10" (data-testid="opportunity-score").
- Prompt also constrains the wording to opportunity_level: only HIGH may be called a strong/clear opportunity, MEDIUM is "worth watching", LOW is not an opportunity.
- Verified: 0 band violations across the whole live feed (HIGH samples 10/10 at +38.5/+26.8 edge, MEDIUM 5-6 at +5.7..+7.0); a freshly generated analysis (Sunderland-Brighton) quoted exactly 1.2/2.0, 3.2/1.0, xG 2.76 vs 1.28, 68% vs market 42% at 2.4, called HIGH a clear opportunity, and contained no "Moka".

## 2026-10-07 Specific Bets now carry real bookmaker prices
- Bug: every Specific Bets row showed "—" because build() only ever received the 1X2 odds (used for Double Chance). The same cached Greek-book snapshots already contain Over/Under, BTTS, corners etc., so NO extra API call was needed.
- rapid_books: every parser now also emits a second index `picks` = {fixture key: {pick_id: {odds, bookmaker}}}, built by a shared _pick_id() that maps a provider's market+selection names to our pick ids (goals over/under, corners, cards, first-half, BTTS). Best price across providers wins. New rapid_books.pick_prices(home, away) with exact-then-contains team matching; the disk cache stores `picks` alongside `idx`.
- specific_bets.build(..., pick_odds): prices each row, and de-vigs opposite lines against each other (over vs under, btts yes vs no) so MARKET % is the bookmaker's true view; a lone price falls back to raw implied. edge/value recomputed. Panel/category "top" entries are references to the same row dicts, so the highlighted LION's pick gets priced too.
- server: passes pick_prices into build; a failed payload is now cached for 60s instead of 30min (an API-Football 429 was being served as "Fixture data unavailable" for half an hour).
- Verified on Sunderland-Brighton: market_odds_available true, Goals O/U priced from Pame Stoixima (Over 0.5 @1.03 -> market 91% vs LION 98%, Over 2.5 @1.77 -> 53% vs 72%, +19 edge) and BTTS from Novibet (Yes @1.63 -> 57% vs 65%); UI shows 10 clickable prices and the green BET pills.
- Note: these snapshots do not include corner/card/foul lines for most fixtures, so those panels still show "—" where the books do not price them. Novibet's O/U line sits in an instance caption we do not parse yet (its BTTS is captured).

## 2026-10-07 LION TICKETS (new tab)
- New page /lion-tickets + header nav tab (data-testid nav-lion-tickets), backend GET /api/lion-tickets, module backend/lion_tickets.py.
- ZERO new API calls: probabilities are derived with the same Poisson maths from the match model's own expected goals (already in value.prediction), prices come from the cached Greek-book snapshots (rapid_books.pick_prices + best 1X2 from the match's merged odds list). Result cached 15 min.
- A leg qualifies only if prob >= 58%, odds >= 1.12 AND edge >= +1 (our model must beat the book's own price). Legs are grouped (result / goals / btts / team goals) and only ONE leg per group is taken, so nested markets (Over 0.5 + Over 1.5) are never stacked. A ticket needs >= 2 legs or it is not shown.
- Sorted nearest kick-off day first, then the richer ticket (more legs, higher total odds) first — exactly what the user asked.
- Panels: LION crest + league + kickoff, both team logos, each leg with prob / market % / edge chip / clickable price (approved-bookmaker redirect), the model's most likely leg highlighted with the crest, big TOTAL ODDS and "~X% model chance". Honest yellow note that same-match combos are priced via a bet builder so the bookmaker's total can differ from straight multiplication.
- Add to slip pushes every leg with kind="ticket" and locked=true. PortfolioContext stores `locked`; the Bet Slip renders those legs read-only (label "LOCKED", amber value, no editing) with a "LION TICKET" tag, so the ticket reaches Portfolio exactly as played with each leg's own price and bookmaker.
- Verified: 12 tickets live (2-3 legs, totals 2.77-6.92; e.g. Sunderland-Brighton = Brighton @2.40 +26.3 / Over 2.5 @1.77 +20.5 / BTTS @1.63 +6.7 = 6.92 @ ~36%), nearest-day-first ordering, Add to slip wrote all 3 legs locked, button flipped to "IN SLIP", and Playwright could NOT edit the locked odds input (element not editable) — the lock works.
- Leg counts are capped by what the books actually price (no corner/card/player lines in these feeds), so 2-3 legs today rather than 7-8.

## 2026-10-07 Three-outcome chooser + in-slip flag verification
- Bug fixed: adding to slip straight from a match card when the model predicts a double chance offered only 2 options (straight win / double chance). picks.pickChoices() now returns THREE — <Team> to win (1|2), Draw (X), <Team> or Draw (1X|X2) — each with an `outcome` key.
- New picks.bestOddsByOutcome(match): best published price per outcome from the match's merged odds plus the implied double-chance price 1/(1/a + 1/b). AddToSlipButton prices the CHOSEN scenario (not the model's pick) and shows that price beside each option, so the leg lands in the slip pre-populated; the toast still tells the user the DC price is implied and editable.
- lion_tickets.build_tickets() additionally drops any ticket whose kickoff is already past, so a ticket disappears the moment a match goes live even if the cached feed lags.
- testing_agent iteration_11: ALL 7 scenarios PASS, zero backend/frontend issues (6/6 pytest in /app/backend/tests/test_lion_tickets.py). Verified: 3-option dialog with prices (Kifisia 2.92 / Draw 3.25 / Kifisia or Draw 1.54), Draw adds pick='draw' at 3.25, in-slip flags persist across navigation on the matches card, Specific Bets rows, Match Analysis and LION Tickets, every /api/lion-tickets ticket has kickoff>now + >=2 legs + totalOdds == product(odds), and Portfolio shows LION TICKET legs as LOCKED read-only.
- Follow-up polish from the report: the Draw option label is now just "Draw" (was "Draw (A vs B)").

## 2026-10-07 LION Tickets: total odds made explicit (user doubts, both unfounded)
- User asked if the 3-pick size is hardcoded and if "Total odds" is a SUM. Verified by testing_agent iteration_12: legCount distribution across 14 live tickets = {2 legs: 10, 3 legs: 4} (not fixed), and totalOdds equals the PRODUCT of the legs within 0.02 on every ticket, clearly different from the sum. 5/5 pytest + 5/5 UI cards, zero issues.
- Only change: the card footer now reads "Total odds (N picks combined)" and prints the multiplication, e.g. "2.40 × 1.77 × 1.63 · ~36% model chance" (data-testid lt-maths-<matchId>), so the maths is self-evident.
- Why 3 is today's ceiling: one leg per market group (result/goals/btts/team_home/team_away) prevents stacking nested markets, and the Greek-book snapshots only publish prices for the first three groups (no team-to-score, corners, cards or player lines). More legs require the stats-based Specific Bets engine per fixture (~10 API calls/match, cached 24h) — NOT built, offered to the user.

## 2026-10-08 LION Tickets: cross-bookmaker maths corrected (user was right)
- The user spotted a real flaw: the legs sit at DIFFERENT bookmakers (1X2 at William Hill, O/U at Novibet, BTTS at bwin), so a parlay is impossible and the product was an unachievable number.
- lion_tickets now returns `singlesReturn` = sum of the legs' best prices, `singlesMultiple` = singlesReturn/legCount, and `parlay` = {bookmaker, odds} computed ONLY from a bookmaker that prices EVERY leg (product of that one book's prices), else null. `totalOdds` removed entirely.
- To make that possible, rapid_books._extra/pick_prices and lion_tickets._best_1x2 now keep a per-bookmaker price map (`books`) instead of just the best price (legs strip it before serialisation).
- Also fixed Novibet Over/Under parsing: the line lives in the selection's `caption` ("Over 2.5"), not `instanceCaption` ("2.5"). That one-line fix unlocked over/under, corners AND first-half prices from Novibet (1213 fixtures) — and because Novibet prices 1X2 + O/U + BTTS, all 18 live tickets now also carry a REAL same-book parlay price.
- UI: headline is now "Played as N singles · best price each" with the sum, "back for N.00 staked (×avg)", the addition printed (lt-maths-<id>, joined by " + ") and an amber "Or as one parlay at <book>: X" line (lt-parlay-<id>). Header note explains the picks sit at different bookmakers.
- testing_agent iteration_13: 18 tickets, backend 8/8, frontend 6/6 cards + slip + portfolio, zero issues. Confirmed Portfolio computes potential return as Σ(stake×odds) (singles), legs stay locked/read-only with their own bookmaker, and no cross-bookmaker product is exposed anywhere. Stale iter12 test file (asserted the removed totalOdds) deleted per the report's action item.

## 2026-10-08 LION Tickets: 4th scenario unlocked (first-half goals)
- User asked why tickets only ever show 3 picks. Diagnosed: one leg per market group (_GROUP_ORDER) and the Greek-book snapshots only priced result/goals/btts. team_home/team_away ("X to score") are never published by any parsed provider -> 0 legs.
- Pick-id audit across the cached snapshots (no API calls): over/under 2.5 x2744, btts x1742, fh_over_1.5 x988, fh_over_0.5 x486, corners_over_9.5 x300.
- Added an `fh` group to lion_tickets._candidates (first-half goals, lam_fh = 0.45 x lam_total, lines 0.5/1.5) and to _GROUP_ORDER -> ceiling is now 4 legs. Verified live: legCount {2:7, 3:7, 4:1}, groups goals 14 / btts 12 / result 9 / fh 4; 4-leg sample Union Berlin vs SV Elversberg = 2.90 + 2.25 + 1.47 + 2.25 = 8.87 singles return, Novibet parlay 21.21. Screenshot confirms "Over 1.5 goals in 1st half" rows render.
- Corners NOT added: lion_tickets has no corner expectancy, it would need the Specific Bets stats fetch (~10 API calls/fixture) — deferred for quota.

## 2026-10-08 LION Tickets: engine now scans every priced market family (max 6 legs)
- User: "we don't want a standard 3 or 4, we want it to check ALL the special categories and decide what has good odds and high probability". Audit of the five raw RapidAPI feeds (tools/audit_markets.py, 1 request per provider) showed the real cause: 60% of the priced markets never reached the scanner because _pick_id dropped them.
- Feed reality: double chance (Novibet 394 / bwin 393 / Pame 69 / Elabet 54), half-time 1X2 (Novibet 374 / Pame 64), first team to score (bwin 393), 1st-half corners (Novibet 162), asian handicap (Pame 379), draw no bet (Pame 64 / Elabet 42). CARDS: only Novibet, 29 fixtures, and as booking POINTS (yellow=10, red=25) not card counts -> unusable as a leg. CORRECT SCORE: priced by NOBODY (Stoiximan's feed is 1X2-only, 240 matches).
- Parser: _pick_id now maps double chance (_dc_id handles "1X"/"X2"/"12" and "<Team> or Draw" phrasings), half-time result and first team to score (_side_id); _extra + all five parsers pass the team names; _NOVI_MKT gained SOCCER_DOUBLE_CHANCE + SOCCER_FIRST_HALF_RESULT and 1X2-shaped Novibet markets read betItem["code"]. Unlocked: home_or_draw 3143, away_or_draw 3094, home_or_away 2877, ht_* ~1900 each, fts_* ~400 each.
- Engine: _candidates gained the `ht` family (grid on lh*0.45/la*0.45) and `fts` (lh/lam_t*(1-e^-lam_t), plus fts_none); MAX_LEGS=6 with the strongest legs kept by (edge, prob) and one leg per family unchanged. Quality gates unchanged: prob>=58, odds>=1.12, edge>=1.0.
- Settlement (picks.js): ht_(home|draw|away) from the half-time score; fts_(home|away|none) from the final score, falling back to detail.goal_seq[0] only when both teams scored. needsDetail now includes fts. Corners/cards already settled from API-Football /fixtures/statistics (cached 7d, fetched only for fixtures with a pending bet).
- Result: 15 -> 26 live tickets, legCount {2:16, 3:6, 4:4}. ht_* legitimately never appears: a half-time result seldom clears 58% probability. User choices honoured: max 6 legs, no corners for now, "correct score" clarified as the match result (already the `result` family).
- testing_agent iteration_14: backend 29/29 (21 new + 8 iter13 regression), frontend 100%, zero issues. New regression: tests/test_lion_tickets_scan_iter14.py. Also applied its two review notes: edge is now derived from the published rounded odds so prob - 100/odds reconciles exactly, and t.anchor?.pick is guarded.

## 2026-10-08 Odds quota made restart-proof + QA test users removed
### Quota (user: "is there a risk we run out of the 200 calls/month? have we planned what the system does?")
- Real risk found: the monthly counter lived in a module-level dict and the snapshots in /tmp, so EVERY restart/redeploy reset the count to 0 AND lost the cache -> the next request re-fetched all five providers. The MAX_MONTHLY=150 ceiling could never actually bite.
- Fix: new `odds_cache` table (slug, data, fetched_at, month, calls) in both the SQLite and PG schemas. rapid_books now reads mem -> disk -> DB -> network, mirrors a disk-only snapshot into the DB, and persists the per-month call count there. A redeploy now costs ZERO requests, and the ceiling survives restarts.
- Budget: 12h TTL = 2 calls/day/provider = ~62/month against each provider's own 200 free plan, ceiling 150. When the ceiling is hit the system keeps serving the last snapshot indefinitely and the UI shows "—" where it has no price; nothing 500s.
- New `GET /api/admin/odds-quota` (admin only) reports callsThisMonth / ceiling / left / cachedMatches / cachedAt / servingStale per provider, so the budget is visible in-product instead of only on the RapidAPI dashboard.
### Where cards & corners DATA comes from (not odds)
- Predictions: API-Football. Corners/fouls/offsides/GK saves from `/fixtures` (last 3 FT) + `/fixtures/statistics` per fixture, 4 calls per team, cached 24h (specific_bets._fixture_stats). Cards from `/teams/statistics` season totals -> cards_per_game (specific_bets._stats).
- Settlement: `/fixtures/statistics` for the finished fixture -> totals.corners / totals.cards (yellow+red) / fouls / offsides / saves, 3 calls, cached 7 days, fetched ONLY for a fixture someone has a pending bet on (apifootball.fixture_settlement_detail). No third-party source needed.
- Bookmaker PRICES are the only gap: corners are priced (Novibet/Pame, ~300 fixtures), cards effectively are not (Novibet only, 29 fixtures, and as booking POINTS).
### Test users removed entirely (user request)
- Deleted: `DevLoginPanel.jsx` (the floating "Test users" button) + its App.jsx mount, `seed_test_users.py`, `tests/test_dev_login_tokens.py`, and the `tok.startswith("test-")` exemption in auth logout.
- Purged from the DB with the new `backend/tools/purge_test_users.py` (4 sessions + 4 users deleted; idempotent, MUST be run once on production too).
- Tests no longer carry a static token: `tests/qa_auth.py` registers one throwaway account per machine through the public /api/auth/register and caches it in /tmp. Updated test_lion_tickets_scan_iter14, test_lion_tickets_singles_iter13, test_review_iter9, test_moka_regression.
- Also repaired 4 stale assertions unrelated to this change (leagues catalog is 44 not 13 since Nations Tournaments; /api/teams needs a ?league by design; the m_* mock team ids are gone; the Olympiacos-Jagiellonia fixture has been played). Full suite: **70 passed**.
- ACTION FOR THE OWNER: `ADMIN_EMAILS` in backend/.env is now `qa.owner@lionstats.app` (a real registered account). Set it to the owner's real email on production.

## 2026-10-09 Specific Bets: every priced line is now shown + quota headroom answered
### "why do so many Specific Bets rows have no odds?"
- Measured coverage on a real fixture: 11 priced rows out of 80. Breakdown of WHY, per category:
  - Priced by the feeds, and now shown: goals O/U (lines 0.5-8.5 depending on fixture), BTTS, double chance (unlocked yesterday), corners (5.5-15.5), 1st-half goals.
  - NOT in any of the five feeds, so they can never show a price: team goals (home/away to score), correct score, score-at-any-time, fouls, offsides, goalkeeper saves. Cards exist only at Novibet, in 29 fixtures, and as booking POINTS.
  - Asian handicap IS priced (Pame 379 / Elabet 53) but our Handicap panel emits European `home_hcp_-1`, which does not line up with the feeds' -0.5/-1.5 lines -> still unpriced. Backlog item.
- The real bug found: the panels generated a FIXED line set (goals 0.5-3.5, corners 8.5-11.5, 1st half 0.5-1.5) while the books price more (over_4.5 x451, over_5.5 x263, over_6.5 x74, corners 5.5/6.5/7.5 and 12.5-15.5). Those prices were being thrown away.
- Fix: new `specific_bets._lines(default, priced, pattern)` unions our model lines with every line priced for THAT fixture, applied to goals, team goals, corners and 1st-half goals. Verified on Sunderland-Brighton: goals panel went from 8 rows / 2 priced to **12 rows / 12 priced** (Over 4.5 @5.25, Over 5.5 @9.75, Pame Stoixima). Screenshot confirms the new rows render with their prices.
### "can we go live on the free plan, even with 100 users?"
- Bookmaker odds: YES, and the user count is irrelevant. The snapshot cache is global (one fetch serves every user), so the cost is fixed at 2 calls/day/provider = ~62/month against each provider's own 200 free plan. 100 users or 10,000 - same 62.
- API-Football: `/status` reports plan **Pro, 7500 requests/day**, 1243 used today. Per-user cost is also near zero because everything is cached server-side (team stats 24h, Specific Bets output 30min, settlement detail 7 days); cost scales with DISTINCT fixtures opened, not users. Worst case - every one of the ~170 catalogue fixtures gets its Specific Bets built in one day - is ~11 calls x 170 = ~1,900/day, well inside 7,500.
- `/api/admin/odds-quota` now also reports the API-Football plan, daily limit and today's usage.
### Test suite
- Fixed a wrong assertion in test_parlay_bounds (both iter13 + iter14): it required the one-book parlay to be >= the best single leg price, but the parlay multiplies THAT book's own prices, which are usually worse than best-of-market (real case: Real Madrid-Villarreal, Novibet parlay 2.06 vs best single 2.29 - correct, 1.37 x 1.50). Only the product of best prices is a valid ceiling.
- Full suite: **70 passed**.

## 2026-10-09 Asian handicap: parsed, priced and settleable
- Audited the raw feeds first (2 requests) because the sign convention cannot be guessed: Pame Stoixima sends `groupCode: ASIAN_HANDICAP`, market name "Asian Handicap -0.5", and each outcome carries ITS OWN signed line in `prices[0].handicapLow` (home "+0.5" / away "-0.5"); `handicapValue` is only a display index. Elabet sends market "Handicap" with the line inside the selection name: "Hungary (W) (+2.5)" / "Netherlands (W) (-2.5)".
- rapid_books._pick_id now maps handicaps to `{side}_hcp_{line}` and **only half lines**: a quarter line (±0.25/±0.75) splits the stake and a whole line can push, and `settleStatus` (diff + line > 0) can settle neither. Quarter-line markets are caught by comparing the market name's own number against the outcome's line, which is why "Asian Handicap 0.75" (outcomes show ±0.5) is rejected.
- _p_opap now forwards `prices[0].handicapLow` instead of `handicapValue`.
- Fixed a related normalisation bug: `_dc_id`/`_side_id` compared a raw selection string against a `_norm`-ed team name, so any team with punctuation failed to match ("FC Rapperswil-Jona", "Hungary (W)"). Both sides are now normalised. Side effect: double chance coverage rose from 3,143 to 4,114 fixtures.
- Result: **1,527 fixtures now carry a handicap price** (home_hcp_-0.5 x862, +0.5 x446, -1.5 x199, ±2.5/±3.5 in the tail). specific_bets replaced the old unpriceable integer `home_hcp_-1` rows with half lines ±0.5/±1.5 (plus any priced line via `_lines`), probabilities straight off the score grid (`diff + line > 0`). Verified Sunderland-Brighton: 4/8 handicap rows priced, probabilities internally consistent (home -0.5 = 17%, home +0.5 = 35%, away -0.5 = 65% -> draw 18%).
- UI: split panels already show the team as the column header, so rows now render a `short` label ("-0.5") instead of truncating "Sunderland -1.5" to "Sunde...". The slip and toast keep the full name. Verified by ticking home_hcp_-0.5: slip = ['home_hcp_-0.5'], bet slip total 2.82.
- New regression: tests/test_handicap_mapping.py (sign convention + quarter/whole-line rejection + punctuated names). Full suite **75 passed**.
- Also raised `API_FOOTBALL_MAX_CALLS` from 500 to 5000 (env-overridable): that internal cap RAISES when hit, and the realistic worst case (every catalogue fixture building its Specific Bets in one day) is ~1,900 calls, so 500 would have broken the app mid-day under real traffic. Still well under the Pro 7,500/day, and it now logs a warning at 80%.

## 2026-10-09 Verified: cards/corners specific bets DO settle (user asked why old ones never did)
- Proved end-to-end on a real finished fixture (Cruzeiro 2-0 Sao Paulo, fixture 1492393): `/api/results?ids=...&detail=...` returns totals {corners 16, corners_home 8, corners_away 8, cards 3, fouls 32, offsides 3, saves_home 3, saves_away 7}, goal_seq and per-player numbers, all from API-Football `/fixtures/statistics` + `/fixtures/events` + `/fixtures/players`.
- Planted three pending bets on that fixture in the browser and let autoSettle run: corners_over_9.5 -> won, cards_under_3.5 -> won, fouls_over_23.5 -> won, each stamped with the 2-0 final score. So the data was never the problem.
- Why the user's older bets stayed pending: the stat-based settlement path (needsDetail -> /results?detail= -> settleStatus reading detail.totals) was added AFTER those bets were placed. Old pending bets settle on the next autoSettle run, which happens on any page load.
- No code change needed. Also confirmed the Portfolio history renders `pickName` (the raw pick id only shows for hand-crafted test rows that lack it).

## 2026-10-09 LION Tickets: handicaps join the result pool (not a new category)
- User was explicit: no standard/fixed categories in tickets, only the best price at the best probability. So handicap candidates were added to the EXISTING `result` group rather than a new family: "home -0.5" IS a home win and "home +0.5" IS a double chance, i.e. alternative prices for the same opinion. They compete for the one result slot and can never form a second, correlated leg.
- Half lines only (-1.5/-0.5/+0.5/+1.5), probability straight off the score grid (diff + line > 0), same gates as every other leg (prob >= 58, edge >= 1.0).
- Live result: 25 tickets, 7 of them now take a handicap for the result slot because it beat the 1X2/DC price - e.g. Everton +0.5 @1.57 (77% likely vs 63% implied, edge 13.3), AS Roma +0.5 @1.50 (edge 7.3), FSV Mainz +0.5 @1.71 (edge 3.5). Group uniqueness is asserted by test_lion_tickets_scan_iter14.
- Settlement needed no change: picks.js already handles `(home|away)_hcp_<line>` as diff + line > 0.
- Full suite: 75 passed. Screenshot confirms the handicap legs render with their labels and prices.

## 2026-10-09 Greek books in Match Analysis + a crashing legacy match route
- User reported not seeing Novibet/the Greek books in Match Analysis. They were never missing: `/api/matches/{id}` merges the RapidAPI snapshots into `match.odds` (verified: William Hill, bet365, BetVictor, Betano, Stoiximan, Novibet, Elabet; sources apifootball + rapidapi, 168 of 181 matches carry at least one Greek book). No extra calls are involved - it is the same shared 12h snapshot.
- Real cause #1: the odds card showed `rows.slice(0, 6)` sorted by price, so a Greek book dropped out of the default view whenever it was a cent cheaper. Fixed with `defaultRows()` + `isGreekBook()` (new export in lib/bookmakers.js): best price first, then any Greek book that would otherwise be hidden is appended. Verified on /analysis/live_af_1575182 - Novibet/Stoiximan/Elabet now appear in all three outcome groups.
- Real cause #2 (worse): `/match/:id` rendered the stale `MatchPage.jsx`, built for an older payload shape, which crashed with "Cannot read properties of undefined" on `match.predictedStrength` and `match.h2h` -> the whole page was the red "SOMETHING WENT WRONG" screen. The header **search palette navigated there**, so searching for a match and opening it was a dead end. `MatchCard.jsx` (also linking there) is dead code, referenced by nothing.
- Fix: `/match/:id` now renders `MatchAnalysisPage` (route kept so old links/bookmarks work) and SearchPalette links to `/analysis/${id}`. Verified: the legacy URL renders the full analysis page with the Greek books instead of crashing. `pages/MatchPage.jsx` and `components/MatchCard.jsx` are now unreferenced and can be deleted in a future cleanup.
