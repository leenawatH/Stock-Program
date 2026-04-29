// ========================================================
// BitkubPanel — Thai THB-quoted crypto realtime ticker card
// ========================================================
import React from "react";

export default function BitkubPanel({ ticker, info, data }) {
  if (!data) return null;
  const accent = info?.color || "#22c55e";
  const isUp = data.percentChange >= 0;
  const chgColor = isUp ? "#4ade80" : "#f87171";
  const spread = (data.ask != null && data.bid != null) ? data.ask - data.bid : null;
  const spreadPct = (spread != null && data.last) ? (spread / data.last) * 100 : null;
  const fmtNum = (n) => n == null ? "—" :
    n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2 });
  const fmtVol = (n) => {
    if (!n) return "—";
    if (n >= 1e9) return (n/1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n/1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n/1e3).toFixed(1) + "K";
    return n.toFixed(0);
  };
  return (
    <div style={{
      padding: "12px 14px",
      background: `linear-gradient(135deg, ${accent}15, rgba(0,0,0,0.4))`,
      border: `1px solid ${accent}55`,
      borderRadius: 18,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: accent, letterSpacing: 1, fontWeight: 700 }}>
          🇹🇭 Bitkub · THB_{ticker.split("-")[0]}
        </div>
        <div style={{ fontSize: 9, color: chgColor, fontWeight: 700,
          fontFamily: "'Space Mono', monospace" }}>
          {isUp ? "▲" : "▼"} {Math.abs(data.percentChange).toFixed(2)}% 24h
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: accent,
          fontFamily: "'Space Mono', monospace" }}>
          ฿{fmtNum(data.last)}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>last price</div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8,
      }}>
        <div style={{ padding: "8px 10px", background: "rgba(74,222,128,0.08)",
          border: "1px solid rgba(74,222,128,0.25)", borderRadius: 10 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>BID (รับซื้อ)</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80",
            fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
            ฿{fmtNum(data.bid)}
          </div>
        </div>
        <div style={{ padding: "8px 10px", background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10 }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)" }}>ASK (ขายออก)</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171",
            fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
            ฿{fmtNum(data.ask)}
          </div>
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8,
        fontFamily: "'Space Mono', monospace",
      }}>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>24h High</div>
          <div style={{ fontSize: 11, color: "#fff", marginTop: 2 }}>฿{fmtNum(data.high24)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>24h Low</div>
          <div style={{ fontSize: 11, color: "#fff", marginTop: 2 }}>฿{fmtNum(data.low24)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Spread</div>
          <div style={{ fontSize: 11, color: accent, marginTop: 2 }}>
            {spreadPct != null ? `${spreadPct.toFixed(3)}%` : "—"}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 8, padding: "6px 10px",
        background: "rgba(255,255,255,0.03)", borderRadius: 8,
        display: "flex", justifyContent: "space-between",
        fontFamily: "'Space Mono', monospace", fontSize: 10,
      }}>
        <span style={{ color: "rgba(255,255,255,0.5)" }}>
          Vol: <span style={{ color: "#fff" }}>{fmtVol(data.baseVolume)}</span> {ticker.split("-")[0]}
        </span>
        <span style={{ color: "rgba(255,255,255,0.5)" }}>
          ≈ <span style={{ color: "#fff" }}>฿{fmtVol(data.quoteVolume)}</span>
        </span>
      </div>
    </div>
  );
}
