import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Header from "../components/Header";
import TeamCrest from "../components/TeamCrest";
import FormBadges from "../components/FormBadges";
import { StatBar, DualBar } from "../components/StatBar";
import { TeamRadar, FormTrendChart, radarFromStats } from "../components/Charts";
import StatCard from "../components/StatCard";
import { fetchTeam } from "../lib/api";
import { ArrowLeft, Target, Shield, Activity, Zap, Goal, Hand } from "lucide-react";

const RecentMatchRow = ({ m, teamId }) => {
  const isHome = m.home === teamId;
  const teamScore = isHome ? m.homeScore : m.awayScore;
  const oppScore = isHome ? m.awayScore : m.homeScore;
  const result = teamScore > oppScore ? "W" : teamScore < oppScore ? "L" : "D";
  const resStyles = {
    W: "text-[#34C759] bg-[#34C759]/12 border-[#34C759]/30",
    D: "text-[#FF9500] bg-[#FF9500]/12 border-[#FF9500]/30",
    L: "text-[#FF3B30] bg-[#FF3B30]/12 border-[#FF3B30]/30",
  };
  return (
    <div className="flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-white/[0.04] transition-colors">
      <div className={`w-7 h-7 rounded-md border font-bold text-xs flex items-center justify-center ${resStyles[result]}`}>
        {result}
      </div>
      <div className="text-xs text-zinc-500 font-medium w-20 hidden sm:block">{m.date}</div>
      <div className="flex-1 flex items-center gap-2 text-sm">
        <span className={`${isHome ? "text-white font-semibold" : "text-zinc-400"}`}>{m.homeName}</span>
        <span className="font-mono-num font-bold text-white px-2 py-0.5 rounded bg-white/[0.04] border border-white/5">
          {m.homeScore} - {m.awayScore}
        </span>
        <span className={`${!isHome ? "text-white font-semibold" : "text-zinc-400"}`}>{m.awayName}</span>
      </div>
      <span className="text-[10px] tracking-[0.18em] uppercase font-bold text-zinc-600">{m.competition}</span>
    </div>
  );
};

