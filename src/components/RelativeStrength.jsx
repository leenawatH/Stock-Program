// ========================================================
// RelativeStrength — bars showing 30-day return vs SPY
// ========================================================
import React from "react";
import { percentChange } from "../lib/math.js";

export default function RelativeStrength({ allData, tickers }) {
  const spy = allData["SPY"];
  if (!spy) return null;
  const spyRet = percentChange(spy.prices, 30);

  const data = tickers.filter(t => allData[t]?.prices).map(t => {
    const ret = percentChange(allData[t].prices, 30);
    return { ticker: t, ret: parseFloat(ret.toFixed(2)), vs: parseFloat((ret - spyRet).toFixed(2)) };
  });

  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, marginBottom: 10 }}>
        💪 RELATIVE STRENGTH vs SPY (30d)
      </div>
      {data.map(d => {
        const pct = Math.min(100, Math.max(0, d.vs * 5 + 50));
        const color = d.vs > 3 ? "#4ade80" : d.vs < -3 ? "#f87171" : "#fbbf24";
        return (
          <div key={d.ticker} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{d.ticker}</span>
              <span style={{ color, fontFamily: "'Space Mono', monospace" }}>
                {d.vs > 0 ? "+" : ""}{d.vs}% vs SPY
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)",
              position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0,
                width: 1, background: "rgba(255,255,255,0.3)", zIndex: 2 }} />
              <div style={{
                position: "absolute",
                left: d.vs >= 0 ? "50%" : `${pct}%`,
                width: `${Math.abs(d.vs * 5)}%`,
                maxWidth: "50%",
                height: "100%", background: color, borderRadius: 99,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
