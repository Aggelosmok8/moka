import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Header from "../components/Header";
import TeamCrest from "../components/TeamCrest";
import FormBadges from "../components/FormBadges";
import { TeamRadar, CompareBarChart, radarFromStats } from "../components/Charts";
import { fetchMatch, generateAnalysis } from "../lib/api";
import { ArrowLeft, Sparkles, MapPin, Clock, RefreshCw, Lock } from "lucide-react";
import AnalysisView from "../components/AnalysisView";
import OddsView from "../components/OddsView";
import { useAuth } from "../contexts/AuthContext";

const ProbabilityBar = ({ p }) => (
  <div className="space-y-2" data-testid="predicted-strength">
    <div className="flex items-center justify-between text-[10px] tracking-[0.2em] uppercase font-bold text-zinc-500">
      <span>Home {p.home}%</span>
      <span>Draw {p.draw}%</span>
      <span>Away {p.away}%</span>
    </div>
    <div className="h-3 rounded-md overflow-hidden flex">
      <div style={{ width: `${p.home}%` }} className="bg-[#39FF14] transition-all duration-700" />
      <div style={{ width: `${p.draw}%` }} className="bg-[#FF9500] transition-all duration-700" />
      <div style={{ width: `${p.away}%` }} className="bg-zinc-400 transition-all duration-700" />
    </div>
  </div>
);

const CompareRow = ({ label, h, a, suffix = "", invert = false }) => {
  const hWin = invert ? h < a : h > a;
  const aWin = invert ? a < h : a > h;
  return (
    <div className="grid grid-cols-5 items-center gap-2 py-2">
      <div className={`text-right font-mono-num font-bold text-sm ${hWin ? "text-[#39FF14]" : "text-zinc-400"}`}>
        {h}{suffix}
      </div>
      <div className="col-span-3 text-center text-[10px] tracking-[0.2em] uppercase font-bold text-zinc-500">
        {label}
      </div>
      <div className={`text-left font-mono-num font-bold text-sm ${aWin ? "text-[#39FF14]" : "text-zinc-400"}`}>
        {a}{suffix}
      </div>
    </div>
  );
};

