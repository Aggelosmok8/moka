import React from "react";

const STYLES = {
  W: "bg-[#34C759]/15 text-[#34C759] border-[#34C759]/40",
  D: "bg-[#FF9500]/15 text-[#FF9500] border-[#FF9500]/40",
  L: "bg-[#FF3B30]/15 text-[#FF3B30] border-[#FF3B30]/40",
};

export const FormBadges = ({ form = [], size = "sm" }) => {
  const dim = size === "lg" ? "w-9 h-9 text-sm" : "w-7 h-7 text-xs";
  return (
    <div className="flex items-center gap-1" data-testid="form-badges">
      {form.map((f, i) => (
        <div
          key={i}
          data-testid={`form-badge-${i}`}
          className={`${dim} ${STYLES[f] || STYLES.D} border rounded font-bold flex items-center justify-center font-mono-num`}
        >
          {f}
        </div>
      ))}
    </div>
  );
};

export default FormBadges;
