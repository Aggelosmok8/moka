import React from "react";
import { Sparkles, TrendingUp, Shield, Sword, Check, X, Target } from "lucide-react";

const Bullet = ({ children, positive = true }) => {
  const Icon = positive ? Check : X;
  return (
    <li className="flex items-start gap-2 text-sm text-zinc-300 leading-snug">
      <span
        className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 ${
          positive ? "bg-[#34C759]/15 text-[#34C759]" : "bg-[#FF3B30]/15 text-[#FF3B30]"
        }`}
      >
        <Icon className="w-3 h-3" strokeWidth={3} />
      </span>
      <span>{children}</span>
    </li>
  );
};

const ScoutColumn = ({ name, color, strengths = [], weaknesses = [], align = "left" }) => (
  <div className={align === "right" ? "text-left" : "text-left"}>
    <div className="flex items-center gap-2 mb-3">
      <span
        className="w-2 h-6 rounded-sm"
        style={{ background: `linear-gradient(180deg, ${color}, ${color}66)` }}
      />
      <h4 className="font-display font-bold uppercase tracking-tight text-base text-white">{name}</h4>
    </div>

    {strengths.length > 0 && (
      <>
        <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-zinc-500 mb-2">Strengths</div>
        <ul className="space-y-1.5 mb-4">
          {strengths.map((s, i) => (
            <Bullet key={`s-${i}`} positive>{s}</Bullet>
          ))}
        </ul>
      </>
    )}

    {weaknesses.length > 0 && (
      <>
        <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-zinc-500 mb-2">Weaknesses</div>
        <ul className="space-y-1.5">
          {weaknesses.map((w, i) => (
            <Bullet key={`w-${i}`} positive={false}>{w}</Bullet>
          ))}
        </ul>
      </>
    )}
  </div>
);

const Section = ({ icon: Icon, title, children, accent = "#39FF14" }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center"
        style={{ background: `${accent}14`, color: accent, border: `1px solid ${accent}30` }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <h4 className="font-display font-bold uppercase tracking-tight text-base text-white">{title}</h4>
    </div>
    <p className="text-[15px] text-zinc-300 leading-relaxed">{children}</p>
  </div>
);

export const AnalysisView = ({ structured, homeName, awayName, homeColor = "#39FF14", awayColor = "#FFFFFF" }) => {
  if (!structured) return null;
  return (
    <div className="space-y-7" data-testid="structured-analysis">
      {/* Insight pill */}
      {structured.insight && (
        <div className="flex items-start gap-3 rounded-lg p-4 bg-[#39FF14]/[0.06] border border-[#39FF14]/25">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 neon-bg">
            <Target className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.22em] uppercase font-bold text-[#39FF14] mb-1">
              Betting-Style Insight
            </div>
            <p data-testid="analysis-insight" className="text-white font-display font-semibold text-lg leading-snug">
              {structured.insight}
            </p>
          </div>
        </div>
      )}

      {/* Strengths / Weaknesses two-column */}
      {(structured.home?.strengths?.length || structured.away?.strengths?.length) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div data-testid="scout-home" className="rounded-lg border border-white/5 bg-white/[0.02] p-5">
            <ScoutColumn
              name={homeName}
              color={homeColor}
              strengths={structured.home?.strengths || []}
              weaknesses={structured.home?.weaknesses || []}
            />
          </div>
          <div data-testid="scout-away" className="rounded-lg border border-white/5 bg-white/[0.02] p-5">
            <ScoutColumn
              name={awayName}
              color={awayColor}
              strengths={structured.away?.strengths || []}
              weaknesses={structured.away?.weaknesses || []}
              align="right"
            />
          </div>
        </div>
      )}

      {/* Attacking + Defensive */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {structured.attacking && (
          <div data-testid="analysis-attacking" className="rounded-lg border border-white/5 bg-white/[0.02] p-5">
            <Section icon={Sword} title="Attacking" accent="#39FF14">
              {structured.attacking}
            </Section>
          </div>
        )}
        {structured.defensive && (
          <div data-testid="analysis-defensive" className="rounded-lg border border-white/5 bg-white/[0.02] p-5">
            <Section icon={Shield} title="Defensive" accent="#FF9500">
              {structured.defensive}
            </Section>
          </div>
        )}
      </div>

      {/* Prediction */}
      {structured.prediction && (
        <div className="flex items-start gap-3 rounded-lg p-4 bg-white/[0.03] border border-white/10">
          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-white/5 text-zinc-300">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.22em] uppercase font-bold text-zinc-500 mb-1">Prediction</div>
            <p data-testid="analysis-prediction" className="text-zinc-100 text-[15px] leading-snug font-medium">
              {structured.prediction}
            </p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-zinc-600 italic leading-relaxed">
        Stat-based analysis. For information only — not betting advice.
      </p>
    </div>
  );
};

export default AnalysisView;
