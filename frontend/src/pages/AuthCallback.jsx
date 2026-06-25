import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../contexts/AuthContext";

/**
 * AuthCallback — processes #session_id=... fragment exactly once.
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      navigate("/", { replace: true });
      return;
    }
    const sessionId = decodeURIComponent(m[1]);

    (async () => {
      try {
        await authApi.post(
          "/auth/session",
          {},
          { headers: { "X-Session-ID": sessionId } }
        );
      } catch (err) {
        // even on failure, clear hash and continue to /
      } finally {
        // strip the fragment so we never re-process
        window.history.replaceState(null, "", window.location.pathname);
        navigate("/", { replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-zinc-400 text-sm flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#39FF14] live-dot" />
        Signing you in...
      </div>
    </div>
  );
}