export default function MatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isPro } = useAuth();
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState("");
  const [structured, setStructured] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    setLoading(true);
    setAnalysis("");
    setStructured(null);
    fetchMatch(id).then(setMatch).finally(() => setLoading(false));
  }, [id]);

  const handleAnalyze = async (regen = false) => {
    if (regen && !isPro) {
      navigate("/pricing");
      return;
    }
    // BUG FIX: require login before making AI analysis API call
    if (!user) {
      navigate("/pricing");
      return;
    }
    setAnalyzing(true);
    setAiError("");
    try {
      const data = await generateAnalysis(id, regen);
      setAnalysis(data.analysis || "");
      setStructured(data.structured || null);
    } catch (e) {
      if (e?.response?.status === 402) {
        navigate("/pricing");
        return;
      }
      // BUG FIX: specific message for rate limit (429)
      if (e?.response?.status === 429) {
        setAiError("Daily limit reached — 1 free analysis per match per day. Upgrade to Pro for unlimited.");
        return;
      }
      if (e?.response?.status === 401) {
        navigate("/pricing");
        return;
      }
      setAiError("Could not generate analysis. Try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading || !match) {
    return (
      <div className="min-h-screen bg-[#0A0A0A]">
        <Header />
        <div className="max-w-7xl mx-auto p-8 animate-pulse space-y-4">
          <div className="h-40 bg-[#121212] rounded-xl" />
          <div className="h-64 bg-[#121212] rounded-xl" />
        </div>
      </div>
    );
  }

  const { home, away, homeTeam, awayTeam, status, homeScore, awayScore, minute, leagueName, venue } = match;
  const showScore = status === "live" || status === "finished";

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link to="/" data-testid="back-link" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        {/* Match hero */}
        <section
          data-testid="match-hero"
          className="relative surface rounded-2xl overflow-hidden p-6 lg:p-10 mb-8 fade-up"
        >
          <div className="absolute inset-0 pitch-lines opacity-30 pointer-events-none" />
          <div className="relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase font-bold text-zinc-500">
            <span>{leagueName}</span>
            <span>·</span>
            <Clock className="w-3 h-3" />
            <span>{status === "live" ? `${minute}' LIVE` : status === "finished" ? "FT" : "20:00 KO"}</span>
          </div>

          <div className="grid grid-cols-3 items-center gap-4 mt-8">
            <Link to={`/team/${home.id}`} data-testid="home-team-link" className="flex flex-col items-center text-center gap-3 group slide-in-left">
              <TeamCrest short={home.short} color={home.color} logoUrl={home.logoUrl} size={104} />
              <div className="font-display font-black uppercase tracking-tight text-xl sm:text-2xl text-white group-hover:text-[#39FF14] transition-colors">
                {home.name}
              </div>
              <FormBadges form={home.form} />
            </Link>

            <div className="text-center">
              {showScore ? (
                <div className="font-display font-black text-5xl sm:text-7xl lg:text-8xl font-mono-num text-white leading-none">
                  {homeScore} <span className="text-zinc-700">·</span> {awayScore}
                </div>
              ) : (
                <div className="font-display font-black text-4xl sm:text-5xl text-zinc-600">VS</div>
              )}
              {status === "live" && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase text-[#39FF14] tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#39FF14] live-dot" /> LIVE
                </div>
              )}
              {venue && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                  <MapPin className="w-3 h-3" /> {venue}
                </div>
              )}
            </div>

            <Link to={`/team/${away.id}`} data-testid="away-team-link" className="flex flex-col items-center text-center gap-3 group slide-in-right">
              <TeamCrest short={away.short} color={away.color} logoUrl={away.logoUrl} size={104} />
              <div className="font-display font-black uppercase tracking-tight text-xl sm:text-2xl text-white group-hover:text-[#39FF14] transition-colors">
                {away.name}
              </div>
              <FormBadges form={away.form} />
            </Link>
          </div>

          {/* Predicted strength */}
          <div className="mt-10 pt-6 border-t border-white/10">
            <div className="text-[10px] tracking-[0.22em] uppercase font-bold text-zinc-500 mb-3 text-center">
              Predicted Strength
            </div>
            <ProbabilityBar p={match.predictedStrength} />
          </div>
          </div>
        </section>

        {/* Comparison */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="surface rounded-xl p-6 fade-up" style={{ animationDelay: "100ms" }}>
            <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white mb-4">Head to Head Stats</h3>
            <div className="divide-y divide-white/5" data-testid="compare-stats">
              <CompareRow label="Rank" h={homeTeam.rank} a={awayTeam.rank} invert />
              <CompareRow label="Goals / G" h={homeTeam.goalsPerGame} a={awayTeam.goalsPerGame} />
              <CompareRow label="Conceded / G" h={homeTeam.concededPerGame} a={awayTeam.concededPerGame} invert />
              <CompareRow label="Shots / G" h={homeTeam.shotsPerGame} a={awayTeam.shotsPerGame} />
              <CompareRow label="Possession" h={homeTeam.possession} a={awayTeam.possession} suffix="%" />
              <CompareRow label="Pass Acc." h={homeTeam.passAccuracy} a={awayTeam.passAccuracy} suffix="%" />
              <CompareRow label="BTTS" h={homeTeam.btts} a={awayTeam.btts} suffix="%" />
              <CompareRow label="Over 2.5" h={homeTeam.over25} a={awayTeam.over25} suffix="%" />
            </div>
          </div>

          <div className="surface rounded-xl p-6 fade-up" style={{ animationDelay: "160ms" }}>
            <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white mb-4">Strength Radar</h3>
            <TeamRadar
              data={homeTeam.radar || radarFromStats(homeTeam)}
              name={home.name}
              color={home.color || "#39FF14"}
              secondary={awayTeam.radar || radarFromStats(awayTeam)}
              secondaryName={away.name}
            />
          </div>
        </section>

        <section className="surface rounded-xl p-6 mb-6 fade-up" style={{ animationDelay: "220ms" }}>
          <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white mb-4">Performance Comparison</h3>
          <CompareBarChart home={homeTeam} away={awayTeam} homeName={home.short} awayName={away.short} />
        </section>

        {/* AI Analysis */}
        <section
          data-testid="ai-analysis-card"
          className="relative surface rounded-xl p-7 overflow-hidden fade-up"
          style={{ animationDelay: "280ms", border: "1px solid rgba(57,255,20,0.25)", boxShadow: "0 0 40px -12px rgba(57,255,20,0.3)" }}
        >
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg neon-bg flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-black uppercase tracking-tight text-xl text-white">AI Match Analysis</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Powered by Claude Sonnet 4.5</p>
              </div>
            </div>
            {(analysis || structured) && (
              <button
                data-testid="regenerate-analysis-btn"
                onClick={() => handleAnalyze(true)}
                disabled={analyzing}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white border border-white/10 hover:border-white/25 transition-colors"
              >
                {isPro ? (
                  <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? "animate-spin" : ""}`} />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-[#39FF14]" />
                )}
                {isPro ? "Regenerate" : "Regenerate · Pro"}
              </button>
            )}
          </div>

          {!analysis && !structured && !analyzing && (
            <button
              data-testid="generate-analysis-btn"
              onClick={() => handleAnalyze(false)}
              className="px-5 py-2.5 rounded-lg neon-bg font-bold text-sm uppercase tracking-wider hover:bg-[#32E612] transition-colors"
            >
              Generate Tactical Analysis
            </button>
          )}

          {analyzing && (
            <div className="text-zinc-400 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#39FF14] live-dot" />
              Analyzing tactical matchup...
            </div>
          )}

          {structured && !analyzing && (
            <AnalysisView
              structured={structured}
              homeName={home.name}
              awayName={away.name}
              homeColor={home.color}
              awayColor={away.color}
            />
          )}

          {analysis && !structured && !analyzing && (
            <p data-testid="analysis-text" className="text-zinc-200 leading-relaxed text-[15px] whitespace-pre-line">
              {analysis}
            </p>
          )}

          {aiError && <p className="text-[#FF3B30] text-sm mt-2">{aiError}</p>}
        </section>

        <OddsView matchId={id} />

        {/* H2H */}
        <section className="mt-6 surface rounded-xl p-6">
          <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white mb-4">Head to Head History</h3>
          <div className="divide-y divide-white/5">
            {match.h2h.map((h, i) => (
              <div key={i} className="flex items-center gap-4 py-2.5 text-sm">
                <div className="text-xs text-zinc-500 font-medium w-24">{h.date}</div>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-zinc-300">{h.homeShort}</span>
                  <span className="font-mono-num font-bold text-white">{h.homeScore} - {h.awayScore}</span>
                  <span className="text-zinc-300">{h.awayShort}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
