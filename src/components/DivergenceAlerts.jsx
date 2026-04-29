// ========================================================
// DivergenceAlerts — list of out/underperformance vs benchmarks
// ========================================================
import React from "react";

export default function DivergenceAlerts({ quant, ticker }) {
  if (!quant?.divergences?.length) return null;
  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(251,191,36,0.08)",
      border: "1px solid rgba(251,191,36,0.3)",
    }}>
      <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 1, marginBottom: 8 }}>
        🚨 DIVERGENCE ALERTS · {ticker}
      </div>
      {quant.divergences.map((d, i) => {
        const icon = d.type === "outperform" ? "📈" : "📉";
        const color = d.type === "outperform" ? "#4ade80" : "#f87171";
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 0",
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                {d.type === "outperform" ? "Outperforming" : "Underperforming"} {d.vs}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
                fontFamily: "'Space Mono', monospace" }}>
                Δ {d.magnitude}% · {d.sigma}σ · {d.severity}
              </div>
            </div>
            <span style={{
              fontSize: 9, padding: "3px 8px", borderRadius: 6,
              background: `${color}22`, color,
            }}>{d.severity.toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}
