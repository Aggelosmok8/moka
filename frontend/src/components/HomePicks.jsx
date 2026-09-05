import React from "react";

const BG = "https://images.unsplash.com/photo-1605813187860-5ca514620126?crop=entropy&cs=srgb&fm=jpg&q=85&w=2400";

const SENTENCES = [
  "Find the matches worth analysing",
  "Find the best odds for every match",
  "See the stats of every team",
  "See the stats of every player",
  "Study every detail that matters",
  "Track your profit and your losses",
];

const CHART = [
  ["Goals", 18], ["Assists", 11], ["Shots", 46],
  ["Key Passes", 32], ["Tackles", 27], ["Duels Won", 39],
];

function Diagram() {
  const max = Math.max(1, ...CHART.map(([, v]) => v));
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 max-w-md" data-testid="home-diagram">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3">Season output</div>
      <div className="space-y-2">
        {CHART.map(([label, v]) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-24 text-[11px] text-zinc-400 shrink-0">{label}</div>
            <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#39FF14] rounded-full transition-all" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <div className="w-7 text-right text-[11px] font-mono-num text-white">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePicks() {
  return (
    <section data-testid="home-picks" className="relative overflow-hidden py-10 sm:py-12">
      <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${BG})` }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0d1117 0%, rgba(13,17,23,0.9) 40%, #0d1117 100%)" }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-[#39FF14] font-display font-black uppercase tracking-[0.25em] text-xs mb-6">Why Moka</div>

        <div className="space-y-3 sm:space-y-4">
          {SENTENCES.map((t, i) => (
            <div key={i} className="group flex items-baseline gap-4" data-testid={`home-sentence-${i}`}>
              <span className="font-display font-black text-[#39FF14]/50 text-lg sm:text-2xl w-9 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="font-display font-black uppercase tracking-tight text-white text-xl sm:text-3xl leading-[1.05] group-hover:text-[#39FF14] transition-colors">
                {t}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8">
          <Diagram />
        </div>
      </div>
    </section>
  );
}
