import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { addDays, money, money2, parseYmd, prettyDate, ymd } from '../lib/format.js';
import { AdminTop } from './AdminLayout.jsx';
import { StatusPill } from './Orders.jsx';

const RANGES = [
  ['7d', 'Last 7 days', 6],
  ['30d', 'Last 30 days', 29],
  ['90d', 'Last 90 days', 89],
  ['12m', 'Last 12 months', 364],
];

/** Group the daily series into weeks or months when the range is long. */
function bucket(daily, range) {
  if (range === '7d' || range === '30d') {
    return daily.map((d) => ({ key: d.day, label: prettyDate(d.day, { weekday: undefined }), short: String(Number(d.day.slice(8))), revenue: d.revenue_cents, orders: d.orders }));
  }
  const monthly = range === '12m';
  const map = new Map();
  for (const d of daily) {
    let key;
    if (monthly) key = d.day.slice(0, 7);
    else { const dt = parseYmd(d.day); dt.setDate(dt.getDate() - dt.getDay()); key = ymd(dt); }
    const b = map.get(key) || { key, revenue: 0, orders: 0 };
    b.revenue += d.revenue_cents; b.orders += d.orders;
    map.set(key, b);
  }
  return [...map.values()].map((b) => monthly
    ? { ...b, label: parseYmd(`${b.key}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), short: parseYmd(`${b.key}-01`).toLocaleDateString('en-US', { month: 'short' }) }
    : { ...b, label: `Week of ${prettyDate(b.key, { weekday: undefined })}`, short: prettyDate(b.key, { weekday: undefined }) });
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((n) => n >= v);
}

function RevenueChart({ data }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 240, L = 48, R = 8, T = 12, B = 28;
  const max = niceMax(Math.max(...data.map((d) => d.revenue), 0));
  const iw = W - L - R, ih = H - T - B;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(28, slot - 2)); // 2px gap between bars
  const y = (v) => T + ih - (v / max) * ih;
  const ticks = [0, .25, .5, .75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / 12);

  // rounded top only, anchored to baseline
  const barPath = (x, top, w) => {
    const h = T + ih - top; if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${T + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${T + ih} Z`;
  };

  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue over time">
        <g className="grid">
          {ticks.map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />)}
        </g>
        <g className="axis">
          {ticks.map((t) => <text key={t} x={L - 8} y={y(t) + 4} textAnchor="end">{money(t, { whole: true })}</text>)}
          {data.map((d, i) => (i % labelEvery === 0) && (
            <text key={d.key} x={L + i * slot + slot / 2} y={H - 8} textAnchor="middle">{d.short}</text>
          ))}
        </g>
        {data.map((d, i) => {
          const x = L + i * slot + (slot - bw) / 2;
          return (
            <g key={d.key}>
              <path className={`bar ${hover === i ? 'hot' : ''}`} d={barPath(x, y(d.revenue), bw)} />
              {/* hit target larger than the mark */}
              <rect x={L + i * slot} y={T} width={slot} height={ih} fill="transparent"
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="chart-tip" style={{
          left: `${((L + hover * slot + slot / 2) / W) * 100}%`,
          top: `${(y(data[hover].revenue) / H) * 100}%`,
        }}>
          {money2(data[hover].revenue)}
          <span>{data[hover].label} · {data[hover].orders} order{data[hover].orders === 1 ? '' : 's'}</span>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent, negative }) {
  return (
    <div className={`kpi ${accent ? 'accent' : ''}`}>
      <div className="k-label">{label}</div>
      <div className={`k-value ${negative ? 'neg' : ''}`}>{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const [range, setRange] = useState('30d');
  const [stats, setStats] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const to = ymd(new Date());
    const back = RANGES.find((r) => r[0] === range)[2];
    api(`/admin/stats?from=${addDays(to, -back)}&to=${to}`).then(setStats);
  }, [range]);
  useEffect(() => { api('/admin/orders?view=upcoming').then((o) => setUpcoming(o.slice(0, 6))); }, []);

  const series = useMemo(() => (stats ? bucket(stats.daily, range) : []), [stats, range]);

  return (
    <>
      <AdminTop title="Overview">
        <select className="input" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
          {RANGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </AdminTop>

      {!stats ? <p className="muted">Loading…</p> : (
        <>
          <div className="kpis">
            <Kpi label="Sales" value={money(stats.revenue_cents, { whole: true })} sub={`${stats.orders} orders${stats.discount_cents ? ` · after ${money(stats.discount_cents, { whole: true })} in coupons` : ''}`} />
            <Kpi label="Item costs" value={money(stats.cogs_cents, { whole: true })} sub={stats.revenue_cents ? `${Math.round((stats.cogs_cents / stats.revenue_cents) * 100)}% of sales` : '—'} />
            <Kpi label="Other expenses" value={money(stats.expenses_cents, { whole: true })} sub={<Link to="/admin/expenses">Log an expense →</Link>} />
            <Kpi label="Avg order" value={money(stats.avg_order_cents)} sub={stats.delivery_cents ? `+ ${money(stats.delivery_cents, { whole: true })} delivery fees` : 'incl. delivery'} />
            <Kpi accent label="Net profit" value={money(stats.net_profit_cents, { whole: true })} negative={stats.net_profit_cents < 0}
              sub="Sales + delivery − ingredients − expenses" />
          </div>

          <div className="a-grid">
            <div className="stack">
              <section className="a-card">
                <div className="card-head">
                  <h2>Sales over time</h2>
                  <button className="link-btn" onClick={() => setShowTable((s) => !s)}>{showTable ? 'Show chart' : 'Show table'}</button>
                </div>
                {showTable ? (
                  <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <table className="t"><thead><tr><th>Period</th><th className="num">Orders</th><th className="num">Sales</th></tr></thead>
                      <tbody>{series.map((d) => <tr key={d.key}><td>{d.label}</td><td className="num">{d.orders}</td><td className="num">{money2(d.revenue)}</td></tr>)}</tbody>
                    </table>
                  </div>
                ) : <RevenueChart data={series} />}
                <p className="muted" style={{ fontSize: '.8rem', margin: '.4rem 0 0' }}>Sales are counted on each order's scheduled date. Cancelled orders are excluded.</p>
              </section>

              <section className="a-card">
                <div className="card-head"><h2>Best sellers</h2></div>
                {stats.topProducts.length === 0 ? <p className="muted">No sales in this period yet.</p> : (
                  <div className="table-wrap">
                    <table className="t">
                      <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Sales</th><th className="num">Cost</th><th className="num">Margin</th></tr></thead>
                      <tbody>
                        {stats.topProducts.map((p) => {
                          const m = p.sales_cents ? (p.sales_cents - p.cost_cents) / p.sales_cents : 0;
                          return (
                            <tr key={p.name}>
                              <td>{p.name}</td><td className="num">{p.quantity}</td>
                              <td className="num">{money2(p.sales_cents)}</td><td className="num">{money2(p.cost_cents)}</td>
                              <td className="num"><span className={m >= .6 ? 'margin-good' : m >= .4 ? 'margin-low' : 'margin-bad'}>{Math.round(m * 100)}%</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <div className="stack">
              <section className="a-card">
                <div className="card-head">
                  <h2>Coming up</h2>
                  <Link to="/admin/orders" className="link-btn">All orders</Link>
                </div>
                {upcoming.length === 0 ? <p className="muted">No upcoming orders. Time for a coffee ☕</p> : upcoming.map((o) => (
                  <div key={o.id} className="row-between" style={{ padding: '.55rem 0', borderBottom: '1px dashed var(--line)', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{prettyDate(o.scheduled_date)} <span className="muted" style={{ fontWeight: 600, fontSize: '.85rem' }}>{o.scheduled_time}</span></div>
                      <div className="muted" style={{ fontSize: '.88rem' }}>{o.customer_name} · {o.items.reduce((a, i) => a + i.quantity, 0)} items · {o.fulfillment}</div>
                    </div>
                    <StatusPill status={o.status} />
                  </div>
                ))}
              </section>

              <section className="a-card">
                <div className="card-head"><h2>Where the money goes</h2></div>
                <CostBreakdown stats={stats} />
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function CostBreakdown({ stats }) {
  const rows = [{ category: 'Item costs (from menu)', amount_cents: stats.cogs_cents }, ...stats.expenseByCategory]
    .filter((r) => r.amount_cents > 0);
  if (!rows.length) return <p className="muted">No costs recorded in this period.</p>;
  const max = Math.max(...rows.map((r) => r.amount_cents));
  return rows.map((r) => (
    <div className="hbar" key={r.category}>
      <span>{r.category}</span>
      <div className="track"><div className="fill" style={{ width: `${(r.amount_cents / max) * 100}%` }} /></div>
      <span className="val">{money(r.amount_cents, { whole: true })}</span>
    </div>
  ));
}
