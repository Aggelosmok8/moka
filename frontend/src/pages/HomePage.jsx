import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, TrendingUp, BarChart3, Wallet, ChevronDown } from "lucide-react";
import Header from "../components/Header";

const IMG = {
  hero: "https://images.unsplash.com/photo-1604524404499-67ba5a962db8?crop=entropy&cs=srgb&fm=jpg&q=85&w=2400",
  fog: "https://images.unsplash.com/photo-1709078477781-3f885189ecbf?crop=entropy&cs=srgb&fm=jpg&q=85&w=2400",
  grass: "https://images.unsplash.com/photo-1612607696387-f139f76bdd6c?crop=entropy&cs=srgb&fm=jpg&q=85&w=2400",
  arena: "https://images.unsplash.com/photo-1605813187860-5ca514620126?crop=entropy&cs=srgb&fm=jpg&q=85&w=2400",
};

const NEON = "#39FF14";

// Full-width editorial chapter for the four Moka steps.
function Step({ n, kicker, title, text, image, align = "left" }) {
  const right = align === "right";
  return (
    <section
      data-testid={`home-step-${n}`}
      className="relative min-h-[80vh] flex items-center overflow-hidden border-t border-white/5"
    >
      <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url(${image})` }} />
      <div className="absolute inset-0" style={{ background: right
        ? "linear-gradient(270deg, rgba(13,17,23,0.55) 0%, rgba(13,17,23,0.92) 60%, #0d1117 100%)"
        : "linear-gradient(90deg, rgba(13,17,23,0.55) 0%, rgba(13,17,23,0.92) 60%, #0d1117 100%)" }} />
      <div className={`relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 ${right ? "text-right flex justify-end" : ""}`}>
        <div className={`max-w-2xl ${right ? "items-end" : ""}`}>
          <div className="font-display font-black text-[22vw] sm:text-[12rem] leading-none text-white/[0.06] absolute -top-24 select-none pointer-events-none">
            {n}
          </div>
          <div className="relative">
            <div className="text-[#39FF14] font-display font-black uppercase tracking-[0.25em] text-xs sm:text-sm mb-4">
              {n} — {kicker}
            </div>
            <h2 className="font-display font-black uppercase tracking-tight text-white text-3xl sm:text-5xl lg:text-6xl leading-[0.95]">
              {title}
            </h2>
            <p className={`text-zinc-300 text-base sm:text-xl mt-6 leading-relaxed ${right ? "ml-auto" : ""} max-w-xl`}>
              {text}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#0d1117]">
      <Header />

      {/* HERO */}
      <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${IMG.hero})` }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 20%, rgba(13,17,23,0.35) 0%, rgba(13,17,23,0.85) 55%, #0d1117 100%)" }} />
        <div className="relative text-center px-4 sm:px-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#39FF14]/40 bg-[#39FF14]/10 text-[#39FF14] text-xs font-bold uppercase tracking-[0.2em] mb-8">
            Premium Sports Intelligence
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-white text-5xl sm:text-7xl lg:text-8xl leading-[0.9]">
            Moka makes<br />betting <span style={{ color: NEON }}>easier</span>.
          </h1>
          <p className="text-zinc-300 text-lg sm:text-2xl mt-8 max-w-2xl mx-auto leading-relaxed">
            Everything you need to study the game, find potential opportunities and track your performance — in one place.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
            <Link to="/matches" data-testid="hero-explore-matches" className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
              Explore Matches <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/portfolio" className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/20 text-white font-bold uppercase tracking-wider text-sm hover:bg-white/5 transition">
              My Portfolio
            </Link>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-zinc-500 animate-bounce">
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* FOUR MOKA STEPS */}
      <Step
        n="01" kicker="Find the opportunities" image={IMG.fog}
        title="Find the matches worth analysing"
        text="Moka analyses the available data and helps you spot the opportunities worth paying attention to"
      />
      <Step
        n="02" kicker="Find the best odds" image={IMG.arena} align="right"
        title="Find the best odds"
        text="See the available betting odds for every match and easily find the best price"
      />
      <Step
        n="03" kicker="Know the game" image={IMG.grass}
        title="See the game in depth"
        text="Study team and player statistics, form, results and all the data you need"
      />
      <Step
        n="04" kicker="Track your performance" image={IMG.hero} align="right"
        title="Build your own portfolio"
        text="Record the matches you played, the odds and the result, and track what you win and lose every time"
      />

      {/* BRAND STATEMENT */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${IMG.fog})` }} />
        <div className="absolute inset-0 bg-[#0d1117]/85" />
        <div className="relative text-center px-4 max-w-4xl mx-auto">
          <h2 className="font-display font-black uppercase tracking-tight text-white text-4xl sm:text-6xl lg:text-7xl leading-[0.95]">
            Betting<br />is not<br /><span style={{ color: NEON }}>a simple matter</span>
          </h2>
          <p className="text-zinc-300 text-lg sm:text-2xl mt-8">Before every decision, there is data</p>
          <p className="text-zinc-500 text-base sm:text-lg mt-3 max-w-2xl mx-auto">
            The more you understand the game, the more informed your decision can be.
          </p>
        </div>
      </section>

      {/* STATISTICS MESSAGE */}
      <section className="relative py-28 sm:py-40 overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${IMG.grass})` }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117] via-[#0d1117]/70 to-[#0d1117]" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display font-black uppercase tracking-tight text-white text-4xl sm:text-6xl lg:text-7xl leading-[0.95]">
            Statistics<br />do not <span style={{ color: NEON }}>lie</span>
          </h2>
          <p className="font-display font-black uppercase text-2xl sm:text-4xl text-zinc-200 mt-6">Make them your tool</p>
          <p className="text-zinc-400 text-lg sm:text-xl mt-10">Study every detail</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 font-display font-black uppercase tracking-tight text-xl sm:text-3xl text-white/90">
            <span>Teams</span><span>Players</span><span>Form</span>
            <span>Results</span><span>Odds</span><span>Stats</span>
          </div>
          <p className="text-[#39FF14] font-display font-black uppercase tracking-tight text-2xl sm:text-4xl mt-14">
            The details can make the difference
          </p>
        </div>
      </section>

      {/* BENEFITS — large statements */}
      <section className="py-24 sm:py-32 border-t border-white/5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="space-y-6 sm:space-y-8">
            {[
              "Find the matches worth analysing",
              "Find the best betting odds for every match",
              "See the stats of every team",
              "See the stats of every player",
              "Study every detail",
              "Track your own profit and losses",
            ].map((t, i) => (
              <div key={i} className="group flex items-baseline gap-4 sm:gap-6">
                <span className="font-display font-black text-[#39FF14]/40 text-xl sm:text-3xl w-10 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <p className="font-display font-black uppercase tracking-tight text-white text-2xl sm:text-4xl lg:text-5xl leading-[1.05] group-hover:text-[#39FF14] transition-colors">
                  {t}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JOURNEY: FIND -> ANALYSE -> CHOOSE -> TRACK */}
      <section className="py-24 border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h3 className="text-center font-display font-black uppercase tracking-[0.25em] text-zinc-500 text-sm mb-14">The Moka Journey</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 sm:gap-4">
            {[
              { icon: Search, t: "Find", d: "Discover the matches worth watching." },
              { icon: BarChart3, t: "Analyse", d: "Compare odds, team data and player statistics." },
              { icon: TrendingUp, t: "Choose", d: "Make your own decision using the information." },
              { icon: Wallet, t: "Track", d: "Record your bets and monitor your performance." },
            ].map((s, i) => (
              <div key={s.t} className="relative text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14] mb-4">
                  <s.icon className="w-6 h-6" />
                </div>
                <div className="font-display font-black uppercase tracking-tight text-white text-2xl">{s.t}</div>
                <p className="text-zinc-400 text-sm mt-2 max-w-[16rem] mx-auto">{s.d}</p>
                {i < 3 && <ArrowRight className="hidden sm:block absolute top-5 -right-2 w-5 h-5 text-zinc-700" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative py-28 sm:py-40 overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${IMG.arena})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/80 to-[#0d1117]/60" />
        <div className="relative text-center px-4 max-w-4xl mx-auto">
          <h2 className="font-display font-black uppercase tracking-tight text-white text-3xl sm:text-5xl lg:text-6xl leading-[0.95]">
            Study the game<br />See the opportunities<br /><span style={{ color: NEON }}>Make your own decision</span>
          </h2>
          <p className="text-zinc-300 text-lg sm:text-xl mt-8">Ready to see today's opportunities?</p>
          <Link to="/matches" data-testid="cta-explore-matches" className="inline-flex items-center gap-2 mt-8 px-10 py-4 rounded-full bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm hover:brightness-110 transition">
            Explore Matches <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-[11px] text-zinc-600 mt-10 max-w-2xl mx-auto">
            Moka provides data-driven insights and potential opportunities. It does not guarantee profits or winning bets.
          </p>
        </div>
      </section>
    </div>
  );
}
