// ========================================================
// QuantGauge — large gauge + verdict + entry timing
// ========================================================
import React from "react";

export default function QuantGauge({ score, verdict, timing, onTimingClick }) {
  const angle = (score / 100) * 180 - 90;
  const color = score >= 75 ? "#22c55e" : score >= 60 ? "#4ade80" :
                score >= 45 ? "#fbbf24" : score >= 30 ? "#f87171" : "#dc2626";

  return (
    <div style={{
      padding: "16px 16px 12px",
      background: `linear-gradient(135deg, ${color}18, rgba(0,0,0,0.4))`,
      border: `1px solid ${color}44`,
      borderRadius: 18,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 4 }}>
        🎯 QUANT SCORE
      </div>
      <svg width="180" height="95" viewBox="0 0 180 95">
        <defs>
          <linearGradient id="qGrad" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path d="M 15 85 A 75 75 0 0 1 165 85" fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round" />
        <path d="M 15 85 A 75 75 0 0 1 165 85" fill="none"
          stroke="url(#qGrad)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 236} 236`} />
        <circle cx="90" cy="85" r="5" fill={color} />
        <line x1="90" y1="85"
          x2={90 + Math.cos((angle - 90) * Math.PI / 180) * 60}
          y2={85 + Math.sin((angle - 90) * Math.PI / 180) * 60}
          stroke={color} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div style={{
        fontSize: 32, fontWeight: 800, color, marginTop: -6,
        fontFamily: "'Space Mono', monospace",
      }}>{score}</div>

      {/* Verdict + Entry Timing side-by-side */}
      <div style={{
        display: "flex", gap: 8, marginTop: 8, alignItems: "stretch",
      }}>
        <div style={{
          flex: 1, padding: "8px 6px", borderRadius: 10,
          background: `${color}1f`,
          border: `1px solid ${color}55`,
        }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", letterSpacing: 1, marginBottom: 2 }}>
            VERDICT
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color }}>{verdict}</div>
        </div>

        {timing && (
          <button
            onClick={onTimingClick}
            style={{
              flex: 1, padding: "8px 6px", borderRadius: 10,
              background: `${timing.color}1f`,
              border: `1px solid ${timing.color}55`,
              cursor: onTimingClick ? "pointer" : "default",
              textAlign: "center",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", letterSpacing: 1, marginBottom: 2 }}>
              ENTRY · {timing.grade}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: timing.color, lineHeight: 1.2 }}>
              {timing.signal}
            </div>
          </button>
        )}
      </div>

      {/* ติดดอย warning */}
      {timing?.tinaiRisk && (
        <div
          onClick={onTimingClick}
          style={{
            marginTop: 8, padding: "5px 10px", borderRadius: 8,
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
            fontSize: 10, color: "#fbbf24",
            cursor: onTimingClick ? "pointer" : "default",
          }}
        >
          ⚠️ ติดดอย risk — verdict ดี แต่ราคา stretched
        </div>
      )}
    </div>
  );
}
