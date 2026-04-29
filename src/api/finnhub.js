// ========================================================
// Finnhub — stocks, quotes, news
// ========================================================

export async function fetchFinnhubCandles(symbol, apiKey, days = 180) {
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
  } catch { return null; }
}

export async function fetchFinnhubQuote(symbol, apiKey) {
  const url = `/api/finnhub/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
  try {
    const res = await fetch(url);
    return await res.json();
  } catch { return null; }
}

export async function fetchCompanyNews(symbol, apiKey, days = 7) {
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

export async function fetchCryptoNews(apiKey) {
  const url = `/api/finnhub/api/v1/news?category=crypto&token=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function fetchGeneralNews(apiKey) {
  const url = `/api/finnhub/api/v1/news?category=general&token=${apiKey}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
