import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../lib/api.js';
import { money2, prettyDate } from '../lib/format.js';
import { AdminTop } from './AdminLayout.jsx';

export const STATUSES = ['new', 'confirmed', 'baking', 'ready', 'completed', 'cancelled'];
const LABEL = { new: 'New', confirmed: 'Confirmed', baking: 'Baking', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };

export function StatusPill({ status }) {
  return <span className={`pill st-${status}`}>{LABEL[status] || status}</span>;
}

export default function Orders() {
  const { refreshCounts } = useOutletContext();
  const [view, setView] = useState('upcoming');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState(null);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (view === 'upcoming') p.set('view', 'upcoming');
    if (status) p.set('status', status);
    if (q.trim()) p.set('q', q.trim());
    api(`/admin/orders?${p}`).then(setOrders);
  }, [view, status, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const update = async (o, patch) => {
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, ...patch } : x)));
    await api(`/admin/orders/${o.id}`, { method: 'PATCH', body: patch });
    refreshCounts();
  };

  // Group upcoming orders by day for a bake-schedule feel
  const groups = [];
  for (const o of orders || []) {
    const key = view === 'upcoming' ? o.scheduled_date : 'all';
    if (!groups.length || groups.at(-1).key !== key) groups.push({ key, items: [] });
    groups.at(-1).items.push(o);
  }

  return (
    <>
      <AdminTop title="Orders">
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === 'upcoming'} onClick={() => setView('upcoming')}>Bake schedule</button>
          <button aria-pressed={view === 'all'} onClick={() => setView('all')}>All orders</button>
        </div>
      </AdminTop>
      <div className="toolbar">
        <input className="input" placeholder="Search name, email or order code…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
        </select>
      </div>

      {!orders ? <p className="muted">Loading…</p> : orders.length === 0 ? (
        <div className="a-card empty">No orders here yet.</div>
      ) : groups.map((g) => (
        <section key={g.key} style={{ marginBottom: '1.4rem' }}>
          {view === 'upcoming' && (
            <h2 style={{ fontSize: '1.2rem', margin: '0 0 .6rem' }}>
              {prettyDate(g.key, { weekday: 'long' })}
              <span className="muted" style={{ fontSize: '.9rem', fontWeight: 600, marginLeft: '.6rem', fontFamily: 'var(--font-body)' }}>
                {bakeList(g.items)}
              </span>
            </h2>
          )}
          {g.items.map((o) => <OrderCard key={o.id} o={o} onUpdate={update} />)}
        </section>
      ))}
    </>
  );
}

function bakeList(orders) {
  const totals = {};
  for (const o of orders) for (const i of o.items) totals[i.name] = (totals[i.name] || 0) + i.quantity;
  return 'Bake: ' + Object.entries(totals).map(([n, q]) => `${q} ${n}`).join(' · ');
}

function OrderCard({ o, onUpdate }) {
  return (
    <article className="order-card">
      <div className="oc-top">
        <span className="oc-code">{o.code}</span>
        <StatusPill status={o.status} />
        <span className={`pill plain ${o.paid ? 'on' : 'off'}`}>{o.paid ? 'Paid' : 'Unpaid'}</span>
        <span className="oc-when">{prettyDate(o.scheduled_date)} · {o.scheduled_time}</span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: '.82rem' }}>Placed {new Date(o.created_at).toLocaleString()}</span>
      </div>
      <div className="oc-body">
        <div>
          <strong>{o.customer_name}</strong><br />
          <a href={`mailto:${o.email}`}>{o.email}</a>{o.phone && <> · <a href={`tel:${o.phone}`}>{o.phone}</a></>}<br />
          <span style={{ textTransform: 'capitalize' }}>{o.fulfillment}</span>{o.address && <>: {o.address}</>}
          {o.notes && <p style={{ margin: '.4rem 0 0', background: 'var(--yellow-soft)', padding: '.4rem .7rem', borderRadius: 10 }}>📝 {o.notes}</p>}
        </div>
        <div>
          <ul>{o.items.map((i) => <li key={i.id}>{i.quantity} × {i.name}</li>)}</ul>
          <div style={{ marginTop: '.4rem' }}>
            <strong>{money2(o.total_cents)}</strong>
            {o.discount_cents > 0 && <span className="muted"> · {o.coupon_code} −{money2(o.discount_cents)}</span>}
            <span className="muted"> · cost {money2(o.cost_cents)}</span>
          </div>
        </div>
        <div className="oc-actions">
          <select className="input" style={{ width: 'auto' }} value={o.status} aria-label="Order status"
            onChange={(e) => onUpdate(o, { status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={!!o.paid} onChange={(e) => onUpdate(o, { paid: e.target.checked })} /> Paid</label>
        </div>
      </div>
    </article>
  );
}
