import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Lock } from "lucide-react";
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

  const visible = isPro ? list : list.slice(0, 3);
  const lockedCount = isPro ? 0 : Math.max(0, Math.min(3, list.length - visible.length));
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

        {busy ? (
          <Skel />
        ) : list.length === 0 ? (
          <div className="text-center py-16 text-zinc-400" data-testid="matches-empty">No matches in this category right now.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="matches-grid">
              {visible.map((e) => <ValueCard key={e.match.id} entry={e} />)}
              {Array.from({ length: lockedCount }).map((_, i) => <LockedValueCard key={`lock-${i}`} />)}
            </div>
            {!isPro && list.length > visible.length && (
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
