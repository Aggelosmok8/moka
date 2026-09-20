import React, { useEffect, useMemo, useState } from "react";
import { Users, User, Sparkles, Loader2, GitCompare, Languages } from "lucide-react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts";
import Header from "../components/Header";
import { fetchTeams, fetchPlayers, fetchPlayer, fetchCompareAi } from "../lib/api";
import { LEAGUE_CATALOG } from "../lib/sportsCatalog";
import { useLang } from "../contexts/LanguageContext";

const FOOTBALL_LEAGUES = LEAGUE_CATALOG.filter((l) => l.sport === "football" && !l.coming_soon);
const A_COLOR = "#39FF14";
const B_COLOR = "#FFD60A";

const formNum = (form) => {
  const r = (form || []).slice(-5);
  if (!r.length) return 0;
  return Math.round((r.reduce((s, c) => s + (c === "W" ? 2 : c === "D" ? 1 : 0), 0) / (r.length * 2)) * 100);
};

const Select = ({ value, onChange, options, placeholder, testId, disabled }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    data-testid={testId}
    className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#39FF14] disabled:opacity-40"
  >
    <option value="">{placeholder}</option>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

function SidePicker({ side, mode, state, set, color }) {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    if (!state.league) { setTeams([]); return; }
    let on = true;
    fetchTeams(state.league).then((t) => on && setTeams(t || [])).catch(() => on && setTeams([]));
    return () => { on = false; };
  }, [state.league]);

  useEffect(() => {
    if (mode !== "players" || !state.teamId) { setPlayers([]); return; }
    let on = true;
    fetchPlayers(state.teamId).then((p) => on && setPlayers(p || [])).catch(() => on && setPlayers([]));
    return () => { on = false; };
  }, [mode, state.teamId]);

  useEffect(() => {
    const t = teams.find((x) => String(x.id) === String(state.teamId));
    if (t && state.team?.id !== t.id) set({ ...state, team: t });
  }, [teams]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
      <div className="flex items-center gap-2 mb-4">
        <span className="font-display font-black uppercase text-sm tracking-widest" style={{ color }}>Side {side}</span>
      </div>
      <div className="space-y-3">
        <Select testId={`compare-${side}-league`} value={state.league} placeholder="Choose competition"
          options={FOOTBALL_LEAGUES.map((l) => ({ value: l.id, label: l.name }))}
          onChange={(v) => set({ league: v, teamId: "", team: null, playerId: "" })} />
        <Select testId={`compare-${side}-team`} value={state.teamId} placeholder={teams.length ? "Choose team" : "Loading teams…"}
          disabled={!state.league}
          options={teams.map((t) => ({ value: String(t.id), label: t.name }))}
          onChange={(v) => set({ ...state, teamId: v, team: teams.find((t) => String(t.id) === v) || null, playerId: "" })} />
        {mode === "players" && (
          <Select testId={`compare-${side}-player`} value={state.playerId}
            placeholder={state.teamId ? (players.length ? "Choose player" : "Loading squad…") : "Choose a team first"}
            disabled={!state.teamId}
            options={players.map((p) => ({ value: String(p.id), label: `${p.name}${p.position ? ` · ${p.position}` : ""}` }))}
            onChange={(v) => set({ ...state, playerId: v })} />
        )}
      </div>
    </div>
  );
}

const StatRow = ({ label, a, b, better }) => {
  const aw = better === "a", bw = better === "b";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-2 border-b border-white/5 last:border-0">
      <div className={`text-right font-bold ${aw ? "text-[#39FF14]" : "text-zinc-300"}`}>{a}</div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500 text-center min-w-[110px]">{label}</div>
      <div className={`font-bold ${bw ? "text-[#FFD60A]" : "text-zinc-300"}`}>{b}</div>
    </div>
  );
};

const posKey = (p) => {
  const s = (p?.position || "").toLowerCase();
  if (s.startsWith("goal")) return "goalkeeper";
  if (s.startsWith("def")) return "defender";
  if (s.startsWith("mid")) return "midfielder";
  return "attacker";
};

