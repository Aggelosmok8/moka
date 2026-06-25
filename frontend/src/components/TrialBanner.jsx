import { Clock, Crown, AlertTriangle } from "lucide-react";

export default function TrialBanner({ subscription, onUpgrade }) {
  if (!subscription) return null;
  const { subscription_status, trial_days_left, plan } = subscription;

  if (subscription_status === "active") {
    return (
      <div className="bg-[#10B981]/10 border-b border-[#10B981]/20">
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center gap-2 text-sm text-[#10B981]">
          <Crown size={15} /> <b className="text-white">Pro active</b> — {plan === "yearly" ? "Annual" : "Monthly"} plan. You have full access.
        </div>
      </div>
    );
  }

  if (subscription_status === "trial") {
    const urgent = trial_days_left <= 2;
    return (
      <div className={`border-b ${urgent ? "bg-[#FF3B30]/10 border-[#FF3B30]/20" : "bg-[#007AFF]/10 border-[#007AFF]/20"}`}>
        <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className={`flex items-center gap-2 text-sm ${urgent ? "text-[#FF3B30]" : "text-[#007AFF]"}`}>
            <Clock size={15} />
            <span className="text-gray-200">
              <b className="text-white">{trial_days_left} day{trial_days_left === 1 ? "" : "s"} left</b> in your Pro trial.
              {urgent ? " Upgrade now to keep full access." : " Enjoy full access."}
            </span>
          </div>
          <button data-testid="banner-upgrade-btn" onClick={onUpgrade} className="btn-primary px-4 py-1.5 text-xs">
            {urgent ? "Upgrade now" : "Go Annual & save €25+"}
          </button>
        </div>
      </div>
    );
  }

  // expired / free
  return (
    <div className="bg-[#FF3B30]/10 border-b border-[#FF3B30]/20">
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-[#FF3B30]">
          <AlertTriangle size={15} />
          <span className="text-gray-200">
            <b className="text-white">Free tier.</b> Your trial ended — upgrade to unlock all leagues, rosters and odds.
          </span>
        </div>
        <button data-testid="banner-upgrade-btn" onClick={onUpgrade} className="btn-primary px-4 py-1.5 text-xs">
          Upgrade to Pro
        </button>
      </div>
    </div>
  );
}
