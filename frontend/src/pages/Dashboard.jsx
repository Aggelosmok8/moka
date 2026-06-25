import { useState } from "react";
import { Activity, LogOut, LayoutGrid, LineChart, Users, User, Crown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import UpgradeDialog from "@/components/UpgradeDialog";
import TrialBanner from "@/components/TrialBanner";
import MatchesTab from "@/components/tabs/MatchesTab";
import MatchChartTab from "@/components/tabs/MatchChartTab";
import TeamsTab from "@/components/tabs/TeamsTab";
import AccountTab from "@/components/tabs/AccountTab";

const TABS = [
  { id: "matches", label: "Matches", icon: LayoutGrid },
  { id: "chart", label: "Match Chart", icon: LineChart },
  { id: "teams", label: "Teams", icon: Users },
  { id: "account", label: "Account", icon: User },
];

export default function Dashboard() {
  const { user, subscription, logout, isPro } = useAuth();
  const [tab, setTab] = useState("matches");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const openUpgrade = () => setUpgradeOpen(true);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Top bar */}
      <header className="glass sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="text-[#007AFF]" size={22} />
            <span className="heading text-xl">StatLine</span>
            {isPro ? (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-[#007AFF]/15 text-[#007AFF] px-2 py-0.5 rounded flex items-center gap-1">
                <Crown size={11} /> Pro
              </span>
            ) : (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-white/10 text-gray-300 px-2 py-0.5 rounded">
                Free
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!isPro && (
              <button data-testid="header-upgrade-btn" onClick={openUpgrade} className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5">
                <Crown size={14} /> Upgrade
              </button>
            )}
            <span className="hidden sm:block text-sm text-gray-400">{user?.name || user?.email}</span>
            <button data-testid="logout-btn" onClick={logout} className="text-gray-400 hover:text-white p-2" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id ? "border-[#007AFF] text-white" : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <TrialBanner subscription={subscription} onUpgrade={openUpgrade} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {tab === "matches" && <MatchesTab onUpgrade={openUpgrade} />}
        {tab === "chart" && <MatchChartTab onUpgrade={openUpgrade} />}
        {tab === "teams" && <TeamsTab onUpgrade={openUpgrade} />}
        {tab === "account" && <AccountTab onUpgrade={openUpgrade} />}
      </main>

      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
