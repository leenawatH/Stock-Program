// ========================================================
// NewsView — Finnhub news per ticker + Thai translation toggle
// ========================================================
import React, { useEffect, useState } from "react";
import { STOCKS } from "../constants.js";
import { fetchCompanyNews, fetchCryptoNews, fetchGeneralNews } from "../api/finnhub.js";
import { translateText } from "../api/translate.js";

export default function NewsView({ apiKey }) {
  const [newsByTicker, setNewsByTicker] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeTicker, setActiveTicker] = useState("ALL");
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [translateOn, setTranslateOn] = useState(false);
  const [translations, setTranslations] = useState({}); // text -> translated
  const [translating, setTranslating] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const result = {};
        const stockTickers = Object.keys(STOCKS).filter(t => STOCKS[t].kind === "stock");
        const cryptoTickers = Object.keys(STOCKS).filter(t => STOCKS[t].kind === "crypto");
        const safeHavens   = Object.keys(STOCKS).filter(t => STOCKS[t].kind === "safe_haven");

        const stockNews = await Promise.all(stockTickers.map(t => fetchCompanyNews(t, apiKey, 7)));
        stockTickers.forEach((t, i) => { result[t] = (stockNews[i] || []).slice(0, 12); });

        if (cryptoTickers.length) {
          const cryptoFeed = await fetchCryptoNews(apiKey);
          for (const t of cryptoTickers) {
            const name = (STOCKS[t].name || "").toLowerCase();
            const sym = t.split("-")[0].toLowerCase();
            result[t] = cryptoFeed
              .filter(n => {
                const text = `${n.headline || ""} ${n.summary || ""}`.toLowerCase();
                return text.includes(name) || text.includes(sym);
              })
              .slice(0, 12);
          }
        }

        if (safeHavens.length) {
          const generalFeed = await fetchGeneralNews(apiKey);
          const goldRx = /\b(gold|xau|bullion|ทอง|ออนซ์)\b/i;
          for (const t of safeHavens) {
            result[t] = generalFeed
              .filter(n => goldRx.test(`${n.headline || ""} ${n.summary || ""}`))
              .slice(0, 12);
          }
        }

        if (!cancelled) setNewsByTicker(result);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey, refreshKey]);

  const tickers = Object.keys(STOCKS);
  const allNews = tickers.flatMap(t =>
    (newsByTicker[t] || []).map(n => ({ ...n, _ticker: t }))
  );
  const seen = new Set();
  const uniqAll = allNews.filter(n => {
    const key = n.id || `${n.headline}-${n.datetime}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.datetime || 0) - (a.datetime || 0));

  const visible = activeTicker === "ALL" ? uniqAll : (newsByTicker[activeTicker] || []).map(n => ({ ...n, _ticker: activeTicker }));

  // Auto-translate visible items when toggle is on
  useEffect(() => {
    if (!translateOn || visible.length === 0) return;
    const pending = new Set();
    visible.forEach(n => {
      if (n.headline && translations[n.headline] === undefined) pending.add(n.headline);
      if (n.summary && translations[n.summary] === undefined) pending.add(n.summary);
    });
    if (pending.size === 0) return;
    let cancelled = false;
    setTranslating(true);
    (async () => {
      const updates = {};
      // Sequential — Google free endpoint rate-limits parallel calls
      for (const t of pending) {
        if (cancelled) break;
        updates[t] = await translateText(t, "th");
      }
      if (!cancelled) {
        setTranslations(prev => ({ ...prev, ...updates }));
        setTranslating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [translateOn, activeTicker, visible.length]);

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toISOString().slice(0, 10);
  };

  return (
    <div>
      {/* Header + refresh */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>📰 ข่าวหุ้น</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            7 วันย้อนหลัง · จาก Finnhub
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setTranslateOn(v => !v)}
            style={{
              background: translateOn ? "rgba(74,222,128,0.18)" : "rgba(255,255,255,0.05)",
              color: translateOn ? "#86efac" : "rgba(255,255,255,0.6)",
              border: `1px solid ${translateOn ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 8, padding: "6px 10px", fontSize: 11, cursor: "pointer",
              fontWeight: translateOn ? 700 : 500,
            }}
          >
            {translating ? "⏳" : "🌐"} {translateOn ? "ไทย" : "EN"}
          </button>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            disabled={loading}
            style={{
              background: "rgba(99,102,241,0.15)", color: "#a5b4fc",
              border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8,
              padding: "6px 12px", fontSize: 11, cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? "⏳" : "🔄"} รีเฟรช
          </button>
        </div>
      </div>

      {/* Ticker filter chips */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 14, overflowX: "auto",
        paddingBottom: 4,
      }}>
        {["ALL", ...tickers].map(t => {
          const isActive = activeTicker === t;
          const info = STOCKS[t] || {};
          const count = t === "ALL" ? uniqAll.length : (newsByTicker[t] || []).length;
          return (
            <button
              key={t}
              onClick={() => setActiveTicker(t)}
              style={{
                flexShrink: 0, padding: "6px 10px", borderRadius: 8,
                background: isActive ? `${info.color || "#6366f1"}25` : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? (info.color || "#6366f1") : "rgba(255,255,255,0.08)"}`,
                color: isActive ? (info.color || "#a5b4fc") : "rgba(255,255,255,0.6)",
                fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              {info.icon && <span>{info.icon}</span>}
              <span>{t === "ALL" ? "ทั้งหมด" : t}</span>
              {count > 0 && (
                <span style={{
                  fontSize: 9, opacity: 0.7, padding: "0 4px",
                  background: "rgba(0,0,0,0.3)", borderRadius: 6,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{
          padding: 30, textAlign: "center",
          background: "rgba(255,255,255,0.03)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            กำลังโหลดข่าว...
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div style={{
          padding: 16, borderRadius: 12,
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.3)",
          fontSize: 12, color: "#fca5a5",
        }}>
          ⚠️ โหลดข่าวไม่ได้: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && visible.length === 0 && (
        <div style={{
          padding: 30, textAlign: "center",
          background: "rgba(255,255,255,0.03)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            ไม่มีข่าวใน 7 วันที่ผ่านมา
          </div>
        </div>
      )}

      {/* News cards */}
      {!loading && visible.map((n, i) => {
        const info = STOCKS[n._ticker] || {};
        const cardId = `${n.id || n.headline}-${i}`;
        const isExpanded = expandedId === cardId;
        const headlineText = translateOn && n.headline
          ? (translations[n.headline] || n.headline)
          : n.headline;
        const summaryText = translateOn && n.summary
          ? (translations[n.summary] || n.summary)
          : n.summary;
        const isHeadlinePending = translateOn && n.headline && translations[n.headline] === undefined;
        const isSummaryPending = translateOn && n.summary && translations[n.summary] === undefined;
        return (
          <div
            key={cardId}
            onClick={() => setExpandedId(isExpanded ? null : cardId)}
            style={{
              cursor: "pointer",
              background: isExpanded ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${isExpanded ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderRadius: 12, padding: 12, marginBottom: 10,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              marginBottom: 6, fontSize: 10, flexWrap: "wrap",
            }}>
              <span style={{
                padding: "2px 6px", borderRadius: 5,
                background: `${info.color || "#6366f1"}22`,
                border: `1px solid ${info.color || "#6366f1"}55`,
                color: info.color || "#a5b4fc", fontWeight: 700,
              }}>
                {info.icon} {n._ticker}
              </span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{n.source}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>·</span>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>{fmtTime(n.datetime)}</span>
              <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                {isExpanded ? "▲" : "▼"}
              </span>
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600, color: "#fff",
              lineHeight: 1.4, marginBottom: summaryText || isExpanded ? 6 : 0,
              opacity: isHeadlinePending ? 0.55 : 1,
            }}>
              {headlineText}
              {isHeadlinePending && <span style={{ fontSize: 9, color: "#fbbf24", marginLeft: 6 }}>กำลังแปล…</span>}
            </div>
            {summaryText && (
              <div style={{
                fontSize: 11, color: "rgba(255,255,255,0.65)",
                lineHeight: 1.55,
                opacity: isSummaryPending ? 0.55 : 1,
                ...(isExpanded ? {} : {
                  display: "-webkit-box", WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical", overflow: "hidden",
                }),
              }}>
                {summaryText}
                {isSummaryPending && <span style={{ fontSize: 9, color: "#fbbf24", marginLeft: 6 }}>กำลังแปล…</span>}
              </div>
            )}
            {isExpanded && (
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                {n.image && (
                  <img
                    src={n.image}
                    alt=""
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{
                      width: 60, height: 60, objectFit: "cover", borderRadius: 8,
                      flexShrink: 0,
                    }}
                  />
                )}
                <a
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    flex: 1, padding: "10px 14px", textAlign: "center",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: "#fff", textDecoration: "none",
                    borderRadius: 10, fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  🔗 อ่านต้นฉบับที่ {n.source || "site"} →
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
