import React, { useState } from "react";

/**
 * TeamCrest: shows real club logo with elegant fallback to a colored
 * gradient short-code crest if the image fails (e.g. CDN block, offline).
 */
export const TeamCrest = ({ short, color = "#222", logoUrl, size = 40, className = "" }) => {
  const [failed, setFailed] = useState(false);
  const showImage = logoUrl && !failed;

  if (showImage) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 70%)",
          borderRadius: 10,
          padding: size * 0.08,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <img
          src={logoUrl}
          alt={short}
          onError={() => setFailed(true)}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-md font-display font-bold uppercase tracking-tight shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color} 0%, rgba(0,0,0,0.6) 100%)`,
        color: "#fff",
        fontSize: size * 0.34,
        border: "1px solid rgba(255,255,255,0.12)",
        textShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      {short}
    </div>
  );
};

export default TeamCrest;
