import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { getPortfolioRemote, putPortfolioRemote } from "../lib/api";
import { fetchResults } from "../lib/catalogApi";

const KEY = "moka_portfolio_bets";
const SLIP_KEY = "moka_bet_slip";
const TICKETS_KEY = "moka_tickets";
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

function loadKey(k) {
  try {
    const v = JSON.parse(localStorage.getItem(k));
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

// Pure stats over any list of bets (used for full portfolio + free-tier limited view).
export function computeStats(bets) {
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
}

// Derived numbers for an accumulator ticket.
export function computeTicket(t) {
  const active = t.legs.filter((l) => l.status !== "void");
  const totalOdds = active.reduce((p, l) => p * (Number(l.odds) || 1), 1);
  const potentialReturn = t.stake * totalOdds;
  const anyLost = t.legs.some((l) => l.status === "lost");
  const anyPending = t.legs.some((l) => l.status === "pending");
  let status = "pending";
  if (anyLost) status = "lost";
  else if (!anyPending) status = active.length ? "won" : "void";
  const profit =
    status === "won" ? potentialReturn - t.stake : status === "lost" ? -t.stake : status === "void" ? 0 : null;
  return {
    totalOdds: Math.round(totalOdds * 100) / 100,
    potentialReturn: Math.round(potentialReturn * 100) / 100,
    status,
    profit: profit == null ? null : Math.round(profit * 100) / 100,
  };
}

export function PortfolioProvider({ children }) {
  const [bets, setBets] = useState(load);
  const [slip, setSlip] = useState(() => loadKey(SLIP_KEY));
  const [tickets, setTickets] = useState(() => loadKey(TICKETS_KEY));

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

  // --- Bet slip (accumulator builder) ---
  const saveSlip = (next) => { setSlip(next); try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {} };
  const saveTickets = (next) => { setTickets(next); try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {} };

  const addToSlip = useCallback((leg) => {
    setSlip((prev) => {
      if (!leg?.matchId) return prev;
      if (prev.some((l) => l.matchId === leg.matchId)) return prev; // one leg per match
      const next = [...prev, {
        matchId: leg.matchId, home: leg.home, away: leg.away, league: leg.league,
        pick: leg.pick, pickName: leg.pickName, odds: Number(leg.odds) || 0, bookmaker: leg.bookmaker || "",
      }];
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeFromSlip = useCallback((matchId) => {
    setSlip((prev) => {
      const next = prev.filter((l) => l.matchId !== matchId);
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearSlip = useCallback(() => saveSlip([]), []);
  const slipHas = useCallback((matchId) => slip.some((l) => l.matchId === matchId), [slip]);

  const placeTicket = useCallback((stake) => {
    let placed = false;
    setSlip((prevSlip) => {
      if (!prevSlip.length) return prevSlip;
      const ticket = {
        id: uid(),
        legs: prevSlip.map((l) => ({ ...l, id: uid(), status: "pending" })),
        stake: Number(stake) || 0,
        createdAt: new Date().toISOString(),
      };
      setTickets((prevT) => {
        const next = [ticket, ...prevT];
        try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
      placed = true;
      try { localStorage.setItem(SLIP_KEY, JSON.stringify([])); } catch {}
      return [];
    });
    return placed;
  }, []);

  const settleLeg = useCallback((ticketId, legId, status) => {
    setTickets((prev) => {
      const next = prev.map((t) =>
        t.id === ticketId ? { ...t, legs: t.legs.map((l) => (l.id === legId ? { ...l, status } : l)) } : t
      );
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeTicket = useCallback((ticketId) => {
    setTickets((prev) => {
      const next = prev.filter((t) => t.id !== ticketId);
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearTickets = useCallback(() => saveTickets([]), []);

  // --- Auto-settlement from real final scores -------------------------------
  // Finds every pending single bet + pending accumulator leg, fetches final
  // results in ONE batched (cached) backend call, and marks won/lost by
  // comparing the pick side (home/draw/away) to the real outcome.
  const autoSettle = useCallback(async () => {
    const ids = [
      ...bets.filter((b) => b.status === "pending" && b.matchId).map((b) => b.matchId),
      ...tickets.flatMap((t) => t.legs.filter((l) => l.status === "pending" && l.matchId).map((l) => l.matchId)),
    ];
    const unique = [...new Set(ids)];
    if (!unique.length) return { settled: 0 };
    let results = {};
    try { results = await fetchResults(unique); } catch { return { settled: 0 }; }
    let settled = 0;
    const settleLegOrBet = (item) => {
      if (item.status !== "pending") return item;
      const r = results[item.matchId];
      if (r && r.finished && r.outcome) {
        settled++;
        return {
          ...item,
          status: r.outcome === item.pick ? "won" : "lost",
          finalScore: `${r.home}-${r.away}`,
          settledAt: new Date().toISOString(),
        };
      }
      return item;
    };
    setBets((prev) => {
      const next = prev.map(settleLegOrBet);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setTickets((prev) => {
      const next = prev.map((t) => ({ ...t, legs: t.legs.map(settleLegOrBet) }));
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    return { settled };
  }, [bets, tickets]);

  const pendingCount = useMemo(() => bets.filter((b) => b.status === "pending").length, [bets]);

  const stats = useMemo(() => computeStats(bets), [bets]);

  // --- Cloud sync (logged-in users) ------------------------------------------
  // Guests use localStorage only. When a user logs in, we pull their server copy
  // (source of truth); if the server is empty we push the local data up. After
  // that, every change is debounced-saved to Supabase via the backend.
  const { user } = useAuth() || {};
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!user) { syncedRef.current = false; return; }
    let active = true;
    getPortfolioRemote()
      .then((remote) => {
        if (!active) return;
        const remoteBets = remote?.bets || [];
        const remoteTickets = remote?.tickets || [];
        if (remoteBets.length || remoteTickets.length) {
          setBets(remoteBets); try { localStorage.setItem(KEY, JSON.stringify(remoteBets)); } catch {}
          setTickets(remoteTickets); try { localStorage.setItem(TICKETS_KEY, JSON.stringify(remoteTickets)); } catch {}
        } else if (bets.length || tickets.length) {
          putPortfolioRemote({ bets, tickets }).catch(() => {});
        }
        syncedRef.current = true;
      })
      .catch(() => { syncedRef.current = true; });
    return () => { active = false; };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !syncedRef.current) return;
    const t = setTimeout(() => { putPortfolioRemote({ bets, tickets }).catch(() => {}); }, 800);
    return () => clearTimeout(t);
  }, [bets, tickets, user]);

  return (
    <Ctx.Provider value={{
      bets, addBet, settle, updateStake, remove, clear, pendingCount, stats,
      slip, addToSlip, removeFromSlip, clearSlip, slipHas, slipCount: slip.length,
      tickets, placeTicket, settleLeg, removeTicket, clearTickets, autoSettle,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePortfolio = () => useContext(Ctx);
