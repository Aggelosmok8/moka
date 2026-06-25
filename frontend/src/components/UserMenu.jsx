import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LogOut, User as UserIcon, Sparkles } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const startLogin = () => {
  const redirectUrl = window.location.origin + "/";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

export const UserMenu = () => {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" data-testid="auth-loading" />;
  }

  if (!user) {
    return (
      <button
        onClick={startLogin}
        data-testid="login-btn"
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white text-black text-xs font-bold uppercase tracking-wider hover:bg-zinc-200 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.2-.1-2.4-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16.1 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.1 4 9.3 8.4 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.5-4.6 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.1 39.5 16 44 24 44z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.3 5.2c-.4.4 7-5.1 7-14.8 0-1.2-.1-2.4-.4-3.5z"/>
        </svg>
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
              <div className="font-display font-bold text-white truncate">{user.name}</div>
              <div className="text-xs text-zinc-500 truncate">{user.email}</div>
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
              <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-400">
                <Sparkles className="w-4 h-4 text-[#39FF14]" />
                Pro active{user.pro_until ? ` until ${new Date(user.pro_until).toLocaleDateString()}` : ""}
              </div>
            )}
            <button
              onClick={() => { setOpen(false); logout(); }}
              data-testid="logout-btn"
              className="w-full text-left flex items-center gap-2 px-2 py-2 rounded text-sm text-zinc-300 hover:bg-white/5"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default UserMenu;
