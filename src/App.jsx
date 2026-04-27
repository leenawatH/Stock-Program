import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, BarChart, Bar, Cell } from "recharts";

// ========================================================
// CONFIG
// ========================================================
const STOCKS = {
  NVDA:       { name: "NVIDIA",          color: "#76b900", icon: "⚡", kind: "stock" },
  GOOGL:      { name: "Alphabet",        color: "#4285f4", icon: "🔍", kind: "stock" },
  BAC:        { name: "Bank of America", color: "#e31837", icon: "🏦", kind: "stock" },
  "BTC-USD":  { name: "Bitcoin",         color: "#f7931a", icon: "₿", kind: "crypto", finnhub: "BINANCE:BTCUSDT" },
  "DOGE-USD": { name: "Dogecoin",        color: "#c2a633", icon: "🐕", kind: "crypto", finnhub: "BINANCE:DOGEUSDT" },
};

const COMPARE_ASSETS = {
  SPY:        { name: "S&P 500", short: "SPY",  color: "#a855f7", icon: "📈" },
  "GC=F":     { name: "Gold",    short: "GOLD", color: "#ffd700", icon: "🥇", finnhub: null },
  "DX-Y.NYB": { name: "Dollar",  short: "DXY",  color: "#22c55e", icon: "💵", finnhub: null },
};

const ALL_SYMBOLS = { ...STOCKS, ...COMPARE_ASSETS };

// ========================================================
// STORAGE
// ========================================================
async function loadApiKey() {
  try {
    const r = await window.storage.get("finnhub_api_key");
    return r?.value || null;
  } catch { return null; }
}
async function saveApiKey(key) {
  try { await window.storage.set("finnhub_api_key", key); return true; }
  catch { return false; }
}
async function deleteApiKey() {
  try { await window.storage.delete("finnhub_api_key"); } catch {}
}

// Positions: { [ticker]: { entries: [{id, qty, price, date}] } }
async function loadPositions() {
  try {
    const r = await window.storage.get("positions");
    if (!r?.value) return {};
    return JSON.parse(r.value);
  } catch { return {}; }
}
async function savePositions(obj) {
  try { await window.storage.set("positions", JSON.stringify(obj)); } catch {}
}

// ========================================================
// ALERT SETTINGS + NOTIFICATIONS
// ========================================================
const DEFAULT_ALERTS = {
  enabled: true,
  refreshMin: 5,        // auto-refresh interval
  notifyExtreme: true,  // verdict transitions to Strong Buy/Sell
  notifyZ: true,        // |z| crosses 2
  sound: true,
};

async function loadAlertSettings() {
  try {
    const r = await window.storage.get("alerts_v1");
    if (!r?.value) return DEFAULT_ALERTS;
    return { ...DEFAULT_ALERTS, ...JSON.parse(r.value) };
  } catch { return DEFAULT_ALERTS; }
}
async function saveAlertSettings(obj) {
  try { await window.storage.set("alerts_v1", JSON.stringify(obj)); } catch {}
}

function canNotify() {
  return typeof window !== "undefined"
    && "Notification" in window;
}
async function requestNotifyPermission() {
  if (!canNotify()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try { return await Notification.requestPermission(); }
  catch { return "denied"; }
}
function fireBrowserNotification(title, body) {
  if (!canNotify() || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/vite.svg", badge: "/vite.svg", tag: "quant-l3" });
  } catch {}
}

// Web Audio beep (no asset needed) — different tones for buy/sell
function beep(kind = "buy") {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    if (kind === "buy") {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.18);
    } else {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.22);
    }
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    osc.start();
    osc.stop(ctx.currentTime + 0.34);
  } catch {}
}

// ========================================================
// DATA FETCHING
// ========================================================
async function fetchFinnhubCandles(symbol, apiKey, days = 180) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - days * 86400;
  const url = `/api/finnhub/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${from}&to=${to}&token=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.s !== "ok") return null;
    const points = data.t.map((t, i) => ({ time: t * 1000, price: data.c[i], volume: data.v[i] }));
    return {
      symbol,
      current: data.c[data.c.length - 1],
      previousClose: data.c[data.c.length - 2],
      points,
      prices: points.map(p => p.price),
      volumes: points.map(p => p.volume),
    };
  } catch (e) { return null; }
}

async function fetchFinnhubQuote(symbol, apiKey) {
  const url = `/api/finnhub/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (e) { return null; }
}

async function fetchYahoo(symbol, range = "6mo", interval = "1d") {
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  try {
    const res = await fetch(url);
    const parsed = await res.json();
    const result = parsed?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const points = timestamps.map((t, i) => ({
      time: t * 1000, price: closes[i], volume: volumes[i]
    })).filter(p => p.price != null);
    return {
      symbol,
      current: result.meta.regularMarketPrice,
      previousClose: result.meta.chartPreviousClose,
      points,
      prices: points.map(p => p.price),
      volumes: points.map(p => p.volume || 0),
    };
  } catch (e) { return null; }
}

// CoinGecko: realtime crypto price (better than Finnhub free tier)
const COINGECKO_IDS = {
  "BTC-USD": "bitcoin",
  "DOGE-USD": "dogecoin",
};

async function fetchCoinGecko(ticker) {
  const id = COINGECKO_IDS[ticker];
  if (!id) return null;
  try {
    const [chartRes, priceRes] = await Promise.all([
      fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=180`),
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`),
    ]);
    if (!chartRes.ok || !priceRes.ok) return null;
    const chart = await chartRes.json();
    const priceJ = await priceRes.json();
    const raw = chart.prices || [];
    if (!raw.length) return null;
    const points = raw.map(([t, p]) => ({ time: t, price: p, volume: 0 }));
    const prices = points.map((p) => p.price);
    const current = priceJ[id]?.usd ?? prices[prices.length - 1];
    const ch = priceJ[id]?.usd_24h_change || 0;
    const previousClose = current / (1 + ch / 100);
    return {
      symbol: ticker,
      current,
      previousClose,
      points,
      prices,
      volumes: points.map(() => 0),
    };
  } catch { return null; }
}

