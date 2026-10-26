import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { authApi, useAuth } from "../contexts/AuthContext";
import { Sparkles, Check, Lock, RefreshCw, Crown, LogIn } from "lucide-react";

const PRO_FEATURES = [
  "Every league AND the big competitions — Premier League, Champions / Europa / Conference League",
  "Full match analysis + every Specific Bets category (goals, correct score, cards, corners, fouls, offsides, saves, shots, players…)",
  "Best odds proposal — every bookmaker price per outcome, best one marked",
  "LION Tickets — ready-built tickets at the best available odds",
  "Full tickets history, stats and performance graph (no 10-ticket cap)",
  "Full player statistics, team statistics and unlimited team compare",
  "News, watchlist and real-time updates",
];

const FREE_FEATURES = [
  "All leagues except the big competitions (Premier League, Champions / Europa / Conference League — fixture and date only)",
  "Full match analysis for every available match",
  "One Specific Bets category: Both Teams To Score",
  "All player statistics, team statistics and team compare",
  "Up to 10 tickets kept in history, stats and graph",
  "Watchlist — save matches for later",
  "Football news",
];

export default function PricingPage() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const [packages, setPackages] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canceled = searchParams.get("canceled") === "1";

  useEffect(() => {
    authApi.get("/billing/packages").then((r) => setPackages(r.data.packages || [])).catch(() => {});
  }, []);

  const once = packages.find((p) => p.id === "pro_monthly_once");
  const monthly = packages.find((p) => p.id === "pro_monthly");
  const yearly = packages.find((p) => p.id === "pro_yearly");
  const savings = monthly && yearly ? (monthly.amount * 12 - yearly.amount).toFixed(0) : "25";

  const startCheckout = async (packageId) => {
    setError("");
    if (!user) {
      // Remember the plan so we can auto-resume checkout right after sign-in.
      try { sessionStorage.setItem("moka_pending_checkout", packageId); } catch {}
      window.location.assign("/signin");
      return;
    }
    setBusy(packageId);
    try {
      const r = await authApi.post("/billing/checkout", { package_id: packageId, origin_url: window.location.origin });
      if (r.data?.url) window.location.href = r.data.url;
      else setError("Could not start checkout.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not start checkout.");
    } finally {
      setBusy("");
    }
  };

  // After returning from sign-in, resume the plan the user picked.
  useEffect(() => {
    if (loading || !user) return;
    let pending = null;
    try { pending = sessionStorage.getItem("moka_pending_checkout"); } catch {}
    if (pending) {
      try { sessionStorage.removeItem("moka_pending_checkout"); } catch {}
      startCheckout(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const isPro = user?.is_pro;
  const onTrial = user?.subscription_status === "trial";

  const PaidButton = ({ pkgId, label, primary }) => {
    if (loading) return <button disabled className="w-full px-5 py-3 rounded-lg bg-white/10 text-zinc-400 text-sm font-bold uppercase tracking-wider">Loading…</button>;
    const PLAN_OF = { pro_yearly: "yearly", pro_monthly: "monthly", pro_monthly_once: "monthly_once" };
    if (isPro && user?.plan && user.plan === PLAN_OF[pkgId])
      return <div className="w-full px-5 py-3 rounded-lg bg-[#39FF14]/10 text-[#39FF14] text-center text-sm font-bold uppercase tracking-wider border border-[#39FF14]/30">Current plan</div>;
    return (
      <button
        onClick={() => startCheckout(pkgId)}
        disabled={!!busy}
        data-testid={`checkout-${pkgId}-btn`}
        className={`w-full px-5 py-3 rounded-lg font-black text-sm uppercase tracking-wider inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
          primary ? "neon-bg hover:bg-[#32E612] text-black" : "bg-white/10 text-white hover:bg-white/15"
        }`}
      >
        {busy === pkgId ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        {user ? label : "Sign in & upgrade"}
      </button>
    );
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12 fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-5 rounded-full border border-[#39FF14]/30 bg-[#39FF14]/5">
            <Sparkles className="w-3 h-3 text-[#39FF14]" />
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#39FF14]">LION Pro</span>
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-5xl sm:text-6xl text-white leading-none">
            Edge over the <span className="shimmer-text">crowd.</span>
          </h1>
          <p className="mt-4 text-zinc-400 text-base sm:text-lg max-w-xl mx-auto">
            {onTrial
              ? `You're on a free trial — ${user.trial_days_left} day${user.trial_days_left === 1 ? "" : "s"} of full Pro access left.`
              : "Start with a 7-day free trial — no card required. Upgrade any time."}
          </p>
        </div>

        {canceled && (
          <div className="mb-6 rounded-lg border border-[#FF9500]/30 bg-[#FF9500]/[0.05] p-3 text-sm text-zinc-200" data-testid="canceled-banner">
            Checkout canceled. No charges were made.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-start">
          {/* Free */}
          <div className="surface rounded-xl p-7" data-testid="plan-free">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-zinc-500 mb-2">Free</div>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="font-display font-black text-5xl text-white">€0</span>
              <span className="text-zinc-500">/ forever</span>
            </div>
            <ul className="space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            {loading ? null : !user ? (
              <a href="/signin?mode=signup" data-testid="plan-free-cta"
                className="mt-6 w-full px-5 py-3 rounded-lg bg-white/10 text-white hover:bg-white/15 font-black text-sm uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-colors">
                <LogIn className="w-4 h-4" /> Sign in for free
              </a>
            ) : !isPro ? (
              <div className="mt-6 w-full px-5 py-3 rounded-lg bg-white/[0.06] text-zinc-300 text-center text-sm font-bold uppercase tracking-wider border border-white/10" data-testid="plan-free-current">
                Your current plan
              </div>
            ) : null}
          </div>

          {/* One-off 30-day access — pay once, nothing renews */}
          <div className="surface rounded-xl p-7" data-testid="plan-monthly-once">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-white">Pro · 30-day access</div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/30 rounded px-1.5 py-0.5">One-off</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display font-black text-5xl text-white">€{once ? once.amount.toFixed(2) : "10.99"}</span>
              <span className="text-zinc-500">/ once</span>
            </div>
            <div className="text-xs text-zinc-500 mb-5 mt-1">Identical access to every Pro plan. <b className="text-zinc-300">No card stored, no auto-renewal.</b></div>
            <ul className="space-y-2.5 mb-6">
              {["Everything in Pro — identical access to the subscriptions", "Pay once, 30 days, no card stored", "Nothing renews: it simply ends", "Buy again whenever you want"].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white">
                  <Check className="w-4 h-4 text-[#FFD60A] mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <PaidButton pkgId="pro_monthly_once" label="Buy 30 days" />
          </div>

          {/* Monthly */}
          <div className="surface rounded-xl p-7" data-testid="plan-monthly">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-white mb-2">Pro · Monthly</div>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="font-display font-black text-5xl text-white">€{monthly ? monthly.amount.toFixed(2) : "10.99"}</span>
              <span className="text-zinc-500">/ month</span>
            </div>
            <div className="text-xs text-zinc-500 mb-5 mt-1">Identical access to every Pro plan. <b className="text-zinc-300">Renews automatically</b> from your saved card — cancel any time.</div>
            <ul className="space-y-2.5 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white">
                  <Check className="w-4 h-4 text-[#39FF14] mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <PaidButton pkgId="pro_monthly" label="Choose Monthly" />
          </div>

          {/* Annual — Best Value */}
          <div className="surface rounded-xl p-7 relative border-[#39FF14]/40" data-testid="plan-yearly" style={{ boxShadow: "0 0 48px -12px rgba(57,255,20,0.35)" }}>
            <span className="absolute -top-3 left-7 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[#39FF14] text-black">
              <Crown className="w-2.5 h-2.5" /> Best Value
            </span>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-[#39FF14]">Pro · Annual</div>
              <span className="text-[11px] font-bold text-[#39FF14]" data-testid="annual-savings">Save €{savings}+ / year</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-display font-black text-5xl text-white">€{yearly ? yearly.amount.toFixed(2) : "79.99"}</span>
              <span className="text-zinc-500">/ year</span>
            </div>
            <div className="text-xs text-zinc-500 mb-5 mt-1">≈ €{yearly ? (yearly.amount / 12).toFixed(2) : "6.67"}/month, billed yearly. Identical access, <b className="text-zinc-300">renews automatically</b>.</div>
            <ul className="space-y-2.5 mb-6">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-white">
                  <Check className="w-4 h-4 text-[#39FF14] mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <PaidButton pkgId="pro_yearly" label="Go Annual" primary />
          </div>
        </div>

        {error && <p className="text-[#FF3B30] text-sm mt-4 text-center" data-testid="checkout-error">{error}</p>}

        <p className="mt-10 text-center text-xs text-zinc-600 max-w-lg mx-auto leading-relaxed">
          Prices include VAT. Subscriptions renew automatically until you cancel; the 30-day access is a single payment that never renews.
          A tax document (ΑΠΥ/ΤΠΥ) is emailed to you automatically after every payment.
        </p>
      </main>
    </div>
  );
}
