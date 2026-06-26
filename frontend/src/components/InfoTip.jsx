import React, { useState } from "react";
import { Info } from "lucide-react";

// Lightweight, dependency-free tooltip for explaining metrics to beginners.
export default function InfoTip({ text, label }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-1">
      {label}
      <button
        type="button"
        aria-label="More info"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="text-zinc-500 hover:text-[#39FF14] transition-colors"
      >
        <Info className="w-3 h-3" />
      </button>
      {open && (
        <span className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 rounded-lg bg-[#0E1110] border border-white/10 px-3 py-2 text-[11px] leading-snug text-zinc-300 shadow-xl normal-case font-normal tracking-normal">
          {text}
        </span>
      )}
    </span>
  );
}