// Each position is judged on its own job, per 90 minutes or as a share.
const playerMetricDefs = (kind) => {
  const p90 = (key) => (s) => (s.minutes ? Math.round(((s[key] || 0) / s.minutes) * 90 * 100) / 100 : 0);
  const share = (num, den) => (s) => (s[den] ? Math.round(((s[num] || 0) / s[den]) * 100) : 0);
  const duels = { k: "Duels won %", f: share("duelsWon", "duelsTotal") };
  const acc = { k: "Pass accuracy %", f: (s) => s.passAccuracy || 0 };
  const rating = { k: "Rating", f: (_s, p) => p.rating || 0 };
  const minutes = { k: "Minutes", f: (s) => s.minutes || 0 };
  const sets = {
    goalkeeper: [
      { k: "Saves / 90", f: p90("saves") },
      { k: "Conceded / 90", f: p90("conceded"), lowerBetter: true },
      { k: "Save %", f: (s) => ((s.saves || 0) + (s.conceded || 0) ? Math.round(((s.saves || 0) / ((s.saves || 0) + (s.conceded || 0))) * 100) : 0) },
      acc, rating, minutes,
    ],
    defender: [
      { k: "Tackles / 90", f: p90("tackles") },
      { k: "Interceptions / 90", f: p90("interceptions") },
      duels,
      { k: "Fouls / 90", f: p90("fouls"), lowerBetter: true },
      rating, minutes,
    ],
    midfielder: [
      { k: "Key passes / 90", f: p90("keyPasses") },
      { k: "G+A / 90", f: (s) => (s.minutes ? Math.round((((s.goals || 0) + (s.assists || 0)) / s.minutes) * 90 * 100) / 100 : 0) },
      acc,
      { k: "Tackles / 90", f: p90("tackles") },
      duels, rating,
    ],
    attacker: [
      { k: "Goals / 90", f: p90("goals") },
      { k: "Assists / 90", f: p90("assists") },
      { k: "Shots on target / 90", f: p90("shotsOn") },
      { k: "Conversion %", f: share("goals", "shots") },
      duels, rating,
    ],
  };
  return sets[kind];
};

const Panel = ({ title, children, testId }) => (  <div className="rounded-2xl border border-white/10 bg-[#11161d] p-5" data-testid={testId}>
    <div className="font-display font-black uppercase tracking-tight text-white mb-4">{title}</div>
    {children}
  </div>
);

