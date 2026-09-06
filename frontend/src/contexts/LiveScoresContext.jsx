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
    const t = setInterval(load, 60000); // one cached backend call / minute
    return () => clearInterval(t);
  }, [load]);

  const map = useMemo(() => Object.fromEntries(list.map((m) => [m.id, m])), [list]);
  const get = useCallback((id) => map[id] || null, [map]);

  return <Ctx.Provider value={{ list, get }}>{children}</Ctx.Provider>;
}

export const useLiveScores = () => useContext(Ctx);
