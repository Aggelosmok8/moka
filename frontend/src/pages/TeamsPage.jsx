import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, ChevronLeft, Loader2, Shield, ShieldAlert, Users, Ban, AlertTriangle, Square, GitCompare } from "lucide-react";
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

function StatusBadge({ status, reason }) {
  if (!status) return null;
  const MAP = {
    injured:   { cls: "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30", Icon: ShieldAlert, label: "Injured" },
    suspended: { cls: "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/30", Icon: Ban, label: "Suspended" },
    yellow:    { cls: "bg-[#FFD60A]/15 text-[#FFD60A] border-[#FFD60A]/40", Icon: Square, label: "Booking" },
    doubtful:  { cls: "bg-[#FF9500]/15 text-[#FF9500] border-[#FF9500]/30", Icon: AlertTriangle, label: "Doubtful" },
  };
  const m = MAP[status] || MAP.injured;
  const Icon = m.Icon;
  return (
    <span
      title={reason || m.label}
      data-testid={`player-status-${status}`}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black uppercase leading-none shrink-0 ${m.cls}`}
    >
      <Icon className="w-3 h-3" /> {m.label}
    </span>
  );
}

function PlayerCard({ p, onClick }) {
  return (
    <button type="button" onClick={onClick} className="w-full text-left flex items-center gap-3 bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 hover:border-[#39FF14]/40 transition-colors" data-testid={`player-row-${p.id}`}>
      {p.photo ? (
        <img src={p.photo} alt={p.name} className="w-10 h-10 rounded-full object-cover bg-white/5 shrink-0"
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-500 text-xs font-bold shrink-0">{p.number ?? "?"}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white font-semibold flex items-center gap-1.5">
          <span className="truncate">{p.name}</span>
          <StatusBadge status={p.status} reason={p.statusReason} />
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

function PlayerBarChart({ stats }) {
  const rows = [
    ["Goals", stats.goals], ["Assists", stats.assists], ["Shots", stats.shots],
    ["Key Passes", stats.keyPasses], ["Tackles", stats.tackles], ["Duels Won", stats.duelsWon],
  ];
  const max = Math.max(1, ...rows.map(([, v]) => v || 0));
  return (
    <div className="mt-4 bg-[#0d1117] border border-[#30363d] rounded-lg p-3" data-testid="player-chart">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Season output</div>
      <div className="space-y-1.5">
        {rows.map(([label, v]) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-20 text-[11px] text-zinc-400 shrink-0">{label}</div>
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#39FF14] rounded-full transition-all" style={{ width: `${((v || 0) / max) * 100}%` }} />
            </div>
            <div className="w-6 text-right text-[11px] font-mono-num text-white">{v || 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerModal({ player, teamId, teamName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notPlayed, setNotPlayed] = useState(false);
  useEffect(() => {
    setLoading(true); setNotPlayed(false); setData(null);
    api.get(`/players/${player.id}${teamId ? `?team=${teamId}` : ""}`)
      .then((r) => {
        if (r.data && r.data.played === false) setNotPlayed(true);
        else setData(r.data);
      })
      .catch(() => setNotPlayed(true))
      .finally(() => setLoading(false));
  }, [player.id, teamId]);
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
            {player.status && <div className="mt-1.5"><StatusBadge status={player.status} reason={player.statusReason} /></div>}
          </div>
          <button onClick={onClose} data-testid="player-modal-close" className="text-zinc-500 hover:text-white text-sm px-2">✕</button>
        </div>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
        ) : notPlayed || !data ? (
          <div className="text-zinc-400 text-sm py-8 text-center" data-testid="player-not-played">
            {player.name} hasn't played for {teamName || "this club"} yet this season.
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">{data.team || teamName || ""} · {data.season} season</div>
            <div className="grid grid-cols-3 gap-2" data-testid="player-stats-grid">
              {cells.map(([l, v]) => <PlayerStatCell key={l} label={l} value={v} />)}
            </div>
            <PlayerBarChart stats={s} />
          </>
        )}
      </div>
    </div>
  );
}

function formWDL(form) {
  const f = Array.isArray(form) ? form.slice(-5) : [];
  const w = f.filter((r) => r === "W").length;
  const d = f.filter((r) => r === "D").length;
  const l = f.filter((r) => r === "L").length;
  return { str: f.length ? `${w}-${d}-${l}` : null, pts: w * 3 + d };
}

function pickBetter(a, b, higherBetter) {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  if (a === b) return null;
  const aWins = higherBetter ? a > b : a < b;
  return aWins ? "a" : "b";
}

function CompareRow({ label, a, b, better }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2.5 border-b border-[#30363d] last:border-0">
      <div className={`text-right font-display font-black text-lg ${better === "a" ? "text-[#39FF14]" : "text-white"}`}>{a ?? "—"}</div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 text-center px-2 whitespace-nowrap">{label}</div>
      <div className={`text-left font-display font-black text-lg ${better === "b" ? "text-[#39FF14]" : "text-white"}`}>{b ?? "—"}</div>
    </div>
  );
}

function ComparePanel({ base, teams, league }) {
  const [otherId, setOtherId] = useState("");
  const [csA, setCsA] = useState(undefined);
  const [csB, setCsB] = useState(undefined);
  const other = teams.find((t) => String(t.id) === String(otherId));

  // Clean sheets are lazy + cached 24h on the backend — fetched only when compare is open.
  useEffect(() => {
    setCsA(undefined);
    api.get(`/teams/${base.id}/stats?league=${encodeURIComponent(league)}`)
      .then((r) => setCsA(r.data?.stats?.clean_sheets ?? null))
      .catch(() => setCsA(null));
  }, [base.id, league]);

  useEffect(() => {
    setCsB(undefined);
    if (!other) return;
    api.get(`/teams/${other.id}/stats?league=${encodeURIComponent(league)}`)
      .then((r) => setCsB(r.data?.stats?.clean_sheets ?? null))
      .catch(() => setCsB(null));
  }, [otherId, league]); // eslint-disable-line

  const num = (v) => (v == null || v === "" ? null : Number(v));
  const fA = formWDL(base.form);
  const fB = other ? formWDL(other.form) : null;

  const rows = other ? [
    { label: "League pos.", a: base.position != null ? `#${base.position}` : null, b: other.position != null ? `#${other.position}` : null, better: pickBetter(base.position, other.position, false) },
    { label: "Points", a: base.points, b: other.points, better: pickBetter(num(base.points), num(other.points), true) },
    { label: "Last 5 (W-D-L)", a: fA.str, b: fB?.str, better: pickBetter(fA.pts, fB?.pts, true) },
    { label: "Goals / game", a: base.goalsPerGame, b: other.goalsPerGame, better: pickBetter(num(base.goalsPerGame), num(other.goalsPerGame), true) },
    { label: "Conceded / game", a: base.concededPerGame, b: other.concededPerGame, better: pickBetter(num(base.concededPerGame), num(other.concededPerGame), false) },
    { label: "Clean sheets", a: csA === undefined ? "…" : csA, b: csB === undefined ? "…" : csB, better: pickBetter(num(csA), num(csB), true) },
  ] : [];

  const options = teams.filter((t) => String(t.id) !== String(base.id));

  return (
    <div className="mt-7" data-testid="team-compare">
      <h3 className="font-display font-black uppercase text-sm text-zinc-400 mb-3 flex items-center gap-2">
        <GitCompare className="w-4 h-4" /> Compare
      </h3>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span className="text-sm text-white font-bold truncate max-w-[40%]">{base.name}</span>
          <span className="text-zinc-500 text-xs uppercase tracking-wider">vs</span>
          <select
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            data-testid="compare-select"
            className="flex-1 min-w-[160px] bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:border-[#39FF14]/50 outline-none"
          >
            <option value="">Select a team…</option>
            {options.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {other ? (
          <div data-testid="compare-result">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pb-3 mb-1 border-b border-[#30363d]">
              <div className="flex items-center justify-end gap-2 min-w-0"><span className="font-display font-black text-white text-sm truncate">{base.name}</span><Crest team={base} size={28} /></div>
              <div className="w-6" />
              <div className="flex items-center gap-2 min-w-0"><Crest team={other} size={28} /><span className="font-display font-black text-white text-sm truncate">{other.name}</span></div>
            </div>
            {rows.map((r) => <CompareRow key={r.label} {...r} />)}
            <p className="text-[11px] text-zinc-600 mt-3">Green highlights the stronger value in each metric.</p>
          </div>
        ) : (
          <div className="text-zinc-500 text-sm py-4 text-center">Pick a team to see a side-by-side comparison of form, goals and clean sheets.</div>
        )}
      </div>
    </div>
  );
}

function TeamDetail({ team, teams, league, onBack }) {
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

      {/* Team comparison (football only) */}
      {!isBasket && teams && teams.length > 1 && (
        <ComparePanel base={team} teams={teams} league={league} />
      )}

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
      {openPlayer && <PlayerModal player={openPlayer} teamId={team.id} teamName={team.name} onClose={() => setOpenPlayer(null)} />}
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
    // A team was requested from the standings — honour it immediately.
    if (wantLeague && LEAGUE_CATALOG.find((l) => l.id === wantLeague)) {
      setLeague(wantLeague);
      return;
    }
    // Otherwise wait for entitlements to load before picking a default.
    if (accessibleIds.size === 0) return;
    const first = LEAGUE_CATALOG.find((l) => accessibleIds.has(l.id)) || LEAGUE_CATALOG[0];
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
              <TeamDetail team={team} teams={teams} league={league} onBack={() => setTeam(null)} />
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
