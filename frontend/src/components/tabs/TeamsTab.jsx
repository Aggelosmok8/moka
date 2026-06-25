import { useEffect, useState } from "react";
import { Lock, Loader2, Shield, X, Crown } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function PlayersDialog({ team, sport, onClose, onUpgrade }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/sports/players", { params: { sport, team } })
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [team, sport]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" data-testid="players-dialog">
      <div className="relative w-full max-w-md card-surface p-6 max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
        <p className="eyebrow text-[#007AFF]">Roster</p>
        <h3 className="heading text-2xl mt-1 flex items-center gap-2"><Shield size={20} className="text-gray-400" /> {team}</h3>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
        ) : (
          <>
            <div className="mt-5 divide-y divide-white/5">
              {data?.players?.map((p) => (
                <div key={p.number} className="flex items-center gap-3 py-2.5">
                  <span className="w-7 h-7 rounded bg-[#007AFF]/15 text-[#007AFF] text-xs font-bold flex items-center justify-center">{p.number}</span>
                  <span className="flex-1 font-medium text-sm">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.position}</span>
                </div>
              ))}
            </div>
            {data?.source === "sample" && (
              <p className="text-[11px] text-gray-500 mt-3">Sample roster — full live rosters activate with the stats provider.</p>
            )}
            {data?.locked_count > 0 && (
              <div className="mt-5 border border-[#007AFF]/30 bg-[#007AFF]/5 rounded-lg p-4 text-center">
                <Lock size={18} className="mx-auto text-[#007AFF]" />
                <p className="text-sm text-gray-200 mt-2">{data.locked_count} more players hidden on the Free tier.</p>
                <button onClick={onUpgrade} className="btn-primary mt-3 px-4 py-2 text-sm inline-flex items-center gap-1.5">
                  <Crown size={14} /> Unlock full roster
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TeamsTab({ onUpgrade }) {
  const [leagues, setLeagues] = useState([]);
  const [sport, setSport] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openTeam, setOpenTeam] = useState(null);

  useEffect(() => {
    api.get("/sports/leagues").then((r) => {
      setLeagues(r.data.leagues);
      const first = r.data.leagues.find((l) => !l.locked) || r.data.leagues[0];
      if (first) setSport(first.key);
    });
  }, []);

  useEffect(() => {
    if (!sport) return;
    setLoading(true);
    api.get("/sports/teams", { params: { sport } })
      .then((r) => setTeams(r.data.teams))
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }, [sport]);

  const groups = leagues.reduce((acc, l) => {
    (acc[l.group] = acc[l.group] || []).push(l);
    return acc;
  }, {});

  const selectLeague = (l) => { if (l.locked) { onUpgrade(); return; } setSport(l.key); };

  return (
    <div className="fade-up">
      <h1 className="heading text-3xl">Teams</h1>
      <p className="text-gray-400 text-sm mt-1">Explore leagues, teams and full player rosters.</p>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 mt-6">
        {/* League groups */}
        <div className="space-y-5">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="eyebrow text-gray-500 mb-2">{group}</div>
              <div className="space-y-1">
                {items.map((l) => (
                  <button
                    key={l.key}
                    data-testid={`team-league-${l.key}`}
                    onClick={() => selectLeague(l)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm font-semibold flex items-center justify-between transition-colors ${
                      sport === l.key ? "bg-[#007AFF] text-white" : "hover:bg-white/5 text-gray-300"
                    }`}
                  >
                    {l.title} {l.locked && <Lock size={13} className="text-gray-500" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Teams grid */}
        <div>
          {loading ? (
            <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
          ) : teams.length === 0 ? (
            <div className="card-surface p-10 text-center text-gray-400">No teams available for this league right now.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {teams.map((t) => (
                <button
                  key={t.name}
                  data-testid={`team-card-${t.name}`}
                  onClick={() => setOpenTeam(t)}
                  className="card-surface p-5 text-left hover:-translate-y-1 hover:border-white/20 transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center mb-3">
                    <Shield size={20} className="text-[#007AFF]" />
                  </div>
                  <div className="heading text-lg leading-tight">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{t.league}</div>
                  <div className="text-xs text-gray-400 mt-3">{t.upcoming_matches} upcoming match{t.upcoming_matches === 1 ? "" : "es"}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {openTeam && <PlayersDialog team={openTeam.name} sport={openTeam.sport} onClose={() => setOpenTeam(null)} onUpgrade={onUpgrade} />}
    </div>
  );
}
