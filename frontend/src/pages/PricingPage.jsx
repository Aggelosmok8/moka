import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { authApi, useAuth } from "../contexts/AuthContext";
import { Sparkles, Check, Lock, RefreshCw, Crown } from "lucide-react";

const PRO_FEATURES = [
  "All leagues unlocked (incl. Pro-only competitions)",
  "Value Bets — positive expected-value odds, ranked",
  "Full bookmaker comparison (vs. top 3 for free)",
  "Unlimited AI tactical analyses + regenerate",
  "Extended stats (xG, xGA, BTTS, corners…)",
  "Real-time updates + goal alerts (no delay)",
];

const FREE_FEATURES = [
  "Top football leagues + NBA / EuroLeague",
  "1 AI analysis per match / day",
  "Top 3 bookmaker odds compare",
  "Core team stats + charts",
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

  const monthly = packages.find((p) => p.id === "pro_monthly");
  const yearly = packages.find((p) => p.id === "pro_yearly");
  const savings = monthly && yearly ? (monthly.amount * 12 - yearly.amount).toFixed(0) : "25";

  const startCheckout = async (packageId) => {
    setError("");
    if (!user) {
      // Remember the plan so we can auto-resume checkout right after sign-in.
      try { sessionStorage.setItem("moka_pending_checkout", packageId); } catch {}
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      const redirectUrl = window.location.origin + "/pricing";
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
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
    if (isPro && user?.plan && ((user.plan === "yearly" && pkgId === "pro_yearly") || (user.plan === "monthly" && pkgId === "pro_monthly")))
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
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#39FF14]">Moka Pro</span>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
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
          </div>

          {/* Monthly */}
          <div className="surface rounded-xl p-7" data-testid="plan-monthly">
            <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-white mb-2">Pro · Monthly</div>
            <div className="flex items-baseline gap-1 mb-5">
              <span className="font-display font-black text-5xl text-white">€{monthly ? monthly.amount.toFixed(2) : "8.99"}</span>
              <span className="text-zinc-500">/ month</span>
            </div>
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
              <span className="font-display font-black text-5xl text-white">€{yearly ? yearly.amount.toFixed(0) : "79"}</span>
              <span className="text-zinc-500">/ year</span>
            </div>
            <div className="text-xs text-zinc-500 mb-5 mt-1">≈ €{yearly ? (yearly.amount / 12).toFixed(2) : "6.58"}/month, billed yearly</div>
            <ul className="space-y-2.5 mb-6">
              {["Everything in Monthly", "2 months effectively free", "Priority data refresh", "Lock in the lowest price"].map((f) => (
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
          Test mode — Stripe test card 4242 4242 4242 4242. Your 7-day trial gives full Pro access with no card. Cancel anytime.
        </p>
      </main>
    </div>
  );
}
