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

## Deployment (unchanged model)
- Frontend → Vercel (Root Dir `frontend`, build `npm run build`, output `build`, install `npm install --legacy-peer-deps`, env `VITE_BACKEND_URL`).
- Backend → Render (FastAPI + SQLite). Env: STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET, EMERGENT_LLM_KEY, RESEND_API_KEY, SENDER_EMAIL, APP_URL, ODDS_API_KEY, API_FOOTBALL_KEY, FOOTBALL_DATA_KEY (placeholders in backend/.env).
