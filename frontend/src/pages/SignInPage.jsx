import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, User as UserIcon, Loader2, Sparkles, ArrowLeft } from "lucide-react";
import { authApi } from "../contexts/AuthContext";
import { setToken } from "../lib/api";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
const startGoogle = (intent) => {
  try { localStorage.setItem("lion_signup_intent", intent || "free"); } catch { /* ignore */ }
  const redirectUrl = window.location.origin + "/";
  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
};

const errText = (d) => {
  if (!d) return "Something went wrong. Please try again.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return d?.msg ? String(d.msg) : String(d);
};

const Field = ({ icon: Icon, testId, ...props }) => (
  <div className="relative">
    <Icon className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input {...props} data-testid={testId}
      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-10 pr-3 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#39FF14]" />
  </div>
);

export default function SignInPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const intent = params.get("intent") === "trial" ? "trial" : "free";
  const [mode, setMode] = useState(params.get("mode") === "signup" || intent === "trial" ? "signup" : "signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setSent(""); setBusy(true);
    try {
      const path = mode === "signup" ? "/auth/register" : "/auth/login";
      const body = mode === "signup"
        ? { email: form.email, password: form.password, name: form.name, intent }
        : { email: form.email, password: form.password };
      const { data } = await authApi.post(path, body);
      setToken(data.session_token);
      window.location.replace("/matches");
    } catch (e2) {
      setErr(errText(e2.response?.data?.detail) || e2.message);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!form.email) { setErr("Enter your email first, then tap “Forgot your password?”"); return; }
    setErr(""); setBusy(true);
    try {
      await authApi.post("/auth/password/forgot", { email: form.email });
      setSent("If that email has an account, we've sent a reset link. Check your inbox.");
    } catch (e2) {
      setErr(errText(e2.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const signup = mode === "signup";

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6" data-testid="signin-back">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>
      <img src="/lion-logo.png" alt="LION.STATS" className="h-11 w-auto mb-6" />

      <div className="w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#11161d] p-6" data-testid="signin-card">
        <h1 className="font-display font-black uppercase tracking-tight text-2xl text-white text-center">
          {signup ? (intent === "trial" ? "Start your free trial" : "Create your account") : "Sign in"}
        </h1>
        <p className="text-xs text-zinc-500 text-center mt-1 mb-5">
          {signup
            ? (intent === "trial" ? "7 days of full Pro access — no card required." : "Free account. Upgrade whenever you want.")
            : "Enter your details to access your account."}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {signup && (
            <Field icon={UserIcon} testId="signin-name" type="text" placeholder="Your name"
              value={form.name} onChange={set("name")} autoComplete="name" />
          )}
          <Field icon={Mail} testId="signin-email" type="email" placeholder="Email" required
            value={form.email} onChange={set("email")} autoComplete="email" />
          <Field icon={Lock} testId="signin-password" type="password"
            placeholder={signup ? "Password (min 8 characters)" : "Password"} required
            value={form.password} onChange={set("password")}
            autoComplete={signup ? "new-password" : "current-password"} />

          {err && <div className="text-xs text-[#FF3B30] bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-lg px-3 py-2" data-testid="signin-error">{err}</div>}
          {sent && <div className="text-xs text-[#39FF14] bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-lg px-3 py-2" data-testid="signin-sent">{sent}</div>}

          <button type="submit" disabled={busy} data-testid="signin-submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#39FF14] text-black font-black uppercase tracking-wider text-sm py-3 hover:brightness-110 disabled:opacity-50 transition">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (signup && intent === "trial" ? <Sparkles className="w-4 h-4" /> : null)}
            {signup ? (intent === "trial" ? "Start 7-day trial" : "Create account") : "Sign in"}
          </button>
        </form>

        {!signup && (
          <button type="button" onClick={forgot} data-testid="signin-forgot"
            className="w-full text-center text-xs text-zinc-500 hover:text-white mt-3">
            Forgot your password?
          </button>
        )}

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button type="button" onClick={() => startGoogle(intent)} data-testid="signin-google"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white text-[#1f1f1f] font-bold text-sm py-3 hover:bg-zinc-100 transition">
          <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v8.4h12.7c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.5-4.2 6.9-10.3 6.9-17.5z" />
            <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 019.6 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 000 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.6-5.9l-7.6-5.9c-2 1.4-4.7 2.4-8 2.4-6.4 0-11.7-3.7-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Continue with Google
        </button>

        <div className="text-center text-xs text-zinc-500 mt-5">
          {signup ? (
            <>Already have an account?{" "}
              <button type="button" onClick={() => { setMode("signin"); setErr(""); }} data-testid="switch-to-signin"
                className="text-[#39FF14] font-bold hover:underline">Sign in</button></>
          ) : (
            <>Don't have an account yet?{" "}
              <button type="button" onClick={() => { setMode("signup"); setErr(""); }} data-testid="switch-to-signup"
                className="text-[#39FF14] font-bold hover:underline">Sign up</button></>
          )}
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 text-center mt-6 max-w-[380px]">
        21+ · LION.STATS is a statistics and analysis service, not a bookmaker. We never take bets or handle money.
      </p>
      <button type="button" onClick={() => navigate("/pricing")} className="text-xs text-zinc-500 hover:text-white mt-3">
        See plans &amp; pricing
      </button>
    </div>
  );
}
