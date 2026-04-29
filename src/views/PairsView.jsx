// ========================================================
// PairsView — pairs trading scanner: spread z-score across stock pairs
// ========================================================
import React from "react";
import { STOCKS } from "../constants.js";
import { correlation, zScore } from "../lib/math.js";

export default function PairsView({ allData }) {
  const tickers = Object.keys(STOCKS).filter(t => allData[t]?.prices?.length >= 60);
  const pairs = [];
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const a = tickers[i], b = tickers[j];
      const pa = allData[a].prices, pb = allData[b].prices;
      const n = Math.min(pa.length, pb.length, 60);
      const corr = correlation(pa.slice(-n), pb.slice(-n));
      // spread (price ratio) z-score
      const ratios = [];
      for (let k = 1; k <= n; k++) ratios.push(pa[pa.length - k] / pb[pb.length - k]);
      ratios.reverse();
      const z = zScore(ratios, Math.min(30, ratios.length));
      pairs.push({ a, b, corr, z });
    }
  }
  pairs.sort((p, q) => Math.abs(q.z) - Math.abs(p.z));

  return (
    <div>
      <div style={{
        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: 12, padding: 12, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", marginBottom: 6 }}>
          🔗 Pairs Trading
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
          เทรดส่วนต่างของคู่หุ้น ถ้า spread (ratio A/B) ผิดไปจากปกติ &gt;2σ → คาดว่าจะกลับมา → Long ตัวที่ถูก / Short ตัวที่แพง
        </div>
      </div>

      {pairs.map(p => {
        const aInfo = STOCKS[p.a] || {}, bInfo = STOCKS[p.b] || {};
        const signal = Math.abs(p.z) > 2 ? "STRONG"
                     : Math.abs(p.z) > 1 ? "WATCH" : "NEUTRAL";
        const longSide = p.z > 0 ? p.b : p.a;
        const shortSide = p.z > 0 ? p.a : p.b;
        const sigColor = signal === "STRONG" ? "#4ade80"
                       : signal === "WATCH" ? "#fbbf24" : "rgba(255,255,255,0.4)";
        return (
          <div key={`${p.a}-${p.b}`} style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${signal === "STRONG" ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 12, padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: aInfo.color }}>{p.a}</span>
                <span style={{ opacity: 0.5, margin: "0 6px" }}>/</span>
                <span style={{ color: bInfo.color }}>{p.b}</span>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, color: sigColor,
                padding: "2px 8px", borderRadius: 6,
                background: `${sigColor}22`, border: `1px solid ${sigColor}55`,
              }}>{signal}</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "rgba(255,255,255,0.7)", fontFamily: "'Space Mono', monospace" }}>
              <span>corr: <b style={{ color: Math.abs(p.corr) > 0.5 ? "#a5b4fc" : "rgba(255,255,255,0.5)" }}>{p.corr.toFixed(2)}</b></span>
              <span>spread z: <b style={{ color: Math.abs(p.z) > 2 ? "#4ade80" : Math.abs(p.z) > 1 ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>
                {p.z >= 0 ? "+" : ""}{p.z.toFixed(2)}
              </b></span>
            </div>
            {signal === "STRONG" && (
              <div style={{
                marginTop: 8, padding: "6px 8px", borderRadius: 8,
                background: "rgba(74,222,128,0.08)", fontSize: 10.5, color: "rgba(255,255,255,0.85)",
              }}>
                💡 Long <b style={{ color: "#4ade80" }}>{longSide}</b> · Short <b style={{ color: "#f87171" }}>{shortSide}</b>
              </div>
            )}
          </div>
        );
      })}

      {pairs.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
          ยังไม่มีข้อมูลพอสำหรับวิเคราะห์ pairs
        </div>
      )}
    </div>
  );
}