export default function ComparePage() {
  const [mode, setMode] = useState("teams");
  const [A, setA] = useState({ league: "", teamId: "", team: null, playerId: "" });
  const [B, setB] = useState({ league: "", teamId: "", team: null, playerId: "" });
  const [pA, setPA] = useState(null);
  const [pB, setPB] = useState(null);
  const [ai, setAi] = useState({ text: null, busy: false });
  const { lang } = useLang();
  const [aiLang, setAiLang] = useState(lang);
  useEffect(() => { setAiLang(lang); }, [lang]);

  // Player stats (lazy, only when a player is picked)
  useEffect(() => {
    if (mode !== "players" || !A.playerId) { setPA(null); return; }
    let on = true;
    fetchPlayer(A.playerId, A.teamId).then((d) => on && setPA(d)).catch(() => on && setPA(null));
    return () => { on = false; };
  }, [mode, A.playerId, A.teamId]);
  useEffect(() => {
    if (mode !== "players" || !B.playerId) { setPB(null); return; }
    let on = true;
    fetchPlayer(B.playerId, B.teamId).then((d) => on && setPB(d)).catch(() => on && setPB(null));
    return () => { on = false; };
  }, [mode, B.playerId, B.teamId]);

  const ready = mode === "teams" ? !!(A.team && B.team) : !!(pA && pB);

  const nameA = mode === "teams" ? A.team?.name : pA?.name;
  const nameB = mode === "teams" ? B.team?.name : pB?.name;

  const metrics = useMemo(() => {
    if (!ready) return [];
    if (mode === "teams") {
      const a = A.team, b = B.team;
      return [
        { k: "Points", a: a.points ?? 0, b: b.points ?? 0 },
        { k: "Goals / game", a: a.goalsPerGame ?? 0, b: b.goalsPerGame ?? 0 },
        { k: "Conceded / game", a: a.concededPerGame ?? 0, b: b.concededPerGame ?? 0, lowerBetter: true },
        { k: "Goal difference", a: a.goalDiff ?? 0, b: b.goalDiff ?? 0 },
        { k: "Win %", a: a.winPct ?? 0, b: b.winPct ?? 0 },
        { k: "Form (last 5)", a: formNum(a.form), b: formNum(b.form) },
      ];
    }
    // Players are judged on their own position's job — per 90 minutes, so a
    // squad player is not buried by someone with three times the minutes.
    const defs = playerMetricDefs(posKey(pA));
    return defs.map((d) => ({
      k: d.k, lowerBetter: d.lowerBetter,
      a: d.f(pA.stats || {}, pA), b: d.f(pB.stats || {}, pB),
    }));
  }, [ready, mode, A.team, B.team, pA, pB]);

  const radarData = useMemo(() => metrics.slice(0, 6).map((m) => {
    const max = Math.max(m.a, m.b, 0.0001);
    const norm = (v) => Math.round((m.lowerBetter ? (max === 0 ? 0 : (max - v + Math.min(m.a, m.b)) / max) : v / max) * 100);
    return { metric: m.k, A: norm(m.a), B: norm(m.b) };
  }), [metrics]);

  const barData = useMemo(() => metrics.slice(0, 6).map((m) => ({ name: m.k, A: m.a, B: m.b })), [metrics]);

  const pieData = useMemo(() => {
    if (!ready || !metrics.length) return [];
    const m = metrics[0];
    return [
      { name: `${nameA} ${m.k}`, value: Number(m.a) || 0 },
      { name: `${nameB} ${m.k}`, value: Number(m.b) || 0 },
    ];
  }, [ready, metrics, nameA, nameB]);

  const runAi = (langOverride) => {
    if (!ready) return;
    const l = langOverride || aiLang;
    setAi({ text: null, busy: true });
    const payload = mode === "teams"
      ? { kind: "teams", lang: l, a: { name: nameA, ...A.team }, b: { name: nameB, ...B.team } }
      : { kind: "players", lang: l, a: pA, b: pB, metrics };
    fetchCompareAi(payload)
      .then((d) => setAi({ text: d.text || "LION Analysis is unavailable right now.", busy: false }))
      .catch(() => setAi({ text: "LION Analysis is unavailable right now.", busy: false }));
  };

  const toggleLang = () => {
    const next = aiLang === "el" ? "en" : "el";
    setAiLang(next);
    if (ai.text || ai.busy) runAi(next);
  };

  useEffect(() => { setAi({ text: null, busy: false }); }, [mode, A.teamId, B.teamId, A.playerId, B.playerId]);

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white flex items-center gap-3">
              <GitCompare className="w-8 h-8 text-[#39FF14]" /> Compare
            </h1>
            <p className="text-zinc-400 text-sm mt-1">Put two teams — or two players — side by side and let the numbers talk.</p>
          </div>
          <div className="inline-flex p-1 rounded-full bg-white/5 border border-white/10 self-start">
            {[["teams", "Teams", Users], ["players", "Players", User]].map(([k, label, Icon]) => (
              <button key={k} onClick={() => setMode(k)} data-testid={`compare-mode-${k}`}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors ${mode === k ? "bg-[#39FF14] text-black" : "text-zinc-300 hover:text-white"}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <SidePicker side="A" mode={mode} state={A} set={setA} color={A_COLOR} />
          <SidePicker side="B" mode={mode} state={B} set={setB} color={B_COLOR} />
        </div>

        {!ready ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-20 text-center text-zinc-500" data-testid="compare-empty">
            Pick {mode === "teams" ? "two teams" : "two players"} above to see the comparison.
          </div>
        ) : (
          <div className="space-y-6" data-testid="compare-results">
            <div className="rounded-2xl border border-white/10 bg-[#11161d] p-6">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-5">
                <div className="text-right">
                  <div className="font-display font-black uppercase text-xl sm:text-2xl text-[#39FF14] truncate">{nameA}</div>
                  <div className="text-xs text-zinc-500">{mode === "teams" ? A.team?.leagueName : `${pA?.position || ""} · ${pA?.team || ""}`}</div>
                </div>
                <div className="font-display font-black text-zinc-600 text-lg">VS</div>
                <div>
                  <div className="font-display font-black uppercase text-xl sm:text-2xl text-[#FFD60A] truncate">{nameB}</div>
                  <div className="text-xs text-zinc-500">{mode === "teams" ? B.team?.leagueName : `${pB?.position || ""} · ${pB?.team || ""}`}</div>
                </div>
              </div>
              <div data-testid="compare-stat-table">
                {mode === "players" && posKey(pA) !== posKey(pB) && (
                  <div data-testid="compare-position-warning" className="mb-3 text-xs text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/30 rounded-lg px-3 py-2">
                    Different positions ({pA?.position} vs {pB?.position}) — the metrics below are the ones that matter for a {pA?.position?.toLowerCase()}.
                  </div>
                )}
                {metrics.map((m) => (
                  <StatRow key={m.k} label={m.k} a={m.a} b={m.b}
                    better={m.a === m.b ? null : (m.lowerBetter ? (m.a < m.b ? "a" : "b") : (m.a > m.b ? "a" : "b"))} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Panel title="Profile" testId="compare-radar">
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="#ffffff18" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#8b949e", fontSize: 10 }} />
                    <Radar name={nameA} dataKey="A" stroke={A_COLOR} fill={A_COLOR} fillOpacity={0.28} />
                    <Radar name={nameB} dataKey="B" stroke={B_COLOR} fill={B_COLOR} fillOpacity={0.22} />
                  </RadarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title="Head to head" testId="compare-bars">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <XAxis type="number" tick={{ fill: "#8b949e", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={92} tick={{ fill: "#8b949e", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="A" name={nameA} fill={A_COLOR} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="B" name={nameB} fill={B_COLOR} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
              <Panel title={metrics.length ? `${metrics[0].k} share` : "Share"} testId="compare-pie">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%" paddingAngle={3} stroke="none">
                      {pieData.map((_, i) => <Cell key={i} fill={i === 0 ? A_COLOR : B_COLOR} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11, color: "#8b949e" }} />
                    <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            <div className="rounded-2xl border border-[#39FF14]/25 bg-[#39FF14]/[0.04] p-6" data-testid="compare-ai">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="font-display font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#39FF14]" /> LION Analysis
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={toggleLang} data-testid="translate-compare-btn"
                    title="Translate analysis"
                    className="flex items-center gap-1 text-[11px] font-bold text-zinc-400 hover:text-[#39FF14] border border-white/10 hover:border-[#39FF14]/40 rounded-md px-2 py-1 transition-colors">
                    <Languages className="w-3.5 h-3.5" /> {aiLang === "el" ? "EN" : "ΕΛ"}
                  </button>
                  {!ai.text && (
                    <button onClick={() => runAi()} disabled={ai.busy} data-testid="compare-ai-btn"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#39FF14] text-black text-xs font-black uppercase tracking-wider disabled:opacity-60">
                      {ai.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {ai.busy ? "Analysing…" : "Generate"}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line">
                {ai.text || (ai.busy ? "Reading the numbers…" : "Generate a short LION read on both sides — strengths, weaknesses and who the data favours.")}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
