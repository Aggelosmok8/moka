import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Sparkles, ShieldAlert, ChevronDown, Users, Loader2, Flag, Target,
  Hand, AlertTriangle, SquareStack, Clock, Hash, Shuffle, Scale, Repeat, Goal, Move, ExternalLink,
} from "lucide-react";
import Header from "../components/Header";
import { bookmakerUrl } from "../lib/bookmakers";
import { usePortfolio } from "../contexts/PortfolioContext";
import { api } from "../lib/api";
import { toast } from "sonner";

const ICONS = {
  goals: Goal, btts: Repeat, team_goals: Target, double_chance: Shuffle, handicap: Scale,
  corners: Flag, cards: SquareStack, fouls: AlertTriangle, offsides: Move, saves: Hand,
  first_half: Clock, correct_score: Hash, score_anytime: Hash,
};

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "");
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

const QualityDot = ({ q }) => {
  const map = { HIGH: ["#39FF14", "High data quality"], MEDIUM: ["#FFD60A", "Medium data quality — smaller sample"] };
  const [c, label] = map[q] || ["#8b949e", "Limited data"];
  return <span title={label} className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />;
};

const Bar = ({ pct }) => (
  <div className="h-1 w-full rounded-full bg-white/[0.07] overflow-hidden">
    <div className="h-full rounded-full bg-[#39FF14]" style={{ width: `${Math.max(2, pct)}%` }} />
  </div>
);

// The price itself is the bet link — no extra column, layout untouched.
const OddsCell = ({ row }) => {
  const url = row.odds ? bookmakerUrl(row.bookmaker) : null;
  if (!url) return <div className="text-[13px] font-black font-mono-num text-white">{row.odds ? Number(row.odds).toFixed(2) : "—"}</div>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={`Bet with ${row.bookmaker}`}
      data-testid={`sb-bet-${row.pick}`} onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-0.5 text-[13px] font-black font-mono-num text-white rounded px-1 -mx-1 border border-transparent hover:border-[#39FF14]/50 hover:text-[#39FF14] transition-colors">
      {Number(row.odds).toFixed(2)}<ExternalLink className="w-2.5 h-2.5 opacity-60" />
    </a>
  );
};

// One selection — checkbox-style toggle straight into the existing slip.
const BetRow = ({ row, picked, onToggle, lion, compact }) => (
  <div className={`px-2 py-2 rounded-lg transition-colors ${picked ? "bg-[#FFD60A]/[0.07]" : "hover:bg-white/[0.03]"}`}
    data-testid={`sb-row-${row.pick}`}>
    <div className="flex items-center justify-between gap-2">
      <button onClick={() => onToggle(row)} data-testid={`sb-toggle-${row.pick}`}
        className="flex items-center gap-2 min-w-0 text-left group">
        <span className={`w-4 h-4 rounded shrink-0 border flex items-center justify-center text-[10px] font-black transition-colors ${
          picked ? "bg-[#FFD60A] border-[#FFD60A] text-black" : "border-white/25 text-transparent group-hover:border-[#39FF14]"}`}>
          ✓
        </span>
        <span className="text-[13px] text-white font-bold truncate flex items-center gap-1.5">
          {lion && <img src="/lion-crest.png" alt="LION's pick" className="w-4 h-4 object-contain" data-testid={`sb-lion-${row.pick}`} />}
          <QualityDot q={row.quality} />
          {row.player ? <span className="text-zinc-400">{row.player} · </span> : null}
          {(compact && row.short) || row.selection}
        </span>
      </button>
      <div className="flex items-center gap-2.5 shrink-0 text-right">
        <div><div className="text-[8px] uppercase tracking-wider text-zinc-600">LION</div>
          <div className="text-[13px] font-black font-mono-num text-[#39FF14]">{row.lion}%</div></div>
        <div className="w-11"><div className="text-[8px] uppercase tracking-wider text-zinc-600">Market</div>
          <div className="text-[13px] font-black font-mono-num text-zinc-400">{row.market_pct != null ? `${row.market_pct}%` : "—"}</div></div>
        <div className="w-11"><div className="text-[8px] uppercase tracking-wider text-zinc-600">Odds</div>
          <OddsCell row={row} /></div>
        {row.edge != null && (
          <span className={`w-8 text-[10px] font-black font-mono-num ${row.edge >= 5 ? "text-[#39FF14]" : "text-zinc-500"}`}>
            {row.edge > 0 ? "+" : ""}{row.edge}
          </span>
        )}
      </div>
    </div>
    <div className="mt-1 pl-6"><Bar pct={row.lion} /></div>
  </div>
);

