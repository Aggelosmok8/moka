import React, { createContext, useContext, useCallback, useMemo, useState } from "react";

const KEY = "moka_portfolio_bets";
const Ctx = createContext(null);

const uid = () => {
  try { return crypto.randomUUID(); } catch { return `b_${Date.now()}_${Math.round(Math.random() * 1e6)}`; }
};

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// returns for a single settled/pending bet
function betReturn(b) {
  if (b.status === "won") return b.stake * b.odds;
  if (b.status === "void") return b.stake;
  if (b.status === "lost") return 0;
  return 0; // pending
}

export function PortfolioProvider({ children }) {
  const [bets, setBets] = useState(load);

  const persist = (next) => {
    setBets(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };

  const addBet = useCallback((bet) => {
    const entry = {
      id: uid(),
      matchId: bet.matchId,
      home: bet.home,
      away: bet.away,
      league: bet.league,
      pick: bet.pick,
      pickName: bet.pickName,
      odds: Number(bet.odds) || 0,
      bookmaker: bet.bookmaker || "",
      stake: Number(bet.stake) || 0,
      status: "pending",
      createdAt: new Date().toISOString(),
      settledAt: null,
    };
    setBets((prev) => {
      const next = [entry, ...prev];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    return entry.id;
  }, []);

  const settle = useCallback((id, status) => {
    setBets((prev) => {
      const next = prev.map((b) =>
        b.id === id ? { ...b, status, settledAt: status === "pending" ? null : new Date().toISOString() } : b
      );
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const updateStake = useCallback((id, stake) => {
    setBets((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, stake: Number(stake) || 0 } : b));
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setBets((prev) => {
      const next = prev.filter((b) => b.id !== id);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => persist([]), []);

  const pendingCount = useMemo(() => bets.filter((b) => b.status === "pending").length, [bets]);

  const stats = useMemo(() => {
    const settled = bets.filter((b) => b.status !== "pending");
    const pending = bets.filter((b) => b.status === "pending");
    const won = settled.filter((b) => b.status === "won");
    const lost = settled.filter((b) => b.status === "lost");

    const stakedAll = bets.reduce((s, b) => s + b.stake, 0);
    const stakedSettled = settled.reduce((s, b) => s + b.stake, 0);
    const returnsSettled = settled.reduce((s, b) => s + betReturn(b), 0);
    const profit = returnsSettled - stakedSettled;
    const roi = stakedSettled > 0 ? (profit / stakedSettled) * 100 : 0;
    const decided = won.length + lost.length;
    const winRate = decided > 0 ? (won.length / decided) * 100 : 0;
    const pendingStake = pending.reduce((s, b) => s + b.stake, 0);
    const pendingPotential = pending.reduce((s, b) => s + b.stake * b.odds, 0);

    // cumulative P/L timeline over settled bets (oldest -> newest)
    const timeline = [...settled]
      .sort((a, b) => (Date.parse(a.settledAt) || 0) - (Date.parse(b.settledAt) || 0))
      .reduce((acc, b) => {
        const delta = betReturn(b) - b.stake;
        const running = (acc.length ? acc[acc.length - 1].pl : 0) + delta;
        acc.push({ label: `${b.home?.slice(0, 3) || "?"}`.toUpperCase(), pl: Math.round(running * 100) / 100, delta });
        return acc;
      }, []);

    return {
      total: bets.length,
      settledCount: settled.length,
      pendingCount: pending.length,
      wonCount: won.length,
      lostCount: lost.length,
      stakedAll: Math.round(stakedAll * 100) / 100,
      stakedSettled: Math.round(stakedSettled * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      roi: Math.round(roi * 10) / 10,
      winRate: Math.round(winRate),
      pendingStake: Math.round(pendingStake * 100) / 100,
      pendingPotential: Math.round(pendingPotential * 100) / 100,
      timeline,
    };
  }, [bets]);

  return (
    <Ctx.Provider value={{ bets, addBet, settle, updateStake, remove, clear, pendingCount, stats }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePortfolio = () => useContext(Ctx);
