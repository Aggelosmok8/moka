import { Check, Crown, Sparkles } from "lucide-react";

const PLANS = [
  {
    id: "monthly",
    label: "Monthly",
    price: "€8.99",
    suffix: "/month",
    blurb: "Full Pro access, billed monthly. Cancel anytime.",
    features: ["All leagues unlocked", "Live match charts", "Full team rosters", "Real-time odds"],
  },
  {
    id: "yearly",
    label: "Annual",
    price: "€79",
    suffix: "/year",
    blurb: "Best value — just €6.58/month, billed yearly.",
    recommended: true,
    savings: "Save €25+ per year",
    features: [
      "Everything in Monthly",
      "2 months effectively free",
      "Priority data refresh",
      "Lock in the lowest price",
    ],
  },
];

export default function PricingCards({ onSelectPlan, currentPlan }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto w-full">
      {PLANS.map((p) => {
        const active = currentPlan === p.id;
        return (
          <div
            key={p.id}
            data-testid={`plan-card-${p.id}`}
            className={`relative card-surface p-7 flex flex-col transition-all duration-200 hover:-translate-y-1 ${
              p.recommended ? "border-[#007AFF] shadow-[0_0_40px_-12px_rgba(0,122,255,0.5)]" : "hover:border-white/20"
            }`}
          >
            {p.recommended && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#007AFF] text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                <Crown size={12} /> Best Value
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="eyebrow text-gray-400">{p.label}</span>
              {p.savings && (
                <span className="text-[11px] font-bold text-[#10B981] flex items-center gap-1">
                  <Sparkles size={12} /> {p.savings}
                </span>
              )}
            </div>
            <div className="mt-4 flex items-end gap-1">
              <span className="font-display text-5xl font-extrabold">{p.price}</span>
              <span className="text-gray-400 mb-1.5">{p.suffix}</span>
            </div>
            <p className="text-sm text-gray-400 mt-2">{p.blurb}</p>
            <ul className="mt-6 space-y-2.5 flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-200">
                  <Check size={16} className="text-[#007AFF] mt-0.5 shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <button
              data-testid={`select-plan-${p.id}-btn`}
              onClick={() => onSelectPlan(p.id)}
              disabled={active}
              className={`mt-7 w-full py-3 font-bold rounded-[4px] transition-all ${
                active
                  ? "bg-[#10B981] text-white cursor-default"
                  : p.recommended
                  ? "btn-primary"
                  : "bg-transparent border border-white/20 text-white hover:bg-white/5"
              }`}
            >
              {active ? "Current Plan" : p.recommended ? "Go Annual" : "Choose Monthly"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
