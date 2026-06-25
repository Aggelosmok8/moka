import React, { useEffect, useState } from "react";
import { fetchStatus, refreshCache } from "../lib/api";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const LiveStatusPill = ({ onRefresh }) => {
  const [status, setStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => fetchStatus().then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCache("all");
      await load();
      if (onRefresh) onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  };

  const live = status?.api_football_key_configured;
  const meta = status?.cache_meta || {};
  const lastUpdate =
    meta.live_fixtures ||
    meta.standings_epl ||
    Object.values(meta)[0] ||
    null;

  return (
    <div
      data-testid="live-status-pill"
      className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.02] text-xs"
    >
      {live ? (
        <span className="flex items-center gap-1.5 text-[#39FF14] font-bold uppercase tracking-wider text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] live-dot" />
          <Wifi className="w-3 h-3" />
          Live
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
          <WifiOff className="w-3 h-3" /> Mock
        </span>
      )}
      <span className="text-zinc-500 hidden lg:inline">·</span>
      <span className="text-zinc-400 font-medium hidden lg:inline">{timeAgo(lastUpdate)}</span>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        data-testid="refresh-btn"
        className="ml-1 p-1 rounded hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
        title="Refresh live data"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
};

export default LiveStatusPill;
