import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { X, Trash2, BarChart3, Flame, Check } from "lucide-react";
import Header from "../components/Header";
import InfoTip from "../components/InfoTip";
import { useChart } from "../contexts/ChartContext";
import { aiExplanation } from "../lib/valueEngine";

const GREEN = "#39FF14";
const BLUE = "#58a6ff";
const ZINC = "#71717A";
const ORANGE = "#FF9500";
const TOOLTIP = { background: "#0E1110", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "#fff" };

function formScore(form) {
  if (Array.isArray(form)) {
    if (!form.length) return 50;
    const pts = { W: 3, D: 1, L: 0 };
    const last5 = form.slice(-5);
    return Math.round((last5.reduce((s, r) => s + (pts[r] ?? 1), 0) / (last5.length * 3)) * 100);
  }
  if (typeof form === "number") return Math.max(0, Math.min(100, Math.round(form * 10)));
  return 50;
}
const shortName = (m) => `${(m.home?.short || (m.home?.name || "H").slice(0, 3)).toUpperCase()}–${(m.away?.short || (m.away?.name || "A").slice(0, 3)).toUpperCase()}`;
const kickoffOf = (m) => m.kickoff || m.startTime || m.date || m.commenceTime || m.commence_time || null;
function fmtKick(k) {
  if (!k) return "—";
  const d = new Date(k);
  return isNaN(d) ? "—" : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ChartCard({ title, tip, children }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center">
        <InfoTip label={title} text={tip} />
      </div>
      <ResponsiveContainer width="100%" height={240}>{children}</ResponsiveContainer>
    </div>
  );
}

const SORTS = {
  potential: { label: "Potential Value", fn: (a, b) => (b.value.ev || 0) - (a.value.ev || 0) },
  confidence: { label: "Confidence", fn: (a, b) => (b.value.confidence || 0) - (a.value.confidence || 0) },
  kickoff: { label: "Kickoff Time", fn: (a, b) => (Date.parse(kickoffOf(a.match)) || 0) - (Date.parse(kickoffOf(b.match)) || 0) },
  league: { label: "League", fn: (a, b) => (a.match.leagueName || "").localeCompare(b.match.leagueName || "") },
};

