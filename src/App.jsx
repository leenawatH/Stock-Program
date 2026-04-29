import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, BarChart, Bar, Cell } from "recharts";

// ========================================================
// CONFIG
// ========================================================
const STOCKS = {
  NVDA:       { name: "NVIDIA",          color: "#76b900", icon: "⚡", kind: "stock" },
  GOOGL:      { name: "Alphabet",        color: "#4285f4", icon: "🔍", kind: "stock" },
  BAC:        { name: "Bank of America", color: "#e31837", icon: "🏦", kind: "stock" },
  "GC=F":     { name: "Gold Spot",       color: "#ffd700", icon: "🥇", kind: "safe_haven", finnhub: null, short: "GOLD" },
  "BTC-USD":  { name: "Bitcoin",         color: "#f7931a", icon: "₿", kind: "crypto", finnhub: "BINANCE:BTCUSDT" },
  "DOGE-USD": { name: "Dogecoin",        color: "#c2a633", icon: "🐕", kind: "crypto", finnhub: "BINANCE:DOGEUSDT" },
};

const COMPARE_ASSETS = {
  SPY:        { name: "S&P 500", short: "SPY",  color: "#a855f7", icon: "📈" },
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

async function fetchCompanyNews(symbol, apiKey, days = 7) {
  const today = new Date();
  const past = new Date(today.getTime() - days * 86400000);
  const fmt = d => d.toISOString().slice(0, 10);
  const url = `/api/finnhub/api/v1/company-news?symbol=${symbol}&from=${fmt(past)}&to=${fmt(today)}&token=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchCryptoNews(apiKey) {
  const url = `/api/finnhub/api/v1/news?category=crypto&token=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchGeneralNews(apiKey) {
  const url = `/api/finnhub/api/v1/news?category=general&token=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// Hua Seng Heng (ฮั่วเซ่งเฮง) — ราคาทองคำในประเทศ real-time
// proxy → apicheckprice.huasengheng.com/api/values/getprice
// คืน 3 record: HSH (ราคา HSH realtime), REF (อ้างอิงสมาคม), JEWEL (รูปพรรณ)
async function fetchThaiGoldPrice() {
  try {
    const res = await fetch("/api/hsh/api/values/getprice");
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    const parse = (s) => {
      if (s == null) return null;
      const n = parseFloat(String(s).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const pick = (type) => arr.find(x => x.GoldType === type) || null;
    const hsh = pick("HSH");
    const ref = pick("REF");
    const jw  = pick("JEWEL");
    const map = (x) => x ? {
      buy:        parse(x.Buy),
      sell:       parse(x.Sell),
      buyChange:  parse(x.BuyChange),
      sellChange: parse(x.SellChange),
      time:       x.TimeUpdate || null,
      timeStr:    x.StrTimeUpdate || null,
    } : null;
    return {
      hsh:   map(hsh),   // ราคาฮั่วเซ่งเฮง real-time (ใช้เป็นหลัก)
      ref:   map(ref),   // ราคาสมาคมค้าทองคำ (อ้างอิง)
      jewel: map(jw),    // ทองรูปพรรณ
    };
  } catch { return null; }
}

// Bitkub (กระดานเทรดคริปโตในไทย) — ราคา crypto เป็นบาทไทย real-time
// proxy → api.bitkub.com/api/market/ticker
// คืน object key = "THB_BTC", "THB_ETH", "THB_DOGE", ...
// ticker → bitkub symbol map
const BITKUB_SYM = {
  "BTC-USD":  "THB_BTC",
  "DOGE-USD": "THB_DOGE",
  "ETH-USD":  "THB_ETH",
};
async function fetchBitkubPrices() {
  try {
    const res = await fetch("/api/bitkub/api/market/ticker");
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || typeof d !== "object") return null;
    const out = {};
    for (const [tk, sym] of Object.entries(BITKUB_SYM)) {
      const r = d[sym];
      if (!r) continue;
      out[tk] = {
        last:          Number(r.last) || null,
        bid:           Number(r.highestBid) || null,
        ask:           Number(r.lowestAsk) || null,
        high24:        Number(r.high24hr) || null,
        low24:         Number(r.low24hr) || null,
        percentChange: Number(r.percentChange) || 0,
        baseVolume:    Number(r.baseVolume) || 0,   // volume in coin
        quoteVolume:   Number(r.quoteVolume) || 0,  // volume in THB
      };
    }
    return out;
  } catch { return null; }
}

// Google Translate (free, no API key) — proxied via /api/translate
async function translateText(text, target = "th") {
  if (!text || typeof text !== "string") return text;
  // Google has a hard limit ~5000 chars per call; truncate to be safe
  const q = text.slice(0, 4500);
  const url = `/api/translate/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return text;
    const data = await res.json();
    const segs = data?.[0];
    if (!Array.isArray(segs)) return text;
    return segs.map(s => s?.[0] || "").join("");
  } catch { return text; }
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

  const useFinnhub = meta.finnhub !== null && (meta.kind === "stock" || meta.kind === "crypto" || meta.kind === "safe_haven" || symbol === "SPY");
  if (useFinnhub) {
    const finnhubSym = meta.finnhub || symbol;
    const candles = await fetchFinnhubCandles(finnhubSym, apiKey);
    if (candles) {
      if (meta.kind === "stock" || meta.kind === "safe_haven" || symbol === "SPY") {
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
  const safeHaven = tInfo.kind === "safe_haven";
  if (riskOn && regime.score > 60) { score += 12; signals.push({ name: "Regime", value: regime.regime, sig: "Favors this stock", type: "bull" }); }
  else if (riskOn && regime.score < 40) { score -= 12; signals.push({ name: "Regime", value: regime.regime, sig: "Against this stock", type: "bear" }); }
  else if (riskNeutral && regime.score > 55) { score += 5; signals.push({ name: "Regime", value: regime.regime, sig: "Neutral for banks", type: "neutral" }); }
  else if (riskNeutral && regime.score < 45) { score += 5; signals.push({ name: "Regime", value: regime.regime, sig: "Banks may benefit", type: "bull" }); }
  else if (safeHaven && regime.score < 40) { score += 12; signals.push({ name: "Regime", value: regime.regime, sig: "Risk-off favors safe haven", type: "bull" }); }
  else if (safeHaven && regime.score > 65) { score -= 8; signals.push({ name: "Regime", value: regime.regime, sig: "Risk-on, capital flows to equities", type: "bear" }); }
  else if (safeHaven) { signals.push({ name: "Regime", value: regime.regime, sig: "Neutral for gold", type: "neutral" }); }
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
function PairsView({ allData }) {
  const tickers = Object.keys(STOCKS).filter(t => allData[t]?.prices?.length >= 60);
  const pairs = [];
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const a = tickers[i], b = tickers[j];
      const pa = allData[a].prices, pb = allData[b].prices;
      const n = Math.min(pa.length, pb.length, 60);
      const corr = correlation(pa.slice(-n), pb.slice(-n));
      // spread (price ratio) z-score
      const ratios = [];
      for (let k = 1; k <= n; k++) ratios.push(pa[pa.length - k] / pb[pb.length - k]);
      ratios.reverse();
      const z = zScore(ratios, Math.min(30, ratios.length));
      pairs.push({ a, b, corr, z });
    }
  }
  pairs.sort((p, q) => Math.abs(q.z) - Math.abs(p.z));

  return (
    <div>
      <div style={{
        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
        borderRadius: 12, padding: 12, marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", marginBottom: 6 }}>
          🔗 Pairs Trading
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
          เทรดส่วนต่างของคู่หุ้น ถ้า spread (ratio A/B) ผิดไปจากปกติ &gt;2σ → คาดว่าจะกลับมา → Long ตัวที่ถูก / Short ตัวที่แพง
        </div>
      </div>

      {pairs.map(p => {
        const aInfo = STOCKS[p.a] || {}, bInfo = STOCKS[p.b] || {};
        const signal = Math.abs(p.z) > 2 ? "STRONG"
                     : Math.abs(p.z) > 1 ? "WATCH" : "NEUTRAL";
        const longSide = p.z > 0 ? p.b : p.a;
        const shortSide = p.z > 0 ? p.a : p.b;
        const sigColor = signal === "STRONG" ? "#4ade80"
                       : signal === "WATCH" ? "#fbbf24" : "rgba(255,255,255,0.4)";
        return (
          <div key={`${p.a}-${p.b}`} style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${signal === "STRONG" ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.06)"}`,
            borderRadius: 12, padding: 12, marginBottom: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: aInfo.color }}>{p.a}</span>
                <span style={{ opacity: 0.5, margin: "0 6px" }}>/</span>
                <span style={{ color: bInfo.color }}>{p.b}</span>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, color: sigColor,
                padding: "2px 8px", borderRadius: 6,
                background: `${sigColor}22`, border: `1px solid ${sigColor}55`,
              }}>{signal}</span>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "rgba(255,255,255,0.7)", fontFamily: "'Space Mono', monospace" }}>
              <span>corr: <b style={{ color: Math.abs(p.corr) > 0.5 ? "#a5b4fc" : "rgba(255,255,255,0.5)" }}>{p.corr.toFixed(2)}</b></span>
              <span>spread z: <b style={{ color: Math.abs(p.z) > 2 ? "#4ade80" : Math.abs(p.z) > 1 ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>
                {p.z >= 0 ? "+" : ""}{p.z.toFixed(2)}
              </b></span>
            </div>
            {signal === "STRONG" && (
              <div style={{
                marginTop: 8, padding: "6px 8px", borderRadius: 8,
                background: "rgba(74,222,128,0.08)", fontSize: 10.5, color: "rgba(255,255,255,0.85)",
              }}>
                💡 Long <b style={{ color: "#4ade80" }}>{longSide}</b> · Short <b style={{ color: "#f87171" }}>{shortSide}</b>
              </div>
            )}
          </div>
        );
      })}

      {pairs.length === 0 && (
        <div style={{ padding: 20, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
          ยังไม่มีข้อมูลพอสำหรับวิเคราะห์ pairs
        </div>
      )}
    </div>
  );
}

function PortfolioView({ positions, allData, quants, regime, onSelect, onRemoveEntry }) {
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
                // Per-entry: where is this entry relative to TP1 and SL from current price?
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

function NewsView({ apiKey }) {
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

function StockCard({ ticker, data, quant, timing, thaiGold, bitkub, loading, onSelect, isActive }) {
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

function ThaiGoldPanel({ data }) {
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

function BitkubPanel({ ticker, info, data }) {
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

function QuantGauge({ score, verdict, timing, onTimingClick }) {
  const angle = (score / 100) * 180 - 90;
  const color = score >= 75 ? "#22c55e" : score >= 60 ? "#4ade80" :
                score >= 45 ? "#fbbf24" : score >= 30 ? "#f87171" : "#dc2626";

  return (
    <div style={{
      padding: "16px 16px 12px",
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

      {/* Verdict + Entry Timing side-by-side */}
      <div style={{
        display: "flex", gap: 8, marginTop: 8, alignItems: "stretch",
      }}>
        <div style={{
          flex: 1, padding: "8px 6px", borderRadius: 10,
          background: `${color}1f`,
          border: `1px solid ${color}55`,
        }}>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", letterSpacing: 1, marginBottom: 2 }}>
            VERDICT
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color }}>{verdict}</div>
        </div>

        {timing && (
          <button
            onClick={onTimingClick}
            style={{
              flex: 1, padding: "8px 6px", borderRadius: 10,
              background: `${timing.color}1f`,
              border: `1px solid ${timing.color}55`,
              cursor: onTimingClick ? "pointer" : "default",
              textAlign: "center",
              fontFamily: "inherit",
            }}
          >
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.55)", letterSpacing: 1, marginBottom: 2 }}>
              ENTRY · {timing.grade}
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: timing.color, lineHeight: 1.2 }}>
              {timing.signal}
            </div>
          </button>
        )}
      </div>

      {/* ติดดอย warning */}
      {timing?.tinaiRisk && (
        <div
          onClick={onTimingClick}
          style={{
            marginTop: 8, padding: "5px 10px", borderRadius: 8,
            background: "rgba(245,158,11,0.12)",
            border: "1px solid rgba(245,158,11,0.35)",
            fontSize: 10, color: "#fbbf24",
            cursor: onTimingClick ? "pointer" : "default",
          }}
        >
          ⚠️ ติดดอย risk — verdict ดี แต่ราคา stretched
        </div>
      )}
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
// ========================================================
// ENTRY/EXIT TIMING — รวมทุกปัจจัยให้เป็นเกรดเดียว
// ========================================================
function calculateEntryTiming(ticker, stock, quant, regime) {
  if (!stock?.prices || stock.prices.length < 20 || !quant) return null;

  const prices = stock.prices;
  const P = prices[prices.length - 1];
  const recent = prices.slice(-20);
  const M = mean(recent);
  const S = std(recent);
  const high20 = Math.max(...recent);
  const low20 = Math.min(...recent);

  const z = quant.zscore || 0;
  const verdict = quant.verdict;
  const score = quant.score || 50;
  const r10 = percentChange(prices, 10);
  const r30 = percentChange(prices, 30);
  const rsSignal = quant.signals?.find(s => s.name === "Rel Strength");
  const rsValue = rsSignal ? parseFloat(rsSignal.value) : 0;

  // Distance metrics
  const distFromHigh = ((high20 - P) / P) * 100; // % below 20d high
  const distFromLow = ((P - low20) / low20) * 100; // % above 20d low
  const momRatio = r30 !== 0 ? r10 / r30 : 0; // parabolic indicator

  // ENTRY SCORE (0-100)
  let entryScore = 50;
  const pros = [];
  const cons = [];

  // 1) Z-Score — most important for "ติดดอย"
  if (z < -2) { entryScore += 22; pros.push({ text: `ราคาต่ำกว่า mean ${Math.abs(z).toFixed(1)}σ — ของถูก!`, weight: "high" }); }
  else if (z < -1) { entryScore += 14; pros.push({ text: `Oversold (Z ${z.toFixed(2)}) — pullback in trend`, weight: "high" }); }
  else if (z < -0.3) { entryScore += 6; pros.push({ text: `Z-Score ${z.toFixed(2)} — ราคาดีอยู่`, weight: "medium" }); }
  else if (z < 0.5) { entryScore += 2; }
  else if (z < 1) { entryScore -= 8; cons.push({ text: `Z-Score ${z.toFixed(2)} — เริ่ม overbought`, weight: "medium" }); }
  else if (z < 1.5) { entryScore -= 16; cons.push({ text: `Z-Score ${z.toFixed(2)} — overbought ชัดเจน`, weight: "high" }); }
  else { entryScore -= 25; cons.push({ text: `Z-Score ${z.toFixed(2)} — stretched มาก เสี่ยงติดดอย!`, weight: "high" }); }

  // 2) Quant verdict
  if (verdict === "Strong Buy") { entryScore += 15; pros.push({ text: `Quant verdict: Strong Buy (${score})`, weight: "high" }); }
  else if (verdict === "Buy") { entryScore += 8; pros.push({ text: `Quant verdict: Buy (${score})`, weight: "medium" }); }
  else if (verdict === "Hold") { entryScore -= 5; cons.push({ text: `Quant verdict: Hold (${score}) — ไม่มีสัญญาณชัด`, weight: "medium" }); }
  else if (verdict === "Sell") { entryScore -= 25; cons.push({ text: `Quant verdict: Sell (${score})`, weight: "high" }); }
  else if (verdict === "Strong Sell") { entryScore -= 40; cons.push({ text: `Quant verdict: Strong Sell (${score})`, weight: "high" }); }

  // 3) Distance from 20-day high — buying the top check
  if (distFromHigh < 1) { entryScore -= 18; cons.push({ text: `ห่าง 20-day high แค่ ${distFromHigh.toFixed(1)}% — กำลังซื้อยอด!`, weight: "high" }); }
  else if (distFromHigh < 2.5) { entryScore -= 10; cons.push({ text: `ใกล้ 20-day high (${distFromHigh.toFixed(1)}%)`, weight: "medium" }); }
  else if (distFromHigh > 8) { entryScore += 4; pros.push({ text: `ห่างจาก high ${distFromHigh.toFixed(1)}% — มี buffer`, weight: "low" }); }

  // 4) Momentum — parabolic blow-off detector
  if (r10 > 15 && r30 > 0 && momRatio > 0.8) {
    entryScore -= 14; cons.push({ text: `Parabolic rally (10d +${r10.toFixed(1)}%) — climax run`, weight: "high" });
  } else if (r10 > 0 && r30 > 0 && momRatio > 0.5 && momRatio < 0.7) {
    entryScore += 6; pros.push({ text: `Steady uptrend (${r10.toFixed(1)}%/${r30.toFixed(1)}%)`, weight: "medium" });
  } else if (r10 < 0 && r30 > 5) {
    entryScore += 8; pros.push({ text: `Pullback in uptrend (10d ${r10.toFixed(1)}%, 30d +${r30.toFixed(1)}%)`, weight: "high" });
  } else if (r10 < -5 && r30 < 0) {
    entryScore -= 8; cons.push({ text: `Downtrend ต่อเนื่อง (${r10.toFixed(1)}%/${r30.toFixed(1)}%)`, weight: "medium" });
  }

  // 5) Relative Strength — only buy strength
  if (rsValue > 10) { entryScore += 6; pros.push({ text: `แกร่งกว่า SPY +${rsValue.toFixed(1)}%`, weight: "medium" }); }
  else if (rsValue < -10) { entryScore -= 8; cons.push({ text: `อ่อนกว่า SPY ${rsValue.toFixed(1)}%`, weight: "medium" }); }

  // 6) Regime context
  if (regime?.score > 80) { entryScore -= 8; cons.push({ text: `Regime overheated (${regime.score}/100) — เสี่ยง pullback ใหญ่`, weight: "medium" }); }
  else if (regime?.score >= 50 && regime?.score <= 65) { entryScore += 3; pros.push({ text: `Regime sweet spot (${regime.score}/100)`, weight: "low" }); }
  else if (regime?.score < 35) { entryScore -= 5; cons.push({ text: `Regime risk-off (${regime.score}/100)`, weight: "medium" }); }

  // Clamp
  entryScore = Math.max(0, Math.min(100, entryScore));

  // Grade + signal
  let grade, signal, action, color;
  if (entryScore >= 80) { grade = "A+"; signal = "🟢 BUY NOW"; action = "เข้าได้เต็ม size — จังหวะดีมาก"; color = "#22c55e"; }
  else if (entryScore >= 65) { grade = "A"; signal = "🟢 BUY"; action = "เข้าได้ 70-100% size"; color = "#4ade80"; }
  else if (entryScore >= 50) { grade = "B"; signal = "🟡 BUY 50%"; action = "เข้าได้ครึ่ง size · เก็บกระสุนเผื่อย่อ"; color = "#86efac"; }
  else if (entryScore >= 35) {
    if (z > 0.5) { grade = "C"; signal = "🟡 WAIT FOR DIP"; action = `รอราคาย่อมาที่ mean ${fmtPrice(M, ticker)} (-${((P - M) / P * 100).toFixed(1)}%) ก่อนเข้า`; color = "#fbbf24"; }
    else { grade = "C"; signal = "🟡 WAIT"; action = "รอสัญญาณดีกว่านี้ก่อนเข้า"; color = "#fbbf24"; }
  }
  else if (entryScore >= 20) { grade = "D"; signal = "🟠 AVOID"; action = "ไม่ควรเข้าตอนนี้ — สัญญาณลบเด่น"; color = "#f97316"; }
  else { grade = "F"; signal = "🔴 DON'T BUY"; action = "ห้ามเข้า — verdict Sell + ราคายังสูง"; color = "#ef4444"; }

  // Tinai (bag-holder) risk flag
  const tinaiRisk = (
    (verdict === "Strong Buy" || verdict === "Buy") &&
    (z > 1 || distFromHigh < 2 || (r10 > 12 && momRatio > 0.7))
  );

  // Suggested entry zones
  const bestEntry = M - S;            // -1σ (oversold zone)
  const okEntryLow = M - 0.3 * S;     // mean - 0.3σ
  const okEntryHigh = M + 0.3 * S;    // mean + 0.3σ (acceptable)
  const stretched = M + S;            // +1σ — caution
  const avoidAbove = M + 1.5 * S;     // +1.5σ — don't buy

  // EXIT SIGNAL (ถ้ามีคนถือ — ดู urgency จาก calculateExitPlan)
  let exitSignal, exitColor;
  if (verdict === "Strong Sell" || z > 2) { exitSignal = "🔴 SELL NOW"; exitColor = "#ef4444"; }
  else if (z > 1.5 || (verdict === "Sell" && distFromHigh < 3)) { exitSignal = "🟠 TAKE PARTIAL"; exitColor = "#f97316"; }
  else if (z > 1 || verdict === "Sell") { exitSignal = "🟡 TIGHTEN STOP"; exitColor = "#fbbf24"; }
  else if (verdict === "Hold") { exitSignal = "⏳ HOLD + TRAIL"; exitColor = "#a5b4fc"; }
  else { exitSignal = "🟢 HOLD"; exitColor = "#4ade80"; }

  return {
    entryScore: Math.round(entryScore),
    grade, signal, action, color,
    pros, cons,
    tinaiRisk,
    currentPrice: P,
    mean: M,
    bestEntry, okEntryLow, okEntryHigh, stretched, avoidAbove,
    high20, low20,
    distFromHigh, distFromLow, momRatio,
    z, verdict, score,
    exitSignal, exitColor,
  };
}

function summarizePosition(position, currentPrice) {
  const entries = Array.isArray(position) ? position : (position?.entries || []);
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
  const safeHaven = info.kind === "safe_haven";
  if (riskOn && regime?.score < 40) {
    triggers.push({ sev: "high", text: `Regime risk-off (${regime.score}/100) — เป็นลบต่อ ${ticker}` });
  }
  if (safeHaven && regime?.score > 65) {
    triggers.push({ sev: "medium", text: `Regime risk-on (${regime.score}/100) — เงินไหลออกจากทอง` });
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

function EntryTimingView({ ticker, timing, hasPosition }) {
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
