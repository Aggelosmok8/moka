import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, storeAuthToken } from "../contexts/AuthContext";

/**
 * GoogleCallback — our own Google OAuth client lands here with ?code=...&state=...
 * The code is posted to the backend, which holds the client secret.
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 */
export default function GoogleCallback() {
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const q = new URLSearchParams(window.location.search);
    const code = q.get("code");
    const state = q.get("state");
    if (!code || !state) {
      navigate("/signin", { replace: true });
      return;
    }

    (async () => {
      let token = null;
      try {
        const res = await authApi.post("/auth/google/callback", { code, state });
        token = res?.data?.session_token || null;
      } catch {
        token = null;
      }
      window.history.replaceState(null, "", window.location.pathname);
      if (!token) {
        navigate("/signin?error=google", { replace: true });
        return;
      }
      storeAuthToken(token);
      let pending = null;
      try { pending = sessionStorage.getItem("moka_pending_checkout"); } catch { /* ignore */ }
      window.location.replace(pending ? "/pricing" : "/matches");
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="google-callback">
      <div className="text-zinc-400 text-sm flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#39FF14] live-dot" />
        Signing you in with Google...
      </div>
    </div>
  );
}
