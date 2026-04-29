// ========================================================
// Persistence — backed by window.storage host bridge
// ========================================================

export async function loadApiKey() {
  try {
    const r = await window.storage.get("finnhub_api_key");
    return r?.value || null;
  } catch { return null; }
}

export async function saveApiKey(key) {
  try { await window.storage.set("finnhub_api_key", key); return true; }
  catch { return false; }
}

export async function deleteApiKey() {
  try { await window.storage.delete("finnhub_api_key"); } catch {}
}

// Positions: { [ticker]: [{id, qty, price, date}] }
export async function loadPositions() {
  try {
    const r = await window.storage.get("positions");
    if (!r?.value) return {};
    return JSON.parse(r.value);
  } catch { return {}; }
}

export async function savePositions(obj) {
  try { await window.storage.set("positions", JSON.stringify(obj)); } catch {}
}
