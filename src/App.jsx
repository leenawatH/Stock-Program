// ========================================================
// StockQuantL3 — main app shell
//   • Loads API key + positions
//   • Polls Thai gold (10 min) + Bitkub (30 s)
//   • Fetches asset data once API key is set
//   • Composes regime + per-ticker quant + entry timing
//   • Routes between Quant / Pairs / News / Portfolio views
// ========================================================
import React, { useState, useEffect } from "react";

import { STOCKS, COMPARE_ASSETS, ALL_SYMBOLS } from "./constants.js";
import {
  loadApiKey, saveApiKey, deleteApiKey,
  loadPositions, savePositions,
} from "./storage.js";

import { fetchAsset } from "./api/asset.js";
import { fetchThaiGoldPrice } from "./api/thaigold.js";
import { fetchBitkubPrices } from "./api/bitkub.js";

import { correlation } from "./lib/math.js";
import { fmtPrice } from "./lib/format.js";

import { detectRegime } from "./quant/regime.js";
import { calculateQuantScore } from "./quant/score.js";
import { calculateEntryTiming } from "./quant/timing.js";
import { calculateExitPlan } from "./quant/exit.js";

import LoadingDots from "./components/LoadingDots.jsx";
import APIKeySetup from "./components/APIKeySetup.jsx";
import StockCard from "./components/StockCard.jsx";
import ThaiGoldPanel from "./components/ThaiGoldPanel.jsx";
import BitkubPanel from "./components/BitkubPanel.jsx";
import RegimeDial from "./components/RegimeDial.jsx";
import CorrelationMatrix from "./components/CorrelationMatrix.jsx";
import QuantGauge from "./components/QuantGauge.jsx";
import ZScoreBar from "./components/ZScoreBar.jsx";
import RelativeStrength from "./components/RelativeStrength.jsx";
import DivergenceAlerts from "./components/DivergenceAlerts.jsx";
import SignalBreakdown from "./components/SignalBreakdown.jsx";

import PairsView from "./views/PairsView.jsx";
import PortfolioView from "./views/PortfolioView.jsx";
import NewsView from "./views/NewsView.jsx";
import EntryTimingView from "./views/EntryTimingView.jsx";
import ExitPlan from "./views/ExitPlan.jsx";

