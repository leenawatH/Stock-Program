// ========================================================
// ThaiGoldPanel — Hua Seng Heng buy/sell + change
// ========================================================
import React from "react";

export default function ThaiGoldPanel({ data }) {
  if (!data) return null;
  const fmtChange = (n) => {
    if (n == null) return null;
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toLocaleString()}`;
  };
  const Row = ({ label, sub, row, accent, highlight }) => {
    if (!row) return null;
    const spread = (row.sell != null && row.buy != null) ? row.sell - row.buy : null;
    const chgColor = row.sellChange > 0 ? "#4ade80" : row.sellChange < 0 ? "#f87171" : "rgba(255,255,255,0.45)";
    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "1.1fr 1fr 1fr",
        gap: 10, padding: "10px 12px",
        background: highlight ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${accent}${highlight ? "66" : "33"}`,
        borderRadius: 12, marginTop: 6,
      }}>
        <div>
          <div style={{ fontSize: 10, color: highlight ? accent : "rgba(255,255,255,0.7)",
            letterSpacing: 0.5, fontWeight: highlight ? 800 : 600 }}>
            {label}
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>
          {spread != null && (
            <div style={{ fontSize: 9, color: accent, marginTop: 2, fontWeight: 700,
              fontFamily: "'Space Mono', monospace" }}>
              spread {spread.toLocaleString()}
            </div>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>รับซื้อ</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff",
            fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
            {row.buy != null ? row.buy.toLocaleString() : "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>ขายออก</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: accent,
            fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
            {row.sell != null ? row.sell.toLocaleString() : "—"}
          </div>
          {row.sellChange != null && (
            <div style={{ fontSize: 9, color: chgColor, marginTop: 2, fontWeight: 700,
              fontFamily: "'Space Mono', monospace" }}>
              {row.sellChange > 0 ? "▲" : row.sellChange < 0 ? "▼" : "·"} {fmtChange(row.sellChange)}
            </div>
          )}
        </div>
      </div>
    );
  };
  const head = data.hsh?.timeStr || data.ref?.timeStr || "";
  return (
    <div style={{
      padding: "12px 14px",
      background: "linear-gradient(135deg, rgba(255,215,0,0.10), rgba(0,0,0,0.4))",
      border: "1px solid rgba(255,215,0,0.35)",
      borderRadius: 18,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 11, color: "#ffd700", letterSpacing: 1, fontWeight: 700 }}>
          🥇 ราคาทอง · ฮั่วเซ่งเฮง
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)",
          fontFamily: "'Space Mono', monospace" }}>
          {head}
        </div>
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
        บาท / บาทน้ำหนัก (1 บาท = 15.244 ก.) · ทอง 96.5%
      </div>
      <Row label="ทองแท่ง HSH" sub="ฮั่วเซ่งเฮง real-time" row={data.hsh} accent="#ffd700" highlight />
      <Row label="ทองแท่ง REF" sub="อ้างอิงสมาคมค้าทองคำ"  row={data.ref} accent="#fbbf24" />
      <Row label="ทองรูปพรรณ"  sub="JEWEL"                 row={data.jewel} accent="#f59e0b" />
    </div>
  );
}
