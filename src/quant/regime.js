// ========================================================
// REGIME DETECTION
// Combines SPY momentum + Gold/DXY/BTC into a single score
// ========================================================
import { percentChange, std, rollingReturns } from "../lib/math.js";

export function detectRegime(allData) {
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
