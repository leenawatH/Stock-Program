// ========================================================
// EXIT PLAN — TP1/TP2/SL/trail + position-aware profit stages
// ========================================================
import { STOCKS } from "../constants.js";
import { mean, std, percentChange, rollingReturns } from "../lib/math.js";
import { fmtPrice } from "../lib/format.js";

export function summarizePosition(position, currentPrice) {
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

export function calculateExitPlan(ticker, stock, quant, regime, position) {
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
