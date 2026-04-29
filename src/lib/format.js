// ========================================================
// Price / number formatting helpers
// ========================================================

export function currencyOf(_ticker) { return "$"; }

export function fmtPrice(value, ticker, digitsOverride) {
  const sym = currencyOf(ticker);
  if (value == null || Number.isNaN(value)) return `${sym}0.00`;
  const abs = Math.abs(value);
  const d = digitsOverride != null ? digitsOverride
         : abs < 1 ? 4
         : 2;
  return sym + value.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
