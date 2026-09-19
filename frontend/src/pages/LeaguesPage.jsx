import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import Header from "../components/Header";
import { useEntitlements } from "../hooks/useEntitlements";
import { fetchCatalogMatches } from "../lib/catalogApi";
import { SPORTS, leaguesForSport } from "../lib/sportsCatalog";

const EUROPE = new Set(["ucl", "uel", "uecl"]);
const CUPS = new Set(["facup", "eflcup", "copadelrey", "coppaitalia", "dfbpokal",
  "coupedefrance", "greekcup", "portugalcup", "knvbbeker", "scottishcup", "danishcup"]);

// Country leagues first, then European competitions, then national cups.
const groupLeagues = (list) => [
  { key: "country-leagues", title: "Country Leagues", items: list.filter((l) => !EUROPE.has(l.id) && !CUPS.has(l.id)) },
  { key: "europe", title: "Europe Competitions", items: list.filter((l) => EUROPE.has(l.id)) },
  { key: "country-cups", title: "Country Cups", items: list.filter((l) => CUPS.has(l.id)) },
].filter((g) => g.items.length > 0);

export default function LeaguesPage() {
  const { accessibleIds } = useEntitlements();
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    let active = true;
    fetchCatalogMatches()
      .then((d) => active && setMatches(Array.isArray(d && d.matches) ? d.matches : []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c = {};
    matches.forEach((m) => {
      c[m.leagueId] = (c[m.leagueId] || 0) + 1;
    });
    return c;
  }, [matches]);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white mb-6">Leagues</h1>
        {SPORTS.map((s) => (
          <section key={s.key} className="mb-8">
            <h2 className="font-display font-black uppercase tracking-tight text-2xl sm:text-3xl text-white mb-5 flex items-center gap-2">
              <span className="text-xl sm:text-2xl">{s.icon}</span> {s.label}
            </h2>
            {groupLeagues(leaguesForSport(s.key)).map((g, _i, all) => (
              <div key={g.key} className="mb-6" data-testid={`league-group-${g.key}`}>
                {all.length > 1 && (
                  <h3 className="font-display font-black uppercase tracking-wide text-lg sm:text-xl text-[#39FF14] mb-3">{g.title}</h3>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {g.items.map((l) => {                const soon = l.coming_soon;
                const locked = !soon && !accessibleIds.has(l.id);
                const inner = (
                  <div className="flex items-center justify-between bg-[#161b22] border border-[#30363d] rounded-xl p-4 hover:border-[#39FF14]/40 transition-all">
                    <div>
                      <div className="font-display font-bold text-white">{l.name}</div>
                      <div className="text-xs text-zinc-500">{soon ? "Not available yet" : `${counts[l.id] || 0} value matches`}</div>
                    </div>
                    {soon ? (
                      <span className="text-[#FFD60A] text-[10px] font-black uppercase tracking-wider border border-[#FFD60A]/40 rounded-full px-2 py-0.5">Coming soon</span>
                    ) : locked ? (
                      <span className="text-zinc-400 flex items-center gap-1 text-xs"><Lock className="w-3.5 h-3.5" /> Pro</span>
                    ) : (
                      <span className="text-[#39FF14] text-xs font-bold">Open</span>
                    )}
                  </div>
                );
                return (soon || locked) ? (
                  <div key={l.id} className={soon ? "opacity-80 cursor-default" : "opacity-70"} data-testid={soon ? `league-soon-${l.id}` : `league-locked-${l.id}`}>{inner}</div>
                ) : (
                  <Link key={l.id} to={`/leagues/${l.id}`} data-testid={`league-open-${l.id}`}>{inner}</Link>
                );
              })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
