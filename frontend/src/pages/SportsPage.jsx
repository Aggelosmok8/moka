import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Trophy, Users, Flame, Clock } from "lucide-react";
import Header from "../components/Header";
import { SPORTS, LEAGUE_CATALOG } from "../lib/sportsCatalog";

const LINKS = [
  { to: "/matches", label: "Matches", icon: Flame },
  { to: "/leagues", label: "Leagues", icon: Trophy },
  { to: "/teams", label: "Teams", icon: Users },
];

export default function SportsPage() {
  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white">Sports</h1>
        <p className="text-zinc-400 text-sm mt-1 mb-8">Choose a sport to explore matches, leagues and teams.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SPORTS.map((s) => {
            const leagues = LEAGUE_CATALOG.filter((l) => l.sport === s.key);
            return (
              <div
                key={s.key}
                data-testid={`sport-card-${s.key}`}
                className={`relative rounded-2xl border p-6 overflow-hidden ${s.available ? "bg-[#161b22] border-[#30363d]" : "bg-[#0f1319] border-white/5"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl leading-none">{s.icon}</span>
                    <div>
                      <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white">{s.label}</h2>
                      <div className="text-xs text-zinc-500">
                        {s.available ? `${leagues.length} leagues available` : "Coming soon"}
                      </div>
                    </div>
                  </div>
                  {!s.available && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-full bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/40">
                      <Clock className="w-3 h-3" /> Soon
                    </span>
                  )}
                </div>

                {s.available ? (
                  <>
                    <div className="flex flex-wrap gap-2 mt-5">
                      {leagues.map((l) => (
                        <span key={l.id} className="text-xs font-semibold text-zinc-300 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                          {l.name}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-6">
                      {LINKS.map((lnk) => (
                        <Link key={lnk.to} to={lnk.to} data-testid={`sport-${s.key}-${lnk.label.toLowerCase()}`}
                          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-lg bg-[#0d1117] border border-[#30363d] hover:border-[#39FF14]/40 text-zinc-300 hover:text-white transition-colors">
                          <lnk.icon className="w-5 h-5 text-[#39FF14]" />
                          <span className="text-xs font-bold">{lnk.label}</span>
                        </Link>
                      ))}
                    </div>
                    <Link to="/matches" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#39FF14]">
                      Explore {s.label} <ArrowRight className="w-4 h-4" />
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500 mt-5">
                    {s.label} coverage is on the way — matches, odds and team data will appear here soon.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
