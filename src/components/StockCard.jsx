// ========================================================
// StockCard — sidebar list item, shows price + verdict + grade
// ========================================================
import React from "react";
import { STOCKS } from "../constants.js";
import { fmtPrice } from "../lib/format.js";
import LoadingDots from "./LoadingDots.jsx";

export default function StockCard({ ticker, data, quant, timing, thaiGold, bitkub, loading, onSelect, isActive }) {
  const info = STOCKS[ticker];
  const change = data ? ((data.current - data.previousClose) / data.previousClose) * 100 : 0;
  const isUp = change >= 0;
  const verdictColor = quant?.verdict?.includes("Buy") ? "#4ade80" :
                       quant?.verdict?.includes("Sell") ? "#f87171" : "#fbbf24";

  return (
    <button onClick={() => onSelect(ticker)}
      style={{
        width: "100%",
        background: isActive
          ? `linear-gradient(135deg, ${info.color}22, ${info.color}08)`
          : "rgba(255,255,255,0.03)",
        border: `1.5px solid ${isActive ? info.color : "rgba(255,255,255,0.08)"}`,
        borderRadius: 18, padding: "14px 14px",
        display: "flex", alignItems: "center", gap: 12,
        cursor: "pointer", transition: "all 0.25s",
        textAlign: "left", marginBottom: 8,
      }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: `${info.color}22`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, flexShrink: 0,
        border: `1px solid ${info.color}44`,
      }}>{info.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15,
            fontFamily: "'Space Mono', monospace" }}>{ticker}</span>
          {quant && (
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 6,
              background: `${verdictColor}22`, color: verdictColor, fontWeight: 700,
            }}>{quant.verdict}</span>
          )}
          {timing && (
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 6,
              background: `${timing.color}22`,
              border: `1px solid ${timing.color}55`,
              color: timing.color, fontWeight: 800,
              fontFamily: "'Space Mono', monospace",
              letterSpacing: 0.3,
            }}>
              {timing.grade} · {(timing.signal || "").replace(/^\S+\s*/, "")}
            </span>
          )}
          {timing?.tinaiRisk && (
            <span style={{
              fontSize: 8, padding: "2px 5px", borderRadius: 5,
              background: "rgba(245,158,11,0.18)",
              border: "1px solid rgba(245,158,11,0.4)",
              color: "#fbbf24", fontWeight: 800, letterSpacing: 0.5,
              fontFamily: "'Space Mono', monospace",
            }}>RISK</span>
          )}
        </div>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 1 }}>{info.name}</div>
      </div>
      {loading ? <LoadingDots color={info.color} /> : data && (
        <div style={{ textAlign: "right" }}>
          {ticker === "GC=F" && thaiGold?.hsh?.sell ? (
            <>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#ffd700" }}>
                ฿{thaiGold.hsh.sell.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 2,
                fontFamily: "'Space Mono', monospace" }}>
                {fmtPrice(data.current, ticker)}/oz
              </div>
            </>
          ) : bitkub?.[ticker]?.last ? (
            <>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: info.color }}>
                ฿{bitkub[ticker].last.toLocaleString(undefined, { maximumFractionDigits: bitkub[ticker].last < 100 ? 4 : 0 })}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 2,
                fontFamily: "'Space Mono', monospace" }}>
                {fmtPrice(data.current, ticker)}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#fff" }}>
              {fmtPrice(data.current, ticker)}
            </div>
          )}
          <div style={{ fontSize: 10, fontFamily: "'Space Mono', monospace",
            color: isUp ? "#4ade80" : "#f87171" }}>
            {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </div>
          {quant && (
            <div style={{ fontSize: 9, color: verdictColor, marginTop: 2,
              fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
              {quant.score}/100
            </div>
          )}
        </div>
      )}
    </button>
  );
}
