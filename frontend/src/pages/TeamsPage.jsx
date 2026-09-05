import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, ChevronLeft, Loader2, Shield, ShieldAlert, Users } from "lucide-react";
import Header from "../components/Header";
import InfoTip from "../components/InfoTip";
import { api } from "../lib/api";
import { useEntitlements } from "../hooks/useEntitlements";
import { LEAGUE_CATALOG } from "../lib/sportsCatalog";

function Crest({ team, size = 40 }) {
  const short = team.short || (team.name || "?").slice(0, 3).toUpperCase();
  if (team.image) {
    return (
      <img
        src={team.image}
        alt={team.name}
        className="rounded-lg object-contain shrink-0 bg-white/5 p-1"
        style={{ width: size, height: size }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    );
  }
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

const POS_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];

function PlayerCard({ p, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left flex items-center gap-3 bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 hover:border-[#39FF14]/40 transition-colors" data-testid={`player-row-${p.id}`}>
      {p.photo ? (
        <img src={p.photo} alt={p.name} className="w-10 h-10 rounded-full object-cover bg-white/5 shrink-0"
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 text-xs font-bold shrink-0">{p.number ?? "?"}</div>
      )}
      <div className="min-w-0">
        <div className="text-sm text-white font-semibold truncate flex items-center gap-1">
          {p.name}
          {p.injured && <ShieldAlert className="w-3.5 h-3.5 text-[#FF3B30]" title="Injured" />}
        </div>
        <div className="text-[11px] text-zinc-500">
          {p.number != null && <span className="font-mono-num">#{p.number}</span>}
          {p.number != null && p.position && " · "}
          {p.position}
          {p.goals ? <span className="text-[#39FF14] ml-1">· {p.goals}⚽</span> : null}
        </div>
      </div>
    </button>
  );
}

function PlayerStatCell({ label, value }) {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-3">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="font-display font-black text-lg text-white mt-0.5">{value ?? "—"}</div>
    </div>
  );
}

function PlayerModal({ player, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setLoading(true); setErr(false);
    api.get(`/players/${player.id}`)
      .then((r) => setData(r.data))
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [player.id]);
  const s = data?.stats || {};
  const cells = [
    ["Apps", s.appearances], ["Minutes", s.minutes], ["Goals", s.goals],
    ["Assists", s.assists], ["Shots", s.shots], ["On Target", s.shotsOn],
    ["Key Passes", s.keyPasses], ["Passes", s.passes], ["Tackles", s.tackles],
    ["Interceptions", s.interceptions], ["Duels Won", s.duelsWon], ["Fouls", s.fouls],
    ["Yellow", s.yellow], ["Red", s.red], ["Rating", data?.rating],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose} data-testid="player-modal">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          {player.photo ? (
            <img src={player.photo} alt={player.name} className="w-14 h-14 rounded-full object-cover bg-white/5" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 font-bold">{player.number ?? "?"}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-display font-black text-xl text-white truncate">{player.name}</div>
            <div className="text-[11px] text-zinc-500">{[data?.position || player.position, data?.nationality, data?.age ? `${data.age}y` : null].filter(Boolean).join(" · ")}</div>
          </div>
          <button onClick={onClose} data-testid="player-modal-close" className="text-zinc-500 hover:text-white text-sm px-2">✕</button>
        </div>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
        ) : err || !data ? (
          <div className="text-zinc-500 text-sm py-6 text-center">Detailed stats not available for this player this season.</div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">{data.team || ""} · {data.season} season</div>
            <div className="grid grid-cols-3 gap-2" data-testid="player-stats-grid">
              {cells.map(([l, v]) => <PlayerStatCell key={l} label={l} value={v} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TeamDetail({ team, onBack }) {
  const [players, setPlayers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openPlayer, setOpenPlayer] = useState(null);
  const isBasket = team.sport === "basketball";

  useEffect(() => {
    if (isBasket) { setPlayers([]); setLoading(false); return; }
    setLoading(true);
    api.get(`/teams/${team.id}/players`)
      .then((r) => setPlayers(r.data.players || []))
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, [team.id, isBasket]);

  const form = Array.isArray(team.form) ? team.form.slice(-5) : [];
  const wins = form.filter((r) => r === "W").length;
  const draws = form.filter((r) => r === "D").length;
  const losses = form.filter((r) => r === "L").length;

  const grouped = useMemo(() => {
    const g = {};
    (players || []).forEach((p) => { (g[p.position || "Other"] = g[p.position || "Other"] || []).push(p); });
    const keys = [...POS_ORDER.filter((k) => g[k]), ...Object.keys(g).filter((k) => !POS_ORDER.includes(k))];
    return keys.map((k) => [k, g[k]]);
  }, [players]);

  return (
    <div data-testid="team-detail">
      <button onClick={onBack} data-testid="team-back-btn" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white mb-4">
        <ChevronLeft className="w-4 h-4" /> Back to teams
      </button>

      {/* Hero */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <Crest team={team} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-black uppercase text-2xl sm:text-3xl text-white leading-none truncate">{team.name}</h2>
          <div className="text-zinc-500 text-sm mt-1">{team.leagueName || "—"}</div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-1">Form</span>
            {form.length ? form.map((r, i) => (
              <span key={i} className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                r === "W" ? "bg-[#39FF14]/20 text-[#39FF14]" : r === "L" ? "bg-[#FF3B30]/20 text-[#FF3B30]" : "bg-white/10 text-zinc-300"}`}>{r}</span>
            )) : <span className="text-zinc-600 text-xs">—</span>}
          </div>
        </div>
        {team.position != null && (
          <div className="text-center bg-[#0d1117] border border-[#30363d] rounded-xl px-5 py-3">
            <div className="text-[10px] text-zinc-500 uppercase">League Pos.</div>
            <div className="font-display font-black text-3xl text-[#39FF14] leading-none mt-0.5">#{team.position}</div>
          </div>
        )}
      </div>

      {/* Key stats */}
      <h3 className="font-display font-black uppercase text-sm text-zinc-400 mt-6 mb-3">Season stats</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {isBasket ? (
          <>
            <Stat label="Wins" value={team.wins} />
            <Stat label="Losses" value={team.losses} />
            <Stat label="Win %" value={team.winPct} />
            <Stat label="Played" value={team.played} tip="Games played this season." />
            <Stat label="League Pos." value={team.position != null ? `#${team.position}` : null} />
          </>
        ) : (
          <>
            <Stat label="Points" value={team.points} tip="Total league points this season." />
            <Stat label="Played" value={team.played} tip="Matches played this season." />
            <Stat label="Last 5 (W-D-L)" value={form.length ? `${wins}-${draws}-${losses}` : null} />
            <Stat label="Goals / game" value={team.goalsPerGame} tip="Average goals scored per match." />
            <Stat label="Conceded / game" value={team.concededPerGame} tip="Average goals conceded per match." />
          </>
        )}
      </div>

      {/* Squad */}
      <h3 className="font-display font-black uppercase text-sm text-zinc-400 mt-7 mb-3 flex items-center gap-2">
        <Users className="w-4 h-4" /> Squad {players && !isBasket && <span className="text-zinc-600">({players.length})</span>}
      </h3>
      {isBasket ? (
        <div className="text-zinc-500 text-sm py-6">Basketball rosters are not available on the current data plan yet.</div>
      ) : loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
      ) : !players || players.length === 0 ? (
        <div className="text-zinc-500 text-sm py-6">Squad data not available for this team.</div>
      ) : (
        <div className="space-y-5" data-testid="players-table">
          {grouped.map(([pos, arr]) => (
            <div key={pos}>
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-zinc-600 mb-2">{pos} <span className="text-zinc-700">· {arr.length}</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {arr.map((p) => <PlayerCard key={p.id} p={p} onClick={() => setOpenPlayer(p)} />)}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-zinc-600">Tap any player to see their real season statistics.</p>
        </div>
      )}
      {openPlayer && <PlayerModal player={openPlayer} onClose={() => setOpenPlayer(null)} />}
    </div>
  );
}

export default function TeamsPage() {
  const { accessibleIds } = useEntitlements();
  const [searchParams] = useSearchParams();
  const wantLeague = searchParams.get("league");
  const [pendingTeam, setPendingTeam] = useState(searchParams.get("team"));
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
    if (league) return;
    const wanted = wantLeague && LEAGUE_CATALOG.find((l) => l.id === wantLeague && accessibleIds.has(l.id));
    const first = wanted || LEAGUE_CATALOG.find((l) => accessibleIds.has(l.id)) || LEAGUE_CATALOG[0];
    if (first) setLeague(first.id);
  }, [accessibleIds, league, wantLeague]);

  useEffect(() => {
    if (!league) return;
    setTeam(null);
    setLoading(true);
    api.get(`/teams?league=${encodeURIComponent(league)}`)
      .then((r) => {
        const list = r.data.teams || [];
        setTeams(list);
        if (pendingTeam) {
          const match = list.find((t) => String(t.id) === String(pendingTeam));
          if (match) setTeam(match);
          setPendingTeam(null);
        }
      })
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
