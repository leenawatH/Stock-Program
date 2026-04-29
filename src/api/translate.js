// ========================================================
// Google Translate (free, no API key) — proxied via /api/translate
// ========================================================

export async function translateText(text, target = "th") {
  if (!text || typeof text !== "string") return text;
  // Google has a hard limit ~5000 chars per call; truncate to be safe
  const q = text.slice(0, 4500);
  const url = `/api/translate/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return text;
    const data = await res.json();
    const segs = data?.[0];
    if (!Array.isArray(segs)) return text;
    return segs.map(s => s?.[0] || "").join("");
  } catch { return text; }
}