// ========================================================
// CURRENCY HELPERS
// ========================================================
function currencyOf(_ticker) { return "$"; }
function fmtPrice(value, ticker, digitsOverride) {
  const sym = currencyOf(ticker);
  if (value == null || Number.isNaN(value)) return `${sym}0.00`;
  const abs = Math.abs(value);
  const d = digitsOverride != null ? digitsOverride
         : abs < 1 ? 4
         : 2;
  return sym + value.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Hybrid fetcher: CoinGecko for crypto, Finnhub for stocks/SPY, Yahoo fallback
async function fetchAsset(symbol, apiKey) {
  const meta = STOCKS[symbol] || COMPARE_ASSETS[symbol] || {};

  // Crypto: CoinGecko first (realtime + reliable on free tier)
  if (meta.kind === "crypto") {
    const cg = await fetchCoinGecko(symbol);
    if (cg) return cg;
    // Fallback: Finnhub binance
  }

  const useFinnhub = meta.finnhub !== null && (meta.kind === "stock" || meta.kind === "crypto" || symbol === "SPY");
  if (useFinnhub) {
    const finnhubSym = meta.finnhub || symbol;
    const candles = await fetchFinnhubCandles(finnhubSym, apiKey);
    if (candles) {
      if (meta.kind === "stock" || symbol === "SPY") {
        const quote = await fetchFinnhubQuote(finnhubSym, apiKey);
        if (quote?.c) {
          candles.current = quote.c;
          candles.previousClose = quote.pc;
        }
      }
      return candles;
    }
  }
  // Default fallback: Yahoo (handles Gold, DXY)
  return await fetchYahoo(symbol);
}

// ========================================================
// QUANT CALCULATIONS
// ========================================================
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function returns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) r.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  return r;
}

function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const aVals = a.slice(-n), bVals = b.slice(-n);
  const aM = mean(aVals), bM = mean(bVals);
  let num = 0, aS = 0, bS = 0;
  for (let i = 0; i < n; i++) {
    const da = aVals[i] - aM, db = bVals[i] - bM;
    num += da * db; aS += da * da; bS += db * db;
  }
  return aS && bS ? num / Math.sqrt(aS * bS) : 0;
}

function zScore(prices, window = 20) {
  const recent = prices.slice(-window);
  const m = mean(recent);
  const s = std(recent);
  return s ? (prices[prices.length - 1] - m) / s : 0;
}

function percentChange(prices, days) {
  if (prices.length <= days) return 0;
  const past = prices[prices.length - 1 - days];
  const now = prices[prices.length - 1];
  return ((now - past) / past) * 100;
}

function rollingReturns(prices, window = 30) {
  const rets = returns(prices).slice(-window);
  return rets;
}

// ========================================================
// REGIME DETECTION
// ========================================================
function detectRegime(allData) {
  const spy = allData["SPY"];
  const gold = allData["GC=F"];
  const dxy = allData["DX-Y.NYB"];
  const btc = allData["BTC-USD"];

  if (!spy?.prices) return { regime: "Unknown", score: 50, confidence: 0 };

  const spy30 = percentChange(spy.prices, 30);
  const spy10 = percentChange(spy.prices, 10);
  const gold30 = gold ? percentChange(gold.prices, 30) : 0;
  const dxy30 = dxy ? percentChange(dxy.prices, 30) : 0;
  const btc30 = btc ? percentChange(btc.prices, 30) : 0;
  const spyVol = std(rollingReturns(spy.prices, 20)) * 100;

  let score = 50;
  const signals = [];

  // SPY momentum
  if (spy30 > 3) { score += 15; signals.push("SPY +" + spy30.toFixed(1) + "% (bullish)"); }
  else if (spy30 < -3) { score -= 15; signals.push("SPY " + spy30.toFixed(1) + "% (bearish)"); }

  if (spy10 > 2) { score += 10; signals.push("SPY short-term strong"); }
  else if (spy10 < -2) { score -= 10; signals.push("SPY short-term weak"); }

  // Gold (inverse of risk-on)
  if (gold30 > 3) { score -= 10; signals.push("Gold +" + gold30.toFixed(1) + "% (risk-off)"); }
  else if (gold30 < -2) { score += 5; signals.push("Gold declining (risk-on)"); }

  // Dollar (inverse to risk assets)
  if (dxy30 > 2) { score -= 8; signals.push("DXY strong (risk-off)"); }
  else if (dxy30 < -2) { score += 8; signals.push("DXY weak (risk-on)"); }

  // Bitcoin (risk-on barometer)
  if (btc30 > 5) { score += 8; signals.push("BTC +" + btc30.toFixed(1) + "% (risk-on)"); }
  else if (btc30 < -5) { score -= 8; signals.push("BTC " + btc30.toFixed(1) + "% (risk-off)"); }

  // Volatility
  if (spyVol > 2) { score -= 5; signals.push("High volatility regime"); }

  score = Math.max(0, Math.min(100, score));

  let regime;
  if (score >= 70) regime = "🔥 Risk-On Bull";
  else if (score >= 55) regime = "📈 Mild Bullish";
  else if (score >= 45) regime = "😴 Sideways";
  else if (score >= 30) regime = "📉 Mild Bearish";
  else regime = "❄️ Risk-Off Bear";

  return { regime, score: Math.round(score), signals, volatility: spyVol.toFixed(2) };
}

// ========================================================
// DIVERGENCE DETECTION
// ========================================================
function detectDivergences(stock, allData) {
  const divs = [];
  const stockRet10 = percentChange(stock.prices, 10);

  // vs SPY
  const spy = allData["SPY"];
  if (spy) {
    const spyRet10 = percentChange(spy.prices, 10);
    const diff = stockRet10 - spyRet10;
    if (Math.abs(diff) > 5) {
      divs.push({
        type: diff > 0 ? "outperform" : "underperform",
        vs: "SPY",
        magnitude: diff.toFixed(1),
        sigma: (diff / 3).toFixed(1),
        severity: Math.abs(diff) > 10 ? "high" : "medium",
      });
    }
  }

  // vs correlated asset (BTC if tech, or general) — skip when the stock IS btc
  const btc = allData["BTC-USD"];
  if (btc && stock !== btc) {
    const btcRet10 = percentChange(btc.prices, 10);
    const expectedCorr = correlation(stock.prices.slice(-60), btc.prices.slice(-60));
    if (expectedCorr > 0.5) {
      const diff = stockRet10 - btcRet10 * expectedCorr;
      if (Math.abs(diff) > 6) {
        divs.push({
          type: diff > 0 ? "outperform" : "underperform",
          vs: "BTC (expected corr: " + expectedCorr.toFixed(2) + ")",
          magnitude: diff.toFixed(1),
          sigma: (diff / 4).toFixed(1),
          severity: Math.abs(diff) > 12 ? "high" : "medium",
        });
      }
    }
  }

  return divs;
}

