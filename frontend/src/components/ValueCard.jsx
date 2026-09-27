import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, ChevronDown, ChevronUp, ArrowRight, Clock, Check } from "lucide-react";
import { aiExplanation, shortExplanation } from "../lib/valueEngine";
import { UpgradeButton } from "./Gating";
import AddToChartButton from "./AddToChartButton";
import AddToSlipButton from "./AddToSlipButton";
import InfoTip from "./InfoTip";
import { useLiveScores } from "../contexts/LiveScoresContext";
import { useLang } from "../contexts/LanguageContext";
import { usePortfolio } from "../contexts/PortfolioContext";

function fmtKickoff(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function MatchWhen({ match, live }) {
  if (live) {
    return (
      <div className="flex items-center gap-2 mb-3" data-testid={`match-live-${match.id}`}>
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live{live.minute != null ? ` ${live.minute}'` : ""}
        </span>
        <span className="font-display font-black text-white text-sm font-mono-num">{live.homeScore ?? 0}-{live.awayScore ?? 0}</span>
      </div>
    );
  }
  if (match.status === "live") {
    return (
      <div className="flex items-center gap-2 mb-3" data-testid={`match-live-${match.id}`}>
        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
        </span>
        {match.score && <span className="font-display font-black text-white text-sm font-mono-num">{match.score}</span>}
      </div>
    );
  }
  const when = fmtKickoff(match.commence_time);
  if (!when) return null;
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-3" data-testid={`match-kickoff-${match.id}`}>
      <Clock className="w-3.5 h-3.5 text-zinc-500" /> {when}
    </div>
  );
}

function Metric({ label, v, accent, tip }) {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-center">
        {tip ? <InfoTip label={label} text={tip} /> : label}
      </div>
      <div className="font-display font-black text-lg" style={{ color: accent || "#fff" }}>
        {v}
      </div>
    </div>
  );
}

