import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Lock } from "lucide-react";
import Header from "../components/Header";
import { UpgradeButton } from "../components/Gating";
import { useEntitlements } from "../hooks/useEntitlements";
import { fetchMatchById } from "../lib/catalogApi";
import { adaptValue, aiExplanation } from "../lib/valueEngine";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#0d1117]">
    <Header />
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
  </div>
);
const Card = ({ title, icon, children }) => (
  <section className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 mb-4">
    <div className="flex items-center gap-2 mb-3">
      {icon && <Sparkles className="w-4 h-4 text-[#39FF14]" />}
      <h3 className="font-display font-bold uppercase tracking-tight text-sm text-white">{title}</h3>
    </div>
    {children}
  </section>
);
const Bar = ({ label, pct, color }) => (
  <div className="mb-2">
    <div className="flex justify-between text-xs text-zinc-400 mb-1">
      <span>{label}</span>
      <span className="font-bold text-white">{pct}%</span>
    </div>
    <div className="h-2 rounded-full bg-[#0d1117] overflow-hidden">
      <div style={{ width: `${pct}%`, background: color }} className="h-full" />
    </div>
  </div>
);
const Pill = ({ label, v }) => (
  <span className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-1.5 text-sm">
    <span className="text-zinc-500 text-xs">{label} </span>
    <b className="text-white">{v}</b>
  </span>
);

function StatsTable({ home = {}, away = {}, hn, an }) {
  const keys = Object.keys(home).filter((k) => k !== "form");
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] text-zinc-500 uppercase">
          <th className="text-left p-1">{hn}</th>
          <th className="text-center p-1">Stat</th>
          <th className="text-right p-1">{an}</th>
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

  useEffect(() => {
    let active = true;
    fetchMatchById(id)
      .then((d) => active && setData(d))
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <Shell><div className="h-64 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" /></Shell>;
  if (notFound || !data) return <Shell><div className="text-center py-16 text-zinc-400">Match not found.</div></Shell>;

  const match = data;
  const value = adaptValue(data.value);
  const probs = value.probabilities || {};
  const pickOutcome = value.pick;

  return (
    <Shell>
      <Link to="/value" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to value matches
      </Link>
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{match.leagueName}</div>
      <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white mb-4">
        {match.home && match.home.name} <span className="text-zinc-600 text-xl">vs</span> {match.away && match.away.name}
      </h1>
      <div className="flex flex-wrap gap-2 mb-6">
        <span className={`text-[11px] font-black uppercase px-3 py-1 rounded-full ${value.level.cls}`}>{value.level.emoji} {value.level.label}</span>
        <Pill label="Value" v={value.valueScore} />
        <Pill label="EV" v={`${value.ev > 0 ? "+" : ""}${value.ev}%`} />
        <Pill label="Confidence" v={`${value.confidence}%`} />
      </div>

      <Card title="Probability Breakdown">
        <Bar label="Home" pct={probs.home || 0} color="#39FF14" />
        <Bar label="Draw" pct={probs.draw || 0} color="#FF9500" />
        <Bar label="Away" pct={probs.away || 0} color="#58a6ff" />
        <div className="text-xs text-zinc-400 mt-3">
          Pick <b className="text-white">{value.pickName}</b> · Edge <b className="text-[#39FF14]">{value.edge > 0 ? "+" : ""}{value.edge}pts</b> · Best odds <b className="text-white">{value.bestOdds}</b> @ {value.bookmaker}
        </div>
      </Card>

      <Card title="AI Explanation" icon>
        <p className="text-sm text-zinc-400">{aiExplanation(match, value)}</p>
      </Card>

      <Card title="Odds Comparison">
        <div className="grid grid-cols-3 gap-2">
          {(match.odds || []).map((o) => (
            <div key={o.bookmaker} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-center">
              <div className="text-[10px] text-zinc-500">{o.bookmaker}</div>
              <div className="text-white font-bold font-mono-num">{o.odds && o.odds[pickOutcome]}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-zinc-500 mt-2">Odds shown for the value pick ({value.pickName}).</div>
      </Card>

      <Card title="Statistics">
        <StatsTable home={match.homeTeam} away={match.awayTeam} hn={match.home && match.home.name} an={match.away && match.away.name} />
      </Card>

      <Card title="Full Model Output (Pro)">
        {isPro ? (
          <div className="text-sm text-zinc-300">
            Win probability — Home {probs.home}% · Draw {probs.draw}% · Away {probs.away}% · Model confidence {value.confidence}%
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4" data-testid="analysis-pred-locked">
            <div className="flex items-center gap-1.5 text-zinc-200 text-sm font-semibold"><Lock className="w-4 h-4" /> Full model breakdown is a Pro feature</div>
            <UpgradeButton size="sm" label="Unlock with Pro" />
          </div>
        )}
      </Card>
    </Shell>
  );
}
