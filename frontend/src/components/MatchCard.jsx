import React, { useState } from "react";
import { Link } from "react-router-dom";
import TeamCrest from "./TeamCrest";
import { Sparkles, TrendingUp, ExternalLink, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { BOOKMAKERS } from "../lib/fsl";

// ── Signal styling ──────────────────────────────────────────────────────────
const SIGNAL_STYLES = {
  HIGH:   { label: "HIGH VALUE",   cls: "bg-[#1a0d0d] text-[#ff6b6b]   border border-[#3d1a1a]" },
  MEDIUM: { label: "MEDIUM VALUE", cls: "bg-[#1a110d] text-[#f0a000]   border border-[#3d2800]" },
  LOW:    { label: "LOW VALUE",    cls: "bg-[#0d1a0d] text-[#3fb950]   border border-[#1a3d1a]" },
};

const RISK_STYLES = {
  HIGH:   "bg-[#1a0d0d] text-[#ff6b6b]",
  MEDIUM: "bg-[#1a110d] text-[#f0a000]",
  LOW:    "bg-[#0d1a0d] text-[#3fb950]",
};

function ConfidenceBar({ value = 0, signal }) {
  const color = signal === "HIGH" ? "#ff6b6b" : signal === "MEDIUM" ? "#f0a000" : "#3fb950";
  return (
    <div className="flex-1 min-w-[90px]">
      <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
        <span>Confidence</span><span>{value}%</span>
      </div>
      <div className="h-1 rounded-full bg-[#21262d] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, background: color }}
        />
      </div>
    </div>
  );
}

function FormDots({ form = [] }) {
  const colors = { W: "bg-[#3fb950]", D: "bg-[#d29922]", L: "bg-[#f85149]" };
  return (
    <div className="flex gap-1 justify-center mt-1">
      {form.slice(-5).map((r, i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${colors[r] || "bg-zinc-600"}`} />
      ))}
    </div>
  );
}

// ── Match Card ──────────────────────────────────────────────────────────────
export const MatchCard = ({ match, compact = false, delay = 0, isPro = false }) => {
  const [expanded, setExpanded] = useState(false);

  if (!match) return null;

  const {
    id, home, away, status, homeScore, awayScore, minute, leagueName,
    aiSummary, aiBullets = [], valueSignal, confidence, valueExplanation,
    riskLevel, xgHome, xgAway,
  } = match;

  const isLive     = status === "live";
  const isFinished = status === "finished";
  const showScore  = isLive || isFinished;

  const scoreColor = isLive ? "text-[#39FF14]" : isFinished ? "text-zinc-200" : "text-zinc-500";
  const signal     = SIGNAL_STYLES[valueSignal] || SIGNAL_STYLES.LOW;

  const statusBadge = isLive
    ? <span className="flex items-center gap-1 text-[10px] font-bold text-[#f0c000] bg-[#1a1a0a] border border-[#3d3000] px-2 py-0.5 rounded-full uppercase animate-pulse">
        ● LIVE · {minute}'
      </span>
    : isFinished
    ? <span className="text-[10px] font-bold text-[#3fb950] bg-[#0d1a0d] border border-[#1a3d1a] px-2 py-0.5 rounded-full uppercase">FT</span>
    : <span className="text-[10px] font-bold text-[#58a6ff] bg-[#0a0a1a] border border-[#1a1a3d] px-2 py-0.5 rounded-full uppercase">NS</span>;

  return (
    <div
      className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden transition-all duration-150 hover:border-[#58a6ff] hover:-translate-y-px fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Card header */}
      <div className="px-4 py-3 bg-[#21262d] border-b border-[#30363d] flex justify-between items-center">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{leagueName}</span>
        {statusBadge}
      </div>

      {/* Score section */}
      <Link to={`/match/${id}`} className="block px-4 py-4 border-b border-[#30363d]">
        <div className="flex items-center justify-between gap-4">
          {/* Home */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <TeamCrest short={home?.short} color={home?.color} logoUrl={home?.logoUrl} size={compact ? 28 : 36} />
            <span className="text-[13px] font-semibold text-zinc-100 text-center leading-tight">{home?.name}</span>
            <FormDots form={home?.form || []} />
          </div>

          {/* Score */}
          <div className="flex flex-col items-center min-w-[56px]">
            <div className={`text-2xl font-black font-mono tracking-widest ${scoreColor}`}>
              {showScore ? `${homeScore ?? 0} - ${awayScore ?? 0}` : "VS"}
            </div>
            {!showScore && match.predictedStrength && (
              <div className="flex items-center gap-1 mt-1 text-[10px] font-bold">
                <span className="text-[#39FF14]">{match.predictedStrength.home}%</span>
                <span className="text-zinc-600">·</span>
                <span className="text-[#f0a000]">{match.predictedStrength.draw}%</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400">{match.predictedStrength.away}%</span>
              </div>
            )}
          </div>

          {/* Away */}
          <div className="flex-1 flex flex-col items-center gap-1">
            <TeamCrest short={away?.short} color={away?.color} logoUrl={away?.logoUrl} size={compact ? 28 : 36} />
            <span className="text-[13px] font-semibold text-zinc-100 text-center leading-tight">{away?.name}</span>
            <FormDots form={away?.form || []} />
          </div>
        </div>
      </Link>

      {/* AI Insights section */}
      <div className="px-4 py-3 border-b border-[#30363d]">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
          <Sparkles className="w-3 h-3 text-[#58a6ff]" /> AI Analysis
          {riskLevel && (
            <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold ${RISK_STYLES[riskLevel] || ""}`}>
              Risk: {riskLevel}
            </span>
          )}
        </div>
        <p className="text-[12px] text-zinc-400 leading-relaxed mb-2">
          {aiSummary || "Analysis temporarily unavailable."}
        </p>
        {aiBullets.length > 0 && (
          <div className="space-y-1">
            {(expanded || isPro ? aiBullets : aiBullets.slice(0, 2)).map((b, i) => (
              <div key={i} className="flex gap-1.5 text-[12px] text-zinc-400">
                <span className="text-[#58a6ff] font-bold shrink-0">›</span>
                {isPro || i < 2 ? b : <span className="flex items-center gap-1 text-zinc-600"><Lock className="w-3 h-3" /> Pro insight</span>}
              </div>
            ))}
            {!isPro && aiBullets.length > 2 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1 text-[11px] text-[#58a6ff] mt-1 hover:text-blue-300"
              >
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? "Show less" : `+${aiBullets.length - 2} more (Pro)`}
              </button>
            )}
          </div>
        )}
        {/* Pro xG row */}
        {isPro && xgHome != null && (
          <div className="mt-2 flex gap-3 text-[11px] text-zinc-500">
            <span>xG {home?.short}: <b className="text-zinc-300">{xgHome}</b></span>
            <span>xG {away?.short}: <b className="text-zinc-300">{xgAway}</b></span>
          </div>
        )}
      </div>

      {/* Value signal */}
      <div className="px-4 py-2.5 border-b border-[#30363d] flex items-center gap-3 flex-wrap">
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide ${signal.cls}`}>
          ▲ {signal.label}
        </span>
        <ConfidenceBar value={confidence || 0} signal={valueSignal} />
        {valueExplanation && (
          <p className="w-full text-[11px] text-zinc-500 mt-1">{valueExplanation}</p>
        )}
      </div>

      {/* Bookmaker links */}
      <div className="px-4 py-3">
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
          📎 Check odds on
        </div>
        <div className="flex gap-2 flex-wrap">
          {BOOKMAKERS.map((b) => (
            <a
              key={b.name}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#30363d] bg-[#21262d] text-[11px] font-semibold text-zinc-400 hover:border-[#58a6ff] hover:text-[#58a6ff] hover:bg-[rgba(88,166,255,0.05)] transition-all"
            >
              <ExternalLink className="w-3 h-3" /> {b.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MatchCard;
