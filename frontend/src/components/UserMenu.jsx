import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { LogOut, User as UserIcon, Sparkles, Trash2, Wallet, LifeBuoy, LogIn } from "lucide-react";

const goSignIn = () => window.location.assign("/signin");

export const UserMenu = () => {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (!window.confirm("Delete your account and all your data? This cannot be undone.")) return;
    setBusy(true);
    try {
      await api.post("/auth/delete-account");
      await logout();
      window.location.assign("/");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" data-testid="auth-loading" />;
  }

  if (!user) {
    return (
      <button
        onClick={goSignIn}
        data-testid="login-btn"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white text-black text-xs font-bold uppercase tracking-wider whitespace-nowrap hover:bg-zinc-200 transition-colors"
      >
        <LogIn className="w-4 h-4" />
        Sign in
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="user-menu-btn"
        className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
      >
        {user.picture ? (
          <img src={user.picture} alt="" className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <UserIcon className="w-4 h-4 text-white" />
          </div>
        )}
        {user.is_pro && (
          <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#39FF14] text-black">
            <Sparkles className="w-2.5 h-2.5" /> Pro
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 surface rounded-lg p-3 z-50 shadow-2xl" data-testid="user-menu">
            <div className="px-2 py-1.5 mb-1">
              <div className="font-display font-black uppercase tracking-tight text-white">My Account</div>
              <div className="text-xs text-zinc-500 truncate mt-0.5">{user.email}</div>
            </div>
            <div className="border-t border-white/5 my-1.5" />
            {!user.is_pro ? (
              <Link
                to="/pricing"
                onClick={() => setOpen(false)}
                data-testid="upgrade-link"
                className="flex items-center gap-2 px-2 py-2 rounded text-sm font-bold text-[#39FF14] hover:bg-[#39FF14]/10"
              >
                <Sparkles className="w-4 h-4" /> Upgrade to Pro
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-400" data-testid="pro-status">
                <Sparkles className="w-4 h-4 text-[#39FF14]" />
                Pro active{user.pro_until ? ` until ${new Date(user.pro_until).toLocaleDateString()}` : ""}
              </div>
            )}
            <Link
              to="/account"
              onClick={() => setOpen(false)}
              data-testid="account-details-link"
              className="flex items-center gap-2 px-2 py-2 rounded text-sm text-zinc-300 hover:bg-white/5"
            >
              <UserIcon className="w-4 h-4" /> Account details
            </Link>
            <Link
              to="/portfolio"
              onClick={() => setOpen(false)}
              data-testid="menu-portfolio-link"
              className="flex items-center gap-2 px-2 py-2 rounded text-sm text-zinc-300 hover:bg-white/5"
            >
              <Wallet className="w-4 h-4" /> My Portfolio
            </Link>
            <button
              onClick={async () => { setOpen(false); await logout(); window.location.assign("/"); }}
              data-testid="logout-btn"
              className="w-full text-left flex items-center gap-2 px-2 py-2 rounded text-sm text-zinc-300 hover:bg-white/5"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
            <div className="border-t border-white/5 my-1.5" />
            <a
              href="mailto:lion.stats.support@gmail.com"
              data-testid="support-link"
              className="flex items-center gap-2 px-2 py-2 rounded text-sm text-zinc-300 hover:bg-white/5"
            >
              <LifeBuoy className="w-4 h-4" />
              <span className="min-w-0">
                <span className="block text-[10px] uppercase tracking-wider text-zinc-500">Support</span>
                <span className="block text-xs truncate">lion.stats.support@gmail.com</span>
              </span>
            </a>
            <div className="border-t border-white/5 my-1.5" />
            <button
              onClick={onDelete}
              disabled={busy}
              data-testid="delete-account-btn"
              className="w-full text-left flex items-center gap-2 px-2 py-2 rounded text-sm text-[#FF3B30] hover:bg-[#FF3B30]/10 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> {busy ? "Deleting…" : "Delete account"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default UserMenu;
