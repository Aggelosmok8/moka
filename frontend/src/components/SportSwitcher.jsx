import React from "react";
import { SPORTS } from "../lib/sportsCatalog";

// Football / Basketball toggle. Shared across the app.
export default function SportSwitcher({ sport, onChange }) {
  return (
    <div
      className="inline-flex p-1 rounded-xl bg-[#161b22] border border-[#30363d]"
      data-testid="sport-switcher"
    >
      {SPORTS.map((s) => {
        const active = sport === s.key;
        return (
          <button
            key={s.key}
            data-testid={`sport-${s.key}`}
            onClick={() => onChange(s.key)}
            className={`px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-all flex items-center gap-2 ${
              active ? "bg-[#39FF14] text-black" : "text-zinc-400 hover:text-white"
            }`}
          >
            <span aria-hidden>{s.icon}</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
