import React from "react";
import { Star, Check } from "lucide-react";
import { toast } from "sonner";
import { useChart } from "../contexts/ChartContext";

export default function AddToChartButton({ entry, className = "" }) {
  const { add, remove, has, count, max } = useChart();
  const id = entry?.match?.id;
  const active = id ? has(id) : false;

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) {
      remove(id);
      toast("Removed from watchlist");
      return;
    }
    if (count >= max) {
      toast.error(`Watchlist is full (max ${max} matches)`);
      return;
    }
    add(entry);
    toast.success("Added to watchlist");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`add-to-chart-${id}`}
      title={active ? "Remove from watchlist" : "Add to watchlist"}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
        active
          ? "bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30"
          : "bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 hover:text-white"
      } ${className}`}
    >
      {active ? <Check className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
      {active ? "Saved" : "Add to Watchlist"}
    </button>
  );
}
