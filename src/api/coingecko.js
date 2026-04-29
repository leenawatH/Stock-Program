// ========================================================
// CoinGecko — realtime crypto (primary source, free tier reliable)
// ========================================================
import { COINGECKO_IDS } from "../constants.js";

export async function fetchCoinGecko(ticker) {
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