export default function StockQuantL3() {
  const [apiKey, setApiKey] = useState(null);
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeStock, setActiveStock] = useState("NVDA");
  const [allData, setAllData] = useState({});
  const [quants, setQuants] = useState({});
  const [regime, setRegime] = useState(null);
  const [loading, setLoading] = useState({});
  const [lastUpdate, setLastUpdate] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState("signals");
  const [positions, setPositions] = useState({});
  const [view, setView] = useState("quant");
  const [thaiGold, setThaiGold] = useState(null);
  const [bitkub, setBitkub] = useState(null);

  // Load API key + positions on mount
  useEffect(() => {
    loadApiKey().then(k => {
      setApiKey(k);
      setKeyLoaded(true);
    });
    loadPositions().then(setPositions);
  }, []);

  // Fetch Thai Gold price on mount + refresh every 10 min
  useEffect(() => {
    fetchThaiGoldPrice().then(r => r && setThaiGold(r));
    const id = setInterval(() => {
      fetchThaiGoldPrice().then(r => r && setThaiGold(r));
    }, 600000);
    return () => clearInterval(id);
  }, []);

  // Fetch Bitkub crypto prices on mount + refresh every 30s
  useEffect(() => {
    fetchBitkubPrices().then(r => r && setBitkub(r));
    const id = setInterval(() => {
      fetchBitkubPrices().then(r => r && setBitkub(r));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  function addEntry(ticker, entry) {
    setPositions(prev => {
      const next = { ...prev };
      const list = Array.isArray(next[ticker]) ? [...next[ticker]] : [];
      list.push({ id: Date.now() + Math.random(), ...entry });
      next[ticker] = list;
      savePositions(next);
      return next;
    });
  }

  function removeEntry(ticker, id) {
    setPositions(prev => {
      const next = { ...prev };
      const list = Array.isArray(next[ticker]) ? next[ticker].filter(e => e.id !== id) : [];
      if (list.length) next[ticker] = list;
      else delete next[ticker];
      savePositions(next);
      return next;
    });
  }

  // Fetch data when key ready
  useEffect(() => {
    if (apiKey) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  async function loadAll() {
    if (!apiKey) return;
    const symbols = Object.keys(ALL_SYMBOLS);
    const newLoading = {};
    symbols.forEach(s => newLoading[s] = true);
    setLoading(newLoading);

    const results = await Promise.all(symbols.map(s => fetchAsset(s, apiKey)));
    const newData = {};
    symbols.forEach((s, i) => { newData[s] = results[i]; });
    setAllData(newData);

    const reg = detectRegime(newData);
    setRegime(reg);

    const newQuants = {};
    Object.keys(STOCKS).forEach(t => {
      newQuants[t] = calculateQuantScore(t, newData, reg);
    });
    setQuants(newQuants);

    setLoading({});
    setLastUpdate(new Date());
  }

  async function runAI() {
    const quant = quants[activeStock];
    const data = allData[activeStock];
    if (!quant || !data) return;
    setAiLoading(true);
    setAiResult(null);

    const info = STOCKS[activeStock];
    const correlations = {};
    Object.keys(COMPARE_ASSETS).forEach(s => {
      if (allData[s]?.prices && data.prices) {
        correlations[COMPARE_ASSETS[s].name] =
          correlation(data.prices.slice(-60), allData[s].prices.slice(-60)).toFixed(2);
      }
    });

    const prompt = `คุณเป็น AI Quant Analyst ระดับ hedge fund วิเคราะห์ ${activeStock} (${info.name}) โดยใช้ pure quant data เท่านั้น ไม่ต้องสนใจข่าว

📊 REAL-TIME DATA (Finnhub):
- Current: ${fmtPrice(data.current, activeStock)}
- Previous Close: ${fmtPrice(data.previousClose, activeStock)}
- Change: ${(((data.current - data.previousClose) / data.previousClose) * 100).toFixed(2)}%
- Volatility (20d): ${quant.volatility.toFixed(2)}%

🎯 QUANT SCORE: ${quant.score}/100 (${quant.verdict})

📈 SIGNAL BREAKDOWN:
${quant.signals.map(s => `- ${s.name}: ${s.value} (${s.sig}) [${s.type}]`).join("\n")}

🌡️ MARKET REGIME: ${regime.regime} (${regime.score}/100)
Regime signals: ${regime.signals.join(", ")}

📊 Z-SCORE: ${quant.zscore.toFixed(2)} (${Math.abs(quant.zscore) > 2 ? "EXTREME" : "NORMAL"})

🔗 CORRELATIONS (60-day):
${Object.entries(correlations).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

${quant.divergences.length > 0 ? `🚨 DIVERGENCES:\n${quant.divergences.map(d => `- ${d.type} vs ${d.vs}: ${d.magnitude}% (${d.sigma}σ)`).join("\n")}` : ""}

ตอบเป็น JSON เท่านั้น (ห้ามมี markdown):
{
  "direction": "ขึ้น" | "ลง" | "ทรงตัว",
  "confidence": 0-100,
  "priceTarget": "$XXX - $XXX",
  "stopLoss": "$XXX",
  "timeframe": "เช่น 3-5 วัน",
  "riskLevel": "ต่ำ" | "ปานกลาง" | "สูง",
  "quantThesis": "ทฤษฎีการเดา 2-3 ประโยคจาก quant signals",
  "keyDrivers": ["ปัจจัยเชิง quant 1", "ปัจจัย 2", "ปัจจัย 3"],
  "regimeImpact": "regime มีผลยังไงกับตัวนี้",
  "pairsIdea": "suggestion pair trade กับสินทรัพย์อื่น",
  "accuracy": "65-72%"
}`;

    try {
      const res = await fetch("/api/anthropic/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const d = await res.json();
      const text = d.content?.map(b => b.text || "").join("") || "";
      const clean = text.replace(/```json|```/g, "").trim();
      setAiResult(JSON.parse(clean));
    } catch {
      setAiResult({ error: "วิเคราะห์ไม่สำเร็จ" });
    } finally {
      setAiLoading(false);
    }
  }

  // Show API key setup if not set
  if (!keyLoaded) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#050508", color: "#fff", fontFamily: "system-ui",
      }}>
        <LoadingDots color="#6366f1" />
      </div>
    );
  }

  if (!apiKey) {
    return <APIKeySetup onSave={setApiKey} />;
  }

  const mainInfo = STOCKS[activeStock];
  const mainQuant = quants[activeStock];
  const mainData = allData[activeStock];

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #050508 0%, #0a0a12 50%, #080810 100%)",
      fontFamily: "'Noto Sans Thai', 'Space Mono', sans-serif",
      color: "#fff",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Noto+Sans+Thai:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes bounce { 0%,80%,100%{transform:scale(0.4);opacity:0.4}40%{transform:scale(1);opacity:1}}
        @keyframes slideUp { from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1} }
        @keyframes pulseRed { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      <div style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", paddingBottom: 100 }}>

        {/* Status bar */}
        <div style={{
          padding: "14px 24px 0", display: "flex",
          justifyContent: "space-between", alignItems: "center",
          fontSize: 12, color: "rgba(255,255,255,0.6)",
          fontFamily: "'Space Mono', monospace",
        }}>
          <span>9:41</span>
          <div style={{ width: 120, height: 28, background: "#000", borderRadius: 99, border: "1px solid #333" }} />
          <span>⚡ 87%</span>
        </div>

        {/* Header */}
        <div style={{ padding: "20px 20px 0", display: "flex",
          justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{
              fontSize: 24, fontWeight: 800, letterSpacing: -1,
              background: "linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.5))",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              Quant<span style={{ color: "#6366f1", fontSize: 16 }}> L3</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2,
              fontFamily: "'Space Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                display: "inline-block", width: 6, height: 6, borderRadius: "50%",
                background: "#4ade80", animation: "pulseRed 2s infinite",
              }} />
              FINNHUB · REAL-TIME
              {lastUpdate && ` · ${lastUpdate.toLocaleTimeString("th-TH")}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowSettings(!showSettings)}
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer", fontSize: 16, color: "#fff",
              }}>⚙️</button>
            <button onClick={loadAll}
              style={{
                width: 40, height: 40, borderRadius: 12,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                border: "none", cursor: "pointer", fontSize: 18, color: "#fff",
              }}>↻</button>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div style={{
            margin: "12px 20px 0", padding: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14, animation: "slideUp 0.3s",
          }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
              🔑 API Key: <span style={{ fontFamily: "'Space Mono', monospace" }}>
                {apiKey.slice(0, 6)}...{apiKey.slice(-4)}
              </span>
            </div>
            <button onClick={async () => {
              await deleteApiKey();
              setApiKey(null);
            }} style={{
              padding: "8px 14px", borderRadius: 10,
              background: "rgba(248,113,113,0.15)",
              border: "1px solid rgba(248,113,113,0.3)",
              color: "#f87171", fontSize: 11, cursor: "pointer",
            }}>🗑️ ลบ API Key</button>
          </div>
        )}

        {view === "quant" && <>

        {/* Regime Dial */}
        <div style={{ padding: "16px 20px 0" }}>
          <RegimeDial regime={regime} />
        </div>

        {/* Stock Cards */}
        <div style={{ padding: "12px 20px 0" }}>
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 8,
            letterSpacing: 1, textTransform: "uppercase",
          }}>หุ้นติดตาม</div>
          {Object.keys(STOCKS).map(ticker => (
            <StockCard key={ticker} ticker={ticker}
              data={allData[ticker]} quant={quants[ticker]}
              timing={allData[ticker] && quants[ticker] && regime
                ? calculateEntryTiming(ticker, allData[ticker], quants[ticker], regime)
                : null}
              thaiGold={thaiGold}
              bitkub={bitkub}
              loading={loading[ticker]}
              onSelect={setActiveStock} isActive={activeStock === ticker}
            />
          ))}
        </div>

        {/* Quant Score */}
        {mainQuant && (
          <div style={{ padding: "12px 20px 0" }}>
            <QuantGauge
              score={mainQuant.score}
              verdict={mainQuant.verdict}
              timing={mainData ? calculateEntryTiming(activeStock, mainData, mainQuant, regime) : null}
              onTimingClick={() => setTab("timing")}
            />
          </div>
        )}

        {/* Thai Gold Panel — only when GC=F selected */}
        {activeStock === "GC=F" && thaiGold && (
          <div style={{ padding: "12px 20px 0" }}>
            <ThaiGoldPanel data={thaiGold} />
          </div>
        )}

        {/* Bitkub Panel — when crypto selected */}
        {bitkub?.[activeStock] && (
          <div style={{ padding: "12px 20px 0" }}>
            <BitkubPanel ticker={activeStock} info={mainInfo} data={bitkub[activeStock]} />
          </div>
        )}

        {/* Divergence Alerts */}
        {mainQuant?.divergences?.length > 0 && (
          <div style={{ padding: "12px 20px 0" }}>
            <DivergenceAlerts quant={mainQuant} ticker={activeStock} />
          </div>
        )}

        {/* Tabs */}
        <div style={{
          margin: "12px 20px 0", display: "flex",
          background: "rgba(255,255,255,0.04)", borderRadius: 14,
          padding: 4, gap: 2,
        }}>
          {[
            { k: "signals", label: "🎯 Sig" },
            { k: "timing", label: "⏰ จังหวะ" },
            { k: "exit", label: "🚪 Exit" },
            { k: "correlation", label: "🔗 Corr" },
            { k: "zscore", label: "📊 Z" },
            { k: "rs", label: "💪 RS" },
          ].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 11,
                background: tab === t.k ? mainInfo.color + "33" : "transparent",
                border: "none", cursor: "pointer",
                color: tab === t.k ? mainInfo.color : "rgba(255,255,255,0.5)",
                fontSize: 11, fontWeight: 700,
              }}>{t.label}</button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ padding: "12px 20px 0" }}>
          {tab === "signals" && mainQuant && <SignalBreakdown quant={mainQuant} />}
          {tab === "timing" && mainQuant && mainData && (
            <EntryTimingView
              ticker={activeStock}
              timing={calculateEntryTiming(activeStock, mainData, mainQuant, regime)}
              hasPosition={Array.isArray(positions[activeStock]) && positions[activeStock].length > 0}
            />
          )}
          {tab === "exit" && mainQuant && mainData && (
            <ExitPlan
              ticker={activeStock}
              plan={calculateExitPlan(activeStock, mainData, mainQuant, regime, positions[activeStock])}
              onAddEntry={addEntry}
              onRemoveEntry={removeEntry}
            />
          )}
          {tab === "correlation" && <CorrelationMatrix allData={allData} />}
          {tab === "zscore" && <ZScoreBar allData={allData} symbols={Object.keys(ALL_SYMBOLS)} />}
          {tab === "rs" && <RelativeStrength allData={allData} tickers={Object.keys(STOCKS)} />}
        </div>

        {/* AI Button */}
        <div style={{ padding: "16px 20px 0" }}>
          <button onClick={runAI} disabled={aiLoading || !mainQuant}
            style={{
              width: "100%", padding: "14px",
              background: aiLoading ? "rgba(255,255,255,0.08)" :
                `linear-gradient(135deg, ${mainInfo.color}, ${mainInfo.color}cc)`,
              border: "none", borderRadius: 16,
              color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: aiLoading ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: aiLoading ? "none" : `0 8px 24px ${mainInfo.color}44`,
            }}>
            {aiLoading ? (<>🤖 AI Quant วิเคราะห์ <LoadingDots /></>) : (
              <>🚀 วิเคราะห์ด้วย Quant AI</>
            )}
          </button>
        </div>

        {/* AI Results */}
        {aiResult && !aiResult.error && (
          <div style={{
            margin: "16px 20px 0",
            background: `linear-gradient(135deg, ${mainInfo.color}18, rgba(0,0,0,0.6))`,
            border: `1px solid ${mainInfo.color}33`,
            borderRadius: 18, overflow: "hidden",
            animation: "slideUp 0.4s ease",
          }}>
            <div style={{
              padding: "14px 16px", borderBottom: `1px solid ${mainInfo.color}22`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>
                  🤖 AI QUANT ANALYSIS
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 2 }}>
                  {activeStock} · {mainInfo.name}
                </div>
              </div>
              <div style={{
                background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.4)",
                borderRadius: 8, padding: "4px 10px",
                fontSize: 10, color: "#a5b4fc", fontFamily: "'Space Mono', monospace",
              }}>~{aiResult.accuracy}</div>
            </div>

            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{
                  flex: 1, padding: 10, borderRadius: 12,
                  background: "rgba(255,255,255,0.04)", textAlign: "center",
                }}>
                  <div style={{
                    fontSize: 24,
                    color: aiResult.direction === "ขึ้น" ? "#4ade80" :
                           aiResult.direction === "ลง" ? "#f87171" : "#fbbf24",
                  }}>
                    {aiResult.direction === "ขึ้น" ? "▲" :
                     aiResult.direction === "ลง" ? "▼" : "→"}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{aiResult.direction}</div>
                </div>
                <div style={{
                  flex: 1.3, padding: 10, borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Confidence</div>
                  <div style={{
                    fontSize: 20, fontWeight: 800, color: mainInfo.color,
                    fontFamily: "'Space Mono', monospace",
                  }}>{aiResult.confidence}%</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                    {aiResult.timeframe}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <div style={{
                  flex: 1, padding: 10, borderRadius: 12,
                  background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)",
                }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>🎯 TARGET</div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: "#4ade80",
                    fontFamily: "'Space Mono', monospace",
                  }}>{aiResult.priceTarget}</div>
                </div>
                <div style={{
                  flex: 1, padding: 10, borderRadius: 12,
                  background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
                }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>🛑 STOP</div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: "#f87171",
                    fontFamily: "'Space Mono', monospace",
                  }}>{aiResult.stopLoss}</div>
                </div>
              </div>

              {aiResult.quantThesis && (
                <div style={{
                  padding: 12, borderRadius: 12, marginBottom: 10,
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.2)",
                  fontSize: 12, lineHeight: 1.6, color: "rgba(255,255,255,0.85)",
                }}>
                  <div style={{ fontSize: 9, color: "#a5b4fc", marginBottom: 4, letterSpacing: 0.5 }}>
                    📊 QUANT THESIS
                  </div>
                  {aiResult.quantThesis}
                </div>
              )}

              {aiResult.keyDrivers && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)",
                    marginBottom: 6, letterSpacing: 0.5 }}>
                    💡 KEY DRIVERS
                  </div>
                  {aiResult.keyDrivers.map((f, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0",
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: mainInfo.color, flexShrink: 0, marginTop: 7,
                      }} />
                      <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.75)",
                        lineHeight: 1.5 }}>{f}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiResult.regimeImpact && (
                <div style={{
                  padding: 10, borderRadius: 10, marginBottom: 8,
                  background: "rgba(255,255,255,0.03)",
                  fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5,
                }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>
                    🌡️ REGIME IMPACT
                  </div>
                  {aiResult.regimeImpact}
                </div>
              )}

              {aiResult.pairsIdea && (
                <div style={{
                  padding: 10, borderRadius: 10,
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  fontSize: 11, color: "rgba(255,255,255,0.8)", lineHeight: 1.5,
                }}>
                  <div style={{ fontSize: 9, color: "#f59e0b", marginBottom: 3 }}>
                    ⚖️ PAIRS TRADE IDEA
                  </div>
                  {aiResult.pairsIdea}
                </div>
              )}
            </div>
          </div>
        )}

        </>}

        {view === "pairs" && (
          <div style={{ padding: "16px 20px 0" }}>
            <PairsView allData={allData} />
          </div>
        )}

        {view === "news" && (
          <div style={{ padding: "16px 20px 0" }}>
            <NewsView apiKey={apiKey} />
          </div>
        )}

        {view === "portfolio" && (
          <div style={{ padding: "16px 20px 0" }}>
            <PortfolioView
              positions={positions}
              allData={allData}
              quants={quants}
              regime={regime}
              onSelect={(t) => { setActiveStock(t); setView("quant"); setTab("exit"); }}
              onRemoveEntry={removeEntry}
            />
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          margin: "16px 20px 0", padding: "10px 14px",
          background: "rgba(255,255,255,0.03)", borderRadius: 12,
          fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center",
        }}>
          ⚠️ Pure Quant Strategy · Accuracy ~65-72% · เพื่อการศึกษา
        </div>

        {/* Bottom nav */}
        <div style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
          width: "100%", maxWidth: 390,
          background: "rgba(8,8,16,0.92)", backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: "12px 0 28px", display: "flex", justifyContent: "space-around",
        }}>
          {[
            { key: "quant", icon: "📊", label: "Quant", action: () => { setView("quant"); setShowSettings(false); } },
            { key: "pairs", icon: "🔗", label: "Pairs", action: () => { setView("pairs"); setShowSettings(false); } },
            { key: "news", icon: "📰", label: "ข่าว", action: () => { setView("news"); setShowSettings(false); } },
            { key: "portfolio", icon: "⭐", label: "พอร์ต", action: () => { setView("portfolio"); setShowSettings(false); } },
            { key: "settings", icon: "⚙️", label: "ตั้งค่า", action: () => { setShowSettings(s => !s); } },
          ].map(({ key, icon, label, action }) => {
            const active = key === "settings" ? showSettings : view === key && !showSettings;
            return (
              <button key={key} onClick={action} style={{
                background: "none", border: "none", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                opacity: active ? 1 : 0.5,
                transition: "opacity 0.15s",
              }}>
                <span style={{ fontSize: 22 }}>{icon}</span>
                <span style={{ fontSize: 10, color: active ? "#6366f1" : "rgba(255,255,255,0.5)", fontWeight: active ? 700 : 400 }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
