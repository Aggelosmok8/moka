import React from "react";
import { Link } from "react-router-dom";
import { Clock, Crown, AlertTriangle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function TrialBanner() {
  const { user, loading } = useAuth();
  if (loading) return null;

  // Guest — promote the no-card trial (sign-in starts it automatically).
  if (!user) {
    const startTrial = () => {
      // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
      const redirectUrl = window.location.origin + "/account";
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    };
    return (
      <div className="bg-[#39FF14]/10 border-b border-[#39FF14]/20" data-testid="trial-banner-guest">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-zinc-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#39FF14]" />
            Start your <b className="text-white">7-day free trial</b> — full Pro access, no card required.
          </span>
          <button onClick={startTrial} data-testid="banner-start-trial-btn" className="text-xs font-black uppercase tracking-wider neon-bg text-black px-3 py-1.5 rounded hover:bg-[#32E612] transition-colors">
            Start free trial
          </button>
        </div>
      </div>
    );
  }

  const status = user.subscription_status;
  if (status === "active") {
    return (
      <div className="bg-[#39FF14]/10 border-b border-[#39FF14]/20" data-testid="trial-banner-pro">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 text-sm text-[#39FF14]">
          <Crown className="w-4 h-4" /> <b className="text-white">Pro active</b>
          {user.plan ? <span className="text-zinc-300">· {user.plan === "yearly" ? "Annual" : "Monthly"} plan</span> : null}
        </div>
      </div>
    );
  }

  if (status === "trial") {
    const urgent = user.trial_days_left <= 2;
    return (
      <div className={`border-b ${urgent ? "bg-[#FF3B30]/10 border-[#FF3B30]/20" : "bg-[#39FF14]/10 border-[#39FF14]/20"}`} data-testid="trial-banner-active">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className={`text-sm flex items-center gap-2 ${urgent ? "text-[#FF3B30]" : "text-[#39FF14]"}`}>
            <Clock className="w-4 h-4" />
            <span className="text-zinc-200"><b className="text-white">{user.trial_days_left} day{user.trial_days_left === 1 ? "" : "s"} left</b> in your Pro trial.</span>
          </span>
          <Link to="/pricing" data-testid="banner-upgrade-link" className="text-xs font-black uppercase tracking-wider neon-bg text-black px-3 py-1.5 rounded hover:bg-[#32E612] transition-colors">
            {urgent ? "Upgrade now" : "Go Annual & save €25+"}
          </Link>
        </div>
      </div>
    );
  }

  // expired / free
  if (status === "expired") {
    return (
      <div className="bg-[#FF3B30]/10 border-b border-[#FF3B30]/20" data-testid="trial-banner-expired">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-[#FF3B30] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-zinc-200"><b className="text-white">Trial ended.</b> Upgrade to unlock all leagues, value bets & odds.</span>
          </span>
          <Link to="/pricing" data-testid="banner-upgrade-link" className="text-xs font-black uppercase tracking-wider neon-bg text-black px-3 py-1.5 rounded hover:bg-[#32E612] transition-colors">
            Upgrade to Pro
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
