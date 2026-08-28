import React from "react";
import { Layers, Check } from "lucide-react";
import { toast } from "sonner";
import { usePortfolio } from "../contexts/PortfolioContext";

export default function AddToSlipButton({ entry, className = "", size = "sm" }) {
  const { addToSlip, removeFromSlip, slipHas } = usePortfolio();
  const match = entry?.match || {};
  const value = entry?.value || {};
  const id = match.id;
  const inSlip = id ? slipHas(id) : false;

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inSlip) {
      removeFromSlip(id);
      toast("Removed from bet slip");
      return;
    }
    addToSlip({
      matchId: id, home: match.home?.name, away: match.away?.name, league: match.leagueName,
      pick: value.pick, pickName: value.pickName, odds: value.bestOdds, bookmaker: value.bookmaker,
    });
    toast.success("Added to bet slip");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`add-to-slip-${id}`}
      title={inSlip ? "Remove from bet slip" : "Add to accumulator slip"}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-colors ${
        inSlip ? "bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/40" : "bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 hover:text-white"
      } ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${className}`}
    >
      {inSlip ? <Check className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
      {inSlip ? "In slip" : "Add to slip"}
    </button>
  );
}
