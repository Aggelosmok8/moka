import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import Header from "../components/Header";
import { useEntitlements } from "../hooks/useEntitlements";
import { fetchCatalogMatches } from "../lib/catalogApi";
import { SPORTS, leaguesForSport } from "../lib/sportsCatalog";

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
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">
              {s.icon} {s.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {leaguesForSport(s.key).map((l) => {
                const locked = !accessibleIds.has(l.id);
                const inner = (
                  <div className="flex items-center justify-between bg-[#161b22] border border-[#30363d] rounded-xl p-4 hover:border-[#39FF14]/40 transition-all">
                    <div>
                      <div className="font-display font-bold text-white">{l.name}</div>
                      <div className="text-xs text-zinc-500">{counts[l.id] || 0} value matches</div>
                    </div>
                    {locked ? (
                      <span className="text-zinc-400 flex items-center gap-1 text-xs"><Lock className="w-3.5 h-3.5" /> Pro</span>
                    ) : (
                      <span className="text-[#39FF14] text-xs font-bold">Open</span>
                    )}
                  </div>
                );
                return locked ? (
                  <div key={l.id} className="opacity-70" data-testid={`league-locked-${l.id}`}>{inner}</div>
                ) : (
                  <Link key={l.id} to={`/value?league=${l.id}`} data-testid={`league-open-${l.id}`}>{inner}</Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
