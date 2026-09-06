import React from "react";
import { Link } from "react-router-dom";
import { useLiveScores } from "../contexts/LiveScoresContext";

export default function LiveTicker() {
  const { list } = useLiveScores();
  if (!list || list.length === 0) return null;
  const items = list.slice(0, 60);

  const Row = ({ k }) => (
    <div className="flex items-center shrink-0" aria-hidden={k === 2}>
      {items.map((m, i) => (
        <Link
          key={`${k}-${m.id}-${i}`}
          to={`/analysis/${m.id}`}
          className="inline-flex items-center gap-1.5 px-4 whitespace-nowrap text-xs hover:opacity-80"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-zinc-500">{m.league}</span>
          <span className="text-zinc-200 font-semibold">{m.home}</span>
          <span className="text-[#39FF14] font-black font-mono-num">{m.homeScore ?? 0}-{m.awayScore ?? 0}</span>
          <span className="text-zinc-200 font-semibold">{m.away}</span>
          {m.minute != null && <span className="text-zinc-500 font-mono-num">{m.minute}'</span>}
          <span className="text-zinc-700 px-2">•</span>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="bg-black border-b border-white/10 overflow-hidden" data-testid="live-ticker">
      <style>{`@keyframes moka-ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
      <div className="flex items-center">
        <span className="shrink-0 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
        </span>
        <div className="relative flex-1 overflow-hidden py-1.5">
          <div className="flex w-max" style={{ animation: "moka-ticker 95s linear infinite" }}>
            <Row k={1} />
            <Row k={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
