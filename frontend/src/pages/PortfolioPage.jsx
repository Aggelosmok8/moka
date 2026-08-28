import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Wallet, TrendingUp, Target, Percent, Trash2, Check, X, Clock, Flame, CircleSlash, Lock } from "lucide-react";
import Header from "../components/Header";
import { usePortfolio, computeStats } from "../contexts/PortfolioContext";
import { useEntitlements } from "../hooks/useEntitlements";
import { UpgradeButton } from "../components/Gating";

const GREEN = "#39FF14";
const RED = "#FF3B30";
const TOOLTIP = { background: "#0E1110", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "#fff" };

const money = (n) => `${n < 0 ? "-" : ""}€${Math.abs(n).toFixed(2)}`;

function StatCard({ icon: Icon, label, value, sub, color = "#fff" }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="font-display font-black text-2xl sm:text-3xl leading-none" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1.5">{sub}</div>}
    </div>
  );
}

const STATUS = {
  pending: { label: "Pending", cls: "bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/40", icon: Clock },
  won: { label: "Won", cls: "bg-[#39FF14] text-black", icon: Check },
  lost: { label: "Lost", cls: "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/40", icon: X },
  void: { label: "Void", cls: "bg-white/5 text-zinc-400 border border-white/10", icon: CircleSlash },
};

const FILTERS = { all: "All", pending: "Pending", won: "Won", lost: "Lost" };

