import React from "react";
import Header from "../components/Header";
import { ProBadge, UpgradeButton } from "../components/Gating";
import { useEntitlements } from "../hooks/useEntitlements";
import { useAuth } from "../contexts/AuthContext";

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500 text-sm">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

export default function AccountPage() {
  const { role, accessibleIds, refreshSeconds, loading } = useEntitlements();
  const { user } = useAuth();
  const isPro = role === "pro";
  const status = user?.subscription_status;
  const planLabel = {
    active: user?.plan === "yearly" ? "Pro · Annual" : "Pro · Monthly",
    trial: `Free trial · ${user?.trial_days_left ?? 0} day${user?.trial_days_left === 1 ? "" : "s"} left`,
    expired: "Free (trial ended)",
    free: "Free",
  }[status] || (isPro ? "Pro" : "Free");
  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white mb-6">Account</h1>
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 space-y-4" data-testid="account-card">
          <Row label="Signed in as" value={(user && user.email) || "Guest"} />
          <Row label="Plan" value={<span className="text-white font-bold" data-testid="account-plan">{planLabel}</span>} />
          {status === "trial" && user?.trial_end_date && (
            <Row label="Trial ends" value={new Date(user.trial_end_date).toLocaleDateString()} />
          )}
          <Row label="Accessible leagues" value={loading ? "…" : accessibleIds.size} />
          <Row label="Data refresh" value={`every ${refreshSeconds}s`} />
          {!isPro && (
            <div className="pt-2">
              <UpgradeButton />
            </div>
          )}
        </div>
        {!isPro && (
          <p className="text-zinc-500 text-sm mt-4">
            Upgrade to Pro to access more value opportunities across more leagues, full odds comparison, full AI explanations,
            full statistics and future value alerts.
          </p>
        )}
      </main>
    </div>
  );
}
