import React from "react";
import { BarChart3, Check } from "lucide-react";
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
      toast("Removed from chart");
      return;
    }
    if (count >= max) {
      toast.error(`Comparison chart is full (max ${max} matches)`);
      return;
    }
    add(entry);
    toast.success("Added to comparison chart");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`add-to-chart-${id}`}
      title={active ? "Remove from comparison chart" : "Add to comparison chart"}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
        active
          ? "bg-[#39FF14]/15 text-[#39FF14] border border-[#39FF14]/30"
          : "bg-white/5 text-zinc-300 border border-white/10 hover:bg-white/10 hover:text-white"
      } ${className}`}
    >
      {active ? <Check className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
      {active ? "Added" : "Add to Chart"}
    </button>
  );
}