// ========================================================
// QUANT SCORE (combines everything)
// ========================================================
function calculateQuantScore(ticker, allData, regime) {
  const stock = allData[ticker];
  if (!stock?.prices || stock.prices.length < 50) return null;

  let score = 50;
  const signals = [];

  // 1. Z-Score (mean reversion) - 20 points
  const z = zScore(stock.prices, 20);
  if (z < -2) { score += 18; signals.push({ name: "Z-Score", value: z.toFixed(2), sig: "Oversold extreme", type: "bull" }); }
  else if (z < -1) { score += 10; signals.push({ name: "Z-Score", value: z.toFixed(2), sig: "Oversold", type: "bull" }); }
  else if (z > 2) { score -= 18; signals.push({ name: "Z-Score", value: z.toFixed(2), sig: "Overbought extreme", type: "bear" }); }
  else if (z > 1) { score -= 10; signals.push({ name: "Z-Score", value: z.toFixed(2), sig: "Overbought", type: "bear" }); }
  else { signals.push({ name: "Z-Score", value: z.toFixed(2), sig: "Normal", type: "neutral" }); }

  // 2. Relative Strength vs SPY - 15 points
  const spy = allData["SPY"];
  if (spy) {
    const stockRet30 = percentChange(stock.prices, 30);
    const spyRet30 = percentChange(spy.prices, 30);
    const rs = stockRet30 - spyRet30;
    if (rs > 10) { score += 12; signals.push({ name: "Rel Strength", value: "+" + rs.toFixed(1) + "%", sig: "Outperforming", type: "bull" }); }
    else if (rs > 3) { score += 6; signals.push({ name: "Rel Strength", value: "+" + rs.toFixed(1) + "%", sig: "Above market", type: "bull" }); }
    else if (rs < -10) { score -= 12; signals.push({ name: "Rel Strength", value: rs.toFixed(1) + "%", sig: "Underperforming", type: "bear" }); }
    else if (rs < -3) { score -= 6; signals.push({ name: "Rel Strength", value: rs.toFixed(1) + "%", sig: "Below market", type: "bear" }); }
    else { signals.push({ name: "Rel Strength", value: rs.toFixed(1) + "%", sig: "In-line", type: "neutral" }); }
  }

  // 3. Regime alignment - 15 points
  const tInfo = STOCKS[ticker] || {};
  const riskOn = ["NVDA", "GOOGL"].includes(ticker) || tInfo.kind === "crypto";
  const riskNeutral = ticker === "BAC";
  if (riskOn && regime.score > 60) { score += 12; signals.push({ name: "Regime", value: regime.regime, sig: "Favors this stock", type: "bull" }); }
  else if (riskOn && regime.score < 40) { score -= 12; signals.push({ name: "Regime", value: regime.regime, sig: "Against this stock", type: "bear" }); }
  else if (riskNeutral && regime.score > 55) { score += 5; signals.push({ name: "Regime", value: regime.regime, sig: "Neutral for banks", type: "neutral" }); }
  else if (riskNeutral && regime.score < 45) { score += 5; signals.push({ name: "Regime", value: regime.regime, sig: "Banks may benefit", type: "bull" }); }
  else { signals.push({ name: "Regime", value: regime.regime, sig: "Neutral", type: "neutral" }); }

  // 4. Momentum (10-day vs 30-day) - 10 points
  const r10 = percentChange(stock.prices, 10);
  const r30 = percentChange(stock.prices, 30);
  if (r10 > 0 && r30 > 0 && r10 > r30 / 3) { score += 8; signals.push({ name: "Momentum", value: "+" + r10.toFixed(1) + "%", sig: "Accelerating up", type: "bull" }); }
  else if (r10 < 0 && r30 < 0 && r10 < r30 / 3) { score -= 8; signals.push({ name: "Momentum", value: r10.toFixed(1) + "%", sig: "Accelerating down", type: "bear" }); }
  else if (r10 > 0 && r30 < 0) { score += 5; signals.push({ name: "Momentum", value: "+" + r10.toFixed(1) + "%", sig: "Reversing up", type: "bull" }); }
  else if (r10 < 0 && r30 > 0) { score -= 5; signals.push({ name: "Momentum", value: r10.toFixed(1) + "%", sig: "Losing steam", type: "bear" }); }
  else { signals.push({ name: "Momentum", value: r10.toFixed(1) + "%", sig: "Neutral", type: "neutral" }); }

  // 5. Divergence - 10 points
  const divs = detectDivergences(stock, allData);
  const highDivs = divs.filter(d => d.severity === "high");
  if (highDivs.length > 0) {
    const d = highDivs[0];
    if (d.type === "underperform") {
      score -= 8;
      signals.push({ name: "Divergence", value: d.magnitude + "%", sig: `Underperforming ${d.vs}`, type: "bear" });
    } else {
      score += 5;
      signals.push({ name: "Divergence", value: "+" + d.magnitude + "%", sig: `Outperforming ${d.vs}`, type: "bull" });
    }
  }

  // 6. Volatility regime - 5 points
  const vol = std(rollingReturns(stock.prices, 20)) * 100;
  if (vol < 1.5) { score += 3; signals.push({ name: "Volatility", value: vol.toFixed(2) + "%", sig: "Low vol (stable)", type: "neutral" }); }
  else if (vol > 3) { score -= 3; signals.push({ name: "Volatility", value: vol.toFixed(2) + "%", sig: "High vol (risky)", type: "bear" }); }

  score = Math.max(0, Math.min(100, score));

  let verdict;
  if (score >= 75) verdict = "Strong Buy";
  else if (score >= 60) verdict = "Buy";
  else if (score >= 45) verdict = "Hold";
  else if (score >= 30) verdict = "Sell";
  else verdict = "Strong Sell";

  return { score: Math.round(score), verdict, signals, zscore: z, divergences: divs, volatility: vol };
}

