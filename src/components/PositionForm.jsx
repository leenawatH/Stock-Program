// ========================================================
// PositionForm — qty/price/date entry for tracking buys
// ========================================================
import React, { useState } from "react";

export default function PositionForm({ ticker, onAdd }) {
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = () => {
    const q = parseFloat(qty), p = parseFloat(price);
    if (!q || !p || q <= 0 || p <= 0) return;
    onAdd({ id: Date.now(), qty: q, price: p, date });
    setQty(""); setPrice("");
  };

  const input = (v, set, placeholder, type = "number", step) => (
    <input value={v} onChange={(e) => set(e.target.value)} placeholder={placeholder}
      type={type} step={step}
      style={{
        flex: 1, minWidth: 0, padding: "8px 10px", borderRadius: 10,
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
        color: "#fff", fontSize: 12, fontFamily: "'Space Mono', monospace",
      }} />
  );

  return (
    <div style={{
      padding: "10px 12px", borderRadius: 12,
      background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.12)",
      marginBottom: 10,
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6, letterSpacing: 1 }}>
        ➕ บันทึกการซื้อ {ticker} <span style={{ color: "rgba(255,255,255,0.35)" }}>(ราคาเป็น USD)</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        {input(qty, setQty, "จำนวน", "number", "any")}
        {input(price, setPrice, "ราคา/หน่วย ($)", "number", "any")}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {input(date, setDate, "", "date")}
        <button onClick={submit}
          style={{
            padding: "8px 14px", borderRadius: 10, border: "none",
            background: "#4ade8033", color: "#4ade80", fontSize: 12, fontWeight: 700,
            cursor: "pointer",
          }}>บันทึก</button>
      </div>
    </div>
  );
}
