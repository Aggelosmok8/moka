import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Flame, Trophy, BarChart3, Search, Tag, User, LineChart, Users, Wallet, Star, Dribbble } from "lucide-react";
import LiveStatusPill from "./LiveStatusPill";
import SearchPalette from "./SearchPalette";
import UserMenu from "./UserMenu";
import TrialBanner from "./TrialBanner";
import { useChart } from "../contexts/ChartContext";
import { usePortfolio } from "../contexts/PortfolioContext";

const NavLink = ({ to, label, icon: Icon, active, testId, badge }) => (
  <Link
    to={to}
    data-testid={testId}
    className={`relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${
      active
        ? "text-[#39FF14] bg-[#39FF14]/10"
        : "text-zinc-400 hover:text-white hover:bg-white/5"
    }`}
  >
    <Icon className="w-4 h-4" />
    <span className="hidden sm:inline">{label}</span>
    {badge > 0 && (
      <span data-testid="charts-nav-badge" className="ml-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#39FF14] text-black text-[10px] font-black flex items-center justify-center">
        {badge}
      </span>
    )}
  </Link>
);

export const Header = () => {
  const loc = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const { count: chartCount } = useChart();
  const { pendingCount } = usePortfolio();

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
          <NavLink to="/matches" label="Matches" icon={Flame} active={loc.pathname.startsWith("/matches") || loc.pathname.startsWith("/analysis") || loc.pathname.startsWith("/value")} testId="nav-matches" />
          <NavLink to="/leagues" label="Leagues" icon={Trophy} active={loc.pathname.startsWith("/leagues")} testId="nav-leagues" />
          <NavLink to="/teams" label="Teams" icon={Users} active={loc.pathname.startsWith("/teams") || loc.pathname.startsWith("/team/")} testId="nav-teams" />
          <NavLink to="/sports" label="Sports" icon={Dribbble} active={loc.pathname.startsWith("/sports")} testId="nav-sports" />
          <NavLink to="/charts" label="Watchlist" icon={Star} active={loc.pathname.startsWith("/charts")} testId="nav-watchlist" badge={chartCount} />
          <NavLink to="/portfolio" label="Portfolio" icon={Wallet} active={loc.pathname.startsWith("/portfolio")} testId="nav-portfolio" badge={pendingCount} />
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