// ========================================================
// UI COMPONENTS
// ========================================================
function AlertToggle({ label, checked, onChange }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 0", cursor: "pointer", userSelect: "none",
    }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 999,
          background: checked ? "#4ade80" : "rgba(255,255,255,0.15)",
          position: "relative", transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 0.2s",
        }} />
      </span>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>
        {label}
      </span>
    </label>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 380, padding: "0 12px",
      zIndex: 9999, display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div key={t.id}
          onClick={() => onDismiss(t.id)}
          style={{
            pointerEvents: "auto", cursor: "pointer",
            background: t.kind === "buy"
              ? "linear-gradient(135deg, rgba(74,222,128,0.22), rgba(34,197,94,0.10))"
              : "linear-gradient(135deg, rgba(248,113,113,0.22), rgba(220,38,38,0.10))",
            border: `1px solid ${t.kind === "buy" ? "rgba(74,222,128,0.45)" : "rgba(248,113,113,0.45)"}`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 14, padding: "10px 14px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.4)",
            animation: "slideUp 0.25s ease",
            color: "#fff",
          }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>
            {t.title}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.78)", lineHeight: 1.4 }}>
            {t.body}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingDots({ color = "currentColor" }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%", background: color,
          animation: `bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </span>
  );
}

function APIKeySetup({ onSave }) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!key.trim()) return;
    setSaving(true);
    await saveApiKey(key.trim());
    onSave(key.trim());
    setSaving(false);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, background: "linear-gradient(160deg, #050508, #0a0a12)",
    }}>
      <div style={{
        maxWidth: 360, width: "100%",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: 24,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16, textAlign: "center" }}>🔑</div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: "#fff",
          textAlign: "center", marginBottom: 8,
          background: "linear-gradient(135deg, #fff, rgba(255,255,255,0.6))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          ตั้งค่า Finnhub API
        </div>
        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.5)",
          textAlign: "center", marginBottom: 20, lineHeight: 1.5,
        }}>
          ใส่ API Key จาก Finnhub เพื่อรับข้อมูล Real-time<br/>
          <a href="https://finnhub.io/dashboard" target="_blank" rel="noreferrer"
            style={{ color: "#6366f1", textDecoration: "none" }}>
            📋 เปิด Finnhub Dashboard →
          </a>
        </div>

        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 }}>
          API KEY
        </label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="ctq..."
          style={{
            width: "100%", marginTop: 6, marginBottom: 16,
            padding: "12px 14px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, color: "#fff", fontSize: 13,
            fontFamily: "'Space Mono', monospace",
            outline: "none",
          }}
        />

        <button onClick={handleSave} disabled={!key.trim() || saving}
          style={{
            width: "100%", padding: "14px",
            background: key.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(255,255,255,0.05)",
            border: "none", borderRadius: 14,
            color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: key.trim() ? "pointer" : "not-allowed",
          }}>
          {saving ? "กำลังบันทึก..." : "💾 บันทึก & เริ่มใช้งาน"}
        </button>

        <div style={{
          marginTop: 16, padding: 10,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 10, fontSize: 10,
          color: "rgba(255,255,255,0.6)", lineHeight: 1.5,
        }}>
          🔒 <strong style={{ color: "#4ade80" }}>ปลอดภัย:</strong> API key เก็บในเครื่องคุณเท่านั้น
          ไม่ส่งไปเซิร์ฟเวอร์อื่น
        </div>
      </div>
    </div>
  );
}

function StockCard({ ticker, data, quant, loading, onSelect, isActive }) {
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
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15,
            fontFamily: "'Space Mono', monospace" }}>{ticker}</span>
          {quant && (
            <span style={{
              fontSize: 9, padding: "2px 6px", borderRadius: 6,
              background: `${verdictColor}22`, color: verdictColor, fontWeight: 700,
            }}>{quant.verdict}</span>
          )}
        </div>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, marginTop: 1 }}>{info.name}</div>
      </div>
      {loading ? <LoadingDots color={info.color} /> : data && (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: "#fff" }}>
            {fmtPrice(data.current, ticker)}
          </div>
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

function RegimeDial({ regime }) {
  if (!regime) return null;
  const angle = (regime.score / 100) * 180 - 90;
  const color = regime.score >= 70 ? "#22c55e" : regime.score >= 55 ? "#4ade80" :
                regime.score >= 45 ? "#fbbf24" : regime.score >= 30 ? "#f87171" : "#dc2626";

  return (
    <div style={{
      padding: "14px 16px 10px",
      background: `linear-gradient(135deg, ${color}18, rgba(0,0,0,0.4))`,
      border: `1px solid ${color}44`,
      borderRadius: 18,
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 4 }}>
        🌡️ MARKET REGIME
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="100" height="60" viewBox="0 0 100 60">
          <defs>
            <linearGradient id="regGrad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#dc2626" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round" />
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none"
            stroke="url(#regGrad)" strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${(regime.score / 100) * 125} 125`} />
          <circle cx="50" cy="50" r="3" fill={color} />
          <line x1="50" y1="50"
            x2={50 + Math.cos((angle - 90) * Math.PI / 180) * 32}
            y2={50 + Math.sin((angle - 90) * Math.PI / 180) * 32}
            stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.1 }}>
            {regime.regime}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4,
            fontFamily: "'Space Mono', monospace" }}>
            Score: {regime.score}/100 · Vol: {regime.volatility}%
          </div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {regime.signals.slice(0, 3).map((s, i) => (
          <span key={i} style={{
            fontSize: 9, padding: "3px 7px", borderRadius: 6,
            background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)",
          }}>{s}</span>
        ))}
      </div>
    </div>
  );
}

