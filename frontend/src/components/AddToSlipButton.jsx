import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layers, Check } from "lucide-react";
import { toast } from "sonner";
import { usePortfolio } from "../contexts/PortfolioContext";
import { isDoubleChance, pickChoices, bestOddsByOutcome } from "../lib/picks";

export default function AddToSlipButton({ entry, className = "", size = "sm" }) {
  const { addToSlip, removeFromSlip, slipHas, playedMatch } = usePortfolio();
  const navigate = useNavigate();
  const [choosing, setChoosing] = useState(false);
  const [sel, setSel] = useState(null);
  const [oddsInput, setOddsInput] = useState("");
  const match = entry?.match || {};
  const value = entry?.value || {};
  const id = match.id;
  const inSlip = slipHas(id, match.home?.name, match.away?.name);
  // Already placed: read from the bets, so it stays marked after navigating
  // away, switching pages or signing in again.
  const played = playedMatch(id, match.home?.name, match.away?.name);
  const PLAYED_LABEL = { pending: "Played", won: "Won", lost: "Lost", void: "Void" };

  const dc = isDoubleChance(value);
  // Always ask what was played: the double chance offers its scenarios, a plain
  // pick offers itself — and the price is editable either way.
  const choices = dc
    ? pickChoices(match, value)
    : [{ pick: value.pick, pickName: value.pickName, label: value.pickName, code: "", outcome: value.pick }];
  const priceFor = (c) => bestOddsByOutcome(match)[c.outcome]?.odds || (c.outcome === value.pick ? value.bestOdds : null);
  const bookFor = (c) => bestOddsByOutcome(match)[c.outcome]?.bookmaker || value.bookmaker;
  const current = sel || choices[0];
  const shown = priceFor(current);
  const finalOdds = Number(oddsInput) > 1 ? Number(oddsInput) : shown;

  const add = () => {
    const choice = current;
    addToSlip({
      matchId: id, home: match.home?.name, away: match.away?.name, league: match.leagueName,
      pick: choice?.pick || value.pick, pickName: choice?.pickName || value.pickName,
      odds: finalOdds || value.bestOdds, bookmaker: bookFor(choice) || value.bookmaker,
      kickoff: match.commence_time || match.kickoff || null,
    });
    setChoosing(false);
    toast.success(`Added to bet slip — ${choice?.pickName || value.pickName} @ ${Number(finalOdds || 0).toFixed(2)}`, {
      duration: 4000,
      action: { label: "Go to slip", onClick: () => navigate("/portfolio?tab=tickets") },
    });
  };

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (played) {
      toast(`You already played this match — ${PLAYED_LABEL[played]}`, {
        action: { label: "Open portfolio", onClick: () => navigate("/portfolio") },
      });
      return;
    }
    if (inSlip) {
      removeFromSlip(id, match.home?.name, match.away?.name);
      toast("Removed from bet slip");
      return;
    }
    setSel(null);
    setOddsInput("");
    setChoosing(true);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={onClick}
        data-testid={`add-to-slip-${id}`}
        title={played ? "Already in your portfolio" : inSlip ? "Remove from bet slip" : "Add to accumulator slip"}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-colors ${
          played ? "bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/40"
            : inSlip ? "bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/40"
            : "bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 hover:text-white"
        } ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${className}`}
      >
        {played || inSlip ? <Check className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
        {played ? PLAYED_LABEL[played] : inSlip ? "In slip" : "Add to slip"}
      </button>

      {choosing && (
        <div className="fixed inset-0 z-[90]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setChoosing(false); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,360px)] bg-[#161b22] border border-[#30363d] rounded-xl p-4"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            data-testid="pick-market-dialog"
          >
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              {value.possibleOutcome ? `LION predicts ${value.possibleOutcome}` : "LION pick"}
            </div>
            <div className="font-display font-black uppercase text-white mt-1 mb-3">
              {choices.length > 1 ? "Which one did you play?" : "Did you play this?"}
            </div>
            {choices.map((c) => {
              const active = (current?.pick || "") === (c.pick || "");
              return (
                <button key={c.pick} onClick={() => { setSel(c); setOddsInput(""); }} data-testid={`pick-option-${c.pick}`}
                  className={`w-full text-left flex items-center justify-between gap-2 px-3 py-2.5 mb-2 rounded-lg border transition-colors ${
                    active ? "bg-[#39FF14]/[0.08] border-[#39FF14]/60" : "bg-[#0d1117] border-white/10 hover:border-[#39FF14]/40"}`}>
                  <span className="text-sm text-zinc-200">{c.label}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    {priceFor(c) ? <span className="text-xs font-black font-mono-num text-white">{Number(priceFor(c)).toFixed(2)}</span> : null}
                    {c.code ? <span className="text-[11px] font-black text-[#39FF14]">{c.code}</span> : null}
                  </span>
                </button>
              );
            })}

            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mt-3">
              Odds you played — edit if you got a different price
            </label>
            <input type="number" min="1" step="0.01" value={oddsInput} placeholder={shown ? Number(shown).toFixed(2) : "1.00"}
              onChange={(e) => setOddsInput(e.target.value)} data-testid="slip-odds-edit"
              className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white font-mono-num focus:outline-none focus:border-[#39FF14]" />

            <button onClick={add} data-testid="slip-confirm-add"
              className="mt-3 w-full py-2.5 rounded-lg bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
              Add to slip @ {Number(finalOdds || 0).toFixed(2)}
            </button>
            <button onClick={() => setChoosing(false)} data-testid="slip-cancel" className="w-full text-xs text-zinc-500 hover:text-white mt-2">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
