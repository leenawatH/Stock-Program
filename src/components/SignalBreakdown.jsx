// ========================================================
// SignalBreakdown — list of all quant sub-signals with values
// ========================================================
import React from "react";

export default function SignalBreakdown({ quant }) {
  if (!quant?.signals) return null;
  return (
    <div style={{
      padding: "4px 14px 14px", borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, padding: "14px 0 6px" }}>
        📋 SIGNAL BREAKDOWN
      </div>
      {quant.signals.map((s, i) => {
        const color = s.type === "bull" ? "#4ade80" :
                      s.type === "bear" ? "#f87171" : "#94a3b8";
        return (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{s.sig}</div>
            </div>
            <div style={{
              fontSize: 11, fontFamily: "'Space Mono', monospace",
              color, fontWeight: 700, textAlign: "right",
              padding: "4px 10px", borderRadius: 8, background: `${color}15`,
            }}>{s.value}</div>
          </div>
        );
      })}
    </div>
  );
}
