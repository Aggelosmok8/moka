import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Lock, Search, X, CalendarDays } from "lucide-react";
import Header from "../components/Header";
import { fetchValueMatches } from "../lib/catalogApi";
import { adaptValueMatches } from "../lib/valueEngine";
import ValueCard, { LockedValueCard } from "../components/ValueCard";
import { UpgradeButton } from "../components/Gating";
import { useEntitlements } from "../hooks/useEntitlements";

const VIEWS = {
  strong: { title: "Today's Best Opportunities", sub: "The strongest opportunities Moka has identified today.", levels: ["HIGH"] },
  watching: { title: "Worth Watching", sub: "Interesting opportunities that are not as strong as the top picks.", levels: ["MEDIUM"] },
  all: { title: "All Matches", sub: "Browse every available match.", levels: null },
};

const Chip = ({ to, active, children }) => (
  <Link to={to} className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${active ? "bg-[#39FF14] text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>{children}</Link>
);

const Skel = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {[0, 1, 2].map((i) => <div key={i} className="h-56 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />)}
  </div>
);

export default function MatchesPage() {
  const [params] = useSearchParams();
  const view = VIEWS[params.get("view")] ? params.get("view") : "strong";
  const cfg = VIEWS[view];
  const { role, loading: entLoading } = useEntitlements();
  const isPro = role === "pro";
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fLeague, setFLeague] = useState("");
  const [fTeam, setFTeam] = useState("");
  const [fDate, setFDate] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchValueMatches()
      .then((d) => active && setEntries(adaptValueMatches(d)))
      .catch(() => active && setEntries([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const list = useMemo(() => {
    if (!cfg.levels) return entries;
    return entries.filter((e) => cfg.levels.includes(e.value?.valueLevel));
  }, [entries, cfg]);

  const leagues = useMemo(() => [...new Set(entries.map((e) => e.match.leagueName).filter(Boolean))].sort(), [entries]);

  const filtered = useMemo(() => list.filter((e) => {
    const m = e.match;
    if (fLeague && m.leagueName !== fLeague) return false;
    if (fTeam) {
      const q = fTeam.toLowerCase();
      if (!`${m.home?.name || ""} ${m.away?.name || ""}`.toLowerCase().includes(q)) return false;
    }
    if (fDate && (m.commence_time || "").slice(0, 10) !== fDate) return false;
    return true;
  }), [list, fLeague, fTeam, fDate]);

  const hasFilters = fLeague || fTeam || fDate;
  const clearFilters = () => { setFLeague(""); setFTeam(""); setFDate(""); };

  const visible = isPro ? filtered : filtered.slice(0, 3);
  const lockedCount = isPro ? 0 : Math.max(0, Math.min(3, filtered.length - visible.length));
  const busy = loading || entLoading;

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 mb-5">
          <Chip to="/matches?view=strong" active={view === "strong"}>🟢 Strong</Chip>
          <Chip to="/matches?view=watching" active={view === "watching"}>🟡 Worth Watching</Chip>
          <Chip to="/matches?view=all" active={view === "all"}>All Matches</Chip>
        </div>

        <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white">{cfg.title}</h1>
        <p className="text-zinc-400 mt-1 mb-6 text-sm">{cfg.sub}</p>

        {!busy && entries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="matches-filters">
            <select value={fLeague} onChange={(e) => setFLeague(e.target.value)} data-testid="filter-league"
              className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#39FF14]">
              <option value="">All leagues</option>
              {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={fTeam} onChange={(e) => setFTeam(e.target.value)} placeholder="Search team…" data-testid="filter-team"
                className="bg-[#161b22] border border-[#30363d] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#39FF14]" />
            </div>
            <div className="relative inline-flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
              <CalendarDays className="w-4 h-4 text-zinc-500" />
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} data-testid="filter-date"
                className="bg-transparent text-sm text-white focus:outline-none [color-scheme:dark]" />
            </div>
            {hasFilters && (
              <button onClick={clearFilters} data-testid="filter-clear" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-[#FF3B30] border border-white/10 rounded-lg px-3 py-2">
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        )}

        {busy ? (
          <Skel />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-400" data-testid="matches-empty">
            {hasFilters ? "No matches match your filters." : "No matches in this category right now."}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="matches-grid">
              {visible.map((e) => <ValueCard key={e.match.id} entry={e} />)}
              {Array.from({ length: lockedCount }).map((_, i) => <LockedValueCard key={`lock-${i}`} />)}
            </div>
            {!isPro && filtered.length > visible.length && (
              <div className="mt-6 flex flex-col items-center gap-2 text-center" data-testid="matches-upgrade">
                <div className="flex items-center gap-1.5 text-zinc-300 text-sm font-semibold"><Lock className="w-4 h-4" /> Upgrade to Pro to unlock every opportunity</div>
                <UpgradeButton />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