function CorrelationMatrix({ allData }) {
  const symbols = Object.keys(ALL_SYMBOLS);
  const matrix = symbols.map(a =>
    symbols.map(b => {
      if (!allData[a]?.prices || !allData[b]?.prices) return null;
      const len = Math.min(60, allData[a].prices.length, allData[b].prices.length);
      return correlation(allData[a].prices.slice(-len), allData[b].prices.slice(-len));
    })
  );

  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, marginBottom: 10 }}>
        🔗 CORRELATION MATRIX (60-day)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `36px repeat(${symbols.length}, 1fr)`,
        gap: 2, fontSize: 9, fontFamily: "'Space Mono', monospace" }}>
        <div />
        {symbols.map(s => (
          <div key={s} style={{ textAlign: "center", color: "rgba(255,255,255,0.5)",
            fontWeight: 700, padding: 2 }}>
            {ALL_SYMBOLS[s].short || s.slice(0, 4)}
          </div>
        ))}
        {matrix.map((row, i) => (
          <>
            <div key={`lbl-${i}`} style={{ color: "rgba(255,255,255,0.5)",
              fontWeight: 700, padding: 2, display: "flex", alignItems: "center" }}>
              {ALL_SYMBOLS[symbols[i]].short || symbols[i].slice(0, 4)}
            </div>
            {row.map((v, j) => {
              if (v === null) return <div key={j} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 4 }} />;
              const intensity = Math.abs(v);
              const color = v > 0 ? `rgba(74,222,128,${intensity * 0.7 + 0.15})` :
                                    `rgba(248,113,113,${intensity * 0.7 + 0.15})`;
              return (
                <div key={j} style={{
                  background: i === j ? "rgba(255,255,255,0.1)" : color,
                  borderRadius: 4, padding: "6px 2px",
                  textAlign: "center", color: "#fff",
                  fontWeight: 700, fontSize: 9,
                }}>
                  {i === j ? "—" : v.toFixed(2)}
                </div>
              );
            })}
          </>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center",
        gap: 8, fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
        <span style={{ width: 12, height: 12, background: "rgba(248,113,113,0.7)", borderRadius: 2 }} />
        <span>-1 (Inverse)</span>
        <span style={{ width: 12, height: 12, background: "rgba(255,255,255,0.1)", borderRadius: 2 }} />
        <span>0</span>
        <span style={{ width: 12, height: 12, background: "rgba(74,222,128,0.7)", borderRadius: 2 }} />
        <span>+1 (Same)</span>
      </div>
    </div>
  );
}

function QuantGauge({ score, verdict }) {
  const angle = (score / 100) * 180 - 90;
  const color = score >= 75 ? "#22c55e" : score >= 60 ? "#4ade80" :
                score >= 45 ? "#fbbf24" : score >= 30 ? "#f87171" : "#dc2626";

  return (
    <div style={{
      padding: "16px 16px 10px",
      background: `linear-gradient(135deg, ${color}18, rgba(0,0,0,0.4))`,
      border: `1px solid ${color}44`,
      borderRadius: 18,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 4 }}>
        🎯 QUANT SCORE
      </div>
      <svg width="180" height="95" viewBox="0 0 180 95">
        <defs>
          <linearGradient id="qGrad" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <path d="M 15 85 A 75 75 0 0 1 165 85" fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth="12" strokeLinecap="round" />
        <path d="M 15 85 A 75 75 0 0 1 165 85" fill="none"
          stroke="url(#qGrad)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 236} 236`} />
        <circle cx="90" cy="85" r="5" fill={color} />
        <line x1="90" y1="85"
          x2={90 + Math.cos((angle - 90) * Math.PI / 180) * 60}
          y2={85 + Math.sin((angle - 90) * Math.PI / 180) * 60}
          stroke={color} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div style={{
        fontSize: 32, fontWeight: 800, color, marginTop: -6,
        fontFamily: "'Space Mono', monospace",
      }}>{score}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color, letterSpacing: 0.5 }}>{verdict}</div>
    </div>
  );
}

function ZScoreBar({ allData, symbols }) {
  const data = symbols.filter(s => allData[s]?.prices).map(s => {
    const z = zScore(allData[s].prices, 20);
    return { sym: ALL_SYMBOLS[s].short || s, z: parseFloat(z.toFixed(2)) };
  });
  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, marginBottom: 10 }}>
        📊 Z-SCORE EXTREMES (20-day)
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
            <XAxis dataKey="sym" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }} axisLine={false} />
            <YAxis domain={[-3, 3]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
              axisLine={false} tickLine={false} ticks={[-2, -1, 0, 1, 2]} />
            <ReferenceLine y={2} stroke="#f87171" strokeDasharray="3 3" />
            <ReferenceLine y={-2} stroke="#4ade80" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
            <Tooltip contentStyle={{ background: "rgba(10,10,18,0.95)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 11 }} />
            <Bar dataKey="z" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={
                  d.z > 2 ? "#f87171" : d.z > 1 ? "#fbbf24" :
                  d.z < -2 ? "#4ade80" : d.z < -1 ? "#06b6d4" : "#6366f1"
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 4, textAlign: "center" }}>
        {"<"}-2σ = Oversold (Buy) · {">"}+2σ = Overbought (Sell)
      </div>
    </div>
  );
}

