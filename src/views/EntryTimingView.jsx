// ========================================================
// EntryTimingView — A+ to F entry grade + price-position bar +
// suggested entry zones + pros/cons
// ========================================================
import React from "react";
import { STOCKS } from "../constants.js";
import { fmtPrice } from "../lib/format.js";

export default function EntryTimingView({ ticker, timing, hasPosition }) {
  if (!timing) return (
    <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
      ยังโหลดข้อมูลไม่ครบ
    </div>
  );

  const t = timing;
  const info = STOCKS[ticker] || {};

  // Position of current price within range [low20, high20]
  const range = t.high20 - t.low20;
  const positionPct = range > 0 ? ((t.currentPrice - t.low20) / range) * 100 : 50;

  return (
    <div>
      {/* Big Grade Card */}
      <div style={{
        background: `linear-gradient(135deg, ${t.color}25, ${t.color}05)`,
        border: `2px solid ${t.color}55`,
        borderRadius: 18, padding: 18, marginBottom: 14,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginBottom: 6 }}>
          ENTRY TIMING GRADE
        </div>
        <div style={{
          fontSize: 64, fontWeight: 900, color: t.color,
          lineHeight: 1, marginBottom: 6,
          fontFamily: "'Space Mono', monospace",
        }}>
          {t.grade}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: t.color, marginBottom: 4 }}>
          {t.signal}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
          {t.action}
        </div>
        <div style={{
          marginTop: 10, fontSize: 10, color: "rgba(255,255,255,0.5)",
          fontFamily: "'Space Mono', monospace",
        }}>
          Score: {t.entryScore}/100
        </div>
      </div>

      {/* ติดดอย Risk warning */}
      {t.tinaiRisk && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 12,
          background: "rgba(245,158,11,0.12)",
          border: "1px solid rgba(245,158,11,0.4)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
            ⚠️ ติดดอย Risk
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
            Verdict ดี แต่ราคาอยู่โซน overbought / ใกล้ high → เข้าตอนนี้เสี่ยงเป็น bag holder
            <br />ควรรอ pullback มาที่ <b style={{ color: "#fff" }}>{fmtPrice(t.mean, ticker)}</b> หรือต่ำกว่า
          </div>
        </div>
      )}

      {/* Price Position Bar */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14, padding: 14, marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 10 }}>
          PRICE POSITION (20-DAY RANGE)
        </div>

        {/* Bar */}
        <div style={{ position: "relative", height: 36, marginBottom: 18 }}>
          <div style={{
            position: "absolute", left: 0, right: 0, top: 12, height: 12, borderRadius: 6,
            background: "linear-gradient(90deg, rgba(74,222,128,0.4) 0%, rgba(74,222,128,0.2) 30%, rgba(251,191,36,0.2) 50%, rgba(248,113,113,0.2) 70%, rgba(248,113,113,0.4) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }} />
          {/* Current price marker */}
          <div style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(100, positionPct))}%`,
            top: 6, transform: "translateX(-50%)",
            width: 4, height: 24,
            background: info.color || "#fff",
            borderRadius: 2,
            boxShadow: `0 0 8px ${info.color || "#fff"}`,
          }} />
          <div style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(100, positionPct))}%`,
            top: -2, transform: "translateX(-50%)",
            fontSize: 9, color: info.color || "#fff", fontWeight: 700,
            fontFamily: "'Space Mono', monospace",
            whiteSpace: "nowrap",
          }}>
            ▼ NOW
          </div>
        </div>

        {/* Labels */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 10, fontFamily: "'Space Mono', monospace",
        }}>
          <span style={{ color: "#4ade80" }}>
            <div style={{ fontSize: 8, opacity: 0.6 }}>20D LOW</div>
            <div>{fmtPrice(t.low20, ticker)}</div>
          </span>
          <span style={{ color: "rgba(255,255,255,0.7)", textAlign: "center" }}>
            <div style={{ fontSize: 8, opacity: 0.6 }}>MEAN</div>
            <div>{fmtPrice(t.mean, ticker)}</div>
          </span>
          <span style={{ color: "#f87171", textAlign: "right" }}>
            <div style={{ fontSize: 8, opacity: 0.6 }}>20D HIGH</div>
            <div>{fmtPrice(t.high20, ticker)}</div>
          </span>
        </div>
      </div>

      {/* Suggested Entry Zones */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 14, padding: 14, marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 10 }}>
          SUGGESTED ENTRY ZONES
        </div>

        {[
          { label: "🟢 BEST ENTRY", desc: "ราคาต่ำกว่า mean -1σ", price: t.bestEntry, color: "#22c55e", highlight: t.currentPrice <= t.bestEntry },
          { label: "🟢 OK ZONE", desc: "ใกล้ mean ±0.3σ", priceRange: [t.okEntryLow, t.okEntryHigh], color: "#86efac", highlight: t.currentPrice >= t.okEntryLow && t.currentPrice <= t.okEntryHigh },
          { label: "🟡 STRETCHED", desc: "เข้าได้แต่ size เล็ก (+1σ)", price: t.stretched, color: "#fbbf24", highlight: t.currentPrice >= t.okEntryHigh && t.currentPrice <= t.stretched },
          { label: "🔴 AVOID ABOVE", desc: "อย่าเข้าเหนือ +1.5σ", price: t.avoidAbove, color: "#ef4444", highlight: t.currentPrice >= t.stretched },
        ].map(zone => (
          <div key={zone.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 10px", marginBottom: 4, borderRadius: 8,
            background: zone.highlight ? `${zone.color}18` : "transparent",
            border: `1px solid ${zone.highlight ? `${zone.color}55` : "rgba(255,255,255,0.04)"}`,
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: zone.color }}>{zone.label}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{zone.desc}</div>
            </div>
            <div style={{
              fontSize: 12, fontWeight: 700, color: "#fff",
              fontFamily: "'Space Mono', monospace",
            }}>
              {zone.priceRange
                ? `${fmtPrice(zone.priceRange[0], ticker)}–${fmtPrice(zone.priceRange[1], ticker)}`
                : fmtPrice(zone.price, ticker)}
            </div>
          </div>
        ))}

        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 8,
          background: "rgba(99,102,241,0.1)",
          fontSize: 10.5, color: "rgba(255,255,255,0.7)",
          fontFamily: "'Space Mono', monospace", textAlign: "center",
        }}>
          ราคาปัจจุบัน: <b style={{ color: info.color || "#fff" }}>{fmtPrice(t.currentPrice, ticker)}</b>
        </div>
      </div>

      {/* Pros & Cons */}
      {(t.pros.length > 0 || t.cons.length > 0) && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12,
        }}>
          <div style={{
            background: "rgba(74,222,128,0.06)",
            border: "1px solid rgba(74,222,128,0.2)",
            borderRadius: 12, padding: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>
              ✅ ข้อดี ({t.pros.length})
            </div>
            {t.pros.length === 0 && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>—</div>
            )}
            {t.pros.map((p, i) => (
              <div key={i} style={{
                fontSize: 10, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.4, marginBottom: 4,
                opacity: p.weight === "high" ? 1 : p.weight === "medium" ? 0.85 : 0.65,
              }}>
                • {p.text}
              </div>
            ))}
          </div>

          <div style={{
            background: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.2)",
            borderRadius: 12, padding: 10,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#f87171", marginBottom: 6 }}>
              ⚠️ ข้อเสีย ({t.cons.length})
            </div>
            {t.cons.length === 0 && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>—</div>
            )}
            {t.cons.map((c, i) => (
              <div key={i} style={{
                fontSize: 10, color: "rgba(255,255,255,0.75)",
                lineHeight: 1.4, marginBottom: 4,
                opacity: c.weight === "high" ? 1 : c.weight === "medium" ? 0.85 : 0.65,
              }}>
                • {c.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exit Signal (only if user has position) */}
      {hasPosition && (
        <div style={{
          background: `${t.exitColor}10`,
          border: `1px solid ${t.exitColor}40`,
          borderRadius: 14, padding: 14,
        }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 6 }}>
            ⏰ EXIT TIMING (มี position แล้ว)
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.exitColor, marginBottom: 4 }}>
            {t.exitSignal}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
            ดูแผน TP/SL ละเอียดที่ tab 🚪 Exit
          </div>
        </div>
      )}
    </div>
  );
}
