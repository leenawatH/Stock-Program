// ========================================================
// Yahoo Finance — fallback OHLCV (Gold, DXY, etc.)
// ========================================================

export async function fetchYahoo(symbol, range = "6mo", interval = "1d") {
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
      time: t * 1000, price: closes[i], volume: volumes[i],
    })).filter(p => p.price != null);
    return {
      symbol,
      current: result.meta.regularMarketPrice,
      previousClose: result.meta.chartPreviousClose,
      points,
      prices: points.map(p => p.price),
      volumes: points.map(p => p.volume || 0),
    };
  } catch { return null; }
}
