import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles, ShieldAlert, ChevronDown, Users, Loader2, Info } from "lucide-react";
import Header from "../components/Header";
import { usePortfolio } from "../contexts/PortfolioContext";
import { api } from "../lib/api";
import { toast } from "sonner";

const fmt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

const QualityDot = ({ q }) => {
  const map = { HIGH: ["#39FF14", "High data quality"], MEDIUM: ["#FFD60A", "Medium data quality — smaller sample"] };
  const [c, label] = map[q] || ["#8b949e", "Limited data"];
  return <span title={label} className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />;
};

const Bar = ({ pct, color = "#39FF14" }) => (
  <div className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden">
    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
  </div>
);

// One selection: LION probability vs market implied, plus add-to-slip.
const BetRow = ({ row, match, onAdd, inSlip }) => (
  <div className="py-2.5 border-b border-white/[0.06] last:border-0" data-testid={`sb-row-${row.pick}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-white font-bold flex items-center gap-1.5 truncate">
          <QualityDot q={row.quality} />
          {row.player ? <span className="text-zinc-400">{row.player} · </span> : null}
          {row.selection}
        </div>
        {row.note && <div className="text-[10px] text-zinc-500 mt-0.5">{row.note}</div>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600">LION</div>
          <div className="text-sm font-black font-mono-num text-[#39FF14]">{row.lion}%</div>
        </div>
        <div className="text-right w-14">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600">Market</div>
          <div className="text-sm font-black font-mono-num text-zinc-400">
            {row.market_pct != null ? `${row.market_pct}%` : "—"}
          </div>
        </div>
        <div className="text-right w-16">
          <div className="text-[9px] uppercase tracking-wider text-zinc-600">Best odds</div>
          <div className="text-sm font-black font-mono-num text-white">{row.odds ? row.odds.toFixed(2) : "—"}</div>
        </div>
        <button onClick={() => onAdd(row)} disabled={inSlip} data-testid={`sb-add-${row.pick}`}
          className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded whitespace-nowrap transition-colors ${
            inSlip ? "bg-[#FFD60A]/15 text-[#FFD60A] border border-[#FFD60A]/40" : "bg-white/10 text-white hover:bg-white/20"}`}>
          {inSlip ? "In slip" : "Add"}
        </button>
      </div>
    </div>
    <div className="mt-1.5 flex items-center gap-2">
      <Bar pct={row.lion} />
      {row.edge != null && (
        <span className={`text-[10px] font-black font-mono-num shrink-0 ${row.edge >= 5 ? "text-[#39FF14]" : "text-zinc-500"}`}>
          {row.edge > 0 ? "+" : ""}{row.edge}
        </span>
      )}
    </div>
  </div>
);

const TopPick = ({ row, label = "LION's top opportunity" }) => {
  if (!row) return null;
  return (
    <div className="rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/[0.06] p-4 mb-4" data-testid="sb-top-pick">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#39FF14] flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display font-black uppercase text-white text-lg leading-tight">
            {row.player ? `${row.player} — ` : ""}{row.selection}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">{row.market} · worth a look, never a certainty</div>
        </div>
        <div className="flex items-center gap-5">
          <div><div className="text-[9px] uppercase text-zinc-600">LION</div>
            <div className="text-xl font-black font-mono-num text-[#39FF14]">{row.lion}%</div></div>
          <div><div className="text-[9px] uppercase text-zinc-600">Market</div>
            <div className="text-xl font-black font-mono-num text-zinc-400">{row.market_pct != null ? `${row.market_pct}%` : "—"}</div></div>
          <div><div className="text-[9px] uppercase text-zinc-600">Best odds</div>
            <div className="text-xl font-black font-mono-num text-white">{row.odds ? row.odds.toFixed(2) : "—"}</div></div>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children, testId }) => (
  <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5 mb-4" data-testid={testId}>
    <h2 className="font-display font-black uppercase tracking-tight text-white text-lg mb-3">{title}</h2>
    {children}
  </div>
);

