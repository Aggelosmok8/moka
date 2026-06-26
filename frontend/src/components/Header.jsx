import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Flame, Trophy, BarChart3, Search, Tag, User, LineChart, Users } from "lucide-react";
import LiveStatusPill from "./LiveStatusPill";
import SearchPalette from "./SearchPalette";
import UserMenu from "./UserMenu";
import TrialBanner from "./TrialBanner";

const NavLink = ({ to, label, icon: Icon, active, testId }) => (
  <Link
    to={to}
    data-testid={testId}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${
      active
        ? "text-[#39FF14] bg-[#39FF14]/10"
        : "text-zinc-400 hover:text-white hover:bg-white/5"
    }`}
  >
    <Icon className="w-4 h-4" />
    <span className="hidden sm:inline">{label}</span>
  </Link>
);

export const Header = () => {
  const loc = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-50 backdrop-blur-xl bg-[#0A0A0A]/75 border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" data-testid="logo-link" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg neon-bg flex items-center justify-center font-display font-black text-lg group-hover:scale-105 transition-transform">
            X
          </div>
          <div className="font-display font-black uppercase tracking-tight text-xl text-white">
            Xtra<span className="text-[#39FF14]">Stats</span>
          </div>
        </Link>

        <nav className="flex items-center gap-0.5">
          <NavLink to="/" label="Home" icon={Activity} active={loc.pathname === "/"} testId="nav-home" />
          <NavLink to="/value" label="Value" icon={Flame} active={loc.pathname.startsWith("/value") || loc.pathname.startsWith("/analysis")} testId="nav-value" />
          <NavLink to="/leagues" label="Leagues" icon={Trophy} active={loc.pathname.startsWith("/leagues")} testId="nav-leagues" />
          <NavLink to="/odds" label="Odds" icon={BarChart3} active={loc.pathname.startsWith("/odds")} testId="nav-odds" />
          <NavLink to="/charts" label="Charts" icon={LineChart} active={loc.pathname.startsWith("/charts")} testId="nav-charts" />
          <NavLink to="/teams" label="Teams" icon={Users} active={loc.pathname.startsWith("/teams")} testId="nav-teams" />
          <NavLink to="/pricing" label="Pricing" icon={Tag} active={loc.pathname.startsWith("/pricing")} testId="nav-pricing" />
          <NavLink to="/account" label="Account" icon={User} active={loc.pathname.startsWith("/account")} testId="nav-account" />
        </nav>

        <div className="flex items-center gap-2">
          <button
            data-testid="search-button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-zinc-400 border border-white/10 hover:border-white/20 hover:text-white transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-white/5 rounded border border-white/10">/</kbd>
          </button>
          <LiveStatusPill />
          <UserMenu />
        </div>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <TrialBanner />
    </header>
  );
};

export default Header;
