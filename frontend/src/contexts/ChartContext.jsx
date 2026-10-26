import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

const KEY = "moka_chart_matches";
const MAX = 6;
const Ctx = createContext(null);

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function ChartProvider({ children }) {
  const [items, setItems] = useState(load);

  const save = (next) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  const add = useCallback((entry) => {
    setItems((prev) => {
      if (!entry?.match?.id) return prev;
      if (prev.some((e) => e.match.id === entry.match.id)) return prev; // no duplicates
      if (prev.length >= MAX) return prev;
      const next = [...prev, entry];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => {
      const next = prev.filter((e) => e.match.id !== id);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => save([]), []);
  const has = useCallback((id) => items.some((e) => e.match.id === id), [items]);

  // A watchlist is for matches you still want to watch: once a fixture is over
  // it drops out by itself (no API call — the kick-off time is enough).
  useEffect(() => {
    const isOver = (e) => {
      const st = String(e?.match?.status || "").toLowerCase();
      if (["finished", "ft", "aet", "pen", "ended"].includes(st)) return true;
      const ko = e?.match?.kickoff || e?.match?.commence_time;
      if (!ko) return false;
      const t = new Date(ko).getTime();
      return Number.isFinite(t) && Date.now() - t > 3.5 * 60 * 60 * 1000;
    };
    const prune = () => setItems((prev) => {
      const next = prev.filter((e) => !isOver(e));
      if (next.length === prev.length) return prev;
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    prune();
    const iv = setInterval(prune, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // --- Backend sync readiness ---------------------------------------------
  // Guests use localStorage (above). When a logged-in user is present, this is
  // the single extension point to persist the watchlist server-side. The backend
  // endpoint is intentionally not added yet (no backend changes in this task);
  // wiring it later only requires filling in these two calls — no UI changes.
  const { user } = useAuth() || {};
  useEffect(() => {
    if (!user) return;
    // TODO(sync): GET /api/me/watchlist -> merge with local, then on each
    // add/remove POST/DELETE /api/me/watchlist. Until then localStorage is the
    // source of truth so the feature works identically for guests and users.
  }, [user]);

  return (
    <Ctx.Provider value={{ items, add, remove, clear, has, max: MAX, count: items.length }}>
      {children}
    </Ctx.Provider>
  );
}

export const useChart = () => useContext(Ctx);
