import React from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { aiExplanation } from "../lib/valueEngine";
import { UpgradeButton } from "./Gating";

function Metric({ label, v, accent }) {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="font-display font-black text-lg" style={{ color: accent || "#fff" }}>
        {v}
      </div>
    </div>
  );
}

export function LockedValueCard() {
  return (
    <div className="relative bg-[#161b22] border border-[#30363d] rounded-xl p-4 overflow-hidden min-h-[12rem]" data-testid="locked-value-card">
      <div className="blur-sm select-none pointer-events-none space-y-3">
        <div className="h-3 w-1/3 bg-[#21262d] rounded" />
        <div className="h-5 w-2/3 bg-[#21262d] rounded" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-12 bg-[#21262d] rounded" />
          <div className="h-12 bg-[#21262d] rounded" />
          <div className="h-12 bg-[#21262d] rounded" />
        </div>
        <div className="h-3 w-full bg-[#21262d] rounded" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 p-4 text-center">
        <div className="flex items-center gap-1.5 text-zinc-200 text-sm font-semibold">
          <Lock className="w-4 h-4" /> Upgrade to Pro to unlock more value opportunities
        </div>
        <UpgradeButton size="sm" />
      </div>
    </div>
  );
}

export default function ValueCard({ entry }) {
  const { match, value } = entry;
  return (
    <Link
      to={`/analysis/${match.id}`}
      data-testid={`value-card-${match.id}`}
      className="block bg-[#161b22] border border-[#30363d] rounded-xl p-4 hover:border-[#39FF14]/40 transition-all"
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 truncate">{match.leagueName}</span>
        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${value.level.cls}`}>
          {value.level.emoji} {value.level.label}
        </span>
      </div>
      <div className="font-display font-bold text-white text-lg leading-tight mb-3">
        {match.home && match.home.name} <span className="text-zinc-600 text-sm">vs</span> {match.away && match.away.name}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <Metric label="Value" v={value.valueScore} accent="#39FF14" />
        <Metric label="EV" v={`${value.ev > 0 ? "+" : ""}${value.ev}%`} accent="#58a6ff" />
        <Metric label="Conf" v={`${value.confidence}%`} accent="#FF9500" />
      </div>
      <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
        <span className="text-zinc-500">Best odds</span>
        <span className="text-white font-bold font-mono-num">
          {value.bestOdds} <span className="text-zinc-500 font-normal">@ {value.bookmaker}</span>
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] mt-2 text-zinc-400 gap-2">
        <span>Moka <b className="text-[#39FF14]">{Math.round(value.mokaProb * 100)}%</b></span>
        <span>Market <b className="text-zinc-200">{Math.round(value.bookProb * 100)}%</b></span>
        <span className="truncate">Pick <b className="text-white">{value.pickName}</b></span>
      </div>
      <p className="text-[11px] text-zinc-500 mt-2">{aiExplanation(match, value)}</p>
    </Link>
  );
}
