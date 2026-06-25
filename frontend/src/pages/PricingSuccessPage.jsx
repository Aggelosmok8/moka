import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import { authApi, useAuth } from "../contexts/AuthContext";
import { Sparkles, CheckCircle, XCircle, RefreshCw } from "lucide-react";

export default function PricingSuccessPage() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [state, setState] = useState({ phase: "pending", proUntil: null, error: null });
  const polledRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setState({ phase: "error", error: "Missing session id" });
      return;
    }
    let alive = true;
    const poll = async () => {
      if (!alive || polledRef.current >= 8) {
        if (alive) setState((s) => ({ ...s, phase: "timeout" }));
        return;
      }
      polledRef.current += 1;
      try {
        const r = await authApi.get(`/billing/status/${sessionId}`);
        if (r.data.payment_status === "paid") {
          await refresh();
          setState({ phase: "paid", proUntil: r.data.pro_until });
          return;
        }
        if (r.data.status === "expired") {
          setState({ phase: "expired" });
          return;
        }
      } catch (err) {
        // continue polling, but stop on auth failure
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          setState({ phase: "error", error: "Not authorized" });
          return;
        }
      }
      setTimeout(poll, 2000);
    };
    poll();
    return () => { alive = false; };
  }, [sessionId, refresh]);

  const Body = () => {
    if (state.phase === "paid") {
      return (
        <>
          <div className="w-14 h-14 rounded-full bg-[#39FF14]/15 border border-[#39FF14]/40 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-[#39FF14]" />
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-4xl sm:text-5xl text-white" data-testid="success-title">
            You're <span className="shimmer-text">Pro.</span>
          </h1>
          <p className="mt-4 text-zinc-400">
            All premium features are unlocked
            {state.proUntil ? ` until ${new Date(state.proUntil).toLocaleDateString()}` : ""}.
          </p>
          <button
            onClick={() => navigate("/")}
            data-testid="success-cta"
            className="mt-8 px-6 py-3 rounded-lg neon-bg font-black text-sm uppercase tracking-wider"
          >
            Explore Pro features
          </button>
        </>
      );
    }
    if (state.phase === "expired" || state.phase === "error") {
      return (
        <>
          <div className="w-14 h-14 rounded-full bg-[#FF3B30]/15 border border-[#FF3B30]/40 flex items-center justify-center mx-auto mb-5">
            <XCircle className="w-8 h-8 text-[#FF3B30]" />
          </div>
          <h1 className="font-display font-black uppercase tracking-tight text-3xl sm:text-4xl text-white">
            Payment didn't complete
          </h1>
          <p className="mt-4 text-zinc-400">{state.error || "The session expired. You can try again."}</p>
          <button
            onClick={() => navigate("/pricing")}
            className="mt-8 px-6 py-3 rounded-lg bg-white text-black font-black text-sm uppercase tracking-wider"
          >
            Back to pricing
          </button>
        </>
      );
    }
    return (
      <>
        <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-5">
          <RefreshCw className="w-7 h-7 text-zinc-400 animate-spin" />
        </div>
        <h1 className="font-display font-black uppercase tracking-tight text-3xl text-white">Confirming payment...</h1>
        <p className="mt-3 text-zinc-500 text-sm">Hold tight — this usually takes a few seconds.</p>
      </>
    );
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-20 text-center">
        <Body />
      </main>
    </div>
  );
}
