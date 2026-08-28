import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Layers, ArrowRight } from "lucide-react";
import { usePortfolio } from "../contexts/PortfolioContext";

// Floating accumulator slip indicator — appears whenever the slip has picks.
export default function SlipFab() {
  const { slip, slipCount } = usePortfolio();
  const loc = useLocation();
  if (slipCount === 0) return null;
  if (loc.pathname.startsWith("/portfolio")) return null;

  const totalOdds = slip.reduce((p, l) => p * (Number(l.odds) || 1), 1);

  return (
    <Link
      to="/portfolio?tab=tickets"
      data-testid="slip-fab"
      className="fixed bottom-5 right-5 z-[90] flex items-center gap-3 pl-4 pr-3 py-3 rounded-full bg-[#39FF14] text-black font-black shadow-2xl shadow-[#39FF14]/20 hover:brightness-110 transition"
    >
      <span className="relative flex items-center gap-2">
        <Layers className="w-5 h-5" />
        <span className="absolute -top-2 -left-2 min-w-[18px] h-[18px] px-1 rounded-full bg-black text-[#39FF14] text-[10px] flex items-center justify-center">{slipCount}</span>
      </span>
      <span className="text-sm uppercase tracking-wider">Bet Slip</span>
      <span className="font-mono-num text-sm bg-black/15 rounded-full px-2 py-0.5">{Math.round(totalOdds * 100) / 100}</span>
      <ArrowRight className="w-4 h-4" />
    </Link>
  );
}
