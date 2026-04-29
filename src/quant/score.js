// ========================================================
// QUANT SCORE — Combines Z-Score, Rel Strength, Regime, Momentum,
// Divergence, Volatility into a single 0-100 score + verdict
// ========================================================
import { STOCKS } from "../constants.js";
import { zScore, percentChange, std, rollingReturns } from "../lib/math.js";
import { detectDivergences } from "./divergence.js";

export function calculateQuantScore(ticker, allData, regime) {
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
