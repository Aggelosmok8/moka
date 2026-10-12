import { Clock } from "lucide-react";

// Bookmaker prices come from a shared snapshot, not a live ticker, so they can
// drift from the book's own page. Saying when they were taken - and that the
// book's page is the truth - is what keeps the numbers trustworthy.
export const PriceStamp = ({ at, className = "" }) => {
  if (!at) return null;
  const when = new Date(at * 1000);
  const mins = Math.max(0, Math.round((Date.now() - when.getTime()) / 60000));
  const ago = mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)}h ago`;
  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-zinc-500 ${className}`}
      data-testid="price-stamp">
      <Clock className="w-3 h-3" />
      <span>
        Prices taken {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ({ago}) —
        always confirm the live price at the bookmaker before you place the bet.
      </span>
    </div>
  );
};
