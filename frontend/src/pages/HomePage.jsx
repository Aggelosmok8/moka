import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, TrendingUp, ArrowRight, Lock } from "lucide-react";
import Header from "../components/Header";
import ValueCard, { LockedValueCard } from "../components/ValueCard";
import { UpgradeButton } from "../components/Gating";
import { useEntitlements } from "../hooks/useEntitlements";
import { fetchValueMatches } from "../lib/catalogApi";
import { adaptValueMatches } from "../lib/valueEngine";

const HERO_BG =
  "https://images.unsplash.com/photo-1706675780107-7c43cc487928?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHwyfHxmb290YmFsbCUyMHN0YWRpdW0lMjBkYXJrJTIwbmlnaHR8ZW58MHx8fHwxNzc5MDM3MDg5fDA&ixlib=rb-4.1.0&q=85";

const Skel = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="h-48 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" data-testid="skeleton-card" />
    ))}
  </div>
);

export default function HomePage() {
  const { role, loading: entLoading } = useEntitlements();
  const isPro = role === "pro";
  const [ranked, setRanked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetchValueMatches()
      .then((d) => active && setRanked(adaptValueMatches(d)))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const FREE_LIMIT = 3;
  const top = isPro ? ranked : ranked.slice(0, FREE_LIMIT);
  const lockedCount = isPro ? 0 : Math.min(6, Math.max(3, ranked.length - FREE_LIMIT));
  const trending = useMemo(() => top.slice(0, 6), [top]);
  const busy = loading || entLoading;

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <section className="relative overflow-hidden border-b border-white/5">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `linear-gradient(180deg,rgba(5,8,7,.6) 0%,rgba(13,17,23,1) 100%),url(${HERO_BG})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 pitch-lines opacity-30 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-8 lg:pt-16 lg:pb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-4 rounded-full border border-[#39FF14]/30 bg-[#39FF14]/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] live-dot" />
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#39FF14]">Value Terminal · Football and Basketball</span>
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-4xl sm:text-5xl lg:text-6xl text-white leading-tight">
            Find Matches the<br />
            <span className="shimmer-text">Market Undervalues.</span>
          </h1>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-xl">
            The Moka model prices every fixture and surfaces where bookmaker odds disagree — your edge, ranked by value.
          </p>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 mb-1">
          <Flame className="w-5 h-5 text-[#39FF14]" />
          <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white">Top Undervalued Matches Today</h2>
        </div>
        <p className="text-zinc-500 text-sm mb-5">
          Ranked by expected value and model confidence.{!isPro && " Free plan shows the top 3."}
        </p>

        {busy ? (
          <Skel />
        ) : error ? (
          <div className="text-center py-16 text-zinc-400" data-testid="error-state">Could not load value data. The service may be warming up.</div>
        ) : ranked.length === 0 ? (
          <div className="text-center py-16 text-zinc-500" data-testid="empty-state">No value matches available right now.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="top-value-grid">
              {top.map((e) => (
                <ValueCard key={e.match.id} entry={e} />
              ))}
              {Array.from({ length: lockedCount }).map((_, i) => (
                <LockedValueCard key={`lock-${i}`} />
              ))}
            </div>
            {!isPro && (
              <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#161b22] border border-[#39FF14]/20 rounded-xl p-4" data-testid="home-upgrade">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <Lock className="w-4 h-4 text-[#39FF14]" /> Upgrade to Pro to unlock more value opportunities across more leagues.
                </div>
                <UpgradeButton />
              </div>
            )}
          </>
        )}

        {!busy && !error && trending.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#58a6ff]" />
                <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white">Trending Value Opportunities</h2>
              </div>
              <Link to="/value" className="text-sm text-[#39FF14] inline-flex items-center gap-1 hover:underline">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="border border-[#30363d] rounded-xl overflow-hidden divide-y divide-white/5" data-testid="trending-list">
              {trending.map(({ match, value }, i) => (
                <Link key={match.id} to={`/analysis/${match.id}`} className="flex items-center gap-3 p-3 hover:bg-white/[0.03]">
                  <span className="text-zinc-600 font-mono-num w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold truncate">{match.home && match.home.name} v {match.away && match.away.name}</div>
                    <div className="text-[11px] text-zinc-500">{match.leagueName}</div>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${value.level.cls}`}>
                    {value.level.emoji} {value.level.label}
                  </span>
                  <span className="text-xs text-[#58a6ff] font-bold font-mono-num w-16 text-right">{value.ev > 0 ? "+" : ""}{value.ev}% EV</span>
                  <span className="text-xs text-white font-bold font-mono-num w-12 text-right">{value.bestOdds}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
