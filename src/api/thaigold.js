// ========================================================
// Hua Seng Heng (ฮั่วเซ่งเฮง) — Thai gold realtime
// proxy → apicheckprice.huasengheng.com/api/values/getprice
// คืน 3 record: HSH (ราคา HSH realtime), REF (อ้างอิงสมาคม), JEWEL (รูปพรรณ)
// ========================================================

export async function fetchThaiGoldPrice() {
  try {
    const res = await fetch("/api/hsh/api/values/getprice");
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    const parse = (s) => {
      if (s == null) return null;
      const n = parseFloat(String(s).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const pick = (type) => arr.find(x => x.GoldType === type) || null;
    const hsh = pick("HSH");
    const ref = pick("REF");
    const jw  = pick("JEWEL");
    const map = (x) => x ? {
      buy:        parse(x.Buy),
      sell:       parse(x.Sell),
      buyChange:  parse(x.BuyChange),
      sellChange: parse(x.SellChange),
      time:       x.TimeUpdate || null,
      timeStr:    x.StrTimeUpdate || null,
    } : null;
    return {
      hsh:   map(hsh),   // ราคาฮั่วเซ่งเฮง real-time (ใช้เป็นหลัก)
      ref:   map(ref),   // ราคาสมาคมค้าทองคำ (อ้างอิง)
      jewel: map(jw),    // ทองรูปพรรณ
    };
  } catch { return null; }
}
