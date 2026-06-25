import { Crown, Clock, CheckCircle2, Mail, CreditCard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import PricingCards from "@/components/PricingCards";

export default function AccountTab({ onUpgrade }) {
  const { user, subscription, isPro } = useAuth();
  const status = subscription?.subscription_status;

  const statusLabel = {
    trial: "Free trial",
    active: "Pro — active",
    expired: "Free tier (trial ended)",
    free: "Free tier",
  }[status] || "Free tier";

  const handleSelect = () => onUpgrade();

  return (
    <div className="fade-up max-w-5xl">
      <h1 className="heading text-3xl">Account</h1>
      <p className="text-gray-400 text-sm mt-1">Manage your subscription and plan.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="card-surface p-5">
          <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider"><Mail size={14} /> Account</div>
          <div className="font-semibold mt-2">{user?.name || "—"}</div>
          <div className="text-sm text-gray-400">{user?.email}</div>
        </div>
        <div className="card-surface p-5">
          <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider">
            {isPro ? <Crown size={14} /> : <Clock size={14} />} Status
          </div>
          <div className={`font-display text-xl font-bold mt-2 ${isPro ? "text-[#10B981]" : "text-[#007AFF]"}`}>{statusLabel}</div>
          {status === "trial" && (
            <div className="text-sm text-gray-400">{subscription?.trial_days_left} day{subscription?.trial_days_left === 1 ? "" : "s"} remaining</div>
          )}
          {status === "active" && (
            <div className="text-sm text-gray-400">{subscription?.plan === "yearly" ? "Annual plan" : "Monthly plan"}</div>
          )}
        </div>
        <div className="card-surface p-5">
          <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider"><CreditCard size={14} /> Access</div>
          <div className="font-display text-xl font-bold mt-2">{isPro ? "Full Pro access" : "Limited"}</div>
          <div className="text-sm text-gray-400">{isPro ? "All leagues, rosters & odds" : "Unlocked leagues only"}</div>
        </div>
      </div>

      {isPro && status === "active" ? (
        <div className="card-surface p-8 mt-6 flex items-center gap-4">
          <CheckCircle2 className="text-[#10B981]" size={32} />
          <div>
            <h3 className="heading text-xl">You're on Pro</h3>
            <p className="text-gray-400 text-sm">Thanks for subscribing. You have full access to everything StatLine offers.</p>
          </div>
        </div>
      ) : (
        <div className="mt-10">
          <div className="text-center mb-8">
            <h2 className="heading text-3xl">{status === "trial" ? "Lock in Pro before your trial ends" : "Upgrade to Pro"}</h2>
            <p className="text-gray-400 mt-2">Annual saves you €25+ a year versus monthly.</p>
          </div>
          <PricingCards onSelectPlan={handleSelect} currentPlan={subscription?.plan} />
        </div>
      )}
    </div>
  );
}
