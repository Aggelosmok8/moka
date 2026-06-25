import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = isLogin ? await login(email, password) : await register(name, email, password);
    setBusy(false);
    if (res.ok) navigate("/app");
    else setError(res.error);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex">
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1706675780107-7c43cc487928?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0A0A0A] via-black/70 to-black/30" />
        <div className="absolute bottom-12 left-12 max-w-sm">
          <h2 className="heading text-4xl leading-tight">Your edge starts here.</h2>
          <p className="text-gray-300 mt-3">Live charts, full rosters and real-time odds — all in one place.</p>
        </div>
      </div>

      <div className="w-full lg:w-[480px] flex items-center justify-center p-8">
        <div className="w-full max-w-sm fade-up">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <Activity className="text-[#007AFF]" size={22} />
            <span className="heading text-xl">StatLine</span>
          </Link>
          <h1 className="heading text-3xl">{isLogin ? "Welcome back" : "Start your free trial"}</h1>
          <p className="text-gray-400 text-sm mt-2">
            {isLogin ? "Log in to your StatLine dashboard." : "7 days of full Pro access. No card required."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {!isLogin && (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wider">Name</label>
                <input
                  data-testid="auth-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full bg-[#141414] border border-white/10 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-[#007AFF]"
                  placeholder="Alex Morgan"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Email</label>
              <input
                data-testid="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full bg-[#141414] border border-white/10 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-[#007AFF]"
                placeholder="you@email.com"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider">Password</label>
              <input
                data-testid="auth-password-input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full bg-[#141414] border border-white/10 rounded-md px-4 py-3 text-sm focus:outline-none focus:border-[#007AFF]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p data-testid="auth-error" className="text-sm text-[#EF4444]">{error}</p>
            )}

            <button
              type="submit"
              data-testid="auth-submit-btn"
              disabled={busy}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {isLogin ? "Log in" : "Start free trial"}
            </button>
          </form>

          <p className="text-sm text-gray-400 mt-6 text-center">
            {isLogin ? "New to StatLine? " : "Already have an account? "}
            <Link
              data-testid="auth-switch-link"
              to={isLogin ? "/register" : "/login"}
              className="text-[#007AFF] font-semibold hover:underline"
            >
              {isLogin ? "Start free trial" : "Log in"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
