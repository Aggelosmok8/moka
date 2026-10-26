import React, { useEffect, useState } from "react";
import { Ticket, ExternalLink, Layers, Loader2, Clock, TrendingUp, Check, Lock } from "lucide-react";
import Header from "../components/Header";
import { UpgradeButton } from "../components/Gating";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { bookmakerUrl } from "../lib/bookmakers";
import { PriceStamp } from "../components/PriceStamp";
import { usePortfolio } from "../contexts/PortfolioContext";
import { toast } from "sonner";

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const Crest = ({ className = "w-4 h-4" }) => (
  <img src="/lion-logo.png" alt="LION" className={`${className} object-contain`} data-no-translate />
);

const Leg = ({ leg, anchor, odds, onOdds }) => {
  const url = bookmakerUrl(leg.bookmaker);
  const edited = Number(odds) > 1 && Number(odds).toFixed(2) !== leg.odds.toFixed(2);
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${anchor
      ? "bg-[#39FF14]/[0.07] border-[#39FF14]/40" : "bg-[#0d1117] border-white/5"}`}
      data-testid={`lt-leg-${leg.pick}`}>
      {anchor ? <Crest className="w-4 h-4 shrink-0" />
        : <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0 ml-1 mr-1" />}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-white font-semibold truncate">{leg.pickName}</div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500">
          {leg.prob}% likely · market {leg.marketPct}%
          {url && <> · <a href={url} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-[#39FF14]">{leg.bookmaker}<ExternalLink className="inline w-2.5 h-2.5 ml-0.5 opacity-60" /></a></>}
        </div>
      </div>
      <span className="text-[10px] font-black font-mono-num text-[#39FF14] shrink-0">+{leg.edge}</span>
      {/* The price is editable: users often get a slightly different number. */}
      <input type="number" min="1" step="0.01" value={odds} onChange={(e) => onOdds(e.target.value)}
        data-testid={`lt-odds-${leg.pick}`} title="Edit to the price you actually got"
        className={`w-16 shrink-0 bg-[#161b22] border rounded px-1.5 py-1 text-right text-[13px] font-black font-mono-num focus:outline-none focus:border-[#39FF14] ${
          edited ? "border-[#FFD60A]/60 text-[#FFD60A]" : "border-[#30363d] text-white"}`} />
    </div>
  );
};

const TicketCard = ({ t, onAdd, inSlip, played }) => {
  const [odds, setOdds] = useState(() => Object.fromEntries(t.legs.map((l) => [l.pick, l.odds.toFixed(2)])));
  const priced = t.legs.map((l) => ({ ...l, odds: Number(odds[l.pick]) > 1 ? Number(odds[l.pick]) : l.odds }));
  const singlesReturn = priced.reduce((s, l) => s + l.odds, 0);
  return (
  <div className="bg-[#11161d] border border-white/10 rounded-2xl overflow-hidden hover:border-[#39FF14]/30 transition-colors"
    data-testid={`lion-ticket-${t.match.id}`}>
    <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[#0d1117] border-b border-white/5">
      <div className="flex items-center gap-2 min-w-0">
        <Crest className="w-5 h-5" />
        <span className="text-[10px] font-black uppercase tracking-wider text-[#39FF14] shrink-0">LION TICKET</span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 truncate">· {t.match.league}</span>
      </div>
      <span className="flex items-center gap-1 text-[10px] text-zinc-400 shrink-0">
        <Clock className="w-3 h-3" />{fmtDate(t.match.kickoff)}
      </span>
    </div>

    <div className="px-4 pt-3 pb-2 flex items-center gap-2">
      {t.match.homeLogo && <img src={t.match.homeLogo} alt="" className="w-6 h-6 object-contain" />}
      <span className="text-sm font-black text-white truncate">{t.match.home}</span>
      <span className="text-[10px] text-zinc-600">vs</span>
      <span className="text-sm font-black text-white truncate">{t.match.away}</span>
      {t.match.awayLogo && <img src={t.match.awayLogo} alt="" className="w-6 h-6 object-contain" />}
      <span className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#39FF14] shrink-0">
        <Layers className="w-3 h-3" />{t.legCount} picks
      </span>
    </div>

    <div className="px-4 pb-3 space-y-1.5">
      {t.legs.map((l) => (
        <Leg key={l.pick} leg={l} anchor={l.pick === t.anchor?.pick}
          odds={odds[l.pick]} onOdds={(v) => setOdds((o) => ({ ...o, [l.pick]: v }))} />
      ))}
    </div>

    <div className="px-4 py-3 bg-[#0d1117] border-t border-white/5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider text-zinc-500">
          Played as {t.legCount} singles · best price each
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display font-black text-2xl text-[#39FF14] font-mono-num leading-none">{singlesReturn.toFixed(2)}</span>
          <span className="text-[10px] text-zinc-500">back for {t.legCount}.00 staked (×{(singlesReturn / t.legCount).toFixed(2)})</span>
        </div>
        <div className="text-[10px] text-zinc-500 mt-1 font-mono-num" data-testid={`lt-maths-${t.match.id}`}>
          {priced.map((l) => l.odds.toFixed(2)).join(" + ")} · all win ~{t.combinedProb}%
        </div>
        {t.parlay && (
          <div className="text-[10px] text-[#FFD60A] mt-1" data-testid={`lt-parlay-${t.match.id}`}>
            Or as one parlay at {t.parlay.bookmaker}: <b className="font-mono-num">{t.parlay.odds.toFixed(2)}</b>
          </div>
        )}
        {played && (
          <div className="text-[10px] text-[#39FF14] mt-1 flex items-center gap-1" data-testid={`lt-played-${t.match.id}`}>
            <Check className="w-3 h-3" /> You already played picks from this match — you can still add the LION Ticket separately
          </div>
        )}
      </div>
      <button onClick={() => onAdd(t, priced, played)} disabled={inSlip} data-testid={`lt-add-${t.match.id}`}
        className={`rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wider transition shrink-0 ${
          inSlip ? "bg-white/10 text-zinc-500 cursor-default"
            : played ? "bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/40 hover:bg-[#39FF14]/25"
            : "bg-[#39FF14] text-black hover:brightness-110"}`}>
        {inSlip ? "In slip" : played ? "Played · add anyway" : "Add to slip"}
      </button>
    </div>
  </div>
  );
};

export default function LionTicketsPage() {
  const isPro = !!useAuth().user?.is_pro;
  const [tickets, setTickets] = useState([]);
  const [pricesAt, setPricesAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const { addToSlip, slipHasPick, playedPick } = usePortfolio();

  useEffect(() => {
    if (!isPro) { setLoading(false); return; }
    let active = true;
    api.get("/lion-tickets", { timeout: 120000 })
      .then((r) => {
        if (!active) return;
        setTickets(r.data?.tickets || []);
        setPricesAt(r.data?.pricesAt || 0);
      })
      .catch(() => active && setTickets([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const add = (t, priced, played) => {
    if (played && !window.confirm(
      "You already played specific bets from this match. The LION Ticket is a separate play — add it to your slip as well?"
    )) return;
    const legs = priced || t.legs;
    legs.forEach((l) => addToSlip({
      matchId: t.match.id, home: t.match.home, away: t.match.away, league: t.match.league,
      pick: l.pick, pickName: l.pickName, odds: l.odds, bookmaker: l.bookmaker,
      kind: "ticket", locked: false, kickoff: t.match.kickoff,
    }));
    const back = legs.reduce((s, l) => s + l.odds, 0);
    toast.success(`LION Ticket added — ${t.legCount} singles, ${back.toFixed(2)} back for ${t.legCount}.00`, {
      description: "Each pick keeps its own bookmaker. Prices are editable in your slip.",
    });
  };

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-start justify-between gap-6 flex-wrap mb-7">
          <div>
            <h1 className="font-display font-black text-4xl sm:text-5xl text-white tracking-tight flex items-center gap-3">
              <Ticket className="w-8 h-8 text-[#39FF14]" />LION TICKETS
            </h1>
            <p className="text-sm text-zinc-400 mt-2 max-w-xl">
              Ready-made combos from a single match: only the scenarios our model rates most
              likely AND better priced than the bookmaker. Each pick is taken at its own best
              bookmaker, so a ticket is staked as singles — the figure shown is what comes back.
            </p>
            <PriceStamp at={pricesAt} className="mt-2" />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/25 rounded-lg px-3 py-2 max-w-sm">
            <TrendingUp className="w-4 h-4 shrink-0" />
            Picks sit at different bookmakers, so they cannot be one slip: stake them as singles.
            Where a single bookmaker prices every pick, we also show that real parlay price.
          </div>
        </div>

        {!isPro ? (
          <div className="rounded-2xl border border-[#39FF14]/30 bg-[#39FF14]/[0.06] p-8 text-center" data-testid="lion-tickets-locked">
            <Lock className="w-7 h-7 text-[#39FF14] mx-auto mb-3" />
            <div className="text-white font-bold text-lg">LION Tickets are Pro</div>
            <p className="text-sm text-zinc-400 mt-1 mb-4 max-w-lg mx-auto">
              Ready-built tickets at the best available odds per pick — the prices are the Pro edge.
              Upgrade to open today's tickets.
            </p>
            <UpgradeButton testId="lion-tickets-upgrade-cta" />
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-zinc-400 text-sm py-20 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Building today's tickets…
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 text-sm" data-testid="lt-empty">
            No ticket clears our bar right now — every leg has to be both likely and better
            priced than the book. Check back closer to kick-off.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-start" data-testid="lion-tickets-grid">
            {tickets.map((t) => (
              <TicketCard key={t.id} t={t} onAdd={add}
                inSlip={t.legs.every((l) => slipHasPick(t.match.id, l.pick))}
                played={t.legs.some((l) => playedPick(t.match.id, l.pick, t.match.home, t.match.away))} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
