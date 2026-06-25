import { Link, useNavigate } from "react-router-dom";
import { Activity, BarChart3, Users, TrendingUp, Zap, ArrowRight } from "lucide-react";
import PricingCards from "@/components/PricingCards";

const HERO = "https://images.unsplash.com/photo-1706675780107-7c43cc487928?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwzfHxzcG9ydHMlMjBzdGFkaXVtJTIwbGlnaHRzJTIwbmlnaHR8ZW58MHx8fHwxNzgyMzg2MDY3fDA&ixlib=rb-4.1.0&q=85";

const FEATURES = [
  { icon: BarChart3, title: "Live Match Charts", desc: "Track the matches you care about in one dynamic chart — scores, status and stats updating live." },
  { icon: Users, title: "Teams & Rosters", desc: "Browse every league, drill into teams and explore full player rosters with performance data." },
  { icon: TrendingUp, title: "Real-Time Odds", desc: "Aggregated betting lines from top bookmakers, refreshed and cached for speed." },
  { icon: Zap, title: "Built for Speed", desc: "Aggressively cached data means a fast, lightweight experience that never wastes a call." },
];

export default function Landing() {
  const navigate = useNavigate();
  const goTrial = () => navigate("/register");

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Nav */}
      <header className="glass fixed top-0 inset-x-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-[#007AFF]" size={22} />
            <span className="heading text-xl">StatLine</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/login" data-testid="nav-login-link" className="text-sm text-gray-300 hover:text-white px-4 py-2">
              Log in
            </Link>
            <button data-testid="nav-trial-btn" onClick={goTrial} className="btn-primary px-5 py-2 text-sm">
              Start free trial
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-16">
        <div className="absolute inset-0">
          <img src={HERO} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/80 to-[#0A0A0A]" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 py-28 md:py-40">
          <div className="max-w-2xl fade-up">
            <span className="eyebrow text-[#007AFF]">7-day free trial · no card required</span>
            <h1 className="heading text-5xl md:text-7xl leading-[0.95] mt-4">
              Track the game.<br />Read the <span className="text-[#007AFF]">odds.</span>
            </h1>
            <p className="text-gray-300 text-lg mt-6 max-w-xl">
              StatLine turns live matches, team data and real-time odds into one fast, focused dashboard.
              Build your match chart and never miss a moment.
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-9">
              <button data-testid="hero-trial-btn" onClick={goTrial} className="btn-primary px-7 py-3.5 text-base flex items-center gap-2">
                Start 7-day free trial <ArrowRight size={18} />
              </button>
              <a href="#pricing" className="px-7 py-3.5 text-base font-bold border border-white/20 rounded-[4px] hover:bg-white/5 transition-colors">
                View pricing
              </a>
            </div>
            <p className="text-xs text-gray-500 mt-4">Full Pro access during your trial. Cancel anytime.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <p className="eyebrow text-[#007AFF]">Why StatLine</p>
        <h2 className="heading text-3xl md:text-4xl mt-2 max-w-xl">Everything you need, nothing you don't</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="card-surface p-6 hover:-translate-y-1 hover:border-white/20 transition-all duration-200 fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="w-11 h-11 rounded-lg bg-[#007AFF]/10 flex items-center justify-center">
                <f.icon className="text-[#007AFF]" size={22} />
              </div>
              <h3 className="heading text-lg mt-5">{f.title}</h3>
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-24 border-t border-white/10">
        <div className="text-center mb-12">
          <p className="eyebrow text-[#007AFF]">Simple pricing</p>
          <h2 className="heading text-4xl md:text-5xl mt-2">Start free. Upgrade when ready.</h2>
          <p className="text-gray-400 mt-3">Try every Pro feature free for 7 days — then pick the plan that fits.</p>
        </div>
        <PricingCards onSelectPlan={goTrial} />
        <p className="text-center text-xs text-gray-500 mt-8">
          Annual billed yearly at €79 — that's just €6.58/month. Monthly billed at €8.99/month.
        </p>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 pb-28">
        <div className="card-surface p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[#007AFF]/10 to-transparent" />
          <div className="relative">
            <h2 className="heading text-3xl md:text-4xl">Ready to track smarter?</h2>
            <p className="text-gray-400 mt-3 max-w-md mx-auto">Join now and get full Pro access for 7 days — no card needed.</p>
            <button data-testid="cta-trial-btn" onClick={goTrial} className="btn-primary px-8 py-3.5 mt-7 inline-flex items-center gap-2">
              Start free trial <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Activity className="text-[#007AFF]" size={16} /> <span className="heading text-base text-white">StatLine</span>
        </div>
        © {new Date().getFullYear()} StatLine. Live sports tracking & odds.
      </footer>
    </div>
  );
}
