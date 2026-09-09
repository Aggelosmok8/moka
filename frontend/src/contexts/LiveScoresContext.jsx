import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { fetchLive } from "../lib/catalogApi";

const Ctx = createContext({ list: [], get: () => null });

export function LiveScoresProvider({ children }) {
  const [list, setList] = useState([]);

  const load = useCallback(() => {
    fetchLive()
      .then((arr) => setList(Array.isArray(arr) ? arr : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // Poll only while the tab is visible (no background drain), every 2 min.
    const t = setInterval(() => { if (!document.hidden) load(); }, 120000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const map = useMemo(() => Object.fromEntries(list.map((m) => [m.id, m])), [list]);
  const get = useCallback((id) => map[id] || null, [map]);

  return <Ctx.Provider value={{ list, get }}>{children}</Ctx.Provider>;
}

export const useLiveScores = () => useContext(Ctx);
