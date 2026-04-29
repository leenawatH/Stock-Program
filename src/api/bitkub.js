// ========================================================
// Bitkub — Thai crypto exchange, THB-quoted realtime ticker
// proxy → api.bitkub.com/api/market/ticker
// ========================================================
import { BITKUB_SYM } from "../constants.js";

export async function fetchBitkubPrices() {
  try {
    const res = await fetch("/api/bitkub/api/market/ticker");
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || typeof d !== "object") return null;
    const out = {};
    for (const [tk, sym] of Object.entries(BITKUB_SYM)) {
      const r = d[sym];
      if (!r) continue;
      out[tk] = {
        last:          Number(r.last) || null,
        bid:           Number(r.highestBid) || null,
        ask:           Number(r.lowestAsk) || null,
        high24:        Number(r.high24hr) || null,
        low24:         Number(r.low24hr) || null,
        percentChange: Number(r.percentChange) || 0,
        baseVolume:    Number(r.baseVolume) || 0,   // volume in coin
        quoteVolume:   Number(r.quoteVolume) || 0,  // volume in THB
      };
    }
    return out;
  } catch { return null; }
}
