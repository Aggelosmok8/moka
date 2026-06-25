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

## Next
1. Deploy full-stack via Emergent; sign in with Google to confirm trial provisioning live.
2. Build Match Chart. 3. Wire real Odds data. 4. Add RESEND_API_KEY. 5. Optional Supabase adapter.
