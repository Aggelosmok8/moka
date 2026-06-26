import React, { createContext, useContext, useCallback, useState } from "react";

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

  return (
    <Ctx.Provider value={{ items, add, remove, clear, has, max: MAX, count: items.length }}>
      {children}
    </Ctx.Provider>
  );
}

export const useChart = () => useContext(Ctx);
