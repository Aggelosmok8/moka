import React from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { X, Trash2, BarChart3, Flame } from "lucide-react";
import Header from "../components/Header";
import InfoTip from "../components/InfoTip";
import { useChart } from "../contexts/ChartContext";

const GREEN = "#39FF14";
const BLUE = "#58a6ff";
const ZINC = "#71717A";
const ORANGE = "#FF9500";

const TOOLTIP = {
  background: "#0E1110", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, fontSize: 12, color: "#fff",
};

// Form can arrive as an array (["W","D","L"]) or a 0-10 number — normalise to 0-100.
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

function shortName(m) {
  const h = m.home?.short || (m.home?.name || "H").slice(0, 3).toUpperCase();
  const a = m.away?.short || (m.away?.name || "A").slice(0, 3).toUpperCase();
  return `${h}–${a}`;
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

export default function ChartsPage() {
  const { items, remove, clear } = useChart();

  const data = items.map((e) => {
    const v = e.value || {};
    return {
      id: e.match.id,
      name: shortName(e.match),
      potential: Number(v.ev) || 0,
      confidence: Number(v.confidence) || 0,
      moka: Math.round((Number(v.mokaProb) || 0) * 100),
      market: Math.round((Number(v.bookProb) || 0) * 100),
      odds: Number(v.bestOdds) || 0,
      formH: formScore(e.match.homeTeam?.form),
      formA: formScore(e.match.awayTeam?.form),
    };
  });

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white">Charts</h1>
            <p className="text-zinc-500 text-sm">Add favourite matches and compare them side by side.</p>
          </div>
          {items.length > 0 && (
            <button onClick={clear} data-testid="clear-chart-btn" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-[#FF3B30] border border-white/10 rounded-md px-3 py-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Clear all
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20" data-testid="charts-empty">
            <BarChart3 className="w-10 h-10 text-zinc-700 mx-auto" />
            <h3 className="font-display font-black uppercase text-xl text-white mt-4">No matches in your chart yet</h3>
            <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
              Open <b className="text-white">Value</b> and tap <b className="text-white">Add to Chart</b> on any match to start comparing.
            </p>
            <Link to="/value" className="inline-flex items-center gap-2 mt-5 neon-bg text-black font-black uppercase text-sm tracking-wider px-5 py-2.5 rounded-lg hover:bg-[#32E612] transition-colors">
              <Flame className="w-4 h-4" /> Browse value matches
            </Link>
          </div>
        ) : (
          <>
            {/* Selected matches chips */}
            <div className="flex flex-wrap gap-2 my-5" data-testid="chart-chips">
              {items.map((e) => (
                <span key={e.match.id} className="inline-flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded-full pl-3 pr-1.5 py-1 text-xs text-zinc-200">
                  {e.match.home?.name} vs {e.match.away?.name}
                  <button onClick={() => remove(e.match.id)} data-testid={`chart-remove-${e.match.id}`} className="w-4 h-4 rounded-full bg-white/10 hover:bg-[#FF3B30] flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Potential Value" tip="How strong the opportunity is overall (formerly 'EV / Expected Value'). Higher is better.">
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

              <ChartCard title="Confidence" tip="How sure the Moka model is about this pick. Higher means more reliable.">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ZINC, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: ZINC, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="confidence" name="Confidence %" fill={ORANGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartCard>

              <ChartCard title="Moka Estimate vs Market Estimate" tip="Moka Estimate = our model's win chance. Market Estimate = the chance implied by bookmaker odds. A gap between them is the 'Market Difference' (edge).">
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

              <ChartCard title="Best Bookmaker Odds" tip="The highest decimal odds available across bookmakers for the recommended pick.">
                <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: ZINC, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: ZINC, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  <Bar dataKey="odds" name="Best odds" fill={BLUE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartCard>

              <ChartCard title="Recent Form (Home vs Away)" tip="Recent results converted to a 0-100 score. Higher means the team is in better form lately.">
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
