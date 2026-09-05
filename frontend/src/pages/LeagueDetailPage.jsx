import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Trophy, CalendarDays, ListChecks, Loader2 } from "lucide-react";
import Header from "../components/Header";
import { fetchLeagueDetail } from "../lib/api";

const NAMES = { denmark: "Superliga (Denmark)", scotland: "Premiership (Scotland)" };

function Logo({ src, name, size = 24 }) {
  if (!src) return <div className="rounded bg-white/5" style={{ width: size, height: size }} />;
  return <img src={src} alt={name} className="rounded object-contain bg-white/5" style={{ width: size, height: size }}
    onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />;
}

const fmtDate = (s) => {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d) ? s : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

function FormBadges({ form = [] }) {
  return (
    <div className="flex gap-0.5">
      {form.slice(-5).map((r, i) => (
        <span key={i} className={`w-4 h-4 rounded text-[9px] font-black flex items-center justify-center ${
          r === "W" ? "bg-[#39FF14]/20 text-[#39FF14]" : r === "L" ? "bg-[#FF3B30]/20 text-[#FF3B30]" : "bg-white/10 text-zinc-300"}`}>{r}</span>
      ))}
    </div>
  );
}

const TABS = [
  { key: "standings", label: "Standings", icon: Trophy },
  { key: "fixtures", label: "Fixtures", icon: CalendarDays },
  { key: "results", label: "Results", icon: ListChecks },
];

export default function LeagueDetailPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("standings");

  useEffect(() => {
    setLoading(true);
    fetchLeagueDetail(slug).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [slug]);

  const name = data?.name || NAMES[slug] || "League";
  const isBasket = data?.sport === "basketball";
  const tabs = isBasket ? TABS.filter((t) => t.key === "standings") : TABS;

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/leagues" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> All leagues
        </Link>
        <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white mb-5">{name}</h1>

        <div className="flex items-center gap-2 mb-6">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} data-testid={`league-tab-${t.key}`}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${tab === t.key ? "bg-[#39FF14] text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-500" /></div>
        ) : !data ? (
          <div className="text-center py-16 text-zinc-500">Could not load this league.</div>
        ) : tab === "standings" ? (
          <div className="overflow-x-auto rounded-xl border border-[#30363d]" data-testid="league-standings">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-[#0d1117] text-zinc-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">#</th>
                  <th className="px-3 py-2 text-left font-bold">Team</th>
                  <th className="px-3 py-2 text-center font-bold">P</th>
                  {isBasket ? (
                    <>
                      <th className="px-3 py-2 text-center font-bold">W</th>
                      <th className="px-3 py-2 text-center font-bold">L</th>
                      <th className="px-3 py-2 text-right font-bold">Win%</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-center font-bold">GF/g</th>
                      <th className="px-3 py-2 text-center font-bold">GA/g</th>
                      <th className="px-3 py-2 text-left font-bold">Form</th>
                      <th className="px-3 py-2 text-right font-bold">Pts</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.standings.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.03]" data-testid={`standings-row-${t.id}`}>
                    <td className="px-3 py-2 text-zinc-500 font-mono-num">{t.position}</td>
                    <td className="px-3 py-2">
                      <Link to={`/teams?league=${slug}&team=${t.id}`} className="flex items-center gap-2 text-white font-semibold hover:text-[#39FF14]">
                        <Logo src={t.image} name={t.name} /> {t.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center text-zinc-300">{t.played}</td>
                    {isBasket ? (
                      <>
                        <td className="px-3 py-2 text-center text-[#39FF14] font-bold">{t.wins}</td>
                        <td className="px-3 py-2 text-center text-[#FF3B30]">{t.losses}</td>
                        <td className="px-3 py-2 text-right font-display font-black text-white">{t.winPct ?? "—"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-center text-zinc-300">{t.goalsPerGame ?? "—"}</td>
                        <td className="px-3 py-2 text-center text-zinc-300">{t.concededPerGame ?? "—"}</td>
                        <td className="px-3 py-2"><FormBadges form={t.form} /></td>
                        <td className="px-3 py-2 text-right font-display font-black text-white">{t.points}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === "fixtures" ? (
          <div className="space-y-2" data-testid="league-fixtures">
            {data.upcoming.length === 0 && <div className="text-center py-12 text-zinc-500">No upcoming fixtures.</div>}
            {data.upcoming.map((f) => (
              <div key={f.id} className="flex items-center gap-3 bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3" data-testid={`fixture-${f.id}`}>
                <div className="text-xs text-zinc-500 w-24 shrink-0">{fmtDate(f.kickoff)}</div>
                <div className="flex-1 flex items-center justify-center gap-3 text-sm">
                  <span className="flex items-center gap-2 justify-end flex-1 text-white font-semibold text-right"><span className="truncate">{f.home}</span><Logo src={f.homeImg} name={f.home} /></span>
                  <span className="text-zinc-600 text-xs font-bold">vs</span>
                  <span className="flex items-center gap-2 flex-1 text-white font-semibold"><Logo src={f.awayImg} name={f.away} /><span className="truncate">{f.away}</span></span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2" data-testid="league-results">
            {data.results.length === 0 && <div className="text-center py-12 text-zinc-500">No recent results.</div>}
            {data.results.map((f) => (
              <div key={f.id} className="flex items-center gap-3 bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3" data-testid={`result-${f.id}`}>
                <div className="text-xs text-zinc-500 w-24 shrink-0">{fmtDate(f.kickoff)}</div>
                <div className="flex-1 flex items-center justify-center gap-3 text-sm">
                  <span className="flex items-center gap-2 justify-end flex-1 text-white font-semibold text-right"><span className="truncate">{f.home}</span><Logo src={f.homeImg} name={f.home} /></span>
                  <span className="font-mono-num font-black text-white px-2.5 py-0.5 rounded bg-white/5 border border-white/10">{f.homeScore} - {f.awayScore}</span>
                  <span className="flex items-center gap-2 flex-1 text-white font-semibold"><Logo src={f.awayImg} name={f.away} /><span className="truncate">{f.away}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
