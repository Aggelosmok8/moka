import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { legWins, settleStatus, matchKey } from "../lib/picks";
import { getPortfolioRemote, putPortfolioRemote } from "../lib/api";
import { fetchResults } from "../lib/catalogApi";

const KEY = "moka_portfolio_bets";
const SLIP_KEY = "moka_bet_slip";
const TICKETS_KEY = "moka_tickets";
const OWNER_KEY = "moka_portfolio_owner";  // who the local data belongs to (userId | "guest")
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
    .sort((a, b) => (Date.parse(a.kickoff || a.settledAt) || 0) - (Date.parse(b.kickoff || b.settledAt) || 0))
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

const _r2 = (n) => Math.round(n * 100) / 100;

// LION ticket logic (per-selection, NOT all-or-nothing accumulator).
// Each selection is settled on its own: WON -> stake×odds, LOST -> 0, VOID -> refund.
// Ticket stake is the stake PER selection, so Total Stake = stake × selections.
export function computeTicket(t) {
  const legs = t.legs || [];
  const stakePer = Number(t.stake) || 0;
  const counted = legs.filter((l) => l.status !== "void");     // void = removed/cancelled
  const won = counted.filter((l) => l.status === "won");
  const lost = counted.filter((l) => l.status === "lost");
  const pending = counted.filter((l) => l.status === "pending");
  const total = counted.length;
  const decided = won.length + lost.length;

  const totalStake = stakePer * total;
  const totalReturn = won.reduce((s, l) => s + stakePer * (Number(l.odds) || 0), 0);
  const settledStake = decided * stakePer;
  // Realized P/L on the selections that have already settled.
  const profit = decided === 0 ? null : totalReturn - settledStake;
  // Potential return if all current selections win (for the still-active view).
  const potentialReturn = counted.reduce((s, l) => s + stakePer * (Number(l.odds) || 0), 0);

  const status = pending.length > 0 ? "pending" : total === 0 ? "void" : "settled";
  return {
    total,
    wonCount: won.length,
    lostCount: lost.length,
    pendingCount: pending.length,
    progress: `${won.length}/${total}`,          // e.g. 9/10 — never all-or-nothing
    totalStake: _r2(totalStake),
    totalReturn: _r2(totalReturn),
    potentialReturn: _r2(potentialReturn),
    profit: profit == null ? null : _r2(profit),
    status,
  };
}

