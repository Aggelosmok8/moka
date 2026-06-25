import React from "react";
import FormBadges from "./FormBadges";

const STATUS = {
  live: { label: "LIVE", cls: "text-[#39FF14] bg-[#39FF14]/10" },
  upcoming: { label: "UPCOMING", cls: "text-[#58a6ff] bg-[#58a6ff]/10" },
  finished: { label: "FT", cls: "text-zinc-400 bg-white/5" },
};

function TeamRow({ team, stats, unit }) {
  const form = Array.isArray(stats?.form) ? stats.form.slice(-5) : [];
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-semibold text-white truncate">{team?.name || "—"}</span>
      <div className="flex items-center gap-3 shrink-0">
        {form.length > 0 && <FormBadges form={form} size="sm" />}
        <span className="text-xs text-zinc-400 font-mono-num">
          {stats?.goalsPerGame ?? "—"} <span className="text-zinc-600">{unit}</span>
        </span>
      </div>
    </div>
  );
}

// Shared match card for BOTH football and basketball (same design system).
export default function CatalogMatchCard({ match, onOpen, delay = 0 }) {
  const isBasket = match.sport === "basketball";
  const unit = isBasket ? "PPG" : "GPG";
  const st = STATUS[match.status] || STATUS.upcoming;
  return (
    <button
      type="button"
      onClick={() => onOpen(match)}
      data-testid={`match-card-${match.id}`}
      className="text-left w-full bg-[#161b22] border border-[#30363d] rounded-xl p-4 hover:border-[#39FF14]/40 transition-all fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 truncate">
          {match.leagueName}
        </span>
        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
      </div>
      <div className="space-y-2">
        <TeamRow team={match.home} stats={match.homeTeam} unit={unit} />
        <TeamRow team={match.away} stats={match.awayTeam} unit={unit} />
      </div>
    </button>
  );
}
