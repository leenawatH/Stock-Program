// ========================================================
// PortfolioView — total P&L summary + per-ticker positions
// ========================================================
import React from "react";
import { STOCKS } from "../constants.js";
import { fmtPrice } from "../lib/format.js";
import { summarizePosition, calculateExitPlan } from "../quant/exit.js";

export default function PortfolioView({ positions, allData, quants, regime, onSelect, onRemoveEntry }) {
  const tickers = Object.keys(positions).filter(t => positions[t]?.length);
  let totalPnl = 0, totalCost = 0, totalValue = 0;
  let actionCounts = { sellNow: 0, takePart: 0, hold: 0, addMore: 0 };
  const rows = tickers.map(t => {
    const cur = allData[t]?.current;
    const sum = summarizePosition(positions[t], cur);
    const plan = (allData[t] && quants[t] && regime)
      ? calculateExitPlan(t, allData[t], quants[t], regime, positions[t])
      : null;
    if (sum) {
      totalPnl += sum.pnl || 0;
      totalCost += sum.totalCost || 0;
      totalValue += sum.currentValue || 0;
    }
    if (plan) {
      const u = plan.urgency;
      const verdict = quants[t]?.verdict;
      if (u === "critical") actionCounts.sellNow++;
      else if (u === "high" || u === "medium" || u === "watch") actionCounts.takePart++;
      else if (verdict === "Strong Buy" || verdict === "Buy") actionCounts.addMore++;
      else actionCounts.hold++;
    }
    return { t, sum, cur, plan, quant: quants[t] };
  });
  const totalPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  if (!tickers.length) {
    return (
      <div style={{
        padding: 30, textAlign: "center",
        background: "rgba(255,255,255,0.03)", borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
          ยังไม่มี position
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
          ไปที่ Quant → เลือกหุ้น → tab 🚪 Exit → เพิ่มข้อมูลการซื้อ
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Portfolio summary */}
      <div style={{
        background: `linear-gradient(135deg, ${totalPnl >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}, rgba(0,0,0,0.5))`,
        border: `1px solid ${totalPnl >= 0 ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
        borderRadius: 16, padding: 16, marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 6 }}>
          TOTAL PORTFOLIO
        </div>
        <div style={{
          fontSize: 26, fontWeight: 800, fontFamily: "'Space Mono', monospace",
          color: totalPnl >= 0 ? "#4ade80" : "#f87171",
        }}>
          {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </div>
        <div style={{
          fontSize: 12, fontFamily: "'Space Mono', monospace",
          color: totalPnl >= 0 ? "#4ade80" : "#f87171", marginTop: 2,
        }}>
          {totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 10.5, color: "rgba(255,255,255,0.7)", fontFamily: "'Space Mono', monospace" }}>
          <span>Cost: <b>${totalCost.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b></span>
          <span>Value: <b>${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b></span>
        </div>
      </div>

      {/* Action summary bar */}
      {(actionCounts.sellNow + actionCounts.takePart + actionCounts.addMore + actionCounts.hold) > 0 && (
        <div style={{
          display: "flex", gap: 6, marginBottom: 12, fontSize: 10,
        }}>
          {actionCounts.sellNow > 0 && (
            <span style={{
              flex: 1, padding: "6px 8px", borderRadius: 8, textAlign: "center",
              background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5",
            }}>🔴 ขาย {actionCounts.sellNow}</span>
          )}
          {actionCounts.takePart > 0 && (
            <span style={{
              flex: 1, padding: "6px 8px", borderRadius: 8, textAlign: "center",
              background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)", color: "#fde68a",
            }}>🟡 ทยอย {actionCounts.takePart}</span>
          )}
          {actionCounts.hold > 0 && (
            <span style={{
              flex: 1, padding: "6px 8px", borderRadius: 8, textAlign: "center",
              background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc",
            }}>⏳ ถือ {actionCounts.hold}</span>
          )}
          {actionCounts.addMore > 0 && (
            <span style={{
              flex: 1, padding: "6px 8px", borderRadius: 8, textAlign: "center",
              background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#86efac",
            }}>🟢 ซื้อเพิ่ม {actionCounts.addMore}</span>
          )}
        </div>
      )}

      {/* Per-ticker breakdown */}
      {rows.map(({ t, sum, cur, plan, quant }) => {
        if (!sum) return null;
        const info = STOCKS[t] || {};
        const isWin = sum.pnl >= 0;
        const verdictColor = quant?.verdict === "Strong Buy" ? "#4ade80"
                          : quant?.verdict === "Buy" ? "#86efac"
                          : quant?.verdict === "Hold" ? "#fbbf24"
                          : quant?.verdict === "Sell" ? "#f97316"
                          : quant?.verdict === "Strong Sell" ? "#ef4444"
                          : "rgba(255,255,255,0.5)";
        return (
          <div key={t} style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${plan?.urgency === "critical" ? "rgba(239,68,68,0.35)"
                              : plan?.urgency === "high" ? "rgba(249,115,22,0.3)"
                              : "rgba(255,255,255,0.06)"}`,
            borderRadius: 14, padding: 12, marginBottom: 10,
          }}>
            {/* Header: ticker + P&L */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 10, cursor: "pointer",
            }} onClick={() => onSelect && onSelect(t)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>{info.icon}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: info.color }}>{t}</span>
                    {quant && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: verdictColor,
                        padding: "1px 6px", borderRadius: 5,
                        background: `${verdictColor}22`, border: `1px solid ${verdictColor}55`,
                      }}>{quant.verdict} · {quant.score}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                    {sum.totalQty}u · avg {fmtPrice(sum.avgCost, t)} · now {fmtPrice(cur, t)} · {sum.daysHeld}d
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: 13, fontWeight: 700,
                  color: isWin ? "#4ade80" : "#f87171",
                  fontFamily: "'Space Mono', monospace",
                }}>
                  {isWin ? "+" : ""}{fmtPrice(sum.pnl, t)}
                </div>
                <div style={{
                  fontSize: 10, color: isWin ? "#4ade80" : "#f87171",
                  fontFamily: "'Space Mono', monospace",
                }}>
                  {isWin ? "+" : ""}{sum.gainPct.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Action card from exit plan */}
            {plan && (
              <div style={{
                padding: 10, borderRadius: 10, marginBottom: 8,
                background: `${plan.color}15`,
                border: `1px solid ${plan.color}40`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: plan.color, marginBottom: 4, lineHeight: 1.4 }}>
                  {plan.action}
                </div>
                {plan.profitPlan && (
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.78)", lineHeight: 1.5, marginTop: 4 }}>
                    📈 <b style={{ color: "#fff" }}>{plan.profitPlan.stage}</b> · {plan.profitPlan.stageAction}
                  </div>
                )}
              </div>
            )}

            {/* TP/SL row */}
            {plan && (
              <div style={{
                display: "flex", gap: 6, marginBottom: 8, fontSize: 10,
                fontFamily: "'Space Mono', monospace",
              }}>
                <div style={{
                  flex: 1, padding: "5px 8px", borderRadius: 8,
                  background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8 }}>TP1</div>
                  <div style={{ color: "#4ade80", fontWeight: 700 }}>{fmtPrice(plan.tp1, t)}</div>
                </div>
                <div style={{
                  flex: 1, padding: "5px 8px", borderRadius: 8,
                  background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8 }}>SL</div>
                  <div style={{ color: "#f87171", fontWeight: 700 }}>
                    {plan.profitPlan?.suggestedSL ? fmtPrice(plan.profitPlan.suggestedSL, t) : fmtPrice(plan.sl, t)}
                  </div>
                </div>
                <div style={{
                  flex: 1, padding: "5px 8px", borderRadius: 8,
                  background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8 }}>Trail</div>
                  <div style={{ color: "#a5b4fc", fontWeight: 700 }}>{fmtPrice(plan.trail, t)}</div>
                </div>
              </div>
            )}

            {/* Top sell triggers (HIGH severity only) */}
            {plan?.triggers?.filter(tr => tr.sev === "high" || tr.sev === "critical").slice(0, 2).map((tr, i) => (
              <div key={i} style={{
                fontSize: 10.5, color: "rgba(255,255,255,0.75)",
                padding: "4px 8px", borderRadius: 7,
                background: "rgba(248,113,113,0.06)",
                marginBottom: 4, lineHeight: 1.4,
              }}>
                ⚠️ {tr.text}
              </div>
            ))}

            {/* Entry list */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8, marginTop: 4 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, marginBottom: 6,
              }}>
                <span>ENTRIES ({sum.entries.length})</span>
                <span>avg cost {fmtPrice(sum.avgCost, t)}</span>
              </div>
              {sum.entries.map(e => {
                const entryPrice = Number(e.price);
                const entryQty = Number(e.qty);
                const entryPnlPct = ((cur - entryPrice) / entryPrice) * 100;
                const entryPnlUsd = (cur - entryPrice) * entryQty;
                const daysHeld = e.date
                  ? Math.max(0, Math.round((Date.now() - new Date(e.date).getTime()) / 86400000))
                  : null;
                let vsContext = null;
                if (plan?.tp1 && plan?.sl) {
                  const toTp1 = ((plan.tp1 - cur) / cur) * 100;
                  const toSl = ((cur - plan.sl) / cur) * 100;
                  vsContext = { toTp1, toSl };
                }
                return (
                  <div key={e.id} style={{
                    padding: "6px 8px", marginBottom: 4, borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${entryPnlPct >= 0 ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)"}`,
                  }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      fontSize: 10.5, fontFamily: "'Space Mono', monospace",
                    }}>
                      <span style={{ color: "rgba(255,255,255,0.75)" }}>
                        {e.date || "—"} · <b style={{ color: "#fff" }}>{entryQty}u</b> @ {fmtPrice(entryPrice, t)}
                        {daysHeld !== null && (
                          <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>
                            ({daysHeld}d)
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ textAlign: "right" }}>
                          <div style={{
                            color: entryPnlPct >= 0 ? "#4ade80" : "#f87171",
                            fontSize: 10.5, fontWeight: 700,
                          }}>
                            {entryPnlPct >= 0 ? "+" : ""}{entryPnlPct.toFixed(1)}%
                          </div>
                          <div style={{
                            color: entryPnlUsd >= 0 ? "#4ade80" : "#f87171",
                            fontSize: 9, opacity: 0.8,
                          }}>
                            {entryPnlUsd >= 0 ? "+" : ""}{fmtPrice(entryPnlUsd, t)}
                          </div>
                        </span>
                        <button onClick={(ev) => { ev.stopPropagation(); onRemoveEntry && onRemoveEntry(t, e.id); }} style={{
                          background: "none", border: "none", color: "rgba(248,113,113,0.6)",
                          cursor: "pointer", fontSize: 14, padding: "0 4px",
                        }}>×</button>
                      </span>
                    </div>
                    {vsContext && (
                      <div style={{
                        marginTop: 4, display: "flex", gap: 8,
                        fontSize: 9, fontFamily: "'Space Mono', monospace",
                      }}>
                        <span style={{ color: "rgba(74,222,128,0.7)" }}>
                          → TP1 {vsContext.toTp1 >= 0 ? "+" : ""}{vsContext.toTp1.toFixed(1)}%
                        </span>
                        <span style={{ color: "rgba(248,113,113,0.7)" }}>
                          ↓ SL {vsContext.toSl >= 0 ? "-" : "+"}{Math.abs(vsContext.toSl).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