export function PortfolioProvider({ children }) {
  const [bets, setBets] = useState(load);
  const [slip, setSlip] = useState(() => loadKey(SLIP_KEY));
  const [tickets, setTickets] = useState(() => loadKey(TICKETS_KEY));
  const [newlySettled, setNewlySettled] = useState(() => {
    const n = parseInt(localStorage.getItem("moka_newly_settled") || "0", 10);
    return Number.isFinite(n) ? n : 0;
  });
  const clearNewlySettled = useCallback(() => {
    setNewlySettled(0);
    try { localStorage.setItem("moka_newly_settled", "0"); } catch {}
  }, []);

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
      // Portfolio dates a bet by KICKOFF (match start), not by settle time.
      kickoff: bet.kickoff || bet.commence_time || null,
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
      const key = matchKey(leg.home, leg.away);
      // One leg per match — ids can differ between feeds, so also match on teams.
      if (prev.some((l) => l.matchId === leg.matchId || (key && matchKey(l.home, l.away) === key))) return prev;
      const next = [...prev, {
        matchId: leg.matchId, home: leg.home, away: leg.away, league: leg.league,
        pick: leg.pick, pickName: leg.pickName, odds: Number(leg.odds) || 0, bookmaker: leg.bookmaker || "",
        // Match start time — Portfolio dates performance by KICKOFF, not settle time (#8).
        kickoff: leg.kickoff || leg.commence_time || null,
      }];
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const removeFromSlip = useCallback((matchId, home, away) => {
    setSlip((prev) => {
      const key = home || away ? matchKey(home, away) : "";
      const next = prev.filter((l) => l.matchId !== matchId && !(key && matchKey(l.home, l.away) === key));
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Let the user edit a leg's odds to the price they actually played (#3).
  const updateSlipLegOdds = useCallback((matchId, odds) => {
    setSlip((prev) => {
      const next = prev.map((l) => (l.matchId === matchId ? { ...l, odds: Number(odds) || 0 } : l));
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearSlip = useCallback(() => saveSlip([]), []);
  const slipHas = useCallback((matchId, home, away) => {
    const key = home || away ? matchKey(home, away) : "";
    return slip.some((l) => (matchId && l.matchId === matchId) || (key && matchKey(l.home, l.away) === key));
  }, [slip]);

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
      ...slip.filter((l) => l.matchId).map((l) => l.matchId),
    ];
    const unique = [...new Set(ids)];
    if (!unique.length) return { settled: 0 };
    let results = {};
    try { results = await fetchResults(unique); } catch { return { settled: 0 }; }
    let settled = 0;
    const settleLegOrBet = (item) => {
      if (item.status !== "pending") return item;
      const r = results[item.matchId];
      const resolved = r && r.finished ? settleStatus(item.pick, r) : null;
      if (resolved) {
        settled++;
        return {
          ...item,
          status: resolved,
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
    if (settled > 0) {
      setNewlySettled((n) => {
        const v = n + settled;
        try { localStorage.setItem("moka_newly_settled", String(v)); } catch {}
        return v;
      });
    }
    return { settled };
  }, [bets, tickets, slip]);

  // Run auto-settlement once app-wide (any page) so finished matches settle and
  // the Portfolio nav shows a "new result" badge even if the user isn't on it.
  const autoRunRef = useRef(false);
  useEffect(() => {
    if (autoRunRef.current) return;
    autoRunRef.current = true;
    const hasPending = bets.some((b) => b.status === "pending") ||
      tickets.some((t) => t.legs.some((l) => l.status === "pending")) ||
      slip.length > 0;
    if (!hasPending) return;
    const t = setTimeout(() => { autoSettle(); }, 1500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCount = useMemo(() => bets.filter((b) => b.status === "pending").length, [bets]);

  const stats = useMemo(() => computeStats(bets), [bets]);

  // --- Cloud sync (logged-in users) ------------------------------------------
  // Guests use localStorage only. When a user logs in, we pull their server copy
  // (source of truth). CRITICAL (per-user isolation): local data is only claimed
  // into an account if it already belongs to THIS user or to a guest session —
  // never data left behind by a DIFFERENT user on the same browser.
  const { user } = useAuth() || {};
  const syncedRef = useRef(false);
  const prevUserRef = useRef(undefined);

  const _wipeLocal = useCallback(() => {
    setBets([]); setTickets([]); setSlip([]);
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(TICKETS_KEY);
      localStorage.removeItem(SLIP_KEY);
      localStorage.removeItem("moka_newly_settled");
      localStorage.removeItem(OWNER_KEY);
    } catch {}
    setNewlySettled(0);
  }, []);

  // Detect logout (had a user -> now null): clear this user's footprint so the
  // next person on this browser starts from a clean slate.
  useEffect(() => {
    const prevId = prevUserRef.current;
    const curId = user?.user_id || user?.email || null;
    if (prevId && !curId) _wipeLocal();
    prevUserRef.current = curId;
  }, [user, _wipeLocal]);

  useEffect(() => {
    if (!user) { syncedRef.current = false; return; }
    let active = true;
    const meId = user.user_id || user.email;
    const owner = (() => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } })();
    // Local data is claimable only if it's already ours or from a guest session.
    const claimable = !owner || owner === "guest" || owner === meId;
    const localBets = claimable ? bets : [];
    const localTickets = claimable ? tickets : [];
    if (!claimable) {
      // Stale data from a different user — discard before showing anything.
      setBets([]); setTickets([]); setSlip([]);
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(TICKETS_KEY);
        localStorage.removeItem(SLIP_KEY);
      } catch {}
    }
    getPortfolioRemote()
      .then((remote) => {
        if (!active) return;
        const remoteBets = remote?.bets || [];
        const remoteTickets = remote?.tickets || [];
        if (remoteBets.length || remoteTickets.length) {
          setBets(remoteBets); try { localStorage.setItem(KEY, JSON.stringify(remoteBets)); } catch {}
          setTickets(remoteTickets); try { localStorage.setItem(TICKETS_KEY, JSON.stringify(remoteTickets)); } catch {}
        } else if (localBets.length || localTickets.length) {
          setBets(localBets); try { localStorage.setItem(KEY, JSON.stringify(localBets)); } catch {}
          setTickets(localTickets); try { localStorage.setItem(TICKETS_KEY, JSON.stringify(localTickets)); } catch {}
          putPortfolioRemote({ bets: localBets, tickets: localTickets }).catch(() => {});
        }
        try { localStorage.setItem(OWNER_KEY, meId); } catch {}
        syncedRef.current = true;
      })
      // If the server copy can't be read, DO NOT enable upload — otherwise an
      // empty local state would overwrite (and lose) the user's saved tickets.
      .catch(() => { syncedRef.current = false; });
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
      slip, addToSlip, removeFromSlip, updateSlipLegOdds, clearSlip, slipHas, slipCount: slip.length,
      tickets, placeTicket, settleLeg, removeTicket, clearTickets, autoSettle,
      newlySettled, clearNewlySettled,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePortfolio = () => useContext(Ctx);