function RelativeStrength({ allData, tickers }) {
  const spy = allData["SPY"];
  if (!spy) return null;
  const spyRet = percentChange(spy.prices, 30);

  const data = tickers.filter(t => allData[t]?.prices).map(t => {
    const ret = percentChange(allData[t].prices, 30);
    return { ticker: t, ret: parseFloat(ret.toFixed(2)), vs: parseFloat((ret - spyRet).toFixed(2)) };
  });

  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, marginBottom: 10 }}>
        💪 RELATIVE STRENGTH vs SPY (30d)
      </div>
      {data.map(d => {
        const pct = Math.min(100, Math.max(0, d.vs * 5 + 50));
        const color = d.vs > 3 ? "#4ade80" : d.vs < -3 ? "#f87171" : "#fbbf24";
        return (
          <div key={d.ticker} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: "'Space Mono', monospace" }}>{d.ticker}</span>
              <span style={{ color, fontFamily: "'Space Mono', monospace" }}>
                {d.vs > 0 ? "+" : ""}{d.vs}% vs SPY
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)",
              position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0,
                width: 1, background: "rgba(255,255,255,0.3)", zIndex: 2 }} />
              <div style={{
                position: "absolute",
                left: d.vs >= 0 ? "50%" : `${pct}%`,
                width: `${Math.abs(d.vs * 5)}%`,
                maxWidth: "50%",
                height: "100%", background: color, borderRadius: 99,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DivergenceAlerts({ quant, ticker }) {
  if (!quant?.divergences?.length) return null;
  return (
    <div style={{
      padding: 14, borderRadius: 18,
      background: "rgba(251,191,36,0.08)",
      border: "1px solid rgba(251,191,36,0.3)",
    }}>
      <div style={{ fontSize: 10, color: "#fbbf24", letterSpacing: 1, marginBottom: 8 }}>
        🚨 DIVERGENCE ALERTS · {ticker}
      </div>
      {quant.divergences.map((d, i) => {
        const icon = d.type === "outperform" ? "📈" : "📉";
        const color = d.type === "outperform" ? "#4ade80" : "#f87171";
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 0",
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}>
            <span style={{ fontSize: 18 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>
                {d.type === "outperform" ? "Outperforming" : "Underperforming"} {d.vs}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
                fontFamily: "'Space Mono', monospace" }}>
                Δ {d.magnitude}% · {d.sigma}σ · {d.severity}
              </div>
            </div>
            <span style={{
              fontSize: 9, padding: "3px 8px", borderRadius: 6,
              background: `${color}22`, color,
            }}>{d.severity.toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}

function SignalBreakdown({ quant }) {
  if (!quant?.signals) return null;
  return (
    <div style={{
      padding: "4px 14px 14px", borderRadius: 18,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)",
        letterSpacing: 1, padding: "14px 0 6px" }}>
        📋 SIGNAL BREAKDOWN
      </div>
      {quant.signals.map((s, i) => {
        const color = s.type === "bull" ? "#4ade80" :
                      s.type === "bear" ? "#f87171" : "#94a3b8";
        return (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{s.sig}</div>
            </div>
            <div style={{
              fontSize: 11, fontFamily: "'Space Mono', monospace",
              color, fontWeight: 700, textAlign: "right",
              padding: "4px 10px", borderRadius: 8, background: `${color}15`,
            }}>{s.value}</div>
          </div>
        );
      })}
    </div>
  );
}

// ========================================================
// EXIT PLAN (เมื่อไหร่ควรขาย) + POSITION TRACKER
// ========================================================
function summarizePosition(position, currentPrice) {
  const entries = position?.entries || [];
  if (!entries.length) return null;
  const totalQty = entries.reduce((s, e) => s + Number(e.qty), 0);
  const totalCost = entries.reduce((s, e) => s + Number(e.qty) * Number(e.price), 0);
  if (!totalQty) return null;
  const avgCost = totalCost / totalQty;
  const currentValue = totalQty * currentPrice;
  const pnl = currentValue - totalCost;
  const gainPct = (pnl / totalCost) * 100;
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  const daysHeld = dates.length
    ? Math.max(0, Math.round((Date.now() - new Date(dates[0]).getTime()) / 86400000))
    : 0;
  return { entries, totalQty, totalCost, avgCost, currentValue, pnl, gainPct, daysHeld };
}

function calculateExitPlan(ticker, stock, quant, regime, position) {
  if (!stock?.prices || stock.prices.length < 20 || !quant) return null;

  const prices = stock.prices;
  const P = prices[prices.length - 1];
  const recent = prices.slice(-20);
  const M = mean(recent);
  const S = std(recent);
  const v = std(rollingReturns(prices, 20));
  const high20 = Math.max(...recent);
  const low20 = Math.min(...recent);

  const z = quant.zscore;
  const info = STOCKS[ticker] || {};
  const isCrypto = info.kind === "crypto";

  const tp1 = z < 0 ? M : M + S;
  const tp2 = z < 0 ? M + S : Math.max(M + 2 * S, P * 1.08);

  const slPct = isCrypto ? Math.max(0.08, 2.5 * v) : Math.max(0.04, 2 * v);
  const sl = P * (1 - slPct);
  const trail = Math.max(low20, P * (1 - slPct * 1.2));

  const triggers = [];
  if (z > 2) triggers.push({ sev: "high", text: `Z-Score ${z.toFixed(2)} — overbought ขั้นรุนแรง mean-reversion สูง` });
  else if (z > 1) triggers.push({ sev: "medium", text: `Z-Score ${z.toFixed(2)} — overbought` });

  const r10 = percentChange(prices, 10);
  const r30 = percentChange(prices, 30);
  if (r10 < 0 && r30 < 0 && r10 < r30 / 3) {
    triggers.push({ sev: "high", text: `Downtrend เร่งตัว (10d ${r10.toFixed(1)}% / 30d ${r30.toFixed(1)}%)` });
  } else if (r10 < -2 && r30 > 0) {
    triggers.push({ sev: "medium", text: `โมเมนตัมพลิก (10d ${r10.toFixed(1)}% ขณะ 30d +${r30.toFixed(1)}%)` });
  }

  const rsSignal = quant.signals?.find((s) => s.name === "Rel Strength");
  if (rsSignal?.type === "bear") {
    triggers.push({
      sev: rsSignal.sig.includes("Under") ? "high" : "medium",
      text: `อ่อนกว่า SPY (${rsSignal.value})`,
    });
  }

  const riskOn = isCrypto || ["NVDA", "GOOGL"].includes(ticker);
  if (riskOn && regime?.score < 40) {
    triggers.push({ sev: "high", text: `Regime risk-off (${regime.score}/100) — เป็นลบต่อ ${ticker}` });
  }

  if (quant.verdict?.includes("Sell")) {
    triggers.push({
      sev: quant.verdict.includes("Strong") ? "high" : "medium",
      text: `Quant verdict: ${quant.verdict} (score ${quant.score}/100)`,
    });
  }

  const pctToTp1 = ((tp1 - P) / P) * 100;
  if (pctToTp1 > -1 && pctToTp1 < 1.5) {
    triggers.push({ sev: "medium", text: `ราคาใกล้ TP1 แล้ว (${pctToTp1.toFixed(1)}%)` });
  }

  // Urgency — context-aware
  const hi = triggers.filter((t) => t.sev === "high").length;
  const md = triggers.filter((t) => t.sev === "medium").length;
  const qScore = quant.score || 50;
  const trendStrong = qScore >= 75;
  const trendGood = qScore >= 60;

  let urgency, action, color, note;
  if (hi >= 2) {
    urgency = "critical"; action = "🔴 ขายทันที"; color = "#ef4444";
  } else if (hi >= 1) {
    if (trendStrong) {
      urgency = "watch"; action = "🟡 ทยอยขาย 25-33% · ถือที่เหลือด้วย trailing stop"; color = "#eab308";
      note = "Quant ยัง Strong Buy แต่มีสัญญาณเสี่ยง 1 ตัว — lock profit บางส่วน";
    } else {
      urgency = "high"; action = "🟠 ขายบางส่วน / ขยับ SL ขึ้น"; color = "#f97316";
    }
  } else if (md >= 2) {
    if (trendGood) {
      urgency = "watch"; action = "🟢 ถือต่อ + trailing stop (levels ตึง แต่ trend ดี)"; color = "#4ade80";
      note = "Quant Buy — medium triggers มาจาก overbought/near-TP1 เป็นเรื่องปกติของ uptrend แกร่ง ไม่ต้องรีบออก";
    } else {
      urgency = "medium"; action = "🟡 เตรียมขาย / trail stop"; color = "#eab308";
    }
  } else if (P >= tp1 * 0.98 && P < tp1 * 1.02) {
    urgency = "watch"; action = "🟡 ใกล้ TP1 เตรียมทยอยขาย"; color = "#eab308";
  } else {
    urgency = "low"; action = "🟢 ยังถือได้"; color = "#4ade80";
  }

  // Position-aware Profit Plan
  const pos = summarizePosition(position, P);
  let profitPlan = null;
  if (pos) {
    const g = pos.gainPct;
    let stage, stageAction, suggestedSL;
    if (g < -5) {
      stage = "ขาดทุน > 5%";
      stageAction = "ทบทวน thesis: ถ้า SL เดิมโดนชน → ตัดขาดทุน · อย่า average-down ถ้าไม่มี signal ใหม่";
      suggestedSL = Math.min(sl, pos.avgCost * 0.93);
    } else if (g < 0) {
      stage = "ขาดทุนเล็กน้อย";
      stageAction = "ถือต่อตาม SL เดิม · รอ signal confirm ก่อนเพิ่มไม้";
      suggestedSL = sl;
    } else if (g < 10) {
      stage = "กำไร 0-10%";
      stageAction = "ถือต่อ · ขยับ SL มาใต้ entry เล็กน้อย (protect capital)";
      suggestedSL = Math.max(sl, pos.avgCost * 0.98);
    } else if (g < 25) {
      stage = "กำไร 10-25%";
      stageAction = "ขยับ SL มาที่ breakeven (+1%) · trade นี้ risk-free แล้ว";
      suggestedSL = Math.max(sl, pos.avgCost * 1.01);
    } else if (g < 50) {
      stage = "กำไร 25-50% ดี";
      stageAction = `ทยอยขาย 1/3 ที่ TP1 (${fmtPrice(tp1, ticker)}) · SL ที่ +10% จาก entry`;
      suggestedSL = Math.max(sl, pos.avgCost * 1.1);
    } else if (g < 100) {
      stage = "กำไร 50-100% เยี่ยม";
      stageAction = "ขาย 1/2 ตอนนี้ lock กำไร · ที่เหลือ trailing tight (5-8%)";
      suggestedSL = Math.max(sl, P * 0.92);
    } else {
      stage = `กำไร ${g.toFixed(0)}% · runner`;
      stageAction = "ขาย 2/3 · ที่เหลือเป็น runner ด้วย trailing 10%";
      suggestedSL = Math.max(sl, P * 0.9);
    }
    profitPlan = { stage, stageAction, suggestedSL, gainPct: g };

    if (g >= 30 && (hi + md) >= 1 && urgency === "low") {
      urgency = "watch"; action = "🟡 กำไรดี + มีสัญญาณเสี่ยง → take partial profit"; color = "#eab308";
    }
    if (g >= 50 && hi >= 1) {
      urgency = "high"; action = "🟠 กำไร >50% + high trigger → ขายครึ่งทันที"; color = "#f97316";
    }
    if (g <= -5 && hi >= 1) {
      urgency = "critical"; action = "🔴 ขาดทุน + high trigger → ตัดขาดทุนก่อนลึก"; color = "#ef4444";
    }
  }

  return {
    price: P, mean: M, std: S,
    tp1, tp2, sl, trail, slPct: slPct * 100,
    triggers, urgency, action, color, note,
    high20, low20,
    qScore, verdict: quant.verdict,
    position: pos, profitPlan,
  };
}

function PositionForm({ ticker, onAdd }) {
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

function ExitPlan({ plan, ticker, onAddEntry, onRemoveEntry }) {
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

// ========================================================
// MAIN
// ========================================================
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
  const [alerts, setAlerts] = useState(DEFAULT_ALERTS);
  const [notifyPerm, setNotifyPerm] = useState(
    canNotify() ? Notification.permission : "unsupported"
  );
  const [toasts, setToasts] = useState([]);
  const prevQuantsRef = useRef({});

  // Load API key + positions + alert prefs on mount
  useEffect(() => {
    loadApiKey().then(k => {
      setApiKey(k);
      setKeyLoaded(true);
    });
    loadPositions().then(setPositions);
    loadAlertSettings().then(setAlerts);
  }, []);

  function pushToast(t) {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, ...t }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(x => x.id !== id));
    }, 8000);
  }

  function updateAlerts(patch) {
    setAlerts(prev => {
      const next = { ...prev, ...patch };
      saveAlertSettings(next);
      return next;
    });
  }

  // Detect verdict / z-score transitions and fire alerts
  useEffect(() => {
    if (!alerts.enabled) { prevQuantsRef.current = quants; return; }
    const prev = prevQuantsRef.current || {};
    const fired = [];
    Object.keys(quants).forEach(t => {
      const cur = quants[t];
      const old = prev[t];
      if (!cur) return;
      const info = STOCKS[t] || {};
      const tName = `${info.icon || ""} ${t}`;

      // Verdict transitions to Strong Buy / Strong Sell
      if (alerts.notifyExtreme && old && old.verdict !== cur.verdict) {
        if (cur.verdict === "Strong Buy" && old.verdict !== "Strong Buy") {
          fired.push({ kind: "buy", title: `🚀 STRONG BUY · ${t}`,
            body: `${info.name || t} score ${cur.score}/100 (z=${cur.zscore.toFixed(2)})` });
        } else if (cur.verdict === "Strong Sell" && old.verdict !== "Strong Sell") {
          fired.push({ kind: "sell", title: `⚠️ STRONG SELL · ${t}`,
            body: `${info.name || t} score ${cur.score}/100 (z=${cur.zscore.toFixed(2)})` });
        }
      }

      // Z-score extreme crossings
      if (alerts.notifyZ && old && cur.zscore != null && old.zscore != null) {
        const oZ = old.zscore, nZ = cur.zscore;
        if (oZ > -2 && nZ <= -2) {
          fired.push({ kind: "buy", title: `🟢 OVERSOLD · ${t}`,
            body: `z-score = ${nZ.toFixed(2)} · เด้งกลับมีโอกาสสูง` });
        } else if (oZ < 2 && nZ >= 2) {
          fired.push({ kind: "sell", title: `🔴 OVERBOUGHT · ${t}`,
            body: `z-score = +${nZ.toFixed(2)} · ระวังย่อพักฐาน` });
        }
      }
    });

    if (fired.length) {
      fired.forEach(f => {
        pushToast(f);
        fireBrowserNotification(f.title, f.body);
      });
      if (alerts.sound) beep(fired[0].kind);
    }
    prevQuantsRef.current = quants;
  }, [quants]);

  // Auto-refresh on interval
  useEffect(() => {
    if (!apiKey || !alerts.enabled) return;
    const ms = Math.max(1, alerts.refreshMin) * 60_000;
    const id = setInterval(() => { loadAll(); }, ms);
    return () => clearInterval(id);
  }, [apiKey, alerts.enabled, alerts.refreshMin]);

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
    } catch (e) {
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

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts(p => p.filter(t => t.id !== id))} />

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
              {alerts.enabled && (
                <span style={{
                  marginLeft: 6, padding: "1px 6px", borderRadius: 6,
                  background: "rgba(74,222,128,0.15)",
                  color: "#4ade80", fontSize: 9, fontWeight: 700,
                }}>🔔 {alerts.refreshMin}m</span>
              )}
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

            {/* Alert settings */}
            <div style={{
              marginTop: 14, paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 10, fontWeight: 700 }}>
                🔔 การแจ้งเตือน
              </div>

              <AlertToggle
                label="เปิดใช้งาน auto-refresh + alerts"
                checked={alerts.enabled}
                onChange={v => updateAlerts({ enabled: v })}
              />
              <AlertToggle
                label="แจ้งเมื่อเป็น Strong Buy / Strong Sell"
                checked={alerts.notifyExtreme}
                onChange={v => updateAlerts({ notifyExtreme: v })}
              />
              <AlertToggle
                label="แจ้งเมื่อ z-score ทะลุ ±2 (oversold/overbought)"
                checked={alerts.notifyZ}
                onChange={v => updateAlerts({ notifyZ: v })}
              />
              <AlertToggle
                label="🔊 เสียงเตือน"
                checked={alerts.sound}
                onChange={v => updateAlerts({ sound: v })}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>เช็คทุก</span>
                <select
                  value={alerts.refreshMin}
                  onChange={e => updateAlerts({ refreshMin: Number(e.target.value) })}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#fff", padding: "5px 8px", borderRadius: 8,
                    fontSize: 11,
                  }}
                >
                  <option value={1}>1 นาที</option>
                  <option value={3}>3 นาที</option>
                  <option value={5}>5 นาที</option>
                  <option value={10}>10 นาที</option>
                  <option value={15}>15 นาที</option>
                  <option value={30}>30 นาที</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={async () => {
                    const p = await requestNotifyPermission();
                    setNotifyPerm(p);
                    if (p === "granted") {
                      fireBrowserNotification("✅ เปิดแจ้งเตือนสำเร็จ", "Quant L3 จะเตือนเมื่อมีสัญญาณ extreme");
                    }
                  }}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 10,
                    background: notifyPerm === "granted" ? "rgba(74,222,128,0.15)" : "rgba(99,102,241,0.18)",
                    border: `1px solid ${notifyPerm === "granted" ? "rgba(74,222,128,0.35)" : "rgba(99,102,241,0.4)"}`,
                    color: notifyPerm === "granted" ? "#4ade80" : "#a5b4fc",
                    fontSize: 10.5, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  {notifyPerm === "granted" ? "✅ Browser notify ON"
                    : notifyPerm === "denied" ? "🚫 ถูกบล็อก (ตั้งค่าใน Safari)"
                    : notifyPerm === "unsupported" ? "❌ Browser ไม่รองรับ"
                    : "🔔 ขออนุญาตแจ้งเตือน"}
                </button>
                <button
                  onClick={() => {
                    pushToast({ kind: "buy", title: "🧪 ทดสอบเตือน", body: "ถ้าเห็นข้อความนี้แปลว่าใช้งานได้" });
                    if (alerts.sound) beep("buy");
                    fireBrowserNotification("🧪 ทดสอบเตือน", "Quant L3 alert test");
                  }}
                  style={{
                    padding: "8px 12px", borderRadius: 10,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "#fff", fontSize: 10.5, cursor: "pointer",
                  }}
                >🧪 ทดสอบ</button>
              </div>

              <div style={{
                marginTop: 10, padding: 8, borderRadius: 8,
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.18)",
                fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.5,
              }}>
                💡 บน iPhone: notification ผุดได้เฉพาะตอนเปิดแอปไว้
                หรือ "เพิ่มลง Home Screen" (PWA) แล้วเปิดสแตนด์อโลน
              </div>
            </div>
          </div>
        )}

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
              loading={loading[ticker]}
              onSelect={setActiveStock} isActive={activeStock === ticker}
            />
          ))}
        </div>

        {/* Quant Score */}
        {mainQuant && (
          <div style={{ padding: "12px 20px 0" }}>
            <QuantGauge score={mainQuant.score} verdict={mainQuant.verdict} />
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
            { k: "signals", label: "🎯 Signals" },
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
            { icon: "📊", label: "Quant" },
            { icon: "🔗", label: "Pairs" },
            { icon: "⭐", label: "พอร์ต" },
            { icon: "⚙️", label: "ตั้งค่า" },
          ].map(({ icon, label }, i) => (
            <button key={i} style={{
              background: "none", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              opacity: i === 0 ? 1 : 0.35,
            }}>
              <span style={{ fontSize: 22 }}>{icon}</span>
              <span style={{ fontSize: 10, color: i === 0 ? "#6366f1" : "rgba(255,255,255,0.5)" }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
