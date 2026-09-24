import React, { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

// Signed-in users set/change their own password. Being signed in is the proof
// of ownership, so Google-created accounts can add one without any email.
export const PasswordCard = ({ hasPassword }) => {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/password/set", { new_password: pw, current_password: cur });
      toast.success("Password saved. You can now sign in with your email and password.");
      setOpen(false); setPw(""); setCur("");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not save the password.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#39FF14]";

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 mt-4" data-testid="password-card">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-white font-bold text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#39FF14]" /> Password
          </h2>
          <p className="text-zinc-500 text-sm mt-1">
            {hasPassword
              ? "You can sign in with your email and password, or with Google."
              : "This account uses Google sign-in. Add a password to sign in with your email too."}
          </p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} data-testid="password-toggle"
            className="text-xs font-black uppercase tracking-wider px-4 py-2 rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors whitespace-nowrap">
            {hasPassword ? "Change password" : "Set a password"}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={save} className="mt-4 space-y-3 max-w-sm">
          {hasPassword && (
            <input type="password" required value={cur} onChange={(e) => setCur(e.target.value)}
              placeholder="Current password" className={input} data-testid="password-current" />
          )}
          <input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 8 characters)" className={input} data-testid="password-new" />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} data-testid="password-save"
              className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider px-4 py-2.5 rounded-lg neon-bg text-black disabled:opacity-50">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save password
            </button>
            <button type="button" onClick={() => setOpen(false)} data-testid="password-cancel"
              className="text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg text-zinc-400 hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default PasswordCard;
