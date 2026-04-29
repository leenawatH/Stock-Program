// ========================================================
// Asset router — Hybrid fetcher
//   Crypto → CoinGecko (primary) → Finnhub binance (fallback)
//   Stocks/SPY → Finnhub (candles + quote)
//   Gold/DXY → Yahoo
// ========================================================
import { STOCKS, COMPARE_ASSETS } from "../constants.js";
import { fetchFinnhubCandles, fetchFinnhubQuote } from "./finnhub.js";
import { fetchYahoo } from "./yahoo.js";
import { fetchCoinGecko } from "./coingecko.js";

export async function fetchAsset(symbol, apiKey) {
  const meta = STOCKS[symbol] || COMPARE_ASSETS[symbol] || {};

  // Crypto: CoinGecko first (realtime + reliable on free tier)
  if (meta.kind === "crypto") {
    const cg = await fetchCoinGecko(symbol);
    if (cg) return cg;
    // Fallback: Finnhub binance
  }

  const useFinnhub = meta.finnhub !== null && (
    meta.kind === "stock" ||
    meta.kind === "crypto" ||
    meta.kind === "safe_haven" ||
    symbol === "SPY"
  );
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