export default function ChartsPage() {
  const { items, remove, clear } = useChart();
  const [sortKey, setSortKey] = useState("potential");
  const [selected, setSelected] = useState(() => new Set());

  const sorted = useMemo(() => [...items].sort(SORTS[sortKey].fn), [items, sortKey]);
  const compareItems = useMemo(
    () => (selected.size ? sorted.filter((e) => selected.has(e.match.id)) : sorted),
    [sorted, selected]
  );

  const toggleSel = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const data = compareItems.map((e) => {
    const v = e.value || {};
    return {
      id: e.match.id, name: shortName(e.match),
      potential: Number(v.ev) || 0, confidence: Number(v.confidence) || 0,
      moka: Math.round((Number(v.mokaProb) || 0) * 100), market: Math.round((Number(v.bookProb) || 0) * 100),
      odds: Number(v.bestOdds) || 0, formH: formScore(e.match.homeTeam?.form), formA: formScore(e.match.awayTeam?.form),
    };
  });

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white">Charts</h1>
            <p className="text-zinc-400 text-sm">Save interesting matches here and compare them before placing your bets.</p>
          </div>
          {items.length > 0 && (
            <button onClick={() => { clear(); setSelected(new Set()); }} data-testid="clear-chart-btn"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-[#FF3B30] border border-white/10 rounded-md px-3 py-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20" data-testid="charts-empty">
            <BarChart3 className="w-10 h-10 text-zinc-700 mx-auto" />
            <h3 className="font-display font-black uppercase text-xl text-white mt-4">Your watchlist is empty</h3>
            <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
              Open <b className="text-white">Home</b> or <b className="text-white">Value</b> and tap <b className="text-white">Add to Chart</b> on any match to start comparing.
            </p>
            <Link to="/value" className="inline-flex items-center gap-2 mt-5 neon-bg text-black font-black uppercase text-sm tracking-wider px-5 py-2.5 rounded-lg hover:bg-[#32E612] transition-colors">
              <Flame className="w-4 h-4" /> Browse matches
            </Link>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div className="flex items-center justify-between gap-3 flex-wrap my-5">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">Sort by</span>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} data-testid="chart-sort"
                  className="bg-[#161b22] border border-[#30363d] rounded-md px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-[#39FF14]">
                  {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                </select>
              </div>
              <div className="text-xs text-zinc-500" data-testid="compare-status">
                {selected.size
                  ? <button onClick={() => setSelected(new Set())} className="text-[#39FF14] font-bold">Comparing {selected.size} selected · show all</button>
                  : <span>Comparing all {items.length} — tick rows then “Compare Selected”.</span>}
              </div>
            </div>

            {/* Watchlist table */}
            <div className="overflow-x-auto rounded-xl border border-[#30363d] mb-8">
              <table className="w-full text-sm min-w-[920px]" data-testid="watchlist-table">
                <thead className="bg-[#0d1117] text-zinc-500 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">Compare</th>
                    <th className="px-3 py-2 text-left font-bold">Match</th>
                    <th className="px-3 py-2 text-left font-bold">League</th>
                    <th className="px-3 py-2 text-left font-bold">Kickoff</th>
                    <th className="px-3 py-2 text-left font-bold"><InfoTip label="Potential Value" text="Expected return on the pick (formerly EV). Higher is better." /></th>
                    <th className="px-3 py-2 text-left font-bold"><InfoTip label="Moka Estimate" text="Our model's win chance for the pick." /></th>
                    <th className="px-3 py-2 text-left font-bold"><InfoTip label="Market Estimate" text="Win chance implied by bookmaker odds." /></th>
                    <th className="px-3 py-2 text-left font-bold"><InfoTip label="Confidence" text="How sure the model is about this pick." /></th>
                    <th className="px-3 py-2 text-left font-bold">Best Odds</th>
                    <th className="px-3 py-2 text-left font-bold">Value Rating</th>
                    <th className="px-3 py-2 text-left font-bold min-w-[220px]">Quick AI Summary</th>
                    <th className="px-3 py-2 text-left font-bold">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sorted.map((e) => {
                    const v = e.value, m = e.match;
                    const sel = selected.has(m.id);
                    return (
                      <tr key={m.id} className={`hover:bg-white/[0.03] ${sel ? "bg-[#39FF14]/[0.04]" : ""}`} data-testid={`watch-row-${m.id}`}>
                        <td className="px-3 py-2">
                          <button onClick={() => toggleSel(m.id)} data-testid={`select-${m.id}`}
                            className={`w-5 h-5 rounded border flex items-center justify-center ${sel ? "bg-[#39FF14] border-[#39FF14]" : "border-white/20 hover:border-white/40"}`}>
                            {sel && <Check className="w-3 h-3 text-black" />}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-white font-semibold whitespace-nowrap">{m.home?.name} <span className="text-zinc-600">vs</span> {m.away?.name}</td>
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{m.leagueName}</td>
                        <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{fmtKick(kickoffOf(m))}</td>
                        <td className="px-3 py-2 font-bold" style={{ color: BLUE }}>{v.ev > 0 ? "+" : ""}{v.ev}%</td>
                        <td className="px-3 py-2 font-bold text-[#39FF14]">{Math.round(v.mokaProb * 100)}%</td>
                        <td className="px-3 py-2 text-zinc-300">{Math.round(v.bookProb * 100)}%</td>
                        <td className="px-3 py-2 font-bold text-[#FF9500]">{v.confidence}%</td>
                        <td className="px-3 py-2 text-white font-mono-num whitespace-nowrap">{v.bestOdds} <span className="text-zinc-600">@ {v.bookmaker}</span></td>
                        <td className="px-3 py-2"><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${v.level.cls}`}>{v.level.label}</span></td>
                        <td className="px-3 py-2 text-[11px] text-zinc-500 min-w-[220px]">{aiExplanation(m, v)}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => remove(m.id)} data-testid={`watch-remove-${m.id}`} className="text-zinc-500 hover:text-[#FF3B30]"><X className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Comparison charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Potential Value" tip="How strong each opportunity is (formerly 'EV'). Higher is better.">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ZINC, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: ZINC, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="potential" name="Potential Value %" radius={[4, 4, 0, 0]}>
                    {data.map((d, i) => <Cell key={i} fill={d.potential >= 0 ? GREEN : "#FF3B30"} />)}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title="Confidence" tip="How sure the Moka model is about each pick.">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ZINC, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: ZINC, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="confidence" name="Confidence %" fill={ORANGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartCard>

              <ChartCard title="Moka Estimate vs Market Estimate" tip="Moka Estimate = our model's win chance. Market Estimate = chance implied by odds. The gap is the 'Market Difference'.">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ZINC, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: ZINC, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#A1A1AA" }} />
                  <Bar dataKey="moka" name="Moka Estimate %" fill={GREEN} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="market" name="Market Estimate %" fill={BLUE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartCard>

              <ChartCard title="Best Bookmaker Odds" tip="Highest decimal odds available for the recommended pick.">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ZINC, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: ZINC, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="odds" name="Best odds" fill={BLUE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartCard>

              <ChartCard title="Recent Form (Home vs Away)" tip="Recent results as a 0-100 score. Higher means better current form.">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={4}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ZINC, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: ZINC, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#A1A1AA" }} />
                  <Bar dataKey="formH" name="Home form" fill={GREEN} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="formA" name="Away form" fill={ZINC} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartCard>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
