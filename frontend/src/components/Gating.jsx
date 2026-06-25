import React from "react";
import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";

// Shared FREE/PRO gating UI primitives.

export const ProBadge = ({ className = "" }) => (
  <span
    data-testid="pro-badge"
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[#39FF14] text-black ${className}`}
  >
    <Sparkles className="w-2.5 h-2.5" /> Pro
  </span>
);

export const LockedBadge = ({ className = "" }) => (
  <span
    data-testid="locked-badge"
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-white/10 text-zinc-300 border border-white/10 ${className}`}
  >
    <Lock className="w-2.5 h-2.5" /> Pro
  </span>
);

export const UpgradeButton = ({ size = "md", label = "Upgrade to Pro", testId = "upgrade-cta" }) => (
  <Link
    to="/pricing"
    data-testid={testId}
    className={`inline-flex items-center gap-2 rounded-md bg-[#39FF14] text-black font-bold uppercase tracking-wider hover:bg-[#5cff4a] transition-colors ${
      size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
    }`}
  >
    <Sparkles className="w-4 h-4" /> {label}
  </Link>
);
