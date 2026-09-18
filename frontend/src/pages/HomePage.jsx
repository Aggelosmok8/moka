import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Target, BarChart3, Wallet, ShieldCheck, Sparkles } from "lucide-react";
import Header from "../components/Header";

const NEON = "#39FF14";
const HERO_IMG = "https://images.unsplash.com/photo-1679391029864-d46f366a456b?crop=entropy&cs=srgb&fm=jpg&w=2000&q=80";

const PILLARS = [
  {
    icon: Target,
    title: "Every match, one place",
    text: "Odds from licensed bookmakers, team & player stats, form and results — nothing hidden behind ten clicks.",
  },
  {
    icon: BarChart3,
    title: "Predictions from the numbers",
    text: "LION's model reads scoring rates, form and head-to-head to give you probabilities and expected goals — plus an AI read of both sides.",
  },
  {
    icon: Wallet,
    title: "You stay in control",
    text: "Log what you play, see exactly what you win and what you lose, day by day. No illusions — just your real performance.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      <Header />

      <main className="relative flex-1 flex items-center overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(130% 90% at 50% 0%, rgba(10,10,10,0.35) 0%, rgba(10,10,10,0.88) 55%, #0A0A0A 100%)" }} />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(57,255,20,0.12) 0%, transparent 62%)" }} />

        <div className="relative w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-6">
          {/* BRAND + HEADLINE */}
          <div className="text-center">
            <img src="/lion-logo-full.png" alt="LION.STATS"
              className="mx-auto h-20 sm:h-24 lg:h-28 w-auto object-contain drop-shadow-[0_0_40px_rgba(57,255,20,0.25)]"
              data-testid="home-logo" />
            <h1 className="font-display font-black uppercase tracking-tight text-white mt-5 leading-[0.9]">
              <span className="block text-4xl sm:text-5xl lg:text-6xl">Makes</span>
              <span className="block text-3xl sm:text-4xl lg:text-5xl mt-1">
                betting <span style={{ color: NEON }}>easier</span>
              </span>
            </h1>
            <p className="text-zinc-300 text-base md:text-lg mt-5 max-w-3xl mx-auto leading-relaxed">
              All the information you need for every match — <b className="text-white">and predictions built on team statistics</b>.
              Play in a controlled way, see what you win and what you lose, and keep full control of your game.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
              <Link to="/matches" data-testid="hero-explore-matches"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
                Today's matches <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/compare" data-testid="hero-compare"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/20 text-white font-bold uppercase tracking-wider text-sm hover:bg-white/5 transition">
                <Sparkles className="w-4 h-4 text-[#39FF14]" /> Compare teams & players
              </Link>
              <Link to="/portfolio" data-testid="hero-portfolio"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-white/20 text-white font-bold uppercase tracking-wider text-sm hover:bg-white/5 transition">
                <Wallet className="w-4 h-4 text-[#39FF14]" /> My portfolio
              </Link>
            </div>
          </div>

          {/* THREE PILLARS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-9" data-testid="home-pillars">
            {PILLARS.map((p) => (
              <div key={p.title}
                className="group text-left rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5 hover:border-[#39FF14]/50 hover:bg-[#39FF14]/[0.04] transition-colors">
                <div className="w-10 h-10 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14] mb-3">
                  <p.icon className="w-5 h-5" />
                </div>
                <div className="font-display font-black uppercase tracking-tight text-white">{p.title}</div>
                <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{p.text}</p>
              </div>
            ))}
          </div>

          {/* RESPONSIBLE GAMBLING / COMPLIANCE */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-black/40 px-5 py-4" data-testid="home-compliance">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF3B30]/15 border border-[#FF3B30]/40 text-[#FF3B30] text-[11px] font-black tracking-wider">
                21+
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/15 text-zinc-300 text-[11px] font-bold tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-[#39FF14]" /> Licensed operators only
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/15 text-zinc-300 text-[11px] font-bold tracking-wider">
                Play responsibly
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-500 text-center max-w-4xl mx-auto">
              LION.STATS is an independent statistics and analysis service. <b className="text-zinc-300">We are not a bookmaker</b>,
              we do not accept bets or handle any money. Odds are indicative, provided for information by bookmakers licensed by the
              Hellenic Gaming Commission (EEEP), and can change at any time. Betting is permitted only for persons
              <b className="text-zinc-300"> 21 years and over</b>. Gambling involves risk of losing money and can be addictive —
              set limits and never bet money you cannot afford to lose. Model probabilities and AI commentary are estimates from
              historical data and <b className="text-zinc-300">do not guarantee any result or profit</b>.
              Help &amp; support: KETHEA ALFA helpline 210 9237777 · <span className="text-zinc-400">kethea-alfa.gr</span>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
