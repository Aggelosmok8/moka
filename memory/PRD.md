# Moka — PRD / Working Notes

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
