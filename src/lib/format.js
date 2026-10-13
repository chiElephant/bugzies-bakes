export const money = (cents, { whole = false } = {}) => {
  const n = (cents || 0) / 100;
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: whole || Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
};
export const money2 = (cents) =>
  ((cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** "4.50" -> 450 ; returns NaN for garbage */
export const toCents = (v) => {
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
export const fromCents = (c) => (c == null ? '' : (c / 100).toFixed(2));

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => new Date(`${s}T12:00:00`);
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };

export const prettyDate = (s, opts = {}) =>
  parseYmd(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...opts });
export const longDate = (s) =>
  parseYmd(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
