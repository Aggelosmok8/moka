import { useState } from "react";
import { ExternalLink, ShieldCheck, X } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PricingCards from "@/components/PricingCards";

const STRIPE_LINK = "https://buy.stripe.com/test_8x228s29m0yd2gifmDf7i00";

export default function UpgradeDialog({ open, onClose }) {
  const { subscription, refreshStatus } = useAuth();
  const [selected, setSelected] = useState(null);
  const [activating, setActivating] = useState(false);

  if (!open) return null;

  const handleSelect = (plan) => {
    setSelected(plan);
    window.open(STRIPE_LINK, "_blank", "noopener");
  };

  const confirmPayment = async () => {
    setActivating(true);
    try {
      await api.post("/subscription/activate", { plan: selected });
      await refreshStatus();
      onClose(true);
    } finally {
      setActivating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      data-testid="upgrade-dialog"
    >
      <div className="relative w-full max-w-4xl card-surface p-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => onClose(false)}
          data-testid="upgrade-close-btn"
          className="absolute top-5 right-5 text-gray-400 hover:text-white"
        >
          <X size={22} />
        </button>
        <p className="eyebrow text-[#007AFF]">Upgrade to Pro</p>
        <h2 className="heading text-3xl mt-1">Keep your edge — unlock everything</h2>
        <p className="text-gray-400 mt-2 text-sm max-w-xl">
          All leagues, live match charts, full rosters and real-time odds. Annual saves you €25+ a year.
        </p>

        <div className="mt-8">
          <PricingCards onSelectPlan={handleSelect} currentPlan={subscription?.plan} idPrefix="dialog-" />
        </div>

        {selected && (
          <div className="mt-8 border border-[#007AFF]/40 bg-[#007AFF]/5 rounded-lg p-5">
            <div className="flex items-center gap-2 text-sm text-gray-200">
              <ExternalLink size={16} className="text-[#007AFF]" />
              A secure Stripe checkout opened in a new tab for the{" "}
              <b className="text-white">{selected === "yearly" ? "Annual" : "Monthly"}</b> plan.
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Complete payment there, then confirm below to activate Pro instantly.
            </p>
            <button
              onClick={confirmPayment}
              disabled={activating}
              data-testid="confirm-payment-btn"
              className="btn-primary mt-4 px-6 py-2.5 flex items-center gap-2 disabled:opacity-60"
            >
              <ShieldCheck size={16} />
              {activating ? "Activating…" : "I've completed payment — Activate Pro"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
