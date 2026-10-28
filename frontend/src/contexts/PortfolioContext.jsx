import React, { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { legWins, settleStatus, matchKey, needsDetail } from "../lib/picks";
import { getPortfolioRemote, putPortfolioRemote } from "../lib/api";
import { fetchResults } from "../lib/catalogApi";

const KEY = "moka_portfolio_bets";
const SLIP_KEY = "moka_bet_slip";
const SLIP_TS_KEY = "moka_slip_updated_at";   // last local slip edit (cross-device LWW)
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

  // Each selection can carry its OWN stake (€5 here, €10 there). The ticket
  // stake is only the fallback for legs that were never given one.
  const legStake = (l) => (Number(l.stake) > 0 ? Number(l.stake) : stakePer);
  const totalStake = counted.reduce((s, l) => s + legStake(l), 0);
  const totalReturn = won.reduce((s, l) => s + legStake(l) * (Number(l.odds) || 0), 0);
  const settledStake = [...won, ...lost].reduce((s, l) => s + legStake(l), 0);
  // Realized P/L on the selections that have already settled.
  const profit = decided === 0 ? null : totalReturn - settledStake;
  // Potential return if all current selections win (for the still-active view).
  const potentialReturn = counted.reduce((s, l) => s + legStake(l) * (Number(l.odds) || 0), 0);

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

  // Deletions have to travel to the server explicitly: the cloud copy MERGES by
  // id (so a second device can never wipe tickets saved from the first one),
  // which means a removed ticket must be named to actually disappear.
  const deletedRef = useRef({ bets: [], tickets: [] });
  const markDeleted = (kind, ids) => {
    deletedRef.current[kind] = [...new Set([...deletedRef.current[kind], ...ids])];
  };

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
    markDeleted("bets", [id]);
    setBets((prev) => {
      const next = prev.filter((b) => b.id !== id);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setBets((prev) => { markDeleted("bets", prev.map((b) => b.id)); return prev; });
    persist([]);
  }, []);

  // --- Bet slip (accumulator builder) ---
  const touchSlip = () => { try { localStorage.setItem(SLIP_TS_KEY, new Date().toISOString()); } catch {} };
  const saveSlip = (next) => { setSlip(next); touchSlip(); try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {} };
  const saveTickets = (next) => { setTickets(next); try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {} };

  const addToSlip = useCallback((leg) => {
    setSlip((prev) => {
      if (!leg?.matchId) return prev;
      const key = matchKey(leg.home, leg.away);
      // One leg per match+selection: the same pick can never be added twice, but
      // different specific-bet markets of the same match can live side by side.
      const samePick = (l) => (l.pick || "") === (leg.pick || "");
      if (prev.some((l) => samePick(l) && (l.matchId === leg.matchId || (key && matchKey(l.home, l.away) === key)))) return prev;
      const next = [...prev, {
        matchId: leg.matchId, home: leg.home, away: leg.away, league: leg.league,
        pick: leg.pick, pickName: leg.pickName, odds: Number(leg.odds) || 0, bookmaker: leg.bookmaker || "",
        stake: Number(leg.stake) > 0 ? Number(leg.stake) : 0,   // per-selection money (0 = use ticket stake)
        kind: leg.kind || "match",
        locked: !!leg.locked,          // LION Ticket legs keep the price as played
        // Match start time — Portfolio dates performance by KICKOFF, not settle time (#8).
        kickoff: leg.kickoff || leg.commence_time || null,
      }];
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      touchSlip();
      return next;
    });
  }, []);

  const removeFromSlip = useCallback((matchId, home, away, pick) => {
    setSlip((prev) => {
      const key = home || away ? matchKey(home, away) : "";
      const isMatch = (l) => l.matchId === matchId || (key && matchKey(l.home, l.away) === key);
      // With a pick we drop only that selection; without one, the match prediction
      // leg only — specific bets are removed individually from their own page.
      const next = prev.filter((l) => !(isMatch(l)
        && (pick ? (l.pick || "") === pick : l.kind !== "specific")));
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      touchSlip();
      return next;
    });
  }, []);

  // Let the user edit a leg's odds to the price they actually played (#3).
  const updateSlipLegOdds = useCallback((matchId, odds, pick) => {
    setSlip((prev) => {
      const next = prev.map((l) => (l.matchId === matchId && (!pick || (l.pick || "") === pick)
        ? { ...l, odds: Number(odds) || 0 } : l));
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      touchSlip();
      return next;
    });
  }, []);

  // Each selection can be played with its own amount (#2).
  const updateSlipLegStake = useCallback((matchId, stake, pick) => {
    setSlip((prev) => {
      const next = prev.map((l) => (l.matchId === matchId && (!pick || (l.pick || "") === pick)
        ? { ...l, stake: Number(stake) || 0 } : l));
      try { localStorage.setItem(SLIP_KEY, JSON.stringify(next)); } catch {}
      touchSlip();
      return next;
    });
  }, []);

  const clearSlip = useCallback(() => saveSlip([]), []);
  // A pick the user has ALREADY played (slip legs are a separate thing): any
  // single bet or ticket leg, whatever its status. Pages use this so the
  // "you played this" highlight survives navigation and a fresh login.
  const playedPick = useCallback((matchId, pick, home, away) => {
    const key = home || away ? matchKey(home, away) : "";
    const hit = (l) => (l.pick || "") === pick
      && ((matchId && l.matchId === matchId) || (key && matchKey(l.home, l.away) === key));
    const found = bets.find(hit)
      || tickets.flatMap((t) => t.legs || []).find(hit);
    return found ? (found.status || "pending") : null;
  }, [bets, tickets]);

  const slipHasPick = useCallback((matchId, pick, home, away) => {
    const key = home || away ? matchKey(home, away) : "";
    return slip.some((l) => (l.pick || "") === pick
      && ((matchId && l.matchId === matchId) || (key && matchKey(l.home, l.away) === key)));
  }, [slip]);

  // Match-level "in slip" = the match prediction only. A specific bet is its own
  // independent selection and must never mark the match itself as played.
  const slipHas = useCallback((matchId, home, away) => {
    const key = home || away ? matchKey(home, away) : "";
    return slip.some((l) => l.kind !== "specific"
      && ((matchId && l.matchId === matchId) || (key && matchKey(l.home, l.away) === key)));
  }, [slip]);

  // Match-level twin of playedPick, for the main 1X2 "add to slip" button.
  // A leg that came from a LION Ticket (kind "ticket") is a separate play and
  // must NOT mark the match itself as played — you can still back it on its own.
  const playedMatch = useCallback((matchId, home, away) => {
    const key = home || away ? matchKey(home, away) : "";
    const hit = (l) => l.kind !== "specific" && l.kind !== "ticket"
      && ((matchId && l.matchId === matchId) || (key && matchKey(l.home, l.away) === key));
    const found = bets.find(hit) || tickets.flatMap((t) => t.legs || []).find(hit);
    return found ? (found.status || "pending") : null;
  }, [bets, tickets]);

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
      touchSlip();
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
    markDeleted("tickets", [ticketId]);
    setTickets((prev) => {
      const next = prev.filter((t) => t.id !== ticketId);
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearTickets = useCallback(() => {
    setTickets((prev) => { markDeleted("tickets", prev.map((t) => t.id)); return prev; });
    saveTickets([]);
  }, []);

  // A ticket the user built by hand (teams/markets we may not even cover).
  // No matchId -> auto-settlement skips it and the user marks won/lost.
  // A LION ticket goes in as its OWN ticket, never merged with the slip or with
  // another LION ticket: each one waits for its own stake and its own Place.
  const addDraftTicket = useCallback((legs, meta = {}) => {
    const ticket = {
      id: uid(),
      draft: true,
      source: meta.source || "lion",
      stake: 0,
      createdAt: new Date().toISOString(),
      legs: (legs || []).map((l) => ({
        id: uid(), status: "pending",
        matchId: l.matchId || null, home: l.home || "", away: l.away || "",
        league: l.league || "", pick: l.pick || "", pickName: l.pickName || "",
        odds: Number(l.odds) || 0, bookmaker: l.bookmaker || "",
        kickoff: l.kickoff || null, kind: l.kind || "ticket",
      })),
    };
    setTickets((prev) => {
      const next = [ticket, ...prev];
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    return ticket.id;
  }, []);

  const placeDraftTicket = useCallback((id, stake) => {
    setTickets((prev) => {
      const next = prev.map((t) => (t.id === id
        ? { ...t, draft: false, stake: Number(stake) || 0, createdAt: new Date().toISOString() }
        : t));
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const addManualTicket = useCallback((legs, stake) => {
    const ticket = {
      id: uid(),
      manual: true,
      stake: Number(stake) || 0,
      createdAt: new Date().toISOString(),
      legs: legs.map((l) => ({
        id: uid(), status: "pending", manual: true,
        matchId: null, home: l.home || "", away: l.away || "", league: l.league || "",
        pick: "", pickName: l.pickName || "", odds: Number(l.odds) || 0,
        bookmaker: l.bookmaker || "", kickoff: l.kickoff || null,
      })),
    };
    setTickets((prev) => {
      const next = [ticket, ...prev];
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    return ticket.id;
  }, []);

  // --- Auto-settlement from real final scores -------------------------------
  // Finds every pending single bet + pending accumulator leg, fetches final
  // results in ONE batched (cached) backend call, and marks won/lost by
  // comparing the pick side (home/draw/away) to the real outcome.
  const autoSettle = useCallback(async () => {
    const pending = [
      ...bets.filter((b) => b.status === "pending" && b.matchId),
      // A draft ticket has not been placed yet — it must not auto-settle.
      ...tickets.filter((t) => !t.draft).flatMap((t) => t.legs.filter((l) => l.status === "pending" && l.matchId)),
    ];
    const ids = [...pending.map((x) => x.matchId), ...slip.filter((l) => l.matchId).map((l) => l.matchId)];
    const unique = [...new Set(ids)];
    if (!unique.length) return { settled: 0 };
    // Specific bets (cards, corners, fouls, saves, first half, players...) need
    // the match stats on top of the score — ask for them only where used.
    const detail = [...new Set(pending.filter((x) => needsDetail(x.pick)).map((x) => x.matchId))];
    let results = {};
    try { results = await fetchResults(unique, detail); } catch { return { settled: 0 }; }
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
      localStorage.removeItem(SLIP_TS_KEY);
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

  const pullingRef = useRef(false);
  const lastPullRef = useRef(0);

  // Pull the cloud copy and MERGE it in. Retries, because a cold backend can take
  // longer than one request's timeout — and a failed pull used to leave the
  // device permanently out of sync for that whole session.
  const pullRemote = useCallback(async (meId, retries = 3) => {
    if (pullingRef.current) return false;
    pullingRef.current = true;
    let remote = null;
    for (let i = 0; i < retries; i++) {
      try { remote = await getPortfolioRemote(); break; }
      catch { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
    }
    pullingRef.current = false;
    // Never upload over a cloud copy we failed to read: that would wipe it.
    if (!remote) return false;

    // Same id on both sides -> keep the MORE SETTLED copy, so a bet marked
    // won/lost on the phone shows as settled on the laptop too.
    const settledScore = (x) => (x.legs
      ? x.legs.filter((l) => l.status && l.status !== "pending").length
      : (x.status && x.status !== "pending" ? 1 : 0));
    const mergeLists = (rem, loc) => {
      const m = new Map();
      for (const x of rem || []) if (x && x.id) m.set(x.id, x);
      for (const x of loc || []) {
        if (!x || !x.id) continue;
        const r = m.get(x.id);
        m.set(x.id, r && settledScore(r) > settledScore(x) ? r : x);
      }
      return [...m.values()];
    };

    setBets((prev) => {
      const next = mergeLists(remote.bets, prev);
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setTickets((prev) => {
      const next = mergeLists(remote.tickets, prev);
      try { localStorage.setItem(TICKETS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    // Open slip: last writer wins (it's a draft, not a record).
    const remoteTs = remote.slip_updated_at || "";
    const localTs = (() => { try { return localStorage.getItem(SLIP_TS_KEY) || ""; } catch { return ""; } })();
    if (Array.isArray(remote.slip) && remoteTs > localTs) {
      setSlip(remote.slip);
      try {
        localStorage.setItem(SLIP_KEY, JSON.stringify(remote.slip));
        localStorage.setItem(SLIP_TS_KEY, remoteTs);
      } catch {}
    }
    if (meId) { try { localStorage.setItem(OWNER_KEY, meId); } catch {} }
    lastPullRef.current = Date.now();
    syncedRef.current = true;
    return true;
  }, []);

  useEffect(() => {
    if (!user) { syncedRef.current = false; return; }
    const meId = user.user_id || user.email;
    const owner = (() => { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } })();
    // Local data is claimable only if it's already ours or from a guest session.
    if (!(!owner || owner === "guest" || owner === meId)) {
      // Stale data from a different user — discard before showing anything.
      setBets([]); setTickets([]); setSlip([]);
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(TICKETS_KEY);
        localStorage.removeItem(SLIP_KEY);
      } catch {}
    }
    pullRemote(meId);

    // Re-pull when the user comes back to the tab (and on a slow poll) so a bet
    // placed on the phone appears on an already-open laptop tab.
    const onWake = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastPullRef.current < 20000) return;
      pullRemote(meId, 1);
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const iv = setInterval(onWake, 60000);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      clearInterval(iv);
    };
  }, [user, pullRemote]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !syncedRef.current) return;
    const t = setTimeout(() => {
      const deleted = deletedRef.current;
      const slipTs = (() => { try { return localStorage.getItem(SLIP_TS_KEY); } catch { return null; } })();
      const payload = { bets, tickets, slip, slip_updated_at: slipTs, deleted };
      deletedRef.current = { bets: [], tickets: [] };
      const requeue = () => {
        // keep the deletions queued for the next attempt
        deletedRef.current = {
          bets: [...new Set([...deletedRef.current.bets, ...deleted.bets])],
          tickets: [...new Set([...deletedRef.current.tickets, ...deleted.tickets])],
        };
      };
      // One retry: a dropped upload used to vanish silently, leaving the other
      // device without the ticket.
      putPortfolioRemote(payload)
        .catch(() => new Promise((r) => setTimeout(r, 4000)).then(() => putPortfolioRemote(payload)))
        .catch((err) => {
          requeue();
          console.error("portfolio sync failed", err?.response?.status || err);
        });
    }, 800);
    return () => clearTimeout(t);
  }, [bets, tickets, slip, user]);

  return (
    <Ctx.Provider value={{
      bets, addBet, settle, updateStake, remove, clear, pendingCount, stats,
      slip, addToSlip, removeFromSlip, updateSlipLegOdds, clearSlip, slipHas, slipHasPick,
      playedPick, playedMatch, slipCount: slip.length,
      tickets, placeTicket, settleLeg, removeTicket, clearTickets, autoSettle, addManualTicket,
      addDraftTicket, placeDraftTicket, updateSlipLegStake,
      syncNow: () => pullRemote(user?.user_id || user?.email, 2),
      newlySettled, clearNewlySettled,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePortfolio = () => useContext(Ctx);
