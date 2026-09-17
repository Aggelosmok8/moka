import React, { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Wallet, TrendingUp, Target, Percent, Trash2, Check, X, Clock, Flame, CircleSlash, Lock, Layers, Receipt, Plus, RefreshCw, Loader2, Calendar, ArrowUpRight, ArrowDownRight, History } from "lucide-react";
import { toast } from "sonner";
import Header from "../components/Header";
import { usePortfolio, computeStats, computeTicket } from "../contexts/PortfolioContext";
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
const PERIODS = { all: "All time", day: "Today", week: "This week", month: "This month", year: "This year" };

// A record is dated by the match KICKOFF (start time), falling back to the
// settle/created time for older records that have no kickoff stored.
const dateOf = (r) => r?.kickoff || r?.settledAt || r?.createdAt || null;

function inPeriod(iso, period) {
  if (period === "all") return true;
  if (!iso) return false; // undated records never belong to a specific day/week/month
  const d = new Date(iso);
  if (isNaN(d)) return false;
  const now = new Date();
  if (period === "day") return d.toDateString() === now.toDateString();
  if (period === "year") return d.getFullYear() === now.getFullYear();
  if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === "week") {
    const s = new Date(now);
    s.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    s.setHours(0, 0, 0, 0);
    return d >= s;
  }
  return true;
}

function inRange(iso, from, to) {
  if (!from && !to) return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d)) return false;
  if (from && d < new Date(`${from}T00:00:00`)) return false;
  if (to && d > new Date(`${to}T23:59:59`)) return false;
  return true;
}

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

const fmtWhen = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleDateString([], { day: "2-digit", month: "short" });
};

