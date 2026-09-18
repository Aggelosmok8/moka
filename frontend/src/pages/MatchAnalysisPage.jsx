import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, Loader2, Sparkles, Languages, MapPin, Target, TrendingUp, Star } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import Header from "../components/Header";
import AddToPortfolioButton from "../components/AddToPortfolioButton";
import AddToChartButton from "../components/AddToChartButton";
import AddToSlipButton from "../components/AddToSlipButton";
import { bookmakerUrl } from "../lib/bookmakers";
import { fetchMatchById, fetchMatchAi } from "../lib/catalogApi";
import { fetchLeagueDetail, fetchTeamRecent } from "../lib/api";
import { adaptValue, whyMokaReasons } from "../lib/valueEngine";
import { useLang } from "../contexts/LanguageContext";

const GREEN = "#39FF14";
const YELLOW = "#FFD60A";
const RED = "#FF3B30";

const Shell = ({ children }) => (
  <div className="min-h-screen bg-[#0A0A0A]">
    <Header />
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
  </div>
);
const Card = ({ title, children, testId, className = "" }) => (
  <section data-testid={testId} className={`bg-[#11161d] border border-white/10 rounded-2xl p-5 ${className}`}>
    {title && <h3 className="font-display font-black uppercase tracking-tight text-sm text-white mb-3">{title}</h3>}
    {children}
  </section>
);
const Bar = ({ label, pct, color, hi }) => (
  <div className="mb-2">
    <div className="grid grid-cols-[1fr_auto] items-center text-xs text-zinc-400 mb-1 gap-2">
      <span className="truncate">{label}</span>
      <span className="font-bold font-mono-num text-right" style={{ color: hi ? GREEN : "#fff" }}>{pct}%</span>
    </div>
    <div className="h-2 rounded-full bg-[#0d1117] overflow-hidden">
      <div style={{ width: `${pct}%`, background: color }} className="h-full" />
    </div>
  </div>
);

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmtDate = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
};
const fmtTime = (iso) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
};

