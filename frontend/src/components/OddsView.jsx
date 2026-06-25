import React from "react";
import { ExternalLink, Info, TrendingUp, Shield } from "lucide-react";
import { BOOKMAKERS, computeValueScore, generateMatchInsight } from "../lib/fsl";
import { useAuth } from "../contexts/AuthContext";

const SIGNAL_COLORS = {
  HIGH:   { text: "text-[#ff6b6b]", bg: "bg-[#1a0d0d]", border: "border-[#3d1a1a]" },
  MEDIUM: { text: "text-[#f0a000]", bg: "bg-[#1a110d]", border: "border-[#3d2800]" },
  LOW:    { text: "text-[#3fb950]", bg: "bg-[#0d1a0d]", border: "border-[#1a3d1a]" },
};

export default function OddsView({ matchId, match }) {
  const { isPro } = useAuth();

  if (!match && !matchId) return null;

  const homeTeam  = match?.homeTeam || {};
  const awayTeam  = match?.awayTeam || {};
  const value     = match ? computeValueScore(homeTeam, awayTeam) : {};
  const insight   = match ? generateMatchInsight(match) : {};

  const signal    = value.valueSignal || match?.valueSignal || "LOW";
  const conf      = value.confidence  || match?.confidence  || 0;
  const sc        = SIGNAL_COLORS[signal] || SIGNAL_COLORS.LOW;

  return (
    <section className="mt-6 surface rounded-xl overflow-hidden fade-up" style={{ animationDelay: "340ms" }}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#39FF14]" />
          Value Analysis & Bookmakers
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          Heuristic value signals based on form, attack strength, and home advantage.
          No real-time odds are fetched.
        </p>
      </div>

      {/* Value signal */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-4 flex-wrap">
          <div className={`px-4 py-2 rounded-lg border text-sm font-bold ${sc.bg} ${sc.border} ${sc.text}`}>
            ▲ VALUE SIGNAL: {signal}
          </div>
          <div className="flex-1 min-w-[120px]">
            <div className="flex justify-between text-[11px] text-zinc-500 mb-1.5">
              <span>Confidence Score</span>
              <span className="font-bold text-zinc-300">{conf}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${conf}%`,
                  background: signal === "HIGH" ? "#ff6b6b" : signal === "MEDIUM" ? "#f0a000" : "#3fb950",
                }}
              />
            </div>
          </div>
        </div>
        {value.valueExplanation && (
          <p className="mt-3 text-sm text-zinc-400">{value.valueExplanation}</p>
        )}
      </div>

      {/* Pro-only advanced metrics */}
      {isPro ? (
        <div className="px-6 py-5 border-b border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">xG Home</div>
            <div className="text-lg font-bold text-white mt-0.5">{insight.xgHome ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">xG Away</div>
            <div className="text-lg font-bold text-white mt-0.5">{insight.xgAway ?? "—"}</div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Risk Level</div>
            <div className={`text-lg font-bold mt-0.5 ${SIGNAL_COLORS[insight.riskLevel]?.text || "text-white"}`}>
              {insight.riskLevel ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Favorite</div>
            <div className="text-lg font-bold text-white mt-0.5 capitalize">{value.favorite ?? "—"}</div>
          </div>
        </div>
      ) : (
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 bg-[#39FF14]/5">
          <Shield className="w-4 h-4 text-[#39FF14] shrink-0" />
          <p className="text-sm text-zinc-300">
            <span className="font-bold text-[#39FF14]">Pro</span> unlocks xG analysis, risk factors, form breakdown, and advanced predictions.
          </p>
          <a
            href="/pricing"
            className="ml-auto shrink-0 px-3 py-1.5 rounded-md bg-[#39FF14] text-black text-xs font-bold hover:bg-[#32E612] transition-colors"
          >
            Upgrade
          </a>
        </div>
      )}

      {/* Static bookmaker links */}
      <div className="px-6 py-5">
        <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> Place your bets on
        </div>
        <div className="grid grid-cols-3 gap-3">
          {BOOKMAKERS.map((b) => (
            <a
              key={b.name}
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-white/10 bg-white/3 hover:border-[#58a6ff] hover:bg-[rgba(88,166,255,0.05)] transition-all text-center group"
            >
              <span className="text-2xl">{b.icon}</span>
              <span className="text-xs font-bold text-zinc-300 group-hover:text-[#58a6ff]">{b.name}</span>
              <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                <ExternalLink className="w-2.5 h-2.5" /> Check odds
              </span>
            </a>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="mt-4 p-3 rounded-md bg-white/3 border border-white/10 text-[11px] text-zinc-500 leading-relaxed">
          <strong className="text-yellow-500">⚠ Disclaimer:</strong> This platform does not provide betting advice.
          AI signals are heuristic indicators only, based on public form data.
          Always gamble responsibly. 18+ only.
        </div>
      </div>
    </section>
  );
}
