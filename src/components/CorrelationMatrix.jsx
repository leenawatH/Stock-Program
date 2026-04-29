// ========================================================
// CorrelationMatrix — 60-day rolling correlation grid
// ========================================================
import React from "react";
import { ALL_SYMBOLS } from "../constants.js";
import { correlation } from "../lib/math.js";

export default function CorrelationMatrix({ allData }) {
  const symbols = Object.keys(ALL_SYMBOLS);
  const matrix = symbols.map(a =>
    symbols.map(b => {
      if (!allData[a]?.prices || !allData[b]?.prices) return null;
      const len = Math.min(60, allData[a].prices.length, allData[b].prices.length);
      return correlation(allData[a].prices.slice(-len), allData[b].prices.slice(-len));
    })
  );

  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, marginBottom: 10 }}>
        🔗 CORRELATION MATRIX (60-day)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `36px repeat(${symbols.length}, 1fr)`,
        gap: 2, fontSize: 9, fontFamily: "'Space Mono', monospace" }}>
        <div />
        {symbols.map(s => (
          <div key={s} style={{ textAlign: "center", color: "rgba(255,255,255,0.5)",
            fontWeight: 700, padding: 2 }}>
            {ALL_SYMBOLS[s].short || s.slice(0, 4)}
          </div>
        ))}
        {matrix.map((row, i) => (
          <React.Fragment key={`row-${i}`}>
            <div style={{ color: "rgba(255,255,255,0.5)",
              fontWeight: 700, padding: 2, display: "flex", alignItems: "center" }}>
              {ALL_SYMBOLS[symbols[i]].short || symbols[i].slice(0, 4)}
            </div>
            {row.map((v, j) => {
              if (v === null) return <div key={j} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 4 }} />;
              const intensity = Math.abs(v);
              const color = v > 0 ? `rgba(74,222,128,${intensity * 0.7 + 0.15})` :
                                    `rgba(248,113,113,${intensity * 0.7 + 0.15})`;
              return (
                <div key={j} style={{
                  background: i === j ? "rgba(255,255,255,0.1)" : color,
                  borderRadius: 4, padding: "6px 2px",
                  textAlign: "center", color: "#fff",
                  fontWeight: 700, fontSize: 9,
                }}>
                  {i === j ? "—" : v.toFixed(2)}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center",
        gap: 8, fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
        <span style={{ width: 12, height: 12, background: "rgba(248,113,113,0.7)", borderRadius: 2 }} />
        <span>-1 (Inverse)</span>
        <span style={{ width: 12, height: 12, background: "rgba(255,255,255,0.1)", borderRadius: 2 }} />
        <span>0</span>
        <span style={{ width: 12, height: 12, background: "rgba(74,222,128,0.7)", borderRadius: 2 }} />
        <span>+1 (Same)</span>
      </div>
    </div>
  );
}