function ProbBar({ label, pct, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[10px] text-zinc-500 uppercase">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-[11px] font-bold text-zinc-300">{Math.round(pct)}%</span>
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
  const live = useLiveScores().get(match.id);
  const { lang } = useLang();
  const [adv, setAdv] = useState(false);
  const navigate = useNavigate();
  const inSlip = usePortfolio().slipHas(match.id, match.home?.name, match.away?.name);
  const probs = value.probabilities || {};
  const isLive = value.liveOnly || match.status === "live";
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAdv((v) => !v);
  };

  return (
    <Link
      to={`/analysis/${match.id}`}
      data-testid={`value-card-${match.id}`}
      data-lang={lang}
      className={`block rounded-xl p-4 transition-all ${
        inSlip
          ? "bg-[#FFD60A]/[0.05] border border-[#FFD60A]/50 hover:border-[#FFD60A]"
          : "bg-[#161b22] border border-[#30363d] hover:border-[#39FF14]/40"
      }`}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 truncate flex items-center gap-1.5">
          {inSlip && (
            <span data-testid={`in-slip-badge-${match.id}`} className="inline-flex items-center gap-1 text-[9px] font-black text-[#FFD60A] bg-[#FFD60A]/15 border border-[#FFD60A]/40 rounded-full px-1.5 py-0.5 whitespace-nowrap">
              <Check className="w-2.5 h-2.5" /> IN SLIP
            </span>
          )}
          {match.leagueName}
        </span>
        {isLive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
          </span>
        ) : (
          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${value.level.cls}`}>
            {value.level.emoji} {value.level.label}
          </span>
        )}
      </div>
      <div className="font-display font-bold text-white text-lg leading-tight mb-2">
        {match.home && match.home.name} <span className="text-zinc-600 text-sm">vs</span> {match.away && match.away.name}
      </div>
      <MatchWhen match={match} live={live} />

      {isLive ? (
        /* Live: no pre-match odds/pick — show LION's live model read */
        <div className="border-t border-white/5 pt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Possible outcome</span>
            <span className="text-[#39FF14] font-black uppercase">{value.possibleOutcome || "—"}</span>
          </div>
          {value.prediction && (
            <div className="flex items-center justify-between text-[11px] mt-1.5 text-zinc-400">
              {(() => { const p = value.prediction; const mx = Math.max(p.home, p.draw, p.away); const c = (x) => (x >= mx ? "#39FF14" : "#fff"); return (<>
                <span>Home <b style={{ color: c(p.home) }}>{p.home}%</b></span>
                <span>Draw <b style={{ color: c(p.draw) }}>{p.draw}%</b></span>
                <span>Away <b style={{ color: c(p.away) }}>{p.away}%</b></span>
              </>); })()}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Simple info — always visible (backend pick = model's prediction) */}
          <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
            <span className="text-zinc-500">Best odds</span>
            <span className="text-white font-bold font-mono-num">
              {value.bestOdds} <span className="text-zinc-500 font-normal">@ {value.bookmaker}</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1.5">
            <span className="text-zinc-500">LION pick</span>
            <span className="text-white font-bold truncate ml-2">{value.pickName}</span>
          </div>
          <p className="text-xs text-zinc-400 mt-2 leading-snug">{shortExplanation(match, value)}</p>
        </>
      )}
      <div className="mt-2 flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#39FF14]" data-testid={`see-analysis-${match.id}`}>
          See Analysis <ArrowRight className="w-3.5 h-3.5" />
        </span>
        <span role="link" tabIndex={0} data-testid={`see-specific-bets-${match.id}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/specific-bets/${match.id}`); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); navigate(`/specific-bets/${match.id}`); } }}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FFD60A] hover:underline cursor-pointer">
          See Specific Bets <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>

      {/* Advanced analysis — hidden by default */}
      <button
        type="button"
        onClick={toggle}
        data-testid={`toggle-advanced-${match.id}`}
        className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-[#39FF14] border border-white/10 rounded-md py-1.5 transition-colors"
      >
        {adv ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {adv ? "Hide Advanced Analysis" : "Show Advanced Analysis"}
      </button>

      {adv && (
        <div className="mt-3 space-y-3" data-testid={`advanced-${match.id}`}>
          {!isLive && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="Value" v={value.valueScore} accent="#39FF14" tip="Overall strength of this betting opportunity (0-100)." />
                <Metric label="Potential Value" v={`${value.ev > 0 ? "+" : ""}${value.ev}%`} accent="#58a6ff" tip="Potential Value — expected return on this pick (formerly 'EV'). Higher is better." />
                <Metric label="Confidence" v={`${value.confidence}%`} accent="#FF9500" tip="How sure the LION model is about this pick." />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 gap-2">
                <span><InfoTip label="LION Estimate" text="Our model's win chance for the pick." /> <b className="text-[#39FF14]">{Math.round(value.mokaProb * 100)}%</b></span>
                <span><InfoTip label="Market Estimate" text="Win chance implied by bookmaker odds." /> <b className="text-zinc-200">{Math.round(value.bookProb * 100)}%</b></span>
                <span><InfoTip label="Market Difference" text="Gap between LION Estimate and Market Estimate (formerly 'Edge')." /> <b className="text-white">{value.edge > 0 ? "+" : ""}{value.edge}</b></span>
              </div>
            </>
          )}
          {(probs.home != null || probs.away != null) && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                <InfoTip label="Probability breakdown" text="LION's estimated chance of each outcome." />
              </div>
              <ProbBar label="Home" pct={probs.home || 0} color="#39FF14" />
              {probs.draw != null && <ProbBar label="Draw" pct={probs.draw || 0} color="#71717A" />}
              <ProbBar label="Away" pct={probs.away || 0} color="#58a6ff" />
            </div>
          )}
          {!isLive && <p className="text-[11px] text-zinc-500">{aiExplanation(match, value)}</p>}
          {isLive && <p className="text-[11px] text-zinc-500">Live model read — open the match for full analysis and live statistics.</p>}
        </div>
      )}

      {!isLive && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <AddToChartButton entry={entry} className="w-full justify-center" />
          <AddToSlipButton entry={entry} className="w-full" />
        </div>
      )}
    </Link>
  );
}
