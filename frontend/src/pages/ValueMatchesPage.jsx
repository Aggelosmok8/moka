import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import Header from "../components/Header";
import ValueCard from "../components/ValueCard";
import LeagueChips from "../components/LeagueChips";
import { useEntitlements } from "../hooks/useEntitlements";
import { fetchValueMatches } from "../lib/catalogApi";
import { adaptValueMatches } from "../lib/valueEngine";
import { LEAGUE_CATALOG } from "../lib/sportsCatalog";

export default function ValueMatchesPage() {
  const { accessibleIds } = useEntitlements();
  const [params] = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [league, setLeague] = useState(params.get("league"));

  useEffect(() => {
    let active = true;
    fetchValueMatches()
      .then((d) => active && setEntries(adaptValueMatches(d)))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const lockedIds = useMemo(
    () => new Set(LEAGUE_CATALOG.filter((l) => !accessibleIds.has(l.id)).map((l) => l.id)),
    [accessibleIds]
  );
  const filtered = useMemo(() => {
    let es = entries;
    if (league) es = es.filter((e) => e.match.leagueId === league);
    if (q) {
      const k = q.toLowerCase();
      es = es.filter((e) => `${e.match.home.name} ${e.match.away.name} ${e.match.leagueName}`.toLowerCase().includes(k));
    }
    return es;
  }, [entries, league, q]);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white mb-1">Value Matches</h1>
        <p className="text-zinc-500 text-sm mb-6">Every fixture ranked by model value vs the market.</p>

        <div className="relative mb-5 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search teams or leagues..."
            data-testid="value-search"
            className="w-full pl-8 pr-3 py-1.5 rounded-full border border-[#30363d] bg-[#161b22] text-zinc-200 text-sm focus:outline-none focus:border-[#39FF14]"
          />
        </div>
        <div className="mb-6">
          <LeagueChips leagues={LEAGUE_CATALOG} selected={league} onSelect={setLeague} lockedIds={lockedIds} />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500">No value matches found. Adjust filters or try another league.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="value-grid">
            {filtered.map((e) => (
              <ValueCard key={e.match.id} entry={e} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
