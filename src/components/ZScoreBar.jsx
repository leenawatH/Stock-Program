// ========================================================
// ZScoreBar — bar chart of 20-day Z-Scores across symbols
// ========================================================
import React from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ALL_SYMBOLS } from "../constants.js";
import { zScore } from "../lib/math.js";

export default function ZScoreBar({ allData, symbols }) {
  const data = symbols.filter(s => allData[s]?.prices).map(s => {
    const z = zScore(allData[s].prices, 20);
    return { sym: ALL_SYMBOLS[s].short || s, z: parseFloat(z.toFixed(2)) };
  });
  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, marginBottom: 10 }}>
        📊 Z-SCORE EXTREMES (20-day)
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
            <XAxis dataKey="sym" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} />
            <YAxis domain={[-3, 3]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
              axisLine={false} tickLine={false} ticks={[-2, -1, 0, 1, 2]} />
            <ReferenceLine y={2} stroke="#f87171" strokeDasharray="3 3" />
            <ReferenceLine y={-2} stroke="#4ade80" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            <Tooltip contentStyle={{ background: "rgba(10,10,18,0.95)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }} />
            <Bar dataKey="z" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={
                  d.z > 2 ? "#f87171" : d.z > 1 ? "#fbbf24" :
                  d.z < -2 ? "#4ade80" : d.z < -1 ? "#06b6d4" : "#6366f1"
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4, textAlign: "center" }}>
        {"<"}-2σ = Oversold (Buy) · {">"}+2σ = Overbought (Sell)
      </div>
    </div>
  );
}
