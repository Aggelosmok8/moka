import { useEffect, useState, useCallback } from "react";
import { Lock, Plus, TrendingUp, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function StatusBadge({ status }) {
  if (status === "live")
    return <span className="text-[11px] font-bold uppercase tracking-wider text-[#FF3B30] flex items-center gap-1.5"><span className="live-dot" /> Live</span>;
  if (status === "finished")
    return <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Finished</span>;
  return <span className="text-[11px] font-bold uppercase tracking-wider text-[#007AFF]">Scheduled</span>;
}

function OddsDialog({ match, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get(`/sports/odds`, { params: { sport: match.sport, event_id: match.id } })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(apiError(e.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [match]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" data-testid="odds-dialog">
      <div className="relative w-full max-w-lg card-surface p-6 max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={20} /></button>
        <p className="eyebrow text-[#007AFF]">Match odds</p>
        <h3 className="heading text-2xl mt-1">{match.home_team} <span className="text-gray-500">v</span> {match.away_team}</h3>
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
        ) : data?.bookmakers?.length ? (
          <div className="mt-5 space-y-3">
            {data.bookmakers.map((bm) => (
              <div key={bm.title} className="border border-white/10 rounded-lg p-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">{bm.title}</div>
                <div className="grid grid-cols-3 gap-2">
                  {bm.outcomes.map((o) => (
                    <div key={o.name} className="bg-[#0A0A0A] rounded-md p-2 text-center">
                      <div className="text-[11px] text-gray-400 truncate">{o.name}</div>
                      <div className="font-display text-lg font-bold text-[#007AFF]">{o.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mt-6">No odds currently published for this match.</p>
        )}
      </div>
    </div>
  );
}

export default function MatchesTab({ onUpgrade }) {
  const { isPro } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [sport, setSport] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [oddsMatch, setOddsMatch] = useState(null);
  const [tracked, setTracked] = useState(new Set());

  useEffect(() => {
    api.get("/sports/leagues").then((r) => {
      setLeagues(r.data.leagues);
      const first = r.data.leagues.find((l) => !l.locked) || r.data.leagues[0];
      if (first) setSport(first.key);
    });
    api.get("/chart").then((r) => setTracked(new Set(r.data.tracked.map((t) => t.match_id)))).catch(() => {});
  }, []);

  const loadMatches = useCallback((s) => {
    setLoading(true);
    api.get("/sports/matches", { params: { sport: s } })
      .then((r) => setMatches(r.data.matches))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (sport) loadMatches(sport); }, [sport, loadMatches]);

  const selectLeague = (l) => {
    if (l.locked) { onUpgrade(); return; }
    setSport(l.key);
  };

  const track = async (m) => {
    try {
      await api.post("/chart", {
        match_id: m.id, sport: m.sport, home_team: m.home_team,
        away_team: m.away_team, commence_time: m.commence_time, league: m.league,
      });
      setTracked((prev) => new Set(prev).add(m.id));
      toast.success("Added to your Match Chart");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const showOdds = (m) => { if (!isPro) { onUpgrade(); return; } setOddsMatch(m); };

  return (
    <div className="fade-up">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="heading text-3xl">Matches</h1>
          <p className="text-gray-400 text-sm mt-1">Browse fixtures, track them and check live odds.</p>
        </div>
      </div>

      {/* League pills */}
      <div className="flex gap-2 flex-wrap mt-6">
        {leagues.map((l) => (
          <button
            key={l.key}
            data-testid={`league-pill-${l.key}`}
            onClick={() => selectLeague(l)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all flex items-center gap-1.5 ${
              sport === l.key ? "bg-[#007AFF] border-[#007AFF] text-white"
              : l.locked ? "border-white/10 text-gray-500 hover:border-white/20"
              : "border-white/15 text-gray-200 hover:border-white/30"
            }`}
          >
            {l.locked && <Lock size={12} />} {l.title}
          </button>
        ))}
      </div>

      {/* Matches */}
      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>
      ) : matches.length === 0 ? (
        <div className="card-surface p-10 mt-6 text-center text-gray-400">No upcoming matches found for this league right now.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {matches.map((m) => {
            const isTracked = tracked.has(m.id);
            return (
              <div key={m.id} data-testid={`match-card-${m.id}`} className="card-surface p-5 hover:-translate-y-1 hover:border-white/20 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wider">{m.league}</span>
                  <StatusBadge status={m.status} />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{m.home_team}</span>
                    <span className="font-display text-xl font-bold">{m.home_score ?? "–"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{m.away_team}</span>
                    <span className="font-display text-xl font-bold">{m.away_score ?? "–"}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-3">
                  {m.commence_time ? new Date(m.commence_time).toLocaleString() : ""}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    data-testid={`track-match-${m.id}`}
                    onClick={() => track(m)}
                    disabled={isTracked}
                    className={`flex-1 py-2 rounded text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      isTracked ? "bg-[#10B981]/15 text-[#10B981]" : "bg-white/5 hover:bg-white/10 text-white"
                    }`}
                  >
                    {isTracked ? <><Check size={14} /> Tracking</> : <><Plus size={14} /> Track</>}
                  </button>
                  <button
                    data-testid={`odds-match-${m.id}`}
                    onClick={() => showOdds(m)}
                    className="flex-1 py-2 rounded text-sm font-semibold bg-white/5 hover:bg-white/10 flex items-center justify-center gap-1.5"
                  >
                    {isPro ? <TrendingUp size={14} /> : <Lock size={14} />} Odds
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {oddsMatch && <OddsDialog match={oddsMatch} onClose={() => setOddsMatch(null)} />}
    </div>
  );
}
