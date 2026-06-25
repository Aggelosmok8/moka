import { useEffect, useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Trash2, LineChart as LineChartIcon, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

function StatusPill({ status }) {
  const map = {
    live: ["#FF3B30", "Live"],
    finished: ["#9CA3AF", "Finished"],
    scheduled: ["#007AFF", "Scheduled"],
  };
  const [color, label] = map[status] || map.scheduled;
  return (
    <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color }}>
      {status === "live" && <span className="live-dot" />} {label}
    </span>
  );
}

export default function MatchChartTab() {
  const [tracked, setTracked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { data } = await api.get("/chart");
      setTracked(data.tracked);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  const remove = async (matchId) => {
    await api.delete(`/chart/${matchId}`);
    setTracked((prev) => prev.filter((t) => t.match_id !== matchId));
    toast.success("Removed from chart");
  };

  const chartData = tracked.map((t) => ({
    name: `${(t.home_team || "").slice(0, 3).toUpperCase()}–${(t.away_team || "").slice(0, 3).toUpperCase()}`,
    home: Number(t.home_score) || 0,
    away: Number(t.away_score) || 0,
    status: t.status,
  }));

  if (loading)
    return <div className="py-24 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;

  return (
    <div className="fade-up">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="heading text-3xl">Match Chart</h1>
          <p className="text-gray-400 text-sm mt-1">Your tracked matches, updating live every 30 seconds.</p>
        </div>
        <button data-testid="chart-refresh-btn" onClick={() => load(true)} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white border border-white/15 rounded px-3 py-1.5">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {tracked.length === 0 ? (
        <div className="card-surface p-14 mt-8 text-center">
          <LineChartIcon className="mx-auto text-gray-600" size={40} />
          <h3 className="heading text-xl mt-4">No matches tracked yet</h3>
          <p className="text-gray-400 text-sm mt-2 max-w-sm mx-auto">
            Head to the <b className="text-white">Matches</b> tab and tap <b className="text-white">Track</b> on any fixture to start building your live chart.
          </p>
        </div>
      ) : (
        <>
          <div className="card-surface p-6 mt-6">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-4">Score comparison · home vs away</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={{ stroke: "#222" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#9CA3AF", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <Bar dataKey="home" radius={[4, 4, 0, 0]} fill="#007AFF" />
                <Bar dataKey="away" radius={[4, 4, 0, 0]} fill="#FF3B30">
                  {chartData.map((_, i) => <Cell key={i} fill="#FF3B30" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-5 mt-4 text-xs text-gray-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#007AFF]" /> Home</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-[#FF3B30]" /> Away</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {tracked.map((t) => (
              <div key={t.match_id} data-testid={`tracked-card-${t.match_id}`} className="card-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wider">{t.league || t.sport}</span>
                  <StatusPill status={t.status} />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t.home_team}</span>
                    <span className="font-display text-2xl font-bold text-[#007AFF]">{t.home_score ?? "–"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t.away_team}</span>
                    <span className="font-display text-2xl font-bold">{t.away_score ?? "–"}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-gray-500">
                    {t.commence_time ? new Date(t.commence_time).toLocaleString() : ""}
                  </span>
                  <button
                    data-testid={`untrack-${t.match_id}`}
                    onClick={() => remove(t.match_id)}
                    className="text-gray-500 hover:text-[#EF4444] p-1"
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
