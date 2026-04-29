// ========================================================
// Asset registry & external API symbol maps
// ========================================================

export const STOCKS = {
  NVDA:       { name: "NVIDIA",          color: "#76b900", icon: "⚡", kind: "stock" },
  GOOGL:      { name: "Alphabet",        color: "#4285f4", icon: "🔍", kind: "stock" },
  BAC:        { name: "Bank of America", color: "#e31837", icon: "🏦", kind: "stock" },
  "GC=F":     { name: "Gold Spot",       color: "#ffd700", icon: "🥇", kind: "safe_haven", finnhub: null, short: "GOLD" },
  "BTC-USD":  { name: "Bitcoin",         color: "#f7931a", icon: "₿", kind: "crypto", finnhub: "BINANCE:BTCUSDT" },
  "DOGE-USD": { name: "Dogecoin",        color: "#c2a633", icon: "🐕", kind: "crypto", finnhub: "BINANCE:DOGEUSDT" },
};

export const COMPARE_ASSETS = {
  SPY:        { name: "S&P 500", short: "SPY",  color: "#a855f7", icon: "📈" },
  "DX-Y.NYB": { name: "Dollar",  short: "DXY",  color: "#22c55e", icon: "💵", finnhub: null },
};

export const ALL_SYMBOLS = { ...STOCKS, ...COMPARE_ASSETS };

// Bitkub Thai exchange — ticker → market pair (THB-quoted)
export const BITKUB_SYM = {
  "BTC-USD":  "THB_BTC",
  "DOGE-USD": "THB_DOGE",
  "ETH-USD":  "THB_ETH",
};

// CoinGecko — ticker → coin id (used as primary realtime crypto source)
export const COINGECKO_IDS = {
  "BTC-USD": "bitcoin",
  "DOGE-USD": "dogecoin",
};
