# StatLine — PRD

## Problem statement
Sports match-tracking + odds SaaS. Subscriptions (Monthly €8.99 / Annual €79, annual = Best Value, "Save €25+/year"), 7-day free trial (no card, full Pro access), trial lifecycle emails (Resend), Stripe payment-link activation, Supabase as intended primary DB, external sports APIs (Odds API, API-Football, API-Basketball), Match Chart tracking, Teams tab (leagues→teams→players), Free/Pro access control. Goal: maximize conversion, push annual, low infra cost.

## User choices
- Existing scaffold refactored in-place; build StatLine.
- Resend for emails. Supabase Auth/REST intended (anon key injected later via env). Stripe = payment link + success redirect only (no webhook yet).

## Architecture
- Backend FastAPI (modular): routes/{auth,subscription,sports,chart}, services/{subscription,sports,email,supabase}, auth_utils (JWT bearer), db (Mongo + cache-aside layer).
- Data store: MongoDB now (statline_db); `services/supabase_service.py` is a ready REST adapter that activates when SUPABASE_ANON_KEY is set (clean abstraction, no route changes needed).
- Frontend React: AuthContext + axios bearer; pages Landing/Auth/Dashboard; tabs Matches/MatchChart/Teams/Account; PricingCards, UpgradeDialog, TrialBanner. Dark "Performance Pro" theme (Barlow Condensed + IBM Plex Sans, #007AFF).
- Caching: api_cache collection, TTL matches=600s, odds=300s, scores=60s, sports=24h. Minimizes external calls.

## Implemented (2026-06-25)
- JWT email/password auth + 7-day trial provisioning on register.
- Subscription: plans, lazy status refresh with auto-expiry/downgrade, idempotent activate (prevents double sub), Stripe payment-link + confirm flow.
- Email lifecycle (welcome/reminder/urgency/expired) evaluated lazily, idempotent; graceful no-op without RESEND_API_KEY.
- Sports via The Odds API (REAL/live): leagues, matches, scores (live/finished), event odds (Pro). Teams derived from events. Players = sample roster fallback (API-Football/Basketball keys suspended).
- Free/Pro access control: free = FREE_LEAGUE_KEYS only + first 3 players + no odds; trial/active = full.
- Match Chart: track/untrack (persisted), live-enriched, recharts bar chart, 30s polling.
- Tested: 19/19 backend pytest pass; frontend flows verified.

## Known / mocked
- RESEND_API_KEY empty → emails are NO-OP (disabled, not mocked). Add key to enable.
- SUPABASE_ANON_KEY empty → using MongoDB store (Supabase adapter ready to switch).
- API-Football / API-Basketball keys SUSPENDED → player rosters are sample data (source="sample").

## Backlog / Next
- P1: Inject Supabase anon key + migrate store to Supabase REST; provision tables (users, subscriptions, matches, teams, players, user_preferences).
- P1: Add Resend API key to enable lifecycle emails; verify sender domain.
- P2: Stripe webhook for real activation (replace confirm-button flow); store subscriptions table.
- P2: Reactivate / replace football & basketball stats provider for real rosters + player stats.
- P3: Live score history (line chart over time), match detail page, more markets (spreads/totals).
