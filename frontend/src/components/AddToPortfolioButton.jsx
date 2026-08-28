import React, { useState } from "react";
import { Wallet, X, Layers, Check } from "lucide-react";
import { toast } from "sonner";
import { usePortfolio } from "../contexts/PortfolioContext";

const CHIPS = [5, 10, 20, 50];

export default function AddToPortfolioButton({ entry, className = "", size = "sm" }) {
  const { addBet, addToSlip, slipHas, slipCount } = usePortfolio();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("single"); // single | slip
  const [stake, setStake] = useState("10");

  const match = entry?.match || {};
  const value = entry?.value || {};
  const odds = value.bestOdds || 0;
  const inSlip = match.id ? slipHas(match.id) : false;

  const openModal = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setStake("10");
    setMode("single");
    setOpen(true);
  };
  const close = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setOpen(false);
  };

  const leg = {
    matchId: match.id, home: match.home?.name, away: match.away?.name, league: match.leagueName,
    pick: value.pick, pickName: value.pickName, odds, bookmaker: value.bookmaker,
  };

  const confirmSingle = (e) => {
    e.preventDefault(); e.stopPropagation();
    const amt = Number(stake);
    if (!amt || amt <= 0) { toast.error("Enter a stake greater than 0"); return; }
    addBet({ ...leg, stake: amt });
    setOpen(false);
    toast.success("Added to your portfolio");
  };

  const confirmSlip = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (inSlip) { toast("Already in your bet slip"); return; }
    addToSlip(leg);
    setOpen(false);
    toast.success("Added to bet slip");
  };

  const potential = odds ? (Number(stake || 0) * odds).toFixed(2) : "—";

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        data-testid={`add-to-portfolio-${match.id}`}
        title="Add this pick to your portfolio"
        className={`inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-colors bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/30 hover:bg-[#39FF14]/20 ${
          size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm"
        } ${className}`}
      >
        <Wallet className="w-3.5 h-3.5" /> Add to Portfolio
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={close}
          data-testid="portfolio-stake-modal"
        >
          <div
            className="w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-2xl p-5"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Add to Portfolio</div>
                <div className="font-display font-black text-white text-lg leading-tight mt-0.5">
                  {match.home?.name} <span className="text-zinc-600 text-sm">vs</span> {match.away?.name}
                </div>
              </div>
              <button onClick={close} data-testid="portfolio-modal-close" className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#0d1117] border border-[#30363d] rounded-lg mb-4">
              <button data-testid="portfolio-mode-single" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode("single"); }}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold ${mode === "single" ? "bg-[#39FF14] text-black" : "text-zinc-400 hover:text-white"}`}>
                <Wallet className="w-3.5 h-3.5" /> Single bet
              </button>
              <button data-testid="portfolio-mode-slip" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMode("slip"); }}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold ${mode === "slip" ? "bg-[#39FF14] text-black" : "text-zinc-400 hover:text-white"}`}>
                <Layers className="w-3.5 h-3.5" /> Accumulator {slipCount > 0 && <span className="opacity-70">({slipCount})</span>}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Your pick</div>
                <div className="text-sm font-bold text-[#39FF14] truncate">{value.pickName || "—"}</div>
              </div>
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5">
                <div className="text-[10px] text-zinc-500 uppercase">Odds</div>
                <div className="text-sm font-bold text-white font-mono-num">{odds || "—"} <span className="text-zinc-500 font-normal">@ {value.bookmaker}</span></div>
              </div>
            </div>

            {mode === "single" ? (
              <>
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Your stake (€)</label>
                <input
                  type="number" min="0" step="1" value={stake} onChange={(e) => setStake(e.target.value)}
                  data-testid="portfolio-stake-input" autoFocus
                  className="mt-1.5 w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 text-white font-mono-num text-lg focus:outline-none focus:border-[#39FF14]"
                />
                <div className="flex gap-2 mt-2">
                  {CHIPS.map((c) => (
                    <button key={c} type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setStake(String(c)); }}
                      className="flex-1 py-1.5 rounded-md text-xs font-bold bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10">€{c}</button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-4 text-sm">
                  <span className="text-zinc-400">Potential return</span>
                  <span className="font-mono-num font-bold text-white">€{potential}</span>
                </div>
                <button onClick={confirmSingle} data-testid="portfolio-confirm-add"
                  className="mt-4 w-full py-2.5 rounded-lg bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
                  Add bet
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-400 mb-3">
                  Add this pick to your accumulator slip and combine several matches into one ticket. You set the stake when you place the ticket in your Portfolio.
                </p>
                <button onClick={confirmSlip} data-testid="portfolio-confirm-slip" disabled={inSlip}
                  className={`w-full py-2.5 rounded-lg font-black uppercase tracking-wider text-sm transition ${inSlip ? "bg-white/10 text-zinc-500 cursor-not-allowed" : "bg-[#39FF14] text-black hover:brightness-110"}`}>
                  {inSlip ? <><Check className="inline w-4 h-4 mr-1" /> Already in slip</> : "Add to bet slip"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
