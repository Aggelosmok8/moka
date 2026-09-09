import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Lock, ExternalLink, X, Loader2, Sparkles } from "lucide-react";
import Header from "../components/Header";
import { UpgradeButton } from "../components/Gating";
import AddToPortfolioButton from "../components/AddToPortfolioButton";
import AddToChartButton from "../components/AddToChartButton";
import AddToSlipButton from "../components/AddToSlipButton";
import { bookmakerUrl } from "../lib/bookmakers";
import { useEntitlements } from "../hooks/useEntitlements";
import { fetchMatchById, fetchMatchAi } from "../lib/catalogApi";
import { adaptValue, aiExplanation, whyMokaReasons } from "../lib/valueEngine";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#0d1117]">
    <Header />
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
  </div>
);
const Card = ({ title, children, testId }) => (
  <section data-testid={testId} className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 mb-4">
    {title && <h3 className="font-display font-bold uppercase tracking-tight text-sm text-white mb-3">{title}</h3>}
    {children}
  </section>
);
const Bar = ({ label, pct, color, hi }) => (
  <div className="mb-2">
    <div className="flex justify-between text-xs text-zinc-400 mb-1">
      <span>{label}</span><span className="font-bold" style={{ color: hi ? "#39FF14" : "#fff" }}>{pct}%</span>
    </div>
    <div className="h-2 rounded-full bg-[#0d1117] overflow-hidden">
      <div style={{ width: `${pct}%`, background: color }} className="h-full" />
    </div>
  </div>
);