// Individual settled-match history table (#3-#7). Shares the SAME settled
// records that drive the stats + graph (single source of truth). Free users
// see only the latest 5; Pro sees the full history.
function MatchHistory({ records, isPro }) {
  const settled = React.useMemo(() => {
    return records
      .filter((r) => r.status === "won" || r.status === "lost")
      .sort((a, b) => new Date(dateOf(b) || 0) - new Date(dateOf(a) || 0)); // most recent kickoff first
  }, [records]);

  if (settled.length === 0) return null;
  const shown = isPro ? settled : settled.slice(0, FREE_LIMIT);
  const hidden = isPro ? 0 : Math.max(0, settled.length - FREE_LIMIT);

  const profitOf = (r) => (r.status === "won" ? r.stake * (Number(r.odds) || 0) - r.stake : -r.stake);

  return (
    <section className="mt-8" data-testid="match-history">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-[#39FF14]" />
        <h3 className="font-display font-black uppercase tracking-tight text-lg text-white">Match History</h3>
        <span className="text-xs text-zinc-500">· individual settled matches</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#30363d]">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-500 border-b border-[#30363d]">
              <th className="text-left font-bold px-3 py-2">Result</th>
              <th className="text-left font-bold px-3 py-2">Match</th>
              <th className="text-left font-bold px-3 py-2">Pick</th>
              <th className="text-right font-bold px-3 py-2">Odds</th>
              <th className="text-right font-bold px-3 py-2">Stake</th>
              <th className="text-right font-bold px-3 py-2">Profit/Loss</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const pl = profitOf(r);
              const win = r.status === "won";
              return (
                <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]" data-testid={`history-row-${r.id}`}>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${win ? "bg-[#39FF14]/15" : "bg-[#FF3B30]/15"}`} title={win ? "Win" : "Loss"}>
                      {win ? <ArrowUpRight className="w-4 h-4 text-[#39FF14]" strokeWidth={3} /> : <ArrowDownRight className="w-4 h-4 text-[#FF3B30]" strokeWidth={3} />}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-white">
                    <div className="font-semibold break-words">{r.home}{r.away ? <span className="text-zinc-600"> vs </span> : ""}{r.away}</div>
                    <div className="text-[10px] text-zinc-500">{fmtWhen(dateOf(r))} · {r.league || ""}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[#39FF14] font-semibold break-words">{r.pickName || r.pick}</td>
                  <td className="px-3 py-2.5 text-right text-white font-mono-num">{Number(r.odds).toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right text-white font-mono-num">€{Number(r.stake).toFixed(2)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono-num font-bold ${pl >= 0 ? "text-[#39FF14]" : "text-[#FF3B30]"}`}>
                    {pl >= 0 ? "+" : "-"}€{Math.abs(pl).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <div className="mt-3 flex items-center justify-center gap-3 bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center" data-testid="history-free-limit">
          <Lock className="w-4 h-4 text-[#39FF14]" />
          <span className="text-sm text-zinc-300">{hidden} older {hidden === 1 ? "match" : "matches"} hidden — <b className="text-white">Pro</b> unlocks your full match history.</span>
          <Link to="/pricing" className="ml-1 bg-[#39FF14] text-black font-black uppercase text-xs px-3 py-1.5 rounded-md hover:brightness-110">Upgrade</Link>
        </div>
      )}
    </section>
  );
}

// --- Accumulator slip builder ---
function BetSlip({ slip, removeFromSlip, updateSlipLegOdds, clearSlip, placeTicket }) {
  const [stake, setStake] = useState("10");
  const per = Number(stake || 0);
  const totalStake = per * slip.length;
  const potential = slip.reduce((s, l) => s + per * (Number(l.odds) || 0), 0).toFixed(2);

  const place = () => {
    const amt = Number(stake);
    if (!amt || amt <= 0) return;
    placeTicket(amt);
    setStake("10");
  };

  return (
    <div className="bg-[#161b22] border border-[#39FF14]/30 rounded-2xl p-5 mb-6" data-testid="bet-slip">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 font-display font-black uppercase tracking-tight text-white">
          <Layers className="w-5 h-5 text-[#39FF14]" /> Bet Slip <span className="text-zinc-500 text-sm">({slip.length})</span>
        </div>
        <button onClick={clearSlip} data-testid="slip-clear" className="text-xs font-bold text-zinc-500 hover:text-[#FF3B30]">Clear</button>
      </div>
      <div className="space-y-2 mb-4">
        {slip.map((l) => (
          <div key={l.matchId} className="flex items-center justify-between gap-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2" data-testid={`slip-leg-${l.matchId}`}>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-white font-semibold break-words">{l.home} <span className="text-zinc-600">vs</span> {l.away}</div>
              <div className="text-[11px] text-[#39FF14] font-bold break-words">{l.pickName}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-end">
                <label className="text-[9px] text-zinc-500 uppercase leading-none mb-0.5">Your odds</label>
                <input
                  type="number" min="1" step="0.01" value={l.odds}
                  onChange={(e) => updateSlipLegOdds(l.matchId, e.target.value)}
                  data-testid={`slip-odds-${l.matchId}`}
                  className="w-16 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-white font-mono-num text-sm text-right focus:outline-none focus:border-[#39FF14]"
                />
              </div>
              <button onClick={() => removeFromSlip(l.matchId)} data-testid={`slip-remove-${l.matchId}`} className="text-zinc-500 hover:text-[#FF3B30]"><X className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Stake per selection (€)</label>
        <input type="number" min="0" step="1" value={stake} onChange={(e) => setStake(e.target.value)} data-testid="slip-stake-input"
          className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white font-mono-num focus:outline-none focus:border-[#39FF14]" />
      </div>
      <div className="flex items-center justify-between mt-3 text-sm">
        <span className="text-zinc-400">Total stake ({slip.length} × €{per.toFixed(2)})</span>
        <span className="font-mono-num font-bold text-white">€{totalStake.toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between mt-1 text-sm">
        <span className="text-zinc-400">Potential return (all win)</span>
        <span className="font-mono-num font-bold text-[#39FF14]">€{potential}</span>
      </div>
      <button onClick={place} data-testid="slip-place-ticket"
        className="mt-4 w-full py-2.5 rounded-lg bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
        Place ticket
      </button>
    </div>
  );
}

function TicketCard({ t, settleLeg, removeTicket }) {
  const info = computeTicket(t);
  // Progress badge: WON / TOTAL selections (never all-or-nothing).
  const badgeCls = info.status === "pending"
    ? "bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/40"
    : info.profit >= 0 ? "bg-[#39FF14] text-black" : "bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/40";
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 h-fit" data-testid={`ticket-${t.id}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          <Receipt className="w-4 h-4" /> Ticket · {info.total} {info.total === 1 ? "selection" : "selections"}
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${badgeCls}`} data-testid={`ticket-progress-${t.id}`}>
          <Check className="w-3 h-3" /> {info.progress}
        </span>
      </div>

      <div className="space-y-2 mb-3">
        {t.legs.map((l) => {
          const lst = STATUS[l.status] || STATUS.pending;
          const finished = l.status === "won" || l.status === "lost";  // finished legs lock (#10)
          return (
            <div key={l.id} className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2" data-testid={`ticket-leg-${l.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white font-semibold break-words">{l.home} <span className="text-zinc-600">vs</span> {l.away}</div>
                  <div className="text-[11px] text-[#39FF14] font-bold break-words">{l.pickName} · <span className="text-white font-mono-num">{l.odds}</span></div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${lst.cls}`}><lst.icon className="w-2.5 h-2.5" /> {lst.label}</span>
              </div>
              {finished ? (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500"><Lock className="w-3 h-3" /> Settled — locked</div>
              ) : (
                <div className="flex items-center gap-1.5 mt-2">
                  <button onClick={() => settleLeg(t.id, l.id, "won")} data-testid={`leg-won-${l.id}`} className="flex-1 py-1 rounded text-[10px] font-bold bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30 hover:bg-[#39FF14]/25">Won</button>
                  <button onClick={() => settleLeg(t.id, l.id, "lost")} data-testid={`leg-lost-${l.id}`} className="flex-1 py-1 rounded text-[10px] font-bold bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30 hover:bg-[#FF3B30]/25">Lost</button>
                  <button onClick={() => settleLeg(t.id, l.id, "void")} data-testid={`leg-void-${l.id}`} className="py-1 px-2 rounded text-[10px] font-bold bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10">Remove</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center border-t border-white/5 pt-3">
        <div><div className="text-[10px] text-zinc-500 uppercase">Total stake</div><div className="text-sm font-bold text-white font-mono-num">€{info.totalStake.toFixed(2)}</div></div>
        <div><div className="text-[10px] text-zinc-500 uppercase">{info.status === "pending" ? "Potential" : "Returned"}</div><div className="text-sm font-bold text-white font-mono-num">€{(info.status === "pending" ? info.potentialReturn : info.totalReturn).toFixed(2)}</div></div>
        <div>
          <div className="text-[10px] text-zinc-500 uppercase">Profit</div>
          <div className={`text-sm font-bold font-mono-num ${info.profit == null ? "text-zinc-300" : info.profit >= 0 ? "text-[#39FF14]" : "text-[#FF3B30]"}`}>
            {info.profit == null ? "—" : `${info.profit >= 0 ? "+" : "-"}€${Math.abs(info.profit).toFixed(2)}`}
          </div>
        </div>
      </div>
      <button onClick={() => removeTicket(t.id)} data-testid={`ticket-remove-${t.id}`} className="mt-3 w-full py-1.5 rounded-md text-xs font-bold text-zinc-500 hover:text-[#FF3B30] border border-white/10">
        <Trash2 className="inline w-3.5 h-3.5 mr-1" /> Remove ticket
      </button>
    </div>
  );
}

function TicketsView({ isPro }) {
  const { slip, removeFromSlip, updateSlipLegOdds, clearSlip, placeTicket, tickets, settleLeg, removeTicket } = usePortfolio();
  const [showHistory, setShowHistory] = useState(false);
  // Keep the FULL ticket history for everyone (never deleted). Latest tickets are
  // always visible; older ones collapse under HISTORY. The Free 5-limit applies
  // only to Portfolio Match History, NOT to ticket history (#8).
  const sorted = [...tickets].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const RECENT = 4;
  const recent = sorted.slice(0, RECENT);
  const older = sorted.slice(RECENT);

  return (
    <div data-testid="portfolio-tickets-view">
      {slip.length > 0 && (
        <BetSlip slip={slip} removeFromSlip={removeFromSlip} updateSlipLegOdds={updateSlipLegOdds} clearSlip={clearSlip} placeTicket={placeTicket} />
      )}

      {tickets.length === 0 && slip.length === 0 ? (
        <div className="text-center py-16" data-testid="tickets-empty">
          <Receipt className="w-10 h-10 text-zinc-700 mx-auto" />
          <h3 className="font-display font-black uppercase text-lg text-white mt-4">No tickets yet</h3>
          <p className="text-zinc-500 text-sm mt-2 max-w-md mx-auto">
            Open a match, choose <b className="text-white">Add to Portfolio → Accumulator</b> on a few picks, then place them as one ticket here.
          </p>
          <Link to="/matches?view=strong" className="inline-flex items-center gap-2 mt-5 bg-[#39FF14] text-black font-black uppercase text-sm tracking-wider px-5 py-2.5 rounded-lg hover:brightness-110 transition">
            <Flame className="w-4 h-4" /> Build a ticket
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start" data-testid="tickets-grid">
            {recent.map((t) => <TicketCard key={t.id} t={t} settleLeg={settleLeg} removeTicket={removeTicket} />)}
          </div>

          {older.length > 0 && (
            <div className="mt-6">
              <button onClick={() => setShowHistory((s) => !s)} data-testid="tickets-history-toggle"
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#30363d] bg-[#161b22] text-sm font-black uppercase tracking-wider text-zinc-300 hover:text-white hover:border-[#39FF14]/40 transition-colors">
                <History className="w-4 h-4" /> History ({older.length}) {showHistory ? "▲" : "▼"}
              </button>
              {showHistory && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-start mt-3" data-testid="tickets-history-grid">
                  {older.map((t) => <TicketCard key={t.id} t={t} settleLeg={settleLeg} removeTicket={removeTicket} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  const { bets, settle, remove, clear, clearTickets, slipCount, autoSettle, clearNewlySettled, tickets } = usePortfolio();
  const { role } = useEntitlements();
  const isPro = role === "pro";
  const [filter, setFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [settling, setSettling] = useState(false);
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "tickets" ? "tickets" : "bets");

  // On open, auto-settle finished matches from real results (one batched call).
  useEffect(() => { (async () => { await autoSettle(); clearNewlySettled(); })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = async () => {
    setSettling(true);
    try {
      const { settled } = await autoSettle();
      toast.success(settled ? `${settled} pick${settled > 1 ? "s" : ""} settled from final results` : "No finished matches to settle yet");
    } finally {
      setSettling(false);
    }
  };

  // Free users only see (and are scored on) their latest 5 bets.
  const scopedBets = useMemo(() => (isPro ? bets : bets.slice(0, FREE_LIMIT)), [bets, isPro]);
  // Period / custom date range filter (available to every user).
  const periodBets = useMemo(
    () => scopedBets.filter((b) => inPeriod(dateOf(b), period) && inRange(dateOf(b), from, to)),
    [scopedBets, period, from, to]
  );
  const hiddenCount = isPro ? 0 : Math.max(0, bets.length - FREE_LIMIT);

  const list = useMemo(() => {
    if (filter === "all") return periodBets;
    return periodBets.filter((b) => b.status === filter);
  }, [periodBets, filter]);

  // Every SETTLED selection of every ticket becomes its own Portfolio record
  // (per-match, not one accumulator event) so the graph/stats move per match.
  // `id` is stable (ticketId:legId) so re-runs are idempotent — no double counting.
  const ticketResults = useMemo(() => {
    const scopedT = isPro ? tickets : tickets.slice(0, FREE_LIMIT);
    const out = [];
    for (const t of scopedT) {
      const stakePer = Number(t.stake) || 0;
      for (const l of (t.legs || [])) {
        if (l.status === "pending" || l.status === "void") continue;
        // Portfolio dates by KICKOFF (match start), not settle time (#8).
        const when = l.kickoff || l.commence_time || l.settledAt;
        out.push({
          id: `${t.id}:${l.id}`,
          home: l.home, away: l.away, league: l.league,
          pick: l.pick, pickName: l.pickName,
          odds: Number(l.odds) || 0, stake: stakePer, status: l.status,
          kickoff: l.kickoff || l.commence_time || null,
          settledAt: when, createdAt: when,
        });
      }
    }
    return out;
  }, [tickets, isPro]);

  const statsSource = useMemo(() => {
    const t = ticketResults.filter((x) => inPeriod(dateOf(x), period) && inRange(dateOf(x), from, to));
    return [...periodBets, ...t];
  }, [periodBets, ticketResults, period, from, to]);

  // The All / Pending / Won / Lost chips drive the stats, the graph AND the
  // match history — one filtered source of truth.
  const viewSource = useMemo(
    () => (filter === "all" ? statsSource : statsSource.filter((r) => r.status === filter)),
    [statsSource, filter]
  );

  const stats = useMemo(() => computeStats(viewSource), [viewSource]);
  // The stats + performance graph live on the "My Bets" tab but are computed
  // from single bets AND settled tickets. So the tab must count tickets as
  // activity, otherwise a user who only plays tickets sees an empty portfolio.
  const hasActivity = bets.length > 0 || ticketResults.length > 0;

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white">My Portfolio</h1>
            <p className="text-zinc-400 text-sm mt-1">Track the bets you play and see exactly how much you win or lose.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={settling} data-testid="portfolio-refresh" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-300 hover:text-[#39FF14] border border-white/10 rounded-md px-3 py-1.5 disabled:opacity-50">
              {settling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh results
            </button>
            {(bets.length > 0 || tickets.length > 0) && (
              <button onClick={() => { if (window.confirm("Clear ALL your bets and tickets? This cannot be undone.")) { clear(); clearTickets(); } }} data-testid="portfolio-clear" className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-[#FF3B30] border border-white/10 rounded-md px-3 py-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Clear All
              </button>
            )}
          </div>
        </div>

        {/* TOP TABS */}
        <div className="flex items-center gap-2 mb-6">
          <button onClick={() => setTab("bets")} data-testid="portfolio-tab-bets"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "bets" ? "bg-[#39FF14] text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
            <Wallet className="w-4 h-4" /> My Bets
          </button>
          <button onClick={() => setTab("tickets")} data-testid="portfolio-tab-tickets"
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === "tickets" ? "bg-[#39FF14] text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
            <Receipt className="w-4 h-4" /> My Tickets {slipCount > 0 && <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FFD60A] text-black text-[10px] font-black flex items-center justify-center">{slipCount}</span>}
          </button>
        </div>

        {tab === "tickets" ? (
          <TicketsView isPro={isPro} />
        ) : !hasActivity ? (
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
            {/* PERIOD + CUSTOM DATE RANGE */}
            <div className="flex items-center gap-1.5 mb-4 flex-wrap" data-testid="portfolio-period">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Period</span>
              {Object.entries(PERIODS).map(([k, label]) => (
                <button key={k} onClick={() => { setPeriod(k); setFrom(""); setTo(""); }} data-testid={`portfolio-period-${k}`}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${period === k && !from && !to ? "bg-[#39FF14] text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
                  {label}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-1 bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">From</span>
                <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPeriod("all"); }} data-testid="portfolio-date-from"
                  className="bg-transparent text-xs text-white focus:outline-none [color-scheme:dark]" />
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">To</span>
                <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPeriod("all"); }} data-testid="portfolio-date-to"
                  className="bg-transparent text-xs text-white focus:outline-none [color-scheme:dark]" />
                {(from || to) && (
                  <button onClick={() => { setFrom(""); setTo(""); }} data-testid="portfolio-date-clear" className="text-zinc-500 hover:text-[#FF3B30]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* STATS */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="portfolio-stats">
              <StatCard icon={TrendingUp} label="Net P/L" value={money(stats.profit)} color={stats.profit >= 0 ? GREEN : RED} sub={`${stats.settledCount} settled bets`} />
              <StatCard icon={Percent} label="ROI" value={`${stats.roi > 0 ? "+" : ""}${stats.roi}%`} color={stats.roi >= 0 ? GREEN : RED} sub={`on €${stats.stakedSettled.toFixed(2)} staked`} />
              <StatCard icon={Target} label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.wonCount}W · ${stats.lostCount}L`} />
              <StatCard icon={Clock} label="Pending" value={`€${stats.pendingStake.toFixed(2)}`} color="#FFD60A" sub={`could return €${stats.pendingPotential.toFixed(2)}`} />
            </section>

            {period !== "all" && stats.settledCount === 0 && !from && !to && (
              <div className="mb-6 bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center text-sm text-zinc-400" data-testid="portfolio-no-settled">
                No settled matches {PERIODS[period] ? PERIODS[period].toLowerCase() : "in this period"}.
              </div>
            )}

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

            {/* MATCH HISTORY — individual settled matches (single source of truth) */}
            <MatchHistory records={viewSource} isPro={isPro} />

            {/* SINGLE BETS */}
            {list.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-8" data-testid="portfolio-bets">
                {list.map((b) => <BetRow key={b.id} b={b} settle={settle} remove={remove} />)}
              </div>
            )}
            {list.length === 0 && viewSource.length === 0 && (
              <div className="text-center py-12 text-zinc-500" data-testid="portfolio-filter-empty">No bets in this category.</div>
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
