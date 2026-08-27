import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Layers, TrendingUp, Wallet, ArrowRight, Zap, Eye, LayoutGrid } from "lucide-react";
import Header from "../components/Header";
import { fetchValueMatches } from "../lib/catalogApi";
import { adaptValueMatches } from "../lib/valueEngine";
import ValueCard from "../components/ValueCard";

const BENEFITS = [
  { n: "1", icon: Search, title: "Find the opportunities", text: "See the matches where Moka identifies potential value." },
  { n: "2", icon: Layers, title: "See everything you need", text: "Match info, team & player stats, fixtures, leagues and more — in one place." },
  { n: "3", icon: TrendingUp, title: "Stay one step ahead", text: "Use data and analysis to understand matches before you decide." },
  { n: "4", icon: Wallet, title: "Build your own portfolio", text: "Track the matches you play and see exactly how much you win or lose." },
];

const STEPS = [
  { n: "1", title: "Moka analyses the match", text: "We look at team performance, recent form, home/away performance, and player & team data." },
  { n: "2", title: "We compare with the market", text: "Moka compares its assessment with the available bookmaker odds." },
  { n: "3", title: "We highlight opportunities", text: "We surface matches where the numbers suggest the odds may be attractive." },
];

const CHOICES = [
  { to: "/matches?view=strong", emoji: "🟢", icon: Zap, title: "Strong Opportunities", text: "The strongest opportunities identified by Moka.", accent: "#39FF14" },
  { to: "/matches?view=watching", emoji: "🟡", icon: Eye, title: "Worth Watching", text: "Interesting opportunities, not as strong as the top picks.", accent: "#FFD60A" },
  { to: "/matches?view=all", emoji: "⚪", icon: LayoutGrid, title: "All Matches", text: "Browse the complete list of available matches.", accent: "#9CA3AF" },
];

export default function HomePage() {
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchValueMatches()
      .then((d) => {
        if (!active) return;
        const all = adaptValueMatches(d);
        const strong = all.filter((e) => e.value?.valueLevel === "HIGH");
        setTop((strong.length ? strong : all).slice(0, 3));
      })
      .catch(() => active && setTop([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* HERO */}
        <section className="py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#39FF14]/10 text-[#39FF14] text-xs font-bold uppercase tracking-wider mb-6">
            Moka finds the matches worth watching
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-4xl sm:text-5xl lg:text-6xl text-white leading-[0.95]">
            Moka makes<br />betting <span className="text-[#39FF14]">easier</span>.
          </h1>
          <p className="text-zinc-400 text-base sm:text-lg mt-5 max-w-2xl mx-auto">
            Everything you need to make smarter decisions — in one place. No maths degree required.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <Link to="/matches?view=strong" data-testid="hero-cta-opportunities" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#39FF14] text-black font-bold hover:brightness-110 transition">
              See today's opportunities <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/matches?view=all" className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/15 text-white font-semibold hover:bg-white/5 transition">
              Browse all matches
            </Link>
          </div>
        </section>

        {/* BENEFITS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-16">
          {BENEFITS.map((b) => (
            <div key={b.n} className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-9 h-9 rounded-lg bg-[#39FF14]/10 text-[#39FF14] flex items-center justify-center"><b.icon className="w-5 h-5" /></span>
                <span className="font-display font-black text-2xl text-white/20">{b.n}</span>
              </div>
              <h3 className="font-display font-bold text-white text-lg leading-tight">{b.title}</h3>
              <p className="text-zinc-400 text-sm mt-1.5">{b.text}</p>
            </div>
          ))}
        </section>

        {/* THREE CHOICES */}
        <section className="pb-16">
          <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white mb-1">What do you want to see?</h2>
          <p className="text-zinc-500 text-sm mb-6">Jump straight to the matches that matter to you.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CHOICES.map((c) => (
              <Link key={c.to} to={c.to} data-testid={`choice-${c.title.toLowerCase().split(" ")[0]}`} className="group bg-[#161b22] border border-[#30363d] rounded-2xl p-6 hover:border-[#39FF14]/50 transition-all">
                <div className="text-3xl mb-3">{c.emoji}</div>
                <h3 className="font-display font-black uppercase tracking-tight text-xl text-white">{c.title}</h3>
                <p className="text-zinc-400 text-sm mt-2">{c.text}</p>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-bold" style={{ color: c.accent }}>
                  View <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* TODAY'S BEST — preview */}
        <section className="pb-16">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white">Today's Best Opportunities</h2>
            <Link to="/matches?view=strong" className="text-sm font-bold text-[#39FF14] inline-flex items-center gap-1">See all <ArrowRight className="w-4 h-4" /></Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => <div key={i} className="h-56 bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse" />)}
            </div>
          ) : top.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">No opportunities available right now.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="home-top-grid">
              {top.map((e) => <ValueCard key={e.match.id} entry={e} />)}
            </div>
          )}
        </section>

        {/* HOW MOKA WORKS */}
        <section className="pb-20">
          <h2 className="font-display font-black uppercase tracking-tight text-2xl text-white mb-6">How Moka works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
                <div className="font-display font-black text-3xl text-[#39FF14] mb-2">{s.n}</div>
                <h3 className="font-display font-bold text-white text-lg leading-tight">{s.title}</h3>
                <p className="text-zinc-400 text-sm mt-1.5">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-zinc-600 mt-5 max-w-3xl">
            Moka provides data-driven insights and potential opportunities. It does not guarantee profits or winning bets.
          </p>
        </section>
      </main>
    </div>
  );
}
