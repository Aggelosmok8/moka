import React, { useEffect, useState } from "react";
import { X, Sparkles, Lock } from "lucide-react";
import { fetchMatchSummary, fetchMatchPrediction } from "../lib/catalogApi";
import { UpgradeButton } from "./Gating";

function ProbBar({ prediction, isBasket }) {
  const wp = prediction.win_probability || {};
  const segs = isBasket
    ? [
        { k: "Home", v: wp.home ?? 0, c: "#39FF14" },
        { k: "Away", v: wp.away ?? 0, c: "#58a6ff" },
      ]
    : [
        { k: "Home", v: wp.home ?? 0, c: "#39FF14" },
        { k: "Draw", v: wp.draw ?? 0, c: "#FF9500" },
        { k: "Away", v: wp.away ?? 0, c: "#58a6ff" },
      ];
  const total = segs.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden border border-white/10">
        {segs.map((s) => (
          <div key={s.k} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs">
        {segs.map((s) => (
          <span key={s.k} className="text-zinc-400">
            {s.k} <span className="text-white font-bold font-mono-num">{Math.round((s.v / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Match detail overlay: AI Summary (FREE) + Prediction (PRO-gated).
export default function MatchDetailModal({ match, isPro, onClose }) {
  const [summary, setSummary] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predLocked, setPredLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!match) return undefined;
    let active = true;
    setLoading(true);
    setSummary(null);
    setPrediction(null);
    setPredLocked(false);
    (async () => {
      try {
        const s = await fetchMatchSummary(match.id);
        if (active) setSummary(s);
      } catch {
        if (active) setSummary({ summary: "AI summary is unavailable right now.", bullets: [] });
      }
      try {
        const p = await fetchMatchPrediction(match.id);
        if (active) setPrediction(p);
      } catch (e) {
        if (active && e?.response?.status === 402) setPredLocked(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [match]);

  if (!match) return null;
  const isBasket = match.sport === "basketball";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="match-modal">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0d1117] border border-[#30363d] rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} data-testid="modal-close" className="absolute top-4 right-4 text-zinc-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">{match.leagueName}</div>
        <h3 className="font-display font-black uppercase tracking-tight text-2xl text-white mb-5 pr-8">
          {match.home?.name} <span className="text-zinc-600">vs</span> {match.away?.name}
        </h3>

        {/* AI Summary — FREE */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[#39FF14]" />
            <h4 className="font-display font-bold uppercase tracking-tight text-sm text-white">AI Summary</h4>
          </div>
          {loading && !summary ? (
            <div className="h-16 bg-[#161b22] rounded-lg animate-pulse" />
          ) : (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-sm text-zinc-300" data-testid="ai-summary">
              <p>{summary?.summary}</p>
              {summary?.bullets?.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-zinc-400 list-disc list-inside">
                  {summary.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Prediction — PRO */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h4 className="font-display font-bold uppercase tracking-tight text-sm text-white">Prediction</h4>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#39FF14]/15 text-[#39FF14]">
              Pro
            </span>
          </div>
          {loading ? (
            <div className="h-16 bg-[#161b22] rounded-lg animate-pulse" />
          ) : predLocked ? (
            <div className="relative rounded-lg border border-[#30363d] overflow-hidden" data-testid="prediction-locked">
              <div className="p-4 blur-sm select-none pointer-events-none">
                <div className="flex h-3 rounded-full overflow-hidden border border-white/10">
                  <div style={{ width: "45%", background: "#39FF14" }} />
                  <div style={{ width: "25%", background: "#FF9500" }} />
                  <div style={{ width: "30%", background: "#58a6ff" }} />
                </div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                <div className="flex items-center gap-1.5 text-zinc-200 text-sm font-semibold">
                  <Lock className="w-4 h-4" /> Predictions are a Pro feature
                </div>
                <UpgradeButton size="sm" label="Unlock with Pro" testId="modal-upgrade" />
              </div>
            </div>
          ) : prediction ? (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 space-y-3" data-testid="prediction">
              <ProbBar prediction={prediction} isBasket={isBasket} />
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  Confidence <span className="text-white font-bold">{prediction.confidence}%</span>
                </span>
                <span>
                  xG {prediction.expected_goals?.home} – {prediction.expected_goals?.away}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">Prediction unavailable.</div>
          )}
        </section>
      </div>
    </div>
  );
}