export default function TeamPage() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTeam(id).then(setTeam).catch(() => setTeam(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-7xl mx-auto p-8 animate-pulse space-y-4">
          <div className="h-36 surface rounded-2xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 surface rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }
  if (!team) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-7xl mx-auto p-8 text-center text-zinc-400">Team not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <Link to="/" data-testid="back-link" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        {/* Hero */}
        <section
          data-testid="team-hero"
          className="relative surface rounded-2xl overflow-hidden p-6 lg:p-10 mb-8 fade-up"
          style={{
            backgroundImage: `radial-gradient(ellipse 80% 80% at top left, ${team.color}33 0%, transparent 55%)`,
          }}
        >
          <div className="absolute inset-0 pitch-lines opacity-30 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <TeamCrest short={team.short} color={team.color} logoUrl={team.logoUrl} size={112} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] tracking-[0.22em] uppercase font-bold text-[#39FF14] mb-2">
                #{team.rank} · {team.leagueName}
              </div>
              <h1 className="font-display font-black uppercase tracking-tight text-4xl sm:text-5xl lg:text-6xl text-white leading-none">
                {team.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-5">
                <div>
                  <span className="text-zinc-500 uppercase text-[10px] tracking-[0.2em] font-bold block mb-1">Points</span>
                  <span className="font-display font-black text-2xl text-white font-mono-num">{team.points}</span>
                </div>
                <div>
                  <span className="text-zinc-500 uppercase text-[10px] tracking-[0.2em] font-bold block mb-1">W-D-L</span>
                  <span className="font-display font-bold text-xl text-white font-mono-num">{team.wins}-{team.draws}-{team.losses}</span>
                </div>
                <div>
                  <span className="text-zinc-500 uppercase text-[10px] tracking-[0.2em] font-bold block mb-1">Goal Diff</span>
                  <span className={`font-display font-bold text-xl font-mono-num ${team.goalDiff >= 0 ? "text-[#39FF14]" : "text-[#FF3B30]"}`}>
                    {team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 uppercase text-[10px] tracking-[0.2em] font-bold block mb-1">Played</span>
                  <span className="font-display font-bold text-xl text-white font-mono-num">{team.matchesPlayed}</span>
                </div>
              </div>
            </div>
            <div className="sm:ml-auto">
              <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-2">Recent Form</div>
              <FormBadges form={team.form} size="lg" />
            </div>
          </div>
        </section>

        {/* Stat cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mb-10" data-testid="team-stats-grid">
          <StatCard icon={Target} label="Goals / Game" value={team.goalsPerGame} decimals={2} sub={`${team.goalsScored} total scored`} spark={team.trendGoals} accent="#39FF14" delay={0} />
          <StatCard icon={Shield} label="Conceded / Game" value={team.concededPerGame} decimals={2} sub={`${team.goalsConceded} total conceded`} spark={team.trendConceded} accent="#FF3B30" delay={80} />
          <StatCard icon={Activity} label="Shots / Game" value={team.shotsPerGame} decimals={1} sub={`${team.shotsOnTargetPerGame} on target`} spark={(team.trendGoals || []).map(v => v + 8)} accent="#FF9500" delay={160} />
          <StatCard icon={Zap} label="Possession" value={team.possession} suffix="%" sub={`${team.passAccuracy}% pass acc.`} accent="#39FF14" delay={240} />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="surface rounded-xl p-6 fade-up" style={{ animationDelay: "120ms" }}>
            <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white mb-1">Performance Radar</h3>
            <p className="text-xs text-zinc-500 mb-4">Normalised across the top 5 leagues</p>
            <TeamRadar data={team.radar || radarFromStats(team)} name={team.name} color={team.color || "#39FF14"} />
          </div>

          <div className="surface rounded-xl p-6 fade-up" style={{ animationDelay: "180ms" }}>
            <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white mb-1">Goals · Last 10</h3>
            <p className="text-xs text-zinc-500 mb-4">
              <span className="text-[#39FF14] font-bold">Scored</span> vs <span className="text-[#FF3B30] font-bold">Conceded</span>
            </p>
            <FormTrendChart scored={team.trendGoals} conceded={team.trendConceded} />
          </div>
        </section>

        {/* Bars */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <div className="surface rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Goal className="w-5 h-5 text-[#39FF14]" />
              <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white">Goal Markets</h3>
            </div>
            <DualBar label="Over 2.5 / Under 2.5" leftValue={team.over25} rightValue={team.under25} testId="over-under-bar" delay={120} />
            <StatBar label="Both Teams to Score" value={team.btts} accent="#39FF14" testId="btts-bar" delay={220} />
            <StatBar label="Clean Sheets" value={team.cleanSheetsPct} accent="#34C759" testId="clean-sheets-bar" delay={320} />
          </div>

          <div className="surface rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Hand className="w-5 h-5 text-[#39FF14]" />
              <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white">Match Profile</h3>
            </div>
            <StatBar label="Possession" value={team.possession} accent="#39FF14" testId="possession-bar" delay={120} />
            <StatBar label="Pass Accuracy" value={team.passAccuracy} accent="#34C759" testId="pass-bar" delay={220} />
            <StatBar label="Corners / G" value={team.cornersPerGame} max={10} suffix="" accent="#FF9500" testId="corners-bar" delay={320} />
            <StatBar label="Yellows / G" value={team.yellowsPerGame} max={5} suffix="" accent="#FF3B30" testId="yellows-bar" delay={420} />
          </div>
        </section>

        {/* Recent matches */}
        <section className="surface rounded-xl p-6" data-testid="recent-matches-section">
          <h3 className="font-display font-bold uppercase tracking-tight text-lg text-white mb-4">Recent Matches</h3>
          <div className="divide-y divide-white/5">
            {(team.recentMatches || []).map((m) => (
              <RecentMatchRow key={m.id} m={m} teamId={team.id} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