function StatsTable({ home = {}, away = {}, hn, an }) {
  const fmt = (v) => (v === null || v === undefined || v === "") ? "N/A" : String(v);
  const keys = Object.keys(home).filter((k) => k !== "form");
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] text-zinc-500 uppercase">
          <th className="text-left p-1">{hn}</th><th className="text-center p-1">Stat</th><th className="text-right p-1">{an}</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t border-white/5">
            <td className="p-1 text-white">{fmt(home[k])}</td>
            <td className="p-1 text-center text-zinc-500">{k}</td>
            <td className="p-1 text-right text-white">{fmt(away[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const LIVE_STAT_ORDER = ["Ball Possession", "Total Shots", "Shots on Goal", "Shots off Goal",
  "Shots insidebox", "Shots outsidebox", "Corner Kicks", "Fouls", "Offsides",
  "Yellow Cards", "Red Cards", "Goalkeeper Saves", "Total passes", "Passes accurate", "Passes %"];

function LiveStats({ home = {}, away = {}, hn, an }) {
  const ordered = LIVE_STAT_ORDER.filter((k) => home[k] != null || away[k] != null);
  const extra = [...new Set([...Object.keys(home || {}), ...Object.keys(away || {})])].filter((k) => !LIVE_STAT_ORDER.includes(k));
  const all = [...ordered, ...extra];
  if (!all.length) return <div className="text-sm text-zinc-500">No live statistics available yet — they appear as the match develops.</div>;
  return (
    <div className="space-y-1.5" data-testid="live-stats-table">
      <div className="grid grid-cols-[1fr_auto_1fr] text-[10px] uppercase tracking-wider text-zinc-500 pb-1">
        <span className="text-right truncate">{hn || "Home"}</span><span className="px-2" /><span className="text-left truncate">{an || "Away"}</span>
      </div>
      {all.map((k) => (
        <div key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="text-right font-display font-black text-white font-mono-num">{home?.[k] ?? "—"}</span>
          <span className="text-center text-[10px] uppercase tracking-wider text-zinc-500 px-2 whitespace-nowrap">{k}</span>
          <span className="text-left font-display font-black text-white font-mono-num">{away?.[k] ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

export default function MatchAnalysisPage() {
  const { id } = useParams();
  const { role } = useEntitlements();
  const isPro = role === "pro";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchMatchById(id)
      .then((d) => active && setData(d))
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    setAiLoading(true); setAi(null);
    fetchMatchAi(id)
      .then((d) => active && setAi(d))
      .catch(() => active && setAi(null))
      .finally(() => active && setAiLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) return <Shell><div className="h-64 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" /></Shell>;
  if (notFound || !data) return <Shell><div className="text-center py-16 text-zinc-400">Match not found.</div></Shell>;

  const match = data;
  const value = adaptValue(data.value);
  const probs = value.probabilities || {};
  const live = match.live || null;
  const isLive = match.status === "live" || value.liveOnly;
  const lp = value.livePrediction;
  const afterHt = !!(lp && lp.after_ht);
  // One source of truth: the backend `pick` IS the model's prediction. Just show it.
  const outcomeKey = value.pick;
  const outcomeName = value.pickName;

  // Available odds for the Moka pick, sorted best (highest) to worst.
  const oddsRows = (match.odds || [])
    .map((o) => ({ bookmaker: o.bookmaker, price: (o.odds && o.odds[outcomeKey]) || 0 }))
    .filter((o) => o.price > 0)
    .sort((a, b) => b.price - a.price);

  return (
    <Shell>
      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to matches
      </Link>
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{match.leagueName}</div>
      <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white mb-4">
        {match.home && match.home.name} <span className="text-zinc-600 text-xl">vs</span> {match.away && match.away.name}
      </h1>

      {isLive && (
        <Card testId="live-header">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live{live && live.minute != null ? ` ${live.minute}'` : ""}
            </span>
            <span className="font-display font-black text-white text-3xl font-mono-num" data-testid="live-scoreline">
              {(live && live.homeScore) ?? 0}<span className="text-zinc-600 mx-2">-</span>{(live && live.awayScore) ?? 0}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">Match in play — odds and value picks do not apply live. Below is Moka's model read of the game plus the live match statistics.</p>
        </Card>
      )}

      {isLive && value.liveAnalysis && (
        <Card title="Live Analysis" testId="live-analysis">
          <p className="text-sm text-zinc-300 leading-relaxed">{value.liveAnalysis}</p>
        </Card>
      )}

      {isLive && lp && (
        <Card title="Live Prediction" testId="live-prediction">
          <Bar label={(match.home && match.home.name) || "Home"} pct={lp.home} color={lp.home >= Math.max(lp.home, lp.draw, lp.away) ? "#39FF14" : "#3f3f46"} hi={lp.home >= Math.max(lp.home, lp.draw, lp.away)} />
          <Bar label="Draw" pct={lp.draw} color={lp.draw >= Math.max(lp.home, lp.draw, lp.away) ? "#39FF14" : "#3f3f46"} hi={lp.draw >= Math.max(lp.home, lp.draw, lp.away)} />
          <Bar label={(match.away && match.away.name) || "Away"} pct={lp.away} color={lp.away >= Math.max(lp.home, lp.draw, lp.away) ? "#39FF14" : "#3f3f46"} hi={lp.away >= Math.max(lp.home, lp.draw, lp.away)} />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Live outcome</span>
            <span className="text-[#39FF14] font-black uppercase" data-testid="live-possible-outcome">{lp.possible_outcome}</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">Recalculated from the live score{lp.minute != null ? ` (${lp.minute}')` : ""} and the remaining expected goals.{afterHt && value.possibleOutcome ? ` Pre-match view (historical): ${value.possibleOutcome}.` : ""}</p>
        </Card>
      )}

      {/* MOKA LEAN — aligned to the model's expected outcome */}
      {!isLive && (
      <Card testId="moka-pick">
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Moka Lean</div>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="font-display font-black text-2xl text-[#39FF14]">{value.possibleOutcome || value.pickName}</div>
            <div className="text-sm text-zinc-400 mt-0.5">Moka's expected outcome from recent form &amp; scoring</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <AddToChartButton entry={{ match, value }} className="w-full justify-center" />
          <AddToSlipButton entry={{ match, value }} size="md" className="w-full" />
        </div>
      </Card>
      )}

      {/* MOKA AI ANALYSIS */}
      <Card testId="ai-analysis">
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-4 h-4 text-[#39FF14]" />
          <h3 className="font-display font-bold uppercase tracking-tight text-sm text-white">Moka Analysis</h3>
        </div>
        {aiLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Writing the Moka analysis… <span className="text-zinc-600">first view takes a few seconds, then it's instant</span></div>
        ) : ai && ai.analysis ? (
          <div className="space-y-3" data-testid="ai-analysis-text">
            {ai.analysis.split(/\n+/).filter(Boolean).map((para, i) => (
              <p key={i} className="text-sm text-zinc-300 leading-relaxed">{para}</p>
            ))}
            {ai.possible_outcome && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Possible outcome</span>
                <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30">{ai.possible_outcome}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-zinc-500 py-2">AI analysis is temporarily unavailable — the Moka model prediction is shown below.</div>
        )}
        <p className="text-[10px] text-zinc-600 mt-3">Generated by Moka AI from the model's data · interpretation only, not a guarantee.</p>
      </Card>

      {/* WHY MOKA LIKES IT */}
      {!isLive && (
      <Card title="Why Moka likes it" testId="why-moka">
        <ul className="space-y-2">
          {whyMokaReasons(match, value).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <Check className="w-4 h-4 text-[#39FF14] mt-0.5 shrink-0" /> {r}
            </li>
          ))}
        </ul>
      </Card>
      )}

      {/* MOKA PREDICTION — basic, visible to all */}
      {value.prediction && !afterHt && (
        <Card title={isLive ? "Pre-match Prediction" : "Moka Prediction"} testId="moka-prediction">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Possible outcome</span>
            <span data-testid="possible-outcome" className="text-sm font-black uppercase px-3 py-1 rounded-full bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30">
              {value.possibleOutcome}
            </span>
          </div>
          <Bar label={(match.home && match.home.name) || "Home"} pct={value.prediction.home} color={value.prediction.home >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away) ? "#39FF14" : "#3f3f46"} hi={value.prediction.home >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away)} />
          <Bar label="Draw" pct={value.prediction.draw} color={value.prediction.draw >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away) ? "#39FF14" : "#3f3f46"} hi={value.prediction.draw >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away)} />
          <Bar label={(match.away && match.away.name) || "Away"} pct={value.prediction.away} color={value.prediction.away >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away) ? "#39FF14" : "#3f3f46"} hi={value.prediction.away >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away)} />
          {value.signals && value.signals.h2h && (
            <p className="text-[11px] text-zinc-500 mt-3" data-testid="prediction-h2h">
              Recent head-to-head: <b className="text-zinc-300">{value.signals.h2h.home}W</b> · {value.signals.h2h.draw}D · <b className="text-zinc-300">{value.signals.h2h.away}W</b> (adjusted into the model)
            </p>
          )}
        </Card>
      )}

      {/* GOAL MARKETS — basic */}
      {value.prediction && (
        <Card title="Goal Markets" testId="goal-markets">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
              <div className="text-[10px] uppercase text-zinc-500 mb-1.5">Over / Under 2.5</div>
              <div className="text-sm text-zinc-300">Over <b className="font-mono-num" style={{ color: value.prediction.over25 >= value.prediction.under25 ? "#39FF14" : "#fff" }}>{value.prediction.over25}%</b> · Under <b className="font-mono-num" style={{ color: value.prediction.under25 > value.prediction.over25 ? "#39FF14" : "#fff" }}>{value.prediction.under25}%</b></div>
            </div>
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
              <div className="text-[10px] uppercase text-zinc-500 mb-1.5">Both teams to score</div>
              <div className="text-sm text-zinc-300">Yes <b className="font-mono-num" style={{ color: value.prediction.btts_yes >= value.prediction.btts_no ? "#39FF14" : "#fff" }}>{value.prediction.btts_yes}%</b> · No <b className="font-mono-num" style={{ color: value.prediction.btts_no > value.prediction.btts_yes ? "#39FF14" : "#fff" }}>{value.prediction.btts_no}%</b></div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">xG Home</div><div className="font-display font-black text-lg text-white font-mono-num">{value.prediction.xg_home}</div></div>
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">xG Away</div><div className="font-display font-black text-lg text-white font-mono-num">{value.prediction.xg_away}</div></div>
            <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">xG Total</div><div className="font-display font-black text-lg text-[#39FF14] font-mono-num">{value.prediction.xg_total}</div></div>
          </div>
          <p className="text-[11px] text-zinc-500 mt-3">Moka's model estimate from recent scoring &amp; form — not a guarantee.</p>
        </Card>
      )}

      {/* LIVE MATCH STATISTICS */}
      {isLive && live && live.stats && (
        <Card title="Live match statistics" testId="live-stats">
          <LiveStats home={live.stats.home} away={live.stats.away} hn={match.home && match.home.name} an={match.away && match.away.name} />
          <p className="text-[11px] text-zinc-500 mt-3">Real-time statistics from the match, updated as it develops.</p>
        </Card>
      )}

      {/* AVAILABLE ODDS */}
      {!isLive && (
      <Card title="Available Odds" testId="available-odds">
        <div className="space-y-1.5">
          {oddsRows.length === 0 && <div className="text-sm text-zinc-500">No odds available.</div>}
          {oddsRows.map((o, i) => (
            <a
              key={o.bookmaker}
              href={bookmakerUrl(o.bookmaker)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`odds-link-${i}`}
              title={`Bet with ${o.bookmaker}`}
              className={`group flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${i === 0 ? "bg-[#39FF14]/10 border border-[#39FF14]/40 hover:bg-[#39FF14]/20" : "bg-[#0d1117] border border-[#30363d] hover:border-[#39FF14]/40"}`}
            >
              <span className={`text-sm flex items-center gap-1.5 ${i === 0 ? "text-[#39FF14] font-bold" : "text-zinc-300"}`}>
                {o.bookmaker}
                {i === 0 && <span className="text-[10px] uppercase">Best</span>}
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
              <span className={`font-mono-num font-bold ${i === 0 ? "text-[#39FF14]" : "text-white"}`}>{o.price}</span>
            </a>
          ))}
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">Tap any bookmaker to look them up · odds for {outcomeName}, best to worst.</div>
      </Card>
      )}

      {/* ADVANCED STATISTICS — PRO only, Free sees an upsell */}
      {isPro ? (
        <>
          <button
            type="button"
            onClick={() => setShowAdv((v) => !v)}
            data-testid="toggle-advanced-stats"
            className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-[#39FF14] border border-white/10 rounded-md py-2 mb-4 transition-colors"
          >
            {showAdv ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showAdv ? "Hide advanced statistics" : "Show advanced statistics"}
          </button>

          {showAdv && (
            <div data-testid="advanced-stats">
              <Card title="Team Statistics">
                <StatsTable home={match.homeTeam} away={match.awayTeam} hn={match.home && match.home.name} an={match.away && match.away.name} />
                <p className="text-[11px] text-zinc-500 mt-2">Values shown as N/A are not available for this league/match.</p>
              </Card>
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setShowUpsell(true)}
          data-testid="advanced-pro-lock"
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300 hover:text-[#39FF14] border border-[#39FF14]/30 bg-[#39FF14]/5 rounded-md py-2 mb-4 transition-colors"
        >
          <Lock className="w-3.5 h-3.5" /> Show advanced statistics — Pro
        </button>
      )}

      {showUpsell && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowUpsell(false)} data-testid="advanced-upsell-modal">
          <div className="relative w-full max-w-sm bg-[#161b22] border border-[#30363d] rounded-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowUpsell(false)} data-testid="upsell-close" className="absolute top-3 right-3 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            <div className="w-12 h-12 mx-auto rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14] mb-3"><Lock className="w-6 h-6" /></div>
            <h3 className="font-display font-black uppercase tracking-tight text-white text-lg">Advanced statistics</h3>
            <p className="text-sm text-zinc-400 mt-2">Unlock the full Moka model breakdown, Moka-vs-market analysis and detailed team &amp; player statistics with Pro.</p>
            <div className="mt-4"><UpgradeButton label="Upgrade to Pro" /></div>
            <button onClick={() => setShowUpsell(false)} className="mt-3 text-xs text-zinc-500 hover:text-white">Maybe later</button>
          </div>
        </div>
      )}
    </Shell>
  );
}
