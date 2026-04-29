// ========================================================
// DIVERGENCE DETECTION
// Compares stock's 10d return vs SPY and vs correlated BTC
// ========================================================
import { percentChange, correlation } from "../lib/math.js";

export function detectDivergences(stock, allData) {
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
