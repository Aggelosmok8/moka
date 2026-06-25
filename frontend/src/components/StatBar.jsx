import React from "react";

export const StatBar = ({ label, value, max = 100, suffix = "%", accent = "#39FF14", testId, delay = 0 }) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="text-white font-bold font-mono-num">
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
        <div
          className="h-full rounded-full bar-grow"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${accent} 0%, ${accent}cc 100%)`,
            boxShadow: `0 0 12px ${accent}40`,
            animationDelay: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
};

export const DualBar = ({ label, leftValue, rightValue, leftColor = "#39FF14", rightColor = "#71717A", testId, delay = 0 }) => {
  const total = leftValue + rightValue || 1;
  const leftPct = (leftValue / total) * 100;
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold font-mono-num text-white">{leftValue}%</span>
        <span className="text-[10px] tracking-[0.2em] uppercase text-zinc-500 font-bold">{label}</span>
        <span className="font-bold font-mono-num text-white">{rightValue}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex bg-white/[0.04]">
        <div
          style={{ width: `${leftPct}%`, background: leftColor, animationDelay: `${delay}ms` }}
          className="h-full bar-grow"
        />
        <div
          style={{ width: `${100 - leftPct}%`, background: rightColor, animationDelay: `${delay + 80}ms` }}
          className="h-full bar-grow"
        />
      </div>
    </div>
  );
};

export default StatBar;
