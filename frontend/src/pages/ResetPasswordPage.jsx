import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, Loader2, ArrowLeft } from "lucide-react";
import { authApi } from "../contexts/AuthContext";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await authApi.post("/auth/password/reset", { token, password: pw });
      setDone(true);
    } catch (e2) {
      const d = e2.response?.data?.detail;
      setErr(typeof d === "string" ? d : "This reset link is invalid or expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-4">
      <img src="/lion-logo.png" alt="LION.STATS" className="h-11 w-auto mb-6" />
      <div className="w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#11161d] p-6" data-testid="reset-card">
        <h1 className="font-display font-black uppercase tracking-tight text-2xl text-white text-center mb-5">Set a new password</h1>
        {done ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-[#39FF14]" data-testid="reset-done">Your password has been changed. You can sign in now.</p>
            <Link to="/signin" data-testid="reset-to-signin"
              className="inline-flex items-center justify-center rounded-lg bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm px-5 py-3">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)}
                placeholder="New password (min 8 characters)" data-testid="reset-password"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-10 pr-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#39FF14]" />
            </div>
            {err && <div className="text-xs text-[#FF3B30] bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-lg px-3 py-2" data-testid="reset-error">{err}</div>}
            <button type="submit" disabled={busy || !token} data-testid="reset-submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm py-3 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save new password
            </button>
            {!token && <p className="text-xs text-zinc-500 text-center">This link is missing its token — request a new reset email.</p>}
          </form>
        )}
      </div>
      <Link to="/signin" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white mt-6">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </Link>
    </div>
  );
}
