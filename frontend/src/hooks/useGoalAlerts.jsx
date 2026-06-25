import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Watches the trending matches list and fires toast notifications when a live match's
 * score increments between polls. Returns nothing — used for its side effect only.
 */
export const useGoalAlerts = (matches) => {
  const prevRef = useRef({});
  const seededRef = useRef(false);

  useEffect(() => {
    if (!matches || !matches.length) return;
    const next = {};
    for (const m of matches) {
      next[m.id] = {
        status: m.status,
        home: m.homeScore ?? 0,
        away: m.awayScore ?? 0,
        homeName: m.home?.name || "Home",
        awayName: m.away?.name || "Away",
        homeShort: m.home?.short || "H",
        awayShort: m.away?.short || "A",
        homeLogo: m.home?.logoUrl,
        awayLogo: m.away?.logoUrl,
        leagueName: m.leagueName,
      };
    }

    // Skip alerts on the very first poll — only fire on subsequent diffs.
    if (!seededRef.current) {
      prevRef.current = next;
      seededRef.current = true;
      return;
    }

    for (const id of Object.keys(next)) {
      const cur = next[id];
      const prev = prevRef.current[id];
      if (!prev) continue;
      if (cur.status !== "live" && prev.status !== "live") continue;

      const homeScored = cur.home > prev.home;
      const awayScored = cur.away > prev.away;
      if (!homeScored && !awayScored) continue;

      const scorerName = homeScored ? cur.homeName : cur.awayName;
      const scorerLogo = homeScored ? cur.homeLogo : cur.awayLogo;

      toast.custom(
        () => (
          <div
            data-testid="goal-toast"
            className="flex items-center gap-3 rounded-lg p-3 pr-4 bg-[#0E1110] border border-[#39FF14]/40 shadow-[0_0_36px_-12px_rgba(57,255,20,0.5)] min-w-[280px]"
          >
            <div className="w-10 h-10 rounded-md bg-[#39FF14]/15 border border-[#39FF14]/30 flex items-center justify-center">
              {scorerLogo ? (
                <img src={scorerLogo} alt="" className="w-6 h-6 object-contain" />
              ) : (
                <span className="text-[#39FF14] font-display font-black text-lg">⚽</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.22em] uppercase font-bold text-[#39FF14]">
                Goal · {cur.leagueName}
              </div>
              <div className="text-white font-display font-bold leading-tight">
                {scorerName} scores!
              </div>
              <div className="text-xs text-zinc-400 font-mono-num mt-0.5">
                {cur.homeShort} {cur.home} - {cur.away} {cur.awayShort}
              </div>
            </div>
          </div>
        ),
        { duration: 6000 }
      );
    }
    prevRef.current = next;
  }, [matches]);
};

export default useGoalAlerts;
