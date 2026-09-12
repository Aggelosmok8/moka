import React, { useEffect, useMemo, useState } from "react";
import { Newspaper, Search, CalendarDays, ExternalLink, X, Loader2 } from "lucide-react";
import Header from "../components/Header";
import { fetchNews } from "../lib/catalogApi";
import { useLang } from "../contexts/LanguageContext";

const NEWS_LEAGUES = [
  "Champions League", "Europa League", "Conference League",
  "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
  "Eredivisie", "Primeira Liga", "Championship", "Super League",
];

const fmtDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

function NewsCard({ a }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`news-card-${a.id}`}
      className="block bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden hover:border-[#39FF14]/40 transition-all"
    >
      {a.image && (
        <div className="h-40 w-full bg-[#0d1117] overflow-hidden">
          <img src={a.image} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#39FF14] truncate">{a.source}</span>
          <span className="text-[10px] text-zinc-500 whitespace-nowrap">{fmtDate(a.publishedAt)}</span>
        </div>
        <div className="font-display font-bold text-white leading-snug mb-2">{a.title}</div>
        {a.description && <p className="text-sm text-zinc-400 leading-snug line-clamp-3">{a.description}</p>}
        <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#39FF14]">
          Read source <ExternalLink className="w-3.5 h-3.5" />
        </div>
      </div>
    </a>
  );
}

export default function NewsPage() {
  const { lang } = useLang();
  const [fLeague, setFLeague] = useState("");
  const [fTeam, setFTeam] = useState("");
  const [team, setTeam] = useState("");
  const [fDate, setFDate] = useState("");
  const [articles, setArticles] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(false);

  // debounce the team search input
  useEffect(() => {
    const t = setTimeout(() => setTeam(fTeam.trim()), 500);
    return () => clearTimeout(t);
  }, [fTeam]);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setErr(false);
    fetchNews({ league: fLeague, team, date: fDate, lang })
      .then((d) => {
        if (!active) return;
        setArticles(d.articles || []);
        if (d.meta && d.meta.error) setErr(true);
      })
      .catch(() => active && setErr(true))
      .finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [fLeague, team, fDate, lang]);

  const hasFilters = fLeague || fTeam || fDate;
  const clear = () => { setFLeague(""); setFTeam(""); setFDate(""); };

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white flex items-center gap-2">
          <Newspaper className="w-7 h-7 text-[#39FF14]" /> News
        </h1>
        <p className="text-zinc-400 mt-1 mb-6 text-sm">Latest football news — filter by competition, team or date.</p>

        <div className="flex flex-wrap items-center gap-2 mb-6" data-testid="news-filters">
          <select value={fLeague} onChange={(e) => setFLeague(e.target.value)} data-testid="news-filter-league"
            className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#39FF14]">
            <option value="">All competitions</option>
            {NEWS_LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={fTeam} onChange={(e) => setFTeam(e.target.value)} placeholder="Search team…" data-testid="news-filter-team"
              className="bg-[#161b22] border border-[#30363d] rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#39FF14]" />
          </div>
          <div className="relative inline-flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2">
            <CalendarDays className="w-4 h-4 text-zinc-500" />
            <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} data-testid="news-filter-date"
              className="bg-transparent text-sm text-white focus:outline-none [color-scheme:dark]" />
          </div>
          {hasFilters && (
            <button onClick={clear} data-testid="news-filter-clear" className="inline-flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-[#FF3B30] border border-white/10 rounded-lg px-3 py-2">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {busy ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <div key={i} className="h-72 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />)}
          </div>
        ) : err ? (
          <div className="text-center py-16 text-zinc-400" data-testid="news-error">Couldn't load news right now. Please try again shortly.</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 text-zinc-400" data-testid="news-empty">No news found for these filters.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="news-grid">
            {articles.map((a) => <NewsCard key={a.id} a={a} />)}
          </div>
        )}
      </main>
    </div>
  );
}