export default function SpecificBetsPage() {
  const { id } = useParams();
  const { addToSlip, slipHas } = usePortfolio();
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

  const match = data?.match || {};
  const inSlip = slipHas(match.id, match.home, match.away);

  const add = (row) => {
    if (inSlip) return;
    addToSlip({
      matchId: match.id, home: match.home, away: match.away, league: match.leagueName,
      pick: row.pick, pickName: `${row.player ? row.player + " " : ""}${row.selection}`,
      odds: row.odds || 0, bookmaker: row.odds ? (row.bookmaker || "") : "", kickoff: match.commence_time,
    });
    toast.success(row.odds
      ? `Added to bet slip: ${row.selection}`
      : `Added: ${row.selection} — set the price you played in the slip`);
  };

  const grouped = useMemo(() => {
    const out = {};
    (data?.categories || []).forEach((c) => {
      const byMarket = {};
      c.rows.forEach((r) => { (byMarket[r.market] = byMarket[r.market] || []).push(r); });
      out[c.key] = { ...c, byMarket };
    });
    return out;
  }, [data]);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link to={sessionStorage.getItem("matches_return") || "/matches"} data-testid="sb-back"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to matches
        </Link>

        {/* HERO — full width, no analysis panel next to it */}
        <div className="relative rounded-2xl border border-white/10 overflow-hidden bg-[#11161d] mb-5" data-testid="sb-hero">
          <img src="https://images.unsplash.com/photo-1679391029864-d46f366a456b?crop=entropy&cs=srgb&fm=jpg&w=1600&q=80"
            alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/90 via-[#0A0A0A]/45 to-[#0A0A0A]/25" />
          <div className="relative px-6 py-10 sm:py-14">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-center mb-6">
              {match.leagueName}
            </div>
            <div className="grid grid-cols-3 items-center gap-3 max-w-3xl mx-auto">
              <div className="flex flex-col items-center gap-2 text-center" data-testid="sb-home">
                {data?.home_logo && <img src={data.home_logo} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-contain" />}
                <span className="font-display font-black uppercase text-white text-lg sm:text-2xl leading-tight">
                  {match.home || data?.home || "—"}
                </span>
              </div>
              <div className="text-center">
                <div className="font-display font-black text-white text-sm">{fmt(match.commence_time)}</div>
                <div className="font-display font-black text-[#39FF14] text-2xl font-mono-num">{fmtTime(match.commence_time)}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mt-1">vs</div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center" data-testid="sb-away">
                {data?.away_logo && <img src={data.away_logo} alt="" className="w-14 h-14 sm:w-16 sm:h-16 object-contain" />}
                <span className="font-display font-black uppercase text-white text-lg sm:text-2xl leading-tight">
                  {match.away || data?.away || "—"}
                </span>
              </div>
            </div>
            {data?.model && (
              <div className="flex items-center justify-center gap-4 text-[11px] text-zinc-400 mt-8 flex-wrap">
                <span>Specific Bets model · expected goals <b className="text-white font-mono-num">{data.model.xg_home}</b> – <b className="text-white font-mono-num">{data.model.xg_away}</b></span>
                <span className="flex items-center gap-1.5"><QualityDot q={data.quality} /> {data.model.sample_matches} matches sampled</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h1 className="font-display font-black uppercase tracking-tight text-2xl sm:text-3xl text-white">Specific Bets</h1>
          <p className="text-xs text-zinc-500 max-w-md">
            LION's own statistical engine — separate from the match prediction model. Probabilities are calculated from real
            data, never generated by AI.
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
            {inSlip && (
              <div className="mb-4 text-xs text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/30 rounded-lg px-3 py-2 flex items-center gap-2" data-testid="sb-in-slip-note">
                <Info className="w-3.5 h-3.5" /> This match is already in your bet slip — one selection per match.
              </div>
            )}
            {["core", "game"].map((key) => {
              const cat = grouped[key];
              if (!cat || !cat.rows.length) return null;
              return (
                <Section key={key} title={cat.title} testId={`sb-cat-${key}`}>
                  <TopPick row={cat.top} />
                  {Object.entries(cat.byMarket).map(([mkt, rows]) => (
                    <div key={mkt} className="mb-4 last:mb-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">{mkt}</div>
                      {rows.map((r) => (
                        <BetRow key={r.pick} row={r} match={match} onAdd={add} inSlip={inSlip} />
                      ))}
                    </div>
                  ))}
                </Section>
              );
            })}

            {!!(data.players || []).length && (
              <Section title="Players Intelligence" testId="sb-players">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {data.players.map((team) => {
                    const open = !!openAll[team.side];
                    const rows = open ? team.rows : team.top;
                    return (
                      <div key={team.side} data-testid={`sb-players-${team.side}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-[#39FF14]" />
                          <span className="font-display font-black uppercase text-white">{team.team}</span>
                          <span className="text-[10px] uppercase tracking-wider text-zinc-600">{team.rows.length} selections</span>
                        </div>
                        {!open && !!team.top.length && <TopPick row={team.top[0]} label="LION's player pick" />}
                        {rows.map((r) => (
                          <BetRow key={r.pick} row={r} match={match} onAdd={add} inSlip={inSlip} />
                        ))}
                        <button onClick={() => setOpenAll((s) => ({ ...s, [team.side]: !open }))}
                          data-testid={`sb-toggle-${team.side}`}
                          className="mt-3 w-full text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white border border-white/10 rounded-lg py-2 flex items-center justify-center gap-1.5">
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                          {open ? "Show LION picks only" : `Show all ${team.rows.length} player markets`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            <p className="text-[11px] text-zinc-600 mt-2">
              LION probability comes from our own statistical model. Market probability is calculated from the bookmaker price
              (1 ÷ decimal odds) and is not a LION prediction. Markets without reliable data are not shown. 21+ · Statistics
              never guarantee an outcome.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