const FormBadges = ({ form }) => (
  <div className="flex items-center gap-1">
    {(form || []).slice(-5).map((f, i) => (
      <span key={i} className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
        f === "W" ? "bg-[#39FF14]/20 text-[#39FF14]" : f === "D" ? "bg-white/10 text-zinc-300" : "bg-[#FF3B30]/20 text-[#FF3B30]"}`}>{f}</span>
    ))}
  </div>
);

const Donut = ({ pct, label, color = GREEN, size = 120 }) => (
  <div className="relative" style={{ width: size, height: size }}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={[{ v: pct }, { v: Math.max(0, 100 - pct) }]} dataKey="v" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none">
          <Cell fill={color} /><Cell fill="#ffffff12" />
        </Pie>
      </PieChart>
    </ResponsiveContainer>
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <span className="font-display font-black text-white text-lg leading-none">{pct}%</span>
      <span className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">{label}</span>
    </div>
  </div>
);

const SplitPie = ({ a, b, aLabel, bLabel, title, testId }) => (
  <div className="bg-[#0d1117] border border-white/10 rounded-xl p-4 flex items-center gap-3" data-testid={testId}>
    <div className="w-[78px] h-[78px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={[{ v: a }, { v: b }]} dataKey="v" innerRadius="58%" outerRadius="100%" paddingAngle={2} stroke="none">
            <Cell fill={GREEN} /><Cell fill={YELLOW} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 leading-tight">{title}</div>
      <div className="grid grid-cols-[10px_1fr_auto] items-center gap-x-2 gap-y-1 text-sm">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GREEN }} />
        <span className="text-zinc-300">{aLabel}</span>
        <b className="font-mono-num text-white text-right">{a}%</b>
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: YELLOW }} />
        <span className="text-zinc-300">{bLabel}</span>
        <b className="font-mono-num text-white text-right">{b}%</b>
      </div>
    </div>
  </div>
);

const LIVE_STAT_ORDER = ["Ball Possession", "Total Shots", "Shots on Goal", "Shots off Goal",
  "Shots insidebox", "Shots outsidebox", "Corner Kicks", "Fouls", "Offsides",
  "Yellow Cards", "Red Cards", "Goalkeeper Saves", "Total passes", "Passes accurate", "Passes %"];

function LiveStats({ home = {}, away = {}, hn, an }) {
  const ordered = LIVE_STAT_ORDER.filter((k) => home[k] != null || away[k] != null);
  const extra = [...new Set([...Object.keys(home || {}), ...Object.keys(away || {})])].filter((k) => !LIVE_STAT_ORDER.includes(k));
  const all = [...ordered, ...extra];
  if (!all.length) return <div className="text-sm text-zinc-500">No live statistics available yet — they appear as the match develops.</div>;
  return (
    <div className="space-y-1.5" data-testid="live-stats-table">
      <div className="grid grid-cols-[1fr_auto_1fr] text-[10px] uppercase tracking-wider text-zinc-500 pb-1">
        <span className="text-right truncate">{hn || "Home"}</span><span className="px-2" /><span className="text-left truncate">{an || "Away"}</span>
      </div>
      {all.map((k) => (
        <div key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="text-right font-display font-black text-white font-mono-num">{home?.[k] ?? "—"}</span>
          <span className="text-center text-[10px] uppercase tracking-wider text-zinc-500 px-2 whitespace-nowrap">{k}</span>
          <span className="text-left font-display font-black text-white font-mono-num">{away?.[k] ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

// --- Team card (form, win-rate donut, goals of last 5, key numbers) ---------
function TeamCard({ name, info, recent, xg, xga, possession, cleanSheets, testId }) {
  const form = info?.form || [];
  const last5 = form.slice(-5);
  const wins = last5.filter((f) => f === "W").length;
  const draws = last5.filter((f) => f === "D").length;
  const losses = last5.filter((f) => f === "L").length;
  const winRate = last5.length ? Math.round((wins / last5.length) * 100) : 0;
  const scored = recent.reduce((s, r) => s + r.gf, 0);
  const conceded = recent.reduce((s, r) => s + r.ga, 0);
  const maxGoal = Math.max(1, ...recent.map((r) => Math.max(r.gf, r.ga)));

  return (
    <Card testId={testId}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          {info?.image && <img src={info.image} alt="" className="w-8 h-8 object-contain" />}
          <div className="font-display font-black uppercase tracking-tight text-white truncate">{name}</div>
        </div>
        <div className="text-right">
          <FormBadges form={form} />
          <div className="text-[9px] uppercase tracking-wider text-zinc-500 mt-1">Last {last5.length || 5} matches</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center mb-4">
        {[["Wins", wins], ["Draws", draws], ["Losses", losses], ["Goals", `${scored}:${conceded}`]].map(([l, v]) => (
          <div key={l}>
            <div className="font-display font-black text-white text-lg font-mono-num">{v}</div>
            <div className="text-[9px] uppercase tracking-wider text-zinc-500">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-4">
        <Donut pct={winRate} label="Win rate" />
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-2">Goals (last {recent.length || 0})</div>
          <div className="flex items-end gap-3 h-[96px]">
            {recent.length === 0 && <span className="text-xs text-zinc-600">No recent results</span>}
            {recent.map((r, i) => (
              <div key={i} className="flex items-end gap-1" title={`${r.opponent} ${r.gf}-${r.ga}`}>
                <div className="w-3 rounded-t" style={{ height: `${(r.gf / maxGoal) * 80 + 6}px`, background: GREEN }} />
                <div className="w-3 rounded-t" style={{ height: `${(r.ga / maxGoal) * 80 + 6}px`, background: RED }} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: GREEN }} /> Scored</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: RED }} /> Conceded</span>
          </div>
        </div>
        <div className="space-y-2 sm:border-l sm:border-white/5 sm:pl-4 text-sm">
          {[["xG", xg], ["Goals / game", info?.goalsPerGame], ["Conceded / game", info?.concededPerGame],
            ["Possession", possession != null ? `${possession}%` : null], ["Clean sheets", cleanSheets]].map(([l, v]) => (
            <div key={l}>
              <div className="text-[9px] uppercase tracking-wider text-zinc-500">{l}</div>
              <div className="font-display font-black text-white font-mono-num">{v == null ? "—" : v}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function HistoryTable({ name, info, recent, testId }) {
  return (
    <Card testId={testId}>
      <div className="flex items-center gap-2.5 mb-3">
        {info?.image && <img src={info.image} alt="" className="w-6 h-6 object-contain" />}
        <div className="font-display font-black uppercase tracking-tight text-white truncate">{name}</div>
      </div>
      {recent.length === 0 ? (
        <div className="text-xs text-zinc-600">No recent matches available.</div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[66px_1fr_92px_50px_26px] gap-2 text-[9px] uppercase tracking-wider text-zinc-500 pb-1 border-b border-white/5">
            <span>Date</span><span>Opponent</span><span className="truncate">Comp.</span><span className="text-center">Result</span><span />
          </div>
          {recent.map((r, i) => (
            <div key={i} className="grid grid-cols-[66px_1fr_92px_50px_26px] gap-2 items-center py-1.5 border-b border-white/5 last:border-0 text-xs">
              <span className="text-zinc-500">{fmtDate(r.kickoff)}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                {r.oppImg && <img src={r.oppImg} alt="" className="w-4 h-4 object-contain" />}
                <span className="text-zinc-300 truncate">{r.opponent}</span>
              </span>
              <span className="text-zinc-600 truncate" title={r.league}>{r.league}</span>
              <span className="text-center font-mono-num text-white">{r.gf} - {r.ga}</span>
              <span className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                r.res === "W" ? "bg-[#39FF14]/20 text-[#39FF14]" : r.res === "D" ? "bg-white/10 text-zinc-300" : "bg-[#FF3B30]/20 text-[#FF3B30]"}`}>{r.res}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function MatchAnalysisPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showAllOdds, setShowAllOdds] = useState(false);
  const [league, setLeague] = useState(null);
  const [apiRecent, setApiRecent] = useState({ h: null, a: null });
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(true);
  const { lang } = useLang();
  const [aiLang, setAiLang] = useState(lang);
  useEffect(() => { setAiLang(lang); }, [lang]);

  useEffect(() => {
    let active = true;
    fetchMatchById(id)
      .then((d) => {
        if (!active) return;
        if (d && d.status === "unavailable") setNotFound(true);
        else setData(d);
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  // League detail (standings + recent results) powers the team cards / history.
  useEffect(() => {
    const slug = data?.leagueId;
    if (!slug) return;
    let active = true;
    fetchLeagueDetail(slug).then((d) => active && setLeague(d)).catch(() => {});
    return () => { active = false; };
  }, [data?.leagueId]);

  useEffect(() => {
    let active = true;
    setAiLoading(true); setAi(null);
    fetchMatchAi(id, aiLang)
      .then((d) => active && setAi(d))
      .catch(() => active && setAi(null))
      .finally(() => active && setAiLoading(false));
    return () => { active = false; };
  }, [id, aiLang]);

  const teamIndex = useMemo(() => {
    const idx = {};
    for (const t of league?.standings || []) idx[norm(t.name)] = t;
    return idx;
  }, [league]);

  const infoFor = (name) => {
    const n = norm(name);
    if (teamIndex[n]) return teamIndex[n];
    return Object.entries(teamIndex).find(([k]) => n.length >= 4 && (k.includes(n) || n.includes(k)))?.[1] || null;
  };

  const mapRecent = (rows, name) => {
    const n = norm(name);
    const hit = (s) => norm(s) === n || (n.length >= 4 && (norm(s).includes(n) || n.includes(norm(s))));
    return (rows || [])
      .filter((r) => r.finished && r.homeScore != null && (hit(r.home) || hit(r.away)))
      .sort((a, b) => (Date.parse(b.kickoff) || 0) - (Date.parse(a.kickoff) || 0))
      .slice(0, 6)
      .map((r) => {
        const isHome = hit(r.home);
        const gf = isHome ? r.homeScore : r.awayScore;
        const ga = isHome ? r.awayScore : r.homeScore;
        return {
          kickoff: r.kickoff, opponent: isHome ? r.away : r.home,
          oppImg: isHome ? r.awayImg : r.homeImg, league: r.league || "",
          gf: gf ?? 0, ga: ga ?? 0,
          res: gf > ga ? "W" : gf === ga ? "D" : "L",
        };
      });
  };

  // Recent matches across ALL competitions (needs the club id from standings).
  useEffect(() => {
    const hid = infoFor(data?.home?.name)?.id;
    const aid = infoFor(data?.away?.name)?.id;
    if (!hid && !aid) return;
    let on = true;
    Promise.all([
      hid ? fetchTeamRecent(hid, 6).catch(() => null) : null,
      aid ? fetchTeamRecent(aid, 6).catch(() => null) : null,
    ]).then(([h, a]) => on && setApiRecent({ h: h?.length ? h : null, a: a?.length ? a : null }));
    return () => { on = false; };
  }, [teamIndex, data?.home?.name, data?.away?.name]); // eslint-disable-line react-hooks/exhaustive-deps


  if (loading) return <Shell><div className="h-64 bg-[#11161d] border border-white/10 rounded-2xl animate-pulse" /></Shell>;
  if (notFound || !data) return <Shell><div className="text-center py-16 text-zinc-400">Match not found.</div></Shell>;

  const match = data;
  const value = adaptValue(data.value);
  const live = match.live || null;
  const isLive = match.status === "live" || value.liveOnly;
  const lp = value.livePrediction;
  const afterHt = !!(lp && lp.after_ht);
  const outcomeKey = value.pick;
  const outcomeName = value.pickName;

  const hn = match.home?.name;
  const an = match.away?.name;
  const hInfo = infoFor(hn);
  const aInfo = infoFor(an);
  // All competitions when we can resolve the club id, otherwise the league feed.
  const hRecent = apiRecent.h ? mapRecent(apiRecent.h, hn) : mapRecent(league?.results, hn);
  const aRecent = apiRecent.a ? mapRecent(apiRecent.a, an) : mapRecent(league?.results, an);

  const oddsRows = (match.odds || [])
    .map((o) => ({ bookmaker: o.bookmaker, price: (o.odds && o.odds[outcomeKey]) || 0 }))
    .filter((o) => o.price > 0)
    .sort((a, b) => b.price - a.price);
  const topOdds = showAllOdds ? oddsRows : oddsRows.slice(0, 6);

  const pickPct = value.prediction ? value.prediction[outcomeKey] : null;
  const marketPct = value.bookProb != null ? Math.round(value.bookProb * 100) : null;

  return (
    <Shell>
      <Link to="/matches" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-5">
        <ArrowLeft className="w-4 h-4" /> Back to matches
      </Link>

      {/* HERO + MATCH ANALYSIS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="relative rounded-2xl border border-white/10 overflow-hidden bg-[#11161d] flex" data-testid="match-hero">
          <img src="https://images.unsplash.com/photo-1706675780107-7c43cc487928?crop=entropy&cs=srgb&fm=jpg&w=1200&q=70" alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/60 via-[#0A0A0A]/80 to-[#0A0A0A]" />
          <div className="relative p-6 w-full flex flex-col justify-center">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center mb-4">{match.leagueName}</div>
            <div className="grid grid-cols-3 items-center gap-2">
              <div className="flex flex-col items-center text-center gap-2">
                {hInfo?.image && <img src={hInfo.image} alt="" className="w-16 h-16 object-contain" />}
                <div className="font-display font-black uppercase text-white leading-tight">{hn}</div>
              </div>
              <div className="text-center">
                <div className="font-display font-black text-white text-sm">{fmtDate(match.commence_time)}</div>
                <div className="font-display font-black text-[#39FF14] text-2xl font-mono-num">{isLive ? "LIVE" : fmtTime(match.commence_time)}</div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-1">vs</div>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                {aInfo?.image && <img src={aInfo.image} alt="" className="w-16 h-16 object-contain" />}
                <div className="font-display font-black uppercase text-white leading-tight">{an}</div>
              </div>
            </div>
            {hInfo?.position && aInfo?.position && (
              <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500 mt-5">
                <MapPin className="w-3.5 h-3.5" /> {match.leagueName} · #{hInfo.position} vs #{aInfo.position}
              </div>
            )}
          </div>
        </div>

        <Card testId="ai-analysis" className="flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#39FF14]" />
              <h3 className="font-display font-black uppercase tracking-tight text-sm text-white">Match Analysis</h3>
            </div>
            <button
              type="button"
              data-testid="translate-analysis-btn"
              onClick={() => setAiLang((l) => (l === "el" ? "en" : "el"))}
              className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-[#39FF14] border border-white/10 hover:border-[#39FF14]/40 rounded-md px-2 py-1 transition-colors"
              title="Translate analysis"
            >
              <Languages className="w-3.5 h-3.5" /> {aiLang === "el" ? "EN" : "ΕΛ"}
            </button>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Writing the LION analysis…</div>
          ) : ai && ai.analysis ? (
            <div className="space-y-2 flex-1" data-testid="ai-analysis-text">
              {ai.analysis.split(/\n+/).filter(Boolean).map((para, i) => (
                <p key={i} className="text-sm text-zinc-300 leading-relaxed">{para}</p>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500 py-2 flex-1">AI analysis is temporarily unavailable — the LION model prediction is shown below.</div>
          )}

          {!isLive && (
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5" data-testid="analysis-kpis">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-[#39FF14] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">{value.possibleOutcome || outcomeName}</div>
                  <div className="font-display font-black text-white text-lg font-mono-num">{pickPct != null ? `${pickPct}%` : "—"}</div>
                  {marketPct != null && <div className="text-[9px] text-zinc-600">(Market {marketPct}%)</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-6 h-6 text-[#39FF14] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">Confidence</div>
                  <div className="font-display font-black text-white text-lg font-mono-num">{value.confidence != null ? `${Math.round(value.confidence / 10)}/10` : "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-6 h-6 text-[#39FF14] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">Potential value</div>
                  <div className="font-display font-black text-lg font-mono-num" style={{ color: (value.edge || 0) > 0 ? GREEN : "#fff" }}>
                    {value.edge != null ? `${value.edge > 0 ? "+" : ""}${value.edge}%` : "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
          <p className="text-[10px] text-zinc-600 mt-3">Generated by LION AI from the model's data · interpretation only, not a guarantee.</p>
        </Card>
      </div>

      {/* BEST ODDS STRIP */}
      {!isLive && (
        <Card testId="available-odds" className="mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h3 className="font-display font-black uppercase tracking-tight text-sm text-white">Best odds · {outcomeName}</h3>
            <div className="flex items-center gap-2">
              {oddsRows.length > 6 && (
                <button onClick={() => setShowAllOdds((v) => !v)} data-testid="toggle-all-odds"
                  className="text-[11px] font-bold text-zinc-400 hover:text-[#39FF14] border border-white/10 rounded-md px-2 py-1">
                  {showAllOdds ? "Show best 6" : `View all odds (${oddsRows.length})`}
                </button>
              )}
              <AddToSlipButton entry={{ match, value }} size="sm" />
              <AddToChartButton entry={{ match, value }} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {oddsRows.length === 0 && <div className="text-sm text-zinc-500">No odds available.</div>}
            {topOdds.map((o, i) => {
              const url = bookmakerUrl(o.bookmaker);
              const best = i === 0 && !showAllOdds ? true : i === 0;
              const box = `relative rounded-xl px-3 py-3 text-center transition-colors ${best ? "bg-[#39FF14]/10 border border-[#39FF14]/50" : "bg-[#0d1117] border border-white/10 hover:border-[#39FF14]/30"}`;
              const inner = (
                <>
                  {best && <span className="absolute -top-2 right-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#39FF14] text-black">Best</span>}
                  <div className={`text-[11px] font-bold truncate ${best ? "text-[#39FF14]" : "text-zinc-300"}`}>
                    {o.bookmaker}{url && <ExternalLink className="w-3 h-3 inline ml-1 opacity-50" />}
                  </div>
                  <div className={`font-display font-black text-xl font-mono-num mt-1 ${best ? "text-[#39FF14]" : "text-white"}`}>{o.price}</div>
                </>
              );
              return url ? (
                <a key={o.bookmaker} href={url} target="_blank" rel="noopener noreferrer" data-testid={`odds-link-${i}`} title={`Bet with ${o.bookmaker}`} className={box}>{inner}</a>
              ) : (
                <div key={o.bookmaker} data-testid={`odds-row-${i}`} title="No verified betting link for this bookmaker" className={box}>{inner}</div>
              );
            })}
          </div>
          <div className="mt-3"><AddToPortfolioButton entry={{ match, value }} /></div>
        </Card>
      )}

      {/* LIVE SECTIONS */}
      {isLive && (
        <Card testId="live-header" className="mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live{live && live.minute != null ? ` ${live.minute}'` : ""}
            </span>
            <span className="font-display font-black text-white text-3xl font-mono-num" data-testid="live-scoreline">
              {(live && live.homeScore) ?? 0}<span className="text-zinc-600 mx-2">-</span>{(live && live.awayScore) ?? 0}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">Match in play — odds and value picks do not apply live. Below is LION's model read of the game plus the live match statistics.</p>
        </Card>
      )}

      {isLive && value.liveAnalysis && (
        <Card title="Live Analysis" testId="live-analysis" className="mb-4">
          <p className="text-sm text-zinc-300 leading-relaxed">{value.liveAnalysis}</p>
        </Card>
      )}

      {isLive && lp && (
        <Card title="Live Prediction" testId="live-prediction" className="mb-4">
          <Bar label={hn || "Home"} pct={lp.home} color={lp.home >= Math.max(lp.home, lp.draw, lp.away) ? GREEN : "#3f3f46"} hi={lp.home >= Math.max(lp.home, lp.draw, lp.away)} />
          <Bar label="Draw" pct={lp.draw} color={lp.draw >= Math.max(lp.home, lp.draw, lp.away) ? GREEN : "#3f3f46"} hi={lp.draw >= Math.max(lp.home, lp.draw, lp.away)} />
          <Bar label={an || "Away"} pct={lp.away} color={lp.away >= Math.max(lp.home, lp.draw, lp.away) ? GREEN : "#3f3f46"} hi={lp.away >= Math.max(lp.home, lp.draw, lp.away)} />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-zinc-500">Live outcome</span>
            <span className="text-[#39FF14] font-black uppercase" data-testid="live-possible-outcome">{lp.possible_outcome}</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">Recalculated from the live score{lp.minute != null ? ` (${lp.minute}')` : ""} and the remaining expected goals.{afterHt && value.possibleOutcome ? ` Pre-match view (historical): ${value.possibleOutcome}.` : ""}</p>
        </Card>
      )}

      {/* PREDICTION + GOAL MARKET PIES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {value.prediction && !afterHt && (
          <Card title={isLive ? "Pre-match Prediction" : "LION Prediction"} testId="moka-prediction">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">Possible outcome</span>
              <span data-testid="possible-outcome" className="text-sm font-black uppercase px-3 py-1 rounded-full bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30">
                {value.possibleOutcome}
              </span>
            </div>
            <Bar label={hn || "Home"} pct={value.prediction.home} color={value.prediction.home >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away) ? GREEN : "#3f3f46"} hi={value.prediction.home >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away)} />
            <Bar label="Draw" pct={value.prediction.draw} color={value.prediction.draw >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away) ? GREEN : "#3f3f46"} hi={value.prediction.draw >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away)} />
            <Bar label={an || "Away"} pct={value.prediction.away} color={value.prediction.away >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away) ? GREEN : "#3f3f46"} hi={value.prediction.away >= Math.max(value.prediction.home, value.prediction.draw, value.prediction.away)} />
            {value.signals && value.signals.h2h && (
              <p className="text-[11px] text-zinc-500 mt-3" data-testid="prediction-h2h">
                Recent head-to-head: <b className="text-zinc-300">{value.signals.h2h.home}W</b> · {value.signals.h2h.draw}D · <b className="text-zinc-300">{value.signals.h2h.away}W</b> (adjusted into the model)
              </p>
            )}
          </Card>
        )}

        {value.prediction && (
          <Card title="Goal Markets" testId="goal-markets">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SplitPie testId="pie-over-under" title="Over / Under 2.5"
                a={value.prediction.over25} b={value.prediction.under25} aLabel="Over 2.5" bLabel="Under 2.5" />
              <SplitPie testId="pie-btts" title="Both teams to score"
                a={value.prediction.btts_yes} b={value.prediction.btts_no} aLabel="Yes" bLabel="No" />            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="bg-[#0d1117] border border-white/10 rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">xG Home</div><div className="font-display font-black text-lg text-white font-mono-num">{value.prediction.xg_home}</div></div>
              <div className="bg-[#0d1117] border border-white/10 rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">xG Away</div><div className="font-display font-black text-lg text-white font-mono-num">{value.prediction.xg_away}</div></div>
              <div className="bg-[#0d1117] border border-white/10 rounded-lg py-2"><div className="text-[10px] text-zinc-500 uppercase">xG Total</div><div className="font-display font-black text-lg text-[#39FF14] font-mono-num">{value.prediction.xg_total}</div></div>
            </div>
            <p className="text-[11px] text-zinc-500 mt-3">LION's model estimate from recent scoring &amp; form — not a guarantee.</p>
          </Card>
        )}
      </div>

      {/* LIVE MATCH STATISTICS */}
      {isLive && live && live.stats && (
        <Card title="Live match statistics" testId="live-stats" className="mb-4">
          <LiveStats home={live.stats.home} away={live.stats.away} hn={hn} an={an} />
          <p className="text-[11px] text-zinc-500 mt-3">Real-time statistics from the match, updated as it develops.</p>
        </Card>
      )}

      {/* TEAM CARDS */}
      {(hInfo || aInfo || hRecent.length || aRecent.length) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <TeamCard testId="team-card-home" name={hn} info={hInfo} recent={hRecent}
            xg={value.prediction?.xg_home} possession={match.homeTeam?.possession}
            cleanSheets={value.signals?.home_clean_sheets} />
          <TeamCard testId="team-card-away" name={an} info={aInfo} recent={aRecent}
            xg={value.prediction?.xg_away} possession={match.awayTeam?.possession}
            cleanSheets={value.signals?.away_clean_sheets} />
        </div>
      )}

      {/* MATCH HISTORY */}
      {(hRecent.length > 0 || aRecent.length > 0) && (
        <div className="mb-4" data-testid="match-history">
          <h3 className="font-display font-black uppercase tracking-tight text-white mb-1">Match history</h3>
          <p className="text-xs text-zinc-500 mb-3">Recent matches for each team.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <HistoryTable testId="history-home" name={hn} info={hInfo} recent={hRecent} />
            <HistoryTable testId="history-away" name={an} info={aInfo} recent={aRecent} />
          </div>
        </div>
      )}

      {/* WHY LION LIKES IT */}
      {!isLive && (
        <Card title="Why LION likes it" testId="why-moka" className="mb-4">
          <ul className="space-y-2">
            {whyMokaReasons(match, value).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                <Check className="w-4 h-4 text-[#39FF14] mt-0.5 shrink-0" /> {r}
              </li>
            ))}
          </ul>
        </Card>
      )}

    </Shell>
  );
}
