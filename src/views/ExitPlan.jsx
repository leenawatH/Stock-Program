// ========================================================
// ExitPlan view — TP/SL/Trail levels + position summary +
// PositionForm + sell triggers + profit plan
// ========================================================
import React from "react";
import { fmtPrice } from "../lib/format.js";
import PositionForm from "../components/PositionForm.jsx";

export default function ExitPlan({ plan, ticker, onAddEntry, onRemoveEntry }) {
  if (!plan) return (
    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, padding: 20 }}>ยังไม่มีข้อมูลพอ</div>
  );

  const pct = (to) => (((to - plan.price) / plan.price) * 100).toFixed(1);
  const row = (label, value, sub, tone) => {
    const c = tone === "gain" ? "#4ade80" : tone === "loss" ? "#f87171" : "#fff";
    return (
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div>
          <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 13, fontFamily: "'Space Mono', monospace", color: c, fontWeight: 700, textAlign: "right" }}>
          {value}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      padding: "4px 14px 14px", borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, padding: "14px 0 6px" }}>
        🚪 EXIT PLAN · {ticker}
      </div>

      {/* Position summary */}
      {plan.position ? (
        <div style={{
          padding: "10px 12px", borderRadius: 12,
          background: plan.position.gainPct >= 0 ? "#4ade8010" : "#f8717110",
          border: `1px solid ${plan.position.gainPct >= 0 ? "#4ade8044" : "#f8717144"}`,
          marginBottom: 10,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: 1 }}>
              💼 POSITION · ถือ {plan.position.daysHeld} วัน
            </div>
            <div style={{
              fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono', monospace",
              color: plan.position.gainPct >= 0 ? "#4ade80" : "#f87171",
            }}>
              {plan.position.gainPct >= 0 ? "+" : ""}{plan.position.gainPct.toFixed(2)}%
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
            <span style={{ color: "rgba(255,255,255,0.8)" }}>Qty: <b>{plan.position.totalQty}</b></span>
            <span style={{ color: "rgba(255,255,255,0.8)" }}>Avg: <b>{fmtPrice(plan.position.avgCost, ticker)}</b></span>
            <span style={{ color: "rgba(255,255,255,0.8)" }}>Now: <b>{fmtPrice(plan.price, ticker)}</b></span>
            <span style={{
              color: plan.position.pnl >= 0 ? "#4ade80" : "#f87171", fontWeight: 700,
            }}>P&L: {plan.position.pnl >= 0 ? "+" : ""}{fmtPrice(plan.position.pnl, ticker)}</span>
          </div>
        </div>
      ) : (
        <div style={{
          padding: "10px 12px", borderRadius: 12,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          marginBottom: 10, fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.5,
        }}>
          ยังไม่ได้บันทึกการซื้อ · เพิ่มด้านล่างเพื่อให้ระบบคำนวณกำไร/ขาดทุนและ profit plan ตาม entry จริง
        </div>
      )}

      <PositionForm ticker={ticker} onAdd={(e) => onAddEntry(ticker, e)} />

      {plan.position && plan.position.entries.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, padding: "4px 0 4px" }}>
            📝 ENTRIES ({plan.position.entries.length})
          </div>
          {plan.position.entries.map((e) => {
            const entryGain = ((plan.price - e.price) / e.price) * 100;
            return (
              <div key={e.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                fontSize: 11, fontFamily: "'Space Mono', monospace",
              }}>
                <span style={{ color: "rgba(255,255,255,0.5)", width: 82 }}>{e.date}</span>
                <span style={{ color: "#fff", width: 50 }}>×{e.qty}</span>
                <span style={{ color: "rgba(255,255,255,0.8)" }}>@{fmtPrice(Number(e.price), ticker)}</span>
                <span style={{
                  marginLeft: "auto",
                  color: entryGain >= 0 ? "#4ade80" : "#f87171", fontWeight: 700,
                }}>{entryGain >= 0 ? "+" : ""}{entryGain.toFixed(1)}%</span>
                <button onClick={() => onRemoveEntry(ticker, e.id)}
                  style={{
                    padding: "2px 8px", borderRadius: 6, border: "none",
                    background: "#f8717122", color: "#f87171", cursor: "pointer", fontSize: 10,
                  }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {plan.profitPlan && (
        <div style={{
          padding: "10px 12px", borderRadius: 12,
          background: "linear-gradient(135deg, #a855f722, #a855f708)",
          border: "1px solid #a855f744", marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, color: "#a855f7", letterSpacing: 1, marginBottom: 4 }}>
            📈 PROFIT PLAN · stage: {plan.profitPlan.stage}
          </div>
          <div style={{ fontSize: 12, color: "#fff", lineHeight: 1.5 }}>{plan.profitPlan.stageAction}</div>
          {plan.profitPlan.suggestedSL && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 6, fontFamily: "'Space Mono', monospace" }}>
              💡 แนะนำยก SL ไปที่ <b style={{ color: "#f87171" }}>{fmtPrice(plan.profitPlan.suggestedSL, ticker)}</b>
            </div>
          )}
        </div>
      )}

      {/* Action banner */}
      <div style={{
        padding: "12px 14px", borderRadius: 14,
        background: `${plan.color}18`, border: `1.5px solid ${plan.color}55`,
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 10, color: `${plan.color}cc`, letterSpacing: 1, marginBottom: 4 }}>
          ACTION · urgency: {plan.urgency.toUpperCase()} · quant: {plan.verdict} ({plan.qScore}/100)
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: plan.color, lineHeight: 1.35 }}>{plan.action}</div>
        {plan.note && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 6, lineHeight: 1.45 }}>
            💡 {plan.note}
          </div>
        )}
      </div>

      {row("Take-Profit 1", fmtPrice(plan.tp1, ticker), `${pct(plan.tp1) >= 0 ? "+" : ""}${pct(plan.tp1)}% จากราคาปัจจุบัน · mean reversion`, pct(plan.tp1) >= 0 ? "gain" : "loss")}
      {row("Take-Profit 2", fmtPrice(plan.tp2, ticker), `${pct(plan.tp2) >= 0 ? "+" : ""}${pct(plan.tp2)}% · stretch target`, pct(plan.tp2) >= 0 ? "gain" : "loss")}
      {row("Stop-Loss", fmtPrice(plan.sl, ticker), `-${plan.slPct.toFixed(1)}% · ${plan.slPct > 8 ? "กว้าง (crypto vol)" : "ตาม 2× daily vol"}`, "loss")}
      {row("Trailing Stop", fmtPrice(plan.trail, ticker), `swing-low 20 วัน / vol-adjusted`, "loss")}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, padding: "14px 0 6px" }}>
        ⚠️ SELL TRIGGERS ({plan.triggers.length})
      </div>
      {plan.triggers.length === 0 ? (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", padding: "8px 0" }}>
          ยังไม่มีสัญญาณขาย — ใช้ TP/SL ด้านบนเป็น plan ล่วงหน้า
        </div>
      ) : (
        plan.triggers.map((t, i) => {
          const c = t.sev === "high" ? "#f87171" : "#eab308";
          return (
            <div key={i} style={{
              display: "flex", gap: 8, padding: "8px 0",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
            }}>
              <div style={{
                fontSize: 9, padding: "3px 7px", borderRadius: 6,
                background: `${c}22`, color: c, fontWeight: 700, height: "fit-content", flexShrink: 0,
              }}>{t.sev.toUpperCase()}</div>
              <div style={{ fontSize: 12, color: "#fff", lineHeight: 1.45 }}>{t.text}</div>
            </div>
          );
        })
      )}
    </div>
  );
}
