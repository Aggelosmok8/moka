import React from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
  Area,
  AreaChart,
} from "recharts";

const GREEN = "#39FF14";
const ZINC = "#71717A";
const RED = "#FF3B30";

const TOOLTIP = {
  background: "#0E1110",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
  padding: "8px 10px",
  boxShadow: "0 8px 24px -8px rgba(0,0,0,0.5)",
};

// Derive a radar object from the base team stats the backend always returns.
// Used as a fallback when the payload has no `radar` object (prevents a crash
// from reading `.attack` on undefined). Values are clamped to the 0-100 domain.
const _clampRadar = (n) => Math.max(0, Math.min(100, Math.round(n)));
export const radarFromStats = (t = {}) => {
  const gpg = t.goalsPerGame ?? 1.2;
  const cpg = t.concededPerGame ?? 1.2;
  const shots = t.shotsPerGame ?? 10;
  return {
    attack: _clampRadar(gpg * 33 + shots * 2.5),
    defense: _clampRadar(100 - cpg * 33),
    possession: _clampRadar(t.possession ?? 50),
    pace: _clampRadar(shots * 6),
    discipline: _clampRadar(t.passAccuracy ?? 75),
    finishing: _clampRadar((gpg / Math.max(shots, 1)) * 500),
  };
};

export const TeamRadar = ({ data, name = "Team", color = GREEN, secondary = null, secondaryName = "" }) => {
  const d = data || {};
  const rows = [
    { stat: "Attack", a: d.attack ?? 0, b: secondary?.attack ?? 0 },
    { stat: "Defense", a: d.defense ?? 0, b: secondary?.defense ?? 0 },
    { stat: "Possession", a: d.possession ?? 0, b: secondary?.possession ?? 0 },
    { stat: "Pace", a: d.pace ?? 0, b: secondary?.pace ?? 0 },
    { stat: "Discipline", a: d.discipline ?? 0, b: secondary?.discipline ?? 0 },
    { stat: "Finishing", a: d.finishing ?? 0, b: secondary?.finishing ?? 0 },
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={rows} outerRadius="78%">
        <defs>
          <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </radialGradient>
        </defs>
        <PolarGrid stroke="rgba(255,255,255,0.08)" />
        <PolarAngleAxis dataKey="stat" tick={{ fill: "#A1A1AA", fontSize: 11, fontWeight: 700 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          name={name}
          dataKey="a"
          stroke={color}
          fill="url(#radarFill)"
          strokeWidth={2.2}
          isAnimationActive
          animationDuration={1200}
          animationEasing="ease-out"
        />
        {secondary && (
          <Radar
            name={secondaryName}
            dataKey="b"
            stroke="#FFFFFF"
            fill="#FFFFFF"
            fillOpacity={0.06}
            strokeWidth={1.8}
            strokeDasharray="4 4"
            isAnimationActive
            animationDuration={1400}
            animationBegin={150}
          />
        )}
        <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: "#fff", fontWeight: 700 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

export const FormTrendChart = ({ scored = [], conceded = [] }) => {
  const rows = scored.map((s, i) => ({ idx: i + 1, scored: s, conceded: conceded[i] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="scoredFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.45} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="concededFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RED} stopOpacity={0.35} />
            <stop offset="100%" stopColor={RED} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="idx" tick={{ fill: "#71717A", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#71717A", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={TOOLTIP} />
        <Area
          type="monotone"
          dataKey="scored"
          stroke={GREEN}
          strokeWidth={2.5}
          fill="url(#scoredFill)"
          dot={{ r: 3, fill: GREEN, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: GREEN, stroke: "#fff", strokeWidth: 1 }}
          isAnimationActive
          animationDuration={1100}
        />
        <Area
          type="monotone"
          dataKey="conceded"
          stroke={RED}
          strokeWidth={2}
          fill="url(#concededFill)"
          dot={{ r: 2.5, fill: RED, strokeWidth: 0 }}
          isAnimationActive
          animationDuration={1200}
          animationBegin={120}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "#A1A1AA" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export const CompareBarChart = ({ home, away, homeName, awayName }) => {
  const rows = [
    { stat: "Goals/G", h: home.goalsPerGame, a: away.goalsPerGame },
    { stat: "Shots/G", h: home.shotsPerGame, a: away.shotsPerGame },
    { stat: "Possess.", h: home.possession, a: away.possession },
    { stat: "Pass %", h: home.passAccuracy, a: away.passAccuracy },
    { stat: "BTTS %", h: home.btts, a: away.btts },
    { stat: "Over 2.5", h: home.over25, a: away.over25 },
  ];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 4 }} barGap={6}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#71717A", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="stat" tick={{ fill: "#A1A1AA", fontSize: 11, fontWeight: 700 }} width={78} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={TOOLTIP} />
        <Bar dataKey="h" name={homeName} fill={GREEN} radius={[0, 4, 4, 0]} isAnimationActive animationDuration={1000} />
        <Bar dataKey="a" name={awayName} fill={ZINC} radius={[0, 4, 4, 0]} isAnimationActive animationDuration={1100} animationBegin={120} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#A1A1AA" }} />
      </BarChart>
    </ResponsiveContainer>
  );
};

/** Tiny inline sparkline for stat cards. */
export const Sparkline = ({ data = [], color = GREEN, height = 36 }) => {
  if (!data.length) return null;
  const rows = data.map((v, i) => ({ i, v }));
  const gradId = `spark-${color.replace("#", "")}-${data.length}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.8} fill={`url(#${gradId})`} dot={false} isAnimationActive animationDuration={900} />
      </AreaChart>
    </ResponsiveContainer>
  );
};
