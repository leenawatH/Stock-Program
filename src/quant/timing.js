// ========================================================
// ENTRY TIMING — รวมทุกปัจจัยให้เป็นเกรดเดียว (A+ to F)
// ติดดอย (bag-holder) risk detection
// ========================================================
import { mean, std, percentChange } from "../lib/math.js";
import { fmtPrice } from "../lib/format.js";

export function calculateEntryTiming(ticker, stock, quant, regime) {
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