function BetRow({ b, settle, remove }) {
  const st = STATUS[b.status] || STATUS.pending;
  const ret = b.status === "won" ? b.stake * b.odds : b.status === "void" ? b.stake : b.status === "lost" ? 0 : b.stake * b.odds;
  const pl = b.status === "pending" ? null : ret - b.stake;
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4" data-testid={`bet-row-${b.id}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 truncate">{b.league}</div>
          <div className="font-display font-bold text-white leading-tight truncate">
            {b.home} <span className="text-zinc-600 text-xs">vs</span> {b.away}
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${st.cls}`}>
          <st.icon className="w-3 h-3" /> {st.label}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center my-3">
        <div><div className="text-[10px] text-zinc-500 uppercase">Pick</div><div className="text-sm font-bold text-[#39FF14] truncate">{b.pickName}</div></div>
        <div><div className="text-[10px] text-zinc-500 uppercase">Odds</div><div className="text-sm font-bold text-white font-mono-num">{b.odds}</div></div>
        <div><div className="text-[10px] text-zinc-500 uppercase">Stake</div><div className="text-sm font-bold text-white font-mono-num">€{b.stake.toFixed(2)}</div></div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase">{b.status === "pending" ? "To win" : "P/L"}</div>
          <div className={`text-sm font-bold font-mono-num ${pl == null ? "text-zinc-300" : pl >= 0 ? "text-[#39FF14]" : "text-[#FF3B30]"}`}>
            {pl == null ? `€${(b.stake * b.odds).toFixed(2)}` : `${pl >= 0 ? "+" : "-"}€${Math.abs(pl).toFixed(2)}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {b.status === "pending" ? (
          <>
            <button onClick={() => settle(b.id, "won")} data-testid={`settle-won-${b.id}`} className="flex-1 py-1.5 rounded-md text-xs font-bold bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30 hover:bg-[#39FF14]/25">Mark Won</button>
            <button onClick={() => settle(b.id, "lost")} data-testid={`settle-lost-${b.id}`} className="flex-1 py-1.5 rounded-md text-xs font-bold bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30 hover:bg-[#FF3B30]/25">Mark Lost</button>
            <button onClick={() => settle(b.id, "void")} data-testid={`settle-void-${b.id}`} title="Void / cancelled" className="py-1.5 px-2 rounded-md text-xs font-bold bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10">Void</button>
          </>
        ) : (
          <button onClick={() => settle(b.id, "pending")} data-testid={`settle-reset-${b.id}`} className="flex-1 py-1.5 rounded-md text-xs font-bold bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10">Reset to pending</button>
        )}
        <button onClick={() => remove(b.id)} data-testid={`bet-remove-${b.id}`} className="py-1.5 px-2 rounded-md text-zinc-500 hover:text-[#FF3B30] border border-white/10"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

const FREE_LIMIT = 5;

export default function PortfolioPage() {
  const { bets, settle, remove, clear } = usePortfolio();
  const { role } = useEntitlements();
  const isPro = role === "pro";
  const [filter, setFilter] = useState("all");

  // Free users only see (and are scored on) their latest 5 bets.
  const scopedBets = useMemo(() => (isPro ? bets : bets.slice(0, FREE_LIMIT)), [bets, isPro]);
  const stats = useMemo(() => computeStats(scopedBets), [scopedBets]);
  const hiddenCount = isPro ? 0 : Math.max(0, bets.length - FREE_LIMIT);

  const list = useMemo(() => {
    if (filter === "all") return scopedBets;
    return scopedBets.filter((b) => b.status === filter);
  }, [scopedBets, filter]);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white">My Portfolio</h1>
            <p className="text-zinc-400 text-sm mt-1">Track the bets you play and see exactly how much you win or lose.</p>
          </div>
          {bets.length > 0 && (
            <button onClick={clear} data-testid="portfolio-clear" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-[#FF3B30] border border-white/10 rounded-md px-3 py-1.5">
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          )}
        </div>

        {bets.length === 0 ? (
          <div className="text-center py-20" data-testid="portfolio-empty">
            <Wallet className="w-10 h-10 text-zinc-700 mx-auto" />
            <h3 className="font-display font-black uppercase text-xl text-white mt-4">Your portfolio is empty</h3>
            <p className="text-zinc-500 text-sm mt-2 max-w-sm mx-auto">
              Browse the matches, and tap <b className="text-white">Add to Portfolio</b> on any pick to start tracking your bets and P/L.
            </p>
            <Link to="/matches?view=strong" className="inline-flex items-center gap-2 mt-5 bg-[#39FF14] text-black font-black uppercase text-sm tracking-wider px-5 py-2.5 rounded-lg hover:brightness-110 transition">
              <Flame className="w-4 h-4" /> Find opportunities
            </Link>
          </div>
        ) : (
          <>
            {/* STATS */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="portfolio-stats">
              <StatCard icon={TrendingUp} label="Net P/L" value={money(stats.profit)} color={stats.profit >= 0 ? GREEN : RED} sub={`${stats.settledCount} settled bets`} />
              <StatCard icon={Percent} label="ROI" value={`${stats.roi > 0 ? "+" : ""}${stats.roi}%`} color={stats.roi >= 0 ? GREEN : RED} sub={`on €${stats.stakedSettled.toFixed(2)} staked`} />
              <StatCard icon={Target} label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.wonCount}W · ${stats.lostCount}L`} />
              <StatCard icon={Clock} label="Pending" value={`€${stats.pendingStake.toFixed(2)}`} color="#FFD60A" sub={`could return €${stats.pendingPotential.toFixed(2)}`} />
            </section>

            {/* BANKROLL CHART */}
            {stats.timeline.length > 0 && (
              <section className="bg-[#161b22] border border-[#30363d] rounded-2xl p-4 mb-6" data-testid="portfolio-chart">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-3">Bankroll (cumulative P/L)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={stats.timeline} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#71717A", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#71717A", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v) => [money(v), "P/L"]} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                    <Area type="monotone" dataKey="pl" stroke={GREEN} strokeWidth={2} fill="url(#plFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* FILTERS */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {Object.entries(FILTERS).map(([k, label]) => (
                <button key={k} onClick={() => setFilter(k)} data-testid={`portfolio-filter-${k}`}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${filter === k ? "bg-[#39FF14] text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* BETS */}
            {list.length === 0 ? (
              <div className="text-center py-12 text-zinc-500" data-testid="portfolio-filter-empty">No bets in this category.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="portfolio-bets">
                {list.map((b) => <BetRow key={b.id} b={b} settle={settle} remove={remove} />)}
              </div>
            )}

            {hiddenCount > 0 && (
              <div className="mt-8 flex flex-col items-center gap-3 text-center bg-[#161b22] border border-[#30363d] rounded-2xl p-6" data-testid="portfolio-free-limit">
                <Lock className="w-6 h-6 text-[#39FF14]" />
                <div className="font-display font-black uppercase tracking-tight text-white text-lg">Your free portfolio includes your latest 5 matches</div>
                <p className="text-zinc-400 text-sm max-w-md">
                  Upgrade to PRO to keep your complete history ({bets.length} bets) and track your long-term performance.
                </p>
                <UpgradeButton label="Upgrade to Pro" />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
