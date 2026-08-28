import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Lock } from "lucide-react";
import Header from "../components/Header";
import { UpgradeButton } from "../components/Gating";
import AddToPortfolioButton from "../components/AddToPortfolioButton";
import { useEntitlements } from "../hooks/useEntitlements";
import { fetchMatchById } from "../lib/catalogApi";
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
const Bar = ({ label, pct, color }) => (
  <div className="mb-2">
    <div className="flex justify-between text-xs text-zinc-400 mb-1">
      <span>{label}</span><span className="font-bold text-white">{pct}%</span>
    </div>
    <div className="h-2 rounded-full bg-[#0d1117] overflow-hidden">
      <div style={{ width: `${pct}%`, background: color }} className="h-full" />
    </div>
  </div>
);

function StatsTable({ home = {}, away = {}, hn, an }) {
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
            <td className="p-1 text-white">{String(home[k])}</td>
            <td className="p-1 text-center text-zinc-500">{k}</td>
            <td className="p-1 text-right text-white">{String(away[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

  useEffect(() => {
    let active = true;
    fetchMatchById(id)
      .then((d) => active && setData(d))
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  if (loading) return <Shell><div className="h-64 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" /></Shell>;
  if (notFound || !data) return <Shell><div className="text-center py-16 text-zinc-400">Match not found.</div></Shell>;

  const match = data;
  const value = adaptValue(data.value);
  const probs = value.probabilities || {};
  const pick = value.pick;

  // Available odds — every bookmaker for the pick, sorted best (highest) to worst.
  const oddsRows = (match.odds || [])
    .map((o) => ({ bookmaker: o.bookmaker, price: (o.odds && o.odds[pick]) || 0 }))
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

      {/* MOKA PICK */}
      <Card testId="moka-pick">
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Moka Pick</div>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="font-display font-black text-2xl text-white">{value.pickName}</div>
            <div className="text-sm text-zinc-400 mt-0.5">Best odds <b className="text-white font-mono-num">{value.bestOdds}</b> <span className="text-zinc-500">@ {value.bookmaker}</span></div>
          </div>
          <span className={`text-xs font-black uppercase px-3 py-1 rounded-full ${value.level.cls}`}>{value.level.emoji} {value.level.label}</span>
        </div>
        <div className="mt-4">
          <AddToPortfolioButton entry={{ match, value }} size="md" className="w-full" />
        </div>
      </Card>

      {/* WHY MOKA LIKES IT */}
      <Card title="Why Moka likes it" testId="why-moka">
        <ul className="space-y-2">
          {whyMokaReasons(match, value).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
              <Check className="w-4 h-4 text-[#39FF14] mt-0.5 shrink-0" /> {r}
            </li>
          ))}
        </ul>
      </Card>

      {/* AVAILABLE ODDS */}
      <Card title="Available Odds" testId="available-odds">
        <div className="space-y-1.5">
          {oddsRows.length === 0 && <div className="text-sm text-zinc-500">No odds available.</div>}
          {oddsRows.map((o, i) => (
            <div key={o.bookmaker} className={`flex items-center justify-between rounded-lg px-3 py-2 ${i === 0 ? "bg-[#39FF14]/10 border border-[#39FF14]/40" : "bg-[#0d1117] border border-[#30363d]"}`}>
              <span className={`text-sm ${i === 0 ? "text-[#39FF14] font-bold" : "text-zinc-300"}`}>{o.bookmaker}{i === 0 && <span className="ml-2 text-[10px] uppercase">Best</span>}</span>
              <span className={`font-mono-num font-bold ${i === 0 ? "text-[#39FF14]" : "text-white"}`}>{o.price}</span>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">Odds shown for Moka's pick ({value.pickName}), best to worst.</div>
      </Card>

      {/* ADVANCED STATISTICS — collapsed by default */}
      <button
        type="button"
        onClick={() => setShowAdv((v) => !v)}
        data-testid="toggle-advanced-stats"
        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 hover:text-[#39FF14] border border-white/10 rounded-md py-2 mb-4 transition-colors"
      >
        {showAdv ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showAdv ? "Hide Advanced Statistics" : "Show Advanced Statistics"}
      </button>

      {showAdv && (
        <div data-testid="advanced-stats">
          <Card title="Moka vs Market">
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">Moka Prob.</div><div className="font-display font-black text-lg text-[#39FF14]">{Math.round(value.mokaProb * 100)}%</div></div>
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">Market Prob.</div><div className="font-display font-black text-lg text-zinc-200">{Math.round(value.bookProb * 100)}%</div></div>
              <div className="bg-[#0d1117] border border-[#30363d] rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">Potential Value</div><div className="font-display font-black text-lg text-[#58a6ff]">{value.ev > 0 ? "+" : ""}{value.ev}%</div></div>
            </div>
            <Bar label="Home" pct={probs.home || 0} color="#39FF14" />
            {probs.draw != null && <Bar label="Draw" pct={probs.draw || 0} color="#FF9500" />}
            <Bar label="Away" pct={probs.away || 0} color="#58a6ff" />
            <p className="text-[11px] text-zinc-500 mt-3">{aiExplanation(match, value)}</p>
          </Card>

          <Card title="Statistics">
            <StatsTable home={match.homeTeam} away={match.awayTeam} hn={match.home && match.home.name} an={match.away && match.away.name} />
          </Card>

          <Card title="Full Model Output (Pro)">
            {isPro ? (
              <div className="text-sm text-zinc-300">Home {probs.home}% · Draw {probs.draw}% · Away {probs.away}% · Confidence {value.confidence}% · Value score {value.valueScore}</div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4" data-testid="analysis-pred-locked">
                <div className="flex items-center gap-1.5 text-zinc-200 text-sm font-semibold"><Lock className="w-4 h-4" /> Full model breakdown is a Pro feature</div>
                <UpgradeButton size="sm" label="Unlock with Pro" />
              </div>
            )}
          </Card>
        </div>
      )}
    </Shell>
  );
}
