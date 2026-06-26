import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, ChevronLeft, Loader2, Shield, ShieldAlert, Users } from "lucide-react";
import Header from "../components/Header";
import InfoTip from "../components/InfoTip";
import { api } from "../lib/api";
import { useEntitlements } from "../hooks/useEntitlements";
import { LEAGUE_CATALOG } from "../lib/sportsCatalog";

function Crest({ team, size = 40 }) {
  const short = team.short || (team.name || "?").slice(0, 3).toUpperCase();
  return (
    <div className="rounded-lg flex items-center justify-center font-display font-black text-sm shrink-0"
      style={{ width: size, height: size, background: (team.color || "#39FF14") + "22", color: team.color || "#39FF14" }}>
      {short}
    </div>
  );
}

function Stat({ label, value, tip }) {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
        {tip ? <InfoTip label={label} text={tip} /> : label}
      </div>
      <div className="font-display font-black text-lg text-white mt-0.5">{value ?? "—"}</div>
    </div>
  );
}

function TeamDetail({ team, onBack }) {
  const [players, setPlayers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sample, setSample] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/teams/${team.id}/players`)
      .then((r) => { setPlayers(r.data.players || []); setSample(r.data.source === "sample"); })
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, [team.id]);

  return (
    <div data-testid="team-detail">
      <button onClick={onBack} data-testid="team-back-btn" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to teams
      </button>

      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex items-center gap-4">
        <Crest team={team} size={56} />
        <div className="min-w-0">
          <h2 className="font-display font-black uppercase text-2xl text-white leading-none truncate">{team.name}</h2>
          <div className="text-zinc-500 text-sm mt-1">{team.leagueName || "—"}</div>
          <div className="flex gap-1 mt-2">
            {(Array.isArray(team.form) ? team.form.slice(-5) : []).map((r, i) => (
              <span key={i} className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                r === "W" ? "bg-[#39FF14]/20 text-[#39FF14]" : r === "L" ? "bg-[#FF3B30]/20 text-[#FF3B30]" : "bg-white/10 text-zinc-300"}`}>{r}</span>
            ))}
          </div>
        </div>
      </div>

      <h3 className="font-display font-black uppercase text-sm text-zinc-400 mt-6 mb-3">Team stats</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Stat label="Goals / game" value={team.goalsPerGame} tip="Average goals this team scores per match." />
        <Stat label="Conceded / game" value={team.concededPerGame} tip="Average goals conceded per match." />
        <Stat label="Possession" value={team.possession != null ? `${team.possession}%` : null} />
        <Stat label="Pass accuracy" value={team.passAccuracy != null ? `${team.passAccuracy}%` : null} />
        <Stat label="Both teams score" value={team.btts != null ? `${team.btts}%` : null} tip="How often both teams score in this team's matches." />
        <Stat label="Over 2.5 goals" value={team.over25 != null ? `${team.over25}%` : null} tip="How often matches have 3+ goals." />
        <Stat label="Shots / game" value={team.shotsPerGame} />
        <Stat label="xG" value={team.xg} tip="Expected goals — chance quality. Shown when the stats provider supplies it." />
      </div>
      <p className="text-[11px] text-zinc-600 mt-2">
        Stadium, coach, league position and home/away splits appear here once the live stats provider (API-Football) is connected.
      </p>

      <h3 className="font-display font-black uppercase text-sm text-zinc-400 mt-7 mb-3 flex items-center gap-2">
        <Users className="w-4 h-4" /> Squad
      </h3>
      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
      ) : (
        <>
          {sample && <p className="text-[11px] text-[#FF9500] mb-2">Sample roster — connect the stats provider for real player data.</p>}
          <div className="overflow-x-auto rounded-xl border border-[#30363d]">
            <table className="w-full text-sm min-w-[680px]" data-testid="players-table">
              <thead className="bg-[#0d1117] text-zinc-500 text-[11px] uppercase tracking-wider">
                <tr>
                  {["#", "Player", "Pos", "Age", "Nat", "Apps", "Min", "Goals", "Assists", "Shots", "Tackles", "Cards", "Rating"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {players.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.03]" data-testid={`player-row-${p.id}`}>
                    <td className="px-3 py-2 text-zinc-500">{p.number}</td>
                    <td className="px-3 py-2 text-white font-semibold whitespace-nowrap">
                      {p.name} {p.injured && <ShieldAlert className="inline w-3.5 h-3.5 text-[#FF3B30] ml-1" title="Injured" />}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{p.position}</td>
                    <td className="px-3 py-2 text-zinc-400">{p.age}</td>
                    <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{p.nationality}</td>
                    <td className="px-3 py-2 text-zinc-300">{p.appearances}</td>
                    <td className="px-3 py-2 text-zinc-300">{p.minutes}</td>
                    <td className="px-3 py-2 text-[#39FF14] font-bold">{p.goals}</td>
                    <td className="px-3 py-2 text-zinc-300">{p.assists}</td>
                    <td className="px-3 py-2 text-zinc-300">{p.shots}</td>
                    <td className="px-3 py-2 text-zinc-300">{p.tackles}</td>
                    <td className="px-3 py-2 text-zinc-300 whitespace-nowrap">
                      <span className="text-[#FFD60A]">{p.yellow}🟨</span>{p.red ? <span className="ml-1 text-[#FF3B30]">{p.red}🟥</span> : null}
                    </td>
                    <td className="px-3 py-2 font-bold text-white">{p.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const { accessibleIds } = useEntitlements();
  const [league, setLeague] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [team, setTeam] = useState(null);

  const groups = useMemo(() => {
    return LEAGUE_CATALOG.reduce((acc, l) => {
      const g = l.group || l.sport || "Leagues";
      (acc[g] = acc[g] || []).push(l);
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    const first = LEAGUE_CATALOG.find((l) => accessibleIds.has(l.id)) || LEAGUE_CATALOG[0];
    if (first && !league) setLeague(first.id);
  }, [accessibleIds, league]);

  useEffect(() => {
    if (!league) return;
    setTeam(null);
    setLoading(true);
    api.get(`/teams?league=${encodeURIComponent(league)}`)
      .then((r) => setTeams(r.data.teams || []))
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }, [league]);

  const leagueLocked = (id) => !accessibleIds.has(id);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white mb-1">Teams</h1>
        <p className="text-zinc-500 text-sm mb-6">Browse leagues, teams and full squads.</p>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* Leagues sidebar */}
          <aside className="space-y-5">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-zinc-600 mb-2">{group}</div>
                <div className="space-y-1">
                  {items.map((l) => {
                    const locked = leagueLocked(l.id);
                    const active = league === l.id;
                    return locked ? (
                      <Link key={l.id} to="/pricing" data-testid={`teams-league-${l.id}`}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold text-zinc-600 hover:text-zinc-400">
                        {l.name} <Lock className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <button key={l.id} onClick={() => setLeague(l.id)} data-testid={`teams-league-${l.id}`}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm font-semibold transition-colors ${active ? "bg-[#39FF14]/10 text-[#39FF14]" : "text-zinc-300 hover:bg-white/5"}`}>
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          {/* Content */}
          <section>
            {team ? (
              <TeamDetail team={team} onBack={() => setTeam(null)} />
            ) : loading ? (
              <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
            ) : teams.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">No teams available for this league.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="teams-grid">
                {teams.map((t) => (
                  <button key={t.id} onClick={() => setTeam(t)} data-testid={`team-card-${t.id}`}
                    className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-left hover:border-[#39FF14]/40 transition-all flex items-center gap-3">
                    <Crest team={t} />
                    <div className="min-w-0">
                      <div className="font-display font-black text-white truncate">{t.name}</div>
                      <div className="text-[11px] text-zinc-500">{t.leagueName || ""}</div>
                    </div>
                    <Shield className="w-4 h-4 text-zinc-600 ml-auto" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
