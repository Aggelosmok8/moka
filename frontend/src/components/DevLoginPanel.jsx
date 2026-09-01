import React, { useState } from "react";
import { KeyRound, LogOut, X, User, Check } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

// Preview-only helper to switch between seeded test users without the console
// or a real Google login. Hidden on production/deployed domains.
const TEST_USERS = [
  { label: "Free", email: "free@moka.test", token: "test-free-token", tone: "text-zinc-300" },
  { label: "Trial (7d)", email: "trial@moka.test", token: "test-trial-token", tone: "text-[#FFD60A]" },
  { label: "Pro Monthly", email: "promonthly@moka.test", token: "test-pro-monthly-token", tone: "text-[#39FF14]" },
  { label: "Pro Annual", email: "proannual@moka.test", token: "test-pro-annual-token", tone: "text-[#39FF14]" },
];

const isPreview = () => {
  const h = window.location.hostname || "";
  return h.includes("preview.emergentagent.com") || h.includes("localhost") || h.startsWith("127.");
};

export default function DevLoginPanel() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth() || {};
  if (!isPreview()) return null;

  const loginAs = (token) => {
    try { localStorage.setItem("moka_session_token", token); } catch {}
    window.location.replace("/account");
  };
  const logout = () => {
    try { localStorage.removeItem("moka_session_token"); } catch {}
    window.location.replace("/");
  };

  return (
    <div className="fixed bottom-5 left-5 z-[95]" data-testid="dev-login-panel">
      {open ? (
        <div className="w-64 bg-[#161b22] border border-[#30363d] rounded-xl p-3 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#FFD60A] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Test users (preview)
            </span>
            <button onClick={() => setOpen(false)} data-testid="dev-login-close" className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="text-[11px] text-zinc-500 mb-2 flex items-center gap-1 truncate">
            <User className="w-3 h-3" /> {user ? user.email : "not signed in"}
          </div>
          <div className="space-y-1.5">
            {TEST_USERS.map((u) => {
              const active = user?.email === u.email;
              return (
                <button
                  key={u.token}
                  onClick={() => loginAs(u.token)}
                  data-testid={`dev-login-${u.token}`}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md bg-[#0d1117] border transition-colors text-left ${active ? "border-[#39FF14]/60" : "border-[#30363d] hover:border-[#39FF14]/40"}`}
                >
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${u.tone}`}>
                    {active && <Check className="w-3 h-3 text-[#39FF14]" />}{u.label}
                  </span>
                  <span className="text-[10px] text-zinc-600 truncate ml-2">{u.email}</span>
                </button>
              );
            })}
          </div>
          <button onClick={logout} data-testid="dev-login-logout" className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30 hover:bg-[#FF3B30]/20 text-xs font-bold">
            <LogOut className="w-3.5 h-3.5" /> Log out
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          data-testid="dev-login-toggle"
          title="Switch test user (preview only)"
          className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#161b22] border border-[#FFD60A]/40 text-[#FFD60A] text-xs font-bold shadow-lg hover:bg-[#FFD60A]/10"
        >
          <KeyRound className="w-3.5 h-3.5" /> Test users
        </button>
      )}
    </div>
  );
}
