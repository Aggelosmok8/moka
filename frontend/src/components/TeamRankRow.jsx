import React from "react";
import { Link } from "react-router-dom";
import TeamCrest from "./TeamCrest";
import FormBadges from "./FormBadges";

export const TeamRankRow = ({ team, idx }) => {
  const isTop3 = idx < 3;
  return (
    <Link
      to={`/team/${team.id}`}
      data-testid={`team-row-${team.id}`}
      className="flex items-center gap-3.5 px-3 py-3 rounded-lg hover:bg-white/[0.04] transition-colors duration-200 group"
      style={{ animationDelay: `${idx * 35}ms` }}
    >
      <div
        className={`w-7 text-center font-display font-black text-sm font-mono-num ${
          isTop3 ? "text-[#39FF14]" : "text-zinc-500 group-hover:text-white"
        }`}
      >
        {idx + 1}
      </div>
      <TeamCrest short={team.short} color={team.color} logoUrl={team.logoUrl} size={36} />
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm sm:text-base text-white truncate">{team.name}</div>
        <div className="text-[10px] tracking-[0.18em] uppercase text-zinc-500 font-bold mt-0.5">
          {team.leagueName} · GD {team.goalDiff >= 0 ? `+${team.goalDiff}` : team.goalDiff}
        </div>
      </div>
      <div className="hidden md:block">
        <FormBadges form={team.form} />
      </div>
      <div className="text-right pl-2">
        <div className="font-display font-black text-base sm:text-lg text-white font-mono-num">{team.points}</div>
        <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">PTS</div>
      </div>
    </Link>
  );
};

export default TeamRankRow;
