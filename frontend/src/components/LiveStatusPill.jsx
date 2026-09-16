import React, { useEffect, useState } from "react";
import { fetchStatus } from "../lib/api";
import { WifiOff } from "lucide-react";

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
      // Non-destructive: just re-fetch live status. Clearing the server cache is
      // an admin-only action (/api/admin/refresh) and must not be user-triggered.
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
      title={live ? `Live data · updated ${timeAgo(lastUpdate)}` : "Mock data"}
      className="hidden md:flex items-center gap-1.5 whitespace-nowrap shrink-0"
    >
      {live ? (
        <span className="flex items-center gap-1.5 text-[#39FF14] font-bold uppercase tracking-wider text-[10px]">
          <span className="w-2 h-2 rounded-full bg-[#39FF14] live-dot" /> Live
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
          <WifiOff className="w-3 h-3" /> Mock
        </span>
      )}
    </div>
  );
};

export default LiveStatusPill;
