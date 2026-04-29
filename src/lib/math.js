// ========================================================
// Pure math helpers — stats, returns, correlation
// ========================================================

export function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

export function returns(prices) {
  const r = [];
  for (let i = 1; i < prices.length; i++) {
    r.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return r;
}

export function correlation(a, b) {
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

export function zScore(prices, window = 20) {
  const recent = prices.slice(-window);
  const m = mean(recent);
  const s = std(recent);
  return s ? (prices[prices.length - 1] - m) / s : 0;
}

export function percentChange(prices, days) {
  if (prices.length <= days) return 0;
  const past = prices[prices.length - 1 - days];
  const now = prices[prices.length - 1];
  return ((now - past) / past) * 100;
}

export function rollingReturns(prices, window = 30) {
  return returns(prices).slice(-window);
}
