import { AlertTriangle } from "lucide-react";

// Prices are a snapshot taken when we computed the value, NOT a live ticker.
// The bookmaker's own page is always the truth, so say so loudly: a user who
// finds a different number must know why before they doubt the whole product.
export const PriceStamp = ({ at, className = "" }) => {
  const when = at ? new Date(at * 1000) : null;
  const mins = when ? Math.max(0, Math.round((Date.now() - when.getTime()) / 60000)) : null;
  const ago = mins == null ? "" : mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;
  return (
    <div
      className={`rounded-xl border border-[#FFD60A]/40 bg-[#FFD60A]/[0.08] px-3 py-2.5 flex items-start gap-2.5 ${className}`}
      data-testid="price-stamp"
    >
      <AlertTriangle className="w-4 h-4 text-[#FFD60A] shrink-0 mt-px" />
      <div className="text-xs leading-relaxed">
        <span className="font-black uppercase tracking-wider text-[#FFD60A]">
          Prices move — these are a snapshot
        </span>
        <span className="text-zinc-300">
          {when
            ? `, taken ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (${ago}) when we calculated the value.`
            : " taken when we calculated the value."}{" "}
          The bookmaker may show a different number by now — <b className="text-white">always check the
          live price on their page before you place the bet</b>. Our value and edge are based on the
          price shown here.
        </span>
      </div>
    </div>
  );
};
