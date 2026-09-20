import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Check } from "lucide-react";
import { toast } from "sonner";
import { usePortfolio } from "../contexts/PortfolioContext";
import { isDoubleChance, pickChoices } from "../lib/picks";

export default function AddToSlipButton({ entry, className = "", size = "sm" }) {
  const { addToSlip, removeFromSlip, slipHas } = usePortfolio();
  const navigate = useNavigate();
  const [choosing, setChoosing] = useState(false);
  const match = entry?.match || {};
  const value = entry?.value || {};
  const id = match.id;
  const inSlip = slipHas(id, match.home?.name, match.away?.name);

  const add = (choice) => {
    addToSlip({
      matchId: id, home: match.home?.name, away: match.away?.name, league: match.leagueName,
      pick: choice?.pick || value.pick, pickName: choice?.pickName || value.pickName,
      odds: value.bestOdds, bookmaker: value.bookmaker,
      kickoff: match.commence_time || match.kickoff || null,
    });
    setChoosing(false);
    toast.success(choice?.doubleChance ? "Added as double chance — edit the odds in your slip to the price you played" : "Added to bet slip", {
      duration: 4000,
      action: { label: "Go to slip", onClick: () => navigate("/portfolio?tab=tickets") },
    });
  };

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inSlip) {
      removeFromSlip(id, match.home?.name, match.away?.name);
      toast("Removed from bet slip");
      return;
    }
    // Model says e.g. "Home or Draw" -> ask what the user actually played.
    if (isDoubleChance(value)) { setChoosing(true); return; }
    add(null);
  };

  const choices = isDoubleChance(value) ? pickChoices(match, value) : [];

  return (
    <div className="relative inline-block">
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

      {choosing && (
        <div className="fixed inset-0 z-[90]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChoosing(false); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,340px)] bg-[#161b22] border border-[#30363d] rounded-xl p-4"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-testid="pick-market-dialog"
          >
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">LION predicts {value.possibleOutcome}</div>
            <div className="font-display font-black uppercase text-white mt-1 mb-3">What did you play?</div>
            {choices.map((c) => (
              <button key={c.pick} onClick={() => add(c)} data-testid={`pick-option-${c.pick}`}
                className="w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 mb-2 rounded-lg bg-[#0d1117] border border-white/10 hover:border-[#39FF14]/50 hover:bg-[#39FF14]/[0.06] transition-colors">
                <span className="text-sm text-zinc-200">{c.label}</span>
                <span className="text-[11px] font-black text-[#39FF14]">{c.code}</span>
              </button>
            ))}
            <button onClick={() => setChoosing(false)} className="w-full text-xs text-zinc-500 hover:text-white mt-1">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
