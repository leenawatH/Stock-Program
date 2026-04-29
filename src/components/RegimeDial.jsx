// ========================================================
// RegimeDial — gauge showing market regime score
// ========================================================
import React from "react";

export default function RegimeDial({ regime }) {
  if (!regime) return null;
  const angle = (regime.score / 100) * 180 - 90;
  const color = regime.score >= 70 ? "#22c55e" : regime.score >= 55 ? "#4ade80" :
                regime.score >= 45 ? "#fbbf24" : regime.score >= 30 ? "#f87171" : "#dc2626";

  return (
    <div style={{
      padding: "14px 16px 10px",
      background: `linear-gradient(135deg, ${color}18, rgba(0,0,0,0.4))`,
      border: `1px solid ${color}44`,
      borderRadius: 18,
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 4 }}>
        🌡️ MARKET REGIME
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="100" height="60" viewBox="0 0 100 60">
          <defs>
            <linearGradient id="regGrad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#dc2626" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none"
            stroke="url(#regGrad)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${(regime.score / 100) * 125} 125`} />
          <circle cx="50" cy="50" r="3" fill={color} />
          <line x1="50" y1="50"
            x2={50 + Math.cos((angle - 90) * Math.PI / 180) * 32}
            y2={50 + Math.sin((angle - 90) * Math.PI / 180) * 32}
            stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>
            {regime.regime}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4,
            fontFamily: "'Space Mono', monospace" }}>
            Score: {regime.score}/100 · Vol: {regime.volatility}%
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {regime.signals.slice(0, 3).map((s, i) => (
          <span key={i} style={{
            fontSize: 9, padding: "3px 7px", borderRadius: 6,
            background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
          }}>{s}</span>
        ))}
      </div>
    </div>
  );
}