const TopStrip = ({ row }) => (
  <div className="rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/[0.07] px-3 py-2 mb-2 flex items-center justify-between gap-3"
    data-testid="sb-panel-top">
    <div className="flex items-center gap-2 min-w-0">
      <img src="/lion-crest.png" alt="" className="w-5 h-5 object-contain shrink-0" />
      <div className="min-w-0">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#39FF14]">LION's pick</div>
        <div className="text-[13px] font-bold text-white truncate">
          {row.player ? `${row.player} — ` : ""}{row.selection}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-3 shrink-0">
      <div className="text-right"><div className="text-[8px] uppercase text-zinc-600">LION</div>
        <div className="text-base font-black font-mono-num text-[#39FF14]">{row.lion}%</div></div>
      <div className="text-right"><div className="text-[8px] uppercase text-zinc-600">Market</div>
        <div className="text-base font-black font-mono-num text-zinc-400">{row.market_pct != null ? `${row.market_pct}%` : "—"}</div></div>
      {row.odds && bookmakerUrl(row.bookmaker) && (
        <a href={bookmakerUrl(row.bookmaker)} target="_blank" rel="noopener noreferrer"
          data-testid="sb-top-bet" title={`Bet with ${row.bookmaker}`}
          className="inline-flex items-center gap-1 rounded-full bg-[#39FF14] text-black px-2.5 py-1.5 text-[11px] font-black uppercase tracking-wider hover:brightness-110 transition">
          Bet {Number(row.odds).toFixed(2)}<ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  </div>
);

const Panel = ({ panel, teams, onToggle, isPicked }) => {
  const Icon = ICONS[panel.icon] || Target;
  const top = panel.top;
  // Grow with the content; only long lists get capped and scroll.
  const perColumn = panel.split
    ? Math.max(panel.rows.filter((r) => r.side === "home").length, panel.rows.filter((r) => r.side === "away").length)
    : panel.rows.length;
  const scroll = perColumn > 7;
  // Inside a split panel the team is already the column header, so the row
  // label drops it instead of truncating ("Sunde…").
  const body = (rows, compact) => rows.map((r) => (
    <BetRow key={r.pick} row={r} picked={isPicked(r)} onToggle={onToggle}
      lion={top && r.pick === top.pick} compact={compact} />
  ));
  return (
    <div className="rounded-2xl border border-white/10 bg-[#11161d] p-4" data-testid={`sb-panel-${panel.key}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-7 h-7 rounded-lg bg-[#39FF14]/12 border border-[#39FF14]/30 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-[#39FF14]" />
        </span>
        <h3 className="font-display font-black uppercase tracking-tight text-white text-base leading-none">{panel.title}</h3>
      </div>
      {panel.note && <div className="text-[10px] text-zinc-500 mb-2 pl-9">{panel.note}</div>}
      {top && <TopStrip row={top} />}
      <div className={scroll ? "max-h-72 overflow-y-auto pr-1 sb-scroll" : ""}>
        {panel.split ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            {["home", "away"].map((side) => (
              <div key={side}>
                <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500 py-1 sticky top-0 bg-[#11161d]">
                  {side === "home" ? teams.home : teams.away}
                </div>
                {body(panel.rows.filter((r) => r.side === side), true)}
              </div>
            ))}
          </div>
        ) : body(panel.rows)}
      </div>
    </div>
  );
};

export default function SpecificBetsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const demo = params.get("demo") === "1";
  const { addToSlip, removeFromSlip, slipHasPick } = usePortfolio();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [openAll, setOpenAll] = useState({});

  useEffect(() => {
    let live = true;
    api.get(`/specific-bets/${id}`)
      .then((r) => live && setData(r.data))
      .catch((e) => live && setErr(e?.response?.data?.detail || "Could not load specific bets."));
    return () => { live = false; };
  }, [id]);

  // Hidden preview: fills sample prices so the layout can be judged with numbers.
  const withDemo = (row) => {
    if (!demo || row.odds || !row.lion) return row;
    const price = Math.max(1.05, Math.round((100 / row.lion) * 1.07 * 100) / 100);
    const mkt = Math.round((1 / price) * 100);
    return { ...row, odds: price, bookmaker: "bet365", market_pct: mkt, edge: Math.round((row.lion - mkt) * 10) / 10 };
  };

  const panels = useMemo(() => (data?.panels || []).map((p) => ({
    ...p, rows: p.rows.map(withDemo), top: p.top ? withDemo(p.top) : null,
  })), [data, demo]);

  const match = data?.match || {};
  const teams = { home: match.home || data?.home, away: match.away || data?.away };
  const isPicked = (row) => slipHasPick(match.id, row.pick, teams.home, teams.away);

  const toggle = (row) => {
    if (isPicked(row)) {
      removeFromSlip(match.id, teams.home, teams.away, row.pick);
      toast.success(`Removed: ${row.selection}`);
      return;
    }
    addToSlip({
      matchId: match.id, home: teams.home, away: teams.away, league: match.leagueName,
      kind: "specific",
      pick: row.pick, pickName: `${row.player ? row.player + " " : ""}${row.selection}`,
      odds: row.odds || 0, bookmaker: row.odds ? (row.bookmaker || "") : "", kickoff: match.commence_time,
    });
    toast.success(row.odds ? `Added: ${row.selection}` : `Added: ${row.selection} — set your price in the slip`);
  };

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link to={sessionStorage.getItem("matches_return") || "/matches"} data-testid="sb-back"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to matches
        </Link>

        <div className="relative rounded-2xl border border-white/10 overflow-hidden bg-[#11161d] mb-5" data-testid="sb-hero">
          <img src="https://images.unsplash.com/photo-1679391029864-d46f366a456b?crop=entropy&cs=srgb&fm=jpg&w=1600&q=80"
            alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/90 via-[#0A0A0A]/45 to-[#0A0A0A]/25" />
          <div className="relative px-6 py-10">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-center mb-5">{match.leagueName}</div>
            <div className="grid grid-cols-3 items-center gap-3 max-w-3xl mx-auto">
              <div className="flex flex-col items-center gap-2 text-center" data-testid="sb-home">
                {data?.home_logo && <img src={data.home_logo} alt="" className="w-14 h-14 object-contain" />}
                <span className="font-display font-black uppercase text-white text-lg sm:text-2xl leading-tight">{teams.home || "—"}</span>
              </div>
              <div className="text-center">
                <div className="font-display font-black text-white text-sm">{fmt(match.commence_time)}</div>
                <div className="font-display font-black text-[#39FF14] text-2xl font-mono-num">{fmtTime(match.commence_time)}</div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center" data-testid="sb-away">
                {data?.away_logo && <img src={data.away_logo} alt="" className="w-14 h-14 object-contain" />}
                <span className="font-display font-black uppercase text-white text-lg sm:text-2xl leading-tight">{teams.away || "—"}</span>
              </div>
            </div>
            {data?.model && (
              <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-400 mt-7 flex-wrap">
                <span>Specific Bets model · expected goals <b className="text-white font-mono-num">{data.model.xg_home}</b> – <b className="text-white font-mono-num">{data.model.xg_away}</b></span>
                <span className="flex items-center gap-1.5"><QualityDot q={data.quality} /> {data.model.sample_matches} matches sampled</span>
                {data.national && <span className="text-[#FFD60A]">National teams · player markets open once the line-up is confirmed</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between gap-3 mb-4 flex-wrap">
          <h1 className="font-display font-black uppercase tracking-tight text-2xl sm:text-3xl text-white">
            Specific Bets
            {demo && <span className="ml-2 text-[10px] font-black uppercase px-2 py-1 rounded bg-[#FFD60A] text-black align-middle" data-testid="sb-demo-flag">Demo prices</span>}
          </h1>
          <p className="text-xs text-zinc-500 max-w-md">
            LION's own statistical engine — separate from the match prediction model. Tick a selection to add it to your slip,
            tick again to remove it.
          </p>
        </div>

        {err && <div className="rounded-xl border border-[#FF3B30]/30 bg-[#FF3B30]/10 p-4 text-sm text-[#FF3B30]" data-testid="sb-error">{err}</div>}
        {!data && !err && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-10 justify-center" data-testid="sb-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Calculating specific bets…
          </div>
        )}

        {data && !data.available && (
          <div className="rounded-2xl border border-white/10 bg-[#11161d] p-8 text-center" data-testid="sb-insufficient">
            <ShieldAlert className="w-7 h-7 text-[#FFD60A] mx-auto mb-3" />
            <div className="text-white font-bold">Not enough data for specific bets</div>
            <p className="text-sm text-zinc-500 mt-1">{data.reason || "We don't publish a probability we cannot stand behind."}</p>
          </div>
        )}

        {data?.available && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {panels.map((p) => (
                <Panel key={p.key} panel={p} teams={teams} onToggle={toggle} isPicked={isPicked} />
              ))}
            </div>

            {!!(data.players || []).length && (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {data.players.map((team) => {
                  const open = !!openAll[team.side];
                  const rows = (open ? team.rows : team.top).map(withDemo);
                  const top = team.top.length ? withDemo(team.top[0]) : null;
                  return (
                    <div key={team.side} className="rounded-2xl border border-white/10 bg-[#11161d] p-4" data-testid={`sb-players-${team.side}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-7 h-7 rounded-lg bg-[#39FF14]/12 border border-[#39FF14]/30 flex items-center justify-center">
                          <Users className="w-4 h-4 text-[#39FF14]" />
                        </span>
                        <h3 className="font-display font-black uppercase tracking-tight text-white text-base leading-none">{team.team}</h3>
                        <span className="text-[10px] uppercase tracking-wider text-zinc-600">{team.rows.length} markets</span>
                      </div>
                      {top && <TopStrip row={top} />}
                      <div className={rows.length > 7 ? "max-h-72 overflow-y-auto pr-1 sb-scroll" : ""}>
                        {rows.map((r) => (
                          <BetRow key={r.pick} row={r} picked={isPicked(r)} onToggle={toggle} lion={top && r.pick === top.pick} />
                        ))}
                      </div>
                      <button onClick={() => setOpenAll((s) => ({ ...s, [team.side]: !open }))}
                        data-testid={`sb-players-toggle-${team.side}`}
                        className="mt-2 w-full text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white border border-white/10 rounded-lg py-2 flex items-center justify-center gap-1.5">
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                        {open ? "Show LION picks only" : `Show all ${team.rows.length} player markets`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-zinc-600 mt-4 flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#39FF14] shrink-0 mt-0.5" />
              LION probability comes from our own statistical model. Market probability is the bookmaker price turned into a
              percentage (1 ÷ decimal odds) and is not a LION prediction. Markets without reliable data are not shown.
              21+ · Statistics never guarantee an outcome.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
