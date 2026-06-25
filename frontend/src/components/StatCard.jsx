import React from "react";
import { Sparkline } from "./Charts";
import CountUp from "./CountUp";

/**
 * Premium stat card with animated number + optional sparkline.
 */
export const StatCard = ({ icon: Icon, label, value, sub, accent = "#39FF14", spark = null, decimals = 0, suffix = "", delay = 0 }) => {
  return (
    <div
      className="surface surface-hover lift rounded-xl p-5 fade-up relative overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* corner accent glow */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-2xl"
        style={{ background: accent }}
      />
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-[10px] tracking-[0.22em] uppercase font-bold text-zinc-500">{label}</span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${accent}14`, color: accent, border: `1px solid ${accent}30` }}
          >
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <CountUp value={Number(value) || 0} decimals={decimals} suffix={suffix} className="font-display font-black text-3xl sm:text-4xl text-white leading-none" />
        {spark && (
          <div className="w-20 h-9 shrink-0 opacity-90">
            <Sparkline data={spark} color={accent} height={36} />
          </div>
        )}
      </div>
      {sub && <div className="relative text-xs text-zinc-500 mt-3 font-medium">{sub}</div>}
    </div>
  );
};

export default StatCard;
