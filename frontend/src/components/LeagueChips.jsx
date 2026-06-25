import React from "react";
import { Lock } from "lucide-react";

const chipClass = (active) =>
  `px-3 py-1.5 rounded-full border text-[12px] transition-all inline-flex items-center gap-1.5 ${
    active
      ? "bg-[#39FF14] border-[#39FF14] text-black font-bold"
      : "border-[#30363d] bg-[#161b22] text-zinc-400 hover:border-[#39FF14] hover:text-zinc-100"
  }`;

// League filter chips. PRO-only leagues the caller cannot access are rendered
// locked (lock icon, disabled, not clickable).
export default function LeagueChips({ leagues, selected, onSelect, lockedIds }) {
  return (
    <div className="flex gap-2 flex-wrap items-center" data-testid="league-chips">
      <button onClick={() => onSelect(null)} data-testid="league-all" className={chipClass(selected === null)}>
        All
      </button>
      {leagues.map((l) => {
        const locked = lockedIds.has(l.id);
        return (
          <button
            key={l.id}
            data-testid={`league-${l.id}`}
            disabled={locked}
            aria-disabled={locked}
            onClick={() => !locked && onSelect(l.id)}
            title={locked ? "Upgrade to Pro to access this league" : l.name}
            className={`${chipClass(selected === l.id)} ${locked ? "opacity-50 cursor-not-allowed hover:border-[#30363d] hover:text-zinc-400" : ""}`}
          >
            {l.name}
            {locked && <Lock className="w-3 h-3" />}
          </button>
        );
      })}
    </div>
  );
}
