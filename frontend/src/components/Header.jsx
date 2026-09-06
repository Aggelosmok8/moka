import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Flame, Trophy, BarChart3, Search, Tag, User, LineChart, Users, Wallet, Star, Dribbble, Menu, X } from "lucide-react";
import LiveStatusPill from "./LiveStatusPill";
import SearchPalette from "./SearchPalette";
import UserMenu from "./UserMenu";
import TrialBanner from "./TrialBanner";
import LiveTicker from "./LiveTicker";
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

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Activity, testId: "nav-home", isActive: (p) => p === "/" },
  { to: "/matches", label: "Matches", icon: Flame, testId: "nav-matches", isActive: (p) => p.startsWith("/matches") || p.startsWith("/analysis") || p.startsWith("/value") },
  { to: "/leagues", label: "Leagues", icon: Trophy, testId: "nav-leagues", isActive: (p) => p.startsWith("/leagues") },
  { to: "/teams", label: "Teams", icon: Users, testId: "nav-teams", isActive: (p) => p.startsWith("/teams") || p.startsWith("/team/") },
  { to: "/sports", label: "Sports", icon: Dribbble, testId: "nav-sports", isActive: (p) => p.startsWith("/sports") },
  { to: "/charts", label: "Watchlist", icon: Star, testId: "nav-watchlist", isActive: (p) => p.startsWith("/charts"), badge: "chart" },
  { to: "/portfolio", label: "Portfolio", icon: Wallet, testId: "nav-portfolio", isActive: (p) => p.startsWith("/portfolio"), badge: "pending" },
  { to: "/pricing", label: "Pricing", icon: Tag, testId: "nav-pricing", isActive: (p) => p.startsWith("/pricing") },
  { to: "/account", label: "Account", icon: User, testId: "nav-account", isActive: (p) => p.startsWith("/account") },
];

export const Header = () => {
  const loc = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const { count: chartCount } = useChart();
  const { pendingCount } = usePortfolio();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);
  const badgeFor = (b) => (b === "chart" ? chartCount : b === "pending" ? pendingCount : 0);

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
            Moka<span className="text-[#39FF14]">Stats</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-0.5">
          {NAV_ITEMS.map((it) => (
            <NavLink key={it.to} to={it.to} label={it.label} icon={it.icon} testId={it.testId}
              active={it.isActive(loc.pathname)} badge={badgeFor(it.badge)} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            data-testid="mobile-menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-md text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
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

      {menuOpen && (
        <nav data-testid="mobile-nav" className="lg:hidden border-t border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl px-4 py-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((it) => {
            const Icon = it.icon;
            const active = it.isActive(loc.pathname);
            const badge = badgeFor(it.badge);
            return (
              <Link
                key={it.to}
                to={it.to}
                data-testid={`m-${it.testId}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
                  active ? "text-[#39FF14] bg-[#39FF14]/10" : "text-zinc-300 hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" /> {it.label}
                {badge > 0 && (
                  <span className="ml-auto min-w-[16px] h-4 px-1 rounded-full bg-[#39FF14] text-black text-[10px] font-black flex items-center justify-center">{badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <TrialBanner />
      <LiveTicker />
    </header>
  );
};

export default Header;
